const express = require('express');
const router = express.Router();
const kkphimService = require('../services/kkphimService');
const vicdnService = require('../services/vicdnService');
const nguoncService = require('../services/nguoncService');
const dbService = require('../services/dbService');
const partyService = require('../services/partyService');
const personService = require('../services/personService');
const tmdbService = require('../services/tmdbService');
const seasonService = require('../services/seasonService');
const { SharedTvAuthService } = require('../services/sharedTvAuthService');
const tvAuthService = new SharedTvAuthService(dbService.store, user => require('../services/authService').issueSession(user, { device: 'TV QR login' }));
const { authMiddleware, requireAuth, requireAdmin, generateToken } = require('../services/authService');
const { publicUser } = require('../services/passwordService');
const bannerService = require('../services/bannerService');
const config = require('../config');
const { cookieOptions, originGuard, corsMiddleware, validateMutation, loginLimiter, registrationLimiter, tvLimiter, mutationLimiter } = require('../services/requestSecurity');
const { router: operationsRoutes, adminAudit } = require('./operationsRoutes');

router.use(corsMiddleware, originGuard, mutationLimiter);
router.use('/auth/login', loginLimiter);
router.use('/auth/register', registrationLimiter);
router.use(['/auth/tv/session', '/auth/tv/authorize'], tvLimiter);
router.use(authMiddleware);
router.use(['/admin', '/user', '/auth'], (req, res, next) => {
  res.set('Cache-Control', 'private, no-store'); res.vary('Cookie'); res.vary('Authorization'); next();
});
router.use(require('../services/requestSecurity').accountGuard);
router.use('/auth', require('./identityRoutes'));
router.use('/admin', requireAuth, requireAdmin);
router.use('/user', (req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); }, requireAuth);
router.use(require('./avatarRoutes').createAvatarRouter(require('../services/avatarService').createAvatarService({ db: dbService, directory: config.AVATAR_DIR })));
router.use(validateMutation);
router.use('/admin', adminAudit);
router.use(operationsRoutes);
router.use(require('./followRoutes'));
router.use(require('./playbackRoutes'));

// --- Public Movie Endpoints ---

// Health Check
router.get('/health', (req, res) => {
  res.json({ status: true, message: 'KKPhim API is running', timestamp: new Date().toISOString() });
});

// Home Page Aggregated Feed
router.get('/home', async (req, res) => {
  try {
    const [data, settings] = await Promise.all([kkphimService.getHomeData(), dbService.getSettings()]);
    res.json({ status: true, data: await require('../services/featuredArtwork').prepareHome(data, settings) });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi tải dữ liệu trang chủ', error: err.message });
  }
});

// Movie Details & Episodes
router.get('/movies/:slug', async (req, res) => {
  res.set('Cache-Control', 'private, no-store'); res.vary('Cookie'); res.vary('Authorization');
  try {
    const { slug } = req.params;
    // Increment real local view count
    // Count only verified movies, never arbitrary missing slugs.

    const data = await kkphimService.getMovieDetail(slug);
    if (!data?.movie) return res.status(404).json({ status: false, message: 'Không tìm thấy thông tin phim' });
    dbService.incrementMovieView(slug).catch(() => {});
    
    // Enrich with accurate TMDb / IMDb credits (cast & directors with portraits)
    if (data && data.movie) {
      try {
        const credits = await tmdbService.getMovieCredits(data.movie);
        data.movie.credits = credits;
        if (credits.cast && credits.cast.length > 0) {
          data.movie.tmdb_cast = credits.cast;
        }
        if (credits.directors && credits.directors.length > 0) {
          data.movie.tmdb_directors = credits.directors;
        }
      } catch (e) {
        console.warn(`[API] TMDb credits fetch failed for ${slug}:`, e.message);
      }
    }

    // Check if in user watchlist
    let inWatchlist = false;
    let watchedHistory = null;
    if (req.user) {
      inWatchlist = await dbService.isInWatchlist(req.user.id, slug);
      const history = await dbService.getHistory(req.user.id);
      watchedHistory = history.find(h => h.movie_slug === slug) || null;
    }

    res.json({ status: true, data: { ...data, inWatchlist, watchedHistory } });
  } catch (err) {
    const status = err.status === 404 ? 404 : 503;
    res.status(status).json({ status: false, message: status === 404 ? 'Không tìm thấy thông tin phim' : 'Nguồn phim tạm thời không khả dụng. Vui lòng thử lại.' });
  }
});

// Real View Tracker Endpoint
router.post('/movies/:slug/view', async (req, res) => {
  try {
    const { slug } = req.params;
    const views = await dbService.incrementMovieView(slug);
    res.json({ status: true, views });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi cập nhật lượt xem' });
  }
});

// Report Movie / Episode Error
router.post('/movies/:slug/report', async (req, res) => {
  try {
    const { slug } = req.params;
    const { episode_slug, episode_name, reason, details } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ status: false, message: 'Vui lòng cung cấp lý do báo lỗi' });
    }
    const report = await dbService.addReport({
      movie_slug: slug,
      episode_slug: episode_slug || 'tap-1',
      episode_name: episode_name || episode_slug || 'Tập 1',
      reason: reason.trim(),
      details: details ? details.trim() : '',
      user_id: req.user ? req.user.id : 'khach_an_danh',
      user_name: req.user ? req.user.name : 'Khán giả'
    });
    res.json({ status: true, message: 'Đã gửi báo lỗi thành công! Cảm ơn bạn đã phản hồi.', data: report });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi ghi nhận báo cáo' });
  }
});

router.get('/movies/:slug/tmdb-rating', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(req.params.slug)) return res.status(400).json({ status: false, message: 'Slug phim không hợp lệ' });
  try {
    const detail = await kkphimService.getMovieDetail(req.params.slug);
    if (!detail?.movie) return res.status(404).json({ status: false, message: 'Không tìm thấy phim' });
    const rating = await tmdbService.getMovieRating(detail.movie);
    res.json({ status: true, data: rating });
  } catch (_) { res.status(502).json({ status: false, message: 'Chưa tải được điểm TMDb. Vui lòng thử lại.' }); }
});

router.get('/movies/:slug/seasons', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  const { slug } = req.params;
  if (!slug || !/^[a-zA-Z0-9_-]{1,200}$/.test(slug)) {
    return res.status(400).json({ status: false, message: 'Slug không hợp lệ' });
  }
  try {
    const seasons = await seasonService.getFranchiseSeasons(slug);
    res.json({ status: true, data: seasons });
  } catch (err) {
    res.json({ status: true, data: [] });
  }
});

router.get('/movies/:slug/ratings', async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  try { res.json({ status: true, data: await dbService.getMovieRatings(req.params.slug, req.user?.id) }); }
  catch (_) { res.status(503).json({ status: false, message: 'Không thể tải đánh giá lúc này' }); }
});

// Rate Movie / Episode
router.post('/movies/:slug/rate', requireAuth, async (req, res) => {
  try {
    const { slug } = req.params;
    const { score, episode_slug } = req.body;
    if (!Number.isInteger(score) || score < 1 || score > 5) return res.status(400).json({ status: false, message: 'Vui lòng chọn từ 1 đến 5 sao' });
    const numScore = score;
    const rating = await dbService.addRating({
      movie_slug: slug,
      episode_slug,
      score: numScore,
      user_id: req.user.id
    });
    res.json({ status: true, message: 'Đã gửi đánh giá thành công! Cảm ơn bạn.', data: rating });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi ghi nhận đánh giá' });
  }
});

// Catalog / Filter / Search
router.get('/catalog', async (req, res) => {
  try {
    const { type, category, country, year, format, sort, page, keyword, limit } = req.query;
    const data = await kkphimService.getCatalog({ type, category, country, year, format, sort, page, keyword, limit });
    res.json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi lọc danh sách phim', error: err.message });
  }
});

// Quick Search Autocomplete
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    const results = await kkphimService.quickSearch(q);
    res.json({ status: true, data: results });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi tìm kiếm phim', error: err.message });
  }
});

// Metadata: Categories and Countries
router.get('/categories', async (req, res) => {
  try {
    const data = await kkphimService.getCategoriesAndCountries();
    res.json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi tải danh mục', error: err.message });
  }
});

// --- Comments System ---

router.get('/comments/:slug', async (req, res) => {
  try {
    res.set('Cache-Control', 'private, no-store'); res.vary('Cookie'); res.vary('Authorization');
    const { slug } = req.params;
    const comments = await dbService.getComments(slug, req.user?.id);
    res.json({ status: true, data: comments });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi tải bình luận' });
  }
});

router.post('/comments/:slug', requireAuth, async (req, res) => {
  try {
    const { slug } = req.params;
    const { content, timestamp_tag, episode_slug, is_spoil } = req.body;

    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ status: false, message: 'Nội dung bình luận không được rỗng' });
    }
    if (timestamp_tag != null && timestamp_tag !== '' && !/^(?:\d{1,3}:)?\d{1,3}:[0-5]\d$/.test(timestamp_tag)) return res.status(400).json({ status: false, message: 'Mốc thời gian không hợp lệ' });
    if (episode_slug != null && (typeof episode_slug !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(episode_slug))) return res.status(400).json({ status: false, message: 'Tập phim không hợp lệ' });
    if (is_spoil != null && typeof is_spoil !== 'boolean') return res.status(400).json({ status: false, message: 'Trạng thái spoiler không hợp lệ' });

    const userName = req.user.name || 'Khán giả CineViet';
    const userAvatar = req.user.avatar || null;
    const isVip = false;

    const newComment = await dbService.addComment({
      movieSlug: slug,
      userId: req.user.id,
      userName,
      userAvatar,
      isVip,
      content,
      timestampTag: timestamp_tag,
      episodeSlug: episode_slug,
      isSpoil: is_spoil === true
    });

    res.json({ status: true, data: newComment });
  } catch (err) {
    res.status(err.status === 429 ? 429 : 500).json({ status: false, message: err.status === 429 ? 'Bạn gửi bình luận quá nhanh' : 'Lỗi đăng bình luận' });
  }
});

router.post('/comments/:id/reply', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ status: false, message: 'Nội dung phản hồi không được để trống' });
    }
    const userName = req.user.name || 'Khán giả CineViet';
    const userAvatar = req.user.avatar || null;

    const reply = await dbService.addReply(id, { userId: req.user.id, userName, userAvatar, content });
    if (!reply) {
      return res.status(404).json({ status: false, message: 'Không tìm thấy bình luận để phản hồi' });
    }
    res.json({ status: true, data: reply });
  } catch (err) {
    res.status(err.status === 429 ? 429 : 500).json({ status: false, message: err.status === 429 ? 'Bạn gửi phản hồi quá nhanh' : 'Lỗi gửi phản hồi' });
  }
});

router.post('/comments/:id/like', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body || {};
    if (action != null && !['like', 'unlike'].includes(action)) return res.status(400).json({ status: false, message: 'Thao tác thích bình luận không hợp lệ' });
    const likes = await dbService.likeComment(id, action || 'like', req.user.id);
    res.json({ status: true, data: { likes, liked: action !== 'unlike' } });
  } catch (err) {
    const status = [400, 404].includes(err.status) ? err.status : 500;
    res.status(status).json({ status: false, message: status === 404 ? 'Không tìm thấy bình luận' : 'Lỗi thích bình luận' });
  }
});

// --- Authentication Endpoints ---

router.get('/auth/me', (req, res) => {
  if (req.user) {
    return res.json({ status: true, data: req.user });
  }
  // Return null or unauthenticated state
  res.json({ status: false, data: null });
});


// --- User Library (Watchlist, History, Continue-Watching) ---

router.get('/user/library', async (req, res) => {
  try {
    const userId = req.user.id;
    const [watchlist, history] = await Promise.all([
      dbService.getWatchlist(userId),
      dbService.getHistory(userId)
    ]);

    const continueWatching = history.filter(h => h.continue_hidden !== true && (h.progress_percent || 0) < 95 && Number(h.current_time) > 0);

    const enrichSongNgu = (items) => (items || []).map(item => ({
      ...item,
      thumb_url: item.thumb_url || (item.poster_url && item.poster_url.includes('-poster.') ? item.poster_url.replace('-poster.', '-thumb.') : (item.thumb_url || item.poster_url || '')),
      has_song_ngu: Boolean(item.has_song_ngu || vicdnService.hasBilingualMatch({ slug: item.movie_slug || item.slug, name: item.movie_name || item.name, origin_name: item.origin_name }))
    }));

    res.json({
      status: true,
      data: {
        watchlist: enrichSongNgu(watchlist),
        history: enrichSongNgu(history),
        continueWatching: enrichSongNgu(continueWatching),
        stats: {
          watchingCount: continueWatching.length,
          favoriteCount: watchlist.length,
          historyCount: history.length,
          completedCount: history.filter(h => (h.progress_percent || 0) >= 95).length
        }
      }
    });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi tải thư viện phim' });
  }
});

router.post('/user/watchlist/toggle', async (req, res) => {
  try {
    const userId = req.user.id;
    const movieData = req.body;
    if (!movieData.movie_slug) {
      return res.status(400).json({ status: false, message: 'Thiếu slug phim' });
    }

    const result = await dbService.toggleWatchlist(userId, movieData);
    res.json({ status: true, data: result });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi cập nhật danh sách yêu thích' });
  }
});

router.post('/user/watchlist/remove', async (req, res) => {
  try {
    const userId = req.user.id;
    const { movie_slug } = req.body;
    await dbService.removeFromWatchlist(userId, movie_slug);
    res.json({ status: true, message: 'Đã xóa khỏi danh sách yêu thích' });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi xóa khỏi danh sách yêu thích' });
  }
});

router.post('/user/history', async (req, res) => {
  try {
    const userId = req.user.id;
    const data = req.body;
    if (!data.movie_slug) {
      return res.status(400).json({ status: false, message: 'Thiếu dữ liệu phim' });
    }

    const saved = await dbService.saveHistory(userId, data);
    res.json({ status: true, data: saved });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi lưu tiến trình xem phim' });
  }
});

router.post('/user/history/visibility', async (req, res) => {
  const { movie_slug, hidden } = req.body;
  if (typeof movie_slug !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(movie_slug) || typeof hidden !== 'boolean') return res.status(400).json({ status: false, message: 'Cần slug phim hợp lệ và trạng thái ẩn/hiện' });
  try { res.json({ status: true, data: await dbService.setContinueVisibility(req.user.id, movie_slug, hidden) }); }
  catch (error) { res.status(error.status === 404 ? 404 : 500).json({ status: false, message: error.status === 404 ? error.message : 'Không thể cập nhật mục Xem tiếp' }); }
});

router.post('/user/history/clear', async (req, res) => {
  try {
    const userId = req.user.id;
    await dbService.clearHistory(userId);
    res.json({ status: true, message: 'Đã xóa toàn bộ lịch sử xem', data: { user_id: userId } });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi xóa lịch sử' });
  }
});

router.post('/user/history/remove', async (req, res) => {
  try {
    const userId = req.user.id;
    const { movie_slug } = req.body;
    if (!movie_slug) {
      return res.status(400).json({ status: false, message: 'Thiếu slug phim' });
    }
    await dbService.removeFromHistory(userId, movie_slug);
    res.json({ status: true, message: 'Đã xóa phim khỏi danh sách tiếp tục xem', data: { user_id: userId } });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi xóa lịch sử phim' });
  }
});




// Change Password
router.post('/user/password', async (req, res) => {
  try {
    const userId = req.user.id;
    const { old_password, new_password } = req.body;
    if (typeof old_password !== 'string' || !require('../services/passwordService').passwordValid(new_password)) {
      return res.status(400).json({ status: false, message: 'Mật khẩu mới cần 6–256 ký tự' });
    }
    const result = await dbService.changePassword(userId, old_password, new_password);
    if (result.status) res.clearCookie('token', cookieOptions);
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi thay đổi mật khẩu' });
  }
});

// Batch remove watchlist
router.post('/user/watchlist/batch-remove', async (req, res) => {
  try {
    const userId = req.user.id;
    const { slugs } = req.body;
    if (!Array.isArray(slugs) || slugs.length === 0) {
      return res.status(400).json({ status: false, message: 'Danh sách phim không hợp lệ' });
    }
    await dbService.batchRemoveWatchlist(userId, slugs);
    res.json({ status: true, message: `Đã xóa ${slugs.length} phim khỏi danh sách yêu thích` });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi xóa danh sách phim' });
  }
});

// Update Profile
router.post('/user/profile', async (req, res) => {
  try {
    const userId = req.user.id;
    const { name } = req.body;
    // Avatar writes belong exclusively to the upload/default endpoints. Ignoring
    // legacy profile avatar fields prevents stale forms from undoing a newer upload.
    const updated = await dbService.updateUser(userId, {
      ...(name && { name: name.trim() })
    });
    res.json({ status: true, message: 'Cập nhật thông tin thành công!', data: publicUser(updated) });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi cập nhật thông tin cá nhân' });
  }
});

// ==========================================
// --- ADMIN MANAGEMENT ENDPOINTS ---
// ==========================================

// Admin: System & Dashboard Stats
router.get('/admin/stats', async (req, res) => {
  try {
    const stats = await dbService.getAdminStats();
    const [kkphimTotal, vicdnTotal, nguoncTotal] = await Promise.all([
      kkphimService.getTotalMovies(),
      vicdnService.getTotalMovies ? vicdnService.getTotalMovies() : 628,
      nguoncService.getTotalMovies ? nguoncService.getTotalMovies() : 33580
    ]);
    stats.totalWebMovies = kkphimTotal;
    stats.totalAllSources = kkphimTotal == null ? null : kkphimTotal + (vicdnTotal || 0) + (nguoncTotal || 0);
    stats.sourceCounts = {
      kkphim: kkphimTotal,
      vicdn: vicdnTotal || 628,
      nguonc: nguoncTotal || 33580
    };
    res.json({ status: true, data: stats });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi lấy thống kê admin' });
  }
});

// Admin: Get all users
router.get('/admin/users', async (req, res) => {
  try {
    const users = await dbService.getAllUsers();
    res.json({ status: true, data: users });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi tải danh sách người dùng' });
  }
});

// Admin: Update user
router.post('/admin/users/:id/update', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updated = await dbService.updateUser(id, updates);
    res.json({ status: true, message: 'Đã cập nhật tài khoản người dùng', data: publicUser(updated) });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi cập nhật người dùng' });
  }
});

// Admin: Error Reports
router.get('/admin/reports', async (req, res) => {
  try {
    const reports = await dbService.getReports();
    res.json({ status: true, data: reports });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi tải danh sách báo cáo' });
  }
});

// Admin: Update Report Status
router.post('/admin/reports/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const updated = await dbService.updateReportStatus(id, status);
    res.json({ status: true, message: 'Đã cập nhật trạng thái xử lý', data: updated });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi cập nhật báo cáo' });
  }
});

// Admin: Moderation comments
router.get('/admin/comments', async (req, res) => {
  try {
    const comments = await dbService.getAllComments();
    res.json({ status: true, data: comments });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi tải danh sách bình luận' });
  }
});

// Admin: Delete comment
router.delete('/admin/comments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await dbService.deleteComment(id);
    res.json({ status: true, message: 'Đã xóa bình luận vi phạm' });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi xóa bình luận' });
  }
});

// Admin: Clear server cache
router.post('/admin/cache/clear', async (req, res) => {
  try {
    kkphimService.cache.flushAll();
    res.json({ status: true, message: 'Đã làm mới toàn bộ bộ nhớ đệm (Cache) KKPhim!' });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi xóa bộ nhớ đệm' });
  }
});

// Admin: Get Sources Status
router.get('/admin/sources', async (req, res) => {
  try {
    const [kkphimTotal, vicdnTotal, nguoncTotal] = await Promise.all([
      kkphimService.getTotalMovies(),
      vicdnService.getTotalMovies ? vicdnService.getTotalMovies() : 628,
      nguoncService.getTotalMovies ? nguoncService.getTotalMovies() : 33580
    ]);
    const vicdnIndexed = (vicdnService && vicdnService.allMovies) ? vicdnService.allMovies.length : 0;
    const nguoncIndexed = (nguoncService && nguoncService.allMovies) ? nguoncService.allMovies.length : 0;

    const totalWebMovies = kkphimTotal;
    const totalAllSources = totalWebMovies == null ? null : totalWebMovies + (vicdnTotal || 0) + (nguoncTotal || 0);

    res.json({
      status: true,
      data: {
        total_web_movies: totalWebMovies,
        total_all_sources: totalAllSources,
        kkphim: {
          name: 'KKPhim API (Phimapi)',
          endpoint: 'https://phimapi.com',
          status: kkphimService.sourceStatus || 'unknown',
          total_movies: totalWebMovies,
          total_pages: kkphimService.totalPages,
          type: 'Phim Lẻ, Phim Bộ, TV Shows, Hoạt Hình, Chiếu Rạp'
        },
        vicdn: {
          name: 'ViCDN (Server Song Ngữ)',
          endpoint: 'https://vicdn.cc',
          status: 'online',
          total_movies: vicdnTotal || 628,
          total_pages: vicdnService.totalPages || 63,
          indexed_movies: vicdnIndexed,
          type: 'Bilingual Song Ngữ, Đa giọng & Phụ đề'
        },
        nguonc: {
          name: 'NguonC API (phim.nguonc.com)',
          endpoint: 'https://phim.nguonc.com/api',
          status: nguoncService.sourceStatus || 'online',
          total_movies: nguoncTotal || 33580,
          total_pages: nguoncService.totalPages || 3359,
          indexed_movies: nguoncIndexed,
          type: 'Phim Lẻ, Phim Bộ, TV Shows, Hoạt Hình (Vietsub & Thuyết minh)'
        }
      }
    });
  } catch(err) {
    res.status(500).json({ status: false, message: 'Lỗi tải trạng thái nguồn phim' });
  }
});

// Admin: Trigger Manual Sync for Sources
router.post('/admin/sources/sync', async (req, res) => {
  try {
    console.log('[Admin] Triggering manual sync for ViCDN and NguonC...');
    await Promise.allSettled([
      vicdnService.syncCatalog(),
      nguoncService.syncCatalog()
    ]);
    const vicdnCount = (vicdnService && vicdnService.allMovies) ? vicdnService.allMovies.length : 0;
    const nguoncCount = (nguoncService && nguoncService.allMovies) ? nguoncService.allMovies.length : 0;
    res.json({
      status: true,
      message: 'Đã hoàn tất đồng bộ danh mục từ ViCDN & NguonC!',
      data: {
        vicdn_movies: vicdnCount,
        nguonc_movies: nguoncCount
      }
    });
  } catch(err) {
    res.status(500).json({ status: false, message: 'Lỗi đồng bộ nguồn phim: ' + err.message });
  }
});

// Public: Site Announcement
router.get('/settings/announcement', async (req, res) => {
  try {
    const settings = await dbService.getSettings();
    res.json({
      status: true,
      data: {
        announcement: settings ? settings.announcement : '',
        announcement_active: settings ? !!settings.announcement_active : false,
        site_title: settings ? settings.site_title : 'KKPhim'
      }
    });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi tải thông báo hệ thống' });
  }
});

// Public: Notifications List (Active Announcements + Real Movie Updates)
router.get('/notifications', async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  try {
    const settings = await dbService.getSettings();
    const notifications = [];
    let followedNotifications = [];
    if (req.user) {
      const follows = require('../services/followService');
      await follows.checkUpdates(req.user.id).catch(() => {});
      followedNotifications = await follows.getNotifications(req.user.id);
    }

    // 1. Site announcement if enabled
    if (settings && settings.announcement_active && settings.announcement) {
      notifications.push({
        id: 'notif_sys_announcement',
        type: 'system',
        badge: 'Hệ Thống',
        title: 'Thông báo từ Ban Quản Trị',
        message: settings.announcement,
        time: 'Hôm nay',
        icon: 'campaign',
        url: '/'
      });
    }

    const notificationFeeds = await Promise.allSettled([
      kkphimService.getCatalog({ type: 'chieu-rap', limit: 4 }),
      kkphimService.getCatalog({ type: 'phim-bo', limit: 2 })
    ]);
    const cinemaData = notificationFeeds[0].status === 'fulfilled' ? notificationFeeds[0].value : { items: [] };
    const boData = notificationFeeds[1].status === 'fulfilled' ? notificationFeeds[1].value : { items: [] };

    // 2. Newly updated Cinema movies
    if (cinemaData.items?.length) {
      cinemaData.items.slice(0, 3).forEach(item => notifications.push({
        id: `notif_cinema_${item.slug}`, type: 'movie', badge: 'Chiếu Rạp', title: item.name,
        message: `${item.origin_name || item.name}${item.quality ? ` · ${item.quality}` : ''}${item.lang ? ` · ${item.lang}` : ''}. Xem thông tin phim.`,
        time: 'Mới cập nhật', icon: 'theaters', thumb: item.thumb_url || item.poster_url, url: `/phim/${item.slug}`
      }));
    }

    // 3. New Series updates
    if (boData.items?.length) {
      boData.items.slice(0, 2).forEach(item => notifications.push({
        id: `notif_bo_${item.slug}`, type: 'series', badge: 'Phim Bộ', title: item.name,
        message: item.episode_current ? `Thông tin từ nguồn: ${item.episode_current}.` : 'Xem danh sách tập hiện có từ nguồn phim.',
        time: 'Danh mục phim bộ', icon: 'live_tv', thumb: item.thumb_url || item.poster_url, url: `/phim/${item.slug}`
      }));
    }


    res.json({ status: true, data: [...followedNotifications, ...notifications] });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi tải danh sách thông báo', error: err.message });
  }
});

router.get('/admin/advertising', async (req, res) => {
  res.json({ status: true, data: bannerService.getAds(await dbService.getSettings()) });
});
router.post('/admin/advertising', async (req, res) => {
  let config;
  try { config = bannerService.normalizeAds(req.body); }
  catch (error) { return res.status(400).json({ status: false, message: error.message }); }
  try {
    const data = await dbService.saveAdvertising(config, req.body.revision);
    kkphimService.clearHomeCache();
    res.json({ status: true, data });
  } catch (error) { res.status(error.status || 500).json({ status: false, message: error.status ? error.message : 'Không thể lưu quảng cáo' }); }
});

router.get('/admin/banners', async (req, res) => {
  res.json({ status: true, data: bannerService.getConfig(await dbService.getSettings()) });
});
router.post('/admin/banners', async (req, res) => {
  let config;
  try { config = bannerService.normalize(req.body); }
  catch (error) { return res.status(400).json({ status: false, message: error.message }); }
  try {
    const data = await dbService.saveBanners(config, req.body.revision);
    kkphimService.clearHomeCache();
    res.json({ status: true, data });
  } catch (error) { res.status(error.status || 500).json({ status: false, message: error.status ? error.message : 'Không thể lưu banner' }); }
});

// Public Popup Banner
router.get('/popup-banner', async (req, res) => {
  try {
    const settings = await dbService.getSettings();
    const popup = settings.popup_banner || {
      enabled: false,
      title: 'ĐẠI TIỆC SĂN DEAL SHOPEE MALL',
      description: 'Tự động tổng hợp Flash Sale khung giờ vàng, cảnh báo lỗi giá cực sốc & nhận voucher freeship 0Đ độc quyền!',
      image: '/images/banners/dealpulse-popup.png',
      href: 'https://sandeal.dealpulse.vn/',
      new_tab: true,
      cooldown_hours: 12
    };
    res.json({ status: true, data: popup });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi tải banner popup' });
  }
});

router.get('/admin/popup-banner', async (req, res) => {
  try {
    const settings = await dbService.getSettings();
    const popup = settings.popup_banner || {
      enabled: false,
      title: 'ĐẠI TIỆC SĂN DEAL SHOPEE MALL',
      description: 'Tự động tổng hợp Flash Sale khung giờ vàng, cảnh báo lỗi giá cực sốc & nhận voucher freeship 0Đ độc quyền!',
      image: '/images/banners/dealpulse-popup.png',
      href: 'https://sandeal.dealpulse.vn/',
      new_tab: true,
      cooldown_hours: 12
    };
    res.json({ status: true, data: popup });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi tải cấu hình banner popup' });
  }
});

router.post('/admin/popup-banner', async (req, res) => {
  try {
    const { enabled, title, description, image, href, new_tab, cooldown_hours } = req.body || {};
    const cleanImage = typeof image === 'string' && image.trim() ? image.trim() : '/images/banners/dealpulse-popup.png';
    const cleanHref = typeof href === 'string' && href.trim() ? href.trim() : 'https://sandeal.dealpulse.vn/';
    const popup_banner = {
      enabled: enabled === true || enabled === 'true',
      title: typeof title === 'string' ? title.trim() : 'ĐẠI TIỆC SĂN DEAL SHOPEE MALL',
      description: typeof description === 'string' ? description.trim() : '',
      image: cleanImage,
      href: cleanHref,
      new_tab: new_tab !== false && new_tab !== 'false',
      cooldown_hours: Math.max(1, Math.min(168, Number(cooldown_hours) || 12))
    };
    await dbService.updateSettings({ popup_banner });
    kkphimService.clearHomeCache();
    res.json({ status: true, message: 'Đã lưu cấu hình banner popup thành công!', data: popup_banner });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi lưu cấu hình banner popup' });
  }
});

// Admin: Get Settings
router.get('/admin/settings', async (req, res) => {
  try {
    const settings = await dbService.getSettings();
    res.json({ status: true, data: settings });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi lấy cài đặt hệ thống' });
  }
});

// Admin: Update Settings
router.post('/admin/settings', async (req, res) => {
  try {
    if (Object.hasOwn(req.body, 'banner_config') || Object.hasOwn(req.body, 'advertising')) return res.status(400).json({ status: false, message: 'Dùng trình quản lý banner để lưu cấu hình banner' });
    const updated = await dbService.updateSettings(req.body);
    kkphimService.clearHomeCache();
    res.json({ status: true, message: 'Đã lưu cài đặt hệ thống thành công!', data: updated });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi cập nhật cài đặt' });
  }
});

// Admin: Create User
router.post('/admin/users/create', async (req, res) => {
  try {
    const { email, password, name, role } = req.body;
    if (!email || !password) {
      return res.status(400).json({ status: false, message: 'Vui lòng nhập email và mật khẩu' });
    }
    const user = await dbService.createUserByAdmin({ email, password, name, role });
    res.json({ status: true, message: 'Đã tạo tài khoản người dùng thành công!', data: user });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message || 'Lỗi tạo tài khoản' });
  }
});

// Admin: Delete User
router.delete('/admin/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await dbService.deleteUser(id);
    res.json({ status: true, message: 'Đã xóa người dùng khỏi hệ thống' });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message || 'Lỗi xóa người dùng' });
  }
});

// Plaintext full-database exports are retired; use the encrypted backup tooling.
router.get('/admin/backup', (req, res) => {
  res.status(410).json({ status: false, message: 'Đã ngừng xuất database JSON. Hãy dùng công cụ sao lưu mã hóa và xác minh phục hồi.' });
});

// Admin: Search Movies for Spotlight / Pinning across supported sources
router.get('/admin/search-movie', async (req, res) => {
  try {
    const query = req.query.keyword || '';
    const requestedSource = req.query.source || 'all';
    if (!['all', 'kkphim', 'vicdn', 'nguonc'].includes(requestedSource)) {
      return res.status(400).json({ status: false, message: 'Nguồn phim không được hỗ trợ' });
    }
    if (!query || !query.trim()) {
      return res.json({ status: true, data: [] });
    }
    const trimmed = query.trim();

    const tasks = [];

    // 1. KKPhim API Search
    if (requestedSource === 'all' || requestedSource === 'kkphim') {
      tasks.push(
        kkphimService.fetchJson(`/v1/api/tim-kiem?keyword=${encodeURIComponent(trimmed)}&limit=15`)
          .then(result => {
            const cdn = result?.data?.APP_DOMAIN_CDN_IMAGE || kkphimService.cdnUrl;
            return (result?.data?.items || []).map(i => {
              const norm = kkphimService.normalizeMovieItem(i, cdn);
              return {
                ...norm,
                source: 'kkphim',
                source_name: 'KKPhim API',
                source_badge: 'KKPhim'
              };
            });
          })
          .catch(() => [])
      );
    }

    // 2. ViCDN Song Ngữ Search
    if (requestedSource === 'all' || requestedSource === 'vicdn') {
      tasks.push(
        vicdnService.searchViCdn(trimmed)
          .then(items => (items || []).map(i => ({
            ...i,
            source: 'vicdn',
            source_name: 'ViCDN Song Ngữ',
            source_badge: 'ViCDN',
            has_song_ngu: true
          })))
          .catch(() => [])
      );
    }

    // 3. NguonC API Search
    if (requestedSource === 'all' || requestedSource === 'nguonc') {
      tasks.push(
        nguoncService.searchNguonC(trimmed)
          .then(items => (items || []).map(i => ({
            ...i,
            source: 'nguonc',
            source_name: 'NguonC API',
            source_badge: 'NguonC'
          })))
          .catch(() => [])
      );
    }

    const settled = await Promise.all(tasks);
    const combined = settled.flat();

    res.json({ status: true, data: combined });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi tìm kiếm phim đa nguồn' });
  }
});

// --- Watch Party (Xem Chung) Real-Time API ---

// 1. Create room
router.post('/party/create', requireAuth, async (req, res) => {
  try {
    const { movieSlug, movieName, moviePoster, episodeSlug, episodeName, roomName, controlMode } = req.body;
    if (!movieSlug) {
      return res.status(400).json({ status: false, message: 'Thiếu thông tin phim' });
    }
    const hostId = req.user.id;
    const user = {
      id: hostId,
      name: req.user.name || 'Chủ Phòng',
      avatar: req.user.avatar || null
    };
    const room = await partyService.createRoom({
      movieSlug,
      movieName,
      moviePoster,
      episodeSlug,
      episodeName,
      user,
      roomName,
      controlMode
    });
    const hostMember = room.members?.find(m => m.id === room.hostId) || user;
    res.json({ status: true, data: room, user: hostMember });
  } catch (err) {
    res.status([429, 503].includes(err.status) ? err.status : 500).json({ status: false, message: err.message || 'Lỗi tạo phòng xem' });
  }
});

// 2. Get room info
router.get('/party/:code', async (req, res) => {
  const room = await partyService.getRoom(req.params.code);
  if (!room) {
    return res.status(404).json({ status: false, message: 'Không tìm thấy phòng xem chung hoặc phòng đã hết hạn' });
  }
  res.set('Cache-Control', 'private, no-store');
  const isMember = room.members.some(member => member.id === req.user?.id);
  const data = isMember ? partyService.getSafeRoom(room) : {
    code: room.code, name: room.name, movieSlug: room.movieSlug,
    movieName: room.movieName, moviePoster: room.moviePoster,
    episodeSlug: room.episodeSlug, episodeName: room.episodeName,
    memberCount: room.members.length
  };
  res.json({ status: true, data });
});

// 3. Join room
router.post('/party/:code/join', requireAuth, async (req, res) => {
  try {
    const user = {
      id: req.user.id,
      name: req.user.name || 'Khán giả CineViet',
      avatar: req.user.avatar || null
    };
    const result = await partyService.joinRoom(req.params.code, user);
    res.json({ status: true, data: result.room, user: result.user });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message || 'Không thể tham gia phòng' });
  }
});

// 4. Leave room
router.post('/party/:code/leave', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    await partyService.leaveRoom(req.params.code, userId);
    res.json({ status: true, message: 'Đã rời phòng' });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
});

// 5. Synchronize player action
router.post('/party/:code/sync', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { action, currentTime, episodeSlug, episodeName } = req.body;
    const result = await partyService.syncPlayer(req.params.code, userId, { action, currentTime, episodeSlug, episodeName });
    res.json({ status: true, data: result });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
});

// 6. Send live party chat
router.post('/party/:code/chat', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { content } = req.body;
    const userName = req.user.name || 'Khán giả CineViet';
    const avatar = req.user.avatar || null;
    const message = await partyService.sendChat(req.params.code, userId, { content, userName, avatar });
    res.json({ status: true, data: message });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
});

// 7. Send floating emoji reaction
router.post('/party/:code/reaction', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { emoji } = req.body;
    const userName = req.user.name || 'Khán giả CineViet';
    const reaction = await partyService.sendReaction(req.params.code, userId, { emoji, userName });
    res.json({ status: true, data: reaction });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
});

// 8. Server-Sent Events (SSE) Stream
router.get('/party/:code/stream', requireAuth, async (req, res) => {
  await partyService.registerStream(req.params.code, req.user.id, res, req);
});

// ==========================================
// PERSON (ACTOR & DIRECTOR) ENDPOINTS
// ==========================================
router.get('/person/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const type = req.query.type || 'actor';
    const data = await personService.getPersonDetail(name, type);
    res.json({ status: true, data });
  } catch (err) {
    res.status(404).json({ status: false, message: 'Không tìm thấy thông tin nhân vật', error: err.message });
  }
});

router.get('/person/avatar/:name', (req, res) => {
  const avatarUrl = personService.getAvatar(req.params.name);
  res.redirect(avatarUrl);
});

// ==========================================
// ANDROID TV QR & CODE AUTHENTICATION
// ==========================================
// 1. TV client requests a new QR login session
router.post('/auth/tv/session', async (req, res) => {
  try {
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = config.PUBLIC_ORIGIN || `${protocol}://${host}`;
    const session = await tvAuthService.createSession(baseUrl);
    res.json({ status: true, data: session });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi khởi tạo phiên TV', error: err.message });
  }
});

// 2. TV client polls status of its QR session
router.get('/auth/tv/status', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ status: false, message: 'Thiếu token phiên TV' });
    const result = await tvAuthService.getStatus(token);
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Lỗi kiểm tra trạng thái TV' });
  }
});

// 3. Logged-in Mobile or Web user authorizes the TV session
router.post('/auth/tv/authorize', requireAuth, async (req, res) => {
  try {
    const { token, code } = req.body;
    const identifier = token || code;
    if (!identifier) return res.status(400).json({ status: false, message: 'Vui lòng cung cấp mã QR hoặc mã kích hoạt 6 số' });

    const result = await tvAuthService.authorize(identifier, req.user);
    if (!result.success) {
      return res.status(400).json({ status: false, message: result.message });
    }

    res.json({ status: true, message: result.message, code: result.code });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi xác thực TV', error: err.message });
  }
});

module.exports = router;



