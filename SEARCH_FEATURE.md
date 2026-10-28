# Search/filter desktop + mobile (feature 4)

## Implemented

- Search folds Vietnamese accents, including d-stroke (U+0111/U+0110), case and decomposed Unicode; checks Vietnamese title, original title and slug. Original non-Latin letters are retained by search normalization. Identity matching used by bilingual playback is unchanged.
- KKPhim keyword lookup combines the original query and an accent-folded query when different. If those return no local matches, scans at most two browse pages and only returns titles that actually match. This is not a full-catalog index.
- Type, category, country, year and format are intersected before paginating bounded search results. Bilingual matches are merged/deduplicated before pagination, not appended only on page one. Song Ngu remains ViCDN-only and supports category/country/year/format plus indexed title search.
- Both controllers persist keyword (including q alias), type, category, country, year, sort, format and page in the URL. pushState/popstate restores navigation; reload uses the URL. Stale responses cannot overwrite newer results.
- Mobile now uses explicit previous/next pages rather than append-only Load More. A direct/reloaded page shows that page, not a fabricated reconstruction of earlier pages. Filter-sheet changes are drafts until Apply; cancel discards them.
- Empty results stay empty. Suggestions offer original/Vietnamese titles, removing filters while retaining keyword, and Retry. Provider failures show a separate retry state; failed and empty search responses are not cached as successful results.
- Provider strings are escaped at HTML sinks, image protocols restricted to HTTP(S), navigation slugs encoded. Existing desktop escaping is retained; mobile results/metadata now get equivalent protection. Hard-coded result ratings are removed.
- Catalog controllers now use ordinary version 4.1.0 and dedicated mobile version 4.2.0, with shared catalog-layout.js/catalog-phone.css 1.0.0. Existing query/API contracts remain unchanged.
- The desktop catalog route now serves a loading shell and lets the escaped controller fetch results once. This avoids unsafe raw provider/query SSR interpolation and the old fabricated 12,450 fallback total, without changing the shared template service. JavaScript is required for catalog results; a noscript notice explains this.

## Explicit bounds and limitations

- No full KKPhim index/provider-wide accent-insensitive guarantee is available. Each original/folded query reads at most four pages of up to 60 requested items; fallback reads at most two pages. Providers may impose smaller pages. Pagination totals for these merged results describe only the scanned set, not the entire provider catalog. Responses and UI disclose this scope.
- Plain browsing with zero/one filter uses upstream pagination. Combined filters use bounded scans of the selected type/category/country browse endpoint, plus local intersections. Titles absent from those responses cannot be discovered or fabricated.
- ViCDN's existing synchronizer reads seven update pages and five genre pages, not the full catalog. Unverified documentation seeds remain available to existing identity matching but are excluded from search/catalog results until returned by a provider. Failed sync preserves the previous verified index, exposes partial status, and retries on a later search with a five-second minimum interval. A cold sync or direct slug lookup may still wait for the existing provider deadlines.
- Format now passes through the shared API route and filters before pagination on both sources. Metadata is provider-declared, not a measured playback resolution. Missing year/quality/language is not invented to satisfy filters; unknown metadata does not match a specific format.
- Sort values map to provider modified time/view/IMDb/year fields; bounded merged results sort locally where numeric metadata is present. Missing ratings/views are not invented. ViCDN supports index order/year, not fabricated popularity or ratings; UI states that limitation.
- Positive merged snapshots: 60-second TTL, at most 100 search entries, coalesced concurrent identical queries. Search fetch deadline is two seconds per provider page, with a maximum ten KKPhim page requests per uncached query. No background full-catalog crawl is added.
- No real DB/account/banner data is used by mutation tests. Edge integration uses a temporary server/DB and mock providers; production provider completeness is not asserted.

## Isolated verification

Run from the project root:

```powershell
node --check src/services/kkphimService.js
node --check src/services/vicdnService.js
node --check public/js/catalog.js
node --check public/mobile/js/kham-pha.js
node --check src/routes/viewRoutes.js
node --test tests/search-feature.test.js tests/bilingual-nav.test.js
node --test --test-name-pattern='catalog search/filter' tests/frontend-security.test.js
```

The new suite evaluates services in VM contexts with mock configuration/providers, bypassing constructors that sync remotely. UI tests use JSDOM, actual owned HTML/controllers and mocked API calls; no real database, dotenv load, server or network is required. Coverage includes accents/d-stroke/NFD, Vietnamese/original names, combined filters, bounded scans, deduplication/pagination, provider outage/retry, actual history.back/reload, late-response races, mobile sheet cancel/apply, Song Ngu isolation, and hostile HTML/image/slug input.

## Integrated acceptance

- Full test suite: 238 pass, 3 conditional skips; player E2E 11/11 and security E2E 1/1 run separately.
- Edge desktop 1440px/mobile 390px: Vietnamese accent-insensitive and original-name search, format intersection before paging, page 2, Back and reload retaining all filters; empty suggestions and relax retaining keyword; outage/retry distinct from empty. No pageerror; measured pages fit the viewport.
- Search feature suite includes format-before-pagination and unknown-quality cases, in addition to the isolated checks above. No full-provider index, native-device or production hosting certification.

## Catalog phone presentation review

- Reviewed ordinary /kham-pha at phone widths as well as /mobile/kham-pha. Shared phone CSS makes the heading/search compact, keeps type choices in a single horizontally scrollable row and uses a two-column movie grid. All seven type choices, including Song Ngu and TV Shows, are available on both templates.
- Ordinary advanced filters collapse below 768px, with an explicit button, applied-filter count, summary, aria-expanded, inert state, Escape/focus return and apply-to-close. Wide screens restore the full panel without clearing values. Without the helper the advanced controls remain visible; query controllers remain authoritative.
- Titles reflect movie type, genre or country using actual metadata names; keyword search has its own results heading. Metadata is rendered as text, not trusted HTML. The cinema alias also selects the existing mobile cinema chip.
- Fixed the ordinary count selector accidentally matching/replacing the entire results bar. Dedicated IDs now keep the count and removable filter tags independent; removing a country retains other filters and keyword.
- Edge acceptance: 16 layout cases across both templates at 320, 352, 390, 740 landscape, 768, 820, 1024 and 1440px, plus 18 type/category/country cases. No horizontal page overflow or pageerror. At 352px the grid starts at y360 (ordinary) / y353 (mobile), with 44px search inputs. Tested phone collapse/Escape/apply/resize, mobile draft cancellation, page 2/Back/reload preserving all filters. Catalog APIs are intercepted with read-only fixtures; real category aliases also returned HTTP 200 and correct destinations.
- Full suite: 326 passed, 3 conditional skips (329 total). Footer generator check remains unchanged. Edge screenshots are saved in session scratch; desktop was inspected through the browser panel, but repeated panel screenshot timeouts prevented confirming the saved phone screenshots visually. Real Safari/iPhone/iPad/hardware remains unverified.
