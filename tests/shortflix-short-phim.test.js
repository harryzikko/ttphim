const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { JSDOM } = require('jsdom');

const {
  ShortflixService,
  normalizeSlug,
  isAllowedUpstreamUrl,
  normalizeSubtitleToVtt,
  buildFallbackPosterUrl
} = require('../src/services/shortflixService');
const { createShortflixRouter } = require('../src/routes/shortflixRoutes');

const tick = () => new Promise(resolve => setImmediate(resolve));

test('ShortflixService validates slugs/hosts, converts SRT to WebVTT and caches catalog/detail/streams', async () => {
  assert.equal(normalizeSlug('shortflix:tu-ke-yeu'), 'tu-ke-yeu');
  assert.equal(normalizeSlug('tu-ke-yeu'), 'tu-ke-yeu');
  assert.equal(normalizeSlug('../evil'), null);
  assert.equal(normalizeSlug('bad/slug'), null);

  assert.equal(isAllowedUpstreamUrl('https://shortflix.notthingp.workers.dev/proxy?url=x'), true);
  assert.equal(isAllowedUpstreamUrl('https://shortlink.alokillgtv.workers.dev?subtitle=true'), true);
  assert.equal(isAllowedUpstreamUrl('https://cdn2.nsstorage.space/a/b.vtt'), true);
  assert.equal(isAllowedUpstreamUrl('http://shortflix.notthingp.workers.dev/x'), false);
  assert.equal(isAllowedUpstreamUrl('https://127.0.0.1/secret'), false);
  assert.equal(isAllowedUpstreamUrl('https://evil.example/sub.vtt'), false);

  const vttFromSrt = normalizeSubtitleToVtt('1\r\n00:00:01,200 --> 00:00:03,400\r\nXin chào!\r\n');
  assert.ok(vttFromSrt.startsWith('WEBVTT\n\n'));
  assert.ok(vttFromSrt.includes('00:00:01.200 --> 00:00:03.400'));

  assert.equal(
    buildFallbackPosterUrl('https://cdn2.nsstorage.space/demo-slug/vi_VN/abc/cover.webp', 'demo-slug'),
    'https://cdn2.nsstorage.space/demo-slug/1/vi_VN/abc/cover.webp'
  );
  assert.equal(
    buildFallbackPosterUrl('https://evil.example/demo-slug/vi_VN/abc/cover.webp', 'demo-slug'),
    ''
  );

  const fetchedUrls = [];
  const metas100 = Array.from({ length: 100 }, (_, i) => ({
    id: `shortflix:phim-${i + 1}`,
    name: `Phim Ngắn ${i + 1}`,
    poster: `https://cdn2.nsstorage.space/p/${i + 1}.webp`,
    description: `Loạt phim ${30 + i} tập cực hay.`
  }));

  const service = new ShortflixService({
    baseUrl: 'https://shortflix.notthingp.workers.dev',
    fetcher: async (url, opts = {}) => {
      fetchedUrls.push({ url: String(url), redirect: opts.redirect });
      const s = String(url);
      if (s.endsWith('/manifest.json')) {
        return { ok: true, json: async () => ({ catalogs: [{ extra: [{ name: 'genre', options: ['Tổng tài', 'Cổ đại'] }] }] }) };
      }
      if (s.includes('/catalog/series/shortflix')) {
        return { ok: true, json: async () => ({ metas: metas100 }) };
      }
      if (s.includes('/meta/series/')) {
        return {
          ok: true,
          json: async () => ({
            meta: {
              id: 'shortflix:phim-1',
              name: 'Phim Ngắn 1',
              poster: 'https://cdn2.nsstorage.space/p/1.webp',
              description: 'Mô tả hay',
              videos: [
                { id: 'shortflix:phim-1:2', episode: 2, title: 'Episode 2' },
                { id: 'shortflix:phim-1:1', episode: 1, title: 'Episode 1' }
              ]
            }
          })
        };
      }
      if (s.includes('/stream/series/')) {
        return {
          ok: true,
          json: async () => ({
            streams: [
              {
                name: 'Server Full',
                title: 'Server Full - 1080p',
                url: 'https://shortflix.notthingp.workers.dev/proxy?url=full',
                subtitles: [{ url: 'https://shortlink.alokillgtv.workers.dev?subtitle=true', lang: 'vi' }]
              },
              {
                name: 'Server tap le',
                title: 'Tap 1',
                url: 'https://cdn2.nsstorage.space/ep1.m3u8',
                subtitles: [{ url: 'https://evil.com/bad.vtt', lang: 'vi' }]
              },
              {
                name: 'Unsafe',
                url: 'http://127.0.0.1/internal.m3u8'
              }
            ]
          })
        };
      }
      if (s.startsWith('https://shortlink.alokillgtv.workers.dev')) {
        return { ok: true, text: async () => '1\n00:00:00,500 --> 00:00:02,000\nCâu thoại 1' };
      }
      throw new Error(`Unexpected URL ${s}`);
    }
  });

  const p1 = await service.getCatalog({ page: 1, limit: 24, genre: 'Tổng tài' });
  assert.equal(p1.items.length, 24);
  assert.equal(p1.items[0].slug, 'phim-1');
  assert.equal(p1.items[0].episode_count_hint, 30);
  assert.equal(p1.pagination.hasMore, true);

  // Page 2 serves from the exact same cached 100-item catalog batch
  const callsBeforeP2 = fetchedUrls.length;
  const p2 = await service.getCatalog({ page: 2, limit: 24, genre: 'Tổng tài' });
  assert.equal(p2.items[0].slug, 'phim-25');
  assert.equal(fetchedUrls.length, callsBeforeP2);

  const detail = await service.getDetail('phim-1');
  assert.equal(detail.item.total_episodes, 2);
  assert.equal(detail.episodes[0].episode, 1);

  const streams = await service.getStreams('phim-1', 1);
  assert.equal(streams.servers.length, 2, 'unsafe internal URL filtered out');
  assert.equal(streams.servers[0].is_full, false, 'single-episode server sorted first');
  assert.equal(streams.servers[0].subtitles.length, 0, 'disallowed subtitle URL filtered out');
  assert.equal(streams.servers[1].is_full, true);
  assert.ok(streams.servers[1].subtitles[0].proxy_url.startsWith('/api/shortflix/subtitle?url='));

  const vtt = await service.fetchSubtitle('https://shortlink.alokillgtv.workers.dev?subtitle=true');
  assert.ok(vtt.startsWith('WEBVTT'));
  assert.equal(fetchedUrls.at(-1).redirect, 'error', 'subtitle fetch blocks open redirects');

  await assert.rejects(() => service.fetchSubtitle('https://evil.example/evil.vtt'), /không thuộc nguồn được phép/);
});

test('ShortFlix Express API routes return catalog, detail, streams and WebVTT subtitles', async () => {
  const mockService = {
    getCatalog: async ({ page }) => ({ items: [{ slug: 'p1', name: 'Short 1' }], genres: ['Tổng tài'], pagination: { page: Number(page || 1), hasMore: false } }),
    getDetail: async slug => ({ item: { slug, name: 'Short 1', total_episodes: 1 }, episodes: [{ episode: 1, title: 'Tập 1' }] }),
    getStreams: async (slug, ep) => ({ slug, episode: Number(ep), servers: [{ name: 'Tập lẻ', is_full: false, url: 'https://cdn2.nsstorage.space/1.m3u8', subtitles: [] }] }),
    fetchSubtitle: async url => {
      if (!String(url).includes('shortlink')) throw Object.assign(new Error('Disallowed'), { status: 400 });
      return 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nTest';
    }
  };

  const app = express();
  app.use('/api', createShortflixRouter({ service: mockService }));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const cat = await (await fetch(`${base}/api/shortflix/catalog?page=2`)).json();
    assert.equal(cat.status, true);
    assert.equal(cat.data.pagination.page, 2);

    const det = await (await fetch(`${base}/api/shortflix/detail/p1`)).json();
    assert.equal(det.data.item.slug, 'p1');

    const str = await (await fetch(`${base}/api/shortflix/stream/p1/1`)).json();
    assert.equal(str.data.servers.length, 1);

    const sub = await fetch(`${base}/api/shortflix/subtitle?url=${encodeURIComponent('https://shortlink.alokillgtv.workers.dev?s=1')}`);
    assert.equal(sub.status, 200);
    assert.match(sub.headers.get('content-type'), /^text\/vtt/);
    assert.ok((await sub.text()).startsWith('WEBVTT'));

    const badSub = await fetch(`${base}/api/shortflix/subtitle?url=${encodeURIComponent('https://evil.test/x.vtt')}`);
    assert.equal(badSub.status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('public/short-phim.html renders grid + 9:16 player safely against XSS and header.js preserves bilingual link order', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/short-phim.html'), 'utf8');
  const attack = '"><img src=x onerror="window.pwned=1"><svg onload="window.pwned=1">&\'';
  const badUrl = 'javascript:alert(1)';

  const dom = new JSDOM(html, { url: 'https://cineviet.live/short-phim', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.document.querySelectorAll('script, svg').forEach(n => n.remove());

  const callbacks = [];
  const errors = [];
  const origAdd = window.document.addEventListener.bind(window.document);
  window.document.addEventListener = (ev, cb, opts) => (ev === 'DOMContentLoaded' ? callbacks.push(cb) : origAdd(ev, cb, opts));
  window.console.error = (...args) => errors.push(args.map(String).join(' '));
  window.showToast = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => {};
  window.HTMLMediaElement.prototype.load = () => {};

  window.fetch = async (url) => {
    const s = String(url);
    if (s.includes('/api/shortflix/catalog')) {
      return {
        status: 200,
        text: async () => JSON.stringify({
          status: true,
          data: {
            genres: ['Tổng tài', attack],
            pagination: { page: 1, hasMore: true },
            items: [{
              slug: 'short-xss',
              name: attack,
              poster_url: badUrl,
              poster_fallback_url: 'https://cdn2.nsstorage.space/short-xss/1/vi_VN/abc/cover.webp',
              description: attack,
              episode_count_hint: 45
            }, {
              slug: 'short-broken',
              name: 'Phim Lỗi Ảnh',
              poster_url: 'https://cdn2.nsstorage.space/short-broken/vi_VN/abc/cover.webp',
              poster_fallback_url: 'https://cdn2.nsstorage.space/short-broken/1/vi_VN/abc/cover.webp',
              description: 'Test fallback',
              episode_count_hint: 10
            }]
          }
        })
      };
    }
    if (s.includes('/api/shortflix/detail/')) {
      return {
        status: 200,
        text: async () => JSON.stringify({
          status: true,
          data: {
            item: { slug: 'short-xss', name: attack, description: attack, poster_url: 'https://cdn2.nsstorage.space/p.webp', total_episodes: 2 },
            episodes: [{ episode: 1, title: attack }, { episode: 2, title: 'Ep 2' }]
          }
        })
      };
    }
    if (s.includes('/api/shortflix/stream/')) {
      return {
        status: 200,
        text: async () => JSON.stringify({
          status: true,
          data: {
            slug: 'short-xss',
            episode: 1,
            servers: [{
              name: 'Tập lẻ • Tập 1',
              is_full: false,
              url: 'https://shortflix.notthingp.workers.dev/proxy?url=test',
              subtitles: [{ proxy_url: '/api/shortflix/subtitle?url=test' }]
            }]
          }
        })
      };
    }
    return { status: 200, text: async () => JSON.stringify({ status: true, data: {} }) };
  };

  try {
    window.eval(fs.readFileSync(path.join(__dirname, '../public/js/api.js'), 'utf8'));
    window.eval(fs.readFileSync(path.join(__dirname, '../public/js/header.js'), 'utf8'));
    window.eval(fs.readFileSync(path.join(__dirname, '../public/js/short-phim.js'), 'utf8'));

    for (const cb of callbacks) await cb();
    await tick();
    await tick();

    // Check Song Ngữ and Short Phim nav links on static page + compact <1680px header pill
    const songNgu = window.document.querySelector('header nav [data-path="song-ngu"]');
    assert.equal(songNgu.previousElementSibling.dataset.path, 'chieu-rap');
    assert.ok(window.document.querySelector('header nav [data-path="short-phim"]'));
    const headerShortPill = window.document.querySelector('header .btn-header-short');
    assert.ok(headerShortPill);
    assert.equal(headerShortPill.getAttribute('href'), '/short-phim');
    assert.equal(headerShortPill.classList.contains('is-active'), true);
    const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    assert.ok(indexHtml.includes('/js/header.js?v=3.4.0'));
    assert.ok(indexHtml.includes('/css/custom.css?v=3.2.2'));

    // Check XSS safety in grid & poster error fallback (ep1 -> visual badge)
    const grid = window.document.getElementById('short-grid');
    assert.equal(grid.querySelector('svg, script, img[src="x"]'), null);
    assert.ok(grid.textContent.includes(attack));
    assert.equal(window.pwned, undefined);

    const brokenImg = grid.querySelector('[data-short-slug="short-broken"] img');
    assert.ok(brokenImg);
    brokenImg.dispatchEvent(new window.Event('error'));
    assert.equal(brokenImg.getAttribute('src'), 'https://cdn2.nsstorage.space/short-broken/1/vi_VN/abc/cover.webp');
    assert.equal(brokenImg.classList.contains('hidden'), false);
    brokenImg.dispatchEvent(new window.Event('error'));
    assert.equal(brokenImg.classList.contains('hidden'), true);
    assert.ok(grid.querySelector('[data-short-slug="short-broken"] .short-poster-fallback'));

    // Click card -> opens vertical theatre player safely
    grid.querySelector('.short-card').click();
    await tick();
    await tick();
    const playerSection = window.document.getElementById('short-player-section');
    assert.equal(playerSection.classList.contains('hidden'), false);
    assert.ok(window.document.getElementById('short-player-title').textContent.includes(attack));
    assert.equal(window.document.getElementById('short-episode-grid').querySelectorAll('.short-ep-btn').length, 2);
    assert.equal(playerSection.querySelector('svg, script, img[src="x"]'), null);
    assert.deepEqual(errors, []);
  } finally {
    window.close();
  }
});
