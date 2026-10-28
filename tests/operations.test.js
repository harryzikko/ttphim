const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const db = require('../src/services/dbService');
const { issueSession } = require('../src/services/authService');
const metrics = require('../src/services/metricsService');
const moderation = require('../src/services/moderationService');
const backups = require('../src/services/backupService');
for (const name of ['kkphimService', 'vicdnService', 'personService', 'tmdbService']) {
  const id = require.resolve(`../src/services/${name}`); require.cache[id] = { id, filename: id, loaded: true, exports: {} };
}
const { app } = require('../src/server');
const admin = { id: 'ops-admin', name: 'Admin', email: 'admin@example.test', password: 'old-password', role: 'admin' };
const member = { id: 'ops-member', name: 'Member', email: 'member@example.test', password: 'old-password', role: 'user' };
const original = db.dbPath;
let directory, server, base;
before(async () => {
  directory = await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'ops-regression-'));
  db.dbPath = path.join(directory, 'db.json');
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  await db.operationQueue; metrics.resetForTests();
  await fs.writeFile(db.dbPath, JSON.stringify({ users: [admin, member], watchlist: [], history: [], comments: [
    { id: 'comment', movie_slug: 'film', user_id: member.id, user_name: member.name, content: 'Original comment', replies: [{ id: 'reply', content: 'Original reply' }] }
  ] }));
});
after(async () => { await new Promise(resolve => server.close(resolve)); await db.operationQueue; db.dbPath = original; await fs.rm(directory, { recursive: true, force: true }); });
async function request(url, { user, token, body, method = body === undefined ? 'GET' : 'POST' } = {}) {
  if (user) token = (await issueSession(user)).token;
  const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

test('operations/admin moderation are private and user directory redacts MFA secrets', async () => {
  assert.equal((await request('/api/admin/operations')).status, 401);
  assert.equal((await request('/api/admin/moderation', { user: member })).status, 403);
  await db.mutate(data => { data.users[1].mfa = { enabled: true, secret: 'encrypted-secret', recovery_hashes: ['recovery-hash'] }; });
  const result = await request('/api/admin/users', { user: admin });
  assert.equal(result.status, 200);
  const text = JSON.stringify(result.body);
  assert.ok(!text.includes('encrypted-secret') && !text.includes('recovery-hash') && !text.includes('old-password'));
});

test('reporting is deduplicated and hidden comments/replies disappear publicly', async () => {
  for (let i = 0; i < 2; i++) assert.equal((await request('/api/comments/comment/report', { user: member, body: { reason: 'Spam' } })).status, 200);
  assert.equal((await db.getRawDatabase()).comment_reports.length, 1);
  await moderation.setVisibility(admin, 'reply', true, 'Spam reply');
  assert.equal((await db.getComments('film'))[0].replies.length, 0);
  assert.equal((await request('/api/admin/moderation/comments/comment', { user: member, body: { hidden: true, reason: 'Spam' } })).status, 403);
  assert.equal((await request('/api/admin/moderation/comments/comment', { user: admin, body: { hidden: true, reason: 'Spam' } })).status, 200);
  assert.equal((await db.getComments('film')).length, 0);
  await moderation.setVisibility(admin, 'comment', false, 'Reviewed');
  assert.equal((await db.getComments('film')).length, 1);
  const data = await db.getRawDatabase();
  assert.ok(data.audit_log.some(item => item.action === 'comment.hide'));
  assert.equal(data.comment_reports[0].status, 'resolved');
});

test('blocking revokes tracked sessions and blocked accounts cannot authenticate', async () => {
  const token = (await issueSession(member)).token;
  assert.equal((await request('/api/user/library', { token })).status, 200);
  await moderation.setBlocked(admin, member.id, true, 'Repeated abuse');
  assert.equal((await request('/api/user/library', { token })).status, 401);
  assert.equal((await request('/api/auth/login', { body: { email: member.email, password: 'old-password' } })).status, 401);
  await moderation.setBlocked(admin, member.id, false, 'Reviewed appeal');
  assert.equal((await request('/api/auth/login', { body: { email: member.email, password: 'old-password' } })).status, 200);
});

test('the last admin and security fields cannot be bypassed by generic admin updates', async () => {
  await assert.rejects(db.deleteUser(admin.id), /last active administrator/);
  await assert.rejects(db.updateUser(admin.id, { role: 'user' }), /last active administrator/);
  await assert.rejects(moderation.setBlocked(member, admin.id, true, 'Probe'), /last active administrator/);
  await db.updateUser(member.id, { mfa: { enabled: false }, session_policy: null, token_version: 0 });
  const stored = await db.findUserById(member.id);
  assert.equal(stored.mfa, undefined); assert.equal(stored.session_policy, undefined);
});

test('telemetry validates whole batches, excludes identifiers and persists aggregate metrics', async () => {
  assert.equal((await request('/api/playback/events', { body: { events: [{ event: 'start', provider: 'hls', duration_ms: 0 }, { event: 'ready', startup_ms: 500, duration_ms: 500 }] } })).status, 202);
  assert.equal((await request('/api/playback/events', { body: { events: [{ event: 'start' }, { event: 'error', url: 'https://private-media.test/token' }] } })).status, 400);
  metrics.recordRequest(500, 200);
  const result = await metrics.summary();
  assert.equal(result.playback.start, 1); assert.equal(result.playback.ready, 1); assert.equal(result.mean_startup_ms, 500);
  assert.ok(result.errors >= 1); assert.ok(!JSON.stringify(await db.getRawDatabase()).includes('private-media'));
});

test('audit never stores submitted credentials and a failed mutation still has an audit result', async () => {
  const response = await request('/api/admin/users/ops-member/update', { user: admin, body: { password: 'audit-secret-password' } });
  assert.equal(response.status, 200); await db.operationQueue;
  const text = JSON.stringify((await db.getRawDatabase()).audit_log);
  assert.ok(text.includes('admin.request') && text.includes('admin.result'));
  assert.ok(!text.includes('audit-secret-password'));
});

test('encrypted backups verify, reject tampering, retain only own files and restore core state', async () => {
  const output = path.join(directory, 'backups'); const key = crypto.randomBytes(32);
  await fs.mkdir(output); await fs.writeFile(path.join(output, 'unrelated.txt'), 'preserve');
  const first = await backups.run({ directory: output, retention: 1, key });
  const envelope = await fs.readFile(path.join(output, first.filename), 'utf8');
  assert.ok(!envelope.includes('old-password') && !envelope.includes(member.email));
  const snapshot = backups.decrypt(envelope, key); assert.equal(snapshot.users.length, 2);
  const changed = JSON.parse(envelope); changed.tag = crypto.randomBytes(16).toString('base64');
  assert.throws(() => backups.decrypt(JSON.stringify(changed), key));
  assert.throws(() => backups.decrypt(envelope, crypto.randomBytes(32)));
  const second = await backups.run({ directory: output, retention: 1, key });
  assert.ok((await fs.readdir(output)).includes('unrelated.txt'));
  assert.equal((await fs.readdir(output)).filter(name => name.endsWith('.backup')).length, 1);
  assert.ok(await fs.readFile(path.join(output, second.filename)));
});

test('comment throttles are atomic under concurrent submissions', async () => {
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => db.addComment({ movieSlug: 'film', userId: member.id, userName: member.name, content: 'Comment ' + index })));
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 5);
  assert.equal(results.filter(item => item.status === 'rejected' && item.reason.status === 429).length, 3);
});

test('native login returns a tracked bearer while browser login never exposes one', async () => {
  const web = await request('/api/auth/login', { body: { email: member.email, password: 'old-password' } });
  assert.equal(web.status, 200); assert.equal(web.body.data.token, undefined);
  const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-Type': 'native' }, body: JSON.stringify({ email: member.email, password: 'old-password' }) });
  const result = await response.json();
  assert.ok(result.data.token);
  assert.equal((await request('/api/user/library', { token: result.data.token })).status, 200);
  const browserRequest = await fetch(base + '/api/auth/login', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', 'X-Client-Type': 'native' }, body: JSON.stringify({ email: member.email, password: 'old-password' }) });
  assert.equal((await browserRequest.json()).data.token, undefined);
});

test('TV polling stops returning a token after its per-device session is revoked', async () => {
  const tv = await request('/api/auth/tv/session', { body: {} });
  await request('/api/auth/tv/authorize', { user: member, body: { token: tv.body.data.token } });
  const approved = await request('/api/auth/tv/status?token=' + tv.body.data.token);
  assert.equal(approved.body.status, 'approved');
  const payload = require('../src/services/authService').verifyToken(approved.body.token);
  await db.mutate(data => { data.identity_sessions = data.identity_sessions.filter(session => session.sid_hash !== crypto.createHash('sha256').update(payload.sid).digest('hex')); });
  assert.equal((await request('/api/auth/tv/status?token=' + tv.body.data.token)).body.status, 'expired');
});

test('admin MFA policy requires enrollment without blocking account security endpoints', async () => {
  const config = require('../src/config'); const original = config.REQUIRE_ADMIN_MFA;
  config.REQUIRE_ADMIN_MFA = true;
  try {
    const token = (await issueSession(admin)).token;
    const adminResult = await request('/api/admin/operations', { token });
    assert.equal(adminResult.status, 403); assert.equal(adminResult.body.code, 'MFA_ENROLLMENT_REQUIRED');
    assert.equal((await request('/api/auth/sessions', { token })).status, 200);
  } finally { config.REQUIRE_ADMIN_MFA = original; }
});

test('source monitoring rejects empty feeds and deduplicates operational alerts', async () => {
  const monitor = require('../src/services/sourceMonitorService');
  const original = process.env.ALERTS_ENABLED; process.env.ALERTS_ENABLED = 'false';
  try {
    const calls = [];
    const fetcher = async url => { calls.push(url); return new Response(JSON.stringify(url.includes('vicdn.cc') ? {} : { items: [] }), { headers: { 'Content-Type': 'application/json' } }); };
    const first = await monitor.check(fetcher);
    assert.deepEqual(first.map(item => item.name), ['kkphim', 'vicdn']);
    assert.equal(first.filter(item => item.healthy).length, 1);
    await monitor.check(fetcher);
    assert.equal(calls.length, 4);
    assert.equal((await db.getRawDatabase()).operational_alerts.filter(item => item.kind === 'source_vicdn_down').length, 1);
  } finally { if (original === undefined) delete process.env.ALERTS_ENABLED; else process.env.ALERTS_ENABLED = original; }
});

test('changing an email resets verification and revokes previous sessions', async () => {
  await db.mutate(data => { data.users[1].email_verified = true; data.users[1].email_verified_at = new Date().toISOString(); });
  const token = (await issueSession(member)).token;
  await db.updateUser(member.id, { email: 'new-address@example.test' });
  const changed = await db.findUserById(member.id);
  assert.equal(changed.email_verified, false); assert.equal(changed.email_verified_at, null);
  assert.equal((await request('/api/user/library', { token })).status, 401);
});
