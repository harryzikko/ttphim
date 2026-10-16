const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const config = require('./config');
const apiRoutes = require('./routes/apiRoutes');
const viewRoutes = require('./routes/viewRoutes');

const app = express();

// Middleware
app.use(compression({
  filter: (req, res) => !req.path.endsWith('/stream') && compression.filter(req, res)
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Pinned, locally served HLS engine: no runtime dependency on a third-party CDN.
app.get('/vendor/hls-1.7.3.min.js', (req, res) => {
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(require.resolve('hls.js/dist/hls.min.js'));
});

// API Routes
app.use('/api', apiRoutes);

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
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Fallback for SPA/routing or 404
app.use((req, res) => {
  res.status(404).sendFile(path.join(config.PUBLIC_DIR, 'index.html'));
});

// Start Server
const server = app.listen(config.PORT, config.HOST, () => {
  console.log(`====================================================`);
  console.log(`   🎬 CINEVIET - OBSIDIAN CINEMA BACKEND IS RUNNING  `);
  console.log(`   Local: http://localhost:${config.PORT}          `);
  console.log(`   IPv4:  http://127.0.0.1:${config.PORT}          `);
  console.log(`   API:   http://localhost:${config.PORT}/api/home `);
  console.log(`====================================================`);

  // Pre-warm home cache after ViCDN initial sync for instantaneous first load & accurate bilingual flags
  const vicdnService = require('./services/vicdnService');
  const kkphimService = require('./services/kkphimService');
  vicdnService.init().then(() => {
    kkphimService.cache.delete('home_data_payload');
    return kkphimService.getHomeData();
  }).catch(() => {
    kkphimService.getHomeData().catch(() => {});
  });
});

