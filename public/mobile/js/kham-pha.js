// CineViet Mobile - URL-backed catalog search; provider results only.
document.addEventListener('DOMContentLoaded', () => {
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const safeImage = value => {
    try { const url = new URL(value, window.location.href); return /^https?:$/.test(url.protocol) ? url.href : '/favicon.svg'; } catch (_) { return '/favicon.svg'; }
  };
  const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
  const readParams = () => {
    const query = new URLSearchParams(window.location.search);
    const result = { page: Math.max(1, parseInt(query.get('page'), 10) || 1), limit: 20 };
    for (const key of ['type', 'category', 'country', 'year', 'format']) result[key] = query.get(key) === 'all' ? '' : query.get(key) || '';
    result.sort = query.get('sort') || 'updated';
    result.keyword = query.get('keyword') || query.get('q') || '';
    return result;
  };
  let currentParams = readParams();
  let draft = { ...currentParams };
  let requestId = 0;
  let searchTimer;
  const metadata = { categories: [], countries: [] };
  const byId = id => document.getElementById(id);
  const searchInput = byId('movieSearchInput');
  const clearBtn = byId('clearSearchBtn');
  const movieGrid = byId('movieGrid');
  const resultsCount = byId('resultsCount');
  const loadMoreBtn = byId('loadMoreBtn');
  const filterBackdrop = byId('filterSheetBackdrop');
  const activeFilterBadge = byId('activeFilterBadge');
  const statusEl = document.createElement('p');
  statusEl.className = 'text-on-surface-variant text-[12px] py-2';
  statusEl.setAttribute('role', 'status');
  movieGrid?.before(statusEl);
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = loadMoreBtn?.className || '';
  prevBtn.textContent = 'Trang trước';
  loadMoreBtn?.before(prevBtn);

  const sortLabels = { updated: 'Mới cập nhật', released: 'Năm phát hành', views: 'Lượt xem', rating: 'Điểm IMDb' };
  if (searchInput) searchInput.placeholder = 'Tên phim hoặc tên gốc...';
  function syncControls() {
    window.CatalogLayout?.update(currentParams, metadata);
    if (searchInput) searchInput.value = currentParams.keyword;
    clearBtn?.classList.toggle('hidden', !currentParams.keyword);
    activeFilterBadge?.classList.toggle('hidden', !['type', 'category', 'country', 'year', 'format'].some(key => currentParams[key]));
    if (byId('quickYearLabel')) byId('quickYearLabel').textContent = `Năm: ${currentParams.year || 'Tất cả'}`;
    if (byId('quickSortLabel')) byId('quickSortLabel').textContent = sortLabels[currentParams.sort] || 'Mới cập nhật';
    const activeCount = ['type', 'category', 'country', 'year', 'format'].filter(key => currentParams[key]).length;
    if (byId('activeFilterCounter')) byId('activeFilterCounter').textContent = activeCount ? `${activeCount} bộ lọc` : '';
    document.querySelectorAll('.m-chip').forEach(btn => {
      const type = btn.getAttribute('data-type'), country = btn.getAttribute('data-country');
      const selectedType = currentParams.type === 'phim-chieu-rap' ? 'chieu-rap' : currentParams.type;
      const active = type === 'all' ? !selectedType && !currentParams.country : type ? type === selectedType : country === currentParams.country;
      btn.className = `m-chip shrink-0 px-3.5 py-1.5 rounded-full text-[12px] transition-all ${active ? 'bg-on-surface text-surface shadow-sm font-bold' : 'bg-surface-container-high text-on-surface-variant'}`;
      btn.setAttribute('aria-pressed', String(active));
    });
  }
  function syncSheet() {
    document.querySelectorAll('.sheet-filter-btn').forEach(btn => {
      const active = draft[btn.dataset.type] === btn.dataset.val;
      btn.classList.toggle('bg-primary-container', active);
      btn.classList.toggle('text-white', active);
      btn.classList.toggle('bg-surface-container', !active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }
  function writeUrl() {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(currentParams)) if (value && key !== 'limit' && !(key === 'page' && value === 1)) query.set(key, value);
    const url = `${window.location.pathname}${query.size ? `?${query}` : ''}`;
    if (url !== window.location.pathname + window.location.search) window.history.pushState(null, '', url);
  }
  function commitSearch() {
    clearTimeout(searchTimer);
    currentParams.keyword = searchInput?.value.trim() || '';
    currentParams.page = 1;
    fetchMovies();
  }
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(commitSearch, 450);
  });
  searchInput?.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); commitSearch(); }
  });
  clearBtn?.addEventListener('click', () => { if (searchInput) searchInput.value = ''; commitSearch(); });
  document.querySelectorAll('.m-chip').forEach(btn => btn.addEventListener('click', () => {
    clearTimeout(searchTimer);
    currentParams.keyword = searchInput?.value.trim() || '';
    const type = btn.getAttribute('data-type'), country = btn.getAttribute('data-country');
    if (type !== null) currentParams.type = type === 'all' ? '' : type;
    if (country !== null) currentParams.country = country;
    currentParams.page = 1;
    fetchMovies();
  }));
  byId('openFilterSheetBtn')?.addEventListener('click', () => {
    draft = { ...currentParams };
    syncSheet();
    filterBackdrop?.classList.add('active');
  });
  byId('quickYearBtn')?.addEventListener('click', () => byId('openFilterSheetBtn')?.click());
  byId('quickSortBtn')?.addEventListener('click', () => {
    clearTimeout(searchTimer);
    currentParams.keyword = searchInput?.value.trim() || '';
    const sorts = currentParams.type === 'song-ngu' ? ['updated', 'released'] : Object.keys(sortLabels);
    currentParams.sort = sorts[(sorts.indexOf(currentParams.sort) + 1) % sorts.length];
    currentParams.page = 1;
    fetchMovies();
  });
  byId('closeFilterSheetBtn')?.addEventListener('click', () => filterBackdrop?.classList.remove('active'));
  filterBackdrop?.addEventListener('click', event => { if (event.target === filterBackdrop) filterBackdrop.classList.remove('active'); });
  byId('resetFilterBtn')?.addEventListener('click', () => {
    for (const key of ['type', 'category', 'country', 'year', 'format']) draft[key] = '';
    draft.sort = 'updated';
    syncSheet();
  });
  byId('applyFilterBtn')?.addEventListener('click', () => {
    clearTimeout(searchTimer);
    currentParams = { ...draft, keyword: searchInput?.value.trim() || '', page: 1 };
    filterBackdrop?.classList.remove('active');
    fetchMovies();
  });
  loadMoreBtn?.addEventListener('click', () => { currentParams.page++; fetchMovies(); });
  prevBtn.addEventListener('click', () => { currentParams.page = Math.max(1, currentParams.page - 1); fetchMovies(); });
  window.addEventListener('popstate', () => {
    clearTimeout(searchTimer);
    currentParams = readParams();
    draft = { ...currentParams };
    syncSheet();
    fetchMovies(false);
  });
  movieGrid?.addEventListener('click', event => {
    const action = event.target.closest('[data-search-action]')?.dataset.searchAction;
    if (!action) return;
    if (action === 'relax') {
      for (const key of ['type', 'category', 'country', 'year', 'format']) currentParams[key] = '';
      currentParams.page = 1;
    }
    fetchMovies(action !== 'retry');
  });

  async function fetchMovies(updateHistory = true) {
    const id = ++requestId;
    if (updateHistory) writeUrl();
    syncControls();
    if (loadMoreBtn) { loadMoreBtn.disabled = true; loadMoreBtn.style.display = 'none'; }
    prevBtn.style.display = currentParams.page > 1 ? 'block' : 'none';
    prevBtn.disabled = true;
    statusEl.textContent = 'Đang tải kết quả…';
    if (movieGrid) movieGrid.innerHTML = Array(4).fill('<div class="aspect-[2/3] rounded-xl bg-surface-container animate-pulse"></div>').join('');
    try {
      const data = await API.getCatalog({ ...currentParams });
      if (id !== requestId) return;
      if (!data || data.error || !Array.isArray(data.items)) throw new Error('provider_unavailable');
      const items = data.items;
      const pagination = data.pagination || {};
      const total = Number(pagination.totalItems) || 0;
      if (resultsCount) resultsCount.textContent = `${total.toLocaleString()} phim${data.searchInfo?.limited ? ' đã tra cứu' : ''} · Trang ${currentParams.page}`;
      statusEl.textContent = [data.searchInfo?.message, data.searchInfo?.partial ? 'Một phần nguồn tạm lỗi; hãy thử lại.' : ''].filter(Boolean).join(' ');
      if (movieGrid) movieGrid.innerHTML = items.length ? items.map(renderMovieCard).join('') : `<div class="col-span-2 py-16 text-center text-on-surface-variant" role="status"><p class="font-bold">Không tìm thấy phim phù hợp trong phạm vi đã tra cứu</p><p class="text-[12px] mt-2">Thử tên tiếng Việt không dấu, tên gốc hoặc bỏ bớt bộ lọc.</p><button type="button" data-search-action="relax" class="mt-3 p-3 rounded bg-surface-container">Bỏ bộ lọc, giữ từ khóa</button><button type="button" data-search-action="retry" class="mt-3 p-3 rounded bg-primary-container text-white">Thử lại</button></div>`;
      if (loadMoreBtn) {
        loadMoreBtn.textContent = 'Trang tiếp';
        loadMoreBtn.style.display = currentParams.page < Number(pagination.totalPages || 1) ? 'block' : 'none';
        loadMoreBtn.disabled = false;
      }
    } catch (error) {
      if (id !== requestId) return;
      statusEl.textContent = '';
      if (resultsCount) resultsCount.textContent = 'Chưa tải được kết quả';
      if (movieGrid) movieGrid.innerHTML = '<div class="col-span-2 text-center py-10" role="alert"><p>Chưa thể kết nối nguồn phim. Từ khóa và bộ lọc vẫn được giữ.</p><button type="button" data-search-action="retry" class="mt-3 p-3 rounded bg-primary-container text-white">Thử lại</button></div>';
    } finally {
      if (id === requestId) prevBtn.disabled = false;
    }
  }
  function renderMovieCard(movie) {
    const slug = encodeURIComponent(String(movie.slug || '')).replace(/'/g, '%27');
    return `<a href="/mobile/phim/${slug}" class="group relative flex flex-col rounded-xl overflow-hidden bg-surface-container-low shadow-md">
      <div class="relative w-full aspect-[2/3] overflow-hidden bg-surface-container">
        <img src="${escapeHtml(safeImage(movie.poster_url || movie.thumb_url))}" alt="${escapeHtml(movie.name)}" class="w-full h-full object-cover" loading="lazy" />
        <div class="absolute top-2 left-2 flex flex-col gap-1 items-start">
          ${movie.has_song_ngu ? '<span class="badge-song-ngu">Song Ngữ</span>' : ''}
          <span class="px-1.5 py-0.5 rounded bg-surface-container-lowest/80 text-[10px]">${escapeHtml(movie.lang || 'Chưa rõ ngôn ngữ')}</span>
          ${movie.episode_current ? `<span class="px-1.5 py-0.5 rounded bg-surface-container-lowest/80 text-[10px]">${escapeHtml(movie.episode_current)}</span>` : ''}
        </div>
        <span class="absolute bottom-2 right-2 px-1 rounded bg-surface-bright/80 text-[10px]">${escapeHtml(movie.quality || 'FHD')}</span>
      </div>
      <div class="flex flex-col p-2.5 gap-1"><h2 class="text-[13px] font-semibold truncate">${escapeHtml(movie.name)}</h2><p class="text-[11px] text-on-surface-variant truncate">${escapeHtml(movie.origin_name || '')}</p><span class="text-[11px] text-on-surface-variant">${escapeHtml(movie.year || '')}</span></div>
    </a>`;
  }
  async function initFilterSheetOptions() {
    try {
      const meta = await API.getCategories();
      if (meta) Object.assign(metadata, meta);
      window.CatalogLayout?.update(currentParams, metadata);
      for (const [id, key, values] of [
        ['sheetGenres', 'category', meta?.categories || []], ['sheetCountries', 'country', meta?.countries || []],
        ['sheetYears', 'year', [...new Set([String(new Date().getFullYear()), '2026', '2025', '2024', '2023', '2022', '2021', '2020', currentParams.year].filter(Boolean))].map(year => ({ slug: year, name: year }))]
      ]) {
        const wrap = byId(id);
        if (wrap) wrap.innerHTML = values.map(value => `<button type="button" class="sheet-filter-btn px-2.5 py-1 rounded-lg text-[11px] bg-surface-container text-on-surface-variant" data-type="${key}" data-val="${escapeHtml(value.slug)}">${escapeHtml(value.name)}</button>`).join('');
      }
      document.querySelectorAll('.sheet-filter-btn').forEach(btn => btn.addEventListener('click', () => {
        const key = btn.dataset.type;
        draft[key] = draft[key] === btn.dataset.val ? '' : btn.dataset.val;
        syncSheet();
      }));
      syncSheet();
    } catch (_) { statusEl.textContent = 'Chưa tải được tùy chọn bộ lọc. Bạn vẫn có thể tìm theo tên phim.'; }
  }
  initFilterSheetOptions();
  fetchMovies(false);
});
