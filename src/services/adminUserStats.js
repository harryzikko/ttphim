const { publicUser } = require('./passwordService');

const DAY_MS = 24 * 60 * 60 * 1000;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Parse ISO strings or epoch timestamps into epoch milliseconds.
 * @param {unknown} raw
 * @returns {number | null}
 */
function parseTimestampMs(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Format an epoch millisecond value as YYYY-MM-DD in Vietnam time (UTC+7).
 * @param {number} ms
 * @returns {string}
 */
function toVnDayKey(ms) {
  return new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Build daily account registration counts for the last N days in Vietnam time.
 * @param {Array<object>} users
 * @param {number} nowMs
 * @param {number} days
 * @returns {Array<{ date: string, label: string, count: number }>}
 */
function buildRegistrationTrend(users, nowMs, days = 14) {
  const byDay = new Map();
  for (const user of users) {
    const createdMs = parseTimestampMs(user?.created_at);
    if (createdMs === null) continue;
    const key = toVnDayKey(createdMs);
    byDay.set(key, (byDay.get(key) || 0) + 1);
  }

  const trend = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = toVnDayKey(nowMs - offset * DAY_MS);
    trend.push({
      date,
      label: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
      count: byDay.get(date) || 0
    });
  }
  return trend;
}

/**
 * Record interaction counts and latest activity timestamps for known users.
 * @param {Map<string, object>} statsById
 * @param {Array<object>} records
 * @param {string} countField
 * @param {Array<string>} timestampFields
 */
function recordUserInteractions(statsById, records, countField, timestampFields) {
  for (const item of records || []) {
    if (!item || typeof item.user_id !== 'string' || !item.user_id) continue;
    const entry = statsById.get(item.user_id);
    if (!entry) continue;
    entry[countField] += 1;
    for (const field of timestampFields) {
      const ts = parseTimestampMs(item[field]);
      if (ts !== null && ts > entry.lastActivityMs) entry.lastActivityMs = ts;
    }
  }
}

/**
 * Compute real user growth, security, active session, and engagement stats for the admin dashboard.
 * @param {object} db
 * @param {number} nowMs
 * @returns {object}
 */
function buildUserStats(db, nowMs = Date.now()) {
  const users = Array.isArray(db?.users) ? db.users : [];
  const todayKey = toVnDayKey(nowMs);
  const cutoff7d = nowMs - 7 * DAY_MS;
  const cutoff30d = nowMs - 30 * DAY_MS;

  const userRecordById = new Map();
  const statsById = new Map();

  let admins = 0;
  let regularUsers = 0;
  let vip = 0;
  let blocked = 0;
  let emailVerified = 0;
  let mfaEnabled = 0;
  let newToday = 0;
  let newLast7Days = 0;
  let newLast30Days = 0;

  for (const user of users) {
    if (!user || typeof user.id !== 'string' || !user.id) continue;
    userRecordById.set(user.id, user);
    const createdMs = parseTimestampMs(user.created_at);
    statsById.set(user.id, {
      user,
      createdMs: createdMs ?? 0,
      watchedCount: 0,
      watchlistCount: 0,
      commentCount: 0,
      ratingCount: 0,
      followCount: 0,
      reportCount: 0,
      activeSessions: 0,
      lastActivityMs: 0
    });

    if (user.role === 'admin') admins += 1;
    else regularUsers += 1;
    if (user.is_vip) vip += 1;
    if (user.blocked) blocked += 1;
    if (user.email_verified_at || user.email_verified) emailVerified += 1;
    if (user.mfa?.enabled) mfaEnabled += 1;

    if (createdMs !== null) {
      if (toVnDayKey(createdMs) === todayKey) newToday += 1;
      if (createdMs >= cutoff7d) newLast7Days += 1;
      if (createdMs >= cutoff30d) newLast30Days += 1;
    }
  }

  const flatComments = (Array.isArray(db?.comments) ? db.comments : []).flatMap(comment => [
    comment,
    ...(Array.isArray(comment?.replies) ? comment.replies : [])
  ]);

  recordUserInteractions(statsById, db?.history, 'watchedCount', ['updated_at', 'created_at']);
  recordUserInteractions(statsById, db?.watchlist, 'watchlistCount', ['created_at', 'added_at']);
  recordUserInteractions(statsById, flatComments, 'commentCount', ['created_at']);
  recordUserInteractions(statsById, db?.ratings, 'ratingCount', ['updated_at', 'created_at']);
  recordUserInteractions(statsById, db?.follows, 'followCount', ['updated_at', 'created_at']);
  recordUserInteractions(statsById, db?.reports, 'reportCount', ['created_at']);

  let activeSessions = 0;
  const sessionUserIds = new Set();
  for (const session of db?.identity_sessions || []) {
    if (!session || typeof session.user_id !== 'string') continue;
    const owner = userRecordById.get(session.user_id);
    if (!owner || owner.blocked) continue;
    const expiresMs = parseTimestampMs(session.expires_at);
    if (expiresMs !== null && expiresMs <= nowMs) continue;
    if (session.version !== undefined && session.version !== (owner.token_version || 0)) continue;

    activeSessions += 1;
    sessionUserIds.add(session.user_id);
    const entry = statsById.get(session.user_id);
    if (entry) {
      entry.activeSessions += 1;
      const createdMs = parseTimestampMs(session.created_at);
      if (createdMs !== null && createdMs > entry.lastActivityMs) entry.lastActivityMs = createdMs;
    }
  }

  let withHistory = 0;
  let withWatchlist = 0;
  let withComments = 0;
  let withRatings = 0;
  let engagedUsers = 0;

  const rankedUsers = [];
  for (const entry of statsById.values()) {
    if (entry.watchedCount > 0) withHistory += 1;
    if (entry.watchlistCount > 0) withWatchlist += 1;
    if (entry.commentCount > 0) withComments += 1;
    if (entry.ratingCount > 0) withRatings += 1;

    const engagementScore =
      entry.watchedCount * 3 +
      entry.commentCount * 2 +
      entry.ratingCount * 2 +
      entry.watchlistCount +
      entry.followCount;

    if (engagementScore > 0) engagedUsers += 1;

    rankedUsers.push({
      ...publicUser(entry.user),
      blocked: Boolean(entry.user.blocked),
      watchedCount: entry.watchedCount,
      watchlistCount: entry.watchlistCount,
      commentCount: entry.commentCount,
      ratingCount: entry.ratingCount,
      followCount: entry.followCount,
      reportCount: entry.reportCount,
      activeSessions: entry.activeSessions,
      engagementScore,
      lastActivityAt: entry.lastActivityMs > 0 ? new Date(entry.lastActivityMs).toISOString() : null,
      _sortLastMs: entry.lastActivityMs,
      _sortCreatedMs: entry.createdMs
    });
  }

  rankedUsers.sort((a, b) =>
    (b.engagementScore - a.engagementScore) ||
    (b.activeSessions - a.activeSessions) ||
    (b._sortLastMs - a._sortLastMs) ||
    (b._sortCreatedMs - a._sortCreatedMs)
  );

  const topUsers = rankedUsers.slice(0, 10).map(({ _sortLastMs, _sortCreatedMs, ...user }) => user);

  return {
    total: userRecordById.size,
    admins,
    regularUsers,
    vip,
    active: Math.max(0, userRecordById.size - blocked),
    blocked,
    emailVerified,
    mfaEnabled,
    newToday,
    newLast7Days,
    newLast30Days,
    activeSessionUsers: sessionUserIds.size,
    activeSessions,
    withHistory,
    withWatchlist,
    withComments,
    withRatings,
    engagedUsers,
    totalHistoryEntries: Array.isArray(db?.history) ? db.history.length : 0,
    totalFollowEntries: Array.isArray(db?.follows) ? db.follows.length : 0,
    registrationTrend: buildRegistrationTrend(users, nowMs, 14),
    topUsers
  };
}

module.exports = {
  buildUserStats,
  buildRegistrationTrend,
  parseTimestampMs,
  toVnDayKey
};
