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

function cleanText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

const RESERVED_PREFIXES = new Set([
  'api', 'phim', 'xem-phim', 'kham-pha', 'short-phim', 'tai-ung-dung', 'downloads',
  'tai-app', 'app', 'ung-ho', 'cuu-tui-chen-com', 'gioi-thieu', 'tro-giup',
  'lien-he', 'dieu-khoan', 'quyen-rieng-tu', 'ban-quyen', 'danh-sach', 'tu-phim',
  'danh-sach-cua-toi', 'dang-nhap', 'dang-ky', 'auth', 'tai-khoan', 'admin',
  'quan-tri', 'dien-vien', 'dao-dien', 'nghe-si', 'tv-auth', 'tv-login',
  'tv-dang-nhap', 'phim-bo', 'phim-le', 'hoat-hinh', 'tv-shows', 'chieu-rap',
  'phim-chieu-rap', 'the-loai', 'quoc-gia', 'bang-xep-hang', 'mobile', 'tv', 'webos'
]);

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

  /**
   * Resolves either an exact CSV programmatic slug OR a dynamic pattern slug
   * (*-vietsub, *-thuyet-minh, *-tap-moi-nhat, phim-giong-*) for any of the 34,000+ movies.
   */
  resolveDynamic(slug) {
    if (!this.loaded) this.load();
    const clean = String(slug || '').trim().toLowerCase();
    if (!clean || RESERVED_PREFIXES.has(clean)) return null;

    if (this.entries.has(clean)) {
      return this.entries.get(clean);
    }

    let m = clean.match(/^([a-z0-9]+(?:-[a-z0-9]+)*)-tap-moi-nhat$/);
    if (m && !RESERVED_PREFIXES.has(m[1])) {
      return { kind: 'episodes', url_slug: clean, source: m[1], dynamic: true };
    }
    m = clean.match(/^([a-z0-9]+(?:-[a-z0-9]+)*)-thuyet-minh$/);
    if (m && !RESERVED_PREFIXES.has(m[1])) {
      return { kind: 'thuyet-minh', url_slug: clean, source: m[1], dynamic: true };
    }
    m = clean.match(/^([a-z0-9]+(?:-[a-z0-9]+)*)-vietsub$/);
    if (m && !RESERVED_PREFIXES.has(m[1])) {
      return { kind: 'vietsub', url_slug: clean, source: m[1], dynamic: true };
    }
    m = clean.match(/^phim-giong-([a-z0-9]+(?:-[a-z0-9]+)*)$/);
    if (m && !RESERVED_PREFIXES.has(m[1])) {
      return { kind: 'similar', url_slug: clean, source: m[1], dynamic: true };
    }
    return null;
  }

  hydrateEntryWithMovie(entry, movie) {
    if (!entry || !movie) return entry;
    if (!entry.dynamic && entry.title && entry.h1 && entry.meta_description) return entry;

    const name = cleanText(movie.name || entry.source);
    const year = movie.year ? ` (${cleanText(movie.year)})` : '';
    const cats = Array.isArray(movie.category)
      ? movie.category.map(c => cleanText(c?.name || c)).filter(Boolean).slice(0, 3).join(', ')
      : 'Đặc Sắc';

    if (entry.kind === 'episodes') {
      return {
        ...entry,
        title: `${name} Tập Mới Nhất Vietsub Full HD | CineViet`,
        h1: `${name} — Tập Mới Nhất`,
        meta_description: `${name} tập mới nhất vietsub, cập nhật lịch chiếu liên tục mỗi ngày. Xem phim ${name}${year} trọn bộ chất lượng cao tại CineViet.`
      };
    }
    if (entry.kind === 'thuyet-minh') {
      return {
        ...entry,
        title: `Xem ${name}${year} Thuyết Minh & Song Ngữ Full HD | CineViet`,
        h1: `${name} Thuyết Minh & Song Ngữ${year}`,
        meta_description: `Xem phim ${name}${year} bản thuyết minh, lồng tiếng và song ngữ Việt - Anh Full HD miễn phí tốc độ cao tại CineViet.`
      };
    }
    if (entry.kind === 'similar') {
      return {
        ...entry,
        title: `Phim Giống ${name} — Top Phim Cùng Thể Loại Hay Nhất | CineViet`,
        h1: `Phim Giống ${name}`,
        meta_description: `Tổng hợp phim giống ${name} hay nhất cùng thể loại ${cats}. Gợi ý những bộ phim tương tự bạn không nên bỏ lỡ tại CineViet.`
      };
    }
    return {
      ...entry,
      title: `Xem ${name}${year} Vietsub Full HD | CineViet`,
      h1: `${name} Vietsub Full HD${year}`,
      meta_description: `Xem phim ${name}${year} vietsub full HD chất lượng cao, cập nhật nhanh nhất tại CineViet. ${cats} hấp dẫn, xem online miễn phí.`
    };
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
    const list = this.bySource.get(sourceSlug);
    if (list && list.length > 0) return list;
    if (!sourceSlug) return [];
    return [
      { kind: 'vietsub', url_slug: `${sourceSlug}-vietsub`, source: sourceSlug, dynamic: true },
      { kind: 'episodes', url_slug: `${sourceSlug}-tap-moi-nhat`, source: sourceSlug, dynamic: true },
      { kind: 'thuyet-minh', url_slug: `${sourceSlug}-thuyet-minh`, source: sourceSlug, dynamic: true },
      { kind: 'similar', url_slug: `phim-giong-${sourceSlug}`, source: sourceSlug, dynamic: true }
    ];
  }

  getInternalLinksForMovie(movie, relatedMovies = []) {
    if (!this.loaded) this.load();
    if (!movie || !movie.slug) return [];

    const result = [];
    const seen = new Set();
    const pushEntry = (e) => {
      if (!e || !e.url_slug || seen.has(e.url_slug)) return;
      seen.add(e.url_slug);
      result.push(this.hydrateEntryWithMovie(e, movie));
    };

    // 1. Direct programmatic variations of this movie
    for (const e of this.getBySource(movie.slug)) {
      pushEntry(e);
    }
    // Always ensure -thuyet-minh variant is also linked
    pushEntry({
      kind: 'thuyet-minh',
      url_slug: `${movie.slug}-thuyet-minh`,
      source: movie.slug,
      dynamic: true
    });

    // 2. Matching top-genre entries for movie's categories
    const categories = Array.isArray(movie.category) ? movie.category : [];
    for (const cat of categories) {
      const catSlug = normalizeSlug(cat?.slug || cat?.name || cat);
      const matches = this.byGenreSlug.get(catSlug) || [];
      for (const m of matches) {
        if (result.length < 8) pushEntry(m);
      }
    }

    // 3. Programmatic variations for related movies
    if (Array.isArray(relatedMovies)) {
      for (const rel of relatedMovies) {
        if (!rel?.slug) continue;
        const relEntries = this.bySource.get(rel.slug) || [
          this.hydrateEntryWithMovie({ kind: 'vietsub', url_slug: `${rel.slug}-vietsub`, source: rel.slug, dynamic: true }, rel)
        ];
        if (relEntries.length > 0 && result.length < 12) {
          const hydrated = this.hydrateEntryWithMovie(relEntries[0], rel);
          if (!seen.has(hydrated.url_slug)) {
            seen.add(hydrated.url_slug);
            result.push(hydrated);
          }
        }
      }
    }

    // 4. Deterministic mesh across all 2,838 CSV movie entries
    if (this.movieEntries.length > 0) {
      let hash = 0;
      const s = String(movie.slug);
      for (let i = 0; i < s.length; i++) {
        hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
      }
      const start = Math.abs(hash) % this.movieEntries.length;
      const step = 37;
      for (let k = 0; k < 14 && result.length < 16; k++) {
        const idx = (start + k * step) % this.movieEntries.length;
        const item = this.movieEntries[idx];
        if (item && !seen.has(item.url_slug)) {
          seen.add(item.url_slug);
          result.push(item);
        }
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

  /**
   * Anti-dedup unique semantic text block tailored to each programmatic variant
   * (vietsub, thuyet-minh, episodes, similar, or canonical detail).
   */
  renderRichSeoBrief(movie, entry = null, episodes = [], related = []) {
    if (!movie || !movie.name) return '';
    const kind = entry?.kind || 'detail';
    const name = escapeHtml(cleanText(movie.name));
    const originName = escapeHtml(cleanText(movie.origin_name || ''));
    const year = escapeHtml(cleanText(movie.year || '2026'));
    const quality = escapeHtml(cleanText(movie.quality || 'Full HD 1080p'));
    const lang = escapeHtml(cleanText(movie.lang || 'Vietsub'));
    const epCurrent = escapeHtml(cleanText(movie.episode_current || movie.time || 'Full'));
    const synopsis = escapeHtml(cleanText(movie.content || '').slice(0, 420));
    const cats = Array.isArray(movie.category) && movie.category.length
      ? movie.category.map(c => escapeHtml(cleanText(c?.name || c))).filter(Boolean).join(', ')
      : 'Chính Kịch, Đặc Sắc';
    const countries = Array.isArray(movie.country) && movie.country.length
      ? movie.country.map(c => escapeHtml(cleanText(c?.name || c))).filter(Boolean).join(', ')
      : 'Quốc Tế';
    const actors = (movie.tmdb_cast || movie.actor || [])
      .slice(0, 6)
      .map(a => escapeHtml(cleanText(a?.name || a)))
      .filter(Boolean)
      .join(', ') || 'Đang cập nhật';
    const directors = (movie.tmdb_directors || movie.director || [])
      .slice(0, 3)
      .map(d => escapeHtml(cleanText(d?.name || d)))
      .filter(Boolean)
      .join(', ') || 'Đang cập nhật';

    const allEps = (Array.isArray(episodes) && episodes[0]?.server_data) ? episodes[0].server_data : [];
    const serverNames = Array.isArray(episodes)
      ? episodes.map(s => escapeHtml(cleanText(s?.server_name || 'VIP'))).join(', ')
      : 'Vietsub, Song Ngữ';

    let variantBody = '';
    if (kind === 'episodes') {
      const sampleEps = allEps.slice(-8).map(e => {
        const epLabel = escapeHtml(cleanText(e.name || e.slug));
        return `<a href="/xem-phim/${encodeURIComponent(movie.slug)}/${encodeURIComponent(e.slug)}" class="px-2.5 py-1 rounded bg-surface-container-high hover:bg-primary-container text-xs text-on-surface hover:text-on-primary-container transition-colors">Tập ${epLabel}</a>`;
      }).join(' ');
      variantBody = `
        <p class="text-xs text-on-surface-variant leading-relaxed">
          <strong>Lịch chiếu &amp; danh sách tập phim ${name} (${year}):</strong> Hiện tại bộ phim <em>${name}</em>${originName ? ` (${originName})` : ''} đã cập nhật tới trạng thái <strong>${epCurrent}</strong> với tổng số ${allEps.length || 1} tập phát sóng trên hệ thống máy chủ (${serverNames}). Người xem có thể theo dõi tập mới nhất tốc độ cao chuẩn ${quality} mà không cần chờ đợi.
        </p>
        ${sampleEps ? `<div class="flex flex-wrap items-center gap-1.5 pt-1"><span class="text-xs font-semibold text-on-surface">Truy cập nhanh tập mới:</span> ${sampleEps}</div>` : ''}
      `;
    } else if (kind === 'similar') {
      const simItems = Array.isArray(related) && related.length > 0
        ? related.slice(0, 6).map(r => {
            const rName = escapeHtml(cleanText(r.name));
            const rYear = escapeHtml(cleanText(r.year || ''));
            return `<li><a href="/phim/${encodeURIComponent(r.slug)}" class="text-primary hover:underline font-semibold">${rName}</a>${rYear ? ` (${rYear})` : ''} — <a href="/${encodeURIComponent(r.slug)}-vietsub" class="text-on-surface-variant hover:text-on-surface underline">Bản Vietsub</a></li>`;
          }).join('')
        : '';
      variantBody = `
        <p class="text-xs text-on-surface-variant leading-relaxed">
          <strong>Tuyển tập phim giống ${name} cùng thể loại ${cats}:</strong> Nếu bạn yêu thích cốt truyện và nhịp phim của <em>${name}</em> (${year}) do đạo diễn ${directors} thực hiện cùng dàn diễn viên ${actors}, danh sách đề xuất dưới đây quy tụ những tác phẩm có cùng mô-típ kịch bản, bối cảnh ${countries} và điểm đánh giá cao nhất.
        </p>
        ${simItems ? `<ul class="list-disc list-inside text-xs text-on-surface-variant space-y-1 pt-1">${simItems}</ul>` : ''}
      `;
    } else if (kind === 'thuyet-minh') {
      variantBody = `
        <p class="text-xs text-on-surface-variant leading-relaxed">
          <strong>Trải nghiệm xem phim ${name} (${year}) Thuyết Minh &amp; Song Ngữ:</strong> Phiên bản thuyết minh tiếng Việt và phụ đề song ngữ Việt - Anh của <em>${name}</em>${originName ? ` (${originName})` : ''} giúp khán giả thưởng thức trọn vẹn mạch phim ${cats} mà không bỏ lỡ chi tiết hội thoại. Hỗ trợ chuyển đổi âm thanh gốc và bản lồng tiếng trực tiếp trên trình phát HLS ${quality}.
        </p>
      `;
    } else {
      variantBody = `
        <p class="text-xs text-on-surface-variant leading-relaxed">
          <strong>Thông tin bản phát hành ${name} (${year}) ${lang} ${quality}:</strong> Tác phẩm điện ảnh <em>${name}</em>${originName ? ` (tên gốc: ${originName})` : ''} thuộc dòng phim ${cats} của ${countries}, quy tụ dàn diễn viên ${actors} dưới sự chỉ đạo của đạo diễn ${directors}. ${synopsis}
        </p>
      `;
    }

    return `
<article id="seo-rich-brief" class="w-full max-w-[1680px] mx-auto px-gutter-mobile sm:px-gutter pb-space-md">
  <div class="rounded-xl bg-surface-container-low/60 border border-white/5 p-space-md space-y-2">
    <h2 class="text-xs font-bold uppercase tracking-wider text-on-surface flex items-center gap-1.5">
      <span class="material-symbols-outlined text-[16px] text-primary">movie_info</span>
      <span>Tổng Quan &amp; Hướng Dẫn Xem Phim ${name} (${year})</span>
    </h2>
    ${variantBody}
    <div class="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t border-white/5 text-xs text-on-surface-variant">
      <div><strong class="text-on-surface">Xem ${name} Vietsub ở đâu?</strong> Phát trực tuyến miễn phí chất lượng ${quality} tại CineViet với đa luồng server (${serverNames}).</div>
      <div><strong class="text-on-surface">Tiến độ &amp; Thời lượng:</strong> Trạng thái ${epCurrent}, cập nhật tự động ngay khi có bản dịch chuẩn.</div>
      <div><strong class="text-on-surface">Thiết bị hỗ trợ:</strong> Xem mượt trên Web, iPhone/iPad, Android, Android TV, LG webOS và máy tính.</div>
    </div>
  </div>
</article>`;
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

  renderTopGenreGrid(items = [], entry = {}) {
    const h1 = escapeHtml(entry.h1 || entry.title || 'Tuyển Tập Phim Hay Nhất');
    const desc = escapeHtml(entry.meta_description || '');
    const cards = items.slice(0, 24).map(m => {
      const name = escapeHtml(cleanText(m.name || ''));
      const origin = escapeHtml(cleanText(m.origin_name || ''));
      const year = escapeHtml(cleanText(m.year || '2026'));
      const poster = escapeHtml(m.poster_url || m.thumb_url || '/images/placeholder-poster.svg');
      const ep = escapeHtml(cleanText(m.episode_current || m.quality || 'Full HD'));
      const slug = encodeURIComponent(m.slug || '');
      return `
      <article class="movie-card group relative rounded-xl overflow-hidden bg-surface-container flex flex-col border border-white/5">
        <a href="/phim/${slug}" class="relative w-full aspect-[2/3] overflow-hidden bg-surface-container-high block">
          <img src="${poster}" alt="${name}" loading="lazy" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
          <span class="absolute top-2 left-2 px-2 py-0.5 rounded bg-primary-container text-on-primary-container font-bold text-[10px] uppercase">${ep}</span>
        </a>
        <div class="p-2.5 flex flex-col gap-1">
          <h3 class="text-xs font-bold text-on-surface truncate"><a href="/phim/${slug}" class="hover:text-primary transition-colors">${name}</a></h3>
          <div class="flex items-center justify-between text-[11px] text-on-surface-variant">
            <span class="truncate max-w-[120px]">${origin || name}</span>
            <span>${year}</span>
          </div>
          <div class="flex items-center gap-2 pt-1 text-[10px] text-on-surface-variant">
            <a href="/${slug}-vietsub" class="hover:text-primary underline">Vietsub</a>
            <span>·</span>
            <a href="/${slug}-tap-moi-nhat" class="hover:text-primary underline">Tập mới</a>
          </div>
        </div>
      </article>`;
    }).join('\n');

    return `
    <div class="col-span-full mb-4 p-4 rounded-xl bg-surface-container-low border border-white/5 space-y-1.5">
      <h1 class="text-xl sm:text-2xl font-bold text-on-surface">${h1}</h1>
      <p class="text-xs sm:text-sm text-on-surface-variant">${desc}</p>
    </div>
    ${cards || '<p class="col-span-full py-10 text-center" role="status">Đang cập nhật danh sách phim...</p>'}`;
  }
}

const programmaticService = new ProgrammaticService();
programmaticService.normalizeSlug = normalizeSlug;
module.exports = programmaticService;
