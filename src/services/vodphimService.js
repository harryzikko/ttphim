const config = require('../config');
const movieMatching = require('./movieMatching');
const matchesFormat = require('./catalogFormat');

const VODPHIM_BASE = 'https://api.xink.pro';
const VODPHIM_API = `${VODPHIM_BASE}/api/content`;
const VODPHIM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Origin': 'https://vodphim.com',
  'Referer': 'https://vodphim.com/'
};

class MemoryCache {
  constructor() {
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttlMs) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }
}

function normalizeVietnamese(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function cleanBareSlug(slug) {
  return String(slug || '').replace(/^vp-/, '').trim();
}

function isMultisubValue(value) {
  return String(value || '').trim().toLowerCase() === 'multisub';
}

function isMultisubMovie(movie) {
  return isMultisubValue(movie?.sub);
}

function isDubbedServerName(name) {
  const folded = normalizeVietnamese(name);
  return /thuyet\s*minh|long\s*tieng|\btm\b|\blt\b/.test(folded);
}

function normalizeEpisodeSlug(ep, index) {
  const raw = String(ep?.slug || ep?.name || index + 1).trim();
  const lower = raw.toLowerCase();
  if (!lower) return `tap-${index + 1}`;
  if (lower === 'full') return 'full';
  if (/^\d+$/.test(lower)) return `tap-${Number(lower)}`;
  if (/^tap-\d+$/.test(lower)) return `tap-${Number(lower.slice(4))}`;
  return lower.replace(/\s+/g, '-');
}

function parsePositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

class VodphimService {
  constructor() {
    this.cache = new MemoryCache();
    this.matchCache = new MemoryCache();

    this.tmdbIndex = new Map();
    this.slugIndex = new Map();
    this.originIndex = new Map();
    this.nameIndex = new Map();
    this.baseNameIndex = new Map();

    this.allMovies = [];
    this.multisubMovies = [];
    this.totalMovies = 0;
    this.totalPages = 0;
    this.lastSyncTime = 0;
    this.isSyncing = false;
    this.syncPromise = null;
    this.syncInterval = 30 * 60 * 1000;
  }

  async fetchJson(endpointOrUrl) {
    const url = endpointOrUrl.startsWith('http')
      ? endpointOrUrl
      : `${VODPHIM_API}${endpointOrUrl.startsWith('/') ? '' : '/'}${endpointOrUrl}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        headers: VODPHIM_HEADERS,
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  normalizeType(rawType, categories) {
    const cats = Array.isArray(categories) ? categories : [];
    const hasAnimeCat = cats.some(c => {
      const s = normalizeVietnamese(c?.slug || c?.name || c);
      return s === 'hoat-hinh' || s === 'hoat hinh' || s === 'anime';
    });
    if (hasAnimeCat) return 'hoathinh';
    const lower = String(rawType || '').toLowerCase();
    if (lower === 'tv' || lower === 'series') return 'series';
    if (lower === 'movie' || lower === 'single') return 'single';
    if (lower === 'hoathinh' || lower === 'tvshows') return lower;
    return 'series';
  }

  normalizeMovieItem(item, { preserveOriginalSlug = false } = {}) {
    if (!item || typeof item !== 'object') return null;
    const rawSlug = cleanBareSlug(item.slug || '');
    const season = parsePositiveInt(item.season) || parsePositiveInt(item.tmdb?.season);
    const tmdbId = item.tmdb?.id ?? item.tmdb_id ?? null;
    const sub = String(item.sub || '').trim();
    const isMultisub = isMultisubValue(sub);
    const rawLang = String(item.lang || '').trim();
    let lang = rawLang;
    if (isMultisub) {
      if (!normalizeVietnamese(rawLang).includes('song ngu')) {
        lang = rawLang ? `${rawLang} + Song Ngữ` : 'Song Ngữ';
      }
    } else if (!lang) {
      lang = 'Vietsub';
    }

    const categories = Array.isArray(item.category) ? item.category : [];
    const normalizedType = this.normalizeType(item.type, categories);

    return {
      _id: item._id || item.id || rawSlug,
      name: String(item.name || '').trim(),
      slug: preserveOriginalSlug ? rawSlug : (rawSlug ? `vp-${rawSlug}` : ''),
      original_slug: rawSlug,
      origin_name: String(item.origin_name || '').trim(),
      content: item.content || '',
      type: normalizedType,
      status: item.status || '',
      thumb_url: item.thumb_url || item.poster_url || '',
      poster_url: item.poster_url || item.thumb_url || '',
      trailer_url: item.trailer_url || '',
      quality: item.quality || 'HD',
      sub,
      lang,
      has_song_ngu: Boolean(isMultisub || item.has_song_ngu || normalizeVietnamese(lang).includes('song ngu')),
      time: item.time || '',
      episode_current: item.episode_current || (normalizedType === 'single' ? 'Full' : ''),
      episode_total: item.episode_total || '',
      year: parsePositiveInt(item.year) || '',
      season,
      view: Number(item.view) || 0,
      chieurap: Boolean(item.is_chieurap || item.chieurap),
      is_chieurap: Boolean(item.is_chieurap || item.chieurap),
      tmdb: {
        id: tmdbId !== undefined && tmdbId !== null ? String(tmdbId) : null,
        type: item.tmdb?.type || (item.type === 'tv' ? 'tv' : 'movie'),
        season
      },
      actor: Array.isArray(item.actor) ? item.actor : [],
      director: Array.isArray(item.director) ? item.director : [],
      category: categories,
      country: Array.isArray(item.country) ? item.country : [],
      modified: item.modified || null,
      source: 'vodphim',
      source_name: 'VodPhim API'
    };
  }

  /**
   * Build formatted server objects from VodPhim episode groups.
   * When sub === "multisub", subtitle/primary servers are routed into Song Ngu.
   */
  buildServers(rawEpisodes, isMultisub) {
    if (!Array.isArray(rawEpisodes) || rawEpisodes.length === 0) return [];

    const hasSubServer = rawEpisodes.some(srv => !isDubbedServerName(srv?.server_name || ''));
    let songNguCount = 0;

    return rawEpisodes
      .map((srv, srvIdx) => {
        const rawList = Array.isArray(srv?.server_data) ? srv.server_data : [];
        const serverData = rawList
          .filter(ep => ep && (ep.link_embed || ep.link_m3u8))
          .map((ep, idx) => ({
            episode_id: ep.episode_id || '',
            name: String(ep.name || ep.filename || idx + 1).trim(),
            slug: normalizeEpisodeSlug(ep, idx),
            filename: String(ep.filename || `Tập ${ep.name || idx + 1}`).trim(),
            link_embed: String(ep.link_embed || '').trim(),
            link_m3u8: String(ep.link_m3u8 || '').trim()
          }));

        if (serverData.length === 0) return null;

        const rawName = String(srv?.server_name || 'Vietsub').trim();
        const isDub = isDubbedServerName(rawName);
        const routeToSongNgu = Boolean(isMultisub && (!isDub || (!hasSubServer && srvIdx === 0)));

        if (routeToSongNgu) {
          songNguCount += 1;
          return {
            server_name: songNguCount === 1 ? 'Song Ngữ (Multi-Sub)' : `Song Ngữ (Multi-Sub #${songNguCount})`,
            server_type: 'song_ngu',
            is_song_ngu: true,
            is_vodphim: true,
            sub: 'multisub',
            language: 'Song Ngữ',
            server_data: serverData
          };
        }

        const norm = normalizeVietnamese(rawName);
        let serverName = `VP (${rawName})`;
        let language = 'Phụ đề';
        if (norm.includes('thuyet minh')) {
          serverName = 'VP (Thuyết Minh)';
          language = 'Thuyết Minh';
        } else if (norm.includes('long tieng')) {
          serverName = 'VP (Lồng Tiếng)';
          language = 'Lồng Tiếng';
        } else if (norm.includes('vietsub') || norm.includes('phu de')) {
          serverName = 'VP (Vietsub)';
          language = 'Phụ đề';
        }

        return {
          server_name: serverName,
          server_type: 'vodphim',
          is_song_ngu: false,
          is_vodphim: true,
          sub: isMultisub ? 'multisub' : '',
          language,
          server_data: serverData
        };
      })
      .filter(Boolean);
  }

  getExplicitSeason(movie) {
    if (!movie) return null;
    const direct = parsePositiveInt(movie.season) || parsePositiveInt(movie.tmdb?.season);
    if (direct) return direct;
    const extracted = movieMatching.extractSeasonIdentifier(movie);
    const match = typeof extracted === 'string' && extracted.match(/^season_(\d+)$/);
    return match ? Number(match[1]) : null;
  }

  getBaseTitleKey(str) {
    if (!str) return '';
    const base = typeof movieMatching.extractBaseTitle === 'function'
      ? movieMatching.extractBaseTitle(str)
      : movieMatching.cleanTitle(str);
    return movieMatching.removeAccents(base);
  }

  isVodphimCompatible(target, candidate) {
    if (!target || !candidate) return false;
    if (!movieMatching.isCompatibleMovie(target, candidate)) return false;

    const targetSeason = this.getExplicitSeason(target);
    const candSeason = this.getExplicitSeason(candidate);
    if (targetSeason && candSeason && targetSeason !== candSeason) {
      return false;
    }
    // VodPhim sets season: 1 on Season 1 TV shows while KKPhim omits season numbers on Season 1
    if (!targetSeason && candSeason && candSeason >= 2) {
      return false;
    }
    if (!candSeason && targetSeason && targetSeason >= 2) {
      return false;
    }
    return true;
  }

  indexMovie(movie) {
    if (!movie) return;
    const bareSlug = cleanBareSlug(movie.original_slug || movie.slug);
    if (bareSlug) {
      this.slugIndex.set(bareSlug, movie);
      this.slugIndex.set(`vp-${bareSlug}`, movie);
    }

    const tmdbId = movie.tmdb?.id ? String(movie.tmdb.id) : '';
    if (tmdbId) {
      if (!this.tmdbIndex.has(tmdbId)) this.tmdbIndex.set(tmdbId, []);
      const bucket = this.tmdbIndex.get(tmdbId);
      if (!bucket.some(m => m.original_slug === bareSlug)) bucket.push(movie);
    }

    const originKey = normalizeVietnamese(movie.origin_name);
    if (originKey) {
      if (!this.originIndex.has(originKey)) this.originIndex.set(originKey, []);
      const bucket = this.originIndex.get(originKey);
      if (!bucket.some(m => m.original_slug === bareSlug)) bucket.push(movie);
    }

    const nameKey = normalizeVietnamese(movie.name);
    if (nameKey) {
      if (!this.nameIndex.has(nameKey)) this.nameIndex.set(nameKey, []);
      const bucket = this.nameIndex.get(nameKey);
      if (!bucket.some(m => m.original_slug === bareSlug)) bucket.push(movie);
    }

    const baseKey = this.getBaseTitleKey(movie.name || movie.origin_name);
    if (baseKey) {
      if (!this.baseNameIndex.has(baseKey)) this.baseNameIndex.set(baseKey, []);
      const bucket = this.baseNameIndex.get(baseKey);
      if (!bucket.some(m => m.original_slug === bareSlug)) bucket.push(movie);
    }
  }

  async syncCatalog(force = false) {
    if (this.syncPromise) return this.syncPromise;
    if (!force && this.allMovies.length > 0 && Date.now() - this.lastSyncTime < this.syncInterval) {
      return this.allMovies;
    }

    this.isSyncing = true;
    this.syncPromise = (async () => {
      try {
        console.log('[VodPhim] Starting catalog synchronization...');
        const firstPage = await this.fetchJson('/phim-moi-cap-nhat/page/1?limit=100');
        const pagination = firstPage?.pagination || {};
        const totalPages = Number(pagination.totalPages) || 1;
        const totalItems = Number(pagination.totalItems) || (firstPage?.items?.length || 0);

        const maxPages = Math.min(totalPages, 15);
        const collected = new Map();

        const absorbItems = (items) => {
          if (!Array.isArray(items)) return;
          for (const raw of items) {
            const norm = this.normalizeMovieItem(raw);
            if (norm && norm.original_slug && !collected.has(norm.original_slug)) {
              collected.set(norm.original_slug, norm);
            }
          }
        };

        absorbItems(firstPage?.items);

        for (let p = 2; p <= maxPages; p += 4) {
          const batch = [];
          for (let i = 0; i < 4 && p + i <= maxPages; i++) {
            batch.push(
              this.fetchJson(`/phim-moi-cap-nhat/page/${p + i}?limit=100`).catch(() => null)
            );
          }
          const results = await Promise.all(batch);
          for (const res of results) {
            absorbItems(res?.items);
          }
        }

        const syncedList = Array.from(collected.values());
        if (syncedList.length > 0) {
          this.tmdbIndex.clear();
          this.slugIndex.clear();
          this.originIndex.clear();
          this.nameIndex.clear();
          this.baseNameIndex.clear();

          for (const movie of syncedList) {
            this.indexMovie(movie);
          }

          this.allMovies = syncedList;
          this.multisubMovies = syncedList.filter(m => m.has_song_ngu);
          this.totalMovies = totalItems || syncedList.length;
          this.totalPages = totalPages;
          this.lastSyncTime = Date.now();
          console.log(
            `[VodPhim] Synced ${this.allMovies.length} movies (${this.multisubMovies.length} multisub Song Ngu, total available: ${this.totalMovies})`
          );
        }
        return this.allMovies;
      } catch (err) {
        console.warn('[VodPhim] Catalog sync failed:', err.message);
        return this.allMovies;
      } finally {
        this.isSyncing = false;
        this.syncPromise = null;
      }
    })();

    return this.syncPromise;
  }

  ensureBackgroundSync() {
    if (this.allMovies.length === 0 && !this.isSyncing) {
      this.syncCatalog().catch(() => {});
    } else if (Date.now() - this.lastSyncTime > this.syncInterval && !this.isSyncing) {
      this.syncCatalog().catch(() => {});
    }
  }

  findIndexedMatch(movie) {
    if (!movie) return null;
    this.ensureBackgroundSync();
    if (this.allMovies.length === 0) return null;

    const bareSlug = cleanBareSlug(movie.original_slug || movie.slug);
    if (bareSlug && this.slugIndex.has(bareSlug)) {
      const slugCand = this.slugIndex.get(bareSlug);
      if (this.isVodphimCompatible(movie, slugCand)) return slugCand;
    }

    const tmdbId = movie.tmdb?.id || movie.tmdb_id ? String(movie.tmdb?.id || movie.tmdb_id) : '';
    if (tmdbId && this.tmdbIndex.has(tmdbId)) {
      const match = this.tmdbIndex.get(tmdbId).find(cand => this.isVodphimCompatible(movie, cand));
      if (match) return match;
    }

    const originKey = normalizeVietnamese(movie.origin_name);
    if (originKey && originKey.length > 2 && this.originIndex.has(originKey)) {
      const match = this.originIndex.get(originKey).find(cand => this.isVodphimCompatible(movie, cand));
      if (match) return match;
    }

    const nameKey = normalizeVietnamese(movie.name);
    if (nameKey && nameKey.length > 2 && this.nameIndex.has(nameKey)) {
      const match = this.nameIndex.get(nameKey).find(cand => this.isVodphimCompatible(movie, cand));
      if (match) return match;
    }

    const baseKey = this.getBaseTitleKey(movie.name || movie.origin_name);
    if (baseKey && baseKey.length > 3 && this.baseNameIndex.has(baseKey)) {
      const match = this.baseNameIndex.get(baseKey).find(cand => this.isVodphimCompatible(movie, cand));
      if (match) return match;
    }

    return null;
  }

  hasMatch(movie) {
    return Boolean(this.findIndexedMatch(movie));
  }

  hasBilingualMatch(movie) {
    if (!movie) return false;
    if (isMultisubMovie(movie)) return true;
    const match = this.findIndexedMatch(movie);
    return Boolean(match && (isMultisubMovie(match) || match.has_song_ngu));
  }

  buildSearchQueries(movie) {
    const raw = [];
    if (movie?.origin_name) raw.push(String(movie.origin_name).trim());
    if (movie?.name) raw.push(String(movie.name).trim());
    for (const src of [movie?.origin_name, movie?.name]) {
      if (!src) continue;
      const stripped = String(src)
        .replace(/\(.*?\)/g, '')
        .replace(/\b(phan|season|part|tap)\s*\d+\b/gi, '')
        .split(':')[0]
        .trim();
      if (stripped && stripped.length >= 2) raw.push(stripped);
    }
    return [...new Set(raw.filter(q => q.length >= 2))].slice(0, 3);
  }

  async findMatch(movie) {
    if (!movie) return null;

    if (this.allMovies.length === 0) {
      await this.syncCatalog().catch(() => {});
    }

    const indexed = this.findIndexedMatch(movie);
    if (indexed) return indexed;

    const cacheKey = `vp-match-${cleanBareSlug(movie.slug) || normalizeVietnamese(movie.name)}-${movie.tmdb?.id || ''}`;
    const cached = this.matchCache.get(cacheKey);
    if (cached !== null) return cached === false ? null : cached;

    // Try direct slug lookup when movie origin looks compatible
    const candidateBareSlug = cleanBareSlug(movie.original_slug || movie.slug);
    if (candidateBareSlug && !candidateBareSlug.startsWith('nc-') && !candidateBareSlug.startsWith('tv-') && !candidateBareSlug.startsWith('movie-')) {
      try {
        const directRes = await this.fetchJson(`/phim/${encodeURIComponent(candidateBareSlug)}`);
        if (directRes?.status && directRes?.movie) {
          const directNorm = this.normalizeMovieItem(directRes.movie);
          if (directNorm && this.isVodphimCompatible(movie, directNorm)) {
            this.indexMovie(directNorm);
            this.matchCache.set(cacheKey, directNorm, config.CACHE_TTL.DETAIL);
            return directNorm;
          }
        }
      } catch (_) {}
    }

    // Dynamic search fallback via /api/content/tim-kiem
    const queries = this.buildSearchQueries(movie);
    for (const q of queries) {
      try {
        const searchRes = await this.fetchJson(`/tim-kiem?q=${encodeURIComponent(q)}&page=1&limit=15`);
        const items = Array.isArray(searchRes?.items) ? searchRes.items : [];
        for (const raw of items) {
          const cand = this.normalizeMovieItem(raw);
          if (cand && this.isVodphimCompatible(movie, cand)) {
            this.indexMovie(cand);
            this.matchCache.set(cacheKey, cand, config.CACHE_TTL.DETAIL);
            return cand;
          }
        }
      } catch (_) {}
    }

    this.matchCache.set(cacheKey, false, config.CACHE_TTL.SEARCH);
    return null;
  }

  async getVodphimServers(movie, existingEpisodeCount = 0) {
    if (!movie) return [];
    const bareSlug = cleanBareSlug(movie.original_slug || movie.slug);
    const cacheKey = `vp-servers-${bareSlug || normalizeVietnamese(movie.name)}-${movie.tmdb?.id || ''}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== null) return cached;

    const match = await this.findMatch(movie);
    if (!match || !match.original_slug) {
      this.cache.set(cacheKey, [], config.CACHE_TTL.SEARCH);
      return [];
    }

    try {
      const detail = await this.fetchJson(`/phim/${encodeURIComponent(match.original_slug)}`);
      if (!detail?.status || !detail?.movie) {
        this.cache.set(cacheKey, [], config.CACHE_TTL.SEARCH);
        return [];
      }

      const normDetail = this.normalizeMovieItem(detail.movie);
      if (normDetail && !this.isVodphimCompatible(movie, normDetail)) {
        this.cache.set(cacheKey, [], config.CACHE_TTL.SEARCH);
        return [];
      }

      const rawEpisodes = Array.isArray(detail.episodes) ? detail.episodes : [];
      const firstCount = rawEpisodes[0]?.server_data?.length || 0;
      if (existingEpisodeCount > 3 && firstCount > 0 && firstCount <= 1) {
        this.cache.set(cacheKey, [], config.CACHE_TTL.DETAIL);
        return [];
      }
      if (existingEpisodeCount > 0 && existingEpisodeCount <= 1 && firstCount > 3) {
        this.cache.set(cacheKey, [], config.CACHE_TTL.DETAIL);
        return [];
      }

      const isMultisub = isMultisubMovie(detail.movie) || isMultisubMovie(match);
      const servers = this.buildServers(rawEpisodes, isMultisub);
      this.cache.set(cacheKey, servers, config.CACHE_TTL.DETAIL);
      return servers;
    } catch (err) {
      console.warn(`[VodPhim] Error fetching servers for "${movie.name}":`, err.message);
      return [];
    }
  }

  async getMovieDetail(slug) {
    const cleanSlug = cleanBareSlug(slug);
    if (!cleanSlug) return null;

    const cacheKey = `vp-detail-${cleanSlug}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const data = await this.fetchJson(`/phim/${encodeURIComponent(cleanSlug)}`);
      if (!data?.status || !data?.movie) return null;

      const movie = this.normalizeMovieItem(data.movie);
      if (!movie) return null;
      const isMultisub = isMultisubMovie(data.movie);
      const episodes = this.buildServers(data.episodes, isMultisub);

      // Attach ViCDN bilingual server if available and not already covered
      try {
        const vicdnService = require('./vicdnService');
        const bilingualServer = await vicdnService.getBilingualServer(movie);
        if (bilingualServer && Array.isArray(bilingualServer.server_data) && bilingualServer.server_data.length > 0) {
          episodes.unshift(bilingualServer);
          movie.has_song_ngu = true;
          if (!normalizeVietnamese(movie.lang).includes('song ngu')) {
            movie.lang = movie.lang ? `${movie.lang} + Song Ngữ` : 'Song Ngữ';
          }
        }
      } catch (_) {}

      if (episodes.some(s => s.is_song_ngu || isMultisubValue(s.sub))) {
        movie.has_song_ngu = true;
      }

      const result = { movie, episodes };
      this.indexMovie(movie);
      this.cache.set(cacheKey, result, config.CACHE_TTL.DETAIL);
      return result;
    } catch (err) {
      console.warn(`[VodPhim] getMovieDetail failed for ${slug}:`, err.message);
      return null;
    }
  }

  async searchVodphim(keyword, { unlimited = false } = {}) {
    const trimmed = String(keyword || '').trim();
    if (!trimmed) return [];

    const cacheKey = `vp-search-${trimmed.toLowerCase()}-${unlimited ? 'all' : '24'}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const resultsMap = new Map();
    const absorb = (items) => {
      if (!Array.isArray(items)) return;
      for (const raw of items) {
        const norm = this.normalizeMovieItem(raw);
        if (norm && norm.original_slug && !resultsMap.has(norm.original_slug)) {
          this.indexMovie(norm);
          resultsMap.set(norm.original_slug, norm);
        }
      }
    };

    try {
      const limit = unlimited ? 40 : 24;
      const page1 = await this.fetchJson(`/tim-kiem?q=${encodeURIComponent(trimmed)}&page=1&limit=${limit}`);
      absorb(page1?.items);
      if (unlimited && Number(page1?.pagination?.totalPages) >= 2) {
        const page2 = await this.fetchJson(`/tim-kiem?q=${encodeURIComponent(trimmed)}&page=2&limit=${limit}`).catch(() => null);
        absorb(page2?.items);
      }
    } catch (err) {
      console.warn(`[VodPhim] searchVodphim error for "${trimmed}":`, err.message);
    }

    // Supplement from synced catalog index
    if (this.allMovies.length > 0) {
      const kwNorm = normalizeVietnamese(trimmed);
      for (const m of this.allMovies) {
        if (resultsMap.has(m.original_slug)) continue;
        const titleNorm = normalizeVietnamese(m.name);
        const origNorm = normalizeVietnamese(m.origin_name);
        if (titleNorm.includes(kwNorm) || origNorm.includes(kwNorm)) {
          resultsMap.set(m.original_slug, m);
        }
      }
    }

    const result = Array.from(resultsMap.values());
    this.cache.set(cacheKey, result, config.CACHE_TTL.SEARCH);
    return result;
  }

  async getCatalog({ format = 'all', category = '', country = '', year = '', sort = '', type = '', page = 1, limit = 24 } = {}) {
    await this.syncCatalog().catch(() => {});

    let items = [...this.allMovies];
    if (type === 'song-ngu' || format === 'song-ngu') {
      items = items.filter(m => m.has_song_ngu);
    } else if (type === 'phim-bo') {
      items = items.filter(m => m.type === 'series');
    } else if (type === 'phim-le') {
      items = items.filter(m => m.type === 'single');
    } else if (type === 'hoat-hinh') {
      items = items.filter(m => m.type === 'hoathinh');
    } else if (type === 'chieu-rap' || type === 'phim-chieu-rap') {
      items = items.filter(m => m.chieurap);
    }

    if (category) {
      items = items.filter(m => Array.isArray(m.category) && m.category.some(c => c.slug === category));
    }
    if (country) {
      items = items.filter(m => Array.isArray(m.country) && m.country.some(c => c.slug === country));
    }
    if (year) {
      items = items.filter(m => String(m.year) === String(year));
    }
    if (format && format !== 'all' && format !== 'song-ngu') {
      items = items.filter(item => matchesFormat(item, format));
    }

    if (sort === 'year') {
      items.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
    } else if (sort === 'views') {
      items.sort((a, b) => (Number(b.view) || 0) - (Number(a.view) || 0));
    }

    const safeLimit = Math.max(1, Number(limit) || 24);
    const totalItems = items.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / safeLimit));
    const currentPage = Math.max(1, Math.min(Number(page) || 1, totalPages));
    const start = (currentPage - 1) * safeLimit;

    return {
      items: items.slice(start, start + safeLimit),
      pagination: {
        totalItems,
        totalItemsPerPage: safeLimit,
        currentPage,
        totalPages
      }
    };
  }

  async getTotalMovies() {
    if (this.totalMovies > 0) return this.totalMovies;
    await this.syncCatalog().catch(() => {});
    return this.totalMovies || this.allMovies.length || 0;
  }

  getStatus() {
    return {
      source: 'VodPhim API',
      total_movies: this.totalMovies || this.allMovies.length,
      indexed_movies: this.allMovies.length,
      multisub_movies: this.multisubMovies.length,
      total_pages: this.totalPages,
      last_sync: this.lastSyncTime ? new Date(this.lastSyncTime).toISOString() : null,
      is_syncing: this.isSyncing,
      status: this.allMovies.length > 0 ? 'online' : (this.isSyncing ? 'syncing' : 'pending')
    };
  }
}

module.exports = new VodphimService();
