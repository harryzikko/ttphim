'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');

function createTestServer() {
  const app = express();
  app.use(express.json());

  const homeData = {
    spotlights: [{
      slug: 'spotlight-phim',
      name: 'Siêu Phẩm Đêm',
      origin_name: 'Nightfall Cinema',
      quality: '4K',
      year: 2026,
      lang: 'Vietsub',
      banner_description: 'Bản chiếu rạp đặc sắc trên Smart TV.',
      hero_backdrop_url: ''
    }],
    rankings: [
      { slug: 'top-1', name: 'Top 1 Thịnh Hành', origin_name: 'Trending One', quality: 'FHD', year: 2026 }
    ],
    latest: [{ slug: 'moi-1', name: 'Phim Mới 1', origin_name: 'Latest 1', episode_current: 'Tập 05', year: 2026 }],
    cinema: [],
    series: [{ slug: 'bo-1', name: 'Phim Bộ 1', episode_current: 'Tập 10', year: 2026 }],
    singles: [{ slug: 'le-1', name: 'Phim Lẻ 1', quality: 'FHD', year: 2026 }],
    tvshows: [],
    anime: []
  };

  let tvPollCount = 0;
  let watchlistToggleCount = 0;

  app.get('/api/home', (req, res) => res.json({ status: true, data: homeData }));
  app.get('/api/catalog', (req, res) => res.json({
    status: true,
    data: {
      items: [{ slug: `${req.query.type}-1`, name: `Danh mục ${req.query.type}`, quality: 'FHD', year: 2026 }]
    }
  }));
  app.get('/api/search', (req, res) => res.json({
    status: true,
    data: [{ slug: 'ket-qua-tim', name: `Kết quả: ${req.query.q}`, quality: 'HD', year: 2026 }]
  }));
  app.get('/api/movies/:slug', (req, res) => res.json({
    status: true,
    data: {
      movie: { slug: req.params.slug, name: 'Siêu Phẩm Đêm', origin_name: 'Nightfall', quality: '4K', year: 2026, content: '<p>Nội dung test TV.</p>', category: [{ name: 'Hành Động' }] },
      episodes: [{
        server_name: 'Vietsub HLS',
        server_data: [
          { slug: 'tap-1', name: 'Tập 01', link_m3u8: '', link_embed: 'about:blank' },
          { slug: 'tap-2', name: 'Tập 02', link_m3u8: '', link_embed: 'about:blank' }
        ]
      }],
      inWatchlist: false,
      watchedHistory: null
    }
  }));
  app.post('/api/movies/:slug/view', (req, res) => res.json({ status: true }));
  app.post('/api/auth/tv/session', (req, res) => res.json({
    status: true,
    data: { token: 'tv-tok-123', code: '849201', qr_url: 'https://cineviet.live/tv-login?code=849201', expires_in: 300 }
  }));
  app.get('/api/auth/tv/status', (req, res) => {
    tvPollCount += 1;
    if (tvPollCount >= 1) {
      return res.json({ status: 'approved', token: 'bearer-tv-user', user: { id: 'u1', name: 'TV Tester', email: 'tv@cineviet.live' } });
    }
    res.json({ status: 'pending' });
  });
  app.get('/api/user/library', (req, res) => res.json({
    status: true,
    data: { history: [], watchlist: [{ slug: 'bo-1', name: 'Phim Yêu Thích', quality: '4K', year: 2026 }] }
  }));
  app.post('/api/user/watchlist/toggle', (req, res) => {
    watchlistToggleCount += 1;
    res.json({ status: true, inWatchlist: true });
  });
  app.post('/api/user/history', (req, res) => res.json({ status: true }));

  app.use('/webos', (req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  }, express.static(path.join(root, 'webos_app', 'www'), { index: 'index.html' }));

  return {
    app,
    getState: () => ({ tvPollCount, watchlistToggleCount })
  };
}

test('webos_app manifest, icons and offline launcher assets are valid', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'webos_app', 'appinfo.json'), 'utf8'));
  assert.equal(manifest.id, 'live.cineviet.webos');
  assert.equal(manifest.type, 'web');
  assert.equal(manifest.main, 'index.html');
  assert.equal(manifest.resolution, '1920x1080');
  assert.equal(manifest.disableBackHistoryAPI, true);
  for (const rel of ['icon.png', 'largeIcon.png', 'splashBackground.png', 'index.html', 'www/index.html', 'www/probe.js', 'www/vendor/hls.min.js', 'www/js/app.js', 'www/js/spatial.js', 'www/js/player.js', 'www/js/api.js', 'www/css/webos-tv.css']) {
    assert.ok(fs.existsSync(path.join(root, 'webos_app', rel)), `Missing webOS file: ${rel}`);
  }
  const launcherHtml = fs.readFileSync(path.join(root, 'webos_app', 'index.html'), 'utf8');
  assert.match(launcherHtml, /webOSSystem/);
  assert.match(launcherHtml, /isDesktopSimulator/);
  const downloadHtml = fs.readFileSync(path.join(root, 'public', 'tai-ung-dung.html'), 'utf8');
  assert.match(downloadHtml, /guide-content-webos/);
  assert.match(downloadHtml, /link-download-webos/);
  assert.match(downloadHtml, /CineViet-webOS-TV\.ipk/);
});

test('LG webOS TV app renders Nocturne Cinema UI, supports D-Pad & 461 Back key, virtual search and QR auth', async t => {
  if (!fs.existsSync(chromium.executablePath())) {
    t.skip('Chromium unavailable');
    return;
  }
  const { app } = createTestServer();
  const server = http.createServer(app);
  let browser = null;

  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    const resp = await page.goto(`${baseUrl}/webos/`, { waitUntil: 'domcontentloaded' });
    assert.equal(resp.headers()['x-robots-tag'], 'noindex, nofollow');

    await page.waitForSelector('#tv-hero-title');
    assert.equal(await page.textContent('#tv-hero-title'), 'Siêu Phẩm Đêm');
    assert.ok(await page.locator('.tv-rank-num', { hasText: '1' }).isVisible());

    // D-pad Left moves focus to collapsible sidebar and expands it
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => document.getElementById('tv-sidebar').classList.contains('expanded'));

    // Navigate to Series tab -> renders 5-col grid
    await page.click('.tv-nav-item[data-nav="series"]');
    await page.waitForSelector('.tv-grid-5 .tv-card');
    assert.match(await page.textContent('.tv-catalog-title'), /Phim Bộ/);

    // Navigate to Search tab -> virtual keyboard & search API
    await page.click('.tv-nav-item[data-nav="search"]');
    await page.waitForSelector('.tv-key[data-key="A"]');
    await page.click('.tv-key[data-key="A"]');
    await page.waitForFunction(() => document.getElementById('tv-search-heading')?.textContent.includes('"a"'));
    await page.waitForSelector('#tv-search-grid .tv-card');

    // Click result -> Movie Detail overlay
    await page.click('#tv-search-grid .tv-card');
    await page.waitForSelector('#tv-detail-play');
    assert.equal(await page.textContent('#tv-detail-layer h1'), 'Siêu Phẩm Đêm');

    // Launch Player -> Next Episode button visible on multi-ep -> press LG Back (keyCode 461)
    await page.click('#tv-detail-play');
    await page.waitForSelector('#tv-player-hud');
    await page.waitForSelector('#tv-btn-next:not(.hidden)');
    await page.evaluate(() => {
      document.getElementById('tv-video').dispatchEvent(new Event('ended'));
    });
    await page.waitForSelector('#tv-next-prompt:not(.hidden)');
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 461, which: 461, bubbles: true })));
    await page.waitForSelector('#tv-next-prompt.hidden', { state: 'attached' });
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 461, which: 461, bubbles: true })));
    await page.waitForFunction(() => document.getElementById('tv-player-layer').classList.contains('hidden'));

    // Another Back (461) closes Detail overlay cleanly
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 461, which: 461, bubbles: true })));
    await page.waitForFunction(() => document.getElementById('tv-detail-layer').classList.contains('hidden'));

    // Verify TvSpatial.platformBack() delegates to native webOSSystem.platformBack on real LG TVs
    const calledPlatformBack = await page.evaluate(() => {
      let called = false;
      window.webOSSystem = { platformBack: () => { called = true; } };
      window.TvSpatial.platformBack();
      return called;
    });
    assert.equal(calledPlatformBack, true);

    // Account QR login renders 6 digits & auto-approves on poll
    await page.click('.tv-nav-item[data-nav="account"]');
    await page.waitForSelector('.tv-digit');
    assert.equal(await page.locator('.tv-digit').count(), 6);
    await page.waitForSelector('#tv-logout-btn', { timeout: 6000 });
    assert.match(await page.textContent('#tv-stage'), /TV Tester/);

    assert.deepEqual(pageErrors, []);
    await context.close();
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
