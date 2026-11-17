'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const db = require('../src/services/dbService');
const {
  createSession, issueSession, verifyToken,
  WEB_SESSION_TTL, APP_SESSION_TTL, BROWSER_COOKIE_MAX_AGE
} = require('../src/services/authService');

for (const name of ['kkphimService', 'vicdnService', 'nguoncService', 'vodphimService', 'personService', 'tmdbService']) {
  const id = require.resolve(`../src/services/${name}`);
  require.cache[id] = { id, filename: id, loaded: true, exports: {} };
}
const { app } = require('../src/server');

const member = { id: 'lifetime-member', name: 'Member', email: 'lifetime@example.test', password: 'correct-password', role: 'user' };
const original = db.dbPath;
let directory, server, base;

before(async () => {
  directory = await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'session-lifetime-'));
  db.dbPath = path.join(directory, 'db.json');
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  await db.operationQueue;
  await fs.writeFile(db.dbPath, JSON.stringify({ users: [member], watchlist: [], history: [], comments: [] }));
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  await db.operationQueue;
  db.dbPath = original;
  await fs.rm(directory, { recursive: true, force: true });
});

function parseCookieMaxAge(setCookieHeader) {
  const match = String(setCookieHeader || '').match(/Max-Age=(\d+)/i);
  return match ? Number(match[1]) : null;
}

function extractTokenCookie(setCookieHeader) {
  const match = String(setCookieHeader || '').match(/(token=[^;]+)/i);
  return match ? match[1] : '';
}

test('website login keeps 48-hour session and cookie TTL', async () => {
  assert.equal(WEB_SESSION_TTL, 48 * 60 * 60 * 1000);
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ email: member.email, password: member.password })
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.token, undefined);

  const setCookie = res.headers.get('set-cookie');
  const maxAge = parseCookieMaxAge(setCookie);
  assert.ok(maxAge !== null && maxAge >= 48 * 3600 - 10 && maxAge <= 48 * 3600);

  const raw = await db.getRawDatabase();
  assert.equal(raw.identity_sessions.length, 1);
  assert.equal(raw.identity_sessions[0].is_app, false);
  const ttl = raw.identity_sessions[0].expires_at - raw.identity_sessions[0].created_at;
  assert.equal(ttl, WEB_SESSION_TTL);

  // Calling /api/auth/me as website browser does NOT extend or expose Bearer token
  const cookie = extractTokenCookie(setCookie);
  const meRes = await fetch(`${base}/api/auth/me`, {
    headers: { Cookie: cookie, Origin: base }
  });
  assert.equal(meRes.status, 200);
  const meBody = await meRes.json();
  assert.equal(meBody.status, true);
  assert.equal(meBody.token, undefined);
  assert.equal(meRes.headers.get('set-cookie'), null);
});

test('desktop app login keeps 10-year session, clamps cookie to 400 days, and refreshes cookie on /auth/me', async () => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, 'X-Client-Type': 'desktop' },
    body: JSON.stringify({ email: member.email, password: member.password })
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.token, undefined);

  const setCookie = res.headers.get('set-cookie');
  const maxAge = parseCookieMaxAge(setCookie);
  assert.equal(maxAge, Math.floor(BROWSER_COOKIE_MAX_AGE / 1000));

  const raw = await db.getRawDatabase();
  assert.equal(raw.identity_sessions.length, 1);
  assert.equal(raw.identity_sessions[0].is_app, true);
  assert.equal(raw.identity_sessions[0].expires_at - raw.identity_sessions[0].created_at, APP_SESSION_TTL);

  // Desktop /api/auth/me refreshes cookie TTL cleanly
  const cookie = extractTokenCookie(setCookie);
  const meRes = await fetch(`${base}/api/auth/me`, {
    headers: { Cookie: cookie, Origin: base, 'X-Client-Type': 'desktop' }
  });
  assert.equal(meRes.status, 200);
  const meBody = await meRes.json();
  assert.equal(meBody.status, true);
  assert.equal(meBody.token, undefined);
  assert.equal(parseCookieMaxAge(meRes.headers.get('set-cookie')), Math.floor(BROWSER_COOKIE_MAX_AGE / 1000));
});

test('native mobile and TV sessions receive 10-year tokens and never get evicted by 25+ website logins', async () => {
  const nativeRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-Type': 'native' },
    body: JSON.stringify({ email: member.email, password: member.password })
  });
  assert.equal(nativeRes.status, 200);
  const nativeBody = await nativeRes.json();
  const nativeToken = nativeBody.data.token;
  assert.ok(nativeToken);
  const payload = verifyToken(nativeToken);
  assert.ok(payload.exp - Date.now() > 9 * 365 * 24 * 60 * 60 * 1000);

  // Create TV QR session -> also 10-year app session
  const tvStart = await fetch(`${base}/api/auth/tv/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const tvData = (await tvStart.json()).data;
  await fetch(`${base}/api/auth/tv/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${nativeToken}` },
    body: JSON.stringify({ token: tvData.token })
  });
  const tvStatus = await (await fetch(`${base}/api/auth/tv/status?token=${tvData.token}`)).json();
  assert.equal(tvStatus.status, 'approved');
  const tvPayload = verifyToken(tvStatus.token);
  assert.ok(tvPayload.exp - Date.now() > 9 * 365 * 24 * 60 * 60 * 1000);

  // Perform 25 website logins in DB directly; app sessions must remain active!
  await db.mutate(data => {
    for (let i = 0; i < 25; i++) {
      createSession(data, data.users[0], { ip: '127.0.0.1', headers: { 'user-agent': `Browser-${i}` } }, Date.now() + i);
    }
  });

  for (const [label, tok, clientHeader] of [['native', nativeToken, 'native'], ['tv', tvStatus.token, 'tv']]) {
    const check = await fetch(`${base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${tok}`, 'X-Client-Type': clientHeader }
    });
    const json = await check.json();
    assert.equal(json.status, true, `${label} session should survive 25+ website logins`);
    assert.equal(json.data.id, member.id);
  }
});

test('older short app token upgrades seamlessly to 10-year session via /api/auth/me', async () => {
  // Simulate an older 48h session created before the app lifetime update
  const issued = await issueSession(member, { ip: '127.0.0.1', headers: { 'user-agent': 'LegacyMobile' } });
  const oldPayload = verifyToken(issued.token);
  assert.ok(oldPayload.exp - Date.now() <= WEB_SESSION_TTL + 5000);

  // Mobile native request upgrades token on /api/auth/me
  const res = await fetch(`${base}/api/auth/me`, {
    headers: { Authorization: `Bearer ${issued.token}`, 'X-Client-Type': 'native' }
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, true);
  assert.ok(body.token, 'upgraded 10-year token returned to native app');
  const upgraded = verifyToken(body.token);
  assert.ok(upgraded.exp - Date.now() > 9 * 365 * 24 * 60 * 60 * 1000);
});

test('public/js/api.js sends X-Client-Type: desktop only when running in Desktop App shell', async () => {
  const vm = require('node:vm');
  const apiSource = await fs.readFile(path.join(__dirname, '../public/js/api.js'), 'utf8');

  for (const isDesktop of [false, true]) {
    let capturedHeaders = null;
    const context = {
      window: {
        location: { pathname: '/' },
        ...(isDesktop ? { __CINEVIET_DESKTOP__: true } : {})
      },
      document: { querySelector: () => null, querySelectorAll: () => [] },
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      fetch: async (_url, opts) => {
        capturedHeaders = opts.headers;
        return { status: 200, text: async () => JSON.stringify({ status: true, data: null }) };
      },
      Event: class {},
      URLSearchParams
    };
    vm.createContext(context);
    vm.runInContext(`${apiSource}\nthis.__API = API;`, context);
    await context.__API.request('/api/auth/me');
    assert.equal(capturedHeaders['X-Client-Type'], isDesktop ? 'desktop' : undefined);
  }
});
