const crypto = require('crypto');
const config = require('../config');
const db = require('./dbService');
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const encryptionKey = crypto.createHash('sha256').update(config.JWT_SECRET).digest();
function seal(value) {
  const nonce = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return [nonce, cipher.getAuthTag(), ciphertext].map(item => item.toString('base64')).join('.');
}
function open(value) {
  const [nonce, tag, ciphertext] = value.split('.').map(item => Buffer.from(item, 'base64'));
  const cipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, nonce); cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(ciphertext), cipher.final()]).toString('utf8'));
}
class SharedTvAuthService {
  constructor(store, issueToken) { this.store = store; this.issueToken = issueToken; }
  state(update) {
    if (this.store) return this.store.state('tv', update);
    return db.mutate(data => { data.shared_state ||= {}; data.shared_state.tv ||= {}; return update(data.shared_state.tv); });
  }
  prune(state) {
    state.sessions ||= {};
    for (const [key, value] of Object.entries(state.sessions)) if (value.expiresAt <= Date.now()) delete state.sessions[key];
  }
  async createSession(baseUrl) {
    return this.state(state => {
      this.prune(state);
      if (Object.keys(state.sessions).length >= 10000) throw Object.assign(new Error('TV session capacity reached'), { status: 429 });
      const token = crypto.randomBytes(24).toString('hex');
      let code;
      do { code = crypto.randomInt(100000, 1000000).toString(); } while (Object.values(state.sessions).some(item => item.code === code));
      const expiresAt = Date.now() + 300000;
      state.sessions[hash(token)] = { code, status: 'pending', expiresAt };
      return { token, code, qr_url: `${baseUrl}/tv-auth?token=${token}`, expires_in: 300, expires_at: expiresAt };
    });
  }
  async getStatus(token) {
    if (typeof token !== 'string' || token.length !== 48) return { status: 'expired' };
    const session = await this.state(state => { this.prune(state); return state.sessions[hash(token)] || null; });
    if (!session) return { status: 'expired', message: 'TV session expired' };
    if (session.status === 'approved') {
      try {
        const data = open(session.approval);
        const current = await db.findUserById(data.user.id);
        if (!current || current.blocked || (current.token_version || 0) !== data.version) return { status: 'expired' };
        const probe = { headers: { authorization: `Bearer ${data.token}` }, cookies: {} };
        let authError;
        await require('./authService').authMiddleware(probe, {}, error => { authError = error; });
        if (authError || probe.user?.id !== data.user.id) return { status: 'expired' };
        return { status: 'approved', token: data.token, user: data.user };
      } catch { return { status: 'expired' }; }
    }
    return { status: 'pending', expires_in: Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000)) };
  }
  async authorize(identifier, user) {
    if (typeof identifier !== 'string' || !user) return { success: false, message: 'Invalid approval' };
    const reservation = crypto.randomUUID();
    const selected = await this.state(state => {
      this.prune(state);
      const key = identifier.length === 6 ? Object.keys(state.sessions).find(key => state.sessions[key].code === identifier) : hash(identifier);
      const session = state.sessions[key];
      if (!session || session.status !== 'pending') return null;
      session.status = 'approving'; session.reservation = reservation;
      return { key, code: session.code };
    });
    if (!selected) return { success: false, message: 'TV session is invalid or already approved' };
    try {
      const issued = await this.issueToken(user);
      const token = typeof issued === 'string' ? issued : issued.token;
      const current = await db.findUserById(user.id);
      if (!current || current.blocked) throw new Error('Account unavailable');
      const approval = seal({ token, version: current.token_version || 0, user: { id: current.id, name: current.name, email: current.email, role: current.role, avatar: current.avatar || '' } });
      await this.state(state => {
        const session = state.sessions[selected.key];
        if (!session || session.reservation !== reservation || session.expiresAt <= Date.now()) throw new Error('TV session expired');
        session.approval = approval; session.status = 'approved'; delete session.reservation;
      });
      return { success: true, message: 'TV authorized', code: selected.code };
    } catch (error) {
      await this.state(state => { if (state.sessions[selected.key]?.reservation === reservation) delete state.sessions[selected.key]; });
      throw error;
    }
  }
}
module.exports = { SharedTvAuthService };
