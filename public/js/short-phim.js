(function (root) {
  'use strict';

  const QUICK_GENRES = [
    'all',
    'Tổng tài',
    'Lồng tiếng',
    'Cổ đại',
    'Ngôn tình',
    'Xuyên không',
    'Trọng sinh',
    'Báo thù',
    'Nữ cường',
    'Hài hước'
  ];

  const state = {
    page: 1,
    limit: 24,
    genre: 'all',
    keyword: '',
    genres: [],
    hasMore: false,
    activeSlug: '',
    activeEpisode: 1,
    episodes: [],
    servers: [],
    serverIndex: 0,
    subtitleEnabled: true,
    loadToken: 0,
    hls: null
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(value, fallback = '/favicon.svg') {
    const raw = String(value ?? '').trim();
    if (!raw) return fallback;
    try {
      const origin = root.location?.origin || 'https://cineviet.live';
      const parsed = new URL(raw, origin);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.href;
      }
      return fallback;
    } catch {
      return fallback;
    }
  }

  function toast(msg, type = 'success') {
    if (typeof root.showToast === 'function') root.showToast(msg, type);
  }

  function destroyHls() {
    if (state.hls) {
      try {
        state.hls.destroy();
      } catch (_) {}
      state.hls = null;
    }
  }

  function applySubtitleTrack(subUrl) {
    const track = document.getElementById('short-subtitle-track');
    const video = document.getElementById('short-video');
    if (!track || !video) return;
    track.src = subUrl ? safeUrl(subUrl, '') : '';
    try {
      const tracks = video.textTracks;
      if (tracks && tracks.length > 0) {
        tracks[0].mode = subUrl && state.subtitleEnabled ? 'showing' : 'hidden';
      }
    } catch (_) {}
  }

  function renderGenres() {
    const selectEl = document.getElementById('short-genre-select');
    const chipsEl = document.getElementById('short-genre-chips');
    const allGenres = Array.isArray(state.genres) && state.genres.length > 0 ? state.genres : QUICK_GENRES.slice(1);

    if (selectEl) {
      selectEl.innerHTML = `<option value="all">Tất cả (${allGenres.length} thể loại)</option>` +
        allGenres.map(g => `<option value="${escapeHtml(g)}"${state.genre === g ? ' selected' : ''}>${escapeHtml(g)}</option>`).join('');
    }

    if (chipsEl) {
      const visible = [...new Set([...QUICK_GENRES, ...(state.genre && state.genre !== 'all' ? [state.genre] : [])])];
      chipsEl.innerHTML = visible.map((g) => {
        const active = (g === 'all' && (!state.genre || state.genre === 'all') && !state.keyword) || state.genre === g;
        const cls = active
          ? 'bg-primary-container text-on-primary-container font-bold shadow'
          : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest';
        return `<button type="button" data-short-genre="${escapeHtml(g)}" class="short-genre-chip px-3.5 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors cursor-pointer ${cls}">${escapeHtml(g === 'all' ? 'Tất cả' : g)}</button>`;
      }).join('');
    }
  }

  function renderCatalogGrid(items) {
    const grid = document.getElementById('short-grid');
    const statusEl = document.getElementById('short-status-text');
    const pageEl = document.getElementById('short-page-indicator');
    const prevBtn = document.getElementById('btn-short-page-prev');
    const nextBtn = document.getElementById('btn-short-page-next');
    if (!grid) return;

    if (pageEl) pageEl.textContent = `Trang ${state.page}`;
    if (prevBtn) prevBtn.disabled = state.page <= 1;
    if (nextBtn) nextBtn.disabled = !state.hasMore;

    if (statusEl) {
      const filterDesc = state.keyword
        ? `Kết quả tìm kiếm "${state.keyword}"`
        : state.genre && state.genre !== 'all'
          ? `Thể loại: ${state.genre}`
          : 'Phim ngắn mới cập nhật';
      statusEl.textContent = `${filterDesc} • Hiển thị ${items.length} phim`;
    }

    if (!Array.isArray(items) || items.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full p-10 rounded-2xl bg-surface-container-low text-center text-sm text-on-surface-variant">
          Chưa tìm thấy Short Phim phù hợp. Hãy thử đổi từ khóa hoặc thể loại khác.
        </div>`;
      return;
    }

    grid.innerHTML = items.map((item) => {
      const slug = String(item.slug || '');
      const poster = safeUrl(item.poster_url);
      const isPlaying = slug === state.activeSlug;
      const ringCls = isPlaying ? 'ring-2 ring-primary' : '';
      return `
        <article class="short-card group relative flex flex-col bg-surface-container rounded-xl overflow-hidden hover:bg-surface-container-high transition-all duration-300 hover:-translate-y-1 shadow-md hover:shadow-2xl cursor-pointer ${ringCls}" data-short-slug="${escapeHtml(slug)}">
          <div class="relative w-full aspect-[2/3] overflow-hidden bg-surface-container-highest">
            <img src="${escapeHtml(poster)}" alt="${escapeHtml(item.name)}" loading="lazy" referrerpolicy="no-referrer" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"/>
            <div class="absolute top-2.5 left-2.5 flex flex-wrap gap-1 z-10">
              <span class="px-2 py-0.5 rounded bg-primary-container text-on-primary-container font-label-badge text-[10px] font-bold uppercase shadow">Short</span>
            </div>
            <div class="absolute top-2.5 right-2.5 px-2 py-0.5 rounded bg-surface-container-lowest/85 text-secondary-fixed font-label-badge text-[10px] font-bold backdrop-blur-md z-10">
              1080p
            </div>
            <div class="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/80 to-transparent flex items-end justify-between z-10">
              <span class="font-label-badge text-[11px] text-amber-300 font-semibold">${item.episode_count_hint ? `${escapeHtml(item.episode_count_hint)} tập` : 'Xem ngay'}</span>
            </div>
            <div class="absolute inset-0 bg-primary-container/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20">
              <div class="w-12 h-12 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shadow-2xl">
                <span class="material-symbols-outlined text-[28px]">play_arrow</span>
              </div>
            </div>
          </div>
          <div class="p-3 flex flex-col gap-1 flex-1 justify-between">
            <h3 class="font-label-md text-label-md font-bold text-on-surface group-hover:text-primary transition-colors line-clamp-2">${escapeHtml(item.name || slug)}</h3>
            <p class="font-body-sm text-[11px] text-on-surface-variant line-clamp-2">${escapeHtml(item.description || '')}</p>
          </div>
        </article>`;
    }).join('');
  }

  function renderServerList() {
    const container = document.getElementById('short-server-list');
    if (!container) return;
    if (!state.servers.length) {
      container.innerHTML = '<span class="text-xs text-on-surface-variant">Chưa có luồng phát khả dụng cho tập này.</span>';
      return;
    }

    container.innerHTML = state.servers.map((srv, idx) => {
      const active = idx === state.serverIndex;
      const cls = active
        ? 'bg-primary-container text-on-primary-container font-bold shadow'
        : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest';
      return `<button type="button" data-short-server="${idx}" class="short-server-btn px-3.5 py-2 rounded-xl text-xs transition-colors cursor-pointer ${cls}">${escapeHtml(srv.name)}</button>`;
    }).join('');
  }

  function renderEpisodes() {
    const grid = document.getElementById('short-episode-grid');
    const countEl = document.getElementById('short-ep-count');
    const prevEp = document.getElementById('btn-short-prev-ep');
    const nextEp = document.getElementById('btn-short-next-ep');
    const epLabel = document.getElementById('short-player-ep-label');
    if (!grid) return;

    const total = state.episodes.length;
    if (countEl) countEl.textContent = `${total} tập`;
    if (prevEp) prevEp.disabled = state.activeEpisode <= 1;
    if (nextEp) nextEp.disabled = state.activeEpisode >= total;

    const activeSrv = state.servers[state.serverIndex];
    if (epLabel) {
      const modeText = activeSrv?.is_full ? 'Bản Full (Tất cả tập)' : `Tập ${state.activeEpisode}/${total || '?'}`;
      epLabel.textContent = modeText;
    }

    grid.innerHTML = state.episodes.map((ep) => {
      const active = Number(ep.episode) === Number(state.activeEpisode);
      const cls = active
        ? 'bg-primary-container text-on-primary-container font-extrabold shadow'
        : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest font-semibold';
      return `<button type="button" data-short-ep="${escapeHtml(ep.episode)}" class="short-ep-btn py-2 px-2 rounded-xl text-xs text-center transition-colors cursor-pointer ${cls}">Tập ${escapeHtml(ep.episode)}</button>`;
    }).join('');
  }

  function attachStreamToVideo(server) {
    const video = document.getElementById('short-video');
    const loading = document.getElementById('short-player-loading');
    if (!video || !server) return;

    const streamUrl = safeUrl(server.url, '');
    if (!streamUrl) return;

    destroyHls();
    const subUrl = server.subtitles?.[0]?.proxy_url || '';
    applySubtitleTrack(subUrl);

    if (loading) loading.classList.remove('hidden');
    const finishLoad = () => loading?.classList.add('hidden');

    if (root.Hls && root.Hls.isSupported()) {
      const hls = new root.Hls({ enableWorker: true, lowLatencyMode: false });
      state.hls = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(root.Hls.Events.MANIFEST_PARSED, () => {
        finishLoad();
        video.play?.().catch(() => {});
      });
      hls.on(root.Hls.Events.ERROR, (_ev, data) => {
        if (data?.fatal) finishLoad();
      });
    } else if (video.canPlayType?.('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.addEventListener('loadedmetadata', finishLoad, { once: true });
      video.play?.().catch(() => {});
    } else {
      video.src = streamUrl;
      finishLoad();
    }
  }

  async function loadEpisode(episodeNum) {
    if (!state.activeSlug || !root.API?.getShortflixStream) return;
    const myToken = ++state.loadToken;
    state.activeEpisode = Number(episodeNum) || 1;
    renderEpisodes();

    const loading = document.getElementById('short-player-loading');
    loading?.classList.remove('hidden');

    try {
      const data = await root.API.getShortflixStream(state.activeSlug, state.activeEpisode);
      if (myToken !== state.loadToken) return;
      state.servers = Array.isArray(data?.servers) ? data.servers : [];
      if (state.serverIndex >= state.servers.length) state.serverIndex = 0;
      renderServerList();
      renderEpisodes();

      if (state.servers[state.serverIndex]) {
        attachStreamToVideo(state.servers[state.serverIndex]);
      } else {
        loading?.classList.add('hidden');
        toast('Không tìm thấy luồng phát cho tập này', 'error');
      }
    } catch (err) {
      if (myToken !== state.loadToken) return;
      loading?.classList.add('hidden');
      toast(err?.message || 'Lỗi tải luồng phát Short Phim', 'error');
    }
  }

  async function openShortDetail(slug, episode = 1, { pushHistory = true } = {}) {
    if (!slug || !root.API?.getShortflixDetail) return;
    const section = document.getElementById('short-player-section');
    const titleEl = document.getElementById('short-player-title');
    const descEl = document.getElementById('short-player-desc');
    const posterEl = document.getElementById('short-player-poster');

    state.activeSlug = slug;
    state.serverIndex = 0;
    section?.classList.remove('hidden');
    section?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });

    if (pushHistory && root.history?.pushState) {
      try {
        root.history.pushState({ slug }, '', `/short-phim/${encodeURIComponent(slug)}`);
      } catch (_) {}
    }

    try {
      const detail = await root.API.getShortflixDetail(slug);
      if (state.activeSlug !== slug) return;
      const item = detail?.item || {};
      state.episodes = Array.isArray(detail?.episodes) ? detail.episodes : [];

      if (titleEl) titleEl.textContent = item.name || slug;
      if (descEl) descEl.textContent = item.description || '';
      if (posterEl) posterEl.src = safeUrl(item.poster_url);

      const firstEp = state.episodes.find(e => Number(e.episode) === Number(episode))
        ? Number(episode)
        : (state.episodes[0]?.episode || 1);

      await loadEpisode(firstEp);
    } catch (err) {
      toast(err?.message || 'Không tải được chi tiết Short Phim', 'error');
    }
  }

  async function loadCatalog() {
    if (!root.API?.getShortflixCatalog) return;
    const statusEl = document.getElementById('short-status-text');
    if (statusEl) statusEl.textContent = 'Đang tải danh sách Short Phim...';
    try {
      const data = await root.API.getShortflixCatalog({
        page: state.page,
        genre: state.genre,
        keyword: state.keyword,
        limit: state.limit
      });
      state.genres = Array.isArray(data?.genres) ? data.genres : [];
      state.hasMore = Boolean(data?.pagination?.hasMore);
      renderGenres();
      renderCatalogGrid(data?.items || []);
    } catch (err) {
      if (statusEl) statusEl.textContent = err?.message || 'Lỗi tải danh mục Short Phim.';
      toast(err?.message || 'Không tải được Short Phim', 'error');
    }
  }

  function bindEvents() {
    document.getElementById('btn-short-search')?.addEventListener('click', () => {
      state.keyword = String(document.getElementById('short-search-input')?.value || '').trim();
      state.genre = 'all';
      state.page = 1;
      loadCatalog();
    });

    document.getElementById('short-search-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        state.keyword = String(e.target.value || '').trim();
        state.genre = 'all';
        state.page = 1;
        loadCatalog();
      }
    });

    document.getElementById('short-genre-select')?.addEventListener('change', (e) => {
      state.genre = e.target.value || 'all';
      state.keyword = '';
      const searchEl = document.getElementById('short-search-input');
      if (searchEl) searchEl.value = '';
      state.page = 1;
      loadCatalog();
    });

    document.getElementById('short-genre-chips')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.short-genre-chip');
      if (!btn) return;
      state.genre = btn.getAttribute('data-short-genre') || 'all';
      state.keyword = '';
      const searchEl = document.getElementById('short-search-input');
      if (searchEl) searchEl.value = '';
      state.page = 1;
      loadCatalog();
    });

    document.getElementById('short-grid')?.addEventListener('click', (e) => {
      const card = e.target.closest('.short-card');
      const slug = card?.getAttribute('data-short-slug');
      if (slug) openShortDetail(slug, 1);
    });

    document.getElementById('short-episode-grid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.short-ep-btn');
      const ep = Number.parseInt(btn?.getAttribute('data-short-ep') || '', 10);
      if (Number.isFinite(ep)) loadEpisode(ep);
    });

    document.getElementById('short-server-list')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.short-server-btn');
      const idx = Number.parseInt(btn?.getAttribute('data-short-server') || '', 10);
      if (!Number.isFinite(idx) || !state.servers[idx]) return;
      state.serverIndex = idx;
      renderServerList();
      renderEpisodes();
      attachStreamToVideo(state.servers[idx]);
    });

    document.getElementById('btn-short-prev-ep')?.addEventListener('click', () => {
      if (state.activeEpisode > 1) loadEpisode(state.activeEpisode - 1);
    });

    document.getElementById('btn-short-next-ep')?.addEventListener('click', () => {
      if (state.activeEpisode < state.episodes.length) loadEpisode(state.activeEpisode + 1);
    });

    document.getElementById('btn-short-sub-toggle')?.addEventListener('click', (e) => {
      state.subtitleEnabled = !state.subtitleEnabled;
      e.currentTarget.textContent = state.subtitleEnabled ? 'Phụ đề: Bật' : 'Phụ đề: Tắt';
      const subUrl = state.servers[state.serverIndex]?.subtitles?.[0]?.proxy_url || '';
      applySubtitleTrack(subUrl);
    });

    document.getElementById('short-video')?.addEventListener('ended', () => {
      const autoNext = document.getElementById('short-auto-next')?.checked;
      const isFull = Boolean(state.servers[state.serverIndex]?.is_full);
      if (autoNext && !isFull && state.activeEpisode < state.episodes.length) {
        loadEpisode(state.activeEpisode + 1);
      }
    });

    document.getElementById('btn-short-close-player')?.addEventListener('click', () => {
      destroyHls();
      const video = document.getElementById('short-video');
      if (video) {
        video.pause?.();
        video.removeAttribute('src');
        video.load?.();
      }
      state.activeSlug = '';
      document.getElementById('short-player-section')?.classList.add('hidden');
      try { root.history?.pushState?.({}, '', '/short-phim'); } catch (_) {}
    });

    document.getElementById('btn-short-share')?.addEventListener('click', async () => {
      if (!state.activeSlug) return;
      const url = `${root.location?.origin || 'https://cineviet.live'}/short-phim/${encodeURIComponent(state.activeSlug)}`;
      try {
        await root.navigator?.clipboard?.writeText(url);
        toast('Đã sao chép link Short Phim!');
      } catch {
        toast(url, 'info');
      }
    });

    document.getElementById('btn-short-page-prev')?.addEventListener('click', () => {
      if (state.page > 1) {
        state.page -= 1;
        loadCatalog();
      }
    });

    document.getElementById('btn-short-page-next')?.addEventListener('click', () => {
      if (state.hasMore) {
        state.page += 1;
        loadCatalog();
      }
    });

    root.addEventListener?.('pagehide', destroyHls);
  }

  function init() {
    bindEvents();
    renderGenres();
    loadCatalog();

    const pathMatch = String(root.location?.pathname || '').match(/^\/short-phim\/([^/]+)\/?$/);
    if (pathMatch && pathMatch[1]) {
      const slug = decodeURIComponent(pathMatch[1]);
      const ep = Number.parseInt(new URLSearchParams(root.location?.search || '').get('ep') || '1', 10) || 1;
      openShortDetail(slug, ep, { pushHistory: false });
    }
  }

  root.ShortPhimApp = {
    init,
    loadCatalog,
    openShortDetail,
    loadEpisode
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', init);
  }
})(typeof window === 'undefined' ? globalThis : window);
