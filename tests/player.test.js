const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
require('../public/js/player-ux.js');
const UX = globalThis.PlayerUX;
const tick = () => new Promise(resolve => setImmediate(resolve));

class Video extends EventTarget {
  duration = 1000; currentTime = 0; paused = true; plays = 0; native = true;
  play() { this.plays++; this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() {}
  removeAttribute() {}
  canPlayType() { return this.native ? 'maybe' : ''; }
  emit(name) { this.dispatchEvent(new Event(name)); }
}
function hlsFixture() {
  class Hls {
    static Events = { MANIFEST_PARSED: 'manifest', ERROR: 'error', LEVEL_SWITCHED: 'level' };
    static ErrorTypes = { NETWORK_ERROR: 'network', MEDIA_ERROR: 'media' };
    static isSupported() { return true; }
    constructor() { this.handlers = {}; Hls.instances.push(this); }
    on(event, callback) { this.handlers[event] = callback; }
    emit(event, data = {}) { this.handlers[event]?.(event, data); }
    loadSource(url) { this.url = url; }
    attachMedia(video) { this.video = video; }
    destroy() { this.destroyed = true; }
    startLoad() { this.retries = (this.retries || 0) + 1; }
    recoverMediaError() { this.recovered = true; }
  }
  Hls.instances = [];
  return Hls;
}
const servers = ['Primary', 'Backup'].map(server_name => ({ server_name, server_data: [1, 2, 3].map(number => ({ slug: `tap-${number}`, name: `Tập ${number}`, link_m3u8: `https://test.invalid/${server_name}/${number}.m3u8` })) }));

test('initial selection honors requested server and only resumes the matching unfinished episode', () => {
  const history = { episode_slug: 'tap-2', current_time: 120, progress_percent: 12, server_name: 'Backup' };
  assert.equal(UX.selectInitial(servers, 'tap-3', '1', history).resume, 0);
  assert.equal(UX.selectInitial(servers, 'tap-2', '1', history).server, 1);
  assert.equal(UX.selectInitial(servers, 'tap-2', '1', history).resume, 120);
  assert.equal(UX.selectInitial(servers, '', null, history).index, 1);
  assert.equal(UX.selectInitial(servers, '', null, history).server, 1);
  assert.equal(UX.selectInitial(servers, '', null, { ...history, progress_percent: 98 }).resume, 0);
  assert.equal(UX.episodeMatches('season-1-episode-2', 'season-1-episode-3'), false);
});

test('destroyed HLS sessions cannot autoplay, fallback or retry after an episode change', async () => {
  const Hls = hlsFixture(), video = new Video();
  let fallbacks = 0;
  const session = UX.createSession({ video, Hls, url: 'test', embedUrl: 'embed', onFallback: () => fallbacks++ });
  const old = Hls.instances[0];
  old.emit('error', { fatal: true, type: 'network' });
  session.destroy();
  old.emit('manifest'); old.emit('error', { fatal: true, type: 'media' });
  await tick();
  assert.equal(video.plays, 0);
  assert.equal(old.destroyed, true);
  assert.equal(fallbacks, 0);
});

test('fatal network retries are bounded and eventually fall back exactly once', async () => {
  const Hls = hlsFixture(), video = new Video();
  let fallbacks = 0;
  UX.createSession({ video, Hls, url: 'test', embedUrl: 'embed', onFallback: () => fallbacks++ });
  const hls = Hls.instances[0];
  for (let i = 0; i < 4; i++) hls.emit('error', { fatal: true, type: 'network' });
  await tick();
  assert.equal(fallbacks, 1);
  assert.equal(hls.destroyed, true);
});

test('slow sources leave loading state with an actionable error', async () => {
  const video = new Video(), states = [];
  UX.createSession({ video, url: 'test', timeout: 10, onState: state => states.push(state) });
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.deepEqual(states, ['loading', 'error']);
});

test('native HLS works without Hls.js and metadata resume is applied only once', () => {
  const video = new Video();
  const session = UX.createSession({ video, url: 'test', initialTime: 120 });
  video.emit('loadedmetadata');
  assert.equal(video.currentTime, 120);
  video.currentTime = 300;
  video.emit('loadedmetadata');
  assert.equal(video.currentTime, 300);
  session.destroy();
});

test('autoplay rejection shows a play prompt instead of endless loading', async () => {
  const video = new Video(), states = [];
  video.play = () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
  const session = UX.createSession({ video, url: 'test', onState: (state, message) => states.push([state, message]) });
  video.emit('loadedmetadata');
  await tick();
  assert.equal(states.at(-1)[0], 'paused');
  assert.match(states.at(-1)[1], /Nhấn Phát/);
  session.destroy();
});

test('an immediate unsupported-source fallback can be cancelled before its microtask runs', async () => {
  const video = new Video(); video.native = false;
  let fallback = false;
  const session = UX.createSession({ video, url: 'test', embedUrl: 'embed', onFallback: () => fallback = true });
  session.destroy();
  await tick();
  assert.equal(fallback, false);
});

test('real progress is saved locally; authenticated progress includes keepalive and server', async () => {
  const map = new Map();
  const storage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) };
  const requests = [];
  const api = { request: async (url, options) => { requests.push([url, options]); return { status: true }; } };
  const movie = { slug: 'film', name: 'Film' }, ep = servers[0].server_data[1];
  const guest = UX.createProgress({ movie, api, storage });
  await guest.save(ep, 'Primary', { currentTime: 50, duration: 100 });
  assert.equal(guest.get().current_time, 50);
  assert.equal(requests.length, 0);
  const user = UX.createProgress({ movie, user: { id: 'user' }, api, storage });
  await user.save(ep, 'Backup', { currentTime: 60, duration: 100 }, true);
  assert.equal(requests[0][1].keepalive, true);
  assert.equal(JSON.parse(requests[0][1].body).server_name, 'Backup');
  await user.save(ep, 'Backup', { currentTime: 0, duration: NaN });
  assert.equal(requests.length, 1);
});

function loadController(kind) {
  const mobile = kind === 'mobile';
  const html = fs.readFileSync(path.join(__dirname, mobile ? '../public/mobile/xem-phim.html' : '../public/xem-phim.html'), 'utf8');
  const dom = new JSDOM(html, { url: `http://localhost:3001/${mobile ? 'mobile/' : ''}xem-phim/film/tap-3?server=1`, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const callbacks = [], errors = [], saves = [];
  const originalAdd = window.document.addEventListener.bind(window.document);
  window.document.addEventListener = (event, callback, options) => event === 'DOMContentLoaded' ? callbacks.push(callback) : originalAdd(event, callback, options);
  window.console.error = (...args) => errors.push(args.map(String).join(' '));
  window.showToast = () => {};
  window.MobileApp = { toast() {} };
  window.HTMLElement.prototype.scrollIntoView = () => {};
  const media = window.HTMLMediaElement.prototype;
  Object.defineProperty(media, 'duration', { get: () => 1000, configurable: true });
  Object.defineProperty(media, 'paused', { get() { return this._paused !== false; }, configurable: true });
  media.play = function () { this._paused = false; return Promise.resolve(); };
  media.pause = function () { this._paused = true; this.dispatchEvent(new window.Event('pause')); };
  media.load = function () { this.currentTime = 0; };
  media.canPlayType = () => 'maybe';
  const Hls = hlsFixture(); window.Hls = Hls;
  const data = { movie: { slug: 'film', name: 'Film' }, episodes: servers, watchedHistory: { episode_slug: 'tap-2', current_time: 80, progress_percent: 8 } };
  window.API = {
    getMovieDetail: async () => data, getMe: async () => ({ id: 'user', name: 'User' }), getComments: async () => [],
    request: async (_, options) => { saves.push(JSON.parse(options.body)); return { status: true }; },
    toggleWatchlist: async () => ({ status: true, data: { added: true } })
  };
  window.eval(fs.readFileSync(path.join(__dirname, '../public/js/player-ux.js'), 'utf8'));
  window.eval(fs.readFileSync(path.join(__dirname, mobile ? '../public/mobile/js/xem-phim.js' : '../public/js/watch.js'), 'utf8'));
  return { dom, window, callbacks, errors, saves, Hls };
}

for (const kind of ['mobile', 'desktop']) {
  test(`${kind} controller honors deep links, resumes only matching episodes and cleans old playback on server change`, async () => {
    const fixture = loadController(kind);
    const { window, dom, callbacks, errors, saves, Hls } = fixture;
    try {
      for (const callback of callbacks) await callback();
      await tick();
      assert.deepEqual(errors, []);
      assert.match(Hls.instances[0].url, /Backup\/3/);
      const video = window.document.querySelector(kind === 'mobile' ? '#m-video-player' : '#player-viewport video');
      video.dispatchEvent(new window.Event('loadedmetadata'));
      assert.equal(video.currentTime, 0);
      video.currentTime = 123;
      const button = kind === 'mobile' ? window.document.querySelector('#m-watch-servers button') : window.document.querySelector('.server-pill-btn');
      button.click();
      await tick();
      assert.equal(Hls.instances[0].destroyed, true);
      assert.match(Hls.instances[1].url, /Primary\/3/);
      const newVideo = window.document.querySelector(kind === 'mobile' ? '#m-video-player' : '#player-viewport video');
      newVideo.dispatchEvent(new window.Event('loadedmetadata'));
      assert.equal(newVideo.currentTime, 123);
      assert.ok(saves.some(save => save.episode_slug === 'tap-3' && save.server_name === 'Backup' && save.current_time === 123));
      Hls.instances[0].emit('error', { fatal: true, type: 'network' });
      assert.equal(Hls.instances.length, 2);
      window.dispatchEvent(new window.Event('pagehide'));
      assert.equal(Hls.instances[1].destroyed, true);
      assert.deepEqual(errors, []);
    } finally { window.dispatchEvent(new window.Event('pagehide')); dom.window.close(); }
  });
}

test('mobile auto-next can be cancelled and does not fire after manual episode selection', async () => {
  const { window, dom, callbacks, Hls } = loadController('mobile');
  const timers = new Map();
  const originalTimeout = window.setTimeout.bind(window);
  const originalClear = window.clearTimeout.bind(window);
  let sequence = 100000;
  window.setTimeout = (callback, delay) => {
    if (delay !== 3000) return originalTimeout(callback, delay);
    const id = ++sequence; timers.set(id, callback); return id;
  };
  window.clearTimeout = id => { if (timers.has(id)) timers.delete(id); else originalClear(id); };
  try {
    for (const callback of callbacks) await callback();
    window.document.querySelector('#m-watch-ep-list button').click();
    const video = window.document.querySelector('#m-video-player');
    video.dispatchEvent(new window.Event('ended'));
    assert.equal(timers.size, 1);
    const cancel = window.document.querySelector('.player-status button');
    assert.equal(cancel.textContent, 'Hủy chuyển tập');
    cancel.click();
    assert.equal(timers.size, 0);
    video.dispatchEvent(new window.Event('ended'));
    assert.equal(timers.size, 1);
    window.document.querySelectorAll('#m-watch-ep-list button')[1].click();
    assert.equal(timers.size, 0);
    assert.match(Hls.instances.at(-1).url, /Backup\/2/);
  } finally { window.dispatchEvent(new window.Event('pagehide')); dom.window.close(); }
});

test('mobile comments use the backend and render user content as text', async () => {
  const { window, dom, callbacks } = loadController('mobile');
  const content = '<img src=x onerror=alert(1)>';
  let sent = null;
  window.API.getComments = async () => [{ user_name: '<Admin>', content }];
  window.API.postComment = async (_, body) => { sent = body; return { status: true, data: { user_name: 'User', content: body.content } }; };
  try {
    for (const callback of callbacks) await callback();
    await tick();
    const comments = window.document.querySelector('#m-comment-list');
    assert.ok(comments.textContent.includes(content));
    assert.equal(comments.querySelector('img'), null);
    window.document.querySelector('#m-comment-input').value = 'New comment';
    window.document.querySelector('#m-comment-send').click();
    await tick();
    assert.equal(sent.content, 'New comment');
    assert.ok(comments.textContent.includes('New comment'));
  } finally { window.dispatchEvent(new window.Event('pagehide')); dom.window.close(); }
});

test('playback failure saves the final timestamp before clearing the video source', async () => {
  const video = new Video(); video.currentTime = 85;
  let saved = 0;
  const session = UX.createSession({ video, url: 'test', onBeforeStop: () => { saved = video.currentTime; } });
  video.emit('error');
  await tick();
  assert.equal(saved, 85);
  assert.equal(session.isActive(), false);
});
