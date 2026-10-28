const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const quiet = { log() {}, warn() {}, error() {} };
const TTL = 24 * 60 * 60 * 1000;

function clock() {
  let now = 1700000000000;
  return { Date: class extends Date { static now() { return now; } }, advance(ms) { now += ms; } };
}

// All services run with explicit dependencies: no config, dotenv, database or provider access.
function parties(t, randomInt = crypto.randomInt) {
  const time = clock();
  const events = new EventEmitter();
  const context = { module: { exports: {} }, console: quiet, Date: time.Date,
    setInterval: () => ({ unref() {} }), clearInterval() {}, require(name) {
      if (name === 'crypto') return { randomInt };
      if (name === './sessionEvents') return events;
      if (name === './dbService') return { store: null };
      throw new Error(`Unexpected dependency: ${name}`);
    } };
  vm.runInNewContext(read('src/services/partyService.js'), context);
  const local = context.module.exports;
  t.after(() => local.close());
  return { local, time, events };
}

function metadata() {
  const time = clock();
  const context = { module: { exports: {} }, console: quiet, Date: time.Date, require(name) {
    if (name === '../config') return { KKPHIM_API_BASE: 'https://provider.invalid', IMAGE_CDN: '', CACHE_TTL: { CATEGORIES: TTL } };
    if (name === './vicdnService') return { getMovieDetail: async () => null };
    if (name === './nguoncService') return { getMovieDetail: async () => null, getNguoncServers: async () => [] };
    throw new Error(`Unexpected dependency: ${name}`);
  } };
  vm.runInNewContext(read('src/services/kkphimService.js'), context);
  const service = context.module.exports;
  service.fetchJson = async () => { throw new Error('Unmocked provider'); };
  return { service, time };
}

const options = id => ({ movieSlug: 'fixture-film', user: { id, name: id } });
const list = slug => ({ status: true, data: { items: [{ _id: slug, name: slug, slug }] } });
const plain = value => JSON.parse(JSON.stringify(value));
const roomFixture = (time, hostId = 'other') => ({ hostId, lastActive: time.Date.now(), streams: new Map(), members: [], messages: [] });
const errorIs = (status, code) => error => error.status === status && error.statusCode === status && error.code === code;

function shared(local, time) {
  const context = { module: { exports: {} }, Date: time.Date, require(name) {
    if (name === 'crypto') return crypto;
    if (name === './dbService') return {};
    throw new Error(`Unexpected dependency: ${name}`);
  } };
  vm.runInNewContext(read('src/services/sharedPartyService.js'), context);
  const state = { rooms: {} };
  const store = { state: async (name, change) => { assert.equal(name, 'parties'); return change(state); }, getState: async () => state };
  return { service: new context.module.exports.SharedPartyService(local, store), state };
}

test('room codes use crypto in a larger namespace, fit the join input, and still read legacy codes', t => {
  let index = 0;
  const { local } = parties(t, max => { assert.equal(max, 36 ** 7); return index++; });
  const codes = new Set(Array.from({ length: 10000 }, () => local.generateRoomCode()));
  assert.equal(codes.size, 10000);
  assert.ok([...codes].every(code => /^KP-[0-9A-Z]{7}$/.test(code) && code.length === 10));
  const html = read('public/xem-phim.html');
  const input = html.match(/<input\b[^>]*id="party-input-join-code"[^>]*>/)[0];
  assert.ok(Number(input.match(/maxlength="(\d+)"/)[1]) >= 10);
  const created = local.createRoom(options('host'));
  assert.equal(local.joinRoom(` ${created.code.toLowerCase()} `, { id: 'member' }).room.code, created.code);
  local.rooms.set('KP-1234', local.getRoom(created.code));
  assert.equal(local.getRoom(' kp-1234 ').code, created.code);
});

test('collision retries stop after 32 attempts with a controlled 503', { timeout: 1000 }, t => {
  let attempts = 0;
  const { local, time } = parties(t, () => { attempts++; return 0; });
  local.rooms.set('KP-0000000', roomFixture(time));
  assert.throws(() => local.createRoom(options('host')), errorIs(503, 'PARTY_CODE_UNAVAILABLE'));
  assert.equal(attempts, 32);
  assert.equal(local.rooms.size, 1);
});

test('local room capacity is 500 and checks capacity before code generation', t => {
  const { local, time } = parties(t);
  for (let index = 0; index < 499; index++) local.rooms.set(`old-${index}`, roomFixture(time));
  local.createRoom(options('host'));
  assert.equal(local.rooms.size, 500);
  local.generateRoomCode = () => assert.fail('Capacity check must precede allocation');
  assert.throws(() => local.createRoom(options('another-host')), errorIs(503, 'PARTY_CAPACITY'));
});

test('per-host cap is three, cleanup runs first, and streamed rooms are retained', t => {
  const { local, time } = parties(t);
  for (let index = 0; index < 3; index++) local.createRoom(options('host'));
  assert.throws(() => local.createRoom(options('host')), errorIs(429, 'PARTY_HOST_LIMIT'));
  const [first, second] = [...local.rooms.values()];
  first.lastActive -= 6 * 60 * 60 * 1000 + 1;
  second.lastActive = first.lastActive;
  second.streams.set('host', new Set());
  local.createRoom(options('host'));
  assert.equal(local.rooms.size, 3);
  assert.equal(local.getRoom(first.code), null);
  assert.ok(local.getRoom(second.code));
  local.createRoom(options('other-host'));
  assert.equal(local.rooms.size, 4);
  time.advance(1);
});

test('expired rooms free global capacity before checking limits', t => {
  const { local, time } = parties(t);
  for (let index = 0; index < 500; index++) local.rooms.set(`old-${index}`, roomFixture(time));
  local.rooms.get('old-0').lastActive -= 21600001;
  local.createRoom(options('host'));
  assert.equal(local.rooms.size, 500);
  assert.equal(local.rooms.has('old-0'), false);
});

test('shared storage uses the same host/global limits and cleanup with legacy rooms', async t => {
  const { local, time } = parties(t);
  const { service, state } = shared(local, time);
  for (let index = 0; index < 3; index++) await service.createRoom(options('host'));
  await assert.rejects(service.createRoom(options('host')), errorIs(429, 'PARTY_HOST_LIMIT'));
  state.rooms = Object.fromEntries(Array.from({ length: 500 }, (_, index) => [`KP-${1000 + index}`, roomFixture(time)]));
  await assert.rejects(service.createRoom(options('host')), errorIs(503, 'PARTY_CAPACITY'));
  state.rooms['KP-1000'].lastActive = 0;
  await service.createRoom(options('host'));
  assert.equal(Object.keys(state.rooms).length, 500);
  assert.equal(state.rooms['KP-1000'], undefined);
  assert.ok(await service.getRoom(' kp-1001 '));
});

test('membership, host-only playback, host transfer and session stream revocation remain enforced', t => {
  const { local, events } = parties(t);
  const room = local.createRoom(options('host'));
  for (const action of ['heartbeat', 'seek']) assert.throws(() => local.syncPlayer(room.code, 'stranger', { action, currentTime: 99 }));
  assert.throws(() => local.sendChat(room.code, 'stranger', { content: 'hello' }));
  assert.throws(() => local.sendReaction(room.code, 'stranger', { emoji: 'x' }));
  local.joinRoom(room.code, { id: 'member', name: 'Member' });
  assert.throws(() => local.syncPlayer(room.code, 'member', { action: 'seek', currentTime: 99 }));
  local.syncPlayer(room.code, 'member', { action: 'heartbeat', currentTime: 99 });
  assert.equal(local.getRoom(room.code).currentTime, 0);
  let ended = 0;
  local.getRoom(room.code).streams.set('host', new Set([{ end() { ended++; } }]));
  events.emit('revoked', 'host');
  assert.equal(ended, 1);
  assert.equal(local.getRoom(room.code).streams.has('host'), false);
  local.leaveRoom(room.code, 'host');
  assert.equal(local.getRoom(room.code).hostId, 'member');
  assert.equal(local.syncPlayer(room.code, 'member', { action: 'seek', currentTime: 15 }).room.currentTime, 15);
});

test('metadata fail-once retries after 30 seconds without real waits or 24-hour empty poisoning', async () => {
  const { service, time } = metadata();
  const calls = [];
  service.fetchJson = async endpoint => {
    calls.push(endpoint);
    if (calls.length <= 2) throw new Error('Provider unavailable');
    return list(endpoint.endsWith('the-loai') ? 'category' : 'country');
  };
  const failed = await service.getCategoriesAndCountries();
  assert.deepEqual(plain(failed), { categories: [], countries: [], error: 'provider_unavailable', partial: false,
    errors: { categories: 'provider_unavailable', countries: 'provider_unavailable' }, stale: [] });
  await service.getCategoriesAndCountries();
  time.advance(29999);
  await service.getCategoriesAndCountries();
  assert.equal(calls.length, 2);
  time.advance(1);
  const recovered = await service.getCategoriesAndCountries();
  assert.equal(recovered.categories[0].slug, 'category');
  assert.equal(recovered.countries[0].slug, 'country');
  assert.equal(recovered.error, undefined);
  assert.equal(calls.length, 4);
  time.advance(TTL - 1);
  await service.getCategoriesAndCountries();
  assert.equal(calls.length, 4);
});

test('metadata coalesces concurrent callers, including a failing flight and its retry', async () => {
  const { service, time } = metadata();
  let calls = 0;
  let release;
  let gate = new Promise(resolve => { release = resolve; });
  let failing = true;
  service.fetchJson = async () => { calls++; await gate; if (failing) throw new Error('outage'); return list('recovered'); };
  const pending = Array.from({ length: 20 }, () => service.getCategoriesAndCountries());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  release();
  const failed = await Promise.all(pending);
  assert.ok(failed.every(value => value.error === 'provider_unavailable'));
  time.advance(30000);
  failing = false;
  gate = new Promise(resolve => { release = resolve; });
  const retry = Array.from({ length: 20 }, () => service.getCategoriesAndCountries());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 4);
  release();
  assert.ok((await Promise.all(retry)).every(value => value.categories[0].slug === 'recovered' && !value.error));
});

test('metadata retains last-known-good lists independently and retries only failed sections', async () => {
  const { service, time } = metadata();
  let phase = 0;
  const calls = [];
  service.fetchJson = async endpoint => {
    calls.push(endpoint);
    const category = endpoint.endsWith('the-loai');
    if ((phase === 1 && category) || (phase === 2 && !category)) throw new Error('Partial outage');
    return list(`${category ? 'cat' : 'country'}-${phase}`);
  };
  await service.getCategoriesAndCountries();
  time.advance(TTL + 1);
  phase = 1;
  const partial = await service.getCategoriesAndCountries();
  assert.equal(partial.categories[0].slug, 'cat-0');
  assert.equal(partial.countries[0].slug, 'country-1');
  assert.equal(partial.partial, true);
  assert.deepEqual(plain(partial.errors), { categories: 'provider_unavailable' });
  assert.deepEqual(plain(partial.stale), ['categories']);
  time.advance(30000);
  phase = 2;
  const recovered = await service.getCategoriesAndCountries();
  assert.equal(calls.length, 5);
  assert.equal(recovered.categories[0].slug, 'cat-2');
  assert.equal(recovered.countries[0].slug, 'country-1');
  assert.equal(recovered.error, undefined);
  time.advance(TTL + 1);
  const countryOutage = await service.getCategoriesAndCountries();
  assert.equal(countryOutage.countries[0].slug, 'country-1');
  assert.deepEqual(plain(countryOutage.errors), { countries: 'provider_unavailable' });
  assert.deepEqual(plain(countryOutage.stale), ['countries']);
});

test('valid empty metadata is a cacheable success, including replacement of old lists', async () => {
  const { service, time } = metadata();
  service.fetchJson = async () => list('old');
  await service.getCategoriesAndCountries();
  time.advance(TTL + 1);
  let calls = 0;
  service.fetchJson = async () => { calls++; return { status: true, data: { items: [] } }; };
  assert.deepEqual(plain(await service.getCategoriesAndCountries()), { categories: [], countries: [] });
  time.advance(30001);
  assert.deepEqual(plain(await service.getCategoriesAndCountries()), { categories: [], countries: [] });
  assert.equal(calls, 2);
});

test('malformed and explicit failed metadata responses are not cached as empty successes', async () => {
  for (const response of [{ status: false, data: { items: [] } }, { status: true }, { data: { items: {} } }]) {
    const { service, time } = metadata();
    service.fetchJson = async () => response;
    assert.equal((await service.getCategoriesAndCountries()).error, 'provider_unavailable');
    time.advance(30000);
    service.fetchJson = async () => list('real');
    assert.equal((await service.getCategoriesAndCountries()).categories[0].slug, 'real');
  }
});

test('detail distinguishes explicit absence from malformed payload and preserves upstream failures', async () => {
  const { service } = metadata();
  service.fetchJson = async () => ({ status: false });
  await assert.rejects(service.getMovieDetail('missing-fixture'), error => error.status === 503);
  service.fetchJson = async () => ({ status: false, message: 'Movie not found' });
  await assert.rejects(service.getMovieDetail('absent-fixture'), error => error.status === 404);
  const outage = new Error('Fixture provider timeout');
  service.fetchJson = async () => { throw outage; };
  await assert.rejects(service.getMovieDetail('outage-fixture'), error => error === outage && error.status === undefined);
});
