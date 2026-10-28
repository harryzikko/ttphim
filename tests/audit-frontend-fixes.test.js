const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

// All controllers run against local DOM/API fixtures; no server or account is contacted.
function browser(t, html, url = '/danh-sach') {
  const dom = new JSDOM(html, { url: `https://fixture.test${url}`, runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
    get() { return this.textContent; }, set(value) { this.textContent = value; }
  });
  w.console = { log() {}, error() {}, warn() {} };
  w.fetch = () => assert.fail('Unexpected network request');
  let initialize;
  const add = w.document.addEventListener.bind(w.document);
  w.document.addEventListener = (event, callback, ...rest) => {
    if (event === 'DOMContentLoaded') initialize = callback;
    else add(event, callback, ...rest);
  };
  return { w, doc: w.document, start: () => initialize() };
}

async function library(t, tab, overrides = {}) {
  const f = browser(t, read('public/danh-sach.html'), `/danh-sach?tab=${tab}`);
  const movie = { movie_slug: 'fixture', movie_name: 'Fixture', episode_slug: 'tap-1', current_time: 30, progress_percent: 30 };
  const data = { watchlist: [movie], history: [movie], continueWatching: [movie] };
  const calls = [], confirmations = [], messages = [];
  let fetches = 0;
  f.w.fetch = async () => {
    fetches++;
    return { status: 200, ok: true, json: async () => ({ status: true, data }) };
  };
  f.w.API = {
    getBaseUrl: () => '',
    batchRemoveWatchlist: async slugs => { calls.push(['watchlist', ...slugs]); return { status: true }; },
    setContinueHidden: async (slug, hidden) => { calls.push(['continue', slug, hidden]); return { status: true }; },
    removeFromHistory: async slug => { calls.push(['history', slug]); return { status: true }; },
    ...overrides
  };
  f.w.confirm = text => { confirmations.push(text); return true; };
  f.w.showToast = (...args) => messages.push(args);
  f.w.eval(read('public/js/library.js'));
  await f.start(); await tick();
  const select = () => {
    f.doc.getElementById('toggleBatchBtn').click();
    f.doc.querySelector('.card-batch-cb').click();
  };
  const remove = () => f.doc.querySelector('#batchActionBar button.bg-error-container').click();
  return { ...f, calls, confirmations, messages, select, remove, fetches: () => fetches };
}

for (const tab of ['watchlist', 'continue', 'history']) {
  test(`batch ${tab} uses only its own mutation and explicit confirmation`, async t => {
    const f = await library(t, tab);
    f.select(); f.remove(); await tick(); await tick();
    assert.deepEqual(f.calls, tab === 'watchlist' ? [['watchlist', 'fixture']] : tab === 'continue' ? [['continue', 'fixture', true]] : [['history', 'fixture']]);
    assert.equal(f.confirmations.length, 1);
    assert.match(f.confirmations[0], tab === 'watchlist' ? /yêu thích/ : tab === 'continue' ? /Xem tiếp.*giữ nguyên lịch sử/ : /xóa lịch sử xem và tiến trình/);
    assert.equal(f.fetches(), 2);
    assert.equal(f.doc.querySelector('.card-batch-cb'), null);
    assert.equal([...f.doc.querySelectorAll('#batchActionBar button')].some(el => el.textContent.includes('Chuyển mục')), false);
  });
}

test('cancelled history confirmation performs no mutation; unsupported tab cannot batch', async t => {
  const f = await library(t, 'history');
  f.w.confirm = () => false;
  f.select(); f.remove(); await tick();
  f.doc.querySelector('.btn-remove-single-hist').click(); await tick();
  assert.deepEqual(f.calls, []);
  assert.equal(f.fetches(), 1);
  f.doc.querySelectorAll('.tab-btn')[3].click();
  assert.equal(f.doc.getElementById('toggleBatchBtn').disabled, true);
  assert.equal(f.doc.querySelector('.card-batch-cb'), null);
});

for (const failure of ['false', 'throw']) {
  test(`batch continue ${failure} retains selection, releases control and never reports success`, async t => {
    const f = await library(t, 'continue', { setContinueHidden: async () => {
      if (failure === 'throw') throw new Error('Fixture outage');
      return { status: false };
    } });
    f.select(); f.remove(); await tick();
    assert.equal(f.fetches(), 1);
    assert.equal(f.doc.querySelector('.card-batch-cb').checked, true);
    assert.equal(f.doc.querySelector('#batchActionBar button.bg-error-container').disabled, false);
    assert.deepEqual(f.calls, []);
    assert.equal(f.messages.length, 1);
    assert.equal(f.messages[0][1], 'error');
  });
}

test('batch stays pending until confirmation and a tab switch cannot change the operation', async t => {
  let resolve;
  const f = await library(t, 'continue', { setContinueHidden: () => new Promise(done => { resolve = done; }) });
  f.select(); f.remove();
  assert.equal(f.fetches(), 1);
  assert.equal(f.doc.querySelector('#batchActionBar button.bg-error-container').disabled, true);
  f.doc.querySelectorAll('.tab-btn')[1].click();
  resolve({ status: true }); await tick(); await tick();
  assert.deepEqual(f.calls, []);
  assert.equal(f.fetches(), 2);
  assert.ok(f.doc.querySelector('.btn-remove-wl'));
});

test('report API sends description in the JSON request body', async t => {
  const f = browser(t, '');
  const api = new f.w.Function(`${read('public/js/api.js')}; return API;`)();
  const calls = [];
  api.request = async (...args) => { calls.push(args); return { status: true }; };
  await api.reportError('fixture', 'tap-2', 'Video', 'Stops at 15:20');
  assert.equal(calls[0][0], '/api/movies/fixture/report');
  assert.deepEqual(JSON.parse(calls[0][1].body), { episode_slug: 'tap-2', reason: 'Video', details: 'Stops at 15:20' });
});

test('report false/throw keeps the description and supports retry, closes only on confirmed success', async t => {
  const f = browser(t, '');
  const source = read('public/js/watch.js');
  const modalSource = source.slice(source.indexOf('  function openReportModal()'), source.indexOf('  function openRateModal()'));
  const calls = [], messages = [];
  let state = 'false', resolve;
  const api = { reportError: async (...args) => {
    calls.push(args);
    if (state === 'throw') throw new Error('Fixture network failure');
    if (state === 'pending') return new Promise(done => { resolve = done; });
    return { status: false, message: 'Fixture rejection' };
  } };
  f.w.showToast = (...args) => messages.push(args);
  const open = new f.w.Function('API', 'movieData', 'currentEpisode', 'cleanEpName', 'escapeHtml', `${modalSource}; return openReportModal;`)(api, { movie: { slug: 'fixture', name: 'Fixture' } }, { slug: 'tap-1', name: '1' }, value => value, value => String(value));
  open();
  const modal = f.doc.getElementById('modal-report');
  const button = modal.querySelector('#submit-report-btn');
  const details = modal.querySelector('#report-details-input');
  details.value = 'Fixture draft';
  const original = button.innerHTML;
  for (const outcome of ['false', 'throw']) {
    state = outcome; await button.onclick();
    assert.equal(modal.classList.contains('hidden'), false);
    assert.equal(details.value, 'Fixture draft');
    assert.equal(button.disabled, false);
    assert.equal(button.innerHTML, original);
    assert.equal(messages.at(-1)[1], 'error');
  }
  state = 'pending'; const pending = button.onclick();
  await button.onclick();
  assert.equal(calls.length, 3);
  assert.equal(button.disabled, true);
  resolve({ status: true }); await pending;
  assert.equal(modal.classList.contains('hidden'), true);
  assert.equal(button.disabled, false);
  assert.equal(messages.at(-1)[1], undefined);
  assert.ok(calls.every(args => args[3] === 'Fixture draft'));
});

test('mobile history replaces the destructive legacy inline handler with a real management link', t => {
  const f = browser(t, `<section id="m-section-continue"><button onclick="localStorage.removeItem('TTPHIM_continue_watching'); location.reload();">Clear</button><div id="m-rail-continue"></div></section>`);
  f.w.localStorage.setItem('TTPHIM_continue_watching', 'fixture');
  f.w.eval(read('public/mobile/js/home.js'));
  f.w.renderMobileContinueWatching();
  const link = f.doc.querySelector('#m-section-continue a');
  assert.equal(link.getAttribute('href'), '/mobile/danh-sach?tab=history');
  assert.equal(link.hasAttribute('onclick'), false);
  assert.equal(f.doc.querySelector('button'), null);
  assert.equal(f.w.localStorage.getItem('TTPHIM_continue_watching'), 'fixture');
});

test('mobile security stays on its native account section without desktop redirect', async t => {
  const f = browser(t, read('public/mobile/tai-khoan.html'), '/mobile/tai-khoan');
  f.w.API = { getMe: async () => ({ id: 'fixture', email: 'fixture@example.test' }), getLibrary: async () => ({ watchlist: [] }) };
  f.w.eval(read('public/mobile/js/tai-khoan.js'));
  await f.start();
  assert.equal(f.doc.getElementById('settingDevices').getAttribute('href'), '#m-security-devices');
  assert.ok(f.doc.getElementById('m-security-devices'));
  assert.match(read('public/mobile/tai-khoan.html'), /account-security\.js/);
});

test('catalog and desktop Top10 render keyboard-native links with safe provider metadata', async t => {
  const hostile = { slug: `film'\" onmouseover=\"bad`, name: '<img src=x onerror=bad>', poster_url: 'javascript:bad()', quality: '\"><img src=x onerror=bad>', year: '<svg onload=bad>', views: 'bad' };
  const catalog = browser(t, '<main><section class="grid"></section></main>', '/kham-pha');
  const source = read('public/js/catalog.js');
  const helperSource = source.slice(source.indexOf('  const escapeHtml'), source.indexOf("  console.log"));
  const renderSource = source.slice(source.indexOf('  function renderGrid('), source.indexOf('  function renderPagination('));
  const grid = catalog.doc.querySelector('section');
  const render = new catalog.w.Function('gridContainer', 'currentFilter', `${helperSource}\n${renderSource}; return renderGrid;`)(grid, { type: 'all' });
  render([hostile]);
  const card = grid.querySelector('a.movie-card');
  assert.ok(card); assert.equal(card.tabIndex, 0);
  assert.equal(card.getAttribute('href'), `/phim/${encodeURIComponent(hostile.slug).replace(/'/g, '%27')}`);
  assert.equal(grid.querySelectorAll('img').length, 1);
  assert.equal(grid.querySelector('img').getAttribute('src'), '/favicon.svg');
  assert.equal(grid.querySelector('[onclick], [onmouseover], [onerror], svg'), null);
  assert.equal(grid.querySelector('h3').textContent, hostile.name);

  const home = browser(t, '<section id="bang-xep-hang"><div id="top10-rail"></div></section>', '/');
  home.w.API = { getHome: async () => ({ rankings: [hostile] }) };
  home.w.eval(read('public/js/home.js')); await home.start();
  const link = home.doc.querySelector('a.top10-item');
  assert.ok(link); assert.equal(link.tabIndex, 0);
  assert.equal(link.getAttribute('href'), card.getAttribute('href'));
  assert.equal(link.querySelector('h4').textContent, hostile.name);
  assert.equal(link.querySelectorAll('img').length, 1);
  assert.equal(link.querySelector('img').getAttribute('src'), '/favicon.svg');
  assert.equal(link.querySelector('[onclick], [onmouseover], [onerror], svg'), null);
  link.focus(); assert.equal(home.doc.activeElement, link);
});

for (const [value, expected] of [[0, '0'], ['0', '0'], [undefined, 'Chưa có dữ liệu'], [null, 'Chưa có dữ liệu'], ['', 'Chưa có dữ liệu'], [-1, 'Chưa có dữ liệu'], ['invalid', 'Chưa có dữ liệu'], [128000, '128.000']]) {
  test(`detail views ${String(value)} are factual, not fabricated`, async t => {
    const f = browser(t, read('public/chi-tiet.html'), '/phim/fixture');
    f.w.API = {
      getMovieDetail: async () => ({ movie: { slug: 'fixture', name: 'Fixture', view: value, category: [], actor: [], director: [] }, episodes: [], related: [] }),
      getMe: async () => null, getComments: async () => [], getMovies: async () => ({ items: [] }), request: async () => ({ status: true, data: { total: 0 } })
    };
    f.w.showToast = () => {};
    f.w.eval(read('public/js/detail.js')); await f.start(); await tick();
    assert.equal(f.doc.querySelector('p.text-secondary-container.font-bold').textContent, expected);
    assert.equal(f.doc.title, 'Fixture - CineViet');
    const pills = f.doc.querySelector('div.flex.flex-wrap.items-center.gap-space-xs');
    assert.doesNotMatch(pills.textContent, /4K Ultra HD|Vietsub/);
  });
}
