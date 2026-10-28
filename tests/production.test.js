const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { JSDOM } = require('jsdom');
const db = require('../src/services/dbService');
const config = require('../src/config');
const { generateToken, verifyToken } = require('../src/services/authService');
const party = require('../src/services/partyService');
for (const name of ['kkphimService', 'vicdnService', 'personService', 'tmdbService']) {
  const id = require.resolve(`../src/services/${name}`);
  require.cache[id] = { id, filename: id, loaded: true, exports: {} };
}
const { app } = require('../src/server');
const template = require('../src/services/templateService');
const admin = { id: 'production-admin', email: 'admin@example.test', name: 'Admin', role: 'admin', password: 'old-password' };
const member = { id: 'production-member', email: 'member@example.test', name: 'Member', role: 'user', password: 'old-password' };
let directory, dbPath, server, base;
const originalPath = db.dbPath;

function child(code, args = [], env = {}) {
  return new Promise((resolve, reject) => {
    const processChild = spawn(process.execPath, ['-e', code, ...args], { cwd: path.join(__dirname, '..'), env: { ...process.env, ...env } });
    let stdout = '', stderr = '';
    processChild.stdout.on('data', chunk => { stdout += chunk; });
    processChild.stderr.on('data', chunk => { stderr += chunk; });
    processChild.once('error', reject);
    processChild.once('exit', code => resolve({ code, stdout, stderr }));
  });
}

before(async () => {
  directory = await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'film-production-'));
  dbPath = path.join(directory, 'db.json');
  db.dbPath = dbPath;
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  await db.operationQueue;
  party.rooms.clear();
  await fs.writeFile(dbPath, JSON.stringify({ users: [admin, member], comments: [], watchlist: [], history: [] }));
});
after(async () => {
  party.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await db.operationQueue;
  db.dbPath = originalPath;
  await fs.rm(directory, { recursive: true, force: true });
});
async function request(url, { user, token, body, method = 'GET', headers = {} } = {}) {
  if (user) token = generateToken(user);
  if (token) headers = { ...headers, Authorization: `Bearer ${token}` };
  const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  return { response, body: response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text() };
}

test('public default key and legacy versionless tokens cannot authenticate', async () => {
  assert.notEqual(config.JWT_SECRET, 'obsidian_cinema_kkphim_secret_2026');
  for (const [secret, version] of [['obsidian_cinema_kkphim_secret_2026', 0], [config.JWT_SECRET, undefined]]) {
    const payload = Buffer.from(JSON.stringify({ userId: admin.id, exp: Date.now() + 60000, version })).toString('base64url');
    const token = `${payload}.${crypto.createHmac('sha256', secret).update(payload).digest('base64url')}`;
    assert.equal(verifyToken(token), null);
    assert.equal((await request('/api/admin/users', { token })).response.status, 401);
  }
});

test('password change revokes all old sessions and a fresh login still works', async () => {
  const token = generateToken(member);
  const change = await request('/api/user/password', { token, method: 'POST', body: { old_password: 'old-password', new_password: 'new-password' } });
  assert.equal(change.body.status, true);
  assert.match(change.response.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
  assert.equal((await request('/api/user/library', { token })).response.status, 401);
  const login = await request('/api/auth/login', { method: 'POST', body: { email: member.email, password: 'new-password' } });
  assert.equal(login.body.status, true);
  assert.equal(login.body.data.token, undefined);
  assert.equal((await request('/api/user/library', { headers: { Cookie: login.response.headers.get('set-cookie').split(';')[0] } })).response.status, 200);
});

test('logout revokes captured bearer tokens as well as clearing the cookie', async () => {
  const token = generateToken(member);
  assert.equal((await request('/api/auth/logout', { token, method: 'POST' })).response.status, 200);
  assert.equal((await request('/api/user/library', { token })).response.status, 401);
});

test('admin password resets and role changes revoke existing sessions', async () => {
  const token = generateToken(member);
  await db.updateUser(member.id, { password: 'reset-password', token_version: 0 });
  assert.equal((await request('/api/user/library', { token })).response.status, 401);
  const current = await db.findUserById(member.id);
  const nextToken = generateToken(current);
  await db.updateUser(member.id, { role: 'admin' });
  assert.equal((await request('/api/user/library', { token: nextToken })).response.status, 401);
});

test('cross-origin form writes are blocked without changing profile; same-origin cookie writes work', async () => {
  const token = generateToken(member);
  for (const origin of ['https://untrusted.example', 'null']) {
    const response = await fetch(base + '/api/user/profile', { method: 'POST', headers: { Origin: origin, Cookie: `token=${token}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'name=Injected' });
    assert.equal(response.status, 403);
  }
  assert.equal((await db.findUserById(member.id)).name, member.name);
  const response = await request('/api/user/profile', { method: 'POST', body: { name: 'Updated' }, headers: { Origin: base, Cookie: `token=${token}` } });
  assert.equal(response.body.data.name, 'Updated');
  assert.equal(response.response.headers.get('access-control-allow-origin'), base);
  assert.equal(response.response.headers.get('access-control-allow-credentials'), 'true');
});

test('invalid comment sizes, ratings, avatar schemes and progress return 400', async () => {
  for (const body of [{ content: 'x', rating: 1000000 }, { content: 'x'.repeat(5001) }, { content: {} }]) {
    assert.equal((await request('/api/comments/film', { user: member, method: 'POST', body })).response.status, 400);
  }
  assert.equal((await request('/api/user/profile', { user: member, method: 'POST', body: { avatar: 'javascript:alert(1)' } })).response.status, 400);
  assert.equal((await request('/api/user/history', { user: member, method: 'POST', body: { movie_slug: 'film', current_time: -1 } })).response.status, 400);
});

test('stored comment content, names and avatars cannot inject executable SSR markup', async () => {
  const payload = '<img id="xss-probe" src=x onerror="window.injected=1">';
  const comments = [{ content: payload + '$&', user_name: payload, user_avatar: 'x" onerror="window.injected=2', rating: 1000000 }];
  const detail = { movie: { slug: 'film', name: 'Film', category: [], country: [], actor: [], director: [] }, episodes: [], related: [] };
  const watch = await fs.readFile(path.join(__dirname, '../public/xem-phim.html'), 'utf8');
  const rendered = template.renderWatch(watch, detail, undefined, comments);
  const dom = new JSDOM(rendered);
  assert.equal(dom.window.document.querySelector('#xss-probe'), null);
  assert.ok(!dom.window.document.querySelector('#watch-comments-list').textContent.includes(payload + '$&'));
  assert.ok(!rendered.includes('src="x" onerror="window.injected=2'));
  dom.window.close();
  const html = '<div id="detail-comments-list"><p>Old comment</p></div>';
  const safeDetail = template.renderDetail(html, detail, comments);
  assert.ok(safeDetail.includes('Đang tải bình luận'));
  assert.ok(!safeDetail.includes('&lt;img'));
  assert.ok(!safeDetail.includes('id="xss-probe"'));
  assert.ok(safeDetail.length < 20000);
});

test('party membership and host-only controls cannot be bypassed by heartbeat or SSE identity', async () => {
  const room = party.createRoom({ movieSlug: 'film', user: admin });
  for (const action of ['play', 'heartbeat']) {
    assert.throws(() => party.syncPlayer(room.code, member.id, { action, currentTime: 900 }));
  }
  assert.throws(() => party.sendChat(room.code, member.id, { content: 'x' }));
  assert.throws(() => party.sendReaction(room.code, member.id, { emoji: 'x' }));
  assert.equal((await request(`/api/party/${room.code}/stream?userId=${admin.id}`)).response.status, 401);
  assert.equal((await request(`/api/party/${room.code}/stream?userId=${admin.id}`, { user: member })).response.status, 403);
  party.joinRoom(room.code, member);
  party.syncPlayer(room.code, admin.id, { action: 'seek', currentTime: 120 });
  party.syncPlayer(room.code, member.id, { action: 'heartbeat', currentTime: 900 });
  assert.equal(party.getRoom(room.code).currentTime, 120);
  assert.throws(() => party.syncPlayer(room.code, member.id, { action: 'seek', currentTime: 900 }));
  assert.ok(party.sendChat(room.code, member.id, { content: 'Allowed' }));
});

test('multiple node processes sharing a database retain every increment', async () => {
  const shared = path.join(directory, 'shared.json');
  await fs.writeFile(shared, JSON.stringify({ users: [], watchlist: [], history: [], comments: [], movie_views: {} }));
  const code = `const db=require('./src/services/dbService'); db.dbPath=process.argv[1]; Promise.all(Array.from({length:15},()=>db.incrementMovieView('film'))).catch(e=>{console.error(e);process.exitCode=1;});`;
  const results = await Promise.all(Array.from({ length: 3 }, () => child(code, [shared])));
  for (const result of results) assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(await fs.readFile(shared)).movie_views.film, 45);
});

test('mobile redirects retain server, room and explicit view query parameters', async () => {
  const { response } = await request('/xem-phim/film/tap-2?server=1&room=KP-1234&view=mobile', { headers: { 'User-Agent': 'Android' } });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/mobile/xem-phim/film/tap-2?server=1&room=KP-1234&view=mobile');
});

test('readiness detects corrupt database; errors and headers do not expose a stack', async () => {
  let result = await request('/api/ready');
  assert.equal(result.response.status, 200);
  assert.ok(result.response.headers.get('x-request-id'));
  assert.equal(result.response.headers.get('x-content-type-options'), 'nosniff');
  await fs.writeFile(dbPath, '{broken');
  result = await request('/api/ready');
  assert.equal(result.response.status, 503);
  const invalid = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(invalid.status, 400);
  assert.ok(!(await invalid.text()).includes('SyntaxError'));
});

test('production config fails closed on missing/default secret or missing persistent DB path', async () => {
  for (const secret of ['', 'short', 'obsidian_cinema_kkphim_secret_2026']) {
    const result = await child("require('./src/config')", [], { NODE_ENV: 'production', JWT_SECRET: secret, DB_PATH: dbPath, PUBLIC_ORIGIN: 'https://cinema.example.com' });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /private JWT_SECRET/);
  }
  const missingDb = await child("require('./src/config')", [], { NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(64), DB_PATH: '', PUBLIC_ORIGIN: 'https://cinema.example.com' });
  assert.notEqual(missingDb.code, 0);
  assert.match(missingDb.stderr, /absolute DB_PATH/);
  const valid = await child("const s=require('./src/services/requestSecurity');console.log(JSON.stringify(s.cookieOptions))", [], { NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(64), DB_PATH: dbPath, PUBLIC_ORIGIN: 'https://cinema.example.com' });
  assert.equal(valid.code, 0, valid.stderr);
  assert.match(valid.stdout, /"secure":true/);
  assert.match(valid.stdout, /"sameSite":"lax"/);
});

test('repeated failed logins eventually receive 429', async () => {
  let limited = false;
  for (let i = 0; i < 22; i++) {
    const result = await request('/api/auth/login', { method: 'POST', body: { email: member.email, password: 'wrong' } });
    if (result.response.status === 429) { limited = true; break; }
  }
  assert.equal(limited, true);
});

test('backup is exclusive, verifies schema and restores a usable temporary database', async () => {
  const backup = path.join(directory, 'backup.json');
  const backupResult = await child("require('./scripts/database.cjs').run('backup',process.argv[1]).catch(e=>{console.error(e.message);process.exitCode=1;})", [backup], { DB_PATH: dbPath });
  assert.equal(backupResult.code, 0, backupResult.stderr);
  const verified = await child("require('./scripts/database.cjs').run('verify',process.argv[1]).catch(e=>{console.error(e.message);process.exitCode=1;})", [backup]);
  assert.equal(verified.code, 0, verified.stderr);
  const duplicate = await child("require('./scripts/database.cjs').run('backup',process.argv[1]).catch(e=>{console.error(e.message);process.exitCode=1;})", [backup], { DB_PATH: dbPath });
  assert.notEqual(duplicate.code, 0);
  const restored = path.join(directory, 'restored.json');
  await fs.copyFile(backup, restored);
  const instance = new db.constructor();
  instance.dbPath = restored;
  assert.equal((await instance.findUserById(member.id)).email, member.email);
  await instance.incrementMovieView('restored-film');
  assert.equal((await instance.getMovieViews())['restored-film'], 1);
});

test('production startup/readiness/shutdown work and a missing DB never becomes an empty one', async () => {
  const env = { NODE_ENV: 'production', JWT_SECRET: crypto.randomBytes(48).toString('hex'), DB_PATH: dbPath, PUBLIC_ORIGIN: 'https://cinema.example.com', PORT: '0', HOST: '127.0.0.1' };
  const code = `(async()=>{const {start}=require('./src/server');const server=await start();if(!server.listening)await new Promise(r=>server.once('listening',r));const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/ready');if(response.status!==200)throw new Error('not ready');console.log('PRODUCTION_SMOKE_OK');process.emit('SIGTERM');})().catch(e=>{console.error(e);process.exitCode=1;});`;
  const result = await child(code, [], env);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /PRODUCTION_SMOKE_OK/);
  const missing = path.join(directory, 'missing-production.json');
  const failure = await child("require('./src/server').start().catch(e=>{console.error(e.message);process.exitCode=1;})", [], { ...env, DB_PATH: missing });
  assert.notEqual(failure.code, 0);
  assert.match(failure.stderr, /must be provisioned/);
  await assert.rejects(fs.access(missing));
});

test('nonmembers receive only an invitation preview, not messages or members', async () => {
  const room = party.createRoom({ movieSlug: 'film', user: admin });
  party.sendChat(room.code, admin.id, { content: 'Private room conversation' });
  for (const user of [undefined, member]) {
    const result = await request(`/api/party/${room.code}`, { user });
    assert.equal(result.body.data.movieSlug, 'film');
    assert.equal(result.body.data.messages, undefined);
    assert.equal(result.body.data.members, undefined);
  }
  const result = await request(`/api/party/${room.code}`, { user: admin });
  assert.ok(result.body.data.messages.some(message => message.content === 'Private room conversation'));
});

test('open SSE connections close immediately on logout, password changes and admin resets', async () => {
  for (const action of ['logout', 'password', 'reset']) {
    const user = await db.findUserById(member.id);
    const room = party.createRoom({ movieSlug: 'film', user });
    const response = await fetch(`${base}/api/party/${room.code}/stream`, {
      headers: { Authorization: `Bearer ${generateToken(user)}` }, signal: AbortSignal.timeout(5000)
    });
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const first = await reader.read();
    assert.ok(new TextDecoder().decode(first.value).includes('"type":"init"'));
    if (action === 'logout') await db.revokeUserSessions(user.id);
    if (action === 'password') await db.changePassword(user.id, 'old-password', 'changed-password');
    if (action === 'reset') await db.updateUser(user.id, { password: 'reset-password' });
    assert.equal((await reader.read()).done, true);
    assert.equal(party.getRoom(room.code).streams.has(user.id), false);
  }
});

test('broadcast does not send data through an expired SSE session', async () => {
  const room = party.createRoom({ movieSlug: 'film', user: member });
  const response = await fetch(`${base}/api/party/${room.code}/stream`, {
    headers: { Authorization: `Bearer ${generateToken(member)}` }, signal: AbortSignal.timeout(5000)
  });
  const reader = response.body.getReader();
  await reader.read();
  const stream = [...party.getRoom(room.code).streams.get(member.id)][0];
  stream.partyExpiresAt = Date.now() - 1;
  party.broadcast(room.code, { type: 'must-not-arrive' });
  assert.equal((await reader.read()).done, true);
});

test('parseable but invalid database schema fails readiness without replacement', async () => {
  await fs.writeFile(dbPath, '{}');
  assert.equal((await request('/api/ready')).response.status, 503);
  await assert.rejects(db.findUserById(member.id), /Missing database array/);
  assert.equal(await fs.readFile(dbPath, 'utf8'), '{}');
});

test('proxy configuration parses false, hop counts and exact trusted subnets', async () => {
  for (const [value, expected] of [['false', false], ['0', false], ['1', 1], ['loopback', ['loopback']], ['127.0.0.1,::1', ['127.0.0.1', '::1']]]) {
    const result = await child("console.log('PROXY='+JSON.stringify(require('./src/config').TRUST_PROXY))", [], { TRUST_PROXY: value, NODE_ENV: 'development' });
    assert.equal(result.code, 0, result.stderr);
    assert.ok(result.stdout.includes('PROXY=' + JSON.stringify(expected)));
  }
  const unsafe = await child("require('./src/config')", [], { TRUST_PROXY: 'true', NODE_ENV: 'development' });
  assert.notEqual(unsafe.code, 0);
  assert.match(unsafe.stderr, /TRUST_PROXY=true is unsafe/);
});

test('shutdown deadline exits with an error even if the database queue stalls', async () => {
  const code = `(async()=>{for(const name of ['kkphimService','vicdnService','personService','tmdbService']){const id=require.resolve('./src/services/'+name);require.cache[id]={id,filename:id,loaded:true,exports:{}};}const {start}=require('./src/server');const server=await start();if(!server.listening)await new Promise(r=>server.once('listening',r));require('./src/services/dbService').operationQueue=new Promise(()=>{});setInterval(()=>{},1000);process.emit('SIGTERM');})().catch(e=>{console.error(e);process.exitCode=1;});`;
  const started = Date.now();
  const result = await child(code, [], { NODE_ENV: 'development', PORT: '0', HOST: '127.0.0.1', SHUTDOWN_TIMEOUT_MS: '100' });
  assert.equal(result.code, 1, result.stderr);
  assert.ok(Date.now() - started < 5000);
});
