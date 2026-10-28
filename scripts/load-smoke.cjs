const fs = require('fs/promises');
const path = require('path');
const os = require('os');

(async () => {
  const directory = await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'cineviet-load-'));
  process.env.NODE_ENV = 'development'; process.env.DATABASE_URL = ''; process.env.DEPLOYMENT_MODE = 'single';
  process.env.DB_PATH = path.join(directory, 'db.json');
  process.env.BACKUP_DIR = ''; process.env.ALERTS_ENABLED = 'false'; process.env.SOURCE_MONITOR_ENABLED = 'false';
  await fs.writeFile(process.env.DB_PATH, JSON.stringify({ users: [], watchlist: [], history: [], comments: [] }));
  for (const name of ['kkphimService', 'vicdnService', 'personService', 'tmdbService']) {
    const id = require.resolve(`../src/services/${name}`); require.cache[id] = { id, filename: id, loaded: true, exports: {} };
  }
  const { app } = require('../src/server'); const db = require('../src/services/dbService');
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const durations = [], statuses = {};
  const started = Date.now(); let next = 0;
  try {
    await Promise.all(Array.from({ length: 10 }, async () => {
      while (next++ < 200) {
        const begin = performance.now();
        try { const response = await fetch(base + '/api/ready', { signal: AbortSignal.timeout(5000) }); await response.arrayBuffer(); statuses[response.status] = (statuses[response.status] || 0) + 1; }
        catch { statuses.network_error = (statuses.network_error || 0) + 1; }
        durations.push(performance.now() - begin);
      }
    }));
    await Promise.all(Array.from({ length: 50 }, () => db.incrementMovieView('isolated-load-probe')));
    const views = (await db.getMovieViews())['isolated-load-probe'];
    durations.sort((a, b) => a - b);
    const report = { environment: 'isolated local JSON, provider-free', requests: durations.length, concurrency: 10, duration_ms: Date.now() - started,
      p50_ms: Math.round(durations[Math.ceil(durations.length * 0.5) - 1]), p95_ms: Math.round(durations[Math.ceil(durations.length * 0.95) - 1]), statuses, concurrent_writes: 50, stored_writes: views, production_capacity_certified: false };
    console.log(JSON.stringify(report));
    if (statuses[200] !== 200 || views !== 50) process.exitCode = 1;
  } finally {
    await new Promise(resolve => server.close(resolve)); await db.close(); require('../src/services/partyService').close();
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
