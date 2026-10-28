const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { requireAuth, requireAdmin } = require('../services/authService');
const metrics = require('../services/metricsService');
const moderation = require('../services/moderationService');
const backups = require('../services/backupService');
const db = require('../services/dbService');
const { sharedRateOptions } = require('../services/postgresRateLimitStore');
const router = express.Router();
const telemetryLimit = rateLimit({ windowMs: 60000, limit: 60, standardHeaders: true, legacyHeaders: false, ...sharedRateOptions('telemetry') });
const reportLimit = rateLimit({ windowMs: 3600000, limit: 20, standardHeaders: true, legacyHeaders: false, ...sharedRateOptions('comment-reports') });
const asyncRoute = work => (req, res, next) => Promise.resolve(work(req, res)).catch(next);

router.post('/playback/events', telemetryLimit, asyncRoute(async (req, res) => {
  const events = req.body?.events;
  if (!Array.isArray(events) || !events.length || events.length > 7 || Object.keys(req.body).length !== 1) {
    return res.status(400).json({ status: false, message: 'Expected 1-7 playback events' });
  }
  events.forEach(metrics.validatePlayback);
  events.forEach(metrics.recordPlayback);
  res.status(202).json({ status: true });
}));
router.post('/comments/:id/report', requireAuth, reportLimit, asyncRoute(async (req, res) => {
  const data = await moderation.reportComment(req.user, req.params.id, req.body.reason);
  res.json({ status: true, data });
}));
router.get('/admin/operations', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json({ status: true, data: await metrics.summary() });
}));
router.get('/admin/moderation', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json({ status: true, data: await moderation.overview() });
}));
router.post('/admin/moderation/comments/:id', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  res.json({ status: true, data: await moderation.setVisibility(req.user, req.params.id, req.body.hidden, req.body.reason) });
}));
router.post('/admin/moderation/users/:id', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  res.json({ status: true, data: await moderation.setBlocked(req.user, req.params.id, req.body.blocked, req.body.reason) });
}));
router.post('/admin/operations/backup', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const data = await backups.run();
  res.json({ status: true, data });
}));
router.post('/admin/operations/sources/check', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  res.json({ status: true, data: await require('../services/sourceMonitorService').check() });
}));

async function adminAudit(req, res, next) {
  if (!req.user || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const target = (req.baseUrl + req.path).slice(0, 200);
  const requestId = req.id || require('crypto').randomUUID();
  try {
    await db.mutate(data => moderation.audit(data, req.user.id, 'admin.request', target, { request_id: requestId, method: req.method, phase: 'started' }));
    res.once('finish', () => {
      db.mutate(data => moderation.audit(data, req.user.id, 'admin.result', target, { request_id: requestId, status: res.statusCode, phase: 'finished' }))
        .catch(() => console.error('Admin audit result persistence failed'));
    });
    next();
  } catch (error) { next(error); }
}
module.exports = { router, adminAudit };
