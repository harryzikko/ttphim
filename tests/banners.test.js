const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const banners = require('../src/services/bannerService');
const slots = ['header', 'footer', 'side_left', 'side_right', 'below_featured', 'below_player'];
const ad = { slot: 'below_featured', enabled: true, title: 'Partner', description: 'A short message', image_desktop: 'https://images.test/a.jpg', image_mobile: 'https://images.test/m.jpg', href: '/kham-pha', new_tab: true };

function ads(settings = {}) { return banners.getAds(settings); }

test('six advertising slots start disabled and legacy placements migrate without touching featured films', () => {
  const settings = { featured_slugs: ['film'], banner_config: { ads: [{ ...ad, slot: 'home_middle' }, { ...ad, slot: 'home_footer', enabled: false }] } };
  assert.deepEqual(ads(settings).ads.map(item => item.slot), slots);
  assert.equal(ads(settings).ads.find(item => item.slot === 'below_featured').enabled, true);
  assert.equal(ads(settings).ads.find(item => item.slot === 'footer').enabled, false);
  assert.equal(ads({}).ads.every(item => item.enabled === false), true);
  assert.deepEqual(settings.featured_slugs, ['film']);
  assert.equal(ads({ ...settings, advertising: { ads: [] } }).ads.every(item => !item.enabled), true);
});

test('advertising validator rejects unsafe URLs, duplicate slots, invalid dates, focal points and incomplete ads', () => {
  assert.equal(banners.normalizeAds({ ads: [ad] }).ads[0].focal_x, 50);
  for (const href of ['javascript:alert(1)', '//evil.test', '/\\evil', 'https://user:password@evil.test']) {
    assert.throws(() => banners.normalizeAds({ ads: [{ ...ad, href }] }));
  }
  assert.throws(() => banners.normalizeAds({ ads: [ad, ad] }));
  assert.throws(() => banners.normalizeAds({ ads: [{ ...ad, slot: 'unknown' }] }));
  assert.throws(() => banners.normalizeAds({ ads: [{ ...ad, start: 'invalid' }] }));
  assert.throws(() => banners.normalizeAds({ ads: [{ ...ad, start: '2026-05-02T00:00:00Z', end: '2026-05-01T00:00:00Z' }] }));
  assert.throws(() => banners.normalizeAds({ ads: [{ ...ad, image_desktop: '' }] }));
  assert.throws(() => banners.normalizeAds({ ads: [{ ...ad, focal_x: 'invalid' }] }));
});

test('featured movies still use existing pins and overrides independently of advertising', () => {
  const data = { spotlights: [{ slug: 'a', name: 'A', thumb_url: 'https://images.test/a.jpg' }, { slug: 'b', name: 'B' }], latest: [] };
  const settings = { featured_slugs: ['b', 'a'], banner_config: banners.normalize({ slides: [
    { slug: 'b', enabled: false }, { slug: 'a', title: 'Edited', image_mobile: 'https://images.test/mobile.jpg', focal_x: 25 }
  ], ads: [] }), advertising: { ads: [ad] } };
  const displayed = banners.applyHome(data, settings);
  assert.deepEqual(displayed.spotlights.map(movie => movie.slug), ['a']);
  assert.equal(displayed.spotlights[0].banner_title, 'Edited');
  assert.equal(displayed.spotlights[0].name, 'A');
  assert.equal(displayed.spotlights[0].banner_mobile, 'https://images.test/mobile.jpg');
  assert.equal(displayed.spotlights[0].banner_position, '25% 50%');
  assert.equal(data.spotlights[0].name, 'A');
  assert.deepEqual(banners.applyHome(data, { featured_slugs: ['b', 'a'], advertising: { ads: [ad] } }).spotlights.map(item => item.slug), ['b', 'a']);
});

test('six placements render only at intended page positions, escape copy and expire per request', () => {
  const config = banners.normalizeAds({ ads: slots.map(slot => ({ ...ad, slot, title: '<script>alert(1)</script>' })) });
  const settings = { advertising: config };
  const home = '<html><head></head><body class="home"><main><div id="hero"></div><!-- banner:below_featured --><div id="films"></div></main><footer></footer></body></html>';
  const watch = '<html><head></head><body class="watch"><main><div id="player-viewport"></div><!-- banner:below_player --><div id="controls"></div></main><footer></footer></body></html>';
  const desktop = new JSDOM(banners.decorate(home, settings)).window.document;
  const mobile = new JSDOM(banners.decorate(watch, settings, true)).window.document;
  assert.deepEqual([...desktop.querySelectorAll('[data-ad-slot]')].map(item => item.dataset.adSlot), ['header', 'below_featured', 'footer', 'side_left', 'side_right']);
  assert.deepEqual([...mobile.querySelectorAll('[data-ad-slot]')].map(item => item.dataset.adSlot), ['header', 'below_player', 'footer']);
  assert.equal(desktop.querySelector('#hero').nextElementSibling.dataset.adSlot, 'below_featured');
  assert.equal(mobile.querySelector('#player-viewport').nextElementSibling.dataset.adSlot, 'below_player');
  assert.equal(desktop.querySelectorAll('script').length, 0);
  assert.equal(desktop.querySelector('img').getAttribute('loading'), 'lazy');
  assert.equal(desktop.querySelector('a').getAttribute('rel'), 'sponsored noopener noreferrer');
  assert.equal(banners.renderAd({ ...ad, end: '2000-01-01T00:00:00Z' }), '');
  assert.equal(banners.active({ enabled: true, start: '2026-01-01T00:00:00Z', end: '2026-02-01T00:00:00Z' }, Date.parse('2026-02-01T00:00:00Z')), false);
  const css = fs.readFileSync(path.join(__dirname, '../public/css/editorial.css'), 'utf8');
  assert.match(css, /@media\(min-width:1600px\)/);
  assert.match(css, /\.ad-side_left, \.ad-side_right \{ display:none; \}/);
  assert.match(css, /max-width:1200px/);
});

test('admin edits advertising only, previews safely, saves a revision and retains draft on conflict', async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../public/admin.html'), 'utf8'), { url: 'http://localhost/admin', runScripts: 'outside-only' });
  const { window } = dom;
  const callbacks = [];
  const originalAdd = window.document.addEventListener.bind(window.document);
  window.document.addEventListener = (event, callback, options) => event === 'DOMContentLoaded' ? callbacks.push(callback) : originalAdd(event, callback, options);
  let saved = null, url = null;
  const config = ads({ featured_slugs: ['a'] });
  window.API = { request: async (endpoint, options) => {
    url = endpoint;
    if (options) { saved = JSON.parse(options.body); return { status: true, data: { ...saved, revision: 'next' } }; }
    return { status: true, data: structuredClone(config) };
  } };
  window.confirm = () => true;
  window.eval(fs.readFileSync(path.join(__dirname, '../public/js/admin-banners.js'), 'utf8'));
  callbacks.forEach(callback => callback());
  window.document.querySelector('[data-tab="tab-banners"]').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(window.document.querySelectorAll('#banner-ads details').length, 6);
  const input = window.document.querySelector('#banner-ads [data-slot="header"] [data-field="title"]');
  input.value = '<img src=x onerror=alert(1)>'; input.dispatchEvent(new window.Event('input'));
  assert.equal(window.document.querySelector('#banner-preview img[onerror]'), null);
  assert.ok(window.document.querySelector('#banner-preview').textContent.includes('<img'));
  window.document.querySelector('[data-preview="mobile"]').click();
  assert.equal(window.document.querySelector('#banner-preview').dataset.mode, 'mobile');
  window.document.querySelector('#banner-save').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(url, '/api/admin/advertising');
  assert.equal(saved.ads.length, 6);
  assert.equal(saved.revision, config.revision);
  assert.equal('slides' in saved, false);
  assert.match(window.document.querySelector('#banner-status').textContent, /Đã lưu/);
  window.API.request = async () => ({ status: false, message: 'Phiên bản đã thay đổi' });
  const edited = window.document.querySelector('#banner-ads [data-slot="header"] [data-field="title"]');
  edited.value = 'Keep this draft'; edited.dispatchEvent(new window.Event('input'));
  window.document.querySelector('#banner-save').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(edited.disabled, false);
  assert.equal(edited.value, 'Keep this draft');
  assert.match(window.document.querySelector('#banner-status').textContent, /Phiên bản/);
  dom.window.close();
});

test('real page templates place ads outside player and immediately below featured carousel', () => {
  const home = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const mobileHome = fs.readFileSync(path.join(__dirname, '../public/mobile/index.html'), 'utf8');
  const watch = fs.readFileSync(path.join(__dirname, '../public/xem-phim.html'), 'utf8');
  const mobileWatch = fs.readFileSync(path.join(__dirname, '../public/mobile/xem-phim.html'), 'utf8');
  for (const html of [home, mobileHome]) assert.ok(html.indexOf('banner:below_featured') > html.indexOf('home-hero') || html.indexOf('banner:below_featured') > html.indexOf('m-spotlight-section'));
  for (const html of [watch, mobileWatch]) {
    const doc = new JSDOM(banners.decorate(html, { advertising: { ads: [{ ...ad, slot: 'below_player' }] } }, html === mobileWatch)).window.document;
    const placement = doc.querySelector('[data-ad-slot="below_player"]');
    assert.ok(placement);
    assert.equal(placement.closest('#player-viewport, #m-player-container'), null);
  }
});

test('KKPhim dashboard renders upstream totals, zero and unavailable states in real HTML', () => {
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../public/admin.html'), 'utf8'), { runScripts: 'outside-only' });
  dom.window.eval(fs.readFileSync(path.join(__dirname, '../public/js/admin-sources.js'), 'utf8'));
  const source = { kkphim: { total_movies: 30323, total_pages: 1264, status: 'online' }, total_web_movies: 30323, total_all_sources: 30323 };
  dom.window.renderAdminSources(source);
  const get = id => dom.window.document.getElementById(id).textContent;
  assert.equal(get('source-kkphim-count'), '30.323 phim');
  assert.equal(get('source-kkphim-pages'), '1.264 trang');
  assert.equal(get('sources-stat-kkphim'), '30.323');
  assert.match(get('source-kkphim-status'), /Đã xác minh/);
  dom.window.renderAdminSources({ kkphim: { total_movies: 0, total_pages: 0, status: 'online' }, total_web_movies: 0, total_all_sources: 0 });
  assert.equal(get('sources-total-web'), '0');
  dom.window.renderAdminSources({ kkphim: { status: 'unavailable' }, total_web_movies: null });
  assert.equal(get('source-kkphim-count'), 'Chưa xác minh phim');
  assert.match(get('source-kkphim-status'), /Chưa lấy/);
  dom.window.close();
});

test('server-rendered watch page retains below-player ad after player hydration', () => {
  const template = require('../src/services/templateService');
  const raw = fs.readFileSync(path.join(__dirname, '../public/xem-phim.html'), 'utf8');
  const detail = { movie: { slug: 'film', name: 'Film', content: '', poster_url: '', thumb_url: '', category: [], country: [] }, episodes: [{ server_name: 'KKPhim', server_data: [{ slug: 'tap-1', name: 'Tập 1', link_embed: 'https://example.test/embed' }] }], related: [] };
  const rendered = template.renderWatch(raw, detail, 'tap-1');
  const doc = new JSDOM(banners.decorate(rendered, { advertising: { ads: [{ ...ad, slot: 'below_player' }] } })).window.document;
  const placement = doc.querySelector('[data-ad-slot="below_player"]');
  assert.ok(placement, 'ad remains after replacing the player');
  assert.equal(placement.closest('#player-viewport'), null);
  assert.ok(rendered.includes('<!-- banner:below_player -->'));
  doc.defaultView.close();
});
