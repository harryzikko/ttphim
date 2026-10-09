const fs = require('fs').promises;
const path = require('path');
const config = require('../config');

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
    this.cache = null;
    this.isWriting = false;
  }

  async read() {
    try {
      const data = await fs.readFile(this.dbPath, 'utf8');
      if (data && data.trim()) {
        this.cache = JSON.parse(data);
        return this.cache;
      }
      if (this.cache) return this.cache;
      const initial = { users: [], watchlist: [], history: [], comments: [] };
      await this.write(initial);
      return initial;
    } catch (err) {
      if (err.code === 'ENOENT') {
        const initial = { users: [], watchlist: [], history: [], comments: [] };
        await this.write(initial);
        return initial;
      }
      if (this.cache) {
        console.warn('[DbService] Error parsing db.json, falling back to in-memory cache:', err.message);
        return this.cache;
      }
      return { users: [], watchlist: [], history: [], comments: [] };
    }
  }

  async write(data) {
    this.cache = data;
    try {
      const tmpPath = `${this.dbPath}.${Date.now()}.tmp`;
      await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      await fs.rename(tmpPath, this.dbPath);
    } catch (err) {
      // Fallback simple write if rename fails on Windows file lock
      await fs.writeFile(this.dbPath, JSON.stringify(data, null, 2), 'utf8').catch(() => {});
    }
    return data;
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

  async createUser({ email, password, name }) {
    const db = await this.read();
    const newUser = {
      id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      email: email.trim(),
      password,
      name: name || email.split('@')[0],
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAPbHo0WbRHUQwGQOjadraD_tAk7XQUGjJQPQDSvK5RZfRCVSUufHkI5ytr1RnoudWNDKzqxm86HwkNOfZhdJ6gH5wUBF8Hu6sx3uE-8dvCv61CH5Sl6_6rcVCCUeOGM4Ub3reCBWB2-ittRPKQslAi-yOnv0WlNzjOskqtQAYGefgmgohy9WNwv1lISujIp8aIK3M0rynROP6yxRZcTMSyWswRJsdzf7K4DhDzjq8',
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
    db.users[index] = { ...db.users[index], ...updates };
    await this.write(db);
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
        category: movieData.category || 'Điện ảnh',
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
    const historyItem = {
      id: existingIndex > -1 ? db.history[existingIndex].id : 'hist_' + Date.now(),
      user_id: userId,
      movie_slug: data.movie_slug,
      movie_name: data.movie_name,
      origin_name: data.origin_name || '',
      poster_url: data.poster_url || '',
      thumb_url: data.thumb_url || '',
      episode_slug: data.episode_slug || 'tap-1',
      episode_name: formatEpBadge(data.episode_name),
      current_time: Math.round(data.current_time || 0),
      duration: Math.round(data.duration || 0),
      progress_percent: data.duration > 0 ? Math.min(100, Math.max(1, Math.round(((data.current_time || 0) / data.duration) * 100))) : 5,
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
  async getComments(movieSlug) {
    try {
      const db = await this.read();
      const list = (db.comments || []).filter(c => c.movie_slug === movieSlug || c.movie_slug === 'default');
      return list.map(c => ({
        ...c,
        replies: c.replies || []
      }));
    } catch (e) {
      return [];
    }
  }

  async addComment({ movieSlug, userName, userAvatar, isVip, content, timestampTag, rating, isSpoil }) {
    const db = await this.read();
    if (!db.comments) db.comments = [];

    const newComment = {
      id: 'cmt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      movie_slug: movieSlug,
      user_name: userName || 'Khán giả KKPhim',
      user_avatar: userAvatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAPbHo0WbRHUQwGQOjadraD_tAk7XQUGjJQPQDSvK5RZfRCVSUufHkI5ytr1RnoudWNDKzqxm86HwkNOfZhdJ6gH5wUBF8Hu6sx3uE-8dvCv61CH5Sl6_6rcVCCUeOGM4Ub3reCBWB2-ittRPKQslAi-yOnv0WlNzjOskqtQAYGefgmgohy9WNwv1lISujIp8aIK3M0rynROP6yxRZcTMSyWswRJsdzf7K4DhDzjq8',
      is_vip: Boolean(isVip),
      content: content.trim(),
      timestamp_tag: timestampTag || null,
      rating: rating ? parseInt(rating, 10) : 5,
      is_spoil: Boolean(isSpoil),
      likes: 0,
      created_at: new Date().toISOString(),
      replies: []
    };

    db.comments.unshift(newComment);
    await this.write(db);
    return newComment;
  }

  async addReply(commentId, { userName, userAvatar, content }) {
    const db = await this.read();
    if (!db.comments) db.comments = [];

    const comment = db.comments.find(c => c.id === commentId);
    if (!comment) return null;

    if (!comment.replies) comment.replies = [];

    const newReply = {
      id: 'rep_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      comment_id: commentId,
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

  async likeComment(commentId, action = 'like') {
    const db = await this.read();
    // Search in top-level comments
    const comment = (db.comments || []).find(c => c.id === commentId);
    if (comment) {
      if (action === 'unlike') {
        comment.likes = Math.max(0, (comment.likes || 1) - 1);
      } else {
        comment.likes = (comment.likes || 0) + 1;
      }
      await this.write(db);
      return comment.likes;
    }

    // Search in replies
    for (const c of (db.comments || [])) {
      const rep = (c.replies || []).find(r => r.id === commentId);
      if (rep) {
        if (action === 'unlike') {
          rep.likes = Math.max(0, (rep.likes || 1) - 1);
        } else {
          rep.likes = (rep.likes || 0) + 1;
        }
        await this.write(db);
        return rep.likes;
      }
    }

    return 0;
  }

  // --- Ratings & Reviews ---
  async rateMovie(userId, movieSlug, score) {
    const db = await this.read();
    if (!db.ratings) db.ratings = [];
    const existing = db.ratings.find(r => r.user_id === userId && r.movie_slug === movieSlug);
    if (existing) {
      existing.score = score;
      existing.updated_at = new Date().toISOString();
    } else {
      db.ratings.push({
        id: 'rate_' + Date.now(),
        user_id: userId,
        movie_slug: movieSlug,
        score: score,
        created_at: new Date().toISOString()
      });
    }
    await this.write(db);
    const movieRatings = db.ratings.filter(r => r.movie_slug === movieSlug);
    const avg = (movieRatings.reduce((sum, r) => sum + r.score, 0) / movieRatings.length).toFixed(1);
    return { score, avg, total: movieRatings.length };
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
    const db = await this.read();
    const user = db.users.find(u => u.id === userId);
    if (!user) return { status: false, message: 'Người dùng không tồn tại' };
    if (user.password !== oldPassword) {
      return { status: false, message: 'Mật khẩu hiện tại không chính xác' };
    }
    user.password = newPassword;
    user.updated_at = new Date().toISOString();
    await this.write(db);
    return { status: true, message: 'Đổi mật khẩu thành công!' };
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
    return (db.users || []).map(u => {
      const { password, ...rest } = u;
      return rest;
    });
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

  async addRating({ movie_slug, episode_slug, score, user_id }) {
    const db = await this.read();
    if (!db.ratings) db.ratings = [];
    const newRating = {
      id: 'rate_' + Date.now(),
      movie_slug,
      episode_slug: episode_slug || 'all',
      score: Math.min(10, Math.max(1, score)),
      user_id: user_id || 'anonymous',
      created_at: new Date().toISOString()
    };
    db.ratings.unshift(newRating);
    await this.write(db);
    return newRating;
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

  // Create User by Admin
  async createUserByAdmin({ name, email, password, role = 'user' }) {
    const db = await this.read();
    if (!db.users) db.users = [];

    const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      throw new Error('Email này đã tồn tại trong hệ thống');
    }

    const newUser = {
      id: 'usr_' + Date.now(),
      email: email.trim(),
      password: password.trim(),
      name: name ? name.trim() : email.split('@')[0],
      role: role || 'user',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDmV0kJ3rLlFchh-aGILVOr-pQbdtHs2qQKQtkeKftGRHjg2nb7ii3xkFe2aJA7-Gldl5BqHuj4L_uiVmqQyW9CCgKPrUz_MCzKjGtUsI1R3dM0r3vXdhkgOsKaL_SVbs9gl7b2sTWQGr3VphY1X_pUChBkXZ-KPQtC6HeaIV7uxpjuEKEltMKcvR78AOcVjnQlk989xeMDULyOev-eHEjgdEO-N14MVTh2oQR_E3A',
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
    db.users = (db.users || []).filter(u => u.id !== userId);
    await this.write(db);
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



