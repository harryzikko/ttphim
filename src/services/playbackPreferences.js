const DEFAULTS = Object.freeze({ auto_next: true, playback_speed: 1, audio_language: '', subtitle_language: '' });
const SPEEDS = Object.freeze([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
const validLanguage = value => typeof value === 'string' && (value === '' || /^[a-z]{2,8}(?:-[a-z0-9]{1,8}){0,4}$/i.test(value)) && value.length <= 40;
function valid(key, value) {
  if (key === 'auto_next') return typeof value === 'boolean';
  if (key === 'playback_speed') return SPEEDS.includes(value);
  return (key === 'subtitle_language' && value === 'off') || validLanguage(value);
}
function normalize(value) {
  const result = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) if (valid(key, value?.[key])) result[key] = typeof value[key] === 'string' ? value[key].toLowerCase() : value[key];
  return result;
}
function validatePatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length || Object.keys(body).some(key => !Object.hasOwn(DEFAULTS, key) || !valid(key, body[key]))) {
    throw Object.assign(new Error('Tuy chon phat khong hop le.'), { statusCode: 400 });
  }
  return Object.fromEntries(Object.entries(body).map(([key,value]) => [key, typeof value === 'string' ? value.toLowerCase() : value]));
}
function createService(db = require('./dbService')) {
  const find = (data, userId) => {
    const user = data.users.find(row => row.id === userId);
    if (!user) throw Object.assign(new Error('Khong tim thay tai khoan.'), { statusCode: 404 });
    return user;
  };
  return {
    async get(userId) { return normalize(find(await db.read(), userId).playback_preferences); },
    async update(userId, body) {
      const patch = validatePatch(body);
      return db.mutate(data => {
        const user = find(data, userId);
        user.playback_preferences = { ...normalize(user.playback_preferences), ...patch };
        return { ...user.playback_preferences };
      });
    }
  };
}
module.exports = { DEFAULTS, SPEEDS, normalize, validatePatch, createService };
