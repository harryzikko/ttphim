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
    if (window.EpisodeSources) detailData.episodes = (detailData.episodes || []).map(server => ({ ...server, server_data: EpisodeSources.playable(server) }));

    renderMovieDetail(movie, detailData?.episodes || [], !!detailData?.inWatchlist);
    renderEpisodes(detailData?.episodes || [], movie.slug, movie);
    loadSimilarMovies(movie);

  } catch (err) {
    console.error('[Detail Fetch Error]', err);
    if (window.MobileApp) MobileApp.toast('Lỗi tải chi tiết phim', 'error');
  }
});


function renderMovieDetail(movie, episodes = [], inWatchlist = false) {
  const cleanMeta = value => /^(?:n\s*\/\s*a|null|undefined|none|[-—]+)$/i.test(String(value ?? '').trim()) ? '' : String(value ?? '').trim();
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

  const bgUrl = movie.thumb_url || movie.poster_url;
  if (backdrop && bgUrl) {
    backdrop.style.backgroundImage = `url('${bgUrl}')`;
  }
  const poster = document.getElementById('m-detail-poster');
  if (poster) {
    const image = movie.poster_url || movie.thumb_url || '/favicon.svg';
    try {
      const url = new URL(image, window.location.href);
      poster.src = /^https?:$/.test(url.protocol) ? url.href : '/favicon.svg';
    } catch (_) { poster.src = '/favicon.svg'; }
    poster.alt = movie.name || 'Poster phim'; poster.hidden = false;
    poster.onerror = () => { poster.onerror = null; poster.src = '/favicon.svg'; };
  }

  if (title) title.innerText = movie.name;
  if (subtitle) {
    subtitle.innerText = [movie.origin_name, movie.year, movie.time].map(cleanMeta).filter(Boolean).join(' · ');
  }

  if (badgesWrap) {
    const cats = Array.isArray(movie.category) ? movie.category.map(c => typeof c === 'string' ? c : c.name).join(', ') : '';
    badgesWrap.replaceChildren();
    [movie.chieurap ? 'Chiếu Rạp' : '', movie.quality, movie.has_song_ngu ? 'Song Ngữ' : movie.lang, movie.episode_current, cats].map(cleanMeta).filter(Boolean).forEach(value => {
      const badge = document.createElement('span');
      badge.className = 'px-2 py-0.5 rounded bg-surface-container-high text-on-surface font-label-badge text-[10px]';
      badge.textContent = value; badgesWrap.appendChild(badge);
    });
  }

  if (rating) {
    rating.textContent = 'Đang tải đánh giá…';
    API.request(`/api/movies/${encodeURIComponent(movie.slug)}/ratings`).then(response => {
      rating.textContent = response?.status ? (response.data.total ? `${Number(response.data.score_10).toFixed(1)}/10 · ${response.data.total} phiếu` : 'Chưa có đánh giá') : 'Chưa tải được đánh giá';
    }).catch(() => { rating.textContent = 'Chưa tải được đánh giá'; });
  }

  if (content) {
    const cleanContent = (movie.content || '').replace(/<[^>]*>?/gm, '').trim();
    content.innerText = cleanContent || 'Nội dung phim đang được cập nhật.';
  }

  if (toggleContentBtn) {
    let expanded = false;
    toggleContentBtn.setAttribute('aria-controls', 'm-detail-content');
    toggleContentBtn.setAttribute('aria-expanded', 'false');
    toggleContentBtn.onclick = () => {
      expanded = !expanded;
      toggleContentBtn.setAttribute('aria-expanded', String(expanded));
      if (expanded) {
        content.classList.remove('line-clamp-3');
        toggleContentBtn.innerText = 'Thu gọn';
      } else {
        content.classList.add('line-clamp-3');
        toggleContentBtn.innerText = 'Xem thêm';
      }
    };
  }

  // Cast & Crew Rail with Avatars
  const castRail = document.getElementById('m-cast-rail');
  const castSection = document.getElementById('m-cast-section');
  if (castRail && (movie.director?.length || movie.actor?.length)) {
    function toSlug(str) {
      if (!str) return '';
      return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    const directors = (movie.director || []).filter(Boolean);
    const actors = (movie.actor || []).filter(Boolean);

    castRail.innerHTML = `
      ${directors.map(d => `
        <a href="/dien-vien/${toSlug(d)}?type=director" class="flex flex-col items-center gap-1 shrink-0 text-center w-16 cursor-pointer">
          <div class="w-12 h-12 rounded-full overflow-hidden border-2 border-primary-container p-0.5 bg-surface-container shadow-md">
            <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(d)}&background=1d1f29&color=fff&size=128&bold=true" alt="${d}" class="w-full h-full object-cover rounded-full" loading="lazy" />
          </div>
          <span class="text-[11px] font-bold text-white line-clamp-1 block w-full">${d}</span>
          <span class="text-[9px] text-primary font-semibold block uppercase">Đạo Diễn</span>
        </a>
      `).join('')}

      ${actors.map(a => `
        <a href="/dien-vien/${toSlug(a)}" class="flex flex-col items-center gap-1 shrink-0 text-center w-16 cursor-pointer">
          <div class="w-12 h-12 rounded-full overflow-hidden border-2 border-white/20 p-0.5 bg-surface-container shadow-md">
            <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(a)}&background=e50914&color=fff&size=128&bold=true" alt="${a}" class="w-full h-full object-cover rounded-full" loading="lazy" />
          </div>
          <span class="text-[11px] font-bold text-white line-clamp-1 block w-full">${a}</span>
          <span class="text-[9px] text-on-surface-variant font-semibold block uppercase">Diễn Viên</span>
        </a>
      `).join('')}
    `;
  } else if (castSection) {
    castSection.classList.add('hidden');
  }

  // Play button
  const firstServer = Math.max(0, episodes.findIndex(server => server.server_data?.length));
  const firstEp = episodes[firstServer]?.server_data?.[0]?.slug || 'tap-1';
  if (playBtn) {
    playBtn.href = `/mobile/xem-phim/${encodeURIComponent(movie.slug)}/${encodeURIComponent(firstEp)}?server=${firstServer}`;
    if (window.EpisodeSources && !episodes[firstServer]?.server_data?.length) { playBtn.removeAttribute('href'); playBtn.setAttribute('aria-disabled', 'true'); playBtn.textContent = 'Chưa có tập phát'; }
  }

  // Watchlist action
  if (watchlistBtn) {
    const renderFavorite = added => {
      watchlistIcon.innerText = 'favorite';
      watchlistIcon.style.fontVariationSettings = `'FILL' ${added ? 1 : 0}`;
      watchlistLabel.innerText = 'Yêu thích';
      watchlistBtn.setAttribute('aria-pressed', String(added));
      watchlistBtn.setAttribute('aria-label', added ? 'Bỏ yêu thích' : 'Yêu thích');
      watchlistBtn.classList.toggle('text-secondary-fixed', added);
    };
    renderFavorite(!!inWatchlist);
    watchlistBtn.onclick = async () => {
      let stored;
      try { stored = await API.getMe(); }
      catch (_) { MobileApp.toast('Chưa xác minh được phiên đăng nhập. Vui lòng thử lại.', 'error'); return; }
      if (!stored) {
        MobileApp.toast('Vui lòng đăng nhập để lưu phim', 'warning');
        setTimeout(() => {
          window.location.href = `/auth?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        }, 800);
        return;
      }
      const res = await API.toggleWatchlist({
        movie_slug: movie.slug,
        type: movie.type || '',
        category: Array.isArray(movie.category) ? movie.category.map(item => typeof item === 'string' ? item : item?.name).filter(Boolean) : [],
        movie_name: movie.name,
        poster_url: movie.poster_url,
        thumb_url: movie.thumb_url,
        year: movie.year,
        quality: movie.quality
      });
      if (!res?.status) {
        MobileApp.toast(res?.message || 'Không thể cập nhật danh sách', 'error');
        setTimeout(() => {
          window.location.href = `/auth?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        }, 800);
        return;
      }
      if (res?.data?.added) {
        renderFavorite(true);
        MobileApp.toast(`Đã thêm "${movie.name}" vào danh sách!`, 'success');
      } else {
        renderFavorite(false);
        MobileApp.toast(`Đã bỏ lưu "${movie.name}"`, 'info');
      }
    };
  }

  // Share actions
  const doShare = () => {
    MobileApp.share(`Xem phim ${movie.name} trên CineViet`, window.location.href);
  };
  if (shareBtn) shareBtn.onclick = doShare;
  if (actionShareBtn) actionShareBtn.onclick = doShare;

}

function renderEpisodes(episodes = [], movieSlug, movie = {}) {
  const escapeEpisode = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const serverPills = document.getElementById('m-server-pills');
  const episodeGrid = document.getElementById('m-episode-grid');
  const episodeCount = document.getElementById('m-episode-count');

  if (episodes.length === 0) {
    if (episodeGrid) episodeGrid.innerHTML = '<p class="col-span-4 text-xs text-on-surface-variant py-2">Đang cập nhật luồng phát...</p>';
    return;
  }

  let activeServerIdx = Math.max(0, episodes.findIndex(server => server.server_data?.length));

  function renderServerPills() {
    if (window.EpisodeSources && serverPills) {
      EpisodeSources.render(serverPills, episodes, activeServerIdx, index => {
        activeServerIdx = index;
        renderServerPills(); renderEpisodeButtons();
        const ep = EpisodeSources.playable(episodes[index])[0];
        const watch = document.getElementById('m-detail-play-btn');
        if (watch && ep) watch.href = `/mobile/xem-phim/${encodeURIComponent(movieSlug)}/${encodeURIComponent(ep.slug)}?server=${index}`;
      });
      return;
    }
    if (!serverPills) return;
    serverPills.innerHTML = episodes.map((s, idx) => `
      <button class="m-server-btn shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
        idx === activeServerIdx
          ? 'bg-primary-container text-white shadow-md'
          : 'bg-surface-container-high text-on-surface-variant hover:text-white'
      }" data-idx="${idx}">
        ${escapeEpisode(s.server_name || `Server #${idx + 1}`)}
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
    const items = window.EpisodeSources?.playable(currentServer) || currentServer?.server_data || [];

    if (episodeCount) {
      episodeCount.innerText = `${items.length} tập`;
    }

    if (items.length === 0) {
      episodeGrid.innerHTML = '<p class="col-span-4 text-xs text-on-surface-variant py-2">Chưa có tập phim</p>';
      return;
    }

    episodeGrid.innerHTML = items.map((ep, i) => `
      <a data-episode-thumb href="/mobile/xem-phim/${encodeURIComponent(movieSlug)}/${encodeURIComponent(ep.slug)}?server=${activeServerIdx}" class="episode-choice">
        <span class="episode-choice-copy"><span class="episode-choice-label">${escapeEpisode(ep.name || `Tập ${i + 1}`)}</span><span class="episode-choice-subtitle">${escapeEpisode(movie.name || '')}</span></span>
      </a>
    `).join('');
    window.EpisodeSources?.decorateThumbnails(episodeGrid, items, movie);
  }

  async function loadMobileSeasons(slug) {
    const wrapper = document.getElementById('m-seasons-wrapper');
    const select = document.getElementById('m-seasons-select');
    if (!wrapper || !select || !slug) return;
    try {
      const seasons = await API.getMovieSeasons(slug);
      if (Array.isArray(seasons) && seasons.length > 1) {
        select.innerHTML = seasons.map(s => {
          return `<option value="${escapeEpisode(s.slug)}" ${s.is_current ? 'selected' : ''}>${escapeEpisode(s.label || s.name)}</option>`;
        }).join('');
        wrapper.classList.remove('hidden');
        wrapper.classList.add('flex');
        select.onchange = e => {
          const nextSlug = e.target.value;
          if (nextSlug && nextSlug !== slug) {
            window.location.href = `/mobile/phim/${encodeURIComponent(nextSlug)}`;
          }
        };
      } else {
        wrapper.classList.add('hidden');
        wrapper.classList.remove('flex');
      }
    } catch (_) {
      wrapper.classList.add('hidden');
    }
  }

  loadMobileSeasons(movieSlug);
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
