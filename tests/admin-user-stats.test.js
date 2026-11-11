const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const { buildUserStats, getUserActivityDetail, sortRecentHistory } = require('../src/services/adminUserStats');
const dbService = require('../src/services/dbService');

const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('admin.html replaces KKPHIM header branding with CineViet and includes user analytics markup', () => {
  const html = read('public/admin.html');
  assert.ok(!html.includes('KK<span class="text-on-surface">PHIM</span>'), 'admin header must not render KKPHIM wordmark');
  assert.ok(html.includes('Cine<span class="text-primary">Viet</span>'), 'admin header must render CineViet wordmark');

  for (const id of [
    'analytics-users-section',
    'analytics-user-total',
    'analytics-user-new-7d',
    'analytics-user-active-sessions',
    'analytics-user-vip',
    'analytics-user-engaged',
    'analytics-user-registration-chart',
    'analytics-user-breakdown',
    'top-users-table-body',
    'modal-user-activity',
    'user-activity-modal-body',
    'upload-ipk-webos',
    'upload-win-exe',
    'upload-win-msi',
    'upload-macos-dmg',
    'upload-linux-appimage',
    'upload-linux-deb'
  ]) {
    assert.ok(html.includes(`id="${id}"`), `admin.html missing #${id}`);
  }
});

test('buildUserStats computes counts, trend, sessions and topUsers without leaking secrets', () => {
  const nowMs = Date.parse('2026-11-11T06:00:00.000Z'); // 13:00 VN on 2026-11-11
  const db = {
    users: [
      {
        id: 'u_admin',
        email: 'admin@cineviet.live',
        name: 'Quản Trị',
        password: 'scrypt$secret_hash',
        role: 'admin',
        is_vip: true,
        email_verified: true,
        email_verified_at: '2026-10-01T00:00:00.000Z',
        mfa: { enabled: true, secret: 'TOP_SECRET_MFA' },
        token_version: 2,
        created_at: '2026-10-01T10:00:00.000Z'
      },
      {
        id: 'u_today',
        email: 'today@example.com',
        name: 'New Viewer',
        password: 'scrypt$secret_hash_2',
        role: 'user',
        email_verified: false,
        token_version: 0,
        created_at: '2026-11-11T02:00:00.000Z'
      },
      {
        id: 'u_blocked',
        email: 'blocked@example.com',
        name: 'Blocked User',
        password: 'scrypt$secret_hash_3',
        role: 'user',
        blocked: true,
        token_version: 0,
        created_at: '2026-11-08T12:00:00.000Z'
      }
    ],
    identity_sessions: [
      { id: 's_valid', user_id: 'u_admin', version: 2, created_at: nowMs - 1000, expires_at: nowMs + 60000, ip: '1.2.3.4', sid_hash: 'abc' },
      { id: 's_revoked', user_id: 'u_admin', version: 1, created_at: nowMs - 5000, expires_at: nowMs + 60000 },
      { id: 's_expired', user_id: 'u_today', version: 0, created_at: nowMs - 10000, expires_at: nowMs - 1000 },
      { id: 's_blocked', user_id: 'u_blocked', version: 0, created_at: nowMs - 1000, expires_at: nowMs + 60000 }
    ],
    history: [
      { user_id: 'u_admin', movie_slug: 'movie-1', updated_at: '2026-11-10T10:00:00.000Z' },
      { user_id: 'u_admin', movie_slug: 'movie-2', updated_at: '2026-11-11T05:00:00.000Z' },
      { user_id: 'guest_anon', movie_slug: 'movie-3', updated_at: '2026-11-11T05:00:00.000Z' }
    ],
    watchlist: [
      { user_id: 'u_today', movie_slug: 'movie-1', created_at: '2026-11-11T03:00:00.000Z' }
    ],
    comments: [
      {
        id: 'c1',
        user_id: 'u_today',
        content: 'Nice',
        created_at: '2026-11-11T04:00:00.000Z',
        replies: [{ id: 'r1', user_id: 'u_admin', content: 'Thanks', created_at: '2026-11-11T04:10:00.000Z' }]
      }
    ],
    ratings: [{ user_id: 'u_today', score: 5, created_at: '2026-11-11T04:00:00.000Z' }],
    follows: [],
    reports: []
  };

  const stats = buildUserStats(db, nowMs);
  assert.equal(stats.total, 3);
  assert.equal(stats.admins, 1);
  assert.equal(stats.regularUsers, 2);
  assert.equal(stats.vip, 1);
  assert.equal(stats.blocked, 1);
  assert.equal(stats.active, 2);
  assert.equal(stats.emailVerified, 1);
  assert.equal(stats.mfaEnabled, 1);
  assert.equal(stats.newToday, 1);
  assert.equal(stats.newLast7Days, 2);
  assert.equal(stats.newLast30Days, 2);
  assert.equal(stats.activeSessionUsers, 1);
  assert.equal(stats.activeSessions, 1);
  assert.equal(stats.withHistory, 1);
  assert.equal(stats.withWatchlist, 1);
  assert.equal(stats.withComments, 2);
  assert.equal(stats.withRatings, 1);
  assert.equal(stats.engagedUsers, 2);

  assert.equal(stats.registrationTrend.length, 14);
  assert.equal(stats.registrationTrend[13].date, '2026-11-11');
  assert.equal(stats.registrationTrend[13].count, 1);

  assert.equal(stats.topUsers.length, 3);
  assert.equal(stats.topUsers[0].id, 'u_admin');
  assert.equal(stats.topUsers[0].watchedCount, 2);
  assert.equal(stats.topUsers[0].commentCount, 1);
  assert.equal(stats.topUsers[0].activeSessions, 1);
  for (const user of stats.topUsers) {
    assert.equal('password' in user, false);
    assert.equal('mfa' in user, false);
    assert.equal('token_version' in user, false);
  }
});

test('dbService.getAdminStats returns structured userStats', async () => {
  const stats = await dbService.getAdminStats();
  assert.ok(stats.userStats && typeof stats.userStats === 'object');
  assert.equal(typeof stats.userStats.total, 'number');
  assert.ok(Array.isArray(stats.userStats.registrationTrend));
  assert.equal(stats.userStats.registrationTrend.length, 14);
  assert.ok(Array.isArray(stats.userStats.topUsers));
});

test('getUserActivityDetail and sortRecentHistory return per-user movies, comments, ratings and real playback progress', () => {
  const db = {
    users: [{ id: 'u1', name: 'Viewer One', email: 'v1@test.com', password: 'secret', role: 'user', is_vip: true }],
    history: [
      { user_id: 'u1', movie_slug: 'older-movie', movie_name: 'Older Movie', current_time: 120, duration: 600, progress_percent: 20, updated_at: '2026-11-10T01:00:00.000Z' },
      { user_id: 'u1', movie_slug: 'newer-movie', movie_name: 'Newer Movie', current_time: 900, duration: 3600, progress_percent: 25, updated_at: '2026-11-11T05:00:00.000Z' }
    ],
    watchlist: [{ user_id: 'u1', movie_slug: 'saved-movie', movie_name: 'Saved Movie', added_at: '2026-11-11T04:00:00.000Z' }],
    comments: [
      { id: 'c1', user_id: 'u1', movie_slug: 'newer-movie', content: 'Hay lam', rating: 5, likes: 2, created_at: '2026-11-11T05:10:00.000Z', replies: [] },
      { id: 'c2', user_id: 'other', movie_slug: 'saved-movie', content: 'Nice', created_at: '2026-11-11T04:00:00.000Z', replies: [{ id: 'r1', user_id: 'u1', content: 'Dong y', created_at: '2026-11-11T05:20:00.000Z' }] }
    ],
    ratings: [{ id: 'rate1', user_id: 'u1', movie_slug: 'saved-movie', score: 4, scale: 5, created_at: '2026-11-11T04:30:00.000Z' }]
  };

  const recent = sortRecentHistory(db.history, db.users);
  assert.equal(recent[0].movie_slug, 'newer-movie');
  assert.equal(recent[0].current_time, 900);
  assert.equal(recent[0].progress_percent, 25);
  assert.equal(recent[0].user_name, 'Viewer One');

  const detail = getUserActivityDetail(db, 'u1');
  assert.equal('password' in detail.user, false);
  assert.equal(detail.history.length, 2);
  assert.equal(detail.history[0].movie_slug, 'newer-movie');
  assert.equal(detail.watchlist.length, 1);
  assert.equal(detail.comments.length, 2);
  assert.equal(detail.comments[0].is_reply, true);
  assert.equal(detail.ratings.length, 1);
  assert.equal(detail.ratings[0].movie_name, 'Saved Movie');
  assert.equal(getUserActivityDetail(db, 'missing'), null);
});

test('admin.js renders user analytics KPIs, chart, breakdown, activity progress and interactive user modal safely', async () => {
  const attack = '"><img src=x onerror="window.pwned=1"><svg onload="window.pwned=1">';
  const adminUser = { id: 'admin_1', name: 'Admin', email: 'admin@cineviet.live', role: 'admin', avatar: '/favicon.svg' };
  const dom = new JSDOM(read('public/admin.html'), { url: 'https://cinema.test/admin', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.document.querySelectorAll('script, svg').forEach(node => node.remove());
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
    get() { return this.textContent; },
    set(value) { this.textContent = value; },
    configurable: true
  });
  const callbacks = [];
  const errors = [];
  const add = window.document.addEventListener.bind(window.document);
  window.document.addEventListener = (ev, cb, opts) => ev === 'DOMContentLoaded' ? callbacks.push(cb) : add(ev, cb, opts);
  window.console.error = (...args) => errors.push(args.map(String).join(' '));
  window.showToast = () => {};

  const sampleStats = {
    totalUsers: 4,
    totalViews: 100,
    topMovies: [],
    recentActivity: [
      {
        movie_slug: 'nap-day-trai-tim',
        movie_name: 'Nạp Đầy Trái Tim',
        episode_name: 'Tập 01',
        episode_slug: 'tap-1',
        current_time: 900,
        duration: 3600,
        progress_percent: 25,
        user_name: 'Khán Giả A',
        updated_at: '2026-11-11T05:00:00.000Z'
      }
    ],
    userStats: {
      total: 4,
      admins: 1,
      regularUsers: 3,
      vip: 2,
      blocked: 0,
      newToday: 1,
      newLast7Days: 2,
      newLast30Days: 4,
      activeSessionUsers: 2,
      activeSessions: 3,
      withHistory: 3,
      withWatchlist: 2,
      withComments: 1,
      withRatings: 2,
      engagedUsers: 3,
      registrationTrend: [
        { date: '2026-11-10', label: '10/11', count: 1 },
        { date: '2026-11-11', label: '11/11', count: 2 }
      ],
      topUsers: [
        {
          id: 'u_xss',
          name: attack,
          email: `xss${attack}@test.com`,
          avatar: 'javascript:alert(1)',
          role: 'user',
          is_vip: true,
          created_at: '2026-11-10T00:00:00.000Z',
          watchedCount: 5,
          watchlistCount: 3,
          commentCount: 2,
          ratingCount: 1,
          activeSessions: 2,
          lastActivityAt: '2026-11-11T05:00:00.000Z'
        }
      ]
    }
  };

  window.API = {
    getMe: async () => adminUser,
    getAdminStats: async () => sampleStats,
    getAdminUsers: async () => [adminUser],
    getAdminUserActivity: async () => ({
      user: { id: 'u_xss', name: attack, email: `xss${attack}@test.com`, avatar: 'javascript:alert(1)', role: 'user', is_vip: true },
      history: [{ movie_slug: 'phim-a', movie_name: `Phim ${attack}`, episode_name: 'Tập 02', episode_slug: 'tap-2', current_time: 600, duration: 2400, progress_percent: 25, updated_at: '2026-11-11T05:00:00.000Z' }],
      watchlist: [{ movie_slug: 'phim-b', movie_name: 'Phim Yêu Thích B', added_at: '2026-11-10T05:00:00.000Z' }],
      comments: [{ id: 'c1', movie_slug: 'phim-a', movie_name: 'Phim A', content: `Bình luận ${attack}`, rating: 5, is_reply: false, created_at: '2026-11-11T04:00:00.000Z' }],
      ratings: [{ id: 'r1', movie_slug: 'phim-b', movie_name: 'Phim Yêu Thích B', score: 5, scale: 5, created_at: '2026-11-11T04:30:00.000Z' }]
    }),
    getAdminReports: async () => [],
    getAdminComments: async () => [],
    getAdminSettings: async () => ({ featured_slugs: [] }),
    getAdminSources: async () => null
  };

  try {
    window.eval(read('public/js/admin.js'));
    for (const cb of callbacks) await cb();
    await tick();

    assert.equal(window.document.getElementById('analytics-user-total').textContent, '4');
    assert.equal(window.document.getElementById('analytics-user-new-7d').textContent, '+2');
    assert.equal(window.document.getElementById('analytics-user-active-sessions').textContent, '2');
    assert.equal(window.document.getElementById('analytics-user-vip').textContent, '2');
    assert.equal(window.document.getElementById('analytics-user-engaged').textContent, '3');
    assert.equal(window.document.getElementById('analytics-user-14d-total').textContent, '3 tài khoản');

    const breakdownText = window.document.getElementById('analytics-user-breakdown').textContent;
    assert.ok(!breakdownText.includes('Đã xác thực Email'));
    assert.ok(!breakdownText.includes('Đã bật bảo mật 2FA'));

    const activityText = window.document.getElementById('activity-stream-table-body').textContent;
    assert.ok(activityText.includes('25%'));
    assert.ok(activityText.includes('15:00 / 1:00:00'));

    const chart = window.document.getElementById('analytics-user-registration-chart');
    assert.equal(chart.children.length, 2);

    const topUsersBody = window.document.getElementById('top-users-table-body');
    assert.ok(topUsersBody.textContent.includes(attack));
    assert.equal(topUsersBody.querySelector('svg, script, img[src="x"]'), null);
    for (const img of topUsersBody.querySelectorAll('img')) {
      assert.ok(!/^\s*(javascript|data):/i.test(img.getAttribute('src') || ''));
    }

    const row = topUsersBody.querySelector('tr[data-user-activity-id]');
    assert.ok(row);
    row.click();
    await tick();
    await tick();

    const modal = window.document.getElementById('modal-user-activity');
    assert.ok(!modal.classList.contains('hidden'));
    const modalBody = window.document.getElementById('user-activity-modal-body');
    assert.ok(modalBody.textContent.includes('25%'));
    assert.ok(modalBody.textContent.includes('10:00 / 40:00'));
    assert.equal(modalBody.querySelector('svg, script, img[src="x"]'), null);

    window.document.querySelector('[data-activity-tab="watchlist"]').click();
    assert.ok(modalBody.textContent.includes('Phim Yêu Thích B'));
    window.document.querySelector('[data-activity-tab="comments"]').click();
    assert.ok(modalBody.textContent.includes(attack));
    assert.equal(modalBody.querySelector('svg, script, img[src="x"]'), null);
    window.document.querySelector('[data-activity-tab="ratings"]').click();
    assert.ok(modalBody.textContent.includes('★ 5 / 5'));

    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
