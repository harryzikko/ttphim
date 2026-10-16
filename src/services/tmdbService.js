const dns = require('dns');
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (_) {}

const TMDB_API_KEY = process.env.TMDB_API_KEY || '8265bd1679663a7ea12ac168da84d2e8';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';

// In-memory cache for fast response (1 hour TTL)
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000;

function getCached(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expires) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data, ttl = CACHE_TTL) {
  cache.set(key, { data, expires: Date.now() + ttl });
}

class TmdbService {
  async fetchTmdb(endpoint, params = {}) {
    const url = new URL(`${TMDB_BASE}${endpoint}`);
    url.searchParams.set('api_key', TMDB_API_KEY);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, v);
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      return null;
    }
  }

  /**
   * Search for TMDb ID by movie name / origin name and year
   */
  async findMovieTmdbId(title, year = null, isTv = false) {
    if (!title || !title.trim()) return null;
    const cleanTitle = title.trim();
    const cacheKey = `tmdb_id_${cleanTitle}_${year}_${isTv}`;
    const cached = getCached(cacheKey);
    if (cached !== null) return cached;

    // 1. Search movie / tv
    const endpoint = isTv ? '/search/tv' : '/search/movie';
    const params = { query: cleanTitle, language: 'vi-VN' };
    if (year && !isTv) params.year = year;
    if (year && isTv) params.first_air_date_year = year;

    let res = await this.fetchTmdb(endpoint, params);
    let match = res?.results?.[0];

    // Fallback: try searching without year or in English
    if (!match && year) {
      delete params.year;
      delete params.first_air_date_year;
      res = await this.fetchTmdb(endpoint, params);
      match = res?.results?.[0];
    }

    // Fallback: search opposite type (e.g. movie vs tv)
    if (!match) {
      const altEndpoint = isTv ? '/search/movie' : '/search/tv';
      res = await this.fetchTmdb(altEndpoint, { query: cleanTitle });
      match = res?.results?.[0];
      if (match) isTv = !isTv;
    }

    const result = match ? { id: match.id, isTv, title: match.title || match.name } : null;
    setCache(cacheKey, result);
    return result;
  }

  /**
   * Get accurate credits (cast and crew) for a movie from TMDb
   */
  async getMovieCredits(movie) {
    if (!movie) return { cast: [], directors: [] };
    const cacheKey = `credits_${movie.slug || movie.id || movie.name}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    let tmdbId = null;
    let isTv = false;

    // Check existing TMDb ID in movie payload
    if (movie.tmdb) {
      if (typeof movie.tmdb === 'object' && movie.tmdb.id) {
        tmdbId = movie.tmdb.id;
        isTv = movie.tmdb.type === 'tv';
      } else if (typeof movie.tmdb === 'string' || typeof movie.tmdb === 'number') {
        tmdbId = String(movie.tmdb);
      }
    }

    // If no TMDb ID, search by origin_name or name
    if (!tmdbId) {
      const searchTitle = movie.origin_name || movie.name;
      const found = await this.findMovieTmdbId(searchTitle, movie.year, movie.type === 'series' || movie.type === 'hoathinh');
      if (found) {
        tmdbId = found.id;
        isTv = found.isTv;
      }
    }

    // If still no match and movie has an IMDb ID
    if (!tmdbId && movie.imdb && movie.imdb.id) {
      const imdbId = movie.imdb.id;
      const findRes = await this.fetchTmdb(`/find/${imdbId}`, { external_source: 'imdb_id' });
      if (findRes) {
        const item = findRes.movie_results?.[0] || findRes.tv_results?.[0];
        if (item) {
          tmdbId = item.id;
          isTv = Boolean(findRes.tv_results?.[0]);
        }
      }
    }

    // If we have TMDb ID, fetch credits directly!
    if (tmdbId) {
      const endpoint = isTv ? `/tv/${tmdbId}/credits` : `/movie/${tmdbId}/credits`;
      let creditsRes = await this.fetchTmdb(endpoint, { language: 'vi-VN' });
      if (!creditsRes || !creditsRes.cast?.length) {
        creditsRes = await this.fetchTmdb(endpoint, { language: 'en-US' });
      }

      if (creditsRes) {
        const rawCast = creditsRes.cast || [];
        const rawCrew = creditsRes.crew || [];

        const cast = rawCast.slice(0, 15).map(c => ({
          id: c.id,
          name: c.name,
          character: c.character || 'Diễn viên',
          profile_path: c.profile_path,
          avatar: c.profile_path
            ? `${TMDB_IMG}/w276_and_h350_face${c.profile_path}`
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&background=e50914&color=fff&size=256&bold=true`,
          isDirector: false
        }));

        const directorCrew = rawCrew.filter(c => c.job === 'Director' || c.department === 'Directing');
        const seenDirectors = new Set();
        const directors = [];

        directorCrew.forEach(d => {
          if (!seenDirectors.has(d.name)) {
            seenDirectors.add(d.name);
            directors.push({
              id: d.id,
              name: d.name,
              character: 'Đạo diễn',
              profile_path: d.profile_path,
              avatar: d.profile_path
                ? `${TMDB_IMG}/w276_and_h350_face${d.profile_path}`
                : `https://ui-avatars.com/api/?name=${encodeURIComponent(d.name)}&background=e5a914&color=fff&size=256&bold=true`,
              isDirector: true
            });
          }
        });

        const result = { cast, directors };
        setCache(cacheKey, result);
        return result;
      }
    }

    // Fallback if TMDb credits not found: use Cinemeta if IMDb ID exists
    if (movie.imdb && movie.imdb.id) {
      try {
        const cinemetaRes = await fetch(`https://v3-cinemeta.strem.io/meta/movie/${movie.imdb.id}.json`);
        const cData = await cinemetaRes.json();
        if (cData?.meta) {
          const cast = (cData.meta.cast || []).map(name => ({
            name,
            character: 'Diễn viên',
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=e50914&color=fff&size=256&bold=true`,
            isDirector: false
          }));
          const directors = (cData.meta.director || []).map(name => ({
            name,
            character: 'Đạo diễn',
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=e5a914&color=fff&size=256&bold=true`,
            isDirector: true
          }));
          const result = { cast, directors };
          setCache(cacheKey, result);
          return result;
        }
      } catch (_) {}
    }

    return { cast: [], directors: [] };
  }

  /**
   * Get accurate person biography, details, and filmography from TMDb
   */
  async getPersonDetail(nameOrId, options = {}) {
    const rawInput = (nameOrId != null ? String(nameOrId) : '').trim();
    const explicitId = options.id ? String(options.id).trim() : (/^\d+$/.test(rawInput) ? rawInput : null);
    const cleanName = explicitId ? (options.name || rawInput) : rawInput;
    if (!cleanName && !explicitId) return null;

    const cacheKey = `person_${explicitId || cleanName}_${options.type || ''}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const toSlug = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    let personId = explicitId;
    let personMatch = null;

    // 1. If no numeric ID provided, search person on TMDb with intelligent candidate scoring
    if (!personId) {
      let searchRes = await this.fetchTmdb('/search/person', { query: cleanName, language: 'vi-VN' });
      if (!searchRes?.results?.length) {
        searchRes = await this.fetchTmdb('/search/person', { query: cleanName, language: 'en-US' });
      }

      const results = searchRes?.results || [];
      if (!results.length) return null;

      const targetSlug = toSlug(cleanName);
      const scored = results.map(c => {
        const cSlug = toSlug(c.name);
        const aliases = (c.also_known_as || []).map(toSlug);
        let score = c.popularity || 0;
        if (cSlug === targetSlug || aliases.includes(targetSlug)) {
          score += 1000;
        } else if (cSlug.includes(targetSlug) || targetSlug.includes(cSlug)) {
          score += 500;
        }
        return { candidate: c, score };
      });

      scored.sort((a, b) => b.score - a.score);
      personMatch = scored[0].candidate;
      personId = personMatch.id;
    }

    // 2. Fetch full person details + movie & tv credits
    let detail = await this.fetchTmdb(`/person/${personId}`, {
      append_to_response: 'movie_credits,tv_credits,images',
      language: 'vi-VN'
    });

    if (!detail || !detail.name) return null;

    // If biography in Vietnamese is empty, get English biography
    if (!detail?.biography || detail.biography.trim().length < 20) {
      const enDetail = await this.fetchTmdb(`/person/${personId}`, { language: 'en-US' });
      if (enDetail?.biography) {
        detail.biography = enDetail.biography;
      }
    }

    const isDirector = options.type === 'director' ||
      personMatch?.known_for_department === 'Directing' ||
      detail.known_for_department === 'Directing';
    const roleTitle = isDirector ? 'Đạo diễn điện ảnh' : 'Diễn viên điện ảnh';

    // High resolution profile picture
    const avatar = detail.profile_path
      ? `${TMDB_IMG}/h632${detail.profile_path}`
      : `https://ui-avatars.com/api/?name=${encodeURIComponent(detail.name)}&background=e50914&color=fff&size=512&bold=true`;

    // Process movie & tv credits
    const rawCreditsList = isDirector
      ? [
          ...(detail.movie_credits?.crew?.filter(c => c.job === 'Director') || []),
          ...(detail.tv_credits?.crew?.filter(c => c.job === 'Director') || [])
        ]
      : [
          ...(detail.movie_credits?.cast || []),
          ...(detail.tv_credits?.cast || [])
        ];

    // Filter out talk shows, award shows, and self-appearances
    const talkShowKeywords = ['talk show', 'jimmy fallon', 'academy awards', 'golden globe', 'grammy', 'oscars', 'self - guest', 'self'];
    const filteredCredits = rawCreditsList.filter(m => {
      const char = (m.character || '').toLowerCase();
      const title = (m.title || m.name || '').toLowerCase();
      const isSelf = talkShowKeywords.some(kw => char.includes(kw) || title.includes(kw));
      return !isSelf;
    });

    // Deduplicate and sort by popularity
    const seenMovies = new Set();
    const filmography = [];

    filteredCredits
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .forEach(m => {
        const title = m.title || m.name;
        if (!title || seenMovies.has(m.id)) return;
        seenMovies.add(m.id);

        const releaseDate = m.release_date || m.first_air_date || '';
        const year = releaseDate ? parseInt(releaseDate.split('-')[0], 10) : null;
        const posterUrl = m.poster_path ? `${TMDB_IMG}/w342${m.poster_path}` : '';

        filmography.push({
          id: String(m.id),
          tmdb_id: m.id,
          name: title,
          origin_name: m.original_title || m.original_name || title,
          character: m.character || (isDirector ? 'Đạo diễn' : 'Diễn viên'),
          poster_url: posterUrl,
          thumb_url: posterUrl,
          year: year || 2024,
          vote_average: m.vote_average ? Number(m.vote_average.toFixed(1)) : 8.5,
          quality: 'FHD',
          slug: toSlug(title)
        });
      });

    const result = {
      person: {
        id: detail.id,
        name: detail.name,
        slug: toSlug(detail.name),
        role: roleTitle,
        type: isDirector ? 'director' : 'actor',
        avatar,
        birthday: detail.birthday || '',
        place_of_birth: detail.place_of_birth || 'Quốc tế',
        popularity: detail.popularity || 0,
        biography: detail.biography || `${detail.name} là một nghệ sĩ điện ảnh nổi tiếng, được khán giả toàn cầu yêu mến qua nhiều tác phẩm đỉnh cao đạt doanh thu và đánh giá xuất sắc tại TMDb và IMDb.`,
        movies_count: filmography.length
      },
      rawCredits: filteredCredits,
      movies: filmography
    };

    setCache(cacheKey, result);
    return result;
  }
}

module.exports = new TmdbService();
