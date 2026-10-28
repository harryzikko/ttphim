const express = require('express');
const followService = require('../services/followService');

function createFollowRouter({ service = followService } = {}) {
  const router = express.Router();
  const handle = operation => async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (!req.user?.id) return res.status(401).json({ status: false, message: 'Vui lòng đăng nhập để theo dõi phim' });
    try { return res.json({ status: true, data: await operation(req) }); }
    catch (error) {
      const code = [400, 401, 404, 409, 502].includes(error.statusCode) ? error.statusCode : 500;
      const messages = { 400: 'Thông tin theo dõi phim không hợp lệ', 401: 'Vui lòng đăng nhập lại', 404: 'Không tìm thấy thông báo trong tài khoản này', 409: 'Bạn đã theo dõi tối đa 100 phim', 502: 'Chưa thể kiểm tra tập phim từ nguồn. Vui lòng thử lại sau.', 500: 'Không thể cập nhật theo dõi phim. Vui lòng thử lại.' };
      return res.status(code).json({ status: false, message: messages[code] });
    }
  };
  router.get('/user/follows', handle(req => service.listFollows(req.user.id)));
  router.post('/user/follows/:slug', handle(req => service.follow(req.user.id, req.params.slug)));
  router.delete('/user/follows/:slug', handle(req => service.unfollow(req.user.id, req.params.slug)));
  router.get('/user/follow-notifications', handle(async req => {
    await service.checkUpdates(req.user.id);
    return service.getNotifications(req.user.id);
  }));
  router.post('/user/follow-notifications/:id/read', handle(req => service.markNotificationRead(req.user.id, req.params.id)));
  return router;
}

const router = createFollowRouter();
module.exports = router;
module.exports.router = router;
module.exports.createFollowRouter = createFollowRouter;
