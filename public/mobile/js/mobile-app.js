// TTPhim Mobile App - Core Framework for iOS & Android
const MobileApp = {
  activeTab: 'home',

  init() {
    this.registerServiceWorker();
    this.setupActiveTab();
    this.setupPWAInstallPrompt();
    this.setupHeaderActions();
    this.setupSheets();
  },

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((e) => console.log('SW registration', e));
      });
    }
  },

  setupActiveTab() {
    const path = window.location.pathname;
    let tab = 'home';
    if (path.includes('/kham-pha')) tab = 'explore';
    else if (path.includes('/danh-sach') || path.includes('/tai-ve')) tab = 'list';
    if (path.includes('/danh-sach') && new URLSearchParams(location.search).get('tab') === 'downloads') tab = 'downloads';
    else if (path.includes('/tai-khoan')) tab = 'profile';

    this.activeTab = tab;
    const navLinks = document.querySelectorAll('.mobile-app-nav a');
    navLinks.forEach((link) => {
      const dataTab = link.getAttribute('data-tab');
      if (dataTab === tab) {
        link.setAttribute('aria-current', 'page');
        link.classList.add('text-primary-container');
        link.classList.remove('text-on-surface-variant');
        const icon = link.querySelector('.material-symbols-outlined');
        if (icon) icon.style.fontVariationSettings = "'FILL' 1";
      } else {
        link.classList.remove('text-primary-container');
        link.removeAttribute('aria-current');
        link.classList.add('text-on-surface-variant');
        const icon = link.querySelector('.material-symbols-outlined');
        if (icon) icon.style.fontVariationSettings = "'FILL' 0";
      }
    });
  },

  setupHeaderActions() {
    // Search button
    const searchBtn = document.getElementById('m-search-btn');
    if (searchBtn) {
      searchBtn.onclick = () => {
        window.location.href = '/mobile/kham-pha';
      };
    }

    // Cast button
    const castBtn = document.getElementById('m-cast-btn') || document.getElementById('headerCastBtn');
    if (castBtn) {
      castBtn.onclick = () => {
        this.toast('Truyền màn hình chưa được hỗ trợ trên trình duyệt này.', 'info');
      };
    }

    // Notification button
    const notifBtn = document.getElementById('m-notif-btn') || document.getElementById('headerNotifBtn');
    if (notifBtn) {
      notifBtn.onclick = () => this.openNotifications();
    }

    // Profile button
    const profileBtn = document.getElementById('m-profile-btn');
    if (profileBtn) {
      profileBtn.onclick = () => {
        window.location.href = '/mobile/tai-khoan';
      };
    }
  },

  setupSheets() {
    const sheets = [...document.querySelectorAll('.bottom-sheet-backdrop')];
    if (!sheets.length) return;
    let locked = false, scrollY = 0, restoreFocus = null, previous;
    const sync = () => {
      sheets.forEach(sheet => {
        sheet.inert = !sheet.classList.contains('active');
        sheet.setAttribute('aria-hidden', String(sheet.inert));
      });
      const active = sheets.find(sheet => sheet.classList.contains('active'));
      if (active && !locked) {
        locked = true; scrollY = window.scrollY; restoreFocus = document.activeElement;
        previous = { position: document.body.style.position, top: document.body.style.top, width: document.body.style.width, overflow: document.documentElement.style.overflow };
        Object.assign(document.body.style, { position: 'fixed', top: `-${scrollY}px`, width: '100%' });
        document.documentElement.style.overflow = 'hidden';
        active.querySelector('button, input, select, [tabindex]')?.focus();
      } else if (!active && locked) {
        locked = false;
        Object.assign(document.body.style, { position: previous.position, top: previous.top, width: previous.width });
        document.documentElement.style.overflow = previous.overflow;
        if (scrollY) window.scrollTo(0, scrollY);
        restoreFocus?.focus({ preventScroll: true });
      }
    };
    sheets.forEach(sheet => {
      const content = sheet.querySelector('.bottom-sheet-content');
      content?.setAttribute('role', 'dialog'); content?.setAttribute('aria-modal', 'true');
      content?.setAttribute('aria-label', sheet.id === 'epDrawerBackdrop' ? 'Chọn tập phim' : 'Bộ lọc phim');
      new MutationObserver(sync).observe(sheet, { attributes: true, attributeFilter: ['class'] });
      sheet.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); sheet.querySelector('#closeFilterSheetBtn, #closeEpDrawerBtn')?.click(); }
        if (event.key === 'Tab') {
          const items = [...sheet.querySelectorAll('button:not(:disabled), input, select, a[href]')].filter(el => el.getClientRects().length);
          const first = items[0], last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      });
      sheet.addEventListener('touchmove', event => { if (event.target === sheet) event.preventDefault(); }, { passive: false });
    });
    sync();
  },

  async openNotifications() {
    if (document.getElementById('m-notifications-dialog')) return;
    const dialog = document.createElement('dialog'); dialog.id = 'm-notifications-dialog';
    dialog.setAttribute('aria-label', 'Thông báo phim');
    dialog.style.cssText = 'position:fixed;inset:12px;margin:auto;width:min(420px,calc(100% - 24px));max-height:80vh;padding:18px;border:1px solid #424958;border-radius:16px;background:#191d28;color:#eef0f5;z-index:1000;overflow:auto';
    const heading = document.createElement('h2'); heading.textContent = 'Thông báo'; heading.style.cssText = 'font-size:18px;font-weight:700;margin:0 0 10px';
    const help = document.createElement('p'); help.textContent = 'Kiểm tra tập mới khi mở bảng; dữ liệu có thể trễ theo cache nguồn.'; help.style.cssText = 'font-size:12px;color:#b3bdce;margin:0 0 12px';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Đóng'; close.style.cssText = 'min-height:44px;padding:8px 16px;border:1px solid #505b70;border-radius:8px;margin-bottom:12px'; close.onclick = () => dialog.close();
    const list = document.createElement('div'); list.setAttribute('role', 'status'); list.textContent = 'Đang kiểm tra thông báo…';
    dialog.append(heading, help, close, list); document.body.appendChild(dialog); dialog.addEventListener('close', () => dialog.remove()); dialog.showModal();
    const load = async () => {
      list.textContent = 'Đang kiểm tra thông báo…';
      try {
        const items = await API.getNotifications();
        if (!dialog.isConnected) return;
        list.replaceChildren();
        if (!items.length) { list.textContent = 'Chưa có thông báo mới. Bạn có thể theo dõi phim từ trang chi tiết.'; return; }
        items.forEach(item => {
          const button = document.createElement('button'); button.type = 'button';
          button.style.cssText = `display:block;text-align:left;width:100%;padding:12px;margin:8px 0;border:1px solid ${item.type === 'follow_episode' && !item.read ? '#a92236' : '#343e50'};border-radius:10px;background:#242b39;color:#fff;min-height:44px`;
          const title = document.createElement('strong'); title.textContent = `${item.type === 'follow_episode' && !item.read ? '● ' : ''}${item.title || 'Thông báo'}`;
          const message = document.createElement('p'); message.textContent = item.message || ''; message.style.cssText = 'font-size:12px;color:#c2cbd9;margin-top:5px'; button.append(title, message);
          button.onclick = async () => {
            if (button.disabled) return; button.disabled = true;
            try {
              if (item.type === 'follow_episode' && !item.read) { const result = await API.markFollowNotificationRead(item.id); if (!result?.status) throw Error(); item.read = true; }
              const url = new URL(item.url || '/mobile', location.origin);
              if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) throw Error();
              if (/^\/(phim|xem-phim)\//.test(url.pathname)) url.pathname = '/mobile' + url.pathname;
              location.href = url.pathname + url.search;
            } catch (_) { button.disabled = false; this.toast('Chưa thể mở thông báo. Vui lòng thử lại.', 'error'); }
          };
          list.appendChild(button);
        });
      } catch (_) {
        if (!dialog.isConnected) return;
        list.textContent = 'Không thể tải thông báo. ';
        const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Thử lại'; retry.style.minHeight = '44px'; retry.onclick = load; list.appendChild(retry);
      }
    };
    await load();
  },

  setupPWAInstallPrompt() {
    // Only show if not running in standalone PWA mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isStandalone) return;

    const isDismissed = sessionStorage.getItem('pwa_dismissed');
    if (isDismissed) return;

    let deferredPrompt = null;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      this.renderInstallBanner(false, deferredPrompt);
    });

    if (isIOS) {
      // Delay prompt slightly for iOS
      setTimeout(() => {
        this.renderInstallBanner(true, null);
      }, 3500);
    }
  },

  renderInstallBanner(isIOS, deferredPrompt) {
    if (document.getElementById('pwa-install-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.className = 'pwa-banner fixed bottom-20 inset-x-3 z-50 p-3 rounded-2xl bg-surface-container-high/95 backdrop-blur-xl border border-white/10 shadow-2xl flex items-center justify-between gap-3 text-on-surface';

    banner.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center shrink-0 shadow-md">
          <span class="material-symbols-outlined text-white text-[22px]">play_arrow</span>
        </div>
        <div class="min-w-0">
          <p class="font-bold text-[13px] leading-tight truncate">Cài đặt CineViet</p>
          <p class="text-[11px] text-on-surface-variant truncate mt-0.5">${isIOS ? 'Bấm Chia sẻ rồi chọn "Thêm vào MH chính"' : 'Xem phim mượt hơn, toàn màn hình'}</p>
        </div>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        ${!isIOS ? `
          <button id="pwa-install-action" class="px-3 py-1.5 rounded-full bg-primary-container text-white text-[12px] font-bold shadow-md active:scale-95">
            Cài Đặt
          </button>
        ` : `
          <span class="material-symbols-outlined text-[20px] text-primary-container animate-bounce">ios_share</span>
        `}
        <button id="pwa-dismiss-btn" class="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:text-white" aria-label="Đóng">
          <span class="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>
    `;

    document.body.appendChild(banner);

    const dismissBtn = banner.querySelector('#pwa-dismiss-btn');
    if (dismissBtn) {
      dismissBtn.onclick = () => {
        banner.remove();
        sessionStorage.setItem('pwa_dismissed', 'true');
      };
    }

    const installAction = banner.querySelector('#pwa-install-action');
    if (installAction && deferredPrompt) {
      installAction.onclick = async () => {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          banner.remove();
        }
      };
    }
  },

  toast(message, type = 'info') {
    const existing = document.getElementById('mobile-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'mobile-toast';
    toast.className = `fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full backdrop-blur-md shadow-xl text-[13px] font-medium flex items-center gap-2 animate-bounce transition-all ${
      type === 'error'
        ? 'bg-red-600/90 text-white shadow-red-900/50'
        : type === 'success'
        ? 'bg-emerald-600/90 text-white shadow-emerald-900/50'
        : 'bg-surface-container-highest/95 text-on-surface border border-white/10'
    }`;

    toast.innerHTML = `
      <span class="material-symbols-outlined text-[18px]">${type === 'error' ? 'error' : type === 'success' ? 'check_circle' : 'info'}</span>
      <span>${message}</span>
    `;

    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translate(-50%, -10px)';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  },

  async share(title, url) {
    if (navigator.share) {
      try {
        await navigator.share({
          title: title || 'TTPhim',
          url: url || window.location.href
        });
      } catch (e) {}
    } else {
      await navigator.clipboard.writeText(url || window.location.href);
      this.toast('Đã sao chép liên kết vào bộ nhớ tạm!', 'success');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  MobileApp.init();
});

