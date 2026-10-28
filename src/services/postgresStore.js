const { AsyncLocalStorage } = require('async_hooks');
const { Pool } = require('pg');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cineviet_documents (
  key text PRIMARY KEY,
  document jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cineviet_rate_limits (
  key text PRIMARY KEY,
  total_hits integer NOT NULL,
  reset_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS cineviet_rate_limits_expiry ON cineviet_rate_limits(reset_at);
`;

class PostgresStore {
  constructor(connectionString, options = {}) {
    this.pool = options.pool || new Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000, allowExitOnIdle: true, application_name: 'cineviet' });
    this.context = new AsyncLocalStorage();
    this.pool.on('error', () => console.error('PostgreSQL idle connection error'));
  }

  async initialize() { await this.pool.query(SCHEMA); }

  async transaction(work, key = 'main') {
    if (this.context.getStore()) throw new Error('Nested database operations are forbidden inside a transaction');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout = '15s'");
      await client.query("SET LOCAL lock_timeout = '10s'");
      // Lock even an absent row, so initial migration and shared-state creation serialize.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
      const result = await this.context.run({ client, key }, work);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async read() {
    const context = this.context.getStore();
    const connection = context?.client || this.pool;
    const result = await connection.query('SELECT document FROM cineviet_documents WHERE key = $1', [context?.key || 'main']);
    if (!result.rows.length) throw Object.assign(new Error('Database document must be provisioned before startup'), { code: 'DOCUMENT_MISSING' });
    return result.rows[0].document;
  }

  async write(document) {
    const context = this.context.getStore();
    if (!context) throw new Error('PostgreSQL writes require a transaction');
    await context.client.query(`INSERT INTO cineviet_documents(key, document) VALUES ($1, $2::jsonb)
      ON CONFLICT (key) DO UPDATE SET document = EXCLUDED.document, updated_at = now()`, [context.key, JSON.stringify(document)]);
    return document;
  }

  async provision(document) {
    await this.initialize();
    return this.transaction(async () => {
      const existing = await this.context.getStore().client.query('SELECT 1 FROM cineviet_documents WHERE key = $1', ['main']);
      if (existing.rowCount) throw new Error('Destination database is not empty; refusing to overwrite');
      await this.write(document);
    });
  }

  async state(namespace, update) {
    return this.transaction(async () => {
      let state;
      try { state = await this.read(); }
      catch (error) { if (error.code !== 'DOCUMENT_MISSING') throw error; state = {}; }
      const result = await update(state);
      await this.write(state);
      return result;
    }, `state:${namespace}`);
  }

  async getState(namespace) {
    const result = await this.pool.query('SELECT document FROM cineviet_documents WHERE key = $1', [`state:${namespace}`]);
    return result.rows[0]?.document || null;
  }

  async close() { await this.pool.end(); }
}

module.exports = { PostgresStore, SCHEMA };
