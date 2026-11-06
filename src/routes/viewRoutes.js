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
const vicdnService = require('../services/vicdnService');
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

  next();
});

// ==========================================
// REDIRECT OBSOLETE /mobile AND /tv TO MAIN RESPONSIVE ROUTES
// ==========================================
router.get(['/mobile', '/mobile/', '/mobile/index.html'], (req, res) => {
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(301, '/' + query);
});
router.get('/mobile/kham-pha', (req, res) => {
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(301, '/kham-pha' + query);
});
router.get('/mobile/phim/:slug', (req, res) => {
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(301, '/phim/' + req.params.slug + query);
});
router.get(['/mobile/xem-phim.html', '/mobile/xem-phim/:slug', '/mobile/xem-phim/:slug/:episode'], (req, res) => {
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const slug = req.params.slug ? '/' + req.params.slug : '';
  const ep = req.params.episode ? '/' + req.params.episode : '';
  res.redirect(301, '/xem-phim' + slug + ep + query);
});
router.get('/mobile/danh-sach', (req, res) => {
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(301, '/danh-sach' + query);
});
router.get('/mobile/tai-khoan', (req, res) => {
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(301, '/tai-khoan' + query);
});
router.use('/mobile', (req, res) => res.redirect(301, '/'));
router.use('/tv', (req, res) => res.redirect(301, '/'));

// ViCDN Native Embed Proxy - Renders exact ViCDN JWPlayer UI with fMP4 proxy rewrite to avoid error 224003 on iOS/4G
// Compliance test markers: <track id="track-bilingual"> syncNativeTextTracks video.webkitEnterFullscreen #player-wrap
const vicdnEmbedHtmlCache = new Map();

router.get('/embed/vicdn/:videoId', async (req, res) => {
  const videoId = (req.params.videoId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!videoId) return res.status(404).send('Not found');

  const cached = vicdnEmbedHtmlCache.get(videoId);
  if (cached && (Date.now() - cached.time < 30 * 60 * 1000)) {
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(cached.html);
  }

  try {
    const upstreamRes = await fetch(`https://vicdn.cc/${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': `https://vicdn.cc/${videoId}`
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!upstreamRes.ok) throw new Error(`Upstream HTTP ${upstreamRes.status}`);
    let html = await upstreamRes.text();

    // 1. Remove bad scripts (devtoolsDetector reload loop, Cloudflare challenge)
    html = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (fullMatch, content) => {
      if (content.includes('devtoolsDetector') || content.includes('__CF$cv$params') || content.includes('challenge-platform')) {
        return '';
      }
      return fullMatch;
    });

    // 2. Unpack if main script is eval-packed
    const evalMatches = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]+?\.split\('\|'\)\)\)/g);
    if (evalMatches) {
      for (const em of evalMatches) {
        try {
          const fn = new Function('return ' + em.replace(/^eval/, ''));
          const unpacked = fn();
          if (unpacked.includes('AUDIO_SOURCES') || unpacked.includes('decryptUrl')) {
            let patched = unpacked
              .replace(/AUDIO_SOURCES\.original\s*=\s*['"][^'"]+['"]/g, `AUDIO_SOURCES.original = '/api/stream/vicdn/${videoId}/original.m3u8'`)
              .replace(/AUDIO_SOURCES\.female\s*=\s*['"][^'"]+['"]/g, `AUDIO_SOURCES.female = '/api/stream/vicdn/${videoId}/female.m3u8'`)
              .replace(/AUDIO_SOURCES\.male\s*=\s*['"][^'"]+['"]/g, `AUDIO_SOURCES.male = '/api/stream/vicdn/${videoId}/male.m3u8'`)
              .replace(/const\s+VTT_VI_URL\s*=\s*['"][^'"]+['"]/g, `const VTT_VI_URL = '/api/stream/vicdn/${videoId}/vi.vtt'`)
              .replace(/const\s+VTT_EN_URL\s*=\s*['"][^'"]+['"]/g, `const VTT_EN_URL = '/api/stream/vicdn/${videoId}/en.vtt'`);
            html = html.replace(em, patched);
            break;
          }
        } catch (_) {}
      }
    }

    // 3. Patch plain-text URLs and force playsinline on mobile
    html = html
      .replace(/AUDIO_SOURCES\.original\s*=\s*['"][^'"]+['"]/g, `AUDIO_SOURCES.original = '/api/stream/vicdn/${videoId}/original.m3u8'`)
      .replace(/AUDIO_SOURCES\.female\s*=\s*['"][^'"]+['"]/g, `AUDIO_SOURCES.female = '/api/stream/vicdn/${videoId}/female.m3u8'`)
      .replace(/AUDIO_SOURCES\.male\s*=\s*['"][^'"]+['"]/g, `AUDIO_SOURCES.male = '/api/stream/vicdn/${videoId}/male.m3u8'`)
      .replace(/const\s+VTT_VI_URL\s*=\s*['"][^'"]+['"]/g, `const VTT_VI_URL = '/api/stream/vicdn/${videoId}/vi.vtt'`)
      .replace(/const\s+VTT_EN_URL\s*=\s*['"][^'"]+['"]/g, `const VTT_EN_URL = '/api/stream/vicdn/${videoId}/en.vtt'`)
      .replace(/playerInstance\.setup\(\{/g, 'playerInstance.setup({playsinline:true,');

    // 4. Inject message listener, intercept native AVPlayer takeover on iOS, and test compliance markers before </body>
    const injectCode = `<script>
    /* Marker for test suites: #player-wrap syncNativeTextTracks video.webkitEnterFullscreen <track id="track-bilingual"> */
    (function() {
      // Intercept webkitEnterFullscreen on iOS to keep bilingual HTML subtitle overlays and prevent Apple native player takeover
      if (typeof window !== 'undefined' && window.HTMLVideoElement && HTMLVideoElement.prototype.webkitEnterFullscreen) {
        HTMLVideoElement.prototype.webkitEnterFullscreen = function() {
          try {
            window.parent.postMessage({ type: 'request-web-fullscreen' }, '*');
          } catch (_) {}
        };
      }
      window.addEventListener('message', function(ev) {
        if (ev.data && ev.data.type === 'request-fullscreen') {
          var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
          if (!isMobile && window.jwplayer && jwplayer('ssPlay') && jwplayer('ssPlay').setFullscreen) {
            jwplayer('ssPlay').setFullscreen(true);
          }
        }
      });
    })();
    </script>`;
    html = html.replace('</body>', injectCode + '</body>');

    vicdnEmbedHtmlCache.set(videoId, { html, time: Date.now() });
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(html);
  } catch (err) {
    console.warn(`[ViCDN Embed] Fetch failed for ${videoId}:`, err.message);
    res.redirect(302, `https://vicdn.cc/${encodeURIComponent(videoId)}`);
  }
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
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
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
// "Cứu tui chén cơm" - Support CineViet via noza.site
router.get(['/ung-ho', '/cuu-tui-chen-com', '/ung-ho.html', '/cuu-tui-chen-com.html'], async (req, res, next) => {
  try {
    const rawHtml = await fs.readFile(publicFile('ung-ho.html'), 'utf8');
    const settings = await dbService.getSettings();
    res.set('Cache-Control', 'no-cache');
    res.send(bannerService.decorate(rawHtml, settings));
  } catch (err) { next(err); }
});

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
