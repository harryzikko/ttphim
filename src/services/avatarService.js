const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { avatars } = require('./defaultAvatars');
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PIXELS = 20 * 1024 * 1024;
const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const managedName = value => /^\/media\/avatars\/([a-f0-9]{32}\.webp)$/.exec(String(value || ''))?.[1];
function createAvatarService({ db, directory }) {
  let active = 0;
  const discard = async url => {
    const name = managedName(url);
    if (name) await fs.unlink(path.join(directory, name)).catch(() => {});
  };
  async function commit(userId, avatar) {
    let old;
    const user = await db.mutate(data => {
      const user = data.users.find(item => item.id === userId && !item.blocked);
      if (!user) throw bad('Phiên đăng nhập không còn hợp lệ', 401);
      old = user.avatar;
      user.avatar = avatar;
      user.avatar_updated_at = new Date().toISOString();
      return { ...user };
    });
    if (old !== avatar) await discard(old);
    return user;
  }
  async function upload(userId, buffer, crop = null) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw bad('Chưa nhận được ảnh');
    if (buffer.length > MAX_BYTES) throw bad('Ảnh không được vượt quá 5 MB', 413);
    if (active >= 3) throw bad('Máy chủ đang xử lý ảnh. Vui lòng thử lại.', 503);
    active++;
    let avatar;
    try {
      let output;
      try {
        const input = sharp(buffer, { limitInputPixels: MAX_PIXELS, animated: true, failOn: 'error' });
        const metadata = await input.metadata();
        if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1) throw Error('Unsupported image');
        if (!metadata.width || !metadata.height || metadata.width < 32 || metadata.height < 32 || metadata.width * metadata.height > MAX_PIXELS) throw Error('Invalid dimensions');
        let pipeline = input.rotate();
        if (crop != null) {
          if (typeof crop !== 'object' || Array.isArray(crop) || Object.keys(crop).sort().join(',') !== 'height,left,top,width' || !['left','top','width','height'].every(key => Number.isFinite(crop[key]) && crop[key] >= 0 && crop[key] <= 1) || crop.width <= 0 || crop.height <= 0 || crop.left + crop.width > 1.000001 || crop.top + crop.height > 1.000001) throw Error('Invalid crop');
          const swap = [5,6,7,8].includes(metadata.orientation);
          const width = swap ? metadata.height : metadata.width, height = swap ? metadata.width : metadata.height;
          const side = Math.min(Math.round(crop.width * width), Math.round(crop.height * height));
          if (side < 16 || Math.abs(crop.width * width - crop.height * height) > 2) throw Error('Crop must be square');
          const left = Math.min(width - side, Math.round(crop.left * width)), top = Math.min(height - side, Math.round(crop.top * height));
          pipeline = pipeline.extract({ left, top, width:side, height:side });
        }
        output = await pipeline.resize(512, 512, { fit: 'cover', position: 'centre' }).webp({ quality: 86 }).toBuffer();
      } catch (_) { throw bad('Ảnh không hợp lệ. Hãy chọn JPG, PNG hoặc WebP tĩnh, tối đa 20 megapixel.'); }
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const name = crypto.randomBytes(16).toString('hex') + '.webp';
      avatar = '/media/avatars/' + name;
      try {
        await fs.writeFile(path.join(directory, name), output, { mode: 0o600, flag: 'wx' });
        return await commit(userId, avatar);
      } catch (error) { if (error.code !== 'EEXIST') await discard(avatar); throw error; }
    } finally { active--; }
  }
  async function choose(userId, avatar) {
    if (!avatars.includes(avatar)) throw bad('Avatar mặc định không hợp lệ');
    return commit(userId, avatar);
  }
  return { upload, choose, managedName };
}
module.exports = { createAvatarService, MAX_BYTES, MAX_PIXELS, managedName };
