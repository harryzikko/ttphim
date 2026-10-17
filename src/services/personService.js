const kkphimService = require('./kkphimService');
const vicdnService = require('./vicdnService');
const nguoncService = require('./nguoncService');
const tmdbService = require('./tmdbService');

function slugify(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cleanWords(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function jaccard(s1, s2) {
  const set1 = new Set(cleanWords(s1));
  const set2 = new Set(cleanWords(s2));
  if (!set1.size || !set2.size) return 0;
  let inter = 0;
  for (const w of set1) {
    if (set2.has(w)) inter++;
  }
  const union = new Set([...set1, ...set2]).size;
  return inter / union;
}

function normTitle(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9]/g, '');
}

function isMovieMatch(tmdbCredit, item) {
  if (!item || !item.name || !tmdbCredit) return false;
  const creditTitle = tmdbCredit.title || tmdbCredit.name || '';
  const creditOrig = tmdbCredit.original_title || tmdbCredit.original_name || '';
  const normTmdbV = normTitle(creditTitle);
  const normKkV = normTitle(item.name);
  const normTmdbE = normTitle(creditOrig);
  const normKkE = normTitle(item.origin_name);

  const creditDate = tmdbCredit.release_date || tmdbCredit.first_air_date || '';
  const tmdbYear = creditDate ? parseInt(creditDate.split('-')[0], 10) : 0;
  const itemYear = parseInt(item.year, 10) || 0;
  const yearDiff = (tmdbYear && itemYear) ? Math.abs(tmdbYear - itemYear) : 0;

  // 1. Exact Vietnamese or English normalized match
  if (normTmdbV && normKkV && normTmdbV === normKkV) return true;
  if (normTmdbE && normKkE && normTmdbE === normKkE) return true;

  // 2. Substring match with year check
  if (normTmdbV && normKkV && (normKkV.includes(normTmdbV) || normTmdbV.includes(normKkV))) {
    if (!tmdbYear || !itemYear || yearDiff <= 2) return true;
  }
  if (normTmdbE && normKkE && (normKkE.includes(normTmdbE) || normTmdbE.includes(normKkE))) {
    if (!tmdbYear || !itemYear || yearDiff <= 2) return true;
  }

  // 3. Jaccard word similarity (handling slight numbering or subtitle variants)
  const vSim = jaccard(creditTitle, item.name);
  const eSim = jaccard(creditOrig, item.origin_name);
  if (vSim >= 0.7 || eSim >= 0.7) {
    if (!tmdbYear || !itemYear || yearDiff <= 2) return true;
  }

  return false;
}

// Curated high-res portraits for prominent Asian and Western stars
const FAMOUS_PORTRAITS = {
  'chan-tu-dan': 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&auto=format&fit=crop&q=80',
  'donnie-yen': 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&auto=format&fit=crop&q=80',
  'co-thien-lac': 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80',
  'louis-koo': 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80',
  'luu-duc-hoa': 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&auto=format&fit=crop&q=80',
  'andy-lau': 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&auto=format&fit=crop&q=80',
  'chau-tinh-tri': 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&auto=format&fit=crop&q=80',
  'stephen-chow': 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&auto=format&fit=crop&q=80',
  'luong-trieu-vy': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80',
  'tony-leung': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80',
  'thanh-long': 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
  'jackie-chan': 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
  'ly-lien-kiet': 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&auto=format&fit=crop&q=80',
  'jet-li': 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&auto=format&fit=crop&q=80',
  'ngo-kinh': 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=400&auto=format&fit=crop&q=80',
  'wu-jing': 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=400&auto=format&fit=crop&q=80',
  'tom-cruise': 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&auto=format&fit=crop&q=80',
  'keanu-reeves': 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=400&auto=format&fit=crop&q=80',
  'christopher-nolan': 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=400&auto=format&fit=crop&q=80'
};

class PersonService {
  constructor() {
    this.cache = new Map();
    this.CACHE_TTL = 60 * 60 * 1000; // 1 hour
  }

  /**
   * Deterministic avatar for any person name with TMDb caching
   */
  getAvatar(name) {
    if (!name) return 'https://ui-avatars.com/api/?name=Actor&background=1d1f29&color=fff&size=256';
    const slug = slugify(name);
    if (FAMOUS_PORTRAITS[slug]) {
      return FAMOUS_PORTRAITS[slug];
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=e50914&color=ffffff&size=256&bold=true&font-size=0.45`;
  }

  /**
   * Get detailed person info + real filmography list from TMDb and KKPhim
   * Supports query object { slug, id, name, type } or query string
   */
  async getPersonDetail(params, fallbackType = 'actor') {
    let slug = '';
    let id = '';
    let name = '';
    let type = fallbackType;

    if (typeof params === 'string') {
      const trimmed = params.trim();
      if (/^\d+$/.test(trimmed)) {
        id = trimmed;
      } else if (trimmed.includes('-')) {
        slug = trimmed;
        name = trimmed.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
      } else {
        name = trimmed;
        slug = slugify(trimmed);
      }
    } else if (params && typeof params === 'object') {
      slug = params.slug || '';
      id = params.id ? String(params.id).trim() : '';
      name = params.name || '';
      type = params.type || fallbackType;
      if (!name && slug) {
        name = slug.includes('-')
          ? slug.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
          : slug;
      }
      if (!slug && name) {
        slug = slugify(name);
      }
    }

    const searchKey = id || name || slug;
    if (!searchKey) throw new Error('Tên diễn viên / đạo diễn không hợp lệ');

    const personSlugKey = slug || slugify(name) || id;
    const cacheKey = `person_service_${id || 'noid'}_${personSlugKey}_${type}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expires) {
      return cached.data;
    }

    const isDirector = type === 'director';
    const roleTitle = isDirector ? 'Đạo diễn điện ảnh' : 'Diễn viên điện ảnh';

    // 1. Primary source: Fetch from TMDb (accurate credits, real photos, bios, stats)
    let tmdbData = null;
    try {
      tmdbData = await tmdbService.getPersonDetail(name || slug, { id, name, type });
    } catch (e) {
      console.warn(`[PersonService] TMDb fetch failed for ${name || slug}:`, e.message);
    }

    let person = null;
    let movies = [];

    if (tmdbData && tmdbData.person) {
      person = {
        ...tmdbData.person,
        bio: tmdbData.person.biography, // compatibility alias
        role: isDirector ? 'Đạo diễn điện ảnh' : 'Diễn viên điện ảnh',
        type: isDirector ? 'director' : 'actor'
      };

      // Match TMDb credits against CineViet / KKPhim / ViCDN / NguonC
      const rawCredits = tmdbData.rawCredits || [];
      const candidates = rawCredits.slice(0, 30);
      const seenSlugs = new Set();

      const searchTasks = candidates.map(async (m) => {
        const creditTitle = m.title || m.name || '';
        const creditOrig = m.original_title || m.original_name || '';
        const creditDate = m.release_date || m.first_air_date || '';
        const year = creditDate ? parseInt(creditDate.split('-')[0], 10) : 2024;

        // 1. Direct match with ViCDN memory index by TMDb ID (zero network latency)
        if (m.id) {
          const vicdnHit = vicdnService.moviesByTmdb.get(String(m.id));
          if (vicdnHit && !seenSlugs.has(vicdnHit.slug)) {
            seenSlugs.add(vicdnHit.slug);
            return {
              id: vicdnHit.slug,
              tmdb_id: m.id,
              name: vicdnHit.vname || vicdnHit.ename,
              origin_name: vicdnHit.ename || vicdnHit.vname,
              character: m.character || (isDirector ? 'Đạo diễn' : 'Diễn viên'),
              poster_url: vicdnHit.poster ? `https://image.tmdb.org/t/p/w342/${vicdnHit.poster}.jpg` : (m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : ''),
              thumb_url: vicdnHit.banner ? `https://image.tmdb.org/t/p/w780/${vicdnHit.banner}.jpg` : (m.backdrop_path ? `https://image.tmdb.org/t/p/w780${m.backdrop_path}` : ''),
              year: vicdnHit.year || year,
              vote_average: m.vote_average ? Number(m.vote_average.toFixed(1)) : 8.5,
              quality: 'FHD Song Ngữ',
              has_song_ngu: true,
              episode_current: vicdnHit.stt ? `Tập ${vicdnHit.stt}` : 'Trọn Bộ',
              slug: vicdnHit.slug,
              is_playable: true
            };
          }
        }

        // 2. Search KKPhim with Vietnamese or Original Title
        const searchTerms = [creditTitle, creditOrig].filter(Boolean);
        for (const q of searchTerms) {
          try {
            const res = await kkphimService.fetchJson(`/v1/api/tim-kiem?keyword=${encodeURIComponent(q)}&limit=4`);
            const items = res?.data?.items || [];
            const hit = items.find(item => isMovieMatch(m, item));
            if (hit && !seenSlugs.has(hit.slug)) {
              seenSlugs.add(hit.slug);
              return {
                id: String(hit._id || hit.id || m.id),
                tmdb_id: m.id,
                name: hit.name,
                origin_name: hit.origin_name || creditOrig || hit.name,
                character: m.character || (isDirector ? 'Đạo diễn' : 'Diễn viên'),
                poster_url: kkphimService.resolveImageUrl(hit.poster_url || hit.thumb_url) || (m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : ''),
                thumb_url: kkphimService.resolveImageUrl(hit.thumb_url || hit.poster_url) || (m.poster_path ? `https://image.tmdb.org/t/p/w780${m.poster_path}` : ''),
                year: hit.year || year,
                vote_average: m.vote_average ? Number(m.vote_average.toFixed(1)) : 8.5,
                quality: hit.quality || 'FHD',
                has_song_ngu: Boolean(hit.has_song_ngu || vicdnService.hasBilingualMatch(hit)),
                episode_current: hit.episode_current || 'Trọn Bộ',
                slug: hit.slug,
                is_playable: true
              };
            }
          } catch (_) {}
        }

        return null;
      });

      const matchedList = (await Promise.all(searchTasks)).filter(Boolean);

      // 3. Enrich with any matching ViCDN titles by person name directly
      const nameLower = (name || slug).toLowerCase();
      const normSearch = normTitle(name || slug);
      for (const item of (vicdnService.allMovies || [])) {
        if (seenSlugs.has(item.slug)) continue;
        const castList = item.cast || [];
        const isCastMatch = castList.some(c => {
          const cLow = (c || '').toLowerCase();
          const cNorm = normTitle(c);
          return cLow.includes(nameLower) || (normSearch && cNorm.includes(normSearch));
        });
        if (isCastMatch) {
          seenSlugs.add(item.slug);
          matchedList.push({
            id: item.slug,
            tmdb_id: item.tmdb || null,
            name: item.vname || item.ename,
            origin_name: item.ename || item.vname,
            character: isDirector ? 'Đạo diễn' : 'Diễn viên',
            poster_url: item.poster ? `https://image.tmdb.org/t/p/w342/${item.poster}.jpg` : '',
            thumb_url: item.banner ? `https://image.tmdb.org/t/p/w780/${item.banner}.jpg` : '',
            year: item.year || 2024,
            vote_average: 8.8,
            quality: 'FHD Song Ngữ',
            has_song_ngu: true,
            episode_current: item.stt ? `Tập ${item.stt}` : 'Trọn Bộ',
            slug: item.slug,
            is_playable: true
          });
        }
      }

      movies = matchedList;
    }

    // 2. Secondary fallback if TMDb returned no person or no matched movies
    if (!person || movies.length === 0) {
      const searchDisplayName = name || slug;
      let fallbackMovies = [];

      // Check NguonC memory index for matching casts or director
      try {
        const nameLower = searchDisplayName.toLowerCase();
        const normSearch = normTitle(searchDisplayName);

        for (const item of nguoncService.moviesBySlug.values()) {
          const castLower = (item.casts || '').toLowerCase();
          const dirLower = (item.director || '').toLowerCase();
          const normCast = normTitle(item.casts);
          const normDir = normTitle(item.director);

          const matched = isDirector
            ? (dirLower.includes(nameLower) || (normSearch && normDir.includes(normSearch)))
            : (castLower.includes(nameLower) || (normSearch && normCast.includes(normSearch)));

          if (matched) {
            fallbackMovies.push({
              id: item.slug,
              name: item.name,
              origin_name: item.original_name || item.name,
              character: isDirector ? 'Đạo diễn' : 'Diễn viên',
              poster_url: item.poster_url || item.thumb_url,
              thumb_url: item.thumb_url || item.poster_url,
              year: parseInt(item.year, 10) || 2024,
              quality: item.quality || 'HD',
              episode_current: item.current_episode || 'Full',
              slug: item.slug,
              is_playable: true
            });
          }
        }
      } catch (e) {
        console.warn(`[PersonService] NguonC index search failed:`, e.message);
      }

      if (fallbackMovies.length > 0) {
        movies = fallbackMovies;
      }

      if (!person) {
        person = {
          id: id || null,
          name: searchDisplayName,
          slug: slugify(searchDisplayName),
          role: roleTitle,
          type: isDirector ? 'director' : 'actor',
          avatar: this.getAvatar(searchDisplayName),
          nationality: 'Quốc tế',
          genres: ['Điện ảnh'],
          movies_count: movies.length,
          biography: `${searchDisplayName} là một ${roleTitle.toLowerCase()} nổi tiếng, được khán giả yêu thích qua nhiều tác phẩm điện ảnh và truyền hình xuất sắc tại CineViet.`,
          bio: `${searchDisplayName} là một ${roleTitle.toLowerCase()} nổi tiếng, được khán giả yêu thích qua nhiều tác phẩm điện ảnh và truyền hình xuất sắc tại CineViet.`
        };
      }
    }

    // Populate metadata
    let nationality = person.place_of_birth || person.nationality || 'Quốc tế';
    const prominentGenres = new Set(person.genres || []);
    movies.forEach(m => {
      if (m.category && Array.isArray(m.category)) {
        m.category.forEach(cat => prominentGenres.add(cat.name || cat));
      }
    });

    person.nationality = nationality;
    person.genres = Array.from(prominentGenres).slice(0, 4);
    person.movies_count = movies.length;
    person.bio = person.biography || person.bio;

    const result = { person, movies };
    this.cache.set(cacheKey, { data: result, expires: Date.now() + this.CACHE_TTL });
    return result;
  }
}

module.exports = new PersonService();
