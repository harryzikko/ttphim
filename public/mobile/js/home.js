// TTPhim Mobile - Home Page Controller
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const data = await API.getHome();
    if (!data) return;

    // 1. Render Mobile Spotlight Hero Banner
    initMobileSpotlight(data.spotlights || []);

    // 2. Render Continue Watching from localStorage
    renderMobileContinueWatching();

    // 3. Render Latest Updates Rail
    renderMobilePosterRail('m-rail-latest', data.latest || []);

    // 4. Render Top 10 Rankings Reel
    renderMobileTop10Reel(data.rankings || []);

    // 5. Render Cinema Rail
    renderMobilePosterRail('m-rail-cinema', data.cinema || []);

    // 6. Render Series Rail
    renderMobilePosterRail('m-rail-series', data.series || []);

    // 7. Render Anime Rail
    renderMobilePosterRail('m-rail-anime', data.anime || []);

    // 8. Setup Quick Category Pills
    setupQuickPills();

  } catch (err) {
    console.error('[Mobile Home Error]', err);
    if (window.MobileApp) MobileApp.toast('Không thể tải danh sách phim', 'error');
  }
});

// Spotlight Hero Controller with smooth auto-rotate
function initMobileSpotlight(spotlights) {
  if (!spotlights || spotlights.length === 0) return;

  const bg = document.getElementById('m-spotlight-bg');
  const title = document.getElementById('m-spotlight-title');
  const rank = document.getElementById('m-spotlight-rank');
  const badges = document.getElementById('m-spotlight-badges');
  const playBtn = document.getElementById('m-spotlight-play-btn');
  const infoBtn = document.getElementById('m-spotlight-info-btn');
  const watchlistBtn = document.getElementById('m-spotlight-watchlist-btn');
  const watchlistIcon = document.getElementById('m-spotlight-watchlist-icon');
  const watchlistText = document.getElementById('m-spotlight-watchlist-text');
  const progress = document.getElementById('m-spotlight-progress');

  let currentIndex = 0;
  const DURATION = 6500;
  let timer = null;

  function setSlide(idx) {
    currentIndex = idx;
    const movie = spotlights[idx];
    if (!movie) return;

    const bgUrl = movie.thumb_url || movie.poster_url;
    if (bg) {
      bg.style.opacity = '0.35';
      setTimeout(() => {
        bg.style.backgroundImage = `url('${bgUrl}')`;
        bg.style.opacity = '1';
      }, 150);
    }

    if (title) title.innerText = movie.name;
    if (rank) {
      rank.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-primary-container animate-pulse shadow-[0_0_8px_rgba(229,9,20,0.8)]"></span>
        <span class="font-label-badge text-[11px] text-primary-fixed tracking-wide uppercase font-bold">#${idx + 1} Phim Nổi Bật</span>
      `;
    }

    if (badges) {
      badges.innerHTML = `
        <span class="px-2 py-0.5 rounded-sm bg-surface-container-highest/80 font-label-badge text-[10px] text-secondary font-bold">${movie.quality || '4K HDR'}</span>
        <span class="px-2 py-0.5 rounded-sm bg-surface-container-highest/80 font-label-badge text-[10px] text-on-surface font-semibold">${movie.chieurap ? 'Chiếu Rạp' : 'T16'}</span>
        <span class="px-2 py-0.5 rounded-sm bg-surface-container-highest/80 font-label-badge text-[10px] text-tertiary-fixed font-semibold">${movie.lang || 'Vietsub'}</span>
        ${movie.episode_current ? `<span class="px-2 py-0.5 rounded-sm bg-surface-container-highest/80 font-label-badge text-[10px] text-on-surface-variant">${movie.episode_current}</span>` : ''}
      `;
    }

    if (playBtn) playBtn.href = `/mobile/xem-phim/${movie.slug}/${movie.first_episode_slug || 'tap-1'}`;
    if (infoBtn) infoBtn.href = `/mobile/phim/${movie.slug}`;

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
          watchlistText.innerText = 'Đã Lưu';
          watchlistBtn.classList.add('text-secondary-fixed');
          MobileApp.toast(`Đã lưu "${movie.name}" vào danh sách!`, 'success');
        } else {
          watchlistIcon.innerText = 'bookmark_add';
          watchlistText.innerText = 'Danh Sách';
          watchlistBtn.classList.remove('text-secondary-fixed');
          MobileApp.toast(`Đã bỏ lưu "${movie.name}"`, 'info');
        }
      };
    }

    // Reset progress bar
    if (progress) {
      progress.style.transition = 'none';
      progress.style.width = '0%';
      void progress.offsetWidth;
      progress.style.transition = `width ${DURATION}ms linear`;
      progress.style.width = '100%';
    }
  }

  setSlide(0);

  if (spotlights.length > 1) {
    clearInterval(timer);
    timer = setInterval(() => {
      currentIndex = (currentIndex + 1) % spotlights.length;
      setSlide(currentIndex);
    }, DURATION);
  }
}

// 2:3 Vertical Poster Rail Renderer
function renderMobilePosterRail(containerId, list) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!list || list.length === 0) {
    container.innerHTML = '<p class="text-xs text-on-surface-variant py-2">Đang cập nhật danh sách phim...</p>';
    return;
  }

  container.innerHTML = list.slice(0, 15).map((m) => `
    <a href="/mobile/phim/${m.slug}" class="shrink-0 w-28 sm:w-32 flex flex-col group touch-feedback cursor-pointer">
      <div class="relative w-full aspect-[2/3] rounded-xl overflow-hidden bg-surface-container shadow-md">
        <img src="${m.poster_url || m.thumb_url}" alt="${m.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
        <div class="absolute inset-0 bg-gradient-to-t from-surface-container-lowest/80 via-transparent to-transparent"></div>
        
        <!-- Top Status Tags -->
        ${m.episode_current ? `
          <div class="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-sm bg-primary-container text-white font-label-badge text-[9px] font-bold uppercase shadow-sm">
            ${m.episode_current}
          </div>
        ` : ''}

        <div class="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm bg-black/70 backdrop-blur-sm text-amber-400 font-label-badge text-[10px] font-bold">
          <span class="material-symbols-outlined text-[11px]" style="font-variation-settings: 'FILL' 1;">star</span>
          <span>${m.rating || '9.0'}</span>
        </div>

        <div class="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between">
          <span class="px-1 py-0.5 rounded bg-black/60 backdrop-blur-sm font-label-badge text-[9px] text-white">${m.lang || 'Vietsub'}</span>
          <span class="px-1 py-0.5 rounded bg-black/60 backdrop-blur-sm font-label-badge text-[9px] text-secondary font-bold">${m.quality || 'HD'}</span>
        </div>
      </div>
      <h3 class="font-label-md text-[12px] font-bold text-on-surface truncate mt-1.5 leading-snug">${m.name}</h3>
      <p class="font-body-sm text-[11px] text-on-surface-variant truncate">${m.origin_name || m.year || ''}</p>
    </a>
  `).join('');
}

// Top 10 Ranked Reel Renderer
function renderMobileTop10Reel(list) {
  const container = document.getElementById('m-rail-top10');
  if (!container) return;

  if (!list || list.length === 0) {
    container.innerHTML = '<p class="text-xs text-on-surface-variant py-2">Đang tải bảng xếp hạng...</p>';
    return;
  }

  container.innerHTML = list.slice(0, 10).map((m, idx) => `
    <a href="/mobile/phim/${m.slug}" class="shrink-0 flex items-end relative group touch-feedback cursor-pointer pr-3">
      <!-- Outsized Typography Rank Number -->
      <span class="font-display-hero-mobile text-[88px] font-black leading-none text-surface-container-highest/60 -mr-4 z-0 tracking-tighter select-none font-headline-lg">
        ${idx + 1}
      </span>
      <div class="relative w-28 aspect-[2/3] rounded-xl overflow-hidden bg-surface-container shadow-xl z-10 border border-white/10">
        <img src="${m.poster_url || m.thumb_url}" alt="${m.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
        <div class="absolute inset-0 bg-gradient-to-t from-surface-container-lowest/80 via-transparent to-transparent"></div>
        <span class="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-primary-container text-white font-label-badge text-[10px] font-bold">TOP ${idx + 1}</span>
      </div>
    </a>
  `).join('');
}

// Continue Watching Rail from localStorage
function renderMobileContinueWatching() {
  const section = document.getElementById('m-section-continue');
  const container = document.getElementById('m-rail-continue');
  if (!section || !container) return;

  try {
    const list = JSON.parse(localStorage.getItem('TTPhim_continue_watching') || '[]');
    if (!list || list.length === 0) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    container.innerHTML = list.slice(0, 10).map((item) => `
      <div class="shrink-0 w-60 rounded-xl overflow-hidden bg-surface-container shadow-md flex flex-col group touch-feedback">
        <a href="/mobile/xem-phim/${item.slug}/${item.episode || 'tap-1'}" class="relative w-full h-32 bg-surface-container-highest overflow-hidden block">
          <img src="${item.thumb || item.poster || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500'}" alt="${item.name}" class="w-full h-full object-cover" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
          
          <!-- Center Play Button -->
          <div class="absolute inset-0 m-auto w-9 h-9 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white shadow-lg">
            <span class="material-symbols-outlined text-[20px]" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
          </div>

          <div class="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm font-label-badge text-[10px] text-white">
            ${item.episodeTitle || 'Tập 1'}
          </div>

          <!-- Progress Bar -->
          <div class="absolute bottom-0 inset-x-0 h-1 bg-surface-bright/50">
            <div class="h-full bg-primary-container" style="width: ${item.percent || 45}%;"></div>
          </div>
        </a>
        <div class="p-2.5 flex items-center justify-between">
          <div class="min-w-0 pr-1">
            <h3 class="font-label-md text-[12px] font-bold text-on-surface truncate">${item.name}</h3>
            <p class="font-body-sm text-[10px] text-on-surface-variant truncate">${item.episodeTitle || 'Đang xem dở'}</p>
          </div>
          <a href="/mobile/phim/${item.slug}" class="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:text-white shrink-0">
            <span class="material-symbols-outlined text-[16px]">info</span>
          </a>
        </div>
      </div>
    `).join('');
  } catch (e) {
    section.classList.add('hidden');
  }
}

// Quick Category Filter Pills Handler
function setupQuickPills() {
  const pills = document.querySelectorAll('.m-pill');
  pills.forEach((btn) => {
    btn.onclick = () => {
      const type = btn.getAttribute('data-type');
      if (type === 'all') {
        window.location.href = '/mobile/kham-pha';
      } else {
        window.location.href = `/mobile/kham-pha?type=${type}`;
      }
    };
  });
}

