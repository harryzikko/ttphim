const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

for (const [name, exports] of Object.entries({
  vicdnService: { hasBilingualMatch: () => false },
  nguoncService: {},
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

beforeEach(() => {
  service.cache.flushAll();
  service.pendingRequests.clear();
  service.fetchJson = originalFetchJson;
  service.getMovieDetail = originalGetMovieDetail;
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
    return { movie: { slug, name: slug }, episodes: [] };
  };
  const home = await service.getHomeData();
  assert.equal(peak, 3);
  assert.deepEqual(home.spotlights.map(item => item.slug), ['first', 'second', 'third']);
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
