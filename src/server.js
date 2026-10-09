const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const config = require('./config');
const apiRoutes = require('./routes/apiRoutes');
const viewRoutes = require('./routes/viewRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// API Routes
app.use('/api', apiRoutes);

// View Routes
app.use('/', viewRoutes);

// Static Files (disabled automatic index.html interception)
app.use(express.static(config.PUBLIC_DIR, { index: false }));

// Fallback for SPA/routing or 404
app.use((req, res) => {
  res.status(404).sendFile(path.join(config.PUBLIC_DIR, 'index.html'));
});

// Start Server
app.listen(config.PORT, () => {
  console.log(`====================================================`);
  console.log(`   🎬 TTPHIM - OBSIDIAN CINEMA BACKEND IS RUNNING  `);
  console.log(`   URL: http://localhost:${config.PORT}            `);
  console.log(`   API: http://localhost:${config.PORT}/api/home   `);
  console.log(`====================================================`);
});
