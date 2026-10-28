const crypto = require('crypto');
const config = require('../config');
const dbService = require('./dbService');
const { hashPassword, verifyPassword, isPasswordHash, passwordValid } = require('./passwordService');
const { createSession } = require('./authService');
const { createMailService } = require('./mailService');
const sessionEvents = require('./sessionEvents');

const MINUTE = 60000;
const TTL = { reset: 30 * MINUTE, verify: 24 * 60 * MINUTE, challenge: 5 * MINUTE, enrollment: 5 * MINUTE };
const FORGOT_MESSAGE = 'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu sẽ được gửi. Vui lòng kiểm tra hộp thư.';
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');
class IdentityError extends Error {
  constructor(message, status = 400, code = 'IDENTITY_ERROR', retryAfter = null) { super(message); this.status = status; this.code = code; this.retryAfter = retryAfter; }
}
const failure = (message, status = 400, code, retryAfter) => ({ error: { message, status, code: code || (status === 429 ? 'RATE_LIMITED' : 'IDENTITY_ERROR'), retryAfter } });
const invalidCode = () => failure('Mã không hợp lệ hoặc đã hết hạn', 400, 'INVALID_CODE');
function normalizeEmail(email) {
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new IdentityError('Email không hợp lệ');
  return email.trim().toLowerCase();
}

function createIdentityService({ db = dbService, mail = createMailService(), now = Date.now, secret = process.env.MFA_ENCRYPTION_KEY || config.JWT_SECRET, totpLibrary } = {}) {
  const key = crypto.createHash('sha256').update(secret).digest();
  const deliveries = new Set();
  const otp = () => totpLibrary || require('otpauth');
  function encrypt(value) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    return `${iv.toString('hex')}.${Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]).toString('hex')}.${cipher.getAuthTag().toString('hex')}`;
  }
  function decrypt(value) {
    const [iv, text, tag] = value.split('.');
    const cipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
    cipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([cipher.update(Buffer.from(text, 'hex')), cipher.final()]).toString('utf8');
  }
  const makeTotp = (secretValue, email) => new (otp().TOTP)({ issuer: 'CineViet', label: email, algorithm: 'SHA1', digits: 6, period: 30, secret: otp().Secret.fromBase32(secretValue) });
  function cleanup(data) {
    data.identity_tokens = (data.identity_tokens || []).filter(t => t.expires_at > now());
    data.identity_challenges = (data.identity_challenges || []).filter(t => t.expires_at > now());
    data.identity_sessions = (data.identity_sessions || []).filter(t => t.expires_at > now());
    data.identity_limits = (data.identity_limits || []).filter(t => t.expires_at > now());
    for (const user of data.users) if (user.mfa_pending?.expires_at <= now()) delete user.mfa_pending;
  }
  function rate(data, scope, value, limit = 5, duration = 15 * MINUTE) {
    const id = sha(`${scope}:${value}`);
    let record = data.identity_limits.find(t => t.id === id);
    if (!record) {
      if (data.identity_limits.length >= 10000) return false;
      record = { id, count: 0, expires_at: now() + duration };
      data.identity_limits.push(record);
    }
    record.count++;
    return record.count <= limit;
  }
  function loginRateFailure(data, email, ip) {
    const blocked = [['login-ip', ip, 30], ['login-email', email, 10]].map(([scope, value, limit]) => {
      const record = data.identity_limits.find(item => item.id === sha(`${scope}:${value}`));
      return record && record.count > limit ? record.expires_at : 0;
    });
    const retryAfter = Math.max(1, Math.ceil((Math.max(...blocked) - now()) / 1000));
    return failure('Bạn đã thử đăng nhập quá nhiều lần. Vui lòng chờ rồi thử lại.', 429, 'RATE_LIMITED', retryAfter);
  }
  async function mutate(operation) {
    const { result, revoked } = await db.mutate(async data => {
      cleanup(data);
      const versions = new Map(data.users.map(user => [user.id, user.token_version || 0]));
      const sessions = [...data.identity_sessions];
      const result = await operation(data);
      const changed = data.users.filter(user => versions.get(user.id) !== undefined && versions.get(user.id) !== (user.token_version || 0)).map(user => user.id);
      const active = new Set(data.identity_sessions.map(session => session.id));
      return { result, revoked: [...new Set([...changed, ...sessions.filter(session => !active.has(session.id)).map(session => session.user_id)])] };
    });
    // Existing SSE consumers subscribe per user, so close streams conservatively on device revocation.
    for (const userId of revoked) sessionEvents.emit('revoked', userId);
    if (result?.error) throw new IdentityError(result.error.message, result.error.status, result.error.code, result.error.retryAfter);
    return result;
  }
  function userFor(data, userId) { return data.users.find(u => u.id === userId); }
  function revokeAll(data, user) {
    user.token_version = (user.token_version || 0) + 1;
    user.session_policy = 'tracked';
    data.identity_sessions = data.identity_sessions.filter(s => s.user_id !== user.id);
    data.identity_challenges = data.identity_challenges.filter(c => c.user_id !== user.id);
  }
  function newMailToken(data, user, purpose) {
    const token = crypto.randomBytes(32).toString('hex');
    data.identity_tokens = data.identity_tokens.filter(t => !(t.user_id === user.id && t.purpose === purpose));
    data.identity_tokens.push({ hash: sha(token), user_id: user.id, email: user.email, version: user.token_version || 0, purpose, expires_at: now() + TTL[purpose] });
    return { token, email: user.email, purpose };
  }
  async function deliver(message) {
    try { await mail.sendIdentityMail(message); }
    catch (_) {
      await mutate(data => { data.identity_tokens = data.identity_tokens.filter(t => t.hash !== sha(message.token)); return true; });
      throw new IdentityError('Không thể gửi email lúc này. Vui lòng thử lại sau.', 503, 'MAIL_UNAVAILABLE');
    }
  }
  function checkOtp(user, code, recovery = true) {
    if (typeof code !== 'string' || code.length > 64 || !user.mfa?.enabled) return false;
    if (/^\d{6}$/.test(code)) {
      const delta = makeTotp(decrypt(user.mfa.secret), user.email).validate({ token: code, timestamp: now(), window: 1 });
      const counter = Math.floor(now() / 30000) + delta;
      if (delta !== null && counter > (user.mfa.last_counter ?? -1)) { user.mfa.last_counter = counter; return true; }
    }
    if (recovery) {
      const hash = sha(code.trim().toUpperCase());
      const index = (user.mfa.recovery_hashes || []).indexOf(hash);
      if (index >= 0) { user.mfa.recovery_hashes.splice(index, 1); return true; }
    }
    return false;
  }
  async function register({ email, password, name, gender }, metadata = {}) {
    email = normalizeEmail(email);
    if (!passwordValid(password) || (name != null && (typeof name !== 'string' || name.length > 100))) throw new IdentityError('Mật khẩu cần 6–256 ký tự và tên tối đa 100 ký tự');
    if (!require('./defaultAvatars').validGender(gender)) throw new IdentityError('Giới tính không hợp lệ. Vui lòng chọn Nam hoặc Nữ.');
    mail.assertReady();
    const result = await mutate(async data => {
      if (!rate(data, 'register-ip', metadata.ip, 10, 60 * MINUTE)) return failure('Quá nhiều yêu cầu. Vui lòng thử lại sau.', 429);
      if (data.users.some(u => u.email.toLowerCase() === email)) return failure('Email này đã được sử dụng', 409);
      const user = { id: `usr_${crypto.randomUUID()}`, email, name: name?.trim() || email.split('@')[0], password: await hashPassword(password), role: 'user', created_at: new Date(now()).toISOString(), email_verified: false, token_version: 0 };
      if (gender != null) user.gender = gender;
      user.avatar = require('./defaultAvatars').avatarForGender(gender);
      data.users.push(user);
      return { userId: user.id, message: newMailToken(data, user, 'verify') };
    });
    let verificationPending = false;
    try { await deliver(result.message); }
    catch (error) {
      if (error.code !== 'MAIL_UNAVAILABLE') throw error;
      verificationPending = true;
    }
    return mutate(data => {
      const user = userFor(data, result.userId);
      if (!user || (user.token_version || 0) !== 0 || user.mfa?.enabled) return failure('Tài khoản đã thay đổi. Vui lòng đăng nhập lại.', 401);
      return { ...createSession(data, user, metadata, now()), verificationPending,
        ...(verificationPending && { message: 'Tài khoản đã tạo. Chưa gửi được email xác minh; hãy gửi lại trong phần tài khoản.' }) };
    });
  }
  async function forgotPassword(email, metadata = {}) {
    email = normalizeEmail(email);
    mail.assertReady();
    const message = await mutate(data => {
      if (!rate(data, 'forgot-ip', metadata.ip, 20)) return failure('Quá nhiều yêu cầu. Vui lòng thử lại sau.', 429);
      const allowed = rate(data, 'forgot-email', email, 3);
      const user = data.users.find(u => u.email.toLowerCase() === email);
      return allowed && user && deliveries.size < 100 ? newMailToken(data, user, 'reset') : null;
    });
    if (message) {
      // Never wait for recipient-specific SMTP latency in a public enumeration-sensitive response.
      const work = deliver(message).catch(() => {}).finally(() => deliveries.delete(work));
      deliveries.add(work);
    }
    return { message: FORGOT_MESSAGE };
  }
  async function requestVerification(userId, metadata = {}) {
    mail.assertReady();
    const message = await mutate(data => {
      if (!rate(data, 'verify-user', userId, 3) || !rate(data, 'verify-ip', metadata.ip, 20)) return failure('Quá nhiều yêu cầu. Vui lòng thử lại sau.', 429);
      const user = userFor(data, userId);
      if (!user) return failure('Vui lòng đăng nhập', 401);
      return user.email_verified_at || user.email_verified ? null : newMailToken(data, user, 'verify');
    });
    if (message) await deliver(message);
    return { message: message ? 'Đã gửi email xác minh. Vui lòng kiểm tra hộp thư.' : 'Email đã được xác minh.' };
  }
  async function consumeToken(purpose, token, password, metadata = {}) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new IdentityError('Mã không hợp lệ hoặc đã hết hạn');
    if (purpose === 'reset' && !passwordValid(password)) throw new IdentityError('Mật khẩu cần 6–256 ký tự');
    return mutate(async data => {
      if (!rate(data, `${purpose}-confirm-ip`, metadata.ip, 20)) return failure('Quá nhiều yêu cầu. Vui lòng thử lại sau.', 429);
      const record = data.identity_tokens.find(t => t.hash === sha(token) && t.purpose === purpose);
      const user = record && userFor(data, record.user_id);
      if (!user || user.blocked || record.email !== user.email || record.version !== (user.token_version || 0)) return invalidCode();
      data.identity_tokens = data.identity_tokens.filter(t => t !== record);
      if (purpose === 'reset') {
        user.password = await hashPassword(password);
        delete user.mfa_pending;
        revokeAll(data, user);
        data.identity_tokens = data.identity_tokens.filter(t => t.user_id !== user.id || t.purpose !== 'reset');
      } else { user.email_verified = true; user.email_verified_at = new Date(now()).toISOString(); }
      return { message: purpose === 'reset' ? 'Đã đặt lại mật khẩu. Vui lòng đăng nhập.' : 'Email đã được xác minh.' };
    });
  }
  async function login({ email, password, challengeId, code }, metadata = {}) {
    if (challengeId !== undefined) {
      if (typeof challengeId !== 'string' || !/^[a-f0-9]{64}$/.test(challengeId)) throw new IdentityError('Phiên xác minh không hợp lệ', 401);
      return mutate(data => {
        if (!rate(data, 'mfa-login-ip', metadata.ip, 30)) return failure('Quá nhiều yêu cầu. Vui lòng thử lại sau.', 429);
        const challenge = data.identity_challenges.find(c => c.hash === sha(challengeId));
        const user = challenge && userFor(data, challenge.user_id);
        if (!user || user.blocked || challenge.version !== (user.token_version || 0) || challenge.attempts >= 5) return failure('Phiên xác minh hết hạn. Vui lòng đăng nhập lại.', 401);
        challenge.attempts++;
        if (!rate(data, 'mfa-check-user', user.id, 10) || !checkOtp(user, code)) return failure('Mã xác minh không chính xác hoặc đã sử dụng', 401);
        data.identity_challenges = data.identity_challenges.filter(c => c.user_id !== user.id);
        return createSession(data, user, metadata, now());
      });
    }
    email = normalizeEmail(email);
    if (typeof password !== 'string' || !password || password.length > 256) throw new IdentityError('Thông tin đăng nhập không hợp lệ', 400);
    return mutate(async data => {
      if (!rate(data, 'login-ip', metadata.ip, 30) || !rate(data, 'login-email', email, 10)) return loginRateFailure(data, email, metadata.ip);
      const user = data.users.find(u => u.email.toLowerCase() === email);
      // A dummy scrypt operation keeps unknown-account authentication on the same expensive path.
      const stored = user?.password || `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;
      if (!await verifyPassword(password, stored) || !user || user.blocked) return failure('Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.', 401);
      if (!isPasswordHash(user.password)) user.password = await hashPassword(password);
      if (user.mfa?.enabled) {
        const challengeId = crypto.randomBytes(32).toString('hex');
        data.identity_challenges = data.identity_challenges.filter(c => c.user_id !== user.id);
        data.identity_challenges.push({ hash: sha(challengeId), user_id: user.id, version: user.token_version || 0, attempts: 0, expires_at: now() + TTL.challenge });
        return { mfaRequired: true, challengeId, expiresAt: now() + TTL.challenge };
      }
      return createSession(data, user, metadata, now());
    });
  }
  async function mfaSetup(userId, password, metadata = {}) {
    if ((config.IS_PRODUCTION || !process.env.NODE_TEST_CONTEXT) && !/^[a-f0-9]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY || '')) throw new IdentityError('Configure a persistent MFA_ENCRYPTION_KEY before enabling MFA', 503);
    return mutate(async data => {
      if (!rate(data, 'mfa-manage', userId, 10)) return failure('Quá nhiều yêu cầu. Vui lòng thử lại sau.', 429);
      const user = userFor(data, userId);
      if (!user || typeof password !== 'string' || password.length > 256 || !await verifyPassword(password, user.password)) return failure('Mật khẩu không chính xác', 401);
      if (user.mfa?.enabled) return failure('Xác thực hai bước đã được bật');
      const secretValue = new (otp().Secret)({ size: 20 }).base32;
      user.mfa_pending = { secret: encrypt(secretValue), expires_at: now() + TTL.enrollment, version: user.token_version || 0, session_id: metadata.sessionId };
      return { secret: secretValue, otpauthUrl: makeTotp(secretValue, user.email).toString(), expiresAt: user.mfa_pending.expires_at };
    });
  }
  async function mfaConfirm(userId, code, metadata = {}) {
    return mutate(data => {
      if (!rate(data, 'mfa-manage', userId, 10)) return failure('Quá nhiều yêu cầu. Vui lòng thử lại sau.', 429);
      const user = userFor(data, userId), pending = user?.mfa_pending;
      if (!pending || pending.expires_at <= now() || pending.version !== (user.token_version || 0) || pending.session_id !== metadata.sessionId || user.mfa?.enabled || typeof code !== 'string' || !/^\d{6}$/.test(code)) return invalidCode();
      const delta = makeTotp(decrypt(pending.secret), user.email).validate({ token: code, timestamp: now(), window: 1 });
      if (delta === null) return invalidCode();
      const recoveryCodes = Array.from({ length: 10 }, () => crypto.randomBytes(10).toString('hex').toUpperCase());
      user.mfa = { enabled: true, secret: pending.secret, last_counter: Math.floor(now() / 30000) + delta, recovery_hashes: recoveryCodes.map(sha) };
      delete user.mfa_pending;
      revokeAll(data, user);
      return { ...createSession(data, user, metadata, now()), recoveryCodes };
    });
  }
  async function mfaDisable(userId, password, code, metadata = {}) {
    return mutate(async data => {
      if (!rate(data, 'mfa-manage', userId, 10)) return failure('Quá nhiều yêu cầu. Vui lòng thử lại sau.', 429);
      const user = userFor(data, userId);
      if (!user || typeof password !== 'string' || password.length > 256 || !await verifyPassword(password, user.password) || !checkOtp(user, code)) return failure('Mật khẩu hoặc mã xác minh không chính xác', 401);
      delete user.mfa;
      delete user.mfa_pending;
      revokeAll(data, user);
      return createSession(data, user, metadata, now());
    });
  }
  async function sessions(userId, currentId) {
    return mutate(data => data.identity_sessions.filter(s => s.user_id === userId && s.version === (userFor(data, userId)?.token_version || 0)).map(s => ({ id: s.id, device: s.device, ip: s.ip, created_at: s.created_at, expires_at: s.expires_at, current: s.id === currentId })));
  }
  async function revokeSession(userId, id, others = false, currentId) {
    return mutate(data => {
      data.identity_sessions = data.identity_sessions.filter(s => s.user_id !== userId || (others ? s.id === currentId : s.id !== id));
      return { message: 'Đã thu hồi phiên đăng nhập' };
    });
  }
  return {
    register, login, forgotPassword, requestVerification,
    drainMail: () => Promise.all([...deliveries]),
    resetPassword: (token, password, metadata) => consumeToken('reset', token, password, metadata),
    verifyEmail: (token, metadata) => consumeToken('verify', token, undefined, metadata),
    mfaSetup, mfaConfirm, mfaDisable, sessions, revokeSession
  };
}
module.exports = { createIdentityService, IdentityError, TTL, FORGOT_MESSAGE };
