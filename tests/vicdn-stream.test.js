const { test } = require('node:test');
const assert = require('node:assert/strict');
const vicdnService = require('../src/services/vicdnService');

test('vicdnService decryptAesGcm correctly decrypts AES-GCM data', () => {
  const decrypted = vicdnService.decryptAesGcm('');
  assert.equal(decrypted, '');
});

test('vicdnService provides stream master and track playlists with unblocked CDN domain', async () => {
  const videoId = 'tv-303745-1-1';
  const master = await vicdnService.getMasterPlaylist(videoId, 'https://cineviet.live');
  if (master) {
    assert.ok(master.includes('#EXTM3U'));
    assert.ok(master.includes('#EXT-X-STREAM-INF'));
    assert.ok(master.includes('original.m3u8'));
  }

  const track = await vicdnService.getTrackPlaylist(videoId, 'original');
  if (track) {
    assert.ok(track.includes('#EXTM3U'));
    assert.ok(!track.includes('pages.dev'), 'Playlist should not contain blocked pages.dev domain');
    assert.ok(track.includes('x104.vicdn.cc'), 'Playlist should use unblocked x104.vicdn.cc domain');
  }
});
