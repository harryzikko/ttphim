const fs = require('fs');
const path = require('path');

function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (ch === '\r') {
        // ignore CR
      } else if (ch === '\n') {
        currentRow.push(currentField);
        currentField = '';
        if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
      } else {
        currentField += ch;
      }
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
      rows.push(currentRow);
    }
  }
  return rows;
}

function normalizeSlug(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

class ProgrammaticService {
  constructor() {
    this.entries = new Map();
    this.bySource = new Map();
    this.byGenreSlug = new Map();
    this.movieEntries = [];
    this.genreEntries = [];
    this.loaded = false;
    this.csvPath = null;
  }

  resolveCsvPath() {
    const candidates = [
      process.env.PROGRAMMATIC_CSV_PATH,
      path.resolve(__dirname, '../../cineviet-programmatic-plan.csv'),
      path.resolve(__dirname, '../cineviet-programmatic-plan.csv'),
      path.resolve(__dirname, '../../data/cineviet-programmatic-plan.csv'),
      path.resolve(__dirname, '../data/cineviet-programmatic-plan.csv')
    ].filter(Boolean);

    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return p;
      } catch (_) {}
    }
    return candidates[1];
  }

  load() {
    if (this.loaded) return this.entries;
    const resolved = this.resolveCsvPath();
    this.csvPath = resolved;

    if (!fs.existsSync(resolved)) {
      console.warn(`[ProgrammaticService] CSV file not found at ${resolved}`);
      this.loaded = true;
      return this.entries;
    }

    try {
      const content = fs.readFileSync(resolved, 'utf8');
      const rows = parseCSV(content);
      if (rows.length < 2) {
        this.loaded = true;
        return this.entries;
      }

      const headers = rows[0].map(h => h.trim().toLowerCase());
      const kindIdx = headers.indexOf('kind');
      const slugIdx = headers.indexOf('url_slug');
      const titleIdx = headers.indexOf('title');
      const h1Idx = headers.indexOf('h1');
      const descIdx = headers.indexOf('meta_description');
      const sourceIdx = headers.indexOf('source');

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const slug = (row[slugIdx] || '').trim();
        if (!slug) continue;

        const entry = {
          kind: (row[kindIdx] || '').trim(),
          url_slug: slug,
          title: (row[titleIdx] || '').trim(),
          h1: (row[h1Idx] || '').trim(),
          meta_description: (row[descIdx] || '').trim(),
          source: (row[sourceIdx] || '').trim()
        };

        this.entries.set(slug, entry);

        if (entry.source.startsWith('genre:')) {
          const gSlug = normalizeSlug(entry.source.replace(/^genre:/, ''));
          if (gSlug && gSlug !== 'object-object') {
            this.genreEntries.push(entry);
            if (!this.byGenreSlug.has(gSlug)) this.byGenreSlug.set(gSlug, []);
            this.byGenreSlug.get(gSlug).push(entry);
          }
        } else if (entry.source) {
          this.movieEntries.push(entry);
          if (!this.bySource.has(entry.source)) this.bySource.set(entry.source, []);
          this.bySource.get(entry.source).push(entry);
        }
      }
      this.loaded = true;
      console.log(`[ProgrammaticService] Loaded ${this.entries.size} programmatic routes from ${path.basename(resolved)}`);
    } catch (err) {
      console.error('[ProgrammaticService] Failed to parse CSV:', err.message);
      this.loaded = true;
    }

    return this.entries;
  }

  get(slug) {
    if (!this.loaded) this.load();
    return this.entries.get(slug) || null;
  }

  has(slug) {
    if (!this.loaded) this.load();
    return this.entries.has(slug);
  }

  count() {
    if (!this.loaded) this.load();
    return this.entries.size;
  }

  getAll() {
    if (!this.loaded) this.load();
    return Array.from(this.entries.values());
  }

  getBySource(sourceSlug) {
    if (!this.loaded) this.load();
    return this.bySource.get(sourceSlug) || [];
  }

  getInternalLinksForMovie(movie, relatedMovies = []) {
    if (!this.loaded) this.load();
    if (!movie || !movie.slug) return [];

    const result = [];
    const seen = new Set();
    const pushEntry = (e) => {
      if (!e || !e.url_slug || seen.has(e.url_slug)) return;
      seen.add(e.url_slug);
      result.push(e);
    };

    // 1. Direct programmatic variations of this movie (vietsub, tap-moi-nhat, phim-giong)
    for (const e of this.getBySource(movie.slug)) {
      pushEntry(e);
    }

    // 2. Matching top-genre entries for movie's categories
    const categories = Array.isArray(movie.category) ? movie.category : [];
    for (const cat of categories) {
      const catSlug = normalizeSlug(cat?.slug || cat?.name || cat);
      const matches = this.byGenreSlug.get(catSlug) || [];
      for (const m of matches) {
        if (result.length < 7) pushEntry(m);
      }
    }

    // 3. Programmatic variations for related movies
    if (Array.isArray(relatedMovies)) {
      for (const rel of relatedMovies) {
        if (!rel?.slug) continue;
        const relEntries = this.getBySource(rel.slug);
        if (relEntries.length > 0 && result.length < 11) {
          pushEntry(relEntries[0]);
        }
      }
    }

    // 4. Deterministic mesh across all 2,838 movie entries so no programmatic page is ever orphaned
    if (this.movieEntries.length > 0) {
      let hash = 0;
      const s = String(movie.slug);
      for (let i = 0; i < s.length; i++) {
        hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
      }
      const start = Math.abs(hash) % this.movieEntries.length;
      const step = 37;
      for (let k = 0; k < 12 && result.length < 14; k++) {
        const idx = (start + k * step) % this.movieEntries.length;
        pushEntry(this.movieEntries[idx]);
      }
    }

    return result;
  }

  getHomeInternalLinks() {
    if (!this.loaded) this.load();
    const result = [];
    const seen = new Set();
    const pushEntry = (e) => {
      if (!e || !e.url_slug || seen.has(e.url_slug)) return;
      seen.add(e.url_slug);
      result.push(e);
    };

    // Top priority genres
    const preferredGenres = [
      'hanh-dong', 'tinh-cam', 'co-trang', 'tam-ly', 'hinh-su',
      'hai-huoc', 'kinh-di', 'hoat-hinh', 'vien-tuong', 'bi-an',
      'chinh-kich', 'phieu-luu'
    ];
    for (const g of preferredGenres) {
      const list = this.byGenreSlug.get(g) || [];
      if (list[0]) pushEntry(list[0]);
    }
    for (let i = 0; i < this.movieEntries.length && result.length < 24; i += 237) {
      pushEntry(this.movieEntries[i]);
    }
    return result;
  }

  renderInternalLinksSection(links, heading = 'Từ Khóa & Tuyển Tập Phim Liên Quan') {
    if (!Array.isArray(links) || links.length === 0) return '';
    const pills = links.map(item => {
      const label = escapeHtml(item.h1 || item.title || item.url_slug);
      const href = `/${encodeURIComponent(item.url_slug)}`;
      return `<a href="${href}" class="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface text-xs font-medium transition-colors border border-white/5">${label}</a>`;
    }).join('\n      ');

    return `
<section id="programmatic-seo-links" aria-label="${escapeHtml(heading)}" class="w-full max-w-[1680px] mx-auto px-gutter-mobile sm:px-gutter pb-space-lg">
  <div class="rounded-xl bg-surface-container-low/70 border border-white/5 p-space-md space-y-2.5">
    <h2 class="text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
      <span class="material-symbols-outlined text-[16px] text-primary">tag</span>
      <span>${escapeHtml(heading)}</span>
    </h2>
    <div class="flex flex-wrap gap-2">
      ${pills}
    </div>
  </div>
</section>`;
  }
}

const programmaticService = new ProgrammaticService();
programmaticService.normalizeSlug = normalizeSlug;
module.exports = programmaticService;
