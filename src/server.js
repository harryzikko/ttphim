const express = require('express');
const path = require('path');
const crypto = require('crypto');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const config = require('./config');
const apiRoutes = require('./routes/apiRoutes');
const viewRoutes = require('./routes/viewRoutes');

const dbService = require('./services/dbService');
const partyService = require('./services/partyService');
const metrics = require('./services/metricsService');
const backups = require('./services/backupService');
const sourceMonitor = require('./services/sourceMonitorService');
const { notify } = require('./services/alertService');
const app = express();
app.disable('x-powered-by');
if (config.TRUST_PROXY) app.set('trust proxy', config.TRUST_PROXY);
let shuttingDown = false;
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.set('X-Request-ID', req.id);
  req.logPath = req.path;
  next();
});
app.use(helmet({
  contentSecurityPolicy: { reportOnly: true },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'no-referrer-when-downgrade' },
  strictTransportSecurity: config.IS_PRODUCTION
}));

// Middleware
app.use(compression({
  filter: (req, res) => !req.path.endsWith('/stream') && compression.filter(req, res)
}));
app.use(morgan((tokens, req, res) => JSON.stringify({
  requestId: req.id, method: req.method, path: req.logPath,
  status: Number(tokens.status(req, res)), durationMs: Number(tokens['response-time'](req, res))
})));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());
app.use(metrics.middleware);

app.get('/api/ready', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (shuttingDown) return res.status(503).json({ status: false });
  try {
    await dbService.getRawDatabase();
    res.json({ status: true });
  } catch {
    res.status(503).json({ status: false });
  }
});

// Pinned, locally served HLS engine: no runtime dependency on a third-party CDN.
app.get('/vendor/hls-1.7.3.min.js', (req, res) => {
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(require.resolve('hls.js/dist/hls.min.js'));
});
app.get('/media/avatars/:name', (req, res) => {
  if (!/^[a-f0-9]{32}\.webp$/.test(req.params.name)) return res.sendStatus(404);
  res.set('Cache-Control', 'public, max-age=300').set('Content-Security-Policy', "default-src 'none'; sandbox").type('image/webp');
  res.sendFile(path.resolve(config.AVATAR_DIR, req.params.name), error => {
    if (error && !res.headersSent) res.status(error.status === 404 ? 404 : 500).end();
  });
});

// API Routes
app.use('/api', apiRoutes);

// Protect private HTML before either view aliases or express.static can serve it.
app.use(require('./services/pageAccess'));
// View Routes
app.use('/', viewRoutes);

// Static Files (disabled automatic index.html interception)
app.use(express.static(config.PUBLIC_DIR, {
  index: false,
  setHeaders(res, filePath) {
    const extension = path.extname(filePath).toLowerCase();
    if (['.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.woff', '.woff2'].includes(extension)) {
      const versioned = new URL(res.req.originalUrl, 'http://localhost').searchParams.has('v');
      res.setHeader('Cache-Control', `public, max-age=${versioned ? 86400 : 300}`);
    } else if (extension === '.html') {
      if (!/no-store/i.test(String(res.getHeader('Cache-Control') || ''))) res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Fallback for SPA/routing or 404
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).set('Cache-Control', 'no-store').json({ status: false, message: 'Không tìm thấy API' });
  require('./services/pageError').sendPageError(res, { status: 404 });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
  console.error(JSON.stringify({ requestId: req.id, status, error: config.IS_PRODUCTION ? error.name : error.message }));
  res.status(status).json({ status: false, message: status >= 500 ? 'Internal server error' : 'Invalid request', requestId: req.id });
});

async function start() {
  if (config.IS_PRODUCTION) await dbService.getRawDatabase();
  const stopBackups = backups.start();
  const stopSources = sourceMonitor.start();
  const metricsTimer = setInterval(async () => {
    try {
      await metrics.flush();
      if (process.env.ALERTS_ENABLED === 'true') {
        const health = await metrics.summary(1);
        if (health.requests >= 20 && health.error_rate > 0.1) await notify('api_error_rate', 'API error rate exceeded 10% in the current hour', { severity: 'critical' });
        if ((health.playback.start || 0) >= 20 && (health.playback.error || 0) / health.playback.start > 0.2) await notify('playback_error_rate', 'Playback errors exceeded 20% of starts');
      }
    } catch { console.error('Metrics persistence or alert delivery failed'); }
  }, 15000);
  metricsTimer.unref();
  const server = app.listen(config.PORT, config.HOST, () => {
    console.log(`CineViet listening on ${config.HOST}:${config.PORT}`);
  });
  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(metricsTimer); stopBackups(); stopSources();
    partyService.close();
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      process.exit(1);
    }, config.SHUTDOWN_TIMEOUT_MS);
    await new Promise(resolve => server.close(resolve));
    await Promise.allSettled([backups.drain(), sourceMonitor.drain()]);
    await dbService.operationQueue;
    await metrics.flush().catch(() => {});
    await dbService.close();
    clearTimeout(deadline);
  }
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  return server;
}

if (require.main === module) start().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { app, start };
