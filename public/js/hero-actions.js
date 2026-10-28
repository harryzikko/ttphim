/* Shared, confirmed hero actions for desktop and mobile. */
(() => {
  'use strict';

  function favorite(button, notify = window.showToast) {
    if (!button) return () => {};
    const saved = new Set();
    let pending = false;
    let current = null;
    let generation = 0;
    let owner = null;
    const toast = (message, type) => notify?.(message, type);
    const paint = () => {
      if (!current) return;
      const active = saved.has(current.slug);
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', active ? 'Bỏ yêu thích' : 'Yêu thích');
      button.title = active ? 'Bỏ yêu thích' : 'Yêu thích';
      button.classList.toggle('hero-favorite-active', active);
      button.disabled = pending;
      const icon = button.querySelector('.material-symbols-outlined');
      if (icon) { icon.textContent = 'favorite'; icon.style.fontVariationSettings = `'FILL' ${active ? 1 : 0}`; }
    };
    const refresh = async () => {
      const version = ++generation;
      saved.clear(); owner = null; paint();
      try {
        const user = await API.getMe();
        if (!user || version !== generation) return;
        const library = await API.getLibrary();
        if (version !== generation) return;
        owner = user.id;
        for (const item of library.watchlist || []) saved.add(item.movie_slug || item.slug);
        paint();
      } catch { /* Browsing remains available when account lookup fails. */ }
    };
    button.onclick = async () => {
      const movie = current;
      if (!movie || pending) return;
      pending = true; paint();
      const version = ++generation;
      try {
        const user = await API.getMe();
        if (version !== generation) return;
        if (!user) {
          saved.clear();
          toast('Vui lòng đăng nhập để lưu phim yêu thích!', 'warning');
          window.location.href = `/auth?redirect=${encodeURIComponent(location.pathname + location.search)}`;
          return;
        }
        if (owner !== user.id) { saved.clear(); owner = user.id; }
        const res = await API.toggleWatchlist({ movie_slug: movie.slug, movie_name: movie.name, origin_name: movie.origin_name, poster_url: movie.poster_url, thumb_url: movie.thumb_url, year: movie.year, quality: movie.quality });
        if (version !== generation) return;
        if (!res?.status || typeof res.data?.added !== 'boolean') throw new Error(res?.message || 'Không thể lưu phim. Vui lòng thử lại.');
        if (res.data.added) saved.add(movie.slug); else saved.delete(movie.slug);
        toast(res.data.added ? `Đã thêm "${movie.name}" vào yêu thích!` : `Đã bỏ yêu thích "${movie.name}"`, 'success');
      } catch (error) { toast(error.message || 'Không thể lưu phim', 'error'); }
      finally { pending = false; paint(); }
    };
    window.addEventListener('ttphim:auth-changed', refresh);
    window.addEventListener('focus', () => { if (!pending) refresh(); });
    window.addEventListener('pageshow', () => { if (!pending) refresh(); });
    refresh();
    return movie => { current = movie; paint(); };
  }
  window.HeroActions = { favorite };
})();
