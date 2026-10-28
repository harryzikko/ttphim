> Resolved: both residual findings below have now been fixed and regression-tested.
> The evidence below is retained as the pre-fix snapshot. Current verification:
> 455 tests total, 452 passed, 3 conditional skips, 0 failures; HLS E2E 11/11 and
> security E2E 1/1 passed. See the remediation notes at the end of this document.

# Post-Fix Website Recheck

## Confirmed Residual Findings

### P2 - Incorrect mobile MFA credentials are treated as session expiry

`public/mobile/js/account-security.js:71` propagates a 401 from setup/disable to
the outer account action, which redirects to login and clears/hides the profile.
The identity service uses 401 for an incorrect current password or incorrect MFA
disable code without revoking the valid session.

Reproduction with the real SDK, mobile template and both controllers: return a
401 IDENTITY_ERROR for MFA setup with a mistyped password, while /api/auth/me
still returns the same valid user. The page displays 'Vui long dang nhap de quan
ly tai khoan' and hides the profile. The subsequent getMe still confirms that
same account. Treat credential validation separately from actual session loss,
or revalidate the session before logging the user out. Cover both setup and
incorrect disable-code paths.

### P2 - Detail auto-next keeps the identity captured on initial load

`public/js/detail.js:463` creates PlayerPreferences using the initial getMe user.
The shared preferences controller captures that user when selecting account API
versus guest storage. Focus/storage/auth changes do not replace the detail
controller.

Reproduction with the real detail template/controller and preferences helper:
load as guest, sign in elsewhere, dispatch focus and kk_user storage events,
then toggle auto-next. There is only one identity lookup, zero preference API
requests, and TTPhim_playback_guest is changed instead of the account preference.
The inverse logout transition retains a protected-account controller. Revalidate
identity before saving and rebuild/reload preferences on owner changes, retaining
confirmed-save, busy, retry and stale-callback protections.

## Checks Repeated

- npm test: 447 total, 444 passed, 3 conditional skips, 0 failures.
- HLS player E2E: 11/11 passed; account/security E2E: 1/1 passed.
- Production dependency audit: zero known vulnerabilities.
- Live public browser matrix: 24 cases, widths 320/390/820/1440; no uncaught JS,
  horizontal overflow or local HTTP failures in the sampled cases.
- Readiness/public pages returned 200, private pages redirected with private
  no-store, protected avatar API returned 401, nonexistent movie returned 404.
- CSS and supplied-avatar asset checks passed.
- Prior seven fixes have passing regressions; the two transitions above were not
  covered by those cases. No functional source edits or real-account mutations
  were performed during this recheck. Probes used in-memory/mock identities.

## Conclusion And Limits

The sampled standard flows are stable, but do not sign off as completely fixed
until the two residual findings are resolved and tested. Production SMTP/inbox,
TLS/proxy, persistent media/offsite restore, load and physical-device acceptance
remain separate. Local sitemap is still 503 without PUBLIC_ORIGIN. The explicit
process-env preflight does not inspect .env or certify production configuration.

## Residual Remediation Completed

- Mobile security revalidates the authenticated session after an operation's 401.
  A wrong setup password/disable code with a still-valid account is displayed as
  a correctable error; actual session expiry/change still locks and clears secrets.
- Detail auto-next revalidates ownership on focus, storage/auth/profile changes,
  visibility/BFCache return and before each save. It rebuilds the shared controller
  for guest/account changes, preserves the appropriate preference store, and does
  not silently apply a stale click to a different owner. Load/save errors remain
  retryable and old-page/controller callbacks cannot update the current UI.
- Added guest-to-account, account-to-guest, no-focus owner-change and identity
  outage regressions. Added wrong-MFA-credentials versus real-expiry cases.
- Chromium integration in tests/residual-flows-browser.test.js uses real identity
  service/session cookies with in-memory DB and fake mail: cross-tab preference
  ownership, wrong setup password followed by successful TOTP enrollment, wrong
  disable code followed by successful recovery-code disable, all passed.
- Full npm test: 455 total, 452 passed, 3 conditional skips, 0 failures. HLS E2E
  11/11 and security E2E 1/1 passed; generated CSS check is current. Controller
  includes are versioned detail 3.7.0 and mobile account-security 1.2.0.
- No real-account data, administrator credentials or production mail was changed.
  Production/hardware acceptance limits described above remain unchanged.
