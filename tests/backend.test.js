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
  require.cache[id] = { id, filename: id, loaded: true, exports: service === 'kkphimService' ? { clearHomeCache() {} } : {} };
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
  if (user) headers.Authorization = `Bearer ${generateToken(user)}`;
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') };
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
  assert.equal((await request('/admin/backup', { user: admin })).status, 200);
});

test('anonymous library/profile mutations are rejected without changing the database', async () => {
  const before = await fs.readFile(dbPath, 'utf8');
  for (const [url, method] of [['/user/library', 'GET'], ['/user/watchlist/toggle', 'POST'], ['/user/watchlist/remove', 'POST'], ['/user/history', 'POST'], ['/user/history/clear', 'POST'], ['/user/password', 'POST'], ['/user/profile', 'POST']]) {
    assert.equal((await request(url, { method, body: method === 'POST' ? { movie_slug: 'test', name: 'Injected' } : undefined })).status, 401);
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
  assert.equal((await request('/auth/login', { method: 'POST', body: { ...credentials, password: 'wrong' } })).status, 400);
});

test('legacy passwords migrate on login and password changes remain usable', async () => {
  const login = await request('/auth/login', { method: 'POST', body: { email: member.email, password: member.password } });
  assert.equal(login.status, 200);
  assert.ok((await savedDb()).users.find(user => user.id === member.id).password.startsWith('scrypt$'));
  const change = await request('/user/password', { method: 'POST', user: member, body: { old_password: member.password, new_password: 'new-password' } });
  assert.equal(change.body.status, true);
  assert.equal((await request('/auth/login', { method: 'POST', body: { email: member.email, password: member.password } })).status, 400);
  assert.equal((await request('/auth/login', { method: 'POST', body: { email: member.email, password: 'new-password' } })).status, 200);
});

test('admin creation and password reset hash passwords and omit them from responses', async () => {
  const created = await request('/admin/users/create', { method: 'POST', user: admin, body: { email: 'created@example.test', password: 'created-password' } });
  assert.equal(created.status, 200);
  assert.ok(!('password' in created.body.data));
  const updated = await request(`/admin/users/${created.body.data.id}/update`, { method: 'POST', user: admin, body: { password: 'reset-password', id: 'tampered' } });
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
