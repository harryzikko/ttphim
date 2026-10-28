# Mobile web and tablet layout review

## Scope and visual direction

The mobile web keeps CineViet's dark cinema palette and red primary action. The Netflix-inspired direction means artwork-first browsing, a clear play action, compact truthful metadata, horizontal poster rails and consistent touch geometry; it is not a Netflix clone or a new native app.

Reviewed pages: home, catalog/search, movie detail, watch, library and account. Desktop artwork/layout, stored account data, authentication rules, source selection and player recovery remain intact.

## Featured artwork

- A mobile viewport narrower than 768px and taller than it is wide uses the featured high-resolution TMDb poster (provider poster fallback).
- Tablet-width viewports (768px and above) and landscape phones use the existing landscape backdrop/thumb.
- This is viewport-based, not an iPhone/iPad name check; a narrow tablet split view can appropriately use the portrait composition.
- Explicit admin mobile/desktop banner overrides retain priority. `hero_mobile_custom` distinguishes a configured banner even when its URL equals the desktop image.
- Resize/orientation changes reselect artwork for the current movie without resetting the slide, favorite state or links. Responsive srcsets follow the selected poster/backdrop; stale srcsets are removed on fallback.
- Primary hero art remains contain-fit, never distorted or cropped. A separate same-image ambient extension and gradient support readable overlay copy.
- Phone hero is an inset rounded poster composition; tablet/landscape uses wider art and lower-left copy. There are still no trailer, slide-number or pause buttons.

## Concrete corrections

- Shared responsive stylesheet supplies consistent header/safe-area offsets, bottom-navigation clearance, touch targets, focus outlines, 16px inputs and browser zoom support.
- Library heading no longer starts underneath its fixed header. Header sizes are consistent across mobile pages.
- Catalog and saved-film grids use two columns on phones, four from 768px and five from 1024px, instead of giant two-column tablet posters. Empty/error messages span the grid.
- Home poster rails scale with the viewport and omit invented rating/quality/language defaults. Detail removes static exclusive-4K/top-1/98-percent claims; missing metadata is not filled with an invented year/duration/quality.
- Filter and episode sheets lock the background, contain overscroll, provide dialog semantics, hide closed sheets from keyboard interaction, support Escape/focus return and keep filter actions reachable. Tablet sheets have a bounded width.
- Short-landscape player height fits the viewport, while portrait/tablet playback remains 16:9. A visible outside-player "all episodes" action opens the existing episode sheet for iframe playback too.
- Downloads no longer contains fabricated offline movies, storage totals or fake deletion success. The existing tab shows an honest unsupported-on-web state and does not offer clear-all. The unimplemented detail download action is disabled and labeled.
- Library tabs synchronize the URL and bottom-navigation active state. Destructive controls have accessible names and larger touch targets.
- Account notification uses the shared handler, shortcuts use two columns after unsupported items are removed, empty legacy settings groups disappear, and missing avatars have a fallback.
- The nonfunctional header Cast shortcut is hidden; no actual Cast/AirPlay support is claimed.

## Verification

- Full `npm test`: 306 total, 303 passed, three conditional skips, no failures.
- Player E2E: 11/11 passed using its isolated database/server and generated media.
- Edge responsive acceptance: 36 page/viewport combinations covering all six pages at 320x740, 390x844, 844x390, 768x1024, 820x1180 and 1024x768. Checked horizontal overflow, header clearance, grid column counts, hero image aspect/source selection, rotation/current-slide preservation, non-overlapping hero actions/navigation, sheet background lock/Escape, download-tab state, account shortcuts and landscape player height. No page errors.
- Browser mutation/API scenarios use intercepted fixtures, not real account/library writes. Protected account/library HTML is loaded from the actual templates inside isolated contexts.
- Separately loaded the actual local home with real pinned-film data at the same six sizes. Confirmed poster vs backdrop, complete aspect ratio, image bounds, header clearance, action/navigation separation, no overflow and next-slide behavior.
- Saved Edge screenshots and machine-readable reports are session scratch evidence. The built-in browser panel could not provide a reliable final screenshot/viewport inspection; visual parity is not claimed from that tool.

## Remaining device validation

Real Safari/iPhone/iPad, Android browsers, safe-area hardware, virtual keyboards, native casting and production hosting were not certified in this local Edge run. Embedded-player capabilities and restrictions still belong to the provider. Offline film download is not implemented.

## Main files

- `public/mobile/css/responsive.css`
- `public/js/hero-artwork.js`
- `src/services/featuredArtwork.js`
- `public/mobile/js/{home,mobile-app,chi-tiet,danh-sach,xem-phim}.js`
- Six mobile page templates and the shared artwork helper version in the desktop home template
- `tests/mobile-responsive.test.js` plus existing artwork/frontend/account/search/player tests

## Regular-home portrait regression correction

The previous acceptance matrix covered /mobile but missed the regular home template retained by desktop view preference or a desktop user agent in a narrow viewport. That template still selected a landscape backdrop and its old tall copy-first mobile CSS, reproducing the user's screenshot.

- Both home templates now load public/css/hero-phone.css after their base styles. Portrait viewports below 768px select posters regardless of template or view preference; tablet/desktop still use landscape art.
- The shared phone composition uses a bounded poster stage, lower centered copy, a 24..28px two-line title, three aligned 44px actions, and compact navigation. Desktop-only genre/metadata/excerpt rows and the visible progress strip are suppressed on portrait phones. Primary artwork remains uncropped and explicit admin images remain preferred.
- At 352x780, both actual local routes selected posters, measured 494px hero height (regular home was about 644px before), 24.64px title size, 44px action height, and 18px separation before navigation.
- Verified 14 real-home route/viewport combinations: both templates at 320/352/390/430/768/1024/1440 widths, including switching through the pinned films at 352px. No page errors, horizontal overflow or action/navigation overlaps; tablet/desktop remained landscape. Full suite: 304 passed, three conditional skips (307 total). Artwork helper is 3.3.0; shared phone CSS is 1.0.0.
- The built-in screenshot panel remains unreliable; saved Edge captures and measured browser checks are the verification evidence, not an asserted successful panel screenshot inspection.

## Compact phone home sections

- Added home-phone.css 1.0.0 to both home templates. Below 768px only, latest updates display six films in a two-column grid. Existing cards/data remain available, so tablet/desktop counts and resize restoration are unchanged (12 regular-home latest cards; existing 15-card mobile rail above the phone breakpoint).
- Regular-home phone section titles now use shorter labels, with desktop copy preserved in separate CSS-selected spans. Long descriptions, decorative heading icons and rail arrow buttons are suppressed on phones; browse-all links and horizontal rail scrolling remain available.
- Phone poster rails have consistent smaller cards/gaps, and Top 10 keeps its data/order with smaller monochrome rank numbers and reduced glow/shadow. Region/genre showcases become short horizontal cards; both tabs remain functional.
- The regular-home promotional panel is condensed to a heading, short copy and browse action on phones; its desktop content/layout remains unchanged. At 320px its measured height is 204px; region cards measure about 170px high.
- Verification: 12 real local route/viewport checks across both home templates at 320/352/390/600/768/1440 widths; exactly six visible latest films below 768px, original counts above it and on resizing, no page-width overflow, working region/genre tabs and rail scrolling, single-line regular-home phone section headings and compact promo. Full npm test: 306 passed, three conditional skips (309 total). Both local home URLs returned HTTP 200 and loaded the new CSS. No account/library/source mutations.

## Movie detail and watch pages on phones

Reviewed both ordinary templates retained by desktop view preference and dedicated /mobile templates. Added movie-phone.css 1.0.0 to all four pages; its phone rules do not replace desktop styling.

- Detail: 88x132 poster beside the title, compact metadata, a full-width 48px watch action and three aligned 48px favorite/follow/share actions. Unsupported/deep-link download controls are not offered in the phone action row. A visible episode/source anchor avoids scrolling through all secondary content. Decorative poster badges/statistics and redundant title badges are suppressed on ordinary phone detail.
- Ordinary detail synopsis has a real expand/collapse button with aria-expanded instead of hover-only expansion. The dedicated mobile synopsis exposes matching accessible state. Server/episode/related/comment controls receive phone spacing and touch sizing without changing existing IDs and controller selector classes.
- Fixed an in-scope ordinary detail bug: changing a source referenced an out-of-scope watchBtn. Source selection now updates the main watch URL to the selected source/episode; a regression test covers it.
- Ordinary watch: compact header, full-width phone player, deliberate controls grid retaining play, rewind/forward, next, mute, fullscreen, quality and speed. Volume slider and PiP do not compete for phone-width space. Speed/quality menus scroll inside the player. Short landscape hides the global site header, uses a 44px watch strip and constrains player height to the remaining viewport.
- The existing ordinary episode/party aside is moved (not copied) before film info/comments below 768px, with quick episode/party links below source controls. Wide layouts restore the same node to its original location, preserving handlers, fields and state. Party modal forms are viewport-bounded/scrollable and inputs have explicit labels. Comments wrap rather than squeezing headings/counts/sort actions onto one line.
- Dedicated mobile watch: active-episode centering scrolls only the horizontal episode list, not the document. Overlay spacing no longer clips 320px controls; focused controls do not auto-hide. Outside-player episode sheet exits wrapper fullscreen first and focuses its close action after visibility changes, retaining shared scroll lock/Escape/focus return. Server/episode/favorite/comment controls have 44px targets and accessible input/favorite state.
- SSR's metadata/genre/watch-info patterns accept the added IDs, and tests assert the layout hooks survive server rendering.

Verification: full npm test 310 passed, three conditional skips (313 total); real-HLS player E2E 11/11 on isolated generated media/database. Additional Edge acceptance covered 20 template/page/viewport cases at 320x740, 390x844, 844x390, 768x1024 and 1440x1000 with local multi-track HLS and intercepted account/history APIs: no page errors/overflow, poster and CTA geometry, aligned actions, source changes, synopsis expansion, visible episode anchor, unclipped playback controls, speed selection and menu bounds, correct landscape height/no auto-scroll, episode sheet focus/Escape. Four more isolated iframe cases at 390 portrait/844 landscape passed layout and sheet/party-modal checks. All four actual local detail/watch URLs returned HTTP 200 with the new stylesheet after the local SSR server restart.

At 320/390px, ordinary detail's watch action begins at approximately y326/y272; dedicated mobile at y323. Ordinary landscape player measures y44..390 in a 390px viewport; dedicated mobile y12..390, with document scroll remaining zero. No real account/library/history mutations were made. Embedded-provider internal controls and actual Safari/iPhone/iPad keyboard/fullscreen behavior remain device/provider validation, not certified by these Edge checks. Saved screenshots/geometry reports are session scratch evidence; no successful built-in screenshot-panel inspection is claimed.

## Song Ngu embed play-button obstruction fix

- Reproduced on the real ViCDN embed for Ga Kim Thoa (tv-300146-1, episode 1) at 352px touch-phone width. The provider loaded HTTP 200, its playlist loaded and video reached readyState 4, but CineViet's overlay guidance placed the "hide guidance" button over the provider's central Play control. Touch attempts timed out with that exact parent-page button intercepting the pointer. A duplicate mobile "using embed" toast also transiently covered the right side of the iframe.
- Both watch templates now provide a separate hidden embed-help region below/outside the clipped video viewport. Shared createStatus accepts this host only for embed-help state; loading/error/autoplay confirmation keep their existing behavior. Hide-guidance and change-server actions remain available below the frame. Ready/source cleanup hides the external region and restores the status panel to its original player container; ordinary embed cleanup avoids stale notices. Removed only the duplicate informational mobile toast.
- The ordinary notice sits after the SSR player-replacement boundary so it survives renderWatch. Added regressions for parent ownership/state transitions, action callbacks, hide/ready/error behavior, template structure and SSR survival.
- Verification: full suite 313 passed, three conditional skips (316 total); player E2E 11/11. Twelve isolated Edge route/viewport checks covered both templates at 320/352/390/844/768/1440 widths, nine iframe hit-test positions, actual iframe Play tap, HLS/embed switching, notice cleanup and no duplication/page errors. Separately replayed the real Song Ngu episode on both local watch routes at 352px: all nine parent hit tests resolved to the iframe, provider video became unpaused and time advanced beyond two seconds using ordinary touchscreen input, without manually hiding guidance. API/history mutations were intercepted.
- The ViCDN player may open an external advertising tab on the first tap and remain paused; the observed second Play tap after returning/closing it started playback. This provider-owned behavior is not altered or bypassed. A successful iframe load is still not claimed as universal playback confirmation; real Safari/device and all-title/provider availability are not certified.
- Assets: player-ux JS 1.6.0, player-ux CSS 1.2.0, ordinary watch 3.6.0, mobile watch 1.8.0. No provider URLs, account data or fallback consent policy were changed.

## Catalog and category phone layout

- Both ordinary /kham-pha (including desktop view preference at phone width) and dedicated /mobile/kham-pha use catalog-phone.css and catalog-layout.js 1.0.0. Smaller headings, 44px search controls, single-row scrollable type chips and two-column cards replace the tall phone introduction/filter stack. Advanced ordinary filters collapse below 768px with count/summary, inert/aria-expanded, Escape/focus return and apply-to-close; wide layouts restore controls without clearing filters. Dedicated mobile keeps its existing accessible draft/apply/cancel sheet.
- All seven type choices are present on both templates. Titles use actual category/country names; keyword search has a distinct heading. Fixed ordinary result-count updates overwriting active tags, and the mobile cinema alias not selecting its chip. Search/API/query/history/pagination contracts remain intact.
- Verification: 16 Edge viewport/template cases (320/352/390/740 landscape/768/820/1024/1440px), 18 type/category/country title cases, phone filter open/Escape/apply/resize, mobile draft cancel, page 2/Back/reload with complete filters. No horizontal document overflow or pageerror. At 352px, grid top is y360 ordinary/y353 mobile. Nine live category/alias GET checks return 200 with correct destinations. APIs in browser interaction checks are intercepted; no account data mutation.
- Full npm test: 326 passed, 3 conditional skips (329 total); syntax checks and footer generator check pass. Desktop panel screenshot inspected; saved phone captures could not be visually inspected because the panel screenshot tool repeatedly timed out. Actual Safari/iPhone/iPad and hardware keyboard/safe-area behavior remain unverified.
