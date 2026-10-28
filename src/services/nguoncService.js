// TTPhim - NguonC Service (Multi-source Streaming Provider)
// Documentation: https://phim.nguonc.com/api-document

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
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
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

function formatNguoncServerName(name, total = 1) {
  if (total <= 1) return 'NC';
  const clean = String(name || '').trim()
    .replace(/^NguonC\s*[-:(]?\s*/i, '')
    .replace(/\)$/, '')
    .trim();
  if (!clean || /^#?\d+$/.test(clean) || /^VIP$/i.test(clean)) return 'NC';
  return `NC (${clean})`;
}

class NguonCService {
  constructor() {
    this.baseUrl = 'https://phim.nguonc.com/api';
    this.cache = new MemoryCache();
    this.moviesByTmdb = new Map();
    this.moviesBySlug = new Map();
    this.moviesByOriginName = new Map();
    this.moviesByName = new Map();
    this.allMovies = [];
    this.totalMovies = 33580;
    this.totalPages = 3359;
    this.isInitialized = false;
    this.sourceStatus = 'online';

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

  async fetchJson(url, options = {}) {
    const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 6000);
    try {
      const res = await fetch(fullUrl, {
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
        throw new Error(`NguonC API HTTP ${res.status}: ${fullUrl}`);
      }
      return res.json();
    } catch (err) {
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
      console.warn('[NguonC] Init sync error:', err.message);
    });
    return this.initPromise;
  }

  async syncCatalog() {
    try {
      console.log('[NguonC] Syncing catalog from phim.nguonc.com...');
      const movieMap = new Map();

      // 1. Fetch recent update pages 1 to 5
      const updatePages = [1, 2, 3, 4, 5];
      const updateResults = await Promise.allSettled(
        updatePages.map(page => this.fetchJson(`/films/phim-moi-cap-nhat?page=${page}`))
      );

      for (const res of updateResults) {
        if (res.status === 'fulfilled' && res.value && res.value.status === 'success') {
          if (res.value.paginate?.total_items) {
            this.totalMovies = res.value.paginate.total_items;
            this.totalPages = res.value.paginate.total_page;
          }
          if (Array.isArray(res.value.items)) {
            for (const item of res.value.items) {
              if (item && item.slug) {
                movieMap.set(item.slug, item);
              }
            }
          }
        }
      }

      // 2. Fetch first page of popular categories
      const categories = ['phim-bo', 'phim-le', 'hoat-hinh', 'tv-shows'];
      const catResults = await Promise.allSettled(
        categories.map(cat => this.fetchJson(`/films/danh-sach/${cat}?page=1`))
      );

      for (const res of catResults) {
        if (res.status === 'fulfilled' && res.value && Array.isArray(res.value.items)) {
          for (const item of res.value.items) {
            if (item && item.slug) {
              movieMap.set(item.slug, item);
            }
          }
        }
      }

      const syncSuccess = [...updateResults, ...catResults].some(
        r => r.status === 'fulfilled' && Array.isArray(r.value?.items)
      );
      this.sourceStatus = syncSuccess ? 'online' : (this.allMovies.length > 0 ? 'stale' : 'unavailable');

      if (!syncSuccess && this.allMovies.length > 0) return;

      // Rebuild memory maps
      this.moviesByTmdb.clear();
      this.moviesBySlug.clear();
      this.moviesByOriginName.clear();
      this.moviesByName.clear();

      this.allMovies = Array.from(movieMap.values());
      for (const item of this.allMovies) {
        this.moviesBySlug.set(item.slug, item);

        if (item.tmdb && item.tmdb.id) {
          this.moviesByTmdb.set(String(item.tmdb.id), item);
        }

        if (item.original_name) {
          const normOrigin = removeAccents(item.original_name);
          if (normOrigin) this.moviesByOriginName.set(normOrigin, item);
          const cleanOrigin = removeAccents(cleanTitle(item.original_name));
          if (cleanOrigin) this.moviesByOriginName.set(cleanOrigin, item);
        }

        if (item.name) {
          const normName = removeAccents(item.name);
          if (normName) this.moviesByName.set(normName, item);
          const cleanNameStr = removeAccents(cleanTitle(item.name));
          if (cleanNameStr) this.moviesByName.set(cleanNameStr, item);
        }
      }

      console.log(`[NguonC] Synced ${this.allMovies.length} movies into memory index (Total catalog: ${this.totalMovies}).`);
    } catch (err) {
      console.error('[NguonC] Error syncing catalog:', err);
    }
  }

  getTotalMovies() {
    return this.totalMovies || 33580;
  }

  async fetchInfo(slug) {
    if (!slug) return null;
    const cleanSlug = slug.replace(/^nc-/, '');
    const cacheKey = `nguonc_info_${cleanSlug}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const res = await this.fetchJson(`/film/${encodeURIComponent(cleanSlug)}`);
      if (res && res.status === 'success' && res.movie) {
        this.cache.set(cacheKey, res.movie, 60 * 60 * 1000); // 1 hour
        return res.movie;
      }
    } catch (err) {
      // not found or error
    }
    return null;
  }

  hasMatch(movie) {
    if (!movie) return false;

    // 1. TMDB ID
    let tmdbId = null;
    if (movie.tmdb) {
      if (typeof movie.tmdb === 'object' && movie.tmdb.id) {
        tmdbId = String(movie.tmdb.id);
      } else if (typeof movie.tmdb === 'string' || typeof movie.tmdb === 'number') {
        tmdbId = String(movie.tmdb);
      }
    }
    if (tmdbId && this.moviesByTmdb.has(tmdbId)) return true;

    // 2. Direct slug
    const cleanSlug = (movie.slug || '').replace(/^nc-/, '');
    if (cleanSlug && this.moviesBySlug.has(cleanSlug)) return true;

    // 3. Origin Name
    if (movie.origin_name) {
      const normOrigin = removeAccents(movie.origin_name);
      if (normOrigin && this.moviesByOriginName.has(normOrigin)) return true;
      const cleanOrigin = removeAccents(cleanTitle(movie.origin_name));
      if (cleanOrigin && this.moviesByOriginName.has(cleanOrigin)) return true;
    }

    // 4. Vietnamese Name
    if (movie.name) {
      const normName = removeAccents(movie.name);
      if (normName && this.moviesByName.has(normName)) return true;
      const cleanNameStr = removeAccents(cleanTitle(movie.name));
      if (cleanNameStr && this.moviesByName.has(cleanNameStr)) return true;
    }

    return false;
  }

  async findMatch(movie) {
    if (!movie) return null;

    // 1. TMDB ID
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

    // 2. Direct slug
    const cleanSlug = (movie.slug || '').replace(/^nc-/, '');
    if (cleanSlug && this.moviesBySlug.has(cleanSlug)) {
      return this.moviesBySlug.get(cleanSlug);
    }

    // 3. Origin Name
    if (movie.origin_name) {
      const normOrigin = removeAccents(movie.origin_name);
      if (normOrigin && this.moviesByOriginName.has(normOrigin)) {
        return this.moviesByOriginName.get(normOrigin);
      }
      const cleanOrigin = removeAccents(cleanTitle(movie.origin_name));
      if (cleanOrigin && this.moviesByOriginName.has(cleanOrigin)) {
        return this.moviesByOriginName.get(cleanOrigin);
      }
    }

    // 4. Vietnamese Name
    if (movie.name) {
      const normName = removeAccents(movie.name);
      if (normName && this.moviesByName.has(normName)) {
        return this.moviesByName.get(normName);
      }
      const cleanNameStr = removeAccents(cleanTitle(movie.name));
      if (cleanNameStr && this.moviesByName.has(cleanNameStr)) {
        return this.moviesByName.get(cleanNameStr);
      }
    }

    // 5. Slug normalized match
    if (cleanSlug) {
      const cleanSlugStr = removeAccents(cleanSlug.replace(/-\d{4}$/, '').replace(/-/g, ' '));
      if (cleanSlugStr) {
        if (this.moviesByOriginName.has(cleanSlugStr)) return this.moviesByOriginName.get(cleanSlugStr);
        if (this.moviesByName.has(cleanSlugStr)) return this.moviesByName.get(cleanSlugStr);
      }
    }

    // 6. Alternative names if present
    if (Array.isArray(movie.alternative_names)) {
      for (const alt of movie.alternative_names) {
        const normAlt = removeAccents(alt);
        if (normAlt && (this.moviesByOriginName.has(normAlt) || this.moviesByName.has(normAlt))) {
          return this.moviesByOriginName.get(normAlt) || this.moviesByName.get(normAlt);
        }
        const cleanAlt = removeAccents(cleanTitle(alt));
        if (cleanAlt && (this.moviesByOriginName.has(cleanAlt) || this.moviesByName.has(cleanAlt))) {
          return this.moviesByOriginName.get(cleanAlt) || this.moviesByName.get(cleanAlt);
        }
      }
    }

    // 7. Dynamic search API lookup if not in cached memory index
    const query = movie.origin_name || movie.name;
    if (query) {
      try {
        const searchRes = await this.fetchJson(`/films/search?keyword=${encodeURIComponent(query)}&page=1`);
        if (searchRes && searchRes.status === 'success' && Array.isArray(searchRes.items) && searchRes.items.length > 0) {
          const normTargetName = removeAccents(movie.name);
          const normTargetOrigin = removeAccents(movie.origin_name);
          const matched = searchRes.items.find(i => {
            const iName = removeAccents(i.name);
            const iOrigin = removeAccents(i.original_name);
            return (normTargetName && iName === normTargetName) || (normTargetOrigin && iOrigin === normTargetOrigin);
          }) || searchRes.items[0];
          if (matched && matched.slug) {
            this.moviesBySlug.set(matched.slug, matched);
            return matched;
          }
        }
      } catch (_) {}
    }

    return null;
  }

  async getNguoncServers(movie) {
    try {
      const matched = await this.findMatch(movie);
      if (!matched || !matched.slug) return [];

      const info = await this.fetchInfo(matched.slug);
      if (!info || !Array.isArray(info.episodes) || info.episodes.length === 0) {
        return [];
      }

      const totalServers = (info.episodes || []).length;
      return info.episodes.map(server => {
        const rawName = server.server_name || '';
        return {
          server_name: formatNguoncServerName(rawName, totalServers),
          server_type: 'nguonc',
          is_nguonc: true,
          language: rawName || info.language || 'Vietsub',
          lang: rawName || info.language || 'Vietsub',
          nguonc_slug: matched.slug,
          server_data: (server.items || []).map(ep => ({
            name: ep.name,
            slug: ep.slug || `tap-${ep.name}`,
            filename: `Tập ${ep.name}`,
            link_embed: ep.embed,
            link_m3u8: ''
          }))
        };
      });
    } catch (err) {
      console.warn('[NguonC] getNguoncServers error:', err.message);
      return [];
    }
  }

  async getMovieDetail(slug) {
    if (!slug) return null;
    const cleanSlug = slug.replace(/^nc-/, '');
    const info = await this.fetchInfo(cleanSlug);
    if (!info) return null;

    // Parse categories from grouped object
    const categoryList = [];
    if (info.category && typeof info.category === 'object') {
      const genreGroup = info.category['2'] || info.category[2];
      if (genreGroup && Array.isArray(genreGroup.list)) {
        genreGroup.list.forEach(c => categoryList.push({ name: c.name, slug: c.slug || removeAccents(c.name) }));
      }
    }

    const countryList = [];
    if (info.category && typeof info.category === 'object') {
      const countryGroup = info.category['4'] || info.category[4];
      if (countryGroup && Array.isArray(countryGroup.list)) {
        countryGroup.list.forEach(c => countryList.push({ name: c.name, slug: c.slug || removeAccents(c.name) }));
      }
    }

    const isSeries = Boolean(
      info.category?.['1']?.list?.some(f => f.slug === 'phim-bo') ||
      (info.total_episodes && Number(info.total_episodes) > 1)
    );

    const movie = {
      id: info.slug,
      name: info.name,
      slug: info.slug,
      origin_name: info.original_name || '',
      content: info.description ? info.description.replace(/<[^>]*>?/gm, '').trim() : '',
      raw_content: info.description || '',
      type: isSeries ? 'series' : 'single',
      status: 'completed',
      poster_url: info.poster_url || info.thumb_url || '',
      thumb_url: info.thumb_url || info.poster_url || '',
      is_copyright: false,
      sub_docquyen: false,
      chieurap: false,
      has_song_ngu: false,
      trailer_url: '',
      time: info.time || '',
      episode_current: info.current_episode || 'Trọn Bộ',
      episode_total: info.total_episodes ? String(info.total_episodes) : '',
      quality: info.quality || 'FHD',
      lang: info.language || 'Vietsub',
      year: parseInt(info.year, 10) || 2026,
      view: 1000,
      actor: info.casts ? info.casts.split(',').map(s => s.trim()).filter(Boolean) : [],
      director: info.director ? info.director.split(',').map(s => s.trim()).filter(Boolean) : [],
      category: categoryList,
      country: countryList,
      tmdb: info.tmdb || null,
      imdb: info.imdb || null
    };

    const totalServers = (info.episodes || []).length;
    const episodes = (info.episodes || []).map(server => {
      const rawName = server.server_name || '';
      return {
        server_name: formatNguoncServerName(rawName, totalServers),
        server_type: 'nguonc',
        is_nguonc: true,
        language: rawName || info.language || 'Vietsub',
        lang: rawName || info.language || 'Vietsub',
        server_data: (server.items || []).map(ep => ({
          name: ep.name,
          slug: ep.slug || `tap-${ep.name}`,
          filename: `Tập ${ep.name}`,
          link_embed: ep.embed,
          link_m3u8: ''
        }))
      };
    });

    return {
      movie,
      episodes,
      related: []
    };
  }

  async searchNguonC(keyword, { unlimited = false } = {}) {
    if (!keyword) return [];
    const trimmed = String(keyword).trim().slice(0, 200);
    if (!trimmed) return [];

    try {
      const searchRes = await this.fetchJson(`/films/search?keyword=${encodeURIComponent(trimmed)}&page=1`);
      if (searchRes && searchRes.status === 'success' && Array.isArray(searchRes.items)) {
        const mapped = searchRes.items.map(item => ({
          id: item.slug,
          name: item.name,
          slug: item.slug,
          origin_name: item.original_name || '',
          poster_url: item.poster_url || item.thumb_url || '',
          thumb_url: item.thumb_url || item.poster_url || '',
          year: parseInt(item.year, 10) || null,
          quality: item.quality || 'FHD',
          lang: item.language || 'Vietsub',
          episode_current: item.current_episode || 'Trọn Bộ',
          type: item.total_episodes && Number(item.total_episodes) > 1 ? 'series' : 'single',
          source: 'nguonc',
          source_name: 'NguonC API',
          source_badge: 'NguonC'
        }));
        return unlimited ? mapped : mapped.slice(0, 15);
      }
    } catch (e) {
      console.warn('[NguonC] Search API error:', e.message);
    }

    // Fallback search in memory index
    const norm = searchText(trimmed);
    if (!norm) return [];
    const matches = [];
    for (const item of this.allMovies) {
      const vnameNorm = searchText(item.name);
      const enameNorm = searchText(item.original_name);
      const slugNorm = searchText(item.slug);
      if (
        (vnameNorm && vnameNorm.includes(norm)) ||
        (enameNorm && enameNorm.includes(norm)) ||
        (slugNorm && slugNorm.includes(norm))
      ) {
        matches.push({
          id: item.slug,
          name: item.name,
          slug: item.slug,
          origin_name: item.original_name || '',
          poster_url: item.poster_url || item.thumb_url || '',
          thumb_url: item.thumb_url || item.poster_url || '',
          year: parseInt(item.year, 10) || null,
          quality: item.quality || 'FHD',
          lang: item.language || 'Vietsub',
          episode_current: item.current_episode || 'Trọn Bộ',
          type: item.total_episodes && Number(item.total_episodes) > 1 ? 'series' : 'single',
          source: 'nguonc',
          source_name: 'NguonC API',
          source_badge: 'NguonC'
        });
      }
    }
    return unlimited ? matches : matches.slice(0, 15);
  }
}

module.exports = new NguonCService();
