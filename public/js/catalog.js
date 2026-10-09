// TTPhim - Explore & Filter Catalog Controller (Real API Data Binding)
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[TTPhim] Initializing Catalog Page with live API data...');
  const urlParams = new URLSearchParams(window.location.search);
  
  // State
  let currentFilter = {
    type: urlParams.get('type') || 'all',
    category: urlParams.get('category') || 'all',
    country: urlParams.get('country') || 'all',
    year: urlParams.get('year') || 'all',
    sort: urlParams.get('sort') || 'recent',
    keyword: urlParams.get('keyword') || urlParams.get('q') || '',
    page: parseInt(urlParams.get('page'), 10) || 1,
    limit: 30
  };

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
  const countDisplay = document.querySelector('div.font-body-sm.text-on-surface-variant:has(.text-primary)') ||
                       document.querySelector('div.text-outline.font-label-badge:has(.text-primary)');
  const paginationContainer = document.getElementById('catalog-pagination') ||
                              document.querySelector('nav[aria-label="Điều hướng phân trang"]');
  const activeTagsContainer = document.querySelector('div.flex.items-center.justify-between.flex-wrap:has(.text-outline) div.flex.items-center.gap-2');

  // Load Categories & Countries for dropdowns and chips
  try {
    const meta = await API.getCategories();
    if (meta && meta.countries && countrySelect) {
      countrySelect.innerHTML = `<option value="all">Tất cả quốc gia</option>` + 
        meta.countries.map(c => `<option value="${c.slug}" ${currentFilter.country === c.slug ? 'selected' : ''}>${c.name}</option>`).join('');
    }

    if (meta && meta.categories && genreChipsContainer) {
      genreChipsContainer.innerHTML = meta.categories.map(cat => `
        <button class="genre-chip px-3 py-1 rounded-full ${currentFilter.category === cat.slug ? 'bg-primary-container text-on-primary-container font-bold shadow-sm' : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'} font-label-md text-label-md transition-all cursor-pointer" data-genre="${cat.slug}" type="button">
          ${cat.name}
        </button>
      `).join('');
      updateGenreChips();
    }
  } catch (e) {
    console.warn('[TTPhim] Failed to fetch metadata:', e);
  }

  function updateGenreChips() {
    if (!genreChipsContainer) return;
    const chips = genreChipsContainer.querySelectorAll('.genre-chip');
    let activeName = 'Tất cả';
    chips.forEach(chip => {
      const g = chip.dataset.genre;
      if (currentFilter.category === g) {
        chip.className = 'genre-chip px-3 py-1 rounded-full bg-primary-container text-on-primary-container font-bold shadow-sm transition-all cursor-pointer';
        activeName = chip.innerText.trim();
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
      const text = btn.innerText.toLowerCase();
      let match = false;
      if (currentFilter.type === 'all' && text.includes('tất cả')) match = true;
      else if (currentFilter.type === 'phim-bo' && text.includes('bộ')) match = true;
      else if (currentFilter.type === 'phim-le' && text.includes('lẻ')) match = true;
      else if (currentFilter.type === 'hoat-hinh' && (text.includes('hoạt hình') || text.includes('anime'))) match = true;
      else if (currentFilter.type === 'tv-shows' && text.includes('tv shows')) match = true;
      else if ((currentFilter.type === 'chieu-rap' || currentFilter.type === 'phim-chieu-rap') && text.includes('chiếu rạp')) match = true;

      if (match) {
        btn.className = 'filter-type-btn active px-3.5 py-1.5 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md transition-all shadow-sm cursor-pointer';
      } else {
        btn.className = 'filter-type-btn px-3.5 py-1.5 rounded-full bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest font-label-md text-label-md transition-all cursor-pointer';
      }
    });
  }

  typeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.innerText.toLowerCase();
      if (text.includes('tất cả')) currentFilter.type = 'all';
      else if (text.includes('bộ')) currentFilter.type = 'phim-bo';
      else if (text.includes('lẻ')) currentFilter.type = 'phim-le';
      else if (text.includes('hoạt hình') || text.includes('anime')) currentFilter.type = 'hoat-hinh';
      else if (text.includes('tv shows')) currentFilter.type = 'tv-shows';
      else if (text.includes('chiếu rạp')) currentFilter.type = 'chieu-rap';
      
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
        sort: 'recent',
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
      window.showToast('Đã đặt lại toàn bộ bộ lọc!');
      fetchAndRender();
    });
  }

  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
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
    if (currentFilter.type !== 'all') tags.push({ label: `Loại: ${currentFilter.type}`, key: 'type' });
    if (currentFilter.category !== 'all') tags.push({ label: `Thể loại: ${currentFilter.category}`, key: 'category' });
    if (currentFilter.country !== 'all') tags.push({ label: `Quốc gia: ${currentFilter.country}`, key: 'country' });
    if (currentFilter.year !== 'all') tags.push({ label: `Năm: ${currentFilter.year}`, key: 'year' });
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
          ${t.label}
          <button class="hover:text-primary-container cursor-pointer btn-remove-tag" data-key="${t.key}" type="button">
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
        fetchAndRender();
      });
    });
  }


  async function fetchAndRender() {
    // Update URL query string
    const params = new URLSearchParams();
    if (currentFilter.type !== 'all') params.set('type', currentFilter.type);
    if (currentFilter.category !== 'all') params.set('category', currentFilter.category);
    if (currentFilter.country !== 'all') params.set('country', currentFilter.country);
    if (currentFilter.year !== 'all') params.set('year', currentFilter.year);
    if (currentFilter.sort !== 'recent') params.set('sort', currentFilter.sort);
    if (currentFilter.keyword) params.set('keyword', currentFilter.keyword);
    if (currentFilter.page > 1) params.set('page', currentFilter.page);

    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);

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
      console.log('[TTPhim] Fetching catalog with filter:', currentFilter);
      const data = await API.getCatalog(currentFilter);
      console.log('[TTPhim] Catalog received:', data?.items?.length, 'items');
      
      renderGrid(data.items || []);
      renderPagination(data.pagination);
      updateActiveFilterTags();

      // Update count display
      if (countDisplay && data.pagination) {
        countDisplay.innerHTML = `
          Hiển thị <span class="text-on-surface font-semibold">${data.items?.length || 0}</span> trên tổng số <span class="text-primary font-bold">${data.pagination.totalItems || 12450}</span> phim
        `;
      }
    } catch (e) {
      console.error('[TTPhim] Error loading catalog:', e);
      if (gridContainer) {
        gridContainer.innerHTML = `<div class="col-span-full py-16 text-center text-on-surface-variant font-headline-sm">Lỗi tải danh sách phim. Vui lòng thử lại.</div>`;
      }
    }
  }

  function renderGrid(items) {
    if (!gridContainer) {
      console.error('[TTPhim] gridContainer not found in DOM!');
      return;
    }

    if (items.length === 0) {
      gridContainer.innerHTML = `
        <div class="col-span-full py-20 flex flex-col items-center justify-center gap-3 text-center text-on-surface-variant">
          <span class="material-symbols-outlined text-[64px] text-surface-variant">search_off</span>
          <h3 class="font-headline-sm text-on-surface font-bold">Không tìm thấy bộ phim nào phù hợp</h3>
          <p class="font-body-md text-on-surface-variant">Thử điều chỉnh lại bộ lọc hoặc từ khóa tìm kiếm</p>
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
      <article class="movie-card group relative flex flex-col bg-surface-container rounded-xl overflow-hidden cursor-pointer border border-white/5" onclick="window.location.href='/phim/${movie.slug}'">
        <!-- 2:3 Aspect ratio poster container -->
        <div class="relative w-full aspect-[2/3] overflow-hidden bg-surface-container-highest">
          <img src="${movie.poster_url || movie.thumb_url}" alt="${movie.name}" loading="lazy" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-108" />
          
          <!-- Badges -->
          <div class="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10 items-start pointer-events-none">
            ${movie.has_song_ngu ? `
              <span class="badge-song-ngu">
                <span class="material-symbols-outlined">record_voice_over</span>Song Ngữ
              </span>` : ''}
            ${movie.lang ? `<span class="badge-glass-sub">${formatLangBadge(movie.lang)}</span>` : ''}
          </div>
          <div class="absolute top-2.5 right-2.5 z-10 pointer-events-none">
            <span class="badge-glass-quality">${movie.quality || 'FHD'}</span>
          </div>

          <!-- Bottom Gradient & Episode -->
          <div class="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/80 to-transparent flex items-end justify-between z-10">
            <span class="font-label-badge text-[11px] text-amber-300 font-semibold truncate max-w-[110px]">${movie.episode_current || movie.time || 'Trọn Bộ'}</span>
            <span class="px-1.5 py-0.2 rounded bg-surface-container-high/90 text-on-surface-variant font-label-badge text-[10px]">${movie.year}</span>
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
            <h3 class="font-label-md text-label-md font-bold text-on-surface group-hover:text-primary transition-colors truncate">${movie.name}</h3>
            <p class="font-body-sm text-[12px] text-on-surface-variant truncate">${movie.origin_name || movie.name}</p>
          </div>
          <div class="flex items-center justify-between text-on-surface-variant font-label-badge text-[11px] pt-1.5 border-t border-surface-container-highest">
            <span>${getMovieTypeBadge(movie)}</span>
            <span class="text-secondary flex items-center gap-0.5"><span class="material-symbols-outlined text-[13px]" style="font-variation-settings: 'FILL' 1;">star</span> 8.9</span>
          </div>
        </div>
      </article>
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

  // Initial load
  updateTypePills();
  fetchAndRender();
});

