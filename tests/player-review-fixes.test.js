const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
require('../public/js/player-ux.js');
const UX = globalThis.PlayerUX;
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const episode = number => ({ slug: `tap-${number}`, name: `Tap ${number}`, link_m3u8: `https://fixture.test/${number}.m3u8` });
const servers = [
  { server_name: 'Empty', server_data: [] },
  { server_name: 'Playable', server_data: [episode(1), episode(2)] },
  { server_name: 'Backup', server_data: [episode(3)] }
];

test('bare watch URL selects first nonempty playable server without renumbering servers', () => {
  const result = UX.selectInitial(servers, null, null, null);
  assert.equal(result.server, 1);
  assert.equal(result.index, 0);
  assert.equal(result.episode, servers[1].server_data[0]);
  assert.equal(result.resume, 0);
  assert.equal(UX.selectInitial([], null, null, null).episode, undefined);
  assert.equal(UX.selectInitial([servers[0]], null, null, null).server, 0);
});

test('explicit empty and nonempty server choices never search or auto-switch servers', () => {
  for (const choice of ['0', 0]) {
    const result = UX.selectInitial(servers, 'tap-2', choice, { server_name: 'Playable', episode_slug: 'tap-2' });
    assert.equal(result.server, 0);
    assert.equal(result.episode, undefined);
  }
  assert.equal(UX.selectInitial(servers, 'tap-3', '1', null).server, 1);
  assert.equal(UX.selectInitial(servers, 'tap-3', '1', null).episode.slug, 'tap-1');
  assert.equal(UX.selectInitial(servers, null, '2', null).episode.slug, 'tap-3');
});

test('implicit selection preserves requested episode search and history resume precedence', () => {
  const history = { server_name: 'Backup', episode_slug: 'tap-3', current_time: 120, progress_percent: 20 };
  assert.equal(UX.selectInitial(servers, null, null, history).server, 2);
  assert.equal(UX.selectInitial(servers, null, null, history).resume, 120);
  assert.equal(UX.selectInitial(servers, '2', null, history).server, 1);
  assert.equal(UX.selectInitial(servers, '2', null, history).index, 1);
  assert.equal(UX.selectInitial(servers, '2', null, history).resume, 0);
  const emptyHistory = { ...history, server_name: 'Empty' };
  assert.equal(UX.selectInitial(servers, null, null, emptyHistory).resume, 120);
  assert.equal(UX.selectInitial(servers, 'missing', null, emptyHistory).server, 1);
  assert.equal(UX.selectInitial(servers, null, null, { ...history, progress_percent: 95 }).resume, 0);
});

async function detailFixture(t, { user = null, saved, legacy = 'true', getMe, request } = {}) {
  const dom = new JSDOM(read('public/chi-tiet.html'), { url: 'https://fixture.test/phim/movie', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const win = dom.window, callbacks = [], errors = [], toasts = [], requests = [];
  const add = win.document.addEventListener.bind(win.document);
  win.document.addEventListener = (event, callback, options) => event === 'DOMContentLoaded' ? callbacks.push(callback) : add(event, callback, options);
  win.console = { log() {}, error(...args) { errors.push(args.map(String).join(' ')); } };
  win.showToast = (...args) => toasts.push(args);
  win.localStorage.setItem('TTPhim_auto_next', legacy);
  if (saved) win.localStorage.setItem('TTPhim_playback_guest', JSON.stringify(saved));
  win.API = {
    getMe: getMe || (async () => user),
    getMovieDetail: async () => ({
      movie: { slug: 'movie', name: 'Movie', year: 2026, category: [], actor: [], director: [] },
      episodes: servers, related: []
    }),
    getComments: async () => [],
    request: async (url, options) => {
      requests.push({ url, ...options });
      if (request) return request(url, options);
      throw Error('Unexpected request');
    }
  };
  win.eval(read('public/js/player-preferences.js'));
  win.eval(read('public/js/detail.js'));
  for (const callback of callbacks) await callback();
  await tick();
  assert.deepEqual(errors, []);
  return {
    win, toasts, requests, errors,
    button: win.document.getElementById('btn-toggle-autonext'),
    label: win.document.getElementById('autonext-status-text')
  };
}

test('detail template orders and versions API, shared preferences and detail; starts disabled', () => {
  const html = read('public/chi-tiet.html');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
  const api = scripts.findIndex(src => src.startsWith('/js/api.js?'));
  const prefs = scripts.indexOf('/js/player-preferences.js?v=1.0.1');
  const detail = scripts.indexOf('/js/detail.js?v=3.7.0');
  assert.ok(api >= 0 && api < prefs && prefs < detail);
  assert.match(html, /id="btn-toggle-autonext"[^>]*disabled[^>]*aria-busy="true"/);
});

test('authenticated detail awaits identity and GET, confirms PATCH before changing state or toast', async t => {
  const identity = deferred(), load = deferred(), save = deferred();
  const fixture = await detailFixture(t, {
    getMe: () => identity.promise,
    request: (_, options) => options.method === 'GET' ? load.promise : save.promise
  });
  const { win, button, label, requests, toasts } = fixture;
  assert.equal(button.disabled, true);
  assert.equal(requests.length, 0);
  identity.resolve({ id: 'fixture-user' });
  await tick();
  assert.equal(requests[0].method, 'GET');
  assert.equal(requests[0].url, '/api/user/playback-preferences');
  assert.equal(button.disabled, true);
  load.resolve({ status: true, data: { auto_next: false, playback_speed: 1.5 } });
  await tick();
  assert.equal(label.innerText, 'T\u1eaeT');
  assert.equal(button.disabled, false);
  const updating = button.onclick();
  assert.equal(button.disabled, true);
  assert.equal(button.getAttribute('aria-busy'), 'true');
  await tick(); // Identity is revalidated before PATCH starts.
  assert.equal(label.innerText, 'T\u1eaeT');
  assert.equal(toasts.length, 0);
  await button.onclick();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].method, 'PATCH');
  assert.deepEqual(JSON.parse(requests[1].body), { auto_next: true });
  save.resolve({ status: true, data: { auto_next: true, playback_speed: 1.5 } });
  await updating;
  assert.equal(label.innerText, 'B\u1eacT');
  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute('aria-busy'), 'false');
  assert.equal(toasts.length, 1);
  assert.match(toasts[0][0], /B\u1eacT/);
  assert.equal(win.localStorage.getItem('TTPhim_auto_next'), 'true');
  assert.equal(win.localStorage.getItem('TTPhim_playback_guest'), null);
});

test('authenticated rejected save retains confirmed state and reports failure, not success', async t => {
  const save = deferred();
  const { button, label, toasts } = await detailFixture(t, {
    user: { id: 'fixture-user' },
    request: (_, options) => options.method === 'GET'
      ? { status: true, data: { auto_next: true } } : save.promise
  });
  const updating = button.onclick();
  await tick();
  assert.equal(label.innerText, 'B\u1eacT');
  save.reject(Error('Offline'));
  await updating;
  assert.equal(label.innerText, 'B\u1eacT');
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(button.disabled, false);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0][1], 'error');
  assert.match(toasts[0][0], /Ch\u01b0a l\u01b0u/);
});

test('guest detail reads existing shared preferences before legacy key and preserves other fields', async t => {
  const saved = { auto_next: false, playback_speed: 1.75, audio_language: 'en', subtitle_language: 'vi' };
  const { win, button, label, requests, toasts } = await detailFixture(t, { saved });
  assert.equal(label.innerText, 'T\u1eaeT');
  assert.equal(button.disabled, false);
  await button.onclick();
  assert.equal(label.innerText, 'B\u1eacT');
  assert.deepEqual(JSON.parse(win.localStorage.getItem('TTPhim_playback_guest')), { ...saved, auto_next: true });
  await button.onclick();
  assert.equal(label.innerText, 'T\u1eaeT');
  assert.equal(win.localStorage.getItem('TTPhim_auto_next'), 'true');
  assert.equal(requests.length, 0);
  assert.equal(toasts.length, 2);
  const playerPreferences = win.PlayerPreferences.create({ api: win.API, user: null });
  await playerPreferences.load();
  assert.equal(playerPreferences.get().auto_next, false);
  assert.equal(playerPreferences.get().playback_speed, 1.75);
  playerPreferences.destroy();
});

test('guest storage failure retains prior value and shows error toast', async t => {
  const { win, button, label, toasts } = await detailFixture(t, { saved: { auto_next: false } });
  win.Storage.prototype.setItem = () => { throw Error('Quota exceeded'); };
  await button.onclick();
  assert.equal(label.innerText, 'T\u1eaeT');
  assert.equal(button.disabled, false);
  assert.equal(JSON.parse(win.localStorage.getItem('TTPhim_playback_guest')).auto_next, false);
  assert.equal(toasts[0][1], 'error');
});

test('failed preference load offers retry without writing guessed defaults', async t => {
  let calls = 0;
  const { button, label, requests, toasts } = await detailFixture(t, {
    user: { id: 'fixture-user' },
    request: () => ++calls === 1 ? { status: false } : { status: true, data: { auto_next: true } }
  });
  assert.equal(button.disabled, false);
  assert.equal(label.innerText, 'TH\u1eec L\u1ea0I');
  await button.onclick();
  assert.equal(label.innerText, 'B\u1eacT');
  assert.deepEqual(requests.map(request => request.method), ['GET', 'GET']);
  assert.equal(toasts.length, 0);
});

test('pending save cannot update or toast on a different movie page', async t => {
  const save = deferred();
  const { win, button, label, toasts } = await detailFixture(t, {
    user: { id: 'fixture-user' },
    request: (_, options) => options.method === 'GET' ? { status: true, data: { auto_next: false } } : save.promise
  });
  const updating = button.onclick();
  await tick();
  win.history.pushState({}, '', '/phim/other-movie');
  label.innerText = 'New movie state';
  save.resolve({ status: true, data: { auto_next: true } });
  await updating;
  assert.equal(label.innerText, 'New movie state');
  assert.equal(toasts.length, 0);
});

test('pending identity cannot create a controller after navigation or page disposal', async t => {
  for (const navigate of [true, false]) {
    const identity = deferred();
    const { win, requests, toasts } = await detailFixture(t, { getMe: () => identity.promise });
    if (navigate) win.history.pushState({}, '', '/phim/other-movie');
    else win.dispatchEvent(new win.PageTransitionEvent('pagehide', { persisted: false }));
    identity.resolve({ id: 'fixture-user' });
    await tick();
    assert.equal(requests.length, 0);
    assert.equal(toasts.length, 0);
  }
});

test('bfcache pagehide keeps the restored toggle usable', async t => {
  const { win, button, label } = await detailFixture(t, { saved: { auto_next: false } });
  win.dispatchEvent(new win.PageTransitionEvent('pagehide', { persisted: true }));
  await button.onclick();
  assert.equal(label.innerText, 'B\u1eacT');
});

test('detail switches guest preferences to the signed-in owner on focus and storage', async t => {
  let user = null, accountValue = false;
  const saved = { auto_next: true, playback_speed: 1.75 };
  const { win, button, label, requests } = await detailFixture(t, {
    getMe: async () => user, saved,
    request: (_, options) => {
      assert.ok(user);
      if (options.method === 'PATCH') accountValue = JSON.parse(options.body).auto_next;
      return { status: true, data: { auto_next: accountValue } };
    }
  });
  user = { id: 'signed-in' };
  win.dispatchEvent(new win.Event('focus'));
  win.dispatchEvent(new win.StorageEvent('storage', { key: 'kk_user', newValue: JSON.stringify(user) }));
  await tick(); await tick();
  assert.equal(label.innerText, 'TẮT');
  await button.onclick();
  assert.equal(accountValue, true); assert.equal(requests.at(-1).method, 'PATCH');
  assert.deepEqual(JSON.parse(win.localStorage.getItem('TTPhim_playback_guest')), saved);
});

test('detail switches to guest preferences after logout without requesting protected preferences', async t => {
  let user = { id: 'signed-in' };
  const saved = { auto_next: false, playback_speed: 1.5 };
  const { win, button, label, requests } = await detailFixture(t, {
    getMe: async () => user, saved,
    request: () => ({ status: true, data: { auto_next: true } })
  });
  const count = requests.length; user = null;
  win.dispatchEvent(new win.Event('ttphim:auth-changed')); await tick();
  assert.equal(label.innerText, 'TẮT'); await button.onclick();
  assert.equal(requests.length, count);
  assert.deepEqual(JSON.parse(win.localStorage.getItem('TTPhim_playback_guest')), { ...win.PlayerPreferences.DEFAULTS, ...saved, auto_next: true });
});

test('identity change immediately before click reloads the new owner and requires an intentional second click', async t => {
  let user = { id: 'A' }; const writes = [];
  const { button, label } = await detailFixture(t, {
    getMe: async () => user,
    request: (_, options) => {
      if (options.method === 'PATCH') writes.push({ id: user.id, patch: JSON.parse(options.body) });
      return { status: true, data: { auto_next: user.id === 'A' } };
    }
  });
  user = { id: 'B' }; await button.onclick();
  assert.equal(label.innerText, 'TẮT'); assert.deepEqual(writes, []);
  await button.onclick(); assert.deepEqual(writes, [{ id: 'B', patch: { auto_next: true } }]);
});

test('identity lookup outage never falls back to a guest write and is retryable', async t => {
  let offline = false;
  const { win, button, label, requests } = await detailFixture(t, {
    getMe: async () => { if (offline) throw Error('offline'); return { id: 'A' }; },
    request: () => ({ status: true, data: { auto_next: true } })
  });
  offline = true; await button.onclick();
  assert.equal(label.innerText, 'THỬ LẠI'); assert.equal(requests.filter(r => r.method === 'PATCH').length, 0);
  assert.equal(win.localStorage.getItem('TTPhim_playback_guest'), null);
  offline = false; await button.onclick(); assert.equal(label.innerText, 'BẬT');
});
