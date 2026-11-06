document.addEventListener('DOMContentLoaded', () => {
  const syncFooterAdState = () => {
    try {
      if (sessionStorage.getItem('cv_footer_campaign') !== 'noza_site') {
        sessionStorage.removeItem('hide_footer_ad');
        sessionStorage.setItem('cv_footer_campaign', 'noza_site');
      }
      const isClosed = sessionStorage.getItem('hide_footer_ad') === '1';
      const f = document.querySelector('.cv-partner-dock, .ad-footer');
      if (!f) return;

      // Anti-adblock immunity: strip classes that trigger ad blockers
      f.removeAttribute('data-ad-slot');
      f.classList.remove('ad-placement', 'ad-footer');
      const card = f.querySelector('.cv-partner-card, .ad-banner');
      if (card) card.classList.remove('ad-banner');
      const closeBtn = f.querySelector('.cv-dock-close, .ad-footer-close');
      if (closeBtn) closeBtn.classList.remove('ad-footer-close');
      const reopen = f.querySelector('.cv-dock-reopen, .ad-footer-reopen');
      if (reopen) reopen.classList.remove('ad-footer-reopen');

      // Mobile bottom bar offset
      const mobileNav = document.querySelector('.mobile-app-nav');
      if (mobileNav) {
        f.style.setProperty('bottom', 'calc(76px + env(safe-area-inset-bottom, 0px) + 8px)', 'important');
      } else {
        f.style.setProperty('bottom', '12px', 'important');
      }

      // Ensure container is unhidden
      f.style.setProperty('visibility', 'visible', 'important');
      f.style.setProperty('opacity', '1', 'important');
      f.style.setProperty('pointer-events', 'auto', 'important');

      if (isClosed) {
        f.classList.add('is-collapsed');
        f.style.setProperty('display', 'flex', 'important');
        f.style.setProperty('width', 'auto', 'important');
        if (reopen) {
          reopen.style.setProperty('display', 'inline-flex', 'important');
          reopen.style.setProperty('visibility', 'visible', 'important');
          reopen.style.setProperty('opacity', '1', 'important');
          reopen.style.setProperty('pointer-events', 'auto', 'important');
        }
        if (card) card.style.setProperty('display', 'none', 'important');
        const badge = f.querySelector('.cv-dock-badge, .ad-label');
        if (badge) badge.style.setProperty('display', 'none', 'important');
        if (closeBtn) closeBtn.style.setProperty('display', 'none', 'important');
      } else {
        f.classList.remove('is-collapsed');
        f.style.setProperty('display', 'block', 'important');
        f.style.removeProperty('width');
        if (reopen) reopen.style.setProperty('display', 'none', 'important');
        if (card) {
          card.style.setProperty('display', 'block', 'important');
          card.style.setProperty('visibility', 'visible', 'important');
          card.style.setProperty('opacity', '1', 'important');
        }
        const badge = f.querySelector('.cv-dock-badge, .ad-label');
        if (badge) badge.style.removeProperty('display');
        if (closeBtn) {
          closeBtn.style.setProperty('display', 'flex', 'important');
          closeBtn.style.setProperty('visibility', 'visible', 'important');
          closeBtn.style.setProperty('opacity', '1', 'important');
          closeBtn.style.setProperty('pointer-events', 'auto', 'important');
        }
      }
    } catch (_) {}
  };
  syncFooterAdState();
  window.addEventListener('pageshow', syncFooterAdState);
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

      const campaignKey = 'cv_popup_v2_' + String(data.href || 'noza').replace(/[^a-zA-Z0-9]/g, '_');
      const lastShown = Number(localStorage.getItem(campaignKey)) || 0;
      const cooldownHours = Number(data.cooldown_hours) != null ? Number(data.cooldown_hours) : 12;
      const cooldownMs = cooldownHours * 60 * 60 * 1000;
      const now = Date.now();
      if (lastShown && (now - lastShown) < cooldownMs) return;

      const overlay = document.createElement('div');
      overlay.className = 'cv-promo-overlay ad-popup-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', data.title || 'Quảng cáo');

      const modal = document.createElement('div');
      modal.className = 'cv-promo-modal ad-popup-modal';

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'cv-promo-close ad-popup-close';
      closeBtn.setAttribute('aria-label', 'Đóng quảng cáo');
      closeBtn.title = 'Đóng quảng cáo';
      closeBtn.innerHTML = '✕';

      const link = document.createElement('a');
      link.className = 'cv-promo-link ad-popup-link';
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
      img.className = 'cv-promo-img ad-popup-img';
      img.loading = 'eager';
      img.decoding = 'async';

      link.appendChild(img);
      modal.appendChild(closeBtn);
      modal.appendChild(link);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Record timestamp
      localStorage.setItem(campaignKey, String(now));

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

  // Anti-Adblock: Protect and self-heal partner banners from aggressive ad blocker extensions
  const protectBanners = () => {
    const dock = document.querySelector('.cv-partner-dock, .ad-footer');
    if (!dock) return;
    dock.removeAttribute('data-ad-slot');
    dock.classList.remove('ad-placement', 'ad-footer', 'ad-banner');
    const pOverlay = document.querySelector('.cv-promo-overlay');
    if (pOverlay) pOverlay.classList.remove('ad-popup-overlay');
    const pModal = document.querySelector('.cv-promo-modal');
    if (pModal) pModal.classList.remove('ad-popup-modal');
    syncFooterAdState();
  };
  protectBanners();
  setTimeout(protectBanners, 350);
  setTimeout(protectBanners, 1200);
});