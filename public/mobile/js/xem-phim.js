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
    movieData = await API.getMovieDetail(slug);
    if (!movieData || !movieData.movie) {
      if (window.MobileApp) MobileApp.showToast('Không tìm thấy dữ liệu phim', 'error');
      setTimeout(() => window.location.href = '/mobile', 1500);
      return;
    }

    const movie = movieData.movie;
    allServers = movieData.episodes || [];

    document.title = `${movie.name} - Đang xem - TTPhim Mobile`;
    if (movieNameEl) movieNameEl.textContent = movie.name;
    if (infoTitle) infoTitle.textContent = movie.name;

    // Check watchlist state
    updateFavButtonState(movie.slug);

    if (favBtn) {
      favBtn.addEventListener('click', () => {
        if (window.MobileApp) {
          const isAdded = MobileApp.toggleWatchlist({
            slug: movie.slug,
            name: movie.name,
            origin_name: movie.origin_name,
            thumb_url: movie.thumb_url || movie.poster_url,
            quality: movie.quality || 'HD',
            year: movie.year || ''
          });
          updateFavButtonState(movie.slug);
          MobileApp.showToast(isAdded ? 'Đã thêm vào Danh sách' : 'Đã xóa khỏi Danh sách');
        }
      });
    }

    if (allServers.length === 0) {
      loaderEl.innerHTML = `<div class="text-white text-xs text-center p-4">Phim đang được cập nhật tập mới</div>`;
      return;
    }

    renderServerPills();
    selectServer(0);

    // Setup Comments
    setupComments(movie.slug);

  } catch (err) {
    console.error('Player error:', err);
    if (window.MobileApp) MobileApp.showToast('Lỗi tải phim: ' + err.message, 'error');
  }

  function updateFavButtonState(slug) {
    if (!favIcon) return;
    const isSaved = window.MobileApp && window.MobileApp.isWatchlisted(slug);
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
    currentServerIndex = serverIdx;
    renderServerPills();

    currentEpisodes = allServers[currentServerIndex]?.server_data || [];
    if (epTotalEl) epTotalEl.textContent = `${currentEpisodes.length} tập`;

    // Find requested epSlug or default to first
    let targetIdx = 0;
    if (epSlug) {
      const foundIdx = currentEpisodes.findIndex(e => e.slug === epSlug || e.name === epSlug);
      if (foundIdx !== -1) targetIdx = foundIdx;
    }
    loadEpisode(targetIdx);
  }

  // Load specific Episode
  function loadEpisode(epIdx) {
    if (!currentEpisodes[epIdx]) return;
    currentEpIndex = epIdx;
    const ep = currentEpisodes[epIdx];

    if (epNameEl) epNameEl.textContent = ep.name || `Tập ${epIdx + 1}`;
    if (infoSub) infoSub.textContent = `Server: ${allServers[currentServerIndex]?.server_name || 'VIP'} • ${ep.name || 'Tập ' + (epIdx + 1)}`;

    renderEpisodesHorizontal();
    renderEpisodesDrawer();

    const streamUrl = ep.link_m3u8 || '';
    const embedUrl = ep.link_embed || '';

    playStream(streamUrl, embedUrl, ep);

    // Save to Continue Watching
    if (movieData?.movie) {
      saveContinueWatching(movieData.movie, ep);
    }
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
  function playStream(m3u8Url, embedUrl, ep) {
    loaderEl.classList.remove('hidden');

    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }

    if (m3u8Url && (m3u8Url.includes('.m3u8') || m3u8Url.startsWith('http'))) {
      iframeEl.classList.add('hidden');
      iframeEl.src = '';
      videoEl.classList.remove('hidden');

      if (Hls.isSupported()) {
        hlsInstance = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90
        });
        hlsInstance.loadSource(m3u8Url);
        hlsInstance.attachMedia(videoEl);
        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
          loaderEl.classList.add('hidden');
          videoEl.play().catch(() => {});
        });
        hlsInstance.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            console.warn('HLS Fatal Error, trying embed fallback:', data);
            fallbackToEmbed(embedUrl);
          }
        });
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        // Native Safari iOS HLS support
        videoEl.src = m3u8Url;
        videoEl.addEventListener('loadedmetadata', () => {
          loaderEl.classList.add('hidden');
          videoEl.play().catch(() => {});
        }, { once: true });
        videoEl.addEventListener('error', () => {
          fallbackToEmbed(embedUrl);
        }, { once: true });
      } else {
        fallbackToEmbed(embedUrl);
      }
    } else {
      fallbackToEmbed(embedUrl);
    }
  }

  function fallbackToEmbed(embedUrl) {
    if (!embedUrl) {
      loaderEl.innerHTML = `<div class="text-white text-xs p-4 text-center">Không tìm thấy luồng phát khả dụng</div>`;
      return;
    }
    videoEl.classList.add('hidden');
    videoEl.pause();
    iframeEl.classList.remove('hidden');
    iframeEl.src = embedUrl;
    loaderEl.classList.add('hidden');
  }

  // Video Native Event Listeners
  videoEl.addEventListener('play', () => {
    if (playIcon) playIcon.textContent = 'pause';
    scheduleHideOverlay();
  });

  videoEl.addEventListener('pause', () => {
    if (playIcon) playIcon.textContent = 'play_arrow';
    showOverlay();
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
    loaderEl.classList.remove('hidden');
  });

  videoEl.addEventListener('playing', () => {
    loaderEl.classList.add('hidden');
  });

  videoEl.addEventListener('ended', () => {
    // Auto play next episode if available
    if (currentEpIndex + 1 < currentEpisodes.length) {
      if (window.MobileApp) MobileApp.showToast('Tập tiếp theo sau 3 giây...', 'info');
      setTimeout(() => {
        loadEpisode(currentEpIndex + 1);
      }, 3000);
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
        videoEl.play();
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
      if (videoEl.requestFullscreen) {
        videoEl.requestFullscreen();
      } else if (videoEl.webkitEnterFullscreen) {
        videoEl.webkitEnterFullscreen(); // iOS Safari
      } else if (playerWrapper.requestFullscreen) {
        playerWrapper.requestFullscreen();
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

  // Continue Watching Persistence
  function saveContinueWatching(movie, ep) {
    try {
      const STORAGE_KEY = 'TTPhim_continue_watching';
      let list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      list = list.filter(item => item.slug !== movie.slug);
      list.unshift({
        slug: movie.slug,
        name: movie.name,
        thumb_url: movie.thumb_url || movie.poster_url,
        episode: ep.name || 'Tập 1',
        episode_slug: ep.slug,
        server_name: allServers[currentServerIndex]?.server_name || 'VIP',
        updated_at: Date.now()
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 15)));
    } catch(e) {}
  }

  // Comments System (Local demo storage)
  function setupComments(movieSlug) {
    const STORAGE_KEY = `TTPhim_comments_${movieSlug}`;
    
    function getStoredComments() {
      const defaultComments = [
        { name: 'Hoàng Long', time: '10 phút trước', text: 'Chất lượng 4K nét căng mượt mà, âm thanh vòm sống động ghê!' },
        { name: 'Thanh Thảo', time: '30 phút trước', text: 'Tập này gay cấn quá mọi người ơi, hóng tập sau xỉu!' },
        { name: 'Tuấn Anh', time: '2 giờ trước', text: 'Server tốc độ cao tải nhanh không hề giật lag, 10/10.' }
      ];
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : defaultComments;
      } catch(e) {
        return defaultComments;
      }
    }

    function renderComments() {
      if (!commentList) return;
      const list = getStoredComments();
      commentList.innerHTML = '';
      list.forEach(c => {
        const item = document.createElement('div');
        item.className = 'p-2.5 rounded-xl bg-surface-container flex flex-col gap-1 border border-white/5';
        item.innerHTML = `
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-white">${c.name}</span>
            <span class="text-[10px] text-on-surface-variant">${c.time}</span>
          </div>
          <p class="text-xs text-on-surface leading-relaxed">${c.text}</p>
        `;
        commentList.appendChild(item);
      });
    }

    renderComments();

    if (commentSend && commentInput) {
      commentSend.addEventListener('click', () => {
        const txt = commentInput.value.trim();
        if (!txt) return;
        const list = getStoredComments();
        list.unshift({
          name: 'Bạn',
          time: 'Vừa xong',
          text: txt
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        commentInput.value = '';
        renderComments();
        if (window.MobileApp) MobileApp.showToast('Đã gửi bình luận');
      });

      commentInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commentSend.click();
      });
    }
  }

});

