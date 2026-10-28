const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const config = require('../config');

const cookieOptions = { httpOnly: true, secure: config.IS_PRODUCTION, sameSite: 'lax', path: '/' };
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

function trustedOrigin(req, origin) {
  if (typeof origin !== 'string' || origin === 'null') return false;
  if (config.ALLOWED_ORIGINS.includes(origin)) return true;
  return !config.IS_PRODUCTION && origin === `${req.protocol}://${req.get('host')}`;
}

function originGuard(req, res, next) {
  if (safeMethods.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !trustedOrigin(req, origin)) {
    return res.status(403).json({ status: false, message: 'Untrusted request origin' });
  }
  if (!origin && req.get('sec-fetch-site') === 'cross-site') {
    return res.status(403).json({ status: false, message: 'Cross-site mutation is forbidden' });
  }
  if (config.IS_PRODUCTION && !origin && req.cookies?.token && !req.get('authorization')) {
    return res.status(403).json({ status: false, message: 'Cookie mutations require an Origin header' });
  }
  next();
}

const corsMiddleware = cors((req, callback) => callback(null, {
  origin: trustedOrigin(req, req.get('origin')),
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Account-ID']
}));

const { sharedRateOptions } = require('./postgresRateLimitStore');
function limiter(limit, windowMs, extra = {}) {
  return rateLimit({
    limit, windowMs, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { status: false, code: 'RATE_LIMITED', message: 'Quá nhiều yêu cầu. Vui lòng chờ rồi thử lại.' },
    ...extra
  });
}

module.exports = {
  cookieOptions, originGuard, corsMiddleware,
  accountGuard(req, res, next) {
    const expected = req.get('X-Account-ID');
    if (!safeMethods.has(req.method) && expected && req.user && expected !== req.user.id && !/^\/auth\/(?:login|register|forgot-password|reset-password|verify-email)$/.test(req.path)) {
      return res.status(409).set('Cache-Control', 'private, no-store').json({ status: false, code: 'ACCOUNT_CHANGED', message: 'Tài khoản đã thay đổi. Vui lòng tải lại trang trước khi thao tác.' });
    }
    next();
  },
  loginLimiter: limiter(20, 15 * 60 * 1000, { skipSuccessfulRequests: true, ...sharedRateOptions('login') }),
  registrationLimiter: limiter(10, 60 * 60 * 1000, sharedRateOptions('register')),
  validateMutation(req, res, next) {
    if (safeMethods.has(req.method)) return next();
    const body = req.body ?? {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ status: false, message: 'Expected a JSON or form object' });
    }
    const limits = { content: 5000, reason: 500, details: 5000, name: 100, avatar: 2048,
      email: 254, password: 1024, old_password: 1024, new_password: 1024,
      movie_slug: 200, movieSlug: 200, movieName: 300, roomName: 100,
      episode_slug: 200, episodeSlug: 200, episodeName: 100, timestamp_tag: 30 };
    for (const [key, max] of Object.entries(limits)) {
      if (body[key] != null && (typeof body[key] !== 'string' || body[key].length > max)) {
        return res.status(400).json({ status: false, message: `Invalid ${key}` });
      }
    }
    if (body.avatar && !require('./htmlSafety').safeImageUrl(body.avatar)) {
      return res.status(400).json({ status: false, message: 'Invalid avatar URL' });
    }
    if (req.path.startsWith('/auth/register') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email || '')) {
      return res.status(400).json({ status: false, message: 'Invalid email address' });
    }
    if (/^\/comments\//.test(req.path) && body.rating != null &&
        (!Number.isFinite(Number(body.rating)) || Number(body.rating) < 1 || Number(body.rating) > 5)) {
      return res.status(400).json({ status: false, message: 'Rating must be between 1 and 5' });
    }
    for (const field of ['current_time', 'duration', 'currentTime']) {
      if (body[field] != null && (typeof body[field] !== 'number' || !Number.isFinite(body[field]) || body[field] < 0 || body[field] > 604800)) {
        return res.status(400).json({ status: false, message: `Invalid ${field}` });
      }
    }
    next();
  },
  tvLimiter: limiter(30, 15 * 60 * 1000, sharedRateOptions('tv')),
  mutationLimiter: limiter(120, 60 * 1000, { skip: req => safeMethods.has(req.method), ...sharedRateOptions('mutations') })
};
