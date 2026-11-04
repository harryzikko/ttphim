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
    res.set('Cache-Control', 'private, no-cache');
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

router.get('/embed/vicdn/:videoId', (req, res) => {
  const videoId = (req.params.videoId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="referrer" content="no-referrer">
  <title>CineViet Player - Song Ngữ</title>
  <script src="/vendor/hls-1.7.3.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    html, body { width: 100%; height: 100%; background: #000; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; user-select: none; }
    #player-wrap { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #000; overflow: hidden; }
    video { width: 100%; height: 100%; object-fit: contain; }

    /* Center Controls (Play/Pause & 10s Skips) */
    .center-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 32px; z-index: 25; pointer-events: none; transition: opacity 0.25s ease; }
    .center-btn { background: none; border: none; color: #fff; cursor: pointer; pointer-events: auto; display: flex; align-items: center; justify-content: center; padding: 8px; transition: transform 0.15s ease, opacity 0.15s ease; }
    .center-btn:active { transform: scale(0.9); }
    .play-circle-btn { width: 62px; height: 62px; border-radius: 50%; border: 2.5px solid rgba(255,255,255,0.9); background: rgba(0,0,0,0.45); box-shadow: 0 4px 20px rgba(0,0,0,0.6); }

    /* Bottom Bar */
    .bottom-bar { position: absolute; bottom: 0; left: 0; right: 0; padding: 0 16px 12px; background: linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 65%, transparent 100%); z-index: 25; transition: opacity 0.25s ease; }
    .progress-area { width: 100%; height: 18px; display: flex; align-items: center; cursor: pointer; position: relative; margin-bottom: 6px; }
    .progress-track { width: 100%; height: 3.5px; background: rgba(255,255,255,0.25); border-radius: 2px; position: relative; transition: height 0.12s ease; }
    .progress-area:hover .progress-track, .progress-area.dragging .progress-track { height: 5px; }
    .progress-buf { position: absolute; top: 0; left: 0; height: 100%; background: rgba(255,255,255,0.4); border-radius: 2px; width: 0%; }
    .progress-play { position: absolute; top: 0; left: 0; height: 100%; background: #e50914; border-radius: 2px; width: 0%; }
    .progress-thumb { position: absolute; top: 50%; width: 13px; height: 13px; border-radius: 50%; background: #e50914; border: 2px solid #fff; transform: translate(-50%, -50%) scale(0); transition: transform 0.12s ease; left: 0%; }
    .progress-area:hover .progress-thumb, .progress-area.dragging .progress-thumb { transform: translate(-50%, -50%) scale(1); }

    .bar-controls { display: flex; align-items: center; justify-content: space-between; }
    .bar-group { display: flex; align-items: center; gap: 10px; }
    .bar-icon-btn { background: none; border: none; color: #eee; cursor: pointer; padding: 6px; display: flex; align-items: center; justify-content: center; border-radius: 6px; transition: color 0.15s, background 0.15s; }
    .bar-icon-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }
    .time-text { color: #ccc; font-size: 13px; font-weight: 500; font-family: monospace, sans-serif; letter-spacing: 0.5px; margin-left: 6px; }

    /* Float Menus (ViCDN / JWPlayer style) */
    .jw-float-menu { position: absolute; bottom: 58px; right: 14px; background: rgba(0,19,28,0.95); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 6px 0; min-width: 190px; z-index: 50; display: none; flex-direction: column; box-shadow: 0 6px 24px rgba(0,0,0,0.8); backdrop-filter: blur(12px); }
    .jw-float-menu.show { display: flex; }
    .menu-hdr { padding: 6px 14px 5px; font-size: 10.5px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: .08em; border-bottom: 1px solid rgba(255,255,255,.08); margin-bottom: 3px; }
    .menu-item { display: flex; align-items: center; gap: 10px; padding: 9px 14px; cursor: pointer; color: #ccc; font-size: 13px; transition: background .15s, color .15s; }
    .menu-item:hover { background: rgba(255,255,255,.08); color: #fff; }
    .menu-item.active { color: #fff; font-weight: 600; }
    .m-dot { width: 7.5px; height: 7.5px; border-radius: 50%; flex-shrink: 0; border: 1.5px solid #666; }
    .menu-item.active .m-dot { background: #4caf50; border-color: #4caf50; }

    /* Subtitle Overlay */
    .sub-overlay { position: absolute; bottom: 58px; left: 50%; transform: translateX(-50%); width: 90%; text-align: center; color: #fff; font-size: 21px; font-weight: 600; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 4px rgba(0,0,0,0.9); pointer-events: none; z-index: 20; white-space: pre-wrap; line-height: 1.3; }

    /* Loader */
    .loader { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(0,0,0,0.85); color: #fff; z-index: 30; font-size: 13px; gap: 12px; }
    .spinner { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.2); border-top-color: #e50914; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .hidden-ui { opacity: 0 !important; pointer-events: none !important; }
  </style>
</head>
<body>
  <div id="player-wrap">
    <div id="loader" class="loader"><div class="spinner"></div><span>Đang kết nối luồng phát Song Ngữ...</span></div>
    <video id="video" playsinline webkit-playsinline></video>
    <div id="sub-overlay" class="sub-overlay"></div>

    <!-- Center Controls: 10s rewind, circle play, 10s forward -->
    <div id="center-controls" class="center-overlay">
      <button id="btn-back10" class="center-btn" title="Lùi 10s" aria-label="Lùi 10 giây">
        <svg viewBox="0 0 240 240" width="46" height="46" fill="#ffffff"><path d="M113.2,131.078a21.589,21.589,0,0,0-17.7-10.6,21.589,21.589,0,0,0-17.7,10.6,44.769,44.769,0,0,0,0,46.3,21.589,21.589,0,0,0,17.7,10.6,21.589,21.589,0,0,0,17.7-10.6,44.769,44.769,0,0,0,0-46.3Zm-17.7,47.2c-7.8,0-14.4-11-14.4-24.1s6.6-24.1,14.4-24.1,14.4,11,14.4,24.1S103.4,178.278,95.5,178.278Zm-43.4,9.7v-51l-4.8,4.8-6.8-6.8,13-13a4.8,4.8,0,0,1,8.2,3.4v62.7l-9.6-.1Zm162-130.2v125.3a4.867,4.867,0,0,1-4.8,4.8H146.6v-19.3h48.2v-96.4H79.1v19.3c0,5.3-3.6,7.2-8,4.3l-41.8-27.9a6.013,6.013,0,0,1-2.7-8,5.887,5.887,0,0,1,2.7-2.7l41.8-27.9c4.4-2.9,8-1,8,4.3v19.3H209.2A4.974,4.974,0,0,1,214.1,57.778Z"/></svg>
      </button>
      <button id="btn-play-center" class="center-btn play-circle-btn" title="Phát / Tạm dừng" aria-label="Phát / Tạm dừng">
        <svg id="icon-play-center" width="28" height="28" viewBox="0 0 24 24" fill="#ffffff"><polygon points="6,4 20,12 6,20"/></svg>
        <svg id="icon-pause-center" width="28" height="28" viewBox="0 0 24 24" fill="#ffffff" style="display:none;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
      </button>
      <button id="btn-next10" class="center-btn" title="Tiến 10s" aria-label="Tiến 10 giây">
        <svg viewBox="0 0 240 240" width="46" height="46" fill="#ffffff"><path d="m 25.993957,57.778 v 125.3 c 0.03604,2.63589 2.164107,4.76396 4.8,4.8 h 62.7 v -19.3 h -48.2 v -96.4 H 160.99396 v 19.3 c 0,5.3 3.6,7.2 8,4.3 l 41.8,-27.9 c 2.93574,-1.480087 4.13843,-5.04363 2.7,-8 -0.57502,-1.174985 -1.52502,-2.124979 -2.7,-2.7 l -41.8,-27.9 c -4.4,-2.9 -8,-1 -8,4.3 v 19.3 H 30.893957 c -2.689569,0.03972 -4.860275,2.210431 -4.9,4.9 z m 163.422413,73.04577 c -3.72072,-6.30626 -10.38421,-10.29683 -17.7,-10.6 -7.31579,0.30317 -13.97928,4.29374 -17.7,10.6 -8.60009,14.23525 -8.60009,32.06475 0,46.3 3.72072,6.30626 10.38421,10.29683 17.7,10.6 7.31579,-0.30317 13.97928,-4.29374 17.7,-10.6 8.60009,-14.23525 8.60009,-32.06475 0,-46.3 z m -17.7,47.2 c -7.8,0 -14.4,-11 -14.4,-24.1 0,-13.1 6.6,-24.1 14.4,-24.1 7.8,0 14.4,11 14.4,24.1 0,13.1 -6.5,24.1 -14.4,24.1 z m -47.77056,9.72863 v -51 l -4.8,4.8 -6.8,-6.8 13,-12.99999 c 3.02543,-3.03598 8.21053,-0.88605 8.2,3.4 v 62.69999 z"/></svg>
      </button>
    </div>

    <!-- Bottom Control Bar -->
    <div id="bottom-bar" class="bottom-bar">
      <div id="progress-area" class="progress-area">
        <div class="progress-track">
          <div id="progress-buf" class="progress-buf"></div>
          <div id="progress-play" class="progress-play"></div>
          <div id="progress-thumb" class="progress-thumb"></div>
        </div>
      </div>
      <div class="bar-controls">
        <div class="bar-group">
          <button id="btn-play-bar" class="bar-icon-btn" title="Phát / Tạm dừng">
            <svg id="icon-play-bar" width="20" height="20" viewBox="0 0 24 24" fill="#ffffff"><polygon points="6,4 20,12 6,20"/></svg>
            <svg id="icon-pause-bar" width="20" height="20" viewBox="0 0 24 24" fill="#ffffff" style="display:none;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          </button>
          <span id="time-display" class="time-text">00:00 / 00:00</span>
        </div>
        <div class="bar-group">
          <button id="btn-sub" class="bar-icon-btn" title="Phụ đề">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="6" y1="11" x2="18" y2="11"/><line x1="6" y1="15" x2="11" y2="15"/><line x1="14" y1="15" x2="18" y2="15"/></svg>
          </button>
          <button id="btn-audio" class="bar-icon-btn" title="Audio / Thuyết minh">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>
          </button>
          <button id="btn-settings" class="bar-icon-btn" title="Cài đặt tốc độ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <button id="btn-fs" class="bar-icon-btn" title="Toàn màn hình">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Floating Menus (Audio, Subtitles, Settings) -->
    <div id="audio-menu" class="jw-float-menu">
      <div class="menu-hdr">Audio (Thuyết Minh)</div>
      <div id="audio-menu-list"></div>
    </div>

    <div id="sub-menu" class="jw-float-menu">
      <div class="menu-hdr">Phụ Đề</div>
      <div id="sub-menu-list"></div>
    </div>

    <div id="settings-menu" class="jw-float-menu">
      <div class="menu-hdr">Tốc Độ Phát</div>
      <div id="speed-menu-list"></div>
    </div>
  </div>

  <script>
    const wrap = document.getElementById('player-wrap');
    const video = document.getElementById('video');
    const loader = document.getElementById('loader');
    const centerControls = document.getElementById('center-controls');
    const bottomBar = document.getElementById('bottom-bar');
    const progressArea = document.getElementById('progress-area');
    const progressBuf = document.getElementById('progress-buf');
    const progressPlay = document.getElementById('progress-play');
    const progressThumb = document.getElementById('progress-thumb');
    const timeDisplay = document.getElementById('time-display');

    const btnPlayCenter = document.getElementById('btn-play-center');
    const iconPlayCenter = document.getElementById('icon-play-center');
    const iconPauseCenter = document.getElementById('icon-pause-center');
    const btnPlayBar = document.getElementById('btn-play-bar');
    const iconPlayBar = document.getElementById('icon-play-bar');
    const iconPauseBar = document.getElementById('icon-pause-bar');
    const btnBack10 = document.getElementById('btn-back10');
    const btnNext10 = document.getElementById('btn-next10');

    const btnAudio = document.getElementById('btn-audio');
    const audioMenu = document.getElementById('audio-menu');
    const audioMenuList = document.getElementById('audio-menu-list');

    const btnSub = document.getElementById('btn-sub');
    const subMenu = document.getElementById('sub-menu');
    const subMenuList = document.getElementById('sub-menu-list');
    const subOverlay = document.getElementById('sub-overlay');

    const btnSettings = document.getElementById('btn-settings');
    const settingsMenu = document.getElementById('settings-menu');
    const speedMenuList = document.getElementById('speed-menu-list');
    const btnFs = document.getElementById('btn-fs');

    const streamUrl = '/api/stream/vicdn/' + encodeURIComponent('${videoId}') + '/master.m3u8';
    let hls = null;
    let hideTimer = null;
    let isDragging = false;
    let activeAudioIdx = 0;
    let activeSubIdx = 0;
    let activeSpeed = 1;

    function fmtTime(sec) {
      if (!Number.isFinite(sec) || sec < 0) return '00:00';
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    function updatePlayState(isPlaying) {
      iconPlayCenter.style.display = isPlaying ? 'none' : 'block';
      iconPauseCenter.style.display = isPlaying ? 'block' : 'none';
      iconPlayBar.style.display = isPlaying ? 'none' : 'block';
      iconPauseBar.style.display = isPlaying ? 'block' : 'none';
      if (isPlaying) scheduleHide();
      else showControls();
    }

    function showControls() {
      clearTimeout(hideTimer);
      centerControls.classList.remove('hidden-ui');
      bottomBar.classList.remove('hidden-ui');
    }

    function scheduleHide() {
      clearTimeout(hideTimer);
      if (video.paused || anyMenuOpen()) return;
      hideTimer = setTimeout(() => {
        centerControls.classList.add('hidden-ui');
        bottomBar.classList.add('hidden-ui');
        closeAllMenus();
      }, 3000);
    }

    function closeAllMenus() {
      audioMenu.classList.remove('show');
      subMenu.classList.remove('show');
      settingsMenu.classList.remove('show');
    }

    function anyMenuOpen() {
      return audioMenu.classList.contains('show') || subMenu.classList.contains('show') || settingsMenu.classList.contains('show');
    }

    function togglePlay() {
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    }

    btnPlayCenter.onclick = (e) => { e.stopPropagation(); togglePlay(); };
    btnPlayBar.onclick = (e) => { e.stopPropagation(); togglePlay(); };
    btnBack10.onclick = (e) => { e.stopPropagation(); video.currentTime = Math.max(0, video.currentTime - 10); scheduleHide(); };
    btnNext10.onclick = (e) => { e.stopPropagation(); video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10); scheduleHide(); };

    video.addEventListener('play', () => updatePlayState(true));
    video.addEventListener('pause', () => updatePlayState(false));
    video.addEventListener('waiting', () => { loader.style.display = 'flex'; });
    video.addEventListener('playing', () => { loader.style.display = 'none'; updatePlayState(true); });
    video.addEventListener('timeupdate', () => {
      if (!isDragging && Number.isFinite(video.duration) && video.duration > 0) {
        const pct = (video.currentTime / video.duration) * 100;
        progressPlay.style.width = pct + '%';
        progressThumb.style.left = pct + '%';
        timeDisplay.textContent = fmtTime(video.currentTime) + ' / ' + fmtTime(video.duration);
      }
      if (video.buffered && video.buffered.length > 0 && video.duration > 0) {
        const bufEnd = video.buffered.end(video.buffered.length - 1);
        progressBuf.style.width = ((bufEnd / video.duration) * 100) + '%';
      }
    });

    // Touch & Mouse show/hide
    wrap.addEventListener('mousemove', () => { showControls(); scheduleHide(); });
    wrap.addEventListener('touchstart', () => { showControls(); scheduleHide(); }, { passive: true });
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('#center-controls') || e.target.closest('#bottom-bar') || e.target.closest('.jw-float-menu')) return;
      if (anyMenuOpen()) { closeAllMenus(); return; }
      if (centerControls.classList.contains('hidden-ui')) { showControls(); scheduleHide(); }
      else togglePlay();
    });

    // Progress bar seeking
    function seekFromEvent(e) {
      const rect = progressArea.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      if (video.duration) {
        video.currentTime = pct * video.duration;
        progressPlay.style.width = (pct * 100) + '%';
        progressThumb.style.left = (pct * 100) + '%';
      }
    }
    progressArea.addEventListener('mousedown', (e) => { isDragging = true; progressArea.classList.add('dragging'); seekFromEvent(e); });
    progressArea.addEventListener('touchstart', (e) => { isDragging = true; progressArea.classList.add('dragging'); seekFromEvent(e); }, { passive: true });
    window.addEventListener('mousemove', (e) => { if (isDragging) seekFromEvent(e); });
    window.addEventListener('touchmove', (e) => { if (isDragging) seekFromEvent(e); }, { passive: true });
    window.addEventListener('mouseup', () => { if (isDragging) { isDragging = false; progressArea.classList.remove('dragging'); scheduleHide(); } });
    window.addEventListener('touchend', () => { if (isDragging) { isDragging = false; progressArea.classList.remove('dragging'); scheduleHide(); } });

    // Floating Menus Toggle
    btnAudio.onclick = (e) => {
      e.stopPropagation();
      const willShow = !audioMenu.classList.contains('show');
      closeAllMenus();
      if (willShow) audioMenu.classList.add('show');
    };
    btnSub.onclick = (e) => {
      e.stopPropagation();
      const willShow = !subMenu.classList.contains('show');
      closeAllMenus();
      if (willShow) subMenu.classList.add('show');
    };
    btnSettings.onclick = (e) => {
      e.stopPropagation();
      const willShow = !settingsMenu.classList.contains('show');
      closeAllMenus();
      if (willShow) settingsMenu.classList.add('show');
    };

    // Fullscreen
    btnFs.onclick = (e) => {
      e.stopPropagation();
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (wrap.requestFullscreen) wrap.requestFullscreen();
        else if (wrap.webkitRequestFullscreen) wrap.webkitRequestFullscreen();
        else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
    };

    // Build Settings Menu (Playback speed)
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    function renderSpeedMenu() {
      speedMenuList.innerHTML = speeds.map(s => `
        <div class="menu-item ${s === activeSpeed ? 'active' : ''}" data-speed="${s}">
          <span class="m-dot"></span>
          <span>${s === 1 ? '1x (Chuẩn)' : s + 'x'}</span>
        </div>
      `).join('');
      speedMenuList.querySelectorAll('.menu-item').forEach(el => {
        el.onclick = () => {
          activeSpeed = Number(el.dataset.speed);
          video.playbackRate = activeSpeed;
          renderSpeedMenu();
          closeAllMenus();
          scheduleHide();
        };
      });
    }
    renderSpeedMenu();

    // Render Audio Tracks Menu
    function renderAudioMenu(tracks) {
      if (!tracks || tracks.length <= 1) {
        btnAudio.style.display = 'none';
        return;
      }
      btnAudio.style.display = 'flex';
      audioMenuList.innerHTML = tracks.map((t, idx) => `
        <div class="menu-item ${idx === activeAudioIdx ? 'active' : ''}" data-idx="${idx}">
          <span class="m-dot"></span>
          <span>${t.name || ('Audio ' + (idx + 1))}</span>
        </div>
      `).join('');
      audioMenuList.querySelectorAll('.menu-item').forEach(el => {
        el.onclick = () => {
          activeAudioIdx = Number(el.dataset.idx);
          if (hls) hls.audioTrack = activeAudioIdx;
          else if (video.audioTracks) {
            for (let i = 0; i < video.audioTracks.length; i++) {
              video.audioTracks[i].enabled = (i === activeAudioIdx);
            }
          }
          renderAudioMenu(tracks);
          closeAllMenus();
          scheduleHide();
        };
      });
    }

    // Render Subtitles Menu
    function renderSubMenu(tracks) {
      const all = [{ name: '⭕ Tắt Phụ Đề', idx: -1 }].concat(tracks.map((t, i) => ({ name: '💬 ' + (t.name || t.lang || ('Phụ đề ' + (i+1))), idx: i })));
      subMenuList.innerHTML = all.map(t => `
        <div class="menu-item ${t.idx === activeSubIdx ? 'active' : ''}" data-idx="${t.idx}">
          <span class="m-dot"></span>
          <span>${t.name}</span>
        </div>
      `).join('');
      subMenuList.querySelectorAll('.menu-item').forEach(el => {
        el.onclick = () => {
          activeSubIdx = Number(el.dataset.idx);
          if (hls) hls.subtitleTrack = activeSubIdx;
          else if (video.textTracks) {
            for (let i = 0; i < video.textTracks.length; i++) {
              video.textTracks[i].mode = (i === activeSubIdx) ? 'showing' : 'disabled';
            }
          }
          if (activeSubIdx === -1) subOverlay.textContent = '';
          renderSubMenu(tracks);
          closeAllMenus();
          scheduleHide();
        };
      });
    }

    // Init Hls.js
    if (window.Hls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, backBufferLength: 30, maxBufferLength: 30 });
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        loader.style.display = 'none';
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) => {
        if (data.audioTracks) renderAudioMenu(data.audioTracks);
      });
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_, data) => {
        if (data.subtitleTracks) renderSubMenu(data.subtitleTracks);
      });
      hls.on(Hls.Events.SUBTITLE_TRACK_LOADED, (_, data) => {
        // Track cue changes
      });
      hls.on(Hls.Events.ERROR, (_, err) => {
        if (err.fatal) {
          loader.innerHTML = '<span style="color:#ff5555">Nguồn phát tạm thời gián đoạn. Vui lòng thử lại sau.</span>';
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.addEventListener('loadedmetadata', () => {
        loader.style.display = 'none';
        video.play().catch(() => {});
        if (video.audioTracks) {
          const list = Array.from(video.audioTracks).map((t, i) => ({ name: t.label || t.language || ('Audio ' + (i+1)) }));
          renderAudioMenu(list);
        }
        if (video.textTracks) {
          const list = Array.from(video.textTracks).map((t, i) => ({ name: t.label || t.language || ('Sub ' + (i+1)) }));
          renderSubMenu(list);
        }
      });
      video.addEventListener('error', () => {
        loader.innerHTML = '<span style="color:#ff5555">Lỗi phát video trên trình duyệt này.</span>';
      });
    }
  </script>
</body>
</html>`);
});

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
    res.set('Cache-Control', 'private, no-cache');
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

    if (!movieData?.movie) return sendPageError(res, { status: 404 });
    const hasEpisodes = (movieData.episodes || []).some(s => (s.server_data || []).some(e => Boolean((e.slug || e.name) && (e.link_m3u8 || e.link_embed || e.slug))));
    if (!hasEpisodes) {
      return sendPageError(res, {
        status: 404,
        title: 'Bản phim đang được cập nhật',
        description: `Phim "${movieData.movie.name}" hiện chưa có tập phát sóng từ nhà cung cấp nguồn. Vui lòng quay lại sau hoặc xem trailer!`
      });
    }
    if (!episodeExists(movieData, epSlug, serverParam)) return sendPageError(res, { status: 404 });
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
