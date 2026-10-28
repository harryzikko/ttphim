const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const attack = '\"><img src=x onerror="window.pwned=1"><svg onload="window.pwned=1">&\'';
const badAvatar = 'javascript:alert(1)';
const user = { id: 'user', name: attack, email: attack, avatar: badAvatar, role: 'admin' };

function fixture(template, url) {
  const dom = new JSDOM(source(template), { url: `https://cinema.test${url}`, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.document.querySelectorAll('script').forEach(script => script.remove());
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', { get() { return this.textContent; }, set(value) { this.textContent = value; }, configurable: true });
  const callbacks = [], errors = [];
  const add = window.document.addEventListener.bind(window.document);
  window.document.addEventListener = (event, callback, options) => event === 'DOMContentLoaded' ? callbacks.push(callback) : add(event, callback, options);
  window.console.log = () => {};
  window.console.error = (...args) => errors.push(args.map(String).join(' '));
  window.showToast = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  const media = window.HTMLMediaElement.prototype;
  media.play = () => Promise.resolve();
  media.pause = () => {};
  media.load = () => {};
  media.canPlayType = () => 'maybe';
  window.localStorage.setItem('kk_user', JSON.stringify(user));
  return { dom, window, callbacks, errors, async start(file) { window.eval(source(file)); for (const callback of callbacks) await callback(); await tick(); } };
}

function assertSafe(root) {
  assert.ok(root, 'render target exists');
  assert.equal(root.querySelector('svg, script, img[src="x"]'), null, 'payload creates no elements');
  for (const element of root.querySelectorAll('*')) {
    for (const attribute of element.attributes) {
      if (/^on/i.test(attribute.name)) assert.ok(!attribute.value.includes('pwned=1'), 'payload creates no executable event handlers');
      if (/^(src|href)$/i.test(attribute.name)) assert.ok(!/^\s*(javascript|data):/i.test(attribute.value), 'no executable URLs');
    }
  }
}

const comment = { id: attack, user_name: attack, user_avatar: badAvatar, content: attack, timestamp_tag: attack, likes: attack, created_at: '2026-01-01', replies: [{ user_name: attack, user_avatar: 'data:image/svg+xml,<svg onload=alert(1)>', content: attack, created_at: '2026-01-01' }] };

test('admin stored user, report, comment and featured metadata are escaped at their sinks', async () => {
  const f = fixture('public/admin.html', '/admin');
  f.window.API = {
    getMe: async () => user, getAdminStats: async () => ({}),
    getAdminUsers: async () => [user], getAdminReports: async () => [{ id: attack, movie_slug: attack, episode_slug: attack, reason: attack, user_email: attack, status: attack }],
    getAdminComments: async () => [{ ...comment, movie_slug: attack }],
    getAdminSettings: async () => ({ featured_slugs: [{ slug: attack, name: attack, poster_url: badAvatar }] }),
    getAdminSources: async () => null
  };
  try {
    await f.start('public/js/admin.js');
    for (const id of ['users-table-body', 'reports-table-body', 'comments-table-body', 'featured-slugs-container']) {
      const root = f.window.document.getElementById(id);
      assertSafe(root);
      assert.ok(root.textContent.includes(attack), `${id} preserves literal text`);
    }
    assert.equal(f.window.document.querySelector('.btn-delete-user').dataset.name, attack);
    assert.ok(f.window.document.querySelector('#reports-table-body a').getAttribute('href').includes('%22'));
    assert.deepEqual(f.errors, []);
  } finally { f.dom.window.close(); }
});

for (const kind of ['detail', 'watch']) {
  test(`${kind} comments, replies and stored identity render as text, including spoiler paths`, async () => {
    const f = fixture(kind === 'detail' ? 'public/chi-tiet.html' : 'public/xem-phim.html', kind === 'detail' ? '/phim/film' : '/xem-phim/film/full');
    const movie = { slug: 'film', name: attack, category: [], actor: [attack], director: [attack], credits: { directors: [{ name: attack, avatar: badAvatar }], cast: [{ name: attack, avatar: badAvatar, character: attack }] } };
    f.window.API = { getMovieDetail: async () => ({ movie, episodes: [{ server_name: attack, server_data: [{ slug: 'full', name: 'Full', link_embed: 'https://player.test/embed' }] }], related: [] }), getMe: async () => user, getComments: async () => [comment, { ...comment, id: 'spoiler', is_spoil: true }], request: async () => ({ status: true }), getMovieRating: async () => ({}) };
    try {
      f.window.eval(source('public/js/player-ux.js'));
      await f.start(`public/js/${kind}.js`);
      const root = f.window.document.getElementById(kind === 'detail' ? 'detail-comments-list' : 'watch-comments-list') || f.window.document.querySelector('[id^="comment-card-"]')?.parentElement;
      assertSafe(root);
      assert.ok(root.textContent.includes(attack));
      const reply = root.querySelector('input.reply-input');
      assert.ok(reply.getAttribute('placeholder').includes(attack));
      assertSafe(f.window.document.getElementById('comment-form-username') || root);
      const cast = f.window.document.querySelector('.cast-crew-wrapper');
      assertSafe(cast);
      assert.ok(cast.textContent.includes(attack));
      assert.deepEqual(f.errors, []);
    } finally { f.window.dispatchEvent(new f.window.Event('pagehide')); f.dom.window.close(); }
  });
}

test('party room, member, system message and chat content cannot create markup', async () => {
  const f = fixture('public/xem-phim.html', '/xem-phim/film/full');
  let stream;
  f.window.EventSource = class { constructor() { stream = this; } close() {} };
  const room = { code: 'ROOM', name: attack, hostId: 'other', controlMode: 'free_for_all', members: [{ id: 'other', name: attack, avatar: badAvatar }], messages: [] };
  f.window.API = { getMovieDetail: async () => ({ movie: { slug: 'film', name: 'Film' }, episodes: [{ server_name: 'Main', server_data: [{ slug: 'full', name: 'Full', link_embed: 'https://player.test/embed' }] }] }), getMe: async () => user, getComments: async () => [], createPartyRoom: async () => ({ status: true, data: room }), request: async () => ({ status: true }) };
  try {
    f.window.eval(source('public/js/player-ux.js'));
    await f.start('public/js/watch.js');
    f.window.document.getElementById('btn-submit-create-party').click();
    await tick();
    assert.ok(stream, 'party enters and opens stream');
    stream.onmessage({ data: JSON.stringify({ type: 'init', room: { ...room, messages: [{ userId: 'other', userName: attack, avatar: badAvatar, content: attack, time: attack }, { type: 'system', text: attack }] } }) });
    const root = f.window.document.getElementById('party-pane-content');
    assertSafe(root);
    assert.ok(root.textContent.includes(attack));
    assert.ok(root.querySelector('img'), 'member avatars still render');
    const messages = root.querySelector('#party-chat-stream');
    assert.equal(messages.children.length, 2);
    assert.ok(messages.children[0].textContent.includes(attack));
    assert.ok(messages.children[1].textContent.includes(attack));
  } finally { f.window.dispatchEvent(new f.window.Event('pagehide')); f.dom.window.close(); }
});

test('header toast, announcement, search and profile preserve literal user strings', async () => {
  const f = fixture('public/index.html', '/');
  f.window.API = { getMe: async () => user, getCategories: async () => ({ categories: [], countries: [] }), getSiteAnnouncement: async () => ({ announcement_active: true, announcement: attack }), getNotifications: async () => [], quickSearch: async () => [] };
  try {
    await f.start('public/js/header.js');
    f.window.showToast(attack);
    assertSafe(f.window.document.body);
    assert.ok(f.window.document.getElementById('toast-container').textContent.includes(attack));
    assert.ok(f.window.document.getElementById('site-announcement-bar').textContent.includes(attack));
    const input = f.window.document.querySelector('header input');
    assert.ok(input);
    input.value = attack;
    input.dispatchEvent(new f.window.Event('input'));
    await new Promise(resolve => setTimeout(resolve, 350));
    assertSafe(f.window.document.body);
    assert.ok(f.window.document.getElementById('header-search-results').textContent.includes(attack));
    f.window.API.quickSearch = async () => [{ slug: attack, name: attack, poster_url: badAvatar, quality: attack }];
    input.dispatchEvent(new f.window.Event('input'));
    await new Promise(resolve => setTimeout(resolve, 350));
    assertSafe(f.window.document.getElementById('header-search-results'));
  } finally { f.dom.window.close(); }
});

test('catalog search/filter values, metadata and inline navigation cannot break their contexts', async () => {
  const f = fixture('public/kham-pha.html', `/kham-pha?keyword=${encodeURIComponent(attack)}&year=${encodeURIComponent(attack)}`);
  f.window.API = { getCategories: async () => ({ countries: [{ slug: attack, name: attack }], categories: [{ slug: attack, name: attack }] }), getCatalog: async () => ({ items: [{ slug: attack, name: attack, origin_name: attack, poster_url: badAvatar, lang: attack, quality: attack, year: attack }], pagination: { currentPage: 1, totalPages: 1 } }) };
  try {
    await f.start('public/js/catalog.js');
    assertSafe(f.window.document.body);
    const card = f.window.document.querySelector('.movie-card');
    assert.ok(card.textContent.includes(attack));
    assert.equal(card.tagName, 'A');
    assert.ok(card.getAttribute('href').includes('%27'));
    assert.ok(!card.getAttribute('href').includes('<img'));
    assert.equal(card.getAttribute('onclick'), null);
  } finally { f.dom.window.close(); }
});

test('auth redirects allow only same-origin HTTP(S) destinations, with safe fallback', async () => {
  const code = source('public/js/auth.js');
  for (const [target, expected] of [
    ['javascript:alert(1)', '/'], ['data:text/html,<svg>', '/'], ['//evil.test/path', '/'], ['//cinema.test/path', '/'], ['https://evil.test/', '/'], ['/\\evil.test', '/'], ['https://cinema.test@evil.test', '/'], ['java\nscript:alert(1)', '/'],
    ['/library?q=1#saved', 'https://cinema.test/library?q=1#saved'], ['https://cinema.test/watch', 'https://cinema.test/watch'], ['https://cinema.test//path', 'https://cinema.test//path']
  ]) {
    const listeners = {};
    const form = { querySelector: () => ({ disabled: false }), addEventListener: (event, cb) => { listeners[event] = cb; } };
    const location = { origin: 'https://cinema.test', pathname: '/auth', search: `?redirect=${encodeURIComponent(target)}`, href: '' };
    const context = vm.createContext({ URL, URLSearchParams, setTimeout: cb => cb(), window: { location, showToast() {} }, API: { login: async () => ({ status: true }) }, document: { addEventListener: (_, cb) => cb(), getElementById: id => id === 'authForm' ? form : id === 'identityInput' ? { value: 'user@test' } : id === 'passwordInput' ? { value: 'password' } : null } });
    vm.runInContext(code, context);
    await listeners.submit({ preventDefault() {} });
    assert.equal(location.href, expected, target);
  }
});

test('API includes external-base cookies, merges headers and never caches auth tokens', async () => {
  const storage = new Map(), calls = [];
  const response = { status: true, data: { token: 'top-secret', user: { ...user, token: 'nested-secret', access_token: 'secret' } } };
  const context = vm.createContext({ window: { TTPhim_API_BASE: 'https://api.test' }, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }, fetch: async (url, options) => { calls.push({ url, options }); return { json: async () => response }; } });
  vm.runInContext(source('public/js/api.js'), context);
  assert.equal(await vm.runInContext('API.login("u", "p")', context), response);
  assert.equal(calls[0].url, 'https://api.test/api/auth/login');
  assert.equal(calls[0].options.credentials, 'include');
  assert.ok(!storage.get('kk_user').includes('secret'));
  await vm.runInContext('API.request("/api/test", { headers: { "X-Test": "yes" } })', context);
  assert.equal(calls[1].options.headers.Accept, 'application/json');
  assert.equal(calls[1].options.headers['X-Test'], 'yes');
});

test('TV disposes inactive Artplayer, Hls and iframe on engine/episode changes and page exit', () => {
  const f = fixture('public/tv/xem-phim.html', '/tv/xem-phim/film');
  const players = [], streams = [];
  f.window.Hls = class { static isSupported() { return true; } constructor() { streams.push(this); } loadSource(url) { this.url = url; } attachMedia() {} destroy() { this.destroyed = (this.destroyed || 0) + 1; } };
  f.window.Artplayer = class {
    constructor(options) { this.video = f.window.document.createElement('video'); this.handlers = {}; players.push(this); options.customType.m3u8(this.video, options.url); }
    on(event, callback) { this.handlers[event] = callback; }
    pause() { this.paused = true; }
    destroy() { this.destroyed = true; }
  };
  const script = [...source('public/tv/xem-phim.html').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(match => match[1].includes('function playEpisode'))[1];
  try {
    f.window.eval(source('public/js/player-ux.js'));
    f.window.eval(script + '\ncurrentEpisodes = [{ name: "One", link_m3u8: "https://stream.test/1.m3u8" }, { name: "Two", link_embed: "https://player.test/embed" }, { name: "Three", link_m3u8: "https://stream.test/3.m3u8" }, { name: "Unsafe", link_embed: "javascript:alert(1)" }]; playEpisode(0);');
    f.window.eval('playEpisode(1)');
    assert.equal(players[0].paused, true);
    assert.equal(players[0].destroyed, true);
    assert.equal(streams[0].destroyed, 1);
    const frame = f.window.document.getElementById('embed-frame');
    assert.equal(frame.src, 'https://player.test/embed');
    f.window.eval('playEpisode(2)');
    assert.equal(frame.hasAttribute('src'), false);
    assert.equal(frame.style.display, 'none');
    f.window.dispatchEvent(new f.window.Event('pagehide'));
    assert.equal(players[1].destroyed, true);
    assert.equal(streams[1].destroyed, 1);
    f.window.dispatchEvent(new f.window.Event('beforeunload'));
    assert.equal(streams[1].destroyed, 1, 'cleanup is idempotent');
    f.window.eval('playEpisode(3)');
    assert.equal(frame.hasAttribute('src'), false);
  } finally { f.dom.window.close(); }
});

test('detail initializes a populated related rail before its helper declaration without a false server error', async () => {
  const f = fixture('public/chi-tiet.html', '/phim/film');
  const movie = { slug: 'film', name: 'Film', year: 2026, category: [{ slug: 'action', name: 'Action' }], actor: [], director: [] };
  const messages = [], scrolls = [];
  f.window.showToast = (message, type) => messages.push([message, type]);
  f.window.HTMLElement.prototype.scrollBy = value => scrolls.push(value.left);
  f.window.API = {
    getMovieDetail: async () => ({ movie, episodes: [], related: [{ slug: 'related-film', name: 'Related Film', year: 2026 }] }),
    getComments: async () => []
  };
  try {
    await f.start('public/js/detail.js');
    const rail = f.window.document.getElementById('rail-similar');
    assert.ok(rail.textContent.includes('Related Film'));
    f.window.document.getElementById('btn-similar-next').click();
    f.window.document.getElementById('btn-similar-prev').click();
    assert.deepEqual(scrolls, [360, -360]);
    assert.deepEqual(f.errors, []);
    assert.equal(messages.filter(([, type]) => type === 'error').length, 0);
  } finally { f.dom.window.close(); }
});

test('detail reports a genuine fetch failure without attempting to render the movie', async () => {
  const f = fixture('public/chi-tiet.html', '/phim/film');
  const messages = [];
  f.window.showToast = message => messages.push(message);
  f.window.API = { getMovieDetail: async () => { throw new Error('upstream unavailable'); } };
  try {
    await f.start('public/js/detail.js');
    assert.equal(messages.length, 1);
    assert.ok(messages[0].includes('tải thông tin phim từ máy chủ'));
    assert.equal(f.errors.length, 1);
    assert.ok(f.errors[0].includes('Failed to fetch movie detail'));
  } finally { f.dom.window.close(); }
});

test('detail render errors are not mislabeled as server fetch failures', async () => {
  const f = fixture('public/chi-tiet.html', '/phim/film');
  const messages = [];
  f.window.showToast = message => messages.push(message);
  f.window.API = { getMovieDetail: async () => ({ movie: { slug: 'film', name: 'Film', category: {} } }) };
  try {
    await f.start('public/js/detail.js');
    assert.equal(messages.length, 1);
    assert.ok(messages[0].includes('hiển thị đầy đủ trang phim'));
    assert.equal(f.errors.length, 1);
    assert.ok(f.errors[0].includes('Failed to initialize movie detail'));
  } finally { f.dom.window.close(); }
});
