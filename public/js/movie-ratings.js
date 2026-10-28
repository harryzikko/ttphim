(function (root) {
  'use strict';
  const externalLoads = new WeakMap();
  function mount(movie, api = root.API) {
    const card = document.getElementById('movie-rating-card');
    if (!card || !movie?.slug) return;
    const buttons = [...document.querySelectorAll('#movie-rating-buttons button')];
    const status = document.getElementById('movie-rating-status');
    const distribution = document.getElementById('rating-distribution');
    const externalScore = document.getElementById('movie-tmdb-score');
    const externalStatus = document.getElementById('movie-tmdb-status');
    const externalRetry = document.getElementById('movie-tmdb-retry');
    const metadata = movie.tmdb;
    const rawId = (metadata && typeof metadata === 'object' ? metadata.id : metadata) || movie.tmdb_id || movie.tmdbId;
    const tmdbId = /^[1-9]\d*$/.test(String(rawId ?? '')) && Number.isSafeInteger(Number(rawId)) ? Number(rawId) : null;
    const mediaType = (metadata && typeof metadata === 'object' ? metadata.type : null) || movie.tmdb_type || movie.tmdbType || ({ series:'tv', tv:'tv', 'phim-bo':'tv', single:'movie', movie:'movie', 'phim-le':'movie' })[movie.type];
    const externalToken = {}; externalLoads.set(card, externalToken);
    async function loadExternal() {
      if (!externalScore || !externalStatus || !externalRetry) return;
      externalScore.hidden = true; externalScore.removeAttribute('href'); externalScore.textContent = '';
      externalRetry.hidden = true;
      if (!tmdbId) { externalStatus.textContent = 'Chưa có dữ liệu'; return; }
      externalStatus.textContent = 'Đang tải điểm TMDb…'; externalRetry.disabled = true;
      try {
        const response = await api.request(`/api/movies/${encodeURIComponent(movie.slug)}/tmdb-rating`);
        if (externalLoads.get(card) !== externalToken) return;
        const rating = response?.data;
        if (response?.status && rating?.source === 'tmdb' && rating.tmdb_id === null && rating.score_10 === null && rating.vote_count === 0) { externalStatus.textContent = 'Chưa có dữ liệu'; return; }
        if (!response?.status || rating?.source !== 'tmdb' || rating.tmdb_id !== tmdbId || !['movie','tv'].includes(rating.media_type) || !Number.isSafeInteger(rating.vote_count) || rating.vote_count < 0) throw new Error();
        if (mediaType && rating.media_type !== mediaType) throw new Error();
        if (!rating.vote_count) { externalStatus.textContent = 'Chưa có đánh giá'; return; }
        if (typeof rating.score_10 !== 'number' || !Number.isFinite(rating.score_10) || rating.score_10 < 0 || rating.score_10 > 10) throw new Error();
        externalScore.textContent = `${rating.score_10.toFixed(1)}/10`;
        externalScore.href = `https://www.themoviedb.org/${rating.media_type}/${rating.tmdb_id}`;
        externalScore.title = `TMDb: ${rating.vote_count.toLocaleString('vi-VN')} lượt chấm`;
        externalScore.hidden = false;
        externalStatus.textContent = `${rating.vote_count.toLocaleString('vi-VN')} lượt chấm`;
      } catch (_) {
        if (externalLoads.get(card) !== externalToken) return;
        externalStatus.textContent = 'Chưa tải được điểm TMDb'; externalRetry.hidden = false;
      } finally { if (externalLoads.get(card) === externalToken) externalRetry.disabled = false; }
    }
    if (externalRetry) externalRetry.onclick = loadExternal;
    loadExternal();
    let busy = false, version = 0;
    function paint(data) {
      const total = Number(data.total) || 0;
      document.querySelectorAll('[data-rating-score]').forEach(el => { el.textContent = total && Number.isFinite(data.score_10) ? data.score_10.toFixed(1) : '—'; });
      document.querySelectorAll('[data-rating-count]').forEach(el => { el.textContent = total ? `${total.toLocaleString('vi-VN')} lượt bình chọn` : 'Chưa có đánh giá'; });
      distribution.replaceChildren();
      for (const score of [5, 4, 3, 2, 1]) {
        const count = Math.max(0, Number(data.distribution?.[score]) || 0);
        const percent = total ? Math.min(100, Math.round(count * 100 / total)) : 0;
        const row = document.createElement('div'); row.className = 'rating-row';
        const label = document.createElement('span'); label.textContent = `${score} ★`;
        const track = document.createElement('div'); track.className = 'rating-track';
        const fill = document.createElement('span'); fill.style.width = `${percent}%`; track.appendChild(fill);
        const value = document.createElement('span'); value.className = 'rating-percent'; value.textContent = `${percent}%`;
        row.title = `${count} phiếu ${score} sao`; row.append(label, track, value); distribution.appendChild(row);
      }
      buttons.forEach(button => {
        const selected = Number(button.dataset.score) <= Number(data.user_score || 0);
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', String(Number(button.dataset.score) === data.user_score));
      });
      if (data.user_score) status.textContent = `Bạn đã chấm ${data.user_score}/5 sao. Chọn lại để cập nhật.`;
    }
    async function load() {
      const requestVersion = ++version;
      try {
        const response = await api.request(`/api/movies/${encodeURIComponent(movie.slug)}/ratings`);
        if (requestVersion !== version) return;
        if (!response?.status) throw new Error();
        paint(response.data);
      } catch (_) {
        if (requestVersion !== version) return;
        document.querySelectorAll('[data-rating-count]').forEach(el => { el.textContent = 'Chưa tải được đánh giá'; });
        status.textContent = 'Không thể tải đánh giá. Tải lại trang để thử lại.';
      }
    }
    buttons.forEach(button => { button.onclick = async () => {
      if (busy) return;
      busy = true; ++version; buttons.forEach(el => { el.disabled = true; });
      status.textContent = 'Đang lưu đánh giá…';
      try {
        const response = await api.rateMovie(movie.slug, Number(button.dataset.score));
        if (!response?.status) throw new Error(response?.message || 'Không thể lưu. Vui lòng đăng nhập rồi thử lại.');
        paint(response.data);
      } catch (error) { status.textContent = error.message || 'Không thể lưu đánh giá. Vui lòng thử lại.'; }
      finally { busy = false; buttons.forEach(el => { el.disabled = false; }); }
    }; });
    load();
  }
  root.MovieRatings = { mount };
})(typeof window === 'undefined' ? globalThis : window);
