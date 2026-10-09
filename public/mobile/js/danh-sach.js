// TTPhim - Mobile Watchlist & Library Controller
document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get('tab') || 'watchlist';

  // Elements
  const tabBtnWatchlist = document.getElementById('tabBtnWatchlist');
  const tabBtnHistory = document.getElementById('tabBtnHistory');
  const tabBtnDownloads = document.getElementById('tabBtnDownloads');

  const panelWatchlist = document.getElementById('panelWatchlist');
  const panelHistory = document.getElementById('panelHistory');
  const panelDownloads = document.getElementById('panelDownloads');

  const watchlistGrid = document.getElementById('watchlistGrid');
  const watchlistEmpty = document.getElementById('watchlistEmpty');
  const historyList = document.getElementById('historyList');
  const historyEmpty = document.getElementById('historyEmpty');

  const badgeWatchlist = document.getElementById('badgeWatchlist');
  const badgeHistory = document.getElementById('badgeHistory');
  const tabCountSummary = document.getElementById('tabCountSummary');
  const clearListBtn = document.getElementById('clearListBtn');

  let activeTab = 'watchlist';

  const tabButtons = [
    { btn: tabBtnWatchlist, panel: panelWatchlist, id: 'watchlist' },
    { btn: tabBtnHistory, panel: panelHistory, id: 'history' },
    { btn: tabBtnDownloads, panel: panelDownloads, id: 'downloads' }
  ];

  function switchTab(tabId) {
    activeTab = tabId;
    tabButtons.forEach(({ btn, panel, id }) => {
      if (id === tabId) {
        btn.classList.add('bg-primary-container', 'text-white', 'shadow-md');
        btn.classList.remove('text-on-surface-variant');
        panel.classList.remove('hidden');
      } else {
        btn.classList.remove('bg-primary-container', 'text-white', 'shadow-md');
        btn.classList.add('text-on-surface-variant');
        panel.classList.add('hidden');
      }
    });

    updateSummary();
  }

  tabButtons.forEach(({ btn, id }) => {
    if (btn) {
      btn.addEventListener('click', () => switchTab(id));
    }
  });

  // Watchlist Rendering
  function loadWatchlist() {
    const list = window.MobileApp ? MobileApp.getWatchlist() : JSON.parse(localStorage.getItem('TTPhim_watchlist') || '[]');
    if (badgeWatchlist) badgeWatchlist.textContent = String(list.length);

    if (list.length === 0) {
      if (watchlistGrid) watchlistGrid.innerHTML = '';
      if (watchlistEmpty) watchlistEmpty.classList.remove('hidden');
    } else {
      if (watchlistEmpty) watchlistEmpty.classList.add('hidden');
      if (watchlistGrid) {
        watchlistGrid.innerHTML = '';
        list.forEach(m => {
          const card = document.createElement('div');
          card.className = 'group relative flex flex-col bg-surface-container rounded-2xl overflow-hidden border border-white/5 shadow-md';
          const thumb = m.thumb_url || m.poster_url || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400';
          card.innerHTML = `
            <a href="/mobile/phim/${m.slug}" class="relative w-full aspect-[2/3] bg-surface-container-lowest overflow-hidden">
              <img src="${thumb}" alt="${m.name}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
              <div class="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-primary-container text-white font-bold text-[9px]">
                ${m.quality || '4K VIP'}
              </div>
            </a>
            <div class="p-2.5 flex flex-col justify-between flex-1 gap-1.5">
              <div>
                <a href="/mobile/phim/${m.slug}" class="font-bold text-xs text-on-surface hover:text-white line-clamp-1 block">
                  ${m.name}
                </a>
                <p class="text-[10px] text-on-surface-variant line-clamp-1">${m.origin_name || m.year || 'Bom tấn'}</p>
              </div>
              <div class="flex items-center justify-between pt-1 border-t border-white/5">
                <a href="/mobile/xem-phim/${m.slug}" class="text-[11px] font-bold text-primary flex items-center gap-0.5">
                  <span class="material-symbols-outlined text-[15px]">play_circle</span> Xem
                </a>
                <button class="remove-fav-btn w-6 h-6 rounded-full bg-surface-container-high flex items-center justify-center text-red-400 hover:text-red-300 active:scale-90" data-slug="${m.slug}">
                  <span class="material-symbols-outlined text-[14px]">delete</span>
                </button>
              </div>
            </div>
          `;
          watchlistGrid.appendChild(card);
        });

        // Bind delete buttons
        watchlistGrid.querySelectorAll('.remove-fav-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const s = btn.getAttribute('data-slug');
            if (window.MobileApp) MobileApp.toggleWatchlist({ slug: s });
            loadWatchlist();
            updateSummary();
            if (window.MobileApp) MobileApp.showToast('Đã xóa phim khỏi Danh sách');
          });
        });
      }
    }
  }

  // History Rendering
  function loadHistory() {
    const list = JSON.parse(localStorage.getItem('TTPhim_continue_watching') || '[]');
    if (badgeHistory) badgeHistory.textContent = String(list.length);

    if (list.length === 0) {
      if (historyList) historyList.innerHTML = '';
      if (historyEmpty) historyEmpty.classList.remove('hidden');
    } else {
      if (historyEmpty) historyEmpty.classList.add('hidden');
      if (historyList) {
        historyList.innerHTML = '';
        list.forEach(m => {
          const item = document.createElement('div');
          item.className = 'flex items-center gap-3 p-2.5 rounded-2xl bg-surface-container border border-white/5';
          const thumb = m.thumb_url || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400';
          const epUrl = m.episode_slug ? `/mobile/xem-phim/${m.slug}/${m.episode_slug}` : `/mobile/xem-phim/${m.slug}`;
          item.innerHTML = `
            <a href="${epUrl}" class="relative w-24 aspect-video rounded-xl overflow-hidden bg-black shrink-0">
              <img src="${thumb}" class="w-full h-full object-cover" alt="${m.name}" />
              <div class="absolute inset-0 bg-black/40 flex items-center justify-center">
                <span class="material-symbols-outlined text-white text-[20px]">play_circle</span>
              </div>
            </a>
            <div class="flex-1 min-w-0">
              <a href="${epUrl}" class="font-bold text-xs text-on-surface hover:text-white truncate block">
                ${m.name}
              </a>
              <p class="text-[10px] text-primary font-medium mt-0.5">Đang xem: ${m.episode || 'Tập 1'}</p>
              <p class="text-[9px] text-on-surface-variant">Server: ${m.server_name || 'VIP 1'}</p>
            </div>
            <button class="remove-history-btn w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-red-400 active:scale-90" data-slug="${m.slug}">
              <span class="material-symbols-outlined text-[16px]">close</span>
            </button>
          `;
          historyList.appendChild(item);
        });

        // Bind delete history
        historyList.querySelectorAll('.remove-history-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const s = btn.getAttribute('data-slug');
            let history = JSON.parse(localStorage.getItem('TTPhim_continue_watching') || '[]');
            history = history.filter(item => item.slug !== s);
            localStorage.setItem('TTPhim_continue_watching', JSON.stringify(history));
            loadHistory();
            updateSummary();
            if (window.MobileApp) MobileApp.showToast('Đã xóa khỏi Lịch sử');
          });
        });
      }
    }
  }

  function updateSummary() {
    if (activeTab === 'watchlist') {
      const list = JSON.parse(localStorage.getItem('TTPhim_watchlist') || '[]');
      if (tabCountSummary) tabCountSummary.textContent = `${list.length} phim trong danh sách`;
    } else if (activeTab === 'history') {
      const list = JSON.parse(localStorage.getItem('TTPhim_continue_watching') || '[]');
      if (tabCountSummary) tabCountSummary.textContent = `${list.length} tập phim đang xem`;
    } else {
      if (tabCountSummary) tabCountSummary.textContent = `2 phim đã tải về (2.05 GB)`;
    }
  }

  // Clear list button
  if (clearListBtn) {
    clearListBtn.addEventListener('click', () => {
      if (activeTab === 'watchlist') {
        if (confirm('Bạn có chắc muốn xóa tất cả phim khỏi Danh sách yêu thích?')) {
          localStorage.removeItem('TTPhim_watchlist');
          loadWatchlist();
          updateSummary();
          if (window.MobileApp) MobileApp.showToast('Đã xóa toàn bộ Danh sách');
        }
      } else if (activeTab === 'history') {
        if (confirm('Bạn có chắc muốn xóa toàn bộ lịch sử xem dở?')) {
          localStorage.removeItem('TTPhim_continue_watching');
          loadHistory();
          updateSummary();
          if (window.MobileApp) MobileApp.showToast('Đã xóa toàn bộ Lịch sử');
        }
      } else {
        alert('Đã dọn dẹp các tập phim tải về');
      }
    });
  }

  // Init
  loadWatchlist();
  loadHistory();
  switchTab(initialTab);
});

