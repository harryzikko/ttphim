const config = require('../config');
const vicdnService = require('./vicdnService');
const nguoncService = require('./nguoncService');

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

function isSameMovie(a, b) {
  if (!a || !b) return false;
  if (a.slug && b.slug && a.slug === b.slug) return true;

  // 1. TMDB ID match
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

  // 4. Slugs stripped of season/year suffix
  if (a.slug && b.slug) {
    const slugCleanA = removeAccents(a.slug.replace(/-\d{4}$/, '').replace(/-phan-\d+$/, '').replace(/-/g, ' '));
    const slugCleanB = removeAccents(b.slug.replace(/-\d{4}$/, '').replace(/-phan-\d+$/, '').replace(/-/g, ' '));
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
    this.totalMovies = 30275;
    this.totalPages = 1262;
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
      origin_name: item.origin_name || '',
      poster_url: resolveUrl(item.poster_url),
      thumb_url: resolveUrl(item.thumb_url || item.poster_url),
      year: item.year || (item.modified?.time ? new Date(item.modified.time).getFullYear() : 2024),
      time: item.time || '',
      quality: item.quality || 'FHD',
      lang: item.lang || 'Vietsub',
      episode_current: item.episode_current || '',
      episode_total: item.episode_total || '',
      chieurap: item.chieurap === true || item.chieurap === 'true' || item.chieurap === 1,
      type: item.type || '',
      category: Array.isArray(item.category) ? item.category : [],
      country: Array.isArray(item.country) ? item.country : [],
      content: item.content ? item.content.replace(/<[^>]*>?/gm, '').trim() : '',
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
      clearTimeout(timeoutId);
      if (!res.ok) {
        throw new Error(`API request failed with status ${res.status}: ${url}`);
      }
      return res.json();
    } catch(err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  async getTotalMovies() {
    if (this.totalMovies && this.totalMovies > 0) return this.totalMovies;
    try {
      const res = await this.fetchJson('/danh-sach/phim-moi-cap-nhat?page=1');
      if (res && res.pagination?.totalItems) {
        this.totalMovies = res.pagination.totalItems;
        this.totalPages = res.pagination.totalPages;
      }
    } catch(e) {}
    return this.totalMovies || 30275;
  }

  async getHomeData() {
    const cacheKey = 'home_data';
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const [latestRes, seriesRes, singleRes, animeRes, tvshowsRes] = await Promise.all([
        this.fetchJson('/danh-sach/phim-moi-cap-nhat?page=1').catch(() => ({ items: [] })),
        this.fetchJson('/v1/api/danh-sach/phim-bo?page=1&limit=16').catch(() => ({ data: { items: [] } })),
        this.fetchJson('/v1/api/danh-sach/phim-le?page=1&limit=16').catch(() => ({ data: { items: [] } })),
        this.fetchJson('/v1/api/danh-sach/hoat-hinh?page=1&limit=16').catch(() => ({ data: { items: [] } })),
        this.fetchJson('/v1/api/danh-sach/tv-shows?page=1&limit=16').catch(() => ({ data: { items: [] } }))
      ]);

      if (latestRes && latestRes.pagination?.totalItems) {
        this.totalMovies = latestRes.pagination.totalItems;
        this.totalPages = latestRes.pagination.totalPages;
      }

      const latestItems = (latestRes.items || []).map(i => this.normalizeMovieItem(i));
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
          });
        }
      } catch(e) {}

      // Create spotlight candidates:
      // Phim nổi bật BẮT BUỘC CHỈ lấy đúng những phim được ghim bởi Admin!
      // Tuyệt đối KHÔNG tự ý lấy phim chiếu rạp, phim bộ hay bất kỳ nguồn nào khác khi chưa ghim!
      const spotlightCandidates = pinnedCandidates;

      // Fetch details for spotlights (hỗ trợ cả 3 nguồn: KKPhim, ViCDN Song Ngữ, NguonC)
      const spotlightList = [];
      for (const item of spotlightCandidates.slice(0, 10)) {
        try {
          const detail = await this.getMovieDetail(item.slug);
          if (detail && detail.movie) {
            spotlightList.push({
              id: detail.movie.id || item.slug,
              name: detail.movie.name || item.name || item.slug,
              slug: detail.movie.slug || item.slug,
              origin_name: detail.movie.origin_name || item.origin_name || '',
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
            });
            continue;
          }
        } catch (e) {
          console.warn(`[Spotlight] Could not fetch remote detail for pinned movie "${item.slug}":`, e.message);
        }

        // Fallback for pinned item when remote fetch is slow or cached
        if (item.name || item.slug) {
          spotlightList.push({
            id: item.id || item.slug,
            name: item.name || item.slug,
            slug: item.slug,
            origin_name: item.origin_name || '',
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
          });
        }
      }

      // Real Ranking leaderboard (Top 10 Thịnh Hành dựa trên lượt xem thực tế 100%)
      let rankingItems = [];
      try {
        const candidatePool = [
          ...latestItems,
          ...seriesItems,
          ...singleItems,
          ...animeItems
        ];
        const uniqueCandidates = [];
        const seenSlugs = new Set();
        for (const item of candidatePool) {
          if (item && item.slug && !seenSlugs.has(item.slug)) {
            seenSlugs.add(item.slug);
            uniqueCandidates.push(item);
          }
        }

        // Fetch real details for top candidates in parallel to get actual movie.view
        const detailMap = new Map();
        const candidatesToFetch = uniqueCandidates.slice(0, 18);
        await Promise.all(
          candidatesToFetch.map(async (c) => {
            try {
              const d = await this.getMovieDetail(c.slug);
              if (d && d.movie) {
                detailMap.set(c.slug, d.movie);
              }
            } catch (e) {}
          })
        );

        // Fetch local view count increments from dbService
        let localViews = {};
        try {
          const dbService = require('./dbService');
          localViews = await dbService.getMovieViews();
        } catch (e) {}

        const rankedList = candidatesToFetch.map(item => {
          const detail = detailMap.get(item.slug);
          const apiView = detail && typeof detail.view === 'number' ? detail.view : 0;
          const localView = (localViews && localViews[item.slug]) ? localViews[item.slug] : 0;
          const totalView = apiView + localView;
          const hasSongNgu = Boolean(
            item.has_song_ngu || 
            detail?.has_song_ngu || 
            (vicdnService && vicdnService.hasBilingualMatch(item))
          );
          return {
            ...item,
            has_song_ngu: hasSongNgu,
            quality: detail?.quality || item.quality || 'FHD',
            year: detail?.year || item.year || 2026,
            real_views: totalView,
            views: totalView.toLocaleString('vi-VN')
          };
        });

        // Sort strictly by real view count descending!
        rankedList.sort((a, b) => b.real_views - a.real_views);

        rankingItems = rankedList.slice(0, 10).map((item, idx) => ({
          ...item,
          rank: idx + 1
        }));
      } catch (err) {
        console.error('Error computing real rankings:', err);
        rankingItems = latestItems.slice(0, 10).map((item, idx) => ({
          ...item,
          rank: idx + 1,
          views: '0'
        }));
      }

      const homeData = {
        spotlights: spotlightList, // Tuyệt đối chỉ lấy phim do admin ghim, không fallback!
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

          try {
            const nguoncServers = await nguoncService.getServers(viCdnDirect.movie);
            if (nguoncServers && nguoncServers.length > 0) {
              viCdnDirect.episodes.push(...nguoncServers);
              console.log(`[ViCDN+NguonC] Attached ${nguoncServers.length} NguonC server(s) to "${viCdnDirect.movie.name}"`);
            }
          } catch(e) {}
          this.cache.set(cacheKey, viCdnDirect, config.CACHE_TTL.DETAIL);
          return viCdnDirect;
        }
      }

      // 2. Fetch KKPhim detail
      try {
        data = await this.fetchJson(`/phim/${slug}`);
      } catch (err) {
        // Fallback 1: check if slug exists directly in ViCDN
        const viCdnDirect = await vicdnService.getMovieDetail(slug);
        if (viCdnDirect) {
          try {
            const nguoncServers = await nguoncService.getServers(viCdnDirect.movie);
            if (nguoncServers && nguoncServers.length > 0) {
              viCdnDirect.episodes.push(...nguoncServers);
            }
          } catch(e) {}
          this.cache.set(cacheKey, viCdnDirect, config.CACHE_TTL.DETAIL);
          return viCdnDirect;
        }

        // Fallback 2: check if slug exists directly in NguonC
        const nguonCDirect = await nguoncService.getMovieDetail(slug);
        if (nguonCDirect) {
          try {
            const bilingualServer = await vicdnService.getBilingualServer(nguonCDirect.movie);
            if (bilingualServer && bilingualServer.server_data && bilingualServer.server_data.length > 0) {
              nguonCDirect.episodes.push(bilingualServer);
              nguonCDirect.movie.has_song_ngu = true;
              if (!nguonCDirect.movie.lang.toLowerCase().includes('song ngữ')) {
                nguonCDirect.movie.lang = `${nguonCDirect.movie.lang} + Song Ngữ`;
              }
            }
          } catch(e) {}
          this.cache.set(cacheKey, nguonCDirect, config.CACHE_TTL.DETAIL);
          return nguonCDirect;
        }

        throw err;
      }

      if (!data || !data.movie) {
        throw new Error('Movie not found');
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

      // Merge NguonC Servers if available!
      try {
        const nguoncServers = await nguoncService.getServers(movie);
        if (nguoncServers && nguoncServers.length > 0) {
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

  async getCatalog({ type, category, country, year, sort, page = 1, keyword, limit = 30 }) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 30;

    try {
      let endpoint = '';
      let isV1 = true;

      if (keyword && keyword.trim()) {
        const trimmed = keyword.trim();
        const [kkRes, vicdnMatches, nguoncMatches] = await Promise.all([
          this.fetchJson(`/v1/api/tim-kiem?keyword=${encodeURIComponent(trimmed)}&limit=${limitNum}&page=${pageNum}`).catch(() => null),
          (pageNum === 1) ? Promise.resolve(vicdnService.searchViCdn(trimmed)) : Promise.resolve([]),
          (pageNum === 1) ? nguoncService.search(trimmed).catch(() => []) : Promise.resolve([])
        ]);

        const cdn = kkRes?.data?.APP_DOMAIN_CDN_IMAGE || this.cdnUrl;
        const kkItems = (kkRes?.data?.items || []).map(i => this.normalizeMovieItem(i, cdn));
        const combined = [...kkItems];

        for (const viItem of vicdnMatches) {
          const existing = combined.find(item => isSameMovie(item, viItem));
          if (existing) {
            existing.has_song_ngu = true;
          } else {
            combined.push(viItem);
          }
        }

        for (const nguonItem of nguoncMatches) {
          const existing = combined.find(item => isSameMovie(item, nguonItem));
          if (existing) {
            if (!existing.has_song_ngu && vicdnService.hasBilingualMatch(nguonItem)) {
              existing.has_song_ngu = true;
            }
          } else {
            if (vicdnService.hasBilingualMatch(nguonItem)) {
              nguonItem.has_song_ngu = true;
            }
            combined.push(nguonItem);
          }
        }

        const totalItems = (kkRes?.data?.params?.pagination?.totalItems || kkItems.length) +
          (combined.length - kkItems.length);
        const pagination = {
          totalItems,
          totalItemsPerPage: limitNum,
          currentPage: pageNum,
          totalPages: Math.ceil(totalItems / limitNum) || 1
        };

        return { items: combined, pagination };
      } else if (category && category !== 'all') {
        endpoint = `/v1/api/the-loai/${category}?page=${pageNum}&limit=${limitNum}`;
      } else if (country && country !== 'all') {
        endpoint = `/v1/api/quoc-gia/${country}?page=${pageNum}&limit=${limitNum}`;
      } else if (year && year !== 'all') {
        endpoint = `/v1/api/nam/${year}?page=${pageNum}&limit=${limitNum}`;
      } else if (type && type !== 'all') {
        const typeSlug = (type === 'chieu-rap' || type === 'phim-chieu-rap') ? 'phim-chieu-rap' : type;
        endpoint = `/v1/api/danh-sach/${typeSlug}?page=${pageNum}&limit=${limitNum}`;
      } else {
        endpoint = `/v1/api/danh-sach/phim-moi-cap-nhat?page=${pageNum}&limit=${limitNum}`;
        isV1 = true;
      }

      const res = await this.fetchJson(endpoint);

      let items = [];
      let pagination = {
        totalItems: 0,
        totalItemsPerPage: limitNum,
        currentPage: pageNum,
        totalPages: 1
      };

      if (isV1) {
        const cdn = res.data?.APP_DOMAIN_CDN_IMAGE || this.cdnUrl;
        items = (res.data?.items || []).map(i => this.normalizeMovieItem(i, cdn));
        if (res.data?.params?.pagination) {
          pagination = {
            totalItems: res.data.params.pagination.totalItems || items.length,
            totalItemsPerPage: res.data.params.pagination.totalItemsPerPage || limitNum,
            currentPage: res.data.params.pagination.currentPage || pageNum,
            totalPages: res.data.params.pagination.totalPages || Math.ceil((res.data.params.pagination.totalItems || items.length) / limitNum) || 1
          };
        }
      } else {
        items = (res.items || []).map(i => this.normalizeMovieItem(i));
        if (res.pagination) {
          pagination = res.pagination;
        }
      }

      // Sort logic if requested
      if (sort === 'year') {
        items.sort((a, b) => (b.year || 0) - (a.year || 0));
      } else if (sort === 'view') {
        // preserve or shuffle ranking
      }

      return { items, pagination };
    } catch (err) {
      console.error('Error in getCatalog:', err);
      return {
        items: [],
        pagination: { totalItems: 0, totalItemsPerPage: limitNum, currentPage: pageNum, totalPages: 1 }
      };
    }
  }

  async getCategoriesAndCountries() {
    const cacheKey = 'metadata_cats_countries';
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const [catsRes, countriesRes] = await Promise.all([
        this.fetchJson('/v1/api/the-loai').catch(() => ({ data: { items: [] } })),
        this.fetchJson('/v1/api/quoc-gia').catch(() => ({ data: { items: [] } }))
      ]);

      const categories = (catsRes.data?.items || []).map(c => ({
        id: c._id || c.id,
        name: c.name,
        slug: c.slug
      }));

      const countries = (countriesRes.data?.items || []).map(c => ({
        id: c._id || c.id,
        name: c.name,
        slug: c.slug
      }));

      const result = { categories, countries };
      this.cache.set(cacheKey, result, config.CACHE_TTL.CATEGORIES);
      return result;
    } catch (err) {
      console.error('Error fetching categories & countries:', err);
      return { categories: [], countries: [] };
    }
  }

  async quickSearch(keyword) {
    if (!keyword || !keyword.trim()) return [];
    try {
      const trimmed = keyword.trim();
      const [kkRes, vicdnMatches, nguoncMatches] = await Promise.all([
        this.fetchJson(`/v1/api/tim-kiem?keyword=${encodeURIComponent(trimmed)}&limit=8`).catch(() => null),
        Promise.resolve(vicdnService.searchViCdn(trimmed)),
        nguoncService.search(trimmed).catch(() => [])
      ]);

      const cdn = kkRes?.data?.APP_DOMAIN_CDN_IMAGE || this.cdnUrl;
      const kkItems = (kkRes?.data?.items || []).map(i => this.normalizeMovieItem(i, cdn));
      const combined = [...kkItems];

      // 1. Merge ViCDN matches:
      for (const viItem of vicdnMatches) {
        const existing = combined.find(item => isSameMovie(item, viItem));
        if (existing) {
          existing.has_song_ngu = true;
          if (!existing.quality || existing.quality === 'FHD') {
            existing.quality = 'FHD • Song Ngữ';
          }
        } else {
          combined.push(viItem);
        }
      }

      // 2. Merge NguonC matches:
      for (const nguonItem of nguoncMatches) {
        const existing = combined.find(item => isSameMovie(item, nguonItem));
        if (existing) {
          if (!existing.has_song_ngu && vicdnService.hasBilingualMatch(nguonItem)) {
            existing.has_song_ngu = true;
            if (!existing.quality || existing.quality === 'FHD') {
              existing.quality = 'FHD • Song Ngữ';
            }
          }
        } else {
          if (vicdnService.hasBilingualMatch(nguonItem)) {
            nguonItem.has_song_ngu = true;
            if (!nguonItem.quality || nguonItem.quality === 'HD' || nguonItem.quality === 'FHD') {
              nguonItem.quality = 'FHD • Song Ngữ';
            }
          }
          combined.push(nguonItem);
        }
      }

      return combined.slice(0, 8);
    } catch (e) {
      return [];
    }
  }

  clearHomeCache() {
    this.cache.delete('home_data');
  }
}

module.exports = new KKPhimService();

