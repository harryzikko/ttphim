const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8');
function fixture({ offline = false, cached } = {}) {
  const handlers = {}, calls = [];
  vm.runInNewContext(source, {
    self: { location: { origin: 'http://localhost:3001' }, addEventListener(name, handler) { handlers[name] = handler; } },
    URL, Response,
    fetch: async request => { calls.push(request.url); if (offline) throw new Error('offline'); return new Response('network'); },
    caches: { open: async () => ({ match: async () => cached }) }
  });
  return { calls, request(url, method = 'GET') { let response; handlers.fetch({ request: { url, method }, respondWith(value) { response = value; } }); return response; } };
}
test('service worker leaves third-party resources, API, mutations and video to the browser', () => {
  const f = fixture();
  for (const url of ['https://phimimg.com/poster.webp', 'https://image.tmdb.org/t/p/original/image.jpg', 'https://vicdn.cc/player', 'http://localhost:3001/api/auth/me', 'http://localhost:3001/video.m3u8', 'http://localhost:3001/segment.ts', 'http://localhost:3001/movie.mp4']) assert.equal(f.request(url), undefined);
  assert.equal(f.request('http://localhost:3001/submit', 'POST'), undefined);
  assert.deepEqual(f.calls, []);
});
test('offline public assets use the current cache and missing entries return a Response, not undefined', async () => {
  const cached = new Response('cached');
  assert.equal(await fixture({ offline: true, cached }).request('http://localhost:3001/favicon.svg'), cached);
  const missing = await fixture({ offline: true }).request('http://localhost:3001/favicon.svg');
  assert.ok(missing instanceof Response); assert.equal(missing.type, 'error');
});
test('offline private pages never fall back to cached HTML; online resources preserve network results', async () => {
  const f = fixture({ offline: true, cached: new Response('private stale content') });
  for (const route of ['/tai-khoan', '/mobile/tai-khoan', '/danh-sach', '/admin.html']) assert.equal((await f.request('http://localhost:3001' + route)).type, 'error');
  assert.equal(await (await fixture().request('http://localhost:3001/favicon.svg')).text(), 'network');
});
