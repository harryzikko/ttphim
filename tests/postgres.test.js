const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Client } = require('pg');
const { PostgresStore } = require('../src/services/postgresStore');
const { PostgresRateLimitStore } = require('../src/services/postgresRateLimitStore');
const { SharedPartyService } = require('../src/services/sharedPartyService');
const { SharedTvAuthService } = require('../src/services/sharedTvAuthService');
const db = require('../src/services/dbService');
const party = require('../src/services/partyService');
const { fork } = require('child_process');
const path = require('path');
const { generateToken } = require('../src/services/authService');

const admin = { id: 'pg-admin', email: 'admin@example.test', name: 'Admin', role: 'admin', password: 'test-password' };
const member = { id: 'pg-member', email: 'member@example.test', name: 'Member', role: 'user', password: 'test-password' };

test('PostgreSQL real-server transactions, shared state and rate limits', { skip: !process.env.TEST_DATABASE_URL, timeout: 60000 }, async t => {
  const management = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await management.connect();
  const name = 'cineviet_test_' + crypto.randomBytes(8).toString('hex');
  await management.query(`CREATE DATABASE ${name}`);
  const url = new URL(process.env.TEST_DATABASE_URL); url.pathname = '/' + name;
  const first = new PostgresStore(url.href), second = new PostgresStore(url.href);
  const originalStore = db.store;
  let a, b;
  try {
    const fs = require('fs/promises'), os = require('os');
    const migrationDirectory = await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'pg-migration-'));
    const source = path.join(migrationDirectory, 'source.json');
    const snapshot = JSON.stringify({ users: [admin, member], comments: [], history: [], watchlist: [], settings: { featured_slugs: ['film'] } });
    try {
      await fs.writeFile(source, snapshot);
      await require('../scripts/migrate-postgres.cjs').migrate(source, url.href);
      assert.equal(await fs.readFile(source, 'utf8'), snapshot);
    } finally { await fs.rm(migrationDirectory, { recursive: true, force: true }); }
    await t.test('provisioning refuses an existing destination', async () => {
      await assert.rejects(second.provision({ users: [], comments: [], history: [], watchlist: [] }), /refusing to overwrite/);
      assert.equal((await second.read()).users.length, 2);
    });
    await t.test('independent connections retain concurrent increments and roll back failures', async () => {
      const instances = [new db.constructor(), new db.constructor()];
      instances[0].store = first; instances[1].store = second;
      await Promise.all(Array.from({ length: 40 }, (_, index) => instances[index % 2].incrementMovieView('film')));
      assert.equal((await first.read()).movie_views.film, 40);
      await assert.rejects(instances[0].mutate(data => { data.movie_views.film = 999; throw new Error('rollback probe'); }), /rollback probe/);
      assert.equal((await first.read()).movie_views.film, 40);
    });
    await t.test('rate counters are atomic across adapters and expire', async () => {
      const stores = [new PostgresRateLimitStore(first, 'integration'), new PostgresRateLimitStore(second, 'integration')];
      stores.forEach(store => store.init({ windowMs: 10000 }));
      const results = await Promise.all(Array.from({ length: 20 }, (_, index) => stores[index % 2].increment('127.0.0.1')));
      assert.equal(Math.max(...results.map(item => item.totalHits)), 20);
      assert.ok(!stores[0].key('127.0.0.1').includes('127.0.0.1'));
      await first.pool.query("UPDATE cineviet_rate_limits SET reset_at = clock_timestamp() - interval '1 second' WHERE key=$1", [stores[0].key('127.0.0.1')]);
      assert.equal((await stores[1].increment('127.0.0.1')).totalHits, 1);
    });
    await t.test('room membership, chat and host state are shared across replicas', async () => {
      a = new SharedPartyService(new party.constructor(), first);
      b = new SharedPartyService(new party.constructor(), second);
      const room = await a.createRoom({ movieSlug: 'film', user: admin });
      assert.equal((await b.getRoom(room.code)).hostId, admin.id);
      await b.joinRoom(room.code, member);
      await a.syncPlayer(room.code, admin.id, { action: 'seek', currentTime: 120 });
      await b.syncPlayer(room.code, member.id, { action: 'heartbeat', currentTime: 999 });
      assert.equal((await b.getRoom(room.code)).currentTime, 120);
      await b.sendChat(room.code, member.id, { content: 'Across two replicas' });
      assert.ok((await a.getRoom(room.code)).messages.some(item => item.content === 'Across two replicas'));
      await assert.rejects(b.syncPlayer(room.code, 'outsider', { action: 'heartbeat', currentTime: 9 }));
    });
    await t.test('TV pairing survives replica changes and encrypted approvals are not overwritten', async () => {
      db.store = first;
      const tvA = new SharedTvAuthService(first, async user => generateToken(user));
      const tvB = new SharedTvAuthService(second, async user => generateToken(user));
      const session = await tvA.createSession('https://cinema.example.com');
      assert.equal((await tvB.getStatus(session.token)).status, 'pending');
      const results = await Promise.all([tvA.authorize(session.code, member), tvB.authorize(session.code, admin)]);
      assert.equal(results.filter(result => result.success).length, 1);
      const approved = await tvB.getStatus(session.token);
      assert.equal(approved.status, 'approved');
      const raw = JSON.stringify(await first.getState('tv'));
      assert.ok(!raw.includes(approved.token));
      assert.ok(!raw.includes(session.token));
    });
    await t.test('two production processes share sessions, QR approvals, SSE events and revocation', { timeout: 25000 }, async () => {
      const secret = crypto.randomBytes(48).toString('hex');
      const children = [];
      async function replica() {
        const child = fork(path.join(__dirname, 'fixtures/replica-server.cjs'), [], { silent: true, env: { ...process.env,
          NODE_ENV: 'production', DATABASE_URL: url.href, DEPLOYMENT_MODE: 'replicated', JWT_SECRET: secret,
          REQUIRE_ADMIN_MFA: 'false', REQUIRE_VERIFIED_EMAIL: 'false', PUBLIC_ORIGIN: 'https://cinema.example.com', HOST: '127.0.0.1', PORT: '0', BACKUP_DIR: '' } });
        children.push(child);
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Replica start timed out')), 10000);
          child.once('message', message => { clearTimeout(timer); resolve(`http://127.0.0.1:${message.port}`); });
          child.once('exit', code => { clearTimeout(timer); reject(new Error(`Replica exited ${code}`)); });
        });
      }
      try {
        const [left, right] = await Promise.all([replica(), replica()]);
        async function call(base, endpoint, body, token) {
          const response = await fetch(base + '/api' + endpoint, { method: body === undefined ? 'GET' : 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Client-Type': 'native', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000) });
          return { status: response.status, body: await response.json() };
        }
        const adminLogin = await call(left, '/auth/login', { email: admin.email, password: admin.password });
        const memberLogin = await call(right, '/auth/login', { email: member.email, password: member.password });
        const adminToken = adminLogin.body.data.token, memberToken = memberLogin.body.data.token;
        assert.ok(adminToken && memberToken);
        assert.equal((await call(right, '/admin/users', undefined, adminToken)).status, 200);
        const qr = await call(left, '/auth/tv/session', {});
        assert.equal((await call(right, '/auth/tv/authorize', { token: qr.body.data.token }, memberToken)).status, 200);
        assert.equal((await call(left, '/auth/tv/status?token=' + qr.body.data.token)).body.status, 'approved');
        const room = await call(left, '/party/create', { movieSlug: 'film' }, adminToken);
        const code = room.body.data.code;
        assert.equal((await call(right, `/party/${code}/join`, {}, memberToken)).status, 200);
        const stream = await fetch(right + `/api/party/${code}/stream`, { headers: { Authorization: `Bearer ${memberToken}` }, signal: AbortSignal.timeout(10000) });
        assert.equal(stream.status, 200);
        const reader = stream.body.getReader(); await reader.read();
        await call(left, `/party/${code}/chat`, { content: 'Replica event probe' }, adminToken);
        let received = '';
        while (!received.includes('Replica event probe')) {
          const value = await reader.read(); if (value.done) break;
          received += new TextDecoder().decode(value.value);
        }
        assert.ok(received.includes('Replica event probe'));
        assert.equal((await call(left, `/admin/moderation/users/${member.id}`, { blocked: true, reason: 'Replica revocation probe' }, adminToken)).status, 200);
        while (!(await reader.read()).done) {}
        assert.equal((await call(right, '/user/library', undefined, memberToken)).status, 401);
      } finally {
        await Promise.all(children.map(child => new Promise(resolve => {
          if (child.exitCode !== null) return resolve();
          child.once('exit', resolve); child.send('stop'); child.disconnect();
          const timer = setTimeout(() => child.kill(), 3000); timer.unref();
        })));
      }
    });
  } finally {
    db.store = originalStore;
    a?.close(); b?.close();
    await first.close(); await second.close();
    await management.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await management.end();
  }
});
