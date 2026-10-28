const avatars = ['/images/avatars/vietnam-boy-v1.webp', '/images/avatars/vietnam-girl-v1.webp'];
function avatarForGender(gender) { return avatars[gender === 'female' ? 1 : 0]; }
function validGender(gender) { return gender == null || gender === 'male' || gender === 'female'; }
function avatarFor(user) {
  const avatar = typeof user?.avatar === 'string' ? user.avatar.trim() : '';
  if (avatar) {
    const legacy = /^\/images\/avatars\/chibi-(lan|minh|an|mai)-v[12]\.svg$/.exec(avatar);
    if (!legacy) return avatar;
    return avatarForGender(user.gender || (['lan', 'mai'].includes(legacy[1]) ? 'female' : 'male'));
  }
  return avatarForGender(user?.gender);
}
module.exports = { avatars, avatarForGender, validGender, avatarFor };
