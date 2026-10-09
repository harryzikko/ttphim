// TTPhim - Watch Movie Player & Interactive Room Controller (Real Data Binding)
document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  let slug = pathParts[1];
  let epSlug = pathParts[2];

  if (!slug || slug === 'xem-phim') {
    slug = urlParams.get('slug');
    epSlug = urlParams.get('ep');
  }

  // Fallback to latest movie if no slug provided
  if (!slug) {
    try {
      const home = await API.getHome();
      slug = home.latest?.[0]?.slug;
    } catch(e) {}
  }
  if (!slug) {
    window.location.href = '/';
    return;
  }

  let movieData = null;
  let activeServerIndex = 0;
  let currentEpisode = null;
  let hlsInstance = null;
  let useEmbed = false;
  let drawerEpisodesList = [];
  let watchPartyController = null;

  // DOM Elements
  const viewport = document.getElementById('player-viewport');
  const lightScrim = document.getElementById('cinema-backdrop-scrim');
  const lightBtn = document.getElementById('btn-cinema-mode');
  const lightIcon = document.getElementById('light-icon');
  const lightLabel = document.getElementById('light-label');
  const theaterBtn = document.getElementById('btn-theater-toggle');
  const primaryPlayerCol = document.getElementById('primary-player-column');

  // Helper: Extract m3u8 from embed URL
  function extractM3u8FromEmbed(embedUrl) {
    if (!embedUrl) return null;
    const match = embedUrl.match(/[?&](?:url|file)=([^&]+)/i);
    if (match && match[1]) {
      try {
        const decoded = decodeURIComponent(match[1]);
        if (decoded.includes('.m3u8')) return decoded;
      } catch(e) {
        if (match[1].includes('.m3u8')) return match[1];
      }
    }
    const directMatch = embedUrl.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i);
    if (directMatch && directMatch[1]) return directMatch[1];
    return null;
  }

  // Setup Watch Party Interactive Room (Bind Immediately on DOMContentLoaded - 0ms delay)
  initWatchParty();

  // Load Movie Details
  try {
    console.log('[TTPhim] Fetching movie for watch player, slug:', slug);
    movieData = await API.getMovieDetail(slug);
    if (!movieData || !movieData.movie) {
      if (window.showToast) window.showToast('Không tìm thấy tập phim', 'error');
      return;
    }

    initPage(movieData);
  } catch (err) {
    console.error('[TTPhim] Failed to load movie for player:', err);
    if (window.showToast) window.showToast('Lỗi kết nối máy chủ phát phim', 'error');
  }

  function initPage({ movie, episodes, watchedHistory }) {
    document.title = `Đang xem: ${movie.name} - TTPhim Cinema 4K`;

    // Setup Header Strip Info
    const backBtn = document.querySelector('a[data-path="chi-tiet-phim"], a:has(.arrow_back)');
    if (backBtn) backBtn.href = `/phim/${movie.slug}`;

    const movieTitleEl = document.querySelector('h1.font-headline-sm, h1');
    if (movieTitleEl) movieTitleEl.innerText = movie.name;

    // Pick active server & episode
    const allServers = episodes || [];
    if (allServers.length === 0) {
      if (viewport) viewport.innerHTML = `<div class="w-full h-full flex items-center justify-center text-on-surface-variant font-headline-sm">Phim đang chờ cập nhật tập mới</div>`;
      return;
    }

    const getEpNum = (val) => {
      if (!val) return '';
      const m = String(val).match(/\d+/);
      return m ? String(parseInt(m[0], 10)) : String(val).trim().toLowerCase();
    };

    // Check if user specifically requested a server via query param (?server=0, 1, 2...)
    const serverParam = urlParams.get('server');
    if (serverParam !== null && !isNaN(parseInt(serverParam, 10))) {
      const parsedS = parseInt(serverParam, 10);
      if (parsedS >= 0 && parsedS < allServers.length) {
        activeServerIndex = parsedS;
      }
    }

    // Determine target episode
    let matchedEp = null;
    if (epSlug) {
      // First check within activeServerIndex if specified
      matchedEp = allServers[activeServerIndex]?.server_data?.find(e => 
        e.slug === epSlug || getEpNum(e.slug) === getEpNum(epSlug) || getEpNum(e.name) === getEpNum(epSlug)
      );

      // If not in activeServer, search all servers
      if (!matchedEp) {
        for (let s = 0; s < allServers.length; s++) {
          const found = allServers[s].server_data?.find(e => 
            e.slug === epSlug || getEpNum(e.slug) === getEpNum(epSlug) || getEpNum(e.name) === getEpNum(epSlug)
          );
          if (found) {
            activeServerIndex = s;
            matchedEp = found;
            break;
          }
        }
      }
    }

    if (!matchedEp) {
      matchedEp = allServers[activeServerIndex]?.server_data?.[0];
    }
    currentEpisode = matchedEp;

    // Render Server Switches
    renderServerPills(allServers);

    // Render Video Player
    loadEpisode(currentEpisode, watchedHistory?.current_time || 0);

    // Render Episode Drawer Sidebar
    renderEpisodeDrawer(allServers[activeServerIndex]?.server_data || []);

    // Render Movie Info below player
    renderInfoBelowPlayer(movie);

    // Setup Comments section
    initComments(movie.slug);

    // Setup Cinema & Theater Mode Toggles
    setupCinemaAndTheaterModes();

    // Setup Utility Buttons (Download, Report, Like, Share)
    setupUtilityButtons(movie.slug);

    // Update Watch Party with loaded movie details
    if (watchPartyController && watchPartyController.updateMovie) {
      watchPartyController.updateMovie(movie, currentEpisode);
    }
  }

  function formatEpDisplay(name) {
    if (!name) return 'Tập 01';
    const str = String(name).trim();
    if (/^full$/i.test(str) || /^bản full$/i.test(str)) return 'Full';
    if (/^trọn bộ$/i.test(str)) return 'Trọn Bộ';
    const match = str.match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (!isNaN(num)) {
        return `Tập ${String(num).padStart(2, '0')}`;
      }
    }
    return str.startsWith('Tập') ? str : `Tập ${str}`;
  }

  function cleanEpName(name) {
    if (!name) return '01';
    const str = String(name).trim();
    const match = str.match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (!isNaN(num)) {
        return num < 10 ? `0${num}` : `${num}`;
      }
    }
    const cleaned = str.replace(/^tập\s*/i, '').trim();
    return cleaned || str;
  }

  // --- Video Player Engine (HLS.js + Iframe Fallback) ---
  function loadEpisode(ep, initialTime = 0) {
    if (!ep) return;
    currentEpisode = ep;

    // Update ep label in top bar
    const epLabelEl = document.querySelector('span.font-body-md.text-body-md.text-on-surface-variant') ||
                      document.querySelector('div.flex.items-center.gap-space-xs span.font-body-md');
    if (epLabelEl) epLabelEl.innerText = formatEpDisplay(ep.name);

    // Update URL history (preserve ?party= and ?server= if present)
    const partyParam = (watchPartyController && watchPartyController.isInRoom())
      ? `&party=${watchPartyController.getRoomCode()}`
      : (urlParams.get('party') ? `&party=${urlParams.get('party')}` : '');
    window.history.replaceState(null, '', `/xem-phim/${movieData.movie.slug}/${ep.slug}?server=${activeServerIndex}${partyParam}`);

    if (watchPartyController && watchPartyController.isInRoom() && watchPartyController.isHost()) {
      watchPartyController.onEpisodeChanged(ep);
    }

    // Update active highlight in episode drawer
    highlightActiveEpisodeInDrawer(ep.slug);

    // Save watch history immediately on episode start (ensures both HLS and Iframe save to Continue Watching)
    try {
      API.saveHistory({
        movie_slug: movieData.movie.slug,
        movie_name: movieData.movie.name,
        origin_name: movieData.movie.origin_name,
        poster_url: movieData.movie.poster_url,
        thumb_url: movieData.movie.thumb_url,
        episode_slug: ep.slug,
        episode_name: formatEpDisplay(ep.name),
        current_time: initialTime || 10,
        duration: 3600
      });
    } catch (err) {
      console.warn('Failed to save watch history on load:', err);
    }

    // Clean up previous HLS
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }

    if (!viewport) return;
    viewport.innerHTML = ''; // CRITICAL: Clear viewport so elements never stack or duplicate!

    // Auto-extract link_m3u8 from link_embed if missing
    if (!ep.link_m3u8 && ep.link_embed) {
      const extracted = extractM3u8FromEmbed(ep.link_embed);
      if (extracted) {
        ep.link_m3u8 = extracted;
      }
    }

    // Prioritize link_m3u8 first! Only fallback to link_embed if no m3u8 or if user explicitly requested iframe engine
    if (!useEmbed && ep.link_m3u8) {
      renderM3u8Player(ep, initialTime);
    } else if (ep.link_embed) {
      renderEmbedPlayer(ep);
    } else if (ep.link_m3u8) {
      renderM3u8Player(ep, initialTime);
    } else {
      viewport.innerHTML = `<div class="w-full h-full flex items-center justify-center text-on-surface-variant font-headline-sm">Tập phim đang được đồng bộ...</div>`;
    }
  }

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const remSec = s % 60;
    const mStr = String(m).padStart(2, '0');
    const sStr = String(remSec).padStart(2, '0');
    if (h > 0) {
      return `${h}:${mStr}:${sStr}`;
    }
    return `${mStr}:${sStr}`;
  }

  function renderM3u8Player(ep, initialTime = 0) {
    viewport.innerHTML = '';

    const container = document.createElement('div');
    container.id = 'TTPhim-player-wrapper';
    container.className = 'relative w-full h-full bg-black rounded-xl overflow-hidden flex items-center justify-center select-none group focus:outline-none';
    container.tabIndex = 0;

    // Video Element
    const video = document.createElement('video');
    video.id = 'TTPhim-player';
    video.className = 'w-full h-full object-contain bg-black';
    video.controls = false;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = 'auto';
    if (movieData.movie.thumb_url || movieData.movie.poster_url) {
      video.poster = movieData.movie.thumb_url || movieData.movie.poster_url;
    }

    // Restore saved settings
    const savedVol = localStorage.getItem('TTPhim_player_volume');
    const savedMuted = localStorage.getItem('TTPhim_player_muted');
    const savedSpeed = localStorage.getItem('TTPhim_player_speed');
    if (savedVol !== null) video.volume = Math.max(0, Math.min(1, parseFloat(savedVol)));
    if (savedMuted === 'true') video.muted = true;
    if (savedSpeed !== null) video.playbackRate = parseFloat(savedSpeed);

    container.appendChild(video);

    // Click & Gesture Zones Overlay (behind controls, above video)
    const gestureOverlay = document.createElement('div');
    gestureOverlay.className = 'absolute inset-0 z-10 flex';
    gestureOverlay.innerHTML = `
      <div id="gesture-zone-left" class="w-[35%] h-full cursor-pointer" title="Nhấp đúp: Lùi 10 giây"></div>
      <div id="gesture-zone-center" class="w-[30%] h-full cursor-pointer" title="Nhấp: Phát/Dừng · Nhấp đúp: Toàn màn hình"></div>
      <div id="gesture-zone-right" class="w-[35%] h-full cursor-pointer" title="Nhấp đúp: Tiến 10 giây"></div>
    `;
    container.appendChild(gestureOverlay);

    // Buffering Spinner
    const bufferingEl = document.createElement('div');
    bufferingEl.id = 'player-buffering';
    bufferingEl.className = 'absolute inset-0 z-20 flex items-center justify-center pointer-events-none transition-opacity duration-200 opacity-0';
    bufferingEl.innerHTML = `
      <div class="relative w-16 h-16 flex items-center justify-center">
        <div class="w-14 h-14 border-4 border-primary-container/20 border-t-primary-container rounded-full animate-spin"></div>
      </div>
    `;
    container.appendChild(bufferingEl);

    // Center Play/Pause Ripple Indicator
    const rippleEl = document.createElement('div');
    rippleEl.id = 'player-center-ripple';
    rippleEl.className = 'absolute inset-0 z-20 flex items-center justify-center pointer-events-none';
    rippleEl.innerHTML = `
      <div class="w-20 h-20 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-white flex items-center justify-center shadow-2xl opacity-0 scale-75">
        <span class="material-symbols-outlined text-[44px]">play_arrow</span>
      </div>
    `;
    container.appendChild(rippleEl);

    // Skip 10s Badges (Left & Right)
    const skipLeftBadge = document.createElement('div');
    skipLeftBadge.id = 'player-skip-left';
    skipLeftBadge.className = 'absolute left-8 sm:left-14 top-1/2 -translate-y-1/2 z-20 pointer-events-none opacity-0';
    skipLeftBadge.innerHTML = `
      <div class="flex flex-col items-center justify-center w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-black/75 backdrop-blur-md border border-white/15 text-white shadow-2xl">
        <span class="material-symbols-outlined text-[32px] sm:text-[38px]">replay_10</span>
        <span class="text-[11px] font-bold mt-0.5 text-white/90">-10s</span>
      </div>
    `;
    container.appendChild(skipLeftBadge);

    const skipRightBadge = document.createElement('div');
    skipRightBadge.id = 'player-skip-right';
    skipRightBadge.className = 'absolute right-8 sm:right-14 top-1/2 -translate-y-1/2 z-20 pointer-events-none opacity-0';
    skipRightBadge.innerHTML = `
      <div class="flex flex-col items-center justify-center w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-black/75 backdrop-blur-md border border-white/15 text-white shadow-2xl">
        <span class="material-symbols-outlined text-[32px] sm:text-[38px]">forward_10</span>
        <span class="text-[11px] font-bold mt-0.5 text-white/90">+10s</span>
      </div>
    `;
    container.appendChild(skipRightBadge);

    // Party Reactions Layer & Sync Toast
    const partyLayer = document.createElement('div');
    partyLayer.id = 'party-reactions-layer';
    partyLayer.className = 'absolute inset-0 pointer-events-none z-30 overflow-hidden';
    container.appendChild(partyLayer);

    const syncToast = document.createElement('div');
    syncToast.id = 'party-sync-toast';
    syncToast.className = 'absolute top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none bg-black/85 backdrop-blur-md px-4 py-2 rounded-full border border-white/15 text-white text-xs font-semibold flex items-center gap-2 shadow-2xl transition-all duration-300 opacity-0 -translate-y-2';
    syncToast.innerHTML = `
      <span class="material-symbols-outlined text-secondary-fixed text-[16px]">sync</span>
      <span id="party-sync-toast-text">Đồng bộ phát video</span>
    `;
    container.appendChild(syncToast);

    // Top Controls Bar (Title + Engine switcher + Skip intro)
    const topBar = document.createElement('div');
    topBar.id = 'player-controls-top';
    topBar.className = 'absolute top-0 inset-x-0 z-30 px-4 py-3 bg-gradient-to-b from-black/90 via-black/40 to-transparent flex items-center justify-between transition-opacity duration-300 pointer-events-auto';
    topBar.innerHTML = `
      <div class="flex items-center gap-2 min-w-0 pr-4">
        <span class="font-bold text-white text-sm lg:text-base truncate drop-shadow">${movieData.movie.name}</span>
        <span class="text-white/70 text-xs lg:text-sm drop-shadow whitespace-nowrap">· Tập ${cleanEpName(ep.name)}</span>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button id="btn-toggle-engine" class="px-3 py-1.5 rounded-full bg-black/75 hover:bg-primary-container text-white hover:text-on-primary-container font-label-md text-xs backdrop-blur-md shadow-lg transition-all flex items-center gap-1 cursor-pointer border border-white/10" type="button" title="Đổi sang server nhúng Iframe">
          <span class="material-symbols-outlined text-[15px]">swap_horiz</span>
          <span class="hidden sm:inline">Đổi Server Iframe</span>
        </button>
        <button id="btn-skip-intro-custom" class="flex items-center gap-1 px-3 py-1.5 rounded-full bg-black/75 hover:bg-primary-container text-white hover:text-on-primary-container font-label-md text-xs backdrop-blur-md shadow-lg transition-all cursor-pointer border border-white/10" type="button" title="Bỏ qua 90s intro">
          <span>Bỏ 90s intro</span>
          <span class="material-symbols-outlined text-[15px]">fast_forward</span>
        </button>
      </div>
    `;
    container.appendChild(topBar);

    // Quality and Speed Popover Menus
    const qualityMenu = document.createElement('div');
    qualityMenu.id = 'player-quality-menu';
    qualityMenu.className = 'absolute bottom-16 right-20 sm:right-28 z-40 bg-surface-container-high/95 backdrop-blur-xl border border-white/15 rounded-xl p-1.5 shadow-2xl flex flex-col gap-0.5 min-w-[130px] hidden text-on-surface';
    qualityMenu.innerHTML = `<div class="px-2 py-1 text-[11px] text-on-surface-variant font-bold uppercase tracking-wider border-b border-white/10 mb-1">Chất lượng</div>`;
    container.appendChild(qualityMenu);

    const speedMenu = document.createElement('div');
    speedMenu.id = 'player-speed-menu';
    speedMenu.className = 'absolute bottom-16 right-12 sm:right-16 z-40 bg-surface-container-high/95 backdrop-blur-xl border border-white/15 rounded-xl p-1.5 shadow-2xl flex flex-col gap-0.5 min-w-[110px] hidden text-on-surface';
    const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];
    speedMenu.innerHTML = `
      <div class="px-2 py-1 text-[11px] text-on-surface-variant font-bold uppercase tracking-wider border-b border-white/10 mb-1">Tốc độ phát</div>
      ${speedOptions.map(spd => `
        <button class="player-speed-item px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-white/10 transition-colors flex items-center justify-between cursor-pointer ${video.playbackRate === spd ? 'text-primary font-bold bg-white/5' : 'text-white/80'}" data-speed="${spd}">
          <span>${spd === 1 ? 'Chuẩn (1x)' : `${spd}x`}</span>
          ${video.playbackRate === spd ? '<span class="material-symbols-outlined text-[14px]">check</span>' : ''}
        </button>
      `).join('')}
    `;
    container.appendChild(speedMenu);

    // Bottom Controls Bar
    const bottomBar = document.createElement('div');
    bottomBar.id = 'player-controls-bottom';
    bottomBar.className = 'absolute bottom-0 inset-x-0 z-30 px-3 sm:px-5 pb-3 pt-10 bg-gradient-to-t from-black/95 via-black/70 to-transparent flex flex-col gap-2 transition-opacity duration-300 pointer-events-auto';
    bottomBar.innerHTML = `
      <!-- Interactive Scrubber -->
      <div id="player-scrubber-container" class="relative w-full h-4 flex items-center cursor-pointer group/scrubber select-none">
        <div id="player-scrubber-tooltip" class="absolute bottom-6 -translate-x-1/2 hidden group-hover/scrubber:block bg-surface-container-highest/95 backdrop-blur text-white text-[11px] font-mono px-2 py-0.5 rounded shadow-lg border border-white/15 pointer-events-none whitespace-nowrap z-20">00:00</div>
        <div class="relative w-full h-1 group-hover/scrubber:h-2 bg-white/20 rounded-full transition-all overflow-hidden pointer-events-none">
          <div id="player-buffer-bar" class="absolute left-0 top-0 bottom-0 bg-white/35 rounded-full transition-all" style="width: 0%;"></div>
          <div id="player-played-bar" class="absolute left-0 top-0 bottom-0 bg-primary-container rounded-full" style="width: 0%;"></div>
        </div>
        <div id="player-scrubber-thumb" class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-primary-container rounded-full shadow-md scale-0 group-hover/scrubber:scale-100 transition-transform pointer-events-none border border-white" style="left: 0%;"></div>
      </div>

      <!-- Controls Buttons Row -->
      <div class="flex items-center justify-between gap-2">
        <!-- Left Cluster -->
        <div class="flex items-center gap-1 sm:gap-2">
          <!-- Play / Pause -->
          <button id="player-btn-play" class="text-white hover:text-primary transition-colors cursor-pointer p-1.5 rounded-lg flex items-center justify-center" title="Phát / Tạm dừng (Space)">
            <span class="material-symbols-outlined text-[26px]">play_arrow</span>
          </button>

          <!-- Replay 10s -->
          <button id="player-btn-back10" class="text-white/90 hover:text-white transition-colors cursor-pointer p-1.5 rounded-lg flex items-center justify-center" title="Lùi 10 giây (J hoặc ←)">
            <span class="material-symbols-outlined text-[22px]">replay_10</span>
          </button>

          <!-- Forward 10s -->
          <button id="player-btn-forward10" class="text-white/90 hover:text-white transition-colors cursor-pointer p-1.5 rounded-lg flex items-center justify-center" title="Tiến 10 giây (L hoặc →)">
            <span class="material-symbols-outlined text-[22px]">forward_10</span>
          </button>

          <!-- Next Episode Button -->
          <button id="player-btn-next" class="text-white/90 hover:text-white transition-colors cursor-pointer p-1.5 rounded-lg flex items-center justify-center" title="Tập tiếp theo">
            <span class="material-symbols-outlined text-[22px]">skip_next</span>
          </button>

          <!-- Volume Controls -->
          <div class="flex items-center gap-1 group/vol ml-0.5 sm:ml-1">
            <button id="player-btn-volume" class="text-white/90 hover:text-white transition-colors cursor-pointer p-1.5 rounded-lg flex items-center justify-center" title="Tắt / Bật tiếng (M)">
              <span class="material-symbols-outlined text-[22px]">volume_up</span>
            </button>
            <input type="range" min="0" max="1" step="0.05" value="${video.volume}" id="player-volume-slider" class="w-14 sm:w-20 h-1 accent-primary-container bg-white/30 rounded-lg cursor-pointer" title="Âm lượng" />
          </div>

          <!-- Time Display -->
          <span id="player-time-display" class="text-xs font-mono text-white/90 cursor-pointer select-none pl-1 sm:pl-2" title="Nhấp để hiển thị thời gian còn lại">00:00 / 00:00</span>
        </div>

        <!-- Right Cluster -->
        <div class="flex items-center gap-1 sm:gap-2">
          <!-- Quality Selector Button -->
          <button id="player-quality-btn" class="relative text-white/90 hover:text-white transition-colors cursor-pointer px-2 py-1 rounded-lg flex items-center gap-1 text-xs font-bold bg-white/10 hover:bg-white/20 border border-white/10" title="Chất lượng hình ảnh">
            <span class="material-symbols-outlined text-[16px]">tune</span>
            <span id="player-quality-label">Auto</span>
          </button>

          <!-- Speed Selector Button -->
          <button id="player-speed-btn" class="relative text-white/90 hover:text-white transition-colors cursor-pointer px-2 py-1 rounded-lg flex items-center gap-1 text-xs font-bold bg-white/10 hover:bg-white/20 border border-white/10" title="Tốc độ phát">
            <span class="material-symbols-outlined text-[16px]">speed</span>
            <span id="player-speed-label">${video.playbackRate === 1 ? '1x' : `${video.playbackRate}x`}</span>
          </button>

          <!-- Picture in Picture -->
          <button id="player-btn-pip" class="text-white/90 hover:text-white transition-colors cursor-pointer p-1.5 rounded-lg flex items-center justify-center" title="Hình trong hình (P)">
            <span class="material-symbols-outlined text-[22px]">picture_in_picture_alt</span>
          </button>

          <!-- Fullscreen Toggle -->
          <button id="player-btn-fullscreen" class="text-white hover:text-primary transition-colors cursor-pointer p-1.5 rounded-lg flex items-center justify-center" title="Toàn màn hình (F)">
            <span class="material-symbols-outlined text-[24px]">fullscreen</span>
          </button>
        </div>
      </div>
    `;
    container.appendChild(bottomBar);

    // Next Episode Netflix-style Countdown Overlay
    const countdownOverlay = document.createElement('div');
    countdownOverlay.id = 'player-next-countdown';
    countdownOverlay.className = 'absolute inset-0 z-40 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 gap-4 text-center hidden';
    countdownOverlay.innerHTML = `
      <div class="relative w-20 h-20 flex items-center justify-center">
        <svg class="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
          <path class="text-white/20" stroke-width="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
          <path id="countdown-progress-circle" class="text-primary-container transition-all duration-1000 ease-linear" stroke-dasharray="100, 100" stroke-width="3" stroke-linecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
        </svg>
        <span id="countdown-seconds-text" class="absolute font-headline-lg font-black text-white text-2xl">5</span>
      </div>
      <div class="space-y-1">
        <span class="text-xs uppercase tracking-wider text-primary font-bold">Tập tiếp theo sẽ phát</span>
        <h4 id="countdown-next-title" class="text-lg font-bold text-white max-w-md truncate">Tập kế tiếp</h4>
      </div>
      <div class="flex items-center gap-3 mt-2">
        <button id="btn-countdown-cancel" class="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-label-md text-sm transition-all cursor-pointer">
          Hủy bỏ
        </button>
        <button id="btn-countdown-now" class="px-5 py-2 rounded-xl bg-primary-container text-on-primary-container hover:brightness-110 font-bold font-label-md text-sm transition-all shadow-lg flex items-center gap-1 cursor-pointer">
          <span class="material-symbols-outlined text-[18px]">play_arrow</span>
          <span>Xem ngay</span>
        </button>
      </div>
    `;
    container.appendChild(countdownOverlay);

    viewport.appendChild(container);

    // ================= CONTROLLER LOGIC =================
    const playBtn = bottomBar.querySelector('#player-btn-play');
    const playIcon = playBtn.querySelector('.material-symbols-outlined');
    const back10Btn = bottomBar.querySelector('#player-btn-back10');
    const forward10Btn = bottomBar.querySelector('#player-btn-forward10');
    const nextBtn = bottomBar.querySelector('#player-btn-next');
    const volumeBtn = bottomBar.querySelector('#player-btn-volume');
    const volumeIcon = volumeBtn.querySelector('.material-symbols-outlined');
    const volumeSlider = bottomBar.querySelector('#player-volume-slider');
    const timeDisplay = bottomBar.querySelector('#player-time-display');
    const qualityBtn = bottomBar.querySelector('#player-quality-btn');
    const qualityLabel = bottomBar.querySelector('#player-quality-label');
    const speedBtn = bottomBar.querySelector('#player-speed-btn');
    const speedLabel = bottomBar.querySelector('#player-speed-label');
    const pipBtn = bottomBar.querySelector('#player-btn-pip');
    const fullscreenBtn = bottomBar.querySelector('#player-btn-fullscreen');
    const fullscreenIcon = fullscreenBtn.querySelector('.material-symbols-outlined');
    const scrubberContainer = bottomBar.querySelector('#player-scrubber-container');
    const scrubberTooltip = bottomBar.querySelector('#player-scrubber-tooltip');
    const playedBar = bottomBar.querySelector('#player-played-bar');
    const bufferBar = bottomBar.querySelector('#player-buffer-bar');
    const scrubberThumb = bottomBar.querySelector('#player-scrubber-thumb');

    let showRemainingTime = false;
    let isDraggingScrubber = false;
    let autoHideTimer = null;
    let countdownTimer = null;
    let lastVolume = video.volume > 0 ? video.volume : 1;

    // Helper: Show ripple in center
    function triggerCenterRipple(iconName) {
      const iconEl = rippleEl.querySelector('.material-symbols-outlined');
      if (iconEl) iconEl.innerText = iconName;
      const rippleBox = rippleEl.querySelector('div');
      rippleBox.classList.remove('player-ripple-active');
      void rippleBox.offsetWidth; // trigger reflow
      rippleBox.classList.add('player-ripple-active');
    }

    // Helper: Show skip badge
    function triggerSkipBadge(isForward) {
      const badge = isForward ? skipRightBadge : skipLeftBadge;
      badge.classList.remove('player-skip-badge-active');
      void badge.offsetWidth;
      badge.classList.add('player-skip-badge-active');
    }

    // Helper: Play / Pause toggle
    function togglePlayPause() {
      if (video.paused || video.ended) {
        video.play().catch(() => {});
        triggerCenterRipple('play_arrow');
      } else {
        video.pause();
        triggerCenterRipple('pause');
      }
    }

    // Helper: Seek relative
    function seekRelative(deltaSeconds) {
      const cur = video.currentTime || 0;
      const dur = video.duration || 99999;
      video.currentTime = Math.max(0, Math.min(dur, cur + deltaSeconds));
      triggerSkipBadge(deltaSeconds > 0);
      resetAutoHideTimer();
    }

    // Helper: Toggle Fullscreen
    function toggleFullscreen() {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (container.requestFullscreen) {
          container.requestFullscreen();
        } else if (container.webkitRequestFullscreen) {
          container.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      }
    }

    // Update Fullscreen Icon on State Change
    function onFullscreenChange() {
      const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (fullscreenIcon) {
        fullscreenIcon.innerText = isFs ? 'fullscreen_exit' : 'fullscreen';
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    // Next Episode Helper
    function getNextEpisode() {
      const allEps = movieData?.episodes?.[activeServerIndex]?.server_data || [];
      const currentIdx = allEps.findIndex(e => e.slug === ep.slug);
      if (currentIdx > -1 && currentIdx < allEps.length - 1) {
        return allEps[currentIdx + 1];
      }
      return null;
    }

    // Update Next Episode Button state
    const nextEp = getNextEpisode();
    if (!nextEp) {
      nextBtn.classList.add('opacity-40', 'cursor-not-allowed');
      nextBtn.disabled = true;
    } else {
      nextBtn.classList.remove('opacity-40', 'cursor-not-allowed');
      nextBtn.disabled = false;
      nextBtn.title = `Tập tiếp theo: Tập ${cleanEpName(nextEp.name)}`;
      nextBtn.onclick = () => {
        loadEpisode(nextEp);
      };
    }

    // Update Volume UI
    function updateVolumeUI() {
      if (video.muted || video.volume === 0) {
        volumeIcon.innerText = 'volume_off';
        volumeSlider.value = 0;
      } else if (video.volume < 0.5) {
        volumeIcon.innerText = 'volume_down';
        volumeSlider.value = video.volume;
      } else {
        volumeIcon.innerText = 'volume_up';
        volumeSlider.value = video.volume;
      }
      localStorage.setItem('TTPhim_player_volume', video.volume);
      localStorage.setItem('TTPhim_player_muted', video.muted);
    }
    updateVolumeUI();

    volumeBtn.onclick = () => {
      if (video.muted || video.volume === 0) {
        video.muted = false;
        video.volume = lastVolume > 0 ? lastVolume : 1;
      } else {
        lastVolume = video.volume;
        video.muted = true;
      }
      updateVolumeUI();
    };

    volumeSlider.oninput = (e) => {
      const val = parseFloat(e.target.value);
      video.volume = val;
      video.muted = val === 0;
      if (val > 0) lastVolume = val;
      updateVolumeUI();
    };

    // Auto Hide Controls Logic
    function resetAutoHideTimer() {
      topBar.classList.remove('player-controls-hidden');
      bottomBar.classList.remove('player-controls-hidden');
      container.classList.remove('player-cursor-hidden');

      if (autoHideTimer) clearTimeout(autoHideTimer);

      const isMenuOpen = !qualityMenu.classList.contains('hidden') || !speedMenu.classList.contains('hidden');
      if (!video.paused && !isMenuOpen) {
        autoHideTimer = setTimeout(() => {
          if (!video.paused && !isDraggingScrubber) {
            topBar.classList.add('player-controls-hidden');
            bottomBar.classList.add('player-controls-hidden');
            container.classList.add('player-cursor-hidden');
          }
        }, 2500);
      }
    }

    container.addEventListener('mousemove', resetAutoHideTimer);
    container.addEventListener('mousedown', resetAutoHideTimer);
    container.addEventListener('touchstart', resetAutoHideTimer);

    // Gesture Zones Handler (Center click vs double-click)
    let centerClickTimer = null;
    const zoneCenter = gestureOverlay.querySelector('#gesture-zone-center');
    const zoneLeft = gestureOverlay.querySelector('#gesture-zone-left');
    const zoneRight = gestureOverlay.querySelector('#gesture-zone-right');

    zoneCenter.addEventListener('click', (e) => {
      e.stopPropagation();
      if (centerClickTimer) {
        clearTimeout(centerClickTimer);
        centerClickTimer = null;
        toggleFullscreen();
      } else {
        centerClickTimer = setTimeout(() => {
          centerClickTimer = null;
          togglePlayPause();
        }, 220);
      }
    });

    zoneLeft.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      seekRelative(-10);
    });

    zoneRight.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      seekRelative(10);
    });

    // Control buttons click events
    playBtn.onclick = togglePlayPause;
    back10Btn.onclick = () => seekRelative(-10);
    forward10Btn.onclick = () => seekRelative(10);
    pipBtn.onclick = () => {
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
      } else if (video.requestPictureInPicture) {
        video.requestPictureInPicture().catch(() => {});
      }
    };
    fullscreenBtn.onclick = toggleFullscreen;

    // Time display toggle
    timeDisplay.onclick = () => {
      showRemainingTime = !showRemainingTime;
      updateTimeDisplay();
    };

    function updateTimeDisplay() {
      const cur = video.currentTime || 0;
      const dur = video.duration || 0;
      if (showRemainingTime && dur > 0) {
        const rem = Math.max(0, dur - cur);
        timeDisplay.innerText = `${formatTime(cur)} / -${formatTime(rem)}`;
      } else {
        timeDisplay.innerText = `${formatTime(cur)} / ${formatTime(dur)}`;
      }
    }

    // Scrubber Calculation & Events
    function getScrubberPercent(e) {
      const rect = scrubberContainer.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      return x / rect.width;
    }

    scrubberContainer.addEventListener('mousemove', (e) => {
      const percent = getScrubberPercent(e);
      const targetTime = percent * (video.duration || 0);
      scrubberTooltip.innerText = formatTime(targetTime);
      scrubberTooltip.style.left = `${percent * 100}%`;
    });

    scrubberContainer.addEventListener('mousedown', (e) => {
      isDraggingScrubber = true;
      const percent = getScrubberPercent(e);
      if (video.duration > 0) {
        video.currentTime = percent * video.duration;
      }
      playedBar.style.width = `${percent * 100}%`;
      scrubberThumb.style.left = `${percent * 100}%`;
      resetAutoHideTimer();
    });

    window.addEventListener('mousemove', (e) => {
      if (isDraggingScrubber) {
        const percent = getScrubberPercent(e);
        if (video.duration > 0) {
          video.currentTime = percent * video.duration;
        }
        playedBar.style.width = `${percent * 100}%`;
        scrubberThumb.style.left = `${percent * 100}%`;
      }
    });

    window.addEventListener('mouseup', () => {
      if (isDraggingScrubber) {
        isDraggingScrubber = false;
        resetAutoHideTimer();
      }
    });

    // Touch support for scrubber
    scrubberContainer.addEventListener('touchstart', (e) => {
      isDraggingScrubber = true;
      const percent = getScrubberPercent(e);
      if (video.duration > 0) {
        video.currentTime = percent * video.duration;
      }
      playedBar.style.width = `${percent * 100}%`;
      scrubberThumb.style.left = `${percent * 100}%`;
      resetAutoHideTimer();
    });

    window.addEventListener('touchmove', (e) => {
      if (isDraggingScrubber) {
        const percent = getScrubberPercent(e);
        if (video.duration > 0) {
          video.currentTime = percent * video.duration;
        }
        playedBar.style.width = `${percent * 100}%`;
        scrubberThumb.style.left = `${percent * 100}%`;
      }
    });

    window.addEventListener('touchend', () => {
      if (isDraggingScrubber) {
        isDraggingScrubber = false;
        resetAutoHideTimer();
      }
    });

    // Speed Popover Menu
    speedBtn.onclick = (e) => {
      e.stopPropagation();
      qualityMenu.classList.add('hidden');
      speedMenu.classList.toggle('hidden');
      resetAutoHideTimer();
    };

    speedMenu.querySelectorAll('.player-speed-item').forEach(item => {
      item.onclick = (e) => {
        e.stopPropagation();
        const spd = parseFloat(item.dataset.speed);
        video.playbackRate = spd;
        localStorage.setItem('TTPhim_player_speed', spd);
        speedLabel.innerText = spd === 1 ? '1x' : `${spd}x`;
        speedMenu.querySelectorAll('.player-speed-item').forEach(b => {
          const isCur = parseFloat(b.dataset.speed) === spd;
          b.className = `player-speed-item px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-white/10 transition-colors flex items-center justify-between cursor-pointer ${isCur ? 'text-primary font-bold bg-white/5' : 'text-white/80'}`;
          b.innerHTML = `<span>${parseFloat(b.dataset.speed) === 1 ? 'Chuẩn (1x)' : `${b.dataset.speed}x`}</span>${isCur ? '<span class="material-symbols-outlined text-[14px]">check</span>' : ''}`;
        });
        speedMenu.classList.add('hidden');
        resetAutoHideTimer();
      };
    });

    // Quality Popover Menu
    qualityBtn.onclick = (e) => {
      e.stopPropagation();
      speedMenu.classList.add('hidden');
      qualityMenu.classList.toggle('hidden');
      resetAutoHideTimer();
    };

    // Close menus when clicking outside
    document.addEventListener('click', () => {
      if (!qualityMenu.classList.contains('hidden')) qualityMenu.classList.add('hidden');
      if (!speedMenu.classList.contains('hidden')) speedMenu.classList.add('hidden');
    });

    // Floating Quick Controls in Top Bar
    topBar.querySelector('#btn-toggle-engine').onclick = () => {
      useEmbed = true;
      window.showToast('Đang chuyển sang Server nhúng iframe...');
      loadEpisode(ep, video.currentTime);
    };

    topBar.querySelector('#btn-skip-intro-custom').onclick = () => {
      seekRelative(90);
      window.showToast('⏩ Đã tua nhanh 90s intro');
    };

    // Video Playback Events
    video.addEventListener('play', () => {
      playIcon.innerText = 'pause';
      bufferingEl.classList.add('opacity-0');
      resetAutoHideTimer();
      if (watchPartyController && watchPartyController.isInRoom() && !watchPartyController.isRemoteSync) {
        watchPartyController.emitPlayerAction('play', video.currentTime);
      }
    });

    video.addEventListener('pause', () => {
      playIcon.innerText = 'play_arrow';
      resetAutoHideTimer();
      if (video.duration > 0) {
        API.saveHistory({
          movie_slug: movieData.movie.slug,
          movie_name: movieData.movie.name,
          origin_name: movieData.movie.origin_name,
          poster_url: movieData.movie.poster_url,
          thumb_url: movieData.movie.thumb_url,
          episode_slug: ep.slug,
          episode_name: formatEpDisplay(ep.name),
          current_time: video.currentTime,
          duration: video.duration
        });
      }
      if (watchPartyController && watchPartyController.isInRoom() && !watchPartyController.isRemoteSync) {
        watchPartyController.emitPlayerAction('pause', video.currentTime);
      }
    });

    video.addEventListener('seeked', () => {
      if (watchPartyController && watchPartyController.isInRoom() && !watchPartyController.isRemoteSync) {
        watchPartyController.emitPlayerAction('seek', video.currentTime);
      }
    });

    video.addEventListener('timeupdate', () => {
      if (!isDraggingScrubber && video.duration > 0) {
        const percent = (video.currentTime / video.duration) * 100;
        playedBar.style.width = `${percent}%`;
        scrubberThumb.style.left = `${percent}%`;
      }
      updateTimeDisplay();
    });

    video.addEventListener('progress', () => {
      if (video.buffered.length > 0 && video.duration > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        const percent = (bufferedEnd / video.duration) * 100;
        bufferBar.style.width = `${percent}%`;
      }
    });

    video.addEventListener('waiting', () => {
      bufferingEl.classList.remove('opacity-0');
    });

    video.addEventListener('seeking', () => {
      bufferingEl.classList.remove('opacity-0');
    });

    video.addEventListener('canplay', () => {
      bufferingEl.classList.add('opacity-0');
    });

    video.addEventListener('playing', () => {
      bufferingEl.classList.add('opacity-0');
    });

    // Auto-Next Episode on End
    video.addEventListener('ended', () => {
      playIcon.innerText = 'play_arrow';
      const isAutoNext = localStorage.getItem('TTPhim_auto_next') !== 'false';
      const nextEpisode = getNextEpisode();
      if (!isAutoNext || !nextEpisode) return;

      // Show countdown overlay
      countdownOverlay.classList.remove('hidden');
      const nextTitle = countdownOverlay.querySelector('#countdown-next-title');
      const secText = countdownOverlay.querySelector('#countdown-seconds-text');
      const circle = countdownOverlay.querySelector('#countdown-progress-circle');
      const cancelBtn = countdownOverlay.querySelector('#btn-countdown-cancel');
      const nowBtn = countdownOverlay.querySelector('#btn-countdown-now');

      nextTitle.innerText = `Tập ${cleanEpName(nextEpisode.name)} - ${movieData.movie.name}`;
      let secondsLeft = 5;
      secText.innerText = secondsLeft;
      circle.style.strokeDasharray = '100, 100';

      function cancelAutoNext() {
        if (countdownTimer) clearInterval(countdownTimer);
        countdownOverlay.classList.add('hidden');
      }

      cancelBtn.onclick = cancelAutoNext;
      nowBtn.onclick = () => {
        cancelAutoNext();
        loadEpisode(nextEpisode);
      };

      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = setInterval(() => {
        secondsLeft--;
        secText.innerText = secondsLeft;
        circle.style.strokeDasharray = `${(secondsLeft / 5) * 100}, 100`;
        if (secondsLeft <= 0) {
          clearInterval(countdownTimer);
          countdownOverlay.classList.add('hidden');
          loadEpisode(nextEpisode);
        }
      }, 1000);
    });

    // Periodic History Saving (Every 10s)
    if (window._watchHistoryInterval) clearInterval(window._watchHistoryInterval);
    window._watchHistoryInterval = setInterval(() => {
      if (!video.paused && video.duration > 0) {
        API.saveHistory({
          movie_slug: movieData.movie.slug,
          movie_name: movieData.movie.name,
          origin_name: movieData.movie.origin_name,
          poster_url: movieData.movie.poster_url,
          thumb_url: movieData.movie.thumb_url,
          episode_slug: ep.slug,
          episode_name: formatEpDisplay(ep.name),
          current_time: video.currentTime,
          duration: video.duration
        });
      }
    }, 10000);

    // Global Keyboard Shortcuts (With inputs guard)
    if (window._playerKeydownHandler) {
      window.removeEventListener('keydown', window._playerKeydownHandler);
    }
    window._playerKeydownHandler = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return;

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowLeft':
        case 'j':
        case 'J':
          e.preventDefault();
          seekRelative(-10);
          break;
        case 'ArrowRight':
        case 'l':
        case 'L':
          e.preventDefault();
          seekRelative(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.05);
          video.muted = false;
          updateVolumeUI();
          break;
        case 'ArrowDown':
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.05);
          updateVolumeUI();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          volumeBtn.click();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 't':
        case 'T':
          e.preventDefault();
          const cBtn = document.getElementById('btn-cinema-mode');
          if (cBtn) cBtn.click();
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          pipBtn.click();
          break;
        case '0': case '1': case '2': case '3': case '4':
        case '5': case '6': case '7': case '8': case '9':
          if (video.duration > 0) {
            e.preventDefault();
            const pct = parseInt(e.key, 10) / 10;
            video.currentTime = pct * video.duration;
            window.showToast(`⏩ Nhảy tới ${(pct * 100).toFixed(0)}%`);
          }
          break;
        case 'Escape':
          qualityMenu.classList.add('hidden');
          speedMenu.classList.add('hidden');
          break;
      }
    };
    window.addEventListener('keydown', window._playerKeydownHandler);

    // Populate HLS Quality Menu Helper
    function populateQualityMenu(levels, currentLevel) {
      if (!levels || levels.length === 0) {
        qualityBtn.classList.add('hidden');
        return;
      }
      qualityBtn.classList.remove('hidden');

      let menuHtml = `<div class="px-2 py-1 text-[11px] text-on-surface-variant font-bold uppercase tracking-wider border-b border-white/10 mb-1">Chất lượng</div>`;
      // Auto option
      const isAuto = currentLevel === -1;
      menuHtml += `
        <button class="player-quality-item px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-white/10 transition-colors flex items-center justify-between cursor-pointer ${isAuto ? 'text-primary font-bold bg-white/5' : 'text-white/80'}" data-level="-1">
          <span>Tự động (Auto)</span>
          ${isAuto ? '<span class="material-symbols-outlined text-[14px]">check</span>' : ''}
        </button>
      `;

      levels.forEach((lvl, idx) => {
        const isCurrent = currentLevel === idx;
        const resLabel = lvl.height ? `${lvl.height}p` : `Mức #${idx + 1}`;
        menuHtml += `
          <button class="player-quality-item px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-white/10 transition-colors flex items-center justify-between cursor-pointer ${isCurrent ? 'text-primary font-bold bg-white/5' : 'text-white/80'}" data-level="${idx}">
            <span>${resLabel}</span>
            ${isCurrent ? '<span class="material-symbols-outlined text-[14px]">check</span>' : ''}
          </button>
        `;
      });

      qualityMenu.innerHTML = menuHtml;

      qualityMenu.querySelectorAll('.player-quality-item').forEach(b => {
        b.onclick = (e) => {
          e.stopPropagation();
          const lvlIdx = parseInt(b.dataset.level, 10);
          if (hlsInstance) {
            hlsInstance.currentLevel = lvlIdx;
            if (lvlIdx === -1) {
              qualityLabel.innerText = 'Auto';
              window.showToast('Đã chọn: Tự động điều chỉnh chất lượng');
            } else {
              const h = levels[lvlIdx]?.height;
              qualityLabel.innerText = h ? `${h}p` : `Mức #${lvlIdx + 1}`;
              window.showToast(`Đã chuyển sang chất lượng ${qualityLabel.innerText}`);
            }
          }
          populateQualityMenu(levels, lvlIdx);
          qualityMenu.classList.add('hidden');
          resetAutoHideTimer();
        };
      });
    }

    // Initialize Hls.js
    if (window.Hls && Hls.isSupported()) {
      hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90
      });
      hlsInstance.loadSource(ep.link_m3u8);
      hlsInstance.attachMedia(video);

      hlsInstance.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        if (initialTime > 0) video.currentTime = initialTime;
        populateQualityMenu(data.levels, hlsInstance.currentLevel);

        const p = video.play();
        if (p !== undefined) {
          p.catch(() => {
            console.log('[TTPhim Hls] Autoplay deferred, user can click to start');
          });
        }
      });

      hlsInstance.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        if (hlsInstance.autoLevelEnabled) {
          const lvl = hlsInstance.levels[data.level];
          if (lvl && lvl.height) {
            qualityLabel.innerText = `Auto (${lvl.height}p)`;
          }
        }
      });

      hlsInstance.on(Hls.Events.ERROR, (event, data) => {
        console.warn('[TTPhim Hls Error]', data.type, data.details, 'fatal:', data.fatal);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('[TTPhim Hls] Retrying network load...');
              hlsInstance.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('[TTPhim Hls] Recovering media error...');
              hlsInstance.recoverMediaError();
              break;
            default:
              if (ep.link_embed) {
                console.warn('[TTPhim Hls] Fatal error, falling back to iframe embed');
                window.showToast('Stream HLS gặp sự cố, đang tự động chuyển sang server nhúng...', 'info');
                useEmbed = true;
                loadEpisode(ep, video.currentTime);
              }
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = ep.link_m3u8;
      video.addEventListener('loadedmetadata', () => {
        if (initialTime > 0) video.currentTime = initialTime;
        video.play().catch(() => {});
      });
      qualityBtn.classList.add('hidden'); // Native Safari HLS manages quality automatically
    } else {
      if (ep.link_embed) {
        useEmbed = true;
        loadEpisode(ep);
        return;
      }
    }
  }

  function renderEmbedPlayer(ep) {
    viewport.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'relative w-full h-full bg-black rounded-xl overflow-hidden';

    const iframe = document.createElement('iframe');
    iframe.src = ep.link_embed;
    iframe.className = 'w-full h-full border-0 rounded-xl';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    container.appendChild(iframe);

    // Switch back to HLS pill (if link_m3u8 is present or extractable)
    const canHls = ep.link_m3u8 || extractM3u8FromEmbed(ep.link_embed);
    if (canHls) {
      if (!ep.link_m3u8) ep.link_m3u8 = canHls;
      const quickBar = document.createElement('div');
      quickBar.className = 'absolute top-3 right-3 z-30 flex items-center gap-2 pointer-events-auto';
      quickBar.innerHTML = `
        <button id="btn-toggle-engine" class="px-3 py-1.5 rounded-full bg-black/75 hover:bg-primary-container text-white hover:text-on-primary-container font-label-md text-xs backdrop-blur-md shadow-lg transition-all flex items-center gap-1 cursor-pointer border border-white/10" type="button" title="Đổi sang Player HLS chất lượng cao">
          <span class="material-symbols-outlined text-[15px]">swap_horiz</span>
          <span>Đổi sang Player HLS (Đồng bộ 100%)</span>
        </button>
      `;
      container.appendChild(quickBar);
      quickBar.querySelector('#btn-toggle-engine').onclick = () => {
        useEmbed = false;
        window.showToast('Đang chuyển sang Trình phát HLS tốc độ cao...');
        loadEpisode(ep);
      };
    }

    // Party Reactions Layer & Sync Toast
    const partyLayer = document.createElement('div');
    partyLayer.id = 'party-reactions-layer';
    partyLayer.className = 'absolute inset-0 pointer-events-none z-30 overflow-hidden';
    container.appendChild(partyLayer);

    const syncToast = document.createElement('div');
    syncToast.id = 'party-sync-toast';
    syncToast.className = 'absolute top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none bg-black/85 backdrop-blur-md px-4 py-2 rounded-full border border-white/15 text-white text-xs font-semibold flex items-center gap-2 shadow-2xl transition-all duration-300 opacity-0 -translate-y-2';
    syncToast.innerHTML = `
      <span class="material-symbols-outlined text-secondary-fixed text-[16px]">sync</span>
      <span id="party-sync-toast-text">Đồng bộ phát video</span>
    `;
    container.appendChild(syncToast);

    // Watch Party Sync Bar for Embed Player
    renderEmbedPartyBar(container, ep, iframe);

    viewport.appendChild(container);
  }

  function renderEmbedPartyBar(container, ep, iframe) {
    let bar = container.querySelector('#embed-party-sync-bar');
    if (bar) bar.remove();

    bar = document.createElement('div');
    bar.id = 'embed-party-sync-bar';
    bar.className = 'absolute bottom-3 left-1/2 -translate-x-1/2 z-30 bg-surface-container/90 backdrop-blur-md px-3.5 py-1.5 rounded-2xl border border-white/15 shadow-2xl flex items-center gap-2.5 text-white text-xs pointer-events-auto transition-all max-w-[95%] overflow-x-auto';

    const inRoom = watchPartyController && watchPartyController.isInRoom();
    const isHost = watchPartyController && watchPartyController.isHost();
    const roomCode = watchPartyController ? watchPartyController.getRoomCode() : '';

    if (!inRoom) {
      bar.innerHTML = `
        <button id="btn-embed-open-party" class="px-2.5 py-1 rounded-lg bg-secondary-fixed/20 hover:bg-secondary-fixed/30 text-secondary-fixed font-bold flex items-center gap-1 cursor-pointer transition-colors" type="button">
          <span class="material-symbols-outlined text-[15px]">group</span>
          <span>Xem chung (Watch Party)</span>
        </button>
      `;
      bar.querySelector('#btn-embed-open-party').onclick = () => {
        const btnHeader = document.getElementById('btn-watch-party');
        if (btnHeader) btnHeader.click();
      };
    } else {
      bar.innerHTML = `
        <div class="flex items-center gap-1.5 font-bold text-secondary-fixed shrink-0">
          <span class="w-2 h-2 rounded-full bg-secondary-fixed animate-ping"></span>
          <span class="font-mono">${roomCode}</span>
        </div>
        <div class="h-3.5 w-px bg-white/20 shrink-0"></div>
        <button id="btn-embed-party-play" class="px-2.5 py-1 rounded-lg bg-primary hover:bg-primary/80 font-bold flex items-center gap-1 cursor-pointer text-white shadow-sm shrink-0" type="button" title="Đồng bộ Phát video cho phòng">
          <span class="material-symbols-outlined text-[15px]">play_arrow</span>
          <span>Phát chung</span>
        </button>
        <button id="btn-embed-party-pause" class="px-2.5 py-1 rounded-lg bg-surface-container-high hover:bg-surface-container-highest font-bold flex items-center gap-1 cursor-pointer text-white shrink-0" type="button" title="Đồng bộ Tạm dừng cho phòng">
          <span class="material-symbols-outlined text-[15px]">pause</span>
          <span>Tạm dừng</span>
        </button>
        ${ep.link_m3u8 ? `
          <button id="btn-embed-switch-hls-bar" class="px-2.5 py-1 rounded-lg bg-secondary-fixed/20 hover:bg-secondary-fixed/30 text-secondary-fixed font-bold flex items-center gap-1 cursor-pointer border border-secondary-fixed/30 shrink-0" type="button" title="Chuyển sang Player HLS để đồng bộ 100% tự động">
            <span class="material-symbols-outlined text-[14px]">bolt</span>
            <span>Player HLS</span>
          </button>
        ` : ''}
      `;

      bar.querySelector('#btn-embed-party-play').onclick = () => {
        if (watchPartyController) {
          watchPartyController.emitPlayerAction('play', 0);
          try {
            iframe.contentWindow?.postMessage({ event: 'command', func: 'playVideo' }, '*');
            iframe.contentWindow?.postMessage({ method: 'play' }, '*');
          } catch(e) {}
          window.showToast?.('▶️ Đã gửi lệnh Phát tới phòng xem!');
        }
      };

      bar.querySelector('#btn-embed-party-pause').onclick = () => {
        if (watchPartyController) {
          watchPartyController.emitPlayerAction('pause', 0);
          try {
            iframe.contentWindow?.postMessage({ event: 'command', func: 'pauseVideo' }, '*');
            iframe.contentWindow?.postMessage({ method: 'pause' }, '*');
          } catch(e) {}
          window.showToast?.('⏸️ Đã gửi lệnh Tạm dừng tới phòng xem!');
        }
      };

      const hlsBtn = bar.querySelector('#btn-embed-switch-hls-bar');
      if (hlsBtn) {
        hlsBtn.onclick = () => {
          useEmbed = false;
          window.showToast?.('Đang chuyển sang Trình phát HLS để đồng bộ tự động...');
          loadEpisode(ep);
        };
      }
    }

    container.appendChild(bar);
  }

  // --- Server Pills Switcher ---
  function renderServerPills(servers) {
    const container = document.querySelector('div.flex.items-center.flex-wrap.gap-2:has(.pl-1)') ||
                      document.querySelector('div.flex.items-center.flex-wrap.gap-2');
    if (!container) return;

    container.innerHTML = `
      <span class="text-on-surface-variant font-label-badge text-label-badge uppercase tracking-wider pl-1">Server:</span>
      ${servers.map((s, idx) => {
        const sName = s.server_name || `Server #${idx + 1}`;
        const icon = idx === 0 ? 'bolt' : (sName.includes('Song Ngữ') || sName.includes('Thuyết minh') ? 'record_voice_over' : 'cloud_sync');
        return `
        <button class="server-pill-btn px-3 py-1.5 rounded-lg font-label-md text-label-md transition-all flex items-center gap-1.5 cursor-pointer ${idx === activeServerIndex ? 'bg-primary-container text-on-primary-container font-bold shadow-sm' : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'}" data-index="${idx}">
          <span class="material-symbols-outlined text-[16px]">${icon}</span>
          <span>${sName}</span>
        </button>
      `;
      }).join('')}
    `;

    container.querySelectorAll('.server-pill-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        activeServerIndex = parseInt(btn.dataset.index, 10);
        useEmbed = false;
        renderServerPills(servers);
        const newServerEps = servers[activeServerIndex]?.server_data || [];
        renderEpisodeDrawer(newServerEps);
        const curNum = (currentEpisode?.name || '').toString().match(/\d+/)?.[0];
        const targetEp = newServerEps.find(ep => 
          cleanEpName(ep.name) === cleanEpName(currentEpisode?.name) ||
          (curNum && (ep.name || '').toString().match(/\d+/)?.[0] === curNum)
        ) || newServerEps[0];
        if (targetEp) {
          loadEpisode(targetEp);
        }
      });
    });
  }

  // --- Episode Drawer in Right Column ---
  function renderEpisodeDrawer(episodes) {
    const listContainer = document.querySelector('div.p-2.space-y-2.overflow-y-auto') ||
                          document.querySelector('aside div.space-y-2');
    if (!listContainer) return;

    drawerEpisodesList = episodes || [];

    const countBadge = document.querySelector('aside span.font-label-badge');
    if (countBadge) countBadge.innerText = `${drawerEpisodesList.length} Tập`;

    renderDrawerItems(drawerEpisodesList);
    setupEpisodeSearch();
  }

  function renderDrawerItems(filteredEps) {
    const listContainer = document.querySelector('div.p-2.space-y-2.overflow-y-auto') ||
                          document.querySelector('aside div.space-y-2');
    if (!listContainer) return;

    if (!filteredEps || filteredEps.length === 0) {
      listContainer.innerHTML = `
        <div class="py-8 text-center text-on-surface-variant flex flex-col items-center gap-1.5">
          <span class="material-symbols-outlined text-[32px] text-surface-variant">search_off</span>
          <p class="font-body-sm text-[13px]">Không tìm thấy tập phim phù hợp</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = filteredEps.map(ep => {
      const isCurrent = currentEpisode && currentEpisode.slug === ep.slug;
      return `
        <div class="ep-item w-full rounded-xl p-2 flex gap-3 relative shadow-md group cursor-pointer transition-colors ${isCurrent ? 'bg-surface-container-high border-l-4 border-l-primary-container' : 'bg-surface-container hover:bg-surface-container-high'}" data-slug="${ep.slug}" data-name="${ep.name}">
          <div class="relative w-28 aspect-video rounded-lg overflow-hidden shrink-0 bg-surface-container-highest">
            <img src="${movieData.movie.thumb_url || movieData.movie.poster_url}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            ${isCurrent ? `
              <div class="absolute inset-0 bg-surface-container-lowest/50 flex items-center justify-center">
                <div class="flex items-center gap-0.5">
                  <span class="w-1 h-3 bg-primary-container animate-pulse"></span>
                  <span class="w-1 h-4 bg-primary-container animate-pulse delay-75"></span>
                  <span class="w-1 h-2 bg-primary-container animate-pulse delay-150"></span>
                </div>
              </div>
            ` : ''}
            <span class="absolute bottom-1 right-1 px-1 rounded bg-surface-container-lowest/90 font-label-badge text-[10px] text-on-surface">4K</span>
          </div>
          <div class="flex-1 min-w-0 flex flex-col justify-between py-0.5">
            <div>
              <span class="font-label-md text-label-md font-bold ${isCurrent ? 'text-primary' : 'text-on-surface group-hover:text-primary'} truncate block">
                ${/full/i.test(ep.name) ? 'Bản Full' : `Tập ${cleanEpName(ep.name)}`}
              </span>
              <p class="font-body-sm text-[12px] text-on-surface-variant line-clamp-1 mt-0.5">
                ${movieData.movie.name}
              </p>
            </div>
            <div class="flex items-center justify-between text-on-surface-variant font-label-badge text-[11px] pt-1">
              ${isCurrent ? `
                <span class="text-primary font-semibold flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-primary-container"></span> Đang phát</span>
              ` : `
                <span>Full HD Vietsub</span>
                <span class="material-symbols-outlined text-[16px] group-hover:text-primary">play_circle</span>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');

    listContainer.querySelectorAll('.ep-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetSlug = item.dataset.slug;
        const found = drawerEpisodesList.find(ep => ep.slug === targetSlug);
        if (found) {
          useEmbed = false;
          loadEpisode(found);
          renderDrawerItems(drawerEpisodesList);
        }
      });
    });
  }

  function setupEpisodeSearch() {
    const searchInput = document.getElementById('episode-search-input');
    if (!searchInput || searchInput.dataset.listenerBound === 'true') return;
    searchInput.dataset.listenerBound = 'true';

    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        renderDrawerItems(drawerEpisodesList);
        return;
      }
      const numOnly = q.replace(/^(tập|tap)\s*/i, '').trim();
      const filtered = drawerEpisodesList.filter(ep => {
        const epName = (ep.name || '').toLowerCase();
        const epFull = `tập ${epName}`;
        const epSlug = (ep.slug || '').toLowerCase();
        return epName.includes(q) ||
               (numOnly && epName.includes(numOnly)) ||
               epFull.includes(q) ||
               epSlug.includes(q);
      });
      renderDrawerItems(filtered);
    });
  }

  function highlightActiveEpisodeInDrawer(activeSlug) {
    const items = document.querySelectorAll('.ep-item');
    items.forEach(it => {
      if (it.dataset.slug === activeSlug) {
        it.classList.add('bg-surface-container-high', 'border-l-4', 'border-l-primary-container');
        it.classList.remove('bg-surface-container');
        it.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        it.classList.remove('bg-surface-container-high', 'border-l-4', 'border-l-primary-container');
        it.classList.add('bg-surface-container');
      }
    });
  }

  // --- Synopsis & Info Below Player ---
  function renderInfoBelowPlayer(movie) {
    const title = document.querySelector('h2.font-headline-lg, h2');
    if (title) title.innerText = movie.name;

    const synopsis = document.querySelector('p.font-body-md.text-on-surface-variant.leading-relaxed') ||
                     document.querySelector('p.font-body-md.text-on-surface-variant');
    if (synopsis) synopsis.innerText = movie.content || 'Nội dung phim đang cập nhật...';

    const chips = document.querySelectorAll('div.flex.flex-wrap.items-center.gap-x-6 div');
    if (chips[0]) chips[0].innerHTML = `<span class="text-on-surface font-semibold">Đạo diễn:</span> ${movie.director?.length ? movie.director.join(', ') : 'Đang cập nhật'}`;
    if (chips[1]) chips[1].innerHTML = `<span class="text-on-surface font-semibold">Diễn viên:</span> ${movie.actor?.length ? movie.actor.join(', ') : 'Đang cập nhật'}`;
    if (chips[2]) chips[2].innerHTML = `<span class="text-on-surface font-semibold">Thể loại:</span> ${movie.category?.map(c => c.name).join(', ') || 'Chính kịch'}`;
  }

  // --- Cinema Mode & Theater Mode ---
  function setupCinemaAndTheaterModes() {
    let cinemaLightsOff = false;
    const floatingLightBtn = document.getElementById('btn-floating-light');

    function setCinemaState(turnOff) {
      cinemaLightsOff = turnOff;
      document.body.classList.toggle('cinema-lights-active', cinemaLightsOff);

      if (cinemaLightsOff) {
        if (lightIcon) {
          lightIcon.innerText = 'lightbulb';
          lightIcon.style.fontVariationSettings = "'FILL' 1";
        }
        if (lightLabel) lightLabel.innerText = 'Bật đèn rạp';
        if (lightBtn) {
          lightBtn.classList.add('bg-amber-500/25', 'text-amber-300', 'border', 'border-amber-400/50', 'shadow-[0_0_15px_rgba(245,158,11,0.3)]');
        }

        // Smoothly center the movie player in the user's viewport
        if (viewport) {
          viewport.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        window.showToast('🎬 Đã tắt đèn rạp chiếu. Nhấp vào vùng tối hoặc phím Esc để bật lại đèn!');
      } else {
        if (lightIcon) {
          lightIcon.innerText = 'lightbulb';
          lightIcon.style.fontVariationSettings = "'FILL' 0";
        }
        if (lightLabel) lightLabel.innerText = 'Tắt đèn rạp';
        if (lightBtn) {
          lightBtn.classList.remove('bg-amber-500/25', 'text-amber-300', 'border', 'border-amber-400/50', 'shadow-[0_0_15px_rgba(245,158,11,0.3)]');
        }

        window.showToast('💡 Đã bật lại ánh sáng rạp');
      }
    }

    if (lightBtn) {
      lightBtn.onclick = (e) => {
        e.stopPropagation();
        setCinemaState(!cinemaLightsOff);
      };
    }

    if (floatingLightBtn) {
      floatingLightBtn.onclick = (e) => {
        e.stopPropagation();
        setCinemaState(false);
      };
    }

    if (lightScrim) {
      lightScrim.onclick = (e) => {
        e.stopPropagation();
        setCinemaState(false);
      };
    }

    // Keyboard shortcut Escape to exit cinema lights off
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && cinemaLightsOff) {
        setCinemaState(false);
      }
    });

    let isTheater = false;
    if (theaterBtn && primaryPlayerCol) {
      theaterBtn.onclick = () => {
        isTheater = !isTheater;
        if (isTheater) {
          primaryPlayerCol.classList.remove('xl:col-span-8', '2xl:col-span-9');
          primaryPlayerCol.classList.add('xl:col-span-12', '2xl:col-span-12');
          theaterBtn.classList.add('text-primary-container');
          window.showToast('Chế độ rạp hát: Mở rộng khung xem tối đa');
        } else {
          primaryPlayerCol.classList.remove('xl:col-span-12', '2xl:col-span-12');
          primaryPlayerCol.classList.add('xl:col-span-8', '2xl:col-span-9');
          theaterBtn.classList.remove('text-primary-container');
          window.showToast('Thu nhỏ khung xem chuẩn');
        }
      };
    }
  }

  // --- Utility Action Cluster (Download, Report, Like/Rate, Share) ---
  function setupUtilityButtons(movieSlug) {
    const downloadBtn = document.getElementById('btn-download-ep') || document.querySelector('button[title*="Tải về"]');
    const reportBtn = document.getElementById('btn-report-ep') || document.querySelector('button[title*="Báo cáo"]');
    const rateBtn = document.getElementById('btn-rate-ep') || document.querySelector('button[title*="Đánh giá"]');
    const shareBtn = document.getElementById('btn-share-ep') || document.querySelector('button[title*="Chia sẻ"]');

    if (downloadBtn) downloadBtn.addEventListener('click', openDownloadModal);
    if (reportBtn) reportBtn.addEventListener('click', openReportModal);
    if (rateBtn) rateBtn.addEventListener('click', openRateModal);
    if (shareBtn) shareBtn.addEventListener('click', shareEpisode);
  }

  function openDownloadModal() {
    if (!currentEpisode) {
      window.showToast('Chưa chọn tập phim để tải', 'error');
      return;
    }
    let modal = document.getElementById('modal-download');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-download';
      modal.className = 'fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4';
      document.body.appendChild(modal);
    }
    const streamLink = currentEpisode.link_m3u8 || currentEpisode.link_embed || '';
    const epName = `Tập ${cleanEpName(currentEpisode.name)}`;
    modal.innerHTML = `
      <div class="relative w-full max-w-lg bg-surface-container rounded-2xl overflow-hidden shadow-2xl border border-surface-container-highest flex flex-col p-6 gap-4">
        <div class="flex items-center justify-between border-b border-surface-container-highest pb-3">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-primary text-[24px]">download</span>
            <h3 class="font-headline-sm text-on-surface font-bold">Tải Về Tập Phim</h3>
          </div>
          <button id="close-download-btn" class="p-1.5 rounded-full hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div class="space-y-3">
          <div>
            <span class="text-on-surface-variant font-label-badge text-label-badge uppercase">Tập hiện tại</span>
            <p class="font-body-md text-on-surface font-bold">${movieData.movie.name} - ${epName}</p>
          </div>

          <div>
            <span class="text-on-surface-variant font-label-badge text-label-badge uppercase">Đường dẫn Stream (m3u8)</span>
            <div class="flex items-center gap-2 mt-1">
              <input type="text" readonly value="${streamLink}" id="download-stream-url" class="flex-1 px-3 py-2 rounded-lg bg-surface-container-high text-on-surface text-body-sm font-mono border border-surface-container-highest focus:outline-none select-all truncate" />
              <button id="btn-copy-stream-url" class="px-3 py-2 rounded-lg bg-primary-container text-on-primary-container font-label-md text-label-md font-bold hover:brightness-110 transition-all flex items-center gap-1 cursor-pointer shrink-0">
                <span class="material-symbols-outlined text-[16px]">content_copy</span>
                <span>Sao chép</span>
              </button>
            </div>
          </div>

          <div class="p-3.5 rounded-xl bg-surface-container-high/60 border border-surface-container-highest text-on-surface-variant text-body-sm space-y-1.5">
            <p class="font-semibold text-on-surface flex items-center gap-1">
              <span class="material-symbols-outlined text-secondary text-[16px]">info</span>
              Hướng dẫn tải chất lượng cao:
            </p>
            <ul class="list-disc list-inside space-y-1 text-[13px] text-on-surface-variant">
              <li>Dán link trên vào phần mềm <b>IDM (Internet Download Manager)</b> hoặc <b>VLC Player</b> để tải bản Full HD trực tiếp.</li>
              <li>Hoặc cài đặt tiện ích mở rộng trình duyệt <b>Live Stream Downloader</b> để tải video m3u8 tự động.</li>
            </ul>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-surface-container-highest">
          ${currentEpisode.link_m3u8 ? `
            <a href="${currentEpisode.link_m3u8}" target="_blank" rel="noopener noreferrer" class="px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-md text-label-md transition-colors flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px]">open_in_new</span>
              <span>Mở trực tiếp link m3u8</span>
            </a>
          ` : ''}
          <button id="close-download-footer-btn" class="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container font-label-md text-label-md font-bold hover:brightness-110 transition-colors cursor-pointer">
            Đã hiểu
          </button>
        </div>
      </div>
    `;
    modal.classList.remove('hidden');

    const closeFn = () => modal.classList.add('hidden');
    modal.querySelector('#close-download-btn').onclick = closeFn;
    modal.querySelector('#close-download-footer-btn').onclick = closeFn;
    modal.onclick = (e) => { if (e.target === modal) closeFn(); };

    modal.querySelector('#btn-copy-stream-url').onclick = () => {
      navigator.clipboard.writeText(streamLink);
      window.showToast('✅ Đã sao chép link stream tập phim vào bộ nhớ tạm!');
    };
  }

  function openReportModal() {
    if (!currentEpisode) return;
    let modal = document.getElementById('modal-report');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-report';
      modal.className = 'fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4';
      document.body.appendChild(modal);
    }
    const epLabel = `Tập ${cleanEpName(currentEpisode.name)}`;
    modal.innerHTML = `
      <div class="relative w-full max-w-md bg-surface-container rounded-2xl overflow-hidden shadow-2xl border border-surface-container-highest flex flex-col p-6 gap-4">
        <div class="flex items-center justify-between border-b border-surface-container-highest pb-3">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-error text-[24px]">flag</span>
            <h3 class="font-headline-sm text-on-surface font-bold">Báo Lỗi Tập Phim</h3>
          </div>
          <button id="close-report-btn" class="p-1.5 rounded-full hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div class="space-y-3">
          <p class="font-body-sm text-on-surface-variant">
            Báo cáo sự cố phát cho <b class="text-on-surface">${movieData.movie.name} - ${epLabel}</b>:
          </p>

          <div class="space-y-2" id="report-reasons-group">
            <label class="flex items-center gap-2.5 p-2.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest cursor-pointer transition-colors text-body-sm text-on-surface">
              <input type="radio" name="report_reason" value="Video không phát được / Màn hình đen" checked class="accent-primary-container" />
              <span>Video không phát được / Màn hình đen</span>
            </label>
            <label class="flex items-center gap-2.5 p-2.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest cursor-pointer transition-colors text-body-sm text-on-surface">
              <input type="radio" name="report_reason" value="Video bị đứng hình / Giật lag liên tục" class="accent-primary-container" />
              <span>Video bị đứng hình / Giật lag liên tục</span>
            </label>
            <label class="flex items-center gap-2.5 p-2.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest cursor-pointer transition-colors text-body-sm text-on-surface">
              <input type="radio" name="report_reason" value="Lệch âm thanh hoặc lệch phụ đề" class="accent-primary-container" />
              <span>Lệch âm thanh hoặc lệch phụ đề</span>
            </label>
            <label class="flex items-center gap-2.5 p-2.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest cursor-pointer transition-colors text-body-sm text-on-surface">
              <input type="radio" name="report_reason" value="Sai tập hoặc trùng lặp tập khác" class="accent-primary-container" />
              <span>Sai tập hoặc trùng lặp tập khác</span>
            </label>
          </div>

          <div>
            <label class="font-label-badge text-label-badge text-outline uppercase tracking-wider block mb-1">Mô tả thêm (Tùy chọn)</label>
            <textarea id="report-details-input" rows="2" class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-on-surface text-body-sm placeholder:text-on-surface-variant focus:outline-none focus:bg-surface-container-highest border border-surface-container-highest" placeholder="Chi tiết lỗi (ví dụ: bị đứng ở phút 15:20)..."></textarea>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-surface-container-highest">
          <button id="cancel-report-btn" class="px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-md text-label-md transition-colors cursor-pointer">
            Hủy
          </button>
          <button id="submit-report-btn" class="px-5 py-2 rounded-lg bg-error-container text-on-error-container font-label-md text-label-md font-bold hover:brightness-110 transition-all flex items-center gap-1.5 cursor-pointer shadow-md">
            <span class="material-symbols-outlined text-[16px]">send</span>
            <span>Gửi Báo Cáo</span>
          </button>
        </div>
      </div>
    `;
    modal.classList.remove('hidden');

    const closeFn = () => modal.classList.add('hidden');
    modal.querySelector('#close-report-btn').onclick = closeFn;
    modal.querySelector('#cancel-report-btn').onclick = closeFn;
    modal.onclick = (e) => { if (e.target === modal) closeFn(); };

    modal.querySelector('#submit-report-btn').onclick = async () => {
      const selectedRadio = modal.querySelector('input[name="report_reason"]:checked');
      const reason = selectedRadio ? selectedRadio.value : 'Lỗi video';
      const details = modal.querySelector('#report-details-input').value.trim();

      const submitBtn = modal.querySelector('#submit-report-btn');
      submitBtn.disabled = true;
      submitBtn.innerText = 'Đang gửi...';

      try {
        await API.reportError(movieData.movie.slug, currentEpisode.slug, reason, details);
        closeFn();
        window.showToast('✅ Đã tiếp nhận báo lỗi! Đội ngũ TTPhim sẽ kiểm tra xử lý ngay.');
      } catch (e) {
        closeFn();
        window.showToast('Đã ghi nhận phản hồi của bạn. Cảm ơn bạn!');
      }
    };
  }

  function openRateModal() {
    if (!currentEpisode) return;
    let modal = document.getElementById('modal-rate');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-rate';
      modal.className = 'fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4';
      document.body.appendChild(modal);
    }
    const epLabel = `Tập ${cleanEpName(currentEpisode.name)}`;
    let selectedScore = 5;
    const labels = {
      1: '1/5 Sao - Rất tệ',
      2: '2/5 Sao - Tạm ổn',
      3: '3/5 Sao - Bình thường',
      4: '4/5 Sao - Rất hay',
      5: '5/5 Sao - Tuyệt phẩm điện ảnh'
    };

    modal.innerHTML = `
      <div class="relative w-full max-w-sm bg-surface-container rounded-2xl overflow-hidden shadow-2xl border border-surface-container-highest flex flex-col p-6 gap-4 text-center">
        <div class="flex items-center justify-between border-b border-surface-container-highest pb-3">
          <h3 class="font-headline-sm text-on-surface font-bold">Đánh Giá Tập Phim</h3>
          <button id="close-rate-btn" class="p-1.5 rounded-full hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <p class="font-body-sm text-on-surface-variant">
          Bạn thấy chất lượng nội dung và hình ảnh của <b class="text-on-surface">${epLabel}</b> thế nào?
        </p>

        <div class="flex items-center justify-center gap-2 py-2" id="star-picker">
          ${[1, 2, 3, 4, 5].map(s => `
            <button type="button" class="star-btn text-[36px] transition-transform hover:scale-125 cursor-pointer text-[#E2B616]" data-score="${s}">
              <span class="material-symbols-outlined text-[36px]" style="font-variation-settings: 'FILL' 1;">star</span>
            </button>
          `).join('')}
        </div>

        <div id="star-score-label" class="font-label-md text-label-md font-bold text-secondary">
          ${labels[5]}
        </div>

        <div class="flex items-center justify-center gap-2 pt-2 border-t border-surface-container-highest">
          <button id="submit-rate-btn" class="w-full py-2.5 rounded-xl bg-primary-container text-on-primary-container font-label-md text-label-md font-bold hover:brightness-110 shadow-lg transition-all cursor-pointer">
            Gửi Đánh Giá
          </button>
        </div>
      </div>
    `;
    modal.classList.remove('hidden');

    const closeFn = () => modal.classList.add('hidden');
    modal.querySelector('#close-rate-btn').onclick = closeFn;
    modal.onclick = (e) => { if (e.target === modal) closeFn(); };

    const starBtns = modal.querySelectorAll('.star-btn');
    const labelEl = modal.querySelector('#star-score-label');

    function updateStars(score) {
      selectedScore = score;
      starBtns.forEach(btn => {
        const s = parseInt(btn.dataset.score, 10);
        const icon = btn.querySelector('.material-symbols-outlined');
        if (s <= score) {
          btn.className = 'star-btn text-[36px] transition-transform hover:scale-125 cursor-pointer text-[#E2B616]';
          icon.style.fontVariationSettings = "'FILL' 1";
        } else {
          btn.className = 'star-btn text-[36px] transition-transform hover:scale-125 cursor-pointer text-surface-variant';
          icon.style.fontVariationSettings = "'FILL' 0";
        }
      });
      if (labelEl) labelEl.innerText = labels[score] || `${score}/5 Sao`;
    }

    starBtns.forEach(btn => {
      btn.onclick = () => {
        const s = parseInt(btn.dataset.score, 10);
        updateStars(s);
      };
    });

    modal.querySelector('#submit-rate-btn').onclick = async () => {
      try {
        await API.rateMovie(movieData.movie.slug, selectedScore, currentEpisode.slug);
      } catch(e) {}
      closeFn();
      const rateBtn = document.getElementById('btn-rate-ep') || document.querySelector('button[title*="Đánh giá"]');
      if (rateBtn) {
        rateBtn.classList.add('text-primary');
      }
      window.showToast(`⭐ Cảm ơn bạn đã đánh giá ${selectedScore}/5 sao cho ${epLabel}!`);
    };
  }

  function shareEpisode() {
    const url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      window.showToast('🔗 Đã sao chép liên kết tập phim vào bộ nhớ tạm!');
    } else {
      prompt('Sao chép đường dẫn xem phim:', url);
    }
  }

  // --- Real-time Comments Section ---
  async function initComments(movieSlug) {
    const commentsList = document.getElementById('watch-comments-list') || document.querySelector('div.space-y-space-md.pt-2');
    const commentCountBadge = document.getElementById('watch-comment-count') || document.querySelector('span.font-label-badge:has(.Bình)');
    const input = document.getElementById('watch-comment-input') || document.querySelector('div.flex-1.flex.flex-col.gap-2 input[type="text"]');
    const sendBtn = document.getElementById('watch-send-btn') || document.querySelector('button.bg-primary-container:has(.send)');
    const timeTagBtn = document.getElementById('watch-timetag-btn') || document.querySelector('button[title="Đính kèm mốc thời gian phim"]');
    const timeTagPreview = document.getElementById('watch-timetag-preview');
    const emojiBtn = document.getElementById('watch-emoji-btn') || document.querySelector('button[title="Chèn biểu tượng cảm xúc"]');
    const sortNewestBtn = document.getElementById('watch-btn-sort-newest');
    const sortFeaturedBtn = document.getElementById('watch-btn-sort-featured');
    const userAvatarEl = document.getElementById('watch-user-avatar');

    let currentSort = 'featured'; // 'latest' or 'featured'
    let currentUser = null;

    try {
      const stored = localStorage.getItem('kk_user');
      if (stored) currentUser = JSON.parse(stored);
    } catch(e) {}

    if (currentUser && userAvatarEl && currentUser.avatar) {
      userAvatarEl.src = currentUser.avatar;
    }

    if (!commentsList) return;

    // Relative Time Formatter
    function formatRelativeTime(dateStr) {
      if (!dateStr) return 'Vừa xong';
      if (typeof dateStr === 'string' && (dateStr.includes('trước') || dateStr.includes('Vừa xong'))) {
        return dateStr;
      }
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const diffMs = Date.now() - d.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return 'Vừa xong';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin} phút trước`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour} giờ trước`;
      const diffDay = Math.floor(diffHour / 24);
      if (diffDay < 30) return `${diffDay} ngày trước`;
      return d.toLocaleDateString('vi-VN');
    }

    // Liked Comments Storage Helper
    function getLikedCommentIds() {
      try {
        return JSON.parse(localStorage.getItem('TTPhim_liked_comments')) || [];
      } catch (e) {
        return [];
      }
    }
    function toggleLikedCommentId(id, liked) {
      try {
        let ids = getLikedCommentIds();
        if (liked) {
          if (!ids.includes(id)) ids.push(id);
        } else {
          ids = ids.filter(i => i !== id);
        }
        localStorage.setItem('TTPhim_liked_comments', JSON.stringify(ids));
      } catch (e) {}
    }

    // Emoji Picker Quick Dropdown / Cycle
    if (emojiBtn && input) {
      emojiBtn.addEventListener('click', () => {
        const emojis = ['🍿', '🔥', '❤️', '👏', '😱', '👍', '⭐'];
        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
        input.value += (input.value ? ' ' : '') + randomEmoji;
        input.focus();
      });
    }

    // Attach Time Tag from Current Video Player
    let attachedTimeTag = null;
    if (timeTagBtn) {
      timeTagBtn.addEventListener('click', () => {
        const vid = document.getElementById('TTPhim-player') || document.querySelector('video');
        if (vid && vid.currentTime > 0) {
          const m = Math.floor(vid.currentTime / 60);
          const s = Math.floor(vid.currentTime % 60);
          attachedTimeTag = `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
          if (timeTagPreview) timeTagPreview.innerText = attachedTimeTag;
          if (input) {
            if (!input.value.includes(`[${attachedTimeTag}]`)) {
              input.value = `[${attachedTimeTag}] ` + input.value;
            }
            input.focus();
          }
          window.showToast(`⏱️ Đã gắn mốc thời gian ${attachedTimeTag}`);
        } else {
          window.showToast('Hãy phát video để lấy mốc thời gian thực', 'info');
        }
      });
    }

    // Sort Toggle Handlers
    if (sortNewestBtn && sortFeaturedBtn) {
      sortNewestBtn.onclick = () => {
        currentSort = 'latest';
        sortNewestBtn.className = 'px-3 py-1 rounded-full bg-surface-container-high text-primary font-label-md text-label-md font-bold transition-colors cursor-pointer';
        sortFeaturedBtn.className = 'px-3 py-1 rounded-full bg-surface-container text-on-surface font-label-md text-label-md hover:bg-surface-container-high transition-colors cursor-pointer';
        loadAndRenderComments();
      };

      sortFeaturedBtn.onclick = () => {
        currentSort = 'featured';
        sortFeaturedBtn.className = 'px-3 py-1 rounded-full bg-surface-container-high text-primary font-label-md text-label-md font-bold transition-colors cursor-pointer';
        sortNewestBtn.className = 'px-3 py-1 rounded-full bg-surface-container text-on-surface font-label-md text-label-md hover:bg-surface-container-high transition-colors cursor-pointer';
        loadAndRenderComments();
      };
    }

    async function loadAndRenderComments() {
      let comments = await API.getComments(movieSlug);
      if (commentCountBadge) {
        commentCountBadge.innerText = `${comments.length} Bình luận`;
      }

      if (currentSort === 'latest') {
        comments = [...comments].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      } else {
        comments = [...comments].sort((a, b) => (b.likes || 0) - (a.likes || 0));
      }

      if (comments.length === 0) {
        commentsList.innerHTML = `
          <div class="py-8 text-center text-on-surface-variant flex flex-col items-center gap-1.5 bg-surface-container-low rounded-xl">
            <span class="material-symbols-outlined text-[32px] text-surface-variant">chat</span>
            <p class="font-body-sm text-[13px]">Chưa có bình luận nào. Hãy chia sẻ cảm nghĩ của bạn về tập phim này!</p>
          </div>
        `;
        return;
      }

      const likedIds = getLikedCommentIds();

      commentsList.innerHTML = comments.map(c => {
        const isLiked = likedIds.includes(c.id);
        const relTime = formatRelativeTime(c.created_at);
        const replies = c.replies || [];

        return `
        <div class="p-3 rounded-xl bg-surface-container-low/80 hover:bg-surface-container-low transition-colors space-y-2 border border-white/5" id="watch-comment-card-${c.id}">
          <div class="flex items-start gap-3">
            <img src="${c.user_avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAPbHo0WbRHUQwGQOjadraD_tAk7XQUGjJQPQDSvK5RZfRCVSUufHkI5ytr1RnoudWNDKzqxm86HwkNOfZhdJ6gH5wUBF8Hu6sx3uE-8dvCv61CH5Sl6_6rcVCCUeOGM4Ub3reCBWB2-ittRPKQslAi-yOnv0WlNzjOskqtQAYGefgmgohy9WNwv1lISujIp8aIK3M0rynROP6yxRZcTMSyWswRJsdzf7K4DhDzjq8'}" class="w-9 h-9 rounded-full object-cover shrink-0 ring-1 ring-white/10" alt="${c.user_name}" />
            <div class="flex-1 min-w-0 space-y-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-label-md text-label-md font-bold text-on-surface truncate">${c.user_name}</span>
                <span class="px-2 py-0.2 rounded bg-surface-container-highest text-secondary-fixed font-label-badge text-[10px]">Thành Viên</span>
                <span class="font-body-sm text-[11px] text-on-surface-variant">${relTime}</span>
              </div>

              ${c.is_spoil ? `
                <div class="spoiler-wrapper rounded-lg bg-surface-container p-2 border border-amber-500/30">
                  <div class="flex items-center justify-between text-[11px] text-amber-400 font-semibold mb-1">
                    <span>⚠️ Có chi tiết tiết lộ phim (Spoil)</span>
                    <button type="button" class="btn-toggle-watch-spoil text-primary underline cursor-pointer">Bấm để xem</button>
                  </div>
                  <p class="spoiler-body text-body-md text-on-surface filter blur-[5px] select-none transition-all duration-300 leading-relaxed">
                    ${c.timestamp_tag ? `<span class="text-primary hover:underline cursor-pointer font-bold seek-jump" data-time="${c.timestamp_tag}">${c.timestamp_tag}</span> ` : ''}
                    ${c.content}
                  </p>
                </div>
              ` : `
                <p class="font-body-md text-body-md text-on-surface leading-relaxed">
                  ${c.timestamp_tag ? `<span class="text-primary hover:underline cursor-pointer font-bold seek-jump inline-flex items-center gap-0.5 bg-primary/10 px-1.5 py-0.2 rounded" data-time="${c.timestamp_tag}"><span class="material-symbols-outlined text-[13px]">play_circle</span>${c.timestamp_tag}</span> ` : ''}
                  ${c.content}
                </p>
              `}

              <div class="flex items-center gap-4 text-on-surface-variant font-body-sm text-xs pt-1">
                <button class="btn-like-watch-comment flex items-center gap-1 ${isLiked ? 'text-primary font-bold' : 'hover:text-primary'} transition-colors cursor-pointer" data-id="${c.id}" data-liked="${isLiked}">
                  <span class="material-symbols-outlined text-[16px]">${isLiked ? 'favorite' : 'thumb_up'}</span>
                  <span class="like-counter">${c.likes || 0}</span>
                </button>
                <button class="btn-reply-watch hover:text-on-surface transition-colors cursor-pointer flex items-center gap-1" data-id="${c.id}" data-author="${c.user_name}">
                  <span class="material-symbols-outlined text-[15px]">reply</span>
                  <span>Trả lời (${replies.length})</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Inline Reply Box (Hidden by default) -->
          <div class="watch-reply-box hidden pt-2 border-t border-surface-container-highest" id="watch-reply-box-${c.id}">
            <div class="flex gap-2 items-center">
              <input type="text" class="reply-input flex-1 px-3 py-1.5 rounded-lg bg-surface-container text-xs text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:bg-surface-container-high transition-colors" placeholder="Phản hồi cho ${c.user_name}..." />
              <button type="button" class="btn-send-watch-reply px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:brightness-110 cursor-pointer shadow-sm flex items-center gap-1 shrink-0" data-id="${c.id}">
                <span>Gửi</span>
                <span class="material-symbols-outlined text-[13px]">send</span>
              </button>
              <button type="button" class="btn-close-watch-reply p-1.5 rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface cursor-pointer shrink-0" data-id="${c.id}">
                <span class="material-symbols-outlined text-[15px]">close</span>
              </button>
            </div>
          </div>

          <!-- Nested Replies List -->
          ${replies.length > 0 ? `
            <div class="space-y-2 pl-4 sm:pl-8 border-l border-surface-container-highest pt-1">
              ${replies.map(r => `
                <div class="bg-surface-container/50 p-2 rounded-lg space-y-0.5">
                  <div class="flex items-center gap-2">
                    <img src="${r.user_avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuCSbujeZINk45JTMl1uHDHy58dzZtklTE0t5uPEhCwlICLLPGtijYtFO9JeqSqDGusRdB1gt7qycyJ5OX6kz4PYsmWLL5tvWy-spdqpz_DrG4qLJz8bQgtQlXHllA2zvsiuNrLj_cdZxocwgDBP1kYO7DK8ESLeW9ehVKs4rk50GYzAAygACch82GxO5zi10RYSftDRhD9PgHoAOvOFxw2ZKO2w05zb0jDbKL3RAg4'}" class="w-5 h-5 rounded-full object-cover shrink-0" />
                    <span class="text-xs font-bold text-on-surface">${r.user_name}</span>
                    <span class="text-[10px] text-on-surface-variant">${formatRelativeTime(r.created_at)}</span>
                  </div>
                  <p class="text-xs text-on-surface-variant pl-7 leading-relaxed">${r.content}</p>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
      }).join('');

      // Wire up Spoiler Toggles
      commentsList.querySelectorAll('.btn-toggle-watch-spoil').forEach(btn => {
        btn.addEventListener('click', () => {
          const wrapper = btn.closest('.spoiler-wrapper');
          const body = wrapper?.querySelector('.spoiler-body');
          if (body) {
            const isBlurred = body.classList.contains('blur-[5px]');
            if (isBlurred) {
              body.classList.remove('blur-[5px]', 'select-none');
              btn.innerText = 'Ẩn lại';
            } else {
              body.classList.add('blur-[5px]', 'select-none');
              btn.innerText = 'Bấm để xem';
            }
          }
        });
      });

      // Like comment buttons (Toggle Like/Unlike)
      commentsList.querySelectorAll('.btn-like-watch-comment').forEach(b => {
        b.addEventListener('click', async () => {
          const cid = b.dataset.id;
          const currentlyLiked = b.dataset.liked === 'true';
          const newAction = currentlyLiked ? 'unlike' : 'like';

          const counter = b.querySelector('.like-counter');
          const icon = b.querySelector('.material-symbols-outlined');

          const newLikes = await API.likeComment(cid, newAction);
          toggleLikedCommentId(cid, !currentlyLiked);

          b.dataset.liked = (!currentlyLiked).toString();
          if (counter) counter.innerText = newLikes;
          if (!currentlyLiked) {
            b.classList.add('text-primary', 'font-bold');
            if (icon) icon.innerText = 'favorite';
            window.showToast('❤️ Đã thích bình luận!');
          } else {
            b.classList.remove('text-primary', 'font-bold');
            if (icon) icon.innerText = 'thumb_up';
          }
        });
      });

      // Reply comment buttons (Open Inline Form)
      commentsList.querySelectorAll('.btn-reply-watch').forEach(b => {
        b.addEventListener('click', () => {
          const cid = b.dataset.id;
          const box = document.getElementById(`watch-reply-box-${cid}`);
          if (box) {
            box.classList.toggle('hidden');
            const replyInput = box.querySelector('.reply-input');
            if (!box.classList.contains('hidden') && replyInput) replyInput.focus();
          }
        });
      });

      commentsList.querySelectorAll('.btn-close-watch-reply').forEach(b => {
        b.addEventListener('click', () => {
          const cid = b.dataset.id;
          const box = document.getElementById(`watch-reply-box-${cid}`);
          if (box) box.classList.add('hidden');
        });
      });

      commentsList.querySelectorAll('.btn-send-watch-reply').forEach(b => {
        b.addEventListener('click', async () => {
          const cid = b.dataset.id;
          const box = document.getElementById(`watch-reply-box-${cid}`);
          const replyInput = box?.querySelector('.reply-input');
          const content = replyInput ? replyInput.value.trim() : '';

          if (!content) {
            window.showToast('Vui lòng nhập nội dung phản hồi', 'error');
            return;
          }

          b.disabled = true;
          const res = await API.postReply(cid, content, currentUser?.name || 'Khán giả TTPhim');
          b.disabled = false;

          if (res.status) {
            window.showToast('Đã gửi phản hồi thành công!');
            if (replyInput) replyInput.value = '';
            box.classList.add('hidden');
            loadAndRenderComments();
          } else {
            window.showToast(res.message || 'Lỗi gửi phản hồi', 'error');
          }
        });
      });

      // Seek jump timestamps
      commentsList.querySelectorAll('.seek-jump').forEach(sj => {
        sj.addEventListener('click', (e) => {
          e.stopPropagation();
          const timeText = sj.dataset.time || sj.innerText;
          const clean = timeText.replace(/[\[\]]/g, '').trim();
          const parts = clean.split(':').map(Number);
          if (parts.length === 2) {
            const targetSec = parts[0] * 60 + parts[1];
            const vid = document.getElementById('TTPhim-player') || document.querySelector('video');
            if (vid) {
              vid.currentTime = targetSec;
              vid.play().catch(() => {});
              window.scrollTo({ top: 0, behavior: 'smooth' });
              window.showToast(`⏩ Đã nhảy tới thời điểm ${clean}`);
            }
          }
        });
      });
    }

    if (sendBtn && input) {
      sendBtn.addEventListener('click', async () => {
        const text = input.value.trim();
        if (!text) {
          window.showToast('Vui lòng nhập nội dung bình luận', 'error');
          input.focus();
          return;
        }
        sendBtn.disabled = true;
        sendBtn.innerHTML = `<span class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>`;

        const commentPayload = {
          content: text,
          timestamp_tag: attachedTimeTag,
          user_name: currentUser?.name || 'Khán giả TTPhim'
        };

        const res = await API.postComment(movieSlug, commentPayload);
        sendBtn.disabled = false;
        sendBtn.innerHTML = `<span>Gửi</span><span class="material-symbols-outlined text-[16px]">send</span>`;

        if (res.status) {
          input.value = '';
          attachedTimeTag = null;
          if (timeTagPreview) timeTagPreview.innerText = '';
          window.showToast('🎉 Đã đăng bình luận thành công!');
          loadAndRenderComments();
        } else {
          window.showToast(res.message || 'Lỗi đăng bình luận', 'error');
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendBtn.click();
      });
    }

    loadAndRenderComments();
  }

  // ==========================================
  // TTPhim - Real-Time Watch Party Controller
  // ==========================================
  function initWatchParty() {
    const tabEpisodes = document.getElementById('tab-btn-episodes');
    const tabParty = document.getElementById('tab-btn-party');
    const paneEpisodes = document.getElementById('pane-episodes');
    const paneParty = document.getElementById('pane-watch-party');
    const partyPaneContent = document.getElementById('party-pane-content');
    const partyLiveBadge = document.getElementById('tab-party-live-badge');

    const btnWatchPartyHeader = document.getElementById('btn-watch-party');
    const partyBtnIcon = document.getElementById('party-btn-icon');
    const partyBtnLabel = document.getElementById('party-btn-label');
    const partyBtnBadge = document.getElementById('party-btn-badge');

    const modal = document.getElementById('watch-party-modal');
    const btnCloseModal = document.getElementById('btn-close-party-modal');
    const modalTabCreate = document.getElementById('modal-tab-create');
    const modalTabJoin = document.getElementById('modal-tab-join');
    const modalPaneCreate = document.getElementById('modal-pane-create');
    const modalPaneJoin = document.getElementById('modal-pane-join');

    const inputRoomName = document.getElementById('party-input-room-name');
    const inputCreateUser = document.getElementById('party-input-create-user');
    const inputJoinCode = document.getElementById('party-input-join-code');
    const inputJoinUser = document.getElementById('party-input-join-user');
    const btnSubmitCreate = document.getElementById('btn-submit-create-party');
    const btnSubmitJoin = document.getElementById('btn-submit-join-party');

    let activePartyRoom = null;
    let partyUser = null;
    let sseSource = null;
    let isRemoteSync = false;
    let syncToastTimer = null;
    let heartbeatTimer = null;

    // Helper: Safely resolve active movie even before async getMovieDetail completes
    function getActiveMovie() {
      if (movieData && movieData.movie) return movieData.movie;
      const titleText = document.title ? document.title.replace(/^Đang xem:\s*/i, '').replace(/\s*-.*$/, '').trim() : '';
      return {
        slug: slug || (movieData?.movie?.slug || ''),
        name: titleText || slug || 'Phim TTPhim',
        poster_url: '',
        thumb_url: ''
      };
    }

    // Helper: Resolve current user identity
    function getPartyUser() {
      if (partyUser) return partyUser;
      try {
        const stored = localStorage.getItem('kk_user');
        if (stored) {
          const u = JSON.parse(stored);
          if (u && (u.name || u.email)) {
            partyUser = {
              id: u.id || `user_${Date.now()}`,
              name: u.name || u.email.split('@')[0],
              avatar: u.avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAPbHo0WbRHUQwGQOjadraD_tAk7XQUGjJQPQDSvK5RZfRCVSUufHkI5ytr1RnoudWNDKzqxm86HwkNOfZhdJ6gH5wUBF8Hu6sx3uE-8dvCv61CH5Sl6_6rcVCCUeOGM4Ub3reCBWB2-ittRPKQslAi-yOnv0WlNzjOskqtQAYGefgmgohy9WNwv1lISujIp8aIK3M0rynROP6yxRZcTMSyWswRJsdzf7K4DhDzjq8'
            };
            return partyUser;
          }
        }
      } catch(e) {}

      let guestId = localStorage.getItem('TTPhim_party_guest_id');
      if (!guestId) {
        guestId = `guest_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`;
        localStorage.setItem('TTPhim_party_guest_id', guestId);
      }
      let guestName = localStorage.getItem('TTPhim_party_guest_name');
      if (!guestName) {
        guestName = `Khán giả #${guestId.slice(-4)}`;
      }
      partyUser = {
        id: guestId,
        name: guestName,
        avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDmV0kJ3rLlFchh-aGILVOr-pQbdtHs2qQKQtkeKftGRHjg2nb7ii3xkFe2aJA7-Gldl5BqHuj4L_uiVmqQyW9CCgKPrUz_MCzKjGtUsI1R3dM0r3vXdhkgOsKaL_SVbs9gl7b2sTWQGr3VphY1X_pUChBkXZ-KPQtC6HeaIV7uxpjuEKEltMKcvR78AOcVjnQlk989xeMDULyOev-eHEjgdEO-N14MVTh2oQR_E3A'
      };
      return partyUser;
    }

    function saveCustomName(name) {
      if (!name || !name.trim()) return;
      const clean = name.trim();
      localStorage.setItem('TTPhim_party_guest_name', clean);
      const u = getPartyUser();
      u.name = clean;
    }

    // --- Tab Switcher (Episodes vs Watch Party) ---
    function selectTab(tab) {
      if (tab === 'party') {
        if (paneEpisodes) paneEpisodes.classList.add('hidden');
        if (paneParty) paneParty.classList.remove('hidden');
        if (tabParty) {
          tabParty.className = 'flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 bg-primary-container text-on-primary-container shadow-sm cursor-pointer relative';
        }
        if (tabEpisodes) {
          tabEpisodes.className = 'flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest/40 cursor-pointer';
        }
        if (!activePartyRoom) {
          renderWelcomeView();
        } else {
          scrollChatToBottom();
        }
      } else {
        if (paneParty) paneParty.classList.add('hidden');
        if (paneEpisodes) paneEpisodes.classList.remove('hidden');
        if (tabEpisodes) {
          tabEpisodes.className = 'flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 bg-primary-container text-on-primary-container shadow-sm cursor-pointer';
        }
        if (tabParty) {
          tabParty.className = 'flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest/40 cursor-pointer relative';
        }
      }
    }

    if (tabEpisodes) tabEpisodes.addEventListener('click', () => selectTab('episodes'));
    if (tabParty) tabParty.addEventListener('click', () => selectTab('party'));

    // --- Modal Management ---
    function openModal(tab = 'create', prefilledCode = '') {
      if (!modal) return;
      const u = getPartyUser();
      const currentMovie = getActiveMovie();
      if (inputRoomName) {
        if (!inputRoomName.value || inputRoomName.value.startsWith('Phòng xem') || inputRoomName.value.includes('undefined')) {
          inputRoomName.value = `Phòng xem ${currentMovie.name} của ${u.name}`;
        }
      }
      if (inputCreateUser) inputCreateUser.value = u.name;
      if (inputJoinUser) inputJoinUser.value = u.name;
      if (prefilledCode && inputJoinCode) inputJoinCode.value = prefilledCode.toUpperCase();

      switchModalTab(tab);
      modal.style.display = 'flex';
      modal.classList.remove('hidden', 'pointer-events-none');
      requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        modal.classList.add('opacity-100');
        const card = document.getElementById('party-modal-card');
        if (card) {
          card.classList.remove('scale-95');
          card.classList.add('scale-100');
        }
      });
    }

    function closeModal() {
      if (!modal) return;
      modal.classList.remove('opacity-100');
      modal.classList.add('opacity-0');
      const card = document.getElementById('party-modal-card');
      if (card) {
        card.classList.remove('scale-100');
        card.classList.add('scale-95');
      }
      setTimeout(() => {
        modal.classList.add('hidden', 'pointer-events-none');
        modal.style.display = 'none';
      }, 250);
    }

    function switchModalTab(tab) {
      if (tab === 'join') {
        if (modalPaneCreate) modalPaneCreate.classList.add('hidden');
        if (modalPaneJoin) modalPaneJoin.classList.remove('hidden');
        if (modalTabJoin) {
          modalTabJoin.className = 'pb-2.5 font-bold text-sm text-secondary-fixed border-b-2 border-secondary-fixed flex items-center gap-1.5 cursor-pointer transition-all';
        }
        if (modalTabCreate) {
          modalTabCreate.className = 'pb-2.5 font-bold text-sm text-on-surface-variant hover:text-on-surface border-b-2 border-transparent flex items-center gap-1.5 cursor-pointer transition-all';
        }
        if (inputJoinCode) inputJoinCode.focus();
      } else {
        if (modalPaneJoin) modalPaneJoin.classList.add('hidden');
        if (modalPaneCreate) modalPaneCreate.classList.remove('hidden');
        if (modalTabCreate) {
          modalTabCreate.className = 'pb-2.5 font-bold text-sm text-primary border-b-2 border-primary flex items-center gap-1.5 cursor-pointer transition-all';
        }
        if (modalTabJoin) {
          modalTabJoin.className = 'pb-2.5 font-bold text-sm text-on-surface-variant hover:text-on-surface border-b-2 border-transparent flex items-center gap-1.5 cursor-pointer transition-all';
        }
        if (inputRoomName) inputRoomName.focus();
      }
    }

    if (modalTabCreate) modalTabCreate.addEventListener('click', () => switchModalTab('create'));
    if (modalTabJoin) modalTabJoin.addEventListener('click', () => switchModalTab('join'));
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
        closeModal();
      }
    });

    // Header Button Trigger
    if (btnWatchPartyHeader) {
      btnWatchPartyHeader.addEventListener('click', () => {
        if (!activePartyRoom) {
          openModal('create');
        } else {
          selectTab('party');
          if (window.innerWidth < 1280) {
            document.getElementById('right-rail-card')?.scrollIntoView({ behavior: 'smooth' });
          }
        }
      });
    }

    // --- Create Room Submit ---
    if (btnSubmitCreate) {
      btnSubmitCreate.addEventListener('click', async () => {
        const u = getPartyUser();
        const customName = inputCreateUser ? inputCreateUser.value.trim() : '';
        if (customName) saveCustomName(customName);

        const currentMovie = getActiveMovie();
        const roomName = (inputRoomName ? inputRoomName.value.trim() : '') || `Phòng xem ${currentMovie.name}`;
        const modeEl = document.querySelector('input[name="party-control-mode"]:checked');
        const controlMode = modeEl ? modeEl.value : 'host_only';

        btnSubmitCreate.disabled = true;
        btnSubmitCreate.innerHTML = `<span class="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></span><span>Đang tạo phòng...</span>`;

        try {
          const res = await API.createPartyRoom({
            movieSlug: currentMovie.slug,
            movieName: currentMovie.name,
            moviePoster: currentMovie.poster_url || currentMovie.thumb_url || '',
            episodeSlug: currentEpisode?.slug || epSlug || '1',
            episodeName: currentEpisode?.name || epSlug || '1',
            roomName,
            controlMode,
            userName: u.name,
            avatar: u.avatar,
            userId: u.id
          });

          if (res.status && res.data) {
            closeModal();
            onRoomEntered(res.data, res.user || u);
            window.showToast?.(`🎉 Đã tạo phòng ${res.data.code} thành công!`, 'success');
          } else {
            window.showToast?.(res.message || 'Lỗi tạo phòng', 'error');
          }
        } catch (err) {
          console.error('[WatchParty] Create error:', err);
          window.showToast?.('Lỗi kết nối máy chủ tạo phòng', 'error');
        } finally {
          btnSubmitCreate.disabled = false;
          btnSubmitCreate.innerHTML = `<span class="material-symbols-outlined text-[18px]">play_arrow</span><span>Khởi Tạo Phòng & Xem Ngay</span>`;
        }
      });
    }

    // --- Join Room Submit ---
    if (btnSubmitJoin) {
      btnSubmitJoin.addEventListener('click', async () => {
        const u = getPartyUser();
        const customName = inputJoinUser ? inputJoinUser.value.trim() : '';
        if (customName) saveCustomName(customName);

        const code = inputJoinCode ? inputJoinCode.value.trim().toUpperCase() : '';
        if (!code) {
          window.showToast('Vui lòng nhập mã phòng (ví dụ: KP-8492)', 'warning');
          return;
        }

        btnSubmitJoin.disabled = true;
        btnSubmitJoin.innerHTML = `<span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span><span>Đang tham gia...</span>`;

        try {
          const res = await API.joinPartyRoom(code, {
            userName: u.name,
            avatar: u.avatar,
            userId: u.id
          });

          if (res.status && res.data) {
            closeModal();
            onRoomEntered(res.data, res.user || u);
            window.showToast(`👋 Đã tham gia phòng ${res.data.code}!`, 'success');
          } else {
            window.showToast(res.message || 'Không thể tham gia phòng', 'error');
          }
        } catch (err) {
          console.error('[WatchParty] Join error:', err);
          window.showToast('Phòng không tồn tại hoặc đã hết hạn', 'error');
        } finally {
          btnSubmitJoin.disabled = false;
          btnSubmitJoin.innerHTML = `<span class="material-symbols-outlined text-[18px]">login</span><span>Tham Gia Phòng Ngay</span>`;
        }
      });
    }

    // --- On Room Entered (Joined or Created) ---
    function onRoomEntered(room, user) {
      activePartyRoom = room;
      partyUser = user || partyUser;

      // Update URL with ?party=CODE
      const url = new URL(window.location.href);
      url.searchParams.set('party', room.code);
      window.history.replaceState(null, '', url.toString());

      // Update Header Button
      updateHeaderButtonState(true);

      // Select Party Tab
      selectTab('party');

      // Connect SSE Stream
      connectSSEStream(room.code);

      // Render Active Room UI
      renderActiveRoomView();

      // Start periodic heartbeat if host
      startHeartbeat();

      // Initial Sync Player to Room
      syncPlayerToRoomState(room);

      // Update embed party bar if in iframe mode
      updateEmbedPartyBar();
    }

    function updateEmbedPartyBar() {
      const container = viewport?.querySelector('.relative.w-full.h-full');
      const iframe = viewport?.querySelector('iframe');
      if (container && iframe && currentEpisode) {
        renderEmbedPartyBar(container, currentEpisode, iframe);
      }
    }

    function updateHeaderButtonState(inRoom) {
      if (!btnWatchPartyHeader) return;
      if (inRoom && activePartyRoom) {
        btnWatchPartyHeader.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary-fixed/20 border border-secondary-fixed/50 text-secondary-fixed font-label-md text-label-md transition-all cursor-pointer shadow-md';
        if (partyBtnIcon) {
          partyBtnIcon.innerText = 'sensors';
          partyBtnIcon.className = 'material-symbols-outlined text-[18px] text-secondary-fixed animate-pulse';
        }
        if (partyBtnLabel) partyBtnLabel.innerText = activePartyRoom.code;
        if (partyBtnBadge) {
          partyBtnBadge.innerText = `${activePartyRoom.members?.length || 1}👥`;
          partyBtnBadge.className = 'px-1 rounded bg-secondary-fixed text-on-secondary-fixed font-bold font-mono text-[10px]';
        }
        if (partyLiveBadge) {
          partyLiveBadge.classList.remove('hidden');
          partyLiveBadge.innerText = `${activePartyRoom.members?.length || 1}`;
        }
      } else {
        btnWatchPartyHeader.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface font-label-md text-label-md transition-colors cursor-pointer';
        if (partyBtnIcon) {
          partyBtnIcon.innerText = 'group';
          partyBtnIcon.className = 'material-symbols-outlined text-[18px] text-secondary-fixed';
        }
        if (partyBtnLabel) partyBtnLabel.innerText = 'Watch Party';
        if (partyBtnBadge) {
          partyBtnBadge.innerText = 'LIVE';
          partyBtnBadge.className = 'px-1 rounded bg-secondary-fixed/20 text-secondary-fixed font-label-badge text-[10px]';
        }
        if (partyLiveBadge) partyLiveBadge.classList.add('hidden');
      }
    }

    function syncPlayerToRoomState(room) {
      if (!room) return;
      const vid = document.getElementById('TTPhim-player') || document.querySelector('video');
      if (vid && room.currentTime > 2) {
        isRemoteSync = true;
        vid.currentTime = room.currentTime;
        if (room.isPlaying) {
          vid.play().catch(() => {});
        }
        setTimeout(() => { isRemoteSync = false; }, 500);
      }
    }

    // --- Connect Real-time SSE Stream ---
    function connectSSEStream(code) {
      if (sseSource) {
        sseSource.close();
        sseSource = null;
      }

      const u = getPartyUser();
      const streamUrl = `/api/party/${code}/stream?userId=${encodeURIComponent(u.id)}&userName=${encodeURIComponent(u.name)}`;
      sseSource = new EventSource(streamUrl);

      sseSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleSSEMessage(data);
        } catch (e) {
          // heartbeat ping or malformed JSON
        }
      };

      sseSource.onerror = (err) => {
        console.warn('[WatchParty SSE] Connection warning, retrying...', err);
      };
    }

    function handleSSEMessage(data) {
      if (!data || !data.type) return;

      switch (data.type) {
        case 'init':
          if (data.room) {
            activePartyRoom = data.room;
            renderActiveRoomView();
          }
          break;

        case 'member_joined':
          if (activePartyRoom) {
            activePartyRoom.members = data.members || activePartyRoom.members;
            if (data.message) {
              appendMessageToChat(data.message);
            }
            renderMembersStrip();
            updateHeaderButtonState(true);
            showPartySyncToast(`👋 ${data.member?.name || 'Một người bạn'} đã vào phòng`);
          }
          break;

        case 'member_left':
          if (activePartyRoom) {
            activePartyRoom.members = data.members || activePartyRoom.members;
            if (data.newHost) {
              activePartyRoom.hostId = data.newHost.id;
              activePartyRoom.hostName = data.newHost.name;
            }
            if (data.message) {
              appendMessageToChat(data.message);
            }
            renderMembersStrip();
            updateHeaderButtonState(true);
            showPartySyncToast(`🚪 ${data.leavingName || 'Thành viên'} đã rời phòng`);
          }
          break;

        case 'player_sync':
          handleRemotePlayerSync(data);
          break;

        case 'chat_message':
          if (data.message) {
            appendMessageToChat(data.message);
          }
          break;

        case 'reaction':
          spawnFloatingEmoji(data.emoji, data.userName);
          break;

        default:
          break;
      }
    }

    // --- Remote Player Sync Handler ---
    function handleRemotePlayerSync(data) {
      const u = getPartyUser();
      if (data.senderId === u.id) return; // Ignore own echo

      isRemoteSync = true;
      const vid = document.getElementById('TTPhim-player') || document.querySelector('video');
      const iframe = viewport?.querySelector('iframe');

      if (vid) {
        if (typeof data.currentTime === 'number') {
          const diff = Math.abs(vid.currentTime - data.currentTime);
          if (data.action === 'seek' || diff > 2.5) {
            vid.currentTime = data.currentTime;
          }
        }

        if (data.action === 'play') {
          vid.play().catch(() => {});
        } else if (data.action === 'pause') {
          vid.pause();
        }
      } else if (iframe) {
        // Embed player iframe sync via HTML5 postMessage
        try {
          if (data.action === 'play') {
            iframe.contentWindow?.postMessage({ event: 'command', func: 'playVideo' }, '*');
            iframe.contentWindow?.postMessage({ method: 'play' }, '*');
          } else if (data.action === 'pause') {
            iframe.contentWindow?.postMessage({ event: 'command', func: 'pauseVideo' }, '*');
            iframe.contentWindow?.postMessage({ method: 'pause' }, '*');
          }
        } catch(e) {}
      }

      // Check episode switch
      if (data.action === 'change_episode' && data.episodeSlug && data.episodeSlug !== currentEpisode?.slug) {
        const found = drawerEpisodesList.find(e => e.slug === data.episodeSlug);
        if (found) {
          loadEpisode(found);
        } else {
          const currentMovie = getActiveMovie();
          window.location.href = `/xem-phim/${currentMovie.slug}/${data.episodeSlug}?party=${activePartyRoom.code}`;
        }
      }

      if (data.systemMessage) {
        appendMessageToChat(data.systemMessage);
      }

      showPartySyncToastFromData(data);

      setTimeout(() => {
        isRemoteSync = false;
      }, 500);
    }

    function showPartySyncToastFromData(data) {
      let text = '';
      if (data.action === 'play') text = `▶️ ${data.senderName} đã tiếp tục phát`;
      else if (data.action === 'pause') text = `⏸️ ${data.senderName} đã tạm dừng video`;
      else if (data.action === 'seek') {
        const m = Math.floor((data.currentTime || 0) / 60);
        const s = Math.floor((data.currentTime || 0) % 60);
        text = `⏩ ${data.senderName} đã tua đến ${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
      } else if (data.action === 'change_episode') {
        text = `🎬 ${data.senderName} đã chuyển sang Tập ${data.episodeName || data.episodeSlug}`;
      }
      if (text) showPartySyncToast(text);
    }

    function showPartySyncToast(text) {
      const toastEl = document.getElementById('party-sync-toast');
      const textEl = document.getElementById('party-sync-toast-text');
      if (!toastEl || !textEl) return;

      textEl.innerText = text;
      toastEl.classList.remove('opacity-0', '-translate-y-2');
      toastEl.classList.add('opacity-100', 'translate-y-0');

      clearTimeout(syncToastTimer);
      syncToastTimer = setTimeout(() => {
        toastEl.classList.remove('opacity-100', 'translate-y-0');
        toastEl.classList.add('opacity-0', '-translate-y-2');
      }, 3200);
    }

    // --- Floating Reaction Spawner ---
    function spawnFloatingEmoji(emoji, senderName = '') {
      let layer = document.getElementById('party-reactions-layer');
      if (!layer) {
        const vp = document.getElementById('player-viewport');
        if (vp) {
          layer = document.createElement('div');
          layer.id = 'party-reactions-layer';
          layer.className = 'absolute inset-0 pointer-events-none z-30 overflow-hidden';
          vp.appendChild(layer);
        }
      }
      if (!layer) return;

      const el = document.createElement('div');
      el.className = 'party-floating-emoji';
      const rightPx = Math.floor(20 + Math.random() * 85);
      el.style.right = `${rightPx}px`;
      el.innerText = emoji || '❤️';

      layer.appendChild(el);
      setTimeout(() => {
        el.remove();
      }, 2500);
    }

    // --- Periodic Host Heartbeat ---
    function startHeartbeat() {
      clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (!activePartyRoom) return;
        const u = getPartyUser();
        const isHost = activePartyRoom.hostId === u.id;
        if (isHost) {
          const vid = document.getElementById('TTPhim-player') || document.querySelector('video');
          if (vid && !vid.paused && vid.currentTime > 0) {
            API.syncPartyPlayer(activePartyRoom.code, {
              action: 'heartbeat',
              currentTime: vid.currentTime,
              episodeSlug: currentEpisode?.slug,
              episodeName: currentEpisode?.name,
              userId: u.id
            }).catch(() => {});
          }
        }
      }, 10000);
    }

    // --- UI Renderers for Party Pane ---
    function renderWelcomeView() {
      if (!partyPaneContent) return;
      partyPaneContent.innerHTML = `
        <div class="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
          <div class="w-16 h-16 rounded-2xl bg-secondary-fixed/20 border border-secondary-fixed/30 text-secondary-fixed flex items-center justify-center shadow-lg">
            <span class="material-symbols-outlined text-[36px]">group</span>
          </div>
          <div>
            <h4 class="font-bold text-white text-base">Xem Phim Cùng Nhau</h4>
            <p class="text-xs text-on-surface-variant max-w-xs mt-1 leading-relaxed">
              Đồng bộ thời gian phát chuẩn xác, trò chuyện trong lúc xem và thả biểu cảm sống động cùng bạn bè!
            </p>
          </div>
          <div class="w-full space-y-2 pt-2">
            <button id="pane-btn-create-party" class="w-full py-2.5 rounded-xl bg-primary-container text-on-primary-container font-bold text-xs hover:brightness-110 shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer">
              <span class="material-symbols-outlined text-[18px]">add_circle</span>
              <span>Tạo Phòng Xem Mới</span>
            </button>
            <button id="pane-btn-join-party" class="w-full py-2.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer border border-white/10">
              <span class="material-symbols-outlined text-[18px]">login</span>
              <span>Tham Gia Bằng Mã</span>
            </button>
          </div>
          <p class="text-[11px] text-on-surface-variant/70 italic pt-2">
            💡 Bạn có thể gửi link phòng xem chung cho bạn bè để tham gia tức thì.
          </p>
        </div>
      `;

      document.getElementById('pane-btn-create-party')?.addEventListener('click', () => openModal('create'));
      document.getElementById('pane-btn-join-party')?.addEventListener('click', () => openModal('join'));
    }

    function renderActiveRoomView() {
      if (!partyPaneContent || !activePartyRoom) return;
      const room = activePartyRoom;
      const u = getPartyUser();
      const isHost = room.hostId === u.id;

      partyPaneContent.innerHTML = `
        <div class="flex flex-col h-full flex-1 min-h-0">
          <!-- Room Top Info Strip -->
          <div class="p-3 bg-surface-container border-b border-white/5 flex flex-col gap-2 shrink-0">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 min-w-0">
                <span class="w-2.5 h-2.5 rounded-full bg-secondary-fixed animate-ping"></span>
                <h4 class="font-bold text-white text-xs truncate max-w-[140px]" title="${room.name}">${room.name}</h4>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <button id="btn-copy-party-link" class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-mono font-bold text-[11px] transition-all cursor-pointer border border-white/10" title="Bấm để sao chép liên kết mời bạn bè">
                  <span class="text-secondary-fixed">${room.code}</span>
                  <span class="material-symbols-outlined text-[14px]">content_copy</span>
                </button>
                <button id="btn-leave-party" class="p-1.5 rounded-lg bg-error-container/20 hover:bg-error-container text-error hover:text-white transition-colors cursor-pointer" title="Rời khỏi phòng">
                  <span class="material-symbols-outlined text-[16px]">logout</span>
                </button>
              </div>
            </div>
            
            <!-- Members Strip -->
            <div class="flex items-center justify-between text-[11px] text-on-surface-variant pt-1 border-t border-white/5">
              <div class="flex items-center gap-1.5 overflow-x-auto py-0.5" id="party-members-list">
                <!-- Avatars rendered here -->
              </div>
              <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full ${room.controlMode === 'host_only' ? 'bg-primary-container/20 text-primary' : 'bg-surface-container-highest text-on-surface'} shrink-0">
                ${room.controlMode === 'host_only' ? '👑 Chỉ Chủ phòng' : '👥 Tự do'}
              </span>
            </div>
          </div>

          <!-- Real-time Live Party Chat Stream -->
          <div class="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0 bg-surface-container-low/50" id="party-chat-stream">
            <!-- Messages rendered here -->
          </div>

          <!-- Floating Reactions Quick Bar -->
          <div class="px-3 py-1.5 bg-surface-container flex items-center justify-between gap-1 border-t border-white/5 shrink-0">
            <span class="text-[10px] text-on-surface-variant font-semibold shrink-0">Cảm xúc:</span>
            <div class="flex items-center gap-1.5">
              <button class="party-react-btn text-base hover:scale-130 active:scale-95 transition-transform cursor-pointer p-1" data-emoji="❤️" title="Thả tim">❤️</button>
              <button class="party-react-btn text-base hover:scale-130 active:scale-95 transition-transform cursor-pointer p-1" data-emoji="🍿" title="Bỏng ngô">🍿</button>
              <button class="party-react-btn text-base hover:scale-130 active:scale-95 transition-transform cursor-pointer p-1" data-emoji="🔥" title="Cháy quá">🔥</button>
              <button class="party-react-btn text-base hover:scale-130 active:scale-95 transition-transform cursor-pointer p-1" data-emoji="😂" title="Haha">😂</button>
              <button class="party-react-btn text-base hover:scale-130 active:scale-95 transition-transform cursor-pointer p-1" data-emoji="😱" title="Bất ngờ">😱</button>
              <button class="party-react-btn text-base hover:scale-130 active:scale-95 transition-transform cursor-pointer p-1" data-emoji="👏" title="Vỗ tay">👏</button>
            </div>
          </div>

          <!-- Chat Input Bar -->
          <form id="party-chat-form" class="p-2.5 bg-surface-container flex items-center gap-2 border-t border-white/5 shrink-0">
            <input id="party-chat-input" type="text" class="flex-1 px-3 py-2 rounded-xl bg-surface-container-high border border-white/10 text-on-surface placeholder:text-on-surface-variant text-xs focus:outline-none focus:border-secondary-fixed/50 transition-colors" placeholder="Trò chuyện cùng phòng xem..." autocomplete="off" />
            <button type="submit" class="p-2 rounded-xl bg-secondary-fixed text-on-secondary-fixed hover:brightness-110 transition-all cursor-pointer flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[18px]">send</span>
            </button>
          </form>
        </div>
      `;

      // Bind Active Room Event Handlers
      bindActiveRoomEvents();

      // Render initial messages & members
      renderMembersStrip();
      renderChatMessages();
    }

    function bindActiveRoomEvents() {
      // Copy Link
      document.getElementById('btn-copy-party-link')?.addEventListener('click', () => {
        if (!activePartyRoom) return;
        const currentMovie = getActiveMovie();
        const epPart = currentEpisode?.slug || epSlug || '1';
        const shareUrl = `${window.location.origin}/xem-phim/${currentMovie.slug}/${epPart}?party=${activePartyRoom.code}`;
        navigator.clipboard.writeText(shareUrl).then(() => {
          window.showToast?.('📋 Đã sao chép link phòng xem chung! Hãy gửi cho bạn bè.', 'success');
        }).catch(() => {
          window.prompt('Sao chép liên kết phòng xem:', shareUrl);
        });
      });

      // Leave Room
      document.getElementById('btn-leave-party')?.addEventListener('click', async () => {
        if (!activePartyRoom) return;
        if (!confirm('Bạn có chắc muốn rời phòng xem chung?')) return;

        const u = getPartyUser();
        try {
          await API.leavePartyRoom(activePartyRoom.code, u.id);
        } catch(e) {}

        if (sseSource) {
          sseSource.close();
          sseSource = null;
        }
        clearInterval(heartbeatTimer);

        activePartyRoom = null;
        const url = new URL(window.location.href);
        url.searchParams.delete('party');
        window.history.replaceState(null, '', url.toString());

        updateHeaderButtonState(false);
        renderWelcomeView();
        updateEmbedPartyBar();
        window.showToast?.('Đã rời phòng xem chung', 'info');
      });

      // Reaction Buttons
      document.querySelectorAll('.party-react-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!activePartyRoom) return;
          const emoji = btn.dataset.emoji || '❤️';
          const u = getPartyUser();

          // Spawn locally
          spawnFloatingEmoji(emoji, 'Bạn');

          // Send to room
          API.sendPartyReaction(activePartyRoom.code, {
            emoji,
            userName: u.name,
            userId: u.id
          }).catch(() => {});
        });
      });

      // Chat Form Submit
      const chatForm = document.getElementById('party-chat-form');
      const chatInput = document.getElementById('party-chat-input');
      if (chatForm && chatInput) {
        chatForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const text = chatInput.value.trim();
          if (!text || !activePartyRoom) return;

          const u = getPartyUser();
          chatInput.value = '';

          try {
            await API.sendPartyChat(activePartyRoom.code, {
              content: text,
              userName: u.name,
              avatar: u.avatar,
              userId: u.id
            });
          } catch(err) {
            window.showToast('Lỗi gửi tin nhắn', 'error');
          }
        });
      }
    }

    function renderMembersStrip() {
      const container = document.getElementById('party-members-list');
      if (!container || !activePartyRoom) return;
      const members = activePartyRoom.members || [];

      container.innerHTML = members.map(m => `
        <div class="relative group/m shrink-0" title="${m.name} ${m.isHost ? '(Chủ phòng 👑)' : ''}">
          <img class="w-6 h-6 rounded-full object-cover ring-1 ${m.isHost ? 'ring-primary' : 'ring-white/20'}" src="${m.avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuDmV0kJ3rLlFchh-aGILVOr-pQbdtHs2qQKQtkeKftGRHjg2nb7ii3xkFe2aJA7-Gldl5BqHuj4L_uiVmqQyW9CCgKPrUz_MCzKjGtUsI1R3dM0r3vXdhkgOsKaL_SVbs9gl7b2sTWQGr3VphY1X_pUChBkXZ-KPQtC6HeaIV7uxpjuEKEltMKcvR78AOcVjnQlk989xeMDULyOev-eHEjgdEO-N14MVTh2oQR_E3A'}" alt="${m.name}" />
          ${m.isHost ? '<span class="absolute -top-1 -right-1 text-[10px] leading-none">👑</span>' : ''}
          <span class="absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full bg-emerald-500 ring-1 ring-black"></span>
        </div>
      `).join('') + `
        <span class="text-[10px] font-semibold text-on-surface-variant pl-1">${members.length} người</span>
      `;
    }

    function renderChatMessages() {
      const stream = document.getElementById('party-chat-stream');
      if (!stream || !activePartyRoom) return;
      const msgs = activePartyRoom.messages || [];

      stream.innerHTML = '';
      msgs.forEach(msg => appendMessageToChat(msg, false));
      scrollChatToBottom();
    }

    function appendMessageToChat(msg, autoScroll = true) {
      const stream = document.getElementById('party-chat-stream');
      if (!stream || !msg) return;

      const u = getPartyUser();
      const isMe = msg.userId === u.id;

      const el = document.createElement('div');

      if (msg.type === 'system') {
        el.className = 'text-center my-1';
        el.innerHTML = `
          <span class="inline-block px-2.5 py-0.5 rounded-full bg-surface-container-high/80 text-[11px] text-on-surface-variant font-medium">
            ${msg.text}
          </span>
        `;
      } else {
        el.className = `flex gap-2 items-start ${isMe ? 'flex-row-reverse' : ''}`;
        el.innerHTML = `
          <img class="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-white/10 mt-0.5" src="${msg.avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuDmV0kJ3rLlFchh-aGILVOr-pQbdtHs2qQKQtkeKftGRHjg2nb7ii3xkFe2aJA7-Gldl5BqHuj4L_uiVmqQyW9CCgKPrUz_MCzKjGtUsI1R3dM0r3vXdhkgOsKaL_SVbs9gl7b2sTWQGr3VphY1X_pUChBkXZ-KPQtC6HeaIV7uxpjuEKEltMKcvR78AOcVjnQlk989xeMDULyOev-eHEjgdEO-N14MVTh2oQR_E3A'}" alt="${msg.userName}" />
          <div class="flex flex-col max-w-[80%] ${isMe ? 'items-end' : 'items-start'}">
            <div class="flex items-center gap-1.5 text-[10px] text-on-surface-variant mb-0.5">
              <span class="font-bold text-on-surface">${isMe ? 'Bạn' : msg.userName}</span>
              ${msg.isHost ? '<span class="text-primary font-bold">👑 Host</span>' : ''}
              <span class="text-[9px] opacity-75">${msg.time || ''}</span>
            </div>
            <div class="px-3 py-1.5 rounded-2xl text-xs ${isMe ? 'bg-secondary-fixed text-on-secondary-fixed rounded-tr-xs font-medium' : 'bg-surface-container-high text-on-surface rounded-tl-xs'} shadow-sm leading-relaxed break-words">
              ${msg.content || ''}
            </div>
          </div>
        `;
      }

      stream.appendChild(el);
      if (autoScroll) scrollChatToBottom();
    }

    function scrollChatToBottom() {
      const stream = document.getElementById('party-chat-stream');
      if (stream) {
        requestAnimationFrame(() => {
          stream.scrollTop = stream.scrollHeight;
        });
      }
    }

    // --- URL Auto-Detection (?party=CODE) ---
    async function checkUrlPartyCode() {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('party');
      if (!code) return;

      try {
        const res = await API.getPartyRoom(code);
        if (res.status && res.data) {
          const u = getPartyUser();
          openModal('join', code);
          selectTab('party');
        }
      } catch(err) {
        console.warn('[WatchParty] Invalid or expired party code from URL:', code);
      }
    }

    // Public Controller Interface attached to closure
    watchPartyController = {
      isInRoom: () => !!activePartyRoom,
      getRoomCode: () => activePartyRoom ? activePartyRoom.code : '',
      isHost: () => {
        if (!activePartyRoom) return false;
        const u = getPartyUser();
        return activePartyRoom.hostId === u.id;
      },
      canControl: () => {
        if (!activePartyRoom) return true;
        if (activePartyRoom.controlMode === 'free_for_all') return true;
        const u = getPartyUser();
        return activePartyRoom.hostId === u.id;
      },
      isRemoteSync: false,
      openModal: (tab, code) => openModal(tab, code),
      updateMovie: (newMovie, newEp) => {
        if (inputRoomName && (!inputRoomName.value || inputRoomName.value.startsWith('Phòng xem'))) {
          const u = getPartyUser();
          inputRoomName.value = `Phòng xem ${newMovie.name} của ${u.name}`;
        }
        updateEmbedPartyBar();
      },
      updateEmbedBar: () => updateEmbedPartyBar(),
      emitPlayerAction: (action, currentTime) => {
        if (!activePartyRoom || isRemoteSync) return;
        const u = getPartyUser();
        const isHost = activePartyRoom.hostId === u.id;

        if (activePartyRoom.controlMode === 'host_only' && !isHost && action !== 'heartbeat') {
          window.showToast?.('Chỉ Chủ Phòng mới có quyền điều khiển trình phát', 'warning');
          return;
        }

        API.syncPartyPlayer(activePartyRoom.code, {
          action,
          currentTime,
          episodeSlug: currentEpisode?.slug || epSlug || '1',
          episodeName: currentEpisode?.name || epSlug || '1',
          userId: u.id
        }).catch((e) => console.warn('[WatchParty Sync Error]:', e));
      },
      onEpisodeChanged: (ep) => {
        if (!activePartyRoom || isRemoteSync) return;
        const u = getPartyUser();
        API.syncPartyPlayer(activePartyRoom.code, {
          action: 'change_episode',
          currentTime: 0,
          episodeSlug: ep.slug,
          episodeName: ep.name,
          userId: u.id
        }).catch(() => {});
      }
    };

    // Initial check
    checkUrlPartyCode();
  }
});


