const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const helper = fs.readFileSync(path.join(root, 'public/js/watch-view-modes.js'), 'utf8');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function fixture(mobile = false) {
  const dom = new JSDOM(`<!doctype html><body><header><a href="#">Home</a></header>
    <main><nav><button id="btn-cinema-mode"><span id="light-label">Lights</span></button>
    ${mobile ? '' : '<button id="btn-theater-toggle">Theater</button>'}</nav>
    <section><div id="${mobile ? 'm-player-wrapper' : 'player-viewport'}"><div>
    <button id="play">Play</button><iframe title="Provider" src="about:blank"></iframe><video></video>
    </div></div><aside>Episodes</aside><div id="info"><a href="#">Info</a></div></section></main>
    <footer aria-hidden="false" inert="original">Footer</footer></body>`, { url: 'https://watch.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.scrollTo = ({ left, top }) => { window.scrollX = left; window.scrollY = top; };
  window.eval(helper);
  const controller = window.WatchViewModes.init();
  return { dom, window, doc: window.document, controller };
}
const escape = window => window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

test('independent explicit modes, ARIA, Escape order and unchanged media identity/source/time', () => {
  const { window, doc, controller } = fixture();
  try {
    const iframe = doc.querySelector('iframe'), video = doc.querySelector('video'), parent = iframe.parentNode;
    video.currentTime = 91;
    assert.equal(window.WatchViewModes.init(), controller);
    assert.deepEqual(JSON.parse(JSON.stringify(controller.getState())), { lightsOff: false, theater: false });
    doc.getElementById('btn-theater-toggle').click();
    assert.equal(doc.body.classList.contains('watch-theater-active'), true);
    assert.equal(doc.body.classList.contains('cinema-lights-active'), false);
    doc.getElementById('btn-cinema-mode').click();
    assert.equal(doc.getElementById('btn-cinema-mode').getAttribute('aria-pressed'), 'true');
    assert.equal(doc.getElementById('btn-theater-toggle').getAttribute('aria-pressed'), 'true');
    escape(window);
    assert.equal(controller.getState().lightsOff, false);
    assert.equal(controller.getState().theater, true);
    escape(window);
    assert.equal(controller.getState().theater, false);
    assert.equal(doc.querySelector('iframe'), iframe);
    assert.equal(iframe.parentNode, parent);
    assert.equal(iframe.getAttribute('src'), 'about:blank');
    assert.equal(doc.querySelector('video'), video);
    assert.equal(video.currentTime, 91);
  } finally { window.close(); }
});

test('lights isolate all surroundings, trap focus, allow player clicks, restore focus/inert/scroll', async () => {
  const { window, doc, controller } = fixture();
  try {
    const light = doc.getElementById('btn-cinema-mode');
    light.focus(); window.scrollY = 187;
    light.click();
    assert.equal(window.scrollY, 187);
    for (const selector of ['header', 'aside', '#info', 'footer', 'nav']) assert.ok(doc.querySelector(selector).closest('[inert]'), selector);
    assert.equal(doc.getElementById('play').closest('[inert]'), null);
    const exit = doc.getElementById('btn-floating-light');
    assert.equal(doc.activeElement, exit);
    const tab = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    exit.dispatchEvent(tab);
    assert.equal(tab.defaultPrevented, true);
    assert.equal(doc.activeElement, doc.getElementById('play'));
    let played = 0;
    doc.getElementById('play').addEventListener('click', () => played++);
    doc.getElementById('play').click();
    assert.equal(played, 1);
    assert.equal(controller.getState().lightsOff, true);
    const added = doc.createElement('button'); added.textContent = 'New surrounding UI'; doc.body.append(added);
    await new Promise(resolve => window.setTimeout(resolve, 0));
    assert.equal(added.hasAttribute('inert'), true);
    doc.getElementById('cinema-backdrop-scrim').click();
    assert.equal(doc.activeElement, light);
    assert.equal(window.scrollY, 187);
    assert.equal(doc.querySelector('footer').getAttribute('inert'), 'original');
    assert.equal(doc.querySelector('footer').getAttribute('aria-hidden'), 'false');
    assert.equal(doc.querySelector('header').hasAttribute('inert'), false);
    assert.equal(added.hasAttribute('inert'), false);
  } finally { window.close(); }
});

test('fullscreen Escape is left native; cleanup removes listeners and permits a single clean init', () => {
  const { window, doc, controller } = fixture();
  try {
    controller.setTheater(true); controller.setLights(true);
    Object.defineProperty(doc, 'fullscreenElement', { configurable: true, value: doc.querySelector('video') });
    escape(window);
    assert.equal(controller.getState().lightsOff, true);
    Object.defineProperty(doc, 'fullscreenElement', { configurable: true, value: null });
    controller.destroy(); controller.destroy();
    assert.equal(doc.body.className, '');
    assert.equal(doc.querySelector('header').hasAttribute('inert'), false);
    assert.equal(doc.getElementById('cinema-backdrop-scrim'), null);
    doc.getElementById('btn-cinema-mode').click();
    assert.equal(doc.body.className, '');
    const next = window.WatchViewModes.init();
    doc.getElementById('btn-cinema-mode').click();
    assert.equal(next.getState().lightsOff, true);
    window.dispatchEvent(new window.Event('pagehide'));
    assert.equal(doc.body.className, '');
  } finally { window.close(); }
});

test('mobile exposes lights only because its existing player is already full width', () => {
  const { window, doc, controller } = fixture(true);
  try {
    doc.getElementById('btn-cinema-mode').click();
    assert.equal(controller.getState().lightsOff, true);
    controller.setTheater(true);
    assert.equal(controller.getState().theater, false);
    doc.getElementById('btn-floating-light').click();
    assert.equal(controller.getState().lightsOff, false);
  } finally { window.close(); }
});

test('templates load overrides last, preserve embed-help/footer boundary and use one mode controller', () => {
  for (const file of ['public/xem-phim.html', 'public/mobile/xem-phim.html']) {
    const html = read(file);
    const styles = [...html.matchAll(/<link[^>]+href="([^"]+\.css[^\"]*)"/g)].map(match => match[1]);
    assert.match(styles.at(-1), /watch-view-modes\.css\?v=/);
    assert.match(html, /watch-view-modes\.js\?v=/);
    const dom = new JSDOM(html);
    assert.equal(dom.window.document.querySelectorAll('[id$="embed-player-help"]').length, 1);
    assert.ok(dom.window.document.querySelector('main [id$="embed-player-help"]'));
    assert.equal(dom.window.document.querySelector('footer [id$="embed-player-help"]'), null);
    dom.window.close();
  }
  assert.doesNotMatch(read('public/js/watch.js'), /scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\);\s*}\s*window.showToast\('\ud83c\udfac/);
  assert.doesNotMatch(helper, /requestFullscreen|\.src\s*=|\.currentTime\s*=|\.play\(/);
});

test('real browser: full bleed at wide/phone/landscape sizes, dimmer hit testing, iframe continuity and resize', async t => {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch { t.skip('Playwright not installed'); return; }
  if (!fs.existsSync(chromium.executablePath())) { t.skip('Chromium not installed'); return; }
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, hasTouch: true });
    const page = await context.newPage();
    let template = 'public/xem-phim.html';
    // No server, accounts, providers or history APIs: only local presentation assets are served.
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://watch.test') return route.abort();
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: read(template).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '') });
      const relative = url.pathname.replace(/^\//, '');
      if (!/^(css|mobile\/css)\/[\w.-]+\.css$/.test(relative)) return route.abort();
      return route.fulfill({ contentType: 'text/css', body: read('public/' + relative) });
    });
    async function mount(mobile = false) {
      template = mobile ? 'public/mobile/xem-phim.html' : 'public/xem-phim.html';
      await page.goto('http://watch.test/');
      await page.evaluate(mobile => {
        const stage = document.getElementById(mobile ? 'm-player-wrapper' : 'player-viewport');
        stage.innerHTML = '<div style="width:100%;height:100%;position:relative"><video style="width:100%;height:100%;object-fit:contain" playsinline></video><iframe title="Mock provider" style="position:absolute;inset:0;width:100%;height:100%;border:0" srcdoc="<button style=\'position:absolute;inset:0\' onclick=\'parent.mockPlays++\'>Play</button>"></iframe></div>';
        window.mockPlays = 0; window.mockLoads = 0;
        const frame = stage.querySelector('iframe');
        frame.addEventListener('load', () => window.mockLoads++);
        window.originalFrame = frame; window.originalVideo = stage.querySelector('video'); window.originalParent = stage.parentNode;
        window.originalVideo.currentTime = 74;
      }, mobile);
      await page.frameLocator('iframe[title="Mock provider"]').locator('button').waitFor();
      await page.addScriptTag({ content: helper });
      if (!mobile) await page.addScriptTag({ content: read('public/js/movie-phone.js') });
    }
    await mount();
    const baselineLoads = await page.evaluate(() => window.mockLoads);
    for (const size of [{ width: 1920, height: 1080 }, { width: 2560, height: 1080 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(size);
      await page.evaluate(() => window.WatchViewModes.init().setTheater(true));
      await page.waitForTimeout(60);
      const metrics = await page.evaluate(() => {
        const stage = document.getElementById('player-viewport'), rect = stage.getBoundingClientRect(), media = stage.firstElementChild.getBoundingClientRect();
        const side = document.getElementById('watch-side-column').getBoundingClientRect();
        return { x: rect.x, width: rect.width, height: rect.height, viewport: innerWidth, vh: innerHeight, mediaWidth: media.width, mediaHeight: media.height, below: side.top >= rect.bottom, duplicate: document.querySelectorAll('#watch-side-column').length, overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert.ok(Math.abs(metrics.x) < 1 && Math.abs(metrics.width - size.width) < 1, JSON.stringify({ size, metrics }));
      assert.ok(metrics.height <= size.height && metrics.mediaHeight <= metrics.height + 1);
      assert.ok(Math.abs(metrics.mediaWidth / metrics.mediaHeight - 16 / 9) < 0.02, JSON.stringify({ size, metrics }));
      assert.equal(metrics.below, true); assert.equal(metrics.duplicate, 1); assert.equal(metrics.overflow, false);
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.evaluate(() => { window.scrollTo(0, 0); document.getElementById('btn-cinema-mode').focus(); });
    const original = await page.locator('#player-viewport').boundingBox();
    await page.locator('#btn-cinema-mode').click();
    assert.equal(await page.locator('#btn-floating-light').evaluate(el => document.activeElement === el), true);
    await page.evaluate(() => document.querySelector('#player-viewport > div').requestFullscreen());
    const fullscreenSize = await page.locator('#player-viewport > div').boundingBox();
    assert.ok(Math.abs(fullscreenSize.width - 1920) < 1 && Math.abs(fullscreenSize.height - 1080) < 1);
    await page.evaluate(() => document.exitFullscreen());
    const dimmed = await page.locator('#player-viewport').boundingBox();
    assert.deepEqual(dimmed, original);
    const hit = await page.evaluate(() => {
      const player = document.getElementById('player-viewport'), rect = player.getBoundingClientRect();
      const frame = player.querySelector('iframe'), fr = frame.getBoundingClientRect();
      return {
        header: document.elementFromPoint(10, 10)?.id,
        play: document.elementFromPoint(fr.x + fr.width / 2, fr.y + fr.height / 2) === frame,
        transform: getComputedStyle(player).transform, shadow: getComputedStyle(player).boxShadow,
        halo: getComputedStyle(player, '::before').content,
        headerInert: document.querySelector('header').inert, infoInert: !!document.getElementById('watch-film-info').closest('[inert]')
      };
    });
    assert.equal(hit.header, 'cinema-backdrop-scrim'); assert.equal(hit.play, true);
    assert.equal(hit.transform, 'none'); assert.equal(hit.shadow, 'none'); assert.equal(hit.halo, 'none');
    assert.equal(hit.headerInert, true); assert.equal(hit.infoInert, true);
    await page.evaluate(() => {
      const toast = document.createElement('div'); toast.id = 'toast-container';
      toast.style.cssText = 'position:fixed;inset:0 auto auto 0;width:60px;height:60px;z-index:99999;background:white';
      document.body.append(toast);
    });
    await page.waitForTimeout(10);
    assert.equal(await page.evaluate(() => document.elementFromPoint(10, 10).id), 'cinema-backdrop-scrim');
    await page.frameLocator('iframe[title="Mock provider"]').locator('button').tap();
    assert.equal(await page.evaluate(() => window.mockPlays), 1);
    await page.locator('#btn-floating-light').click();
    assert.equal(await page.evaluate(() => document.body.classList.contains('watch-theater-active')), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.body.classList.contains('watch-theater-active')), false);
    const continuity = await page.evaluate(() => ({ same: document.querySelector('#player-viewport iframe') === window.originalFrame, parent: document.getElementById('player-viewport').parentNode === window.originalParent, video: document.querySelector('#player-viewport video') === window.originalVideo, time: window.originalVideo.currentTime, loads: window.mockLoads }));
    assert.deepEqual(continuity, { same: true, parent: true, video: true, time: 74, loads: baselineLoads });
    await page.evaluate(() => { window.scrollTo(0, 160); window.WatchViewModes.init().setLights(true); });
    assert.equal(await page.evaluate(() => window.scrollY), 160);
    await page.mouse.click(10, 10);
    assert.equal(await page.evaluate(() => window.scrollY), 160);
    await page.evaluate(() => window.WatchViewModes.init().setTheater(true));
    assert.equal(await page.evaluate(() => window.scrollY), 160);
    await page.evaluate(() => window.WatchViewModes.init().setTheater(false));
    assert.equal(await page.evaluate(() => window.scrollY), 160);
    await page.evaluate(() => window.WatchViewModes.init().setLights(true));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(20);
    assert.equal(await page.locator('#watch-side-column').evaluate(el => !!el.closest('[inert]')), true);
    assert.equal(await page.locator('#player-viewport').evaluate(el => !!el.closest('[inert]')), false);
    await page.evaluate(() => window.WatchViewModes.init().destroy());
    assert.equal(await page.locator('#watch-side-column').evaluate(el => !!el.closest('[inert]')), false);
    for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size); await mount(true);
      await page.locator('#btn-cinema-mode').scrollIntoViewIfNeeded();
      const before = await page.locator('#m-player-wrapper').boundingBox();
      await page.locator('#btn-cinema-mode').click();
      assert.deepEqual(await page.locator('#m-player-wrapper').boundingBox(), before);
      await page.frameLocator('iframe[title="Mock provider"]').locator('button').tap();
      assert.equal(await page.evaluate(() => window.mockPlays), 1);
      await page.locator('#btn-floating-light').click();
      assert.equal(await page.evaluate(() => document.querySelector('#m-player-wrapper iframe') === window.originalFrame), true);
      assert.equal(await page.locator('#btn-theater-toggle').count(), 0);
    }
    await context.close();
  } finally { await browser.close(); }
});
