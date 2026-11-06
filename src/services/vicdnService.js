let movieMatching; try { movieMatching = typeof require === 'function' ? require('./movieMatching') : null; } catch (_) {} if (!movieMatching) { try { movieMatching = typeof require === 'function' ? require('../src/services/movieMatching') : null; } catch (_) {} } const removeAccents = movieMatching?.removeAccents || (str => String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]/g, '')); const cleanTitle = movieMatching?.cleanTitle || (str => String(str || '')); function fallbackIsCompatible(a, b) {
  if (!a || !b) return false;
  const normA = (a.name || a.vname || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normB = (b.name || b.vname || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normA && normB && normA === normB) return true;
  const origA = (a.origin_name || a.original_name || a.ename || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const origB = (b.origin_name || b.original_name || b.ename || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (origA && origB && origA === origB) return true;
  return false;
}
const isCompatibleMovie = (a, b) => movieMatching?.isCompatibleMovie ? movieMatching.isCompatibleMovie(a, b) : fallbackIsCompatible(a, b);
// KKPhim - ViCDN Service (Multi-source Bilingual Dual-Audio Provider)
const path = require('path');
let crypto;
try {
  if (typeof module !== 'undefined' && module.constructor?._load) {
    crypto = module.constructor._load('crypto');
  }
} catch (_) {}

class MemoryCache {
  constructor() {
    this.cache = new Map();
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }

  set(key, data, ttlMs) {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs
    });
  }

  delete(key) {
    return this.cache.delete(key);
  }

  flushAll() {
    this.cache.clear();
  }
}

function searchText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}



class ViCDNService {
  constructor() {
    this.baseUrl = 'https://vicdn.cc/api';
    this.cache = new MemoryCache();
    this.moviesByTmdb = new Map();
    this.moviesBySlug = new Map();
    this.moviesByEname = new Map();
    this.moviesByVname = new Map();
    this.allMovies = [];
    this.totalMovies = 628;
    this.totalPages = 63;
    this.isInitialized = false;

    // Start background sync
    this.init().catch(err => {
      console.warn('[ViCDN] Initial sync warning:', err.message);
    });

    // Refresh every 30 minutes
    const syncTimer = setInterval(() => {
      this.syncCatalog().catch(() => {});
    }, 30 * 60 * 1000);
    if (syncTimer && syncTimer.unref) syncTimer.unref();
  }

  async fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 5000);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          ...options.headers
        },
        signal: controller.signal,
        ...options
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        throw new Error(`ViCDN API HTTP ${res.status}: ${url}`);
      }
      return res.json();
    } catch(err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  async init() {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.syncCatalog().then(() => {
      this.isInitialized = true;
    }).catch(err => {
      console.warn('[ViCDN] Init sync error:', err.message);
    });
    return this.initPromise;
  }

  async syncCatalog() {
    try {
      console.log('[ViCDN] Syncing catalog from vicdn.cc...');
      const movieMap = new Map();

      // Seed essential known ViCDN titles from documentation
      const seedTitles = [
        {
          slug: 'tv-278275-1',
          stt: '21',
          total: '29',
          ename: 'Veil Of Shadows',
          vname: 'Nguyệt Lân Ỷ Kỷ',
          poster: '4DmQ06B7yaUoxWWyic90rROTsgy',
          banner: 'kqTed4gcvlFP6Q4MzVW6zNCjHBl',
          year: 2026,
          duration: 45,
          country: ['CN'],
          cast: ['Cúc Tịnh Y', 'Trần Đô Linh', 'Tăng Thuấn Hy', 'Điền Gia Thụy'],
          genre: ['Chính Kịch', 'Viễn Tưởng', 'Cổ Trang'],
          content: 'Lộ Vu Y là cửu vỹ hồ nhỏ nhất tổ chức thần bí Vô Tướng Nguyệt...',
          time: '2026-04-13 13:53:38',
          type: 'tv',
          tmdb: '278275',
          ss: '1'
        },
        {
          slug: 'tv-297557-1',
          stt: '1',
          total: '12',
          ename: 'The Classroom Of A Black Cat And A Witch, Kuroneko to Majo no Kyoushitsu',
          vname: 'Hắc Miêu Và Lớp Học Phù Thủy',
          poster: 'e850NPQg3a4ZJDWE2EmxmjGa6Ab',
          banner: 'c5jFg7wgv6IPch1QajQhSRW2zB8',
          year: 2026,
          duration: 24,
          country: ['JP'],
          cast: [],
          genre: ['Hoạt Hình', 'Viễn Tưởng', 'Hài Hước'],
          content: 'Spica Virgo mơ ước được gia nhập một học viện phép thuật...',
          time: '2026-04-13 10:49:22',
          type: 'tv',
          tmdb: '297557',
          ss: '1'
        }
      ];
      for (const s of seedTitles) {
        movieMap.set(s.slug, { ...s, search_unverified: true });
      }

      // 1. Fetch update pages 1 to 7 in parallel
      const updatePages = [1, 2, 3, 4, 5, 6, 7];
      const updateResults = await Promise.allSettled(
        updatePages.map(page => this.fetchJson(`${this.baseUrl}/update/${page}`))
      );

      for (const res of updateResults) {
        if (res.status === 'fulfilled' && res.value) {
          if (res.value.pagination?.total_records) {
            this.totalMovies = res.value.pagination.total_records;
            this.totalPages = res.value.pagination.total_pages;
          }
          if (Array.isArray(res.value.data)) {
            for (const item of res.value.data) {
              if (item && item.slug) {
                movieMap.set(item.slug, item);
              }
            }
          }
        }
      }

      // 2. Fetch specific popular genres to capture any extra titles
      const types = ['hoat-hinh', 'vien-tuong', 'hinh-su', 'bi-an', 'hanh-dong'];
      const typeResults = await Promise.allSettled(
        types.map(t => this.fetchJson(`${this.baseUrl}/type/${t}/1`))
      );

      for (const res of typeResults) {
        if (res.status === 'fulfilled' && res.value && Array.isArray(res.value.data)) {
          for (const item of res.value.data) {
            if (item && item.slug) {
              movieMap.set(item.slug, item);
            }
          }
        }
      }

      this.searchSyncUnavailable = ![...updateResults, ...typeResults].some(result => result.status === 'fulfilled' && Array.isArray(result.value?.data));
      this.searchSyncAt = Date.now();
      if (this.searchSyncUnavailable && this.allMovies.some(item => !item.search_unverified)) return;

      // Rebuild index maps
      this.moviesByTmdb.clear();
      this.moviesBySlug.clear();
      this.moviesByEname.clear();
      this.moviesByVname.clear();

      this.allMovies = Array.from(movieMap.values());
      for (const item of this.allMovies) {
        this.moviesBySlug.set(item.slug, item);

        if (item.tmdb) {
          this.moviesByTmdb.set(String(item.tmdb), item);
        }

        if (item.ename) {
          const normE = removeAccents(item.ename);
          if (normE) this.moviesByEname.set(normE, item);
          const cleanE = removeAccents(cleanTitle(item.ename));
          if (cleanE) this.moviesByEname.set(cleanE, item);
        }

        if (item.vname) {
          const normV = removeAccents(item.vname);
          if (normV) this.moviesByVname.set(normV, item);
          const cleanV = removeAccents(cleanTitle(item.vname));
          if (cleanV) this.moviesByVname.set(cleanV, item);
        }
      }

      console.log(`[ViCDN] Synced ${this.allMovies.length} movies into memory index (Total catalog: ${this.totalMovies}).`);
    } catch (err) {
      console.error('[ViCDN] Error syncing catalog:', err);
    }
  }

  getTotalMovies() {
    return this.totalMovies || 628;
  }

  async fetchInfo(slug) {
    if (!slug) return null;
    const cacheKey = `vicdn_info_${slug}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const res = await this.fetchJson(`${this.baseUrl}/info/${slug}`);
      if (res && res.status === 'success' && res.data) {
        this.cache.set(cacheKey, res.data, 60 * 60 * 1000); // 1 hour cache
        return res.data;
      }
    } catch (err) {
      // not found or error
    }
    return null;
  }

  hasBilingualMatch(movie) {
    if (!movie) return false;
    if (movie.has_song_ngu) return true;

    // Check TMDB ID
    let tmdbId = null;
    if (movie.tmdb) {
      if (typeof movie.tmdb === 'object' && movie.tmdb.id) tmdbId = String(movie.tmdb.id);
      else if (typeof movie.tmdb === 'string' || typeof movie.tmdb === 'number') tmdbId = String(movie.tmdb);
    }
    if (tmdbId && this.moviesByTmdb.has(tmdbId)) {
      const c = this.moviesByTmdb.get(tmdbId);
      if (isCompatibleMovie(movie, c)) return true;
    }

    // Check slug
    if (movie.slug && this.moviesBySlug.has(movie.slug)) {
      const c = this.moviesBySlug.get(movie.slug);
      if (isCompatibleMovie(movie, c)) return true;
    }

    // Check Origin name
    if (movie.origin_name) {
      const normOrigin = removeAccents(movie.origin_name);
      if (normOrigin && this.moviesByEname.has(normOrigin)) {
        const c = this.moviesByEname.get(normOrigin);
        if (isCompatibleMovie(movie, c)) return true;
      }
    }

    // Check Vietnamese name
    if (movie.name) {
      const normName = removeAccents(movie.name);
      if (normName && this.moviesByVname.has(normName)) {
        const c = this.moviesByVname.get(normName);
        if (isCompatibleMovie(movie, c)) return true;
      }
    }

    return false;
  }

  async findMatch(movie) {
    if (!movie) return null;

    // 1. Match by TMDB ID
    let tmdbId = null;
    if (movie.tmdb) {
      if (typeof movie.tmdb === 'object' && movie.tmdb.id) {
        tmdbId = String(movie.tmdb.id);
      } else if (typeof movie.tmdb === 'string' || typeof movie.tmdb === 'number') {
        const val = String(movie.tmdb).trim();
        if (/^\d+$/.test(val) && Number(val) > 0) tmdbId = val;
      }
    }

    if (tmdbId && this.moviesByTmdb.has(tmdbId)) {
      const candidate = this.moviesByTmdb.get(tmdbId);
      if (isCompatibleMovie(movie, candidate)) return candidate;
    }

    // 2. Match by direct slug if movie.slug is a ViCDN slug
    if (movie.slug && this.moviesBySlug.has(movie.slug)) {
      const candidate = this.moviesBySlug.get(movie.slug);
      if (isCompatibleMovie(movie, candidate)) return candidate;
    }

    // 3. Match by normalized English name (origin_name)
    if (movie.origin_name) {
      const normOrigin = removeAccents(movie.origin_name);
      if (normOrigin && this.moviesByEname.has(normOrigin)) {
        const candidate = this.moviesByEname.get(normOrigin);
        if (isCompatibleMovie(movie, candidate)) return candidate;
      }
      const cleanOrigin = removeAccents(cleanTitle(movie.origin_name));
      if (cleanOrigin && this.moviesByEname.has(cleanOrigin)) {
        const candidate = this.moviesByEname.get(cleanOrigin);
        if (isCompatibleMovie(movie, candidate)) return candidate;
      }
    }

    // 4. Match by normalized Vietnamese name (name)
    if (movie.name) {
      const normName = removeAccents(movie.name);
      if (normName && this.moviesByVname.has(normName)) {
        const candidate = this.moviesByVname.get(normName);
        if (isCompatibleMovie(movie, candidate)) return candidate;
      }
      const cleanNameStr = removeAccents(cleanTitle(movie.name));
      if (cleanNameStr && this.moviesByVname.has(cleanNameStr)) {
        const candidate = this.moviesByVname.get(cleanNameStr);
        if (isCompatibleMovie(movie, candidate)) return candidate;
      }
    }

    // 5. Match by cleaned slug
    if (movie.slug) {
      const cleanSlug = removeAccents(movie.slug.replace(/-\d{4}$/, '').replace(/-/g, ' '));
      if (cleanSlug) {
        if (this.moviesByEname.has(cleanSlug)) {
          const candidate = this.moviesByEname.get(cleanSlug);
          if (isCompatibleMovie(movie, candidate)) return candidate;
        }
        if (this.moviesByVname.has(cleanSlug)) {
          const candidate = this.moviesByVname.get(cleanSlug);
          if (isCompatibleMovie(movie, candidate)) return candidate;
        }
      }
    }

    // 6. Match by alternative_names if present
    if (Array.isArray(movie.alternative_names)) {
      for (const alt of movie.alternative_names) {
        const normAlt = removeAccents(alt);
        if (normAlt) {
          const c1 = this.moviesByEname.get(normAlt);
          if (c1 && isCompatibleMovie(movie, c1)) return c1;
          const c2 = this.moviesByVname.get(normAlt);
          if (c2 && isCompatibleMovie(movie, c2)) return c2;
        }
        const cleanAlt = removeAccents(cleanTitle(alt));
        if (cleanAlt) {
          const c1 = this.moviesByEname.get(cleanAlt);
          if (c1 && isCompatibleMovie(movie, c1)) return c1;
          const c2 = this.moviesByVname.get(cleanAlt);
          if (c2 && isCompatibleMovie(movie, c2)) return c2;
        }
      }
    }

    // 7. Direct probe if tmdbId is known (e.g. tv-{tmdbId}-1)
    if (tmdbId) {
      const probeSlug = `tv-${tmdbId}-1`;
      const directInfo = await this.fetchInfo(probeSlug);
      if (directInfo && isCompatibleMovie(movie, directInfo)) {
        return directInfo;
      }
    }

    return null;
  }

  async getBilingualServer(movie) {
    try {
      const matched = await this.findMatch(movie);
      if (!matched || !matched.slug) return null;

      // Fetch full info to get list_episodes
      const info = await this.fetchInfo(matched.slug);
      if (!info || !Array.isArray(info.list_episodes) || info.list_episodes.length === 0) {
        return null;
      }

      // Check episode count compatibility
      const targetEpCount = (Array.isArray(movie.episodes) && movie.episodes[0]?.server_data?.length) ||
                            parseInt(movie.episode_total, 10) || 0;
      const totalEpItems = info.list_episodes.length;
      if (targetEpCount > 3 && totalEpItems <= 1) {
        return null;
      }

      const serverData = info.list_episodes.map(epStr => {
        const parts = epStr.split('|');
        const num = parts[0]?.trim() || '1';
        const url = parts[1]?.trim() || parts[0]?.trim();
        const videoId = url.replace(/^https?:\/\/[^/]+\//, '');
        const isVicdn = /(?:vicdn\.cc|pages\.dev|^tv-|^movie-)/.test(url);
        return {
          name: num,
          slug: `tap-${num}`,
          filename: `Tập ${num}`,
          link_embed: isVicdn ? `/embed/vicdn/${videoId}` : url,
          link_m3u8: ''
        };
      });

      return {
        server_name: 'Song Ngữ (Đa Giọng & Phụ Đề)',
        server_type: 'song_ngu',
        server_note: 'Đa Giọng (Audio Gốc + Thuyết Minh Nam/Nữ) & Phụ Đề Đa Ngôn Ngữ',
        is_song_ngu: true,
        vicdn_slug: matched.slug,
        server_data: serverData
      };
    } catch (err) {
      console.warn('[ViCDN] getBilingualServer error:', err.message);
      return null;
    }
  }

  async getMovieDetail(slug) {
    if (!slug) return null;
    const info = await this.fetchInfo(slug);
    if (!info) return null;

    const resolveImg = (img, type = 'w400') => {
      if (!img) return '';
      if (img.startsWith('http')) return img;
      return `https://image.tmdb.org/t/p/${type}/${img}.jpg`;
    };

    const movie = {
      id: info.slug,
      name: info.vname || info.ename,
      slug: info.slug,
      origin_name: info.ename || info.vname || '',
      content: info.content ? info.content.replace(/<[^>]*>?/gm, '').trim() : '',
      raw_content: info.content || '',
      type: info.type === 'tv' ? 'series' : 'single',
      status: 'completed',
      poster_url: resolveImg(info.poster, 'w400'),
      thumb_url: resolveImg(info.banner, 'w1280') || resolveImg(info.poster, 'w400'),
      is_copyright: false,
      sub_docquyen: false,
      chieurap: false,
      has_song_ngu: true,
      trailer_url: '',
      time: info.duration ? `${info.duration} phút/tập` : '',
      episode_current: info.stt ? `Tập ${info.stt}/${info.total || info.stt}` : 'Trọn Bộ',
      episode_total: info.total || '',
      quality: 'FHD',
      lang: 'Song Ngữ (Audio Gốc + Thuyết Minh)',
      year: info.year || 2026,
      view: 1200,
      actor: Array.isArray(info.cast) ? info.cast : [],
      director: [],
      category: Array.isArray(info.genre) ? info.genre.map(g => ({ name: g, slug: removeAccents(g) })) : [],
      country: Array.isArray(info.country) ? info.country.map(c => ({ name: c, slug: c.toLowerCase() })) : []
    };

    const serverData = (info.list_episodes || []).map(epStr => {
      const parts = epStr.split('|');
      const num = parts[0]?.trim() || '1';
      const url = parts[1]?.trim() || parts[0]?.trim();
      const videoId = url.replace(/^https?:\/\/[^/]+\//, '');
      const isVicdn = /(?:vicdn\.cc|pages\.dev|^tv-|^movie-)/.test(url);
      return {
        name: num,
        slug: `tap-${num}`,
        filename: `Tập ${num}`,
        link_embed: isVicdn ? `/embed/vicdn/${videoId}` : url,
        link_m3u8: ''
      };
    });

    const episodes = [
      {
        server_name: 'Song Ngữ (Đa Giọng & Phụ Đề)',
        server_type: 'song_ngu',
        is_song_ngu: true,
        server_data: serverData
      }
    ];

    return {
      movie,
      episodes,
      related: []
    };
  }

  async ensureSearchIndex() {
    if (!this.isInitialized) return this.init();
    if (!this.searchSyncUnavailable || Date.now() - (this.searchSyncAt || 0) < 5000) return;
    if (!this.searchSyncRetry) this.searchSyncRetry = this.syncCatalog().finally(() => { this.searchSyncRetry = null; });
    return this.searchSyncRetry;
  }

  async getCatalog({ page = 1, limit = 30, keyword = '', year, sort, category, country, format } = {}) {
    await this.ensureSearchIndex();
    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(60, Math.max(1, parseInt(limit, 10) || 30));
    const query = searchText(keyword);
    const image = (value, size) => !value ? '' : /^https?:\/\//i.test(value) ? value : `https://image.tmdb.org/t/p/${size}/${value}.jpg`;
    const active = value => value && value !== 'all';
    const countries = { CN: 'trung-quoc', JP: 'nhat-ban', KR: 'han-quoc', VN: 'viet-nam', US: 'au-my', GB: 'anh', TH: 'thai-lan', TW: 'dai-loan', HK: 'hong-kong', IN: 'an-do', FR: 'phap', CA: 'canada', DE: 'duc' };
    let movies = this.allMovies.filter(item => !item.search_unverified && item.slug &&
      (!String(keyword).trim() || (query && [item.vname, item.ename, item.slug].some(value => searchText(value).includes(query)))) &&
      (!active(year) || (year === 'pre-2020' ? Number(item.year) > 0 && Number(item.year) < 2020 : String(item.year) === String(year))) &&
      (!active(category) || (item.genre || []).some(value => removeAccents(value.slug || value.name || value) === removeAccents(category))) &&
      (!active(country) || (item.country || []).some(value => removeAccents(countries[String(value).toUpperCase()] || value.slug || value.name || value) === removeAccents(country))));
    movies = movies.filter(item => require('./catalogFormat')({ quality: item.quality || '', lang: 'Song Ngữ', has_song_ngu: true }, format));
    if (['year', 'released'].includes(sort)) movies = [...movies].sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
    const items = movies.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(item => ({
      id: item.slug, slug: item.slug, name: item.vname || item.ename || item.slug,
      origin_name: item.ename || '', year: item.year || null,
      poster_url: image(item.poster, 'w400'), thumb_url: image(item.banner, 'w1280') || image(item.poster, 'w400'),
      quality: item.quality || '', lang: 'Song Ngữ', has_song_ngu: true, source: 'vicdn',
      category: (item.genre || []).map(value => ({ name: value, slug: removeAccents(value) })),
      country: (item.country || []).map(value => ({ name: value, slug: countries[String(value).toUpperCase()] || removeAccents(value) })),
      episode_current: item.stt ? `Tập ${item.stt}/${item.total || item.stt}` : '',
      type: item.type === 'tv' ? 'series' : 'single', tmdb: item.tmdb || null
    }));
    const unavailable = !this.allMovies.some(item => !item.search_unverified);
    return { items, ...(unavailable ? { error: 'provider_unavailable' } : {}), searchInfo: { limited: true, partial: !!this.searchSyncUnavailable, unavailable, message: 'Song Ngữ: tìm trong chỉ mục ViCDN đã đồng bộ, không phải toàn bộ kho phim. Chỉ hỗ trợ thứ tự đồng bộ hoặc năm phát hành.' }, pagination: { totalItems: movies.length, totalItemsPerPage: pageSize, currentPage, totalPages: Math.max(1, Math.ceil(movies.length / pageSize)) } };
  }

  async searchViCdn(keyword, { unlimited = false } = {}) {
    await this.ensureSearchIndex();
    if (!keyword) return [];
    const trimmed = String(keyword).trim().slice(0, 200);

    const resolveImg = (img, type = 'w400') => {
      if (!img) return '';
      if (img.startsWith('http')) return img;
      return `https://image.tmdb.org/t/p/${type}/${img}.jpg`;
    };

    // 1. Direct slug probe
    if (/^(?:tv|movie)-[a-z0-9-]+$/i.test(trimmed)) {
      try {
        const direct = await this.fetchInfo(trimmed);
        if (direct) {
          return [{
            id: direct.slug,
            name: direct.vname || direct.ename,
            slug: direct.slug,
            origin_name: direct.ename || direct.vname || '',
            poster_url: resolveImg(direct.poster, 'w400'),
            thumb_url: resolveImg(direct.banner, 'w1280') || resolveImg(direct.poster, 'w400'),
            year: direct.year || null,
            quality: direct.quality || '',
            lang: 'Song Ngữ',
            episode_current: direct.stt ? `Tập ${direct.stt}/${direct.total || direct.stt}` : 'Trọn Bộ',
            type: direct.type === 'tv' ? 'series' : 'single',
            source: 'vicdn',
            source_name: 'ViCDN Song Ngữ',
            source_badge: 'ViCDN',
            has_song_ngu: true
          }];
        }
      } catch(e) {}
    }

    const norm = searchText(trimmed);
    if (!norm) return [];

    const matches = [];
    for (const item of this.allMovies) {
      if (item.search_unverified) continue;
      const vnameNorm = searchText(item.vname);
      const enameNorm = searchText(item.ename);
      const slugNorm = searchText(item.slug);
      if (
        (vnameNorm && vnameNorm.includes(norm)) ||
        (enameNorm && enameNorm.includes(norm)) ||
        (slugNorm && slugNorm.includes(norm))
      ) {
        matches.push({
          id: item.slug,
          name: item.vname || item.ename,
          slug: item.slug,
          origin_name: item.ename || item.vname || '',
          poster_url: resolveImg(item.poster, 'w400'),
          thumb_url: resolveImg(item.banner, 'w1280') || resolveImg(item.poster, 'w400'),
          year: item.year || null,
          quality: item.quality || '',
          lang: 'Song Ngữ',
          episode_current: item.stt ? `Tập ${item.stt}/${item.total || item.stt}` : 'Trọn Bộ',
          type: item.type === 'tv' ? 'series' : 'single', tmdb: item.tmdb || null,
          category: (item.genre || []).map(value => ({ name: value, slug: removeAccents(value) })),
          country: (item.country || []).map(value => ({ name: value, slug: ({ CN: 'trung-quoc', JP: 'nhat-ban', KR: 'han-quoc', VN: 'viet-nam', US: 'au-my', TH: 'thai-lan' })[value] || removeAccents(value) })),
          source: 'vicdn',
          source_name: 'ViCDN Song Ngữ',
          source_badge: 'ViCDN',
          has_song_ngu: true
        });
      }
    }
    return unlimited ? matches : matches.slice(0, 15);
  }

  decryptAesGcm(encText, secret = 'vicdn_cc_key') {
    if (!encText || typeof encText !== 'string') return '';
    const ivM = encText.match(/#ENC-AESGCM;iv=([0-9a-fA-F]+)/);
    if (!ivM) return encText;
    try {
      const iv = Buffer.from(ivM[1], 'hex');
      const lines = encText.trim().split('\n');
      const b64 = lines[lines.length - 1];
      const bin = Buffer.from(b64, 'base64');
      const encD = bin.subarray(0, bin.length - 16);
      const tag = bin.subarray(bin.length - 16);
      const hash = crypto.createHash('sha256').update(secret).digest();
      const decipher = crypto.createDecipheriv('aes-256-gcm', hash, iv);
      decipher.setAuthTag(tag);
      const dec = Buffer.concat([decipher.update(encD), decipher.final()]);
      return dec.toString('utf8');
    } catch (err) {
      console.warn('[ViCDN] Decrypt error:', err.message);
      return '';
    }
  }

  async getStreamMetadata(videoId) {
    if (!videoId) return null;
    const cacheKey = `vicdn_stream_meta_${videoId}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const res = await fetch(`https://vicdn.cc/${videoId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) return null;
      const html = await res.text();
      let js = html;
      const packerMatch = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]+?\.split\('\|'\)\)\)/g);
      if (packerMatch) {
        for (const match of packerMatch) {
          if (match.includes('AUDIO_SOURCES') || match.includes('VIDEO_ID')) {
            try {
              const fn = new Function('return ' + match.replace(/^eval/, ''));
              js = fn();
              break;
            } catch (_) {}
          }
        }
      }

      const audioSources = {};
      const audioMatches = js.matchAll(/AUDIO_SOURCES\.([a-zA-Z0-9_]+)\s*=\s*['"]([^'"]+)['"]/g);
      for (const m of audioMatches) {
        audioSources[m[1]] = m[2];
      }

      const vttVi = js.match(/VTT_VI_URL\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
      const vttEn = js.match(/VTT_EN_URL\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';

      const data = { audioSources, vttVi, vttEn };
      if (Object.keys(audioSources).length > 0) {
        this.cache.set(cacheKey, data, 2 * 60 * 60 * 1000); // 2 hours
      }
      return data;
    } catch (err) {
      console.warn(`[ViCDN] getStreamMetadata error for ${videoId}:`, err.message);
      return null;
    }
  }

  async getMasterPlaylist(videoId, baseOrigin = '') {
    const meta = await this.getStreamMetadata(videoId);
    if (!meta || !meta.audioSources || !meta.audioSources.original) return null;

    const base = baseOrigin || '';
    let m3u8 = '#EXTM3U\n#EXT-X-VERSION:7\n\n';

    m3u8 += `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Audio Gốc",DEFAULT=YES,AUTOSELECT=YES,URI="${base}/api/stream/vicdn/${videoId}/original.m3u8"\n`;
    if (meta.audioSources.female) {
      m3u8 += `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Thuyết Minh Nữ",DEFAULT=NO,AUTOSELECT=NO,URI="${base}/api/stream/vicdn/${videoId}/female.m3u8"\n`;
    }
    if (meta.audioSources.male) {
      m3u8 += `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Thuyết Minh Nam",DEFAULT=NO,AUTOSELECT=NO,URI="${base}/api/stream/vicdn/${videoId}/male.m3u8"\n`;
    }

    m3u8 += `\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,AUDIO="audio"\n`;
    m3u8 += `${base}/api/stream/vicdn/${videoId}/original.m3u8\n`;

    return m3u8;
  }

  async getTrackPlaylist(videoId, track = 'original') {
    const cacheKey = `vicdn_playlist_${videoId}_${track}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const meta = await this.getStreamMetadata(videoId);
    if (!meta || !meta.audioSources) return null;
    const url = meta.audioSources[track] || meta.audioSources.original;
    if (!url) return null;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': `https://vicdn.cc/${videoId}`
        },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) return null;
      const encText = await res.text();
      let m3u8 = this.decryptAesGcm(encText);
      if (!m3u8) return null;

      // Rewrite blocked pages.dev domains to unblocked vicdn.cc CDN subdomains
      m3u8 = m3u8.replace(/https:\/\/[^/]*?(x\d+)-vicdn-cc\.pages\.dev\//g, 'https://$1.vicdn.cc/');

      // Rewrite fMP4 .png segment URLs to local proxy to fix Content-Type (image/png -> video/mp4) and bypass 4G blocks
      m3u8 = m3u8.replace(/https:\/\/(x\d+\.vicdn\.cc\/[^\s"']+\.png)/g, (match) => {
        return `/api/stream/vicdn/segment?url=${encodeURIComponent(match)}`;
      });

      this.cache.set(cacheKey, m3u8, 60 * 60 * 1000); // 1 hour cache
      return m3u8;
    } catch (err) {
      console.warn(`[ViCDN] getTrackPlaylist error for ${videoId}/${track}:`, err.message);
      return null;
    }
  }

  parseVTT(raw) {
    if (!raw) return [];
    const lines = raw.split(/\r?\n/).map(l => l.trim());
    const res = [];
    let i = 0;
    const vttTime = s => {
      const p = s.trim().split(':');
      if (p.length === 3) return (+p[0])*3600 + (+p[1])*60 + parseFloat(p[2]);
      if (p.length === 2) return (+p[0])*60 + parseFloat(p[1]);
      return 0;
    };
    while (i < lines.length) {
      const line = lines[i];
      if (line.includes('-->')) {
        const parts = line.split('-->');
        const start = vttTime(parts[0]);
        const endPart = parts[1].trim().split(' ')[0];
        const end = vttTime(endPart);
        i++;
        const textLines = [];
        while (i < lines.length && lines[i] !== '') {
          textLines.push(lines[i]);
          i++;
        }
        const text = textLines.join(' ').replace(/<[^>]+>/g, '').trim();
        if (text && end > start) res.push({ start, end, text });
      } else {
        i++;
      }
    }
    return res;
  }

  fmtVttTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s + '.' + (ms < 100 ? (ms < 10 ? '00' : '0') : '') + ms;
  }

  async getBilingualSubtitle(videoId) {
    const cacheKey = `vicdn_sub_${videoId}_bilingual`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const [subVi, subEn] = await Promise.all([
      this.getSubtitle(videoId, 'vi'),
      this.getSubtitle(videoId, 'en')
    ]);

    if (!subVi && !subEn) return null;
    if (!subVi) return subEn;
    if (!subEn) return subVi;

    const viCues = this.parseVTT(subVi);
    const enCues = this.parseVTT(subEn);

    let merged = 'WEBVTT\n\n';
    for (const vi of viCues) {
      const en = enCues.find(e => Math.abs(e.start - vi.start) < 2.5 || (vi.start >= e.start && vi.start < e.end));
      merged += this.fmtVttTime(vi.start) + ' --> ' + this.fmtVttTime(vi.end) + '\n';
      if (en && en.text && en.text !== vi.text) {
        merged += vi.text + '\n' + en.text + '\n\n';
      } else {
        merged += vi.text + '\n\n';
      }
    }

    this.cache.set(cacheKey, merged, 6 * 60 * 60 * 1000);
    return merged;
  }

  async getSubtitle(videoId, lang = 'vi') {
    if (lang === 'bilingual' || lang === 'vi-en') {
      return this.getBilingualSubtitle(videoId);
    }
    const cacheKey = `vicdn_sub_${videoId}_${lang}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const meta = await this.getStreamMetadata(videoId);
    if (!meta) return null;
    const url = lang === 'en' ? meta.vttEn : meta.vttVi;
    if (!url) return null;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Referer': `https://vicdn.cc/${videoId}`
        },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) return null;
      const encText = await res.text();
      const vtt = this.decryptAesGcm(encText);
      if (!vtt) return null;

      this.cache.set(cacheKey, vtt, 6 * 60 * 60 * 1000); // 6 hours cache
      return vtt;
    } catch (err) {
      console.warn(`[ViCDN] getSubtitle error for ${videoId}/${lang}:`, err.message);
      return null;
    }
  }
}

module.exports = new ViCDNService();
