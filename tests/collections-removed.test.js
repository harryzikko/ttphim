const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function assertVisible(window, element) {
  assert.ok(element, 'Original content must remain present');
  for (let current = element; current; current = current.parentElement) {
    assert.equal(current.hidden, false);
    assert.equal(current.classList.contains('hidden'), false);
    assert.notEqual(window.getComputedStyle(current).display, 'none');
  }
}

test('collection routes, service, assets, old tests and documentation are removed', () => {
  for (const file of ['src/routes/collectionRoutes.js', 'src/services/collectionService.js',
    'public/js/admin-collections.js', 'public/js/home-collections.js',
    'public/css/admin-collections.css', 'public/css/collections.css',
    'tests/collections.test.js', 'CURATED_COLLECTIONS.md']) {
    assert.equal(fs.existsSync(path.join(root, file)), false, file);
  }
  assert.doesNotMatch(read('src/server.js'), /collectionRoutes|collectionService|\/home\/collections|\/admin\/collections/);
  assert.match(read('src/server.js'), /app\.use\('\/api', apiRoutes\)/);
});

test('admin has no collection tab or includes and retains its existing navigation', () => {
  const html = read('public/admin.html');
  assert.doesNotMatch(html, /admin-collections|collections\.css|tab-collections|collection-editor/);
  const dom = new JSDOM(html);
  try {
    for (const tab of ['overview', 'users', 'movies', 'banners', 'sources', 'settings', 'system']) {
      assert.ok(dom.window.document.querySelector(`[data-tab="tab-${tab}"]`));
      assert.ok(dom.window.document.getElementById(`tab-${tab}`));
    }
  } finally { dom.window.close(); }
});

for (const mobile of [false, true]) test(`${mobile ? 'mobile' : 'ordinary'} home retains visible secondary content without collection mounts/includes`, () => {
  const html = read(`public/${mobile ? 'mobile/' : ''}index.html`);
  assert.doesNotMatch(html, /home-collections|collections\.css|data-collection-secondary/);
  const dom = new JSDOM(html);
  try {
    const { window } = dom, doc = window.document;
    const secondary = mobile ? doc.getElementById('m-rail-anime')?.closest('section') : doc.getElementById('section-kham-pha-khu-vuc-the-loai');
    assertVisible(window, secondary);
    assert.ok(secondary.querySelector(mobile ? 'a[href="/mobile/kham-pha?type=hoat-hinh"]' : '#explore-region-grid'));
    for (const id of mobile ? ['m-spotlight-section', 'm-rail-latest', 'm-rail-top10'] : ['home-hero', 'section-moi-cap-nhat', 'bang-xep-hang']) {
      assertVisible(window, doc.getElementById(id)?.closest('section'));
    }
    assert.ok(doc.getElementById(mobile ? 'm-section-continue' : 'section-continue-watching'));
    assert.equal(doc.querySelectorAll('footer.cv-footer').length, 1);
  } finally { dom.window.close(); }
});
