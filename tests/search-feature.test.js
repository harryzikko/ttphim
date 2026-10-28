const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// Evaluate services with mock config/providers: no dotenv, database, timers or network.
function services() {
  const viContext = { module: { exports: {} }, require: name => { if (name === './catalogFormat') return require('../src/services/catalogFormat'); assert.equal(name, 'path'); return path; }, console };
  vm.runInNewContext(read('src/services/vicdnService.js').replace('module.exports = new ViCDNService();', 'module.exports = Object.create(ViCDNService.prototype);'), viContext);
  const vi = viContext.module.exports;
  vi.isInitialized = true;
  vi.allMovies = [];
  vi.hasBilingualMatch = () => false;
  const context = { module: { exports: {} }, URLSearchParams, console, require: name => {
    if (name === '../config') return { KKPHIM_API_BASE: 'https://provider.invalid', IMAGE_CDN: 'https://images.invalid', CACHE_TTL: {} };
    if (name === './vicdnService') return vi;
    if (name === './nguoncService') return { hasMatch: () => false, getNguoncServers: async () => [] };
    if (name === './catalogFormat') return require('../src/services/catalogFormat');
    throw new Error(`Unexpected dependency: ${name}`);
  } };
  vm.runInNewContext(read('src/services/kkphimService.js'), context);
  const kk = context.module.exports;
  kk.fetchJson = async () => { throw new Error('Unmocked provider'); };
  return { kk, vi };
}
const response = items => ({ status: true, data: { items, params: { pagination: { totalItems: items.length, totalPages: 1 } } } });
const movie = (slug, name, extra = {}) => ({ slug, name, year: 2025, type: 'series', country: [{ slug: 'viet-nam' }], category: [{ slug: 'hanh-dong' }], ...extra });

test('Vietnamese accents including d-stroke, NFD, original names and combined filters', async () => {
  const { kk } = services();
  const items = [movie('duong-doi', 'Đường Đời', { original_name: 'Road of Life' }), movie('duong-khac', 'Đường Khác', { year: 2024 })];
  const requests = [];
  kk.fetchJson = async endpoint => { requests.push(new URL(endpoint, 'https://mock.invalid')); return response(items); };
  for (const keyword of ['duong doi', 'ĐƯỜNG ĐỜI', 'Đường Đời'.normalize('NFD'), 'road of life']) {
    const result = await kk.getCatalog({ keyword, type: 'phim-bo', country: 'viet-nam', category: 'hanh-dong', year: '2025' });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].slug, 'duong-doi');
    assert.equal(result.items[0].origin_name, 'Road of Life');
    assert.equal(result.searchInfo.limited, true);
  }
  assert.ok(requests.every(url => url.searchParams.get('year') === '2025' && url.searchParams.get('country') === 'viet-nam'));
});

test('accent-sensitive upstream gets folded query and bounded latest fallback never inserts irrelevant movies', async () => {
  const { kk } = services();
  const queries = [];
  kk.fetchJson = async endpoint => {
    const url = new URL(endpoint, 'https://mock.invalid');
    queries.push(url.searchParams.get('keyword'));
    return response(url.searchParams.get('keyword') === 'Duong Doi' ? [movie('duong-doi', 'Đường Đời')] : [movie('unrelated', 'Không Liên Quan')]);
  };
  assert.equal((await kk.getCatalog({ keyword: 'Đường Đời' })).items[0].slug, 'duong-doi');
  assert.ok(queries.includes('Duong Doi'));
  assert.equal((await kk.getCatalog({ keyword: 'zzzzzzz' })).items.length, 0);
  assert.ok(queries.length <= 5);
});

test('merge Song Ngu once before paging; stable totals and no oversized/duplicate pages', async () => {
  const { kk, vi } = services();
  kk.fetchJson = async () => response([movie('kk-a', 'Đường A'), movie('kk-b', 'Đường B')]);
  vi.allMovies = [{ slug: 'tv-a', vname: 'Đường A', ename: 'Road A', year: 2025, type: 'tv' }, { slug: 'tv-c', vname: 'Đường C', year: 2025, type: 'tv' }];
  const first = await kk.getCatalog({ keyword: 'duong', limit: 2 });
  const second = await kk.getCatalog({ keyword: 'duong', limit: 2, page: 2 });
  assert.equal(first.items.length, 2);
  assert.equal(first.items[0].has_song_ngu, true);
  assert.equal(second.items.length, 1);
  assert.equal(second.items[0].slug, 'tv-c');
  assert.equal(first.pagination.totalItems, 3);
  assert.equal(second.pagination.totalItems, 3);
  assert.equal(first.pagination.totalPages, 2);
  assert.equal((await kk.quickSearch('duong')).length, 3);
});

test('provider outage is not empty success and retry recovers without cached failure', async () => {
  const { kk } = services();
  const failed = await kk.getCatalog({ keyword: 'duong' });
  assert.equal(failed.error, 'provider_unavailable');
  kk.fetchJson = async () => response([movie('duong', 'Đường')]);
  assert.equal((await kk.getCatalog({ keyword: 'duong' })).items.length, 1);
  kk.cache.flushAll();
  kk.fetchJson = async () => ({ status: false });
  assert.equal((await kk.getCatalog({})).error, 'provider_unavailable');
});

test('Song Ngu catalog respects category/country/year, excludes unverified seed, and uses no KK provider', async () => {
  const { kk, vi } = services();
  vi.allMovies = [
    { slug: 'tv-a', vname: 'Đường Đời', ename: 'Road of Life', year: 2019, type: 'tv', country: ['VN'], genre: ['Hành Động'] },
    { slug: 'tv-seed', vname: 'Đường Đời', year: 2019, country: ['VN'], genre: ['Hành Động'], search_unverified: true }
  ];
  const result = await kk.getCatalog({ type: 'song-ngu', keyword: 'duong doi', year: 'pre-2020', country: 'viet-nam', category: 'hanh-dong' });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].has_song_ngu, true);
  assert.equal(result.items[0].source, 'vicdn');
  assert.equal((await vi.searchViCdn('road of life')).length, 1);
  assert.equal((await vi.getCatalog({ country: 'han-quoc' })).items.length, 0);
});

test('provider scan and query sizes are bounded and filters are encoded', async () => {
  const { kk } = services();
  let count = 0;
  kk.fetchJson = async endpoint => {
    count++;
    const url = new URL(endpoint, 'https://mock.invalid');
    assert.equal(url.searchParams.get('country'), 'vn&admin=true');
    assert.ok((url.searchParams.get('keyword') || '').length <= 200);
    return { data: { items: Array.from({ length: 60 }, (_, index) => movie(`duong-${count}-${index}`, `Đường ${count}-${index}`)), params: { pagination: { totalItems: 999999, totalPages: 999999 } } } };
  };
  const result = await kk.getCatalog({ keyword: 'duong', country: 'vn&admin=true', page: -2, limit: 9999 });
  assert.equal(result.pagination.currentPage, 1);
  assert.equal(result.pagination.totalItemsPerPage, 60);
  assert.ok(count <= 6);
  assert.equal(result.items.length, 0);
});

async function browser(mobile, query, getCatalog) {
  const dom = new JSDOM(read(mobile ? 'public/mobile/kham-pha.html' : 'public/kham-pha.html'), { url: `https://app.invalid/${mobile ? 'mobile/' : ''}kham-pha?${query}`, runScripts: 'outside-only' });
  const { window } = dom;
  const callbacks = [];
  const original = window.document.addEventListener.bind(window.document);
  window.document.addEventListener = (event, callback, ...args) => event === 'DOMContentLoaded' ? callbacks.push(callback) : original(event, callback, ...args);
  window.API = { getCategories: async () => ({ countries: [{ slug: 'viet-nam', name: 'Việt Nam' }], categories: [{ slug: 'hanh-dong', name: 'Hành Động' }] }), getCatalog };
  window.console = { log() {}, warn() {}, error() {} };
  window.scrollTo = () => {};
  window.eval(read(mobile ? 'public/mobile/js/kham-pha.js' : 'public/js/catalog.js'));
  for (const callback of callbacks) await callback();
  await new Promise(resolve => setImmediate(resolve));
  return { dom, window, tick: () => new Promise(resolve => setImmediate(resolve)) };
}
for (const mobile of [false, true]) {
  const label = mobile ? 'mobile' : 'desktop';
  test(`${label}: restores all URL filters, paginates, back/reload and safe provider rendering`, async () => {
    const calls = [];
    const query = 'keyword=duong&type=phim-bo&category=hanh-dong&country=viet-nam&year=2025&sort=released&format=fhd&page=2';
    const catalog = async params => { calls.push({ ...params }); return { items: [movie('bad\'/slug', '<img src=x onerror=alert(1)>', { origin_name: 'Road', poster_url: 'javascript:alert(1)', quality: 'FHD', has_song_ngu: true })], pagination: { currentPage: params.page, totalPages: 4, totalItems: 100 } }; };
    const { dom, window, tick } = await browser(mobile, query, catalog);
    try {
      assert.equal(calls[0].page, 2);
      for (const [key, value] of new URLSearchParams(query)) if (key !== 'page') assert.equal(calls[0][key], value);
      const grid = mobile ? window.document.getElementById('movieGrid') : window.document.querySelector('section[aria-label="Danh sách phim tìm kiếm"]');
      assert.equal(grid.querySelectorAll('[onerror]').length, 0);
      assert.equal(grid.querySelector('img').getAttribute('src'), '/favicon.svg');
      assert.match(grid.textContent, /Song Ngữ/);
      window.document.getElementById(mobile ? 'loadMoreBtn' : 'btn-next-page').click();
      await tick();
      assert.equal(calls.at(-1).page, 3);
      assert.equal(new URL(window.location.href).searchParams.get('keyword'), 'duong');
      await new Promise(resolve => {
        window.addEventListener('popstate', resolve, { once: true });
        window.history.back();
      });
      await tick();
      assert.equal(calls.at(-1).page, 2);
      assert.equal(calls.at(-1).format, 'fhd');
      const reload = await browser(mobile, window.location.search.slice(1), catalog);
      assert.equal(calls.at(-1).page, 2);
      reload.dom.window.close();
    } finally { dom.window.close(); }
  });
  test(`${label}: real empty, relax keeps keyword, provider error retry preserves filters`, async () => {
    let mode = 'empty';
    const calls = [];
    const { dom, window, tick } = await browser(mobile, 'keyword=duong&country=viet-nam', async params => {
      calls.push({ ...params });
      return mode === 'error' ? { error: 'provider_unavailable', items: [] } : { items: [], pagination: { totalItems: 0, totalPages: 1 } };
    });
    try {
      window.document.querySelector('[data-search-action="relax"]').click();
      await tick();
      assert.equal(calls.at(-1).keyword, 'duong');
      assert.ok(['', 'all'].includes(calls.at(-1).country));
      mode = 'error';
      window.document.querySelector('[data-search-action="retry"]').click();
      await tick();
      assert.ok(window.document.querySelector('[role="alert"]'));
      mode = 'empty';
      window.document.querySelector('[data-search-action="retry"]').click();
      await tick();
      assert.equal(calls.at(-1).keyword, 'duong');
      assert.ok(window.document.querySelector('[data-search-action="relax"]'));
    } finally { dom.window.close(); }
  });
  test(`${label}: late response cannot overwrite newer filters`, async () => {
    const resolvers = [];
    const { dom, window, tick } = await browser(mobile, 'keyword=old', params => new Promise(resolve => resolvers.push({ resolve, params })));
    try {
      window.history.replaceState(null, '', '?keyword=new');
      window.dispatchEvent(new window.PopStateEvent('popstate'));
      await tick();
      resolvers[1].resolve({ items: [movie('new', 'NEW')], pagination: { totalItems: 1, totalPages: 1 } });
      await tick();
      resolvers[0].resolve({ items: [movie('old', 'OLD')], pagination: { totalItems: 1, totalPages: 1 } });
      await tick();
      const grid = mobile ? window.document.getElementById('movieGrid') : window.document.querySelector('section[aria-label="Danh sách phim tìm kiếm"]');
      assert.match(grid.textContent, /NEW/);
      assert.doesNotMatch(grid.textContent, /OLD/);
    } finally { dom.window.close(); }
  });
}

test('original non-Latin names stay searchable and punctuation is not a match-all query', async () => {
  const { kk, vi } = services();
  kk.fetchJson = async () => response([movie('original', 'Một Phim', { original_name: '\u539f\u540d' })]);
  vi.allMovies = [{ slug: 'tv-original', vname: 'Phim Khác', ename: '\u539f\u540d', year: 2024 }];
  assert.equal((await kk.getCatalog({ keyword: '\u539f\u540d' })).items.length, 2);
  assert.equal((await kk.getCatalog({ keyword: '!!!' })).items.length, 0);
  assert.equal((await vi.getCatalog({ keyword: '!!!' })).items.length, 0);
});

test('mobile filter sheet cancel discards draft and apply preserves keyword/type with other filters', async () => {
  const calls = [];
  const { dom, window, tick } = await browser(true, 'q=duong&type=song-ngu&country=viet-nam&year=2025', async params => {
    calls.push({ ...params });
    return { items: [], pagination: { totalItems: 0, totalPages: 1 } };
  });
  try {
    const click = id => window.document.getElementById(id).click();
    click('openFilterSheetBtn');
    window.document.querySelector('[data-type="category"][data-val="hanh-dong"]').click();
    click('closeFilterSheetBtn');
    click('openFilterSheetBtn');
    assert.equal(window.document.querySelector('[data-type="category"][data-val="hanh-dong"]').getAttribute('aria-pressed'), 'false');
    window.document.querySelector('[data-type="category"][data-val="hanh-dong"]').click();
    click('applyFilterBtn');
    await tick();
    assert.equal(calls.at(-1).keyword, 'duong');
    assert.equal(calls.at(-1).type, 'song-ngu');
    assert.equal(calls.at(-1).country, 'viet-nam');
    assert.equal(calls.at(-1).year, '2025');
    assert.equal(calls.at(-1).category, 'hanh-dong');
  } finally { dom.window.close(); }
});

test('ViCDN failed sync preserves verified index and later search retries safely', async () => {
  const { vi } = services();
  vi.allMovies = [{ slug: 'tv-verified', vname: 'Đường', year: 2025 }];
  vi.fetchJson = async () => { throw new Error('Mock outage'); };
  await vi.syncCatalog();
  assert.equal(vi.searchSyncUnavailable, true);
  assert.equal(vi.allMovies[0].slug, 'tv-verified');
  assert.equal((await vi.getCatalog({ keyword: 'duong' })).searchInfo.partial, true);
  vi.searchSyncAt = 0;
  let retries = 0;
  vi.syncCatalog = async () => { retries++; vi.searchSyncUnavailable = false; };
  await Promise.all([vi.getCatalog({ keyword: 'duong' }), vi.getCatalog({ keyword: 'duong' })]);
  assert.equal(retries, 1);
});

test('upstream page-size caps do not truncate a scan after its first short page', async () => {
  const { kk } = services();
  const pages = [];
  kk.fetchJson = async endpoint => {
    const page = Number(new URL(endpoint, 'https://mock.invalid').searchParams.get('page'));
    pages.push(page);
    return { data: { items: [movie(`duong-${page}`, `Đường ${page}`)], params: { pagination: { totalItems: 3, totalItemsPerPage: 1, totalPages: 3 } } } };
  };
  assert.equal((await kk.getCatalog({ keyword: 'duong' })).items.length, 3);
  assert.deepEqual(pages, [1, 2, 3]);
});

test('catalog view sends an honest shell without unsafe SSR, provider access or reflected query', async () => {
  const routes = new Map();
  const router = { use() {}, get(route, handler) { routes.set(String(route), handler); } };
  const forbidden = new Proxy({}, { get() { throw new Error('No provider, DB or template access allowed'); } });
  const context = { module: { exports: {} }, console, require: name => {
    if (name === 'express') return { Router: () => router };
    if (name === 'path') return path;
    if (name === 'fs') return { promises: { readFile: async () => read('public/kham-pha.html') } };
    if (name === '../config') return { PUBLIC_DIR: 'mock-public' };
    if (name === '../services/homePageService') return { renderHomePage: forbidden };
    if (name === '../services/seoService') return require('../src/services/seoService');
    if (name === '../services/pageError') return require('../src/services/pageError');
    return forbidden;
  } };
  vm.runInNewContext(read('src/routes/viewRoutes.js'), context);
  let html;
  await routes.get('/kham-pha')({ query: { keyword: '<img src=x onerror=alert(1)>' } }, { send(value) { html = value; } }, error => { throw error; });
  assert.ok(html);
  const dom = new JSDOM(html);
  try {
    const grid = dom.window.document.querySelector('section[aria-label="Danh sách phim tìm kiếm"]');
    assert.equal(grid.querySelector('article'), null);
    assert.match(grid.textContent, /JavaScript/);
    assert.doesNotMatch(html, /onerror=alert\(1\)|30\.256|12[,.]450/);
    assert.ok(dom.window.document.querySelector('script[src="/js/header.js?v=3.1.0"]'));
    assert.ok(dom.window.document.querySelector('script[src="/js/catalog.js?v=4.2.0"]'));
  } finally { dom.window.close(); }
});

test('format filters are applied before pagination for primary and Song Ngu catalogs', async () => {
  const {kk,vi}=services();
  kk.fetchJson=async()=>response([movie('unknown','Road unknown',{quality:undefined,lang:undefined}),movie('hd','Road HD',{quality:'HD'}),movie('fhd-a','Road FHD A',{quality:'1080p'}),movie('fhd-b','Road FHD B',{quality:'FHD'})]);
  const first=await kk.getCatalog({keyword:'road',format:'fhd',limit:1});const second=await kk.getCatalog({keyword:'road',format:'fhd',limit:1,page:2});
  assert.equal(first.pagination.totalItems,2);assert.equal(first.items[0].slug,'fhd-a');assert.equal(second.items[0].slug,'fhd-b');
  vi.allMovies=[{slug:'tv-hd',vname:'Road',year:2025,quality:'HD'},{slug:'tv-4k',vname:'Road 4K',year:2025,quality:'4K'}];
  const bilingual=await vi.getCatalog({format:'4k',limit:1});assert.equal(bilingual.pagination.totalItems,1);assert.equal(bilingual.items[0].slug,'tv-4k');
});

test('standard catalog result count never replaces active tags and each filter remains removable', async () => {
  const calls = [];
  const { dom, window, tick } = await browser(false, 'type=phim-bo&category=hanh-dong&country=viet-nam&keyword=duong', async params => {
    calls.push({ ...params });
    return { items: [movie('duong', 'Đường')], pagination: { currentPage: 1, totalItems: 1, totalPages: 1 } };
  });
  try {
    const doc = window.document;
    assert.equal(doc.querySelectorAll('#catalog-active-tags .btn-remove-tag').length, 4);
    assert.match(doc.getElementById('catalog-active-tags').textContent, /Hành Động/);
    assert.match(doc.getElementById('catalog-active-tags').textContent, /Việt Nam/);
    assert.match(doc.getElementById('catalog-results-count').textContent, /Hiển thị/);
    doc.querySelector('#catalog-active-tags [data-key="country"]').click();
    await tick();
    assert.equal(calls.at(-1).country, 'all');
    assert.equal(calls.at(-1).category, 'hanh-dong');
    assert.equal(calls.at(-1).keyword, 'duong');
    assert.equal(doc.querySelectorAll('#catalog-active-tags .btn-remove-tag').length, 3);
    assert.ok(doc.getElementById('catalog-results-count'));
  } finally { dom.window.close(); }
});

test('mobile cinema alias selects the existing type chip without changing URL state', async () => {
  const { dom, window } = await browser(true, 'type=phim-chieu-rap&country=viet-nam', async () => ({ items: [], pagination: { totalItems: 0, totalPages: 1 } }));
  try {
    assert.equal(window.document.querySelector('.m-chip[data-type="chieu-rap"]').getAttribute('aria-pressed'), 'true');
    assert.equal(new URL(window.location.href).searchParams.get('type'), 'phim-chieu-rap');
    assert.equal(new URL(window.location.href).searchParams.get('country'), 'viet-nam');
  } finally { dom.window.close(); }
});
