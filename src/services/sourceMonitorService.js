const config = require('../config');
const db = require('./dbService');
const { notify } = require('./alertService');
let running = null;
async function check(fetcher = fetch) {
  if (running) return running;
  running = perform(fetcher).finally(() => { running = null; });
  return running;
}
async function perform(fetcher) {
  const targets = [
    ['kkphim', `${config.KKPHIM_API_BASE}/danh-sach/phim-moi-cap-nhat?page=1`],
    ['vicdn', 'https://vicdn.cc/api/update/1']
  ];
  const results = await Promise.all(targets.map(async ([name, url]) => {
    const start = Date.now();
    let healthy = false;
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(8000), redirect: 'error', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('upstream failed');
      const reader = response.body.getReader();
      let bytes = 0;
      const chunks = [];
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 512000) throw new Error('Upstream metadata too large');
          chunks.push(Buffer.from(value));
        }
      } finally { await reader.cancel().catch(() => {}); }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      healthy = data?.status !== false && Array.isArray(data?.items || data?.data?.items || data?.films);
    } catch { healthy = false; }
    return { name, healthy, response_ms: Date.now() - start, checked_at: new Date().toISOString() };
  }));
  await db.mutate(data => { data.source_health = results; });
  for (const result of results) if (!result.healthy) {
    await notify(`source_${result.name}_down`, `${result.name} metadata health check failed`).catch(() => {});
  }
  return results;
}
function start() {
  if (process.env.SOURCE_MONITOR_ENABLED !== 'true') return () => {};
  const timer = setInterval(() => check().catch(() => console.error('Source health check failed')), 300000);
  timer.unref();
  return () => clearInterval(timer);
}
module.exports = { check, start, drain: () => running || Promise.resolve() };
