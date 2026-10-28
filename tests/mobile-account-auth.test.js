const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('public/mobile/tai-khoan.html');
const source = read('public/mobile/js/tai-khoan.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
const user = { id: 7, name: 'Server Name', email: 'real@example.test', avatar: '/avatar.svg' };
const login = '/auth?redirect=%2Fmobile%2Ftai-khoan';
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixture(t, overrides = {}) {
  const dom = new JSDOM(html, { url: 'https://cineviet.test/mobile/tai-khoan', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  let init;
  const originalAdd = w.document.addEventListener.bind(w.document);
  w.document.addEventListener = (event, fn, ...rest) => {
    if (event === 'DOMContentLoaded') init = fn;
    else originalAdd(event, fn, ...rest);
  };
  const calls = { me: 0, library: 0, update: [], logout: 0, prompt: 0, toast: [] };
  const api = {
    getMe: async () => { calls.me++; return { ...user }; },
    getLibrary: async () => { calls.library++; return { watchlist: [{ movie_slug: 'one' }], history: [] }; },
    updateProfile: async (...args) => { calls.update.push(args); return { status: true, data: { ...user, name: 'Confirmed Name' } }; },
    logout: async () => { calls.logout++; return { message: 'Logged out' }; },
    ...overrides
  };
  // Real JSDOM elements/events; a location facade records navigation without making requests.
  const browser = {
    location: { href: '/mobile/tai-khoan' },
    prompt: () => { calls.prompt++; return '  Requested Name  '; },
    confirm: () => true,
    MobileApp: { showToast: value => calls.toast.push(value) }
  };
  w.localStorage.setItem('kk_user', JSON.stringify({ id: 999, name: 'Fake Cached User' }));
  w.localStorage.setItem('ttphim_username', 'Fake Local Name');
  w.localStorage.setItem('TTPhim_watchlist', JSON.stringify(Array(15).fill({})));
  w.localStorage.setItem('TTPhim_continue_watching', JSON.stringify(Array(38).fill({})));
  new w.Function('window', 'API', source)(browser, api);
  const el = id => w.document.getElementById(id);
  const status = () => w.document.querySelector('main > [role="status"]');
  return { w, api, browser, calls, el, status, start: () => init() };
}

test('cached fake profile cannot enable guest actions while getMe is pending or after rejection', async t => {
  const pending = deferred();
  const f = fixture(t, { getMe: () => pending.promise });
  const started = f.start();
  assert.equal(f.el('editProfileBtn').disabled, true);
  assert.equal(f.el('btnLogout').disabled, true);
  assert.equal(f.el('userName').closest('main > div').hidden, true);
  f.el('editProfileBtn').click();
  f.el('btnLogout').click();
  pending.resolve(null);
  await started;
  f.el('settingDevices').click();
  await tick();
  assert.equal(f.browser.location.href, login);
  assert.equal(f.calls.prompt, 0);
  assert.equal(f.calls.logout, 0);
  assert.equal(f.calls.library, 0);
  assert.equal(f.calls.update.length, 0);
  assert.doesNotMatch(f.el('userName').textContent, /Fake|CineViet/);
  assert.equal(f.el('userEmail').textContent, '');
});

test('getMe 5xx stays on page with retry instead of cached account, then recovers', async t => {
  let fail = true;
  const f = fixture(t, { getMe: async () => {
    if (fail) throw Object.assign(new Error('Unavailable'), { httpStatus: 503 });
    return { ...user };
  } });
  await f.start();
  assert.equal(f.browser.location.href, '/mobile/tai-khoan');
  assert.equal(f.el('editProfileBtn').disabled, true);
  assert.equal(f.el('btnLogout').disabled, true);
  assert.equal(f.status().querySelector('button').hidden, false);
  assert.match(f.status().textContent, /Không thể xác minh/);
  fail = false;
  f.status().querySelector('button').click();
  await tick();
  assert.equal(f.el('userName').textContent, user.name);
  assert.equal(f.el('userEmail').textContent, user.email);
  assert.equal(f.el('editProfileBtn').disabled, false);
  assert.equal(f.calls.library, 1);
});

test('only server watchlist count appears; unsupported claims/actions are removed', async t => {
  const f = fixture(t);
  await f.start();
  assert.equal(f.el('statWatchlist').textContent, '1');
  assert.equal(f.el('statMovies').textContent, 'Chưa có dữ liệu');
  assert.equal(f.el('statHours').textContent, 'Chưa có dữ liệu');
  assert.doesNotMatch(f.w.document.querySelector('main').textContent, /CINEMA PASS|vĩnh viễn|Không giới hạn|member@cineviet/);
  assert.equal(f.el('btnReportIssue'), null);
  assert.equal(f.el('settingQuality'), null);
  assert.equal(f.el('settingAudio'), null);
  assert.equal(f.w.document.querySelector('[data-setting="wifi_only"]'), null);
  assert.equal(f.w.document.querySelector('[data-setting="notifications"]'), null);
  assert.equal(f.w.document.querySelector('[data-setting="autoplay_next"]').disabled, true);
  assert.equal(f.el('settingDevices').getAttribute('href'), '#m-security-devices');
  f.el('settingDevices').click();
  await tick();
  assert.equal(f.browser.location.href.includes('view=desktop'), false);
  assert.match(html, /tai-khoan\.js\?v=1\.4\.0/);
  assert.match(html, /player-preferences\.js\?v=1\.0\.0/);
});

test('library failure has honest unavailable stats and a working retry', async t => {
  let fail = true;
  const f = fixture(t, { getLibrary: async () => {
    if (fail) throw new Error('offline');
    return { watchlist: [] };
  } });
  await f.start();
  assert.equal(f.el('statWatchlist').textContent, 'Chưa có dữ liệu');
  assert.equal(f.status().querySelector('button').hidden, false);
  fail = false;
  f.status().querySelector('button').click();
  await tick();
  assert.equal(f.el('statWatchlist').textContent, '0');
});

test('logout network/envelope failure retains page and never announces success', async t => {
  for (const mode of ['throw', 'envelope', 'unconfirmed']) {
    await t.test(mode, async t => {
      let requests = 0;
      const f = fixture(t, { logout: async () => {
        requests++;
        if (mode === 'throw') throw new Error('Logout unavailable');
        if (mode === 'envelope') return { status: false, message: 'Logout unavailable' };
        return undefined;
      } });
      await f.start();
      f.el('btnLogout').click();
      await tick();
      assert.equal(requests, 1);
      assert.equal(f.calls.me, 2);
      assert.equal(f.browser.location.href, '/mobile/tai-khoan');
      assert.equal(f.el('btnLogout').disabled, false);
      assert.doesNotMatch(f.status().textContent, /Đã đăng xuất/);
      assert.equal(f.calls.toast.length, 0);
    });
  }
});

test('logout waits for confirmed API success before navigating', async t => {
  const pending = deferred();
  let requests = 0;
  const f = fixture(t, { logout: () => { requests++; return pending.promise; } });
  await f.start();
  f.el('btnLogout').click();
  await tick();
  assert.equal(requests, 1);
  assert.equal(f.el('btnLogout').disabled, true);
  assert.equal(f.browser.location.href, '/mobile/tai-khoan');
  pending.resolve({ message: 'Logged out' });
  await tick();
  assert.equal(f.browser.location.href, '/mobile');
  assert.equal(f.el('btnLogout').disabled, true);
});

test('name update waits for success and renders server-confirmed name, never local prompt value', async t => {
  const pending = deferred();
  let args;
  const f = fixture(t, { updateProfile: (...values) => { args = values; return pending.promise; } });
  await f.start();
  f.el('editProfileBtn').click();
  await tick();
  assert.deepEqual(args, ['Requested Name', '/avatar.svg']);
  assert.equal(f.calls.me, 2);
  assert.equal(f.el('userName').textContent, user.name);
  assert.equal(f.el('editProfileBtn').disabled, true);
  assert.doesNotMatch(f.status().textContent, /Đã cập nhật/);
  pending.resolve({ status: true, data: { ...user, name: '<b>Confirmed Name</b>' } });
  await tick();
  assert.equal(f.el('userName').textContent, '<b>Confirmed Name</b>');
  assert.equal(f.el('userName').querySelector('b'), null);
  assert.match(f.status().textContent, /Đã cập nhật/);
  assert.equal(f.w.localStorage.getItem('ttphim_username'), 'Fake Local Name');
  assert.equal(f.el('editProfileBtn').disabled, false);
});

test('failed name update preserves server name without success', async t => {
  const f = fixture(t, { updateProfile: async () => ({ status: false, message: 'Rejected' }) });
  await f.start();
  f.el('editProfileBtn').click();
  await tick();
  assert.equal(f.el('userName').textContent, user.name);
  assert.match(f.status().textContent, /Rejected/);
  assert.doesNotMatch(f.status().textContent, /Đã cập nhật/);
  assert.equal(f.browser.location.href, '/mobile/tai-khoan');
});

test('expired session before action prevents writes; profile 401 also redirects', async t => {
  await t.test('expired before edit', async t => {
    let checks = 0;
    const f = fixture(t, { getMe: async () => ++checks === 1 ? { ...user } : null });
    await f.start();
    f.el('editProfileBtn').click();
    await tick();
    assert.equal(f.browser.location.href, login);
    assert.equal(f.calls.prompt, 0);
    assert.equal(f.calls.update.length, 0);
  });
  await t.test('write returns 401', async t => {
    const f = fixture(t, { updateProfile: async () => ({ status: false, httpStatus: 401 }) });
    await f.start();
    f.el('editProfileBtn').click();
    await tick();
    assert.equal(f.browser.location.href, login);
    assert.equal(f.el('editProfileBtn').disabled, true);
    assert.doesNotMatch(f.status().textContent, /Đã cập nhật/);
  });
});
