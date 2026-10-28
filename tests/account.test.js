const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

function accountHarness(api) {
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../public/tai-khoan.html'), 'utf8'));
  const { document } = dom.window;
  let initialize;
  document.addEventListener = (event, callback) => { if (event === 'DOMContentLoaded') initialize = callback; };
  const messages = [], redirects = [], storage = new Map([['kk_user', JSON.stringify({ id: 'member' })]]);
  const context = vm.createContext({
    document,
    window: { showToast: (...args) => messages.push(args), location: { replace: url => redirects.push(url) } },
    localStorage: { removeItem: key => storage.delete(key) },
    API: { getMe: async () => ({ id: 'member', name: 'Member', email: 'member@example.test' }), getLibrary: async () => ({}), ...api }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/account.js'), 'utf8'), context);
  initialize();
  return { dom, document, messages, redirects, storage };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

function passwordFields(document) {
  document.getElementById('input-old-password').value = 'old-password';
  document.getElementById('input-new-password').value = 'new-password';
  document.getElementById('input-confirm-password').value = 'new-password';
}

test('password success clears cached identity and redirects to login rather than leaving a revoked session onscreen', async () => {
  const h = accountHarness({ changePassword: async () => ({ status: true }) });
  await settle();
  passwordFields(h.document);
  h.document.getElementById('btn-submit-password').click();
  await settle();
  assert.equal(h.storage.has('kk_user'), false);
  assert.deepEqual(h.redirects, ['/dang-nhap?redirect=%2Ftai-khoan']);
  for (const id of ['input-old-password', 'input-new-password', 'input-confirm-password']) assert.equal(h.document.getElementById(id).value, '');
  assert.equal(h.document.getElementById('btn-submit-password').disabled, false);
  h.dom.window.close();
});

test('failed password validation keeps identity and never redirects', async () => {
  const h = accountHarness({ changePassword: async () => ({ status: false, message: 'Wrong password' }) });
  await settle();
  passwordFields(h.document);
  h.document.getElementById('btn-submit-password').click();
  await settle();
  assert.equal(h.storage.has('kk_user'), true);
  assert.equal(h.redirects.length, 0);
  assert.ok(h.messages.some(([message]) => message === 'Wrong password'));
  h.dom.window.close();
});

test('profile and password network failures release disabled buttons and show an error', async () => {
  const fail = async () => { throw new Error('offline'); };
  const h = accountHarness({ updateProfile: fail, changePassword: fail });
  await settle();
  h.document.getElementById('btn-save-profile').click();
  await settle();
  assert.equal(h.document.getElementById('btn-save-profile').disabled, false);
  passwordFields(h.document);
  h.document.getElementById('btn-submit-password').click();
  await settle();
  assert.equal(h.document.getElementById('btn-submit-password').disabled, false);
  assert.equal(h.messages.filter(([, type]) => type === 'error').length, 2);
  assert.equal(h.storage.has('kk_user'), true);
  assert.equal(h.redirects.length, 0);
  h.dom.window.close();
});

test('SDK clears cached identity only after a successful password change', async () => {
  let success = false;
  const storage = new Map([['kk_user', '{}']]);
  const context = vm.createContext({ window: {}, document: {}, localStorage: {
    getItem: key => storage.get(key), removeItem: key => storage.delete(key)
  }, fetch: async () => ({ json: async () => ({ status: success }) }) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/api.js'), 'utf8'), context);
  await vm.runInContext("API.changePassword('old','new')", context);
  assert.equal(storage.has('kk_user'), true);
  success = true;
  await vm.runInContext("API.changePassword('old','new')", context);
  assert.equal(storage.has('kk_user'), false);
});

test('security session metadata renders as text and failed revoke releases the button', async () => {
  const attack = '<img src=x onerror=alert(1)>';
  const h = accountHarness({
    getSessions: async () => ({ status: true, data: [{ id: 'session', device: attack, ip: attack, created_at: 0, expires_at: 1, current: false }] }),
    revokeSession: async () => { throw new Error('offline'); }
  });
  await settle();
  const list = h.document.getElementById('security-sessions');
  assert.ok(list.textContent.includes(attack));
  assert.equal(list.querySelector('img'), null);
  const button = list.querySelector('button');
  button.click(); await settle();
  assert.equal(button.disabled, false);
  assert.equal(h.messages.at(-1)[1], 'error');
  h.dom.window.close();
});

test('security verification and MFA network failures leave retryable states', async () => {
  const fail = async () => { throw new Error('offline'); };
  const h = accountHarness({ requestVerification: fail, setupMfa: fail, revokeOtherSessions: fail });
  await settle();
  h.document.getElementById('mfa-password').value = 'password';
  for (const id of ['btn-resend-verification', 'btn-mfa-setup', 'btn-revoke-others']) {
    h.document.getElementById(id).click(); await settle();
    assert.equal(h.document.getElementById(id).disabled, false);
  }
  assert.equal(h.messages.filter(([, type]) => type === 'error').length, 3);
  assert.ok(h.document.getElementById('mfa-enrollment').classList.contains('hidden'));
  h.dom.window.close();
});

test('MFA enrollment displays codes only once and never accepts an executable provisioning URL', async () => {
  const h = accountHarness({
    setupMfa: async () => ({ status: true, data: { secret: '<secret>', otpauthUrl: 'javascript:alert(1)' } }),
    confirmMfa: async () => ({ status: true, data: { user: { mfa_enabled: true }, recoveryCodes: ['<recovery>', 'SECOND'] } }),
    getSessions: async () => ({ status: true, data: [] })
  });
  await settle();
  h.document.getElementById('mfa-password').value = 'password';
  h.document.getElementById('btn-mfa-setup').click(); await settle();
  assert.equal(h.document.getElementById('mfa-secret').textContent, '<secret>');
  assert.equal(h.document.getElementById('mfa-uri').hasAttribute('href'), false);
  assert.equal(h.document.getElementById('mfa-password').value, '');
  h.document.getElementById('mfa-code').value = '123456';
  h.document.getElementById('btn-mfa-confirm').click(); await settle();
  assert.equal(h.document.getElementById('mfa-secret').textContent, '');
  assert.equal(h.document.getElementById('mfa-recovery-codes').textContent, '<recovery>\nSECOND');
  assert.equal(h.document.getElementById('mfa-recovery-codes').children.length, 0);
  h.document.getElementById('btn-recovery-saved').click(); await settle();
  assert.equal(h.document.getElementById('mfa-recovery-codes').textContent, '');
  h.dom.window.close();
});

function authHarness(api, url = '/dang-nhap') {
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../public/auth.html'), 'utf8'), { url: `https://cinema.test${url}`, runScripts: 'outside-only' });
  const { window } = dom;
  let initialize;
  window.document.addEventListener = (event, cb) => { if (event === 'DOMContentLoaded') initialize = cb; };
  window.showToast = () => {};
  window.API = api;
  window.eval(fs.readFileSync(path.join(__dirname, '../public/js/auth.js'), 'utf8'));
  initialize();
  const submit = id => window.document.getElementById(id).dispatchEvent(new window.Event('submit', { cancelable: true }));
  return { dom, window, document: window.document, submit };
}

test('forgot flow shows generic feedback as text and retries after a network failure', async () => {
  let offline = true;
  const h = authHarness({ forgotPassword: async () => { if (offline) throw new Error('offline'); return { status: true, message: '<generic-response>' }; } }, '/dang-nhap?mode=forgot');
  h.document.getElementById('securityEmail').value = 'member@example.test';
  h.submit('securityForm'); await settle();
  assert.equal(h.document.getElementById('securitySubmit').disabled, false);
  offline = false;
  h.submit('securityForm'); await settle();
  assert.equal(h.document.getElementById('authStatus').textContent, '<generic-response>');
  assert.equal(h.document.getElementById('authStatus').children.length, 0);
  h.dom.window.close();
});

test('reset removes tokens from the URL, checks password confirmation and clears secrets on success', async () => {
  const calls = [];
  const h = authHarness({ resetPassword: async (...args) => { calls.push(args); return { status: true, message: 'Reset complete' }; } }, '/dang-nhap?mode=reset#token=private-token');
  assert.equal(h.window.location.hash, '');
  h.document.getElementById('securityPassword').value = 'new-password';
  h.document.getElementById('securityConfirm').value = 'different';
  h.submit('securityForm'); await settle();
  assert.equal(calls.length, 0);
  h.document.getElementById('securityConfirm').value = 'new-password';
  h.submit('securityForm'); await settle();
  assert.deepEqual(calls[0], ['private-token', 'new-password']);
  assert.equal(h.document.getElementById('securityPassword').value, '');
  assert.ok(h.document.getElementById('securityFlow').classList.contains('hidden'));
  h.dom.window.close();
});

test('verification error keeps a meaningful retry state without consuming the client token', async () => {
  let calls = 0;
  const h = authHarness({ verifyEmail: async token => { assert.equal(token, 'verify-token'); calls++; return { status: false, message: 'Link expired' }; } }, '/dang-nhap?mode=verify#token=verify-token');
  h.submit('securityForm'); await settle();
  h.submit('securityForm'); await settle();
  assert.equal(calls, 2);
  assert.equal(h.document.getElementById('authStatus').textContent, 'Link expired');
  assert.equal(h.document.getElementById('securitySubmit').disabled, false);
  h.dom.window.close();
});

test('MFA login shows the challenge step without redirect and retries after network failure', async () => {
  const h = authHarness({
    login: async () => ({ status: true, data: { mfaRequired: true, challengeId: 'challenge', expiresAt: Date.now() + 300000 } }),
    completeMfaLogin: async () => { throw new Error('offline'); }
  });
  h.document.getElementById('identityInput').value = 'member@example.test';
  h.document.getElementById('passwordInput').value = 'password';
  h.submit('authForm'); await settle();
  assert.ok(!h.document.getElementById('securityFlow').classList.contains('hidden'));
  assert.equal(h.document.getElementById('passwordInput').value, '');
  assert.equal(h.window.location.pathname, '/dang-nhap');
  h.document.getElementById('securityCode').value = '123456';
  h.submit('securityForm'); await settle();
  assert.equal(h.document.getElementById('securitySubmit').disabled, false);
  assert.ok(!h.document.getElementById('securityFlow').classList.contains('hidden'));
  h.dom.window.close();
});
