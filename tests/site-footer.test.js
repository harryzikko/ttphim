const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const express = require('express');
const { pages, footer, informationPage, email } = require('../scripts/site-content.cjs');
const { targets, updateTemplate } = require('../scripts/build-site-footer.cjs');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('public templates contain one static, consistent footer with real links and approved contact', () => {
  for (const file of targets) {
    const html = read(file), dom = new JSDOM(html);
    try {
      const doc = dom.window.document, footers = doc.querySelectorAll('footer.cv-footer');
      assert.equal(footers.length, 1, file);
      assert.equal(doc.querySelectorAll('footer').length, 1, file);
      const f = footers[0];
      assert.equal(f.closest('main'), null, file);
      assert.equal(f.querySelectorAll('.cv-footer-group').length, 3);
      assert.ok(f.querySelector(`a[href="mailto:${email}"]`));
      assert.equal(f.querySelectorAll('a[href="#"],a[href="javascript:void(0)"]').length, 0);
      for (const page of pages) assert.ok(f.querySelector(`a[href="/${page.slug}"]`), `${file}: ${page.slug}`);
      assert.equal(doc.querySelectorAll('script[src="/js/site-footer.js?v=1.0.0"]').length, 1);
      assert.equal(updateTemplate(html, file.includes('/mobile/')), html, `${file}: idempotent build`);
      if (file.includes('/mobile/')) assert.ok(f.querySelector('a[href="/mobile/kham-pha?type=phim-bo"]'));
    } finally { dom.window.close(); }
  }
});

test('information pages have unique SEO metadata, one main heading and full content without JavaScript', () => {
  const titles = new Set(), descriptions = new Set();
  for (const page of pages) {
    const html = read(`public/${page.slug}.html`), dom = new JSDOM(html);
    try {
      assert.equal(html, informationPage(page));
      const doc = dom.window.document;
      assert.equal(doc.querySelectorAll('main h1').length, 1);
      assert.equal(doc.querySelector('main h1').textContent, page.title);
      assert.equal(doc.documentElement.lang, 'vi');
      assert.equal(doc.querySelector('meta[name="description"]').content, page.description);
      assert.equal(doc.querySelector('meta[property="og:title"]').content, doc.title);
      assert.ok(doc.querySelectorAll('article section').length >= 4);
      assert.ok(doc.querySelector('a[href="mailto:admin@cineviet.live"]'));
      titles.add(doc.title); descriptions.add(doc.querySelector('meta[name="description"]').content);
    } finally { dom.window.close(); }
  }
  assert.equal(titles.size, pages.length); assert.equal(descriptions.size, pages.length);
});

test('footer disclosure preserves links, accessible state and restores desktop groups after resize', async () => {
  const dom = new JSDOM(footer(), { url: 'https://site.test/', runScripts: 'outside-only' });
  try {
    let change;
    const phone = { matches: true, addEventListener(name, fn) { change = fn; } };
    dom.window.matchMedia = () => phone;
    dom.window.eval(read('public/js/site-footer.js')); await tick();
    const doc = dom.window.document, button = doc.querySelector('.cv-footer-group-toggle'), group = button.closest('.cv-footer-group'), list = group.querySelector('ul');
    assert.equal(button.getAttribute('aria-expanded'), 'false'); assert.equal(list.inert, true);
    assert.equal(button.getAttribute('aria-controls'), list.id);
    button.click(); assert.equal(button.getAttribute('aria-expanded'), 'true'); assert.equal(list.inert, false);
    button.click(); assert.equal(group.classList.contains('is-collapsed'), true);
    phone.matches = false; change();
    assert.equal(button.getAttribute('aria-expanded'), 'true'); assert.equal(list.inert, false);
    assert.equal(doc.querySelectorAll('footer a').length, 18);
    assert.equal(doc.querySelector('[data-footer-top]').hidden, false);
  } finally { dom.window.close(); }
});

test('all footer information URLs serve their own public document, including mobile user agents', async () => {
  const app = express(); app.use(require('../src/routes/viewRoutes'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    for (const page of pages) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/${page.slug}`, { headers: { 'user-agent': 'Mozilla/5.0 iPhone' }, redirect: 'manual' });
      assert.equal(response.status, 200, page.slug);
      assert.match(response.headers.get('content-type'), /text\/html/);
      assert.ok((await response.text()).includes(page.title.replaceAll('&', '&amp;')));
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
