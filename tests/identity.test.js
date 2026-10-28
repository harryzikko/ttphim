const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const directory = fs.mkdtempSync(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'film-identity-'));
process.env.DB_PATH = path.join(directory, 'db.json');
const db = require('../src/services/dbService');
const { createIdentityService, TTL } = require('../src/services/identityService');
const { createMailService } = require('../src/services/mailService');
const { createAuthService, generateToken, verifyToken, SESSION_TTL } = require('../src/services/authService');
const { publicUser, verifyPassword } = require('../src/services/passwordService');
const OTPAuth = require('otpauth');
const credentials = { email: 'member@example.test', password: 'correct-password', name: 'Member' };
const metadata = { ip: '127.0.0.1', headers: { 'user-agent': 'Test device' } };
after(async () => { await db.operationQueue; fs.rmSync(directory, { recursive: true, force: true }); });

async function harness() {
  await db.mutate(data => { for (const key of Object.keys(data)) delete data[key]; Object.assign(data, { users: [], watchlist: [], history: [], comments: [] }); });
  let clock = Math.floor(Date.now() / 30000) * 30000;
  const messages = [];
  let offline = false;
  const mail = createMailService({ origin: 'https://cinema.test', env: {}, adapter: async message => {
    if (offline) throw new Error('SMTP offline');
    messages.push(message);
    return { accepted: [message.to] };
  } });
  const now = () => clock;
  const service = createIdentityService({ db, mail, now });
  const auth = createAuthService({ db, now, allowTestFixtures: false });
  const registered = await service.register(credentials, metadata);
  const token = (index = messages.length - 1) => new URLSearchParams(new URL(messages[index].text.match(/https:\/\/\S+/)[0]).hash.slice(1)).get('token');
  async function authenticate(tokenValue) {
    const req = { headers: { authorization: `Bearer ${tokenValue}` } };
    await new Promise((resolve, reject) => auth.authMiddleware(req, {}, error => error ? reject(error) : resolve()));
    return req;
  }
  return { service, auth, registered, messages, token, authenticate, advance: value => { clock += value; }, now, setOffline: value => { offline = value; } };
}
async function enroll(h) {
  const setup = await h.service.mfaSetup(h.registered.user.id, credentials.password, { ...metadata, sessionId: h.registered.sessionId });
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(setup.secret), algorithm: 'SHA1', digits: 6, period: 30 });
  const code = () => totp.generate({ timestamp: h.now() });
  const confirmed = await h.service.mfaConfirm(h.registered.user.id, code(), { ...metadata, sessionId: h.registered.sessionId });
  return { setup, confirmed, code };
}
const denied = (operation, status) => assert.rejects(operation, error => !status || error.status === status);

test('registration redacts secrets and stores only hashed mail and session tokens', async () => {
  const h = await harness();
  const data = await db.read();
  assert.equal(h.registered.user.email_verified, false);
  assert.equal(h.registered.user.mfa_enabled, false);
  assert.equal(data.users[0].session_policy, 'tracked');
  assert.equal(data.identity_tokens[0].hash, crypto.createHash('sha256').update(h.token()).digest('hex'));
  assert.ok(!JSON.stringify(data).includes(h.token()));
  assert.ok(!JSON.stringify(data).includes(verifyToken(h.registered.token).sid));
  const safe = publicUser({ ...data.users[0], mfa: { enabled: true, secret: 'TOPSECRET' }, resetToken: 'TOPSECRET', sessions: ['TOPSECRET'], token_version: 9, unknown: 'TOPSECRET', vip_tier: 'year' });
  assert.ok(!JSON.stringify(safe).includes('TOPSECRET'));
  assert.equal(safe.token_version, undefined);
  assert.equal(safe.vip_tier, 'year');
  assert.equal(safe.mfa_enabled, true);
  assert.ok(h.messages[0].text.includes('/dang-nhap?mode=verify#token='));
});

test('verification is one-use, atomic under racing confirms and resend invalidates the previous link', async () => {
  const h = await harness(), first = h.token();
  await h.service.requestVerification(h.registered.user.id, metadata);
  await denied(h.service.verifyEmail(first, metadata), 400);
  const results = await Promise.allSettled([h.service.verifyEmail(h.token(), metadata), h.service.verifyEmail(h.token(), metadata)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await db.findUserById(h.registered.user.id)).email_verified, true);
});

test('verification and password reset reject expired tokens', async () => {
  const h = await harness(), verify = h.token();
  h.advance(TTL.verify);
  await denied(h.service.verifyEmail(verify, metadata), 400);
  await h.service.forgotPassword(credentials.email, metadata);
  const reset = h.token();
  h.advance(TTL.reset);
  await denied(h.service.resetPassword(reset, 'replacement-password', metadata), 400);
});

test('forgot responses do not enumerate accounts, email throttles or recipient delivery failures', async () => {
  const h = await harness();
  const known = await h.service.forgotPassword(credentials.email, metadata);
  const unknown = await h.service.forgotPassword('missing@example.test', metadata);
  assert.deepEqual(known, unknown);
  h.setOffline(true);
  assert.deepEqual(await h.service.forgotPassword(credentials.email, metadata), unknown);
  await h.service.drainMail();
  assert.equal((await db.read()).identity_tokens.filter(t => t.purpose === 'reset').length, 0);
  for (let i = 0; i < 4; i++) assert.deepEqual(await h.service.forgotPassword(credentials.email, metadata), unknown);
  await h.service.drainMail();
});

test('request and confirmation limits persist failed attempts and reset after their window', async () => {
  const h = await harness();
  for (let i = 0; i < 20; i++) await h.service.forgotPassword('missing@example.test', metadata);
  await denied(h.service.forgotPassword('other@example.test', metadata), 429);
  for (let i = 0; i < 20; i++) await denied(h.service.verifyEmail('a'.repeat(64), metadata), 400);
  await denied(h.service.verifyEmail('a'.repeat(64), metadata), 429);
  h.advance(15 * 60000);
  await h.service.forgotPassword('missing@example.test', metadata);
});

test('reset is one-use, preserves MFA, hashes the password and revokes every session and challenge', async () => {
  const h = await harness();
  await enroll(h);
  const challenge = await h.service.login(credentials, metadata);
  await h.service.forgotPassword(credentials.email, metadata);
  const token = h.token();
  await h.service.resetPassword(token, 'replacement-password', metadata);
  await denied(h.service.resetPassword(token, 'another-password', metadata), 400);
  assert.equal((await h.authenticate(h.registered.token)).user, undefined);
  assert.equal((await db.read()).identity_sessions.length, 0);
  assert.equal((await db.read()).identity_challenges.length, 0);
  const user = await db.findUserById(h.registered.user.id);
  assert.equal(user.mfa.enabled, true);
  assert.equal(await verifyPassword('replacement-password', user.password), true);
  await denied(h.service.login({ challengeId: challenge.challengeId, code: '123456' }, metadata), 401);
});

test('sessions support device isolation, individual and all-other revocation, expiry and token versions', async () => {
  const h = await harness();
  const second = await h.service.login(credentials, { ...metadata, headers: { 'user-agent': 'Phone' } });
  const list = await h.service.sessions(h.registered.user.id, second.sessionId);
  assert.equal(list.length, 2); assert.equal(list.filter(s => s.current).length, 1);
  assert.ok(!JSON.stringify(list).includes('sid_hash'));
  await h.service.revokeSession(h.registered.user.id, h.registered.sessionId);
  assert.equal((await h.authenticate(h.registered.token)).user, undefined);
  assert.equal((await h.authenticate(second.token)).user.id, h.registered.user.id);
  const third = await h.auth.issueSession({ id: h.registered.user.id }, metadata);
  await h.service.revokeSession(h.registered.user.id, null, true, second.sessionId);
  assert.equal((await h.authenticate(third.token)).user, undefined);
  await db.mutate(data => { data.users[0].token_version++; });
  assert.equal((await h.authenticate(second.token)).user, undefined);
  const fourth = await h.auth.issueSession({ id: h.registered.user.id }, metadata);
  h.advance(SESSION_TTL);
  assert.equal((await h.authenticate(fourth.token)).user, undefined);
  assert.equal((await h.service.sessions(h.registered.user.id, fourth.sessionId)).length, 0);
});

test('sid-less compatibility is fixture-only and cannot bypass tracked policy or MFA', async () => {
  const h = await harness();
  assert.equal((await h.authenticate(generateToken(h.registered.user))).user, undefined);
  const fixtureAuth = createAuthService({ db, allowTestFixtures: true });
  const authenticate = async token => {
    const req = { headers: { authorization: `Bearer ${token}` } };
    await fixtureAuth.authMiddleware(req, {}, error => { if (error) throw error; });
    return req.user;
  };
  assert.equal(await authenticate(generateToken(h.registered.user)), undefined);
  await db.mutate(data => { data.users.push({ id: 'fixture', email: 'fixture@example.test', password: 'fixture-password', token_version: 0 }); });
  assert.equal((await authenticate(generateToken({ id: 'fixture' }))).id, 'fixture');
  await db.mutate(data => { data.users.find(u => u.id === 'fixture').mfa = { enabled: true }; });
  assert.equal(await authenticate(generateToken({ id: 'fixture' })), undefined);
});

test('MFA requires fresh password, binds short enrollment to session and encrypts secrets at rest', async () => {
  const h = await harness();
  await denied(h.service.mfaSetup(h.registered.user.id, 'wrong', metadata), 401);
  const setup = await h.service.mfaSetup(h.registered.user.id, credentials.password, { ...metadata, sessionId: 'device-one' });
  assert.ok(!JSON.stringify(await db.read()).includes(setup.secret));
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(setup.secret) });
  const code = totp.generate({ timestamp: h.now() });
  await denied(h.service.mfaConfirm(h.registered.user.id, code, { sessionId: 'other-device' }), 400);
  h.advance(TTL.enrollment);
  await denied(h.service.mfaConfirm(h.registered.user.id, code, { sessionId: 'device-one' }), 400);
});

test('MFA login never returns a full admin session before a code, prevents replay and consumes recovery codes once', async () => {
  const h = await harness();
  await db.mutate(data => { data.users[0].role = 'admin'; });
  const mfa = await enroll(h);
  assert.equal((await h.authenticate(h.registered.token)).user, undefined);
  assert.equal(mfa.confirmed.recoveryCodes.length, 10);
  assert.ok(!JSON.stringify(await db.read()).includes(mfa.confirmed.recoveryCodes[0]));
  const challenge = await h.service.login(credentials, metadata);
  assert.equal(challenge.mfaRequired, true); assert.equal(challenge.token, undefined); assert.equal(challenge.user, undefined);
  await denied(h.service.login({ challengeId: challenge.challengeId, code: mfa.code() }, metadata), 401);
  h.advance(30000);
  const session = await h.service.login({ challengeId: challenge.challengeId, code: mfa.code() }, metadata);
  assert.equal(session.user.role, 'admin');
  await denied(h.service.login({ challengeId: challenge.challengeId, code: mfa.code() }, metadata), 401);
  const next = await h.service.login(credentials, metadata);
  await denied(h.service.login({ challengeId: next.challengeId, code: mfa.code() }, metadata), 401);
  const recovered = await h.service.login({ challengeId: next.challengeId, code: mfa.confirmed.recoveryCodes[0] }, metadata);
  assert.ok(recovered.token);
  const again = await h.service.login(credentials, metadata);
  await denied(h.service.login({ challengeId: again.challengeId, code: mfa.confirmed.recoveryCodes[0] }, metadata), 401);
  await denied(h.service.mfaDisable(h.registered.user.id, 'wrong', mfa.confirmed.recoveryCodes[1], metadata), 401);
  const disabled = await h.service.mfaDisable(h.registered.user.id, credentials.password, mfa.confirmed.recoveryCodes[1], metadata);
  assert.equal(disabled.user.mfa_enabled, false);
  assert.equal((await h.authenticate(recovered.token)).user, undefined);
});

test('MFA challenges expire and stop accepting codes after five attempts', async () => {
  const h = await harness(), mfa = await enroll(h);
  const challenge = await h.service.login(credentials, metadata);
  for (let i = 0; i < 5; i++) await denied(h.service.login({ challengeId: challenge.challengeId, code: 'invalid' }, metadata), 401);
  await denied(h.service.login({ challengeId: challenge.challengeId, code: mfa.confirmed.recoveryCodes[0] }, metadata), 401);
  const next = await h.service.login(credentials, metadata);
  h.advance(TTL.challenge);
  await denied(h.service.login({ challengeId: next.challengeId, code: mfa.confirmed.recoveryCodes[0] }, metadata), 401);
});

test('production mail fails closed without a public HTTPS origin and configured transport', async () => {
  assert.throws(() => createMailService({ production: true, env: {}, origin: '' }).assertReady());
  assert.throws(() => createMailService({ production: true, env: {}, origin: 'http://cinema.test' }).assertReady());
  assert.throws(() => createMailService({ production: true, env: {}, origin: 'https://cinema.test' }).assertReady());
  assert.equal(createMailService({ production: true, env: {}, origin: 'https://cinema.test', adapter() {} }).outbox, undefined);
  const dev = createMailService({ production: false, env: {}, origin: 'http://localhost' });
  await dev.sendIdentityMail({ email: 'member@example.test', token: 'opaque', purpose: 'reset' });
  assert.equal(dev.outbox.length, 1);
});

test('identity router keeps bearer sessions in HttpOnly cookies, hides internal errors and permits unverified resend', async () => {
  const h = await harness();
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use(require('cookie-parser')());
  app.use(h.auth.authMiddleware);
  app.use('/api/auth', require('../src/routes/identityRoutes').createIdentityRouter({ service: h.service }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (url, body, token) => fetch(origin + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  try {
    const response = await request('/api/auth/login', credentials);
    const json = await response.json();
    assert.equal(json.status, true); assert.equal(json.data.token, undefined);
    assert.match(response.headers.get('set-cookie'), /HttpOnly/);
    const resend = await request('/api/auth/verification/request', {}, h.registered.token);
    assert.equal(resend.status, 200);
    const deniedResponse = await request('/api/auth/mfa/setup', { password: credentials.password });
    assert.equal(deniedResponse.status, 401);
    const crossSite = await fetch(origin + '/api/auth/forgot-password', { method: 'POST', headers: { Origin: 'https://attacker.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: credentials.email }) });
    assert.equal(crossSite.status, 403);
    const logout = await request('/api/auth/logout', {}, h.registered.token);
    assert.equal(logout.status, 200);
    assert.equal((await h.authenticate(h.registered.token)).user, undefined);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('MFA router issues no cookie before the challenge and redacts unexpected delivery errors', async () => {
  const h = await harness(), mfa = await enroll(h);
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../src/routes/identityRoutes').createIdentityRouter({ service: h.service }));
  app.use('/failure', require('../src/routes/identityRoutes').createIdentityRouter({ service: { forgotPassword: async () => { throw new Error('smtp password=secret token=secret'); } } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (url, body) => fetch(origin + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const response = await request('/api/auth/login', credentials);
    const json = await response.json();
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(json.data.mfaRequired, true);
    assert.equal(json.data.user, undefined);
    const complete = await request('/api/auth/login', { challengeId: json.data.challengeId, code: mfa.confirmed.recoveryCodes[0] });
    assert.match(complete.headers.get('set-cookie'), /HttpOnly/);
    assert.equal((await complete.json()).data.user.mfa_enabled, true);
    const failure = await request('/failure/forgot-password', { email: credentials.email });
    assert.equal(failure.status, 503);
    assert.ok(!(await failure.text()).includes('secret'));
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('malformed signatures fail safely and production cannot opt into sid-less fixture authentication', async () => {
  const h = await harness();
  assert.equal(verifyToken(`encoded.${'\u00e9'.repeat(43)}`), null);
  const config = require('../src/config');
  const previous = config.IS_PRODUCTION;
  await db.mutate(data => { delete data.users[0].session_policy; });
  const auth = createAuthService({ db, allowTestFixtures: true });
  try {
    config.IS_PRODUCTION = true;
    const req = { headers: { authorization: `Bearer ${generateToken(h.registered.user)}` } };
    await auth.authMiddleware(req, {}, error => { if (error) throw error; });
    assert.equal(req.user, undefined);
  } finally { config.IS_PRODUCTION = previous; }
});

test('login errors are accented and email throttling reports the exact remaining wait without revealing accounts', async () => {
  const h = await harness();
  const typo = { email: 'typo@example.test', password: credentials.password };
  for (let attempt = 0; attempt < 10; attempt++) {
    await assert.rejects(h.service.login(typo, metadata), error => error.status === 401 && error.message.includes('Email hoặc mật khẩu không chính xác'));
  }
  await assert.rejects(h.service.login(typo, metadata), error => error.status === 429 && error.code === 'RATE_LIMITED' && error.retryAfter === 900 && error.message.includes('quá nhiều'));
  h.advance(31000);
  await assert.rejects(h.service.login(typo, metadata), error => error.status === 429 && error.retryAfter === 869);
  const valid = await h.service.login(credentials, metadata);
  assert.equal(valid.user.email, credentials.email);
  h.advance(15 * 60000);
  await assert.rejects(h.service.login(typo, metadata), error => error.status === 401);
});

test('registration persists gender and assigns the supplied matching avatar; invalid values do not create users', async () => {
  const h = await harness();
  const { avatars } = require('../src/services/defaultAvatars');
  for (const [gender, avatar] of [['male', avatars[0]], ['female', avatars[1]]]) {
    const email = `${gender}@example.test`;
    const result = await h.service.register({ email, password: credentials.password, name: 'Same name', gender }, metadata);
    assert.equal(result.user.gender, gender); assert.equal(result.user.avatar, avatar);
    const stored = await db.findUserById(result.user.id);
    assert.equal(stored.gender, gender); assert.equal(stored.avatar, avatar);
    const login = await h.service.login({ email, password: credentials.password }, metadata);
    assert.equal(login.user.gender, gender); assert.equal(login.user.avatar, avatar);
  }
  const count = (await db.read()).users.length;
  for (const gender of ['', 'invalid', 'Male', {}, [], 0]) {
    await denied(h.service.register({ email: 'invalid-gender@example.test', password: credentials.password, gender }, metadata), 400);
  }
  assert.equal((await db.read()).users.length, count);
  const custom = publicUser({ id: 'custom', gender: 'female', avatar: '/media/avatars/' + 'a'.repeat(32) + '.webp' });
  assert.match(custom.avatar, /^\/media\/avatars\//); assert.equal(custom.gender, 'female');
});
