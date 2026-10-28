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
const ratingFlights = new Map();
const artworkCache = new Map(), artworkFlights = new Map();
const artworkIdentities = new Map(), artworkIdentityFlights = new Map();
function selectArtwork(images, kind) {
  return (Array.isArray(images) ? images : []).filter(image =>
    /^\/[a-zA-Z0-9_-]+\.(?:jpg|png|webp)$/.test(image?.file_path || '') &&
    Number.isSafeInteger(image.width) && Number.isSafeInteger(image.height) && image.height > 0 &&
    (kind === 'backdrop' ? image.width >= 640 && image.width / image.height >= 1.3 && image.width / image.height <= 2.6 : image.width >= 300 && image.width / image.height >= 0.45 && image.width / image.height <= 0.85)
  ).sort((a, b) => b.width * b.height - a.width * a.height || Number(a.iso_639_1 != null) - Number(b.iso_639_1 != null) || (b.vote_count || 0) - (a.vote_count || 0))[0] || null;
}
function artworkImage(image, kind) {
  if (!image) return null;
  const sizes = kind === 'backdrop' ? [780, 1280] : [342, 500, 780];
  const original = `${TMDB_IMG}/original${image.file_path}`;
  return { url: original, width: image.width, height: image.height,
    srcset: [...sizes.filter(width => width < image.width).map(width => `${TMDB_IMG}/w${width}${image.file_path} ${width}w`), `${original} ${image.width}w`].join(', ') };
}

function ratingReference(movie) {
  const metadata = movie?.tmdb;
  const rawId = (metadata && typeof metadata === 'object' ? metadata.id : metadata) || movie?.tmdb_id || movie?.tmdbId;
  if (!/^[1-9]\d*$/.test(String(rawId ?? '')) || !Number.isSafeInteger(Number(rawId))) return null;
  const declaredType = (metadata && typeof metadata === 'object' ? metadata.type : null) || movie?.tmdb_type || movie?.tmdbType;
  const mediaType = declaredType || ({ series: 'tv', tv: 'tv', 'phim-bo': 'tv', single: 'movie', movie: 'movie', 'phim-le': 'movie' })[movie?.type];
  if (!['movie', 'tv'].includes(mediaType)) return null;
  return { id: Number(rawId), mediaType };
}

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
  async resolveArtworkReference(movie) {
    const explicit = ratingReference(movie);
    if (explicit) return explicit;
    const rawId = (movie?.tmdb && typeof movie.tmdb === 'object' ? movie.tmdb.id : movie?.tmdb) || movie?.tmdb_id || movie?.tmdbId;
    if (rawId) return null;
    const mediaType = ({ single:'movie', movie:'movie', 'phim-le':'movie', series:'tv', tv:'tv', 'phim-bo':'tv' })[movie?.type];
    const title = typeof movie?.origin_name === 'string' ? movie.origin_name.trim() : '';
    const year = Number(movie?.year);
    if (!mediaType || !title || title.length > 200 || !Number.isInteger(year) || year < 1880 || year > new Date().getFullYear() + 3) return null;
    const fold = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const key = `${mediaType}:${fold(title)}:${year}`;
    const cached = artworkIdentities.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
    if (artworkIdentityFlights.has(key)) return artworkIdentityFlights.get(key);
    const work = (async () => {
      const params = { query:title, language:'en-US', include_adult:false, ...(mediaType === 'movie' ? {year} : {first_air_date_year:year}) };
      const result = await this.fetchTmdb(`/search/${mediaType}`, params, {timeoutMs:2500});
      if (!Array.isArray(result?.results)) return null;
      const matches = result.results.filter(item => Number.isSafeInteger(item.id) && item.id > 0 && String(item.release_date || item.first_air_date || '').slice(0,4) === String(year) && [item.original_title,item.title,item.original_name,item.name].some(name => fold(name) === fold(title)));
      const ids = [...new Set(matches.map(item => item.id))];
      const value = ids.length === 1 ? {id:ids[0],mediaType} : null;
      if (artworkIdentities.size >= 300) artworkIdentities.delete(artworkIdentities.keys().next().value);
      artworkIdentities.set(key,{value,expires:Date.now()+(value?24*CACHE_TTL:15*60*1000)});
      return value;
    })();
    artworkIdentityFlights.set(key,work);
    try { return await work; } finally { if(artworkIdentityFlights.get(key)===work)artworkIdentityFlights.delete(key); }
  }
  async getMovieArtwork(movie) {
    const reference = await this.resolveArtworkReference(movie);
    if (!reference) return null;
    const { id, mediaType } = reference, key = `${mediaType}:${id}`;
    const cached = artworkCache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
    if (artworkFlights.has(key)) return artworkFlights.get(key);
    const work = (async () => {
      const images = await this.fetchTmdb(`/${mediaType}/${id}/images`, { include_image_language: 'null,vi,en' }, { timeoutMs: 2500 });
      if (!images || images.id !== id || !Array.isArray(images.backdrops) || !Array.isArray(images.posters)) throw new Error('TMDb artwork unavailable');
      const backdrop = artworkImage(selectArtwork(images.backdrops, 'backdrop'), 'backdrop');
      const poster = artworkImage(selectArtwork(images.posters, 'poster'), 'poster');
      const value = { source: 'tmdb', tmdb_id: id, media_type: mediaType, backdrop, poster };
      if (artworkCache.size >= 300) artworkCache.delete(artworkCache.keys().next().value);
      artworkCache.set(key, { value, expires: Date.now() + (backdrop || poster ? 24 * CACHE_TTL : 15 * 60 * 1000) });
      return value;
    })();
    artworkFlights.set(key, work);
    try { return await work; }
    catch (error) {
      if (artworkCache.size >= 300) artworkCache.delete(artworkCache.keys().next().value);
      artworkCache.set(key, { value: null, expires: Date.now() + 30000 });
      throw error;
    } finally { if (artworkFlights.get(key) === work) artworkFlights.delete(key); }
  }
  async getMovieRating(movie) {
    const reference = ratingReference(movie);
    if (!reference) return { source: 'tmdb', tmdb_id: null, media_type: null, score_10: null, vote_count: 0, url: null };
    const { id, mediaType } = reference;
    const key = `rating_${mediaType}_${id}`;
    const cached = getCached(key);
    if (cached) return { ...cached };
    if (ratingFlights.has(key)) return { ...await ratingFlights.get(key) };
    const work = (async () => {
      const detail = await this.fetchTmdb(`/${mediaType}/${id}`);
      if (!detail || detail.id !== id || typeof detail.vote_average !== 'number' || !Number.isFinite(detail.vote_average) || detail.vote_average < 0 || detail.vote_average > 10 || !Number.isSafeInteger(detail.vote_count) || detail.vote_count < 0) {
        throw Object.assign(new Error('TMDb rating unavailable'), { statusCode: 502 });
      }
      const result = { source: 'tmdb', tmdb_id: id, media_type: mediaType, score_10: detail.vote_count > 0 ? detail.vote_average : null, vote_count: detail.vote_count, url: `https://www.themoviedb.org/${mediaType}/${id}` };
      setCache(key, result, detail.vote_count > 0 ? CACHE_TTL : 10 * 60 * 1000);
      return result;
    })();
    ratingFlights.set(key, work);
    try { return { ...await work }; }
    finally { if (ratingFlights.get(key) === work) ratingFlights.delete(key); }
  }
  async fetchTmdb(endpoint, params = {}, { timeoutMs = 6000 } = {}) {
    const url = new URL(`${TMDB_BASE}${endpoint}`);
    url.searchParams.set('api_key', TMDB_API_KEY);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, v);
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    } finally { clearTimeout(timer); }
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
    let isTv = movie.type === 'series' || movie.type === 'hoathinh';

    // 1. Check existing TMDb ID in movie payload
    if (movie.tmdb) {
      if (typeof movie.tmdb === 'object' && movie.tmdb.id) {
        tmdbId = String(movie.tmdb.id);
        if (movie.tmdb.type) isTv = movie.tmdb.type === 'tv';
      } else if (typeof movie.tmdb === 'string' || typeof movie.tmdb === 'number') {
        tmdbId = String(movie.tmdb);
      }
    }
    if (!tmdbId && movie.tmdb_id) {
      tmdbId = String(movie.tmdb_id);
    }
    if (!tmdbId && movie.tmdbId) {
      tmdbId = String(movie.tmdbId);
    }

    // 2. If no TMDb ID, look up via IMDb ID (external_source = imdb_id)
    const imdbId = (movie.imdb && typeof movie.imdb === 'object' ? movie.imdb.id : movie.imdb) || movie.imdb_id || movie.imdbId;
    if (!tmdbId && imdbId && typeof imdbId === 'string' && imdbId.startsWith('tt')) {
      const findRes = await this.fetchTmdb(`/find/${imdbId}`, { external_source: 'imdb_id' });
      if (findRes) {
        const item = findRes.movie_results?.[0] || findRes.tv_results?.[0];
        if (item) {
          tmdbId = String(item.id);
          isTv = Boolean(findRes.tv_results?.[0] && !findRes.movie_results?.[0]);
        }
      }
    }

    // 3. If still no TMDb ID, search by origin_name or name
    if (!tmdbId) {
      const searchTitle = movie.origin_name || movie.name;
      const found = await this.findMovieTmdbId(searchTitle, movie.year, isTv);
      if (found) {
        tmdbId = String(found.id);
        isTv = found.isTv;
      }
    }

    // 4. If we have TMDb ID, fetch credits directly!
    if (tmdbId) {
      const endpoint = isTv ? `/tv/${tmdbId}/credits` : `/movie/${tmdbId}/credits`;
      let creditsRes = await this.fetchTmdb(endpoint, { language: 'vi-VN' });
      if (!creditsRes || !creditsRes.cast?.length) {
        creditsRes = await this.fetchTmdb(endpoint, { language: 'en-US' });
      }

      if (creditsRes) {
        const rawCast = creditsRes.cast || [];
        const rawCrew = creditsRes.crew || [];

        const cast = rawCast.slice(0, 24).map(c => ({
          id: c.id,
          name: c.name,
          character: c.character || 'Diễn viên',
          profile_path: c.profile_path,
          avatar: c.profile_path
            ? `${TMDB_IMG}/w276_and_h350_face${c.profile_path}`
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&background=1d1f29&color=e50914&size=256&bold=true`,
          isDirector: false
        }));

        // Prioritize true Director job, only fallback to directing department if empty
        let directorCrew = rawCrew.filter(c => c.job === 'Director');
        if (!directorCrew.length) {
          directorCrew = rawCrew.filter(c => c.department === 'Directing');
        }

        const seenDirectors = new Set();
        const directors = [];

        directorCrew.slice(0, 6).forEach(d => {
          if (!seenDirectors.has(d.name)) {
            seenDirectors.add(d.name);
            directors.push({
              id: d.id,
              name: d.name,
              character: 'Đạo diễn',
              profile_path: d.profile_path,
              avatar: d.profile_path
                ? `${TMDB_IMG}/w276_and_h350_face${d.profile_path}`
                : `https://ui-avatars.com/api/?name=${encodeURIComponent(d.name)}&background=1d1f29&color=f59e0b&size=256&bold=true`,
              isDirector: true
            });
          }
        });

        // If directors list is still empty but movie payload has director names
        if (!directors.length && Array.isArray(movie.director) && movie.director.length) {
          movie.director.filter(Boolean).forEach(dName => {
            if (!seenDirectors.has(dName)) {
              seenDirectors.add(dName);
              directors.push({
                id: null,
                name: dName,
                character: 'Đạo diễn',
                profile_path: null,
                avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(dName)}&background=1d1f29&color=f59e0b&size=256&bold=true`,
                isDirector: true
              });
            }
          });
        }

        // If cast list is empty but movie payload has actor names
        if (!cast.length && Array.isArray(movie.actor) && movie.actor.length) {
          movie.actor.filter(Boolean).forEach(aName => {
            cast.push({
              id: null,
              name: aName,
              character: 'Diễn viên',
              profile_path: null,
              avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(aName)}&background=1d1f29&color=e50914&size=256&bold=true`,
              isDirector: false
            });
          });
        }

        const result = { cast, directors };
        setCache(cacheKey, result);
        return result;
      }
    }

    // Fallback if TMDb credits not found: use Cinemeta if IMDb ID exists
    if (imdbId && typeof imdbId === 'string' && imdbId.startsWith('tt')) {
      try {
        const cinemetaEndpoint = isTv ? `series/${imdbId}` : `movie/${imdbId}`;
        const cinemetaRes = await fetch(`https://v3-cinemeta.strem.io/meta/${cinemetaEndpoint}.json`);
        const cData = await cinemetaRes.json();
        if (cData?.meta) {
          const cast = (cData.meta.cast || []).slice(0, 20).map(name => ({
            id: null,
            name,
            character: 'Diễn viên',
            profile_path: null,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1d1f29&color=e50914&size=256&bold=true`,
            isDirector: false
          }));
          const directors = (cData.meta.director || []).slice(0, 4).map(name => ({
            id: null,
            name,
            character: 'Đạo diễn',
            profile_path: null,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1d1f29&color=f59e0b&size=256&bold=true`,
            isDirector: true
          }));
          const result = { cast, directors };
          setCache(cacheKey, result);
          return result;
        }
      } catch (_) {}
    }

    // Ultimate fallback: use raw movie.director and movie.actor from payload
    const directors = (Array.isArray(movie.director) ? movie.director : []).filter(Boolean).map(name => ({
      id: null,
      name,
      character: 'Đạo diễn',
      profile_path: null,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1d1f29&color=f59e0b&size=256&bold=true`,
      isDirector: true
    }));
    const cast = (Array.isArray(movie.actor) ? movie.actor : []).filter(Boolean).map(name => ({
      id: null,
      name,
      character: 'Diễn viên',
      profile_path: null,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1d1f29&color=e50914&size=256&bold=true`,
      isDirector: false
    }));

    const result = { cast, directors };
    setCache(cacheKey, result);
    return result;
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
module.exports.TmdbService = TmdbService;
module.exports.ratingReference = ratingReference;
