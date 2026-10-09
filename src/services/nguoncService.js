// KKPhim - NguonC Service (Multi-source Streaming Provider)
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

class NguonCService {
  constructor() {
    this.baseUrl = 'https://phim.nguonc.com/api';
    this.cache = new MemoryCache();
    this.moviesByTmdb = new Map();
    this.moviesBySlug = new Map();
    this.moviesByEname = new Map();
    this.moviesByVname = new Map();
    this.recentMovies = [];
    this.totalMovies = 33450;
    this.totalPages = 3345;
    this.isInitialized = false;

    // Start background sync
    this.init().catch(err => {
      console.warn('[NguonC] Initial sync warning:', err.message);
    });

    // Refresh every 30 minutes
    const syncTimer = setInterval(() => {
      this.syncCatalog().catch(() => {});
    }, 30 * 60 * 1000);
    if (syncTimer && syncTimer.unref) syncTimer.unref();
  }

  async fetchJson(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        ...options.headers
      },
      ...options
    });
    if (!res.ok) {
      throw new Error(`NguonC API HTTP ${res.status}: ${url}`);
    }
    return res.json();
  }

  async init() {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.syncCatalog().then(() => {
      this.isInitialized = true;
    }).catch(err => {
      console.warn('[NguonC] Init sync warning:', err.message);
    });
    return this.initPromise;
  }

  indexItem(item) {
    if (!item || !item.slug) return;
    this.moviesBySlug.set(item.slug, item);

    if (item.tmdb && item.tmdb.id) {
      this.moviesByTmdb.set(String(item.tmdb.id), item);
    }

    if (item.name) {
      const normV = removeAccents(item.name);
      if (normV) this.moviesByVname.set(normV, item);
      const cleanV = removeAccents(cleanTitle(item.name));
      if (cleanV) this.moviesByVname.set(cleanV, item);
    }

    const ename = item.original_name || item.origin_name;
    if (ename) {
      const normE = removeAccents(ename);
      if (normE) this.moviesByEname.set(normE, item);
      const cleanE = removeAccents(cleanTitle(ename));
      if (cleanE) this.moviesByEname.set(cleanE, item);
    }
  }

  async syncCatalog() {
    try {
      console.log('[NguonC] Syncing recent catalog from phim.nguonc.com...');
      // Fetch latest 10 pages in parallel
      const pages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const results = await Promise.allSettled(
        pages.map(p => this.fetchJson(`/films/phim-moi-cap-nhat?page=${p}`))
      );

      const map = new Map();
      for (const res of results) {
        if (res.status === 'fulfilled' && res.value) {
          if (res.value.paginate?.total_items) {
            this.totalMovies = res.value.paginate.total_items;
            this.totalPages = res.value.paginate.total_page;
          }
          if (Array.isArray(res.value.items)) {
            for (const item of res.value.items) {
              if (item && item.slug) {
                map.set(item.slug, item);
              }
            }
          }
        }
      }

      this.recentMovies = Array.from(map.values());
      for (const item of this.recentMovies) {
        this.indexItem(item);
      }
      console.log(`[NguonC] Indexed ${this.recentMovies.length} recent movies into memory (Total catalog: ${this.totalMovies}).`);
    } catch (err) {
      console.warn('[NguonC] Error syncing recent catalog:', err.message);
    }
  }

  getTotalMovies() {
    return this.totalMovies || 33450;
  }

  async findMatch(movie) {
    if (!movie) return null;

    // 1. TMDB ID match
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

    // 2. Direct slug match
    if (movie.slug && this.moviesBySlug.has(movie.slug)) {
      return this.moviesBySlug.get(movie.slug);
    }

    // 3. In-memory name & origin_name match
    if (movie.name) {
      const normV = removeAccents(movie.name);
      if (normV && this.moviesByVname.has(normV)) return this.moviesByVname.get(normV);
      const cleanV = removeAccents(cleanTitle(movie.name));
      if (cleanV && this.moviesByVname.has(cleanV)) return this.moviesByVname.get(cleanV);
    }

    const originName = movie.origin_name || movie.original_name;
    if (originName) {
      const normE = removeAccents(originName);
      if (normE && this.moviesByEname.has(normE)) return this.moviesByEname.get(normE);
      const cleanE = removeAccents(cleanTitle(originName));
      if (cleanE && this.moviesByEname.has(cleanE)) return this.moviesByEname.get(cleanE);
    }

    // 4. On-demand search query if not found in memory
    try {
      const queryKey = cleanTitle(movie.name) || cleanTitle(originName) || movie.name;
      if (queryKey && queryKey.length >= 2) {
        const cacheSearchKey = `nguonc_find_${removeAccents(queryKey)}`;
        let searchResults = this.cache.get(cacheSearchKey);
        if (!searchResults) {
          const res = await this.fetchJson(`/films/search?keyword=${encodeURIComponent(queryKey)}&page=1`);
          searchResults = res.items || [];
          this.cache.set(cacheSearchKey, searchResults, 60 * 60 * 1000);
          for (const item of searchResults) {
            this.indexItem(item);
          }
        }

        const movieYear = parseInt(movie.year, 10) || 0;
        const normMovieName = removeAccents(cleanTitle(movie.name));
        const normMovieOrigin = removeAccents(cleanTitle(originName));

        for (const item of searchResults) {
          // Exact TMDB ID match
          if (tmdbId && item.tmdb?.id && String(item.tmdb.id) === tmdbId) {
            return item;
          }

          const itemYear = parseInt(item.year, 10) || 0;
          const yearClose = !movieYear || !itemYear || Math.abs(movieYear - itemYear) <= 1;

          const normItemName = removeAccents(cleanTitle(item.name));
          const normItemOrigin = removeAccents(cleanTitle(item.original_name));

          if (yearClose) {
            if (normMovieName && normItemName && normMovieName === normItemName) return item;
            if (normMovieOrigin && normItemOrigin && normMovieOrigin === normItemOrigin) return item;
          }
        }
      }
    } catch (e) {
      // ignore search error
    }

    return null;
  }

  async fetchDetail(slug) {
    if (!slug) return null;
    const cacheKey = `nguonc_detail_${slug}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const res = await this.fetchJson(`/film/${slug}`);
      if (res && res.status === 'success' && res.movie) {
        this.cache.set(cacheKey, res.movie, 60 * 60 * 1000);
        this.indexItem(res.movie);
        return res.movie;
      }
    } catch (err) {
      // error
    }
    return null;
  }

  async getServers(movie) {
    try {
      const matched = await this.findMatch(movie);
      if (!matched || !matched.slug) return [];

      const detail = await this.fetchDetail(matched.slug);
      if (!detail || !detail.episodes || !Array.isArray(detail.episodes)) return [];

      const servers = detail.episodes.map((srv, idx) => {
        const srvName = srv.server_name || `Server #${idx + 1}`;
        const serverData = (srv.items || []).map(ep => {
          const epName = ep.name || '1';
          return {
            name: epName,
            slug: ep.slug || `tap-${epName}`,
            filename: `Tập ${epName}`,
            link_embed: ep.embed || '',
            link_m3u8: ''
          };
        });

        return {
          server_name: `NguonC #${srvName}`,
          server_type: 'nguonc',
          server_note: detail.language ? `Nguồn C (${detail.language})` : 'Nguồn C (Phát ổn định)',
          source: 'nguonc',
          nguonc_slug: matched.slug,
          server_data: serverData
        };
      });

      return servers;
    } catch (err) {
      console.warn('[NguonC] getServers error:', err.message);
      return [];
    }
  }

  async getMovieDetail(slug) {
    if (!slug) return null;
    const m = await this.fetchDetail(slug);
    if (!m) return null;

    let categories = [];
    let countries = [];
    let movieType = 'series';
    if (m.category && typeof m.category === 'object') {
      Object.values(m.category).forEach(grp => {
        const groupName = grp.group?.name?.toLowerCase() || '';
        if (groupName.includes('thể loại')) {
          (grp.list || []).forEach(c => categories.push({ name: c.name, slug: removeAccents(c.name) }));
        } else if (groupName.includes('quốc gia')) {
          (grp.list || []).forEach(c => countries.push({ name: c.name, slug: removeAccents(c.name) }));
        } else if (groupName.includes('định dạng')) {
          const fmtName = grp.list?.[0]?.name?.toLowerCase() || '';
          if (fmtName.includes('lẻ')) movieType = 'single';
        }
      });
    }

    const movie = {
      id: m.slug || m.id,
      name: m.name,
      slug: m.slug,
      origin_name: m.original_name || '',
      content: m.description ? m.description.replace(/<[^>]*>?/gm, '').trim() : '',
      raw_content: m.description || '',
      type: movieType,
      status: m.current_episode?.toLowerCase().includes('hoàn tất') ? 'completed' : 'ongoing',
      poster_url: m.poster_url_webp || m.poster_url || m.thumb_url || '',
      thumb_url: m.thumb_url_webp || m.thumb_url || m.poster_url || '',
      is_copyright: false,
      sub_docquyen: false,
      chieurap: false,
      has_song_ngu: false,
      trailer_url: '',
      time: m.time || '',
      episode_current: m.current_episode || 'Trọn Bộ',
      episode_total: m.total_episodes || '',
      quality: m.quality || 'HD',
      lang: m.language || 'Vietsub',
      year: parseInt(m.year, 10) || 2026,
      view: 1500,
      actor: m.casts ? m.casts.split(',').map(s => s.trim()) : [],
      director: m.director ? m.director.split(',').map(s => s.trim()) : [],
      category: categories,
      country: countries,
      tmdb: m.tmdb || null,
      imdb: m.imdb || null,
      source: 'nguonc'
    };

    const episodes = (m.episodes || []).map((srv, idx) => ({
      server_name: `NguonC #${srv.server_name || (idx + 1)}`,
      server_type: 'nguonc',
      server_note: m.language ? `Nguồn C (${m.language})` : 'Nguồn C (Phát ổn định)',
      source: 'nguonc',
      server_data: (srv.items || []).map(ep => ({
        name: ep.name,
        slug: ep.slug,
        filename: `Tập ${ep.name}`,
        link_embed: ep.embed || '',
        link_m3u8: ''
      }))
    }));

    return {
      movie,
      episodes,
      related: []
    };
  }

  async search(keyword) {
    if (!keyword || !keyword.trim()) return [];
    try {
      const trimmed = keyword.trim();
      const res = await this.fetchJson(`/films/search?keyword=${encodeURIComponent(trimmed)}&page=1`);
      if (!res || !res.items || !Array.isArray(res.items)) return [];

      return res.items.map(item => {
        this.indexItem(item);
        return {
          id: item.slug || item.id,
          name: item.name,
          slug: item.slug,
          origin_name: item.original_name || '',
          poster_url: item.poster_url_webp || item.poster_url || item.thumb_url || '',
          thumb_url: item.thumb_url_webp || item.thumb_url || item.poster_url || '',
          year: parseInt(item.year, 10) || 2026,
          time: item.time || '',
          content: item.description ? item.description.replace(/<[^>]*>?/gm, '').trim() : '',
          quality: item.quality || 'HD',
          lang: item.language || 'Vietsub',
          episode_current: item.current_episode || 'Trọn Bộ',
          type: (item.total_episodes && item.total_episodes > 1) ? 'series' : 'single',
          source: 'nguonc',
          tmdb: item.tmdb || null
        };
      });
    } catch (e) {
      return [];
    }
  }
}

module.exports = new NguonCService();
