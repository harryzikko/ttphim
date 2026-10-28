// Summary of saved records only; no viewing-session or monthly-time claims.
(function () {
  'use strict';

  const text = value => typeof value === 'string' ? value.trim() : '';
  const slugOf = item => text(item?.movie_slug || item?.slug).toLowerCase();
  const rows = value => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [];
  const seconds = value => (typeof value === 'number' || (typeof value === 'string' && value.trim()))
    && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;

  function latestBySlug(items) {
    const latest = new Map();
    for (const item of rows(items)) {
      const slug = slugOf(item);
      if (!slug) continue;
      const previous = latest.get(slug);
      if (!previous || (Date.parse(item.updated_at) || 0) > (Date.parse(previous.updated_at) || 0)) {
        latest.set(slug, item);
      }
    }
    return [...latest.values()];
  }

  function summarize(data) {
    const history = latestBySlug(data?.history);
    let savedSeconds = 0;
    let positionCount = 0;
    let categorizedCount = 0;
    const genres = new Map();
    for (const item of history) {
      const position = seconds(item.current_time);
      const duration = seconds(item.duration);
      if (position !== null) {
        savedSeconds += duration > 0 ? Math.min(position, duration) : position;
        positionCount++;
      }
      // Only explicit history metadata counts; country/title are not genres.
      const category = item.category;
      const names = Array.isArray(category)
        ? category.map(value => text(typeof value === 'string' ? value : value?.name))
        : text(category).split(',').map(value => value.trim());
      const unique = new Set(names.filter(Boolean));
      if (unique.size) categorizedCount++;
      for (const name of unique) genres.set(name, (genres.get(name) || 0) + 1);
    }
    const seen = new Set(history.map(slugOf));
    const unseen = [];
    const added = new Set();
    for (const item of rows(data?.watchlist)) {
      const slug = slugOf(item);
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug) || seen.has(slug) || added.has(slug)) continue;
      added.add(slug);
      unseen.push(item);
    }
    return {
      savedSeconds: Math.floor(savedSeconds), positionCount, historyCount: history.length,
      categorizedCount, genres: [...genres].sort((a, b) => b[1] - a[1]),
      unseen: unseen.slice(0, 3), watchlistCount: rows(data?.watchlist).length
    };
  }

  function safePoster(value) {
    const raw = text(value);
    if (!raw || /[\\\u0000-\u0020]/.test(raw) || raw.startsWith('//')) return '';
    try {
      const url = new URL(raw, window.location.origin);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) return '';
      if (!/^https?:\/\//i.test(raw) && !raw.startsWith('/')) return '';
      return url.href;
    } catch (_) {
      return '';
    }
  }

  function render(root, data, state = 'ready') {
    if (!root) return;
    const doc = root.ownerDocument;
    const progress = root.querySelector('#library-saved-progress');
    const genres = root.querySelector('#library-saved-genres');
    const recommendations = root.querySelector('#library-unseen-watchlist');
    if (!progress || !genres || !recommendations) return;
    const node = (tag, content, className) => {
      const element = doc.createElement(tag);
      element.textContent = content;
      if (className) element.className = className;
      return element;
    };
    const message = (target, content) => target.replaceChildren(node('p', content, 'library-stats__muted'));
    root.setAttribute('aria-busy', String(state === 'loading'));
    root.dataset.state = state;
    if (state !== 'ready') {
      const content = state === 'guest' ? 'Đăng nhập để xem dữ liệu thư viện của bạn.'
        : state === 'loading' ? 'Đang tải dữ liệu thư viện...'
          : 'Không thể tải dữ liệu thư viện. Vui lòng tải lại trang để thử lại.';
      [progress, genres, recommendations].forEach(target => message(target, content));
      return;
    }

    const summary = summarize(data);
    if (!summary.historyCount) message(progress, 'Chưa có lịch sử hoặc tiến trình đã lưu.');
    else if (!summary.positionCount) message(progress, 'Lịch sử chưa có dữ liệu vị trí lưu hợp lệ.');
    else {
      const total = summary.savedSeconds;
      const formatted = `${Math.floor(total / 3600)} giờ ${Math.floor(total % 3600 / 60)} phút ${total % 60} giây`;
      progress.replaceChildren(
        node('p', formatted, 'library-stats__value'),
        node('p', `Có vị trí lưu ở ${summary.positionCount}/${summary.historyCount} tựa phim trong lịch sử.`, 'library-stats__muted')
      );
    }

    if (!summary.genres.length) message(genres, 'Chưa có dữ liệu thể loại trong lịch sử.');
    else {
      const list = node('ul', '', 'library-stats__genres');
      for (const [name, count] of summary.genres.slice(0, 3)) {
        const item = node('li', '');
        item.append(node('span', name), node('strong', `${count} tựa phim`));
        list.append(item);
      }
      genres.replaceChildren(list, node('p', `Có thể loại ở ${summary.categorizedCount}/${summary.historyCount} tựa phim; một phim có thể có nhiều thể loại.`, 'library-stats__muted'));
    }

    if (!summary.unseen.length) {
      message(recommendations, summary.watchlistCount
        ? 'Chưa có phim yêu thích chưa xem có thể hiển thị.'
        : 'Chưa có phim trong danh sách yêu thích.');
      return;
    }
    const list = node('ul', '', 'library-stats__recommendations');
    for (const item of summary.unseen) {
      const li = node('li', '');
      const link = node('a', '', 'library-stats__movie');
      link.href = `/phim/${encodeURIComponent(slugOf(item))}`;
      const poster = safePoster(item.poster_url || item.thumb_url);
      if (poster) {
        const image = doc.createElement('img');
        image.src = poster;
        image.alt = '';
        image.loading = 'lazy';
        image.referrerPolicy = 'no-referrer';
        link.append(image);
      }
      const title = node('span', text(item.movie_name) || 'Phim đã lưu');
      if (text(item.origin_name)) title.append(node('small', text(item.origin_name)));
      link.append(title);
      li.append(link);
      list.append(li);
    }
    recommendations.replaceChildren(list);
  }

  window.LibraryStats = Object.freeze({ render, summarize });
})();
