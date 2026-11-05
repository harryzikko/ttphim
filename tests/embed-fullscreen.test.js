const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('embed player and watch pages support web fullscreen and never trigger native AVPlayer', () => {
  const root = path.resolve(__dirname, '..');
  
  // 1. viewRoutes.js: Embed player
  const viewRoutes = fs.readFileSync(path.join(root, 'src/routes/viewRoutes.js'), 'utf8');
  assert.ok(!viewRoutes.includes('video.webkitEnterFullscreen'), 'viewRoutes must NOT invoke video.webkitEnterFullscreen');
  assert.ok(viewRoutes.includes("window.parent.postMessage({ type: 'toggle-web-fullscreen' }"), 'viewRoutes must post toggle-web-fullscreen message to parent');
  assert.ok(viewRoutes.includes('#player-wrap.standalone-fs'), 'viewRoutes must provide standalone-fs CSS for fallback');

  // 2. watch.js: Desktop & Responsive watch page
  const watchJs = fs.readFileSync(path.join(root, 'public/js/watch.js'), 'utf8');
  assert.ok(watchJs.includes('toggleWebFullscreen'), 'watch.js must implement toggleWebFullscreen');
  assert.ok(watchJs.includes("e.data.type === 'toggle-web-fullscreen'"), 'watch.js must listen for toggle-web-fullscreen message');
  assert.ok(watchJs.includes('btn-embed-fs'), 'watch.js must render floating btn-embed-fs in embed player');
  assert.ok(watchJs.includes('btn-embed-fs-exit'), 'watch.js must render floating btn-embed-fs-exit in embed player');

  // 3. mobile/xem-phim.js & html: Mobile watch page
  const mobileJs = fs.readFileSync(path.join(root, 'public/mobile/js/xem-phim.js'), 'utf8');
  assert.ok(mobileJs.includes("e.data.type === 'toggle-web-fullscreen'"), 'mobile xem-phim.js must listen for toggle-web-fullscreen message');

  const mobileHtml = fs.readFileSync(path.join(root, 'public/mobile/xem-phim.html'), 'utf8');
  assert.ok(mobileHtml.includes('id="m-embed-fs-btn"'), 'mobile xem-phim.html must contain m-embed-fs-btn');

  // 4. CSS support
  const moviePhoneCss = fs.readFileSync(path.join(root, 'public/css/movie-phone.css'), 'utf8');
  assert.ok(moviePhoneCss.includes('#player-viewport.w-web-fullscreen'), 'movie-phone.css must support #player-viewport.w-web-fullscreen');
  assert.ok(moviePhoneCss.includes('#m-player-wrapper.m-web-fullscreen'), 'movie-phone.css must support #m-player-wrapper.m-web-fullscreen');
});
