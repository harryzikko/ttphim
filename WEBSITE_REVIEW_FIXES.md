# Website Review Remediation

All six core findings and the conditional CORS finding from
WEBSITE_REVIEW_CURRENT.md are fixed. Existing account data, administrator
credentials, MFA/signing keys, favorites, history and comments were not migrated
or edited for verification.

## Changes

1. Password writes share the 6-256-character policy: identity registration/reset,
   DB create/admin create/update/change and the change-password endpoint. Invalid
   changes do not write hashes, increment token versions, or clear the cookie.
   Desktop/mobile forms validate the maximum and expose maxlength=256. Legacy
   password verification/hash migration is preserved.
2. The SDK retains its server-confirmed account ID in memory and binds mutations
   with X-Account-ID. Middleware checks this against the authenticated account,
   returning 409 ACCOUNT_CHANGED on a stale owner. This is a consistency guard,
   never a substitute for cookie/token authentication; legacy clients omitting
   the header remain compatible. Public login/registration/recovery flows can
   intentionally change identities.
3. On a private account/library page, an observed identity change clears inputs,
   closes dialogs, hides/inerts the stale page, blocks further SDK mutations and
   reloads to fetch the new account. Focus/session validation cannot unlock the
   invalidated page. Both detected focus changes and a cookie race immediately
   before save are covered.
4. Mobile profile refresh now revalidates the same user without running the full
   loadAccount/clearSensitive sequence. MFA enrollment and one-time recovery codes
   survive returning from the authenticator app within the same active page.
   Explicit close/cancel, expiry, pagehide, identity loss/change still clear them.
5. Registration with configured but temporarily failing SMTP returns confirmed
   account creation with verificationPending=true and a tracked unverified-user
   session. It truthfully directs users to the account security resend action;
   failed verification tokens are still removed. Unconfigured production mail
   still fails before creating an account. Verified-email policy is not weakened.
6. Implicit player initialization chooses the first nonempty playable Server if
   the default is empty. Explicit Server selection, episode matching and matching
   history resume semantics remain unchanged. Desktop/mobile share this helper.
7. Detail auto-next uses PlayerPreferences.load/update, the same account/guest
   state as actual playback. Async loading and saving disable duplicate actions;
   failed saves retain the old value and report errors, with retries and stale
   route/controller protection.
8. CORS permits PATCH and the account-binding header for trusted origins; wildcard
   origins and relaxed cookie/Origin policy were not introduced.

## Verification

- npm test: 447 tests, 444 passed, 3 conditional skips, 0 failures.
- npm run test:player-e2e: 11/11 passed (isolated real HLS/Edge fixture).
- npm run test:security-e2e: 1/1 passed (isolated account/mail fixture).
- npm run test:production: 33/33 passed.
- New regressions: review-backend-fixes.test.js, review-account-fixes.test.js,
  review-account-browser.test.js, player-review-fixes.test.js; mounted API
  password/account-binding checks also added to backend.test.js.
- Chromium explicitly checks stale account reload, no accidental writes during
  identity/cookie races, mobile enrollment/recovery focus continuity and clearing
  after a real account change. JSDOM/service tests cover SMTP failure/resend,
  password limits, trusted PATCH preflight, guest/account auto-next and empty
  Server selection.
- CSS build passes; affected controller/helper URLs are cache-versioned.

## Remaining Production Acceptance

These code fixes do not certify production SMTP send/receive, real HTTPS/proxy,
physical mobile devices, expected-concurrency load, persistent/shared media
storage or offsite DB+media restore. PUBLIC_ORIGIN still must be configured for
production sitemap/canonical output. No production mail was sent, no .env was
read and no real account was mutated during testing.
