const kkphimService = require('./kkphimService');
const vicdnService = require('./vicdnService');
const nguoncService = require('./nguoncService');

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

const tmdbService = require('./tmdbService');

class PersonService {
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
   * Get detailed person info + real filmography list from TMDb and IMDb
   */
  async getPersonDetail(query, type = 'actor') {
    const rawName = (query || '').trim();
    if (!rawName) throw new Error('Tên diễn viên / đạo diễn không hợp lệ');

    const displayName = rawName.includes('-')
      ? rawName.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
      : rawName;

    // 1. Primary source: Fetch from TMDb (accurate credits, real photos, bios, stats)
    try {
      const tmdbData = await tmdbService.getPersonDetail(displayName);
      if (tmdbData && tmdbData.person) {
        // Person found on TMDb!
        // Return enriched person info & movies
        return {
          person: tmdbData.person,
          movies: tmdbData.movies || []
        };
      }
    } catch (e) {
      console.warn(`[PersonService] TMDb fetch failed for ${displayName}, falling back to KKPhim:`, e.message);
    }

    // 2. Secondary fallback: Search KKPhim if not found on TMDb
    let movies = [];
    try {
      const searchRes = await kkphimService.searchMovies(displayName, 1, 30);
      if (searchRes && searchRes.items) {
        movies = searchRes.items;
      }
    } catch (e) {
      console.warn(`[PersonService] KKPhim search failed for ${displayName}:`, e.message);
    }

    let nationality = 'Quốc tế';
    let prominentGenres = new Set();
    movies.forEach(m => {
      if (m.country && m.country.length) {
        m.country.forEach(c => {
          if (c.name && nationality === 'Quốc tế') nationality = c.name;
        });
      }
      if (m.category && m.category.length) {
        m.category.forEach(cat => prominentGenres.add(cat.name));
      }
    });

    const isDirector = type === 'director';
    const roleTitle = isDirector ? 'Đạo diễn điện ảnh' : 'Diễn viên điện ảnh';

    const person = {
      name: displayName,
      slug: slugify(displayName),
      role: roleTitle,
      type: isDirector ? 'director' : 'actor',
      avatar: this.getAvatar(displayName),
      nationality,
      genres: Array.from(prominentGenres).slice(0, 4),
      movies_count: movies.length,
      biography: `${displayName} là một ${roleTitle.toLowerCase()} nổi tiếng, được khán giả yêu thích qua nhiều tác phẩm điện ảnh và truyền hình xuất sắc chất lượng cao tại TTPHIM.`
    };

    return {
      person,
      movies
    };
  }
}

module.exports = new PersonService();

