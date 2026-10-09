// KKPhim - ViCDN Service (Multi-source Bilingual Dual-Audio Provider)
const path = require('path');

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

function removeAccents(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function cleanTitle(str) {
  if (!str) return '';
  return String(str)
    .replace(/\((?:phần|season|tập|ss)\s*\d+[^)]*\)/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\b20\d{2}\b/g, '')
    .replace(/\(\d{4}\)/g, '')
    .trim();
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
        movieMap.set(s.slug, s);
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

    // 1. Match by TMDB ID
    let tmdbId = null;
    if (movie.tmdb) {
      if (typeof movie.tmdb === 'object' && movie.tmdb.id) {
        tmdbId = String(movie.tmdb.id);
      } else if (typeof movie.tmdb === 'string' || typeof movie.tmdb === 'number') {
        tmdbId = String(movie.tmdb);
      }
    }
    if (tmdbId && this.moviesByTmdb.has(tmdbId)) {
      return true;
    }

    // 2. Match by direct slug
    if (movie.slug && this.moviesBySlug.has(movie.slug)) {
      return true;
    }

    // 3. Match by normalized English name (origin_name)
    if (movie.origin_name) {
      const normOrigin = removeAccents(movie.origin_name);
      if (normOrigin && this.moviesByEname.has(normOrigin)) return true;
      const cleanOrigin = removeAccents(cleanTitle(movie.origin_name));
      if (cleanOrigin && this.moviesByEname.has(cleanOrigin)) return true;
    }

    // 4. Match by normalized Vietnamese name (name)
    if (movie.name) {
      const normName = removeAccents(movie.name);
      if (normName && this.moviesByVname.has(normName)) return true;
      const cleanNameStr = removeAccents(cleanTitle(movie.name));
      if (cleanNameStr && this.moviesByVname.has(cleanNameStr)) return true;
    }

    // 5. Match by cleaned slug
    if (movie.slug) {
      const cleanSlug = removeAccents(movie.slug.replace(/-\d{4}$/, '').replace(/-/g, ' '));
      if (cleanSlug && (this.moviesByEname.has(cleanSlug) || this.moviesByVname.has(cleanSlug))) {
        return true;
      }
    }

    // 6. Match by alternative_names
    if (Array.isArray(movie.alternative_names)) {
      for (const alt of movie.alternative_names) {
        const normAlt = removeAccents(alt);
        if (normAlt && (this.moviesByEname.has(normAlt) || this.moviesByVname.has(normAlt))) return true;
        const cleanAlt = removeAccents(cleanTitle(alt));
        if (cleanAlt && (this.moviesByEname.has(cleanAlt) || this.moviesByVname.has(cleanAlt))) return true;
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
        tmdbId = String(movie.tmdb);
      }
    }

    if (tmdbId && this.moviesByTmdb.has(tmdbId)) {
      return this.moviesByTmdb.get(tmdbId);
    }

    // 2. Match by direct slug if movie.slug is a ViCDN slug
    if (movie.slug && this.moviesBySlug.has(movie.slug)) {
      return this.moviesBySlug.get(movie.slug);
    }

    // 3. Match by normalized English name (origin_name)
    if (movie.origin_name) {
      const normOrigin = removeAccents(movie.origin_name);
      if (normOrigin && this.moviesByEname.has(normOrigin)) {
        return this.moviesByEname.get(normOrigin);
      }
      const cleanOrigin = removeAccents(cleanTitle(movie.origin_name));
      if (cleanOrigin && this.moviesByEname.has(cleanOrigin)) {
        return this.moviesByEname.get(cleanOrigin);
      }
    }

    // 4. Match by normalized Vietnamese name (name)
    if (movie.name) {
      const normName = removeAccents(movie.name);
      if (normName && this.moviesByVname.has(normName)) {
        return this.moviesByVname.get(normName);
      }
      const cleanNameStr = removeAccents(cleanTitle(movie.name));
      if (cleanNameStr && this.moviesByVname.has(cleanNameStr)) {
        return this.moviesByVname.get(cleanNameStr);
      }
    }

    // 5. Match by cleaned slug
    if (movie.slug) {
      const cleanSlug = removeAccents(movie.slug.replace(/-\d{4}$/, '').replace(/-/g, ' '));
      if (cleanSlug) {
        if (this.moviesByEname.has(cleanSlug)) return this.moviesByEname.get(cleanSlug);
        if (this.moviesByVname.has(cleanSlug)) return this.moviesByVname.get(cleanSlug);
      }
    }

    // 6. Match by alternative_names if present
    if (Array.isArray(movie.alternative_names)) {
      for (const alt of movie.alternative_names) {
        const normAlt = removeAccents(alt);
        if (normAlt && (this.moviesByEname.has(normAlt) || this.moviesByVname.has(normAlt))) {
          return this.moviesByEname.get(normAlt) || this.moviesByVname.get(normAlt);
        }
        const cleanAlt = removeAccents(cleanTitle(alt));
        if (cleanAlt && (this.moviesByEname.has(cleanAlt) || this.moviesByVname.has(cleanAlt))) {
          return this.moviesByEname.get(cleanAlt) || this.moviesByVname.get(cleanAlt);
        }
      }
    }

    // 7. Direct probe if tmdbId is known (e.g. tv-{tmdbId}-1)
    if (tmdbId) {
      const probeSlug = `tv-${tmdbId}-1`;
      const directInfo = await this.fetchInfo(probeSlug);
      if (directInfo) {
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

      const serverData = info.list_episodes.map(epStr => {
        const parts = epStr.split('|');
        const num = parts[0]?.trim() || '1';
        const url = parts[1]?.trim() || parts[0]?.trim();
        return {
          name: num,
          slug: `tap-${num}`,
          filename: `Tập ${num}`,
          link_embed: url,
          link_m3u8: ''
        };
      });

      return {
        server_name: 'ViCDN #Song Ngữ (Đa Giọng & Phụ Đề)',
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
      return {
        name: num,
        slug: `tap-${num}`,
        filename: `Tập ${num}`,
        link_embed: url,
        link_m3u8: ''
      };
    });

    const episodes = [
      {
        server_name: 'ViCDN #Song Ngữ (Đa Giọng & Phụ Đề)',
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

  async searchViCdn(keyword) {
    if (!this.isInitialized) {
      await this.init();
    }
    if (!keyword) return [];
    const trimmed = keyword.trim();

    const resolveImg = (img, type = 'w400') => {
      if (!img) return '';
      if (img.startsWith('http')) return img;
      return `https://image.tmdb.org/t/p/${type}/${img}.jpg`;
    };

    // 1. Direct slug probe
    if (trimmed.startsWith('tv-') || trimmed.startsWith('movie-')) {
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
            year: direct.year || 2026,
            quality: 'FHD • Song Ngữ',
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

    const norm = removeAccents(trimmed);
    if (!norm) return [];

    const matches = [];
    for (const item of this.allMovies) {
      const vnameNorm = removeAccents(item.vname);
      const enameNorm = removeAccents(item.ename);
      const slugNorm = removeAccents(item.slug);
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
          year: item.year || 2026,
          quality: 'FHD • Song Ngữ',
          lang: 'Song Ngữ',
          episode_current: item.stt ? `Tập ${item.stt}/${item.total || item.stt}` : 'Trọn Bộ',
          type: item.type === 'tv' ? 'series' : 'single',
          source: 'vicdn',
          source_name: 'ViCDN Song Ngữ',
          source_badge: 'ViCDN',
          has_song_ngu: true
        });
      }
    }
    return matches.slice(0, 15);
  }
}

module.exports = new ViCDNService();
