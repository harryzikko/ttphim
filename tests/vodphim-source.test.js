const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

function loadFreshVodphimService() {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/vodphimService.js'), 'utf8');
  const context = {
    module: { exports: {} },
    console: { log() {}, warn() {}, error() {} },
    Date,
    setTimeout,
    clearTimeout,
    AbortController,
    require(name) {
      if (name === '../config') return require('../src/config');
      if (name === './movieMatching') return require('../src/services/movieMatching');
      if (name === './catalogFormat') return require('../src/services/catalogFormat');
      if (name === './vicdnService') return { getBilingualServer: async () => null };
      throw new Error(`Unexpected dependency: ${name}`);
    }
  };
  vm.runInNewContext(source, context);
  return context.module.exports;
}

function loadIsolatedKkphim({ vicdnStub, nguoncStub, vodphimStub }) {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/kkphimService.js'), 'utf8');
  const context = {
    module: { exports: {} },
    console: { log() {}, warn() {}, error() {} },
    Date,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    AbortController,
    require(name) {
      if (name === '../config') return require('../src/config');
      if (name === './movieMatching') return require('../src/services/movieMatching');
      if (name === './catalogFormat') return require('../src/services/catalogFormat');
      if (name === './vicdnService') return vicdnStub;
      if (name === './nguoncService') return nguoncStub;
      if (name === './vodphimService') return vodphimStub;
      throw new Error(`Unexpected dependency: ${name}`);
    }
  };
  vm.runInNewContext(source, context);
  return context.module.exports;
}

test('VodPhim normalizes types and converts sub:"multisub" into Song Ngu servers while keeping dubbed tracks', async () => {
  const vp = loadFreshVodphimService();
  vp.lastSyncTime = Date.now();

  const indexedMulti = vp.normalizeMovieItem({
    _id: 'vp-1',
    name: 'Hôm Nay Trời Đổ Mưa Bóng Mây',
    slug: 'hom-nay-troi-do-mua-bong-may',
    origin_name: 'Sunshine Through the Rain',
    type: 'tv',
    tmdb_id: 307853,
    season: 1,
    year: 2026,
    sub: 'multisub',
    lang: 'Vietsub',
    episode_current: 'Tập 11',
    episode_total: '24 Tập',
    category: [{ slug: 'chinh-kich', name: 'Chính Kịch' }],
    country: [{ slug: 'trung-quoc', name: 'Trung Quốc' }]
  });
  vp.allMovies = [indexedMulti];
  vp.indexMovie(indexedMulti);

  vp.fetchJson = async endpoint => {
    if (endpoint.includes('/phim/hom-nay-troi-do-mua-bong-may')) {
      return {
        status: true,
        movie: {
          _id: 'vp-1',
          name: 'Hôm Nay Trời Đổ Mưa Bóng Mây',
          slug: 'hom-nay-troi-do-mua-bong-may',
          origin_name: 'Sunshine Through the Rain',
          type: 'tv',
          tmdb_id: 307853,
          season: 1,
          year: 2026,
          sub: 'multisub',
          lang: 'Vietsub + Thuyết Minh'
        },
        episodes: [
          {
            server_name: 'Vietsub',
            server_data: [
              { episode_id: 'e1', name: '1', slug: '1', filename: 'Tập 1', link_embed: 'https://playembed.vip/player/e1/sub' },
              { episode_id: 'e1b', name: '2', slug: '2', filename: 'Tập 2', link_embed: 'https://playembed.vip/player/e1b/sub' },
              { episode_id: 'e1c', name: '3', slug: '3', filename: 'Tập 3', link_embed: 'https://playembed.vip/player/e1c/sub' },
              { episode_id: 'e1d', name: '4', slug: '4', filename: 'Tập 4', link_embed: 'https://playembed.vip/player/e1d/sub' }
            ]
          },
          {
            server_name: 'Thuyết Minh',
            server_data: [
              { episode_id: 'e2', name: '1', slug: '1', filename: 'Tập 1', link_embed: 'https://playembed.vip/player/e2/tm' },
              { episode_id: 'e2b', name: '2', slug: '2', filename: 'Tập 2', link_embed: 'https://playembed.vip/player/e2b/tm' }
            ]
          }
        ]
      };
    }
    if (endpoint.includes('/phim/phim-thuong')) {
      return {
        status: true,
        movie: {
          _id: 'vp-2',
          name: 'Phim Thường',
          slug: 'phim-thuong',
          origin_name: 'Normal Film',
          type: 'movie',
          year: 2025,
          sub: '',
          lang: 'Vietsub'
        },
        episodes: [
          {
            server_name: 'Vietsub',
            server_data: [{ episode_id: 'e3', name: 'FULL', slug: 'FULL', filename: 'Tập FULL', link_embed: 'https://playembed.vip/player/e3/sub' }]
          }
        ]
      };
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  assert.equal(vp.hasBilingualMatch({ name: 'Hôm Nay Trời Đổ Mưa Bóng Mây', tmdb: { id: 307853 } }), true);
  assert.equal(indexedMulti.type, 'series');
  assert.equal(indexedMulti.has_song_ngu, true);

  const servers = await vp.getVodphimServers({
    slug: 'hom-nay-troi-do-mua-bong-may',
    name: 'Hôm Nay Trời Đổ Mưa Bóng Mây',
    origin_name: 'Sunshine Through the Rain',
    type: 'series',
    year: 2026,
    tmdb: { id: 307853 }
  }, 10);

  assert.equal(servers.length, 2);
  assert.equal(servers[0].server_name, 'Song Ngữ (Multi-Sub)');
  assert.doesNotMatch(servers[0].server_name, /vodphim/i);
  assert.equal(servers[0].is_song_ngu, true);
  assert.equal(servers[0].sub, 'multisub');
  assert.equal(servers[0].server_data[0].slug, 'tap-1');
  assert.equal(servers[1].server_name, 'VP (Thuyết Minh)');
  assert.equal(servers[1].is_song_ngu, false);

  const directMulti = await vp.getMovieDetail('vp-hom-nay-troi-do-mua-bong-may');
  assert.equal(directMulti.movie.has_song_ngu, true);
  assert.equal(directMulti.episodes[0].server_name, 'Song Ngữ (Multi-Sub)');

  const directRegular = await vp.getMovieDetail('phim-thuong');
  assert.equal(directRegular.movie.has_song_ngu, false);
  assert.equal(directRegular.movie.type, 'single');
  assert.equal(directRegular.episodes[0].server_name, 'VP (Vietsub)');
  assert.equal(directRegular.episodes[0].server_data[0].slug, 'full');
});

test('VodPhim prevents false duplicate merges across seasons, formats and episode counts', async () => {
  const vp = loadFreshVodphimService();
  vp.lastSyncTime = Date.now();

  const season2 = vp.normalizeMovieItem({
    _id: 'vp-s2',
    name: 'Bẫy Đêm',
    slug: 'bay-dem',
    origin_name: 'Night Trap',
    type: 'tv',
    tmdb_id: 99999,
    season: 2,
    year: 2026,
    sub: 'multisub'
  });
  const animeMovie = vp.normalizeMovieItem({
    _id: 'vp-ani',
    name: 'Thám Tử Lừng Danh',
    slug: 'tham-tu-lung-danh',
    origin_name: 'Detective Film',
    type: 'movie',
    year: 2025,
    sub: '',
    category: [{ slug: 'hoat-hinh', name: 'Hoạt Hình' }]
  });
  vp.allMovies = [season2, animeMovie];
  vp.indexMovie(season2);
  vp.indexMovie(animeMovie);
  vp.fetchJson = async () => ({ status: false, items: [] });

  // Season 1 target without explicit season must not merge with Season 2 VodPhim entry
  assert.equal(vp.findIndexedMatch({
    slug: 'bay-dem',
    name: 'Bẫy Đêm',
    origin_name: 'Night Trap',
    type: 'series',
    year: 2026,
    tmdb: { id: 99999 }
  }), null);

  // Season 2 target matches cleanly
  assert.equal(vp.findIndexedMatch({
    slug: 'bay-dem-phan-2',
    name: 'Bẫy Đêm Phần 2',
    origin_name: 'Night Trap Season 2',
    type: 'series',
    year: 2026,
    tmdb: { id: 99999, season: 2 }
  }).original_slug, 'bay-dem');

  // Single vs Series mismatch must not match
  assert.equal(vp.findIndexedMatch({
    slug: 'tham-tu-lung-danh',
    name: 'Thám Tử Lừng Danh',
    origin_name: 'Detective Film',
    type: 'series',
    year: 2025
  }), null);

  // Episode count guard (>3 vs 1) skips mismatched merge
  const vpSingle = vp.normalizeMovieItem({
    _id: 'vp-ep',
    name: 'Series Test',
    slug: 'series-test',
    origin_name: 'Series Test',
    type: 'tv',
    year: 2026,
    sub: 'multisub'
  });
  vp.allMovies.push(vpSingle);
  vp.indexMovie(vpSingle);
  vp.fetchJson = async endpoint => {
    if (endpoint.includes('/phim/series-test')) {
      return {
        status: true,
        movie: { ...vpSingle, slug: 'series-test', type: 'tv' },
        episodes: [{ server_name: 'Vietsub', server_data: [{ name: '1', slug: '1', link_embed: 'https://playembed.vip/player/x/sub' }] }]
      };
    }
    return { status: false, items: [] };
  };
  const skipped = await vp.getVodphimServers({
    slug: 'series-test',
    name: 'Series Test',
    origin_name: 'Series Test',
    type: 'series',
    year: 2026
  }, 12);
  assert.equal(skipped.length, 0);
});

test('kkphimService merges VodPhim multisub servers, handles primary multisub, and deduplicates Song Ngu catalog', async () => {
  const kk = loadIsolatedKkphim({
    vicdnStub: {
      hasBilingualMatch: () => false,
      getBilingualServer: async () => null,
      getMovieDetail: async () => null,
      searchViCdn: async () => [],
      getCatalog: async () => ({
        items: [{
          id: 'vc-1', slug: 'tv-101', name: 'Phim Chung', origin_name: 'Shared Film',
          year: 2026, type: 'series', has_song_ngu: true, source: 'vicdn', tmdb: { id: 101 }
        }],
        pagination: { totalItems: 1, totalItemsPerPage: 30, currentPage: 1, totalPages: 1 }
      })
    },
    nguoncStub: {
      getMovieDetail: async () => null,
      getNguoncServers: async () => []
    },
    vodphimStub: {
      hasBilingualMatch: item => item?.slug === 'shared-film',
      getVodphimServers: async () => [{
        server_name: 'Song Ngữ (Multi-Sub)',
        server_type: 'song_ngu',
        is_song_ngu: true,
        is_vodphim: true,
        sub: 'multisub',
        language: 'Song Ngữ',
        server_data: [{ name: '1', slug: 'tap-1', link_embed: 'https://playembed.vip/player/abc/sub', link_m3u8: '' }]
      }],
      getMovieDetail: async () => null,
      searchVodphim: async () => [],
      getCatalog: async () => ({
        items: [
          {
            slug: 'vp-phim-chung', original_slug: 'phim-chung', name: 'Phim Chung', origin_name: 'Shared Film',
            year: 2026, type: 'series', has_song_ngu: true, sub: 'multisub', source: 'vodphim', tmdb: { id: 101 }
          },
          {
            slug: 'vp-phim-moi', original_slug: 'phim-moi', name: 'Phim Mới Multi', origin_name: 'New Multi',
            year: 2026, type: 'single', has_song_ngu: true, sub: 'multisub', source: 'vodphim', tmdb: { id: 202 }
          }
        ]
      })
    }
  });

  kk.fetchJson = async endpoint => {
    if (endpoint === '/phim/shared-film') {
      return {
        status: true,
        movie: {
          _id: 'kk-1', name: 'Phim Chung', origin_name: 'Shared Film', slug: 'shared-film',
          type: 'series', year: 2026, lang: 'Vietsub', tmdb: { id: 101 }
        },
        episodes: [{ server_name: '#Hà Nội (Vietsub)', server_data: [{ name: '1', slug: 'tap-1', link_embed: 'https://kk.example/e1', link_m3u8: 'https://kk.example/1.m3u8' }] }]
      };
    }
    if (endpoint === '/phim/primary-multi') {
      return {
        status: true,
        movie: {
          _id: 'kk-2', name: 'Phim Multi Gốc', origin_name: 'Primary Multi', slug: 'primary-multi',
          type: 'single', year: 2026, lang: 'Vietsub', sub: 'multisub'
        },
        episodes: [{ server_name: '#Hà Nội (Vietsub)', server_data: [{ name: 'Full', slug: 'full', link_embed: 'https://kk.example/e2', link_m3u8: 'https://kk.example/2.m3u8' }] }]
      };
    }
    throw new Error('Unexpected fetch ' + endpoint);
  };

  const mergedDetail = await kk.getMovieDetail('shared-film');
  assert.equal(mergedDetail.movie.has_song_ngu, true);
  assert.match(mergedDetail.movie.lang, /Song Ngữ/);
  assert.deepEqual(mergedDetail.episodes.map(s => s.server_name), ['#Hà Nội (Vietsub)', 'Song Ngữ (Multi-Sub)']);

  // Also test generic sub: "multisub" directly from KKPhim API
  const kkMultiDetail = await kk.getMovieDetail('primary-multi');
  assert.equal(kkMultiDetail.movie.has_song_ngu, true);
  assert.equal(kkMultiDetail.episodes[0].is_song_ngu, true);
  assert.match(kkMultiDetail.episodes[0].server_name, /^Song Ngữ/);

  // Song Ngu catalog deduplicates shared film & includes unique VodPhim multisub film
  const catalog = await kk.getCatalog({ type: 'song-ngu', page: 1, limit: 10 });
  assert.equal(catalog.items.length, 2);
  assert.equal(catalog.items[0].slug, 'tv-101');
  assert.equal(catalog.items[1].slug, 'vp-phim-moi');
});

test('EpisodeSources renders VodPhim Song Ngu server under Song Ngu tab', () => {
  const dom = new JSDOM('<div id="host"></div>', { runScripts: 'outside-only' });
  dom.window.eval(fs.readFileSync(path.join(__dirname, '../public/js/episode-sources.js'), 'utf8'));
  const host = dom.window.document.getElementById('host');
  const servers = [
    { server_name: '#Hà Nội (Vietsub)', server_data: [{ name: '1', slug: 'tap-1', link_embed: 'https://kk.example/1' }] },
    { server_name: 'Song Ngữ (Multi-Sub)', is_song_ngu: true, sub: 'multisub', server_data: [{ name: '1', slug: 'tap-1', link_embed: 'https://playembed.vip/player/1/sub' }] },
    { server_name: 'VP (Thuyết Minh)', is_vodphim: true, server_data: [{ name: '1', slug: 'tap-1', link_embed: 'https://playembed.vip/player/1/tm' }] }
  ];
  const groups = dom.window.EpisodeSources.groups(servers);
  assert.deepEqual(JSON.parse(JSON.stringify(groups.map(g => g.id))), ['sub', 'multi', 'voice']);
  dom.window.EpisodeSources.render(host, servers, 1, () => {});
  const langTabs = Array.from(host.querySelectorAll('[data-language]')).map(el => el.dataset.language);
  assert.deepEqual(langTabs, ['sub', 'multi', 'voice']);
  assert.equal(host.querySelector('[data-language="multi"]').getAttribute('aria-pressed'), 'true');
  assert.equal(host.querySelector('[data-source-index="1"]').getAttribute('aria-pressed'), 'true');
  dom.window.close();
});
