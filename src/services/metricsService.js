const db = require('./dbService');
const EVENT_NAMES = new Set(['start', 'ready', 'error', 'stall', 'resume', 'fallback', 'end']);
const latencyBounds = [50, 100, 250, 500, 1000, 2500, 5000, 15000, Infinity];
let pending = new Map();
let flushing = null;

function bucket() {
  const hour = new Date().toISOString().slice(0, 13);
  if (!pending.has(hour)) pending.set(hour, { hour, requests: 0, errors: 0, latency: Array(9).fill(0), playback: {}, startup_count: 0, startup_total_ms: 0 });
  while (pending.size > 168) pending.delete(pending.keys().next().value);
  return pending.get(hour);
}
function recordRequest(status, duration) {
  const target = bucket();
  target.requests++;
  if (status >= 500) target.errors++;
  target.latency[latencyBounds.findIndex(bound => duration <= bound)]++;
}
function validatePlayback(body) {
  if (!body || !EVENT_NAMES.has(body.event)) throw Object.assign(new Error('Invalid playback event'), { status: 400 });
  for (const field of ['startup_ms', 'duration_ms']) {
    if (body[field] != null && (!Number.isFinite(body[field]) || body[field] < 0 || body[field] > (field === 'startup_ms' ? 120000 : 86400000))) {
      throw Object.assign(new Error(`Invalid ${field}`), { status: 400 });
    }
  }
  const allowed = new Set(['event', 'startup_ms', 'duration_ms', 'provider']);
  if (Object.keys(body).some(key => !allowed.has(key)) || (body.provider != null && !['hls', 'native', 'embed', 'unknown'].includes(body.provider))) {
    throw Object.assign(new Error('Unexpected playback fields'), { status: 400 });
  }
}
function recordPlayback(body) {
  validatePlayback(body);
  const target = bucket();
  target.playback[body.event] = (target.playback[body.event] || 0) + 1;
  if (body.event === 'ready' && body.startup_ms != null) {
    target.startup_count++;
    target.startup_total_ms += body.startup_ms;
  }
}
async function flush() {
  if (flushing) return flushing;
  if (!pending.size) return;
  const batch = pending;
  pending = new Map();
  flushing = db.mutate(data => {
    data.metrics ||= [];
    for (const value of batch.values()) {
      let target = data.metrics.find(item => item.hour === value.hour);
      if (!target) { target = { ...value, latency: Array(9).fill(0), playback: {}, requests: 0, errors: 0, startup_count: 0, startup_total_ms: 0 }; data.metrics.push(target); }
      for (const key of ['requests', 'errors', 'startup_count', 'startup_total_ms']) target[key] += value[key];
      value.latency.forEach((count, index) => { target.latency[index] += count; });
      for (const [event, count] of Object.entries(value.playback)) target.playback[event] = (target.playback[event] || 0) + count;
    }
    const cutoff = new Date(Date.now() - 168 * 3600000).toISOString().slice(0, 13);
    data.metrics = data.metrics.filter(item => item.hour >= cutoff).sort((a, b) => a.hour.localeCompare(b.hour)).slice(-168);
  }).catch(error => {
    for (const [key, value] of batch) {
      const current = pending.get(key);
      if (!current) pending.set(key, value);
      else {
        for (const field of ['requests', 'errors', 'startup_count', 'startup_total_ms']) current[field] += value[field];
        value.latency.forEach((count, index) => { current.latency[index] += count; });
        for (const [event, count] of Object.entries(value.playback)) current.playback[event] = (current.playback[event] || 0) + count;
      }
    }
    throw error;
  }).finally(() => { flushing = null; });
  return flushing;
}
async function summary(windowHours = 168) {
  await flush();
  const data = await db.getRawDatabase();
  const cutoff = new Date(Date.now() - (windowHours - 1) * 3600000).toISOString().slice(0, 13);
  const hours = (data.metrics || []).filter(item => item.hour >= cutoff);
  const playback = {};
  let requests = 0, errors = 0, startupTotal = 0, startupCount = 0;
  const latency = Array(9).fill(0);
  for (const item of hours) {
    requests += item.requests; errors += item.errors;
    startupTotal += item.startup_total_ms; startupCount += item.startup_count;
    item.latency.forEach((count, index) => { latency[index] += count; });
    for (const [event, count] of Object.entries(item.playback)) playback[event] = (playback[event] || 0) + count;
  }
  const rank = Math.ceil(requests * 0.95);
  let total = 0, p95 = null;
  for (let index = 0; index < latency.length && rank; index++) { total += latency[index]; if (total >= rank) { p95 = Number.isFinite(latencyBounds[index]) ? latencyBounds[index] : '>15000'; break; } }
  return { window_hours: windowHours, requests, errors, error_rate: requests ? errors / requests : 0,
    p95_upper_bound_ms: p95, playback, mean_startup_ms: startupCount ? Math.round(startupTotal / startupCount) : null,
    ready_per_start: playback.start ? (playback.ready || 0) / playback.start : null,
    alerts: (data.operational_alerts || []).slice(0, 50), sources: data.source_health || [], backup: data.backup_status || null };
}
function middleware(req, res, next) {
  const start = process.hrtime.bigint();
  const requestPath = req.originalUrl.split('?')[0];
  res.once('finish', () => {
    if (requestPath.startsWith('/api/') && !['/api/health', '/api/ready', '/api/playback/events'].includes(requestPath)) {
      recordRequest(res.statusCode, Number(process.hrtime.bigint() - start) / 1e6);
    }
  });
  next();
}
function resetForTests() { pending = new Map(); }
module.exports = { recordRequest, recordPlayback, validatePlayback, flush, summary, middleware, resetForTests };
