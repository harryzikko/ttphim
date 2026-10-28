const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const fixtures = path.join(__dirname, 'fixtures/player');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function playwright() {
  try { return require('playwright'); }
  catch (error) {
    if (process.env.PLAYER_PLAYWRIGHT_PATH) return require(process.env.PLAYER_PLAYWRIGHT_PATH);
    throw new Error('Install the playwright dev dependency or set PLAYER_PLAYWRIGHT_PATH to its module directory.', { cause: error });
  }
}

// Local fixture HTML uses the production DOM/controllers/SDK, without unrelated CDN UI scripts.
// Media is real local MPEG-TS/H.264 through the pinned production Hls.js, not a media mock.
function playerHtml(kind) {
  const file = kind === 'mobile' ? 'public/mobile/xem-phim.html' : kind === 'tv' ? 'public/tv/xem-phim.html' : 'public/xem-phim.html';
  let html = read(file);
  const tvController = kind === 'tv' ? [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].at(-1)[1] : '';
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
  const controller = kind === 'mobile' ? '/mobile/js/xem-phim.js' : '/js/watch.js';
  return html.replace('</head>', '<style>.hidden{display:none!important}video{width:640px;max-width:100%;height:360px}button{min-width:28px;min-height:28px}#player-viewport,#m-player-wrapper{position:relative} .player-status{position:relative;z-index:100}</style></head>')
    .replace('</body>', `<script src="/vendor/hls-1.7.3.min.js"></script><script src="/js/api.js"></script><script src="/js/player-preferences.js"></script><script src="/js/player-tracks.js"></script><script src="/js/player-ux.js"></script><script src="/js/player-recovery.js"></script><script src="/__qa/bootstrap.js"></script>${kind === 'tv' ? `<script>${tvController}</script>` : `<script src="${controller}"></script>`}</body>`);
}

function movieData(origin) {
  return { movie: { slug: 'qa-film', name: 'Generated QA pattern', origin_name: 'QA', category: [], country: [], actor: [], director: [] },
    episodes: ['Primary', 'Backup'].map(server_name => ({ server_name, server_data: [1, 2, 3].map(n => ({
      slug: `tap-${n}`, name: `Episode ${n}`, link_m3u8: `${origin}/__qa/sample.m3u8?server=${server_name}&episode=${n}`, link_embed: `${origin}/__qa/embed`
    })) })) };
}

async function waitPlayback(page, selector) {
  await page.waitForFunction(selector => {
    const video = document.querySelector(selector);
    return video && !video.paused && video.currentTime > 0.15 && video.videoWidth === 160 && video.readyState >= 2;
  }, selector);
}
const click = (page, selector) => page.locator(selector).first().evaluate(element => element.click());

// Every resource stays on loopback; no real DB, production listener or remote provider is used.
test('Edge real HLS player QA (isolated DB/server, generated freely reusable media)', { skip: process.env.PLAYER_E2E !== '1', timeout: 150000 }, async t => {
  const temp = fs.mkdtempSync(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'player-e2e-'));
  const originalFetch = globalThis.fetch;
  const blockedProviders = ['vicdnService'].map(name => require.resolve(`../src/services/${name}`));
  const previousModules = blockedProviders.map(file => require.cache[file]);
  // Provider constructors start sync jobs; isolate them before importing the real backend.
  blockedProviders.forEach(file => { require.cache[file] = { id: file, filename: file, loaded: true, exports: {} }; });
  globalThis.fetch = (url, options) => {
    if (!/^http:\/\/127\.0\.0\.1:\d+\//.test(String(url))) return Promise.reject(new Error('External network is disabled in player QA'));
    return originalFetch(url, options);
  };
  const previous = Object.fromEntries(['DB_PATH', 'PORT', 'HOST', 'NODE_ENV', 'PUBLIC_ORIGIN', 'ALLOWED_ORIGINS'].map(key => [key, process.env[key]]));
  Object.assign(process.env, { DB_PATH: path.join(temp, 'db.json'), PORT: '0', HOST: '127.0.0.1', NODE_ENV: 'test', PUBLIC_ORIGIN: '', ALLOWED_ORIGINS: '' });
  let browser, server;
  const telemetry = [], histories = [];
  try {
    const { app } = require('../src/server');
    await require('../src/services/dbService').getRawDatabase();
    server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const resource = url.pathname.slice('/__qa/'.length);
      if (url.pathname === '/__qa/embed') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><title>Local embed fallback</title>Local QA embed'); }
      if (url.pathname === '/__qa/broken.m3u8') { res.statusCode = 404; return res.end('missing'); }
      if (url.pathname.startsWith('/__qa/') && /^[a-z0-9.-]+$/.test(resource) && fs.existsSync(path.join(fixtures, resource))) {
        res.setHeader('Content-Type', resource.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : resource.endsWith('.ts') ? 'video/mp2t' : 'text/javascript');
        return fs.createReadStream(path.join(fixtures, resource)).pipe(res);
      }
      if (url.pathname === '/api/playback/events') {
        let body = ''; req.on('data', chunk => { body += chunk; });
        req.on('end', () => { telemetry.push(JSON.parse(body)); res.writeHead(503); res.end('{}'); });
        return;
      }
      // Do not render provider-backed views or prefetch unrelated catalog routes.
      if (!/^\/(?:api\/(?:auth\/|user\/(?:history|playback-preferences)|comments\/)|js\/|mobile\/js\/|vendor\/)/.test(url.pathname)) { res.writeHead(204); return res.end(); }
      app(req, res);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const executablePath = process.env.PLAYER_BROWSER_PATH || (process.platform === 'win32' ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' : undefined);
    browser = await playwright().chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--autoplay-policy=no-user-gesture-required'] });

    for (const kind of ['desktop', 'mobile', 'tv']) {
      await t.test(`${kind}: decode, transport, seek, switch/teardown, stale callbacks, auto-next${kind === 'tv' ? ' (Artplayer contract double)' : ', final history save'}`, async () => {
        const context = await browser.newContext({ viewport: kind === 'mobile' ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
        const page = await context.newPage();
        page.setDefaultTimeout(12000);
        const errors = [];
        let broken = false;
        const embedRequests = [];
        page.on('request', request => { if (new URL(request.url()).pathname === '/__qa/embed') embedRequests.push(request.url()); });
        page.on('pageerror', error => errors.push(error.message));
        await context.route('**/*', async route => {
          const url = new URL(route.request().url());
          if (url.origin !== origin) return route.abort();
          if (url.pathname === '/api/movies/qa-film') {
            const data = movieData(origin);
            if (broken) data.episodes.forEach(server => server.server_data.forEach(ep => { ep.link_m3u8 = origin + '/__qa/broken.m3u8'; }));
            return route.fulfill({ json: { status: true, data } });
          }
          if (url.pathname === '/qa-desktop' || /^\/mobile\/xem-phim\/qa-film\/tap-\d+$/.test(url.pathname) || url.pathname === '/tv/xem-phim/qa-film') return route.fulfill({ contentType: 'text/html', body: playerHtml(kind) });
          if (url.pathname === '/api/user/history' && route.request().method() === 'POST') histories.push(route.request().postDataJSON());
          return route.continue();
        });
        try {
          const registration = await context.request.post(`${origin}/api/auth/register`, { data: { email: `${kind}@qa.invalid`, password: 'qa-test-password', name: 'QA' }, headers: { Origin: origin } });
          const registered = await registration.json();
          assert.equal(registered.status, true);
          const userId = registered.data.user.id;
          const historyOffset = histories.length;
          const address = kind === 'desktop' ? '/qa-desktop?slug=qa-film&ep=tap-1' : kind === 'mobile' ? '/mobile/xem-phim/qa-film/tap-1' : '/tv/xem-phim/qa-film';
          await page.goto(origin + address);
          const selector = kind === 'mobile' ? '#m-video-player' : kind === 'tv' ? '#artplayer-container video' : '#player-viewport video';
          await waitPlayback(page, selector);
          await page.locator(selector).evaluate(video => video.pause());
          assert.equal(await page.locator(selector).evaluate(video => video.paused), true);
          if (kind === 'mobile') await click(page, '#m-center-play-btn');
          else if (kind === 'tv') await click(page, '#btn-play-toggle');
          else await click(page, '#player-btn-play');
          await waitPlayback(page, selector);
          await page.locator(selector).evaluate(video => { video.currentTime = 2; });
          await page.waitForFunction(selector => document.querySelector(selector).currentTime >= 2.15, selector);
          await page.locator(selector).evaluate(video => video.pause());
          if (kind !== 'tv') {
            const before = await page.locator(selector).evaluate(video => video.currentTime);
            await click(page, kind === 'mobile' ? '#m-watch-servers button:nth-child(2)' : '.server-pill-btn:nth-child(2)');
            await page.waitForFunction(() => qa.hls.length === 2 && qa.hls[0].qaDestroyed);
            await waitPlayback(page, selector);
            const resumed = await page.locator(selector).evaluate(video => video.currentTime);
            assert.ok(resumed >= before - 0.2, `server resume ${resumed} >= ${before}`);
            // A late manifest/error callback from the destroyed engine must be inert.
            const count = await page.evaluate(() => {
              const old = qa.hls[0], n = qa.sessions.length;
              for (const [event, callback] of old.qaCallbacks) {
                if (event === Hls.Events.MANIFEST_PARSED) callback(event, { levels: [] });
                if (event === Hls.Events.ERROR) callback(event, { fatal: true, type: Hls.ErrorTypes.NETWORK_ERROR });
              }
              return n;
            });
            assert.equal(await page.evaluate(() => qa.sessions.length), count);
            // A real decoded end drives each production auto-next controller.
            await page.locator(selector).evaluate(async video => { video.currentTime = video.duration - 0.25; await video.play(); });
            await page.waitForFunction(() => qa.sessions.length >= 3, null, { timeout: 10000 });
            await waitPlayback(page, selector);
            assert.ok(page.url().includes('tap-2'));
            await page.locator(selector).evaluate(video => { video.currentTime = 3; video.pause(); });
            const finalSave = page.waitForResponse(response => {
              if (!response.url().endsWith('/api/user/history') || response.request().method() !== 'POST') return false;
              const saved = response.request().postDataJSON();
              return saved.episode_slug === 'tap-2' && saved.current_time >= 3;
            });
            await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
            await page.waitForFunction(() => qa.hls.at(-1).qaDestroyed);
            // Authenticated SDK writes to the disposable real database, including final timestamp.
            assert.equal((await finalSave).status(), 200);
            await require('../src/services/dbService').operationQueue;
            const db = JSON.parse(fs.readFileSync(path.join(temp, 'db.json'), 'utf8'));
            assert.ok(db.history.some(row => row.user_id === userId && row.episode_slug === 'tap-2' && row.current_time >= 3));
            assert.ok(histories.slice(historyOffset).some(row => row.episode_slug === 'tap-1' && row.server_name === 'Primary' && row.current_time >= 2));
            await page.goto(origin + address.replace('tap-1', 'tap-2'));
            await waitPlayback(page, selector);
            assert.ok(await page.locator(selector).evaluate(video => video.currentTime >= 3), 'final progress survives page reload');
            await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
          } else {
            await click(page, '#btn-next-ep');
            await page.waitForFunction(() => qa.hls.length === 2 && qa.hls[0].qaDestroyed && qa.arts[0].destroyed);
            await waitPlayback(page, selector);
            await page.evaluate(() => qa.arts[0].handlers['video:ended']());
            assert.equal(await page.evaluate(() => qa.arts.length), 2);
            await page.locator(selector).evaluate(async video => { video.currentTime = video.duration - 0.2; await video.play(); });
            await page.waitForFunction(() => qa.arts.length === 3);
            await waitPlayback(page, selector);
            await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
            assert.equal(await page.evaluate(() => qa.hls.at(-1).qaDestroyed && qa.arts.at(-1).destroyed), true);
          }
          assert.deepEqual(errors, []);
          if (kind !== 'tv') {
            broken = true;
            await page.goto(origin + address);
            const frameSelector = kind === 'mobile' ? '#m-iframe-player' : '#player-viewport iframe';
            const recovery = page.locator('.player-recovery');
            await recovery.waitFor({ state: 'visible' });
            assert.equal(await page.evaluate(() => qa.hls.at(-1).qaDestroyed && !qa.sessions.at(-1).isActive()), true);
            const sessionCount = await page.evaluate(() => qa.sessions.length);
            await page.waitForTimeout(650);
            assert.equal(await page.evaluate(() => qa.sessions.length), sessionCount, 'failure does not automatically switch HLS sources');
            assert.equal(embedRequests.length, 0, 'failure does not load the iframe before confirmation');
            assert.notEqual(await page.evaluate(selector => document.querySelector(selector)?.getAttribute('src'), frameSelector), origin + '/__qa/embed');
            const embedOption = await recovery.locator('option').evaluateAll(options => options.find(option => option.textContent.includes('Iframe')).value);
            await recovery.locator('select').selectOption(embedOption);
            assert.match(await recovery.locator('.player-recovery-note').textContent(), /iframe/i);
            assert.equal(embedRequests.length, 0, 'selecting a fallback is not confirmation');
            const embedRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/__qa/embed');
            await recovery.locator('.player-recovery-confirm').click();
            await embedRequest;
            await page.waitForFunction(selector => document.querySelector(selector)?.src.endsWith('/__qa/embed'), frameSelector);
            await page.waitForFunction(() => !document.querySelector('.player-recovery'));
            assert.ok(embedRequests.length > 0, 'confirmed fallback loads the local iframe');
            await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
            assert.equal(await page.locator(frameSelector).getAttribute('src'), 'about:blank');
          }
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      });
    }

    for (const kind of ['desktop', 'mobile', 'tv']) {
      await t.test(`${kind}: embed guidance switches to HLS at the same episode`, async () => {
        const context = await browser.newContext({ viewport: kind === 'mobile' ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
        const page = await context.newPage();
        page.setDefaultTimeout(12000);
        const errors = [], external = [];
        page.on('pageerror', error => errors.push(error.message));
        await context.route('**/*', route => {
          const url = new URL(route.request().url());
          if (url.origin !== origin) { external.push(url.href); return route.abort(); }
          if (url.pathname === '/api/movies/qa-film') {
            const data = movieData(origin);
            data.episodes[0].server_data.forEach(ep => {
              ep.link_m3u8 = '';
              ep.link_embed = origin + '/__qa/embed';
            });
            return route.fulfill({ json: { status: true, data } });
          }
          if (url.pathname === '/qa-desktop' || url.pathname === '/mobile/xem-phim/qa-film/tap-2' || url.pathname === '/tv/xem-phim/qa-film') {
            return route.fulfill({ contentType: 'text/html', body: playerHtml(kind).replace('</head>', '<style>' + read('public/css/player-ux.css') + '</style></head>') });
          }
          return route.continue();
        });
        try {
          const address = kind === 'desktop' ? '/qa-desktop?slug=qa-film&ep=tap-2' : kind === 'mobile' ? '/mobile/xem-phim/qa-film/tap-2' : '/tv/xem-phim/qa-film?slug=tap-2';
          await page.goto(origin + address);
          await page.locator('.player-status[data-state="embed-help"]').waitFor({ state: 'visible' });
          const frameSelector = kind === 'mobile' ? '#m-iframe-player' : kind === 'tv' ? '#embed-frame' : '#player-viewport iframe';
          assert.equal(await page.locator(frameSelector).getAttribute('src'), origin + '/__qa/embed');
          const switchButton = page.locator('.player-status button').filter({ hasText: 'Đổi server' });
          await switchButton.click();
          if (kind !== 'tv') await page.locator(kind === 'mobile' ? '#m-watch-servers button' : '.server-pill-btn').nth(1).evaluate(element => element.click());
          const selector = kind === 'mobile' ? '#m-video-player' : kind === 'tv' ? '#artplayer-container video' : '#player-viewport video';
          await waitPlayback(page, selector);
          assert.ok(await page.evaluate(() => qa.hls.at(-1).url.includes('episode=2')));
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      });
    }

    for (const kind of ['desktop', 'mobile']) {
      await t.test(`${kind}: confirmed HLS recovery preserves episode and playback time`, async () => {
        const context = await browser.newContext({ viewport: kind === 'mobile' ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
        const page = await context.newPage();
        page.setDefaultTimeout(12000);
        const errors = [], sources = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (/\/__qa\/(sample\.m3u8|embed)$/.test(new URL(request.url()).pathname)) sources.push(request.url()); });
        await context.route('**/*', route => {
          const url = new URL(route.request().url());
          if (url.origin !== origin) return route.abort();
          if (url.pathname === '/api/movies/qa-film') return route.fulfill({ json: { status: true, data: movieData(origin) } });
          if (url.pathname === '/qa-desktop' || url.pathname === '/mobile/xem-phim/qa-film/tap-2') return route.fulfill({ contentType: 'text/html', body: playerHtml(kind) });
          return route.continue();
        });
        try {
          const address = kind === 'desktop' ? '/qa-desktop?slug=qa-film&ep=tap-2' : '/mobile/xem-phim/qa-film/tap-2';
          const selector = kind === 'mobile' ? '#m-video-player' : '#player-viewport video';
          await page.goto(origin + address);
          await waitPlayback(page, selector);
          await page.locator(selector).evaluate(video => { video.pause(); video.currentTime = 3; });
          await page.waitForFunction(selector => Math.abs(document.querySelector(selector).currentTime - 3) < 0.1 && !document.querySelector(selector).seeking, selector);
          const before = await page.locator(selector).evaluate(video => video.currentTime);
          // Keep real decoding/resume; inject only the terminal media error to avoid network retry delays.
          await page.locator(selector).evaluate(video => video.dispatchEvent(new Event('error')));
          const recovery = page.locator('.player-recovery');
          await recovery.waitFor({ state: 'visible' });
          assert.equal(await page.evaluate(() => qa.hls[0].qaDestroyed && !qa.sessions[0].isActive()), true);
          const requestsBefore = sources.length;
          await page.waitForTimeout(650);
          assert.equal(await page.evaluate(() => qa.sessions.length), 1, 'recovery waits for the viewer');
          assert.equal(sources.length, requestsBefore, 'no fallback source is requested automatically');
          const option = await recovery.locator('option').evaluateAll(options => options.find(option => option.textContent.includes('Backup') && option.textContent.includes('HLS')).value);
          await recovery.locator('select').selectOption(option);
          assert.match(await recovery.locator('select option:checked').textContent(), /Episode 2/);
          assert.match(await recovery.locator('.player-recovery-note').textContent(), /3/);
          assert.equal(await page.evaluate(() => qa.sessions.length), 1, 'selection alone does not switch sources');
          await recovery.locator('.player-recovery-confirm').click();
          await page.waitForFunction(() => qa.sessions.length === 2);
          await waitPlayback(page, selector);
          const source = new URL(await page.evaluate(() => qa.hls.at(-1).url));
          assert.equal(source.searchParams.get('server'), 'Backup');
          assert.equal(source.searchParams.get('episode'), '2');
          assert.ok(page.url().includes('tap-2'), 'confirmation keeps the same episode route');
          const resumed = await page.locator(selector).evaluate(video => video.currentTime);
          assert.ok(resumed >= before - 0.2 && resumed < before + 2, `confirmed recovery resumes near ${before}s, got ${resumed}s`);
          assert.equal(await recovery.count(), 0);
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      });
    }

    await t.test('account preferences sync across independent desktop/mobile contexts and single-track controls stay hidden', async () => {
      const contexts = [];
      try {
        for (const kind of ['desktop', 'mobile']) {
          const context = await browser.newContext({ viewport: { width: kind === 'mobile' ? 390 : 1280, height: 900 } });
          contexts.push(context);
          await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin !== origin) return route.abort();
            if (url.pathname === '/api/movies/qa-film') return route.fulfill({ json: { status: true, data: movieData(origin) } });
            if (url.pathname === '/qa-desktop' || /^\/mobile\/xem-phim\/qa-film\/tap-\d+$/.test(url.pathname)) return route.fulfill({ contentType: 'text/html', body: playerHtml(kind) });
            return route.continue();
          });
        }
        const registered = await contexts[0].request.post(origin + '/api/auth/register', { data: { email: 'preferences@qa.invalid', password: 'qa-test-password', name: 'QA' } });
        assert.equal((await registered.json()).status, true);
        const login = await contexts[1].request.post(origin + '/api/auth/login', { data: { email: 'preferences@qa.invalid', password: 'qa-test-password' } });
        assert.equal((await login.json()).status, true);
        const saved = await contexts[0].request.patch(origin + '/api/user/playback-preferences', { data: { auto_next: false, playback_speed: 1.5, audio_language: 'vi', subtitle_language: 'off' } });
        assert.equal((await saved.json()).status, true);
        const desktop = await contexts[0].newPage(), mobile = await contexts[1].newPage();
        await desktop.goto(origin + '/qa-desktop?slug=qa-film&ep=tap-1'); await waitPlayback(desktop, '#player-viewport video');
        await desktop.locator('#player-viewport video').evaluate(video => video.pause());
        assert.equal(await desktop.locator('.playback-preferences').count(), 0);
        assert.equal(await desktop.locator('#player-viewport video').evaluate(video => video.playbackRate), 1.5);
        await mobile.goto(origin + '/mobile/xem-phim/qa-film/tap-1'); await waitPlayback(mobile, '#m-video-player');
        await mobile.locator('#m-video-player').evaluate(video => video.pause());
        assert.equal(await mobile.locator('#m-video-player').evaluate(video => video.playbackRate), 1.5);
        assert.equal(await mobile.locator('.playback-preferences').count(), 0);
        const preferences = await contexts[1].request.get(origin + '/api/user/playback-preferences').then(response => response.json());
        assert.deepEqual(preferences.data, { auto_next: false, playback_speed: 1.5, audio_language: 'vi', subtitle_language: 'off' });
        assert.equal(await mobile.locator('.player-track-menu').isVisible(), false);
        await mobile.locator('#m-video-player').evaluate(video => video.dispatchEvent(new Event('ended')));
        await mobile.waitForTimeout(3200);
        assert.ok(new URL(mobile.url()).pathname.endsWith('/tap-1'));
      } finally { await Promise.all(contexts.map(context => context.close())); }
    });

    await t.test('shared engine: real broken source, confirmed fallback, controlled timeout, autoplay denial, final save and privacy', async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await page.goto(origin + '/__qa/embed');
      await page.addScriptTag({ url: origin + '/vendor/hls-1.7.3.min.js' });
      await page.addScriptTag({ url: origin + '/js/player-ux.js' });
      await page.addScriptTag({ url: origin + '/js/player-recovery.js' });
      await page.evaluate(origin => {
        window.results = { states: [], fallback: 0, saved: 0 };
        const video = document.createElement('video'); video.muted = true; document.body.append(video);
        window.session = PlayerUX.createSession({ video, Hls, url: origin + '/__qa/broken.m3u8', timeout: 500,
          embedUrl: origin + '/__qa/embed', onState: name => results.states.push(name),
          onBeforeStop: () => results.saved++, onFailure: (time, message) => {
            PlayerRecovery.offer({ container: document.body, servers: [{ server_name: 'Primary', server_data: [{ slug: 'tap-2', link_embed: origin + '/__qa/embed' }] }],
              episode: { slug: 'tap-2' }, serverIndex: 0, time, message,
              choose: option => { results.fallback++; const frame = document.createElement('iframe'); frame.src = option.url; document.body.append(frame); } });
          } });
      }, origin);
      await page.locator('.player-recovery').waitFor({ state: 'visible' });
      await page.waitForTimeout(650);
      assert.equal(await page.evaluate(() => results.fallback), 0, 'the engine reports failure without switching sources');
      assert.equal(await page.locator('iframe').count(), 0);
      assert.equal(await page.evaluate(() => results.saved), 1);
      assert.equal(await page.evaluate(() => session.isActive()), false);
      await page.locator('.player-recovery-confirm').click();
      await page.waitForFunction(() => results.fallback === 1);
      assert.equal(await page.locator('iframe').getAttribute('src'), origin + '/__qa/embed');
      assert.equal(await page.evaluate(() => results.saved), 1);
      await page.evaluate(() => {
        class SilentHls { static isSupported() { return true; } static Events = { MANIFEST_PARSED: 'manifest', ERROR: 'error' }; on() {} loadSource() {} attachMedia() {} destroy() {} }
        window.timeoutStates = [];
        PlayerUX.createSession({ video: document.createElement('video'), Hls: SilentHls, url: '/never', timeout: 30, onState: name => timeoutStates.push(name) });
      });
      await page.waitForFunction(() => timeoutStates.includes('error'));
      await page.evaluate(origin => {
        window.deniedStates = [];
        const video = document.createElement('video'); document.body.append(video); video.muted = true;
        const realPlay = video.play.bind(video); let denied = true;
        video.play = () => denied ? Promise.reject(new DOMException('QA policy denial', 'NotAllowedError')) : realPlay();
        window.allowPlay = () => { denied = false; window.denied.play(); };
        window.denied = PlayerUX.createSession({ video, Hls, url: origin + '/__qa/sample.m3u8', timeout: 3000, onState: (name, message) => deniedStates.push([name, message]) });
      }, origin);
      await page.waitForFunction(() => deniedStates.some(([name, message]) => name === 'paused' && message));
      await page.evaluate(() => {
        const video = document.querySelector('video:last-of-type');
        video.dispatchEvent(new Event('canplay')); video.dispatchEvent(new Event('waiting'));
      });
      assert.equal(await page.evaluate(() => deniedStates.at(-1)[0]), 'paused');
      assert.ok(await page.evaluate(() => Boolean(deniedStates.at(-1)[1])));
      assert.equal(await page.evaluate(() => denied.isActive()), true);
      await page.evaluate(() => allowPlay());
      await page.waitForFunction(() => deniedStates.some(([name]) => name === 'ready'));
      await waitPlayback(page, 'video:last-of-type');
      const telemetryResponse = page.waitForResponse(response => response.url().endsWith('/api/playback/events'));
      await page.evaluate(() => denied.destroy());
      await page.waitForFunction(() => document.querySelector('video:last-of-type').paused);
      assert.equal((await telemetryResponse).status(), 503);
      assert.ok(telemetry.some(batch => batch.events.some(event => event.event === 'ready')));
      for (const batch of telemetry) for (const event of batch.events) {
        assert.ok(['start', 'ready', 'error', 'stall', 'resume', 'fallback', 'end'].includes(event.event));
        assert.ok(Object.keys(event).every(key => ['event', 'provider', 'startup_ms', 'duration_ms'].includes(key)));
        assert.ok(['hls', 'native', 'unknown'].includes(event.provider));
        assert.ok(Number.isInteger(event.duration_ms) && event.duration_ms >= 0 && event.duration_ms <= 86400000);
      }
      await context.close();
    });
  } finally {
    if (browser) await browser.close();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    globalThis.fetch = originalFetch;
    blockedProviders.forEach((file, i) => { if (previousModules[i]) require.cache[file] = previousModules[i]; else delete require.cache[file]; });
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
