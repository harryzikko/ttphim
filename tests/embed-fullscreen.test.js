const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('embed player and watch pages support full landscape playback with native bilingual subtitles', () => {
  const root = path.resolve(__dirname, '..');
  
  // 1. viewRoutes.js: Embed player
  const viewRoutes = fs.readFileSync(path.join(root, 'src/routes/viewRoutes.js'), 'utf8');
  assert.ok(viewRoutes.includes('track id="track-bilingual"'), 'viewRoutes must provide native bilingual track');
  assert.ok(viewRoutes.includes('syncNativeTextTracks'), 'viewRoutes must implement syncNativeTextTracks');
  assert.ok(viewRoutes.includes('video.webkitEnterFullscreen'), 'viewRoutes must support webkitEnterFullscreen for iOS landscape fullscreen');
  assert.ok(viewRoutes.includes('#player-wrap'), 'viewRoutes must provide player wrapper styling');

  // 2. watch.js: Desktop & Responsive watch page
  const watchJs = fs.readFileSync(path.join(root, 'public/js/watch.js'), 'utf8');
  assert.ok(watchJs.includes('toggleWebFullscreen'), 'watch.js must implement toggleWebFullscreen');
  assert.ok(watchJs.includes('btn-embed-fs'), 'watch.js must render floating btn-embed-fs in embed player');
  assert.ok(watchJs.includes('btn-embed-fs-exit'), 'watch.js must render floating btn-embed-fs-exit in embed player');
  assert.ok(watchJs.includes("iframe.allowFullscreen = true"), 'watch.js must enable fullscreen for embeds');

  // 3. CSS support
  const moviePhoneCss = fs.readFileSync(path.join(root, 'public/css/movie-phone.css'), 'utf8');
  assert.ok(moviePhoneCss.includes('#player-viewport.w-web-fullscreen'), 'movie-phone.css must support #player-viewport.w-web-fullscreen');
  assert.ok(moviePhoneCss.includes('orientation: landscape'), 'movie-phone.css must optimize for landscape mobile orientation');
});
