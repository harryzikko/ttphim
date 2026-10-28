const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const lockfile = require('proper-lockfile');
const config = require('../config');
const db = require('./dbService');
const { validateDatabase } = require('./dbSchema');
const { notify } = require('./alertService');
const BACKUP_PATTERN = /^cineviet-\d{13}-[a-f0-9]{8}\.backup$/;
let active = null;

function keyFromEnvironment() {
  const value = process.env.BACKUP_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('BACKUP_ENCRYPTION_KEY requires exactly 32 random bytes encoded as hex');
  return Buffer.from(value, 'hex');
}
function encrypt(data, key) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return JSON.stringify({ version: 1, algorithm: 'aes-256-gcm', nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') });
}
function decrypt(text, key) {
  const envelope = JSON.parse(text);
  if (envelope.version !== 1 || envelope.algorithm !== 'aes-256-gcm') throw new Error('Unsupported backup format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.nonce, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
  return validateDatabase(JSON.parse(plain.toString('utf8')));
}
async function validateDirectory(directory) {
  if (!directory || !path.isAbsolute(directory)) throw new Error('Backup directory must be absolute');
  const candidate = path.relative(path.resolve(__dirname, '../..'), path.resolve(directory));
  if (!candidate.startsWith('..' + path.sep) && !path.isAbsolute(candidate)) throw new Error('Backup directory must be outside the checkout');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const real = await fs.realpath(directory);
  const relative = path.relative(path.resolve(__dirname, '../..'), real);
  if (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) throw new Error('Backup directory must be outside the checkout');
  return real;
}
async function run(options = {}) {
  if (active) return active;
  active = perform(options).finally(() => { active = null; });
  return active;
}
async function perform({ directory = config.BACKUP_DIR, retention = config.BACKUP_RETENTION, key = keyFromEnvironment() } = {}) {
  if (!Number.isInteger(retention) || retention < 1 || retention > 365) throw new Error('Backup retention must be 1-365 files');
  const real = await validateDirectory(directory);
  const release = await lockfile.lock(path.join(real, 'backup-job'), { realpath: false, stale: 120000, retries: 0 });
  let temporary;
  try {
    const snapshot = validateDatabase(await db.getRawDatabase());
    const content = encrypt(snapshot, key);
    const filename = `cineviet-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.backup`;
    const destination = path.join(real, filename);
    temporary = destination + '.tmp';
    await fs.writeFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    decrypt(await fs.readFile(temporary, 'utf8'), key);
    await fs.link(temporary, destination);
    await fs.unlink(temporary);
    const files = (await fs.readdir(real, { withFileTypes: true })).filter(item => item.isFile() && BACKUP_PATTERN.test(item.name)).map(item => item.name).sort().reverse();
    for (const name of files.slice(retention)) await fs.unlink(path.join(real, name));
    const status = { last_success_at: new Date().toISOString(), filename, sha256: crypto.createHash('sha256').update(content).digest('hex'), retained: Math.min(files.length, retention), encrypted: true };
    await db.mutate(data => { data.backup_status = status; });
    return status;
  } catch (error) {
    await db.mutate(data => { data.backup_status = { ...(data.backup_status || {}), last_failure_at: new Date().toISOString(), failed: true }; }).catch(() => {});
    await notify('backup_failed', 'Scheduled encrypted backup failed; inspect service logs and backup storage', { severity: 'critical' }).catch(() => {});
    throw error;
  } finally { if (temporary) await fs.unlink(temporary).catch(() => {}); await release(); }
}
function start() {
  if (!config.BACKUP_DIR) return () => {};
  keyFromEnvironment();
  if (!Number.isInteger(config.BACKUP_INTERVAL_MS) || config.BACKUP_INTERVAL_MS < 60000) throw new Error('Backup interval must be at least 60 seconds');
  const timer = setInterval(() => run().catch(() => console.error('Scheduled backup failed')), config.BACKUP_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
module.exports = { run, start, encrypt, decrypt, keyFromEnvironment, validateDirectory, drain: () => active || Promise.resolve() };
