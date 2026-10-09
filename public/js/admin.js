// TTPhim - Admin Dashboard Controller
document.addEventListener('DOMContentLoaded', async () => {
  let currentUser = null;
  let allUsers = [];
  let allReports = [];
  let allComments = [];
  let currentSettings = null;

  // Check auth
  try {
    currentUser = await API.getMe();
    if (!currentUser || currentUser.role !== 'admin') {
      console.warn('[TTPhim Admin] Current user is not admin:', currentUser);
      const switchAdmin = confirm('Bạn chưa đăng nhập với tài khoản Quản Trị Viên (Admin).\nBạn có muốn tự động đăng nhập với tài khoản admin (admin@TTPhim.vn / admin123) không?');
      if (switchAdmin) {
        const loginRes = await API.login('admin@TTPhim.vn', 'admin123');
        if (loginRes.status) {
          window.location.reload();
          return;
        }
      } else {
        window.location.href = '/dang-nhap';
        return;
      }
    }
  } catch(e) {
    console.error('[TTPhim Admin] Auth check error:', e);
  }

  // Update Admin Header
  if (currentUser) {
    const nameEl = document.getElementById('admin-header-name');
    const avatarEl = document.getElementById('admin-header-avatar');
    if (nameEl) nameEl.innerText = currentUser.name || 'Admin';
    if (avatarEl && currentUser.avatar) avatarEl.src = currentUser.avatar;
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
        totalMoviesEl.innerText = (stats.totalWebMovies || 30275).toLocaleString('vi-VN');
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
          <img src="${u.avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAPbHo0WbRHUQwGQOjadraD_tAk7XQUGjJQPQDSvK5RZfRCVSUufHkI5ytr1RnoudWNDKzqxm86HwkNOfZhdJ6gH5wUBF8Hu6sx3uE-8dvCv61CH5Sl6_6rcVCCUeOGM4Ub3reCBWB2-ittRPKQslAi-yOnv0WlNzjOskqtQAYGefgmgohy9WNwv1lISujIp8aIK3M0rynROP6yxRZcTMSyWswRJsdzf7K4DhDzjq8'}" class="w-9 h-9 rounded-full object-cover shrink-0 ring-1 ring-white/10" />
          <div class="min-w-0">
            <div class="font-bold text-on-surface truncate">${u.name}</div>
            <div class="text-xs text-on-surface-variant font-mono">${u.id}</div>
          </div>
        </td>
        <td class="p-4 font-mono text-on-surface">${u.email}</td>
        <td class="p-4">
          <span class="px-2.5 py-1 rounded-full text-xs font-bold ${u.role === 'admin' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-surface-container-highest text-on-surface-variant'}">
            ${u.role === 'admin' ? 'Quản Trị Viên' : 'Khán Giả'}
          </span>
        </td>
        <td class="p-4 text-xs text-on-surface-variant">${new Date(u.created_at || '2023-01-15').toLocaleDateString('vi-VN')}</td>
        <td class="p-4 text-right space-x-1.5 whitespace-nowrap">
          <button class="btn-toggle-role px-2.5 py-1 rounded-lg bg-surface-container-highest hover:bg-primary/20 text-on-surface hover:text-primary text-xs font-semibold transition-colors cursor-pointer" data-id="${u.id}" data-role="${u.role}">
            ${u.role === 'admin' ? 'Hạ Quyền' : 'Lên Admin'}
          </button>
          ${u.id !== 'usr_admin_01' ? `
            <button class="btn-delete-user px-2 py-1 rounded-lg hover:bg-error/20 text-on-surface-variant hover:text-error text-xs transition-colors cursor-pointer" title="Xóa tài khoản" data-id="${u.id}" data-name="${u.name}">
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
          <div class="font-bold text-on-surface">${r.movie_slug}</div>
          <span class="text-xs text-primary font-semibold">Tập: ${r.episode_slug || 'Full'}</span>
        </td>
        <td class="p-4 text-on-surface">${r.reason}</td>
        <td class="p-4 font-mono text-xs text-on-surface-variant">${r.user_email || 'guest'}</td>
        <td class="p-4 text-xs text-on-surface-variant">${new Date(r.created_at).toLocaleString('vi-VN')}</td>
        <td class="p-4">
          <span class="px-2.5 py-1 rounded-full text-xs font-bold ${r.status === 'resolved' ? 'bg-success/20 text-success border border-success/30' : 'bg-error/20 text-error border border-error/30'}">
            ${r.status === 'resolved' ? 'Đã Xử Lý' : 'Chờ Xử Lý'}
          </span>
        </td>
        <td class="p-4 text-right whitespace-nowrap space-x-1.5">
          <a href="/xem-phim/${r.movie_slug}/${r.episode_slug || 'tap-1'}" target="_blank" class="px-2.5 py-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-container text-on-surface text-xs font-semibold inline-flex items-center gap-1 transition-colors" title="Xem thử tập phim">
            <span class="material-symbols-outlined text-[14px] text-primary">play_circle</span> Xem Thử
          </a>
          <button class="btn-toggle-report px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${r.status === 'resolved' ? 'bg-surface-container-highest text-on-surface-variant hover:text-on-surface' : 'bg-success text-white hover:brightness-110'}" data-id="${r.id}" data-status="${r.status}">
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
          <img src="${c.user_avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAPbHo0WbRHUQwGQOjadraD_tAk7XQUGjJQPQDSvK5RZfRCVSUufHkI5ytr1RnoudWNDKzqxm86HwkNOfZhdJ6gH5wUBF8Hu6sx3uE-8dvCv61CH5Sl6_6rcVCCUeOGM4Ub3reCBWB2-ittRPKQslAi-yOnv0WlNzjOskqtQAYGefgmgohy9WNwv1lISujIp8aIK3M0rynROP6yxRZcTMSyWswRJsdzf7K4DhDzjq8'}" class="w-7 h-7 rounded-full object-cover shrink-0" />
          <span class="font-bold text-on-surface truncate max-w-[140px]">${c.user_name}</span>
        </td>
        <td class="p-4 text-xs font-semibold text-secondary-container truncate max-w-[160px]">${c.movie_slug}</td>
        <td class="p-4 max-w-xs truncate text-on-surface">${c.content}</td>
        <td class="p-4 text-xs text-on-surface-variant">${c.created_at || 'Vừa xong'}</td>
        <td class="p-4 font-bold text-xs">${c.likes || 0} ❤️</td>
        <td class="p-4 text-right">
          <button class="btn-delete-comment px-3 py-1.5 rounded-lg bg-error/20 hover:bg-error text-error hover:text-white text-xs font-bold transition-all cursor-pointer" data-id="${c.id}">
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

  // --- 5. Tab: Tra Cứu & Ghim Phim Hot (Đa Nguồn: TTPhim, ViCDN, NguonC) ---
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
        
        let sourceBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">TTPhim</span>';
        if ((typeof item === 'object' && item.source === 'vicdn') || slug.startsWith('tv-') || slug.startsWith('movie-')) {
          sourceBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">ViCDN Song Ngữ</span>';
        } else if (typeof item === 'object' && item.source === 'nguonc') {
          sourceBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">NguonC Stream</span>';
        }

        const isBilingual = (typeof item === 'object' && item.has_song_ngu) || (typeof item === 'object' && item.source === 'vicdn') || slug.startsWith('tv-');
        const songNguBadge = isBilingual ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">Song Ngữ</span>' : '';

        return `
          <div class="flex items-center gap-3 p-2.5 rounded-xl bg-surface-container-high border border-secondary/30 hover:border-secondary/60 transition-all shadow-sm">
            <img src="${poster}" class="w-10 h-14 object-cover rounded-lg bg-surface-container shrink-0 border border-white/5" onerror="this.src='/favicon.ico'" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 flex-wrap">
                ${sourceBadge}
                ${songNguBadge}
              </div>
              <div class="font-bold text-on-surface text-xs truncate mt-1" title="${name}">${name}</div>
              <div class="text-[11px] text-on-surface-variant font-mono truncate">${slug}</div>
            </div>
            <div class="flex flex-col gap-1 shrink-0">
              <a href="/phim/${slug}" target="_blank" class="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-on-surface text-center transition-colors" title="Xem thử">
                <span class="material-symbols-outlined text-[16px]">visibility</span>
              </a>
              <button class="btn-unpin-slug p-1.5 rounded-lg hover:bg-error/20 text-on-surface-variant hover:text-error transition-colors cursor-pointer" data-slug="${slug}" title="Bỏ ghim">
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
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-on-surface-variant"><span class="animate-spin inline-block mr-2">⏳</span> Đang tìm kiếm từ các nguồn phim (${sourceFilter === 'all' ? 'TTPhim, ViCDN Song Ngữ, NguonC' : sourceFilter.toUpperCase()})...</td></tr>`;

    try {
      const items = await API.searchAdminMovies(kw, sourceFilter);
      if (!items || items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-on-surface-variant">Không tìm thấy phim phù hợp với từ khóa "${kw}"</td></tr>`;
        return;
      }

      currentSettings = await API.getAdminSettings();
      const featured = currentSettings?.featured_slugs || [];
      const featuredSlugsList = featured.map(f => typeof f === 'string' ? f : f?.slug);

      tbody.innerHTML = items.map(m => {
        const isPinned = featuredSlugsList.includes(m.slug);
        
        let sourceBadgeHtml = '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>TTPhim Core</span>';
        if (m.source === 'vicdn' || (m.slug && m.slug.startsWith('tv-'))) {
          sourceBadgeHtml = '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>ViCDN Song Ngữ</span>';
        } else if (m.source === 'nguonc') {
          sourceBadgeHtml = '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span>NguonC Stream VIP</span>';
        }

        const songNguTag = (m.has_song_ngu || m.source === 'vicdn' || (m.slug && m.slug.startsWith('tv-')))
          ? '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">Song Ngữ</span>'
          : (m.lang ? `<span class="px-2 py-0.5 rounded text-[11px] bg-surface-container-highest text-on-surface-variant">${m.lang}</span>` : '');

        return `
          <tr class="hover:bg-surface-container-high/40 transition-colors">
            <td class="p-3">
              <div class="flex items-center gap-3">
                <img src="${m.poster_url || m.thumb_url || '/favicon.ico'}" class="w-9 h-13 object-cover rounded bg-surface-container shrink-0 border border-white/5" onerror="this.src='/favicon.ico'" />
                <div class="min-w-0">
                  <div class="font-bold text-on-surface text-xs sm:text-sm truncate max-w-[200px]" title="${m.name}">${m.name}</div>
                  <div class="text-[11px] text-on-surface-variant font-mono truncate max-w-[200px]">${m.slug}</div>
                </div>
              </div>
            </td>
            <td class="p-3 whitespace-nowrap">
              ${sourceBadgeHtml}
            </td>
            <td class="p-3 text-xs text-on-surface-variant truncate max-w-[150px] font-medium" title="${m.origin_name || ''}">
              ${m.origin_name || '--'}
            </td>
            <td class="p-3 text-xs whitespace-nowrap">
              <span class="font-semibold text-on-surface">${m.year || '--'}</span>
              ${m.episode_current ? `<span class="text-on-surface-variant text-[11px] block">${m.episode_current}</span>` : ''}
            </td>
            <td class="p-3">
              <div class="flex flex-wrap gap-1 items-center">
                <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-primary/20 text-primary">${m.quality || 'FHD'}</span>
                ${songNguTag}
              </div>
            </td>
            <td class="p-3 text-right space-x-2 whitespace-nowrap">
              <a href="/phim/${m.slug}" target="_blank" class="px-2.5 py-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-container text-on-surface text-xs font-semibold inline-flex items-center gap-1 transition-colors">
                <span class="material-symbols-outlined text-[14px]">visibility</span> Xem
              </a>
              <button class="btn-pin-movie px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${isPinned ? 'bg-secondary text-black shadow-md shadow-secondary/30' : 'bg-surface-container-highest hover:bg-secondary/20 hover:text-secondary text-on-surface'}" data-slug="${m.slug}">
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
              source: targetMovie.source || 'TTPhim',
              source_name: targetMovie.source_name || (targetMovie.source === 'vicdn' ? 'ViCDN Song Ngữ' : (targetMovie.source === 'nguonc' ? 'NguonC Stream VIP' : 'TTPhim Core'))
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
  async function loadSettingsTab() {
    try {
      currentSettings = await API.getAdminSettings();
      if (!currentSettings) return;

      const annEl = document.getElementById('setting-announcement');
      const annActiveEl = document.getElementById('setting-announcement-active');
      const titleEl = document.getElementById('setting-site-title');

      if (annEl) annEl.value = currentSettings.announcement || '';
      if (annActiveEl) annActiveEl.checked = Boolean(currentSettings.announcement_active);
      if (titleEl) titleEl.value = currentSettings.site_title || 'TTPhim - Xem Phim Online Chuẩn Cinema 4K';
    } catch(e) {
      console.error('[TTPhim Admin] Failed to load settings:', e);
    }
  }

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
      if (totalMoviesEl) totalMoviesEl.innerText = (stats.totalWebMovies || 30275).toLocaleString('vi-VN');

      const totalSourcesSub = document.getElementById('analytics-total-sources-sub');
      if (totalSourcesSub) {
        const allSources = (stats.totalAllSources || 64353).toLocaleString('vi-VN');
        totalSourcesSub.innerText = `3 nguồn: ${allSources} bản ghi`;
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
                  <div class="font-bold text-on-surface">${item.slug}</div>
                  <span class="text-xs text-on-surface-variant font-mono">ID: ${item.slug}</span>
                </td>
                <td class="p-3 text-right font-display font-bold text-primary text-base">${(item.views || 0).toLocaleString('vi-VN')}</td>
                <td class="p-3">
                  <div class="flex items-center gap-3">
                    <div class="flex-1 bg-surface-container-highest rounded-full h-2.5 overflow-hidden">
                      <div class="bg-primary h-2.5 rounded-full transition-all duration-500" style="width: ${Math.max(5, pct)}%"></div>
                    </div>
                    <span class="text-xs font-mono font-bold text-on-surface-variant w-10 text-right">${pct}%</span>
                  </div>
                </td>
                <td class="p-3 text-right">
                  <a href="/phim/${item.slug}" target="_blank" class="px-2.5 py-1 rounded-lg bg-surface-container-highest hover:bg-surface-container text-on-surface text-xs font-semibold inline-flex items-center gap-1 transition-colors">
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
                  <div class="font-bold text-on-surface">${act.movie_name || act.movie_slug}</div>
                  <span class="text-xs text-on-surface-variant font-mono">${act.movie_slug}</span>
                </td>
                <td class="p-3">
                  <span class="px-2 py-0.5 rounded text-xs font-bold bg-primary/10 text-primary">${act.episode_name || act.episode_slug || 'Tập 01'}</span>
                </td>
                <td class="p-3 text-right">
                  <span class="text-xs font-mono font-semibold text-on-surface">${progPct}%</span>
                  <div class="text-[11px] text-on-surface-variant">${progSec}s / ${durSec}s</div>
                </td>
                <td class="p-3 text-right">
                  <a href="/xem-phim/${act.movie_slug}/${act.episode_slug || 'tap-1'}" target="_blank" class="px-2.5 py-1 rounded-lg bg-surface-container-highest hover:bg-surface-container text-on-surface text-xs font-semibold inline-flex items-center gap-1 transition-colors">
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
  async function loadSourcesTab() {
    try {
      const sources = await API.getAdminSources();
      if (!sources) return;

      // Telemetry 4 Cards
      const totalWebEl = document.getElementById('sources-total-web');
      if (totalWebEl) totalWebEl.innerText = (sources.total_web_movies || 30275).toLocaleString('vi-VN');

      const totalAllSubEl = document.getElementById('sources-total-all-sub');
      if (totalAllSubEl) totalAllSubEl.innerText = `Tổng 3 nguồn: ${(sources.total_all_sources || 64353).toLocaleString('vi-VN')} bản ghi`;

      const statTTPhimEl = document.getElementById('sources-stat-TTPhim');
      if (statTTPhimEl) statTTPhimEl.innerText = (sources.TTPhim?.total_movies || 30275).toLocaleString('vi-VN');

      const statTTPhimSubEl = document.getElementById('sources-stat-TTPhim-sub');
      if (statTTPhimSubEl) statTTPhimSubEl.innerText = `${(sources.TTPhim?.total_pages || 1262).toLocaleString('vi-VN')} trang (phimapi.com)`;

      const statVicdnEl = document.getElementById('sources-stat-vicdn');
      if (statVicdnEl) statVicdnEl.innerText = (sources.vicdn?.total_movies || 628).toLocaleString('vi-VN');

      const statVicdnSubEl = document.getElementById('sources-stat-vicdn-sub');
      if (statVicdnSubEl) statVicdnSubEl.innerText = `${(sources.vicdn?.total_pages || 63).toLocaleString('vi-VN')} trang (vicdn.cc)`;

      const statNguoncEl = document.getElementById('sources-stat-nguonc');
      if (statNguoncEl) statNguoncEl.innerText = (sources.nguonc?.total_movies || 33450).toLocaleString('vi-VN');

      const statNguoncSubEl = document.getElementById('sources-stat-nguonc-sub');
      if (statNguoncSubEl) statNguoncSubEl.innerText = `${(sources.nguonc?.total_pages || 3345).toLocaleString('vi-VN')} trang (nguonc.com)`;

      // Detailed 3 Provider Cards
      // 1. TTPhim
      const TTPhimCountEl = document.getElementById('source-TTPhim-count');
      if (TTPhimCountEl) TTPhimCountEl.innerText = `${(sources.TTPhim?.total_movies || 30275).toLocaleString('vi-VN')} phim`;
      const TTPhimPagesEl = document.getElementById('source-TTPhim-pages');
      if (TTPhimPagesEl) TTPhimPagesEl.innerText = `${(sources.TTPhim?.total_pages || 1262).toLocaleString('vi-VN')} trang`;

      // 2. ViCDN
      const vicdnTotalEl = document.getElementById('source-vicdn-total');
      if (vicdnTotalEl) vicdnTotalEl.innerText = `${(sources.vicdn?.total_movies || 628).toLocaleString('vi-VN')} phim`;
      const vicdnEl = document.getElementById('source-vicdn-count');
      if (vicdnEl) vicdnEl.innerText = `${sources.vicdn?.indexed_movies || 0} phim`;
      const vicdnPagesEl = document.getElementById('source-vicdn-pages');
      if (vicdnPagesEl) vicdnPagesEl.innerText = `${(sources.vicdn?.total_pages || 63).toLocaleString('vi-VN')} trang`;

      // 3. NguonC
      const nguoncTotalEl = document.getElementById('source-nguonc-total');
      if (nguoncTotalEl) nguoncTotalEl.innerText = `${(sources.nguonc?.total_movies || 33450).toLocaleString('vi-VN')} phim`;
      const nguoncEl = document.getElementById('source-nguonc-count');
      if (nguoncEl) nguoncEl.innerText = `${sources.nguonc?.indexed_movies || 0} phim`;
      const nguoncPagesEl = document.getElementById('source-nguonc-pages');
      if (nguoncPagesEl) nguoncPagesEl.innerText = `${(sources.nguonc?.total_pages || 3345).toLocaleString('vi-VN')} trang`;
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
      await API.getAdminSources();
      const latency = Math.round(performance.now() - t0);
      window.showToast(`⚡ Kiểm tra kết nối thành công: TTPhim, ViCDN, NguonC hoạt động tốt (~${latency}ms)`);
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

