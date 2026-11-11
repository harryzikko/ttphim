const config = require('../config');

const DEFAULT_GENRES = [
  'Tổng tài', 'Cổ đại', 'Tâm lý', 'Ngôn tình', 'Khoa học viễn tưởng',
  'Lồng tiếng', 'Hài hước', 'Nữ cường', 'Huyền huyễn', 'Tội phạm',
  'Xuyên không', 'Thanh xuân', 'Hành động', 'Kinh dị', 'Gia đình',
  'Bí ẩn', 'Dân quốc', 'Trọng sinh', 'Cưới trước yêu sau', 'Hành động ly kỳ',
  'Hiện đại', 'Báo thù', 'Thể thao', 'Em bé', 'Ngược luyến',
  'Sủng ngọt', 'Hiểu lầm', 'Hào môn', 'Tìm người thân', 'Quân phiệt',
  'Vươn lên từ số không', 'Tái hợp', 'Sự trở lại', 'Tâm lý tình cảm',
  'Trưởng thành', 'Khác'
];

const ALLOWED_SUBTITLE_HOSTS = new Set([
  'shortflix.notthingp.workers.dev',
  'shortlink.alokillgtv.workers.dev'
]);

const SAFE_SLUG_RE = /^[a-zA-Z0-9._-]{1,140}$/;

function normalizeSlug(raw) {
  let clean = String(raw || '').trim();
  if (clean.startsWith('shortflix:')) clean = clean.slice('shortflix:'.length);
  if (!SAFE_SLUG_RE.test(clean) || clean.includes('..')) return null;
  return clean;
}

function isAllowedUpstreamUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    if (ALLOWED_SUBTITLE_HOSTS.has(host)) return true;
    return host === 'nsstorage.space' || host.endsWith('.nsstorage.space');
  } catch {
    return false;
  }
}

function normalizeSubtitleToVtt(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
  if (!raw) return 'WEBVTT\n\n';
  if (/^WEBVTT\b/i.test(raw)) return `${raw}\n`;
  // Convert SRT comma timestamps (00:00:01,500) to WebVTT dots (00:00:01.500)
  const converted = raw.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return `WEBVTT\n\n${converted}\n`;
}

function buildFallbackPosterUrl(posterUrl, slug = '') {
  const raw = String(posterUrl || '').trim();
  if (!raw || !isAllowedUpstreamUrl(raw)) return '';
  try {
    const parsed = new URL(raw);
    const match = parsed.pathname.match(/^\/([^/]+)\/((?:[a-z]{2}(?:_[A-Z]{2})?)\/.+)$/);
    if (!match) return '';
    const firstSeg = match[1];
    const cleanSlug = normalizeSlug(slug);
    if (cleanSlug && firstSeg !== cleanSlug) return '';
    parsed.pathname = `/${firstSeg}/1/${match[2]}`;
    return parsed.href;
  } catch {
    return '';
  }
}

function resolveHlsUri(rawUri, baseUrl) {
  const trimmed = String(rawUri || '').trim();
  if (!trimmed) return '';
  if (!baseUrl) return trimmed;
  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return trimmed;
  }
}

function normalizeHlsPlaylist(text, baseUrl = '') {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  let maxVersion = null;
  let maxTargetDuration = null;
  let mediaSequence = null;
  let playlistType = null;
  let hasIndependentSegments = false;
  let hasEndList = false;
  const bodyLines = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === '#EXTM3U') continue;

    let match;
    if ((match = line.match(/^#EXT-X-VERSION:(\d+)/i))) {
      const v = Number.parseInt(match[1], 10);
      if (Number.isFinite(v)) maxVersion = maxVersion === null ? v : Math.max(maxVersion, v);
      continue;
    }
    if ((match = line.match(/^#EXT-X-TARGETDURATION:(\d+)/i))) {
      const td = Number.parseInt(match[1], 10);
      if (Number.isFinite(td)) maxTargetDuration = maxTargetDuration === null ? td : Math.max(maxTargetDuration, td);
      continue;
    }
    if ((match = line.match(/^#EXT-X-MEDIA-SEQUENCE:(\d+)/i))) {
      if (mediaSequence === null) mediaSequence = Number.parseInt(match[1], 10);
      continue;
    }
    if ((match = line.match(/^#EXT-X-PLAYLIST-TYPE:(.+)$/i))) {
      if (playlistType === null) playlistType = match[1].trim();
      continue;
    }
    if (/^#EXT-X-INDEPENDENT-SEGMENTS\b/i.test(line)) {
      hasIndependentSegments = true;
      continue;
    }
    if (/^#EXT-X-ENDLIST\b/i.test(line)) {
      hasEndList = true;
      continue;
    }
    if (/^#EXT-X-DISCONTINUITY\b/i.test(line)) {
      if (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] !== '#EXT-X-DISCONTINUITY') {
        bodyLines.push('#EXT-X-DISCONTINUITY');
      }
      continue;
    }
    if (line.startsWith('#')) {
      if (/^#EXT-X-(?:KEY|MAP):/i.test(line) && baseUrl) {
        bodyLines.push(line.replace(/URI="([^"]+)"/i, (_, u) => `URI="${resolveHlsUri(u, baseUrl)}"`));
      } else {
        bodyLines.push(line);
      }
      continue;
    }

    bodyLines.push(resolveHlsUri(line, baseUrl));
  }

  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] === '#EXT-X-DISCONTINUITY') {
    bodyLines.pop();
  }

  const out = ['#EXTM3U'];
  if (maxVersion !== null) out.push(`#EXT-X-VERSION:${maxVersion}`);
  if (maxTargetDuration !== null) out.push(`#EXT-X-TARGETDURATION:${maxTargetDuration}`);
  if (mediaSequence !== null) out.push(`#EXT-X-MEDIA-SEQUENCE:${mediaSequence}`);
  if (playlistType !== null) out.push(`#EXT-X-PLAYLIST-TYPE:${playlistType}`);
  if (hasIndependentSegments) out.push('#EXT-X-INDEPENDENT-SEGMENTS');
  out.push(...bodyLines);
  if (hasEndList) out.push('#EXT-X-ENDLIST');
  return `${out.join('\n')}\n`;
}

class ShortflixService {
  constructor({
    baseUrl = () => config.SHORTFLIX_BASE_URL,
    fetcher = globalThis.fetch
  } = {}) {
    this.getBaseUrl = typeof baseUrl === 'function' ? baseUrl : () => String(baseUrl || '');
    this.fetcher = fetcher;
    this.cache = new Map();
  }

  getCached(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  setCached(key, value, ttlMs) {
    if (this.cache.size >= 250) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  async fetchJson(relativePath, ttlMs = 300000) {
    const cacheKey = `json:${relativePath}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const root = String(this.getBaseUrl() || '').replace(/\/+$/, '');
    if (!root) throw Object.assign(new Error('ShortFlix URL not configured'), { status: 503 });

    const res = await this.fetcher(`${root}${relativePath}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'CineViet/1.0 (+https://cineviet.live)'
      },
      signal: AbortSignal.timeout(12000)
    });

    if (!res.ok) {
      throw Object.assign(new Error(`ShortFlix upstream HTTP ${res.status}`), { status: res.status >= 500 ? 502 : res.status });
    }
    const data = await res.json();
    return this.setCached(cacheKey, data, ttlMs);
  }

  async getGenres() {
    try {
      const manifest = await this.fetchJson('/manifest.json', 3600000);
      const extra = manifest?.catalogs?.[0]?.extra || [];
      const genreExtra = extra.find(e => e?.name === 'genre' && Array.isArray(e.options));
      if (genreExtra && genreExtra.options.length > 0) {
        return genreExtra.options.map(v => String(v));
      }
    } catch {
      // Fall back safely to verified catalog genre list
    }
    return [...DEFAULT_GENRES];
  }

  async getCatalog({ page = 1, genre = '', keyword = '', limit = 24 } = {}) {
    const cleanPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const cleanLimit = Math.min(48, Math.max(6, Number.parseInt(limit, 10) || 24));
    const cleanGenre = String(genre || '').trim();
    const cleanKeyword = String(keyword || '').trim();

    const offsetGlobal = (cleanPage - 1) * cleanLimit;
    const batchSkip = Math.floor(offsetGlobal / 100) * 100;
    const localOffset = offsetGlobal - batchSkip;

    const extras = [];
    if (cleanKeyword) {
      extras.push(`search=${encodeURIComponent(cleanKeyword)}`);
    } else if (cleanGenre && cleanGenre !== 'all') {
      extras.push(`genre=${encodeURIComponent(cleanGenre)}`);
    }
    if (batchSkip > 0) {
      extras.push(`skip=${batchSkip}`);
    }

    const extraSegment = extras.length > 0 ? `/${extras.join('&')}` : '';
    const [genres, raw] = await Promise.all([
      this.getGenres(),
      this.fetchJson(`/catalog/series/shortflix${extraSegment}.json`, 300000)
    ]);

    const allMetas = Array.isArray(raw?.metas) ? raw.metas : [];
    const slice = allMetas.slice(localOffset, localOffset + cleanLimit);
    const items = slice
      .map(meta => {
        const slug = normalizeSlug(meta?.id);
        if (!slug) return null;
        const desc = String(meta?.description || '').trim();
        const epMatch = desc.match(/(\d{1,4})\s*tập/i);
        const posterUrl = String(meta?.poster || '').trim();
        return {
          id: `shortflix:${slug}`,
          slug,
          name: String(meta?.name || slug).trim(),
          poster_url: posterUrl,
          poster_fallback_url: buildFallbackPosterUrl(posterUrl, slug),
          description: desc,
          poster_shape: String(meta?.posterShape || 'poster'),
          episode_count_hint: epMatch ? Number.parseInt(epMatch[1], 10) : null
        };
      })
      .filter(Boolean);

    const hasMore = (localOffset + cleanLimit < allMetas.length) || allMetas.length >= 100;
    return {
      items,
      genres,
      pagination: {
        page: cleanPage,
        limit: cleanLimit,
        batchCount: allMetas.length,
        hasMore
      }
    };
  }

  async getDetail(rawSlug) {
    const slug = normalizeSlug(rawSlug);
    if (!slug) throw Object.assign(new Error('Mã phim ngắn không hợp lệ'), { status: 400 });

    const data = await this.fetchJson(`/meta/series/${encodeURIComponent(`shortflix:${slug}`)}.json`, 900000);
    const meta = data?.meta;
    if (!meta || !meta.id) {
      throw Object.assign(new Error('Không tìm thấy phim ngắn'), { status: 404 });
    }

    const rawVideos = Array.isArray(meta.videos) ? meta.videos : [];
    const episodes = rawVideos
      .map((v, idx) => {
        const epNum = Number.parseInt(v?.episode, 10) || (idx + 1);
        return {
          episode: epNum,
          video_id: String(v?.id || `shortflix:${slug}:${epNum}`),
          title: String(v?.title || `Tập ${epNum}`),
          thumbnail_url: String(v?.thumbnail || meta.poster || '').trim(),
          released: v?.released || null
        };
      })
      .sort((a, b) => a.episode - b.episode);

    const posterUrl = String(meta.poster || '').trim();
    const ep1Thumb = String(episodes[0]?.thumbnail_url || '').trim();
    const fallbackPoster = (ep1Thumb && ep1Thumb !== posterUrl)
      ? ep1Thumb
      : buildFallbackPosterUrl(posterUrl, slug);

    return {
      item: {
        id: `shortflix:${slug}`,
        slug,
        name: String(meta.name || slug).trim(),
        description: String(meta.description || '').trim(),
        poster_url: posterUrl,
        poster_fallback_url: fallbackPoster,
        background_url: String(meta.background || posterUrl).trim(),
        total_episodes: episodes.length
      },
      episodes
    };
  }

  async getStreams(rawSlug, episode = 1) {
    const slug = normalizeSlug(rawSlug);
    const ep = Math.max(1, Number.parseInt(episode, 10) || 1);
    if (!slug) throw Object.assign(new Error('Mã phim ngắn không hợp lệ'), { status: 400 });

    const videoId = `shortflix:${slug}:${ep}`;
    const data = await this.fetchJson(`/stream/series/${encodeURIComponent(videoId)}.json`, 300000);
    const rawStreams = Array.isArray(data?.streams) ? data.streams : [];

    const servers = rawStreams
      .filter(s => s && typeof s.url === 'string' && isAllowedUpstreamUrl(s.url))
      .map(s => {
        const rawName = String(s.name || 'Server').trim();
        const rawTitle = String(s.title || rawName).trim();
        const isFull = /full/i.test(rawName) || /full/i.test(rawTitle);
        const displayName = isFull ? 'Bản Full (Gộp tất cả tập)' : `Tập lẻ • Tập ${ep}`;

        const subs = (Array.isArray(s.subtitles) ? s.subtitles : [])
          .filter(sub => sub && typeof sub.url === 'string' && isAllowedUpstreamUrl(sub.url))
          .slice(0, 2)
          .map((sub, i) => ({
            id: String(sub.id || `sub-${i}`),
            lang: String(sub.lang || 'vi'),
            label: 'Tiếng Việt',
            proxy_url: `/api/shortflix/subtitle?url=${encodeURIComponent(sub.url)}`
          }));

        return {
          name: displayName,
          raw_title: rawTitle,
          is_full: isFull,
          url: isFull ? `/api/shortflix/playlist?url=${encodeURIComponent(s.url)}` : s.url,
          subtitles: subs
        };
      })
      // Put episode-by-episode first for quick short-drama playback, Full right beside it
      .sort((a, b) => Number(a.is_full) - Number(b.is_full));

    return {
      slug,
      episode: ep,
      servers
    };
  }

  async fetchSafeUpstreamText(rawUrl, { accept, maxBytes, ttlMs, cachePrefix, invalidMsg, errLabel }) {
    if (!isAllowedUpstreamUrl(rawUrl)) {
      throw Object.assign(new Error(invalidMsg), { status: 400 });
    }

    const cacheKey = `${cachePrefix}:${rawUrl}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const res = await this.fetcher(rawUrl, {
      redirect: 'error',
      headers: {
        Accept: accept,
        'User-Agent': 'CineViet/1.0 (+https://cineviet.live)'
      },
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) {
      throw Object.assign(new Error(`${errLabel} (HTTP ${res.status})`), { status: 502 });
    }

    const text = await res.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw Object.assign(new Error('Nội dung upstream vượt quá dung lượng cho phép'), { status: 413 });
    }

    return { cacheKey, text, ttlMs };
  }

  async fetchSubtitle(rawUrl) {
    const res = await this.fetchSafeUpstreamText(rawUrl, {
      accept: 'text/vtt, text/plain, */*',
      maxBytes: 1048576,
      ttlMs: 3600000,
      cachePrefix: 'sub',
      invalidMsg: 'URL phụ đề không thuộc nguồn được phép',
      errLabel: 'Không tải được phụ đề'
    });
    if (typeof res === 'string') return res;
    const normalized = normalizeSubtitleToVtt(res.text);
    return this.setCached(res.cacheKey, normalized, res.ttlMs);
  }

  async fetchPlaylist(rawUrl) {
    const res = await this.fetchSafeUpstreamText(rawUrl, {
      accept: 'application/vnd.apple.mpegurl, application/x-mpegurl, text/plain, */*',
      maxBytes: 5242880,
      ttlMs: 300000,
      cachePrefix: 'm3u8',
      invalidMsg: 'URL playlist không thuộc nguồn được phép',
      errLabel: 'Không tải được playlist phát'
    });
    if (typeof res === 'string') return res;
    const normalized = normalizeHlsPlaylist(res.text, rawUrl);
    return this.setCached(res.cacheKey, normalized, res.ttlMs);
  }
}

const instance = new ShortflixService();

module.exports = instance;
module.exports.ShortflixService = ShortflixService;
module.exports.normalizeSlug = normalizeSlug;
module.exports.isAllowedUpstreamUrl = isAllowedUpstreamUrl;
module.exports.normalizeSubtitleToVtt = normalizeSubtitleToVtt;
module.exports.buildFallbackPosterUrl = buildFallbackPosterUrl;
module.exports.normalizeHlsPlaylist = normalizeHlsPlaylist;
