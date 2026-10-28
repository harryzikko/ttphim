const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const configuredSecret = process.env.JWT_SECRET || '';
const unsafeSecret = configuredSecret.length < 32 || configuredSecret === 'obsidian_cinema_kkphim_secret_2026';
if (IS_PRODUCTION && unsafeSecret) {
  throw new Error('Production requires a private JWT_SECRET of at least 32 characters; default secrets are forbidden.');
}
if (IS_PRODUCTION && !process.env.DATABASE_URL && (!process.env.DB_PATH || !path.isAbsolute(process.env.DB_PATH))) {
  throw new Error('Production requires an absolute DB_PATH on persistent local storage.');
}
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || '';
if (IS_PRODUCTION && (!PUBLIC_ORIGIN || new URL(PUBLIC_ORIGIN).protocol !== 'https:')) {
  throw new Error('Production requires PUBLIC_ORIGIN with HTTPS.');
}
const allowedOrigins = [PUBLIC_ORIGIN, ...(process.env.ALLOWED_ORIGINS || '').split(',')]
  .filter(Boolean).map(value => new URL(value.trim()).origin);
const proxyValue = (process.env.TRUST_PROXY || '').trim();
if (proxyValue === 'true') throw new Error('TRUST_PROXY=true is unsafe; use an exact proxy IP/subnet or hop count.');
const TRUST_PROXY = !proxyValue || ['false', '0'].includes(proxyValue) ? false
  : /^\d+$/.test(proxyValue) ? Number(proxyValue) : proxyValue.split(',').map(value => value.trim());
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS || 10000);
if (!Number.isInteger(SHUTDOWN_TIMEOUT_MS) || SHUTDOWN_TIMEOUT_MS < 100 || SHUTDOWN_TIMEOUT_MS > 30000) {
  throw new Error('SHUTDOWN_TIMEOUT_MS must be between 100 and 30000');
}

const DATABASE_URL = process.env.DATABASE_URL || '';
if (DATABASE_URL && !/^postgres(ql)?:\/\//.test(DATABASE_URL)) throw new Error('DATABASE_URL must use PostgreSQL');
if (process.env.DEPLOYMENT_MODE === 'replicated' && !DATABASE_URL) throw new Error('Replicated deployment requires PostgreSQL shared state');
module.exports = {
  IS_PRODUCTION,
  PORT: process.env.PORT || 3001,
  HOST: process.env.HOST || '127.0.0.1',
  PUBLIC_ORIGIN: PUBLIC_ORIGIN ? new URL(PUBLIC_ORIGIN).origin : '',
  ALLOWED_ORIGINS: [...new Set(allowedOrigins)],
  TRUST_PROXY,
  SHUTDOWN_TIMEOUT_MS,
  DATABASE_URL,
  REQUIRE_VERIFIED_EMAIL: process.env.REQUIRE_VERIFIED_EMAIL === 'true',
  REQUIRE_ADMIN_MFA: process.env.REQUIRE_ADMIN_MFA === 'true',
  ALERT_WEBHOOK_URL: process.env.ALERT_WEBHOOK_URL || '',
  BACKUP_DIR: process.env.BACKUP_DIR || '',
  BACKUP_INTERVAL_MS: Number(process.env.BACKUP_INTERVAL_MS || 86400000),
  BACKUP_RETENTION: Number(process.env.BACKUP_RETENTION || 14),
  KKPHIM_API_BASE: process.env.KKPHIM_API_BASE || 'https://phimapi.com',
  IMAGE_CDN: process.env.IMAGE_CDN || 'https://phimimg.com',
  // Development secrets are ephemeral: a restart intentionally invalidates old tokens.
  JWT_SECRET: unsafeSecret ? crypto.randomBytes(48).toString('hex') : configuredSecret,
  DB_PATH: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'db.json'),
  PUBLIC_DIR: path.join(__dirname, '..', 'public'),
  AVATAR_DIR: process.env.AVATAR_DIR || path.join(path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'db.json')), 'avatars'),
  CACHE_TTL: {
    HOME: 10 * 60 * 1000,
    DETAIL: 30 * 60 * 1000,
    CATEGORIES: 24 * 60 * 60 * 1000,
    SEARCH: 5 * 60 * 1000
  }
};
