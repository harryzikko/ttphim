'use strict';
// Reads only the explicitly supplied process environment; never loads .env or prints secrets.
const path = require('node:path');
function inspect(env = process.env) {
  const checks = [];
  const check = (id, ok, requirement) => checks.push({ id, ok: Boolean(ok), requirement });
  let origin;
  try { origin = new URL(env.PUBLIC_ORIGIN); } catch (_) {}
  check('public_origin', origin?.protocol === 'https:' && !['localhost', '127.0.0.1', '::1', '[::1]'].includes(origin.hostname) && !origin.username && !origin.password && origin.pathname === '/' && !origin.search && !origin.hash, 'PUBLIC_ORIGIN must be a public HTTPS origin without path or credentials');
  check('signing_key', typeof env.JWT_SECRET === 'string' && env.JWT_SECRET.length >= 32 && env.JWT_SECRET !== 'obsidian_cinema_kkphim_secret_2026', 'JWT_SECRET must be a stable private secret, at least 32 characters');
  check('storage', /^postgres(?:ql)?:\/\//.test(env.DATABASE_URL || '') || path.isAbsolute(env.DB_PATH || ''), 'Configure PostgreSQL or an absolute DB_PATH on persistent storage');
  check('replica_storage', env.DEPLOYMENT_MODE !== 'replicated' || /^postgres(?:ql)?:\/\//.test(env.DATABASE_URL || ''), 'Replicated mode requires PostgreSQL shared state');
  check('mfa_key', /^[a-f0-9]{64}$/i.test(env.MFA_ENCRYPTION_KEY || ''), 'Configure a stable 32-byte hexadecimal MFA_ENCRYPTION_KEY');
  check('email_policy', env.REQUIRE_VERIFIED_EMAIL === 'true', 'Enable verified email after mail delivery acceptance');
  check('admin_mfa_policy', env.REQUIRE_ADMIN_MFA === 'true', 'Enroll administrators and enable required administrator MFA');
  check('smtp', ['SMTP_HOST', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASS'].every(key => Boolean(env[key])), 'Configure SMTP delivery credentials and sender');
  check('backup_storage', path.isAbsolute(env.BACKUP_DIR || ''), 'BACKUP_DIR must point to protected persistent storage');
  check('backup_key', /^[a-f0-9]{64}$/i.test(env.BACKUP_ENCRYPTION_KEY || ''), 'Configure a separate 32-byte hexadecimal BACKUP_ENCRYPTION_KEY');
  check('separate_keys', env.BACKUP_ENCRYPTION_KEY && env.MFA_ENCRYPTION_KEY && env.BACKUP_ENCRYPTION_KEY !== env.MFA_ENCRYPTION_KEY && env.JWT_SECRET !== env.MFA_ENCRYPTION_KEY && env.JWT_SECRET !== env.BACKUP_ENCRYPTION_KEY, 'Signing, MFA and backup keys must be independent');
  check('proxy_scope', env.TRUST_PROXY !== 'true', 'TRUST_PROXY must not blindly trust all forwarders');
  return { ready: checks.every(check => check.ok), checks, externalAcceptance: ['Real TLS/proxy/CORS/SSE behavior', 'SMTP send/receive and account recovery', 'Encrypted offsite backup restore drill', 'Load/replica database behavior', 'Safari/iPhone/iPad/Android hardware playback'] };
}
if (require.main === module) {
  const result = inspect();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ready ? 0 : 1;
}
module.exports = { inspect };
