# Production-readiness feature completion

## Delivered in this change

### Account and administrator security

- Forgot/reset password and email verification/resend flows. Random tokens are
  stored hashed, time/email/version-bound, one-use and replaced by resend.
- Generic forgot responses, bounded recipient/IP attempts, encrypted TOTP setup,
  enrollment confirmation, OTP replay protection and ten hashed one-use recovery codes.
- Persistent per-device sessions, own-session lists/revocation, current-device logout,
  revoke-others, and account-wide invalidation after password/reset/MFA/role/block changes.
- Web UI flows and safe DOM states; native Bearer contract explicitly requested by
  Flutter. Web JSON does not expose a Bearer token. Flutter now handles MFA challenges
  rather than treating a challenge as login success.
- Optional REQUIRE_ADMIN_MFA/REQUIRE_VERIFIED_EMAIL policy gates; account security
  endpoints remain accessible to complete enrollment/verification.
- Public/admin user serialization allowlists fields and excludes all MFA/session/token
  secrets. Changing an email clears the previous email's verification and revokes sessions.

### Playback QA and telemetry

- Shared PlayerUX batches seven bounded events maximum, honors DNT/opt-out and never
  sends media URLs, user/movie identifiers, tokens or freeform errors. Telemetry failure
  cannot break playback. Backend validates a complete batch before aggregation.
- Autoplay-denied prompt remains available through late readiness/buffering events.
- Repeatable Edge QA with generated local H.264 HLS covers desktop/mobile transport,
  seeking, server changes/resume, cleanup, stale callbacks, ended/auto-next, final history
  persistence, broken sources, timeout/fallback and controlled autoplay denial.
- TV QA covers real HLS decoding through a labelled Artplayer contract double; the real
  external Artplayer CDN, TV remote devices/audio/Safari native HLS are not certified.

### Operations and moderation

- `/operations.html` linked from admin: API request/error/latency aggregates, player
  starts/readiness/startup/errors/fallbacks, source checks, backup status and alerts.
- Comment reports with duplicate protection, hide/restore comments and replies,
  account blocking/unblocking, session invalidation and audit records.
- Generic admin request/result audit plus atomic moderation audit; no request password,
  MFA or arbitrary body contents are logged. Bounded retention, not an external WORM ledger.
- Transactional comment throttles. Last-active-admin protections. Optional scheduled
  source checks and deduplicated HTTPS webhook alerts, explicitly configured.
- Dashboard uses actual/empty states rather than fixed ~42 ms/100%-ready claims.

### Storage and backup

- PostgreSQL transactional JSONB compatibility store behind existing DB API; migration
  validates and copies the full snapshot and refuses to overwrite a populated target.
- Shared QR/room state and atomic PostgreSQL rate-limit counters, with hashed counter
  keys and encrypted TV approvals. Per-device TV revocation also expires approved polling.
- Shared SSE polling revalidates membership and authentication across instances.
- Optional scheduled AES-256-GCM backups, verification before exclusive publication,
  retention restricted to application-owned files and distinct backup encryption key.
- Verify/extract CLI refuses live overwrite and only creates a new file outside checkout.

## Verification actually performed

- Full `npm test` with a temporary real PostgreSQL 18 service: **133 passed**, zero
  failed, two explicit browser entry points skipped; repeated twice consecutively.
- `npm run test:player-e2e`: **5 passed**, no skips, real local decoding in Edge.
- `npm run test:security-e2e`: **1 passed**, full verification/reset/MFA/recovery/session
  browser flow with fake mail; repeated successfully after synchronizing the MFA step.
- PostgreSQL suite included **7 passed**, including full migration/source preservation,
  rollback, concurrent updates, shared counters, QR/room data, and two separate production
  processes sharing sessions/SSE events plus cross-instance account revocation.
- Operations tests cover redaction, permissions, moderation, blocking, audit, telemetry,
  encrypted backup tampering/retention, comment throttles, native tokens, TV revocation,
  MFA policy, source alerts and email-change revocation.
- Dashboard verified in Edge at 1440 px and 390 px: six metric cards, no horizontal
  document overflow, no page exceptions/XSS, and comment hiding through the real dialog.
- Local bounded smoke: 200 readiness requests, concurrency 10, all HTTP 200; 50 queued
  increments stored as 50. One sample p50 40 ms / p95 120 ms. This is a small isolated
  JSON readiness/write baseline, **not** production/user-capacity certification.
- `npm audit --omit=dev`: zero reported vulnerabilities. Full development audit retains
  three Moderate Tailwind/PostCSS toolchain advisories; no forced CSS major upgrade.
- `git diff --check` clean in the final verification.

All test accounts, databases and temporary infrastructure are isolated from the existing
project data. No real user was enrolled in MFA, no real email/webhook was sent, and the
project's existing JSON was not migrated to PostgreSQL. CI configuration is updated but
has not been executed on GitHub by this local session.

## Configuration still required

See `.env.example` and `PRODUCTION.md`:

- Real SMTP credentials/TLS and mailbox delivery (plus SPF/DKIM/DMARC).
- A separate stable 64-hex MFA_ENCRYPTION_KEY before real enrollment. JWT and MFA keys
  must not be tied together. No ephemeral development key is accepted for real enrollment.
- PostgreSQL service/verified TLS, migration under a stop-writes/backup plan and load tests.
- Backup directory, separate encryption key, retention/schedule, offsite copies and a
  real-host restore drill. Application snapshots do not replace PostgreSQL native PITR.
- HTTPS alert webhook, infrastructure uptime/metrics/log retention and operational drills.
- Public domain/proxy/firewall/TLS, secrets and administrator policy rollout.
- Flutter SDK analyze/test/build and physical Android/iOS/TV checks; native signing and
  actual store acceptance are not performed here. SDK was not available in PATH.

## Architectural limits, not hidden completion claims

- PostgreSQL stores transactional snapshots, not fully normalized relational tables.
  Application writes serialize; shared rooms use a bounded document/event log and
  500 ms polling. Two-replica correctness is tested, arbitrary high throughput is not.
- CSP remains report-only, and several legacy pages still use runtime/CDN resources.
- Actual upstream playback/embed/CDN/audio and physical device/remote behavior need
  release verification, even though deterministic local player QA now exists.
- Legal/privacy/contact/takedown pages and content-distribution rights require owner review.

The old `STAGING_VERIFICATION.md` is a historical record from before these features;
this report and the updated `PRODUCTION.md` describe the current implementation.
