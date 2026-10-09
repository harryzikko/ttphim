// TTPhim Mobile - Movie Detail Controller
document.addEventListener('DOMContentLoaded', async () => {
  // Extract slug from URL path: /mobile/phim/:slug or query param ?slug=
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  let slug = pathParts[pathParts.length - 1];
  if (slug === 'chi-tiet' || slug === 'phim') {
    slug = new URLSearchParams(window.location.search).get('slug') || '';
  }

  if (!slug) {
    if (window.MobileApp) MobileApp.toast('Không tìm thấy thông tin phim', 'error');
    return;
  }

  try {
    const detailData = await API.getMovieDetail(slug);
    const movie = detailData?.movie;
    if (!movie) throw new Error('Empty movie data');

    renderMovieDetail(movie);
    renderEpisodes(movie);
    loadSimilarMovies(movie);

  } catch (err) {
    console.error('[Detail Fetch Error]', err);
    if (window.MobileApp) MobileApp.toast('Lỗi tải chi tiết phim', 'error');
  }
});

let currentTrailerUrl = null;

function renderMovieDetail(movie) {
  const backdrop = document.getElementById('m-detail-backdrop');
  const title = document.getElementById('m-detail-title');
  const subtitle = document.getElementById('m-detail-subtitle');
  const badgesWrap = document.getElementById('m-detail-tech-badges');
  const rating = document.getElementById('m-detail-rating');
  const content = document.getElementById('m-detail-content');
  const toggleContentBtn = document.getElementById('toggleContentBtn');
  const playBtn = document.getElementById('m-detail-play-btn');
  const watchlistBtn = document.getElementById('m-action-watchlist');
  const watchlistIcon = document.getElementById('m-action-watchlist-icon');
  const watchlistLabel = document.getElementById('m-action-watchlist-label');
  const shareBtn = document.getElementById('m-share-btn');
  const actionShareBtn = document.getElementById('m-action-share');
  const trailerBtn = document.getElementById('m-detail-trailer-btn');
  const actionTrailerBtn = document.getElementById('m-action-trailer');

  const bgUrl = movie.thumb_url || movie.poster_url;
  if (backdrop && bgUrl) {
    backdrop.style.backgroundImage = `url('${bgUrl}')`;
  }

  if (title) title.innerText = movie.name;
  if (subtitle) {
    subtitle.innerText = `${movie.origin_name || ''} • ${movie.year || 2024} • ${movie.time || '120 phút'}`;
  }

  if (badgesWrap) {
    const cats = Array.isArray(movie.category) ? movie.category.map(c => typeof c === 'string' ? c : c.name).join(', ') : '';
    badgesWrap.innerHTML = `
      <span class="px-2 py-0.5 rounded bg-surface-container-high text-on-surface font-label-badge text-[10px]">${movie.chieurap ? 'Chiếu Rạp' : 'T16'}</span>
      <span class="px-2 py-0.5 rounded bg-surface-container-high text-secondary-fixed font-label-badge text-[10px]">${movie.quality || '4K Ultra HD'}</span>
      <span class="px-2 py-0.5 rounded bg-surface-container-high text-tertiary-fixed font-label-badge text-[10px]">${movie.lang || 'Vietsub'}</span>
      ${movie.episode_current ? `<span class="px-2 py-0.5 rounded bg-primary-container/20 text-primary-container font-label-badge text-[10px] font-bold">${movie.episode_current}</span>` : ''}
      ${cats ? `<span class="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-label-badge text-[10px] truncate max-w-[150px]">${cats}</span>` : ''}
    `;
  }

  if (rating) {
    rating.innerHTML = `${movie.rating || '9.2'}<span class="text-[11px] text-on-surface-variant font-normal">/10</span>`;
  }

  if (content) {
    const cleanContent = (movie.content || '').replace(/<[^>]*>?/gm, '').trim();
    content.innerText = cleanContent || 'Bộ phim hấp dẫn đang được phát sóng độc quyền với chất lượng 4K HDR...';
  }

  if (toggleContentBtn) {
    let expanded = false;
    toggleContentBtn.onclick = () => {
      expanded = !expanded;
      if (expanded) {
        content.classList.remove('line-clamp-3');
        toggleContentBtn.innerText = 'Thu gọn';
      } else {
        content.classList.add('line-clamp-3');
        toggleContentBtn.innerText = 'Xem thêm';
      }
    };
  }

  // Play button
  const firstEp = movie.episodes?.[0]?.server_data?.[0]?.slug || 'tap-1';
  if (playBtn) {
    playBtn.href = `/mobile/xem-phim/${movie.slug}/${firstEp}`;
  }

  // Watchlist action
  if (watchlistBtn) {
    watchlistBtn.onclick = async () => {
      const res = await API.toggleWatchlist({
        movie_slug: movie.slug,
        movie_name: movie.name,
        poster_url: movie.poster_url,
        thumb_url: movie.thumb_url,
        year: movie.year,
        quality: movie.quality
      });
      if (res?.data?.added) {
        watchlistIcon.innerText = 'check';
        watchlistLabel.innerText = 'Đã Lưu';
        watchlistBtn.classList.add('text-secondary-fixed');
        MobileApp.toast(`Đã thêm "${movie.name}" vào danh sách!`, 'success');
      } else {
        watchlistIcon.innerText = 'bookmark_add';
        watchlistLabel.innerText = 'Yêu Thích';
        watchlistBtn.classList.remove('text-secondary-fixed');
        MobileApp.toast(`Đã bỏ lưu "${movie.name}"`, 'info');
      }
    };
  }

  // Share actions
  const doShare = () => {
    MobileApp.share(`Xem phim ${movie.name} chất lượng 4K trên TTPhim`, window.location.href);
  };
  if (shareBtn) shareBtn.onclick = doShare;
  if (actionShareBtn) actionShareBtn.onclick = doShare;

  // Trailer actions
  currentTrailerUrl = movie.trailer_url;
  const doTrailer = () => openTrailerModal(currentTrailerUrl);
  if (trailerBtn) trailerBtn.onclick = doTrailer;
  if (actionTrailerBtn) actionTrailerBtn.onclick = doTrailer;
}

function renderEpisodes(movie) {
  const serverPills = document.getElementById('m-server-pills');
  const episodeGrid = document.getElementById('m-episode-grid');
  const episodeCount = document.getElementById('m-episode-count');

  const episodes = movie.episodes || [];
  if (episodes.length === 0) {
    if (episodeGrid) episodeGrid.innerHTML = '<p class="col-span-4 text-xs text-on-surface-variant py-2">Đang cập nhật luồng phát...</p>';
    return;
  }

  let activeServerIdx = 0;

  function renderServerPills() {
    if (!serverPills) return;
    serverPills.innerHTML = episodes.map((s, idx) => `
      <button class="m-server-btn shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
        idx === activeServerIdx
          ? 'bg-primary-container text-white shadow-md'
          : 'bg-surface-container-high text-on-surface-variant hover:text-white'
      }" data-idx="${idx}">
        ${s.server_name || `Server #${idx + 1}`}
      </button>
    `).join('');

    serverPills.querySelectorAll('.m-server-btn').forEach(btn => {
      btn.onclick = () => {
        activeServerIdx = parseInt(btn.getAttribute('data-idx'), 10);
        renderServerPills();
        renderEpisodeButtons();
      };
    });
  }

  function renderEpisodeButtons() {
    if (!episodeGrid) return;
    const currentServer = episodes[activeServerIdx];
    const items = currentServer?.server_data || [];

    if (episodeCount) {
      episodeCount.innerText = `${items.length} tập`;
    }

    if (items.length === 0) {
      episodeGrid.innerHTML = '<p class="col-span-4 text-xs text-on-surface-variant py-2">Chưa có tập phim</p>';
      return;
    }

    episodeGrid.innerHTML = items.map((ep, i) => `
      <a href="/mobile/xem-phim/${movie.slug}/${ep.slug}?server=${activeServerIdx}" class="py-2.5 px-2 rounded-xl text-center text-[12px] font-bold bg-surface-container hover:bg-surface-container-highest active:scale-95 transition-all text-on-surface border border-white/5 truncate block">
        ${ep.name || `Tập ${i + 1}`}
      </a>
    `).join('');
  }

  renderServerPills();
  renderEpisodeButtons();
}

async function loadSimilarMovies(movie) {
  const container = document.getElementById('m-detail-similar');
  if (!container) return;

  try {
    let catSlug = '';
    if (Array.isArray(movie.category) && movie.category.length > 0) {
      catSlug = movie.category[0].slug || '';
    }

    const data = await API.getCatalog({ category: catSlug, limit: 10 });
    const items = (data?.items || []).filter(m => m.slug !== movie.slug).slice(0, 8);

    if (items.length === 0) {
      container.innerHTML = '<p class="text-xs text-on-surface-variant py-2">Không có phim tương tự</p>';
      return;
    }

    container.innerHTML = items.map(m => `
      <a href="/mobile/phim/${m.slug}" class="shrink-0 w-28 flex flex-col group touch-feedback cursor-pointer">
        <div class="relative w-full aspect-[2/3] rounded-xl overflow-hidden bg-surface-container shadow-md">
          <img src="${m.poster_url || m.thumb_url}" alt="${m.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
          <span class="absolute bottom-1 left-1 px-1 rounded bg-black/60 font-label-badge text-[9px] text-secondary font-bold">${m.quality || 'HD'}</span>
        </div>
        <h4 class="text-[12px] font-bold text-on-surface truncate mt-1">${m.name}</h4>
      </a>
    `).join('');

  } catch (e) {}
}

function openTrailerModal(trailerUrl) {
  const modal = document.getElementById('trailerModal');
  const iframe = document.getElementById('trailerIframe');
  const closeBtn = document.getElementById('closeTrailerBtn');

  if (!trailerUrl) {
    MobileApp.toast('Phim này chưa có link Trailer', 'info');
    return;
  }

  let embedUrl = trailerUrl;
  if (trailerUrl.includes('youtube.com/watch?v=')) {
    embedUrl = trailerUrl.replace('watch?v=', 'embed/');
  } else if (trailerUrl.includes('youtu.be/')) {
    embedUrl = trailerUrl.replace('youtu.be/', 'youtube.com/embed/');
  }

  if (iframe) iframe.src = embedUrl;
  if (modal) modal.classList.remove('hidden');

  if (closeBtn) {
    closeBtn.onclick = () => {
      if (iframe) iframe.src = '';
      if (modal) modal.classList.add('hidden');
    };
  }
}

