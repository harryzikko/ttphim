(function (root) {
  'use strict';
  const instances = new WeakMap();
  const seconds = value => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
  function normalize(history) {
    const latest = new Map();
    for (const item of Array.isArray(history) ? history : []) {
      if (!item || typeof item.movie_slug !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(item.movie_slug)) continue;
      const previous = latest.get(item.movie_slug);
      if (!previous || (Date.parse(item.updated_at) || 0) > (Date.parse(previous.updated_at) || 0)) latest.set(item.movie_slug, item);
    }
    return [...latest.values()].filter(item => {
      const time = seconds(item.current_time), duration = seconds(item.duration);
      return item.continue_hidden !== true && time > 0 && (duration ? time / duration * 100 : seconds(item.progress_percent)) < 95;
    }).sort((a, b) => (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0)).slice(0, 10);
  }
  function clock(value) {
    const total = Math.floor(seconds(value)), minutes = Math.floor(total / 60);
    return `${minutes}:${String(total % 60).padStart(2, '0')}`;
  }
  function safeImage(value) {
    try { const url = new URL(value, root.location.href); return /^https?:$/.test(url.protocol) ? url.href : '/favicon.svg'; }
    catch (_) { return '/favicon.svg'; }
  }
  const node = (tag, className, text) => {
    const el = document.createElement(tag); if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  async function mount({ section, rail, mobile = false, api = root.API, storage = root.localStorage }) {
    if (!section || !rail || !api) return;
    instances.get(section)?.cleanup?.();
    const instance = {}; instances.set(section, instance);
    const current = () => instances.get(section) === instance;
    let user = null, items = [], key = '';
    const clear = () => {
      section.classList.add('hidden'); section.hidden = true;
      rail.replaceChildren();
      const badge = section.querySelector('#continue-watching-count');
      if (badge) badge.textContent = '';
    };
    const refresh = () => mount({ section, rail, mobile, api, storage });
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    const storageChanged = event => {
      const identity = value => { try { return JSON.parse(value || 'null')?.id || null; } catch (_) { return null; } };
      if (event.key === null || (event.key === 'kk_user' && (event.newValue === null || identity(event.oldValue) !== identity(event.newValue)))) refresh();
    };
    const events = [['focus', refresh], ['pageshow', refresh], ['ttphim:auth-changed', refresh], ['storage', storageChanged]];
    events.forEach(([event, handler]) => root.addEventListener(event, handler));
    document.addEventListener('visibilitychange', visible);
    instance.cleanup = () => {
      events.forEach(([event, handler]) => root.removeEventListener(event, handler));
      document.removeEventListener('visibilitychange', visible);
    };
    clear();
    rail.classList.add('continue-watching-rail'); rail.setAttribute('aria-busy', 'true');
    const notify = message => mobile && root.MobileApp?.toast ? root.MobileApp.toast(message, 'error') : root.showToast?.(message, 'error');
    try {
      user = await api.getMe();
      if (!current()) return;
      if (!user?.id) return;
      key = `TTPhim_progress_${user.id}`;
      const library = await api.getLibrary();
      if (!current()) return;
      if (!library || (!Array.isArray(library.history) && !Array.isArray(library.continueWatching))) throw new Error('Invalid library');
      const history = library.history || library.continueWatching;
      items = normalize(history);
      if (!current()) return;
      render();
    } catch (error) {
      if (!current() || !user?.id || error?.httpStatus === 401) return;
      section.classList.remove('hidden'); section.hidden = false;
      rail.replaceChildren(node('p', 'continue-message', 'Chưa thể tải mục Xem tiếp. Tiến trình của bạn không bị xóa.'));
      const retry = node('button', 'continue-retry', 'Thử lại'); retry.type = 'button';
      retry.onclick = () => mount({ section, rail, mobile, api, storage }); rail.appendChild(retry);
    } finally { if (current()) rail.setAttribute('aria-busy', 'false'); }
    function render() {
      rail.replaceChildren();
      const badge = section.querySelector('#continue-watching-count');
      if (badge) badge.textContent = `${items.length} phim`;
      if (!items.length) { clear(); return; }
      section.classList.remove('hidden'); section.hidden = false;
      for (const item of items) {
        const card = node('article', 'continue-card'); card.dataset.slug = item.movie_slug;
        const path = `${mobile ? '/mobile' : ''}/xem-phim/${encodeURIComponent(item.movie_slug)}/${encodeURIComponent(item.episode_slug || 'tap-1')}`;
        const link = node('a', 'continue-play'); link.href = path;
        link.setAttribute('aria-label', `Xem tiếp ${item.movie_name || item.movie_slug}`);
        const image = node('img'); image.src = safeImage(item.thumb_url || item.poster_url || '/favicon.svg'); image.alt = ''; image.loading = 'lazy';
        image.onerror = () => { image.onerror = null; image.src = '/favicon.svg'; };
        const icon = node('span', 'continue-play-icon', '▶'); icon.setAttribute('aria-hidden', 'true');
        const episode = node('span', 'continue-episode', item.episode_name || item.episode_slug || 'Xem tiếp');
        const time = seconds(item.current_time), duration = seconds(item.duration);
        const percent = Math.min(100, Math.max(0, duration ? time / duration * 100 : seconds(item.progress_percent)));
        const track = node('span', 'continue-track'); const fill = node('span'); fill.style.width = `${percent}%`; track.appendChild(fill);
        link.append(image, icon, episode, track);
        const remove = node('button', 'continue-remove', '×'); remove.type = 'button';
        remove.title = 'Ẩn khỏi Xem tiếp, giữ lịch sử'; remove.setAttribute('aria-label', `Ẩn ${item.movie_name || item.movie_slug} khỏi Xem tiếp, giữ lịch sử`);
        remove.onclick = async () => {
          if (!current() || remove.disabled) return; remove.disabled = true;
          try {
            const response = await api.setContinueHidden(item.movie_slug, true);
            if (response?.httpStatus === 401) { await refresh(); return; }
            if (!response?.status) throw new Error('Hide rejected');
            if (!current()) return;
            // Hiding a row preserves the playback position and all other account records.
            try { const records = JSON.parse(storage.getItem(key) || '{}'); if (records[item.movie_slug]) { records[item.movie_slug].continue_hidden = true; storage.setItem(key, JSON.stringify(records)); } }
            catch (_) { /* Server history remains authoritative if local storage is unavailable. */ }
            items = items.filter(record => record.movie_slug !== item.movie_slug); render();
          } catch (_) {
            if (current()) { remove.disabled = false; notify('Không thể ẩn khỏi Xem tiếp. Vui lòng thử lại.'); }
          }
        };
        const meta = node('div', 'continue-meta'); const title = node('a', 'continue-title', item.movie_name || item.movie_slug); title.href = path;
        const progress = node('p', 'continue-progress', duration ? `${clock(time)} / ${clock(duration)} · Còn ${Math.ceil(Math.max(0, duration - time) / 60)} phút` : `Đã lưu tại ${clock(time)} · Chưa có thời lượng`);
        meta.append(title, progress); card.append(link, remove, meta); rail.appendChild(card);
      }
    }
  }
  root.ContinueWatching = { mount, normalize };
})(typeof window === 'undefined' ? globalThis : window);
