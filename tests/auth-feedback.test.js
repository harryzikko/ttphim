const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const { JSDOM } = require('jsdom');
const { IdentityError } = require('../src/services/identityService');
const { createIdentityRouter } = require('../src/routes/identityRoutes');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('identity route returns an accented rate-limit error and Retry-After without exposing credentials', async () => {
  const app = express(); app.use(express.json());
  app.use('/auth', createIdentityRouter({ service: { login: async () => { throw new IdentityError('Bạn đã thử đăng nhập quá nhiều lần. Vui lòng chờ rồi thử lại.', 429, 'RATE_LIMITED', 42); } } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await response.json();
    assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '42');
    assert.equal(data.retryAfter, 42); assert.equal(data.code, 'RATE_LIMITED');
    assert.ok(data.message.includes('đăng nhập quá nhiều lần'));
    assert.ok(!data.message.includes('Qua nhieu'));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('SDK carries HTTP 429 and Retry-After to the auth controller', async () => {
  const context = vm.createContext({ window: {}, localStorage: { getItem() { return null; } },
    fetch: async () => ({ status: 429, headers: { get: name => name === 'Retry-After' ? '37' : null }, json: async () => ({ status: false, message: 'Quá nhiều yêu cầu' }) }) });
  vm.runInContext(read('public/js/api.js'), context);
  const response = await vm.runInContext("API.request('/api/auth/login')", context);
  assert.equal(response.httpStatus, 429); assert.equal(response.retryAfter, 37);
});

function authFixture(login) {
  const dom = new JSDOM(read('public/auth.html'), { url: 'http://localhost/auth', runScripts: 'outside-only' });
  const { window } = dom;
  let initialize, clock = 100000;
  const timers = new Map(); let nextId = 0;
  const add = window.document.addEventListener.bind(window.document);
  window.document.addEventListener = (name, fn, opts) => name === 'DOMContentLoaded' ? initialize = fn : add(name, fn, opts);
  window.API = { login }; window.showToast = () => {};
  window.Date.now = () => clock;
  window.setInterval = fn => { timers.set(++nextId, fn); return nextId; };
  window.clearInterval = id => timers.delete(id);
  window.eval(read('public/js/auth.js')); initialize();
  const doc = window.document, form = doc.getElementById('authForm'), button = form.querySelector('button[type="submit"]');
  doc.getElementById('identityInput').value = 'member@example.test'; doc.getElementById('passwordInput').value = 'test-password';
  const submit = () => form.dispatchEvent(new window.Event('submit', { cancelable: true }));
  return { dom, window, doc, form, button, timers, submit, advance(ms) { clock += ms; for (const fn of [...timers.values()]) fn(); } };
}

test('login form waits for cooldown, resists repeat submissions and tab changes, then allows retry', async () => {
  let calls = 0;
  const h = authFixture(async () => { calls++; return { status: false, httpStatus: 429, retryAfter: 3 }; });
  try {
    h.submit(); await tick();
    assert.equal(h.button.disabled, true); assert.equal(h.button.textContent, 'Thử lại sau 0:03');
    assert.ok(h.doc.getElementById('authStatus').textContent.includes('Quá nhiều yêu cầu'));
    h.submit(); await tick(); assert.equal(calls, 1);
    h.doc.getElementById('tabRegisterBtn').click(); h.doc.getElementById('tabLoginBtn').click();
    assert.equal(h.button.disabled, true); assert.equal(h.button.textContent, 'Thử lại sau 0:03');
    h.advance(3000); assert.equal(h.button.disabled, false); assert.equal(h.button.textContent, 'Đăng nhập ngay');
    h.submit(); await tick(); assert.equal(calls, 2);
    h.window.dispatchEvent(new h.window.Event('pagehide')); assert.equal(h.timers.size, 0);
  } finally { h.dom.window.close(); }
});

test('login form prevents duplicate in-flight requests and releases the button for normal credential errors', async () => {
  let complete, calls = 0;
  const h = authFixture(() => { calls++; return new Promise(resolve => { complete = resolve; }); });
  try {
    h.submit(); h.submit(); assert.equal(calls, 1); assert.equal(h.button.disabled, true);
    complete({ status: false, message: 'Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.' }); await tick();
    assert.equal(h.button.disabled, false); assert.ok(h.doc.getElementById('authStatus').textContent.includes('mật khẩu không chính xác'));
    assert.equal(h.timers.size, 0);
  } finally { h.dom.window.close(); }
});

test('shared login and registration page has no quick-login providers', () => {
  const dom = new JSDOM(read('public/auth.html'));
  try {
    const doc = dom.window.document;
    assert.ok(doc.getElementById('tabLoginBtn'));
    assert.ok(doc.getElementById('tabRegisterBtn'));
    assert.ok(doc.querySelector('#authForm input[type="password"]'));
    assert.ok(!/Google|Apple ID|Facebook|đăng nhập nhanh/i.test(doc.body.textContent));
  } finally { dom.window.close(); }
});

test('SDK does not erase cached identity or treat an authentication outage as a guest session', async () => {
  let removed = 0;
  const context = vm.createContext({ window: {}, localStorage: { getItem() { return null; }, removeItem() { removed++; } },
    fetch: async () => ({ status: 503, json: async () => ({ status: false, message: 'Authentication unavailable' }) }) });
  vm.runInContext(read('public/js/api.js'), context);
  await assert.rejects(vm.runInContext('API.getMe()', context), /Authentication unavailable/);
  assert.equal(removed, 0);
});

test('confirmed history removal clears only the server-identified account snapshot and failures preserve it', async () => {
  let success = false;
  const records = new Map([
    ['TTPhim_progress_member', JSON.stringify({ film: { current_time: 20 }, other: { current_time: 40 } })],
    ['TTPhim_progress_guest', JSON.stringify({ film: { current_time: 60 } })],
    ['TTPhim_progress_another', JSON.stringify({ film: { current_time: 80 } })]
  ]);
  const context = vm.createContext({ window: {}, localStorage: { getItem:key=>records.get(key)||null, setItem:(key,value)=>records.set(key,value), removeItem:key=>records.delete(key) },
    fetch: async () => ({ status: success ? 200 : 503, json: async () => ({ status: success, data: { user_id: 'member' } }) }) });
  vm.runInContext(read('public/js/api.js'), context);
  await vm.runInContext("API.removeFromHistory('film')", context);
  assert.ok(JSON.parse(records.get('TTPhim_progress_member')).film);
  success = true;
  await vm.runInContext("API.removeFromHistory('film')", context);
  assert.equal(JSON.parse(records.get('TTPhim_progress_member')).film, undefined);
  assert.equal(JSON.parse(records.get('TTPhim_progress_member')).other.current_time, 40);
  vm.runInContext(read('public/js/player-ux.js'), context);
  assert.equal(vm.runInContext("window.PlayerUX.createProgress({ movie:{slug:'film'},user:{id:'member'},api:API,storage:localStorage }).get()", context), null);
  await vm.runInContext('API.clearHistory()', context);
  assert.equal(records.has('TTPhim_progress_member'), false);
  assert.ok(records.has('TTPhim_progress_guest')); assert.ok(records.has('TTPhim_progress_another'));
});
