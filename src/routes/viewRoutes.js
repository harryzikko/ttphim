const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config');
const kkphimService = require('../services/kkphimService');
const templateService = require('../services/templateService');
const dbService = require('../services/dbService');
const router = express.Router();

const publicFile = (file) => path.join(config.PUBLIC_DIR, file);
const mobileFile = (file) => path.join(config.PUBLIC_DIR, 'mobile', file);

// 1. View Preference & Auto-detection Middleware
router.use((req, res, next) => {
  // If user requested explicit view mode, persist into cookie
  if (req.query.view === 'desktop') {
    res.cookie('kkphim_view_preference', 'desktop', { maxAge: 86400000 * 30, path: '/' });
  } else if (req.query.view === 'mobile') {
    res.cookie('kkphim_view_preference', 'mobile', { maxAge: 86400000 * 30, path: '/' });
  }

  // Check if request is for static asset or API or already in /mobile
  if (req.path.startsWith('/mobile') || req.path.startsWith('/api') || req.path.includes('.')) {
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
    if (req.path === '/') return res.redirect('/mobile');
    if (req.path === '/kham-pha') {
      const q = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
      return res.redirect('/mobile/kham-pha' + q);
    }
    if (req.path.startsWith('/phim/')) return res.redirect('/mobile' + req.path);
    if (req.path.startsWith('/xem-phim/')) return res.redirect('/mobile' + req.path);
    if (req.path === '/danh-sach' || req.path === '/danh-sach-cua-toi') return res.redirect('/mobile/danh-sach');
    if (req.path === '/tai-khoan') return res.redirect('/mobile/tai-khoan');
  }

  next();
});

// ==========================================
// MOBILE APP ROUTES (Obsidian Cinema Mobile)
// ==========================================
router.get('/mobile', (req, res) => res.sendFile(mobileFile('index.html')));
router.get('/mobile/kham-pha', (req, res) => res.sendFile(mobileFile('kham-pha.html')));
router.get('/mobile/phim/:slug', (req, res) => res.sendFile(mobileFile('chi-tiet.html')));
router.get('/mobile/xem-phim/:slug', (req, res) => res.sendFile(mobileFile('xem-phim.html')));
router.get('/mobile/xem-phim/:slug/:episode', (req, res) => res.sendFile(mobileFile('xem-phim.html')));
router.get('/mobile/danh-sach', (req, res) => res.sendFile(mobileFile('danh-sach.html')));
router.get('/mobile/tai-khoan', (req, res) => res.sendFile(mobileFile('tai-khoan.html')));

// ==========================================
// DESKTOP ROUTES
// ==========================================

// Home Page with Server-Side Hydration of real KKPhim data
router.get('/', async (req, res) => {
  try {
    const rawHtml = await fs.readFile(publicFile('index.html'), 'utf8');
    const homeData = await kkphimService.getHomeData();
    const rendered = templateService.renderHome(rawHtml, homeData);
    res.send(rendered);
  } catch (err) {
    console.error('Error rendering home view:', err);
    res.sendFile(publicFile('index.html'));
  }
});

// Catalog / Explore Page with real KKPhim data
router.get('/kham-pha', async (req, res) => {
  try {
    const rawHtml = await fs.readFile(publicFile('kham-pha.html'), 'utf8');
    const query = { limit: 30, ...req.query };
    const catalogData = await kkphimService.getCatalog(query);
    const rendered = templateService.renderCatalog(rawHtml, catalogData, query);
    res.send(rendered);
  } catch (err) {
    console.error('Error rendering catalog view:', err);
    res.sendFile(publicFile('kham-pha.html'));
  }
});

// Movie Details with Server-Side Hydration
router.get('/phim/:slug', async (req, res) => {
  try {
    const rawHtml = await fs.readFile(publicFile('chi-tiet.html'), 'utf8');
    dbService.incrementMovieView(req.params.slug).catch(() => {});
    const movieData = await kkphimService.getMovieDetail(req.params.slug);
    if (!movieData || !movieData.movie) {
      return res.sendFile(publicFile('chi-tiet.html'));
    }
    const comments = await dbService.getComments(req.params.slug).catch(() => []);
    const rendered = templateService.renderDetail(rawHtml, movieData, comments);
    res.send(rendered);
  } catch (err) {
    console.error('Error rendering detail view:', err);
    res.sendFile(publicFile('chi-tiet.html'));
  }
});

// Watch Movie Player with Server-Side Hydration
async function handleWatchView(req, res) {
  try {
    const rawHtml = await fs.readFile(publicFile('xem-phim.html'), 'utf8');
    const slug = req.params.slug;
    const epSlug = req.params.episode;
    const serverParam = req.query.server;
    const requestedServerIdx = (serverParam !== undefined && !isNaN(parseInt(serverParam, 10))) ? parseInt(serverParam, 10) : undefined;
    dbService.incrementMovieView(slug).catch(() => {});
    const [movieData, comments] = await Promise.all([
      kkphimService.getMovieDetail(slug),
      dbService.getComments(slug)
    ]);

    if (!movieData || !movieData.movie) {
      return res.sendFile(publicFile('xem-phim.html'));
    }
    const rendered = templateService.renderWatch(rawHtml, movieData, epSlug, comments, requestedServerIdx);
    res.send(rendered);
  } catch (err) {
    console.error('Error rendering watch view:', err);
    res.sendFile(publicFile('xem-phim.html'));
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

// Library & Account
router.get(['/danh-sach', '/tu-phim', '/danh-sach-cua-toi'], (req, res) => res.sendFile(publicFile('danh-sach.html')));
router.get('/dang-nhap', (req, res) => res.sendFile(publicFile('auth.html')));
router.get('/dang-ky', (req, res) => res.sendFile(publicFile('auth.html')));
router.get('/auth', (req, res) => res.sendFile(publicFile('auth.html')));
router.get('/tai-khoan', (req, res) => res.sendFile(publicFile('tai-khoan.html')));
router.get(['/admin', '/quan-tri'], (req, res) => res.sendFile(publicFile('admin.html')));

// Favicon
router.get(['/favicon.ico', '/favicon.svg'], (req, res) => res.type('image/svg+xml').sendFile(publicFile('favicon.svg')));

module.exports = router;
