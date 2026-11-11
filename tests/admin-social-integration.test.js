const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { JSDOM } = require('jsdom');

const tempDir = fs.mkdtempSync(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'admin-social-'));
Object.assign(process.env, {
  NODE_ENV: 'test',
  DB_PATH: path.join(tempDir, 'db.json'),
  DATABASE_URL: '',
  PUBLIC_ORIGIN: '',
  ALLOWED_ORIGINS: '',
  REQUIRE_ADMIN_MFA: 'false',
  REQUIRE_VERIFIED_EMAIL: 'false'
});

for (const name of ['kkphimService', 'vicdnService', 'nguoncService', 'vodphimService', 'personService', 'tmdbService']) {
  const id = require.resolve(`../src/services/${name}`);
  require.cache[id] = { id, filename: id, loaded: true, exports: {} };
}

const config = require('../src/config');
const db = require('../src/services/dbService');
const { issueSession } = require('../src/services/authService');
const { app } = require('../src/server');

const adminUser = { id: 'social-admin', name: 'Admin', email: 'admin@social.test', password: 'secret-password', role: 'admin' };
const memberUser = { id: 'social-member', name: 'Member', email: 'member@social.test', password: 'secret-password', role: 'user' };

const originalDbPath = db.dbPath;
const originalBotUrl = config.SOCIAL_BOT_URL;
const originalBotToken = config.SOCIAL_BOT_TOKEN;

let appServer;
let appBase;
let botServer;
let botPort;
let botRequests = [];

const tick = () => new Promise(resolve => setImmediate(resolve));

async function apiRequest(url, { user, method = 'GET', body } = {}) {
  const token = user ? (await issueSession(user)).token : '';
  const response = await fetch(`${appBase}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  db.dbPath = path.join(tempDir, 'db.json');

  botServer = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      let parsed = null;
      try {
        parsed = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        parsed = rawBody;
      }
      botRequests.push({
        method: req.method,
        url: req.url,
        auth: req.headers.authorization || '',
        body: parsed
      });

      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/dashboard' && req.method === 'GET') {
        res.end(JSON.stringify({
          status: true,
          data: {
            integrations: { tmdb_configured: true, facebook_configured: true, threads_configured: true },
            settings: { auto_schedule_enabled: true, dry_run: false, slots_vn: ['11:30', '21:00'] },
            stats: { total_published: 5, scheduled_count: 2, published_queue_count: 5, failed_or_partial_count: 0 },
            open_slots: [],
            queue: [],
            published_movies: [],
            run_logs: []
          }
        }));
        return;
      }
      if (req.url === '/api/settings' && req.method === 'POST') {
        res.end(JSON.stringify({ status: true, data: parsed }));
        return;
      }
      if (req.url === '/api/jobs/fill-queue' && req.method === 'POST') {
        res.end(JSON.stringify({ status: true, data: { added: [{ id: 'post_9999' }], skipped: [] } }));
        return;
      }
      if (req.url === '/api/jobs/tick' && req.method === 'POST') {
        res.end(JSON.stringify({ status: true, data: { published: ['post_9999'] } }));
        return;
      }
      if (req.url === '/api/queue/post_1234' && req.method === 'PATCH') {
        res.end(JSON.stringify({ status: true, data: { id: 'post_1234', ...parsed } }));
        return;
      }
      if (req.url === '/api/queue/post_1234/publish' && req.method === 'POST') {
        res.end(JSON.stringify({ status: true, data: { id: 'post_1234', status: 'published' } }));
        return;
      }
      if (req.url === '/api/queue/post_1234' && req.method === 'DELETE') {
        res.end(JSON.stringify({ status: true }));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ status: false, message: 'Not found' }));
    });
  });

  await new Promise(resolve => botServer.listen(0, '127.0.0.1', resolve));
  botPort = botServer.address().port;
  config.SOCIAL_BOT_URL = `http://127.0.0.1:${botPort}`;
  config.SOCIAL_BOT_TOKEN = 'test-social-secret-token';

  appServer = http.createServer(app);
  await new Promise(resolve => appServer.listen(0, '127.0.0.1', resolve));
  appBase = `http://127.0.0.1:${appServer.address().port}`;
});

beforeEach(async () => {
  botRequests = [];
  config.SOCIAL_BOT_URL = `http://127.0.0.1:${botPort}`;
  await db.operationQueue;
  await fsp.writeFile(db.dbPath, JSON.stringify({ users: [adminUser, memberUser], watchlist: [], history: [], comments: [] }));
});

after(async () => {
  if (appServer) {
    appServer.closeAllConnections();
    await new Promise(resolve => appServer.close(resolve));
  }
  if (botServer && botServer.listening) {
    botServer.closeAllConnections();
    await new Promise(resolve => botServer.close(resolve));
  }
  await db.operationQueue;
  db.dbPath = originalDbPath;
  config.SOCIAL_BOT_URL = originalBotUrl;
  config.SOCIAL_BOT_TOKEN = originalBotToken;
  await fsp.rm(tempDir, { recursive: true, force: true });
});

test('/api/admin/social/* enforces admin authentication and rejects invalid IDs', async () => {
  const routes = [
    ['GET', '/api/admin/social/dashboard'],
    ['POST', '/api/admin/social/settings', { dry_run: false }],
    ['POST', '/api/admin/social/jobs/fill-queue', {}],
    ['POST', '/api/admin/social/jobs/tick', {}],
    ['PATCH', '/api/admin/social/queue/post_1234', { facebook_caption: 'hi' }],
    ['POST', '/api/admin/social/queue/post_1234/publish', {}],
    ['DELETE', '/api/admin/social/queue/post_1234']
  ];

  for (const [method, url, body] of routes) {
    const guestRes = await apiRequest(url, { method, body });
    assert.equal(guestRes.status, 401, `guest rejected for ${method} ${url}`);

    const memberRes = await apiRequest(url, { user: memberUser, method, body });
    assert.equal(memberRes.status, 403, `member rejected for ${method} ${url}`);
  }

  assert.equal(botRequests.length, 0, 'unauthorized callers must not reach upstream bot');

  for (const badId of ['ab', 'bad..id', 'a%2Fb', 'post$evil']) {
    const res = await apiRequest(`/api/admin/social/queue/${badId}`, { user: adminUser, method: 'DELETE' });
    assert.equal(res.status, 400, `rejects invalid queue id ${badId}`);
  }
});

test('/api/admin/social/* proxies cleanly to internal bot with bearer token and returns 503 when offline', async () => {
  const dash = await apiRequest('/api/admin/social/dashboard', { user: adminUser });
  assert.equal(dash.status, 200);
  assert.equal(dash.body.data.stats.total_published, 5);

  const settings = await apiRequest('/api/admin/social/settings', {
    user: adminUser,
    method: 'POST',
    body: { auto_schedule_enabled: false, slots_vn: '12:00, 20:00' }
  });
  assert.equal(settings.status, 200);

  const fill = await apiRequest('/api/admin/social/jobs/fill-queue', { user: adminUser, method: 'POST', body: { count: 2 } });
  assert.equal(fill.status, 200);

  const tickRes = await apiRequest('/api/admin/social/jobs/tick', { user: adminUser, method: 'POST', body: {} });
  assert.equal(tickRes.status, 200);

  const patch = await apiRequest('/api/admin/social/queue/post_1234', {
    user: adminUser,
    method: 'PATCH',
    body: { facebook_caption: 'Cap nhat moi', threads_caption: 'Threads moi' }
  });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.data.facebook_caption, 'Cap nhat moi');

  const pub = await apiRequest('/api/admin/social/queue/post_1234/publish', { user: adminUser, method: 'POST', body: {} });
  assert.equal(pub.status, 200);
  assert.equal(pub.body.data.status, 'published');

  const del = await apiRequest('/api/admin/social/queue/post_1234', { user: adminUser, method: 'DELETE' });
  assert.equal(del.status, 200);

  assert.equal(botRequests.length, 7);
  for (const req of botRequests) {
    assert.equal(req.auth, 'Bearer test-social-secret-token');
  }

  // Point to dead port and verify graceful 503 offline response
  await new Promise(resolve => botServer.close(resolve));
  const offlineRes = await apiRequest('/api/admin/social/dashboard', { user: adminUser });
  assert.equal(offlineRes.status, 503);
  assert.equal(offlineRes.body.code, 'SOCIAL_BOT_OFFLINE');
});

test('public/admin.html embeds tab-social UI safely and admin-social.js escapes XSS payloads', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/admin.html'), 'utf8');
  assert.ok(html.includes('data-tab="tab-social"'), 'sidebar tab button present');
  assert.ok(html.includes('id="tab-social"'), 'tab-social section present');
  assert.ok(html.includes('/js/admin-social.js'), 'admin-social.js script included');

  const attack = '"><img src=x onerror="window.pwned=1"><svg onload="window.pwned=1">&\'';
  const badUrl = 'javascript:alert(1)';

  const dom = new JSDOM(html, { url: 'https://cineviet.live/admin', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.document.querySelectorAll('script, svg').forEach(node => node.remove());

  const callbacks = [];
  const errors = [];
  const savedCalls = [];
  const publishedCalls = [];
  const deletedCalls = [];

  const origAdd = window.document.addEventListener.bind(window.document);
  window.document.addEventListener = (event, cb, opts) => (event === 'DOMContentLoaded' ? callbacks.push(cb) : origAdd(event, cb, opts));
  window.console.error = (...args) => errors.push(args.map(String).join(' '));
  window.showToast = () => {};

  let offlineMode = false;
  window.API = {
    getAdminSocialDashboard: async () => {
      if (offlineMode) throw new Error('Bot dang tat');
      return {
        integrations: { tmdb_configured: true, facebook_configured: true, threads_configured: false },
        settings: {
          auto_schedule_enabled: true,
          dry_run: true,
          fb_enabled: true,
          threads_enabled: true,
          require_tmdb_image: true,
          slots_vn: ['11:30', '21:00'],
          lookahead_days: 2,
          min_hours_between_posts: 3,
          max_posts_per_day: 3
        },
        open_slots: ['2026-12-01T04:30:00.000Z'],
        stats: { total_published: 12, scheduled_count: 1, published_queue_count: 12, failed_or_partial_count: 1 },
        queue: [{
          id: 'post_xss_1',
          slug: 'phim-test',
          name: attack,
          origin_name: attack,
          year: '2026',
          vote_average: 8.2,
          template_id: 'review_hot',
          status: 'failed',
          retry_count: 1,
          scheduled_at: '2026-12-01T14:00:00.000Z',
          facebook_image_url: badUrl,
          threads_image_url: 'https://image.tmdb.org/t/p/original/poster.jpg',
          facebook_caption: attack,
          threads_caption: attack,
          platforms: {
            facebook: { status: 'failed', error: attack },
            threads: { status: 'published', post_id: attack }
          }
        }],
        published_movies: [{
          slug: 'done-1',
          name: attack,
          year: '2026',
          published_at: '2026-11-11T10:00:00.000Z',
          facebook_post_id: attack
        }],
        run_logs: [{
          action: 'publish_error',
          summary: attack,
          at: '2026-11-11T10:05:00.000Z'
        }]
      };
    },
    saveAdminSocialSettings: async (payload) => payload,
    fillAdminSocialQueue: async () => ({ added: [] }),
    tickAdminSocial: async () => ({ published: [] }),
    updateAdminSocialPost: async (id, payload) => {
      savedCalls.push({ id, payload });
      return { id, ...payload };
    },
    publishAdminSocialPost: async (id) => {
      publishedCalls.push(id);
      return { id, status: 'published' };
    },
    deleteAdminSocialPost: async (id) => {
      deletedCalls.push(id);
      return true;
    }
  };

  try {
    window.eval(fs.readFileSync(path.join(__dirname, '../public/js/admin-social.js'), 'utf8'));
    for (const cb of callbacks) await cb();
    await window.loadAdminSocialTab();
    await tick();

    const tabRoot = window.document.getElementById('tab-social');
    assert.equal(tabRoot.querySelector('svg, script, img[src="x"]'), null, 'no injected elements created');
    for (const el of tabRoot.querySelectorAll('*')) {
      for (const attr of el.attributes) {
        if (/^on/i.test(attr.name)) assert.ok(!attr.value.includes('pwned=1'));
        if (/^(src|href)$/i.test(attr.name)) assert.ok(!/^\s*(javascript|data):/i.test(attr.value), `unsafe URL blocked: ${attr.value}`);
      }
    }
    assert.equal(window.pwned, undefined);

    const queueRoot = window.document.getElementById('social-queue-list');
    assert.ok(queueRoot.textContent.includes(attack), 'XSS payload preserved safely as text');
    assert.equal(window.document.getElementById('social-stat-published').textContent, '12');

    // Live character counter updates on input
    const threadsInput = queueRoot.querySelector('.social-input-threads');
    threadsInput.value = 'Noi dung ngan gon';
    threadsInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(queueRoot.querySelector('.social-threads-count').textContent, '17/500');

    // Card action buttons dispatch to API
    queueRoot.querySelector('.btn-social-save-post').click();
    await tick();
    assert.equal(savedCalls.length, 1);
    assert.equal(savedCalls[0].id, 'post_xss_1');

    queueRoot.querySelector('.btn-social-publish-post').click();
    await tick();
    assert.deepEqual(publishedCalls, ['post_xss_1']);

    queueRoot.querySelector('.btn-social-delete-post').click();
    await tick();
    assert.deepEqual(deletedCalls, ['post_xss_1']);

    // Offline banner activates cleanly when bot rejects
    offlineMode = true;
    await window.loadAdminSocialTab();
    await tick();
    const banner = window.document.getElementById('social-offline-banner');
    assert.equal(banner.classList.contains('hidden'), false);
    assert.equal(window.document.getElementById('social-offline-message').textContent, 'Bot dang tat');
    assert.deepEqual(errors.filter(e => !e.includes('Bot dang tat')), []);
  } finally {
    window.close();
  }
});
