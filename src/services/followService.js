const { randomUUID } = require('node:crypto');

const MAX_FOLLOWS = 100;
const MAX_NOTIFICATIONS = 100;
const MAX_EPISODES = 10000;
const text = value => typeof value === 'string' ? value.trim() : '';
const normalize = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '-');
function episodeKey(episode) {
  const slug = normalize(episode.slug);
  const name = normalize(episode.name);
  const numeric = value => value.match(/^(?:(?:tap|episode|ep)[- ]*)?(\d+)(?:[.-](\d+))?$/);
  const match = numeric(slug || name);
  if (match) return `episode:${match[1].replace(/^0+(?=\d)/, '')}${match[2] === undefined ? '' : `.${match[2].replace(/^0+(?=\d)/, '')}`}`;
  return slug || name ? `named:${slug || name}` : null;
}
function fault(message, statusCode) { return Object.assign(new Error(message), { statusCode }); }
function validSlug(slug) {
  if (typeof slug !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(slug)) throw fault('Invalid movie slug', 400);
  return slug;
}
function safeImage(value) {
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : ''; }
  catch (_) { return ''; }
}
function snapshot(detail) {
  if (!detail || detail.status === false || !detail.movie || !Array.isArray(detail.episodes) || detail.episodes.length > 100) throw fault('Movie details unavailable', 502);
  const episodes = new Map();
  let count = 0;
  for (const server of detail.episodes) {
    if (!Array.isArray(server?.server_data)) throw fault('Incomplete episode details', 502);
    for (const ep of server.server_data) {
      if (++count > MAX_EPISODES * 10) throw fault('Episode details too large', 502);
      if (!ep || ![ep.link_m3u8, ep.link_embed].some(value => { try { return /^https?:$/.test(new URL(value).protocol); } catch (_) { return false; } })) continue;
      const key = episodeKey(ep);
      if (!key) continue;
      if (!episodes.has(key)) episodes.set(key, { key, slug: text(ep.slug).slice(0, 200), name: text(ep.name).slice(0, 200) || text(ep.slug).slice(0, 200) });
      if (episodes.size > MAX_EPISODES) throw fault('Too many episodes', 502);
    }
  }
  return { episodes: [...episodes.values()], name: text(detail.movie.name).slice(0, 300), thumb: safeImage(detail.movie.thumb_url || detail.movie.poster_url) };
}
function createFollowService({ db = require('./dbService'), provider = require('./kkphimService'), now = Date.now,
  refreshMs = 5 * 60 * 1000, maxLookups = 10, id = randomUUID } = {}) {
  const flights = new Map();
  const userFlights = new Map();
  const limit = Math.max(1, Math.min(10, Number(maxLookups) || 10));
  function user(userId) { if (typeof userId !== 'string' || !userId) throw fault('Authentication required', 401); }
  function state(data) {
    for (const key of ['follows', 'follow_notifications', 'follow_checks']) {
      if (data[key] === undefined) data[key] = [];
      if (!Array.isArray(data[key])) throw new Error(`Invalid ${key} state`);
    }
    return data;
  }
  const publicFollow = row => ({ id: row.id, movie_slug: row.movie_slug, movie_name: row.movie_name, thumb: row.thumb, created_at: row.created_at });
  async function listFollows(userId) {
    user(userId);
    const data = await db.read();
    return (data.follows || []).filter(row => row.user_id === userId).map(publicFollow);
  }
  async function follow(userId, slug) {
    user(userId); validSlug(slug);
    const follows = await listFollows(userId);
    const existing = follows.find(row => row.movie_slug === slug);
    if (existing) return { following: true, follow: existing };
    if (follows.length >= MAX_FOLLOWS) throw fault('Follow limit reached (100)', 409);
    // A follow always gets its own authoritative baseline, never an older refresh promise.
    let baseline;
    try { baseline = snapshot(await provider.getMovieDetail(slug)); }
    catch (_) { throw fault('Movie details unavailable; follow was not saved', 502); }
    return db.mutate(data => {
      state(data);
      const old = data.follows.find(row => row.user_id === userId && row.movie_slug === slug);
      if (old) return { following: true, follow: publicFollow(old) };
      if (data.follows.filter(row => row.user_id === userId).length >= MAX_FOLLOWS) throw fault('Follow limit reached (100)', 409);
      const row = { id: id(), user_id: userId, movie_slug: slug, movie_name: baseline.name, thumb: baseline.thumb,
        created_at: new Date(now()).toISOString(), seen_episode_keys: baseline.episodes.map(ep => ep.key) };
      data.follows.push(row);
      return { following: true, follow: publicFollow(row) };
    });
  }
  async function unfollow(userId, slug) {
    user(userId); validSlug(slug);
    return db.mutate(data => {
      state(data);
      data.follows = data.follows.filter(row => row.user_id !== userId || row.movie_slug !== slug);
      data.follow_notifications = data.follow_notifications.filter(row => row.user_id !== userId || row.movie_slug !== slug);
      if (!data.follows.some(row => row.movie_slug === slug)) data.follow_checks = data.follow_checks.filter(row => row.slug !== slug);
      return { following: false, movie_slug: slug };
    });
  }
  async function refreshSlug(slug) {
    if (flights.has(slug)) return flights.get(slug);
    const work = (async () => {
      const targets = await db.mutate(data => {
        state(data);
        const rows = data.follows.filter(row => row.movie_slug === slug);
        if (!rows.length) return [];
        const last = data.follow_checks.find(row => row.slug === slug);
        if (last && now() - last.at < refreshMs) return [];
        if (last) last.at = now(); else data.follow_checks.push({ slug, at: now() });
        return rows.map(row => row.id);
      });
      if (!targets.length) return { checked: 0, failed: 0 };
      let latest;
      try { latest = snapshot(await provider.getMovieDetail(slug)); }
      catch (_) { return { checked: 1, failed: 1 }; }
      const ids = new Set(targets);
      await db.mutate(data => {
        state(data);
        const affected = new Set();
        for (const row of data.follows.filter(item => item.movie_slug === slug && ids.has(item.id))) {
          const hasBaseline = Array.isArray(row.seen_episode_keys);
          const seen = new Set(hasBaseline ? row.seen_episode_keys : []);
          const union = new Set([...seen, ...latest.episodes.map(ep => ep.key)]);
          // Refuse oversized snapshots rather than dropping deduplication history.
          if (union.size > MAX_EPISODES) continue;
          for (const ep of latest.episodes) {
            if (!hasBaseline || seen.has(ep.key)) continue;
            if (data.follow_notifications.some(n => n.user_id === row.user_id && n.movie_slug === slug && n.episode_key === ep.key)) continue;
            data.follow_notifications.push({ id: `follow_${id()}`, user_id: row.user_id, movie_slug: slug, episode_key: ep.key,
              type: 'follow_episode', badge: 'T\u1eadp m\u1edbi', title: latest.name || row.movie_name, message: `\u0110\u00e3 c\u00f3 t\u1eadp m\u1edbi: ${ep.name}`,
              episode_name: ep.name, icon: 'notifications_active', thumb: latest.thumb, time: 'M\u1edbi c\u1eadp nh\u1eadt',
              url: ep.slug ? `/xem-phim/${encodeURIComponent(slug)}/${encodeURIComponent(ep.slug)}` : `/phim/${encodeURIComponent(slug)}`,
              created_at: new Date(now()).toISOString(), read: false });
          }
          row.seen_episode_keys = [...union];
          row.movie_name = latest.name || row.movie_name;
          row.thumb = latest.thumb || row.thumb;
          affected.add(row.user_id);
        }
        for (const owner of affected) {
          const own = data.follow_notifications.filter(n => n.user_id === owner);
          const keep = new Set(own.slice(-MAX_NOTIFICATIONS).map(n => n.id));
          data.follow_notifications = data.follow_notifications.filter(n => n.user_id !== owner || keep.has(n.id));
        }
      });
      return { checked: 1, failed: 0 };
    })();
    flights.set(slug, work);
    try { return await work; } finally { if (flights.get(slug) === work) flights.delete(slug); }
  }
  async function checkUpdates(userId) {
    user(userId);
    if (userFlights.has(userId)) return userFlights.get(userId);
    const work = (async () => {
      const data = await db.read();
      const checks = new Map((data.follow_checks || []).map(row => [row.slug, row.at]));
      const slugs = [...new Set((data.follows || []).filter(row => row.user_id === userId).map(row => row.movie_slug))]
        .filter(slug => flights.has(slug) || !checks.has(slug) || now() - checks.get(slug) >= refreshMs)
        .sort((a, b) => (checks.get(a) ?? -Infinity) - (checks.get(b) ?? -Infinity)).slice(0, limit);
      const results = await Promise.all(slugs.map(refreshSlug));
      return results.reduce((sum, result) => ({ checked: sum.checked + result.checked, failed: sum.failed + result.failed }), { checked: 0, failed: 0 });
    })();
    userFlights.set(userId, work);
    try { return await work; } finally { if (userFlights.get(userId) === work) userFlights.delete(userId); }
  }
  async function getNotifications(userId) {
    user(userId);
    const data = await db.read();
    return (data.follow_notifications || []).filter(row => row.user_id === userId).slice(-MAX_NOTIFICATIONS).reverse()
      .map(({ user_id, ...row }) => ({ ...row }));
  }
  async function markNotificationRead(userId, notificationId) {
    user(userId);
    return db.mutate(data => {
      state(data);
      const row = data.follow_notifications.find(item => item.id === notificationId && item.user_id === userId);
      if (!row) throw fault('Notification not found', 404);
      row.read = true;
      row.read_at = row.read_at || new Date(now()).toISOString();
      return { id: row.id, read: true, read_at: row.read_at };
    });
  }
  return { listFollows, follow, unfollow, checkUpdates, getNotifications, markNotificationRead };
}

module.exports = { createFollowService, episodeKey, MAX_FOLLOWS, MAX_NOTIFICATIONS };
// Lazy defaults allow isolated tests to inject a database without initializing real stores.
for (const method of ['listFollows', 'follow', 'unfollow', 'checkUpdates', 'getNotifications', 'markNotificationRead']) {
  module.exports[method] = (...args) => (singleton ||= createFollowService())[method](...args);
}
let singleton;
