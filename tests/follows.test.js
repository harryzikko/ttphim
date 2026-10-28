const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFollowService, episodeKey } = require('../src/services/followService');
const { createFollowRouter } = require('../src/routes/followRoutes');
const { mount, safeReturnPath } = require('../public/js/follows');
const { JSDOM } = require('jsdom');
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const tick = () => new Promise(resolve => setImmediate(resolve));
const ep = (number, extra = {}) => ({ slug: `tap-${number}`, name: `Tap ${number}`, link_m3u8: 'https://media.test/episode.m3u8', ...extra });
const detail = (...episodes) => ({ movie: { name: 'A movie', slug: 'movie', thumb_url: 'https://image.test/poster.jpg' }, episodes: [{ server_name: 'A', server_data: episodes }] });
function fixture(initial = {}) {
  let data = { users: [], watchlist: [{ user_id: 'a', movie_slug: 'movie' }], history: [], comments: [], unrelated: { preserved: true }, ...initial };
  let queue = Promise.resolve(), inMutation = false, clock = 1000, calls = 0, value = detail(ep(1));
  const db = {
    read: async () => { await queue; return structuredClone(data); },
    mutate(update) {
      const result = queue.then(async () => {
        const draft = structuredClone(data);
        inMutation = true;
        try {
          const result = update(draft);
          assert.equal(typeof result?.then, 'undefined', 'mutations must be synchronous; no external I/O');
          data = draft;
          return structuredClone(result);
        } finally { inMutation = false; }
      });
      queue = result.catch(() => {});
      return result;
    }
  };
  const provider = { async getMovieDetail(slug) {
    assert.equal(inMutation, false, 'provider called while database locked');
    calls++;
    if (value instanceof Error) throw value;
    return typeof value === 'function' ? value(slug) : structuredClone(value);
  } };
  const service = createFollowService({ db, provider, now: () => clock });
  return { service, db, provider, data: () => structuredClone(data), calls: () => calls, set: next => { value = next; }, advance: () => { clock += 300001; } };
}

test('first follow baselines playable episodes and leaves watchlist/unrelated fields independent', async () => {
  const h = fixture();
  h.set(detail(ep('01'), ep(2, { link_m3u8: '', link_embed: '' })));
  assert.equal((await h.service.follow('a', 'movie')).following, true);
  assert.equal((await h.service.follow('a', 'movie')).following, true);
  assert.equal(h.calls(), 1);
  assert.deepEqual(h.data().follows[0].seen_episode_keys, ['episode:1']);
  assert.deepEqual(await h.service.getNotifications('a'), []);
  await h.service.checkUpdates('a');
  assert.deepEqual(await h.service.getNotifications('a'), []);
  assert.deepEqual(h.data().watchlist, [{ user_id: 'a', movie_slug: 'movie' }]);
  assert.deepEqual(h.data().unrelated, { preserved: true });
  await h.service.unfollow('a', 'movie');
  assert.equal(h.data().watchlist.length, 1);
});

test('actual new playable episode alerts once across server duplicates, reorder, removal and reappearance', async () => {
  const h = fixture();
  await h.service.follow('a', 'movie');
  h.set({ ...detail(ep(2), ep('01')), episodes: [
    { server_data: [ep(2), ep('01'), ep(3, { link_m3u8: '', link_embed: '' })] },
    { server_data: [ep('02', { link_m3u8: '', link_embed: 'https://media.test/embed' }), ep(1)] }
  ] });
  await h.service.checkUpdates('a');
  const notices = await h.service.getNotifications('a');
  assert.equal(notices.length, 1);
  assert.equal(notices[0].episode_key, 'episode:2');
  assert.equal(notices[0].read, false);
  assert.equal('user_id' in notices[0], false);
  h.advance(); h.set(detail(ep(1))); await h.service.checkUpdates('a');
  h.advance(); h.set(detail(ep('02'), ep('01'))); await h.service.checkUpdates('a');
  assert.equal((await h.service.getNotifications('a')).length, 1);
  h.advance(); h.set(detail(ep(3, { link_m3u8: '', link_embed: 'https://media.test/embed' })));
  await h.service.checkUpdates('a');
  assert.equal((await h.service.getNotifications('a')).length, 2);
});

test('episode normalization is conservative about specials, seasons, huge numbers and missing slugs', () => {
  assert.equal(episodeKey({ slug: 'tap-01' }), episodeKey({ name: 'T\u1eadp 1' }));
  assert.equal(episodeKey({ slug: 'episode-001' }), episodeKey({ slug: '1' }));
  assert.notEqual(episodeKey({ slug: 'special-1', name: '1' }), episodeKey({ slug: 'tap-1' }));
  assert.notEqual(episodeKey({ slug: 'season-2-episode-1' }), episodeKey({ slug: 'tap-1' }));
  assert.notEqual(episodeKey({ slug: '9007199254740992' }), episodeKey({ slug: '9007199254740993' }));
  assert.notEqual(episodeKey({ name: 'Special A' }), episodeKey({ name: 'Special B' }));
});

test('failed follow writes nothing; failed/malformed refresh preserves baseline and notifications', async () => {
  const h = fixture();
  h.set(new Error('offline'));
  await assert.rejects(h.service.follow('a', 'movie'), { statusCode: 502 });
  assert.equal(h.data().follows, undefined);
  h.set(detail(ep(1))); await h.service.follow('a', 'movie');
  const seen = h.data().follows[0].seen_episode_keys;
  h.set(new Error('offline'));
  assert.deepEqual(await h.service.checkUpdates('a'), { checked: 1, failed: 1 });
  assert.deepEqual(h.data().follows[0].seen_episode_keys, seen);
  h.advance(); h.set({ movie: {}, episodes: [{}] });
  assert.equal((await h.service.checkUpdates('a')).failed, 1);
  assert.deepEqual(h.data().follows[0].seen_episode_keys, seen);
  h.advance(); h.set(detail(ep(1), ep(2))); await h.service.checkUpdates('a');
  assert.equal((await h.service.getNotifications('a')).length, 1);
});

test('missing legacy baseline initializes silently and then detects new episodes', async () => {
  const h = fixture({ follows: [{ id: 'legacy', user_id: 'a', movie_slug: 'movie' }] });
  h.set(detail(ep(1), ep(2))); await h.service.checkUpdates('a');
  assert.deepEqual(await h.service.getNotifications('a'), []);
  assert.equal(h.data().follows[0].seen_episode_keys.length, 2);
  h.advance(); h.set(detail(ep(3))); await h.service.checkUpdates('a');
  assert.equal((await h.service.getNotifications('a')).length, 1);
});

test('refresh throttles per slug, shares concurrent work across users and survives service restart', async () => {
  const h = fixture();
  await h.service.follow('a', 'movie'); await h.service.follow('b', 'movie');
  let resolve;
  h.set(() => new Promise(done => { resolve = done; }));
  const first = h.service.checkUpdates('a'); const second = h.service.checkUpdates('b');
  await tick();
  assert.equal(h.calls(), 3);
  resolve(detail(ep(1), ep(2))); await Promise.all([first, second]);
  assert.equal((await h.service.getNotifications('a')).length, 1);
  assert.equal((await h.service.getNotifications('b')).length, 1);
  await h.service.checkUpdates('a'); assert.equal(h.calls(), 3);
  const restarted = createFollowService({ db: h.db, provider: h.provider, now: () => 1001 });
  await restarted.checkUpdates('b'); assert.equal(h.calls(), 3);
});

test('feeds and read/unfollow mutations are account isolated', async () => {
  const h = fixture();
  await h.service.follow('a', 'movie'); await h.service.follow('b', 'movie');
  h.set(detail(ep(1), ep(2))); await h.service.checkUpdates('a');
  const a = (await h.service.getNotifications('a'))[0];
  const b = (await h.service.getNotifications('b'))[0];
  assert.notEqual(a.id, b.id);
  assert.deepEqual(await h.service.getNotifications('c'), []);
  assert.deepEqual(await h.service.listFollows('c'), []);
  await assert.rejects(h.service.markNotificationRead('b', a.id), { statusCode: 404 });
  await h.service.markNotificationRead('a', a.id);
  assert.equal((await h.service.getNotifications('a'))[0].read, true);
  assert.equal((await h.service.getNotifications('b'))[0].read, false);
  await h.service.unfollow('a', 'movie');
  assert.deepEqual(await h.service.getNotifications('a'), []);
  assert.equal((await h.service.listFollows('b')).length, 1);
  assert.equal((await h.service.getNotifications('b')).length, 1);
});

test('unfollow during in-flight refresh cannot resurrect follows or notifications', async () => {
  const h = fixture(); await h.service.follow('a', 'movie');
  let resolve; h.set(() => new Promise(done => { resolve = done; }));
  const check = h.service.checkUpdates('a'); await tick();
  await h.service.unfollow('a', 'movie');
  resolve(detail(ep(1), ep(2))); await check;
  assert.deepEqual(await h.service.listFollows('a'), []);
  assert.deepEqual(await h.service.getNotifications('a'), []);
});

test('new and re-followed users do not inherit an older pending refresh', async () => {
  const h = fixture(); await h.service.follow('a', 'movie');
  let resolve; h.set(() => new Promise(done => { resolve = done; }));
  const check = h.service.checkUpdates('a'); await tick();
  await h.service.unfollow('a', 'movie');
  h.set(detail(ep(1), ep(2), ep(3)));
  await h.service.follow('a', 'movie'); await h.service.follow('b', 'movie');
  resolve(detail(ep(1), ep(2), ep(4))); await check;
  assert.deepEqual(h.data().follows.find(row => row.user_id === 'a').seen_episode_keys, ['episode:1', 'episode:2', 'episode:3']);
  assert.deepEqual(await h.service.getNotifications('a'), []);
  assert.deepEqual(await h.service.getNotifications('b'), []);
});

test('refresh performs at most ten provider lookups; next open processes remaining follows', async () => {
  const h = fixture();
  for (let i = 0; i < 12; i++) await h.service.follow('a', `movie-${i}`);
  const before = h.calls();
  await Promise.all([h.service.checkUpdates('a'), h.service.checkUpdates('a')]);
  assert.equal(h.calls() - before, 10);
  await h.service.checkUpdates('a'); assert.equal(h.calls() - before, 12);
});

test('follow cap is enforced atomically under concurrent additions; notification cap retains dedupe history', async () => {
  const h = fixture({ follows: Array.from({ length: 99 }, (_, i) => ({ id: `old-${i}`, user_id: 'a', movie_slug: `old-${i}`, seen_episode_keys: [] })) });
  const results = await Promise.allSettled([h.service.follow('a', 'one'), h.service.follow('a', 'two')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(h.data().follows.length, 100);
  const n = fixture(); await n.service.follow('a', 'movie');
  n.set(detail(...Array.from({ length: 121 }, (_, i) => ep(i + 1)))); await n.service.checkUpdates('a');
  assert.equal((await n.service.getNotifications('a')).length, 100);
  assert.equal(n.data().follows[0].seen_episode_keys.length, 121);
  n.advance(); n.set(detail(ep(1))); await n.service.checkUpdates('a');
  n.advance(); n.set(detail(...Array.from({ length: 121 }, (_, i) => ep(i + 1)))); await n.service.checkUpdates('a');
  assert.equal((await n.service.getNotifications('a')).length, 100);
});

test('router returns status objects, refreshes own feed, ignores supplied user IDs and rejects guests', async () => {
  const h = fixture(); const app = express();
  app.use((req, res, next) => { if (req.headers['x-user']) req.user = { id: req.headers['x-user'] }; next(); });
  app.use('/api', createFollowRouter({ service: h.service }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (url, method = 'GET', owner = 'a') => fetch(base + url, { method, headers: owner ? { 'x-user': owner } : {} });
  try {
    assert.equal((await request('/user/follows', 'GET', '')).status, 401);
    const added = await (await request('/user/follows/movie?user_id=b', 'POST')).json();
    assert.equal(added.status, true); assert.equal(added.data.following, true);
    assert.equal((await h.service.listFollows('b')).length, 0);
    h.set(detail(ep(1), ep(2)));
    const response = await request('/user/follow-notifications');
    assert.match(response.headers.get('cache-control'), /no-store/);
    const notice = (await response.json()).data[0];
    assert.equal((await request(`/user/follow-notifications/${notice.id}/read`, 'POST', 'b')).status, 404);
    assert.equal((await (await request(`/user/follow-notifications/${notice.id}/read`, 'POST')).json()).data.read, true);
    assert.equal((await (await request('/user/follows/movie', 'DELETE')).json()).data.following, false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

for (const mobile of [false, true]) test(`frontend ${mobile ? 'mobile' : 'desktop'} mounts once beside real watchlist and waits for confirmation`, async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', mobile ? 'mobile/chi-tiet.html' : 'chi-tiet.html'), 'utf8');
  const dom = new JSDOM(html, { url: `https://site.test/${mobile ? 'mobile/' : ''}phim/movie` });
  let resolve, mutation = false;
  const api = { getMovieDetail: async () => detail(ep(1)), getMe: async () => ({ id: 'a' }), request: async (url, options) => {
    if (!options) return { status: true, data: [] };
    mutation = true; return new Promise(done => { resolve = done; });
  } };
  try {
    const options = { document: dom.window.document, location: dom.window.location, api };
    const button = mount(options); assert.ok(button); assert.equal(mount(options), button);
    await tick(); assert.equal(button.getAttribute('aria-label'), 'Theo d\u00f5i t\u1eadp m\u1edbi');
    assert.equal(button.querySelector('.material-symbols-outlined').textContent, 'notifications');
    button.click(); assert.equal(mutation, true); assert.equal(button.disabled, true);
    resolve({ status: false }); await tick();
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    assert.match(dom.window.document.getElementById('movie-follow-status').textContent, /Kh/);
    button.click(); resolve({ status: true, data: { following: true } }); await tick();
    assert.equal(button.getAttribute('aria-label'), '\u0110ang theo d\u00f5i');
    assert.equal(button.querySelector('.material-symbols-outlined').textContent, 'notifications');
    assert.match(button.querySelector('span').style.fontVariationSettings, /0/);
    const status = dom.window.document.getElementById('movie-follow-status');
    assert.equal(status.classList.contains('is-success'), true);
    button.click(); resolve({ status: true, data: { following: false } }); await tick();
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    assert.match(button.querySelector('span').style.fontVariationSettings, /0/);
    assert.equal(status.classList.contains('is-success'), true);
    button.click(); resolve({ status: false }); await tick();
    assert.equal(status.classList.contains('is-success'), false);
    assert.match(status.textContent, /Kh/);
    assert.equal(dom.window.document.querySelectorAll('#movie-follow-button').length, 1);
    assert.ok(dom.window.document.querySelector(mobile ? '#m-action-watchlist' : 'button[title]'));
  } finally { dom.window.close(); }
});

test('frontend guest uses safe relative auth redirect; unrelated pages do not mount', async () => {
  const dom = new JSDOM('<button id="m-action-watchlist">Save</button>');
  const location = { pathname: '/mobile/phim/movie', search: '?x=1', hash: '#episodes' };
  const api = { getMovieDetail: async () => detail(ep(1)), getMe: async () => null, request: () => { throw new Error('guest must not mutate'); } };
  try {
    const button = mount({ document: dom.window.document, location, api }); await tick(); button.click();
    assert.equal(location.href, '/auth?redirect=%2Fmobile%2Fphim%2Fmovie%3Fx%3D1%23episodes');
    assert.equal(safeReturnPath({ pathname: '//evil.test' }), '/');
    assert.equal(mount({ document: dom.window.document, location: { pathname: '/xem-phim/movie/tap-1' }, api }), null);
  } finally { dom.window.close(); }
});

test('DOMContentLoaded auto-mount uses the public lexical API without changing watchlist', async () => {
  const dom = new JSDOM('<button id="m-action-watchlist">Save</button>', { url: 'https://site.test/mobile/phim/movie', runScripts: 'outside-only' });
  try {
    dom.window.fixtureAPI = { getMovieDetail: async () => detail(ep(1)), getMe: async () => null };
    const context = dom.getInternalVMContext();
    require('node:vm').runInContext('const API = window.fixtureAPI;', context);
    require('node:vm').runInContext(fs.readFileSync(path.join(__dirname, '..', 'public/js/follows.js'), 'utf8'), context);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    await tick();
    assert.equal(dom.window.document.querySelectorAll('#movie-follow-button').length, 1);
    assert.equal(dom.window.document.getElementById('movie-follow-button').getAttribute('aria-label'), 'Theo d\u00f5i t\u1eadp m\u1edbi');
    assert.equal(dom.window.document.getElementById('m-action-watchlist').textContent, 'Save');
  } finally { dom.window.close(); }
});

test('oversized detail fails closed without replacing baseline; invalid identities and slugs are rejected', async () => {
  const h = fixture();
  await assert.rejects(h.service.follow('', 'movie'), { statusCode: 401 });
  await assert.rejects(h.service.follow('a', '../movie'), { statusCode: 400 });
  assert.equal(h.calls(), 0);
  await h.service.follow('a', 'movie');
  h.set(detail(...Array.from({ length: 10001 }, (_, i) => ep(i + 1))));
  assert.equal((await h.service.checkUpdates('a')).failed, 1);
  assert.deepEqual(h.data().follows[0].seen_episode_keys, ['episode:1']);
  assert.deepEqual(await h.service.getNotifications('a'), []);
});
