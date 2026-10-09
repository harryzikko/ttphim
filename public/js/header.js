// TTPhim - Header & Global UI Controller
(function() {
  // Toast Helper
  window.showToast = function(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    const icon = type === 'error' ? 'error' : (type === 'info' ? 'info' : 'check_circle');
    const color = type === 'error' ? 'text-error' : (type === 'info' ? 'text-secondary' : 'text-primary');
    
    toast.innerHTML = `
      <span class="material-symbols-outlined ${color} text-[20px]">${icon}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast-hide');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  };

  document.addEventListener('DOMContentLoaded', async () => {
    initNavigation();
    initMobileMenu();
    initSearch();
    initProfile();
    initNotifications();
    initAnnouncement();
  });

  async function initAnnouncement() {
    try {
      const res = await API.getSiteAnnouncement();
      if (res && res.announcement_active && res.announcement) {
        if (document.getElementById('site-announcement-bar')) return;
        const banner = document.createElement('div');
        banner.id = 'site-announcement-bar';
        banner.className = 'w-full bg-gradient-to-r from-red-700 via-amber-600 to-red-700 text-white text-xs font-semibold py-1.5 px-4 text-center flex items-center justify-center gap-2 shadow z-[60] relative';
        banner.innerHTML = `
          <span class="material-symbols-outlined text-[16px] animate-pulse">campaign</span>
          <span class="truncate max-w-2xl">${res.announcement}</span>
          <button id="close-announcement-btn" class="ml-2 hover:opacity-75 cursor-pointer text-white/80 hover:text-white p-0.5">
            <span class="material-symbols-outlined text-[14px]">close</span>
          </button>
        `;
        document.body.prepend(banner);
        banner.querySelector('#close-announcement-btn').onclick = () => banner.remove();
      }
    } catch(e) {}
  }


  // Highlight active navigation tab & handle dropdowns
  function initNavigation() {
    const currentPath = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    const typeParam = searchParams.get('type');
    const catParam = searchParams.get('category');
    const countryParam = searchParams.get('country');

    const navLinks = document.querySelectorAll('header nav a, header nav button[data-path]');
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      const dataPath = link.getAttribute('data-path');
      link.classList.remove('bg-surface-container', 'text-on-surface', 'font-semibold', 'rounded-lg');
      link.classList.add('text-on-surface-variant');

      let isActive = false;
      if (currentPath === '/' && (href === '/' || href === '#' || dataPath === 'trang-chu')) {
        isActive = true;
      } else if (dataPath === 'tv-shows' && (typeParam === 'tv-shows' || currentPath === '/tv-shows')) {
        isActive = true;
      } else if (dataPath === 'the-loai' && (catParam || currentPath.startsWith('/the-loai'))) {
        isActive = true;
      } else if (dataPath === 'quoc-gia' && (countryParam || currentPath.startsWith('/quoc-gia'))) {
        isActive = true;
      } else if (currentPath === '/kham-pha') {
        if (typeParam && href && href.includes(`type=${typeParam}`)) {
          isActive = true;
        } else if (!typeParam && !catParam && !countryParam && (href === '/kham-pha' || href === '#kham-pha' || dataPath === 'kham-pha')) {
          isActive = true;
        }
      } else if (href && currentPath.startsWith(href) && href !== '/') {
        isActive = true;
      }

      if (isActive) {
        link.classList.add('bg-surface-container', 'text-on-surface', 'font-semibold', 'rounded-lg');
        link.classList.remove('text-on-surface-variant');
      }
    });

    // Fix Bảng xếp hạng link & smooth scrolling
    const rankLinks = document.querySelectorAll('header nav a[data-path="bang-xep-hang"], a[href*="bang-xep-hang"]');
    rankLinks.forEach(link => {
      link.setAttribute('href', '/#bang-xep-hang');
      link.addEventListener('click', (e) => {
        if (window.location.pathname === '/' || window.location.pathname === '') {
          e.preventDefault();
          const target = document.getElementById('bang-xep-hang');
          if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
            history.replaceState(null, '', '/#bang-xep-hang');
          }
        }
      });
    });

    if (window.location.hash === '#bang-xep-hang') {
      setTimeout(() => {
        document.getElementById('bang-xep-hang')?.scrollIntoView({ behavior: 'smooth' });
      }, 500);
    }

    // Dropdown click & outside-click support for touch/mobile
    const dropdownBtns = document.querySelectorAll('header nav div.relative.group button');
    dropdownBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = btn.nextElementSibling;
        if (menu) {
          const isHidden = menu.classList.contains('hidden');
          // Close other open menus
          document.querySelectorAll('header nav div.relative.group > div').forEach(m => {
            if (m !== menu) m.classList.add('hidden');
          });
          if (isHidden) {
            menu.classList.remove('hidden');
          } else {
            menu.classList.add('hidden');
          }
        }
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('header nav div.relative.group')) {
        document.querySelectorAll('header nav div.relative.group > div').forEach(m => {
          m.classList.add('hidden');
        });
      }
    });
  }

  // Live Instant Search with Dropdown
  function initSearch() {
    const searchInputs = document.querySelectorAll('header input[type="text"]');
    searchInputs.forEach(input => {
      const wrapper = input.parentElement;
      if (!wrapper) return;

      // Create search results dropdown container
      const dropdown = document.createElement('div');
      dropdown.className = 'absolute top-full mt-2 left-0 right-0 w-80 lg:w-96 bg-surface-container-high/95 backdrop-blur-2xl rounded-xl shadow-2xl p-2 z-50 hidden border border-white/10 flex flex-col gap-1 max-h-[420px] overflow-y-auto';
      dropdown.id = 'header-search-results';
      wrapper.appendChild(dropdown);

      let debounceTimer = null;

      input.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();
        if (!query) {
          dropdown.classList.add('hidden');
          dropdown.innerHTML = '';
          return;
        }

        debounceTimer = setTimeout(async () => {
          dropdown.innerHTML = `<div class="p-3 text-center text-on-surface-variant text-body-sm flex items-center justify-center gap-2"><span class="w-4 h-4 rounded-full border-2 border-primary-container border-t-transparent animate-spin"></span> Đang tìm kiếm...</div>`;
          dropdown.classList.remove('hidden');

          try {
            const results = await API.quickSearch(query);
            if (!results || results.length === 0) {
              dropdown.innerHTML = `<div class="p-4 text-center text-on-surface-variant text-body-sm">Không tìm thấy phim phù hợp cho "<strong>${query}</strong>"</div>`;
              return;
            }

            dropdown.innerHTML = `
              <div class="px-2 py-1 text-label-badge text-on-surface-variant uppercase flex justify-between items-center">
                <span>Gợi ý tìm kiếm</span>
                <span class="text-primary">${results.length} kết quả</span>
              </div>
              ${results.map(item => `
                <a href="/phim/${item.slug}" class="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-container-highest transition-colors group">
                  <img src="${item.poster_url || item.thumb_url}" class="w-10 h-14 object-cover rounded bg-surface-container shrink-0 group-hover:scale-105 transition-transform" />
                  <div class="flex-1 min-w-0">
                    <h4 class="font-label-md text-label-md text-on-surface group-hover:text-primary transition-colors truncate">${item.name}</h4>
                    <p class="font-body-sm text-[12px] text-on-surface-variant truncate">${item.origin_name || item.year}</p>
                    <div class="flex items-center gap-1.5 mt-0.5">
                      ${item.has_song_ngu ? `
                        <span class="badge-song-ngu text-[9px] py-0 px-1.5">
                          <span class="material-symbols-outlined text-[10px]">record_voice_over</span>Song Ngữ
                        </span>
                      ` : ''}
                      <span class="badge-glass-quality text-[9px] py-0 px-1.5">${item.quality || 'FHD'}</span>
                      <span class="badge-glass-sub text-[9px] py-0 px-1.5">${item.year}</span>
                    </div>
                  </div>
                </a>
              `).join('')}
              <a href="/kham-pha?keyword=${encodeURIComponent(query)}" class="block text-center py-2 mt-1 rounded-lg bg-surface-container hover:bg-primary-container hover:text-on-primary-container text-primary font-label-md text-label-md transition-colors">
                Xem tất cả kết quả cho "${query}" &rarr;
              </a>
            `;
          } catch (err) {
            dropdown.innerHTML = `<div class="p-3 text-center text-error text-body-sm">Lỗi tìm kiếm. Thử lại sau.</div>`;
          }
        }, 250);
      });

      // Submit on Enter
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = input.value.trim();
          if (val) {
            window.location.href = `/kham-pha?keyword=${encodeURIComponent(val)}`;
          }
        }
      });

      // Close dropdown on outside click
      document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
          dropdown.classList.add('hidden');
        }
      });
    });

    // Global shortcut Ctrl+K
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const mainInput = document.querySelector('header input[type="text"]');
        if (mainInput) {
          mainInput.focus();
          mainInput.select();
        }
      }
    });
  }

  // Profile Avatar & Menu Dropdown
  async function initProfile() {
    let profileBtn = document.querySelector('header button[aria-label="Hồ sơ cá nhân"]') || 
                     document.querySelector('header button:has(img[alt="Profile"])') ||
                     document.querySelector('header div:has(img[alt="Profile"])');

    if (!profileBtn) {
      // Robust fallback finding person icon in header
      const icons = document.querySelectorAll('header span.material-symbols-outlined');
      for (const icon of icons) {
        const text = icon.textContent.trim();
        if (text === 'person' || text === 'account_circle') {
          profileBtn = icon.closest('.cursor-pointer, button, div.relative');
          break;
        }
      }
    }

    if (!profileBtn) return;

    const user = await API.getMe();
    const wrapper = profileBtn.parentElement || profileBtn;
    wrapper.classList.add('relative');

    // Update avatar on header button if user exists
    if (user && user.avatar) {
      const btnImg = profileBtn.querySelector('img');
      if (btnImg) {
        btnImg.src = user.avatar;
      }
    }

    // Create dropdown menu
    const menu = document.createElement('div');
    menu.className = 'absolute top-full right-0 mt-3 w-64 bg-surface-container-high/95 backdrop-blur-2xl rounded-2xl shadow-2xl p-3 z-50 hidden border border-white/10 flex flex-col gap-2 text-on-surface animate-fade-in';
    
    if (user) {
      menu.innerHTML = `
        <div class="flex items-center gap-3 p-2 rounded-xl bg-surface-container">
          <img src="${user.avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAPbHo0WbRHUQwGQOjadraD_tAk7XQUGjJQPQDSvK5RZfRCVSUufHkI5ytr1RnoudWNDKzqxm86HwkNOfZhdJ6gH5wUBF8Hu6sx3uE-8dvCv61CH5Sl6_6rcVCCUeOGM4Ub3reCBWB2-ittRPKQslAi-yOnv0WlNzjOskqtQAYGefgmgohy9WNwv1lISujIp8aIK3M0rynROP6yxRZcTMSyWswRJsdzf7K4DhDzjq8'}" class="w-10 h-10 rounded-full object-cover ring-2 ring-primary-container" />
          <div class="min-w-0 flex-1">
            <h4 class="font-label-md text-label-md font-bold truncate">${user.name}</h4>
            <span class="inline-flex items-center gap-1 text-[11px] font-label-badge text-primary-fixed-dim font-bold">
              <span class="w-1.5 h-1.5 rounded-full bg-primary-container animate-pulse"></span> ${user.role === 'admin' ? 'Quản Trị Viên' : 'Thành Viên'}
            </span>
          </div>
        </div>
        <div class="flex flex-col gap-1 pt-1 font-body-sm text-body-sm">
          ${user.role === 'admin' ? `
            <a href="/admin" class="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-primary-container/20 text-primary-fixed-dim hover:bg-primary-container/30 transition-colors font-bold">
              <span class="material-symbols-outlined text-[20px] text-primary">admin_panel_settings</span>
              <span>Trang Quản Trị Admin</span>
            </a>
          ` : ''}
          <a href="/tai-khoan" class="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-surface-container transition-colors">
            <span class="material-symbols-outlined text-[20px] text-secondary">manage_accounts</span>
            <span>Hồ Sơ & Tài Khoản</span>
          </a>
          <a href="/danh-sach-cua-toi" class="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-surface-container transition-colors">
            <span class="material-symbols-outlined text-[20px] text-primary">bookmark_manager</span>
            <span>Danh Sách Của Tôi</span>
          </a>
          <div class="h-px bg-surface-container-highest my-1"></div>
          <button id="btn-logout" class="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-error/20 text-error transition-colors text-left w-full cursor-pointer">
            <span class="material-symbols-outlined text-[20px]">logout</span>
            <span>Đăng Xuất</span>
          </button>
        </div>
      `;
    } else {
      menu.innerHTML = `
        <div class="p-3 text-center">
          <p class="font-label-md text-label-md text-on-surface">Chào mừng bạn đến với TTPhim</p>
          <p class="font-body-sm text-[12px] text-on-surface-variant mt-1">Đăng nhập để lưu phim yêu thích & xem tiếp mọi lúc</p>
          <a href="/dang-nhap" class="mt-3 block w-full py-2 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md font-bold text-center hover:bg-inverse-primary transition-all">
            Đăng Nhập / Đăng Ký
        </div>
      `;
    }

    wrapper.appendChild(menu);

    profileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) {
        menu.classList.add('hidden');
      }
    });

    const logoutBtn = menu.querySelector('#btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await API.logout();
        window.showToast('Đã đăng xuất thành công', 'info');
        setTimeout(() => window.location.reload(), 600);
      });
    }
  }

  // Notifications Popover - Live Data & Read Tracking
  async function initNotifications() {
    let notifBtn = document.querySelector('header button[aria-label="Thông báo"]');
    if (!notifBtn) {
      const spans = document.querySelectorAll('header button span.material-symbols-outlined');
      for (const span of spans) {
        if (span.textContent.trim() === 'notifications') {
          notifBtn = span.closest('button');
          break;
        }
      }
    }
    if (!notifBtn) return;

    const wrapper = notifBtn.parentElement;
    wrapper.classList.add('relative');

    const badgeDot = notifBtn.querySelector('span.rounded-full');
    const READ_KEY = 'TTPhim_read_notifications';

    const getReadIds = () => {
      try {
        return JSON.parse(localStorage.getItem(READ_KEY)) || [];
      } catch(e) {
        return [];
      }
    };

    const saveReadIds = (ids) => {
      try {
        localStorage.setItem(READ_KEY, JSON.stringify(ids));
      } catch(e) {}
    };

    // Create Popover Element
    const popover = document.createElement('div');
    popover.className = 'absolute top-full right-0 mt-3 w-80 sm:w-96 bg-surface-container-high/95 backdrop-blur-2xl rounded-2xl shadow-2xl p-3.5 z-50 hidden border border-white/10 flex flex-col gap-2.5 text-on-surface animate-fade-in';
    popover.innerHTML = `
      <div class="flex items-center justify-between pb-2 border-b border-surface-container-highest px-1">
        <div class="flex items-center gap-2">
          <span class="font-headline-sm text-[15px] font-bold text-on-surface">Thông Báo</span>
          <span id="notif-unread-count" class="px-2 py-0.5 rounded-full bg-primary-container/20 text-primary-fixed-dim text-[11px] font-bold"></span>
        </div>
        <button id="notif-mark-all" class="text-[12px] font-label-badge text-primary hover:text-primary-fixed hover:underline transition-colors cursor-pointer">
          Đã đọc tất cả
        </button>
      </div>
      <div id="notif-items-list" class="flex flex-col gap-2 max-h-80 sm:max-h-96 overflow-y-auto pr-1">
        <div class="py-6 text-center text-on-surface-variant text-body-sm flex items-center justify-center gap-2">
          <span class="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
          <span>Đang tải thông báo...</span>
        </div>
      </div>
      <div class="pt-2 border-t border-surface-container-highest flex items-center justify-between text-[12px] text-on-surface-variant px-1">
        <span>Cập nhật liên tục 24/7</span>
        <a href="/kham-pha?type=chieu-rap" class="text-primary hover:underline font-semibold flex items-center gap-0.5">
          <span>Xem phim rạp</span>
          <span class="material-symbols-outlined text-[14px]">chevron_right</span>
        </a>
      </div>
    `;

    wrapper.appendChild(popover);

    let notifications = [];

    const updateBadge = () => {
      const currentRead = getReadIds();
      const unread = notifications.filter(n => !currentRead.includes(n.id)).length;
      if (badgeDot) {
        if (unread > 0) {
          badgeDot.style.display = 'block';
          badgeDot.classList.remove('hidden');
        } else {
          badgeDot.style.display = 'none';
          badgeDot.classList.add('hidden');
        }
      }
      const unreadLabel = popover.querySelector('#notif-unread-count');
      if (unreadLabel) {
        if (unread > 0) {
          unreadLabel.textContent = `${unread} mới`;
          unreadLabel.style.display = 'inline-block';
        } else {
          unreadLabel.style.display = 'none';
        }
      }
    };

    const renderList = () => {
      const currentRead = getReadIds();
      const listEl = popover.querySelector('#notif-items-list');
      if (!listEl) return;

      if (!notifications || notifications.length === 0) {
        listEl.innerHTML = `
          <div class="py-8 text-center text-on-surface-variant text-body-sm">
            <span class="material-symbols-outlined text-[32px] mb-2 opacity-40 block mx-auto">notifications_off</span>
            <p>Hiện không có thông báo nào mới</p>
          </div>
        `;
        return;
      }

      listEl.innerHTML = notifications.map(item => {
        const isRead = currentRead.includes(item.id);
        const isSystem = item.type === 'system';
        const isCinema = item.type === 'cinema';

        let iconOrThumbHtml = '';
        if (item.thumb) {
          iconOrThumbHtml = `
            <img src="${item.thumb}" class="w-10 h-14 rounded-lg object-cover shrink-0 ring-1 ring-white/10 shadow-md" alt="${item.title}" />
          `;
        } else if (isSystem) {
          iconOrThumbHtml = `
            <div class="w-10 h-10 rounded-full bg-primary-container/20 text-primary-container flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[20px]">campaign</span>
            </div>
          `;
        } else {
          iconOrThumbHtml = `
            <div class="w-10 h-10 rounded-full bg-secondary-container/20 text-secondary-fixed flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[20px]">${item.icon || 'notifications'}</span>
            </div>
          `;
        }

        return `
          <div data-notif-id="${item.id}" data-url="${item.url || '#'}" 
               class="notif-item flex items-start gap-3 p-2.5 rounded-xl transition-all cursor-pointer ${isRead ? 'opacity-70 hover:opacity-100 hover:bg-surface-container' : 'bg-surface-container/60 hover:bg-surface-container border-l-2 border-primary-container shadow-sm'}">
            ${iconOrThumbHtml}
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-1 mb-0.5">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isSystem ? 'bg-primary-container/20 text-primary-fixed-dim' : (isCinema ? 'bg-secondary-container/20 text-secondary-fixed' : 'bg-surface-container-highest text-on-surface-variant')}">${item.badge || 'Tin tức'}</span>
                <span class="text-[11px] text-on-surface-variant/70 shrink-0">${item.time || ''}</span>
              </div>
              <h5 class="font-label-md text-[13px] font-semibold text-on-surface line-clamp-1">${item.title}</h5>
              <p class="font-body-sm text-[12px] text-on-surface-variant line-clamp-2 mt-0.5">${item.message}</p>
            </div>
            ${!isRead ? '<span class="w-2 h-2 rounded-full bg-primary-container shrink-0 mt-2"></span>' : ''}
          </div>
        `;
      }).join('');

      // Click to read & navigate
      listEl.querySelectorAll('.notif-item').forEach(el => {
        el.addEventListener('click', () => {
          const id = el.getAttribute('data-notif-id');
          const url = el.getAttribute('data-url');
          const cur = getReadIds();
          if (!cur.includes(id)) {
            cur.push(id);
            saveReadIds(cur);
          }
          updateBadge();
          renderList();
          if (url && url !== '#' && url !== window.location.pathname) {
            window.location.href = url;
          }
        });
      });
    };

    // Fetch live notifications
    try {
      if (window.API && API.getNotifications) {
        notifications = await API.getNotifications();
      }
    } catch(e) {
      console.warn('Could not load notifications:', e);
    }

    updateBadge();
    renderList();

    // Mark all as read
    const markAllBtn = popover.querySelector('#notif-mark-all');
    if (markAllBtn) {
      markAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const allIds = notifications.map(n => n.id);
        saveReadIds(allIds);
        updateBadge();
        renderList();
        if (window.showToast) {
          window.showToast('Đã đánh dấu tất cả thông báo là đã đọc', 'info');
        }
      });
    }

    // Toggle popover
    notifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      popover.classList.toggle('hidden');
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) {
        popover.classList.add('hidden');
      }
    });
  }

  // Mobile Navigation Drawer (Full Responsive Menu for Screens < 1280px)
  async function initMobileMenu() {
    const header = document.querySelector('header');
    if (!header) return;

    const leftCluster = header.querySelector('div.flex.items-center.gap-space-lg') ||
                        header.querySelector('div.flex.items-center.gap-8') ||
                        header.querySelector('div.flex.items-center');
    if (!leftCluster) return;

    // Check if hamburger button already exists
    let mobileToggleBtn = document.getElementById('btn-mobile-menu');
    if (!mobileToggleBtn) {
      mobileToggleBtn = document.createElement('button');
      mobileToggleBtn.id = 'btn-mobile-menu';
      mobileToggleBtn.type = 'button';
      mobileToggleBtn.className = 'xl:hidden p-2 -ml-1 rounded-xl bg-surface-container-high/80 hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface transition-colors flex items-center justify-center cursor-pointer';
      mobileToggleBtn.setAttribute('aria-label', 'Mở menu');
      mobileToggleBtn.innerHTML = '<span class="material-symbols-outlined text-[24px]">menu</span>';
      leftCluster.prepend(mobileToggleBtn);
    }

    // Check if mobile drawer already exists
    let drawerBackdrop = document.getElementById('mobile-menu-drawer-backdrop');
    let drawerPanel = document.getElementById('mobile-menu-drawer');
    if (drawerPanel && drawerBackdrop) return;

    drawerBackdrop = document.createElement('div');
    drawerBackdrop.id = 'mobile-menu-drawer-backdrop';
    drawerBackdrop.className = 'fixed inset-0 bg-black/80 backdrop-blur-md z-[80] transition-opacity duration-300 opacity-0 pointer-events-none';
    document.body.appendChild(drawerBackdrop);

    drawerPanel = document.createElement('aside');
    drawerPanel.id = 'mobile-menu-drawer';
    drawerPanel.className = 'fixed top-0 left-0 bottom-0 w-[310px] sm:w-[350px] bg-surface-container-low border-r border-white/10 z-[90] shadow-2xl flex flex-col transition-transform duration-300 -translate-x-full overflow-hidden text-on-surface';

    const currentPath = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    const typeParam = searchParams.get('type');
    const catParam = searchParams.get('category');
    const countryParam = searchParams.get('country');

    const categories = [
      { slug: 'hanh-dong', name: 'Hành Động' },
      { slug: 'co-trang', name: 'Cổ Trang' },
      { slug: 'tinh-cam', name: 'Tình Cảm' },
      { slug: 'kinh-di', name: 'Kinh Dị' },
      { slug: 'hai-huoc', name: 'Hài Hước' },
      { slug: 'vien-tuong', name: 'Viễn Tưởng' },
      { slug: 'tam-ly', name: 'Tâm Lý' },
      { slug: 'hinh-su', name: 'Hình Sự' },
      { slug: 'vo-thuat', name: 'Võ Thuật' },
      { slug: 'chien-tranh', name: 'Chiến Tranh' },
      { slug: 'hoc-duong', name: 'Học Đường' },
      { slug: 'gia-dinh', name: 'Gia Đình' },
      { slug: 'bi-an', name: 'Bí Ẩn' },
      { slug: 'tai-lieu', name: 'Tài Liệu' }
    ];

    const countries = [
      { slug: 'trung-quoc', name: 'Trung Quốc' },
      { slug: 'han-quoc', name: 'Hàn Quốc' },
      { slug: 'au-my', name: 'Âu Mỹ' },
      { slug: 'nhat-ban', name: 'Nhật Bản' },
      { slug: 'thai-lan', name: 'Thái Lan' },
      { slug: 'viet-nam', name: 'Việt Nam' },
      { slug: 'dai-loan', name: 'Đài Loan' },
      { slug: 'hong-kong', name: 'Hồng Kông' },
      { slug: 'an-do', name: 'Ấn Độ' },
      { slug: 'anh', name: 'Anh' },
      { slug: 'phap', name: 'Pháp' },
      { slug: 'canada', name: 'Canada' }
    ];

    drawerPanel.innerHTML = `
      <!-- Top Header -->
      <div class="h-20 px-5 flex items-center justify-between border-b border-surface-container-highest shrink-0">
        <a class="flex items-center gap-2" href="/">
          <img alt="TTPhim Logo" class="h-7 w-auto object-contain" src="https://lh3.googleusercontent.com/aida/AEtjO1WCgXJ9H-tWLwRPCqPCRlQ-WkeL0DmYMLoQLATG6zUC7m_mRaYXw9V8rpS6oCn2YpFNMV5eCJkqB40ASFcGmB8EVSm4JdhJUnQzRZXllyYk-iFplWk-2hiBgenIAwmXycja2wJQdrIssIaeW2L2chdDSOdkwurLh9W8lcpY9ruEewt7cu8DNtcO1SbJaqqUE7cZ-BOOT6tRM7uADBlkEb1d9ZnHdr5dL2LEJqSRybvk"/>
          <span class="font-headline-sm tracking-wider uppercase text-on-surface font-extrabold text-[17px]">KK<span class="text-primary-container">PHIM</span></span>
        </a>
        <button id="btn-close-mobile-menu" class="p-2 rounded-full hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer" type="button" aria-label="Đóng menu">
          <span class="material-symbols-outlined text-[22px]">close</span>
        </button>
      </div>

      <!-- Mobile Search Input -->
      <div class="p-3.5 border-b border-surface-container-highest shrink-0">
        <div class="relative flex items-center">
          <span class="material-symbols-outlined absolute left-3 text-on-surface-variant text-[18px]">search</span>
          <input id="mobile-drawer-search" class="w-full pl-9 pr-9 py-2 rounded-xl bg-surface-container text-on-surface placeholder:text-on-surface-variant text-body-sm focus:outline-none focus:bg-surface-container-high transition-all" placeholder="Tìm phim, diễn viên..." type="text"/>
          <button id="btn-submit-mobile-search" class="absolute right-2 p-1 text-on-surface-variant hover:text-primary transition-colors cursor-pointer" type="button">
            <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
      </div>

      <!-- Scrollable Navigation Items -->
      <div class="flex-1 overflow-y-auto p-3.5 space-y-1 font-label-md text-sm">
        <a href="/" class="mobile-nav-item flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-surface-container transition-colors ${currentPath === '/' ? 'bg-primary-container text-on-primary-container font-bold shadow' : 'text-on-surface-variant hover:text-on-surface'}">
          <span class="material-symbols-outlined text-[20px]">home</span>
          <span>Trang Chủ</span>
        </a>
        <a href="/kham-pha?type=phim-bo" class="mobile-nav-item flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-surface-container transition-colors ${typeParam === 'phim-bo' ? 'bg-primary-container text-on-primary-container font-bold shadow' : 'text-on-surface-variant hover:text-on-surface'}">
          <span class="material-symbols-outlined text-[20px]">tv</span>
          <span>Phim Bộ</span>
        </a>
        <a href="/kham-pha?type=phim-le" class="mobile-nav-item flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-surface-container transition-colors ${typeParam === 'phim-le' ? 'bg-primary-container text-on-primary-container font-bold shadow' : 'text-on-surface-variant hover:text-on-surface'}">
          <span class="material-symbols-outlined text-[20px]">movie</span>
          <span>Phim Lẻ</span>
        </a>
        <a href="/kham-pha?type=hoat-hinh" class="mobile-nav-item flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-surface-container transition-colors ${typeParam === 'hoat-hinh' ? 'bg-primary-container text-on-primary-container font-bold shadow' : 'text-on-surface-variant hover:text-on-surface'}">
          <span class="material-symbols-outlined text-[20px]">animation</span>
          <span>Hoạt Hình</span>
        </a>
        <a href="/kham-pha?type=tv-shows" class="mobile-nav-item flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-surface-container transition-colors ${typeParam === 'tv-shows' ? 'bg-primary-container text-on-primary-container font-bold shadow' : 'text-on-surface-variant hover:text-on-surface'}">
          <span class="material-symbols-outlined text-[20px]">live_tv</span>
          <span>TV Shows</span>
        </a>
        <a href="/kham-pha?type=chieu-rap" class="mobile-nav-item flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-surface-container transition-colors ${typeParam === 'chieu-rap' ? 'bg-primary-container text-on-primary-container font-bold shadow' : 'text-on-surface-variant hover:text-on-surface'}">
          <span class="material-symbols-outlined text-[20px]">theater_comedy</span>
          <span>Chiếu Rạp</span>
        </a>

        <!-- Accordion: Thể Loại -->
        <div class="pt-1">
          <button id="mobile-toggle-category" class="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer" type="button">
            <div class="flex items-center gap-3">
              <span class="material-symbols-outlined text-[20px]">category</span>
              <span>Thể Loại</span>
            </div>
            <span class="material-symbols-outlined text-[18px] transition-transform duration-200" id="mobile-cat-arrow">expand_more</span>
          </button>
          <div id="mobile-cat-dropdown" class="hidden pl-4 pr-1 py-1.5 grid grid-cols-2 gap-1 text-xs">
            ${categories.map(c => `
              <a href="/kham-pha?category=${c.slug}" class="px-2.5 py-1.5 rounded-lg hover:bg-surface-container transition-colors ${catParam === c.slug ? 'text-primary font-bold bg-white/5' : 'text-on-surface-variant hover:text-on-surface'}">
                ${c.name}
              </a>
            `).join('')}
          </div>
        </div>

        <!-- Accordion: Quốc Gia -->
        <div>
          <button id="mobile-toggle-country" class="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer" type="button">
            <div class="flex items-center gap-3">
              <span class="material-symbols-outlined text-[20px]">public</span>
              <span>Quốc Gia</span>
            </div>
            <span class="material-symbols-outlined text-[18px] transition-transform duration-200" id="mobile-country-arrow">expand_more</span>
          </button>
          <div id="mobile-country-dropdown" class="hidden pl-4 pr-1 py-1.5 grid grid-cols-2 gap-1 text-xs">
            ${countries.map(c => `
              <a href="/kham-pha?country=${c.slug}" class="px-2.5 py-1.5 rounded-lg hover:bg-surface-container transition-colors ${countryParam === c.slug ? 'text-primary font-bold bg-white/5' : 'text-on-surface-variant hover:text-on-surface'}">
                ${c.name}
              </a>
            `).join('')}
          </div>
        </div>

        <div class="h-px bg-surface-container-highest my-2"></div>

        <a href="/kham-pha" class="mobile-nav-item flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-surface-container transition-colors ${currentPath === '/kham-pha' && !typeParam && !catParam && !countryParam ? 'bg-primary-container text-on-primary-container font-bold shadow' : 'text-on-surface-variant hover:text-on-surface'}">
          <span class="material-symbols-outlined text-[20px]">explore</span>
          <span>Khám Phá Toàn Diện</span>
        </a>
        <a href="/#bang-xep-hang" class="mobile-nav-item flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-surface-container transition-colors text-on-surface-variant hover:text-on-surface">
          <span class="material-symbols-outlined text-[20px] text-amber-400">leaderboard</span>
          <span>Bảng Xếp Hạng</span>
        </a>
      </div>

      <!-- Bottom User State -->
      <div id="mobile-drawer-auth" class="p-4 bg-surface-container/70 border-t border-surface-container-highest shrink-0">
        <a href="/dang-nhap" class="w-full py-2.5 rounded-xl bg-primary-container text-on-primary-container font-bold text-center block hover:brightness-110 transition-all text-sm shadow">
          Đăng Nhập / Đăng Ký
        </a>
      </div>
    `;

    document.body.appendChild(drawerPanel);

    // Hydrate User Profile inside mobile drawer
    try {
      const user = await API.getMe();
      const authBox = drawerPanel.querySelector('#mobile-drawer-auth');
      if (user && authBox) {
        authBox.innerHTML = `
          <div class="flex items-center justify-between gap-3">
            <a href="/tai-khoan" class="flex items-center gap-2.5 min-w-0 flex-1 hover:opacity-80 transition-opacity">
              <img src="${user.avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAPbHo0WbRHUQwGQOjadraD_tAk7XQUGjJQPQDSvK5RZfRCVSUufHkI5ytr1RnoudWNDKzqxm86HwkNOfZhdJ6gH5wUBF8Hu6sx3uE-8dvCv61CH5Sl6_6rcVCCUeOGM4Ub3reCBWB2-ittRPKQslAi-yOnv0WlNzjOskqtQAYGefgmgohy9WNwv1lISujIp8aIK3M0rynROP6yxRZcTMSyWswRJsdzf7K4DhDzjq8'}" class="w-9 h-9 rounded-full object-cover ring-2 ring-primary-container shrink-0" />
              <div class="min-w-0">
                <span class="font-label-md text-sm font-bold truncate block text-on-surface">${user.name}</span>
                <span class="text-[11px] text-primary block">${user.role === 'admin' ? 'Quản Trị Viên' : 'Tài Khoản Cá Nhân'}</span>
              </div>
            </a>
            <a href="/danh-sach-cua-toi" class="p-2 rounded-xl bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors" title="Danh sách của tôi">
              <span class="material-symbols-outlined text-[20px]">bookmark</span>
            </a>
          </div>
        `;
      }
    } catch(e) {}

    // Drawer Open / Close Functions
    function openMobileDrawer() {
      drawerBackdrop.classList.remove('opacity-0', 'pointer-events-none');
      drawerBackdrop.classList.add('opacity-100', 'pointer-events-auto');
      drawerPanel.classList.remove('-translate-x-full');
      drawerPanel.classList.add('translate-x-0');
      document.body.style.overflow = 'hidden';
    }

    function closeMobileDrawer() {
      drawerBackdrop.classList.remove('opacity-100', 'pointer-events-auto');
      drawerBackdrop.classList.add('opacity-0', 'pointer-events-none');
      drawerPanel.classList.remove('translate-x-0');
      drawerPanel.classList.add('-translate-x-full');
      document.body.style.overflow = '';
    }

    mobileToggleBtn.addEventListener('click', openMobileDrawer);
    drawerBackdrop.addEventListener('click', closeMobileDrawer);
    drawerPanel.querySelector('#btn-close-mobile-menu').addEventListener('click', closeMobileDrawer);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawerPanel.classList.contains('translate-x-0')) {
        closeMobileDrawer();
      }
    });

    // Mobile Search Handlers
    const mobileSearchInput = drawerPanel.querySelector('#mobile-drawer-search');
    const mobileSearchBtn = drawerPanel.querySelector('#btn-submit-mobile-search');
    function executeMobileSearch() {
      const q = mobileSearchInput.value.trim();
      if (q) {
        closeMobileDrawer();
        window.location.href = `/kham-pha?keyword=${encodeURIComponent(q)}`;
      }
    }
    if (mobileSearchInput && mobileSearchBtn) {
      mobileSearchBtn.addEventListener('click', executeMobileSearch);
      mobileSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') executeMobileSearch();
      });
    }

    // Accordions
    const catBtn = drawerPanel.querySelector('#mobile-toggle-category');
    const catList = drawerPanel.querySelector('#mobile-cat-dropdown');
    const catArrow = drawerPanel.querySelector('#mobile-cat-arrow');
    if (catBtn && catList && catArrow) {
      catBtn.addEventListener('click', () => {
        const isHidden = catList.classList.contains('hidden');
        catList.classList.toggle('hidden');
        catArrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
      });
    }

    const countryBtn = drawerPanel.querySelector('#mobile-toggle-country');
    const countryList = drawerPanel.querySelector('#mobile-country-dropdown');
    const countryArrow = drawerPanel.querySelector('#mobile-country-arrow');
    if (countryBtn && countryList && countryArrow) {
      countryBtn.addEventListener('click', () => {
        const isHidden = countryList.classList.contains('hidden');
        countryList.classList.toggle('hidden');
        countryArrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
      });
    }
  }
})();

