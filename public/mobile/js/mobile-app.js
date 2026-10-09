// TTPhim Mobile App - Core Framework for iOS & Android
const MobileApp = {
  activeTab: 'home',

  init() {
    this.registerServiceWorker();
    this.setupActiveTab();
    this.setupPWAInstallPrompt();
    this.setupHeaderActions();
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
    else if (path.includes('/tai-khoan')) tab = 'profile';

    this.activeTab = tab;
    const navLinks = document.querySelectorAll('.mobile-app-nav a');
    navLinks.forEach((link) => {
      const dataTab = link.getAttribute('data-tab');
      if (dataTab === tab) {
        link.classList.add('text-primary-container');
        link.classList.remove('text-on-surface-variant');
        const icon = link.querySelector('.material-symbols-outlined');
        if (icon) icon.style.fontVariationSettings = "'FILL' 1";
      } else {
        link.classList.remove('text-primary-container');
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
    const castBtn = document.getElementById('m-cast-btn');
    if (castBtn) {
      castBtn.onclick = () => {
        this.toast('Đang dò thiết bị Chromecast & AirPlay...', 'info');
      };
    }

    // Notification button
    const notifBtn = document.getElementById('m-notif-btn');
    if (notifBtn) {
      notifBtn.onclick = () => {
        this.toast('Bạn không có thông báo mới nào', 'info');
      };
    }

    // Profile button
    const profileBtn = document.getElementById('m-profile-btn');
    if (profileBtn) {
      profileBtn.onclick = () => {
        window.location.href = '/mobile/tai-khoan';
      };
    }
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
          <p class="font-bold text-[13px] leading-tight truncate">Cài đặt App TTPhim</p>
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

