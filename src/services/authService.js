const crypto = require('crypto');
const config = require('../config');
const dbService = require('./dbService');
const { hashPassword, publicUser } = require('./passwordService');
const sessionEvents = require('./sessionEvents');
const WEB_SESSION_TTL = 48 * 60 * 60 * 1000;
const APP_SESSION_TTL = 10 * 365 * 24 * 60 * 60 * 1000;
const BROWSER_COOKIE_MAX_AGE = 400 * 24 * 60 * 60 * 1000;
const SESSION_TTL = WEB_SESSION_TTL;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function isAppClientMetadata(metadata = {}) {
  if (metadata?.isApp === true) return true;
  const clientType = String(metadata?.clientType || metadata?.headers?.['x-client-type'] || '').toLowerCase().trim();
  if (['native', 'desktop', 'tv', 'webos', 'mobile', 'app'].includes(clientType)) return true;
  const device = String(metadata?.device || '').toLowerCase();
  if (device.includes('tv qr') || device.includes('desktop') || device.includes('android tv') || device.includes('webos')) return true;
  const ua = String(metadata?.headers?.['user-agent'] || '');
  if (/CineVietDesktop|CineViet-AndroidTV|CineVietMobile|webOS|SmartTV|NetCast/i.test(ua)) return true;
  return false;
}

function sign(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${crypto.createHmac('sha256', config.JWT_SECRET).update(encoded).digest('base64url')}`;
}

// Compatibility for untracked fixtures only. Production never authenticates sid-less tokens.
function generateToken(user) {
  return sign({ userId: user.id, version: user.token_version || 0, exp: Date.now() + SESSION_TTL });
}

function verifyToken(token) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const expected = crypto.createHmac('sha256', config.JWT_SECRET).update(encoded).digest('base64url');
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature) || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload || typeof payload.userId !== 'string' || !Number.isFinite(payload.exp) || Date.now() >= payload.exp ||
        !Number.isSafeInteger(payload.version) || payload.version < 0 ||
        (payload.sid !== undefined && (typeof payload.sid !== 'string' || !/^[a-f0-9]{64}$/.test(payload.sid)))) return null;
    return payload;
  } catch (_) { return null; }
}

function createSession(data, user, metadata = {}, now = Date.now()) {
  const sid = crypto.randomBytes(32).toString('hex');
  const isApp = isAppClientMetadata(metadata);
  const expires = now + (isApp ? APP_SESSION_TTL : WEB_SESSION_TTL);
  const sessions = data.identity_sessions = (data.identity_sessions || []).filter(s => s.expires_at > now);
  // Bound storage per account without keeping a second, non-revocable token path,
  // while keeping persistent app sessions separate so web logins never evict TV/mobile/desktop apps.
  const ownApp = sessions.filter(s => s.user_id === user.id && s.is_app).sort((a, b) => b.created_at - a.created_at);
  const ownWeb = sessions.filter(s => s.user_id === user.id && !s.is_app).sort((a, b) => b.created_at - a.created_at);
  const remove = new Set([
    ...(isApp ? ownApp.slice(29) : ownApp.slice(30)).map(s => s.id),
    ...(isApp ? ownWeb.slice(20) : ownWeb.slice(19)).map(s => s.id)
  ]);
  data.identity_sessions = sessions.filter(s => !remove.has(s.id));
  const session = {
    id: crypto.randomUUID(), user_id: user.id, sid_hash: digest(sid),
    version: user.token_version || 0, created_at: now, expires_at: expires, is_app: isApp,
    device: String(metadata.headers?.['user-agent'] || metadata.device || 'Unknown device').slice(0, 200),
    ip: String(metadata.ip || '').slice(0, 64)
  };
  data.identity_sessions.push(session);
  user.session_policy = 'tracked';
  return { token: sign({ userId: user.id, version: session.version, sid, exp: expires }), sessionId: session.id, expiresAt: expires, isApp, user: publicUser(user) };
}

function createAuthService({ db = dbService, now = Date.now, allowTestFixtures = !config.IS_PRODUCTION && Boolean(process.env.NODE_TEST_CONTEXT || process.env.NODE_ENV === 'test') } = {}) {
  async function issueSession(user, metadata) {
    const result = await db.mutate(data => {
      const stored = data.users.find(u => u.id === user.id);
      if (!stored || stored.blocked || (user.token_version !== undefined && user.token_version !== (stored.token_version || 0))) throw new Error('Account changed; please sign in again');
      const previous = (data.identity_sessions || []).filter(session => session.user_id === user.id);
      const session = createSession(data, stored, metadata, now());
      const active = new Set(data.identity_sessions.map(item => item.id));
      return { session, revoked: previous.some(item => !active.has(item.id)) };
    });
    if (result.revoked) sessionEvents.emit('revoked', user.id);
    return result.session;
  }
  async function renewAppSession(req) {
    if (!req?.user?.id || !req.authSessionId || !req.authSid) return null;
    const currentNow = now();
    const expires = currentNow + APP_SESSION_TTL;
    return db.mutate(data => {
      const stored = data.users.find(u => u.id === req.user.id);
      if (!stored || stored.blocked || (stored.token_version || 0) !== req.authVersion) return null;
      const session = (data.identity_sessions || []).find(
        s => s.id === req.authSessionId && s.user_id === stored.id && s.expires_at > currentNow && s.sid_hash === digest(req.authSid) && s.version === req.authVersion
      );
      if (!session) return null;
      session.expires_at = expires;
      session.is_app = true;
      return {
        token: sign({ userId: stored.id, version: session.version, sid: req.authSid, exp: expires }),
        expiresAt: expires,
        sessionId: session.id
      };
    });
  }
  async function authMiddleware(req, res, next) {
    try {
      const authorization = req.headers.authorization;
      const isBearer = typeof authorization === 'string' && authorization.startsWith('Bearer ');
      const token = isBearer ? authorization.slice(7) : req.cookies?.token;
      const payload = verifyToken(token);
      if (payload) {
        const data = await db.getRawDatabase();
        const user = data.users.find(u => u.id === payload.userId);
        let identity = null;
        if (user && !user.blocked && payload.version === (user.token_version || 0)) {
          const session = payload.sid && (data.identity_sessions || []).find(s => s.expires_at > now() && s.user_id === user.id && s.sid_hash === digest(payload.sid) && s.version === payload.version);
          if (session || (!config.IS_PRODUCTION && allowTestFixtures && !payload.sid && !user.session_policy && !user.mfa?.enabled)) {
            identity = { user: publicUser(user), sessionId: session?.id, isApp: Boolean(session?.is_app) };
          }
        }
        if (identity) {
          req.user = identity.user;
          req.authSessionId = identity.sessionId;
          req.authSessionIsApp = identity.isApp;
          req.authExpiresAt = payload.exp;
          req.authVersion = payload.version;
          req.authMethod = isBearer ? 'bearer' : 'cookie';
          req.authSid = payload.sid || null;
          req.authToken = token;
        }
      }
      next();
    } catch (error) { next(error); }
  }
  return { issueSession, renewAppSession, authMiddleware };
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ status: false, message: 'Vui lòng đăng nhập để thực hiện thao tác này' });
  if ((config.REQUIRE_VERIFIED_EMAIL === true || process.env.REQUIRE_VERIFIED_EMAIL === 'true') && !req.user.email_verified) {
    return res.status(403).json({ status: false, code: 'EMAIL_UNVERIFIED', message: 'Vui lòng xác minh email trong trang tài khoản' });
  }
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ status: false, message: 'Bạn không có quyền truy cập trang quản trị Admin' });
  if (config.REQUIRE_ADMIN_MFA && !req.user.mfa_enabled) return res.status(403).json({ status: false, code: 'MFA_ENROLLMENT_REQUIRED', message: 'Vui lòng bật MFA trong trang tài khoản trước khi quản trị' });
  return requireAuth(req, res, next);
}
module.exports = {
  hashPassword, generateToken, verifyToken, requireAuth, requireAdmin,
  createAuthService, createSession, isAppClientMetadata,
  SESSION_TTL, WEB_SESSION_TTL, APP_SESSION_TTL, BROWSER_COOKIE_MAX_AGE,
  ...createAuthService()
};
