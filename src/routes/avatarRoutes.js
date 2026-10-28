const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { sharedRateOptions } = require('../services/postgresRateLimitStore');
const { publicUser } = require('../services/passwordService');
const { avatars } = require('../services/defaultAvatars');
const { MAX_BYTES } = require('../services/avatarService');
function createAvatarRouter(service) {
  const router = express.Router();
  const limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false,
    ...sharedRateOptions('avatar-upload'), message: { status:false,message:'Bạn đổi ảnh quá nhanh. Vui lòng thử lại sau.' } });
  router.get('/user/avatar/options', (req, res) => res.json({ status:true,data:avatars }));
  const respond = action => async (req, res) => {
    try { res.json({ status:true,data:publicUser(await action(req)) }); }
    catch (error) { res.status([400,401,413,503].includes(error.status) ? error.status : 500).json({ status:false,message:error.status ? error.message : 'Không thể lưu avatar. Ảnh cũ được giữ nguyên.' }); }
  };
  router.post('/user/avatar', limit, (req,res,next) => {
    if (!['image/jpeg','image/png','image/webp'].includes(req.get('content-type')?.split(';')[0])) return res.status(415).json({status:false,message:'Chỉ nhận ảnh JPG, PNG hoặc WebP.'});
    next();
  }, express.raw({type:['image/jpeg','image/png','image/webp'],limit:MAX_BYTES}), respond(req => {
    let crop = null;
    if (req.query.crop != null) {
      try { if (typeof req.query.crop !== 'string' || req.query.crop.length > 300) throw Error(); crop = JSON.parse(req.query.crop); }
      catch (_) { throw Object.assign(new Error('Vùng cắt ảnh không hợp lệ'), {status:400}); }
    }
    return service.upload(req.user.id,req.body,crop);
  }));
  router.post('/user/avatar/default', limit, respond(req => service.choose(req.user.id,req.body?.avatar)));
  router.use((error,req,res,next) => {
    if (error.type === 'entity.too.large') return res.status(413).json({status:false,message:'Ảnh không được vượt quá 5 MB'});
    next(error);
  });
  return router;
}
module.exports = { createAvatarRouter };
