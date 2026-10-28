'use strict';

const kkphimService = require('./kkphimService');

// In-memory cache for season lookups (1 hour TTL)
const seasonsCache = new Map();
const CACHE_TTL = 3600 * 1000;

function normalizeName(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Detect if a movie is Anime/Hoạt hình or Donghua
function isAnime(movie) {
  if (!movie) return false;
  const name = movie.name || '';
  const origin = movie.origin_name || '';

  // Explicitly Live-Action / Người đóng is NEVER anime
  if (/(?:live action|người đóng|bản người đóng)/i.test(name) ||
      /(?:live action)/i.test(origin)) {
    return false;
  }

  // Explicit type from provider
  if (movie.type === 'hoathinh') return true;

  // Category tags
  if (Array.isArray(movie.category)) {
    for (const c of movie.category) {
      const slug = String(c?.slug || '').toLowerCase();
      const catName = String(c?.name || '').toLowerCase();
      if (slug === 'hoat-hinh' || /hoạt hình|anime|manga/.test(catName)) {
        return true;
      }
    }
  }

  // Japanese anime with franchise keywords
  const isJapan = Array.isArray(movie.country) && movie.country.some(c => c?.slug === 'nhat-ban' || /nhật bản|japan/i.test(c?.name || ''));
  if (isJapan && !/(?:truyền hình|phim bộ nhật|live action)/i.test(name)) {
    if (/demon slayer|kimetsu|jujutsu|shingeki|titan|naruto|piece|conan|dragon ball|hero academia|bleach|doraemon|shin-chan/i.test(origin + ' ' + name)) {
      return true;
    }
  }

  // Chinese 3D Donghua / Animation indicators
  if (/bản đặc biệt|hoạt hình|donghua|3d animation/i.test(name)) {
    return true;
  }

  return false;
}

// Check if a movie is explicitly a Live-Action adaptation
function isLiveAction(name) {
  return /(?:live action|người đóng|bản người đóng)/i.test(name || '');
}

// Distinguish multi-episode TV series vs standalone single movies
function isSeries(movie) {
  if (!movie) return false;
  if (movie.type === 'series' || movie.type === 'tvshows') return true;
  if (movie.type === 'single') return false;

  const ep = String(movie.episode_current || movie.episode_total || '').toLowerCase();
  if (ep === 'full') return false;
  if (/tập\s*\d+|hoàn tất\s*\(\d+\/\d+\)/i.test(ep)) return true;
  return false;
}

// Compare country origin to prevent cross-country false positives
function hasCompatibleCountry(movieA, movieB) {
  const getSlugs = m => Array.isArray(m?.country)
    ? m.country.map(c => c?.slug).filter(s => s && s !== 'quoc-gia-khac')
    : [];
  const slugsA = getSlugs(movieA);
  const slugsB = getSlugs(movieB);
  if (!slugsA.length || !slugsB.length) return true;
  return slugsA.some(s => slugsB.includes(s));
}

// Extract base franchise title without season suffixes (preserves "Live Action" modifier)
function extractFranchiseName(name) {
  if (!name) return '';
  return String(name)
    .replace(/\s*\(\s*(?:phần|mùa|season|ss|part|bản)\s*[\d\w\s-–]+\).*$/gi, '')
    .replace(/\s*[-–:]?\s*(?:phần|mùa|season|ss|part)\s*\d+.*$/gi, '')
    .replace(/\s*[-–:]?\s*bản đặc biệt.*$/gi, '')
    .replace(/\s+\d+\s*[:–-].*$/gi, '')
    .replace(/\s+\d+$/gi, '')
    .trim();
}

function hasSeasonIndicator(name) {
  if (!name) return false;
  return /(?:phần|mùa|season|ss|part)\s*\d+/i.test(name) ||
         /bản đặc biệt/i.test(name) ||
         /\s+\d+(?:\s*[:–-]|(?:\s+\(.*?\))?$)/.test(name) ||
         /\b(?:phần|mùa|season)\s*(?:đầu|cuối|mới)\b/i.test(name);
}

function extractSeasonNumber(name) {
  if (!name) return 1;
  const match = name.match(/(?:phần|mùa|season|ss|part)\s*(\d+)/i);
  if (match) return parseInt(match[1], 10);

  if (/bản đặc biệt/i.test(name)) {
    return 100;
  }

  const movieNum = name.match(/\s+(\d+)(?:\s*[:–-]|(?:\s+\(.*?\))?$)/);
  if (movieNum) {
    const n = parseInt(movieNum[1], 10);
    if (n < 1900 || n > 2100) return n;
  }

  return 1;
}

// Format clean season display label for the dropdown
function formatSeasonLabel(item) {
  const num = item.season_number;
  const yearText = item.year ? ` (${item.year})` : '';
  if (/bản đặc biệt/i.test(item.name)) {
    return `${item.name}${yearText}`;
  }
  if (num && num < 100) {
    const subMatch = item.name.match(/(?:phần|mùa|season|ss|part)\s*\d+[:\s-]+([^)]+)/i) ||
                     item.name.match(/\s+\d+\s*[:–-]\s*([^)]+)/i);
    if (subMatch && subMatch[1]) {
      const cleanSub = subMatch[1].replace(/\s*\(\s*(?:phần|mùa|season|ss|part)\s*\d+.*?\)/gi, '').trim();
      if (cleanSub.length > 1) {
        return `Phần ${num}: ${cleanSub}${yearText}`;
      }
    }
    return `Phần ${num}${yearText}`;
  }
  return `${item.name}${yearText}`;
}

async function getFranchiseSeasons(slug) {
  if (!slug) return [];

  const now = Date.now();
  const cached = seasonsCache.get(slug);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const detail = await kkphimService.getMovieDetail(slug);
    if (!detail?.movie) return [];
    const currentMovie = detail.movie;

    const baseName = extractFranchiseName(currentMovie.name);
    if (!baseName || baseName.length < 3) return [];

    const currentIsAnime = isAnime(currentMovie);
    const currentIsLiveAction = isLiveAction(currentMovie.name);
    const currentIsSeries = isSeries(currentMovie);

    const baseSlug = normalizeName(baseName).replace(/\s+/g, '-');

    // Search base name, base name + ' Phần', and unaccented base slug with limit 60
    const [res1, res2, res3] = await Promise.all([
      kkphimService.searchMovies(baseName, 1, 60).catch(() => ({ items: [] })),
      kkphimService.searchMovies(`${baseName} Phần`, 1, 60).catch(() => ({ items: [] })),
      kkphimService.searchMovies(baseSlug, 1, 60).catch(() => ({ items: [] }))
    ]);

    const rawItems = [...(res1?.items || []), ...(res2?.items || []), ...(res3?.items || [])];
    const items = [];
    const itemSeen = new Set();
    for (const it of rawItems) {
      if (!itemSeen.has(it.slug)) {
        itemSeen.add(it.slug);
        items.push(it);
      }
    }

    if (!items.length) return [];

    const baseNorm = normalizeName(baseName);
    const seenSlugs = new Set();
    const matched = [];

    // Always include current movie
    matched.push({
      name: currentMovie.name,
      slug: currentMovie.slug,
      year: currentMovie.year || null,
      season_number: extractSeasonNumber(currentMovie.name),
      is_current: true
    });
    seenSlugs.add(currentMovie.slug);

    for (const item of items) {
      if (seenSlugs.has(item.slug)) continue;

      // 1. Medium Check: Live Action vs Anime
      const itemIsLiveAction = isLiveAction(item.name);
      const itemIsAnime = isAnime(item);

      if (currentIsLiveAction !== itemIsLiveAction) continue;
      if (currentIsAnime !== itemIsAnime) continue;

      // 2. Format Check: Series vs Single Movie
      const itemIsSeries = isSeries(item);
      if (currentIsSeries !== itemIsSeries) continue;

      // 3. Country Compatibility Check
      if (!hasCompatibleCountry(currentMovie, item)) continue;

      // 4. Franchise Name Match
      const itemBase = extractFranchiseName(item.name);
      const itemBaseNorm = normalizeName(itemBase);
      if (itemBaseNorm !== baseNorm) continue;

      // 5. Season Qualifier Check
      const itemHasSeason = hasSeasonIndicator(item.name);
      const itemIsPureBase = normalizeName(item.name) === itemBaseNorm;
      if (!itemHasSeason && !itemIsPureBase) continue;

      seenSlugs.add(item.slug);
      matched.push({
        name: item.name,
        slug: item.slug,
        year: item.year || null,
        season_number: extractSeasonNumber(item.name),
        is_current: false
      });
    }

    // Must have at least one explicit season indicator or distinct season numbers
    const anyExplicitSeason = matched.some(m => hasSeasonIndicator(m.name) || m.season_number > 1);
    if (!anyExplicitSeason || matched.length <= 1) {
      seasonsCache.set(slug, { timestamp: now, data: [] });
      return [];
    }

    // Sort by season number, then year
    matched.sort((a, b) => {
      if (a.season_number !== b.season_number) return a.season_number - b.season_number;
      return (a.year || 0) - (b.year || 0);
    });

    // Add clean labels
    matched.forEach(item => {
      item.label = formatSeasonLabel(item);
    });

    seasonsCache.set(slug, { timestamp: now, data: matched });
    return matched;
  } catch (err) {
    console.warn('[SeasonService] Error finding seasons for', slug, err.message);
    return [];
  }
}

module.exports = {
  isAnime,
  isLiveAction,
  isSeries,
  hasCompatibleCountry,
  hasSeasonIndicator,
  extractFranchiseName,
  extractSeasonNumber,
  formatSeasonLabel,
  getFranchiseSeasons
};
