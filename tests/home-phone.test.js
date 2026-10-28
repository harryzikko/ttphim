const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('six-film limit lives only inside the phone breakpoint and covers both home templates', () => {
  const dom = new JSDOM(`<style>${read('public/css/home-phone.css')}</style>`);
  try {
    const rules = [...dom.window.document.styleSheets[0].cssRules];
    const phone = rules.find(rule => rule.conditionText === '(max-width: 767px)');
    assert.ok(phone);
    const limit = [...phone.cssRules].find(rule => rule.selectorText?.includes('#section-moi-cap-nhat > div.grid > :nth-child(n+7)'));
    assert.ok(limit.selectorText.includes('#m-rail-latest > :nth-child(n+7)'));
    assert.equal(limit.style.display, 'none');
    assert.ok(!rules.some(rule => rule.selectorText?.includes('nth-child(n+7)')));
    const labels = rules.find(rule => rule.selectorText?.includes('.home-title-phone'));
    assert.equal(labels.style.display, 'none');
  } finally { dom.window.close(); }
});

test('home templates load compact styling after hero styles and preserve desktop section labels', () => {
  for (const file of ['public/index.html', 'public/mobile/index.html']) {
    const html = read(file), dom = new JSDOM(html);
    try {
      assert.ok(html.indexOf('/css/home-phone.css?v=1.0.0') > html.indexOf('/css/hero-phone.css?v='));
      assert.ok(dom.window.document.querySelector('.home-title-full'));
      assert.ok(dom.window.document.querySelector('.home-title-phone'));
      if (file === 'public/index.html') {
        assert.equal(dom.window.document.querySelector('#section-chieu-rap .home-title-full').textContent, 'Phim Chiếu Rạp Bom Tấn');
        assert.equal(dom.window.document.querySelector('#section-chieu-rap .home-title-phone').textContent, 'Chiếu rạp');
        assert.ok(dom.window.document.querySelector('#tab-btn-explore-region'));
        assert.ok(dom.window.document.querySelector('#tab-btn-explore-genre'));
        assert.ok(dom.window.document.querySelector('#home-cinema-promo .home-phone-copy'));
      }
    } finally { dom.window.close(); }
  }
});
