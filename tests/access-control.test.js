const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { JSDOM } = require('jsdom');
const temp = fs.mkdtempSync(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'access-control-'));
Object.assign(process.env, { NODE_ENV: 'test', DB_PATH: path.join(temp, 'db.json'), DATABASE_URL: '', PUBLIC_ORIGIN: '', ALLOWED_ORIGINS: '', REQUIRE_ADMIN_MFA: 'false', REQUIRE_VERIFIED_EMAIL: 'false' });
for (const [name, exports] of Object.entries({ kkphimService: { getHomeData: async () => ({ spotlights: [], latest: [], cinema: [], series: [], singles: [], tvshows: [], anime: [], rankings: [], categories: [], countries: [] }), getMovieDetail: async () => ({ movie: { slug: 'film', name: 'Film' }, episodes: [] }), getCategoriesAndCountries: async () => ({ categories: [], countries: [] }), getCatalog: async () => ({ items: [], pagination: { totalItems: 0, totalPages: 1 } }), clearHomeCache() {} }, vicdnService: { hasBilingualMatch: () => false }, tmdbService: {}, personService: {} })) {
  const id = require.resolve('../src/services/' + name); require.cache[id] = { id, filename: id, loaded: true, exports };
}
const { app } = require('../src/server');
const db = require('../src/services/dbService');
let server, base, cookie, token;
const request = async (url, { method = 'GET', body, auth = '', bearer = '' } = {}) => {
  const response = await fetch(base + url, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', ...(auth ? { Cookie: auth } : {}), ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return response;
};
before(async () => {
  assert.equal(db.store, null); await db.getRawDatabase();
  server = http.createServer(app); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = 'http://127.0.0.1:' + server.address().port;
  const registered = await request('/api/auth/register', { method: 'POST', body: { email: 'access@qa.test', password: 'qa-password-123', name: 'QA' } });
  const data = await registered.json(); assert.equal(data.status, true); cookie = registered.headers.get('set-cookie').split(';')[0]; token = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1)); assert.ok(token);
});
after(async () => { if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } await db.close(); fs.rmSync(temp, { recursive: true, force: true }); });

test('private pages and HTML aliases redirect guests and forged cookies; public browsing remains public', async () => {
  for (const url of ['/tai-khoan', '/tai-khoan.html', '/danh-sach?tab=history', '/danh-sach.html', '/tu-phim', '/danh-sach-cua-toi', '/mobile/tai-khoan', '/mobile/tai-khoan.html', '/mobile/danh-sach', '/mobile/danh-sach.html', '/mobile/%74ai-khoan.html', '/admin.html', '/quan-tri', '/quan-tri.html', '/operations.html']) {
    const response = await request(url, { auth: 'token=forged' }); assert.equal(response.status, 302, url);
    const location = new URL(response.headers.get('location'), base); assert.equal(location.pathname, '/auth'); assert.equal(location.searchParams.get('redirect'), url); assert.ok(response.headers.get('cache-control').includes('no-store'));
  }
  for (const url of ['/auth', '/mobile', '/kham-pha?view=desktop']) assert.equal((await request(url)).status, 200, url);
  for (const url of ['/tai-khoan', '/tai-khoan.html', '/mobile/danh-sach.html', '/api/movies/film']) {
    const response = await request(url, { auth: cookie }); assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /private.*no-store/);
    assert.match(response.headers.get('vary'), /Cookie/);
  }
  assert.equal((await request('/admin.html', { auth: cookie })).status, 403);
});

test('all account/community mutations reject guests and invalid bearer tokens without changing private records', async () => {
  const calls = [
    ['GET', '/api/user/library'], ['POST', '/api/user/watchlist/toggle'], ['POST', '/api/user/watchlist/remove'], ['POST', '/api/user/watchlist/batch-remove'],
    ['POST', '/api/user/history'], ['POST', '/api/user/history/remove'], ['POST', '/api/user/history/clear'], ['POST', '/api/user/history/visibility'], ['POST', '/api/user/profile'], ['POST', '/api/user/password'],
    ['GET', '/api/user/follows'], ['POST', '/api/user/follows/film'], ['DELETE', '/api/user/follows/film'], ['GET', '/api/user/follow-notifications'], ['POST', '/api/user/follow-notifications/fake/read'],
    ['GET', '/api/user/playback-preferences'], ['PATCH', '/api/user/playback-preferences'], ['POST', '/api/movies/film/rate'], ['POST', '/api/comments/film'], ['POST', '/api/comments/fake/reply'], ['POST', '/api/comments/fake/like'],
    ['POST', '/api/party/create'], ['POST', '/api/party/ROOM/join'], ['POST', '/api/party/ROOM/chat']
  ];
  const before = await db.getRawDatabase();
  for (const [method, url] of calls) for (const bearer of ['', 'forged']) {
    const response = await request(url, { method, bearer, ...(method === 'GET' ? {} : { body: { user_id: before.users[0].id, movie_slug: 'film', name: 'Fake', role: 'admin', content: 'not allowed', score: 5, action: 'like' } }) });
    assert.equal(response.status, 401, method + ' ' + url); assert.equal((await response.json()).status, false);
  }
  const after = await db.getRawDatabase();
  for (const key of ['users', 'history', 'watchlist', 'comments', 'ratings', 'follows']) assert.deepEqual(after[key], before[key], key);
});

test('valid session can mutate; logout revokes captured cookie and bearer, not merely the displayed profile', async () => {
  assert.equal((await request('/api/user/watchlist/toggle', { method: 'POST', auth: cookie, body: { movie_slug: 'film', movie_name: 'Film' } })).status, 200);
  const comment = await request('/api/comments/film', { method: 'POST', auth: cookie, body: { content: 'Authenticated comment' } }); const data = await comment.json(); assert.equal(data.status, true);
  assert.equal((await request('/api/comments/' + data.data.id + '/like', { method: 'POST', auth: cookie, body: { action: 'like' } })).status, 200);
  assert.equal((await request('/api/auth/logout', { method: 'POST', auth: cookie, body: {} })).status, 200);
  assert.equal((await request('/api/user/library', { auth: cookie })).status, 401);
  assert.equal((await request('/api/user/library', { bearer: token })).status, 401);
  assert.equal((await request('/tai-khoan', { auth: cookie })).status, 302);
  assert.equal((await request('/api/comments/' + data.data.id + '/like', { method: 'POST', auth: cookie, body: { action: 'like' } })).status, 401);
});

function sdk(url = 'http://localhost/phim/film') {
  const dom = new JSDOM('<main><button>Account action</button></main>', { url, runScripts: 'outside-only' });
  const w = dom.window; let code = 503, payload = { status: false, message: 'Unavailable' };
  w.fetch = async () => ({ status: code, headers: { get: () => null }, json: async () => payload });
  w.eval(fs.readFileSync(path.join(__dirname, '../public/js/api.js'), 'utf8'));
  return { w, dom, response(status, body) { code = status; payload = body; } };
}
test('SDK logout and comment like reject failed envelopes; 401 removes cached forged identity', async () => {
  const h = sdk(); try {
    h.w.localStorage.setItem('kk_user', JSON.stringify({ id: 'fake', role: 'admin' }));
    await assert.rejects(h.w.API.logout()); assert.ok(h.w.localStorage.getItem('kk_user'));
    await assert.rejects(h.w.API.likeComment('fake'));
    h.response(401, { status: false }); await assert.rejects(h.w.API.likeComment('fake'), { httpStatus: 401 }); assert.equal(h.w.localStorage.getItem('kk_user'), null);
    h.w.localStorage.setItem('kk_user', '{}'); h.response(200, { status: true }); await h.w.API.logout(); assert.equal(h.w.localStorage.getItem('kk_user'), null);
  } finally { h.w.close(); }
});
test('restored private page locks actions on auth outage and can retry authoritative verification', async () => {
  const h = sdk('http://localhost/tai-khoan'); try {
    h.w.dispatchEvent(new h.w.Event('focus')); await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.w.document.querySelector('main').inert, true); assert.ok(h.w.document.getElementById('account-session-retry'));
    h.response(200, { status: true, data: { id: 'real', name: 'Real' } }); h.w.document.getElementById('account-session-retry').click(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.w.document.querySelector('main').inert, false); assert.equal(JSON.parse(h.w.localStorage.getItem('kk_user')).id, 'real');
  } finally { h.w.close(); }
});
