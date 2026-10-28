const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

for (const [name, exports] of Object.entries({
  vicdnService: { hasBilingualMatch: () => false },
  nguoncService: { hasMatch: () => false, getNguoncServers: async () => [] },
  dbService: { getSettings: async () => ({ featured_slugs: [] }), getMovieViews: async () => ({}) }
})) {
  const id = require.resolve(`../src/services/${name}`);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
const service = require('../src/services/kkphimService');
const db = require('../src/services/dbService');
const { addHomeData, serializeData, renderHomePage } = require('../src/services/homePageService');
const originalFetchJson = service.fetchJson;
const originalGetMovieDetail = service.getMovieDetail;
const originalGetRankingMetadata = service.getRankingMetadata;
beforeEach(() => {
  service.cache.flushAll();
  service.pendingRequests.clear();
  service.fetchJson = originalFetchJson;
  service.getMovieDetail = originalGetMovieDetail;
  service.getRankingMetadata = originalGetRankingMetadata;
  service.totalMovies = null;
  service.totalPages = null;
  service.totalFetchedAt = 0;
  service.sourceStatus = 'unknown';
  db.getSettings = async () => ({ featured_slugs: [] });
});

test('concurrent cold home requests share one feed load and use lightweight ranking metadata', async () => {
  let listRequests = 0;
  let detailRequests = 0;
  const movie = { slug: 'test-film', name: 'Test Film', view: 42 };
  service.fetchJson = async endpoint => {
    await new Promise(resolve => setTimeout(resolve, 10));
    if (endpoint.startsWith('/phim/')) { detailRequests++; return { movie }; }
    listRequests++;
    return { items: [movie], data: { items: [movie] } };
  };
  service.getMovieDetail = async () => { throw new Error('Ranking must not load playback servers'); };
  const results = await Promise.all(Array.from({ length: 10 }, () => service.getHomeData()));
  assert.equal(listRequests, 5);
  assert.equal(detailRequests, 1);
  assert.ok(results.every(result => result === results[0]));
  assert.equal(results[0].rankings[0].real_views, 42);
  assert.equal(service.pendingRequests.size, 0);
  assert.equal(await service.getHomeData(), results[0]);
  assert.equal(listRequests, 5);
});

test('pinned spotlights load concurrently while preserving administrator order', async () => {
  db.getSettings = async () => ({ featured_slugs: ['first', 'second', 'third'] });
  service.fetchJson = async () => ({ items: [], data: { items: [] } });
  let active = 0;
  let peak = 0;
  service.getMovieDetail = async slug => {
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, slug === 'first' ? 30 : 5));
    active--;
    return { movie: { slug, name: slug, type:'single', tmdb:{id:550,type:'movie'} }, episodes: [] };
  };
  const home = await service.getHomeData();
  assert.equal(peak, 3);
  assert.deepEqual(home.spotlights.map(item => item.slug), ['first', 'second', 'third']);
  assert.ok(home.spotlights.every(movie=>movie.tmdb.id===550 && movie.tmdb.type==='movie' && movie.type==='single'));
});

test('failed shared requests are removed so subsequent calls can retry', async () => {
  let calls = 0;
  const load = async () => { calls++; throw new Error('unavailable'); };
  const results = await Promise.allSettled([service.singleFlight('retry', load), service.singleFlight('retry', load)]);
  assert.ok(results.every(result => result.status === 'rejected'));
  assert.equal(calls, 1);
  assert.equal(service.pendingRequests.size, 0);
  assert.equal(await service.singleFlight('retry', async () => 'recovered'), 'recovered');
});

test('ranking metadata is cached and reuses existing full movie details', async () => {
  let calls = 0;
  service.fetchJson = async () => { calls++; return { movie: { view: '123', quality: 'HD' } }; };
  const [first, second] = await Promise.all([service.getRankingMetadata('film'), service.getRankingMetadata('film')]);
  assert.equal(first.view, 123);
  assert.equal(first, second);
  assert.equal(calls, 1);
  assert.equal(await service.getRankingMetadata('film'), first);
  service.cache.set('movie_other', { movie: { view: 77 } }, 10000);
  assert.equal((await service.getRankingMetadata('other')).view, 77);
  assert.equal(calls, 1);
});

test('upstream deadline includes slow JSON response body', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (_, options) => ({
    ok: true,
    json: () => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('body aborted')), { once: true });
    })
  });
  try {
    await assert.rejects(service.fetchJson('/slow', { timeout: 20 }), /body aborted/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('embedded feed survives script-like content without allowing HTML injection', () => {
  const data = { spotlights: [{ thumb_url: 'https://images.test/a.jpg?x=1&y=2' }], name: '</script><script>alert(1)</script>&' };
  const serialized = serializeData(data);
  assert.ok(!serialized.includes('<'));
  assert.deepEqual(JSON.parse(serialized), data);
  const html = addHomeData('<html><head></head><body></body></html>', data);
  assert.match(html, /rel="preload" as="image"/);
  const embedded = html.match(/<script id="home-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(embedded), data);
});

test('home HTML is reusable and rebuilds when feed changes', async () => {
  const data = { spotlights: [], latest: [] };
  const first = await renderHomePage(data);
  assert.equal(await renderHomePage(data), first);
  const changed = await renderHomePage({ ...data, marker: 'new-feed' });
  assert.notEqual(changed, first);
  assert.match(changed, /new-feed/);
});

test('client reuses embedded home feed and falls back when it is absent or invalid', async () => {
  let text = JSON.stringify({ latest: [{ slug: 'embedded' }] });
  let calls = 0;
  const context = vm.createContext({
    document: { getElementById: () => text === null ? null : { textContent: text } },
    window: {}, localStorage: { getItem: () => null },
    fetch: async () => { calls++; return { json: async () => ({ data: { latest: [{ slug: 'remote' }] } }) }; }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/api.js'), 'utf8'), context);
  assert.equal((await vm.runInContext('API.getHome()', context)).latest[0].slug, 'embedded');
  assert.equal(calls, 0);
  text = null;
  assert.equal((await vm.runInContext('API.getHome()', context)).latest[0].slug, 'remote');
  text = '{invalid';
  assert.equal((await vm.runInContext('API.getHome()', context)).latest[0].slug, 'remote');
  assert.equal(calls, 2);
});

test('KKPhim totals use upstream pagination, coalesce requests, cache and report stale data', async () => {
  let calls = 0;
  service.fetchJson = async endpoint => {
    assert.equal(endpoint, '/danh-sach/phim-moi-cap-nhat?page=1');
    calls++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return { pagination: { totalItems: 30323, totalPages: 1264 } };
  };
  assert.deepEqual(await Promise.all([service.getTotalMovies(), service.getTotalMovies()]), [30323, 30323]);
  assert.equal(calls, 1);
  assert.equal(service.totalPages, 1264);
  assert.equal(service.sourceStatus, 'online');
  assert.equal(await service.getTotalMovies(), 30323);
  assert.equal(calls, 1);
  service.totalFetchedAt -= 600001;
  service.fetchJson = async () => { throw new Error('offline'); };
  assert.equal(await service.getTotalMovies(), 30323);
  assert.equal(service.sourceStatus, 'stale');
  service.totalMovies = null;
  assert.equal(await service.getTotalMovies(), null);
  assert.equal(service.sourceStatus, 'unavailable');
});

test('home starts ranking metadata before pinned detail requests finish', async () => {
  db.getSettings = async () => ({ featured_slugs: ['pinned'] });
  const movie = { slug: 'ranked', name: 'Ranked', view: 7 };
  service.fetchJson = async () => ({ items: [movie], data: { items: [movie] } });
  let resolvePin;
  const pinPending = new Promise(resolve => { resolvePin = resolve; });
  let rankingStarted = false;
  service.getRankingMetadata = async () => { rankingStarted = true; return { view: 7 }; };
  service.getMovieDetail = async () => { await pinPending; return { movie: { slug: 'pinned', name: 'Pinned' }, episodes: [] }; };
  const pending = service.getHomeData();
  try {
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(rankingStarted, true);
  } finally { resolvePin(); }
  const home = await pending;
  assert.equal(home.spotlights[0].slug, 'pinned');
  assert.equal(home.rankings[0].real_views, 7);
});

test('home pages use prebuilt local Tailwind CSS rather than a blocking runtime CDN', () => {
  for (const [file, css] of [['index.html', 'home-tailwind.css'], ['mobile/index.html', 'mobile-home-tailwind.css']]) {
    const html = fs.readFileSync(path.join(__dirname, '../public', file), 'utf8');
    const stylesheet = fs.readFileSync(path.join(__dirname, '../public/css', css), 'utf8');
    assert.ok(!html.includes('cdn.tailwindcss.com'));
    assert.ok(html.includes(`/css/${css}?v=`));
    assert.ok(stylesheet.includes('.bg-primary-container'));
    assert.ok(stylesheet.includes('.flex'));
  }
  const script = fs.readFileSync(path.join(__dirname, '../public/js/header.js'), 'utf8');
  assert.ok(script.includes("if (!popover.classList.contains('hidden')) loadNotifications()"));
});

test('spotlights omit unsupported stored sources without rewriting administrator settings', async () => {
  const pins = [{ slug: 'supported', source: 'kkphim' }, { slug: 'legacy', source: 'removed-provider' }, 'plain-slug'];
  db.getSettings = async () => ({ featured_slugs: pins });
  service.fetchJson = async () => ({ items: [], data: { items: [] } });
  const requested = [];
  service.getMovieDetail = async slug => { requested.push(slug); return { movie: { slug, name: slug }, episodes: [] }; };
  const home = await service.getHomeData();
  assert.deepEqual(home.spotlights.map(item => item.slug), ['supported', 'plain-slug']);
  assert.deepEqual(requested, ['supported', 'plain-slug']);
  assert.equal(pins.length, 3);
});

test('catalog and quick search combine primary and bilingual sources only', async () => {
  const bilingual = require('../src/services/vicdnService');
  const originalSearch = bilingual.searchViCdn;
  const calls = [];
  bilingual.searchViCdn = async () => [{ slug: 'bilingual', name: 'Test Bilingual', origin_name: 'Test Bilingual' }];
  service.fetchJson = async endpoint => {
    calls.push(endpoint);
    return { data: { items: [{ slug: 'primary', name: 'Test Primary', origin_name: 'Test Primary' }] } };
  };
  try {
    const quick = await service.quickSearch('test');
    const catalog = await service.getCatalog({ keyword: 'test' });
    assert.deepEqual(quick.map(item => item.slug), ['primary', 'bilingual']);
    assert.deepEqual(catalog.items.map(item => item.slug), ['primary', 'bilingual']);
    assert.equal(calls.length, 1, 'quick search and catalog reuse the same bounded result snapshot');
    assert.ok(calls.every(endpoint => endpoint.startsWith('/v1/api/tim-kiem?')));
  } finally { if (originalSearch) bilingual.searchViCdn = originalSearch; else delete bilingual.searchViCdn; }
});
