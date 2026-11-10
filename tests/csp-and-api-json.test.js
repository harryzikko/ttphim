const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
for (const name of ['kkphimService', 'vicdnService', 'nguoncService', 'vodphimService', 'personService', 'tmdbService']) {
  const id = require.resolve(`../src/services/${name}`);
  require.cache[id] = { id, filename: id, loaded: true, exports: {} };
}
const { app } = require('../src/server');

test('Express Helmet sends report-only CSP without upgrade-insecure-requests and allows CDN media/images/scripts', async () => {
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/ready`);
    const csp = res.headers.get('content-security-policy-report-only');
    assert.ok(csp, 'content-security-policy-report-only header must be present');
    assert.ok(!csp.includes('upgrade-insecure-requests'), 'report-only CSP must omit upgrade-insecure-requests');
    assert.ok(!csp.includes("'unsafe-eval'"), 'CSP must not allow unsafe-eval');
    assert.ok(csp.includes("img-src 'self' https: data: blob:"));
    assert.ok(csp.includes("media-src 'self' https: data: blob:"));
    assert.ok(csp.includes("connect-src 'self' https: wss: ws:"));
    assert.ok(csp.includes("frame-src 'self' https:"));
    assert.ok(csp.includes('https://cdn.jsdelivr.net'));
    assert.ok(csp.includes('https://static.cloudflareinsights.com'));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('API.request safely handles empty or non-JSON responses instead of throwing SyntaxError', async () => {
  const storage = new Map();
  let mode = 'empty';
  const context = vm.createContext({
    window: {},
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    fetch: async () => ({
      status: mode === 'html' ? 502 : 204,
      headers: new Map(),
      text: async () => mode === 'html' ? '<html>502 Bad Gateway</html>' : ''
    })
  });
  vm.runInContext(read('public/js/api.js'), context);

  const emptyRes = await vm.runInContext('API.request("/api/settings/announcement")', context);
  assert.equal(emptyRes.status, false);

  mode = 'html';
  const htmlRes = await vm.runInContext('API.request("/api/auth/me")', context);
  assert.equal(htmlRes.status, false);
  assert.equal(htmlRes.httpStatus, 502);
});

test('header.js initProfile handles API.getMe failure without unhandled rejection', async () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><header><button aria-label="Hồ sơ cá nhân"><img src="/favicon.svg"/></button></header></body></html>', {
    url: 'https://cineviet.live/',
    runScripts: 'outside-only'
  });
  const { window } = dom;
  const callbacks = [];
  const add = window.document.addEventListener.bind(window.document);
  window.document.addEventListener = (ev, cb, opts) => ev === 'DOMContentLoaded' ? callbacks.push(cb) : add(ev, cb, opts);
  window.API = {
    getMe: async () => { throw new Error('502 empty'); },
    getSiteAnnouncement: async () => null,
    getNotifications: async () => []
  };
  try {
    window.eval(read('public/js/header.js'));
    for (const cb of callbacks) await cb();
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(window.document.querySelector('button[aria-label="Hồ sơ cá nhân"]'));
  } finally {
    dom.window.close();
  }
});
