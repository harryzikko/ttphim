const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('mobile hero uses portrait poster, switches to tablet/landscape backdrop and preserves active movie on resize', () => {
  const dom = new JSDOM('<section><div id="m-spotlight-bg"></div></section>', { runScripts: 'outside-only', url: 'https://site.test/mobile' });
  try {
    const win = dom.window, layer = win.document.getElementById('m-spotlight-bg');
    const viewport = (w, h) => { win.innerWidth = w; win.innerHeight = h; win.dispatchEvent(new win.Event('resize')); };
    win.eval(read('public/js/hero-artwork.js'));
    viewport(390, 844);
    const first = { name: 'First', poster_url: 'https://source.test/poster.jpg', thumb_url: 'https://source.test/backdrop.jpg', hero_poster_url: 'https://tmdb.test/poster.jpg', hero_poster_srcset: 'https://tmdb.test/poster.jpg 1000w', hero_poster_fallback: 'https://source.test/poster.jpg', hero_backdrop_url: 'https://tmdb.test/backdrop.jpg', hero_backdrop_srcset: 'https://tmdb.test/backdrop.jpg 1920w', banner_mobile: 'https://tmdb.test/backdrop.jpg' };
    win.HeroArtwork.setBackdrop(layer, first, true);
    const img = layer.querySelector('img');
    assert.equal(layer.dataset.artworkFormat, 'poster'); assert.equal(img.src, first.hero_poster_url); assert.equal(img.srcset, first.hero_poster_srcset);
    img.dispatchEvent(new win.Event('error')); assert.equal(img.src, first.poster_url); assert.equal(img.hasAttribute('srcset'), false);
    viewport(768, 1024); assert.equal(layer.dataset.artworkFormat, 'backdrop'); assert.equal(img.src, first.hero_backdrop_url);
    const second = { ...first, name: 'Second', hero_poster_url: 'https://tmdb.test/second-poster.jpg', hero_backdrop_url: 'https://tmdb.test/second-backdrop.jpg', banner_mobile: 'https://tmdb.test/second-backdrop.jpg' };
    win.HeroArtwork.setBackdrop(layer, second, true);
    viewport(390, 844); assert.equal(img.src, second.hero_poster_url);
    viewport(844, 390); assert.equal(img.src, second.hero_backdrop_url);
    viewport(390, 844);
    win.HeroArtwork.setBackdrop(layer, { ...second, banner_mobile: 'https://custom.test/mobile.jpg', hero_mobile_custom: true, hero_mobile_srcset: '' }, true);
    assert.equal(layer.dataset.artworkFormat, 'custom'); assert.equal(img.src, 'https://custom.test/mobile.jpg');
    viewport(820, 1180); assert.equal(img.src, 'https://custom.test/mobile.jpg');
    win.HeroArtwork.setBackdrop(layer, first, false); assert.equal(img.src, first.hero_backdrop_url);
    viewport(352, 780);
    win.HeroArtwork.setBackdrop(layer, first, false);
    assert.equal(img.src, first.hero_poster_url, 'regular home route also uses the poster on portrait phones');
    assert.equal(layer.dataset.artworkFormat, 'poster');
    viewport(820, 1180); assert.equal(img.src, first.hero_backdrop_url);
  } finally { dom.window.close(); }
});

test('all mobile pages allow zoom and load the responsive shell; offline tab contains no demo movies', () => {
  for (const file of ['index', 'kham-pha', 'chi-tiet', 'xem-phim', 'danh-sach', 'tai-khoan']) {
    const html = read(`public/mobile/${file}.html`), dom = new JSDOM(html);
    try {
      assert.ok(dom.window.document.querySelector('link[href="/mobile/css/responsive.css?v=1.0.0"]'));
      assert.ok(!dom.window.document.querySelector('meta[name="viewport"]').content.includes('user-scalable=no'));
      const scripts = [...dom.window.document.querySelectorAll('script[src]')].map(script => script.src);
      assert.equal(new Set(scripts).size, scripts.length, `${file}: duplicate scripts`);
      if (file === 'danh-sach') { assert.equal(dom.window.document.getElementById('badgeDownloads').textContent, '0'); assert.equal(dom.window.document.querySelectorAll('#downloadsList img, #downloadsList button').length, 0); }
    } finally { dom.window.close(); }
  }
});

test('shared sheets lock and restore the document, close on Escape and restore trigger focus', async () => {
  const dom = new JSDOM('<button id="trigger">Open</button><div class="bottom-sheet-backdrop"><div class="bottom-sheet-content"><button id="closeFilterSheetBtn">Close</button></div></div>', { url: 'https://site.test/mobile/kham-pha', runScripts: 'outside-only' });
  try {
    const win = dom.window;
    win.eval(read('public/mobile/js/mobile-app.js') + ';window.testApp = MobileApp;');
    const app = win.testApp;
    app.init = () => {};
    app.setupSheets();
    const trigger = win.document.getElementById('trigger'), sheet = win.document.querySelector('.bottom-sheet-backdrop');
    const close = win.document.getElementById('closeFilterSheetBtn'); close.onclick = () => sheet.classList.remove('active');
    trigger.focus(); sheet.classList.add('active'); await tick();
    assert.equal(win.document.body.style.position, 'fixed'); assert.equal(win.document.documentElement.style.overflow, 'hidden');
    assert.equal(win.document.querySelector('[role="dialog"]').getAttribute('aria-modal'), 'true');
    close.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await tick();
    assert.equal(sheet.classList.contains('active'), false); assert.equal(win.document.body.style.position, ''); assert.equal(win.document.activeElement, trigger);
  } finally { dom.window.close(); }
});

test('both home templates load the same phone hero composition after their base styles', () => {
  for (const file of ['public/index.html', 'public/mobile/index.html']) {
    const html = read(file);
    assert.ok(html.indexOf('/css/hero-phone.css?v=1.1.0') > html.indexOf('/css/hero-artwork.css?v='));
    if (file.includes('/mobile/')) assert.ok(html.indexOf('/css/hero-phone.css?v=1.1.0') > html.indexOf('/mobile/css/responsive.css?v='));
  }
});
