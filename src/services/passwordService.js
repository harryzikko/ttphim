const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
const passwordValid = value => typeof value === 'string' && value.length >= 6 && value.length <= 256;

function isPasswordHash(value) {
  return typeof value === 'string' && value.startsWith('scrypt$');
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  if (!isPasswordHash(stored)) {
    // Existing plaintext accounts are upgraded after a successful login.
    const actual = Buffer.from(password);
    const expected = Buffer.from(stored);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }
  const parts = stored.split('$');
  if (parts.length !== 3 || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{128}$/.test(parts[2])) return false;
  const actual = await scrypt(password, parts[1], 64);
  return crypto.timingSafeEqual(actual, Buffer.from(parts[2], 'hex'));
}

function publicUser(user) {
  if (!user) return null;
  const safe = {};
  for (const key of ['id', 'email', 'name', 'gender', 'avatar', 'role', 'created_at', 'is_vip', 'vip_tier', 'vip_level', 'vip_expire_date', 'days_left', 'max_devices', 'email_verified', 'email_verified_at']) {
    if (user[key] !== undefined) safe[key] = user[key];
  }
  safe.avatar = require('./defaultAvatars').avatarFor(user);
  safe.email_verified = Boolean(user.email_verified_at || user.email_verified);
  safe.mfa_enabled = Boolean(user.mfa?.enabled);
  return safe;
}

module.exports = { hashPassword, verifyPassword, isPasswordHash, passwordValid, publicUser };
