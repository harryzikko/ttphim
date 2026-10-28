const crypto = require('crypto');
const db = require('./dbService');

class SharedPartyService {
  constructor(local, store) { this.local = local; this.store = store; this.clients = new Set(); }
  async operate(method, args) {
    return this.store.state('parties', async state => {
      state.rooms ||= {};
      state.events ||= [];
      state.sequence ||= 0;
      for (const [code, room] of Object.entries(state.rooms)) if (Date.now() - room.lastActive > 21600000) delete state.rooms[code];
      const model = new this.local.constructor();
      model.rooms = new Map(Object.entries(state.rooms).map(([code, room]) => [code, { ...room, streams: new Map() }]));
      model.broadcast = (code, event) => {
        state.events.push({ code, sequence: ++state.sequence, event });
        state.events = state.events.slice(-1000);
      };
      try {
        const result = model[method](...args);
        state.rooms = Object.fromEntries([...model.rooms].map(([code, room]) => {
          const { streams, ...safe } = room;
          return [code, safe];
        }));
        return result;
      } finally { model.close(); }
    });
  }
  createRoom(options) { return this.operate('createRoom', [options]); }
  joinRoom(code, user) { return this.operate('joinRoom', [code, user]); }
  leaveRoom(code, userId) { return this.operate('leaveRoom', [code, userId]); }
  syncPlayer(code, userId, options) { return this.operate('syncPlayer', [code, userId, options]); }
  sendChat(code, userId, options) { return this.operate('sendChat', [code, userId, options]); }
  sendReaction(code, userId, options) { return this.operate('sendReaction', [code, userId, options]); }
  async getRoom(code) {
    const state = await this.store.getState('parties');
    return state?.rooms?.[String(code || '').trim().toUpperCase()] || null;
  }
  getSafeRoom(room) { return this.local.getSafeRoom(room); }
  async registerStream(code, userId, res, req) {
    code = String(code || '').trim().toUpperCase();
    let state = await this.store.getState('parties');
    let room = state?.rooms?.[code];
    if (!room) return res.status(404).json({ status: false, message: 'Room not found' });
    if (!room.members.some(item => item.id === userId)) return res.status(403).json({ status: false, message: 'Join the room first' });
    if ([...this.clients].filter(item => item.userId === userId).length >= 3) return res.status(429).json({ status: false, message: 'Too many room streams' });
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ type: 'init', room: this.getSafeRoom(room) })}\n\n`);
    const client = { userId, res, id: crypto.randomUUID() };
    this.clients.add(client);
    let cursor = state.sequence || 0, busy = false;
    const cleanup = () => { clearInterval(timer); this.clients.delete(client); };
    const timer = setInterval(async () => {
      if (busy || res.writableEnded) return;
      busy = true;
      try {
        const current = await db.findUserById(userId);
        if (!current || current.blocked || (current.token_version || 0) !== (req.authVersion || 0) || Date.now() >= req.authExpiresAt) return res.end();
        // Re-run authentication to include per-device revocations without coupling to its storage format.
        const probe = { headers: req.headers, cookies: req.cookies };
        await require('./authService').authMiddleware(probe, {}, () => {});
        if (!probe.user) return res.end();
        state = await this.store.getState('parties');
        room = state?.rooms?.[code];
        if (!room?.members.some(item => item.id === userId)) return res.end();
        const events = (state.events || []).filter(item => item.code === code && item.sequence > cursor);
        if (state.sequence > cursor && events.length === 0) res.write(`data: ${JSON.stringify({ type: 'init', room: this.getSafeRoom(room) })}\n\n`);
        for (const item of events) if (!res.write(`data: ${JSON.stringify(item.event)}\n\n`)) return res.end();
        cursor = state.sequence || cursor;
        res.write(': ping\n\n');
      } catch { res.end(); }
      finally { busy = false; }
    }, 500);
    timer.unref();
    res.once('close', cleanup); res.once('finish', cleanup); req.once('close', cleanup);
  }
  close() { for (const client of this.clients) client.res.end(); this.clients.clear(); this.local.close(); }
}
module.exports = { SharedPartyService };
