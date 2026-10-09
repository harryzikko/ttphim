// TTPhim Mobile - Explore & Filter Controller
document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  let currentParams = {
    page: 1,
    limit: 20,
    type: urlParams.get('type') || '',
    category: urlParams.get('category') || '',
    country: urlParams.get('country') || '',
    year: urlParams.get('year') || '',
    sort: urlParams.get('sort') || 'time',
    keyword: urlParams.get('keyword') || ''
  };

  const searchInput = document.getElementById('movieSearchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  const movieGrid = document.getElementById('movieGrid');
  const resultsCount = document.getElementById('resultsCount');
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  const openFilterBtn = document.getElementById('openFilterSheetBtn');
  const closeFilterBtn = document.getElementById('closeFilterSheetBtn');
  const filterBackdrop = document.getElementById('filterSheetBackdrop');
  const applyFilterBtn = document.getElementById('applyFilterBtn');
  const resetFilterBtn = document.getElementById('resetFilterBtn');
  const activeFilterBadge = document.getElementById('activeFilterBadge');

  if (currentParams.keyword && searchInput) {
    searchInput.value = currentParams.keyword;
    if (clearBtn) clearBtn.classList.remove('hidden');
  }

  // Highlight initial active chip
  updateActiveChipUI();

  // Load Categories & Countries for Sheet
  initFilterSheetOptions();

  // Initial Fetch
  fetchMovies(true);

  // Search input handler with debounce
  let searchTimer = null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (clearBtn) {
        if (val) clearBtn.classList.remove('hidden');
        else clearBtn.classList.add('hidden');
      }

      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        currentParams.keyword = val;
        currentParams.page = 1;
        fetchMovies(true);
      }, 450);
    });
  }

  if (clearBtn) {
    clearBtn.onclick = () => {
      if (searchInput) searchInput.value = '';
      clearBtn.classList.add('hidden');
      currentParams.keyword = '';
      currentParams.page = 1;
      fetchMovies(true);
    };
  }

  // Category chip rail clicks
  document.querySelectorAll('.m-chip').forEach((btn) => {
    btn.onclick = () => {
      const type = btn.getAttribute('data-type');
      const country = btn.getAttribute('data-country');

      if (type !== null) {
        currentParams.type = type === 'all' ? '' : type;
        currentParams.country = '';
      } else if (country) {
        currentParams.country = country;
        currentParams.type = '';
      }

      currentParams.page = 1;
      updateActiveChipUI();
      fetchMovies(true);
    };
  });

  // Filter Bottom Sheet Toggles
  if (openFilterBtn) {
    openFilterBtn.onclick = () => {
      if (filterBackdrop) filterBackdrop.classList.add('active');
    };
  }
  if (closeFilterBtn) {
    closeFilterBtn.onclick = () => {
      if (filterBackdrop) filterBackdrop.classList.remove('active');
    };
  }
  if (filterBackdrop) {
    filterBackdrop.onclick = (e) => {
      if (e.target === filterBackdrop) filterBackdrop.classList.remove('active');
    };
  }

  // Reset Filters
  if (resetFilterBtn) {
    resetFilterBtn.onclick = () => {
      currentParams.category = '';
      currentParams.country = '';
      currentParams.year = '';
      currentParams.sort = 'time';
      document.querySelectorAll('#sheetGenres button, #sheetCountries button, #sheetYears button').forEach(b => {
        b.classList.remove('bg-primary-container', 'text-white');
        b.classList.add('bg-surface-container', 'text-on-surface-variant');
      });
      if (activeFilterBadge) activeFilterBadge.classList.add('hidden');
    };
  }

  // Apply Filters
  if (applyFilterBtn) {
    applyFilterBtn.onclick = () => {
      if (filterBackdrop) filterBackdrop.classList.remove('active');
      currentParams.page = 1;
      fetchMovies(true);
    };
  }

  // Load More Button
  if (loadMoreBtn) {
    loadMoreBtn.onclick = () => {
      currentParams.page += 1;
      fetchMovies(false);
    };
  }

  // Fetch catalog movies
  async function fetchMovies(reset = false) {
    if (reset && movieGrid) {
      movieGrid.innerHTML = `
        <div class="aspect-[2/3] rounded-xl bg-surface-container animate-pulse"></div>
        <div class="aspect-[2/3] rounded-xl bg-surface-container animate-pulse"></div>
        <div class="aspect-[2/3] rounded-xl bg-surface-container animate-pulse"></div>
        <div class="aspect-[2/3] rounded-xl bg-surface-container animate-pulse"></div>
      `;
    }

    try {
      const data = await API.getCatalog(currentParams);
      const items = data?.items || [];
      const total = data?.paginate?.total_items || items.length;

      if (resultsCount) {
        resultsCount.innerText = `${total.toLocaleString()} phim`;
      }

      // Update active filter badge
      const hasActiveFilter = !!(currentParams.category || currentParams.year || (currentParams.country && currentParams.country !== 'all'));
      if (activeFilterBadge) {
        if (hasActiveFilter) activeFilterBadge.classList.remove('hidden');
        else activeFilterBadge.classList.add('hidden');
      }

      if (items.length === 0) {
        if (reset) {
          movieGrid.innerHTML = `
            <div class="col-span-2 py-16 text-center text-on-surface-variant">
              <span class="material-symbols-outlined text-[48px] text-surface-container-highest mb-2">movie_filter</span>
              <p class="font-bold text-[14px] text-on-surface">Không tìm thấy phim phù hợp</p>
              <p class="text-[12px] mt-1">Thử tìm kiếm với từ khóa khác hoặc bỏ bớt bộ lọc.</p>
            </div>
          `;
          if (loadMoreBtn) loadMoreBtn.style.display = 'none';
        }
        return;
      }

      const html = items.map(renderMovieCard).join('');
      if (reset) {
        movieGrid.innerHTML = html;
      } else {
        movieGrid.insertAdjacentHTML('beforeend', html);
      }

      if (loadMoreBtn) {
        loadMoreBtn.style.display = items.length >= currentParams.limit ? 'block' : 'none';
      }

    } catch (err) {
      console.error('[Catalog Fetch Error]', err);
      if (reset && movieGrid) {
        movieGrid.innerHTML = '<div class="col-span-2 text-center text-red-400 py-10">Lỗi kết nối dữ liệu. Vui lòng thử lại!</div>';
      }
    }
  }

  function renderMovieCard(m) {
    return `
      <a href="/mobile/phim/${m.slug}" class="group relative flex flex-col rounded-xl overflow-hidden bg-surface-container-low shadow-md active:scale-[0.98] transition-all duration-200 cursor-pointer">
        <div class="relative w-full aspect-[2/3] overflow-hidden bg-surface-container">
          <img src="${m.poster_url || m.thumb_url}" alt="${m.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
          <div class="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-transparent to-black/20 pointer-events-none"></div>

          <!-- Top Status Tags -->
          <div class="absolute top-2 left-2 flex flex-col gap-1 items-start z-10">
            ${m.episode_current ? `
              <span class="px-1.5 py-0.5 rounded-sm bg-surface-container-lowest/80 backdrop-blur-md text-on-surface font-label-badge text-[9px] font-bold uppercase shadow-sm">
                ${m.episode_current}
              </span>
            ` : ''}
            <span class="px-1.5 py-0.5 rounded-sm bg-secondary-container/90 text-on-secondary-container font-label-badge text-[9px] font-bold uppercase shadow-[0_0_8px_rgba(0,238,252,0.4)]">
              ${m.lang || 'Vietsub'}
            </span>
          </div>

          <!-- Rating Badge -->
          <div class="absolute top-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-surface-container-lowest/85 backdrop-blur-md shadow-sm z-10">
            <span class="material-symbols-outlined text-primary text-[12px]" style="font-variation-settings: 'FILL' 1;">star</span>
            <span class="font-label-badge text-[10px] text-on-surface font-bold">${m.rating || '9.0'}</span>
          </div>

          <!-- Resolution Tag -->
          <span class="absolute bottom-2 right-2 px-1 rounded-sm bg-surface-bright/80 backdrop-blur-sm text-on-surface font-label-badge text-[9px] font-bold">
            ${m.quality || 'FHD'}
          </span>
        </div>

        <!-- Card Meta Info -->
        <div class="flex flex-col p-2.5 gap-0.5">
          <h2 class="font-headline-sm text-[13px] text-on-surface font-semibold truncate leading-tight">${m.name}</h2>
          <div class="flex items-center gap-1.5 text-on-surface-variant text-[11px]">
            <span>${m.year || 2024}</span>
            <span>•</span>
            <span class="truncate">${m.chieurap ? 'Chiếu Rạp' : (m.origin_name || 'Phim HD')}</span>
          </div>
        </div>
      </a>
    `;
  }

  function updateActiveChipUI() {
    document.querySelectorAll('.m-chip').forEach((btn) => {
      const type = btn.getAttribute('data-type');
      const country = btn.getAttribute('data-country');

      let isActive = false;
      if (type === 'all' && !currentParams.type && !currentParams.country) isActive = true;
      else if (type && currentParams.type === type) isActive = true;
      else if (country && currentParams.country === country) isActive = true;

      if (isActive) {
        btn.className = 'm-chip shrink-0 px-3.5 py-1.5 rounded-full text-[12px] bg-on-surface text-surface shadow-sm font-bold transition-all';
      } else {
        btn.className = 'm-chip shrink-0 px-3.5 py-1.5 rounded-full text-[12px] bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-all';
      }
    });
  }

  async function initFilterSheetOptions() {
    const genresWrap = document.getElementById('sheetGenres');
    const countriesWrap = document.getElementById('sheetCountries');
    const yearsWrap = document.getElementById('sheetYears');

    try {
      const meta = await API.getCategories();
      const categories = meta.categories || [];
      const countries = meta.countries || [];

      if (genresWrap) {
        genresWrap.innerHTML = categories.map(c => `
          <button class="sheet-filter-btn px-2.5 py-1 rounded-lg text-[11px] font-medium bg-surface-container text-on-surface-variant active:scale-95 transition-all" data-type="category" data-val="${c.slug}">
            ${c.name}
          </button>
        `).join('');
      }

      if (countriesWrap) {
        countriesWrap.innerHTML = countries.map(c => `
          <button class="sheet-filter-btn px-2.5 py-1 rounded-lg text-[11px] font-medium bg-surface-container text-on-surface-variant active:scale-95 transition-all" data-type="country" data-val="${c.slug}">
            ${c.name}
          </button>
        `).join('');
      }

      if (yearsWrap) {
        const years = ['2026', '2025', '2024', '2023', '2022', '2021', '2020'];
        yearsWrap.innerHTML = years.map(y => `
          <button class="sheet-filter-btn px-2.5 py-1 rounded-lg text-[11px] font-medium bg-surface-container text-on-surface-variant active:scale-95 transition-all" data-type="year" data-val="${y}">
            ${y}
          </button>
        `).join('');
      }

      // Delegate click in sheet
      document.querySelectorAll('.sheet-filter-btn').forEach(btn => {
        btn.onclick = () => {
          const type = btn.getAttribute('data-type');
          const val = btn.getAttribute('data-val');

          if (currentParams[type] === val) {
            currentParams[type] = '';
            btn.classList.remove('bg-primary-container', 'text-white');
            btn.classList.add('bg-surface-container', 'text-on-surface-variant');
          } else {
            // Unselect sibling buttons of same type
            btn.parentElement.querySelectorAll('.sheet-filter-btn').forEach(s => {
              s.classList.remove('bg-primary-container', 'text-white');
              s.classList.add('bg-surface-container', 'text-on-surface-variant');
            });
            currentParams[type] = val;
            btn.classList.remove('bg-surface-container', 'text-on-surface-variant');
            btn.classList.add('bg-primary-container', 'text-white');
          }
        };
      });

    } catch (e) {}
  }
});

