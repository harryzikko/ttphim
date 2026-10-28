'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
async function fixture(mobile = false, phone = true) {
  const dom = new JSDOM(read(mobile ? 'public/mobile/kham-pha.html' : 'public/kham-pha.html'), { url: 'http://localhost/kham-pha', runScripts: 'outside-only' });
  const media = { matches: phone, addEventListener(_, fn) { this.change = fn; } };
  dom.window.matchMedia = () => media;
  dom.window.eval(read('public/js/catalog-layout.js'));
  await new Promise(resolve => dom.window.setTimeout(resolve, 0));
  return { dom, window: dom.window, doc: dom.window.document, media };
}
for (const mobile of [false, true]) {
  test(`catalog ${mobile ? 'mobile' : 'standard'}: dynamic titles and metadata remain text-only`, async () => {
    const { dom, window, doc } = await fixture(mobile);
    try {
      const update = window.CatalogLayout.update;
      const titles = { 'phim-bo': 'Phim bộ', 'phim-le': 'Phim lẻ', 'chieu-rap': 'Phim chiếu rạp', 'phim-chieu-rap': 'Phim chiếu rạp', 'song-ngu': 'Phim Song Ngữ', 'hoat-hinh': 'Anime & hoạt hình', 'tv-shows': 'TV Show & Gameshow' };
      for (const [type, title] of Object.entries(titles)) {
        update({ type });
        assert.equal(doc.getElementById('catalog-page-title').textContent, title);
        assert.equal(doc.title, `${title} | CineViet`);
      }
      update({ category: 'hanh-dong' });
      assert.equal(doc.getElementById('catalog-page-title').textContent, 'Phim hanh-dong');
      update({ category: 'hanh-dong', country: 'viet-nam', year: '2025', format: 'fhd' }, { categories: [{ slug: 'hanh-dong', name: '<img src=x onerror=alert(1)>' }], countries: [{ slug: 'viet-nam', name: 'Việt Nam' }] });
      assert.equal(doc.getElementById('catalog-page-title').querySelector('img'), null);
      assert.match(doc.getElementById('catalog-page-title').textContent, /<img/);
      if (!mobile) {
        assert.equal(doc.getElementById('catalog-filter-count').textContent, '4');
        assert.match(doc.getElementById('catalog-filter-summary').textContent, /Việt Nam/);
      }
      update({ country: 'viet-nam' }, { countries: [{ slug: 'viet-nam', name: 'Việt Nam' }] });
      assert.equal(doc.getElementById('catalog-page-title').textContent, 'Phim Việt Nam');
      update({ keyword: 'duong', country: 'viet-nam' });
      assert.equal(doc.getElementById('catalog-page-title').textContent, 'Kết quả tìm kiếm');
      update({ type: 'all', country: 'all', category: 'all', year: 'all', format: 'all' });
      assert.equal(doc.getElementById('catalog-page-title').textContent, 'Khám phá phim');
      if (!mobile) assert.equal(doc.getElementById('catalog-filter-count').hidden, true);
    } finally { dom.window.close(); }
  });
}
test('phone advanced filters collapse accessibly without losing values and restore on wide screens', async () => {
  const { dom, window, doc, media } = await fixture();
  try {
    const toggle = doc.getElementById('catalog-filter-toggle');
    const advanced = doc.getElementById('catalog-advanced-filters');
    const year = doc.getElementById('filter-year');
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(advanced.inert, true);
    toggle.click();
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(advanced.inert, false);
    year.value = '2025';
    year.focus();
    year.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(advanced.inert, true);
    assert.equal(doc.activeElement, toggle);
    assert.equal(year.value, '2025');
    toggle.click();
    doc.getElementById('btn-apply-filters').click();
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    media.matches = false; media.change();
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(advanced.inert, false);
    year.focus(); media.matches = true; media.change();
    assert.equal(advanced.inert, true);
    assert.equal(doc.activeElement, toggle);
    assert.equal(year.value, '2025');
  } finally { dom.window.close(); }
});
test('catalog templates include all type choices, unique IDs, labels and shared presentation assets', async () => {
  for (const mobile of [false, true]) {
    const { dom, doc } = await fixture(mobile, false);
    try {
      const ids = [...doc.querySelectorAll('[id]')].map(el => el.id);
      assert.equal(ids.length, new Set(ids).size);
      assert.equal(doc.querySelectorAll('h1').length, 1);
      assert.ok(doc.querySelector('link[href="/css/catalog-phone.css?v=1.0.0"]'));
      assert.ok(doc.querySelector('script[src="/js/catalog-layout.js?v=1.0.0"]'));
      const types = [...doc.querySelectorAll(mobile ? '.m-chip[data-type]' : '.filter-type-btn')];
      assert.equal(types.length, 7);
      assert.ok(types.some(el => el.textContent.includes('Song Ngữ')));
      if (!mobile) {
        for (const id of ['filter-country', 'filter-year', 'filter-format', 'filter-sort']) {
          assert.ok(doc.querySelector(`label[for="${id}"]`));
          assert.ok(doc.getElementById('catalog-advanced-filters').contains(doc.getElementById(id)));
        }
        assert.equal(doc.getElementById('catalog-filter-toggle').getAttribute('aria-expanded'), 'true');
      }
    } finally { dom.window.close(); }
  }
});
