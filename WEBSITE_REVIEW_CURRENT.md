> Status update: all seven findings below have been remediated and regression-tested.
> This document preserves the pre-fix evidence. See WEBSITE_REVIEW_FIXES.md for the
> current implementation and verification results.

# Website Review - Current State

Read-only review of the current worktree. No functional source edits, real-account
mutations, .env reads, or production messages were performed. Reproduction scripts
and raw reports are in the session scratch directory. This report describes the
reviewed state, not a production certification.

## Conclusion

Core public flows pass the current automated suite and sampled browser checks,
but the site is not yet ready for unconditional sign-off. Six confirmed P2 flow
bugs remain, plus one conditional cross-origin deployment bug. No new P0/P1
finding was established in the reviewed scope.

## Findings

### 1. P2 - Account changes between tabs leave desktop account data stale

- `public/js/account.js:30` ignores profile events when the returned user ID differs
  from the ID loaded on initialization.
- `public/js/api.js:480` revalidates the current cookie and unlocks the private page,
  but does not reset the page controller when its owner has changed.
- Fixture reproduction using the real SDK/account template/controller: load A,
  switch the authenticated identity to B and dispatch focus. Cache becomes B,
  while the name input/email remain A and main is unlocked. Clicking Save sends
  A's name to `/api/user/profile` authenticated as B, overwriting B's name.
- Reinitialize/clear account-owned state on an identity change and prevent stale
  forms from mutating the replacement account. Add a cross-account tab regression.

### 2. P2 - Returning to the mobile tab cancels an active MFA setup

- `public/js/api.js:517` dispatches profile-updated after a focus refresh even when
  the account/avatar are unchanged.
- `public/mobile/js/tai-khoan.js:240` responds by loading the account again;
  `public/mobile/js/tai-khoan.js:37` clears sensitive enrollment/recovery state.
- Reproduced with the real three controllers and mock authenticated API: create
  MFA setup, then dispatch focus as when returning from an authenticator app.
  Enrollment changes from visible/secret-present to hidden/secret-empty and the
  confirmation button disappears, though the five-minute setup has not expired.
- Revalidate safely without resetting an unchanged account's active operation.
  Preserve clearing on actual identity/session loss, explicit cancel/collapse,
  expiry and appropriate page lifecycle boundaries.

### 3. P2 - Password change accepts passwords that login refuses

- `src/routes/apiRoutes.js:406` checks only minimum length for new_password;
  the mutation validator allows strings up to 1024 characters.
- `src/services/dbService.js:479` stores the new hash and revokes existing sessions.
- `src/services/identityService.js:195` rejects login passwords above 256 characters.
- Desktop input `public/tai-khoan.html:263` has no maxlength.
- Isolated backend reproduction: change to 257 characters succeeds; the hash
  matches, but subsequent login rejects the same password with 400. Recovery needs
  password reset/admin intervention. Enforce the same 6-256 policy on all writes.

### 4. P2 - SMTP failure produces a misleading registration retry loop

- `src/services/identityService.js:125` commits the account before mail delivery.
  Delivery occurs at line 128; failure cleanup at line 96 removes the token but
  leaves the account and creates no session.
- Reproduced with an in-memory DB/mail adapter: first request fails with 503 and
  asks to retry, second identical registration fails 409 email already used;
  the account exists with zero verification tokens.
- Login then resend can recover, but the registration UI does not explain this.
  Return a recoverable account-created/mail-pending state or otherwise make the
  retry contract consistent. No real SMTP or real account was used for this test.

### 5. P2 - Bare watch URL can select an empty Server

- `public/js/player-ux.js:13` defaults to Server 0. The cross-server fallback at
  line 17 only runs if an episode target exists.
- Fixture: first Server has no playable episodes, second has tap-1; visit a bare
  `/xem-phim/movie` or `/mobile/xem-phim/movie` with no history/query.
- Both real template/controller fixtures reproduce. Desktop creates no video
  and silently returns; mobile says the Server has no playable episode, although
  another Server is available. Manual Server selection recovers.
- Select the first playable Server when no explicit Server/episode/history can
  determine an initial episode; retain explicit-selection validation semantics.

### 6. P2 - Detail auto-next toggle updates an obsolete preference

- `public/js/detail.js:447` toggles only `TTPhim_auto_next`.
- `public/js/player-preferences.js:32` loads authenticated settings or prefers
  the newer guest record; watch uses that controller's auto_next value.
- Real detail/preferences fixture: toggle OFF, legacy key becomes false, actual
  guest auto_next remains true if TTPhim_playback_guest already exists. Logged-in
  server preferences likewise override the detail toggle.
- Use the shared preferences controller and confirmed persistence for both the
  displayed state and mutation. Cover logged-in and existing-guest preference cases.

### 7. P2 conditional - Cross-origin preferences PATCH is blocked by CORS

- `src/services/requestSecurity.js:32` omits PATCH from allowed methods;
  `src/routes/playbackRoutes.js:14` requires PATCH for preference updates.
- Reproduced trusted-origin preflight: Access-Control-Allow-Origin/credentials
  are present, but Access-Control-Allow-Methods omits PATCH. Browsers block save.
- Does not affect the canonical same-origin deployment tested locally. It affects
  configured trusted cross-origin browser clients. Align the CORS method allowlist.

## Verification Performed

- `npm test`: 424 total, 421 passed, 3 conditional skips, 0 failures.
- `npm run test:player-e2e`: 11/11 passed using isolated DB/server and generated HLS.
- `npm run test:security-e2e`: 1/1 passed using isolated accounts/mail fixtures.
- `npm audit --omit=dev`: 0 known production dependency vulnerabilities.
- Browser: 24 public-page cases at widths 320/390/820/1440; home, dedicated mobile
  home, ordinary/mobile catalogs, registration and help. No uncaught JS error,
  horizontal overflow or local HTTP failures in that matrix.
- HTTP: readiness/public pages 200, private account/library/admin/operations and
  admin alias redirected 302 with private no-store; avatar API required auth 401;
  nonexistent movie returned an honest 404/no-store.
- Local HLS vendor is served dynamically and returns 200; absence of a physical
  public/vendor file is not a missing-resource finding. Two supplied avatar WebP
  files return 200. Reviewed templates have no duplicate IDs.
- Poster failures seen once in a short-wait desktop sample did not reproduce
  after an eight-second retry (zero broken images/failed image requests). Not
  promoted to a confirmed bug.

## Production Gates / Limits

- `/sitemap.xml` currently returns 503 because local PUBLIC_ORIGIN is unset.
  This is intended fail-closed behavior; production needs its real HTTPS origin.
- SMTP diagnostic and production preflight inspect explicit process environment,
  not .env. This shell lacks production settings; that does not prove every live
  server setting is absent. No real send/receive, SPF/DKIM/DMARC or inbox acceptance
  was verified. Mail fixture tests do not certify production delivery.
- Real TLS/proxy/CORS/SSE, persistent/shared avatar storage, offsite DB+media
  restore, target-concurrency load and physical Safari/iOS/Android playback remain
  deployment acceptance work. Third-party provider policies remain external.
- Automated/browser geometry checks do not constitute user aesthetic approval.
