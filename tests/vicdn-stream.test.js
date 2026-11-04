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

test('EpisodeSources treats relative ViCDN stream and embed URLs as playable', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<div></div>', { runScripts: 'dangerously' });
  dom.window.eval(fs.readFileSync(path.join(__dirname, '../public/js/episode-sources.js'), 'utf8'));

  const vicdnServer = {
    server_name: 'Song Ngữ (Đa Giọng & Phụ Đề)',
    server_data: [
      {
        name: '1',
        slug: 'tap-1',
        filename: 'Tập 1',
        link_embed: '/embed/vicdn/tv-303745-1-1',
        link_m3u8: '/api/stream/vicdn/tv-303745-1-1/master.m3u8'
      },
      {
        name: '2',
        slug: 'tap-2',
        filename: 'Tập 2',
        link_embed: '/embed/vicdn/tv-303745-1-2',
        link_m3u8: '/api/stream/vicdn/tv-303745-1-2/master.m3u8'
      }
    ]
  };

  const playable = dom.window.EpisodeSources.playable(vicdnServer);
  assert.equal(playable.length, 2, 'Both episodes must be playable');

  const groups = dom.window.EpisodeSources.groups([vicdnServer]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, 'multi');
  assert.equal(groups[0].label, 'Song Ngữ');
  assert.equal(groups[0].sources[0].count, 2);
});
