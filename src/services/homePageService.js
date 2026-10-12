const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const templateService = require('./templateService');
const banners = require('./bannerService');

let cachedPage = null;

function serializeData(data) {
  // Prevent data from closing the script element or introducing HTML.
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function addHomeData(html, data) {
  const image = data.spotlights?.[0]?.thumb_url || data.spotlights?.[0]?.poster_url;
  let hints = '<link rel="preconnect" href="https://phimimg.com" crossorigin>';
  if (image && /^https?:\/\//.test(image)) {
    const escaped = image.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    hints += `<link rel="preload" as="image" href="${escaped}" fetchpriority="high">`;
  }
  return html.replace('</head>', `${hints}</head>`)
    .replace('</body>', `<script id="home-data" type="application/json">${serializeData(data)}</script></body>`);
}

async function renderHomePage(data, settings = { featured_slugs: (data.spotlights || []).map(item => item.slug) }) {
  const file = path.join(config.PUBLIC_DIR, 'index.html');
  const stat = await fs.stat(file);
  const display = banners.applyHome(data, settings);
  const heroKey = JSON.stringify(display.spotlights);
  if (!(cachedPage?.data === data && cachedPage.modified === stat.mtimeMs && cachedPage.heroKey === heroKey)) {
    const raw = await fs.readFile(file, 'utf8');
    const escape = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const safe = { ...display, spotlights: display.spotlights.map(item => ({ ...item, name: escape(item.banner_title || item.name), content: escape(item.banner_description || item.content) })) };
    let html = addHomeData(templateService.renderHome(raw, safe), display);
    if (!display.hero_enabled) html = html.replace('id="home-hero"', 'id="home-hero" hidden');
    cachedPage = { data, modified: stat.mtimeMs, heroKey, html };
  }
  return banners.decorate(cachedPage.html, settings);
}

module.exports = { renderHomePage, addHomeData, serializeData };
