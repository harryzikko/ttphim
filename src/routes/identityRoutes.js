const express = require('express');
const { createIdentityService, IdentityError } = require('../services/identityService');
const { cookieOptions, originGuard } = require('../services/requestSecurity');
const { rateLimit } = require('express-rate-limit');
const { sharedRateOptions } = require('../services/postgresRateLimitStore');

function createIdentityRouter({ service = createIdentityService() } = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return originGuard(req, res, next);
    next();
  });
  router.use(['/login', '/register', '/forgot-password', '/reset-password', '/verify-email', '/verification/request', '/mfa', '/sessions'], rateLimit({
    windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false,
    ...sharedRateOptions('identity'),
    skip: req => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
    message: { status: false, code: 'RATE_LIMITED', message: 'Quá nhiều yêu cầu. Vui lòng chờ rồi thử lại.' }
  }));
  const metadata = req => ({ ip: req.ip, headers: req.headers, sessionId: req.authSessionId });
  // Deliberately does not enforce verified-email policy: verification and recovery must remain accessible.
  const authenticated = (req, res, next) => req.user ? next() : res.status(401).json({ status: false, message: 'Vui lòng đăng nhập' });
  const handle = operation => async (req, res) => {
    try {
      const result = await operation(req, res);
      if (result?.token) {
        res.cookie('token', result.token, { ...cookieOptions, maxAge: Math.max(0, result.expiresAt - Date.now()) });
      }
      const { token, ...data } = result || {};
      if (token && req.get('x-client-type') === 'native' && !req.get('origin')) data.token = token;
      res.json({ status: true, message: data.message || 'Thành công', data });
    } catch (error) {
      const status = error instanceof IdentityError ? error.status : 503;
      const retryAfter = status === 429 && Number.isFinite(error.retryAfter) && error.retryAfter > 0 ? Math.ceil(error.retryAfter) : null;
      if (retryAfter) res.set('Retry-After', String(retryAfter));
      res.status(status).json({ status: false, code: error instanceof IdentityError ? error.code : 'SERVICE_UNAVAILABLE', message: error instanceof IdentityError ? error.message : 'Dịch vụ tạm thời không khả dụng. Vui lòng thử lại sau.', ...(retryAfter ? { retryAfter } : {}) });
    }
  };
  router.post('/register', handle(req => service.register(req.body || {}, metadata(req))));
  router.post('/login', handle(req => service.login(req.body || {}, metadata(req))));
  router.post('/forgot-password', handle(req => service.forgotPassword(req.body?.email, metadata(req))));
  router.post('/reset-password', handle(req => service.resetPassword(req.body?.token, req.body?.password, metadata(req))));
  router.post('/verify-email', handle(req => service.verifyEmail(req.body?.token, metadata(req))));
  router.post('/verification/request', authenticated, handle(req => service.requestVerification(req.user.id, metadata(req))));
  router.get('/sessions', authenticated, async (req, res, next) => {
    try { res.json({ status: true, data: await service.sessions(req.user.id, req.authSessionId) }); }
    catch (error) { next(error); }
  });
  router.delete('/sessions/:id', authenticated, handle(async (req, res) => {
    const result = await service.revokeSession(req.user.id, req.params.id);
    if (req.params.id === req.authSessionId) res.clearCookie('token', cookieOptions);
    return result;
  }));
  router.post('/sessions/revoke-others', authenticated, handle(req => service.revokeSession(req.user.id, null, true, req.authSessionId)));
  router.post('/mfa/setup', authenticated, handle(req => service.mfaSetup(req.user.id, req.body?.password, metadata(req))));
  router.post('/mfa/confirm', authenticated, handle(req => service.mfaConfirm(req.user.id, req.body?.code, metadata(req))));
  router.post('/mfa/disable', authenticated, handle(req => service.mfaDisable(req.user.id, req.body?.password, req.body?.code, metadata(req))));
  router.post('/logout', handle(async (req, res) => {
    if (req.user && req.authSessionId) await service.revokeSession(req.user.id, req.authSessionId);
    else if (req.user && !require('../config').IS_PRODUCTION) await require('../services/dbService').revokeUserSessions(req.user.id);
    res.clearCookie('token', cookieOptions);
    return { message: 'Đã đăng xuất' };
  }));
  return router;
}
module.exports = createIdentityRouter();
module.exports.createIdentityRouter = createIdentityRouter;
