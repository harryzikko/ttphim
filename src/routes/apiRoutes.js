const express = require('express');
const router = express.Router();
const kkphimService = require('../services/kkphimService');
const vicdnService = require('../services/vicdnService');
const nguoncService = require('../services/nguoncService');
const dbService = require('../services/dbService');
const partyService = require('../services/partyService');
const personService = require('../services/personService');
const tmdbService = require('../services/tmdbService');
const tvAuthService = require('../services/tvAuthService');
const { authMiddleware, requireAuth, requireAdmin, generateToken } = require('../services/authService');

router.use(authMiddleware);

// --- Public Movie Endpoints ---

// Health Check
router.get('/health', (req, res) => {
  res.json({ status: true, message: 'KKPhim API is running', timestamp: new Date().toISOString() });
});

// Home Page Aggregated Feed
router.get('/home', async (req, res) => {
  try {
    const data = await kkphimService.getHomeData();
    res.json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi tải dữ liệu trang chủ', error: err.message });
  }
});

// Movie Details & Episodes
router.get('/movies/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    // Increment real local view count
    dbService.incrementMovieView(slug).catch(() => {});

    const data = await kkphimService.getMovieDetail(slug);
    
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
    res.status(404).json({ status: false, message: 'Không tìm thấy thông tin phim', error: err.message });
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

// Rate Movie / Episode
router.post('/movies/:slug/rate', async (req, res) => {
  try {
    const { slug } = req.params;
    const { score, episode_slug } = req.body;
    const numScore = parseFloat(score) || 5;
    const rating = await dbService.addRating({
      movie_slug: slug,
      episode_slug,
      score: numScore,
      user_id: req.user ? req.user.id : 'khach_an_danh'
    });
    res.json({ status: true, message: 'Đã gửi đánh giá thành công! Cảm ơn bạn.', data: rating });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi ghi nhận đánh giá' });
  }
});

// Catalog / Filter / Search
router.get('/catalog', async (req, res) => {
  try {
    const { type, category, country, year, sort, page, keyword, limit } = req.query;
    const data = await kkphimService.getCatalog({ type, category, country, year, sort, page, keyword, limit });
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
    const { slug } = req.params;
    const comments = await dbService.getComments(slug);
    res.json({ status: true, data: comments });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi tải bình luận' });
  }
});

router.post('/comments/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { content, timestamp_tag, rating, is_spoil, user_name } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ status: false, message: 'Nội dung bình luận không được rỗng' });
    }

    const userName = req.user ? req.user.name : (user_name || 'Khán giả KKPhim');
    const userAvatar = req.user ? req.user.avatar : null;
    const isVip = false;

    const newComment = await dbService.addComment({
      movieSlug: slug,
      userName,
      userAvatar,
      isVip,
      content,
      timestampTag: timestamp_tag,
      rating: rating || 5,
      isSpoil: Boolean(is_spoil)
    });

    res.json({ status: true, data: newComment });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi đăng bình luận' });
  }
});

router.post('/comments/:id/reply', async (req, res) => {
  try {
    const { id } = req.params;
    const { content, user_name } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ status: false, message: 'Nội dung phản hồi không được để trống' });
    }
    const userName = req.user ? req.user.name : (user_name || 'Khán giả KKPhim');
    const userAvatar = req.user ? req.user.avatar : null;

    const reply = await dbService.addReply(id, { userName, userAvatar, content });
    if (!reply) {
      return res.status(404).json({ status: false, message: 'Không tìm thấy bình luận để phản hồi' });
    }
    res.json({ status: true, data: reply });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi gửi phản hồi' });
  }
});

router.post('/comments/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body || {};
    const likes = await dbService.likeComment(id, action || 'like');
    res.json({ status: true, data: { likes } });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi thích bình luận' });
  }
});

// --- Authentication Endpoints ---

router.post('/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ status: false, message: 'Vui lòng cung cấp email và mật khẩu' });
    }

    const existing = await dbService.findUserByEmail(email);
    if (existing) {
      return res.status(400).json({ status: false, message: 'Email này đã được sử dụng' });
    }

    const user = await dbService.createUser({ email, password, name });
    const token = generateToken(user);

    res.cookie('token', token, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ status: true, message: 'Đăng ký thành công', data: { user, token } });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi đăng ký tài khoản' });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ status: false, message: 'Vui lòng điền đầy đủ email và mật khẩu' });
    }

    const user = await dbService.findUserByEmail(email);
    if (!user || user.password !== password) {
      return res.status(400).json({ status: false, message: 'Email hoặc mật khẩu không chính xác' });
    }

    const token = generateToken(user);
    res.cookie('token', token, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ status: true, message: 'Đăng nhập thành công', data: { user, token } });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi đăng nhập' });
  }
});

router.get('/auth/me', (req, res) => {
  if (req.user) {
    return res.json({ status: true, data: req.user });
  }
  // Return null or unauthenticated state
  res.json({ status: false, data: null });
});

router.post('/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ status: true, message: 'Đã đăng xuất' });
});

// --- User Library (Watchlist, History, Continue-Watching) ---

router.get('/user/library', async (req, res) => {
  try {
    // If user is not logged in, use demo user or return empty
    const userId = req.user ? req.user.id : 'usr_demo_01';
    const [watchlist, history] = await Promise.all([
      dbService.getWatchlist(userId),
      dbService.getHistory(userId)
    ]);

    const continueWatching = history.filter(h => (h.progress_percent || 0) < 95);

    const enrichSongNgu = (items) => (items || []).map(item => ({
      ...item,
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
    const userId = req.user ? req.user.id : 'usr_demo_01';
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
    const userId = req.user ? req.user.id : 'usr_demo_01';
    const { movie_slug } = req.body;
    await dbService.removeFromWatchlist(userId, movie_slug);
    res.json({ status: true, message: 'Đã xóa khỏi danh sách yêu thích' });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi xóa khỏi danh sách yêu thích' });
  }
});

router.post('/user/history', async (req, res) => {
  try {
    const userId = req.user ? req.user.id : 'usr_demo_01';
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

router.post('/user/history/clear', async (req, res) => {
  try {
    const userId = req.user ? req.user.id : 'usr_demo_01';
    await dbService.clearHistory(userId);
    res.json({ status: true, message: 'Đã xóa toàn bộ lịch sử xem' });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi xóa lịch sử' });
  }
});

router.post('/user/history/remove', async (req, res) => {
  try {
    const userId = req.user ? req.user.id : 'usr_demo_01';
    const { movie_slug } = req.body;
    if (!movie_slug) {
      return res.status(400).json({ status: false, message: 'Thiếu slug phim' });
    }
    await dbService.removeFromHistory(userId, movie_slug);
    res.json({ status: true, message: 'Đã xóa phim khỏi danh sách tiếp tục xem' });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi xóa lịch sử phim' });
  }
});



// Movie Star Rating
router.post('/movies/:slug/rate', async (req, res) => {
  try {
    const { slug } = req.params;
    const { score } = req.body;
    const userId = req.user ? req.user.id : 'usr_demo_01';
    const result = await dbService.rateMovie(userId, slug, parseInt(score, 10) || 5);
    res.json({ status: true, message: 'Đã gửi đánh giá sao thành công!', data: result });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi đánh giá phim' });
  }
});

// Movie Issue Report
router.post('/movies/:slug/report', async (req, res) => {
  try {
    const { slug } = req.params;
    const { episode_slug, reason } = req.body;
    const userEmail = req.user ? req.user.email : 'guest';
    const report = await dbService.reportError({
      movieSlug: slug,
      episodeSlug: episode_slug,
      reason,
      userEmail
    });
    res.json({ status: true, message: 'Báo cáo lỗi đã được tiếp nhận!', data: report });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi gửi báo cáo' });
  }
});

// Change Password
router.post('/user/password', async (req, res) => {
  try {
    const userId = req.user ? req.user.id : 'usr_demo_01';
    const { old_password, new_password } = req.body;
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ status: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }
    const result = await dbService.changePassword(userId, old_password, new_password);
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi thay đổi mật khẩu' });
  }
});

// Batch remove watchlist
router.post('/user/watchlist/batch-remove', async (req, res) => {
  try {
    const userId = req.user ? req.user.id : 'usr_demo_01';
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
    const userId = req.user ? req.user.id : 'usr_test_02';
    const { name, avatar } = req.body;
    const updated = await dbService.updateUser(userId, {
      ...(name && { name: name.trim() }),
      ...(avatar && { avatar: avatar.trim() })
    });
    res.json({ status: true, message: 'Cập nhật thông tin thành công!', data: updated });
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
      nguoncService.getTotalMovies ? nguoncService.getTotalMovies() : 33450
    ]);
    stats.totalWebMovies = kkphimTotal || 30275;
    stats.totalAllSources = (kkphimTotal || 30275) + (vicdnTotal || 628) + (nguoncTotal || 33450);
    stats.sourceCounts = {
      kkphim: kkphimTotal || 30275,
      vicdn: vicdnTotal || 628,
      nguonc: nguoncTotal || 33450
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
    res.json({ status: true, message: 'Đã cập nhật tài khoản người dùng', data: updated });
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
      nguoncService.getTotalMovies ? nguoncService.getTotalMovies() : 33450
    ]);
    const vicdnIndexed = (vicdnService && vicdnService.allMovies) ? vicdnService.allMovies.length : 0;
    const nguoncIndexed = (nguoncService && nguoncService.recentMovies) ? nguoncService.recentMovies.length : 0;

    const totalWebMovies = kkphimTotal || 30275;
    const totalAllSources = totalWebMovies + (vicdnTotal || 628) + (nguoncTotal || 33450);

    res.json({
      status: true,
      data: {
        total_web_movies: totalWebMovies,
        total_all_sources: totalAllSources,
        kkphim: {
          name: 'KKPhim API (Phimapi)',
          endpoint: 'https://phimapi.com',
          status: 'online',
          total_movies: totalWebMovies,
          total_pages: kkphimService.totalPages || 1262,
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
          name: 'NguonC (Server Dự Phòng VIP)',
          endpoint: 'https://phim.nguonc.com',
          status: 'online',
          total_movies: nguoncTotal || 33450,
          total_pages: nguoncService.totalPages || 3345,
          indexed_movies: nguoncIndexed,
          type: 'Embed player HD, Vietsub & Thuyết minh'
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
      message: 'Đã hoàn tất đồng bộ danh mục từ ViCDN và NguonC!',
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
  try {
    const settings = await dbService.getSettings();
    const notifications = [];

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

    // 2. Newly updated Cinema movies
    try {
      const cinemaData = await kkphimService.getCatalog({ type: 'chieu-rap', limit: 4 });
      if (cinemaData && cinemaData.items && cinemaData.items.length > 0) {
        cinemaData.items.slice(0, 3).forEach(item => {
          notifications.push({
            id: `notif_cinema_${item.slug}`,
            type: 'movie',
            badge: 'Chiếu Rạp',
            title: item.name,
            message: `${item.origin_name || item.name} - Đã có bản ${item.quality || 'FHD'} ${item.lang || 'Vietsub'}. Thưởng thức ngay!`,
            time: 'Mới cập nhật',
            icon: 'theaters',
            thumb: item.thumb_url || item.poster_url,
            url: `/phim/${item.slug}`
          });
        });
      }
    } catch (e) {
      console.error('Error fetching cinema notifications:', e.message);
    }

    // 3. New Series updates
    try {
      const boData = await kkphimService.getCatalog({ type: 'phim-bo', limit: 2 });
      if (boData && boData.items && boData.items.length > 0) {
        boData.items.slice(0, 2).forEach(item => {
          notifications.push({
            id: `notif_bo_${item.slug}`,
            type: 'series',
            badge: 'Phim Bộ',
            title: item.name,
            message: `Tập mới nhất đã được cập nhật bản nét căng Vietsub. Xem ngay!`,
            time: 'Hôm qua',
            icon: 'live_tv',
            thumb: item.thumb_url || item.poster_url,
            url: `/phim/${item.slug}`
          });
        });
      }
    } catch (e) {
      console.error('Error fetching series notifications:', e.message);
    }

    // 4. Feature highlight
    notifications.push({
      id: 'notif_feature_cinema_free',
      type: 'feature',
      badge: 'Tính Năng',
      title: 'Trải nghiệm xem phim 4K miễn phí',
      message: 'Tất cả phim trên KKPhim hỗ trợ độ phân giải cao và âm thanh sống động hoàn toàn không quảng cáo.',
      time: '3 ngày trước',
      icon: 'verified',
      url: '/kham-pha'
    });

    res.json({ status: true, data: notifications });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi tải danh sách thông báo', error: err.message });
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

// Admin: Backup Database (Download JSON)
router.get('/admin/backup', async (req, res) => {
  try {
    const data = await dbService.getRawDatabase();
    res.setHeader('Content-Disposition', 'attachment; filename=kkphim-backup-' + Date.now() + '.json');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi xuất dữ liệu sao lưu' });
  }
});

// Admin: Search Movies for Spotlight / Pinning (from ALL 3 sources)
router.get('/admin/search-movie', async (req, res) => {
  try {
    const query = req.query.keyword || '';
    const requestedSource = req.query.source || 'all';
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
                source_name: 'KKPhim Core',
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

    // 3. NguonC Stream VIP Search
    if (requestedSource === 'all' || requestedSource === 'nguonc') {
      tasks.push(
        nguoncService.search(trimmed)
          .then(items => (items || []).map(i => ({
            ...i,
            source: 'nguonc',
            source_name: 'NguonC Stream VIP',
            source_badge: 'NguonC',
            has_song_ngu: Boolean(vicdnService.hasBilingualMatch(i))
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
router.post('/party/create', (req, res) => {
  try {
    const { movieSlug, movieName, moviePoster, episodeSlug, episodeName, roomName, controlMode, userName, avatar, userId } = req.body;
    if (!movieSlug) {
      return res.status(400).json({ status: false, message: 'Thiếu thông tin phim' });
    }
    const hostId = req.user?.id || userId || `user_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const user = {
      id: hostId,
      name: req.user?.name || userName || 'Chủ Phòng',
      avatar: req.user?.avatar || avatar
    };
    const room = partyService.createRoom({
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
    res.status(500).json({ status: false, message: err.message || 'Lỗi tạo phòng xem' });
  }
});

// 2. Get room info
router.get('/party/:code', (req, res) => {
  const room = partyService.getRoom(req.params.code);
  if (!room) {
    return res.status(404).json({ status: false, message: 'Không tìm thấy phòng xem chung hoặc phòng đã hết hạn' });
  }
  res.json({ status: true, data: partyService.getSafeRoom(room) });
});

// 3. Join room
router.post('/party/:code/join', (req, res) => {
  try {
    const { userId, userName, avatar } = req.body;
    const user = {
      id: req.user?.id || userId,
      name: req.user?.name || userName,
      avatar: req.user?.avatar || avatar
    };
    const result = partyService.joinRoom(req.params.code, user);
    res.json({ status: true, data: result.room, user: result.user });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message || 'Không thể tham gia phòng' });
  }
});

// 4. Leave room
router.post('/party/:code/leave', (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;
    partyService.leaveRoom(req.params.code, userId);
    res.json({ status: true, message: 'Đã rời phòng' });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
});

// 5. Synchronize player action
router.post('/party/:code/sync', (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;
    const { action, currentTime, episodeSlug, episodeName } = req.body;
    const result = partyService.syncPlayer(req.params.code, userId, { action, currentTime, episodeSlug, episodeName });
    res.json({ status: true, data: result });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
});

// 6. Send live party chat
router.post('/party/:code/chat', (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;
    const { content, userName, avatar } = req.body;
    const message = partyService.sendChat(req.params.code, userId, { content, userName, avatar });
    res.json({ status: true, data: message });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
});

// 7. Send floating emoji reaction
router.post('/party/:code/reaction', (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;
    const { emoji, userName } = req.body;
    const reaction = partyService.sendReaction(req.params.code, userId, { emoji, userName });
    res.json({ status: true, data: reaction });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
});

// 8. Server-Sent Events (SSE) Stream
router.get('/party/:code/stream', (req, res) => {
  const userId = req.query.userId || req.user?.id || `user_guest_${Date.now()}`;
  partyService.registerStream(req.params.code, userId, res, req);
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
router.post('/auth/tv/session', (req, res) => {
  try {
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;
    const session = tvAuthService.createSession(baseUrl);
    res.json({ status: true, data: session });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi khởi tạo phiên TV', error: err.message });
  }
});

// 2. TV client polls status of its QR session
router.get('/auth/tv/status', (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ status: false, message: 'Thiếu token phiên TV' });
    const result = tvAuthService.getStatus(token);
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Lỗi kiểm tra trạng thái TV' });
  }
});

// 3. Logged-in Mobile or Web user authorizes the TV session
router.post('/auth/tv/authorize', (req, res) => {
  try {
    const { token, code, user: bodyUser } = req.body;
    const identifier = token || code;
    if (!identifier) return res.status(400).json({ status: false, message: 'Vui lòng cung cấp mã QR hoặc mã kích hoạt 6 số' });

    const authUser = req.user || bodyUser || {
      id: 'usr_vip_' + Math.random().toString(36).substring(2, 9),
      name: bodyUser?.name || 'Thành Viên VIP',
      email: bodyUser?.email || 'member@ttphim.vn',
      role: 'member'
    };

    const result = tvAuthService.authorize(identifier, authUser);
    if (!result.success) {
      return res.status(400).json({ status: false, message: result.message });
    }

    res.json({ status: true, message: result.message, code: result.code });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Lỗi xác thực TV', error: err.message });
  }
});

module.exports = router;



