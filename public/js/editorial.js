document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add(document.querySelector('.admin-nav-btn') ? 'editorial-admin' : 'editorial-home');
  if (!document.body.classList.contains('editorial-home')) return;
  // Hide only decorative heading glyphs, never icon-only controls or player actions.
  const tidy = () => {
    document.querySelectorAll('h1 > .material-symbols-outlined,h2 > .material-symbols-outlined,h3 > .material-symbols-outlined').forEach(icon => {
      icon.classList.add('decorative-icon'); icon.setAttribute('aria-hidden', 'true');
    });
  };
  tidy();
  const main = document.querySelector('main');
  if (main) new MutationObserver(tidy).observe(main, { childList: true, subtree: true });
});
