/* Footer links remain server-visible; JS only adds phone disclosure controls. */
(() => {
  'use strict';
  const applyClosedState = () => {
    try {
      const isClosed = sessionStorage.getItem('hide_footer_ad') === '1';
      const f = document.querySelector('.cv-partner-dock, .ad-footer');
      if (!f) return;
      if (isClosed) {
        f.classList.add('is-collapsed');
        f.style.setProperty('width', 'auto', 'important');
        const reopen = f.querySelector('.cv-dock-reopen, .ad-footer-reopen');
        if (reopen) reopen.style.setProperty('display', 'inline-flex', 'important');
        const card = f.querySelector('.cv-partner-card, .ad-banner');
        if (card) card.style.setProperty('display', 'none', 'important');
        const badge = f.querySelector('.cv-dock-badge, .ad-label');
        if (badge) badge.style.setProperty('display', 'none', 'important');
        const closeBtn = f.querySelector('.cv-dock-close, .ad-footer-close');
        if (closeBtn) closeBtn.style.setProperty('display', 'none', 'important');
      } else {
        f.classList.remove('is-collapsed');
        f.style.removeProperty('width');
        const reopen = f.querySelector('.cv-dock-reopen, .ad-footer-reopen');
        if (reopen) reopen.style.setProperty('display', 'none', 'important');
        const card = f.querySelector('.cv-partner-card, .ad-banner');
        if (card) card.style.removeProperty('display');
        const badge = f.querySelector('.cv-dock-badge, .ad-label');
        if (badge) badge.style.removeProperty('display');
        const closeBtn = f.querySelector('.cv-dock-close, .ad-footer-close');
        if (closeBtn) closeBtn.style.setProperty('display', 'flex', 'important');
      }
    } catch (_) {}
  };
  applyClosedState();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyClosedState, { once: true });
  window.addEventListener('pageshow', applyClosedState);

  const mount = () => {
    const phone = window.matchMedia ? window.matchMedia('(max-width: 767px)') : { matches: false };
    document.querySelectorAll('.cv-footer:not(.is-enhanced)').forEach((footer, footerIndex) => {
      const controls = [];
      footer.querySelectorAll('.cv-footer-group').forEach((group, index) => {
        const heading = group.querySelector('h2'), list = group.querySelector('ul');
        if (!heading || !list) return;
        list.id = `cv-footer-links-${footerIndex}-${index}`;
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'cv-footer-group-toggle';
        button.textContent = heading.textContent;
        button.setAttribute('aria-controls', list.id);
        heading.replaceChildren(button);
        const render = expanded => {
          button.setAttribute('aria-expanded', String(expanded));
          group.classList.toggle('is-collapsed', !expanded);
          list.inert = !expanded;
        };
        button.addEventListener('click', () => { if (phone.matches) render(button.getAttribute('aria-expanded') !== 'true'); });
        controls.push({ group, button, list, render });
        render(!phone.matches);
      });
      footer.classList.add('is-enhanced');
      phone.addEventListener?.('change', () => {
        controls.forEach(({ button, list, render }) => {
          if (phone.matches && list.contains(document.activeElement)) button.focus({ preventScroll: true });
          render(!phone.matches);
        });
      });
      const top = footer.querySelector('[data-footer-top]');
      if (top) {
        top.hidden = false;
        top.addEventListener('click', () => {
          window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
          document.querySelector('body > header a[href]')?.focus({ preventScroll: true });
        });
      }
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
