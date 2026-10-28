const crypto = require('crypto');
const config = require('../config');
class PostgresRateLimitStore {
  constructor(store, prefix) { this.store = store; this.prefix = prefix; this.windowMs = 60000; this.localKeys = false; this.lastCleanup = 0; }
  init(options) { this.windowMs = options.windowMs; }
  key(value) { return `${this.prefix}:${crypto.createHmac('sha256', config.JWT_SECRET).update(value).digest('hex')}`; }
  async increment(value) {
    const result = await this.store.pool.query(`INSERT INTO cineviet_rate_limits(key,total_hits,reset_at)
      VALUES ($1,1,clock_timestamp() + $2 * interval '1 millisecond')
      ON CONFLICT (key) DO UPDATE SET
        total_hits = CASE WHEN cineviet_rate_limits.reset_at <= clock_timestamp() THEN 1 ELSE cineviet_rate_limits.total_hits + 1 END,
        reset_at = CASE WHEN cineviet_rate_limits.reset_at <= clock_timestamp() THEN clock_timestamp() + $2 * interval '1 millisecond' ELSE cineviet_rate_limits.reset_at END
      RETURNING total_hits, reset_at`, [this.key(value), this.windowMs]);
    if (Date.now() - this.lastCleanup > 60000) {
      this.lastCleanup = Date.now();
      await this.store.pool.query('DELETE FROM cineviet_rate_limits WHERE reset_at < now() - interval \'1 hour\'');
    }
    return { totalHits: result.rows[0].total_hits, resetTime: new Date(result.rows[0].reset_at) };
  }
  async decrement(value) { await this.store.pool.query('UPDATE cineviet_rate_limits SET total_hits = GREATEST(0,total_hits-1) WHERE key=$1 AND reset_at>clock_timestamp()', [this.key(value)]); }
  async resetKey(value) { await this.store.pool.query('DELETE FROM cineviet_rate_limits WHERE key=$1', [this.key(value)]); }
}
function sharedRateOptions(prefix) {
  const store = require('./dbService').store;
  return store ? { store: new PostgresRateLimitStore(store, prefix) } : {};
}
module.exports = { PostgresRateLimitStore, sharedRateOptions };
