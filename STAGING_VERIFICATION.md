# Local Production-Mode Staging Verification

> Historical verification snapshot from before the account/MFA/operations/PostgreSQL
> feature implementation. See FEATURE_COMPLETION.md and PRODUCTION.md for current
> capabilities, test results and remaining deployment gates.

## Environment and isolation

- Application ran with `NODE_ENV=production` over `https://localhost:3443`.
- HTTPS used an ephemeral, self-signed certificate; the browser context ignored
  certificate trust errors. This does not validate a real domain's TLS certificate,
  reverse proxy, DNS, CDN or hosting firewall.
- Database and two synthetic accounts were created in the session scratch directory.
  The project's `data/db.json` was not used for writes in this verification.
- Browser: fresh headless Microsoft Edge contexts driven by Playwright installed
  only in scratch, not added to project dependencies.
- No remote deployment, real-user account operations or store release occurred.

## Confirmed results

### Browser checks

- Desktop login through the actual form succeeds and redirects to the account page.
- The production cookie is Secure, HttpOnly and SameSite=Lax.
- Profile save through the actual form returns HTTP 200.
- Account, admin and library pages loaded with real backend responses; the isolated
  diagnostic pass recorded no JavaScript exceptions on those pages.
- Mobile web account page loaded with an authenticated production cookie.
- Password change through the actual desktop form returns HTTP 200, clears cached
  identity, redirects to login, and permits login with the new password. The
  synthetic account password was restored after verification.
- Stored comment/reply content is displayed as text on the watch page, including
  an HTML-like payload. It was not treated as an executable element in the checks.

### HTTPS API smoke checks: 8/8 passed

- Health and database readiness.
- Admin/member login.
- Actual KKPhim home feed and movie detail (three playback servers in sampled data).
- Guest denied admin with 401; ordinary member denied with 403; admin allowed.
- Comment persistence and reply round trip.
- TV QR creation, trusted HTTPS approval URL, authorization and approved polling.
- Party invitation preview privacy, membership checks, host seek, non-host heartbeat
  unable to overwrite the host position, and member chat.
- Logout followed by rejection of the old cookie on a protected endpoint.

Watchlist/history persistence over HTTPS was additionally confirmed in a separate
smoke run. The browser/API checks are bounded smoke tests, not complete UI coverage
of every button or a physical-TV certification.

### Real media checks

Sampled movie slug: `danh-sach-tu-tu-phan-2` (provider content can change).

- Master and media playlists returned HTTP 200 with CORS enabled.
- A bounded 4096-byte segment probe returned HTTP 206 and MPEG-TS bytes, not HTML.
- The shared HLS engine in an isolated browser page played a public test stream
  for over 10 seconds and the sampled provider stream for over 11 seconds;
  `readyState` reached 4 in both runs.
- The actual desktop watch page subsequently played the sampled stream with an
  explicit play/mute action: time advanced, duration was available, readyState 4.
- A seek set the playback position to 30 seconds, but the snapshot immediately
  after seeking had readyState 1. Sustained playback/buffer recovery after seeking
  has NOT been certified by this check.
- Initial automated runs sometimes remained at readyState 0 and some browser runs
  timed out. Isolated reruns succeeded. Do not infer reliable autoplay, startup
  latency or all-provider reliability from the successful samples.

## Defects corrected during verification

- Desktop account UI previously retained the cached logged-in identity after a
  successful password change even though the backend revoked the session.
  It now clears the identity and returns the user to login.
- Profile/password network rejections previously could leave action buttons
  disabled. Both operations now catch errors and release buttons in `finally`.
- The SDK clears cached identity only when a password change actually succeeds.
- The shutdown-deadline regression test now isolates provider modules; it still
  requires exit code 1 within the deadline and does not accept a crash as success.
  One earlier full run produced a Windows child-process crash; the isolated test
  and both final full runs passed. The precise OS-level crash cause was not proven.

## Final automated verification

- `npm test`: 86/86 passed, twice consecutively, with no skips.
- Four new account/session/error-handling tests are in `tests/account.test.js`.
- `npm audit --omit=dev`: zero reported vulnerabilities.
- `git diff --check`: passed.
- The previous three Moderate advisories in development-only Tailwind/PostCSS
  remain outside the production dependency tree; no forced CSS major upgrade.

## Still required before public launch

See `PRODUCTION.md` for the deployment/backup procedure and supported one-instance
local-storage topology. In particular:

- Provision the real private secret, persistent database, HTTPS origin, trusted
  proxy settings, service supervision, scheduled backups and operational alerts.
- Deploy to an actual staging host and repeat browser smoke tests without bypassing
  TLS trust; validate real reverse-proxy behavior and SSE buffering/timeouts.
- Run expected-concurrency/load tests on that actual host, not this developer laptop.
- Verify autoplay-denied UI, sustained seeking, episode/server switching, embed
  fallback and long-session progress on desktop/mobile/TV with real providers.
- Run Flutter analysis/tests/build with the SDK and test physical Android/iOS/TV
  devices. SDK availability, signing/provisioning and store requirements remain gates.
- Account recovery/email verification/admin MFA, legal/privacy/takedown workflows,
  enforced CSP and distributed state are not implemented or certified by this smoke pass.

The temporary staging server is stopped after verification. Scratch logs/scripts
are diagnostic artifacts, not deployment credentials or production services.
