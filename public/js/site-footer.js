/* Footer links remain server-visible; JS only adds phone disclosure controls. */
(() => {
  'use strict';
  const applyClosedState = () => {
    try {
      if (sessionStorage.getItem('hide_footer_ad') === '1' || sessionStorage.getItem('hide_partner_dock_v2') === '1') {
        const f = document.querySelector('.cv-partner-dock, .cv-slot-footer, .ad-footer');
        if (f) {
          f.style.setProperty('display', 'none', 'important');
        }
      }
    } catch (_) {}
  };
  applyClosedState();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyClosedState, { once: true });

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
