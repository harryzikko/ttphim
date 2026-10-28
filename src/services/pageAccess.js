const path = require('node:path');
const { authMiddleware, requireAdmin } = require('./authService');
const accountPages = new Set(['/tai-khoan', '/danh-sach', '/tu-phim', '/danh-sach-cua-toi', '/mobile/tai-khoan', '/mobile/danh-sach']);
module.exports = function pageAccess(req, res, next) {
  let pathname;
  try { pathname = path.posix.normalize(decodeURIComponent(req.path).replace(/\\/g, '/')).toLowerCase().replace(/\/$/, '').replace(/\.html$/, ''); }
  catch (_) { return next(); }
  const admin = pathname === '/admin' || pathname === '/quan-tri' || pathname === '/operations';
  if (!accountPages.has(pathname) && !admin) return next();
  res.set('Cache-Control', 'private, no-store');
  res.vary('Cookie'); res.vary('Authorization');
  return authMiddleware(req, res, error => {
    if (error) return next(error);
    if (!req.user) {
      const destination = /^\/(?!\/)/.test(req.originalUrl) ? req.originalUrl : '/';
      return res.redirect('/auth?redirect=' + encodeURIComponent(destination));
    }
    if (admin) return requireAdmin(req, res, next);
    return next();
  });
};
