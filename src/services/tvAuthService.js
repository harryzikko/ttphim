const crypto = require('crypto');
const { generateToken } = require('./authService');

// In-memory TV Login Sessions Map
// token -> { token, code, status: 'pending'|'approved'|'expired', createdAt, expiresAt, jwtToken, user }
const tvSessions = new Map();
const codeToTokenMap = new Map();

// Session TTL: 5 minutes (300 seconds)
const SESSION_TTL_MS = 5 * 60 * 1000;

// Periodic cleanup of expired sessions every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of tvSessions.entries()) {
    if (now > session.expiresAt) {
      codeToTokenMap.delete(session.code);
      tvSessions.delete(token);
    }
  }
}, 60000);

class TvAuthService {
  /**
   * Create a new TV login session with QR token and 6-character activation code
   */
  createSession(baseUrl = '') {
    const token = crypto.randomBytes(24).toString('hex');
    // Generate a clean 6-digit or 6-char alphanumeric code (e.g. 842913 or TV-9481)
    const randomDigits = Math.floor(100000 + Math.random() * 900000).toString();
    const code = randomDigits;

    const now = Date.now();
    const session = {
      token,
      code,
      status: 'pending',
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      jwtToken: null,
      user: null
    };

    tvSessions.set(token, session);
    codeToTokenMap.set(code, token);

    const qrUrl = `${baseUrl}/tv-auth?token=${token}`;

    return {
      token,
      code,
      qr_url: qrUrl,
      expires_in: Math.floor(SESSION_TTL_MS / 1000),
      expires_at: session.expiresAt
    };
  }

  /**
   * Check status of a TV session (called periodically by TV client)
   */
  getStatus(token) {
    if (!token || !tvSessions.has(token)) {
      return { status: 'expired', message: 'Phiên đăng nhập không tồn tại hoặc đã hết hạn' };
    }

    const session = tvSessions.get(token);
    if (Date.now() > session.expiresAt) {
      codeToTokenMap.delete(session.code);
      tvSessions.delete(token);
      return { status: 'expired', message: 'Mã QR đã hết hạn. Vui lòng bấm làm mới.' };
    }

    if (session.status === 'approved') {
      return {
        status: 'approved',
        token: session.jwtToken,
        user: session.user
      };
    }

    return {
      status: 'pending',
      expires_in: Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000))
    };
  }

  /**
   * Authorize a TV session by mobile app or website user
   * identifier can be either session token or 6-digit code
   */
  authorize(identifier, user) {
    if (!identifier || !user) {
      return { success: false, message: 'Dữ liệu xác thực không hợp lệ' };
    }

    const cleanId = identifier.toString().trim();
    let token = cleanId;

    if (codeToTokenMap.has(cleanId)) {
      token = codeToTokenMap.get(cleanId);
    }

    if (!tvSessions.has(token)) {
      return { success: false, message: 'Mã đăng nhập TV không đúng hoặc đã hết hạn' };
    }

    const session = tvSessions.get(token);
    if (Date.now() > session.expiresAt) {
      codeToTokenMap.delete(session.code);
      tvSessions.delete(token);
      return { success: false, message: 'Mã đăng nhập TV đã hết hạn. Vui lòng lấy mã mới trên TV.' };
    }

    // Generate JWT token for this user
    const jwtToken = generateToken(user);

    session.status = 'approved';
    session.jwtToken = jwtToken;
    session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || 'user',
      avatar: user.avatar || ''
    };

    return {
      success: true,
      message: 'Xác thực đăng nhập Android TV thành công!',
      code: session.code
    };
  }
}

module.exports = new TvAuthService();
