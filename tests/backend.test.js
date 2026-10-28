const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const config = require('../src/config');
const db = require('../src/services/dbService');
const { generateToken, verifyToken } = require('../src/services/authService');
const { verifyPassword } = require('../src/services/passwordService');

// These regression tests intentionally do not contact movie providers.
for (const service of ['kkphimService', 'vicdnService', 'nguoncService', 'partyService', 'personService', 'tmdbService']) {
  const id = require.resolve(`../src/services/${service}`);
  require.cache[id] = { id, filename: id, loaded: true, exports: service === 'kkphimService' ? { clearHomeCache() {} } : service === 'vicdnService' ? { hasBilingualMatch: () => false } : service === 'nguoncService' ? { hasMatch: () => false } : {} };
}
const router = require('../src/routes/apiRoutes');
const admin = { id: 'audit-admin', email: 'admin@example.test', name: 'Admin', role: 'admin', password: 'old-password' };
const member = { id: 'audit-member', email: 'member@example.test', name: 'Member', role: 'user', password: 'old-password' };
const originalPath = db.dbPath;
let directory, dbPath, server, base;

before(async () => {
  directory = await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'film-regression-'));
  dbPath = path.join(directory, 'db.json');
  db.dbPath = dbPath;
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', router);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

beforeEach(async () => {
  await db.operationQueue;
  db.cache = null;
  await fs.writeFile(dbPath, JSON.stringify({ users: [admin, member], watchlist: [], history: [], comments: [] }));
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  db.dbPath = originalPath;
  db.cache = null;
  await fs.rm(directory, { recursive: true, force: true });
});

async function request(url, { method = 'GET', body, user, cookie } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers.Authorization = `Bearer ${(await require('../src/services/authService').issueSession(await db.findUserById(user.id))).token}`;
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie'), cache: response.headers.get('cache-control'), vary: response.headers.get('vary') };
}

async function savedDb() {
  return JSON.parse(await fs.readFile(dbPath, 'utf8'));
}

test('admin endpoints reject guests and ordinary users; admins retain access', async () => {
  for (const [url, method] of [['/admin/users', 'GET'], ['/admin/backup', 'GET'], ['/admin/settings', 'POST'], ['/admin/users/audit-admin', 'DELETE'], ['/admin/users/audit-admin/update', 'POST'], ['/admin/cache/clear', 'POST']]) {
    assert.equal((await request(url, { method, body: method === 'POST' ? {} : undefined })).status, 401);
    assert.equal((await request(url, { method, user: member, body: method === 'POST' ? {} : undefined })).status, 403);
  }
  const response = await request('/admin/users', { user: admin });
  assert.equal(response.status, 200);
  assert.ok(response.body.data.every(user => !('password' in user)));
  assert.equal((await request('/admin/backup', { user: admin })).status, 410);
});

test('anonymous library/profile mutations are rejected without changing the database', async () => {
  const before = await fs.readFile(dbPath, 'utf8');
  for (const [url, method] of [
    ['/user/library', 'GET'],
    ['/user/watchlist/toggle', 'POST'],
    ['/user/watchlist/remove', 'POST'],
    ['/user/history', 'POST'],
    ['/user/history/clear', 'POST'],
    ['/user/password', 'POST'],
    ['/user/profile', 'POST'],
    ['/movies/test/rate', 'POST'],
    ['/comments/test', 'POST'],
    ['/comments/1/reply', 'POST'],
    ['/party/create', 'POST'],
    ['/party/test/join', 'POST'],
    ['/party/test/chat', 'POST']
  ]) {
    assert.equal((await request(url, { method, body: method === 'POST' ? { movie_slug: 'test', name: 'Injected', content: 'test', score: 5 } : undefined })).status, 401);
  }
  assert.equal(await fs.readFile(dbPath, 'utf8'), before);
  assert.equal((await request('/user/watchlist/toggle', { method: 'POST', user: member, body: { movie_slug: 'test' } })).status, 200);
  assert.equal((await savedDb()).watchlist[0].user_id, member.id);
});

test('registration hashes passwords; login, cookie auth and profile never expose passwords', async () => {
  const credentials = { email: 'new@example.test', password: 'secret-123', name: 'New User' };
  const registration = await request('/auth/register', { method: 'POST', body: credentials });
  assert.equal(registration.status, 200);
  assert.ok(!('password' in registration.body.data.user));
  const stored = (await savedDb()).users.find(user => user.email === credentials.email);
  assert.ok(stored.password.startsWith('scrypt$'));
  assert.ok(await verifyPassword(credentials.password, stored.password));
  const login = await request('/auth/login', { method: 'POST', body: credentials });
  assert.equal(login.status, 200);
  assert.ok(!('password' in login.body.data.user));
  const me = await request('/auth/me', { cookie: login.cookie.split(';')[0] });
  assert.equal(me.body.data.id, stored.id);
  assert.ok(!('password' in me.body.data));
  const profile = await request('/user/profile', { method: 'POST', user: stored, body: { name: 'Updated' } });
  assert.equal(profile.body.data.name, 'Updated');
  assert.ok(!('password' in profile.body.data));
  assert.equal((await request('/auth/login', { method: 'POST', body: { ...credentials, password: 'wrong' } })).status, 401);
});

test('legacy passwords migrate on login and password changes remain usable', async () => {
  const login = await request('/auth/login', { method: 'POST', body: { email: member.email, password: member.password } });
  assert.equal(login.status, 200);
  assert.ok((await savedDb()).users.find(user => user.id === member.id).password.startsWith('scrypt$'));
  const change = await request('/user/password', { method: 'POST', user: member, body: { old_password: member.password, new_password: 'new-password' } });
  assert.equal(change.body.status, true);
  assert.equal((await request('/auth/login', { method: 'POST', body: { email: member.email, password: member.password } })).status, 401);
  assert.equal((await request('/auth/login', { method: 'POST', body: { email: member.email, password: 'new-password' } })).status, 200);
});

test('admin creation and password reset hash passwords and omit them from responses', async () => {
  const created = await request('/admin/users/create', { method: 'POST', user: admin, body: { email: 'created@example.test', password: 'created-password' } });
  assert.equal(created.status, 200);
  assert.ok(!('password' in created.body.data));
  const updated = await request(`/admin/users/${created.body.data.id}/update`, { method: 'POST', user: admin, body: { password: 'reset-password', id: 'tampered' } });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.data.id, created.body.data.id);
  assert.ok(!('password' in updated.body.data));
  assert.equal((await request('/auth/login', { method: 'POST', body: { email: 'created@example.test', password: 'reset-password' } })).status, 200);
});

test('malformed authentication inputs return 400 instead of 500', async () => {
  for (const route of ['/auth/login', '/auth/register']) {
    for (const body of [{ email: {}, password: 'secret' }, { email: 'a@example.test', password: {} }, { email: ' ', password: 'secret' }]) {
      assert.equal((await request(route, { method: 'POST', body })).status, 400);
    }
  }
});

test('TV approval cannot impersonate a client-supplied identity or overwrite approval', async () => {
  const session = await request('/auth/tv/session', { method: 'POST', body: {} });
  const token = session.body.data.token;
  const forged = { token, user: admin };
  assert.equal((await request('/auth/tv/authorize', { method: 'POST', body: forged })).status, 401);
  assert.equal((await request('/auth/tv/authorize', { method: 'POST', user: member, body: forged })).status, 200);
  let status = await request(`/auth/tv/status?token=${token}`);
  assert.equal(status.body.user.id, member.id);
  assert.equal(verifyToken(status.body.token).userId, member.id);
  assert.equal((await request('/auth/tv/authorize', { method: 'POST', user: admin, body: { token } })).status, 400);
  status = await request(`/auth/tv/status?token=${token}`);
  assert.equal(status.body.user.id, member.id);
});

test('concurrent view increments and watchlist writes do not lose updates', async () => {
  await Promise.all(Array.from({ length: 30 }, () => db.incrementMovieView('audit-movie')));
  assert.equal((await savedDb()).movie_views['audit-movie'], 30);
  await Promise.all(Array.from({ length: 20 }, (_, i) => db.toggleWatchlist(member.id, { movie_slug: `movie-${i}` })));
  assert.equal((await savedDb()).watchlist.length, 20);
});

test('concurrent duplicate registration creates only one account', async () => {
  const results = await Promise.allSettled(Array.from({ length: 5 }, () => db.createUser({ email: 'same@example.test', password: 'secret-123' })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await savedDb()).users.filter(user => user.email === 'same@example.test').length, 1);
});

test('corrupt databases are not silently replaced with empty data', async () => {
  await fs.writeFile(dbPath, '{broken');
  await assert.rejects(db.incrementMovieView('audit-movie'));
  assert.equal(await fs.readFile(dbPath, 'utf8'), '{broken');
});

test('write errors are surfaced and the operation queue recovers', async () => {
  const originalRename = fs.rename;
  fs.rename = async () => { throw new Error('simulated disk failure'); };
  try {
    await assert.rejects(db.incrementMovieView('audit-movie'), /simulated disk failure/);
  } finally {
    fs.rename = originalRename;
  }
  assert.equal((await savedDb()).movie_views, undefined);
  assert.equal(await db.incrementMovieView('audit-movie'), 1);
});

test('invalid, tampered, expired or non-expiring tokens are rejected', () => {
  assert.equal(verifyToken({}), null);
  const token = generateToken(member);
  assert.equal(verifyToken(token).userId, member.id);
  assert.equal(verifyToken(token + 'x'), null);
  for (const payload of [{ userId: member.id }, { userId: member.id, exp: Date.now() - 1 }, { userId: member.id, exp: 'invalid' }, null]) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', config.JWT_SECRET).update(encoded).digest('base64url');
    assert.equal(verifyToken(`${encoded}.${signature}`), null);
  }
});

test('watch history preserves real progress and the selected server', async () => {
  const response = await request('/user/history', { method: 'POST', user: member,
    body: { movie_slug: 'history-film', movie_name: 'Film', episode_slug: 'tap-2', episode_name: '2', server_name: 'Backup', current_time: 120, duration: 600 } });
  assert.equal(response.status, 200);
  const item = (await savedDb()).history[0];
  assert.equal(item.user_id, member.id);
  assert.equal(item.server_name, 'Backup');
  assert.equal(item.current_time, 120);
  assert.equal(item.duration, 600);
  assert.equal(item.progress_percent, 20);
});

test('banner management requires admin and persists order with conflict protection', async () => {
  assert.equal((await request('/admin/banners')).status, 401);
  assert.equal((await request('/admin/banners', { user: member })).status, 403);
  await db.updateSettings({ featured_slugs: [{ slug: 'film-a', name: 'A' }, { slug: 'film-b', name: 'B' }] });
  const original = (await request('/admin/banners', { user: admin })).body.data;
  const config = { ...original, slides: [...original.slides].reverse(), ads: [{ slot: 'home_middle', enabled: true, title: 'Ad', image_desktop: 'https://image.test/ad.jpg', href: '/kham-pha' }] };
  const saved = await request('/admin/banners', { method: 'POST', user: admin, body: config });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.data.slides[0].slug, 'film-b');
  assert.equal((await savedDb()).settings.featured_slugs[0].slug, 'film-b');
  assert.equal((await request('/admin/banners', { method: 'POST', user: admin, body: config })).status, 409);
  const invalid = { ...saved.body.data, ads: [{ ...config.ads[0], href: 'javascript:alert(1)' }] };
  assert.equal((await request('/admin/banners', { method: 'POST', user: admin, body: invalid })).status, 400);
  assert.equal((await request('/admin/settings', { method: 'POST', user: admin, body: { banner_config: {} } })).status, 400);
});

test('advertising API requires admin, preserves pins and hero, and protects revisions', async () => {
  for (const method of ['GET', 'POST']) {
    assert.equal((await request('/admin/advertising', { method, body: method === 'POST' ? { ads: [] } : undefined })).status, 401);
    assert.equal((await request('/admin/advertising', { method, user: member, body: method === 'POST' ? { ads: [] } : undefined })).status, 403);
  }
  const pins = [{ slug: 'film-a', name: 'A' }];
  const hero = { slides: [{ slug: 'film-a', title: 'Featured' }], hero_enabled: true, ads: [] };
  await db.updateSettings({ featured_slugs: pins, banner_config: hero });
  const initial = (await request('/admin/advertising', { user: admin })).body.data;
  assert.equal(initial.ads.length, 6);
  assert.ok(initial.ads.every(item => !item.enabled));
  const body = { revision: initial.revision, ads: [{ slot: 'header', enabled: true, title: 'Ad', image_desktop: 'https://image.test/ad.jpg', href: '/kham-pha' }] };
  const saved = await request('/admin/advertising', { method: 'POST', user: admin, body });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.data.ads.find(item => item.slot === 'header').enabled, true);
  const settings = (await savedDb()).settings;
  assert.deepEqual(settings.featured_slugs, pins);
  assert.deepEqual(settings.banner_config, hero);
  assert.equal((await request('/admin/advertising', { method: 'POST', user: admin, body })).status, 409);
  assert.equal((await request('/admin/advertising', { method: 'POST', user: admin, body: { ...saved.body.data, ads: [{ ...body.ads[0], href: 'javascript:alert(1)' }] } })).status, 400);
  assert.equal((await request('/admin/settings', { method: 'POST', user: admin, body: { advertising: { ads: [] } } })).status, 400);
});

test('temporary Windows rename locks retry without losing or duplicating writes', { skip: process.platform !== 'win32' }, async () => {
  const originalRename = fs.rename;
  let attempts = 0;
  fs.rename = async (...args) => {
    if (++attempts <= 2) throw Object.assign(new Error('temporary Windows lock'), { code: 'EPERM' });
    return originalRename(...args);
  };
  try {
    assert.equal(await db.incrementMovieView('rename-retry'), 1);
    assert.ok(attempts >= 3);
    assert.equal((await savedDb()).movie_views['rename-retry'], 1);
  } finally {
    fs.rename = originalRename;
  }
});

test('admin source stats, search and synchronization support all configured providers', async () => {
  const primary = require('../src/services/kkphimService');
  const bilingual = require('../src/services/vicdnService');
  const nguonc = require('../src/services/nguoncService');
  const originals = [Object.assign({}, primary), Object.assign({}, bilingual), Object.assign({}, nguonc)];
  let syncs = 0;
  Object.assign(primary, {
    getTotalMovies: async () => 100,
    fetchJson: async () => ({ data: { items: [{ slug: 'primary-film', name: 'Primary film' }] } }),
    normalizeMovieItem: item => item
  });
  Object.assign(bilingual, {
    getTotalMovies: async () => 20, allMovies: [{ slug: 'bilingual-film' }],
    searchViCdn: async () => [{ slug: 'bilingual-film', name: 'Bilingual film' }],
    syncCatalog: async () => { syncs++; }
  });
  Object.assign(nguonc, {
    getTotalMovies: async () => 30, allMovies: [{ slug: 'nguonc-film' }],
    searchNguonC: async () => [{ slug: 'nguonc-film', name: 'NguonC film', source: 'nguonc' }],
    syncCatalog: async () => { syncs++; }
  });
  try {
    const stats = await request('/admin/stats', { user: admin });
    assert.equal(stats.status, 200);
    assert.equal(stats.body.data.totalAllSources, 150);
    assert.deepEqual(stats.body.data.sourceCounts, { kkphim: 100, vicdn: 20, nguonc: 30 });
    const sources = await request('/admin/sources', { user: admin });
    assert.equal(sources.status, 200);
    assert.deepEqual(Object.keys(sources.body.data).sort(), ['kkphim', 'nguonc', 'total_all_sources', 'total_web_movies', 'vicdn']);
    const search = await request('/admin/search-movie?keyword=test', { user: admin });
    assert.equal(search.status, 200);
    assert.deepEqual(search.body.data.map(item => item.source), ['kkphim', 'vicdn', 'nguonc']);
    assert.equal((await request('/admin/search-movie?keyword=test&source=removed-provider', { user: admin })).status, 400);
    const sync = await request('/admin/sources/sync', { method: 'POST', body: {}, user: admin });
    assert.equal(sync.status, 200);
    assert.deepEqual(sync.body.data, { vicdn_movies: 1, nguonc_movies: 1 });
    assert.equal(syncs, 2);
  } finally {
    for (const provider of [primary, bilingual, nguonc]) for (const key of Object.keys(provider)) delete provider[key];
    Object.assign(primary, originals[0]); Object.assign(bilingual, originals[1]); Object.assign(nguonc, originals[2]);
  }
});

test('movie ratings use real unique account votes, a five-star scale and private user score', async () => {
  const empty = await request('/movies/film/ratings');
  assert.equal(empty.status, 200); assert.equal(empty.body.data.total, 0); assert.equal(empty.body.data.score_10, null);
  assert.equal((await request('/movies/film/rate', { method: 'POST', body: { score: 5 } })).status, 401);
  for (const score of [0, 6, 1.5, '5']) assert.equal((await request('/movies/film/rate', { method: 'POST', user: member, body: { score } })).status, 400);
  const first = await request('/movies/film/rate', { method: 'POST', user: member, body: { score: 5 } });
  assert.equal(first.body.data.score_10, 10); assert.equal(first.body.data.total, 1);
  const changed = await request('/movies/film/rate', { method: 'POST', user: member, body: { score: 3 } });
  assert.equal(changed.body.data.total, 1); assert.equal(changed.body.data.score_10, 6);
  const publicResult = await request('/movies/film/ratings');
  assert.equal(publicResult.body.data.user_score, null);
  const privateResult = await request('/movies/film/ratings', { user: member });
  assert.equal(privateResult.body.data.user_score, 3); assert.equal((await savedDb()).ratings.length, 1);
});

test('comments stay scoped to their film, timestamps render once, and unscored comments have no invented stars', async () => {
  await db.mutate(data => { data.comments = [
    { id:'legacy',movie_slug:'film',content:'[00:03] hi',timestamp_tag:'00:03',replies:[] },
    { id:'sample',movie_slug:'default',content:'Demo comment',replies:[] }
  ]; });
  const list = await request('/comments/film');
  assert.equal(list.body.data.length, 1); assert.equal(list.body.data[0].content, 'hi');
  assert.equal((await savedDb()).comments[0].content, '[00:03] hi');
  const invalid = await request('/comments/film', { method:'POST',user:member,body:{content:'Hello',timestamp_tag:'<script>'} });
  assert.equal(invalid.status, 400);
  assert.equal((await request('/comments/film', { method:'POST',user:member,body:{content:'Invalid',is_spoil:'false'} })).status, 400);
  assert.equal((await request('/comments/film', { method:'POST',user:member,body:{content:123,is_spoil:false} })).status, 400);
  const posted = await request('/comments/film', { method:'POST',user:member,body:{content:'Hello',timestamp_tag:'00:03',episode_slug:'tap-1',is_spoil:true} });
  assert.equal(posted.status, 200); assert.equal(posted.body.data.rating, null); assert.equal(posted.body.data.episode_slug, 'tap-1');
  assert.equal(posted.body.data.is_spoil, true);
  assert.equal((await request('/movies/film/ratings')).body.data.total, 0);
  const rated = await request('/comments/film', { method:'POST',user:member,body:{content:'Review',rating:4} });
  assert.equal(rated.status, 200); assert.equal(rated.body.data.rating, null);
  assert.equal(rated.body.data.is_spoil, false);
  assert.ok(!rated.body.data.episode_slug);
  assert.equal((await request('/movies/film/ratings')).body.data.total, 0);
  await request('/movies/film/rate', { method:'POST',user:member,body:{score:2} });
  await request('/comments/film', { method:'POST',user:member,body:{content:'Another comment',rating:5} });
  const unchanged = (await request('/movies/film/ratings')).body.data;
  assert.equal(unchanged.total, 1); assert.equal(unchanged.score_10, 4);
});

test('history retains explicit genre metadata and never invents five percent progress', async () => {
  await db.saveHistory(member.id, { movie_slug:'film',movie_name:'Film',current_time:0,duration:0,category:['Hành động',null] });
  const history = await db.getHistory(member.id);
  assert.equal(history[0].progress_percent, 0);
  assert.deepEqual(history[0].category, ['Hành động']);
  await db.saveHistory(member.id, { movie_slug:'film',current_time:20,duration:100 });
  assert.deepEqual((await db.getHistory(member.id))[0].category, ['Hành động']);
});

test('comment badges use the current account role rather than a stored or supplied label', async () => {
  await db.mutate(data => { data.comments = [
    { id:'admin-comment',movie_slug:'film',user_id:admin.id,content:'Admin comment',replies:[] },
    { id:'spoof-comment',movie_slug:'film',user_id:member.id,user_role:'admin',content:'User comment',replies:[] }
  ]; });
  const comments = (await request('/comments/film')).body.data;
  assert.equal(comments[0].user_role, 'admin');
  assert.equal(comments[1].user_role, 'user');
});

test('hiding Continue Watching preserves history, is account-scoped and only new progress restores visibility', async () => {
  await db.saveHistory(member.id,{movie_slug:'film',movie_name:'Film',episode_slug:'tap-2',current_time:120,duration:600,server_name:'Backup'});
  assert.equal((await request('/user/history/visibility',{method:'POST',body:{movie_slug:'film',hidden:true}})).status,401);
  assert.equal((await request('/user/history/visibility',{method:'POST',user:admin,body:{movie_slug:'film',hidden:true}})).status,404);
  assert.equal((await request('/user/history/visibility',{method:'POST',user:member,body:{movie_slug:'film',hidden:'yes'}})).status,400);
  const hidden=await request('/user/history/visibility',{method:'POST',user:member,body:{movie_slug:'film',hidden:true}});
  assert.equal(hidden.status,200);assert.equal(hidden.body.data.user_id,member.id);
  let library=(await request('/user/library',{user:member})).body.data;
  assert.equal(library.continueWatching.length,0);assert.equal(library.history.length,1);
  assert.equal(library.history[0].current_time,120);assert.equal(library.history[0].episode_slug,'tap-2');assert.equal(library.history[0].server_name,'Backup');
  await db.saveHistory(member.id,{movie_slug:'film',episode_slug:'tap-2',current_time:120,duration:600});
  assert.equal((await db.getHistory(member.id))[0].continue_hidden,true);
  await request('/user/history/visibility',{method:'POST',user:member,body:{movie_slug:'film',hidden:false}});
  library=(await request('/user/library',{user:member})).body.data;assert.equal(library.continueWatching.length,1);
  await request('/user/history/visibility',{method:'POST',user:member,body:{movie_slug:'film',hidden:true}});
  await db.saveHistory(member.id,{movie_slug:'film',episode_slug:'tap-2',current_time:121,duration:600});
  assert.equal((await db.getHistory(member.id))[0].continue_hidden,false);
});

test('playback preferences require auth, validate PATCH and preserve own account state across sessions', async () => {
  assert.equal((await request('/user/playback-preferences')).status,401);
  const defaults=await request('/user/playback-preferences',{user:member});assert.equal(defaults.status,200);assert.equal(defaults.body.data.playback_speed,1);
  const patch=await request('/user/playback-preferences',{method:'PATCH',user:member,body:{auto_next:false,playback_speed:1.5,audio_language:'vi',subtitle_language:'off'}});
  assert.equal(patch.status,200);assert.equal(patch.body.data.auto_next,false);
  assert.equal((await request('/user/playback-preferences',{user:member})).body.data.playback_speed,1.5);
  assert.equal((await request('/user/playback-preferences',{user:admin})).body.data.playback_speed,1);
  for(const body of [{playback_speed:9},{auto_next:'false'},{user_id:admin.id},{audio_language:'javascript:bad'}])assert.equal((await request('/user/playback-preferences',{method:'PATCH',user:member,body})).status,400);
  const persisted=await savedDb();assert.equal(persisted.users.find(row=>row.id===member.id).playback_preferences.subtitle_language,'off');assert.equal(persisted.users.find(row=>row.id===admin.id).playback_preferences,undefined);
});

test('TMDb rating API uses provider movie identity and distinguishes upstream errors',async()=>{
  const provider=require('../src/services/kkphimService'),tmdb=require('../src/services/tmdbService');
  const originalDetail=provider.getMovieDetail,originalRating=tmdb.getMovieRating;
  try{
    provider.getMovieDetail=async()=>({movie:{slug:'film',tmdb:{id:550,type:'movie'}}});
    tmdb.getMovieRating=async movie=>{assert.equal(movie.tmdb.id,550);return{source:'tmdb',tmdb_id:550,media_type:'movie',score_10:8.1,vote_count:1234};};
    const ok=await request('/movies/film/tmdb-rating?tmdb_id=999');assert.equal(ok.status,200);assert.equal(ok.body.data.tmdb_id,550);assert.equal(ok.body.data.score_10,8.1);
    tmdb.getMovieRating=async()=>{throw Error('unavailable');};assert.equal((await request('/movies/film/tmdb-rating')).status,502);
    provider.getMovieDetail=async()=>null;assert.equal((await request('/movies/missing/tmdb-rating')).status,404);
  }finally{if(originalDetail)provider.getMovieDetail=originalDetail;else delete provider.getMovieDetail;if(originalRating)tmdb.getMovieRating=originalRating;else delete tmdb.getMovieRating;}
});

test('account-owned reactions are idempotent, private, and cannot remove legacy or other account likes', async () => {
  await db.mutate(data => { data.comments = [{ id:'reaction',movie_slug:'film',user_id:member.id,content:'Test',likes:4,replies:[{id:'reply',likes:0,content:'Reply'}] }]; });
  assert.equal((await request('/comments/reaction/like', {method:'POST',user:member,body:{action:'unlike'}})).body.data.likes,4);
  const liked = await request('/comments/reaction/like', {method:'POST',user:member,body:{action:'like'}});
  assert.equal(liked.body.data.likes,5);
  assert.equal((await request('/comments/reaction/like', {method:'POST',user:member,body:{action:'like'}})).body.data.likes,5);
  assert.equal((await request('/comments/reaction/like', {method:'POST',user:admin,body:{action:'unlike'}})).body.data.likes,5);
  const list = await request('/comments/film', {user:member});
  assert.equal(list.body.data[0].liked,true); assert.equal(list.body.data[0].liked_by,undefined); assert.match(list.cache,/private.*no-store/);
  assert.equal((await request('/comments/reaction/like', {method:'POST',user:member,body:{action:'unlike'}})).body.data.likes,4);
  assert.equal((await request('/comments/reply/like', {method:'POST',user:member,body:{action:'like'}})).body.data.likes,1);
  assert.equal((await request('/comments/reply/like', {method:'POST',user:member,body:{action:'like'}})).body.data.likes,1);
  assert.equal((await request('/comments/reaction/like', {method:'POST',user:member,body:{action:'anything'}})).status,400);
  assert.equal((await request('/comments/missing/like', {method:'POST',user:member,body:{action:'like'}})).status,404);
  assert.match((await request('/admin/users',{user:admin})).cache,/private.*no-store/);
});

test('episode context persists without a timestamp and general comments stay general', async () => {
  const posted=await request('/comments/film',{method:'POST',user:member,body:{content:'Episode discussion',episode_slug:'tap-2',is_spoil:true}});
  assert.equal(posted.status,200); assert.equal(posted.body.data.episode_slug,'tap-2'); assert.equal(posted.body.data.timestamp_tag,null);
  const general=await request('/comments/film',{method:'POST',user:member,body:{content:'General discussion',is_spoil:false}});
  assert.equal(general.body.data.episode_slug,null);
});

test('password endpoint rejects more than 256 characters without changing password or revoking session', async () => {
  const response = await request('/user/password', { method: 'POST', user: member, body: { old_password: member.password, new_password: 'x'.repeat(257) } });
  assert.equal(response.status, 400); assert.equal(response.body.status, false); assert.equal(response.cookie, null);
  const stored = (await savedDb()).users.find(user => user.id === member.id);
  assert.equal(await verifyPassword(member.password, stored.password), true); assert.equal(stored.token_version || 0, 0);
});

test('account binding rejects stale owners on the mounted API before writing a profile', async () => {
  const session = await require('../src/services/authService').issueSession(await db.findUserById(member.id));
  const response = await fetch(base + '/user/profile', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}`, 'X-Account-ID': admin.id }, body: JSON.stringify({ name: 'stale admin draft' }) });
  assert.equal(response.status, 409); assert.equal((await response.json()).code, 'ACCOUNT_CHANGED');
  assert.equal((await savedDb()).users.find(user => user.id === member.id).name, member.name);
});
