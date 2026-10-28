const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const nguoncService = require('../src/services/nguoncService');

beforeEach(() => {
  nguoncService.cache.flushAll();
});

test('nguonc service is configured with correct base url and default totals', () => {
  assert.equal(nguoncService.baseUrl, 'https://phim.nguonc.com/api');
  assert.ok(nguoncService.getTotalMovies() >= 30000);
  assert.equal(typeof nguoncService.syncCatalog, 'function');
  assert.equal(typeof nguoncService.searchNguonC, 'function');
  assert.equal(typeof nguoncService.getMovieDetail, 'function');
  assert.equal(typeof nguoncService.getNguoncServers, 'function');
});

test('searchNguonC normalizes search results with correct source badge', async () => {
  const originalFetchJson = nguoncService.fetchJson;
  try {
    nguoncService.fetchJson = async (url) => {
      assert.ok(url.includes('/films/search?keyword=test'));
      return {
        status: 'success',
        paginate: { current_page: 1, total_page: 1, total_items: 1, items_per_page: 10 },
        items: [
          {
            name: 'Phim Test NguonC',
            original_name: 'Test Movie NguonC',
            slug: 'phim-test-nguonc',
            year: 2026,
            quality: 'FHD',
            language: 'Vietsub',
            current_episode: 'Tập 10',
            total_episodes: 20,
            poster_url: 'https://img.nguonc.com/poster.jpg',
            thumb_url: 'https://img.nguonc.com/thumb.jpg'
          }
        ]
      };
    };

    const results = await nguoncService.searchNguonC('test');
    assert.equal(results.length, 1);
    const item = results[0];
    assert.equal(item.name, 'Phim Test NguonC');
    assert.equal(item.slug, 'phim-test-nguonc');
    assert.equal(item.source, 'nguonc');
    assert.equal(item.source_name, 'NguonC API');
    assert.equal(item.source_badge, 'NguonC');
    assert.equal(item.quality, 'FHD');
    assert.equal(item.type, 'series');
  } finally {
    nguoncService.fetchJson = originalFetchJson;
  }
});

test('getMovieDetail formats NguonC film response with episodes and categories', async () => {
  const originalFetchJson = nguoncService.fetchJson;
  try {
    nguoncService.fetchJson = async (url) => {
      assert.ok(url.includes('/film/phim-chi-tiet-nguonc'));
      return {
        status: 'success',
        movie: {
          name: 'Phim Chi Tiết',
          slug: 'phim-chi-tiet-nguonc',
          original_name: 'Detailed Movie',
          description: 'Mô tả phim chi tiết',
          total_episodes: 12,
          current_episode: 'Tập 5',
          time: '45 phút/tập',
          quality: 'HD',
          language: 'Vietsub + Thuyết Minh',
          director: 'Đạo diễn A',
          casts: 'Diễn viên B, Diễn viên C',
          category: {
            '1': { group: { name: 'Định dạng' }, list: [{ name: 'Phim bộ', slug: 'phim-bo' }] },
            '2': { group: { name: 'Thể loại' }, list: [{ name: 'Hành động', slug: 'hanh-dong' }] },
            '4': { group: { name: 'Quốc gia' }, list: [{ name: 'Hàn Quốc', slug: 'han-quoc' }] }
          },
          episodes: [
            {
              server_name: 'Vietsub #1',
              items: [
                { name: '1', slug: 'tap-1', embed: 'https://streamc.xyz/embed/1' },
                { name: '2', slug: 'tap-2', embed: 'https://streamc.xyz/embed/2' }
              ]
            }
          ]
        }
      };
    };

    const detail = await nguoncService.getMovieDetail('phim-chi-tiet-nguonc');
    assert.ok(detail && detail.movie);
    assert.equal(detail.movie.name, 'Phim Chi Tiết');
    assert.equal(detail.movie.type, 'series');
    assert.equal(detail.movie.actor.length, 2);
    assert.equal(detail.movie.director[0], 'Đạo diễn A');
    assert.equal(detail.episodes.length, 1);
    assert.equal(detail.episodes[0].server_name, 'NC');
    assert.equal(detail.episodes[0].server_data.length, 2);
    assert.equal(detail.episodes[0].server_data[0].link_embed, 'https://streamc.xyz/embed/1');
  } finally {
    nguoncService.fetchJson = originalFetchJson;
  }
});

test('getNguoncServers matches movie and returns formatted servers', async () => {
  const originalFetchJson = nguoncService.fetchJson;
  try {
    nguoncService.moviesBySlug.set('film-match', { slug: 'film-match', name: 'Matched Film' });
    nguoncService.fetchJson = async (url) => {
      return {
        status: 'success',
        movie: {
          slug: 'film-match',
          episodes: [
            {
              server_name: 'Thuyết minh VIP',
              items: [
                { name: '1', slug: 'tap-1', embed: 'https://streamc.xyz/embed/tm1' }
              ]
            }
          ]
        }
      };
    };

    const servers = await nguoncService.getNguoncServers({ slug: 'film-match', name: 'Matched Film' });
    assert.equal(servers.length, 1);
    assert.equal(servers[0].server_name, 'NC');
    assert.equal(servers[0].server_type, 'nguonc');
    assert.equal(servers[0].server_data[0].link_embed, 'https://streamc.xyz/embed/tm1');
  } finally {
    nguoncService.fetchJson = originalFetchJson;
    nguoncService.moviesBySlug.delete('film-match');
  }
});
