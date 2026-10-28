const config = require('../config');
const vicdnService = require('./vicdnService');
const nguoncService = require('./nguoncService');

function searchText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
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

function extractTmdbId(movie) {
  if (!movie) return null;
  if (movie.tmdb) {
    if (typeof movie.tmdb === 'object' && movie.tmdb.id) return String(movie.tmdb.id);
    if (typeof movie.tmdb === 'string' || typeof movie.tmdb === 'number') return String(movie.tmdb);
  }
  return null;
}

function extractSeasonIdentifier(item) {
  if (!item) return '';
  const text = `${item.slug || ''} ${item.name || ''} ${item.origin_name || ''} ${item.original_name || ''}`;
  const m = text.match(/(?:phần|mùa|season|ss|part)\s*(\d+)/i) ||
            text.match(/-phan-(\d+)/i) ||
            text.match(/-season-(\d+)/i) ||
            text.match(/-ss-(\d+)/i);
  if (m) return `season_${m[1]}`;
  const sp = text.match(/bản đặc biệt\s*(\d+)?/i) || text.match(/-ban-dac-biet-(\d+)?/i);
  if (sp) return `special_${sp[1] || '1'}`;
  return 'season_none';
}

function isSameMovie(a, b) {
  if (!a || !b) return false;
  if (a.slug && b.slug && a.slug === b.slug) return true;

  // Medium isolation: Anime and Non-anime are never the same movie
  if ((a.type === 'hoathinh') !== (b.type === 'hoathinh')) return false;

  // Season isolation: Different numbered seasons are never the same movie
  const seasonA = extractSeasonIdentifier(a);
  const seasonB = extractSeasonIdentifier(b);
  if (seasonA !== seasonB) {
    const isSeason1Candidate = (seasonA === 'season_1' && seasonB === 'season_none') ||
                               (seasonA === 'season_none' && seasonB === 'season_1');
    if (!isSeason1Candidate) return false;
  }

  // 1. TMDB ID match (only if valid positive ID)
  const tmdbA = extractTmdbId(a);
  const tmdbB = extractTmdbId(b);
  if (tmdbA && tmdbB && tmdbA === tmdbB) return true;

  // 2. Year check
  const yearA = parseInt(a.year, 10) || 0;
  const yearB = parseInt(b.year, 10) || 0;
  const yearClose = !yearA || !yearB || Math.abs(yearA - yearB) <= 1;

  if (!yearClose) return false;

  // 3. Name & Original Name matching
  const normNameA = removeAccents(cleanTitle(a.name));
  const normNameB = removeAccents(cleanTitle(b.name));
  const normOriginA = removeAccents(cleanTitle(a.origin_name || a.original_name));
  const normOriginB = removeAccents(cleanTitle(b.origin_name || b.original_name));

  if (normNameA && normNameB && normNameA === normNameB) return true;
  if (normOriginA && normOriginB && normOriginA === normOriginB) return true;
  if (normNameA && normOriginB && normNameA === normOriginB) return true;
  if (normOriginA && normNameB && normOriginA === normNameB) return true;

  // 4. Slugs stripped of year suffix (do not strip season)
  if (a.slug && b.slug) {
    const slugCleanA = removeAccents(a.slug.replace(/-\d{4}$/, '').replace(/-/g, ' '));
    const slugCleanB = removeAccents(b.slug.replace(/-\d{4}$/, '').replace(/-/g, ' '));
    if (slugCleanA && slugCleanB && slugCleanA === slugCleanB) return true;
  }

  return false;
}

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

class KKPhimService {
  constructor() {
    this.cache = new MemoryCache();
    this.baseUrl = config.KKPHIM_API_BASE;
    this.cdnUrl = config.IMAGE_CDN;
    this.totalMovies = null;
    this.totalPages = null;
    this.totalFetchedAt = 0;
    this.sourceStatus = 'unknown';
    this.pendingRequests = new Map();
    this.metadataState = new Map();
    for (const name of ['getHomeData', 'getMovieDetail', 'getCategoriesAndCountries']) {
      const load = this[name].bind(this);
      this[name] = (...args) => this.singleFlight(`${name}:${JSON.stringify(args)}`, () => load(...args));
    }
  }

  singleFlight(key, load) {
    if (this.pendingRequests.has(key)) return this.pendingRequests.get(key);
    const pending = Promise.resolve().then(load).finally(() => this.pendingRequests.delete(key));
    this.pendingRequests.set(key, pending);
    return pending;
  }

  async getRankingMetadata(slug) {
    const detail = this.cache.get(`movie_${slug}`);
    if (detail?.movie) return detail.movie;
    const key = `ranking_${slug}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    return this.singleFlight(key, async () => {
      const result = await this.fetchJson(`/phim/${encodeURIComponent(slug)}`);
      if (!result.movie) return null;
      const metadata = {
        view: Number(result.movie.view) || 0,
        quality: result.movie.quality,
        year: result.movie.year
      };
      this.cache.set(key, metadata, config.CACHE_TTL.HOME);
      return metadata;
    });
  }

  resolveImageUrl(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/')) return `${this.cdnUrl}${url}`;
    return `${this.cdnUrl}/${url}`;
  }

  normalizeMovieItem(item, defaultCdn = this.cdnUrl) {
    if (!item) return null;
    const cdn = defaultCdn || this.cdnUrl;

    const resolveUrl = (u) => {
      if (!u) return '';
      if (u.startsWith('http://') || u.startsWith('https://')) return u;
      if (u.startsWith('/')) return `${cdn}${u}`;
      return `${cdn}/${u}`;
    };

    const hasSongNgu = Boolean(
      item.has_song_ngu || 
      (vicdnService && vicdnService.hasBilingualMatch(item))
    );

    return {
      id: item._id || item.id || item.slug,
      name: item.name,
      slug: item.slug,
      origin_name: item.origin_name || item.original_name || '',
      poster_url: resolveUrl(item.poster_url),
      thumb_url: resolveUrl(item.thumb_url || item.poster_url),
      year: item.year || null,
      time: item.time || '',
      quality: item.quality || '',
      lang: item.lang || '',
      episode_current: item.episode_current || '',
      episode_total: item.episode_total || '',
      chieurap: item.chieurap === true || item.chieurap === 'true' || item.chieurap === 1,
      type: item.type || '',
      category: Array.isArray(item.category) ? item.category : [],
      country: Array.isArray(item.country) ? item.country : [],
      content: item.content ? item.content.replace(/<[^>]*>?/gm, '').trim() : '',
      view: Number(item.view) || 0,
      imdb_rating: Number(item.imdb?.vote_average) || null,
      tmdb: item.tmdb || null,
      has_song_ngu: hasSongNgu
    };
  }

  async fetchJson(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 5000);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          ...options.headers
        },
        signal: controller.signal,
        ...options
      });
      // Keep the deadline active while the response body is downloading too.
      if (!res.ok) {
        throw Object.assign(new Error(`API request failed with status ${res.status}: ${url}`), { status: res.status === 404 ? 404 : 503, upstreamStatus: res.status });
      }
      return await res.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getTotalMovies() {
    if (this.totalFetchedAt && Date.now() - this.totalFetchedAt < 600000) return this.totalMovies;
    return this.singleFlight('kkphim_totals', async () => {
      try {
        const res = await this.fetchJson('/danh-sach/phim-moi-cap-nhat?page=1');
        const total = Number(res.pagination?.totalItems);
        const pages = Number(res.pagination?.totalPages);
        if (res.status === false || res.pagination?.totalItems == null || res.pagination?.totalPages == null || !Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(pages) || pages < 0) throw new Error('KKPhim không trả tổng danh mục hợp lệ');
        this.totalMovies = total;
        this.totalPages = pages;
        this.totalFetchedAt = Date.now();
        this.sourceStatus = 'online';
      } catch (error) {
        this.sourceStatus = this.totalMovies == null ? 'unavailable' : 'stale';
        console.warn('[KKPhim] Không lấy được tổng danh mục:', error.message);
      }
      return this.totalMovies;
    });
  }

  async getHomeData() {
    const cacheKey = 'home_data';
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const [latestRes, seriesRes, singleRes, animeRes, tvshowsRes] = await Promise.all([
        this.fetchJson('/v1/api/danh-sach/phim-moi-cap-nhat?page=1')
          .catch(() => this.fetchJson('/danh-sach/phim-moi-cap-nhat?page=1'))
          .catch(() => ({ data: { items: [] } })),
        this.fetchJson('/v1/api/danh-sach/phim-bo?page=1&limit=16').catch(() => ({ data: { items: [] } })),
        this.fetchJson('/v1/api/danh-sach/phim-le?page=1&limit=16').catch(() => ({ data: { items: [] } })),
        this.fetchJson('/v1/api/danh-sach/hoat-hinh?page=1&limit=16').catch(() => ({ data: { items: [] } })),
        this.fetchJson('/v1/api/danh-sach/tv-shows?page=1&limit=16').catch(() => ({ data: { items: [] } }))
      ]);

      const latestPagination = latestRes.data?.params?.pagination || latestRes.pagination;
      if (latestPagination?.totalItems) {
        this.totalMovies = latestPagination.totalItems;
        this.totalPages = latestPagination.totalPages;
      }

      const latestItems = (latestRes.data?.items || latestRes.items || []).map(i => this.normalizeMovieItem(i, latestRes.data?.APP_DOMAIN_CDN_IMAGE));
      const seriesItems = (seriesRes.data?.items || []).map(i => this.normalizeMovieItem(i, seriesRes.data?.APP_DOMAIN_CDN_IMAGE));
      const singleItems = (singleRes.data?.items || []).map(i => this.normalizeMovieItem(i, singleRes.data?.APP_DOMAIN_CDN_IMAGE));
      const animeItems = (animeRes.data?.items || []).map(i => this.normalizeMovieItem(i, animeRes.data?.APP_DOMAIN_CDN_IMAGE));
      const tvshowsItems = (tvshowsRes.data?.items || []).map(i => this.normalizeMovieItem(i, tvshowsRes.data?.APP_DOMAIN_CDN_IMAGE));

      // Cinema releases rail
      const allCinema = [...singleItems, ...latestItems, ...seriesItems].filter(i => i.chieurap);
      const cinemaMap = new Map();
      allCinema.forEach(i => { if (i && i.slug && !cinemaMap.has(i.slug)) cinemaMap.set(i.slug, i); });
      const uniqueCinema = Array.from(cinemaMap.values());
      const cinemaItems = uniqueCinema.length >= 8 ? uniqueCinema.slice(0, 16) : singleItems.slice(0, 16);

      // Check if admin pinned specific movies in settings
      let pinnedCandidates = [];
      try {
        const dbService = require('./dbService');
        const settings = await dbService.getSettings();
        if (settings && Array.isArray(settings.featured_slugs) && settings.featured_slugs.length > 0) {
          pinnedCandidates = settings.featured_slugs.slice(0, 10).map(s => {
            if (typeof s === 'object' && s && s.slug) return s;
            return { slug: String(s) };
          }).filter(item => !item.source || ['kkphim', 'vicdn'].includes(item.source));
        }
      } catch(e) {}
      // Ranking metadata does not depend on spotlight details; start both groups together.
      const rankingPromise = this.buildHomeRankings([latestItems, seriesItems, singleItems, animeItems]);
      // Create spotlight candidates:
      // Phim nổi bật BẮT BUỘC CHỈ lấy đúng những phim được ghim bởi Admin!
      // Tuyệt đối KHÔNG tự ý lấy phim chiếu rạp, phim bộ hay bất kỳ nguồn nào khác khi chưa ghim!
      const spotlightCandidates = pinnedCandidates;

      // Fetch spotlight details from KKPhim or ViCDN.
      const spotlightList = await Promise.all(spotlightCandidates.slice(0, 10).map(async item => {
        try {
          const detail = await this.getMovieDetail(item.slug);
          if (detail && detail.movie) {
            return {
              id: detail.movie.id || item.slug,
              name: detail.movie.name || item.name || item.slug,
              slug: detail.movie.slug || item.slug,
              origin_name: detail.movie.origin_name || item.origin_name || '',
              type: detail.movie.type || item.type || '',
              tmdb: detail.movie.tmdb || item.tmdb || null,
              tmdb_id: detail.movie.tmdb_id || item.tmdb_id || item.tmdbId || null,
              tmdb_type: detail.movie.tmdb_type || item.tmdb_type || item.tmdbType || null,
              poster_url: detail.movie.poster_url || item.poster_url || '',
              thumb_url: detail.movie.thumb_url || detail.movie.poster_url || item.thumb_url || item.poster_url || '',
              year: detail.movie.year || item.year || 2026,
              time: detail.movie.time || item.time || '110 phút',
              quality: detail.movie.quality || item.quality || '4K HDR',
              lang: (detail.movie.has_song_ngu || item.has_song_ngu) ? 'Song Ngữ' : (detail.movie.lang || item.lang || 'Vietsub + Thuyết Minh'),
              has_song_ngu: Boolean(detail.movie.has_song_ngu || item.has_song_ngu),
              content: detail.movie.content || item.content || '',
              rating: (8.4 + (Math.random() * 1.1)).toFixed(1),
              category: (Array.isArray(detail.movie.category) ? detail.movie.category.map(c => c.name || c) : (Array.isArray(item.category) ? item.category : ['Thịnh Hành', 'Đặc Sắc'])).slice(0, 3),
              first_episode_slug: detail.episodes?.[0]?.server_data?.[0]?.slug || 'tap-1',
              trailer_url: detail.movie.trailer_url || item.trailer_url || ''
            };
          }
        } catch (e) {
          console.warn(`[Spotlight] Could not fetch remote detail for pinned movie "${item.slug}":`, e.message);
        }

        // Fallback for pinned item when remote fetch is slow or cached
        if (item.name || item.slug) {
          return {
            id: item.id || item.slug,
            name: item.name || item.slug,
            slug: item.slug,
            origin_name: item.origin_name || '',
            type: item.type || '',
            tmdb: item.tmdb || null,
            tmdb_id: item.tmdb_id || item.tmdbId || null,
            tmdb_type: item.tmdb_type || item.tmdbType || null,
            poster_url: item.poster_url || '',
            thumb_url: item.thumb_url || item.poster_url || '',
            year: item.year || 2026,
            time: item.time || '120 phút',
            quality: item.quality || 'FHD',
            lang: item.has_song_ngu ? 'Song Ngữ' : (item.lang || 'Vietsub'),
            has_song_ngu: Boolean(item.has_song_ngu),
            content: item.content || item.name || '',
            rating: '9.2',
            category: Array.isArray(item.category) ? item.category : ['Thịnh Hành', 'Đặc Sắc'],
            first_episode_slug: 'tap-1',
            trailer_url: ''
          };
        }
        return null;
      }));

      const rankingItems = await rankingPromise;

      const homeData = {
        spotlights: spotlightList.filter(Boolean), // Only movies pinned by admin.
        latest: latestItems,
        cinema: cinemaItems,
        series: seriesItems,
        singles: singleItems,
        tvshows: tvshowsItems,
        anime: animeItems,
        rankings: rankingItems
      };

      this.cache.set(cacheKey, homeData, config.CACHE_TTL.HOME);
      return homeData;
    } catch (err) {
      console.error('Error in getHomeData:', err);
      throw err;
    }
  }

  async buildHomeRankings([latestItems, seriesItems, singleItems, animeItems]) {
    try {
      const uniqueCandidates = [];
      const seenSlugs = new Set();
      for (const item of [...latestItems, ...seriesItems, ...singleItems, ...animeItems]) {
        if (item && item.slug && !seenSlugs.has(item.slug)) {
          seenSlugs.add(item.slug);
          uniqueCandidates.push(item);
        }
      }
      const detailMap = new Map();
      const candidatesToFetch = uniqueCandidates.slice(0, 18);
      await Promise.all(candidatesToFetch.map(async item => {
        try {
          const movie = await this.getRankingMetadata(item.slug);
          if (movie) detailMap.set(item.slug, movie);
        } catch (_) {}
      }));
      let localViews = {};
      try { localViews = await require('./dbService').getMovieViews(); } catch (_) {}
      const rankedList = candidatesToFetch.map(item => {
        const detail = detailMap.get(item.slug);
        const apiView = detail && typeof detail.view === 'number' ? detail.view : 0;
        const localView = (localViews && localViews[item.slug]) ? localViews[item.slug] : 0;
        const totalView = apiView + localView;
        return {
          ...item,
          has_song_ngu: Boolean(item.has_song_ngu || detail?.has_song_ngu || (vicdnService && vicdnService.hasBilingualMatch(item))),
          quality: detail?.quality || item.quality || 'FHD',
          year: detail?.year || item.year || 2026,
          real_views: totalView,
          views: totalView.toLocaleString('vi-VN')
        };
      });
      rankedList.sort((a, b) => b.real_views - a.real_views);
      return rankedList.slice(0, 10).map((item, idx) => ({ ...item, rank: idx + 1 }));
    } catch (err) {
      console.error('Error computing real rankings:', err);
      return latestItems.slice(0, 10).map((item, idx) => ({ ...item, rank: idx + 1, views: '0' }));
    }
  }

  async getMovieDetail(slug) {
    const cacheKey = `movie_${slug}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      let data = null;

      // 1. If slug is explicitly ViCDN (starts with tv- or movie-)
      if (slug.startsWith('tv-') || slug.startsWith('movie-')) {
        const viCdnDirect = await vicdnService.getMovieDetail(slug);
        if (viCdnDirect) {
          // Attach KKPhim servers if matched
          try {
            const queryKey = viCdnDirect.movie.origin_name || viCdnDirect.movie.name;
            if (queryKey) {
              const kkRes = await this.fetchJson(`/v1/api/tim-kiem?keyword=${encodeURIComponent(queryKey)}&limit=5`);
              if (kkRes.data?.items && kkRes.data.items.length > 0) {
                const normName = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const targetNorm = normName(viCdnDirect.movie.name);
                const targetOriginNorm = normName(viCdnDirect.movie.origin_name);
                const matchedItem = kkRes.data.items.find(i => {
                  const iName = normName(i.name);
                  const iOrigin = normName(i.origin_name);
                  return (targetNorm && iName === targetNorm) || (targetOriginNorm && iOrigin === targetOriginNorm);
                }) || kkRes.data.items[0];

                if (matchedItem && matchedItem.slug) {
                  const kkDetail = await this.fetchJson(`/phim/${matchedItem.slug}`);
                  if (kkDetail && kkDetail.episodes && kkDetail.episodes.length > 0) {
                    const kkServers = kkDetail.episodes.map(s => ({
                      server_name: s.server_name || 'Server KKPhim (HLS 4K)',
                      server_data: (s.server_data || []).map(ep => ({
                        name: ep.name,
                        slug: ep.slug,
                        filename: ep.filename,
                        link_embed: ep.link_embed,
                        link_m3u8: ep.link_m3u8
                      }))
                    }));
                    viCdnDirect.episodes.push(...kkServers);
                    console.log(`[ViCDN+KKPhim] Attached ${kkServers.length} KKPhim server(s) to "${viCdnDirect.movie.name}"`);
                  }
                }
              }
            }
          } catch (kkErr) {}

          this.cache.set(cacheKey, viCdnDirect, config.CACHE_TTL.DETAIL);
          return viCdnDirect;
        }
      }

      // If slug is explicitly NguonC (starts with nc-)
      if (slug.startsWith('nc-')) {
        const nguoncDirect = await nguoncService.getMovieDetail(slug);
        if (nguoncDirect) {
          this.cache.set(cacheKey, nguoncDirect, config.CACHE_TTL.DETAIL);
          return nguoncDirect;
        }
      }

      // 2. Fetch KKPhim detail
      try {
        data = await this.fetchJson(`/phim/${slug}`);
      } catch (err) {
        // Fallback 1: check if slug exists directly in ViCDN
        const viCdnDirect = await vicdnService.getMovieDetail(slug);
        if (viCdnDirect) {
          this.cache.set(cacheKey, viCdnDirect, config.CACHE_TTL.DETAIL);
          return viCdnDirect;
        }

        // Fallback 2: check if slug exists directly in NguonC
        const nguoncDirect = await nguoncService.getMovieDetail(slug);
        if (nguoncDirect) {
          this.cache.set(cacheKey, nguoncDirect, config.CACHE_TTL.DETAIL);
          return nguoncDirect;
        }

        throw err;
      }

      if (!data || !data.movie) {
        const absent = data?.status === false && /not found|not available|không tồn tại|không tìm thấy/i.test(String(data.msg || data.message || ''));
        throw Object.assign(new Error('Movie not found'), { status: absent ? 404 : 503 });
      }

      const m = data.movie;
      const movie = {
        id: m._id || m.id,
        name: m.name,
        slug: m.slug,
        origin_name: m.origin_name || '',
        content: m.content ? m.content.replace(/<[^>]*>?/gm, '').trim() : '',
        raw_content: m.content || '',
        type: m.type,
        status: m.status,
        poster_url: this.resolveImageUrl(m.poster_url),
        thumb_url: this.resolveImageUrl(m.thumb_url || m.poster_url),
        is_copyright: Boolean(m.is_copyright),
        sub_docquyen: Boolean(m.sub_docquyen),
        chieurap: Boolean(m.chieurap),
        trailer_url: m.trailer_url || '',
        time: m.time || '',
        episode_current: m.episode_current || '',
        episode_total: m.episode_total || '',
        quality: m.quality || 'FHD',
        lang: m.lang || 'Vietsub',
        notify: m.notify || '',
        showtimes: m.showtimes || '',
        year: m.year || 2026,
        view: typeof m.view === 'number' ? m.view : (parseInt(m.view, 10) || 0),
        actor: Array.isArray(m.actor) ? m.actor : (m.actor ? [m.actor] : []),
        director: Array.isArray(m.director) ? m.director : (m.director ? [m.director] : []),
        category: Array.isArray(m.category) ? m.category : [],
        country: Array.isArray(m.country) ? m.country : [],
        tmdb: m.tmdb || null,
        tmdb_id: m.tmdb_id || m.tmdbId || null,
        tmdb_type: m.tmdb_type || m.tmdbType || null,
        imdb: m.imdb || null,
        alternative_names: m.alternative_names || []
      };

      // Format episodes
      const episodes = (data.episodes || []).map(server => ({
        server_name: server.server_name || 'Server VIP #1',
        server_data: (server.server_data || []).map(ep => ({
          name: ep.name,
          slug: ep.slug,
          filename: ep.filename,
          link_embed: ep.link_embed,
          link_m3u8: ep.link_m3u8
        }))
      }));

      // Merge ViCDN Bilingual Server if available!
      try {
        const bilingualServer = await vicdnService.getBilingualServer(movie);
        if (bilingualServer && bilingualServer.server_data && bilingualServer.server_data.length > 0) {
          episodes.push(bilingualServer);
          movie.has_song_ngu = true;
          if (!movie.lang.toLowerCase().includes('song ngữ')) {
            movie.lang = `${movie.lang} + Song Ngữ`;
          }
          console.log(`[KKPhim+ViCDN] Attached Bilingual Server to "${movie.name}" (${bilingualServer.server_data.length} episodes)`);
        }
      } catch (vicdnErr) {
        console.warn(`[ViCDN] Error merging bilingual server for ${slug}:`, vicdnErr.message);
      }

      // Merge NguonC Server(s) if available!
      try {
        const nguoncServers = await nguoncService.getNguoncServers(movie);
        if (Array.isArray(nguoncServers) && nguoncServers.length > 0) {
          episodes.push(...nguoncServers);
          console.log(`[KKPhim+NguonC] Attached ${nguoncServers.length} NguonC server(s) to "${movie.name}"`);
        }
      } catch (nguoncErr) {
        console.warn(`[NguonC] Error merging servers for ${slug}:`, nguoncErr.message);
      }

      // Fetch related movies (from same primary category)
      let related = [];
      if (movie.category && movie.category[0]) {
        try {
          const catSlug = movie.category[0].slug;
          const catRes = await this.fetchJson(`/v1/api/the-loai/${catSlug}?page=1&limit=8`);
          if (catRes.data?.items) {
            related = catRes.data.items
              .filter(i => i.slug !== slug)
              .slice(0, 8)
              .map(i => this.normalizeMovieItem(i, catRes.data.APP_DOMAIN_CDN_IMAGE));
          }
        } catch (e) {
          // ignore related error
        }
      }

      const result = { movie, episodes, related };
      this.cache.set(cacheKey, result, config.CACHE_TTL.DETAIL);
      return result;
    } catch (err) {
      console.error(`Error in getMovieDetail for ${slug}:`, err);
      throw err;
    }
  }

  async getCatalog({ type, category, country, year, format, sort, page = 1, keyword = '', limit = 30 } = {}) {
    const pageNum = Math.max(1, Math.min(10000, parseInt(page, 10) || 1));
    const limitNum = Math.max(1, Math.min(60, parseInt(limit, 10) || 30));
    const filters = { type, category, country, year, format, sort };
    const trimmed = String(keyword).trim().slice(0, 200);
    if (type === 'song-ngu') return vicdnService.getCatalog({ ...filters, page: pageNum, limit: limitNum, keyword: trimmed });
    const active = value => value && value !== 'all';
    const matches = item => {
      const query = searchText(trimmed);
      if (trimmed && !query) return false;
      if (query && ![item.name, item.origin_name, item.original_name, item.slug].some(value => searchText(value).includes(query))) return false;
      if (!require('./catalogFormat')(item, format)) return false;
      const types = { 'phim-bo': 'series', 'phim-le': 'single', 'hoat-hinh': 'hoathinh', 'tv-shows': 'tvshows' };
      if (active(type) && (['chieu-rap', 'phim-chieu-rap'].includes(type) ? !item.chieurap : item.type !== type && item.type !== types[type])) return false;
      if (active(category) && !(item.category || []).some(value => removeAccents(value.slug || value.name) === removeAccents(category))) return false;
      if (active(country) && !(item.country || []).some(value => removeAccents(value.slug || value.name) === removeAccents(country))) return false;
      return !active(year) || (year === 'pre-2020' ? Number(item.year) > 0 && Number(item.year) < 2020 : String(item.year) === String(year));
    };
    const params = new URLSearchParams();
    if (active(category)) params.set('category', category);
    if (active(country)) params.set('country', country);
    if (active(year) && year !== 'pre-2020') params.set('year', year);
    if (active(type)) params.set('type', type === 'chieu-rap' ? 'phim-chieu-rap' : type);
    params.set('sort_field', ['year', 'released'].includes(sort) ? 'year' : ['view', 'views'].includes(sort) ? 'view' : sort === 'rating' ? 'imdb.vote_average' : 'modified.time');
    params.set('sort_type', 'desc');
    const bounded = !!trimmed || active(format) || [type, category, country, year].filter(active).length > 1 || year === 'pre-2020';
    const cacheKey = `search_v4:${JSON.stringify({ trimmed, ...filters })}`;
    const paginate = snapshot => ({
      items: snapshot.items.slice((pageNum - 1) * limitNum, pageNum * limitNum),
      pagination: { totalItems: snapshot.items.length, totalItemsPerPage: limitNum, currentPage: pageNum, totalPages: Math.max(1, Math.ceil(snapshot.items.length / limitNum)) },
      searchInfo: snapshot.searchInfo
    });
    try {
      if (bounded) {
        const cached = this.cache.get(cacheKey);
        if (cached) return paginate(cached);
        const snapshot = await this.singleFlight(cacheKey, async () => {
          const combined = [];
          let successes = 0;
          let failures = 0;
          let limited = false;
          const merge = item => {
            if (!matches(item)) return;
            const existing = combined.find(value => isSameMovie(value, item));
            if (existing) existing.has_song_ngu = existing.has_song_ngu || item.has_song_ngu;
            else combined.push(item);
          };
          const load = async (query, latest = false) => {
            for (let p = 1; p <= (latest ? 2 : 4); p++) {
              const queryParams = new URLSearchParams(params);
              queryParams.set('page', p);
              queryParams.set('limit', 60);
              if (query) queryParams.set('keyword', query);
              try {
                const browsePath = active(type) ? `danh-sach/${encodeURIComponent(type === 'chieu-rap' ? 'phim-chieu-rap' : type)}` : active(category) ? `the-loai/${encodeURIComponent(category)}` : active(country) ? `quoc-gia/${encodeURIComponent(country)}` : 'danh-sach/phim-moi-cap-nhat';
                const res = await this.fetchJson(`/v1/api/${query && !latest ? 'tim-kiem' : browsePath}?${queryParams}`, { timeout: 2000 });
                if (res.status === false || !Array.isArray(res.data?.items)) throw new Error('Invalid catalog response');
                successes++;
                res.data.items.forEach(item => merge(this.normalizeMovieItem(item, res.data.APP_DOMAIN_CDN_IMAGE)));
                const pagination = res.data.params?.pagination || {};
                const providerPageSize = Number(pagination.totalItemsPerPage) || res.data.items.length || 60;
                const totalPages = Number(pagination.totalPages) || Math.ceil(Number(pagination.totalItems) / providerPageSize);
                if (!res.data.items.length || (totalPages ? p >= totalPages : res.data.items.length < 60)) break;
                limited = true;
              } catch (_) { failures++; break; }
            }
          };
          // Providers do not guarantee accent-insensitive lookup; query a folded variant too.
          const folded = trimmed.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
          await load(trimmed);
          if (trimmed && folded.toLowerCase() !== trimmed.toLowerCase()) await load(folded);
          if (trimmed && !combined.length) { await load('', true); limited = true; }
          if (trimmed) {
            const bilingual = await vicdnService.searchViCdn(trimmed, { unlimited: true }).catch(() => { failures++; return []; });
            if (vicdnService.searchSyncUnavailable) failures++;
            bilingual.forEach(merge);
          }
          if ((!successes || failures) && !combined.length) throw new Error('Catalog provider unavailable');
          if (['year', 'released'].includes(sort)) combined.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
          else if (['view', 'views'].includes(sort)) combined.sort((a, b) => (b.view || 0) - (a.view || 0));
          else if (sort === 'rating') combined.sort((a, b) => (b.imdb_rating || 0) - (a.imdb_rating || 0));
          const searchInfo = {
            limited: limited || !!trimmed, partial: failures > 0,
            message: 'Kết quả trong phạm vi dữ liệu nhà cung cấp trả về và chỉ mục Song Ngữ đã đồng bộ; không phải toàn bộ kho phim.'
          };
          const result = { items: combined, searchInfo };
          const keys = [...this.cache.cache.keys()].filter(key => key.startsWith('search_v4:'));
          if (keys.length >= 100) this.cache.delete(keys[0]);
          if (!failures && combined.length) this.cache.set(cacheKey, result, 60000);
          return result;
        });
        return paginate(snapshot);
      }
      let path = 'danh-sach/phim-moi-cap-nhat';
      if (active(category)) path = `the-loai/${encodeURIComponent(category)}`;
      else if (active(country)) path = `quoc-gia/${encodeURIComponent(country)}`;
      else if (active(year)) path = `nam/${encodeURIComponent(year)}`;
      else if (active(type)) path = `danh-sach/${encodeURIComponent(type === 'chieu-rap' ? 'phim-chieu-rap' : type)}`;
      params.set('page', pageNum);
      params.set('limit', limitNum);
      const res = await this.fetchJson(`/v1/api/${path}?${params}`);
      if (res.status === false || !Array.isArray(res.data?.items)) throw new Error('Invalid catalog response');
      const items = res.data.items.map(item => this.normalizeMovieItem(item, res.data.APP_DOMAIN_CDN_IMAGE));
      const pagination = res.data.params?.pagination || {};
      const totalItems = Number(pagination.totalItems) || items.length;
      return { items, pagination: { totalItems, totalItemsPerPage: limitNum, currentPage: pageNum, totalPages: Number(pagination.totalPages) || Math.max(1, Math.ceil(totalItems / limitNum)) } };
    } catch (err) {
      console.warn('[Catalog] Provider unavailable:', err.message);
      return { items: [], error: 'provider_unavailable', searchInfo: { unavailable: true }, pagination: { totalItems: 0, totalItemsPerPage: limitNum, currentPage: pageNum, totalPages: 1 } };
    }
  }

  async getMetadataList(name, endpoint) {
    const cacheKey = `metadata_${name}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return { items: cached, available: true };

    const previous = this.metadataState.get(name);
    if (previous && Date.now() < previous.retryAt) {
      return { items: previous.items || [], available: previous.items !== null, error: 'provider_unavailable' };
    }

    return this.singleFlight(cacheKey, async () => {
      try {
        const response = await this.fetchJson(endpoint);
        if (response?.status === false || !Array.isArray(response?.data?.items)) {
          throw new Error('Invalid metadata response');
        }
        const items = response.data.items.map(item => ({ id: item._id || item.id, name: item.name, slug: item.slug }));
        this.cache.set(cacheKey, items, config.CACHE_TTL.CATEGORIES);
        this.metadataState.set(name, { items, retryAt: 0 });
        return { items, available: true };
      } catch (error) {
        // Keep each last successful list independently; failures retry after 30 seconds, not 24 hours.
        const items = previous?.items ?? null;
        this.metadataState.set(name, { items, retryAt: Date.now() + 30000 });
        return { items: items || [], available: items !== null, error: 'provider_unavailable' };
      }
    });
  }

  async getCategoriesAndCountries() {
    const [categories, countries] = await Promise.all([
      this.getMetadataList('categories', '/v1/api/the-loai'),
      this.getMetadataList('countries', '/v1/api/quoc-gia')
    ]);
    const result = { categories: categories.items, countries: countries.items };
    const errors = {};
    const stale = [];
    for (const [name, metadata] of Object.entries({ categories, countries })) {
      if (!metadata.error) continue;
      errors[name] = metadata.error;
      if (metadata.available) stale.push(name);
    }
    if (Object.keys(errors).length) {
      Object.assign(result, {
        error: 'provider_unavailable',
        partial: categories.available || countries.available,
        errors,
        stale
      });
    }
    return result;
  }

  async quickSearch(keyword) {
    if (!keyword || !String(keyword).trim()) return [];
    const result = await this.getCatalog({ keyword, page: 1, limit: 8 });
    return result.items;
  }

  async searchMovies(keyword, page = 1, limit = 30) {
    return this.getCatalog({ keyword, page, limit });
  }

  clearHomeCache() {
    this.cache.delete('home_data');
  }
}

const kkphimInstance = new KKPhimService();
kkphimInstance.isSameMovie = isSameMovie;
kkphimInstance.extractSeasonIdentifier = extractSeasonIdentifier;

module.exports = kkphimInstance;

