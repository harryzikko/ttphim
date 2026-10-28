const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config');
const kkphimService = require('../services/kkphimService');
const templateService = require('../services/templateService');
const tmdbService = require('../services/tmdbService');
const dbService = require('../services/dbService');
const { renderHomePage } = require('../services/homePageService');
const bannerService = require('../services/bannerService');
const router = express.Router();

const publicFile = (file) => path.join(config.PUBLIC_DIR, file);
const mobileFile = (file) => path.join(config.PUBLIC_DIR, 'mobile', file);
const tvFile = (file) => path.join(config.PUBLIC_DIR, 'tv', file);

const { sendPageError, episodeExists } = require('../services/pageError');
const seo = require('../services/seoService');
router.use(seo.middleware(config.PUBLIC_ORIGIN));
const sendView = file => async (req, res, next) => {
  try { res.send(await fs.readFile(file, 'utf8')); } catch (error) { next(error); }
};
router.get('/robots.txt', (req, res) => {
  const origin = seo.originOf(config.PUBLIC_ORIGIN);
  res.type('text').send(`User-agent: *\nDisallow: /api/\nDisallow: /admin\nDisallow: /quan-tri\nDisallow: /operations\nDisallow: /tai-khoan\nDisallow: /danh-sach\nDisallow: /auth\n${origin ? `Sitemap: ${origin}/sitemap.xml\n` : ''}`);
});
router.get('/sitemap.xml', async (req, res) => {
  if (!seo.originOf(config.PUBLIC_ORIGIN)) return res.status(503).set('Retry-After', '300').type('text').send('Configure PUBLIC_ORIGIN to publish the sitemap.');
  try {
    const home = await kkphimService.getHomeData();
    const slugs = Object.values(home || {}).flatMap(value => Array.isArray(value) ? value : []).filter(item => item && typeof item.slug === 'string').map(item => item.slug);
    res.type('application/xml').set('Cache-Control', 'public, max-age=300').send(seo.sitemap(config.PUBLIC_ORIGIN, slugs));
  } catch (_) { res.type('application/xml').send(seo.sitemap(config.PUBLIC_ORIGIN)); }
});
// 1. View Preference & Auto-detection Middleware
router.use((req, res, next) => {
  // If user requested explicit view mode, persist into cookie
  if (req.query.view === 'desktop') {
    res.cookie('kkphim_view_preference', 'desktop', { maxAge: 86400000 * 30, path: '/' });
  } else if (req.query.view === 'mobile') {
    res.cookie('kkphim_view_preference', 'mobile', { maxAge: 86400000 * 30, path: '/' });
  }

  // Check if request is for static asset or API or already in /mobile or /tv
  if (req.path.startsWith('/mobile') || req.path.startsWith('/tv') || req.path.startsWith('/api') || req.path.includes('.')) {
    return next();
  }

  // Detect Mobile User-Agent (iOS & Android)
  const viewPref = req.query.view || req.cookies?.kkphim_view_preference;
  if (viewPref === 'desktop') {
    return next();
  }

  const ua = req.headers['user-agent'] || '';
  const isMobile = viewPref === 'mobile' || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

  if (isMobile) {
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    if (req.path === '/') return res.redirect('/mobile' + query);
    if (req.path === '/kham-pha') {
      const q = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
      return res.redirect('/mobile/kham-pha' + q);
    }
    if (req.path.startsWith('/phim/')) return res.redirect('/mobile' + req.path + query);
    if (req.path.startsWith('/xem-phim/')) return res.redirect('/mobile' + req.path + query);
    if (req.path === '/danh-sach' || req.path === '/danh-sach-cua-toi') return res.redirect('/mobile/danh-sach' + query);
    if (req.path === '/tai-khoan') return res.redirect('/mobile/tai-khoan' + query);
  }

  next();
});

// ==========================================
// MOBILE APP ROUTES (Obsidian Cinema Mobile)
// ==========================================
router.get(['/mobile', '/mobile/', '/mobile/index.html'], async (req, res) => {
  const [html, settings] = await Promise.all([fs.readFile(mobileFile('index.html'), 'utf8'), dbService.getSettings()]);
  res.set('Cache-Control', 'private, no-cache');
  res.send(bannerService.decorate(html, settings, true));
});
router.get('/mobile/kham-pha', async (req, res, next) => {
  try {
    const rawHtml = await fs.readFile(mobileFile('kham-pha.html'), 'utf8');
    const settings = await dbService.getSettings();
    res.send(bannerService.decorate(rawHtml, settings, true));
  } catch (err) { next(err); }
});
router.get('/mobile/phim/:slug', async (req, res) => {
  try {
    const data = await kkphimService.getMovieDetail(req.params.slug);
    if (!data?.movie) return sendPageError(res, { status: 404 });
    res.locals.seoMovie = data.movie;
    const [html, settings] = await Promise.all([fs.readFile(mobileFile('chi-tiet.html'), 'utf8'), dbService.getSettings()]);
    res.send(bannerService.decorate(html, settings, true));
  } catch (error) { sendPageError(res, error); }
});
async function mobileWatch(req, res) {
  try {
    if (req.params.slug) {
      const data = await kkphimService.getMovieDetail(req.params.slug);
      if (!data?.movie || !episodeExists(data, req.params.episode, req.query.server)) return sendPageError(res, { status: 404 });
      res.locals.seoMovie = data.movie;
    }
    const [html, settings] = await Promise.all([fs.readFile(mobileFile('xem-phim.html'), 'utf8'), dbService.getSettings()]);
    res.set('Cache-Control', 'private, no-cache');
    res.send(bannerService.decorate(html, settings, true));
  } catch (error) { sendPageError(res, error); }
}
router.get(['/mobile/xem-phim.html', '/mobile/xem-phim/:slug', '/mobile/xem-phim/:slug/:episode'], mobileWatch);
router.get('/mobile/danh-sach', async (req, res, next) => {
  try {
    const rawHtml = await fs.readFile(mobileFile('danh-sach.html'), 'utf8');
    const settings = await dbService.getSettings();
    res.send(bannerService.decorate(rawHtml, settings, true));
  } catch (err) { next(err); }
});
router.get('/mobile/tai-khoan', async (req, res, next) => {
  try {
    const rawHtml = await fs.readFile(mobileFile('tai-khoan.html'), 'utf8');
    const settings = await dbService.getSettings();
    res.send(bannerService.decorate(rawHtml, settings, true));
  } catch (err) { next(err); }
});

// ==========================================
// ANDROID TV LEANBACK 10-FOOT ROUTES
// ==========================================
router.get(['/tv', '/tv/'], (req, res) => res.sendFile(tvFile('index.html')));
router.get('/tv/chi-tiet/:slug', (req, res) => res.sendFile(tvFile('chi-tiet.html')));
router.get('/tv/xem-phim/:slug', (req, res) => res.sendFile(tvFile('xem-phim.html')));
router.get('/tv/tim-kiem', (req, res) => res.sendFile(tvFile('tim-kiem.html')));
router.get(['/tv/dang-nhap', '/tv/qr-login'], (req, res) => res.sendFile(tvFile('dang-nhap.html')));

// ==========================================
// DESKTOP ROUTES
// ==========================================

// Home Page with Server-Side Hydration of real KKPhim data
router.get('/', async (req, res) => {
  try {
    const [homeData, settings] = await Promise.all([kkphimService.getHomeData(), dbService.getSettings()]);
    const rendered = await renderHomePage(homeData, settings);
    res.set('Cache-Control', 'private, no-cache');
    res.send(rendered);
  } catch (err) {
    console.error('Error rendering home view:', err);
    res.sendFile(publicFile('index.html'));
  }
});

// Search is hydrated by the escaped catalog controller, never raw provider/query HTML.
router.get('/kham-pha', async (req, res, next) => {
  try {
    const rawHtml = await fs.readFile(publicFile('kham-pha.html'), 'utf8');
    let shell = rawHtml
      .replace(/(<section aria-label="Danh sách phim tìm kiếm"[^>]*>)[\s\S]*?(<\/section>)/, (_, open, close) => `${open}<p class="col-span-full py-10 text-center" role="status">Đang tải kết quả tìm kiếm...</p><noscript>Vui lòng bật JavaScript để tìm kiếm và lọc phim.</noscript>${close}`)
      .replace(/(<nav id="catalog-pagination"[^>]*>)[\s\S]*?(<\/nav>)/, (_, open, close) => `${open}${close}`)
      .replace(/Hiển thị <span class="text-on-surface font-bold">[^<]*<\/span> trên tổng số <span class="text-primary font-bold">[^<]*<\/span> phim/, 'Đang tải kết quả...<span class="text-primary" hidden></span>')
      .replace(/<span>Hơn <strong class="text-on-surface font-semibold">[^<]*<\/strong>[^<]*<\/span>/, '<span>Tra cứu phim theo tên tiếng Việt, tên gốc và bộ lọc.</span>');
    try {
      if (typeof dbService?.getSettings === 'function' && typeof bannerService?.decorate === 'function') {
        const settings = await dbService.getSettings();
        shell = bannerService.decorate(shell, settings);
      }
    } catch (_) {}
    res.send(shell);
  } catch (err) {
    next(err);
  }
});

// Movie Details with Server-Side Hydration
router.get('/phim/:slug', async (req, res) => {
  try {
    const rawHtml = await fs.readFile(publicFile('chi-tiet.html'), 'utf8');
    // Invalid slugs must not create view counters.
    const movieData = await kkphimService.getMovieDetail(req.params.slug);
    if (!movieData?.movie) return sendPageError(res, { status: 404 });
    res.locals.seoMovie = movieData.movie;
    dbService.incrementMovieView(req.params.slug).catch(() => {});
    
    // Enrich with accurate TMDb / IMDb credits
    try {
      const credits = await tmdbService.getMovieCredits(movieData.movie);
      movieData.movie.credits = credits;
      if (credits.cast && credits.cast.length > 0) {
        movieData.movie.tmdb_cast = credits.cast;
      }
      if (credits.directors && credits.directors.length > 0) {
        movieData.movie.tmdb_directors = credits.directors;
      }
    } catch (_) {}

    const comments = await dbService.getComments(req.params.slug).catch(() => []);
    const rendered = templateService.renderDetail(rawHtml, movieData, comments);
    res.send(bannerService.decorate(rendered, await dbService.getSettings()));
  } catch (err) {
    console.error('Error rendering detail view:', err);
    sendPageError(res, err);
  }
});

// Watch Movie Player with Server-Side Hydration
async function readWatchTemplate() {
  return fs.readFile(publicFile('xem-phim.html'), 'utf8').then(html => html.replace('<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>', ''));
}
async function decorateWatch(html) {
  return bannerService.decorate(html, await dbService.getSettings());
}
router.get('/xem-phim.html', async (req, res) => res.send(await decorateWatch(await readWatchTemplate())));
async function handleWatchView(req, res) {
  try {
    const rawHtml = await readWatchTemplate();
    const slug = req.params.slug;
    const epSlug = req.params.episode;
    const serverParam = req.query.server;
    const requestedServerIdx = (serverParam !== undefined && !isNaN(parseInt(serverParam, 10))) ? parseInt(serverParam, 10) : undefined;
    // Verify the requested movie and episode before rendering or counting a view.
    const [movieData, comments] = await Promise.all([
      kkphimService.getMovieDetail(slug),
      dbService.getComments(slug)
    ]);

    if (!movieData?.movie || !episodeExists(movieData, epSlug, serverParam)) return sendPageError(res, { status: 404 });
    res.locals.seoMovie = movieData.movie;
    dbService.incrementMovieView(slug).catch(() => {});

    // Enrich with accurate TMDb / IMDb credits
    try {
      const credits = await tmdbService.getMovieCredits(movieData.movie);
      movieData.movie.credits = credits;
      if (credits.cast && credits.cast.length > 0) {
        movieData.movie.tmdb_cast = credits.cast;
      }
      if (credits.directors && credits.directors.length > 0) {
        movieData.movie.tmdb_directors = credits.directors;
      }
    } catch (_) {}

    const rendered = templateService.renderWatch(rawHtml, movieData, epSlug, comments, requestedServerIdx);
    res.send(await decorateWatch(rendered));
  } catch (err) {
    console.error('Error rendering watch view:', err);
    sendPageError(res, err);
  }
}

router.get('/xem-phim/:slug', handleWatchView);
router.get('/xem-phim/:slug/:episode', handleWatchView);

// Direct category shortcuts
router.get('/phim-bo', (req, res) => res.redirect('/kham-pha?type=phim-bo'));
router.get('/phim-le', (req, res) => res.redirect('/kham-pha?type=phim-le'));
router.get('/hoat-hinh', (req, res) => res.redirect('/kham-pha?type=hoat-hinh'));
router.get('/tv-shows', (req, res) => res.redirect('/kham-pha?type=tv-shows'));
router.get('/chieu-rap', (req, res) => res.redirect('/kham-pha?type=chieu-rap'));
router.get('/phim-chieu-rap', (req, res) => res.redirect('/kham-pha?type=chieu-rap'));
router.get('/the-loai', (req, res) => res.redirect('/kham-pha'));
router.get('/the-loai/:slug', (req, res) => res.redirect(`/kham-pha?category=${req.params.slug}`));
router.get('/quoc-gia', (req, res) => res.redirect('/kham-pha'));
router.get('/quoc-gia/:slug', (req, res) => res.redirect(`/kham-pha?country=${req.params.slug}`));
router.get('/bang-xep-hang', (req, res) => res.redirect('/#bang-xep-hang'));

// Public information pages are static and available in every device/view mode.
for (const slug of ['gioi-thieu', 'tro-giup', 'lien-he', 'dieu-khoan', 'quyen-rieng-tu', 'ban-quyen']) {
  router.get(`/${slug}`, async (req, res, next) => {
    try {
      const rawHtml = await fs.readFile(publicFile(`${slug}.html`), 'utf8');
      const settings = await dbService.getSettings();
      res.send(bannerService.decorate(rawHtml, settings));
    } catch (err) { next(err); }
  });
}

// Library & Account
router.get(['/danh-sach', '/tu-phim', '/danh-sach-cua-toi'], async (req, res, next) => {
  try {
    const rawHtml = await fs.readFile(publicFile('danh-sach.html'), 'utf8');
    const settings = await dbService.getSettings();
    res.send(bannerService.decorate(rawHtml, settings));
  } catch (err) { next(err); }
});
router.get('/dang-nhap', (req, res) => res.sendFile(publicFile('auth.html')));
router.get('/dang-ky', (req, res) => res.sendFile(publicFile('auth.html')));
router.get('/auth', (req, res) => res.sendFile(publicFile('auth.html')));
router.get('/tai-khoan', async (req, res, next) => {
  try {
    const rawHtml = await fs.readFile(publicFile('tai-khoan.html'), 'utf8');
    const settings = await dbService.getSettings();
    res.send(bannerService.decorate(rawHtml, settings));
  } catch (err) { next(err); }
});
router.get(['/admin', '/quan-tri'], (req, res) => res.sendFile(publicFile('admin.html')));

// Actor & Director Profile Pages
router.get(['/dien-vien', '/dien-vien/:name', '/dao-dien', '/dao-dien/:name', '/nghe-si/:name'], async (req, res, next) => {
  try {
    const rawHtml = await fs.readFile(publicFile('dien-vien.html'), 'utf8');
    const settings = await dbService.getSettings();
    res.send(bannerService.decorate(rawHtml, settings));
  } catch (err) { next(err); }
});

// TV QR Code Mobile Authorization Page
router.get(['/tv-auth', '/tv-login', '/tv-dang-nhap'], (req, res) => {
  res.sendFile(publicFile('tv-auth.html'));
});

// Favicon
router.get(['/favicon.ico', '/favicon.svg'], (req, res) => res.type('image/svg+xml').sendFile(publicFile('favicon.svg')));

module.exports = router;
