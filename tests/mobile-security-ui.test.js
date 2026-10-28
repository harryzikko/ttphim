const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('public/mobile/tai-khoan.html');
const controller = read('public/mobile/js/tai-khoan.js');
const security = read('public/mobile/js/account-security.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
const account = { id: 7, name: 'Server Name', email: 'fixture@example.test', avatar: '/avatar.svg', email_verified: false, mfa_enabled: false };
const ok = data => ({ status: true, data });
function pending() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function fixture(t, overrides = {}) {
  const dom = new JSDOM(html, { url: 'https://cineviet.test/mobile/tai-khoan', runScripts: 'outside-only' });
  const w = dom.window;
  t.after(() => { w.dispatchEvent(new w.Event('pagehide')); w.close(); });
  const calls = { me: 0, sessions: 0, resend: 0, password: [], setup: [], confirm: [], disable: [], revoke: [], others: 0, logout: 0 };
  let user = { ...account };
  const api = {
    getMe: async () => { calls.me++; return { ...user }; },
    getLibrary: async () => ({ watchlist: [] }),
    getSessions: async () => { calls.sessions++; return ok([
      { id: 'current', current: true, device: 'Fixture Phone', ip: '127.0.0.1', created_at: '2026-01-01', expires_at: '2027-01-01' },
      { id: 'other', current: false, device: '<img src=x onerror=alert(1)>', ip: '<script>bad</script>' }
    ]); },
    requestVerification: async () => { calls.resend++; return ok({}); },
    changePassword: async (...args) => { calls.password.push(args); return ok({}); },
    setupMfa: async (...args) => { calls.setup.push(args); return ok({ secret: 'FIXTURESECRET', otpauthUrl: 'otpauth://totp/CineViet:fixture?secret=FIXTURESECRET&issuer=CineViet' }); },
    confirmMfa: async (...args) => { calls.confirm.push(args); user.mfa_enabled = true; return ok({ user: { ...user }, recoveryCodes: ['FIXTURE-ONE', '<b>FIXTURE-TWO</b>'] }); },
    disableMfa: async (...args) => { calls.disable.push(args); user.mfa_enabled = false; return ok({ user: { ...user } }); },
    revokeSession: async id => { calls.revoke.push(id); return ok({}); },
    revokeOtherSessions: async () => { calls.others++; return ok({}); },
    logout: async () => { calls.logout++; return ok({}); },
    ...overrides
  };
  let init;
  const add = w.document.addEventListener.bind(w.document);
  w.document.addEventListener = (name, fn, ...rest) => name === 'DOMContentLoaded' ? (init = fn) : add(name, fn, ...rest);
  const browser = {
    location: { href: '/mobile/tai-khoan', hash: '', replace(value) { this.href = value; } },
    history: w.history,
    confirm: () => true,
    addEventListener: w.addEventListener.bind(w)
  };
  w.API = api;
  new w.Function('window', 'API', security)(browser, api);
  new w.Function('window', 'API', controller)(browser, api);
  const el = id => w.document.getElementById(id);
  const click = async id => { el(id).click(); await tick(); await tick(); };
  const submit = async () => { el('m-password-form').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick(); };
  return { w, el, api, browser, calls, click, submit, start: () => init(), setUser: next => { user = { ...user, ...next }; } };
}

test('mobile markup has unique dedicated IDs, safe includes, accessible controls and avatar integration slot', () => {
  const dom = new JSDOM(html);
  const ids = [...dom.window.document.querySelectorAll('[id]')].map(node => node.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(dom.window.document.querySelector('#m-avatar-controls'));
  assert.ok(dom.window.document.querySelector('#userAvatar'));
  assert.ok(dom.window.document.querySelector('details#m-security > summary'));
  for (const input of dom.window.document.querySelectorAll('#m-security input')) assert.ok(dom.window.document.querySelector(`label[for="${input.id}"]`));
  assert.match(html, /account-security\.js\?v=1\.2\.0/);
  assert.match(html, /tai-khoan\.js\?v=1\.4\.0/);
  assert.match(html, /account-security\.css\?v=1\.0\.0/);
  const css = read('public/mobile/css/account-security.css');
  assert.match(css, /min-height: 44px/);
  assert.match(css, /font-size: 16px/);
  assert.doesNotMatch(security, /innerHTML|localStorage\.setItem|QRCode|fetch\(/);
  dom.window.close();
});

test('shared session gate locks security during getMe and outages, then retries without cached identity', async t => {
  const wait = pending();
  const f = fixture(t, { getMe: () => wait.promise });
  const start = f.start();
  assert.equal(f.el('m-email-resend').disabled, true);
  assert.equal(f.el('m-security').closest('main > div').hidden, true);
  f.el('m-mfa-setup').click();
  assert.equal(f.calls.setup.length, 0);
  wait.resolve(null);
  await start;
  assert.equal(f.browser.location.href, '/auth?redirect=%2Fmobile%2Ftai-khoan');
  const g = fixture(t, { getMe: async () => { throw new Error('offline'); } });
  await g.start();
  assert.equal(g.el('m-password-submit').disabled, true);
  g.api.getMe = async () => ({ ...account });
  g.w.document.querySelector('main > [role=status] button').click();
  await tick();
  assert.equal(g.el('m-password-submit').disabled, false);
});

test('devices opens and focuses in-page, renders server current badge and untrusted fields as text', async t => {
  const f = fixture(t);
  await f.start();
  await f.click('settingDevices');
  assert.equal(f.browser.location.href, '/mobile/tai-khoan');
  assert.equal(f.w.location.hash, '#m-security-devices');
  assert.equal(f.el('m-security').open, true);
  assert.equal(f.w.document.activeElement.id, 'm-security-devices');
  assert.equal(f.el('m-sessions-list').children.length, 2);
  assert.match(f.el('m-sessions-list').textContent, /Thiết bị này/);
  assert.equal(f.el('m-sessions-list').querySelector('img,script'), null);
  assert.equal(f.calls.sessions, 1);
});

test('email resend failures are truthful, Retry-After disables with cooldown, verified state is authoritative', async t => {
  const f = fixture(t, { requestVerification: async () => ({ status: false, httpStatus: 429, retryAfter: 25, message: 'Fixture cooldown' }) });
  await f.start();
  await f.click('m-email-resend');
  assert.equal(f.el('m-email-resend').disabled, true);
  assert.match(f.el('m-email-resend').textContent, /25 giây/);
  assert.equal(f.el('m-security-status').textContent, 'Fixture cooldown');
  assert.doesNotMatch(f.el('m-security-status').textContent, /Đã gửi/);
  const g = fixture(t, { requestVerification: async () => ({ status: false, httpStatus: 503, message: '<b>Offline</b>' }) });
  await g.start();
  await g.click('m-email-resend');
  assert.equal(g.el('m-email-resend').disabled, false);
  assert.equal(g.el('m-security-status').querySelector('b'), null);
  g.setUser({ email_verified: true });
  await g.click('m-security-refresh');
  assert.match(g.el('m-email-state').textContent, /đã được xác minh/);
  assert.equal(g.el('m-email-resend').disabled, true);
});

test('password validates, rejects failures and redirects only after confirmed server invalidation', async t => {
  const wait = pending();
  const f = fixture(t, { changePassword: (...args) => { f.calls.password.push(args); return wait.promise; } });
  await f.start();
  f.el('m-password-current').value = 'old-fixture';
  f.el('m-password-new').value = 'new-fixture';
  f.el('m-password-confirm').value = 'mismatch';
  await f.submit();
  assert.equal(f.calls.password.length, 0);
  f.el('m-password-confirm').value = 'new-fixture';
  await f.submit();
  assert.equal(f.el('m-password-submit').disabled, true);
  assert.equal(f.browser.location.href, '/mobile/tai-khoan');
  wait.resolve({ status: false, message: 'Wrong current password' });
  await tick();
  assert.equal(f.browser.location.href, '/mobile/tai-khoan');
  assert.match(f.el('m-security-status').textContent, /Wrong/);
  f.api.changePassword = async (...args) => { f.calls.password.push(args); return ok({}); };
  await f.submit();
  assert.deepEqual(f.calls.password.at(-1), ['old-fixture', 'new-fixture']);
  assert.equal(f.browser.location.href, '/auth?redirect=%2Fmobile%2Ftai-khoan');
  assert.equal(f.el('m-password-current').value, '');
});

test('TOTP setup/confirm/disable uses exact SDK arguments and one-time DOM-only recovery codes', async t => {
  const f = fixture(t);
  await f.start();
  f.el('m-security').open = true;
  await tick();
  f.el('m-mfa-password').value = 'fixture-password';
  await f.click('m-mfa-setup');
  assert.deepEqual(f.calls.setup, [['fixture-password']]);
  assert.equal(f.el('m-mfa-secret').textContent, 'FIXTURESECRET');
  assert.match(f.el('m-mfa-uri').href, /^otpauth:\/\/totp\//);
  assert.equal(f.el('m-mfa-password').value, '');
  f.el('m-mfa-code').value = '123456';
  await f.click('m-mfa-confirm');
  assert.deepEqual(f.calls.confirm, [['123456']]);
  assert.equal(f.el('m-mfa-secret').textContent, '');
  assert.equal(f.el('m-mfa-uri').hasAttribute('href'), false);
  assert.equal(f.el('m-mfa-recovery').hidden, false);
  assert.equal(f.el('m-mfa-recovery-codes').querySelector('b'), null);
  assert.doesNotMatch(JSON.stringify(f.w.localStorage), /FIXTURE/);
  await f.click('m-mfa-saved');
  assert.equal(f.el('m-mfa-recovery-codes').textContent, '');
  f.el('m-mfa-password').value = 'fixture-password';
  f.el('m-mfa-code').value = 'FIXTURE-ONE';
  await f.click('m-mfa-disable');
  assert.deepEqual(f.calls.disable, [['fixture-password', 'FIXTURE-ONE']]);
  assert.match(f.el('m-mfa-state').textContent, /chưa được bật/);
  assert.equal(f.el('m-mfa-code').value, '');
});

test('unsafe TOTP links are not exposed; collapse/pagehide erases enrollment and recovery', async t => {
  const f = fixture(t, { setupMfa: async () => ok({ secret: '<script>fixture</script>', otpauthUrl: 'javascript:alert(1)' }) });
  await f.start();
  f.el('m-security').open = true;
  await tick();
  f.el('m-mfa-password').value = 'fixture';
  await f.click('m-mfa-setup');
  assert.equal(f.el('m-mfa-uri').hasAttribute('href'), false);
  assert.equal(f.el('m-mfa-secret').querySelector('script'), null);
  f.el('m-security').open = false;
  f.el('m-security').dispatchEvent(new f.w.Event('toggle'));
  assert.equal(f.el('m-mfa-secret').textContent, '');
  f.el('m-mfa-recovery-codes').textContent = 'FIXTURE';
  f.w.dispatchEvent(new f.w.Event('pagehide'));
  assert.equal(f.el('m-mfa-recovery-codes').textContent, '');
});

test('session refresh retries, revoke operations require confirmation, current revoke logs out', async t => {
  const f = fixture(t, { getSessions: async () => ({ status: false, message: 'Fixture offline' }) });
  await f.start();
  await f.click('m-sessions-refresh');
  assert.match(f.el('m-sessions-status').textContent, /Không thể tải/);
  assert.equal(f.el('m-sessions-refresh').disabled, false);
  f.api.getSessions = async () => ok([{ id: 'one', current: false, device: 'Fixture' }, { id: 'this', current: true, device: 'Phone' }]);
  await f.click('m-sessions-refresh');
  f.browser.confirm = () => false;
  f.el('m-sessions-list').querySelector('button').click();
  await tick();
  await f.click('m-sessions-revoke-others');
  assert.equal(f.calls.revoke.length, 0);
  assert.equal(f.calls.others, 0);
  f.browser.confirm = () => true;
  f.el('m-sessions-list').querySelector('button').click();
  await tick();
  assert.deepEqual(f.calls.revoke, ['one']);
  await f.click('m-sessions-revoke-others');
  assert.equal(f.calls.others, 1);
  f.el('m-sessions-list').lastElementChild.querySelector('button').click();
  await tick();
  assert.equal(f.browser.location.href, '/auth?redirect=%2Fmobile%2Ftai-khoan');
});

test('failed revoke never shows success and 401 closes account; profile event re-fetches authoritative data', async t => {
  const f = fixture(t, { revokeOtherSessions: async () => ({ status: false, httpStatus: 503, message: 'Fixture failure' }) });
  await f.start();
  await f.click('settingDevices');
  await f.click('m-sessions-revoke-others');
  assert.equal(f.el('m-security-status').textContent, 'Fixture failure');
  f.setUser({ name: 'Authoritative Changed Name' });
  f.w.dispatchEvent(new f.w.CustomEvent('cineviet:profile-updated', { detail: { name: 'Untrusted event name' } }));
  await tick();
  assert.equal(f.el('userName').textContent, 'Authoritative Changed Name');
  f.api.requestVerification = async () => ({ status: false, httpStatus: 401 });
  f.api.getMe = async () => null;
  await f.click('m-email-resend');
  assert.equal(f.browser.location.href, '/auth?redirect=%2Fmobile%2Ftai-khoan');
  assert.equal(f.el('m-security').closest('main > div').hidden, true);
});

test('profile-updated during an in-flight action queues an authoritative refresh', async t => {
  const wait = pending();
  const f = fixture(t, { requestVerification: () => wait.promise });
  await f.start();
  f.el('m-email-resend').click();
  await tick();
  f.setUser({ name: 'Queued Server Name' });
  f.w.dispatchEvent(new f.w.CustomEvent('cineviet:profile-updated'));
  wait.resolve(ok({}));
  await tick();
  await tick();
  assert.equal(f.el('userName').textContent, 'Queued Server Name');
  assert.equal(f.el('m-email-resend').disabled, false);
});

test('late setup response after closing and reopening cannot restore erased secrets', async t => {
  const wait = pending();
  const f = fixture(t, { setupMfa: () => wait.promise });
  await f.start();
  f.el('m-security').open = true;
  await tick();
  f.el('m-mfa-password').value = 'fixture-password';
  f.el('m-mfa-setup').click();
  await tick();
  f.el('m-security').open = false;
  f.el('m-security').dispatchEvent(new f.w.Event('toggle'));
  f.el('m-security').open = true;
  wait.resolve(ok({ secret: 'LATEFIXTURE', otpauthUrl: 'otpauth://totp/Fixture?secret=LATEFIXTURE' }));
  await tick();
  assert.equal(f.el('m-mfa-secret').textContent, '');
  assert.equal(f.el('m-mfa-enrollment').hidden, true);
});

test('existing real logout is confirmed before redirect and preserves mobile library statistics', async t => {
  const f = fixture(t);
  await f.start();
  assert.equal(f.el('statWatchlist').textContent, '0');
  assert.equal(f.el('statMovies').textContent, 'Chưa có dữ liệu');
  assert.equal(f.el('statHours').textContent, 'Chưa có dữ liệu');
  await f.click('btnLogout');
  assert.equal(f.calls.logout, 1);
  assert.equal(f.browser.location.href, '/mobile');
});

test('wrong MFA setup password keeps the valid session and allows correction', async t => {
  let wrong = true;
  const f = fixture(t, { setupMfa: async () => wrong ? { status: false, httpStatus: 401, message: 'Mật khẩu không chính xác' } : ok({ secret: 'FIXTURESECRET', otpauthUrl: 'otpauth://totp/Fixture?secret=FIXTURESECRET' }) });
  await f.start(); f.el('m-security').open = true; await tick();
  f.el('m-mfa-password').value = 'wrong'; await f.click('m-mfa-setup');
  assert.equal(f.browser.location.href, '/mobile/tai-khoan');
  assert.equal(f.el('m-security').closest('main > div').hidden, false);
  assert.equal(f.el('m-security-status').textContent, 'Mật khẩu không chính xác');
  assert.equal(f.el('m-mfa-setup').disabled, false);
  wrong = false; f.el('m-mfa-password').value = 'correct'; await f.click('m-mfa-setup');
  assert.equal(f.el('m-mfa-enrollment').hidden, false);
});

test('wrong MFA disable code keeps an enabled account signed in and retryable', async t => {
  let wrong = true;
  const f = fixture(t, { disableMfa: async () => wrong ? { status: false, httpStatus: 401, message: 'Mã không chính xác' } : ok({ user: { ...account, mfa_enabled: false } }) });
  f.setUser({ mfa_enabled: true }); await f.start(); f.el('m-security').open = true; await tick();
  f.el('m-mfa-password').value = 'correct'; f.el('m-mfa-code').value = 'wrong'; await f.click('m-mfa-disable');
  assert.equal(f.browser.location.href, '/mobile/tai-khoan');
  assert.equal(f.el('m-mfa-state').textContent, 'MFA đang bật.');
  assert.equal(f.el('m-security-status').textContent, 'Mã không chính xác');
  assert.equal(f.el('m-mfa-disable').disabled, false);
  wrong = false; f.el('m-mfa-password').value = 'correct'; f.el('m-mfa-code').value = '123456'; await f.click('m-mfa-disable');
  assert.equal(f.el('m-mfa-state').textContent, 'MFA chưa được bật.');
});

test('an MFA 401 with an actually expired session still clears secrets and redirects', async t => {
  const f = fixture(t); await f.start(); f.el('m-security').open = true; await tick();
  f.api.setupMfa = async () => { f.api.getMe = async () => null; return { status: false, httpStatus: 401 }; };
  f.el('m-mfa-password').value = 'fixture-password'; await f.click('m-mfa-setup');
  assert.equal(f.browser.location.href, '/auth?redirect=%2Fmobile%2Ftai-khoan');
  assert.equal(f.el('m-mfa-secret').textContent, '');
});
