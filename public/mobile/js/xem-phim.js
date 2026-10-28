// TTPhim - Mobile Video Player Controller
document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  
  // Handles /mobile/xem-phim/:slug/:episode or /mobile/xem-phim/:slug or query params
  let slug = '';
  let epSlug = '';

  const xemIndex = pathParts.indexOf('xem-phim');
  if (xemIndex !== -1 && pathParts[xemIndex + 1]) {
    slug = pathParts[xemIndex + 1];
    epSlug = pathParts[xemIndex + 2] || '';
  }
  if (!slug) {
    slug = urlParams.get('slug') || '';
    epSlug = urlParams.get('ep') || urlParams.get('episode') || '';
  }

  if (!slug) {
    window.location.href = '/mobile';
    return;
  }

  // Elements
  const playerWrapper = document.getElementById('m-player-wrapper');
  const videoEl = document.getElementById('m-video-player');
  const iframeEl = document.getElementById('m-iframe-player');
  const loaderEl = document.getElementById('m-player-loader');
  const overlayEl = document.getElementById('m-player-overlay');
  
  const movieNameEl = document.getElementById('m-player-movie-name');
  const epNameEl = document.getElementById('m-player-ep-name');
  const playBtn = document.getElementById('m-center-play-btn');
  const playIcon = document.getElementById('m-center-play-icon');
  const rewindBtn = document.getElementById('m-rewind-10');
  const forwardBtn = document.getElementById('m-forward-10');
  const scrubberWrap = document.getElementById('m-scrubber-wrap');
  const progressBar = document.getElementById('m-progress-bar');
  const scrubberThumb = document.getElementById('m-scrubber-thumb');
  const timeCurrentEl = document.getElementById('m-time-current');
  const timeDurationEl = document.getElementById('m-time-duration');
  const speedBtn = document.getElementById('m-speed-btn');
  const fullscreenBtn = document.getElementById('m-fullscreen-btn');

  const infoTitle = document.getElementById('m-info-title');
  const infoSub = document.getElementById('m-info-sub');
  const favBtn = document.getElementById('m-info-fav-btn');
  const favIcon = document.getElementById('m-info-fav-icon');
  const serverContainer = document.getElementById('m-watch-servers');
  const epListContainer = document.getElementById('m-watch-ep-list');
  const epTotalEl = document.getElementById('m-watch-ep-total');

  const epDrawerBackdrop = document.getElementById('epDrawerBackdrop');
  const drawerToggleBtn = document.getElementById('m-player-drawer-toggle');
  const closeDrawerBtn = document.getElementById('closeEpDrawerBtn');
  const drawerGrid = document.getElementById('m-drawer-grid');

  const commentInput = document.getElementById('m-comment-input');
  const commentSend = document.getElementById('m-comment-send');
  const commentList = document.getElementById('m-comment-list');

  let movieData = null;
  let allServers = [];
  let currentServerIndex = 0;
  let currentEpIndex = 0;
  let currentEpisodes = [];
  let hlsInstance = null;
  let hideOverlayTimer = null;
  let isDraggingScrubber = false;
  const speeds = window.PlayerPreferences?.SPEEDS || [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  let currentSpeedIdx = speeds.indexOf(1), playbackPreferences = null;
  let playerSession = null, progressStore = null, user = null;
  let nextTimer = null, historyTimer = null, embedSession = null;
  let recoveryPrompt = null, recoveryEpisode = '';
  const failedSources = new Set();
  function offerRecovery(ep, time, engine, message) {
    if (!window.PlayerRecovery || currentEpisodes[currentEpIndex] !== ep) return;
    recoveryPrompt?.destroy();
    const serverIndex = currentServerIndex;
    const key = PlayerRecovery.sourceKey(engine, engine === 'hls' ? ep.link_m3u8 : ep.link_embed);
    failedSources.add(key);
    recoveryPrompt = PlayerRecovery.offer({
      container: playerWrapper, servers: allServers, episode: ep, serverIndex, time, failed: failedSources, message,
      retry: () => { if (currentEpisodes[currentEpIndex] !== ep || currentServerIndex !== serverIndex) return; failedSources.delete(key); loadEpisode(currentEpIndex, time, engine); },
      choose: (option, resume) => {
        if (currentEpisodes[currentEpIndex] !== ep || currentServerIndex !== serverIndex) return;
        cleanupPlayer(); currentServerIndex = option.serverIndex; currentEpisodes = allServers[currentServerIndex].server_data;
        renderServerPills(); loadEpisode(currentEpisodes.indexOf(option.episode), resume, option.engine);
      }
    });
  }
  const notify = (message, type = 'info') => MobileApp.toast(message, type);
  const updateStatus = PlayerUX.createStatus(playerWrapper, {
    embedHelpContainer: document.getElementById('m-embed-player-help'),
    retry: () => {
      if (nextTimer) { clearTimeout(nextTimer); nextTimer = null; updateStatus('ready'); return; }
      if (movieData) {
        const history = progressStore?.get();
        const resume = PlayerUX.selectInitial(allServers, epSlug, currentServerIndex, history).resume;
        loadEpisode(currentEpIndex, resume);
      } else window.location.reload();
    },
    changeServer: () => serverContainer?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    play: () => playerSession?.play()
  });
  function saveProgress(keepalive = false) {
    if (!iframeEl.classList.contains('hidden')) return;
    return progressStore?.save(currentEpisodes[currentEpIndex], allServers[currentServerIndex]?.server_name, videoEl, keepalive);
  }
  function cleanupPlayer() {
    recoveryPrompt?.destroy(); recoveryPrompt = null;
    clearTimeout(nextTimer);
    nextTimer = null;
    embedSession?.destroy();
    embedSession = null;
    playerSession?.destroy();
    playerSession = null;
    hlsInstance = null;
    iframeEl.onload = null;
    iframeEl.src = 'about:blank';
    updateStatus('ready');
  }
  window.addEventListener('pagehide', () => { saveProgress(true); cleanupPlayer(); clearInterval(historyTimer); clearTimeout(hideOverlayTimer); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveProgress(true); });

  window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
  [[playBtn, 'Phát hoặc tạm dừng'], [rewindBtn, 'Tua lùi 10 giây'], [forwardBtn, 'Tua tới 10 giây'],
    [fullscreenBtn, 'Toàn màn hình'], [drawerToggleBtn, 'Chọn tập phim'], [commentSend, 'Gửi bình luận']]
    .forEach(([button, label]) => button?.setAttribute('aria-label', label));
  // Format seconds to mm:ss or hh:mm:ss
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // Load Movie Data
  try {
    loaderEl.classList.remove('hidden');
    [movieData, user] = await Promise.all([API.getMovieDetail(slug), API.getMe()]);
    if (window.PlayerPreferences) {
      playbackPreferences = PlayerPreferences.create({ user, api: API });
      await playbackPreferences.load();
      playbackPreferences.subscribe(value => {
        currentSpeedIdx = speeds.indexOf(value.playback_speed);
        if (speedBtn) speedBtn.textContent = `${value.playback_speed}x`;
        if (!value.auto_next) cancelPendingNext();
      });
    }
    if (!movieData || !movieData.movie) {
      notify('Không tìm thấy dữ liệu phim', 'error');
      setTimeout(() => window.location.href = '/mobile', 1500);
      return;
    }

    const movie = movieData.movie;
    allServers = (movieData.episodes || []).map(server => window.EpisodeSources ? { ...server, server_data: EpisodeSources.playable(server) } : server);

    document.title = `${movie.name} - Đang xem - CineViet`;
    if (movieNameEl) movieNameEl.textContent = movie.name;
    if (infoTitle) infoTitle.textContent = movie.name;

    // Check watchlist state
    updateFavButtonState(Boolean(movieData.inWatchlist));
    progressStore = PlayerUX.createProgress({ movie, user, api: API });

    if (favBtn) {
      favBtn.addEventListener('click', async () => {
        try {
          const loggedInUser = user || (localStorage.getItem('kk_user') ? JSON.parse(localStorage.getItem('kk_user')) : null);
          if (!loggedInUser) {
            notify('Vui lòng đăng nhập để lưu phim vào danh sách!', 'warning');
            setTimeout(() => {
              window.location.href = `/auth?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
            }, 800);
            return;
          }
          const result = await API.toggleWatchlist({ movie_slug: movie.slug, movie_name: movie.name,
            origin_name: movie.origin_name, poster_url: movie.poster_url, thumb_url: movie.thumb_url,
            quality: movie.quality, year: movie.year });
          if (!result.status) throw new Error(result.message);
          updateFavButtonState(result.data.added);
          notify(result.data.added ? 'Đã thêm vào Danh sách' : 'Đã xóa khỏi Danh sách');
        } catch (error) { notify(error.message || 'Không thể lưu phim', 'error'); }
      });
    }

    if (allServers.length === 0) {
      loaderEl.classList.add('hidden');
      updateStatus('error', 'Phim chưa có tập phát. Bạn có thể quay lại trang chi tiết.');
      return;
    }

    const localHistory = progressStore.get();
    const history = localHistory && (!movieData.watchedHistory || localHistory.updated_at > movieData.watchedHistory.updated_at) ? localHistory : movieData.watchedHistory;
    const selected = PlayerUX.selectInitial(allServers, epSlug, urlParams.get('server'), history);
    currentServerIndex = selected.server;
    currentEpisodes = allServers[currentServerIndex]?.server_data || [];
    renderServerPills();
    loadEpisode(selected.index, selected.resume);
    historyTimer = setInterval(() => { if (!videoEl.paused) saveProgress(); }, 10000);

    // Setup Comments
    setupComments(movie.slug);

    // Setup Seasons Selector (Netflix Style)
    loadMobileWatchSeasons(movie.slug);

  } catch (err) {
    console.error('Player error:', err);
    loaderEl.classList.add('hidden');
    updateStatus('error', 'Không thể tải phim. Kiểm tra kết nối và tải lại trang.');
    notify('Lỗi tải phim: ' + err.message, 'error');
  }

  async function loadMobileWatchSeasons(movieSlug) {
    const wrapper = document.getElementById('m-watch-seasons-wrapper');
    const select = document.getElementById('m-watch-seasons-select');
    if (!wrapper || !select || !movieSlug) return;
    try {
      const seasons = await API.getMovieSeasons(movieSlug);
      if (Array.isArray(seasons) && seasons.length > 1) {
        const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
        select.innerHTML = seasons.map(s => {
          return `<option value="${esc(s.slug)}" ${s.is_current ? 'selected' : ''}>${esc(s.label || s.name)}</option>`;
        }).join('');
        wrapper.classList.remove('hidden');
        wrapper.classList.add('flex');
        select.onchange = e => {
          const nextSlug = e.target.value;
          if (nextSlug && nextSlug !== movieSlug) {
            window.location.href = `/mobile/xem-phim/${encodeURIComponent(nextSlug)}`;
          }
        };
      } else {
        wrapper.classList.add('hidden');
        wrapper.classList.remove('flex');
      }
    } catch (_) {
      wrapper.classList.add('hidden');
      wrapper.classList.remove('flex');
    }
  }

  function updateFavButtonState(isSaved) {
    if (!favIcon) return;
    favBtn?.setAttribute('aria-label', isSaved ? 'Bỏ yêu thích' : 'Yêu thích');
    favBtn?.setAttribute('aria-pressed', String(isSaved));
    if (isSaved) {
      favIcon.textContent = 'bookmark_added';
      favIcon.classList.add('text-primary-container');
    } else {
      favIcon.textContent = 'bookmark_add';
      favIcon.classList.remove('text-primary-container');
    }
  }

  // Render Server selector
  function renderServerPills() {
    if (!serverContainer) return;
    if (window.EpisodeSources) {
      EpisodeSources.render(serverContainer, allServers, currentServerIndex, selectServer);
      return;
    }
    serverContainer.innerHTML = '';
    allServers.forEach((srv, idx) => {
      const btn = document.createElement('button');
      btn.className = `px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
        idx === currentServerIndex
          ? 'bg-primary-container text-white shadow-md shadow-primary-container/30'
          : 'bg-surface-container text-on-surface-variant hover:text-white'
      }`;
      btn.textContent = srv.server_name || `Server ${idx + 1}`;
      btn.addEventListener('click', () => {
        selectServer(idx);
      });
      serverContainer.appendChild(btn);
    });
  }

  // Switch Server
  function selectServer(serverIdx) {
    saveProgress(true);
    const previousEpisode = currentEpisodes[currentEpIndex];
    const previousTime = videoEl.currentTime || 0;
    cleanupPlayer();
    currentServerIndex = serverIdx;
    renderServerPills();
    currentEpisodes = allServers[currentServerIndex]?.server_data || [];
    const target = currentEpisodes.findIndex(ep => PlayerUX.episodeMatches(ep.slug, previousEpisode?.slug) || PlayerUX.episodeMatches(ep.name, previousEpisode?.name));
    loadEpisode(Math.max(0, target), target >= 0 ? previousTime : 0);
  }

  // Load specific Episode
  function loadEpisode(epIdx, initialTime = 0, engine = '') {
    saveProgress(true);
    cleanupPlayer();
    if (!currentEpisodes[epIdx]) {
      loaderEl.classList.add('hidden');
      updateStatus('error', 'Server này chưa có tập phát. Hãy chọn server khác.');
      return;
    }
    currentEpIndex = epIdx;
    const ep = currentEpisodes[epIdx];
    if (!PlayerUX.episodeMatches(recoveryEpisode, ep.slug)) failedSources.clear();
    recoveryEpisode = ep.slug;
    epSlug = ep.slug;
    window.dispatchEvent(new CustomEvent('cineviet:episode-change', { detail: { slug: ep.slug } }));
    window.history.replaceState(null, '', `/mobile/xem-phim/${slug}/${ep.slug}?server=${currentServerIndex}`);
    if (epTotalEl) epTotalEl.textContent = `${currentEpisodes.length} tập`;

    if (epNameEl) epNameEl.textContent = ep.name || `Tập ${epIdx + 1}`;
    if (infoSub) infoSub.textContent = `Server: ${allServers[currentServerIndex]?.server_name || 'VIP'} • ${ep.name || 'Tập ' + (epIdx + 1)}`;

    renderEpisodesHorizontal();
    renderEpisodesDrawer();

    const streamUrl = ep.link_m3u8 || '';
    const embedUrl = ep.link_embed || '';

    if (engine === 'embed' || (!streamUrl && embedUrl)) fallbackToEmbed(embedUrl);
    else playStream(streamUrl, embedUrl, ep, initialTime);
  }

  // Render Episode horizontal list
  function renderEpisodesHorizontal() {
    if (!epListContainer) return;
    epListContainer.innerHTML = '';
    currentEpisodes.forEach((ep, idx) => {
      const isCur = idx === currentEpIndex;
      const chip = document.createElement('button');
      chip.className = `px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 transition-all ${
        isCur
          ? 'bg-primary-container text-white shadow-md shadow-primary-container/30 ring-1 ring-white/20'
          : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
      }`;
      chip.textContent = ep.name || `Tập ${idx + 1}`;
      chip.classList.add('episode-mobile-choice');
      if (isCur) chip.setAttribute('aria-current', 'true');
      if (window.EpisodeSources) chip.prepend(EpisodeSources.image(ep, movieData.movie));
      chip.addEventListener('click', () => {
        loadEpisode(idx);
      });
      epListContainer.appendChild(chip);

      if (isCur) {
        setTimeout(() => { if (chip.isConnected) epListContainer.scrollTo({ left: chip.offsetLeft - epListContainer.offsetLeft - (epListContainer.clientWidth - chip.clientWidth) / 2, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, 100);
      }
    });
  }

  // Render Episode Grid in Drawer
  function renderEpisodesDrawer() {
    if (!drawerGrid) return;
    drawerGrid.innerHTML = '';
    currentEpisodes.forEach((ep, idx) => {
      const isCur = idx === currentEpIndex;
      const btn = document.createElement('button');
      btn.className = `p-2.5 rounded-xl text-xs font-bold text-center transition-all ${
        isCur
          ? 'bg-primary-container text-white shadow-md'
          : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
      }`;
      btn.textContent = ep.name || `Tập ${idx + 1}`;
      btn.classList.add('episode-mobile-choice');
      if (isCur) btn.setAttribute('aria-current', 'true');
      if (window.EpisodeSources) btn.prepend(EpisodeSources.image(ep, movieData.movie));
      btn.addEventListener('click', () => {
        loadEpisode(idx);
        closeEpisodeDrawer();
      });
      drawerGrid.appendChild(btn);
    });
  }

  // Play stream logic (HLS -> Direct -> Embed)
  function playStream(m3u8Url, embedUrl, ep, initialTime = 0) {
    loaderEl.classList.add('hidden');
    iframeEl.classList.add('hidden');
    overlayEl.hidden = false;
    videoEl.classList.remove('hidden');
    videoEl.playbackRate = speeds[currentSpeedIdx];
    playerSession = PlayerUX.createSession({
      video: videoEl, Hls: window.Hls, url: m3u8Url, embedUrl, initialTime,
      preferences: playbackPreferences, tracksContainer: playerWrapper,
      onHls: hls => { hlsInstance = hls; },
      onState: updateStatus,
      onBeforeStop: () => saveProgress(true),
      onFailure: (time, message) => { updateStatus('error', message || 'Nguồn phát gặp lỗi.'); offerRecovery(ep, time, 'hls', message); }
    });
  }

  function fallbackToEmbed(embedUrl) {
    playerSession?.destroy();
    playerSession = null;
    hlsInstance = null;
    if (!embedUrl) { updateStatus('error', 'Không tìm thấy luồng phát khả dụng.'); return; }
    videoEl.classList.add('hidden');
    overlayEl.hidden = true;
    iframeEl.classList.remove('hidden');
    loaderEl.classList.add('hidden');
    embedSession?.destroy();
    embedSession = PlayerUX.createEmbedSession({ iframe: iframeEl, url: embedUrl, onState: updateStatus,
      onFailure: message => offerRecovery(currentEpisodes[currentEpIndex], PlayerUX.selectInitial(allServers, epSlug, currentServerIndex, progressStore?.get()).resume, 'embed', message) });
  }

  // Video Native Event Listeners
  function cancelPendingNext() {
    if (!nextTimer) return;
    clearTimeout(nextTimer); nextTimer = null;
    updateStatus('ready');
  }
  videoEl.addEventListener('seeking', () => { if (!videoEl.ended) cancelPendingNext(); });
  videoEl.addEventListener('play', () => {
    cancelPendingNext();
    if (playIcon) playIcon.textContent = 'pause';
    scheduleHideOverlay();
  });

  videoEl.addEventListener('pause', () => {
    if (playIcon) playIcon.textContent = 'play_arrow';
    showOverlay();
    saveProgress();
  });

  videoEl.addEventListener('timeupdate', () => {
    if (isDraggingScrubber) return;
    const cur = videoEl.currentTime || 0;
    const dur = videoEl.duration || 0;
    if (timeCurrentEl) timeCurrentEl.textContent = formatTime(cur);
    if (timeDurationEl && dur > 0) timeDurationEl.textContent = formatTime(dur);

    if (dur > 0 && progressBar) {
      const pct = (cur / dur) * 100;
      progressBar.style.width = `${pct}%`;
      if (scrubberThumb) scrubberThumb.style.left = `${pct}%`;
    }
  });

  videoEl.addEventListener('waiting', () => {
    // Loading state is owned by the current playback session.
  });

  videoEl.addEventListener('playing', () => {
    if (playerSession?.isActive()) updateStatus('ready');
  });

  videoEl.addEventListener('ended', () => {
    saveProgress(true);
    if (playbackPreferences ? !playbackPreferences.get().auto_next : localStorage.getItem('TTPhim_auto_next') === 'false') return;
    if (currentEpIndex + 1 < currentEpisodes.length) {
      notify('Tập tiếp theo sau 3 giây…');
      clearTimeout(nextTimer);
      updateStatus('next', 'Tập tiếp theo sẽ phát sau 3 giây.');
      nextTimer = setTimeout(() => { nextTimer = null; loadEpisode(currentEpIndex + 1); }, 3000);
    }
  });

  // Touch Overlay Visibility Handlers
  function showOverlay() {
    overlayEl.style.opacity = '1';
    overlayEl.style.pointerEvents = 'auto';
    clearTimeout(hideOverlayTimer);
  }

  function hideOverlay() {
    if (videoEl.paused || overlayEl.contains(document.activeElement)) return;
    overlayEl.style.opacity = '0';
    overlayEl.style.pointerEvents = 'none';
  }

  function scheduleHideOverlay() {
    clearTimeout(hideOverlayTimer);
    hideOverlayTimer = setTimeout(() => {
      hideOverlay();
    }, 3500);
  }
  overlayEl.addEventListener('focusin', showOverlay);
  overlayEl.addEventListener('focusout', scheduleHideOverlay);

  // Toggle overlay on tapping video
  playerWrapper.addEventListener('click', (e) => {
    if (e.target.closest('#m-player-overlay button') || e.target.closest('#m-scrubber-wrap')) {
      scheduleHideOverlay();
      return;
    }
    const isVisible = overlayEl.style.opacity === '1';
    if (isVisible) {
      hideOverlay();
    } else {
      showOverlay();
      scheduleHideOverlay();
    }
  });

  // Center Play/Pause Toggle
  if (playBtn) {
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (videoEl.paused) {
        playerSession?.play();
      } else {
        videoEl.pause();
      }
    });
  }

  // Rewind / Forward 10s
  if (rewindBtn) {
    rewindBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      videoEl.currentTime = Math.max(0, videoEl.currentTime - 10);
      scheduleHideOverlay();
    });
  }

  if (forwardBtn) {
    forwardBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      videoEl.currentTime = Math.min(videoEl.duration || 0, videoEl.currentTime + 10);
      scheduleHideOverlay();
    });
  }

  // Scrubber Seeking
  if (scrubberWrap) {
    function seekFromEvent(e) {
      const rect = scrubberWrap.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      if (videoEl.duration) {
        videoEl.currentTime = pos * videoEl.duration;
      }
      if (progressBar) progressBar.style.width = `${pos * 100}%`;
      if (scrubberThumb) scrubberThumb.style.left = `${pos * 100}%`;
    }

    scrubberWrap.addEventListener('touchstart', (e) => {
      isDraggingScrubber = true;
      seekFromEvent(e);
    });

    scrubberWrap.addEventListener('touchmove', (e) => {
      if (isDraggingScrubber) seekFromEvent(e);
    });

    scrubberWrap.addEventListener('touchend', () => {
      isDraggingScrubber = false;
      scheduleHideOverlay();
    });

    scrubberWrap.addEventListener('click', (e) => {
      e.stopPropagation();
      seekFromEvent(e);
      scheduleHideOverlay();
    });
  }

  // Speed selector
  if (speedBtn) {
    speedBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const index = (currentSpeedIdx + 1) % speeds.length;
      const rate = speeds[index];
      if (playbackPreferences) {
        if (!await playbackPreferences.update({ playback_speed: rate })) notify('Chưa lưu được tốc độ phát. Vui lòng thử lại.', 'error');
      } else { currentSpeedIdx = index; videoEl.playbackRate = rate; speedBtn.textContent = `${rate}x`; }
      scheduleHideOverlay();
    });
  }

  // Fullscreen button
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (videoEl.webkitEnterFullscreen && !videoEl.classList.contains('hidden')) {
        videoEl.webkitEnterFullscreen();
      } else if (playerWrapper.requestFullscreen) {
        const request = playerWrapper.requestFullscreen();
        request?.catch(() => notify('Trình duyệt chưa cho phép toàn màn hình.', 'error'));
      }
    });
  }

  // Episode Drawer Toggle
  document.getElementById('m-open-episodes')?.addEventListener('click', openEpisodeDrawer);
  if (drawerToggleBtn) {
    drawerToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEpisodeDrawer();
    });
  }

  if (closeDrawerBtn) {
    closeDrawerBtn.addEventListener('click', () => {
      closeEpisodeDrawer();
    });
  }

  if (epDrawerBackdrop) {
    epDrawerBackdrop.addEventListener('click', (e) => {
      if (e.target === epDrawerBackdrop) closeEpisodeDrawer();
    });
  }

  async function openEpisodeDrawer() {
    if (!epDrawerBackdrop) return;
    if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch (_) { return; } }
    else if (document.webkitFullscreenElement) { try { document.webkitExitFullscreen(); } catch (_) { return; } }
    epDrawerBackdrop.classList.add('active');
    setTimeout(() => { if (epDrawerBackdrop.classList.contains('active')) closeDrawerBtn?.focus({ preventScroll: true }); }, 50);
  }

  function closeEpisodeDrawer() {
    if (!epDrawerBackdrop) return;
    epDrawerBackdrop.classList.remove('active');
  }


  // Real comments shared with the desktop player.
  async function setupComments(movieSlug) {
    let comments = [];
    if (!commentList) return;
    const threadScope = window.CommentThreads?.scope({ list: commentList, servers: allServers, current: () => currentEpisodes[currentEpIndex]?.slug || '', watch: true, onChange: () => renderComments() });
    const spoilerCheck = commentInput && window.CommentThreads?.spoilerInput(commentInput);
    window.addEventListener('cineviet:episode-change', () => renderComments());
    function renderComments() {
      commentList.replaceChildren();
      const visible = threadScope ? threadScope.filter(comments) : comments;
      visible.forEach(comment => {
        const item = document.createElement('div');
        item.id = `mobile-comment-${comment.id}`;
        item.className = 'p-2.5 rounded-xl bg-surface-container flex flex-col gap-1 border border-white/5';
        const name = document.createElement('strong');
        name.textContent = comment.user_name || 'Khán giả';
        const content = document.createElement('p');
        content.textContent = comment.content || '';
        item.append(name);
        if (comment.is_spoil) {
          content.className = 'spoiler-body';
          const toggle = document.createElement('button'); toggle.type = 'button'; toggle.dataset.spoilerToggle = ''; toggle.textContent = 'Hiện spoiler';
          item.append(toggle);
        }
        item.append(content);
        if (comment.replies?.length) {
          const replies = document.createElement('div'); replies.dataset.commentReplies = '';
          comment.replies.forEach(reply => { const row = document.createElement('p'); row.textContent = `${reply.user_name || 'Khán giả'}: ${reply.content || ''}`; replies.append(row); });
          item.append(replies);
        }
        commentList.appendChild(item);
      });
      window.CommentThreads?.protect(commentList, visible, 'mobile-comment-');
      if (!visible.length) commentList.textContent = 'Chưa có bình luận trong mục này. Hãy chia sẻ cảm nhận của bạn.';
    }
    try { comments = await API.getComments(movieSlug); renderComments(); }
    catch (_) { commentList.textContent = 'Không thể tải bình luận. Tải lại trang để thử lại.'; }
    if (commentSend && commentInput) {
      commentSend.addEventListener('click', async () => {
        const content = commentInput.value.trim();
        if (!content || commentSend.disabled) return;
        const loggedInUser = user || (localStorage.getItem('kk_user') ? JSON.parse(localStorage.getItem('kk_user')) : null);
        if (!loggedInUser) {
          notify('Vui lòng đăng nhập để bình luận', 'warning');
          setTimeout(() => {
            window.location.href = `/auth?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
          }, 800);
          return;
        }
        commentSend.disabled = true;
        try {
          const result = await API.postComment(movieSlug, { content, episode_slug: currentEpisodes[currentEpIndex]?.slug || null, is_spoil: Boolean(spoilerCheck?.checked) });
          if (!result.status) throw new Error(result.message);
          comments.unshift(result.data);
          commentInput.value = '';
          if (spoilerCheck) spoilerCheck.checked = false;
          renderComments();
          notify('Đã gửi bình luận');
        } catch (error) { notify(error.message || 'Không thể gửi bình luận', 'error'); }
        finally { commentSend.disabled = false; }
      });
      commentInput.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) { event.preventDefault(); commentSend.click(); } });
    }
  }

});

