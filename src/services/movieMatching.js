'use strict';

/**
 * CineViet - Unified Movie Matching & Season Isolation Service
 * Prevents incorrect merging of cross-source movies, different seasons/parts,
 * mismatched formats (movies vs series), and unrelated movies sharing generic English titles.
 */

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

function extractBaseTitle(str) {
  if (!str) return '';
  return cleanTitle(str)
    .replace(/\s+\d{1,2}$/g, '')
    .trim();
}

function extractTmdbId(movie) {
  if (!movie) return null;
  const tmdb = movie.tmdb;
  if (tmdb) {
    if (typeof tmdb === 'object' && tmdb.id) return String(tmdb.id);
    if (typeof tmdb === 'string' || typeof tmdb === 'number') {
      const val = String(tmdb).trim();
      if (/^\d+$/.test(val) && Number(val) > 0) return val;
    }
  }
  if (movie.tmdb_id) return String(movie.tmdb_id);
  return null;
}

function extractSeasonIdentifier(item) {
  if (!item) return 'season_none';
  const text = `${item.slug || ''} ${item.name || ''} ${item.origin_name || ''} ${item.original_name || ''} ${item.vname || ''} ${item.ename || ''}`;

  // 1. Explicit keyword match: Phần X, Season X, SS X, Part X
  const m = text.match(/(?:phần|mùa|season|ss|part)\s*(\d+)/i) ||
            text.match(/[-_](?:phan|season|ss|part)[-_](\d+)/i) ||
            text.match(/[-_]s(\d+)(?:[-_]|$)/i);
  if (m) return `season_${parseInt(m[1], 10)}`;

  // 2. Special edition
  const sp = text.match(/bản đặc biệt\s*(\d+)?/i) || text.match(/[-_]ban-dac-biet[-_]?(\d+)?/i);
  if (sp) return `special_${sp[1] || '1'}`;

  // 3. Trailing number (excluding 4-digit years 1900-2099)
  // e.g. "dau-pha-thuong-khung-5" or "Đấu Phá Thương Khung 5"
  const tailName = (item.name || item.vname || '').match(/\s+(\d{1,2})(?:\s*[:–-]|(?:\s+\(.*?\))?$)/);
  if (tailName) {
    const num = parseInt(tailName[1], 10);
    if (num >= 1 && num <= 30) return `season_${num}`;
  }
  const tailSlug = (item.slug || '').match(/[-_](\d{1,2})$/);
  if (tailSlug) {
    const num = parseInt(tailSlug[1], 10);
    if (num >= 1 && num <= 30) return `season_${num}`;
  }

  const explicitSeason = Number(item.season || item.tmdb?.season);
  if (Number.isInteger(explicitSeason) && explicitSeason >= 2) {
    return `season_${explicitSeason}`;
  }

  return 'season_none';
}

function isAnime(movie) {
  if (!movie) return false;
  const type = String(movie.type || '').toLowerCase();
  if (type === 'hoathinh') return true;
  const name = `${movie.name || ''} ${movie.origin_name || ''} ${movie.original_name || ''}`.toLowerCase();
  if (/(?:live action|người đóng|bản người đóng)/i.test(name)) return false;
  if (/donghua|anime|hoạt hình|manga/i.test(name)) return true;
  if (Array.isArray(movie.category)) {
    return movie.category.some(c => c?.slug === 'hoat-hinh' || /hoạt hình|anime/i.test(c?.name || ''));
  }
  return false;
}

function isSeriesFormat(movie) {
  if (!movie) return false;
  const type = String(movie.type || '').toLowerCase();
  if (type === 'series' || type === 'tvshows') return true;
  if (type === 'single') return false;

  const epCur = String(movie.episode_current || movie.current_episode || '').toLowerCase();
  if (epCur === 'full') return false;
  if (/tập\s*\d+|hoàn tất\s*\(\d+\/\d+\)/i.test(epCur)) return true;

  const total = parseInt(movie.total_episodes || movie.episode_total, 10);
  if (Number.isFinite(total) && total > 1) return true;

  return false;
}

function isSingleFormat(movie) {
  if (!movie) return false;
  const type = String(movie.type || '').toLowerCase();
  if (type === 'single') return true;
  const epCur = String(movie.episode_current || movie.current_episode || '').toLowerCase();
  if (epCur === 'full') return true;
  const total = parseInt(movie.total_episodes || movie.episode_total, 10);
  if (total === 1) return true;
  return false;
}

function isCompatibleMovie(target, candidate) {
  if (!target || !candidate) return false;

  // 1. Medium check: Anime vs Non-Anime
  const targetAnime = isAnime(target);
  const candidateAnime = isAnime(candidate);
  if (targetAnime !== candidateAnime) return false;

  // 2. Format check: Multi-episode Series vs Single movie
  const targetSeries = isSeriesFormat(target);
  const candidateSeries = isSeriesFormat(candidate);
  const targetSingle = isSingleFormat(target);
  const candidateSingle = isSingleFormat(candidate);

  // If one is clearly series and the other is clearly single -> reject!
  if (targetSeries && candidateSingle && !candidateSeries) return false;
  if (targetSingle && candidateSeries && !targetSeries) return false;

  // 3. Season Isolation: Different numbered seasons are never the same movie
  const seasonTarget = extractSeasonIdentifier(target);
  const seasonCandidate = extractSeasonIdentifier(candidate);
  if (seasonTarget !== seasonCandidate) {
    const isSeason1Candidate = (seasonTarget === 'season_1' && seasonCandidate === 'season_none') ||
                               (seasonTarget === 'season_none' && seasonCandidate === 'season_1');
    if (!isSeason1Candidate) return false;
  }

  // 4. Year check: If both have valid years (> 1900), cannot differ by more than 1 year
  const yearTarget = parseInt(target.year, 10) || 0;
  const yearCandidate = parseInt(candidate.year, 10) || 0;
  if (yearTarget > 1900 && yearCandidate > 1900 && Math.abs(yearTarget - yearCandidate) > 1) {
    return false;
  }

  // 5. Episode count sanity: if target has many episodes (> 10) but candidate has 1 episode titled 'Full'
  const targetTotal = parseInt(target.episode_total || target.total_episodes, 10) ||
                      (Array.isArray(target.episodes) && target.episodes[0]?.server_data?.length) || 0;
  const candidateTotal = parseInt(candidate.total_episodes || candidate.episode_total, 10) || 0;
  if (targetTotal > 10 && candidateTotal === 1 && String(candidate.current_episode || '').toLowerCase() === 'full') {
    return false;
  }

  // 6. Identity verification
  // TMDB ID match
  const tmdbTarget = extractTmdbId(target);
  const tmdbCandidate = extractTmdbId(candidate);
  if (tmdbTarget && tmdbCandidate && tmdbTarget === tmdbCandidate) {
    return true;
  }

  // Direct clean slug match
  const cleanTargetSlug = (target.slug || '').replace(/^(?:nc|tv|movie)-/, '');
  const cleanCandidateSlug = (candidate.slug || '').replace(/^(?:nc|tv|movie)-/, '');
  if (cleanTargetSlug && cleanCandidateSlug && cleanTargetSlug === cleanCandidateSlug) {
    return true;
  }

  // Clean title checks
  const normNameT = removeAccents(cleanTitle(target.name || target.vname));
  const normNameC = removeAccents(cleanTitle(candidate.name || candidate.vname));
  const normOriginT = removeAccents(cleanTitle(target.origin_name || target.original_name || target.ename));
  const normOriginC = removeAccents(cleanTitle(candidate.origin_name || candidate.original_name || candidate.ename));

  // If Vietnamese names match
  if (normNameT && normNameC && normNameT === normNameC) {
    return true;
  }

  // Base franchise titles match when seasons are verified compatible
  const baseNameT = removeAccents(extractBaseTitle(target.name || target.vname));
  const baseNameC = removeAccents(extractBaseTitle(candidate.name || candidate.vname));
  if (baseNameT && baseNameC && baseNameT === baseNameC) {
    return true;
  }

  // If Origin names match
  if (normOriginT && normOriginC && normOriginT === normOriginC) {
    // English origin names are frequently duplicated across unrelated movies (e.g. "Running Man", "Hero", "Cinderella").
    // Must satisfy at least ONE of:
    // a) Years match within 1 year AND formats match
    if (yearTarget > 1900 && yearCandidate > 1900 && Math.abs(yearTarget - yearCandidate) <= 1) {
      return true;
    }
    // b) Vietnamese names are compatible (substring or overlap)
    if (normNameT && normNameC && (normNameT.includes(normNameC) || normNameC.includes(normNameT))) {
      return true;
    }
    return false;
  }

  // Clean slug normalized text match
  if (cleanTargetSlug && cleanCandidateSlug) {
    const slugT = removeAccents(cleanTargetSlug.replace(/-\d{4}$/, '').replace(/-/g, ' '));
    const slugC = removeAccents(cleanCandidateSlug.replace(/-\d{4}$/, '').replace(/-/g, ' '));
    if (slugT && slugC && slugT === slugC) {
      if (yearTarget > 1900 && yearCandidate > 1900 && Math.abs(yearTarget - yearCandidate) <= 1) {
        return true;
      }
    }
  }

  return false;
}

module.exports = {
  removeAccents,
  cleanTitle,
  extractBaseTitle,
  extractTmdbId,
  extractSeasonIdentifier,
  isAnime,
  isSeriesFormat,
  isSingleFormat,
  isCompatibleMovie
};
