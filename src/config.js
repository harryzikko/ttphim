const path = require('path');
require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  KKPHIM_API_BASE: process.env.KKPHIM_API_BASE || 'https://phimapi.com',
  IMAGE_CDN: process.env.IMAGE_CDN || 'https://phimimg.com',
  JWT_SECRET: process.env.JWT_SECRET || 'obsidian_cinema_kkphim_secret_2026',
  DB_PATH: path.join(__dirname, '..', 'data', 'db.json'),
  PUBLIC_DIR: path.join(__dirname, '..', 'public'),
  CACHE_TTL: {
    HOME: 10 * 60 * 1000, // 10 minutes
    DETAIL: 30 * 60 * 1000, // 30 minutes
    CATEGORIES: 24 * 60 * 60 * 1000, // 24 hours
    SEARCH: 5 * 60 * 1000 // 5 minutes
  }
};
