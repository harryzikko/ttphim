# Login-required feature access fix

## Confirmed defects and fixes

- Mobile account logout previously only redirected the browser; the HttpOnly server session remained active. The mobile controller now verifies API.getMe, uses real profile/library data, calls API.logout and navigates only on confirmed success. Fake local profile edits/statistics/settings no longer impersonate account actions.
- POST /api/comments/:id/like lacked requireAuth. It now returns 401 for guests/invalid sessions. SDK/detail/watch handlers update the count/liked state only on confirmed success, redirect on 401 and allow retry for network failures.
- Account/library pages were directly accessible through both clean URLs and .html static aliases. pageAccess runs before viewRoutes and express.static, validates the real session, redirects guests to auth with a return path, and rejects non-admin access to admin/operations HTML. Private HTML and /api/user responses use private,no-store.
- Cached kk_user is display data, not authorization. Detail watchlist actions verify the real session. SDK clears the cache on 401; private pages recheck on pageshow/focus/visibility return and lock actions when session verification fails.
- API.logout now rejects failed envelopes and preserves the cached confirmed profile on a non-401 failure. Mobile/header show failure instead of claiming logout success. Successful logout revokes captured cookie/bearer sessions on the existing backend.

## Preserved behavior

Public movie browsing, playback, search, and device-local guest progress/playback settings remain public. Account sync, watchlist/history APIs, follows/notifications, profile/password, ratings/comments/replies/likes and Watch Party mutations require a valid server session. Reporting playback faults and aggregate views retain their existing public behavior; no new paywall or site-wide login requirement is introduced.

## Verification

- Full npm test: 257 pass, 3 conditional skips (260 total).
- tests/access-control.test.js covers 24 API paths with absent/forged tokens, private clean/static/encoded aliases, member/admin distinction, unchanged private records, confirmed authorized mutations, and captured-cookie/bearer revocation after logout.
- tests/mobile-account-auth.test.js covers fake cached guests, auth outage/retry, honest profile/statistics, session expiry and confirmed profile/logout actions with isolated JSDOM fixtures.
- Edge integration on temporary DB/server/account: forged local profile cannot open private pages/save a movie; failed mobile logout retains the valid session and page; real mobile logout revokes the session; Back/direct .html URLs require login again. No pageerror.
- Security E2E 1/1 and player E2E 11/11 passed separately. No real-account/history/banner mutation by tests.

Production deployment and real-device re-verification are separate. Local server remains on localhost:3001. Existing open tabs may require a reload to obtain updated JavaScript; backend checks protect API/private-page access independently of that client refresh.
