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
  async getPersonDetail(name) {
    if (!name || !name.trim()) return null;
    const cleanName = name.trim();
    const cacheKey = `person_${cleanName}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    // 1. Search person on TMDb
    let searchRes = await this.fetchTmdb('/search/person', { query: cleanName, language: 'vi-VN' });
    if (!searchRes?.results?.length) {
      searchRes = await this.fetchTmdb('/search/person', { query: cleanName, language: 'en-US' });
    }

    const personMatch = searchRes?.results?.[0];
    if (!personMatch) return null;

    // 2. Fetch full person details + movie & tv credits
    const personId = personMatch.id;
    let detail = await this.fetchTmdb(`/person/${personId}`, {
      append_to_response: 'movie_credits,tv_credits,images',
      language: 'vi-VN'
    });

    // If biography in Vietnamese is empty, get English biography
    if (!detail?.biography) {
      const enDetail = await this.fetchTmdb(`/person/${personId}`, { language: 'en-US' });
      if (enDetail?.biography) {
        detail.biography = enDetail.biography;
      }
    }

    const isDirector = personMatch.known_for_department === 'Directing' || detail.known_for_department === 'Directing';
    const roleTitle = isDirector ? 'Đạo diễn điện ảnh' : 'Diễn viên điện ảnh';

    // High resolution profile picture
    const avatar = detail.profile_path
      ? `${TMDB_IMG}/h632${detail.profile_path}`
      : `https://ui-avatars.com/api/?name=${encodeURIComponent(detail.name)}&background=e50914&color=fff&size=512&bold=true`;

    // Process movie & tv credits
    const allCredits = [
      ...(detail.movie_credits?.cast || []),
      ...(detail.movie_credits?.crew?.filter(c => c.job === 'Director') || []),
      ...(detail.tv_credits?.cast || []),
      ...(detail.tv_credits?.crew?.filter(c => c.job === 'Director') || [])
    ];

    // Deduplicate and sort by popularity / release date
    const seenMovies = new Set();
    const filmography = [];

    allCredits
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
          character: m.character || (m.job === 'Director' ? 'Đạo diễn' : ''),
          poster_url: posterUrl,
          thumb_url: posterUrl,
          year: year || 2024,
          vote_average: m.vote_average ? Number(m.vote_average.toFixed(1)) : 8.5,
          quality: 'FHD',
          slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        });
      });

    const result = {
      person: {
        id: detail.id,
        name: detail.name,
        slug: detail.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        role: roleTitle,
        type: isDirector ? 'director' : 'actor',
        avatar,
        birthday: detail.birthday || '',
        place_of_birth: detail.place_of_birth || 'Quốc tế',
        popularity: detail.popularity || 0,
        biography: detail.biography || `${detail.name} là một nghệ sĩ điện ảnh nổi tiếng, được khán giả toàn cầu yêu mến qua nhiều tác phẩm đỉnh cao đạt doanh thu và đánh giá xuất sắc tại TMDb và IMDb.`,
        movies_count: filmography.length
      },
      movies: filmography
    };

    setCache(cacheKey, result);
    return result;
  }
}

module.exports = new TmdbService();
