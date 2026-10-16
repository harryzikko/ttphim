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
  const speeds = [1.0, 1.25, 1.5, 2.0];
  let currentSpeedIdx = 0;
  let playerSession = null, progressStore = null, user = null;
  let nextTimer = null, historyTimer = null, embedTimer = null;
  const notify = (message, type = 'info') => MobileApp.toast(message, type);
  const updateStatus = PlayerUX.createStatus(playerWrapper, {
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
    clearTimeout(nextTimer);
    nextTimer = null;
    clearTimeout(embedTimer);
    playerSession?.destroy();
    playerSession = null;
    hlsInstance = null;
    iframeEl.onload = null;
    iframeEl.src = 'about:blank';
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
    [movieData, user] = await Promise.all([API.getMovieDetail(slug), API.getMe().catch(() => null)]);
    if (!movieData || !movieData.movie) {
      notify('Không tìm thấy dữ liệu phim', 'error');
      setTimeout(() => window.location.href = '/mobile', 1500);
      return;
    }

    const movie = movieData.movie;
    allServers = movieData.episodes || [];

    document.title = `${movie.name} - Đang xem - CineViet Mobile`;
    if (movieNameEl) movieNameEl.textContent = movie.name;
    if (infoTitle) infoTitle.textContent = movie.name;

    // Render Cast & Crew Rail
    const castRail = document.getElementById('m-watch-cast-rail');
    const castSection = document.getElementById('m-watch-cast-section');
    if (castRail && (movie.director?.length || movie.actor?.length || movie.credits || movie.tmdb_cast)) {
      function toSlug(str) {
        if (!str) return '';
        return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      }

      const tmdbCast = movie.tmdb_cast || movie.credits?.cast || [];
      const tmdbDirs = movie.tmdb_directors || movie.credits?.directors || [];

      let directors = [];
      let actors = [];

      if (tmdbDirs.length || tmdbCast.length) {
        directors = tmdbDirs;
        actors = tmdbCast;
      } else {
        directors = (movie.director || []).filter(Boolean).map(d => ({
          name: d,
          character: 'Đạo diễn',
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(d)}&background=1d1f29&color=fff&size=128&bold=true`
        }));
        actors = (movie.actor || []).filter(Boolean).map(a => ({
          name: a,
          character: 'Diễn viên',
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(a)}&background=e50914&color=fff&size=128&bold=true`
        }));
      }

      castRail.innerHTML = `
        ${directors.map(d => {
          const imgUrl = d.avatar || (d.profile_path ? `https://image.tmdb.org/t/p/w276_and_h350_face${d.profile_path}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(d.name)}&background=1d1f29&color=fff&size=128&bold=true`);
          return `
          <a href="/dien-vien/${toSlug(d.name)}?type=director&id=${d.id || ''}&name=${encodeURIComponent(d.name)}" class="flex flex-col items-center justify-start shrink-0 text-center w-20 h-[108px] cursor-pointer">
            <div class="w-12 h-12 rounded-full overflow-hidden border-2 border-primary-container p-0.5 bg-surface-container shadow-md shrink-0">
              <img src="${imgUrl}" alt="${d.name}" class="w-full h-full object-cover rounded-full" loading="lazy" onerror="this.onerror=null;this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(d.name)}&background=1d1f29&color=fff&size=128&bold=true';" />
            </div>
            <span class="text-[11px] font-bold text-white line-clamp-1 block w-full mt-1 h-3.5 leading-3.5">${d.name}</span>
            <span class="text-[9px] text-primary font-semibold block uppercase truncate w-full h-3 leading-3">Đạo Diễn</span>
          </a>
        `;}).join('')}

        ${actors.map(a => {
          const imgUrl = a.avatar || (a.profile_path ? `https://image.tmdb.org/t/p/w276_and_h350_face${a.profile_path}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(a.name)}&background=e50914&color=fff&size=128&bold=true`);
          return `
          <a href="/dien-vien/${toSlug(a.name)}?id=${a.id || ''}&name=${encodeURIComponent(a.name)}" class="flex flex-col items-center justify-start shrink-0 text-center w-20 h-[108px] cursor-pointer">
            <div class="w-12 h-12 rounded-full overflow-hidden border-2 border-white/20 p-0.5 bg-surface-container shadow-md shrink-0">
              <img src="${imgUrl}" alt="${a.name}" class="w-full h-full object-cover rounded-full" loading="lazy" onerror="this.onerror=null;this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(a.name)}&background=e50914&color=fff&size=128&bold=true';" />
            </div>
            <span class="text-[11px] font-bold text-white line-clamp-1 block w-full mt-1 h-3.5 leading-3.5">${a.name}</span>
            <span class="text-[9px] text-on-surface-variant font-semibold block uppercase truncate w-full h-3 leading-3">${a.character || 'Diễn Viên'}</span>
          </a>
        `;}).join('')}
      `;
    } else if (castSection) {
      castSection.classList.add('hidden');
    }

    // Check watchlist state
    updateFavButtonState(Boolean(movieData.inWatchlist));
    progressStore = PlayerUX.createProgress({ movie, user, api: API });

    if (favBtn) {
      favBtn.addEventListener('click', async () => {
        try {
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

  } catch (err) {
    console.error('Player error:', err);
    loaderEl.classList.add('hidden');
    updateStatus('error', 'Không thể tải phim. Kiểm tra kết nối và tải lại trang.');
    notify('Lỗi tải phim: ' + err.message, 'error');
  }

  function updateFavButtonState(isSaved) {
    if (!favIcon) return;
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
  function loadEpisode(epIdx, initialTime = 0) {
    saveProgress(true);
    cleanupPlayer();
    if (!currentEpisodes[epIdx]) {
      loaderEl.classList.add('hidden');
      updateStatus('error', 'Server này chưa có tập phát. Hãy chọn server khác.');
      return;
    }
    currentEpIndex = epIdx;
    const ep = currentEpisodes[epIdx];
    epSlug = ep.slug;
    window.history.replaceState(null, '', `/mobile/xem-phim/${slug}/${ep.slug}?server=${currentServerIndex}`);
    if (epTotalEl) epTotalEl.textContent = `${currentEpisodes.length} tập`;

    if (epNameEl) epNameEl.textContent = ep.name || `Tập ${epIdx + 1}`;
    if (infoSub) infoSub.textContent = `Server: ${allServers[currentServerIndex]?.server_name || 'VIP'} • ${ep.name || 'Tập ' + (epIdx + 1)}`;

    renderEpisodesHorizontal();
    renderEpisodesDrawer();

    const streamUrl = ep.link_m3u8 || '';
    const embedUrl = ep.link_embed || '';

    playStream(streamUrl, embedUrl, ep, initialTime);
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
      chip.addEventListener('click', () => {
        loadEpisode(idx);
      });
      epListContainer.appendChild(chip);

      if (isCur) {
        setTimeout(() => chip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }), 100);
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
      onHls: hls => { hlsInstance = hls; },
      onState: updateStatus,
      onBeforeStop: () => saveProgress(true),
      onFallback: () => fallbackToEmbed(embedUrl)
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
    updateStatus('embed', 'Đang mở server nhúng. Nếu không phát được, hãy đổi server.');
    notify('Đang dùng server nhúng; tua tiếp đúng thời điểm có thể không được hỗ trợ.');
    iframeEl.onload = () => { clearTimeout(embedTimer); updateStatus('ready'); };
    iframeEl.src = embedUrl;
    embedTimer = setTimeout(() => updateStatus('error', 'Server nhúng phản hồi chậm. Hãy đổi server.'), 20000);
  }

  // Video Native Event Listeners
  videoEl.addEventListener('play', () => {
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
    if (localStorage.getItem('TTPhim_auto_next') === 'false') return;
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
    if (videoEl.paused) return;
    overlayEl.style.opacity = '0';
    overlayEl.style.pointerEvents = 'none';
  }

  function scheduleHideOverlay() {
    clearTimeout(hideOverlayTimer);
    hideOverlayTimer = setTimeout(() => {
      hideOverlay();
    }, 3500);
  }

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
    speedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentSpeedIdx = (currentSpeedIdx + 1) % speeds.length;
      const rate = speeds[currentSpeedIdx];
      videoEl.playbackRate = rate;
      speedBtn.textContent = `${rate}x`;
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

  function openEpisodeDrawer() {
    if (!epDrawerBackdrop) return;
    epDrawerBackdrop.classList.add('active');
  }

  function closeEpisodeDrawer() {
    if (!epDrawerBackdrop) return;
    epDrawerBackdrop.classList.remove('active');
  }


  // Real comments shared with the desktop player.
  async function setupComments(movieSlug) {
    let comments = [];
    function renderComments() {
      if (!commentList) return;
      commentList.replaceChildren();
      comments.forEach(comment => {
        const item = document.createElement('div');
        item.className = 'p-2.5 rounded-xl bg-surface-container flex flex-col gap-1 border border-white/5';
        const name = document.createElement('strong');
        name.textContent = comment.user_name || 'Khán giả';
        const content = document.createElement('p');
        content.textContent = comment.content || '';
        item.append(name, content);
        commentList.appendChild(item);
      });
      if (!comments.length) commentList.textContent = 'Chưa có bình luận. Hãy chia sẻ cảm nhận của bạn.';
    }
    try { comments = await API.getComments(movieSlug); renderComments(); }
    catch (_) { if (commentList) commentList.textContent = 'Không thể tải bình luận.'; }
    if (commentSend && commentInput) {
      commentSend.addEventListener('click', async () => {
        const content = commentInput.value.trim();
        if (!content || commentSend.disabled) return;
        commentSend.disabled = true;
        try {
          const result = await API.postComment(movieSlug, { content, user_name: user?.name || 'Khán giả' });
          if (!result.status) throw new Error(result.message);
          comments.unshift(result.data);
          commentInput.value = '';
          renderComments();
          notify('Đã gửi bình luận');
        } catch (error) { notify(error.message || 'Không thể gửi bình luận', 'error'); }
        finally { commentSend.disabled = false; }
      });
      commentInput.addEventListener('keydown', event => { if (event.key === 'Enter') commentSend.click(); });
    }
  }

});

