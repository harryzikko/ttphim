const express = require('express');
const config = require('../config');

const SAFE_QUEUE_ID = /^[a-zA-Z0-9_-]{4,80}$/;

function createSocialAdminRouter({
  baseUrl = () => config.SOCIAL_BOT_URL,
  botToken = () => config.SOCIAL_BOT_TOKEN,
  fetcher = globalThis.fetch
} = {}) {
  const router = express.Router();

  async function forward(req, res, { method = 'GET', targetPath, body }) {
    const root = String(typeof baseUrl === 'function' ? baseUrl() : baseUrl || '').replace(/\/+$/, '');
    if (!root) {
      return res.status(503).json({ status: false, code: 'SOCIAL_BOT_DISABLED', message: 'Chưa cấu hình SOCIAL_BOT_URL' });
    }

    const token = String(typeof botToken === 'function' ? botToken() : botToken || '').trim();
    const url = `${root}${targetPath}`;

    try {
      const upstream = await fetcher(url, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(25000)
      });

      const raw = await upstream.text();
      let payload = null;
      try {
        payload = raw ? JSON.parse(raw) : { status: upstream.ok };
      } catch (_) {
        payload = { status: false, message: 'Phản hồi từ CineViet Social Bot không hợp lệ' };
      }

      return res.status(upstream.status).json(payload);
    } catch (err) {
      return res.status(503).json({
        status: false,
        code: 'SOCIAL_BOT_OFFLINE',
        message: 'Không thể kết nối tới dịch vụ CineViet Social Bot (cổng nội bộ 4100).'
      });
    }
  }

  function validId(req, res) {
    const id = String(req.params.id || '').trim();
    if (!SAFE_QUEUE_ID.test(id)) {
      res.status(400).json({ status: false, message: 'Mã bài viết không hợp lệ' });
      return null;
    }
    return id;
  }

  router.get('/admin/social/dashboard', (req, res) => {
    return forward(req, res, { method: 'GET', targetPath: '/api/dashboard' });
  });

  router.post('/admin/social/settings', (req, res) => {
    return forward(req, res, { method: 'POST', targetPath: '/api/settings', body: req.body || {} });
  });

  router.post('/admin/social/integrations', (req, res) => {
    return forward(req, res, { method: 'POST', targetPath: '/api/integrations', body: req.body || {} });
  });

  router.post('/admin/social/integrations/verify', (req, res) => {
    return forward(req, res, { method: 'POST', targetPath: '/api/integrations/verify', body: req.body || {} });
  });

  router.post('/admin/social/integrations/telegram-test', (req, res) => {
    return forward(req, res, { method: 'POST', targetPath: '/api/integrations/telegram-test', body: req.body || {} });
  });

  router.post('/admin/social/jobs/fill-queue', (req, res) => {
    return forward(req, res, { method: 'POST', targetPath: '/api/jobs/fill-queue', body: req.body || {} });
  });

  router.post('/admin/social/jobs/tick', (req, res) => {
    return forward(req, res, { method: 'POST', targetPath: '/api/jobs/tick', body: req.body || {} });
  });

  router.patch('/admin/social/queue/:id', (req, res) => {
    const id = validId(req, res);
    if (!id) return;
    return forward(req, res, { method: 'PATCH', targetPath: `/api/queue/${encodeURIComponent(id)}`, body: req.body || {} });
  });

  router.post('/admin/social/queue/:id/publish', (req, res) => {
    const id = validId(req, res);
    if (!id) return;
    return forward(req, res, { method: 'POST', targetPath: `/api/queue/${encodeURIComponent(id)}/publish`, body: req.body || {} });
  });

  router.delete('/admin/social/queue/:id', (req, res) => {
    const id = validId(req, res);
    if (!id) return;
    return forward(req, res, { method: 'DELETE', targetPath: `/api/queue/${encodeURIComponent(id)}` });
  });

  return router;
}

module.exports = { createSocialAdminRouter };
