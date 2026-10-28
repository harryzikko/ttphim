# Episode source groups and scoped comments

## Source selection

- Ordinary and dedicated mobile detail/watch pages load `episode-sources.js` and its stylesheet (1.0.0).
- The UI separates provider-declared language groups, original server choices, and the existing episode list. Language classification uses server metadata/name only; unknown labels stay unclassified. Song Ngu/multi-language stays separate from subtitled/voice-over/dubbed groups; it does not imply actual tracks are exposed by an iframe.
- Server badges count unique episodes with an absolute HTTP(S) embed/HLS link. Empty/invalid-link entries and duplicate numeric aliases are excluded. This is a count of available links, not a network-certified playback count, expected season total or completed-series claim.
- Original server indices remain unchanged so watch URLs, recovery and stored source identity remain compatible. Selecting another source tries the same episode first; the existing player retains HLS resume/cross-origin limitations. Automatic failure recovery still requires consent.
- Detail watch actions follow the selected source and choose the first nonempty server initially. No-playable-episode actions are disabled rather than fabricating an available episode.

## Comments

- `comment-threads.js` / CSS 1.0.0 provide all/general/episode scopes on ordinary detail and both watch templates. Dedicated mobile detail has no comment composer; its watch page provides the discussion UI.
- Watch pages default to the current episode and post its slug even without a timestamp. Switching episode refreshes that scope and ordinary watch clears a timestamp attached to the previous episode. Existing comments without episode metadata remain in General / All; no migration of real comments is performed.
- Ordinary detail provides a separate episode/general choice for new comments. Filtering preserves the input draft. Late ordinary detail/watch requests cannot overwrite newer comment results.
- Spoilers are hidden with the HTML hidden state, not only blur; reveal controls expose aria-expanded/aria-controls. Replies belonging to a spoiler parent are hidden until explicit reveal as well. Reveal state resets on re-render; no confidentiality/security boundary is claimed for public comment API content.
- Existing API persistence (`episode_slug`, `is_spoil`) is retained; POST rejects non-string content and non-boolean spoiler values. Authentication, moderation, timestamp validation and ratings remain separate.

## Verification

- New JSDOM tests cover source classification/counts/original indices, hostile provider text, empty-source disabling, normalized episode scopes, drafts and spoiler/reply hide/reveal.
- Final integrated suite: 343 passed, three conditional skips (346 total). Twelve Edge movie-page cases passed again after the bounded review fixes; HLS E2E passed 11/11 again. Syntax checks, scoped diff check, footer generator idempotence and live SSR detail/watch GET checks passed. New regressions cover mobile episode-label/URL injection, spoiler timestamp episode ownership and grouped iframe-to-HLS saved progress. Real Safari/hardware validation and successful PlayEmbed playback remain unverified.
- Twelve isolated Edge page/viewport cases cover all four detail/watch templates at 352, 820 and 1440px: language/source switching, watch action/source URL, unique linked counts, comment scopes, hidden spoiler replies, real button reveal/re-hide, confirmed POST episode/spoiler payload, changing episode in-place and no horizontal overflow/page errors. Account/comment/history APIs are intercepted; no real data is mutated.
- Backend/community/player focused suite: 60/60; real local HLS player E2E: 11/11, using the existing isolated server/database/generated media runner.

## User-supplied OnFlix embed experiment

Exact URL: `https://playembed.vip/player/38a5c9a49cd804e8c59c86c66cf2b013/sub`.

- Tested this real URL as the sole embed in the ordinary and dedicated mobile CineViet watch templates from localhost:3001. Only movie/account APIs and template documents were intercepted; the original document security headers were retained and the third-party iframe loaded normally.
- Both requests returned HTTP 403; the browser reported `playembed.vip refused to connect`, no video element was available and playback was not verified. A separate ordinary public GET also returned 403 with `X-Frame-Options: SAMEORIGIN`.
- This is a provider-side rejection in this environment, not a successful new source. No proxy, fake Referer, CAPTCHA/anti-bot bypass or weakened site security was used. No embed was saved into a real movie/settings record and no general OnFlix crawler/provider was added.
- The result does not prove all PlayEmbed URLs fail everywhere; allowlisting/official embedding permission or a provider-supported integration would need separate validation.

## Compact UI revision (supersedes the initial presentation)

- Source controls now show only two compact rows, Ban xem / May chu, without numbered steps, nested frames or a long count disclaimer. Original source names remain in tooltips; generic language-only names are displayed as numbered servers. Counts and original server indices are unchanged. Phone option rows scroll horizontally within their own bounds and keep the selected option visible.
- Ordinary detail uses linked episode tiles instead of repeating the same movie artwork and overall language metadata for every episode. The watch sidebar uses keyboard-accessible compact episode buttons, a selected-state indicator and no fabricated fixed 4K/Full HD badges. Existing episode search, source switching and recovery remain.
- Detail and both watch composers use multiline textareas, a compact shared tool row, one spoiler checkbox and a distinct Send action. Enter adds a line; Ctrl/Cmd+Enter sends unless an IME composition is active. Comment filtering remains separate from the target of a new comment. Current episode is named in the watch placeholder/filter, duplicate visible counts are suppressed, and spoiler bodies/replies remain truly hidden.
- Shared episode-sources JS/CSS and comment-threads JS/CSS are now 1.1.0. Ordinary detail is 3.4.0, ordinary watch 3.8.0 and dedicated mobile watch 2.0.0.
- The separately added admin-curated collection feature has been removed at the owner's request: no editor/home mounts/assets/service/router remain. Existing secondary home sections are visible again. Stored settings were not migrated or deleted; any former collection key is unused.
- Verification: 20 isolated Edge page/viewport cases at 320/352/740 landscape/820/1440px passed source switching, episode links, current-episode comments, spoiler/reply reveal/re-hide, confirmed posting, Enter multiline, control bounds and no horizontal page overflow/page errors. Source controls measure 96px in the tested compact layouts. Full suite: 340 passed, three conditional skips (343 total); player HLS E2E 11/11. Panel screenshot requests repeatedly timed out; screenshots saved by Edge are not claimed as visually inspected. Real Safari/device review remains separate.

## Small episode thumbnail revision

- Restored small landscape thumbnails beside episode names in ordinary/mobile detail lists, the ordinary watch sidebar, and mobile horizontal/drawer lists. Episode-specific artwork is preferred when supplied; otherwise the movie image is used, without claiming it depicts that episode. Invalid/missing/broken images use a local one-shot placeholder fallback.
- Detail images are 80x45px on wide screens and 52x30px on phones; ordinary watch sidebar images are 72x41px and mobile watch images 56x32px. Phone detail uses two compact columns. Episode labels, source indices, links, current selection, search and sheet interactions are preserved; no quality badges or large episode posters were reintroduced.
- Assets: episode-sources JS/CSS 1.2.0, detail 3.4.1, watch 3.8.1, mobile detail 1.6.1, mobile watch 2.0.1. Full suite: 341 passed, three conditional skips (344 total). Sixteen Edge route/viewport cases at 320/390/820/1440px verified loaded thumbnail dimensions, compact row heights, source/episode switching, comment/spoiler regressions, mobile episode sheet and no page errors/horizontal overflow. Tests use intercepted movie/account/comment/history APIs.

## Episode card proportion refinement

- Detail grid is capped at three wide-screen columns (two at tablet/phone widths), rather than auto-filling seven small button-like cards. Wide cards use 112x63 thumbnails, a stronger episode label, secondary movie title and a restrained play affordance; phone images are 64x36 with the secondary title suppressed for space.
- Ordinary watch sidebar uses 96x54 thumbnails and a text column with episode/movie names. The selected status sits inside that column, with a subtle red inset marker instead of an isolated label at the far edge. Episode/source selection and ARIA state remain synchronized.
- Assets: episode-sources CSS 1.2.1, ordinary detail 3.4.2, ordinary watch 3.8.2, dedicated mobile detail 1.6.2. Full suite remains 341 passed / three conditional skips. Twenty Edge cases at 320/390/820/1440/1720px verify nine-episode grid columns, image dimensions, selected-status placement, source/episode controls and no overflow/page errors. These functional/geometry checks are not a claim of visual approval by the owner.
