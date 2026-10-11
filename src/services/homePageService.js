const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const templateService = require('./templateService');

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

async function renderHomePage(data) {
  const file = path.join(config.PUBLIC_DIR, 'index.html');
  const stat = await fs.stat(file);
  if (cachedPage?.data === data && cachedPage.modified === stat.mtimeMs) return cachedPage.html;
  const raw = await fs.readFile(file, 'utf8');
  const html = addHomeData(templateService.renderHome(raw, data), data);
  cachedPage = { data, modified: stat.mtimeMs, html };
  return html;
}

module.exports = { renderHomePage, addHomeData, serializeData };
