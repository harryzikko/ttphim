// CineViet - Explore & Filter Catalog Controller
document.addEventListener('DOMContentLoaded', async () => {
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const safeUrl = value => {
    try { const url = new URL(value, window.location.href); return /^https?:$/.test(url.protocol) ? url.href : '/favicon.svg'; } catch (_) { return '/favicon.svg'; }
  };
  const pathSegment = value => encodeURIComponent(String(value ?? '')).replace(/'/g, '%27');
  console.log('[CineViet] Initializing Catalog Page with live API data...');
  const readFilters = () => {
    const params = new URLSearchParams(window.location.search);
    return {
      type: params.get('type') || 'all', category: params.get('category') || 'all',
      country: params.get('country') || 'all', year: params.get('year') || 'all',
      format: params.get('format') || 'all', sort: params.get('sort') || 'updated',
      keyword: params.get('keyword') || params.get('q') || '',
      page: Math.max(1, parseInt(params.get('page'), 10) || 1), limit: 30
    };
  };
  let currentFilter = readFilters();
  let requestId = 0;
  const metadata = { categories: [], countries: [] };

  // Find the exact catalog grid container in kham-pha.html
  const gridContainer = document.querySelector('section[aria-label="Danh sách phim tìm kiếm"]') || 
                        document.querySelector('main section.grid') ||
                        document.querySelector('section.grid');

  const searchInput = document.getElementById('catalog-search-input');
  const quickSearchBtn = document.getElementById('btn-quick-search');
  const typeButtons = document.querySelectorAll('.filter-type-btn');
  const countrySelect = document.getElementById('filter-country');
  const yearSelect = document.getElementById('filter-year');
  const formatSelect = document.getElementById('filter-format');
  const sortSelect = document.getElementById('filter-sort');
  const resetBtn = document.getElementById('btn-reset-filters');
  const applyBtn = document.getElementById('btn-apply-filters');
  const genreChipsContainer = document.getElementById('genre-chips-container');
  const genreCountEl = document.getElementById('selected-genre-count');
  const countDisplay = document.getElementById('catalog-results-count') ||
                       document.querySelector('div.text-outline.font-label-badge:has(.text-primary)');
  const paginationContainer = document.getElementById('catalog-pagination') ||
                              document.querySelector('nav[aria-label="Điều hướng phân trang"]');
  const activeTagsContainer = document.getElementById('catalog-active-tags') || document.querySelector('div.flex.items-center.justify-between.flex-wrap:has(.text-outline) div.flex.items-center.gap-2');

  const statusEl = document.createElement('p');
  statusEl.className = 'text-on-surface-variant text-sm py-3';
  statusEl.setAttribute('role', 'status');
  gridContainer?.before(statusEl);
  function syncControls() {
    window.CatalogLayout?.update(currentFilter, metadata);
    for (const [element, key] of [[searchInput, 'keyword'], [countrySelect, 'country'], [yearSelect, 'year'], [formatSelect, 'format'], [sortSelect, 'sort']]) {
      if (!element) continue;
      const value = currentFilter[key];
      if (element.tagName === 'SELECT' && ![...element.options].some(option => option.value === value)) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        element.append(option);
      }
      element.value = value;
    }
    updateTypePills();
    updateGenreChips();
  }
  window.addEventListener('popstate', () => { currentFilter = readFilters(); syncControls(); fetchAndRender(false); });
  // Load Categories & Countries for dropdowns and chips
  try {
    const meta = await API.getCategories();
    if (meta) Object.assign(metadata, meta);
    if (meta && meta.countries && countrySelect) {
      countrySelect.innerHTML = `<option value="all">Tất cả quốc gia</option>` + 
        meta.countries.map(c => `<option value="${escapeHtml(c.slug)}" ${currentFilter.country === c.slug ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
    }

    if (meta && meta.categories && genreChipsContainer) {
      genreChipsContainer.innerHTML = meta.categories.map(cat => `
        <button class="genre-chip px-3 py-1 rounded-full ${currentFilter.category === cat.slug ? 'bg-primary-container text-on-primary-container font-bold shadow-sm' : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'} font-label-md text-label-md transition-all cursor-pointer" data-genre="${escapeHtml(cat.slug)}" type="button">
          ${escapeHtml(cat.name)}
        </button>
      `).join('');
      updateGenreChips();
    }
  } catch (e) {
    console.warn('[CineViet] Failed to fetch metadata:', e);
  }

  function updateGenreChips() {
    if (!genreChipsContainer) return;
    const chips = genreChipsContainer.querySelectorAll('.genre-chip');
    let activeName = 'Tất cả';
    chips.forEach(chip => {
      const g = chip.dataset.genre;
      if (currentFilter.category === g) {
        chip.className = 'genre-chip px-3 py-1 rounded-full bg-primary-container text-on-primary-container font-bold shadow-sm transition-all cursor-pointer';
        activeName = chip.textContent.trim();
      } else {
        chip.className = 'genre-chip px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest font-label-md text-label-md transition-all cursor-pointer';
      }
    });
    if (genreCountEl) {
      genreCountEl.innerText = `Đang chọn: ${activeName}`;
    }
  }

  if (genreChipsContainer) {
    genreChipsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.genre-chip');
      if (!chip) return;
      const g = chip.dataset.genre;
      currentFilter.category = currentFilter.category === g ? 'all' : g;
      currentFilter.page = 1;
      updateGenreChips();
      fetchAndRender();
    });
  }

  // Set initial UI values from URL params
  if (searchInput && currentFilter.keyword) {
    searchInput.value = currentFilter.keyword;
  }
  if (yearSelect && currentFilter.year !== 'all') {
    yearSelect.value = currentFilter.year;
  }
  if (sortSelect && currentFilter.sort) {
    sortSelect.value = currentFilter.sort;
  }

  // Type buttons active state
  function updateTypePills() {
    typeButtons.forEach(btn => {
      const text = btn.textContent.toLowerCase();
      let match = false;
      if (currentFilter.type === 'all' && text.includes('tất cả')) match = true;
      else if (currentFilter.type === 'phim-bo' && text.includes('bộ')) match = true;
      else if (currentFilter.type === 'phim-le' && text.includes('lẻ')) match = true;
      else if (currentFilter.type === 'hoat-hinh' && (text.includes('hoạt hình') || text.includes('anime'))) match = true;
      else if (currentFilter.type === 'tv-shows' && text.includes('tv shows')) match = true;
      else if ((currentFilter.type === 'chieu-rap' || currentFilter.type === 'phim-chieu-rap') && text.includes('chiếu rạp')) match = true;
      else if (currentFilter.type === 'song-ngu' && text.includes('song ngữ')) match = true;

      if (match) {
        btn.setAttribute('aria-pressed', 'true');
        btn.className = 'filter-type-btn active px-3.5 py-1.5 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md transition-all shadow-sm cursor-pointer';
      } else {
        btn.setAttribute('aria-pressed', 'false');
        btn.className = 'filter-type-btn px-3.5 py-1.5 rounded-full bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest font-label-md text-label-md transition-all cursor-pointer';
      }
    });
  }

  typeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.textContent.toLowerCase();
      if (text.includes('tất cả')) currentFilter.type = 'all';
      else if (text.includes('bộ')) currentFilter.type = 'phim-bo';
      else if (text.includes('lẻ')) currentFilter.type = 'phim-le';
      else if (text.includes('hoạt hình') || text.includes('anime')) currentFilter.type = 'hoat-hinh';
      else if (text.includes('tv shows')) currentFilter.type = 'tv-shows';
      else if (text.includes('chiếu rạp')) currentFilter.type = 'chieu-rap';
      else if (text.includes('song ngữ')) currentFilter.type = 'song-ngu';
      
      currentFilter.page = 1;
      updateTypePills();
      fetchAndRender();
    });
  });

  if (countrySelect) {
    countrySelect.addEventListener('change', (e) => {
      currentFilter.country = e.target.value;
      currentFilter.page = 1;
      fetchAndRender();
    });
  }

  if (yearSelect) {
    yearSelect.addEventListener('change', (e) => {
      currentFilter.year = e.target.value;
      currentFilter.page = 1;
      fetchAndRender();
    });
  }

  if (formatSelect) {
    formatSelect.addEventListener('change', (e) => {
      currentFilter.format = e.target.value;
      currentFilter.page = 1;
      fetchAndRender();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      currentFilter.sort = e.target.value;
      currentFilter.page = 1;
      fetchAndRender();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      currentFilter = {
        type: 'all',
        category: 'all',
        country: 'all',
        year: 'all',
        format: 'all', sort: 'updated', limit: 30,
        keyword: '',
        page: 1
      };
      if (searchInput) searchInput.value = '';
      if (countrySelect) countrySelect.value = 'all';
      if (yearSelect) yearSelect.value = 'all';
      if (formatSelect) formatSelect.value = 'all';
      if (sortSelect) sortSelect.value = 'updated';
      updateTypePills();
      updateGenreChips();
      window.showToast?.('Đã đặt lại toàn bộ bộ lọc!');
      fetchAndRender();
    });
  }

  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      if (searchInput) currentFilter.keyword = searchInput.value.trim();
      currentFilter.page = 1;
      fetchAndRender();
    });
  }

  if (quickSearchBtn && searchInput) {
    quickSearchBtn.addEventListener('click', () => {
      currentFilter.keyword = searchInput.value.trim();
      currentFilter.page = 1;
      fetchAndRender();
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        currentFilter.keyword = searchInput.value.trim();
        currentFilter.page = 1;
        fetchAndRender();
      }
    });
  }

  // Hot keyword chips
  window.setSearchValue = function(val) {
    if (searchInput) searchInput.value = val;
    currentFilter.keyword = val;
    currentFilter.page = 1;
    fetchAndRender();
  };

  function updateActiveFilterTags() {
    if (!activeTagsContainer) return;
    const tags = [];
    const typeNames = { 'phim-bo': 'Phim bộ', 'phim-le': 'Phim lẻ', 'hoat-hinh': 'Anime', 'chieu-rap': 'Chiếu rạp', 'phim-chieu-rap': 'Chiếu rạp', 'tv-shows': 'TV Show', 'song-ngu': 'Song Ngữ' };
    const metaName = (items, slug) => items.find(item => item.slug === slug)?.name || slug;
    if (currentFilter.type !== 'all') tags.push({ label: typeNames[currentFilter.type] || currentFilter.type, key: 'type' });
    if (currentFilter.category !== 'all') tags.push({ label: metaName(metadata.categories, currentFilter.category), key: 'category' });
    if (currentFilter.country !== 'all') tags.push({ label: metaName(metadata.countries, currentFilter.country), key: 'country' });
    if (currentFilter.year !== 'all') tags.push({ label: `Năm: ${currentFilter.year}`, key: 'year' });
    if (currentFilter.format !== 'all') tags.push({ label: `Định dạng: ${currentFilter.format}`, key: 'format' });
    if (currentFilter.keyword) tags.push({ label: `Từ khóa: "${currentFilter.keyword}"`, key: 'keyword' });

    if (tags.length === 0) {
      activeTagsContainer.innerHTML = `
        <span class="text-outline font-label-badge text-label-badge uppercase">Đang áp dụng:</span>
        <span class="text-on-surface-variant font-label-badge text-label-badge">Tất cả phim</span>
      `;
      return;
    }

    activeTagsContainer.innerHTML = `
      <span class="text-outline font-label-badge text-label-badge uppercase">Đang áp dụng:</span>
      ${tags.map(t => `
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface text-label-badge font-label-badge">
          ${escapeHtml(t.label)}
          <button aria-label="${escapeHtml('Bỏ lọc ' + t.label)}" class="hover:text-primary-container cursor-pointer btn-remove-tag" data-key="${t.key}" type="button">
            <span class="material-symbols-outlined text-[14px]">close</span>
          </button>
        </span>
      `).join('')}
    `;

    activeTagsContainer.querySelectorAll('.btn-remove-tag').forEach(b => {
      b.addEventListener('click', () => {
        const k = b.dataset.key;
        if (k === 'keyword' && searchInput) searchInput.value = '';
        currentFilter[k] = k === 'keyword' ? '' : 'all';
        currentFilter.page = 1;
        updateTypePills();
        updateGenreChips();
        syncControls();
        fetchAndRender();
      });
    });
  }


  async function fetchAndRender(writeHistory = true) {
    const id = ++requestId;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(currentFilter)) {
      if (key !== 'limit' && value && value !== 'all' && !(key === 'page' && value === 1)) params.set(key, value);
    }
    const url = `${window.location.pathname}${params.size ? `?${params}` : ''}`;
    if (writeHistory && url !== window.location.pathname + window.location.search) window.history.pushState(null, '', url);
    syncControls();
    updateActiveFilterTags();
    if (paginationContainer) paginationContainer.style.display = 'none';
    statusEl.textContent = 'Đang tải kết quả…';

    if (gridContainer) {
      gridContainer.innerHTML = Array(15).fill(0).map(() => `
        <article class="flex flex-col gap-2 rounded-xl bg-surface-container p-2">
          <div class="w-full aspect-[2/3] rounded-lg skeleton"></div>
          <div class="w-3/4 h-4 rounded skeleton mt-2"></div>
          <div class="w-1/2 h-3 rounded skeleton mt-1"></div>
        </article>
      `).join('');
    }

    try {
      console.log('[CineViet] Fetching catalog with filter:', currentFilter);
      const data = await API.getCatalog({ ...currentFilter });
      if (id !== requestId) return;
      if (!data || data.error || !Array.isArray(data.items)) throw new Error('provider_unavailable');
      const items = data.items;
      statusEl.textContent = [data.searchInfo?.message, data.searchInfo?.partial ? 'Một phần nguồn tạm lỗi; hãy thử lại.' : ''].filter(Boolean).join(' ');
      renderGrid(items);
      renderPagination(data.pagination);
      updateActiveFilterTags();

      // Update count display
      if (countDisplay && data.pagination) {
        countDisplay.innerHTML = `
          Hiển thị <span class="text-on-surface font-semibold">${items.length}</span> trên tổng số <span class="text-primary font-bold">${Number(data.pagination.totalItems) || 0}</span> phim${data.searchInfo?.limited ? ' trong phạm vi đã tra cứu' : ''}
        `;
      }
    } catch (e) {
      if (id !== requestId) return;
      statusEl.textContent = '';
      if (countDisplay) countDisplay.textContent = 'Chưa tải được kết quả';
      console.error('[CineViet] Error loading catalog:', e);
      if (gridContainer) {
        gridContainer.innerHTML = `<div class="col-span-full py-16 text-center text-on-surface-variant font-headline-sm" role="alert">Chưa thể kết nối nguồn phim. Bộ lọc và từ khóa vẫn được giữ.<br><button type="button" data-search-action="retry" class="mt-3 px-4 py-2 rounded bg-primary-container text-white">Thử lại</button></div>`;
      }
    }
  }

  function renderGrid(items) {
    if (!gridContainer) {
      console.error('[CineViet] gridContainer not found in DOM!');
      return;
    }

    if (items.length === 0) {
      gridContainer.innerHTML = `
        <div class="col-span-full py-20 flex flex-col items-center justify-center gap-3 text-center text-on-surface-variant">
          <span class="material-symbols-outlined text-[64px] text-surface-variant">search_off</span>
          <h3 class="font-headline-sm text-on-surface font-bold">Không tìm thấy bộ phim nào phù hợp</h3>
          <p class="font-body-md text-on-surface-variant">Thử tên tiếng Việt không dấu, tên gốc hoặc bỏ bớt bộ lọc. Không tự thay bằng phim không liên quan.</p>
          <button type="button" data-search-action="relax" class="px-4 py-2 rounded bg-surface-container-high">Bỏ bộ lọc, giữ từ khóa</button>
          <button type="button" data-search-action="retry" class="px-4 py-2 rounded bg-primary-container text-white">Thử lại</button>
        </div>
      `;
      return;
    }

    const getMovieTypeBadge = (movie) => {
      const normFilter = (currentFilter.type || '').toLowerCase().trim();
      if (normFilter === 'chieu-rap' || normFilter === 'phim-chieu-rap') return 'Chiếu Rạp';
      if (normFilter === 'hoat-hinh' || normFilter === 'hoathinh') return 'Hoạt Hình';
      if (normFilter === 'tv-shows' || normFilter === 'tvshows') return 'TV Shows';
      if (normFilter === 'phim-bo') return 'Phim Bộ';
      if (normFilter === 'phim-le') return 'Phim Lẻ';

      // Fallback for "all" or genre/country filters:
      if (movie.chieurap) return 'Chiếu Rạp';
      if (movie.type === 'hoathinh' || movie.type === 'hoat-hinh') return 'Hoạt Hình';
      if (movie.type === 'tvshows' || movie.type === 'tv-shows') return 'TV Shows';
      if (movie.type === 'series') return 'Phim Bộ';
      if (movie.type === 'single') return 'Phim Lẻ';
      if (movie.episode_total && parseInt(movie.episode_total, 10) > 1) return 'Phim Bộ';
      return 'Phim Lẻ';
    };

    const formatLangBadge = (lang) => {
      if (!lang) return '';
      const clean = String(lang).trim();
      if (/vietsub\s*\+\s*thuyết\s*minh/i.test(clean)) return 'Vietsub • TM';
      if (/thuyết\s*minh/i.test(clean)) return 'Thuyết Minh';
      if (/lồng\s*tiếng/i.test(clean)) return 'Lồng Tiếng';
      return clean;
    };

    gridContainer.innerHTML = items.map(movie => `
      <a href="/phim/${pathSegment(movie.slug)}" class="movie-card group relative flex flex-col bg-surface-container rounded-xl overflow-hidden cursor-pointer border border-white/5">
        <!-- 2:3 Aspect ratio poster container -->
        <div class="relative w-full aspect-[2/3] overflow-hidden bg-surface-container-highest">
          <img src="${escapeHtml(safeUrl(movie.poster_url || movie.thumb_url))}" alt="${escapeHtml(movie.name)}" loading="lazy" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-108" />
          
          <!-- Badges -->
          <div class="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10 items-start pointer-events-none">
            ${movie.has_song_ngu ? `
              <span class="badge-song-ngu">
                <span class="material-symbols-outlined">record_voice_over</span>Song Ngữ
              </span>` : ''}
            ${movie.lang ? `<span class="badge-glass-sub">${escapeHtml(formatLangBadge(movie.lang))}</span>` : ''}
          </div>
          <div class="absolute top-2.5 right-2.5 z-10 pointer-events-none">
            <span class="badge-glass-quality">${escapeHtml(movie.quality || 'FHD')}</span>
          </div>

          <!-- Bottom Gradient & Episode -->
          <div class="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/80 to-transparent flex items-end justify-between z-10">
            <span class="font-label-badge text-[11px] text-amber-300 font-semibold truncate max-w-[110px]">${escapeHtml(movie.episode_current || movie.time || 'Chưa có thông tin tập')}</span>
            <span class="px-1.5 py-0.2 rounded bg-surface-container-high/90 text-on-surface-variant font-label-badge text-[10px]">${escapeHtml(movie.year)}</span>
          </div>

          <!-- Hover Overlay CTA (Cinematic Play Button) -->
          <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center z-20">
            <div class="movie-card-play-btn w-12 h-12 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shadow-2xl scale-75 group-hover:scale-100 transition-transform">
              <span class="material-symbols-outlined text-[28px]" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
            </div>
          </div>
        </div>

        <!-- Metadata -->
        <div class="p-3 flex flex-col gap-1 flex-1 justify-between">
          <div>
            <h3 class="font-label-md text-label-md font-bold text-on-surface group-hover:text-primary transition-colors truncate">${escapeHtml(movie.name)}</h3>
            <p class="font-body-sm text-[12px] text-on-surface-variant truncate">${escapeHtml(movie.origin_name || movie.name)}</p>
          </div>
          <div class="flex items-center justify-between text-on-surface-variant font-label-badge text-[11px] pt-1.5 border-t border-surface-container-highest">
            <span>${getMovieTypeBadge(movie)}</span>
            ${Number(movie.imdb_rating) > 0 ? `<span class="text-secondary flex items-center gap-0.5"><span class="material-symbols-outlined text-[13px]" style="font-variation-settings: 'FILL' 1;">star</span> ${escapeHtml(movie.imdb_rating)}</span>` : ''}
          </div>
        </div>
      </a>
    `).join('');
  }

  function renderPagination(pagination) {
    if (!paginationContainer || !pagination) return;
    const currentPage = parseInt(pagination.currentPage, 10) || 1;
    const totalPages = parseInt(pagination.totalPages, 10) || 1;

    if (totalPages <= 1) {
      paginationContainer.style.display = 'none';
      return;
    }
    paginationContainer.style.display = 'flex';

    let pages = [];
    const maxButtons = 5;
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    if (endPage - startPage < maxButtons - 1) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }

    for (let p = startPage; p <= endPage; p++) {
      pages.push(p);
    }

    paginationContainer.innerHTML = `
      <!-- Previous Page Button -->
      <div class="flex items-center gap-2">
        <button class="px-4 py-2 rounded-lg bg-surface-container-high text-outline hover:text-on-surface hover:bg-surface-container-highest disabled:opacity-40 disabled:cursor-not-allowed font-label-md text-label-md flex items-center gap-1.5 transition-colors cursor-pointer" ${currentPage <= 1 ? 'disabled' : ''} id="btn-prev-page" type="button">
          <span class="material-symbols-outlined text-[18px]">arrow_back</span>
          <span>Trang Trước</span>
        </button>
      </div>
      <!-- Numeric Page Selector -->
      <div class="flex items-center gap-1.5 flex-wrap justify-center font-label-md text-label-md" id="catalog-numeric-pages">
        ${pages.map(p => `
          <button class="w-10 h-10 rounded-lg font-label-md text-label-md transition-all cursor-pointer ${p === currentPage ? 'bg-primary-container text-on-primary-container font-bold shadow-md' : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'}" type="button" data-page="${p}">
            ${p}
          </button>
        `).join('')}
      </div>
      <!-- Next Page & Jump to input -->
      <div class="flex items-center gap-space-sm flex-wrap">
        <button class="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface hover:bg-surface-container-highest disabled:opacity-40 disabled:cursor-not-allowed font-label-md text-label-md flex items-center gap-1.5 transition-colors cursor-pointer" ${currentPage >= totalPages ? 'disabled' : ''} id="btn-next-page" type="button">
          <span>Trang Sau</span>
          <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
        </button>
        <!-- Jump To Page Form -->
        <div class="flex items-center gap-1.5 pl-space-xs font-body-sm text-body-sm text-outline">
          <span>Đến trang:</span>
          <input class="w-14 px-2 py-1.5 rounded-lg bg-surface-container-high text-on-surface text-center font-label-md text-label-md focus:outline-none focus:bg-surface-container-highest" id="jump-page-input" max="${totalPages}" min="1" placeholder="${currentPage}" type="number"/>
          <button class="px-2.5 py-1.5 rounded-lg bg-surface-container-highest text-on-surface hover:bg-primary-container hover:text-on-primary-container font-label-badge text-label-badge font-bold transition-colors cursor-pointer" id="btn-jump-page" type="button">
            ĐI
          </button>
        </div>
      </div>
    `;

    const prevBtn = paginationContainer.querySelector('#btn-prev-page');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentFilter.page > 1) {
          currentFilter.page--;
          window.scrollTo({ top: 380, behavior: 'smooth' });
          fetchAndRender();
        }
      });
    }

    const nextBtn = paginationContainer.querySelector('#btn-next-page');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (currentFilter.page < totalPages) {
          currentFilter.page++;
          window.scrollTo({ top: 380, behavior: 'smooth' });
          fetchAndRender();
        }
      });
    }

    paginationContainer.querySelectorAll('button[data-page]').forEach(b => {
      b.addEventListener('click', () => {
        const p = parseInt(b.dataset.page, 10);
        if (p && p !== currentFilter.page) {
          currentFilter.page = p;
          window.scrollTo({ top: 380, behavior: 'smooth' });
          fetchAndRender();
        }
      });
    });

    const jumpBtn = paginationContainer.querySelector('#btn-jump-page');
    const jumpInput = paginationContainer.querySelector('#jump-page-input');
    if (jumpBtn && jumpInput) {
      const doJump = () => {
        const val = parseInt(jumpInput.value, 10);
        if (val && val >= 1 && val <= totalPages && val !== currentFilter.page) {
          currentFilter.page = val;
          window.scrollTo({ top: 380, behavior: 'smooth' });
          fetchAndRender();
        }
      };
      jumpBtn.addEventListener('click', doJump);
      jumpInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doJump();
      });
    }
  }

  gridContainer?.addEventListener('click', event => {
    const action = event.target.closest('[data-search-action]')?.dataset.searchAction;
    if (!action) return;
    if (action === 'relax') {
      for (const key of ['type', 'category', 'country', 'year', 'format']) currentFilter[key] = 'all';
      currentFilter.page = 1;
    }
    fetchAndRender(action !== 'retry');
  });
  syncControls();
  // Initial load
  updateTypePills();
  fetchAndRender();
});

