document.addEventListener('DOMContentLoaded', () => {
  try {
    if (sessionStorage.getItem('hide_footer_ad') === '1') {
      const f = document.querySelector('.ad-footer');
      if (f) {
        f.classList.add('is-collapsed');
        f.style.setProperty('width', 'auto', 'important');
        f.querySelector('.ad-footer-reopen')?.style.setProperty('display', 'inline-flex', 'important');
        f.querySelector('.ad-banner')?.style.setProperty('display', 'none', 'important');
        f.querySelector('.ad-label')?.style.setProperty('display', 'none', 'important');
        f.querySelector('.ad-footer-close')?.style.setProperty('display', 'none', 'important');
      }
    }
  } catch (_) {}
  document.body.classList.add(document.querySelector('.admin-nav-btn') ? 'editorial-admin' : 'editorial-home');
  if (document.body.classList.contains('editorial-admin')) return;

  // Hide only decorative heading glyphs, never icon-only controls or player actions.
  const tidy = () => {
    document.querySelectorAll('h1 > .material-symbols-outlined,h2 > .material-symbols-outlined,h3 > .material-symbols-outlined').forEach(icon => {
      icon.classList.add('decorative-icon'); icon.setAttribute('aria-hidden', 'true');
    });
  };
  tidy();
  const main = document.querySelector('main');
  if (main) new MutationObserver(tidy).observe(main, { childList: true, subtree: true });

  // Popup modal banner (12-hour cooldown)
  async function initPopupBanner() {
    try {
      if (window.self !== window.top) return; // Do not run inside iframe
      const res = await fetch('/api/popup-banner');
      if (!res.ok) return;
      const json = await res.json();
      if (!json.status || !json.data || !json.data.enabled) return;
      const data = json.data;

      const storageKey = 'cineviet_popup_ad_last_shown';
      const lastShown = Number(localStorage.getItem(storageKey)) || 0;
      const cooldownHours = Math.max(1, Number(data.cooldown_hours) || 12);
      const cooldownMs = cooldownHours * 60 * 60 * 1000;
      const now = Date.now();
      if (lastShown && (now - lastShown) < cooldownMs) return;

      const overlay = document.createElement('div');
      overlay.className = 'ad-popup-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', data.title || 'Quảng cáo');

      const modal = document.createElement('div');
      modal.className = 'ad-popup-modal';

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'ad-popup-close';
      closeBtn.setAttribute('aria-label', 'Đóng quảng cáo');
      closeBtn.title = 'Đóng quảng cáo';
      closeBtn.innerHTML = '✕';

      const link = document.createElement('a');
      link.className = 'ad-popup-link';
      link.href = data.href || '#';
      if (data.new_tab) {
        link.target = '_blank';
        link.rel = 'sponsored noopener noreferrer';
      } else {
        link.rel = 'sponsored';
      }

      const img = document.createElement('img');
      img.src = data.image || '/images/banners/dealpulse-popup.png';
      img.alt = data.title || 'Quảng cáo DealPulse';
      img.className = 'ad-popup-img';
      img.loading = 'eager';
      img.decoding = 'async';

      link.appendChild(img);
      modal.appendChild(closeBtn);
      modal.appendChild(link);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Record timestamp
      localStorage.setItem(storageKey, String(now));

      let dismissed = false;
      const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        overlay.classList.remove('is-active');
        setTimeout(() => overlay.remove(), 300);
      };

      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dismiss();
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          e.preventDefault();
          dismiss();
        }
      });

      document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape' && document.body.contains(overlay)) {
          dismiss();
          document.removeEventListener('keydown', escHandler);
        }
      });

      // Animate entry after a brief subtle delay for smooth UX
      setTimeout(() => {
        overlay.classList.add('is-active');
      }, 600);
    } catch (_) {}
  }
  initPopupBanner();
});
