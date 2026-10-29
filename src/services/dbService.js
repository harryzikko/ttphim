const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const { hashPassword, verifyPassword, passwordValid, publicUser } = require('./passwordService');
const lockfile = require('proper-lockfile');
const { validateDatabase } = require('./dbSchema');
const sessionEvents = require('./sessionEvents');

async function atomicReplace(source, destination) {
  for (let attempt = 0; ; attempt++) {
    try { return await fs.rename(source, destination); }
    catch (error) {
      if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 7) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.min(200, 10 * 2 ** attempt)));
    }
  }
}

function formatEpBadge(epName) {
  if (!epName) return 'Tập 01';
  const str = String(epName).trim();
  if (/^full$/i.test(str) || /^bản full$/i.test(str)) return 'Full';
  if (/^trọn bộ$/i.test(str)) return 'Trọn Bộ';
  const match = str.match(/\d+/);
  if (match) {
    const num = parseInt(match[0], 10);
    if (!isNaN(num)) {
      return `Tập ${String(num).padStart(2, '0')}`;
    }
  }
  return str.startsWith('Tập') ? str : `Tập ${str}`;
}

class DbService {
  constructor() {
    this.dbPath = config.DB_PATH;
    this.store = config.DATABASE_URL ? new (require('./postgresStore').PostgresStore)(config.DATABASE_URL) : null;
    this.cache = null;
    this.operationQueue = Promise.resolve();
    // Serialize complete read-modify-write operations, not just file writes.
    for (const name of Object.getOwnPropertyNames(DbService.prototype)) {
      if (['constructor', 'read', 'write', 'close'].includes(name)) continue;
      const operation = this[name].bind(this);
      this[name] = (...args) => {
        const result = this.operationQueue.then(async () => {
          if (this.store) return this.store.transaction(() => operation(...args));
          await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
          const release = await lockfile.lock(this.dbPath, {
            realpath: false, stale: 30000, update: 10000,
            retries: { retries: 100, minTimeout: 10, maxTimeout: 100, factor: 1.2, randomize: true }
          });
          try { return await operation(...args); }
          finally { await release(); }
        });
        this.operationQueue = result.catch(() => {});
        return result;
      };
    }
  }

  async read() {
    if (this.store) return validateDatabase(await this.store.read());
    try {
      const data = await fs.readFile(this.dbPath, 'utf8');
      if (data && data.trim()) {
        this.cache = validateDatabase(JSON.parse(data));
        return this.cache;
      }
      throw new Error('Database file is empty');
    } catch (err) {
      if (err.code === 'ENOENT') {
        if (config.IS_PRODUCTION) throw new Error('Production database must be provisioned before startup');
        const initial = { users: [], watchlist: [], history: [], comments: [] };
        await this.write(initial);
        return initial;
      }
      throw err;
    }
  }

  async write(data) {
    if (this.store) return this.store.write(validateDatabase(data));
    const tmpPath = `${this.dbPath}.${require('crypto').randomUUID()}.tmp`;
    try {
      await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await atomicReplace(tmpPath, this.dbPath);
      this.cache = data;
    } finally {
      await fs.unlink(tmpPath).catch(() => {});
    }
    return data;
  }

  async mutate(update) {
    const data = await this.read();
    const result = await update(data);
    await this.write(data);
    return result;
  }

  async close() {
    await this.operationQueue;
    await this.store?.close();
  }

  // --- User operations ---
  async findUserByEmail(email) {
    const db = await this.read();
    return db.users.find(u => u.email.toLowerCase() === (email || '').toLowerCase().trim());
  }

  async findUserById(id) {
    const db = await this.read();
    return db.users.find(u => u.id === id);
  }

  async authenticateUser(email, password) {
    const db = await this.read();
    const user = db.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || !await verifyPassword(password, user.password)) return null;
    if (!user.password.startsWith('scrypt$')) {
      user.password = await hashPassword(password);
      await this.write(db);
    }
    return publicUser(user);
  }

  async createUser({ email, password, name, gender }) {
    if (!passwordValid(password)) throw new Error('Mật khẩu cần 6–256 ký tự');
    if (!require('./defaultAvatars').validGender(gender)) throw new Error('Giới tính không hợp lệ');
    const db = await this.read();
    if (db.users.some(u => u.email.toLowerCase() === email.trim().toLowerCase())) {
      throw new Error('Email này đã được sử dụng');
    }
    const newUser = {
      id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      email: email.trim(),
      password: await hashPassword(password),
      name: name || email.split('@')[0],
      ...(gender != null && { gender }),
      avatar: require('./defaultAvatars').avatarForGender(gender),
      role: 'user',
      created_at: new Date().toISOString()
    };
    db.users.push(newUser);
    await this.write(db);
    return newUser;
  }

  async updateUser(id, updates) {
    const db = await this.read();
    const index = db.users.findIndex(u => u.id === id);
    if (index === -1) return null;
    const allowed = new Set(['name', 'avatar', 'email', 'password', 'role', 'is_vip', 'vip_tier', 'vip_level', 'vip_expire_date', 'days_left', 'max_devices']);
    const safeUpdates = Object.fromEntries(Object.entries(updates).filter(([key]) => allowed.has(key)));
    if (safeUpdates.role && !['user', 'admin'].includes(safeUpdates.role)) throw new Error('Invalid role');
    if (safeUpdates.role && safeUpdates.role !== 'admin' && db.users[index].role === 'admin' && db.users.filter(item => item.role === 'admin' && !item.blocked).length <= 1) {
      throw new Error('Cannot demote the last active administrator');
    }
    if (Object.hasOwn(safeUpdates, 'password')) {
      if (!passwordValid(safeUpdates.password)) throw new Error('Mật khẩu cần 6–256 ký tự');
      safeUpdates.password = await hashPassword(safeUpdates.password);
      safeUpdates.token_version = (db.users[index].token_version || 0) + 1;
    }
    if (Object.hasOwn(safeUpdates, 'role') && safeUpdates.role !== db.users[index].role) {
      safeUpdates.token_version = (db.users[index].token_version || 0) + 1;
    }
    if (Object.hasOwn(safeUpdates, 'email')) {
      if (typeof safeUpdates.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeUpdates.email.trim())) throw new Error('Invalid email');
      safeUpdates.email = safeUpdates.email.trim().toLowerCase();
      if (db.users.some(user => user.id !== id && user.email.toLowerCase() === safeUpdates.email)) throw new Error('Email is already in use');
      if (safeUpdates.email !== db.users[index].email.toLowerCase()) {
        safeUpdates.email_verified = false; safeUpdates.email_verified_at = null;
        safeUpdates.token_version = (db.users[index].token_version || 0) + 1;
      }
    }
    db.users[index] = { ...db.users[index], ...safeUpdates };
    await this.write(db);
    if (Object.hasOwn(safeUpdates, 'token_version')) sessionEvents.emit('revoked', id);
    return db.users[index];
  }

  async upgradeVip(id, plan = 'master') {
    const db = await this.read();
    const user = db.users.find(u => u.id === id);
    if (!user) return null;

    let expireDate = new Date();
    let days = 30;
    let title = 'VIP 4K Cinema';
    let maxDevices = 3;

    if (plan === 'year') {
      days = 365;
      expireDate.setDate(expireDate.getDate() + 365);
      title = 'VIP 4K Cinema Gold';
      maxDevices = 4;
    } else if (plan === 'master' || plan === 'lifetime') {
      days = 730;
      expireDate.setDate(expireDate.getDate() + 730);
      title = 'VIP 4K Cinema Master';
      maxDevices = 5;
    } else {
      expireDate.setDate(expireDate.getDate() + 30);
    }

    user.is_vip = true;
    user.vip_tier = plan;
    user.vip_level = title;
    user.vip_expire_date = expireDate.toISOString().split('T')[0];
    user.days_left = days;
    user.max_devices = maxDevices;

    await this.write(db);
    return user;
  }

  // --- Watchlist operations ---
  async getWatchlist(userId) {
    const db = await this.read();
    return db.watchlist.filter(w => w.user_id === userId);
  }

  async isInWatchlist(userId, movieSlug) {
    const db = await this.read();
    return db.watchlist.some(w => w.user_id === userId && w.movie_slug === movieSlug);
  }

  async toggleWatchlist(userId, movieData) {
    const db = await this.read();
    const existingIndex = db.watchlist.findIndex(w => w.user_id === userId && w.movie_slug === movieData.movie_slug);

    if (existingIndex > -1) {
      db.watchlist.splice(existingIndex, 1);
      await this.write(db);
      return { added: false, count: db.watchlist.filter(w => w.user_id === userId).length };
    } else {
      const item = {
        id: 'wl_' + Date.now(),
        user_id: userId,
        movie_slug: movieData.movie_slug,
        movie_name: movieData.movie_name,
        origin_name: movieData.origin_name || '',
        poster_url: movieData.poster_url || '',
        thumb_url: movieData.thumb_url || '',
        year: movieData.year || new Date().getFullYear(),
        quality: movieData.quality || 'FHD',
        lang: movieData.lang || 'Vietsub',
        type: ['single', 'series', 'tv', 'movie', 'phim-bo', 'phim-le', 'hoathinh', 'tvshows'].includes(movieData.type) ? movieData.type : '',
        category: Array.isArray(movieData.category) ? movieData.category.filter(item => typeof item === 'string' && item.length <= 100).slice(0, 20) : (typeof movieData.category === 'string' ? movieData.category.slice(0, 100) : ''),
        added_at: new Date().toISOString()
      };
      db.watchlist.unshift(item);
      await this.write(db);
      return { added: true, item, count: db.watchlist.filter(w => w.user_id === userId).length };
    }
  }

  async removeFromWatchlist(userId, movieSlug) {
    const db = await this.read();
    db.watchlist = db.watchlist.filter(w => !(w.user_id === userId && w.movie_slug === movieSlug));
    await this.write(db);
    return true;
  }

  // --- History & Continue Watching operations ---
  async getHistory(userId) {
    const db = await this.read();
    return (db.history || [])
      .filter(h => h.user_id === userId)
      .map(h => ({
        ...h,
        episode_name: formatEpBadge(h.episode_name)
      }))
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }

  async saveHistory(userId, data) {
    const db = await this.read();
    if (!db.history) db.history = [];

    const existingIndex = db.history.findIndex(h => h.user_id === userId && h.movie_slug === data.movie_slug);
    const previous = existingIndex >= 0 ? db.history[existingIndex] : null;
    const progressed = Number(data.current_time) > 0 && Number(data.duration) > 0 && (!previous || (data.episode_slug || 'tap-1') !== previous.episode_slug || Math.round(Number(data.current_time)) !== previous.current_time);
    const historyItem = {
      id: existingIndex > -1 ? db.history[existingIndex].id : 'hist_' + Date.now(),
      user_id: userId,
      movie_slug: data.movie_slug,
      movie_name: data.movie_name,
      origin_name: data.origin_name || '',
      poster_url: data.poster_url || '',
      thumb_url: data.thumb_url || (data.poster_url && data.poster_url.includes('-poster.') ? data.poster_url.replace('-poster.', '-thumb.') : (previous?.thumb_url || '')),
      category: (Array.isArray(data.category) ? data.category : (existingIndex >= 0 && Array.isArray(db.history[existingIndex].category) ? db.history[existingIndex].category : [])).filter(item => typeof item === 'string' && item.length <= 100).slice(0, 20),
      type: ['single', 'series', 'tv', 'movie', 'phim-bo', 'phim-le', 'hoathinh', 'tvshows'].includes(data.type) ? data.type : (existingIndex >= 0 ? db.history[existingIndex].type || '' : ''),
      episode_slug: data.episode_slug || 'tap-1',
      server_name: typeof data.server_name === 'string' ? data.server_name : '',
      episode_name: formatEpBadge(data.episode_name),
      current_time: Math.round(data.current_time || 0),
      duration: Math.round(data.duration || 0),
      progress_percent: data.duration > 0 ? Math.min(100, Math.max(0, Math.round(((data.current_time || 0) / data.duration) * 100))) : 0,
      continue_hidden: previous?.continue_hidden === true && !progressed,
      updated_at: new Date().toISOString()
    };

    if (existingIndex > -1) {
      db.history[existingIndex] = historyItem;
    } else {
      db.history.unshift(historyItem);
    }

    // Keep history at max 100 per user
    const userHistory = db.history.filter(h => h.user_id === userId);
    if (userHistory.length > 100) {
      const toRemove = userHistory.slice(100);
      db.history = db.history.filter(h => !toRemove.includes(h));
    }

    await this.write(db);
    return historyItem;
  }

  async setContinueVisibility(userId, movieSlug, hidden) {
    const db = await this.read();
    const item = (db.history || []).find(record => record.user_id === userId && record.movie_slug === movieSlug);
    if (!item) throw Object.assign(new Error('Không tìm thấy lịch sử của phim trong tài khoản này'), { status: 404 });
    item.continue_hidden = hidden;
    await this.write(db);
    return { user_id: userId, movie_slug: movieSlug, continue_hidden: hidden };
  }

  async removeFromHistory(userId, movieSlug) {
    const db = await this.read();
    db.history = (db.history || []).filter(h => !(h.user_id === userId && h.movie_slug === movieSlug));
    await this.write(db);
    return true;
  }

  async clearHistory(userId) {
    const db = await this.read();
    db.history = (db.history || []).filter(h => h.user_id !== userId);
    await this.write(db);
    return true;
  }

  // --- Comments operations ---
  async getComments(movieSlug, viewerId = null) {
    try {
      const db = await this.read();
      const reactionView = item => {
        const { liked_by, reaction_base, ...result } = item;
        const owner = db.users.find(user => user.id === item.user_id);
        return { ...result, ...(owner ? { user_avatar: require('./defaultAvatars').avatarFor(owner) } : {}), liked: Boolean(viewerId && Array.isArray(liked_by) && liked_by.includes(viewerId)) };
      };
      const list = (db.comments || []).filter(c => !c.hidden && c.movie_slug === movieSlug);
      return list.map(c => ({
        ...reactionView(c),
        user_role: db.users.find(user => user.id === c.user_id)?.role === 'admin' ? 'admin' : 'user',
        content: require('./commentFormatting').removeTimestampPrefix(c.content, c.timestamp_tag),
        replies: (c.replies || []).filter(reply => !reply.hidden).map(reactionView)
      }));
    } catch (e) {
      return [];
    }
  }

  async addComment({ movieSlug, userId, userName, userAvatar, isVip, content, timestampTag, episodeSlug, rating, isSpoil }) {
    const db = await this.read();
    if (!db.comments) db.comments = [];
    if (userId) {
      const recent = db.comments.filter(item => item.user_id === userId && Date.now() - Date.parse(item.created_at) < 60000);
      if (recent.length >= 5 || recent.some(item => item.content === content.trim())) throw Object.assign(new Error('Comment rate exceeded'), { status: 429 });
    }

    const newComment = {
      id: 'cmt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      movie_slug: movieSlug,
      user_id: userId || null,
      user_name: userName || 'Khán giả KKPhim',
      user_avatar: userAvatar || '/images/avatar-default.svg',
      is_vip: Boolean(isVip),
      content: content.trim(),
      timestamp_tag: timestampTag || null,
      episode_slug: episodeSlug || null,
      rating: rating == null ? null : Math.min(5, Math.max(1, Number.parseInt(rating, 10))),
      is_spoil: Boolean(isSpoil),
      likes: 0,
      created_at: new Date().toISOString(),
      replies: []
    };

    db.comments.unshift(newComment);
    await this.write(db);
    return newComment;
  }

  async addReply(commentId, { userId, userName, userAvatar, content }) {
    const db = await this.read();
    if (!db.comments) db.comments = [];

    const comment = db.comments.find(c => c.id === commentId);
    if (!comment || comment.hidden) return null;

    if (!comment.replies) comment.replies = [];
    if (userId && comment.replies.filter(item => item.user_id === userId && Date.now() - Date.parse(item.created_at) < 60000).length >= 5) {
      throw Object.assign(new Error('Reply rate exceeded'), { status: 429 });
    }

    const newReply = {
      id: 'rep_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      comment_id: commentId,
      user_id: userId || null,
      user_name: userName || 'Khán giả KKPhim',
      user_avatar: userAvatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuCSbujeZINk45JTMl1uHDHy58dzZtklTE0t5uPEhCwlICLLPGtijYtFO9JeqSqDGusRdB1gt7qycyJ5OX6kz4PYsmWLL5tvWy-spdqpz_DrG4qLJz8bQgtQlXHllA2zvsiuNrLj_cdZxocwgDBP1kYO7DK8ESLeW9ehVKs4rk50GYzAAygACch82GxO5zi10RYSftDRhD9PgHoAOvOFxw2ZKO2w05zb0jDbKL3RAg4',
      content: content.trim(),
      created_at: new Date().toISOString(),
      likes: 0
    };

    comment.replies.push(newReply);
    await this.write(db);
    return newReply;
  }

  async likeComment(commentId, action = 'like', userId) {
    if (!userId || !['like', 'unlike'].includes(action)) throw Object.assign(new Error('Invalid reaction'), { status: 400 });
    const db = await this.read();
    let target;
    for (const comment of db.comments || []) {
      if (comment.hidden) continue;
      if (comment.id === commentId) { target = comment; break; }
      target = (comment.replies || []).find(reply => reply.id === commentId && !reply.hidden);
      if (target) break;
    }
    if (!target) throw Object.assign(new Error('Comment not found'), { status: 404 });
    const users = new Set(Array.isArray(target.liked_by) ? target.liked_by : []);
    const base = Number.isFinite(target.reaction_base) ? Math.max(0, target.reaction_base) : Math.max(0, (Number(target.likes) || 0) - users.size);
    if (action === 'like') users.add(userId); else users.delete(userId);
    target.liked_by = [...users]; target.reaction_base = base; target.likes = base + users.size;
    await this.write(db);
    return target.likes;
  }

  // --- Ratings & Reviews ---
  async getMovieRatings(movieSlug, userId = null) {
    const db = await this.read();
    return require('./ratingService').summarizeRatings(db.ratings, movieSlug, userId);
  }

  async rateMovie(userId, movieSlug, score) {
    const db = await this.read();
    const result = require('./ratingService').upsertRating(db, { movie_slug: movieSlug, user_id: userId, score });
    await this.write(db);
    return result;
  }

  // --- Error Reports ---
  async reportError({ movieSlug, episodeSlug, reason, userEmail }) {
    const db = await this.read();
    if (!db.reports) db.reports = [];
    const rep = {
      id: 'rep_' + Date.now(),
      movie_slug: movieSlug,
      episode_slug: episodeSlug || 'full',
      reason: reason || 'Lỗi phát phim hoặc mất tiếng',
      user_email: userEmail || 'anonymous',
      created_at: new Date().toISOString()
    };
    db.reports.unshift(rep);
    await this.write(db);
    return rep;
  }

  // --- Change Password ---
  async changePassword(userId, oldPassword, newPassword) {
    if (!passwordValid(newPassword)) return { status: false, message: 'Mật khẩu mới cần 6–256 ký tự' };
    const db = await this.read();
    const user = db.users.find(u => u.id === userId);
    if (!user) return { status: false, message: 'Người dùng không tồn tại' };
    if (!await verifyPassword(oldPassword, user.password)) {
      return { status: false, message: 'Mật khẩu hiện tại không chính xác' };
    }
    user.password = await hashPassword(newPassword);
    user.token_version = (user.token_version || 0) + 1;
    user.updated_at = new Date().toISOString();
    await this.write(db);
    sessionEvents.emit('revoked', userId);
    return { status: true, message: 'Đổi mật khẩu thành công!' };
  }

  async revokeUserSessions(userId) {
    const db = await this.read();
    const user = db.users.find(item => item.id === userId);
    if (!user) return false;
    user.token_version = (user.token_version || 0) + 1;
    await this.write(db);
    sessionEvents.emit('revoked', userId);
    return true;
  }

  // --- Batch Remove Watchlist ---
  async batchRemoveWatchlist(userId, slugs = []) {
    const db = await this.read();
    db.watchlist = db.watchlist.filter(w => !(w.user_id === userId && slugs.includes(w.movie_slug)));
    await this.write(db);
    return true;
  }

  // --- Admin Operations ---
  async getAllUsers() {
    const db = await this.read();
    return (db.users || []).map(publicUser);
  }

  async getAllComments() {
    const db = await this.read();
    return db.comments || [];
  }

  async deleteComment(commentId) {
    const db = await this.read();
    db.comments = (db.comments || []).filter(c => c.id !== commentId);
    await this.write(db);
    return true;
  }

  async getReports() {
    const db = await this.read();
    return db.reports || [];
  }

  async addReport({ movie_slug, movie_name, episode_slug, episode_name, reason, details, user_id, user_name }) {
    const db = await this.read();
    if (!db.reports) db.reports = [];
    const newReport = {
      id: 'rep_' + Date.now(),
      movie_slug,
      movie_name: movie_name || movie_slug,
      episode_slug: episode_slug || 'tap-1',
      episode_name: episode_name || episode_slug || 'Tập 1',
      reason: reason || 'Lỗi phát video',
      details: details || '',
      user_id: user_id || 'anonymous',
      user_name: user_name || 'Khán giả',
      status: 'pending',
      created_at: new Date().toISOString()
    };
    db.reports.unshift(newReport);
    await this.write(db);
    return newReport;
  }

  async addRating({ movie_slug, score, user_id }) {
    const db = await this.read();
    const result = require('./ratingService').upsertRating(db, { movie_slug, score, user_id });
    await this.write(db);
    return result;
  }

  async updateReportStatus(reportId, status = 'resolved') {
    const db = await this.read();
    const rep = (db.reports || []).find(r => r.id === reportId);
    if (rep) {
      rep.status = status;
      rep.resolved_at = new Date().toISOString();
      await this.write(db);
      return rep;
    }
    return null;
  }

  async getAdminStats() {
    const db = await this.read();
    const users = db.users || [];
    const vipUsers = users.filter(u => u.is_vip);
    const reports = db.reports || [];
    const pendingReports = reports.filter(r => r.status !== 'resolved');
    const comments = db.comments || [];
    const watchlist = db.watchlist || [];
    const ratings = db.ratings || [];
    const movieViews = db.movie_views || {};

    // Calculate total views and top movies
    let totalViews = 0;
    const viewsList = [];
    for (const [slug, count] of Object.entries(movieViews)) {
      totalViews += (Number(count) || 0);
      viewsList.push({ slug, views: Number(count) || 0 });
    }
    viewsList.sort((a, b) => b.views - a.views);
    const topMovies = viewsList.slice(0, 10);

    // Rating stats
    const avgRating = ratings.length > 0 
      ? (ratings.reduce((sum, r) => sum + (r.score || 0), 0) / ratings.length).toFixed(1)
      : '--';

    // Recent activity (latest history records)
    const recentActivity = (db.history || []).slice(0, 10);

    return {
      totalUsers: users.length,
      vipUsers: vipUsers.length,
      totalReports: reports.length,
      pendingReports: pendingReports.length,
      totalComments: comments.length,
      totalWatchlistEntries: watchlist.length,
      totalRatings: ratings.length,
      avgRating,
      totalViews,
      topMovies,
      recentActivity,
      systemUptime: process.uptime(),
      nodeVersion: process.version,
      memoryUsage: process.memoryUsage(),
      dbSizeBytes: JSON.stringify(db).length
    };
  }

  // Settings
  async getSettings() {
    try {
      const db = await this.read();
      return db.settings || {
        site_title: 'KKPhim - Xem Phim Online Chuẩn Cinema 4K',
        announcement: '🔥 Trải nghiệm nền tảng phim điện ảnh đỉnh cao KKPhim.',
        announcement_active: true,
        maintenance_mode: false,
        featured_slugs: []
      };
    } catch (e) {
      return {
        site_title: 'KKPhim - Xem Phim Online Chuẩn Cinema 4K',
        announcement: '🔥 Trải nghiệm nền tảng phim điện ảnh đỉnh cao KKPhim.',
        announcement_active: false,
        maintenance_mode: false,
        featured_slugs: []
      };
    }
  }

  async updateSettings(newSettings) {
    const db = await this.read();
    db.settings = { ...(db.settings || {}), ...newSettings };
    await this.write(db);
    return db.settings;
  }

  async saveBanners(config, expectedRevision) {
    const bannerService = require('./bannerService');
    const db = await this.read();
    const settings = db.settings || {};
    if (expectedRevision !== bannerService.revision(settings)) {
      const error = new Error('Banner đã được chỉnh sửa ở phiên khác. Tải lại trước khi lưu.');
      error.status = 409;
      throw error;
    }
    const pinned = settings.featured_slugs || [];
    const bySlug = new Map(pinned.map(item => [typeof item === 'string' ? item : item.slug, item]));
    if (config.slides.some(item => !bySlug.has(item.slug)) || bySlug.size !== config.slides.length) {
      const error = new Error('Danh sách phim ghim đã thay đổi. Vui lòng tải lại.');
      error.status = 409;
      throw error;
    }
    db.settings = { ...settings, banner_config: config, featured_slugs: config.slides.map(item => bySlug.get(item.slug)) };
    await this.write(db);
    return bannerService.getConfig(db.settings);
  }

  async saveAdvertising(config, expectedRevision) {
    const banners = require('./bannerService');
    const db = await this.read();
    const settings = db.settings || {};
    if (expectedRevision !== banners.getAds(settings).revision) {
      const error = new Error('Quảng cáo đã được chỉnh sửa ở phiên khác. Tải lại trước khi lưu.');
      error.status = 409;
      throw error;
    }
    db.settings = { ...settings, advertising: config };
    await this.write(db);
    return banners.getAds(db.settings);
  }

  // Create User by Admin
  async createUserByAdmin({ name, email, password, role = 'user', gender }) {
    if (!passwordValid(password)) throw new Error('Mật khẩu cần 6–256 ký tự');
    if (!require('./defaultAvatars').validGender(gender)) throw new Error('Giới tính không hợp lệ');
    const db = await this.read();
    if (!db.users) db.users = [];

    const existing = db.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (existing) {
      throw new Error('Email này đã tồn tại trong hệ thống');
    }

    const newUser = {
      id: 'usr_' + Date.now(),
      email: email.trim(),
      password: await hashPassword(password),
      name: name ? name.trim() : email.split('@')[0],
      role: role || 'user',
      ...(gender != null && { gender }),
      avatar: require('./defaultAvatars').avatarForGender(gender),
      created_at: new Date().toISOString()
    };

    db.users.push(newUser);
    await this.write(db);
    const { password: p, ...rest } = newUser;
    return rest;
  }

  async deleteUser(userId) {
    const db = await this.read();
    if (userId === 'usr_admin_01') {
      throw new Error('Không thể xóa tài khoản Quản Trị Viên tối cao');
    }
    const target = db.users.find(user => user.id === userId);
    if (target?.role === 'admin' && db.users.filter(user => user.role === 'admin' && !user.blocked).length <= 1) throw new Error('Cannot delete the last active administrator');
    db.identity_sessions = (db.identity_sessions || []).filter(session => session.user_id !== userId);
    db.identity_tokens = (db.identity_tokens || []).filter(token => token.user_id !== userId);
    db.users = (db.users || []).filter(u => u.id !== userId);
    await this.write(db);
    sessionEvents.emit('revoked', userId);
    return true;
  }

  async getRawDatabase() {
    return await this.read();
  }

  // --- Real Movie Views Tracking ---
  async getMovieViews() {
    const db = await this.read();
    return db.movie_views || {};
  }

  async incrementMovieView(slug) {
    if (!slug) return 0;
    const db = await this.read();
    if (!db.movie_views) db.movie_views = {};
    db.movie_views[slug] = (db.movie_views[slug] || 0) + 1;
    await this.write(db);
    return db.movie_views[slug];
  }
}

module.exports = new DbService();



