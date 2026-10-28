const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('public/danh-sach.html');
const source = read('public/js/library-stats.js');

function fixture(t) {
  const dom = new JSDOM(html, { url: 'https://cineviet.test/danh-sach', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  dom.window.eval(source);
  const root = dom.window.document.getElementById('library-stats');
  return { window: dom.window, root, render: (data, state) => dom.window.LibraryStats.render(root, data, state) };
}

function noFakeData(root) {
  assert.doesNotMatch(root.textContent, /\+14%|84%|46%|28%|18%|26 tập|Chuyện Ma Giảng Đường 4|9\.0|IMDb|★/);
  assert.equal(root.querySelector('[onclick]'), null);
}

test('static summary has honest loading states and no fabricated metrics', t => {
  const { root } = fixture(t);
  assert.equal(root.getAttribute('aria-busy'), 'true');
  assert.match(root.textContent, /Đang tải/);
  assert.match(root.textContent, /không phải thời gian thực xem/);
  noFakeData(root);
});

test('empty and malformed library data produce empty states, not fake numbers', t => {
  const { root, render } = fixture(t);
  for (const data of [{ history: [], watchlist: [] }, null, { history: {}, watchlist: [null] }]) {
    render(data);
    assert.match(root.textContent, /Chưa có lịch sử/);
    assert.match(root.textContent, /Chưa có dữ liệu thể loại/);
    assert.match(root.textContent, /Chưa có phim trong danh sách/);
    assert.equal(root.querySelector('.library-stats__value'), null);
    assert.equal(root.querySelector('.library-stats__movie'), null);
    noFakeData(root);
  }
});

test('sums latest saved positions per title, clamps to duration, never guesses watch time', t => {
  const { window, root, render } = fixture(t);
  const data = {
    history: [
      { movie_slug: 'seen', current_time: 7200, updated_at: '2026-01-01' },
      { movie_slug: 'seen', current_time: '3600', duration: 4000, updated_at: '2026-02-01' },
      { movie_slug: 'other', current_time: 120, duration: 90 },
      { movie_slug: 'missing', progress_percent: 75, current_time: null },
      { movie_slug: 'negative', current_time: -42 },
      { movie_slug: 'infinite', current_time: 'Infinity' }
    ],
    watchlist: [
      { movie_slug: 'SEEN', movie_name: 'Seen title' },
      { movie_slug: 'unseen', movie_name: 'Unseen title', origin_name: 'Original title', poster_url: '/poster.webp', rating: 9.0 },
      { movie_slug: 'unseen', movie_name: 'Duplicate title' }
    ]
  };
  const summary = window.LibraryStats.summarize(data);
  assert.equal(summary.savedSeconds, 3690);
  assert.equal(summary.positionCount, 2);
  assert.equal(summary.historyCount, 5);
  render(data);
  assert.match(root.textContent, /1 giờ 1 phút 30 giây/);
  assert.match(root.textContent, /2\/5 tựa phim/);
  const links = root.querySelectorAll('.library-stats__movie');
  assert.equal(links.length, 1);
  assert.equal(links[0].getAttribute('href'), '/phim/unseen');
  assert.match(links[0].textContent, /Unseen title/);
  noFakeData(root);
});

test('genre counts require explicit history metadata and do not infer country or watchlist defaults', t => {
  const { root, render } = fixture(t);
  render({ history: [{ movie_slug: 'k-drama', country: 'Hàn Quốc', movie_name: 'Korean romance' }], watchlist: [{ movie_slug: 'k-drama', category: 'Điện ảnh' }] });
  assert.match(root.querySelector('#library-saved-genres').textContent, /Chưa có dữ liệu/);
  render({ history: [
    { movie_slug: 'a', category: [{ name: 'Hành Động' }, { name: 'Hành Động' }, { name: 'Tâm Lý' }] },
    { movie_slug: 'b', category: 'Hành Động, Tình Cảm' },
    { movie_slug: 'c' }
  ], watchlist: [] });
  const list = root.querySelector('.library-stats__genres');
  assert.equal(list.children.length, 3);
  assert.match(list.children[0].textContent, /Hành Động2 tựa phim/);
  assert.match(root.querySelector('#library-saved-genres').textContent, /2\/3 tựa phim/);
  assert.doesNotMatch(list.textContent, /%/);
});

test('unsafe names and categories remain text; invalid slugs and poster protocols are rejected', t => {
  const { root, render } = fixture(t);
  const attack = '<img src=x onerror="alert(1)">';
  render({
    history: [{ movie_slug: 'seen', category: [attack] }],
    watchlist: [
      { movie_slug: '../escape', movie_name: 'bad link' },
      { movie_slug: 'javascript:alert(1)', movie_name: 'bad scheme' },
      { movie_slug: 'safe', movie_name: attack, origin_name: '<script>alert(1)</script>', poster_url: 'javascript:alert(1)' },
      { movie_slug: 'safe-two', movie_name: 'Second', poster_url: 'data:image/svg+xml,<svg onload=alert(1)>' },
      { movie_slug: 'safe-three', movie_name: 'Third', poster_url: '//evil.test/image.webp' }
    ]
  });
  assert.equal(root.querySelectorAll('.library-stats__movie').length, 3);
  assert.equal(root.querySelectorAll('img, script, [onerror], [onload]').length, 0);
  assert.match(root.textContent, /<img src=x/);
  for (const link of root.querySelectorAll('.library-stats__movie')) {
    assert.match(link.getAttribute('href'), /^\/phim\/safe/);
  }
  noFakeData(root);
});

test('guest, loading, and error clear previous records and ratings', t => {
  const { root, render } = fixture(t);
  for (const [state, expected] of [['loading', /Đang tải/], ['guest', /Đăng nhập/], ['error', /Không thể tải/]]) {
    render({ history: [{ movie_slug: 'seen', current_time: 600 }], watchlist: [{ movie_slug: 'unseen', movie_name: 'Private title' }] });
    render(null, state);
    assert.match(root.textContent, expected);
    assert.doesNotMatch(root.textContent, /Private title|600/);
    assert.equal(root.querySelector('.library-stats__movie'), null);
    assert.equal(root.getAttribute('aria-busy'), String(state === 'loading'));
    noFakeData(root);
  }
});

for (const scenario of [
  { status: 401, state: 'guest' },
  { status: 403, state: 'error' },
  { status: 500, state: 'error' },
  { status: 200, state: 'ready' },
  { status: 200, state: 'error', malformed: true }
]) {
  test(`controller shares authenticated library response: HTTP ${scenario.status}, ${scenario.state}`, async t => {
    const { window, root } = fixture(t);
    const requests = [];
    window.API = { getBaseUrl: () => '' };
    window.console.error = () => {};
    window.fetch = async (url, options) => {
      requests.push({ url, options });
      return {
        status: scenario.status, ok: scenario.status === 200,
        json: async () => scenario.malformed ? { status: false } : { status: true, data: { history: [], watchlist: [], continueWatching: [] } }
      };
    };
    // Let jsdom's initial DOMContentLoaded finish before installing the controller.
    await new Promise(resolve => window.setTimeout(resolve, 0));
    window.eval(read('public/js/library.js'));
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await new Promise(resolve => window.setTimeout(resolve, 0));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/api/user/library');
    assert.equal(requests[0].options.credentials, 'include');
    assert.equal(root.dataset.state, scenario.state);
    assert.equal(root.getAttribute('aria-busy'), 'false');
    assert.equal(window.document.querySelector('#library-cards-container .animate-pulse'), null);
    noFakeData(root);
  });
}
