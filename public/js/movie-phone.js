/* Presentation-only helpers for the ordinary movie detail template. */
(() => {
  'use strict';
  const start = () => {
    const side = document.getElementById('watch-side-column');
    const primary = document.getElementById('primary-player-column');
    const info = document.getElementById('watch-film-info');
    if (side && primary && info) {
      const marker = document.createComment('watch-side-column original location');
      side.before(marker);
      const phone = window.matchMedia('(max-width: 767px)');
      const arrange = () => { if (phone.matches) primary.insertBefore(side, info); else marker.parentNode.insertBefore(side, marker.nextSibling); };
      phone.addEventListener?.('change', arrange); arrange();
      document.querySelectorAll('[data-watch-tab]').forEach(link => link.addEventListener('click', () => {
        document.getElementById(link.dataset.watchTab === 'party' ? 'tab-btn-party' : 'tab-btn-episodes')?.click();
      }));
    }
    const text = document.getElementById('synopsis-text');
    const toggle = document.getElementById('detail-synopsis-toggle');
    if (!text || !toggle) return;
    const refresh = () => { toggle.hidden = (text.textContent || '').trim().length < 180; };
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(expanded));
      text.dataset.expanded = String(expanded);
      toggle.textContent = expanded ? 'Thu gọn' : 'Xem thêm';
    });
    new MutationObserver(refresh).observe(text, { childList: true, characterData: true, subtree: true });
    refresh();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
