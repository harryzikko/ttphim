const crypto = require('crypto');
const config = require('../config');
const dbService = require('./dbService');

function hashPassword(password) {
  return crypto.createHmac('sha256', config.JWT_SECRET).update(password).digest('hex');
}

function generateToken(user) {
  const payload = {
    userId: user.id,
    email: user.email,
    name: user.name,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
  };
  const json = JSON.stringify(payload);
  const base64 = Buffer.from(json).toString('base64url');
  const signature = crypto.createHmac('sha256', config.JWT_SECRET).update(base64).digest('base64url');
  return `${base64}.${signature}`;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [base64, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', config.JWT_SECRET).update(base64).digest('base64url');
  if (signature !== expectedSig) return null;

  try {
    const payload = JSON.parse(Buffer.from(base64, 'base64url').toString('utf8'));
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

async function authMiddleware(req, res, next) {
  let token = req.cookies?.token;
  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (token) {
    const payload = verifyToken(token);
    if (payload && payload.userId) {
      const user = await dbService.findUserById(payload.userId);
      if (user) {
        req.user = user;
      }
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ status: false, message: 'Vui lòng đăng nhập để thực hiện thao tác này' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ status: false, message: 'Bạn không có quyền truy cập trang quản trị Admin' });
  }
  next();
}

module.exports = {
  hashPassword,
  generateToken,
  verifyToken,
  authMiddleware,
  requireAuth,
  requireAdmin
};

