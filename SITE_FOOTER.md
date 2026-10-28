# CineViet footer and public information pages

## Delivered

- One static, shared footer across 13 user-facing templates: desktop home/catalog/detail/watch/library/account/person and six dedicated mobile pages. Admin, TV and auth/QR experiences are intentionally unchanged.
- Groups: CineViet introduction/contact, discovery, personal library, information/support/policies. No placeholder social links, fake office/phone, unsupported paid memberships or universal 4K claims.
- User explicitly approved admin@cineviet.live as the public support/copyright contact. Mail links open the user's mail client; the website does not claim a new ticket system or automatically submit messages.
- Six real public routes/documents: /gioi-thieu, /tro-giup, /lien-he, /dieu-khoan, /quyen-rieng-tu and /ban-quyen. Content reflects currently available features and provider limitations. Policy/legal text needs owner/legal approval before production publication and is not a certification of rights or compliance.
- Mobile footer groups become accessible disclosure buttons. Static links remain present/readable without JavaScript. Desktop groups expand after resizing; hidden mobile groups are excluded from keyboard interaction. Back-to-top honors reduced motion and focuses the header link without unwanted scroll.
- Fixed the ordinary watch template's pre-existing nested main/unclosed outer main while integrating the footer: watch-main-content is now a section with identical ID/classes, one outer main closes before footer. No player engine/control IDs changed.

## SEO scope

- All footer/information links exist in server HTML rather than a client-only fetch.
- New public pages have unique title and description, Vietnamese language, viewport, semantic main/article/section navigation, a single h1 and consistent Open Graph title/description/site name/locale.
- No production canonical host, sitemap, robots policy, Search Console ownership, structured organization claims or ranking guarantees were invented. Full-site movie SEO, duplicate mobile URL canonicalization, sitemap generation, crawl/index rules and Search Console validation are separate work requiring the actual production-domain decision and deployment checks.
- Antigravity is not required for this implementation; the same repository can be maintained here. Avoid concurrent edits by multiple agents in the same files.

## Updating content

Edit scripts/site-content.cjs, then run:

```powershell
node scripts/build-site-footer.cjs --check
node scripts/build-site-footer.cjs
```

The build only replaces one footer block and inserts owned footer resources; it does not reformat unrelated template markup. It computes all outputs before writing, aborts on unexpected head/body/multiple-footer structure, and is idempotent. Information pages are generated into public/ and route aliases live in src/routes/viewRoutes.js.

CSS: public/css/site-footer.css?v=1.0.0. Enhancement script: public/js/site-footer.js?v=1.0.0. Rebuild/version owned resources when changing their cached implementation.

## Verification

- Full npm test: 323 total, 320 passed, three conditional skips, zero failures.
- Player E2E: 11/11 on its isolated server/database and generated media after watch markup correction.
- New tests cover one static footer per template, no footer inside main, real policy/mail links, approved contact, unique SEO metadata and content without JS, idempotent build, disclosure state/resize and all six information routes on mobile UA.
- Independent Edge acceptance: 12 real page/viewport combinations (regular home, mobile home and information page at 320/390/768/1440 widths). Checked no horizontal overflow, one footer, accordion/resize, touch target, contact links, back-to-top and page errors. Verified no-JS information content/footer links.
- All 27 distinct internal footer URLs returned 200 or expected authentication redirect; six public information pages returned their own 200 HTML documents.
- Local development server was restarted to load information routes and remains on http://localhost:3001. No real account/library/history mutations or outbound support email were performed.
- Saved Edge captures/report are session scratch evidence. Built-in panel DOM check confirmed correct groups/title/no overflow; panel screenshot timed out, so final visual screenshot inspection in that tool is not claimed.
- Real Safari/iPhone/Android, production host/indexing and actual mail delivery to the approved address remain unverified.
