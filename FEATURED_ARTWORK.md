# Featured artwork from TMDb, without cropping

## Behavior

- Featured movies retain TMDb identity from provider detail metadata. An explicit valid ID/media type has priority. For artwork only, missing IDs may be resolved from a single exact original-title + release-year + known movie/TV-type match; ambiguous, partial or wrong-year matches are refused. This does not mutate provider IDs or change the strict ID-only rating feature.
- TMDb Images API supplies original backdrop/poster candidates. Backdrops must be landscape, posters portrait, with valid image paths/dimensions. Selection prioritizes original pixel area, then textless art and vote count for ties. Available original resolution varies by title; the implementation does not invent or upscale 4K.
- The original image URL and responsive TMDb sizes are available to the browser. Confirmed images cache for 24 hours, confirmed missing art for 15 minutes, temporary errors for 30 seconds; matching concurrent requests share work. The image-metadata request deadline is 2.5 seconds.
- Desktop SSR and /api/home use the same prepared artwork. Mobile receives the prepared API data. Existing provider images remain browser fallbacks; failed TMDb images retry the provider image once and discard the stale srcset. If both images fail, the stage shows an honest unavailable state.
- Manual desktop/mobile featured-banner image overrides retain priority. Their srcsets never come from a different TMDb image. Existing banner copy, order, schedules, ads and normal movie-card artwork remain unchanged.
- The latest reference-led hero uses a full-width backdrop stage beneath overlay content: a large title and concise metadata/description/actions at the lower left, carousel controls at the lower right. It no longer uses a side-by-side column or framed image. Primary artwork retains contain-fit, while the ambient extension fills spare ratio area; readable gradients follow the supplied cinema-banner reference. Mobile has an overlay feature composition without the old bordered card.
- Desktop/mobile carousel navigation remains available without visible slide numbers or pause buttons; reduced motion, hidden documents and focused controls stop automatic rotation. Desktop hover also pauses rotation. Empty/single-slide states stay usable.

## Implementation

Backend: src/services/tmdbService.js, featuredArtwork.js, homePageService.js, templateService.js plus spotlight ID preservation in kkphimService.js and /api/home integration.
Frontend: public/css/hero-artwork.css, public/js/hero-artwork.js, desktop/mobile home controllers and templates. Standalone CSS avoids modifying unrelated generated Tailwind output.

## Verification

- Latest hero-v2 full npm test: 294 passed, three conditional skips (297 total).
- 19 focused backend/DOM artwork tests: identity/resolution selection, strict unique title/year/type fallback, cache/coalescing, timeouts/fallback, custom overrides, nonmutation, SSR attributes, safe text, responsive selection and carousel state.
- Isolated Edge integration at desktop 1440/1920/768 and mobile 390/320: real TMDb backdrop, SSR preloaded first image, contain/no transform, copy below artwork, no page-width overflow, broken TMDb image falls back to a complete portrait image, manual image preserved and next-slide controls work. No pageerror.
- Live TMDb movie ID 550 and TV ID 304452 returned 3840x2160 backdrops and 2000x3000 posters during the check. This is evidence for those images, not a guarantee all titles have that resolution.
- Mutation tests use temporary settings/database and generated corner-marked SVGs. No real pins/banner/account/history are changed. Real-device Safari/iPhone/Android and production hosting remain separate validation.

Local pinned-title verification also resolved all seven currently featured titles using exact metadata and obtained TMDb backdrops. Four returned 3840x2160 originals; the remaining originals were 1426x803, 1920x1080 and 2048x1153. Smaller originals are not advertised as 4K or artificially upscaled.

Hero v2 redesign acceptance: independently checked current pinned TMDb images in Edge at desktop 1920/1440/768 and mobile 390/320. Primary images use contain, hero height is bounded, pages do not overflow horizontally, and next-slide navigation works. Desktop was also visually inspected in the built-in browser. CSS/helper are version 2.0.0; desktop controller 3.2.0 and mobile controller 1.5.0. No settings, pinned movie order or account data changed.

Reference-led hero acceptance: CSS 3.1.0/helper 3.0.0; full suite 294 pass/3 conditional skips. Edge checks cover desktop 1920/1440/1024/768 and mobile 390/320, full-width background, contain-fit primary image, lower copy placement, no horizontal overflow, functioning carousel and non-overlapping action/navigation groups (including the 768px breakpoint). Header, film rails and stored settings remain unchanged.

## Feathered image seam correction

- Sharp artwork is sized to its actual contain-fit rectangle and aligned right (desktop) or centered (mobile). Left/right/bottom edge masks soften only its boundary against a blurred same-image extension inside the same slide. The previous stage-wide ambient layer is removed, preventing inactive slides from changing the backdrop extension.
- Image dimensions and feather distances update on load, source fallback and resize. Desktop title is smaller and limited to two lines; unavailable metadata such as N/A is omitted on desktop/mobile without changing real quality/language values.
- Assets: CSS 3.2.0, helper 3.1.0, desktop home 3.3.0, mobile home 1.6.0. Full suite: 296 pass, 3 conditional skips. Edge verified 1870/1440/768 desktop and 390/320 mobile, correct per-slide ambient source, preserved aspect ratio, resize/carousel, uncluttered metadata and no page errors.
- Pixel check of the saved 1870px Edge screenshot across the previous left seam (x=394) found maximum neighboring RGB-channel deltas of 0..2 at six sampled rows. Built-in screenshot preview timed out; actual Edge screenshots and geometry/pixel checks completed independently. No changes to real pinned data or user history.

## Simplified hero actions

- Removed the desktop slide counter and desktop/mobile pause controls. Previous/next arrows and desktop slide indicators remain; mobile heading no longer includes a slide number.
- Trailer buttons start hidden and are updated on every slide. Only nonempty absolute HTTP(S) trailer URLs without credentials are accepted; invalid YouTube IDs and unsafe schemes are rejected. YouTube links use canonical embeds. There is no fetch-on-click placeholder for missing trailers. External availability or embedding permission is still controlled by the trailer host.
- Desktop/mobile saving now uses a heart and the label "Yeu thich" (localized in the UI). Existing watchlist API/storage remains unchanged. Real session/library lookups set the heart state, writes are confirmed before changing it, duplicate submissions are blocked, and switching slides cannot apply a result to another film. Guests are directed to sign in; account lookup/write errors do not show false success.
- Assets: CSS 3.3.0, artwork helper unchanged at 3.1.0, shared hero-actions 1.0.0, desktop home 3.4.0, mobile home 1.7.0.
- Verification: 26 focused tests passed; full npm test 299 passed, 3 conditional skips (302 total). Edge isolated API scenarios passed at desktop 1440/768 and mobile 390/320: trailer visibility/open/close, saved heart state, pending save across slide changes, no horizontal overflow or page errors. Live artwork/resize/carousel checks also passed at desktop 1870/1440/768 and mobile 390/320. Local HTTP 200 serves the new resources without the removed controls. No real account/library mutations were made.

## Trailer removal and detail action icons (latest)

- Removed all trailer entry points from desktop/mobile home and detail pages, including Trailer HD, both mobile detail buttons and unused trailer modals/controllers/styles. Provider trailer metadata remains unchanged; the previous conditional-trailer behavior is superseded.
- Detail watchlist actions now use a persistent favorite heart, outlined when unsaved and filled after a confirmed save. The accessible label describes favorite/unfavorite; mobile also uses the server-provided initial inWatchlist state.
- New-episode follow remains independent from favorites and now uses a 46px circular bell, outlined when off and filled when following, with tooltip/accessibility labels and existing confirmation/error handling.
- Resources: hero CSS 3.4.0, hero-actions 1.1.0, desktop home 3.5.0, mobile home 1.8.0, desktop detail 3.1.0, mobile detail 1.3.0, follow JS/CSS 1.1.0.
- Verification: full npm test 300 passed, 3 conditional skips (303 total). Edge desktop 1440/768 and mobile 390/320 passed absence-of-trailer, initial favorite state, favorite/unfavorite, follow/unfollow, 46px bell target, no horizontal overflow and no page errors. Browser mutations were intercepted, never written to real account data. All four actual local home/detail URLs returned HTTP 200 with updated templates and no trailer buttons.

Follow-button visual refinement: follow JS/CSS 1.2.0 keeps the same outlined bell and neutral surface background/border in both states; only icon color changes when following. Successful status messages remain available to screen readers but no longer occupy layout space; errors remain visible. Verified 19 focused follow/detail tests and Edge 1440/768 desktop plus 390/320 mobile: unchanged background, border, position, wrapper dimensions and icon fill across toggle, changed icon color, no page errors. Both actual local detail URLs returned HTTP 200 with 1.2.0 assets.

Detail action alignment (CSS 1.3.0): desktop play CTA and all four circular actions now share a 52px height; circles are exactly 52x52 with centered 22px icon boxes and 10px gaps. Neutral backgrounds/padding/borders are shared, and hover/active scaling no longer misaligns the row. Mobile icon circles also share 52px geometry and top alignment. Edge geometry checks passed desktop 1440/1024/768/390 and mobile 390/320, including equal circle tops/gaps, centered icons, no horizontal overflow and no geometry change after follow. All 19 focused follow/detail tests passed. Actual local movie detail measured all five desktop controls at y=450, height=52, with 52px circles spaced 10px; desktop/mobile returned HTTP 200 with CSS 1.3.0. Built-in screenshot timed out, so no successful visual screenshot inspection is claimed.

Mobile/tablet refinement (latest): on the mobile web, portrait viewports below 768px use the high-resolution poster; tablet and landscape viewports retain landscape backdrops. Explicit admin artwork remains authoritative via hero_mobile_custom. Rotation reselects the current slide's source without resetting the carousel. New mobile responsive CSS supplies the inset portrait composition and wider tablet layout while desktop stays unchanged. See MOBILE_WEB_REVIEW.md for the six-page audit, concrete fixes and bounded verification: 303 full-suite passes/3 conditional skips, player E2E 11/11, 36 isolated Edge page/viewport checks and six live-artwork checks. Real Safari/iPhone/iPad validation remains separate.
