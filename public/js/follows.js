(function (root) {
  'use strict';
  const labels = { follow: 'Theo d\u00f5i t\u1eadp m\u1edbi', following: '\u0110ang theo d\u00f5i',
    error: 'Kh\u00f4ng th\u1ec3 l\u01b0u theo d\u00f5i. Vui l\u00f2ng th\u1eed l\u1ea1i.',
    retry: 'Th\u1eed l\u1ea1i theo d\u00f5i', loading: '\u0110ang t\u1ea3i theo d\u00f5i...' };
  function safeReturnPath(location) {
    const path = location.pathname || '';
    if (!/^\/(?:mobile\/)?phim\/[a-zA-Z0-9_-]+\/?$/.test(path)) return '/';
    return path + (location.search || '') + (location.hash || '');
  }
  function mount({ document = root.document, api = typeof API !== 'undefined' ? API : root.API, location = root.location } = {}) {
    if (!document || !api || !location) return null;
    const match = location.pathname.match(/^\/(?:mobile\/)?phim\/([a-zA-Z0-9_-]{1,200})\/?$/);
    if (!match) return null;
    const mounted = document.getElementById('movie-follow-button');
    if (mounted) return mounted;
    const watchlist = document.getElementById('m-action-watchlist') || document.getElementById('detail-favorite-btn') || document.querySelector('button[title="Th\u00eam v\u00e0o danh s\u00e1ch y\u00eau th\u00edch"]');
    if (!watchlist || !watchlist.parentNode) return null;
    const slug = match[1];
    const wrap = document.createElement('span');
    wrap.className = 'movie-follow-control';
    if (location.pathname.startsWith('/mobile/')) wrap.classList.add('movie-follow-control--mobile');
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'movie-follow-button';
    button.className = 'movie-follow-button';
    button.disabled = true;
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.textContent = 'notifications';
    icon.setAttribute('aria-hidden', 'true');
    button.appendChild(icon);
    function setLabel(label) { button.setAttribute('aria-label', label); button.title = label; }
    setLabel(labels.loading);
    const status = document.createElement('span');
    status.id = 'movie-follow-status';
    status.className = 'movie-follow-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    button.setAttribute('aria-describedby', status.id);
    wrap.append(button, status);
    watchlist.insertAdjacentElement('afterend', wrap);
    let initialized = false;
    let following = false;
    let currentUser = null;
    let busy = false;
    const redirect = () => { location.href = `/auth?redirect=${encodeURIComponent(safeReturnPath(location))}`; };
    function render() {
      setLabel(following ? labels.following : labels.follow);
      icon.style.fontVariationSettings = "'FILL' 0";
      button.setAttribute('aria-pressed', String(following));
      button.classList.toggle('is-following', following);
    }
    async function initialize() {
      busy = true;
      button.disabled = true;
      status.textContent = '';
      status.classList.remove('is-success');
      try {
        const [detail, me] = await Promise.all([api.getMovieDetail(slug), api.getMe()]);
        if (!detail?.movie) throw new Error(labels.error);
        currentUser = me;
        if (me) {
          const response = await api.request('/api/user/follows');
          if (!response?.status || !Array.isArray(response.data)) throw new Error(labels.error);
          following = response.data.some(item => item.movie_slug === slug);
        }
        initialized = true;
        render();
      } catch (_) {
        setLabel(labels.retry);
        status.textContent = labels.error;
      } finally { busy = false; button.disabled = false; }
    }
    button.addEventListener('click', async () => {
      if (busy) return;
      if (!initialized) { await initialize(); return; }
      if (!currentUser) { redirect(); return; }
      busy = true;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      status.textContent = '';
      status.classList.remove('is-success');
      try {
        const desired = !following;
        const response = await api.request(`/api/user/follows/${encodeURIComponent(slug)}`, { method: desired ? 'POST' : 'DELETE' });
        if (response?.httpStatus === 401) { redirect(); return; }
        if (!response?.status || response.data?.following !== desired) throw new Error(labels.error);
        following = response.data.following;
        render();
        status.classList.add('is-success');
        status.textContent = following ? '\u0110\u00e3 b\u1eadt th\u00f4ng b\u00e1o t\u1eadp m\u1edbi trong trang web.' : '\u0110\u00e3 b\u1ecf theo d\u00f5i t\u1eadp m\u1edbi.';
      } catch (_) { status.textContent = labels.error; }
      finally { busy = false; button.disabled = false; button.removeAttribute('aria-busy'); }
    });
    initialize();
    return button;
  }
  const exported = { mount, safeReturnPath };
  if (typeof module === 'object' && module.exports) module.exports = exported;
  root.MovieFollows = exported;
  if (root.document) {
    const start = () => mount();
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})(typeof window === 'undefined' ? globalThis : window);
