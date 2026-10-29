// CineViet - Admin Dashboard Controller
document.addEventListener('DOMContentLoaded', async () => {
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const safeUrl = value => {
    try { const url = new URL(value, window.location.href); return /^https?:$/.test(url.protocol) ? url.href : '/favicon.svg'; } catch (_) { return '/favicon.svg'; }
  };
  const pathSegment = value => encodeURIComponent(String(value ?? '')).replace(/'/g, '%27');
  document.body.classList.add('editorial-admin');
  let currentUser = null;
  let allUsers = [];
  let allReports = [];
  let allComments = [];
  let currentSettings = null;

  // Check auth
  try {
    currentUser = await API.getMe();
    if (!currentUser || currentUser.role !== 'admin') {
      window.location.href = '/dang-nhap';
      return;
    }
  } catch(e) {
    console.error('[TTPhim Admin] Auth check error:', e);
    window.location.href = '/dang-nhap';
    return;
  }

  // Update Admin Header
  if (currentUser) {
    const nameEl = document.getElementById('admin-header-name');
    const avatarEl = document.getElementById('admin-header-avatar');
    if (nameEl) nameEl.innerText = currentUser.name || 'Admin';
    if (avatarEl && currentUser.avatar) avatarEl.src = safeUrl(currentUser.avatar);
  }

  // Logout
  const logoutBtn = document.getElementById('admin-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await API.logout();
      window.location.href = '/';
    });
  }

  // Navigation Tabs
  const navButtons = document.querySelectorAll('.admin-nav-btn');
  const tabPanes = document.querySelectorAll('.admin-tab-pane');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.tab;
      
      navButtons.forEach(b => {
        b.className = 'admin-nav-btn flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-container text-on-surface-variant hover:text-on-surface font-semibold text-sm transition-all text-left whitespace-nowrap cursor-pointer';
      });
      btn.className = 'admin-nav-btn active flex items-center gap-3 px-3 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm transition-all text-left whitespace-nowrap cursor-pointer';

      tabPanes.forEach(pane => {
        pane.classList.add('hidden');
      });
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.remove('hidden');

      if (targetId === 'tab-movies') {
        loadFeaturedMovies();
      } else if (targetId === 'tab-settings') {
        loadSettingsTab();
      } else if (targetId === 'tab-analytics') {
        loadAnalyticsTab();
      } else if (targetId === 'tab-sources') {
        loadSourcesTab();
      } else if (targetId === 'tab-system') {
        loadDashboardStats();
      }
    });
  });

  // --- Load Overview & Stats ---
  async function loadDashboardStats() {
    try {
      const stats = await API.getAdminStats();
      if (!stats) return;

      const totalMoviesEl = document.getElementById('stat-total-movies');
      if (totalMoviesEl) {
        totalMoviesEl.innerText = stats.totalWebMovies == null ? 'Chưa xác minh' : Number(stats.totalWebMovies).toLocaleString('vi-VN');
      }

      document.getElementById('stat-total-users').innerText = stats.totalUsers || 0;
      const watchlistEl = document.getElementById('stat-watchlist');
      if (watchlistEl) watchlistEl.innerText = stats.totalWatchlistEntries || 0;
      document.getElementById('stat-reports').innerText = stats.totalReports || 0;
      document.getElementById('stat-pending-reports').innerText = `${stats.pendingReports || 0} sự cố đang chờ`;
      document.getElementById('stat-comments').innerText = stats.totalComments || 0;

      // System tab info
      const nodeEl = document.getElementById('sys-node-version');
      if (nodeEl) nodeEl.innerText = stats.nodeVersion || 'v20.x';

      const uptimeEl = document.getElementById('sys-uptime');
      if (uptimeEl) {
        const mins = Math.floor((stats.systemUptime || 0) / 60);
        uptimeEl.innerText = `${mins} phút (${Math.floor(mins / 60)} giờ)`;
      }

      const memEl = document.getElementById('sys-memory');
      if (memEl && stats.memoryUsage?.rss) {
        const mb = (stats.memoryUsage.rss / (1024 * 1024)).toFixed(1);
        memEl.innerText = `${mb} MB RAM`;
      }

      // Badge on sidebar
      const reportBadge = document.getElementById('badge-reports-count');
      if (reportBadge) {
        if (stats.pendingReports > 0) {
          reportBadge.innerText = stats.pendingReports;
          reportBadge.classList.remove('hidden');
        } else {
          reportBadge.classList.add('hidden');
        }
      }
    } catch (e) {
      console.error('[TTPhim Admin] Failed to load stats:', e);
    }
  }

  // --- 2. Load Users Management ---
  async function loadUsers() {
    try {
      allUsers = await API.getAdminUsers();
      applyUserFilters();
    } catch(e) {
      console.error('[TTPhim Admin] Failed to load users:', e);
    }
  }

  function applyUserFilters() {
    const q = (document.getElementById('search-users-input')?.value || '').toLowerCase().trim();
    const roleFilter = document.getElementById('filter-user-role')?.value || 'all';

    let filtered = allUsers;
    if (q) {
      filtered = filtered.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }
    if (roleFilter === 'admin') {
      filtered = filtered.filter(u => u.role === 'admin');
    } else if (roleFilter === 'user') {
      filtered = filtered.filter(u => u.role !== 'admin');
    }

    renderUsersTable(filtered);
  }

  function renderUsersTable(users) {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-on-surface-variant">Không tìm thấy người dùng phù hợp</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(u => `
      <tr class="hover:bg-surface-container-high/40 transition-colors">
        <td class="p-4 flex items-center gap-3">
          <img src="${escapeHtml(safeUrl(u.avatar || '/favicon.svg'))}" class="w-9 h-9 rounded-full object-cover shrink-0 ring-1 ring-white/10" />
          <div class="min-w-0">
            <div class="font-bold text-on-surface truncate">${escapeHtml(u.name)}</div>
            <div class="text-xs text-on-surface-variant font-mono">${escapeHtml(u.id)}</div>
          </div>
        </td>
        <td class="p-4 font-mono text-on-surface">${escapeHtml(u.email)}</td>
        <td class="p-4">
          <span class="px-2.5 py-1 rounded-full text-xs font-bold ${u.role === 'admin' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-surface-container-highest text-on-surface-variant'}">
            ${u.role === 'admin' ? 'Quản Trị Viên' : 'Khán Giả'}
          </span>
        </td>
        <td class="p-4 text-xs text-on-surface-variant">${new Date(u.created_at || '2023-01-15').toLocaleDateString('vi-VN')}</td>
        <td class="p-4 text-right space-x-1.5 whitespace-nowrap">
          <button class="btn-toggle-role px-2.5 py-1 rounded-lg bg-surface-container-highest hover:bg-primary/20 text-on-surface hover:text-primary text-xs font-semibold transition-colors cursor-pointer" data-id="${escapeHtml(u.id)}" data-role="${escapeHtml(u.role)}">
            ${u.role === 'admin' ? 'Hạ Quyền' : 'Lên Admin'}
          </button>
          ${u.id !== 'usr_admin_01' ? `
            <button class="btn-delete-user px-2 py-1 rounded-lg hover:bg-error/20 text-on-surface-variant hover:text-error text-xs transition-colors cursor-pointer" title="Xóa tài khoản" data-id="${escapeHtml(u.id)}" data-name="${escapeHtml(u.name)}">
              <span class="material-symbols-outlined text-[16px]">delete</span>
            </button>
          ` : ''}
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-toggle-role').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uid = btn.dataset.id;
        const currentRole = btn.dataset.role;
        const newRole = currentRole === 'admin' ? 'user' : 'admin';
        btn.disabled = true;
        await API.updateAdminUser(uid, { role: newRole });
        window.showToast(`Đã đổi vai trò người dùng thành: ${newRole === 'admin' ? 'Quản Trị Viên' : 'Khán Giả'}`);
        loadUsers();
      });
    });

    tbody.querySelectorAll('.btn-delete-user').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uid = btn.dataset.id;
        const uname = btn.dataset.name;
        if (confirm(`Bạn có chắc chắn muốn xóa tài khoản "${uname}" (${uid}) khỏi hệ thống?`)) {
          btn.disabled = true;
          const res = await API.deleteAdminUser(uid);
          window.showToast(res.message || 'Đã xóa người dùng thành công');
          loadUsers();
          loadDashboardStats();
        }
      });
    });
  }

  // Search & Filter event listeners
  document.getElementById('search-users-input')?.addEventListener('input', applyUserFilters);
  document.getElementById('filter-user-role')?.addEventListener('change', applyUserFilters);

  // Modal Create User
  const modalCreateUser = document.getElementById('modal-create-user');
  const btnOpenCreateUser = document.getElementById('btn-open-create-user');
  const btnCloseCreateUser = document.getElementById('btn-close-create-user');
  const btnCancelCreateUser = document.getElementById('btn-cancel-create-user');
  const formCreateUser = document.getElementById('form-create-user');

  if (btnOpenCreateUser) {
    btnOpenCreateUser.addEventListener('click', () => {
      modalCreateUser?.classList.remove('hidden');
    });
  }
  const closeModal = () => modalCreateUser?.classList.add('hidden');
  btnCloseCreateUser?.addEventListener('click', closeModal);
  btnCancelCreateUser?.addEventListener('click', closeModal);

  formCreateUser?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-user-name').value.trim();
    const email = document.getElementById('new-user-email').value.trim();
    const password = document.getElementById('new-user-password').value.trim();
    const role = document.getElementById('new-user-role').value;

    try {
      const res = await API.createAdminUser({
        name,
        email,
        password,
        role
      });
      window.showToast(res.message || 'Đã tạo tài khoản thành công!');
      closeModal();
      formCreateUser.reset();
      loadUsers();
      loadDashboardStats();
    } catch(err) {
      window.showToast(err.message || 'Lỗi tạo tài khoản', 'error');
    }
  });

  // --- 3. Load Error Reports ---
  async function loadReports() {
    try {
      allReports = await API.getAdminReports();
      applyReportFilters();
    } catch(e) {
      console.error('[TTPhim Admin] Failed to load reports:', e);
    }
  }

  function applyReportFilters() {
    const statusFilter = document.getElementById('filter-report-status')?.value || 'all';
    let filtered = allReports;
    if (statusFilter === 'pending') {
      filtered = filtered.filter(r => r.status !== 'resolved');
    } else if (statusFilter === 'resolved') {
      filtered = filtered.filter(r => r.status === 'resolved');
    }
    renderReportsTable(filtered);
  }

  function renderReportsTable(reports) {
    const tbody = document.getElementById('reports-table-body');
    if (!tbody) return;

    if (reports.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-on-surface-variant">Không có báo cáo sự cố nào theo bộ lọc</td></tr>`;
      return;
    }

    tbody.innerHTML = reports.map(r => `
      <tr class="hover:bg-surface-container-high/40 transition-colors">
        <td class="p-4">
          <div class="font-bold text-on-surface">${escapeHtml(r.movie_slug)}</div>
          <span class="text-xs text-primary font-semibold">Tập: ${escapeHtml(r.episode_slug || 'Full')}</span>
        </td>
        <td class="p-4 text-on-surface">${escapeHtml(r.reason)}</td>
        <td class="p-4 font-mono text-xs text-on-surface-variant">${escapeHtml(r.user_email || 'guest')}</td>
        <td class="p-4 text-xs text-on-surface-variant">${new Date(r.created_at).toLocaleString('vi-VN')}</td>
        <td class="p-4">
          <span class="px-2.5 py-1 rounded-full text-xs font-bold ${r.status === 'resolved' ? 'bg-success/20 text-success border border-success/30' : 'bg-error/20 text-error border border-error/30'}">
            ${r.status === 'resolved' ? 'Đã Xử Lý' : 'Chờ Xử Lý'}
          </span>
        </td>
        <td class="p-4 text-right whitespace-nowrap space-x-1.5">
          <a href="/xem-phim/${pathSegment(r.movie_slug)}/${pathSegment(r.episode_slug || 'tap-1')}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-container text-on-surface text-xs font-semibold inline-flex items-center gap-1 transition-colors" title="Xem thử tập phim">
            <span class="material-symbols-outlined text-[14px] text-primary">play_circle</span> Xem Thử
          </a>
          <button class="btn-toggle-report px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${r.status === 'resolved' ? 'bg-surface-container-highest text-on-surface-variant hover:text-on-surface' : 'bg-success text-white hover:brightness-110'}" data-id="${escapeHtml(r.id)}" data-status="${escapeHtml(r.status)}">
            ${r.status === 'resolved' ? 'Mở lại' : 'Đánh dấu đã sửa'}
          </button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-toggle-report').forEach(btn => {
      btn.addEventListener('click', async () => {
        const rid = btn.dataset.id;
        const currentStatus = btn.dataset.status;
        const nextStatus = currentStatus === 'resolved' ? 'pending' : 'resolved';
        btn.disabled = true;
        await API.updateAdminReportStatus(rid, nextStatus);
        window.showToast(nextStatus === 'resolved' ? '✅ Đã ghi nhận xử lý sự cố thành công!' : 'Đã mở lại sự cố');
        loadReports();
        loadDashboardStats();
      });
    });
  }

  document.getElementById('filter-report-status')?.addEventListener('change', applyReportFilters);

  // --- 4. Load Comments Moderation ---
  async function loadComments() {
    try {
      allComments = await API.getAdminComments();
      renderCommentsTable(allComments);
    } catch(e) {
      console.error('[TTPhim Admin] Failed to load comments:', e);
    }
  }

  function renderCommentsTable(comments) {
    const tbody = document.getElementById('comments-table-body');
    if (!tbody) return;

    if (comments.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-on-surface-variant">Chưa có bình luận nào</td></tr>`;
      return;
    }

    tbody.innerHTML = comments.map(c => `
      <tr class="hover:bg-surface-container-high/40 transition-colors">
        <td class="p-4 flex items-center gap-2">
          <img src="${escapeHtml(safeUrl(c.user_avatar || '/favicon.svg'))}" class="w-7 h-7 rounded-full object-cover shrink-0" />
          <span class="font-bold text-on-surface truncate max-w-[140px]">${escapeHtml(c.user_name)}</span>
        </td>
        <td class="p-4 text-xs font-semibold text-secondary-container truncate max-w-[160px]">${escapeHtml(c.movie_slug)}</td>
        <td class="p-4 max-w-xs truncate text-on-surface">${escapeHtml(c.content)}</td>
        <td class="p-4 text-xs text-on-surface-variant">${escapeHtml(c.created_at || 'Vừa xong')}</td>
        <td class="p-4 font-bold text-xs">${Number(c.likes) || 0} ❤️</td>
        <td class="p-4 text-right">
          <button class="btn-delete-comment px-3 py-1.5 rounded-lg bg-error/20 hover:bg-error text-error hover:text-white text-xs font-bold transition-all cursor-pointer" data-id="${escapeHtml(c.id)}">
            Xóa Vi Phạm
          </button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-delete-comment').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cid = btn.dataset.id;
        if (confirm('Bạn có chắc chắn muốn xóa bình luận này?')) {
          btn.disabled = true;
          await API.deleteAdminComment(cid);
          window.showToast('Đã xóa bình luận thành công!');
          loadComments();
          loadDashboardStats();
        }
      });
    });
  }

  // --- 5. Tab: Tra Cứu & Ghim Phim Hot (Đa Nguồn: KKPhim, ViCDN) ---
  async function loadFeaturedMovies() {
    try {
      currentSettings = await API.getAdminSettings();
      const container = document.getElementById('featured-slugs-container');
      const countBadge = document.getElementById('pinned-count-badge');
      if (!container) return;

      const rawSlugs = currentSettings?.featured_slugs || [];
      if (countBadge) {
        countBadge.innerText = `${rawSlugs.length} phim`;
      }

      if (rawSlugs.length === 0) {
        container.innerHTML = `<div class="col-span-full p-4 rounded-xl bg-surface-container-high/50 text-center text-xs text-on-surface-variant">Chưa có phim nào được ghim. Banner trang chủ sẽ hiển thị giao diện mặc định. Hãy tìm phim ở bảng bên dưới và bấm <b>+ Ghim Trang Chủ</b> để đưa phim lên Banner nổi bật!</div>`;
        return;
      }

      container.innerHTML = rawSlugs.map(item => {
        const slug = typeof item === 'string' ? item : (item.slug || '');
        const name = typeof item === 'object' && item.name ? item.name : slug;
        const originName = typeof item === 'object' && item.origin_name ? item.origin_name : '';
        const poster = (typeof item === 'object' && (item.poster_url || item.thumb_url)) ? (item.poster_url || item.thumb_url) : 'https://phimimg.com/uploads/movies/thumb-default.jpg';
        
        let sourceBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">KKPhim</span>';
        if ((typeof item === 'object' && item.source === 'vicdn') || slug.startsWith('tv-') || slug.startsWith('movie-')) {
          sourceBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">ViCDN Song Ngữ</span>';
        } else if ((typeof item === 'object' && item.source === 'nguonc') || slug.startsWith('nc-')) {
          sourceBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">NguonC</span>';
        }

        const isBilingual = (typeof item === 'object' && item.has_song_ngu) || (typeof item === 'object' && item.source === 'vicdn') || slug.startsWith('tv-');
        const songNguBadge = isBilingual ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">Song Ngữ</span>' : '';

        return `
          <div class="flex items-center gap-3 p-2.5 rounded-xl bg-surface-container-high border border-secondary/30 hover:border-secondary/60 transition-all shadow-sm">
            <img src="${escapeHtml(safeUrl(poster))}" class="w-10 h-14 object-cover rounded-lg bg-surface-container shrink-0 border border-white/5" onerror="this.onerror=null;this.src='/favicon.ico'" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 flex-wrap">
                ${sourceBadge}
                ${songNguBadge}
              </div>
              <div class="font-bold text-on-surface text-xs truncate mt-1" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
              <div class="text-[11px] text-on-surface-variant font-mono truncate">${escapeHtml(slug)}</div>
            </div>
            <div class="flex flex-col gap-1 shrink-0">
              <a href="/phim/${pathSegment(slug)}" target="_blank" rel="noopener noreferrer" class="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-on-surface text-center transition-colors" title="Xem thử">
                <span class="material-symbols-outlined text-[16px]">visibility</span>
              </a>
              <button class="btn-unpin-slug p-1.5 rounded-lg hover:bg-error/20 text-on-surface-variant hover:text-error transition-colors cursor-pointer" data-slug="${escapeHtml(slug)}" title="Bỏ ghim">
                <span class="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          </div>
        `;
      }).join('');

      container.querySelectorAll('.btn-unpin-slug').forEach(btn => {
        btn.addEventListener('click', async () => {
          const s = btn.dataset.slug;
          const fresh = await API.getAdminSettings();
          const nextSlugs = (fresh?.featured_slugs || []).filter(item => {
            const itemSlug = typeof item === 'string' ? item : item?.slug;
            return itemSlug !== s;
          });
          await API.updateAdminSettings({ featured_slugs: nextSlugs });
          window.showToast(`Đã gỡ ghim phim "${s}"`);
          await loadFeaturedMovies();
          if (searchMovieInput?.value.trim()) handleSearchMovie();
        });
      });

      // Clear all pins
      const clearPinsBtn = document.getElementById('btn-clear-all-pins');
      if (clearPinsBtn) {
        clearPinsBtn.onclick = async () => {
          if (confirm('Bạn có chắc chắn muốn gỡ toàn bộ phim ghim khỏi Banner trang chủ?')) {
            await API.updateAdminSettings({ featured_slugs: [] });
            window.showToast('Đã gỡ toàn bộ phim ghim khỏi Banner trang chủ!');
            await loadFeaturedMovies();
            if (searchMovieInput?.value.trim()) handleSearchMovie();
          }
        };
      }
    } catch(e) {
      console.error('[TTPhim Admin] Failed to load featured movies:', e);
    }
  }

  // Search Multi-Source Movies
  const searchMovieBtn = document.getElementById('btn-admin-search-movie');
  const searchMovieInput = document.getElementById('admin-movie-search-input');
  const searchSourceFilter = document.getElementById('admin-movie-source-filter');

  async function handleSearchMovie() {
    const kw = searchMovieInput?.value.trim();
    if (!kw) return;
    const sourceFilter = searchSourceFilter?.value || 'all';
    const tbody = document.getElementById('movie-search-table-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-on-surface-variant">Đang tìm kiếm từ các nguồn phim (${sourceFilter === 'all' ? 'KKPhim, ViCDN Song Ngữ, NguonC' : escapeHtml(sourceFilter.toUpperCase())})...</td></tr>`;

    try {
      const items = await API.searchAdminMovies(kw, sourceFilter);
      if (!items || items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-on-surface-variant">Không tìm thấy phim phù hợp với từ khóa "${escapeHtml(kw)}"</td></tr>`;
        return;
      }

      currentSettings = await API.getAdminSettings();
      const featured = currentSettings?.featured_slugs || [];
      const featuredSlugsList = featured.map(f => typeof f === 'string' ? f : f?.slug);

      tbody.innerHTML = items.map(m => {
        const isPinned = featuredSlugsList.includes(m.slug);
        
        let sourceBadgeHtml = '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">KKPhim API</span>';
        if (m.source === 'vicdn' || (m.slug && m.slug.startsWith('tv-'))) {
          sourceBadgeHtml = '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>ViCDN Song Ngữ</span>';
        } else if (m.source === 'nguonc' || (m.slug && m.slug.startsWith('nc-'))) {
          sourceBadgeHtml = '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-sky-400"></span>NguonC API</span>';
        }

        const songNguTag = (m.has_song_ngu || m.source === 'vicdn' || (m.slug && m.slug.startsWith('tv-')))
          ? '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">Song Ngữ</span>'
          : (m.lang ? `<span class="px-2 py-0.5 rounded text-[11px] bg-surface-container-highest text-on-surface-variant">${escapeHtml(m.lang)}</span>` : '');

        return `
          <tr class="hover:bg-surface-container-high/40 transition-colors">
            <td class="p-3">
              <div class="flex items-center gap-3">
                <img src="${escapeHtml(safeUrl(m.poster_url || m.thumb_url || '/favicon.ico'))}" class="w-9 h-13 object-cover rounded bg-surface-container shrink-0 border border-white/5" onerror="this.onerror=null;this.src='/favicon.ico'" />
                <div class="min-w-0">
                  <div class="font-bold text-on-surface text-xs sm:text-sm truncate max-w-[200px]" title="${escapeHtml(m.name)}">${escapeHtml(m.name)}</div>
                  <div class="text-[11px] text-on-surface-variant font-mono truncate max-w-[200px]">${escapeHtml(m.slug)}</div>
                </div>
              </div>
            </td>
            <td class="p-3 whitespace-nowrap">
              ${sourceBadgeHtml}
            </td>
            <td class="p-3 text-xs text-on-surface-variant truncate max-w-[150px] font-medium" title="${escapeHtml(m.origin_name || '')}">
              ${escapeHtml(m.origin_name || '--')}
            </td>
            <td class="p-3 text-xs whitespace-nowrap">
              <span class="font-semibold text-on-surface">${escapeHtml(m.year || '--')}</span>
              ${m.episode_current ? `<span class="text-on-surface-variant text-[11px] block">${escapeHtml(m.episode_current)}</span>` : ''}
            </td>
            <td class="p-3">
              <div class="flex flex-wrap gap-1 items-center">
                <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-primary/20 text-primary">${escapeHtml(m.quality || 'FHD')}</span>
                ${songNguTag}
              </div>
            </td>
            <td class="p-3 text-right space-x-2 whitespace-nowrap">
              <a href="/phim/${pathSegment(m.slug)}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-container text-on-surface text-xs font-semibold inline-flex items-center gap-1 transition-colors">
                <span class="material-symbols-outlined text-[14px]">visibility</span> Xem
              </a>
              <button class="btn-pin-movie px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${isPinned ? 'bg-secondary text-black shadow-md shadow-secondary/30' : 'bg-surface-container-highest hover:bg-secondary/20 hover:text-secondary text-on-surface'}" data-slug="${escapeHtml(m.slug)}">
                ${isPinned ? '✓ Đang Ghim' : '+ Ghim Trang Chủ'}
              </button>
            </td>
          </tr>
        `;
      }).join('');

      tbody.querySelectorAll('.btn-pin-movie').forEach(btn => {
        btn.addEventListener('click', async () => {
          const slug = btn.dataset.slug;
          const targetMovie = items.find(x => x.slug === slug);
          const fresh = await API.getAdminSettings();
          let featuredList = fresh?.featured_slugs || [];
          const isAlreadyPinned = featuredList.some(item => (typeof item === 'string' ? item : item?.slug) === slug);

          if (!isAlreadyPinned) {
            const pinItem = targetMovie ? {
              slug: targetMovie.slug,
              name: targetMovie.name,
              origin_name: targetMovie.origin_name || '',
              poster_url: targetMovie.poster_url || targetMovie.thumb_url || '',
              thumb_url: targetMovie.thumb_url || targetMovie.poster_url || '',
              year: targetMovie.year || new Date().getFullYear(),
              quality: targetMovie.quality || 'FHD',
              has_song_ngu: Boolean(targetMovie.has_song_ngu || targetMovie.source === 'vicdn'),
              source: targetMovie.source || 'kkphim',
              source_name: targetMovie.source_name || (targetMovie.source === 'vicdn' ? 'ViCDN Song Ngữ' : targetMovie.source === 'nguonc' ? 'NguonC API' : 'KKPhim API')
            } : { slug };

            featuredList = [pinItem, ...featuredList].slice(0, 8);
            await API.updateAdminSettings({ featured_slugs: featuredList });
            window.showToast(`🌟 Đã ghim phim "${targetMovie?.name || slug}" lên Banner nổi bật Trang Chủ!`);
          } else {
            featuredList = featuredList.filter(item => (typeof item === 'string' ? item : item?.slug) !== slug);
            await API.updateAdminSettings({ featured_slugs: featuredList });
            window.showToast(`Đã gỡ ghim phim "${targetMovie?.name || slug}"`);
          }
          await loadFeaturedMovies();
          handleSearchMovie();
        });
      });
    } catch(e) {
      console.error('[TTPhim Admin] Search error:', e);
      tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-error">Lỗi kết nối khi tìm phim</td></tr>`;
    }
  }

  searchMovieBtn?.addEventListener('click', handleSearchMovie);
  searchMovieInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSearchMovie();
  });
  searchSourceFilter?.addEventListener('change', () => {
    if (searchMovieInput?.value.trim()) handleSearchMovie();
  });

  // --- 6. Tab: Cấu Hình Website & Banner Thông Báo ---
  let advertisingConfig = null;
  async function loadSettingsTab() {
    try {
      currentSettings = await API.getAdminSettings();
      if (currentSettings) {
        const annEl = document.getElementById('setting-announcement');
        const annActiveEl = document.getElementById('setting-announcement-active');
        const titleEl = document.getElementById('setting-site-title');

        if (annEl) annEl.value = currentSettings.announcement || '';
        if (annActiveEl) annActiveEl.checked = Boolean(currentSettings.announcement_active);
        if (titleEl) titleEl.value = currentSettings.site_title || 'CineViet - Xem Phim Online Chuẩn Cinema 4K';
      }

      // Load Advertising footer slot
      try {
        const adRes = await API.request('/api/admin/advertising');
        if (adRes?.status && adRes.data) {
          advertisingConfig = adRes.data;
          const footerAd = advertisingConfig.ads?.find(a => a.slot === 'footer') || {};
          
          const enabledEl = document.getElementById('setting-footer-ad-enabled');
          const titleAdEl = document.getElementById('setting-footer-ad-title');
          const descAdEl = document.getElementById('setting-footer-ad-desc');
          const hrefAdEl = document.getElementById('setting-footer-ad-href');
          const ctaAdEl = document.getElementById('setting-footer-ad-cta');
          const imgDeskEl = document.getElementById('setting-footer-ad-image-desktop');
          const imgMobEl = document.getElementById('setting-footer-ad-image-mobile');
          const newTabEl = document.getElementById('setting-footer-ad-newtab');

          if (enabledEl) enabledEl.checked = Boolean(footerAd.enabled);
          if (titleAdEl) titleAdEl.value = footerAd.title || '';
          if (descAdEl) descAdEl.value = footerAd.description || '';
          if (hrefAdEl) hrefAdEl.value = footerAd.href || '';
          if (ctaAdEl) ctaAdEl.value = footerAd.cta_label || '';
          if (imgDeskEl) imgDeskEl.value = footerAd.image_desktop || '';
          if (imgMobEl) imgMobEl.value = footerAd.image_mobile || '';
          if (newTabEl) newTabEl.checked = Boolean(footerAd.new_tab);
        }
      } catch (adErr) {
        console.warn('[TTPhim Admin] Failed to load advertising:', adErr);
      }

      // Load Popup Banner config
      try {
        const popup = currentSettings.popup_banner || (await API.getAdminPopupBanner()) || {};
        const pEnabledEl = document.getElementById('setting-popup-ad-enabled');
        const pTitleEl = document.getElementById('setting-popup-ad-title');
        const pDescEl = document.getElementById('setting-popup-ad-desc');
        const pHrefEl = document.getElementById('setting-popup-ad-href');
        const pImageEl = document.getElementById('setting-popup-ad-image');
        const pCooldownEl = document.getElementById('setting-popup-ad-cooldown');
        const pNewTabEl = document.getElementById('setting-popup-ad-newtab');

        if (pEnabledEl) pEnabledEl.checked = Boolean(popup.enabled);
        if (pTitleEl) pTitleEl.value = popup.title || 'ĐẠI TIỆC SĂN DEAL SHOPEE MALL';
        if (pDescEl) pDescEl.value = popup.description || '';
        if (pHrefEl) pHrefEl.value = popup.href || 'https://sandeal.dealpulse.vn/';
        if (pImageEl) pImageEl.value = popup.image || '/images/banners/dealpulse-popup.png';
        if (pCooldownEl) pCooldownEl.value = popup.cooldown_hours != null ? popup.cooldown_hours : 12;
        if (pNewTabEl) pNewTabEl.checked = popup.new_tab !== false;
      } catch (pErr) {
        console.warn('[TTPhim Admin] Failed to load popup banner config:', pErr);
      }

      // Load App Open Interstitial Banner config
      try {
        const appBanner = currentSettings.app_banner || (await API.getAdminAppBanner()) || {};
        const aEnabledEl = document.getElementById('setting-app-ad-enabled');
        const aTitleEl = document.getElementById('setting-app-ad-title');
        const aDescEl = document.getElementById('setting-app-ad-desc');
        const aHrefEl = document.getElementById('setting-app-ad-href');
        const aCtaEl = document.getElementById('setting-app-ad-cta');
        const aCountdownEl = document.getElementById('setting-app-ad-countdown');
        const aImgMobEl = document.getElementById('setting-app-ad-image-mobile');
        const aImgIpadVEl = document.getElementById('setting-app-ad-image-ipad-v');
        const aImgIpadHEl = document.getElementById('setting-app-ad-image-ipad-h');
        const aCooldownEl = document.getElementById('setting-app-ad-cooldown');

        if (aEnabledEl) aEnabledEl.checked = Boolean(appBanner.enabled);
        if (aTitleEl) aTitleEl.value = appBanner.title || 'S\u0102N DEAL SHOPEE GI\u1ea2M S\u1ed0C 50% - 80%';
        if (aDescEl) aDescEl.value = appBanner.description || '';
        if (aHrefEl) aHrefEl.value = appBanner.href || 'https://sandeal.dealpulse.vn/';
        if (aCtaEl) aCtaEl.value = appBanner.cta_text || 'S\u0102N DEAL NGAY B\u00c2Y GI\u1edc';
        if (aCountdownEl) aCountdownEl.value = appBanner.countdown_seconds != null ? appBanner.countdown_seconds : 5;
        if (aImgMobEl) aImgMobEl.value = appBanner.image_mobile_vertical || '/images/banners/banner_mobile_vertical.png';
        if (aImgIpadVEl) aImgIpadVEl.value = appBanner.image_ipad_vertical || '/images/banners/banner_ipad_vertical.png';
        if (aImgIpadHEl) aImgIpadHEl.value = appBanner.image_ipad_landscape || '/images/banners/banner_ipad_portrait.png';
        if (aCooldownEl) aCooldownEl.value = appBanner.cooldown_hours != null ? appBanner.cooldown_hours : 0;
      } catch (aErr) {
        console.warn('[TTPhim Admin] Failed to load app banner config:', aErr);
      }

      // Load In-App Update config
      try {
        const appUpdate = currentSettings.app_update || (await API.getAdminAppUpdate()) || {};
        const uEnabledEl = document.getElementById('setting-app-update-enabled');
        const uVersionEl = document.getElementById('setting-app-update-version');
        const uBuildEl = document.getElementById('setting-app-update-build');
        const uTitleEl = document.getElementById('setting-app-update-title');
        const uNotesEl = document.getElementById('setting-app-update-notes');
        const uApkMobEl = document.getElementById('setting-app-update-apk-mobile');
        const uApkTvEl = document.getElementById('setting-app-update-apk-tv');
        const uIosEl = document.getElementById('setting-app-update-ios');
        const uForceEl = document.getElementById('setting-app-update-force');

        if (uEnabledEl) uEnabledEl.checked = appUpdate.enabled !== false;
        if (uVersionEl) uVersionEl.value = appUpdate.latest_version || '1.0.1';
        if (uBuildEl) uBuildEl.value = appUpdate.latest_build != null ? appUpdate.latest_build : 2;
        if (uTitleEl) uTitleEl.value = appUpdate.title || 'Bản Cập Nhật CineViet Mới';
        if (uNotesEl) uNotesEl.value = appUpdate.release_notes || '';
        if (uApkMobEl) uApkMobEl.value = appUpdate.apk_mobile_url || '';
        if (uApkTvEl) uApkTvEl.value = appUpdate.apk_tv_url || '';
        if (uIosEl) uIosEl.value = appUpdate.ios_url || '';
        if (uForceEl) uForceEl.checked = Boolean(appUpdate.force_update);
      } catch (uErr) {
        console.warn('[TTPhim Admin] Failed to load app update config:', uErr);
      }
    } catch(e) {
      console.error('[TTPhim Admin] Failed to load settings:', e);
    }
  }

  document.getElementById('btn-save-footer-ad')?.addEventListener('click', async () => {
    const saveBtn = document.getElementById('btn-save-footer-ad');
    try {
      saveBtn.disabled = true;
      if (!advertisingConfig) {
        const adRes = await API.request('/api/admin/advertising');
        if (adRes?.status && adRes.data) advertisingConfig = adRes.data;
        else throw new Error('Không thể tải cấu hình quảng cáo');
      }

      const footerIdx = advertisingConfig.ads.findIndex(a => a.slot === 'footer');
      if (footerIdx === -1) throw new Error('Không tìm thấy vị trí quảng cáo footer');

      advertisingConfig.ads[footerIdx] = {
        ...advertisingConfig.ads[footerIdx],
        enabled: document.getElementById('setting-footer-ad-enabled')?.checked || false,
        title: document.getElementById('setting-footer-ad-title')?.value.trim() || '',
        description: document.getElementById('setting-footer-ad-desc')?.value.trim() || '',
        href: document.getElementById('setting-footer-ad-href')?.value.trim() || '',
        cta_label: document.getElementById('setting-footer-ad-cta')?.value.trim() || '',
        image_desktop: document.getElementById('setting-footer-ad-image-desktop')?.value.trim() || '',
        image_mobile: document.getElementById('setting-footer-ad-image-mobile')?.value.trim() || '',
        new_tab: document.getElementById('setting-footer-ad-newtab')?.checked || false
      };

      const res = await API.request('/api/admin/advertising', {
        method: 'POST',
        body: JSON.stringify(advertisingConfig)
      });
      if (!res.status) throw new Error(res.message || 'Lỗi lưu banner quảng cáo chân trang');
      advertisingConfig = res.data;
      if (window.showToast) window.showToast('Đã lưu banner quảng cáo chân trang thành công!');
      else alert('Đã lưu banner quảng cáo chân trang thành công!');
    } catch(err) {
      console.error(err);
      if (window.showToast) window.showToast(err.message || 'Lỗi lưu banner quảng cáo chân trang', 'error');
      else alert(err.message || 'Lỗi lưu banner quảng cáo chân trang');
    } finally {
      saveBtn.disabled = false;
    }
  });

  // --- In-App Update Package Upload Helpers ---
  function setupPackageUpload(inputId, targetInputId, progressId, barId, statusId, type) {
    const fileInput = document.getElementById(inputId);
    const targetInput = document.getElementById(targetInputId);
    const progressEl = document.getElementById(progressId);
    const barEl = document.getElementById(barId);
    const statusEl = document.getElementById(statusId);

    if (!fileInput || !targetInput) return;

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        if (progressEl) progressEl.classList.remove('hidden');
        if (barEl) barEl.style.width = '0%';
        if (statusEl) statusEl.textContent = '0%';

        const res = await API.uploadAppPackage(file, type, (percent) => {
          if (barEl) barEl.style.width = `${percent}%`;
          if (statusEl) statusEl.textContent = `${percent}%`;
        });

        if (res?.status && res.data?.url) {
          targetInput.value = res.data.url;
          if (statusEl) statusEl.textContent = 'Xong ✓';
          if (window.showToast) {
            window.showToast(`Đã tải lên tệp ${res.data.filename} thành công!`);
          } else {
            alert(`Đã tải lên tệp ${res.data.filename} thành công!`);
          }
        } else {
          throw new Error(res?.message || 'Lỗi tải lên tệp');
        }
      } catch (err) {
        if (statusEl) statusEl.textContent = 'Lỗi ✗';
        if (window.showToast) {
          window.showToast(err.message || 'Lỗi tải lên tệp', 'error');
        } else {
          alert(err.message || 'Lỗi tải lên tệp');
        }
      } finally {
        fileInput.value = '';
        setTimeout(() => {
          if (progressEl) progressEl.classList.add('hidden');
        }, 4000);
      }
    });
  }

  setupPackageUpload('upload-apk-mobile', 'setting-app-update-apk-mobile', 'upload-progress-apk-mobile', 'upload-bar-apk-mobile', 'upload-status-apk-mobile', 'apk_mobile');
  setupPackageUpload('upload-apk-tv', 'setting-app-update-apk-tv', 'upload-progress-apk-tv', 'upload-bar-apk-tv', 'upload-status-apk-tv', 'apk_tv');
  setupPackageUpload('upload-ipa-ios', 'setting-app-update-ios', 'upload-progress-ipa-ios', 'upload-bar-ipa-ios', 'upload-status-ipa-ios', 'ios');

  document.getElementById('btn-goto-banners')?.addEventListener('click', () => {
    document.querySelector('[data-tab="tab-banners"]')?.click();
  });

  document.getElementById('btn-save-popup-ad')?.addEventListener('click', async () => {
    const saveBtn = document.getElementById('btn-save-popup-ad');
    try {
      saveBtn.disabled = true;
      const payload = {
        enabled: document.getElementById('setting-popup-ad-enabled')?.checked,
        title: document.getElementById('setting-popup-ad-title')?.value.trim(),
        description: document.getElementById('setting-popup-ad-desc')?.value.trim(),
        href: document.getElementById('setting-popup-ad-href')?.value.trim(),
        image: document.getElementById('setting-popup-ad-image')?.value.trim(),
        cooldown_hours: Number(document.getElementById('setting-popup-ad-cooldown')?.value) || 12,
        new_tab: document.getElementById('setting-popup-ad-newtab')?.checked
      };
      const res = await API.updateAdminPopupBanner(payload);
      if (res?.status) {
        if (window.showToast) window.showToast('Đã lưu cấu hình banner popup thành công!');
        else alert('Đã lưu cấu hình banner popup thành công!');
      } else {
        throw new Error(res?.message || 'Lỗi lưu cấu hình banner popup');
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Lỗi lưu banner popup', 'error');
      else alert(err.message || 'Lỗi lưu banner popup');
    } finally {
      saveBtn.disabled = false;
    }
  });

  document.getElementById('btn-preview-popup-ad')?.addEventListener('click', () => {
    const image = document.getElementById('setting-popup-ad-image')?.value.trim() || '/images/banners/dealpulse-popup.png';
    const href = document.getElementById('setting-popup-ad-href')?.value.trim() || 'https://sandeal.dealpulse.vn/';
    const title = document.getElementById('setting-popup-ad-title')?.value.trim() || 'ĐẠI TIỆC SĂN DEAL SHOPEE MALL';

    document.querySelector('.ad-popup-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'ad-popup-overlay is-active';
    overlay.innerHTML = `
      <div class="ad-popup-modal">
        <button type="button" class="ad-popup-close" aria-label="Đóng">✕</button>
        <a href="${href}" target="_blank" rel="noopener noreferrer" class="ad-popup-link">
          <img src="${image}" alt="${title}" class="ad-popup-img" />
        </a>
      </div>
    `;
    overlay.querySelector('.ad-popup-close').onclick = (e) => { e.stopPropagation(); overlay.remove(); };
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
  });

  document.getElementById('btn-reset-popup-cooldown')?.addEventListener('click', () => {
    try {
      localStorage.removeItem('cineviet_popup_ad_last_shown');
      if (window.showToast) window.showToast('Đã xóa bộ đếm 12 giờ! Khi tải lại trang chủ, popup sẽ xuất hiện ngay.');
      else alert('Đã xóa bộ đếm 12 giờ!');
    } catch (_) {}
  });

  // --- App Open Interstitial Banner Handlers ---
  document.getElementById('btn-save-app-ad')?.addEventListener('click', async () => {
    const saveBtn = document.getElementById('btn-save-app-ad');
    try {
      saveBtn.disabled = true;
      const payload = {
        enabled: document.getElementById('setting-app-ad-enabled')?.checked || false,
        title: document.getElementById('setting-app-ad-title')?.value.trim() || '',
        description: document.getElementById('setting-app-ad-desc')?.value.trim() || '',
        href: document.getElementById('setting-app-ad-href')?.value.trim() || '',
        cta_text: document.getElementById('setting-app-ad-cta')?.value.trim() || '',
        countdown_seconds: Number(document.getElementById('setting-app-ad-countdown')?.value) || 5,
        image_mobile_vertical: document.getElementById('setting-app-ad-image-mobile')?.value.trim() || '',
        image_ipad_vertical: document.getElementById('setting-app-ad-image-ipad-v')?.value.trim() || '',
        image_ipad_landscape: document.getElementById('setting-app-ad-image-ipad-h')?.value.trim() || '',
        cooldown_hours: Number(document.getElementById('setting-app-ad-cooldown')?.value) || 0
      };
      const res = await API.updateAdminAppBanner(payload);
      if (res?.status) {
        if (window.showToast) window.showToast('\u0110\u00e3 l\u01b0u c\u1ea5u h\u00ecnh banner m\u1edf \u1ee9ng d\u1ee5ng th\u00e0nh c\u00f4ng!');
        else alert('\u0110\u00e3 l\u01b0u c\u1ea5u h\u00ecnh banner m\u1edf \u1ee9ng d\u1ee5ng th\u00e0nh c\u00f4ng!');
      } else {
        throw new Error(res?.message || 'L\u1ed7i l\u01b0u c\u1ea5u h\u00ecnh banner \u1ee9ng d\u1ee5ng');
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'L\u1ed7i l\u01b0u banner \u1ee9ng d\u1ee5ng', 'error');
      else alert(err.message || 'L\u1ed7i l\u01b0u banner \u1ee9ng d\u1ee5ng');
    } finally {
      saveBtn.disabled = false;
    }
  });

  function previewAppBanner(type) {
    let img = '';
    let frameStyle = '';
    const href = document.getElementById('setting-app-ad-href')?.value.trim() || 'https://sandeal.dealpulse.vn/';
    const title = document.getElementById('setting-app-ad-title')?.value.trim() || 'Banner \u1ee8ng D\u1ee5ng';
    const countdown = Number(document.getElementById('setting-app-ad-countdown')?.value) || 5;

    if (type === 'mobile') {
      img = document.getElementById('setting-app-ad-image-mobile')?.value.trim() || '/images/banners/banner_mobile_vertical.png';
      frameStyle = 'width: min(340px, 88vw); aspect-ratio: 9 / 16;';
    } else if (type === 'ipad-v') {
      img = document.getElementById('setting-app-ad-image-ipad-v')?.value.trim() || '/images/banners/banner_ipad_vertical.png';
      frameStyle = 'width: min(440px, 88vw); aspect-ratio: 3 / 4;';
    } else {
      img = document.getElementById('setting-app-ad-image-ipad-h')?.value.trim() || '/images/banners/banner_ipad_portrait.png';
      frameStyle = 'width: min(640px, 92vw); aspect-ratio: 9 / 5;';
    }

    document.querySelector('.ad-app-preview-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'ad-app-preview-overlay fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4';
    overlay.innerHTML = `
      <div class="relative flex flex-col items-center justify-center" style="${frameStyle}">
        <div class="relative w-full h-full rounded-3xl overflow-hidden shadow-2xl border border-white/20 bg-slate-950 flex items-center justify-center">
          <a href="${href}" target="_blank" rel="noopener noreferrer" class="block w-full h-full">
            <img src="${img}" alt="${title}" class="w-full h-full object-cover" />
          </a>
          <div class="absolute top-4 right-4 z-10 flex items-center gap-2">
            <span id="preview-countdown-pill" class="px-3.5 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/25 text-white text-xs font-semibold shadow-lg">
              B\u1ecf qua sau ${countdown}s
            </span>
            <button type="button" id="preview-close-btn" class="px-4 py-1.5 rounded-full bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-lg transition-all hidden cursor-pointer flex items-center gap-1">
              B\u1ecf qua &#x2715;
            </button>
          </div>
        </div>
        <p class="text-white/60 text-xs mt-3 text-center">B\u1ea5m ngo\u00e0i v\u00f9ng ho\u1eb7c n\u00fat B\u1ecf qua \u0111\u1ec3 \u0111\u00f3ng b\u1ea3n xem th\u1eed.</p>
      </div>
    `;

    document.body.appendChild(overlay);

    let count = countdown;
    const pill = overlay.querySelector('#preview-countdown-pill');
    const closeBtn = overlay.querySelector('#preview-close-btn');
    const timer = setInterval(() => {
      count--;
      if (count > 0) {
        if (pill) pill.textContent = `B\u1ecf qua sau ${count}s`;
      } else {
        clearInterval(timer);
        if (pill) pill.classList.add('hidden');
        if (closeBtn) closeBtn.classList.remove('hidden');
      }
    }, 1000);

    const closeOverlay = () => {
      clearInterval(timer);
      overlay.remove();
    };

    closeBtn?.addEventListener('click', (e) => { e.stopPropagation(); closeOverlay(); });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeOverlay();
    });
  }

  document.getElementById('btn-preview-app-ad-mobile')?.addEventListener('click', () => previewAppBanner('mobile'));
  document.getElementById('btn-preview-app-ad-ipad-v')?.addEventListener('click', () => previewAppBanner('ipad-v'));
  document.getElementById('btn-preview-app-ad-ipad-h')?.addEventListener('click', () => previewAppBanner('ipad-h'));

  // --- In-App Update Save Handler ---
  document.getElementById('btn-save-app-update')?.addEventListener('click', async () => {
    const saveBtn = document.getElementById('btn-save-app-update');
    try {
      saveBtn.disabled = true;
      const payload = {
        enabled: document.getElementById('setting-app-update-enabled')?.checked || false,
        latest_version: document.getElementById('setting-app-update-version')?.value.trim() || '1.0.1',
        latest_build: Number(document.getElementById('setting-app-update-build')?.value) || 2,
        title: document.getElementById('setting-app-update-title')?.value.trim() || '',
        release_notes: document.getElementById('setting-app-update-notes')?.value.trim() || '',
        apk_mobile_url: document.getElementById('setting-app-update-apk-mobile')?.value.trim() || '',
        apk_tv_url: document.getElementById('setting-app-update-apk-tv')?.value.trim() || '',
        ios_url: document.getElementById('setting-app-update-ios')?.value.trim() || '',
        force_update: document.getElementById('setting-app-update-force')?.checked || false
      };
      const res = await API.updateAdminAppUpdate(payload);
      if (res?.status) {
        if (window.showToast) window.showToast('Đã lưu cấu hình cập nhật ứng dụng thành công!');
        else alert('Đã lưu cấu hình cập nhật ứng dụng thành công!');
      } else {
        throw new Error(res?.message || 'Lỗi lưu cấu hình cập nhật');
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Lỗi lưu cấu hình cập nhật', 'error');
      else alert(err.message || 'Lỗi lưu cấu hình cập nhật');
    } finally {
      saveBtn.disabled = false;
    }
  });

  document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
    const ann = document.getElementById('setting-announcement')?.value.trim();
    const annActive = document.getElementById('setting-announcement-active')?.checked;
    const siteTitle = document.getElementById('setting-site-title')?.value.trim();

    try {
      const res = await API.updateAdminSettings({
        announcement: ann,
        announcement_active: annActive,
        site_title: siteTitle
      });
      window.showToast(res.message || 'Đã lưu cấu hình website thành công!');
    } catch(e) {
      window.showToast('Lỗi lưu cấu hình website', 'error');
    }
  });

  // Flush Cache buttons
  const flushCacheBtns = [document.getElementById('btn-flush-cache'), document.getElementById('btn-flush-cache-2')];
  flushCacheBtns.forEach(btn => {
    btn?.addEventListener('click', async () => {
      btn.disabled = true;
      const res = await API.clearAdminCache();
      btn.disabled = false;
      window.showToast(res.message || 'Đã xóa và làm mới bộ nhớ đệm cache!');
    });
  });

  // --- 7. Tab: Thống Kê & Phân Tích Hệ Thống ---
  async function loadAnalyticsTab() {
    try {
      const stats = await API.getAdminStats();
      if (!stats) return;

      const totalMoviesEl = document.getElementById('analytics-total-movies');
      if (totalMoviesEl) totalMoviesEl.innerText = stats.totalWebMovies == null ? 'Chưa xác minh' : Number(stats.totalWebMovies).toLocaleString('vi-VN');

      const totalSourcesSub = document.getElementById('analytics-total-sources-sub');
      if (totalSourcesSub) {
        const allSources = stats.totalAllSources == null ? 'Chưa xác minh' : Number(stats.totalAllSources).toLocaleString('vi-VN');
        totalSourcesSub.innerText = `2 nguồn: ${allSources} bản ghi`;
      }

      const viewsEl = document.getElementById('analytics-total-views');
      if (viewsEl) viewsEl.innerText = (stats.totalViews || 0).toLocaleString('vi-VN');

      const avgEl = document.getElementById('analytics-avg-rating');
      if (avgEl) avgEl.innerText = stats.avgRating || '--';

      const totalRateEl = document.getElementById('analytics-total-ratings');
      if (totalRateEl) totalRateEl.innerText = `${stats.totalRatings || 0} lượt đánh giá thực tế`;

      const dbSizeEl = document.getElementById('analytics-db-size');
      if (dbSizeEl) {
        dbSizeEl.innerText = stats.dbSizeBytes ? `${(stats.dbSizeBytes / 1024).toFixed(1)} KB` : '-- KB';
      }

      const ramEl = document.getElementById('analytics-ram-usage');
      if (ramEl && stats.memoryUsage?.rss) {
        ramEl.innerText = `${(stats.memoryUsage.rss / (1024 * 1024)).toFixed(1)} MB`;
      }

      const uptimeText = document.getElementById('analytics-uptime-text');
      if (uptimeText) {
        const mins = Math.floor((stats.systemUptime || 0) / 60);
        uptimeText.innerText = `Uptime: ${mins} phút (${Math.floor(mins / 60)} giờ)`;
      }

      // Render Top 10 Movies
      const topTbody = document.getElementById('top-movies-table-body');
      if (topTbody) {
        const topMovies = stats.topMovies || [];
        if (topMovies.length === 0) {
          topTbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-on-surface-variant">Chưa có lượt xem nào được ghi nhận. Dữ liệu sẽ tự động tích lũy khi có khán giả xem phim.</td></tr>`;
        } else {
          const totalViews = stats.totalViews || 1;
          topTbody.innerHTML = topMovies.map((item, idx) => {
            const rank = idx + 1;
            const rankColor = rank === 1 ? 'bg-amber-400 text-black font-black' : rank === 2 ? 'bg-slate-300 text-black font-black' : rank === 3 ? 'bg-amber-600 text-white font-black' : 'bg-surface-container-highest text-on-surface-variant font-bold';
            const pct = Math.min(100, Math.round(((item.views || 0) / totalViews) * 100)) || 0;
            return `
              <tr class="hover:bg-surface-container-high/40 transition-colors">
                <td class="p-3 text-center">
                  <span class="w-7 h-7 rounded-full inline-flex items-center justify-center text-xs ${rankColor}">${rank}</span>
                </td>
                <td class="p-3">
                  <div class="font-bold text-on-surface">${escapeHtml(item.slug)}</div>
                  <span class="text-xs text-on-surface-variant font-mono">ID: ${escapeHtml(item.slug)}</span>
                </td>
                <td class="p-3 text-right font-display font-bold text-primary text-base">${(Number(item.views) || 0).toLocaleString('vi-VN')}</td>
                <td class="p-3">
                  <div class="flex items-center gap-3">
                    <div class="flex-1 bg-surface-container-highest rounded-full h-2.5 overflow-hidden">
                      <div class="bg-primary h-2.5 rounded-full transition-all duration-500" style="width: ${Math.max(5, pct)}%"></div>
                    </div>
                    <span class="text-xs font-mono font-bold text-on-surface-variant w-10 text-right">${pct}%</span>
                  </div>
                </td>
                <td class="p-3 text-right">
                  <a href="/phim/${pathSegment(item.slug)}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1 rounded-lg bg-surface-container-highest hover:bg-surface-container text-on-surface text-xs font-semibold inline-flex items-center gap-1 transition-colors">
                    <span class="material-symbols-outlined text-[14px]">visibility</span> Mở
                  </a>
                </td>
              </tr>
            `;
          }).join('');
        }
      }

      // Render Activity Stream (live history)
      const activityTbody = document.getElementById('activity-stream-table-body');
      if (activityTbody) {
        const activities = stats.recentActivity || [];
        if (activities.length === 0) {
          activityTbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-on-surface-variant">Chưa có luồng phát phim nào gần đây</td></tr>`;
        } else {
          activityTbody.innerHTML = activities.map(act => {
            const timeStr = act.updated_at ? new Date(act.updated_at).toLocaleString('vi-VN') : 'Vừa xong';
            const progSec = Math.floor(act.progress || 0);
            const durSec = Math.floor(act.duration || 0);
            const progPct = durSec > 0 ? Math.round((progSec / durSec) * 100) : 0;
            return `
              <tr class="hover:bg-surface-container-high/40 transition-colors">
                <td class="p-3 text-xs text-on-surface-variant font-mono">${timeStr}</td>
                <td class="p-3">
                  <div class="font-bold text-on-surface">${escapeHtml(act.movie_name || act.movie_slug)}</div>
                  <span class="text-xs text-on-surface-variant font-mono">${escapeHtml(act.movie_slug)}</span>
                </td>
                <td class="p-3">
                  <span class="px-2 py-0.5 rounded text-xs font-bold bg-primary/10 text-primary">${escapeHtml(act.episode_name || act.episode_slug || 'Tập 01')}</span>
                </td>
                <td class="p-3 text-right">
                  <span class="text-xs font-mono font-semibold text-on-surface">${progPct}%</span>
                  <div class="text-[11px] text-on-surface-variant">${progSec}s / ${durSec}s</div>
                </td>
                <td class="p-3 text-right">
                  <a href="/xem-phim/${pathSegment(act.movie_slug)}/${pathSegment(act.episode_slug || 'tap-1')}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1 rounded-lg bg-surface-container-highest hover:bg-surface-container text-on-surface text-xs font-semibold inline-flex items-center gap-1 transition-colors">
                    <span class="material-symbols-outlined text-[14px]">play_arrow</span> Xem
                  </a>
                </td>
              </tr>
            `;
          }).join('');
        }
      }
    } catch(e) {
      console.error('[TTPhim Admin] Failed to load analytics:', e);
    }
  }

  document.getElementById('btn-refresh-analytics')?.addEventListener('click', () => {
    window.showToast('Đang làm mới thống kê...');
    loadAnalyticsTab();
  });

  // --- 8. Tab: Quản Lý Đa Nguồn Phim & Đồng Bộ ---
  window.renderAdminSources = function(sources) {
    if (!sources) return;
    const totalWeb = document.getElementById('sources-total-web');
    if (totalWeb) totalWeb.innerText = sources.total_web_movies == null ? 'Chưa xác minh' : Number(sources.total_web_movies).toLocaleString('vi-VN');

    const totalSub = document.getElementById('sources-total-all-sub');
    if (totalSub) {
      const all = sources.total_all_sources == null ? 'Chưa xác minh' : Number(sources.total_all_sources).toLocaleString('vi-VN');
      totalSub.innerText = `Tổng 3 nguồn: ${all} bản ghi`;
    }

    // KKPhim
    const kkStat = document.getElementById('sources-stat-kkphim');
    if (kkStat) kkStat.innerText = sources.kkphim?.total_movies ? Number(sources.kkphim.total_movies).toLocaleString('vi-VN') : '--';
    const kkCount = document.getElementById('source-kkphim-count');
    if (kkCount) kkCount.innerText = sources.kkphim?.total_movies ? `${Number(sources.kkphim.total_movies).toLocaleString('vi-VN')} phim` : '-- phim';
    const kkPages = document.getElementById('source-kkphim-pages');
    if (kkPages) kkPages.innerText = sources.kkphim?.total_pages ? `${Number(sources.kkphim.total_pages).toLocaleString('vi-VN')} trang` : '-- trang';
    const kkStatus = document.getElementById('source-kkphim-status');
    if (kkStatus) kkStatus.innerText = sources.kkphim?.status === 'online' ? 'Đã Kết Nối' : 'Chưa kết nối';

    // ViCDN
    const viStat = document.getElementById('sources-stat-vicdn');
    if (viStat) viStat.innerText = sources.vicdn?.total_movies ? Number(sources.vicdn.total_movies).toLocaleString('vi-VN') : '--';
    const viTotal = document.getElementById('source-vicdn-total');
    if (viTotal) viTotal.innerText = sources.vicdn?.total_movies ? `${Number(sources.vicdn.total_movies).toLocaleString('vi-VN')} phim` : '-- phim';
    const viCount = document.getElementById('source-vicdn-count');
    if (viCount) viCount.innerText = sources.vicdn?.indexed_movies ? `${Number(sources.vicdn.indexed_movies).toLocaleString('vi-VN')} phim` : '-- phim';
    const viPages = document.getElementById('source-vicdn-pages');
    if (viPages) viPages.innerText = sources.vicdn?.total_pages ? `${Number(sources.vicdn.total_pages).toLocaleString('vi-VN')} trang` : '-- trang';

    // NguonC
    const ncStat = document.getElementById('sources-stat-nguonc');
    if (ncStat) ncStat.innerText = sources.nguonc?.total_movies ? Number(sources.nguonc.total_movies).toLocaleString('vi-VN') : '--';
    const ncTotal = document.getElementById('source-nguonc-total');
    if (ncTotal) ncTotal.innerText = sources.nguonc?.total_movies ? `${Number(sources.nguonc.total_movies).toLocaleString('vi-VN')} phim` : '-- phim';
    const ncCount = document.getElementById('source-nguonc-count');
    if (ncCount) ncCount.innerText = sources.nguonc?.indexed_movies ? `${Number(sources.nguonc.indexed_movies).toLocaleString('vi-VN')} phim` : '-- phim';
    const ncPages = document.getElementById('source-nguonc-pages');
    if (ncPages) ncPages.innerText = sources.nguonc?.total_pages ? `${Number(sources.nguonc.total_pages).toLocaleString('vi-VN')} trang` : '-- trang';
    const ncStatus = document.getElementById('source-nguonc-status');
    if (ncStatus) ncStatus.innerText = sources.nguonc?.status === 'online' ? 'Đã Kết Nối' : 'Chưa kết nối';
  };

  async function loadSourcesTab() {
    try {
      const sources = await API.getAdminSources();
      if (!sources) return;

      window.renderAdminSources(sources);
    } catch(e) {
      console.error('[TTPhim Admin] Failed to load sources:', e);
    }
  }

  // Sync Sources
  const syncBtn = document.getElementById('btn-sync-sources');
  const syncIcon = document.getElementById('icon-sync-sources');
  syncBtn?.addEventListener('click', async () => {
    try {
      syncBtn.disabled = true;
      if (syncIcon) syncIcon.classList.add('animate-spin');
      window.showToast('Đang kết nối và đồng bộ danh mục từ ViCDN & NguonC...');
      const res = await API.syncAdminSources();
      window.showToast(res?.message || 'Đã đồng bộ xong danh mục đa nguồn!');
      await loadSourcesTab();
    } catch(e) {
      window.showToast('Lỗi khi đồng bộ nguồn phim', 'error');
    } finally {
      syncBtn.disabled = false;
      if (syncIcon) syncIcon.classList.remove('animate-spin');
    }
  });

  // Ping Sources
  const pingBtn = document.getElementById('btn-ping-sources');
  pingBtn?.addEventListener('click', async () => {
    try {
      pingBtn.disabled = true;
      const t0 = performance.now();
      const sources = await API.getAdminSources();
      if (!sources) throw Error('Không tải được trạng thái nguồn');
      window.renderAdminSources(sources);
      const latency = Math.round(performance.now() - t0);
      window.showToast(`Đã kiểm tra nguồn (~${latency}ms). KKPhim: ${sources.kkphim?.status === 'online' ? 'kết nối thành công' : 'chưa xác minh / dữ liệu cũ'}.`);
    } catch(e) {
      window.showToast('Lỗi khi kiểm tra kết nối nguồn phim', 'error');
    } finally {
      pingBtn.disabled = false;
    }
  });

  // Quick refresh
  document.getElementById('btn-quick-refresh')?.addEventListener('click', () => {
    window.showToast('Đang làm mới dữ liệu...');
    loadDashboardStats();
    loadUsers();
    loadReports();
    loadComments();
    loadFeaturedMovies();
    loadSettingsTab();
    loadAnalyticsTab();
    loadSourcesTab();
  });

  // Initial fetch
  loadDashboardStats();
  loadUsers();
  loadReports();
  loadComments();
  loadFeaturedMovies();
  loadAnalyticsTab();
  loadSourcesTab();
});

