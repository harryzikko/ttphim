const express = require('express');
function createPlaybackRouter({ service = require('../services/playbackPreferences').createService() } = {}) {
  const router = express.Router();
  router.use('/user/playback-preferences', (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    if (!req.user?.id) return res.status(401).json({ status: false, message: 'Vui long dang nhap.' });
    next();
  });
  const handle = method => async (req, res) => {
    try { res.json({ status: true, data: await service[method](req.user.id, req.body) }); }
    catch (error) { res.status(error.statusCode || 500).json({ status: false, message: error.statusCode ? error.message : 'Khong the luu tuy chon phat. Vui long thu lai.' }); }
  };
  router.get('/user/playback-preferences', handle('get'));
  router.patch('/user/playback-preferences', handle('update'));
  return router;
}
module.exports = createPlaybackRouter();
module.exports.createPlaybackRouter = createPlaybackRouter;
