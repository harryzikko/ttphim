// TTPhim - Library & Watchlist Controller (Real Data Binding)
document.addEventListener('DOMContentLoaded', async () => {
  let libraryData = null;
  let activeTab = 'watchlist'; // 'continue', 'watchlist', 'history', 'downloaded'
  let currentCategory = 'all';
  let currentSort = 'recent';
  let isBatchMode = false;
  const selectedSlugs = new Set();

  const tabButtons = document.querySelectorAll('.tab-btn');
  const targetGrid = document.querySelector('div.mt-space-lg.grid') || document.querySelector('main div.grid');
  const countWatching = document.querySelectorAll('div.font-headline-sm')[0];
  const searchInput = document.getElementById('watchlistSearch');

  function formatEpBadge(epName) {
    if (!epName) return 'Tập 01';
    const str = String(epName).trim();
    if (/^full$/i.test(str) || /^bản full$/i.test(str)) return 'Full';
    if (/^trọn bộ$/i.test(str)) return 'Trọn Bộ';
    const match = str.match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (!isNaN(num)) {
        return `Tập ${String(num).padStart(2, '0')}`;
      }
    }
    return str.startsWith('Tập') ? str : `Tập ${str}`;
  }

  // Batch controls
  const toggleBatchBtn = document.getElementById('toggleBatchBtn');
  const batchActionBar = document.getElementById('batchActionBar');
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  const selectedCountEl = document.getElementById('selectedCount');
  const cancelBatchBtn = document.getElementById('cancelBatchBtn');
  const batchDeleteBtn = batchActionBar?.querySelector('button.bg-error-container');

  // Filter chips & Sort
  const categoryChips = document.querySelectorAll('div.flex.items-center.gap-space-xs.overflow-x-auto button');
  const sortSelect = document.querySelector('select:has(option[value="recent"])');

  // Load Library Data
  async function loadData() {
    try {
      libraryData = await API.getLibrary();
      updateMetricBadges();
      renderActiveTab();
    } catch (e) {
      console.error('[TTPhim] Error loading library:', e);
      if (window.showToast) window.showToast('Lỗi tải dữ liệu thư viện cá nhân', 'error');
    }
  }

  function updateMetricBadges() {
    if (!libraryData) return;
    const tabCounts = document.querySelectorAll('.tab-btn span.font-label-badge');
    if (tabCounts[0]) tabCounts[0].innerText = libraryData.continueWatching?.length || 0;
    if (tabCounts[1]) tabCounts[1].innerText = libraryData.watchlist?.length || 0;
    if (tabCounts[2]) tabCounts[2].innerText = libraryData.history?.length || 0;
    if (tabCounts[3]) tabCounts[3].innerText = '0';

    const statWatching = document.getElementById('stat-watching-count') || countWatching;
    if (statWatching) {
      statWatching.innerHTML = `${(libraryData.continueWatching?.length || 0) + (libraryData.watchlist?.length || 0)} <span class="font-body-sm text-body-sm text-on-surface-variant">tựa phim</span>`;
    }
    const statHistory = document.getElementById('stat-history-count');
    if (statHistory) {
      statHistory.innerHTML = `${libraryData.history?.length || 0} <span class="font-body-sm text-body-sm text-on-surface-variant">tập phim</span>`;
    }
  }

  // Setup Tabs & URL synchronization
  const tabKeys = ['continue', 'watchlist', 'history', 'downloaded'];

  function setTab(tabKey) {
    if (!tabKeys.includes(tabKey)) tabKey = 'watchlist';
    activeTab = tabKey;

    tabButtons.forEach((btn, idx) => {
      const isCurrent = tabKeys[idx] === activeTab;
      btn.className = isCurrent
        ? 'tab-btn flex items-center gap-space-xs px-space-md py-space-xs rounded-full font-label-lg text-label-lg bg-surface-container-high text-on-surface shadow-md transition-all duration-200 cursor-pointer'
        : 'tab-btn flex items-center gap-space-xs px-space-md py-space-xs rounded-full font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface transition-all duration-200 cursor-pointer';
    });

    // Reset batch mode on tab switch
    if (isBatchMode) toggleBatchMode(false);

    renderActiveTab();
  }

  tabButtons.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      setTab(tabKeys[idx]);
    });
  });

  // Check URL param ?tab= (support ?tab=continue, ?tab=history, ?tab=watchlist)
  const urlTab = new URLSearchParams(window.location.search).get('tab');
  if (urlTab && tabKeys.includes(urlTab)) {
    activeTab = urlTab;
    tabButtons.forEach((b, idx) => {
      const isCurrent = tabKeys[idx] === activeTab;
      b.className = isCurrent
        ? 'tab-btn flex items-center gap-space-xs px-space-md py-space-xs rounded-full font-label-lg text-label-lg bg-surface-container-high text-on-surface shadow-md transition-all duration-200 cursor-pointer'
        : 'tab-btn flex items-center gap-space-xs px-space-md py-space-xs rounded-full font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface transition-all duration-200 cursor-pointer';
    });
  }


  // Filter Chips
  categoryChips.forEach(chip => {
    chip.addEventListener('click', () => {
      categoryChips.forEach(c => {
        c.className = 'px-space-md py-space-xs rounded-full bg-surface-container-high/70 hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface font-label-md text-label-md transition-colors cursor-pointer';
      });
      chip.className = 'px-space-md py-space-xs rounded-full bg-on-surface text-surface font-label-md text-label-md transition-all shadow-sm cursor-pointer';
      
      const txt = chip.innerText.trim().toLowerCase();
      if (txt.includes('tất cả')) currentCategory = 'all';
      else if (txt.includes('hành động')) currentCategory = 'Hành Động';
      else if (txt.includes('tình cảm')) currentCategory = 'Tình Cảm';
      else if (txt.includes('phim bộ')) currentCategory = 'series';
      else if (txt.includes('phim lẻ')) currentCategory = 'single';
      else currentCategory = txt;

      renderActiveTab();
    });
  });

  // Sort Selector
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      renderActiveTab();
    });
  }

  // Batch Mode Toggle
  function toggleBatchMode(forceState) {
    isBatchMode = typeof forceState === 'boolean' ? forceState : !isBatchMode;
    selectedSlugs.clear();
    updateBatchCount();

    if (batchActionBar) {
      if (isBatchMode) {
        batchActionBar.classList.remove('hidden');
        batchActionBar.classList.add('flex');
        toggleBatchBtn?.classList.add('bg-primary-container', 'text-on-primary-container');
      } else {
        batchActionBar.classList.add('hidden');
        batchActionBar.classList.remove('flex');
        toggleBatchBtn?.classList.remove('bg-primary-container', 'text-on-primary-container');
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
      }
    }
    renderActiveTab();
  }

  function updateBatchCount() {
    if (selectedCountEl) selectedCountEl.innerText = selectedSlugs.size;
  }

  if (toggleBatchBtn) {
    toggleBatchBtn.addEventListener('click', () => toggleBatchMode());
  }

  if (cancelBatchBtn) {
    cancelBatchBtn.addEventListener('click', () => toggleBatchMode(false));
  }

  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      const checkboxes = targetGrid.querySelectorAll('.card-batch-cb');
      checkboxes.forEach(cb => {
        cb.checked = e.target.checked;
        const slug = cb.dataset.slug;
        if (e.target.checked) selectedSlugs.add(slug);
        else selectedSlugs.delete(slug);
      });
      updateBatchCount();
    });
  }

  if (batchDeleteBtn) {
    batchDeleteBtn.addEventListener('click', async () => {
      if (selectedSlugs.size === 0) {
        window.showToast('Vui lòng chọn ít nhất một phim để xóa', 'info');
        return;
      }

      if (confirm(`Bạn có chắc chắn muốn xóa ${selectedSlugs.size} phim đã chọn?`)) {
        const slugs = Array.from(selectedSlugs);
        await API.batchRemoveWatchlist(slugs);
        window.showToast(`Đã xóa thành công ${slugs.length} phim khỏi danh sách!`);
        toggleBatchMode(false);
        loadData();
      }
    });
  }

  function applyFiltersAndSort(items) {
    let result = [...items];

    // Filter by query
    const q = searchInput?.value.toLowerCase().trim();
    if (q) {
      result = result.filter(m => (m.movie_name || '').toLowerCase().includes(q));
    }

    // Filter by category
    if (currentCategory !== 'all') {
      result = result.filter(m => {
        if (currentCategory === 'series') return m.episode_name || m.current_time;
        if (currentCategory === 'single') return !m.episode_name || m.episode_name === 'Full';
        return (m.category || '').toLowerCase().includes(currentCategory.toLowerCase());
      });
    }

    // Sort
    if (currentSort === 'year') {
      result.sort((a, b) => (b.year || 0) - (a.year || 0));
    } else if (currentSort === 'progress') {
      result.sort((a, b) => (b.progress_percent || 0) - (a.progress_percent || 0));
    } else if (currentSort === 'recent') {
      result.sort((a, b) => new Date(b.updated_at || b.added_at || 0) - new Date(a.updated_at || a.added_at || 0));
    }

    return result;
  }

  function renderActiveTab() {
    if (!targetGrid) return;

    if (activeTab === 'continue') {
      renderContinueWatching(targetGrid, applyFiltersAndSort(libraryData?.continueWatching || []));
    } else if (activeTab === 'watchlist') {
      renderWatchlist(targetGrid, applyFiltersAndSort(libraryData?.watchlist || []));
    } else if (activeTab === 'history') {
      renderHistory(targetGrid, applyFiltersAndSort(libraryData?.history || []));
    } else {
      renderDownloaded(targetGrid);
    }
  }

  function renderContinueWatching(container, items) {
    if (items.length === 0) {
      container.innerHTML = `
        <div class="col-span-full py-20 text-center text-on-surface-variant flex flex-col items-center gap-2">
          <span class="material-symbols-outlined text-[56px] text-surface-variant">history_toggle_off</span>
          <h3 class="font-headline-sm text-on-surface font-bold">Không có phim đang xem phù hợp</h3>
          <p class="font-body-sm text-on-surface-variant">Khi bạn xem phim, tiến trình xem sẽ tự động được lưu lại tại đây.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="group relative rounded-xl overflow-hidden bg-surface-container flex flex-col transition-all duration-300 hover:-translate-y-1.5 shadow-lg">
        <div class="relative w-full aspect-video overflow-hidden bg-surface-container-highest">
          <img src="${item.thumb_url || item.poster_url}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          
          <!-- Progress bar -->
          <div class="absolute bottom-0 inset-x-0 h-1.5 bg-surface-container-highest">
            <div class="h-full bg-primary-container" style="width: ${item.progress_percent}%;"></div>
          </div>

          <span class="badge-glass-ep absolute top-2 right-2">
            ${formatEpBadge(item.episode_name)}
          </span>

          ${isBatchMode ? `
            <div class="absolute top-2 left-2 z-20">
              <input type="checkbox" class="card-batch-cb w-5 h-5 rounded accent-primary-container cursor-pointer shadow-md" data-slug="${item.movie_slug}" ${selectedSlugs.has(item.movie_slug) ? 'checked' : ''} />
            </div>
          ` : ''}
        </div>

        <div class="p-3 flex flex-col justify-between flex-1 gap-2">
          <div>
            <h4 class="font-label-md text-label-md font-bold text-on-surface truncate group-hover:text-primary transition-colors">${item.movie_name}</h4>
            <p class="font-body-sm text-[12px] text-on-surface-variant">Đã xem ${item.progress_percent}% (${Math.floor((item.current_time || 0) / 60)} phút)</p>
          </div>
          <div class="flex items-center gap-2 pt-1 border-t border-surface-container-highest">
            <a href="/xem-phim/${item.movie_slug}/${item.episode_slug || 'tap-1'}" class="flex-1 py-1.5 rounded-lg bg-primary-container text-on-primary-container font-label-badge text-[11px] font-bold text-center hover:bg-inverse-primary transition-all flex items-center justify-center gap-1">
              <span class="material-symbols-outlined text-[14px]">play_arrow</span> Xem tiếp
            </a>
            <button class="btn-remove-hist p-1.5 rounded-lg hover:bg-error/20 text-on-surface-variant hover:text-error transition-colors cursor-pointer" data-slug="${item.movie_slug}" title="Xóa">
              <span class="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-remove-hist').forEach(b => {
      b.addEventListener('click', async () => {
        const slug = b.dataset.slug;
        await API.removeFromHistory(slug);
        window.showToast('Đã xóa phim khỏi danh sách đang xem');
        loadData();
      });
    });

    container.querySelectorAll('.card-batch-cb').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const slug = cb.dataset.slug;
        if (e.target.checked) selectedSlugs.add(slug);
        else selectedSlugs.delete(slug);
        updateBatchCount();
      });
    });
  }

  function renderWatchlist(container, items) {
    if (items.length === 0) {
      container.innerHTML = `
        <div class="col-span-full py-20 text-center text-on-surface-variant flex flex-col items-center gap-2">
          <span class="material-symbols-outlined text-[56px] text-surface-variant">favorite_border</span>
          <h3 class="font-headline-sm text-on-surface font-bold">Danh sách yêu thích đang trống</h3>
          <p class="font-body-sm text-on-surface-variant">Hãy khám phá kho phim và nhấn lưu các tựa phim bạn yêu thích.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="movie-card group relative rounded-xl overflow-hidden bg-surface-container flex flex-col shadow-lg">
        <div class="relative w-full aspect-[2/3] overflow-hidden bg-surface-container-highest">
          <img src="${item.poster_url || item.thumb_url}" class="w-full h-full object-cover" />
          
          <div class="absolute top-2 left-2 flex flex-col gap-1 z-20">
            ${isBatchMode ? `
              <input type="checkbox" class="card-batch-cb w-5 h-5 rounded accent-primary-container cursor-pointer shadow-md" data-slug="${item.movie_slug}" ${selectedSlugs.has(item.movie_slug) ? 'checked' : ''} />
            ` : `
              <div class="flex items-center gap-1">
                ${item.has_song_ngu ? `
                  <span class="badge-song-ngu">
                    <span class="material-symbols-outlined">record_voice_over</span>Song Ngữ
                  </span>
                ` : ''}
                <span class="badge-glass-quality">${item.quality || 'FHD'}</span>
              </div>
            `}
          </div>

          <!-- Hover Overlay -->
          ${!isBatchMode ? `
            <div class="absolute inset-0 bg-surface-container-lowest/80 backdrop-blur-sm p-3 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-opacity z-10">
              <div class="flex items-center gap-2">
                <a href="/phim/${item.movie_slug}" class="movie-card-play-btn flex-1 py-2 rounded-lg bg-primary-container text-on-primary-container font-label-badge text-[11px] font-bold text-center hover:bg-inverse-primary transition-colors flex items-center justify-center gap-1">
                  <span class="material-symbols-outlined text-[16px]">play_arrow</span> Xem
                </a>
                <button class="btn-remove-wl p-2 rounded-lg bg-surface-container-high hover:bg-error/30 text-on-surface hover:text-error transition-colors cursor-pointer" data-slug="${item.movie_slug}" title="Xóa">
                  <span class="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>
            </div>
          ` : ''}
        </div>

        <div class="p-2.5 flex flex-col gap-0.5">
          <h4 class="font-label-md text-label-md font-bold text-on-surface group-hover:text-primary transition-colors truncate">${item.movie_name}</h4>
          <p class="font-body-sm text-[12px] text-on-surface-variant truncate">${item.origin_name || item.year}</p>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-remove-wl').forEach(b => {
      b.addEventListener('click', async () => {
        const slug = b.dataset.slug;
        await API.removeFromWatchlist(slug);
        window.showToast('Đã xóa khỏi danh sách yêu thích');
        loadData();
      });
    });

    container.querySelectorAll('.card-batch-cb').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const slug = cb.dataset.slug;
        if (e.target.checked) selectedSlugs.add(slug);
        else selectedSlugs.delete(slug);
        updateBatchCount();
      });
    });
  }

  function renderHistory(container, items) {
    if (items.length === 0) {
      container.innerHTML = `
        <div class="col-span-full py-20 text-center text-on-surface-variant flex flex-col items-center gap-2">
          <span class="material-symbols-outlined text-[56px] text-surface-variant">browse_gallery</span>
          <h3 class="font-headline-sm text-on-surface font-bold">Lịch sử xem trống</h3>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="col-span-full flex justify-end pb-2">
        <button id="btn-clear-all-history" class="px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-error/20 text-on-surface-variant hover:text-error font-label-md text-label-md flex items-center gap-1 transition-colors cursor-pointer">
          <span class="material-symbols-outlined text-[16px]">delete_sweep</span>
          <span>Xóa toàn bộ lịch sử</span>
        </button>
      </div>
      ${items.map(item => `
        <div class="group relative rounded-xl overflow-hidden bg-surface-container flex flex-col transition-all duration-300 hover:-translate-y-1.5 shadow">
          <div class="relative w-full aspect-video overflow-hidden bg-surface-container-highest">
            <img src="${item.thumb_url || item.poster_url}" class="w-full h-full object-cover group-hover:scale-105 transition-transform" />
            <span class="badge-glass-ep absolute bottom-2 right-2">${formatEpBadge(item.episode_name)}</span>
            <button class="btn-remove-single-hist absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 hover:bg-error text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10" title="Xóa khỏi lịch sử xem" data-slug="${item.movie_slug}">
              <span class="material-symbols-outlined text-[14px]">close</span>
            </button>
          </div>
          <div class="p-3 flex flex-col justify-between flex-1 gap-1">
            <h4 class="font-label-md text-label-md font-bold text-on-surface group-hover:text-primary transition-colors truncate">${item.movie_name}</h4>
            <div class="flex items-center justify-between text-on-surface-variant font-body-sm text-[11px] pt-1 border-t border-surface-container-highest">
              <span>${new Date(item.updated_at).toLocaleDateString('vi-VN')}</span>
              <a href="/xem-phim/${item.movie_slug}/${item.episode_slug || 'tap-1'}" class="text-primary hover:underline font-semibold flex items-center gap-0.5">
                Xem lại <span class="material-symbols-outlined text-[13px]">arrow_forward</span>
              </a>
            </div>
          </div>
        </div>
      `).join('')}
    `;

    container.querySelectorAll('.btn-remove-single-hist').forEach(b => {
      b.addEventListener('click', async () => {
        const slug = b.dataset.slug;
        await API.removeFromHistory(slug);
        window.showToast('Đã xóa phim khỏi lịch sử xem');
        loadData();
      });
    });

    const clearBtn = container.querySelector('#btn-clear-all-history');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử xem không?')) {
          await API.clearHistory();
          window.showToast('Đã xóa toàn bộ lịch sử xem');
          loadData();
        }
      });
    }
  }

  function renderDownloaded(container) {
    container.innerHTML = `
      <div class="col-span-full p-12 rounded-2xl bg-surface-container text-center flex flex-col items-center">
        <div class="w-16 h-16 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center mb-4">
          <span class="material-symbols-outlined text-[32px]">download_for_offline</span>
        </div>
        <h3 class="font-headline-sm text-on-surface font-bold">Chưa Có Phim Tải Về Ngoại Tuyến</h3>
        <p class="font-body-sm text-on-surface-variant max-w-md mx-auto mt-2 leading-relaxed">
          Tính năng tải phim xem ngoại tuyến hiện được hỗ trợ độc quyền trên ứng dụng <strong>TTPhim Mobile (iOS / Android)</strong>.<br/>
          Trên nền tảng Web, bạn có thể thưởng thức toàn bộ kho phim chuẩn 4K HDR trực tuyến với tốc độ cao không giới hạn.
        </p>
        <div class="mt-6 flex items-center justify-center gap-3">
          <a href="/" class="px-5 py-2.5 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md font-bold hover:bg-inverse-primary transition-all flex items-center gap-1.5 shadow-md">
            <span class="material-symbols-outlined text-[18px]">explore</span> Khám phá phim ngay
          </a>
        </div>
      </div>
    `;
  }

  // Live search in library
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderActiveTab();
    });
  }

  // Initial load
  loadData();
});


