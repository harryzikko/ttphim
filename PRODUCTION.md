# Production deployment and operations

## What is implemented

- One-use hashed email verification/reset tokens, generic forgot-password responses,
  bounded login/MFA attempts, encrypted TOTP enrollment, replay protection and
  one-use recovery codes.
- Tracked per-device sessions, own-session listing/revocation, logout of the current
  device, and account-wide revocation on password/reset/MFA/role/block changes.
- Player telemetry with a strict, identifier-free schema and opt-out, API latency/error
  aggregates, an admin operations/moderation dashboard, audit records, comment reports,
  hiding/restoring content, account blocking and transactional comment throttles.
- Encrypted scheduled backups with exclusive publication, verification and retention;
  optional HTTPS webhook alerts and scheduled upstream metadata health checks.
- Optional PostgreSQL transactions and shared room/QR/rate-limit state; JSON remains
  available for local development and a single-instance installation.
- Repeatable browser QA with synthetic local HLS fixtures, security browser QA with
  fake mail, and real-PostgreSQL transaction/two-replica tests in CI.

These are code capabilities, not proof that your SMTP, hosting, webhook, offsite
storage, TLS, signing or expected production load has been validated.

## Topology and storage

Default: one Node.js 24 process with JSON on persistent local storage. JSON operations
use a file lock and atomic replacement; do not use independent copies, NFS/object
storage, cluster/autoscaling or multiple JSON replicas.

Optional: set `DATABASE_URL` and migrate to PostgreSQL. PostgreSQL stores a JSONB
application snapshot under transaction/advisory locks to preserve existing APIs;
this is not a normalized, high-throughput relational rewrite. Main application writes
serialize on one document. Watch Party uses a bounded shared document/event log and
500 ms SSE polling, with up to 500 rooms and 1000 retained events. QR state has a
five-minute TTL and a capacity bound. Rate counters use atomic SQL updates.

Two temporary production processes have been tested sharing sessions, QR approvals,
room chat/SSE and cross-instance revocation. This proves those contracts, not capacity
at an arbitrary number of users. Load-test your actual PostgreSQL/proxy/host before
`DEPLOYMENT_MODE=replicated`; the server rejects that setting without PostgreSQL.
Do not disable PostgreSQL TLS certificate validation for a remote production database.
Use a shared stable JWT key, MFA key and database across replicas. Designate one
backup/monitor owner, or use one shared backup directory/lock and intentional scheduling.

## Required configuration

Use `.env.example` as documentation; provision actual values using a secret store or
service manager. `.env` is ignored and removed from Git's index, not erased from history.
Previously committed secrets must be rotated. Never commit production data or keys.

- `NODE_ENV=production`, Node.js 24 (minimum tested 24.14.1).
- `JWT_SECRET`: private random secret, at least 32 characters, stable across restarts.
  Missing/short/old default secrets fail production startup. Development may use an
  ephemeral JWT secret; restarting then intentionally invalidates old login cookies.
- `PUBLIC_ORIGIN`: canonical HTTPS origin. Use same-origin/same-site web hosting;
  adding a CORS origin alone does not make SameSite=Lax cookies work cross-site.
- JSON mode: absolute `DB_PATH` on persistent local storage outside the checkout.
  Provision/validate the file before startup. Missing/corrupt/invalid-schema files
  fail startup/readiness rather than becoming a silently empty database.
- PostgreSQL mode: `DATABASE_URL` with credentials and verified TLS settings supplied
  privately. The destination schema/data is provisioned by the migration command.
- `HOST` defaults to `127.0.0.1`; `PORT` defaults to 3001. Use `0.0.0.0` only inside
  an isolated container/private network behind a configured proxy/firewall.
- `TRUST_PROXY`: exact proxy IP/subnet, e.g. `loopback` for a local proxy. `false`/`0`
  disable trust; integers mean hop counts and require fixed proxy topology; `true`
  is rejected. Do not expose the backend directly with arbitrary forwarded headers.
- `ALLOWED_ORIGINS`: optional exact trusted origins, comma-separated, never wildcard.
- `SHUTDOWN_TIMEOUT_MS`: default 10000, allowed 100-30000. Set the supervisor grace
  period higher; stalled shutdown exits with error at the deadline.

### Mail, verification and MFA

Configure `SMTP_HOST`, `SMTP_PORT` (default 465), `SMTP_FROM`, `SMTP_USER`, `SMTP_PASS`.
Port 465 uses TLS; other ports require STARTTLS and certificate verification.
Production does not silently pretend to deliver mail when unconfigured. Verify a real
mailbox end-to-end, SMTP provider quotas and SPF/DKIM/DMARC. Development without SMTP
uses an in-memory outbox accessible only to injected tests, never a public HTTP endpoint.

Set `MFA_ENCRYPTION_KEY` to a separate stable 32-byte key encoded as 64 hex characters
before allowing MFA enrollment. Store/recover it independently of JWT_SECRET; do not
rotate it blindly or existing encrypted TOTP secrets become unreadable. Changing JWT
keys must not change the MFA key. Tests inject their own temporary key.

Users enroll MFA under Account -> Security, confirm a TOTP, then receive ten recovery
codes once. Codes/secrets must not go into logs, screenshots or analytics. Store recovery
codes offline. Disabling MFA requires password plus TOTP/recovery code. Resetting a
password revokes sessions but does not bypass enabled MFA.

For rollout, enroll/verify administrators before setting `REQUIRE_ADMIN_MFA=true` and
`REQUIRE_VERIFIED_EMAIL=true`. Enforced admin MFA blocks admin APIs until enrollment;
account security endpoints remain reachable so users can verify/enroll. Defaults in
`.env.example` are development-friendly, not a production-policy recommendation.
Do not ship demo accounts or keep the initial admin password.

Web login uses HttpOnly cookies and omits Bearer tokens from response JSON. Native
clients explicitly send `X-Client-Type: native` without a browser Origin to receive a
tracked Bearer after full password/MFA authentication. Flutter integration is updated;
run its SDK tests/build and physical-device checks before distributing a new app.
Old versionless/sid-less production tokens intentionally stop working. `generateToken`
exists for isolated test fixtures only; real issuance uses persisted tracked sessions.

## Migration to PostgreSQL

1. Stop all writers and take/verify a protected JSON backup; preserve the original.
2. Provision an empty PostgreSQL database. Set DATABASE_URL privately for the command.
3. Run `npm run db:migrate-postgres -- ABSOLUTE_SOURCE_JSON`.
4. Migration validates schema, refuses an existing main document, copies the full
   snapshot transactionally and checks the result. It does not delete the source.
5. Start staging with DATABASE_URL and the same real keys. Check login/MFA, sessions,
   library/history, comments, settings, backups, QR and room state across replicas.
6. Only change the real service configuration after a verified backup/rollback plan.
   Never copy an old JSON file back over a newer live PostgreSQL database.

The migration compatibility schema is deliberately small; assess document size, write
contention, JSON serialization overhead and SSE polling load before horizontal scaling.

## Operations and moderation

Open `/operations.html` from the admin menu. API access is role-protected and obeys the
MFA/verification policies. The dashboard shows aggregate request/error counts, latency
histogram p95 upper bound, mean startup time, player event counts, source health, backup
status, alerts, reported/hidden content, account blocks and up to 200 recent audit rows.
Empty/unconfigured metrics are not replaced by fake success values.

Player event names are limited to start/ready/error/stall/resume/fallback/end; batches
contain at most seven events, only finite bounded durations/provider labels, no media
URLs, tokens, movie/user identifiers or freeform error strings. The client honors DNT
and `PLAYER_TELEMETRY_DISABLED`. Desktop/mobile shared PlayerUX are instrumented; the
separate TV engine is not yet instrumented. Counts are client-reported first occurrences,
not authoritative billing or proof of unique viewers. Ready/start ratios are estimates.

Metrics/audit storage has bounded retention. Audit records the admin request before an
operation and the result after completion; explicit moderation actions record their audit
in the same transaction. Audit is not an external tamper-proof/WORM ledger. Configure
log collection/retention and external uptime metrics in your infrastructure.

Set `SOURCE_MONITOR_ENABLED=true` for five-minute metadata health checks. Set
`ALERTS_ENABLED=true` plus an HTTPS `ALERT_WEBHOOK_URL` to deliver operational alerts;
otherwise alerts are retained for dashboard use. Alerts are deduplicated per category for
five minutes. Real webhook delivery, outages and alert routing require a staging drill.
The metadata checks do not certify every media URL, subtitle or playback server.

## Encrypted backups and restore

Configure an absolute `BACKUP_DIR` outside the checkout and a distinct 64-hex
`BACKUP_ENCRYPTION_KEY`. Restrict directory permissions/Windows ACLs. Default interval
is 24 hours (`BACKUP_INTERVAL_MS`, minimum 60000); retention is 14 files
(`BACKUP_RETENTION`, 1-365). The scheduler runs while the app is running; it is not an
OS-level/offsite backup service. Set monitoring so a dead application cannot silently
stop all backups. Offsite replication and disaster recovery remain infrastructure tasks.

```text
npm run backup:encrypted
npm run backup:verify -- ABSOLUTE_BACKUP_FILE
```

Each backup uses AES-256-GCM, verifies decryption/schema before exclusive final-file
publication and never overwrites an existing backup. Retention only removes files
matching the application's backup naming pattern. Keys are not stored in the envelope.
Archive copies/offsite keys independently and rehearse loss-of-host/key recovery.

To extract for an offline restore drill, set `CONFIRM_BACKUP_EXTRACT=yes` and run:

```text
npm run backup:extract -- ABSOLUTE_BACKUP_FILE ABSOLUTE_NEW_JSON_FILE
```

Extraction only creates a NEW file outside the checkout and refuses overwrite. It does
not replace a live database. Stop all writers before actual restore, preserve the current
DB, verify the extracted snapshot on staging, restore under change control, rotate
JWT_SECRET to invalidate sessions against rolled-back state, preserve the MFA key, and
check readiness plus critical flows. PostgreSQL infrastructure also needs native backup/
PITR of the whole database to preserve shared state; application snapshots cover main
account/content state, not the separate ephemeral PostgreSQL room/rate/QR documents.

Legacy `db:backup`/`db:verify` remain unencrypted snapshot tools for compatibility and
must not be used as the production backup default. Treat all exported data as sensitive.

## Build, run and verification

```text
npm ci
npm test
npm run test:player-e2e
npm run test:security-e2e
npm audit --omit=dev
```

PostgreSQL tests require an isolated TEST_DATABASE_URL with CREATE DATABASE permission;
`npm run test:postgres` creates/drops only random test databases. Never use production
credentials. CI provides a PostgreSQL service and installs Chromium for browser tests.
Windows browser runners use Edge by default; PLAYER_BROWSER_PATH can override it.
Tests use temporary DBs, fake mail and generated freely reusable HLS, not live users.

Run `npm start` under a service manager with restart policy. Probe `/api/health` for
liveness and `/api/ready` for database readiness. Set HTTPS at the proxy, preserve only
trusted host/protocol headers, disable buffering for SSE and cap request sizes/timeouts/
connections at the edge. Logs omit query strings; configure retention/error alerts.
CSP is currently report-only to preserve inline/CDN compatibility; do not treat it as an
enforced XSS boundary. Three Moderate Tailwind/PostCSS dev-toolchain advisories remain;
production dependencies audit clean. Avoid blind `npm audit fix --force` CSS upgrades.

Mobile CI rejects missing/local/cleartext backend origins, but checks syntax/address
literals, not live DNS/TLS availability. Native release signing/provisioning, current
store target-SDK requirements, Flutter analyze/tests/build and physical devices remain
deployment gates. The alternative Capacitor shell still needs intentional backend/
session/bootstrap provisioning; do not assume it is certified by Flutter/web tests.

## Final acceptance outside local automation

- Real SMTP verification/reset delivery and configured webhook alert drill.
- Real domain TLS/proxy/firewall/SSE behavior without ignoring certificate errors.
- Expected-concurrency load/soak test, disk/DB growth, backup schedule and offsite restore.
- Provider playback, audio, Safari native HLS, Android/iOS/TV/remotes, embed/CDN behavior.
- Private stable keys, MFA enrollment/policy rollout, user support and recovery procedure.
- Legal/privacy/contact/takedown pages and content-distribution rights reviewed by owner.

Browser tests cover real local HLS decoding and controlled faults. The TV player QA
uses a labelled Artplayer contract double, not the CDN's actual Artplayer integration.
No local test result is a blanket certification of every provider/device or a substitute
for release acceptance on your real infrastructure.

## Personal Avatars And SMTP Diagnostics

Personal avatar uploads require the exact pinned `sharp` dependency and a writable,
persistent `AVATAR_DIR` outside the checkout. Default local storage is `avatars`
beside DB_PATH. Replicas must share that media directory; PostgreSQL stores avatar
URLs, not image bytes. Existing encrypted DB backups do not include these files:
back up and restore AVATAR_DIR consistently with the database before claiming full
account-media recovery. Avatar URLs are public display images.

`node scripts/check-smtp.cjs` reads only explicit process environment, does not load
`.env`, and checks TLS/auth without sending mail. To explicitly send one diagnostic
message, use `node scripts/check-smtp.cjs --send --to recipient@example.com`.
SMTP acceptance is not inbox delivery: verify receipt/spam and SPF/DKIM/DMARC,
then exercise verification/reset on the configured production HTTPS origin.
The local diagnostic currently reports missing SMTP configuration, not production
delivery success. See ACCOUNT_AVATARS_VIEW_MODES.md for behavior and test details.
