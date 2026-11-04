/* Footer links remain server-visible; JS only adds phone disclosure controls. */
(() => {
  'use strict';
  const applyClosedState = () => {
    try {
      const isClosed = sessionStorage.getItem('hide_footer_ad') === '1';
      const f = document.querySelector('.cv-partner-dock, .ad-footer');
      if (!f) return;

      // Anti-adblock immunity: strip classes that trigger ad blockers
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
