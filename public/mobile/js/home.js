// TTPhim Mobile - Home Page Controller
document.addEventListener('DOMContentLoaded', async () => {
  renderMobileContinueWatching();
  try {
    const data = await API.getHome();
    if (!data) return;

    // 1. Render Mobile Spotlight Hero Banner
    initMobileSpotlight(data.spotlights || []);

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
  if (!spotlights || spotlights.length === 0) {
    const section = document.getElementById('m-spotlight-section');
    if (section) section.hidden = true;
    return;
  }
  const section = document.getElementById('m-spotlight-section');
  if (section) section.hidden = false;
  section?.setAttribute('aria-roledescription', 'carousel');
  section?.setAttribute('aria-label', 'Phim nổi bật');
  const previous = document.getElementById('m-hero-prev');
  const next = document.getElementById('m-hero-next');
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  const bg = document.getElementById('m-spotlight-bg');
  const title = document.getElementById('m-spotlight-title');
  const rank = document.getElementById('m-spotlight-rank');
  const badges = document.getElementById('m-spotlight-badges');
  const playBtn = document.getElementById('m-spotlight-play-btn');
  const infoBtn = document.getElementById('m-spotlight-info-btn');
  const watchlistBtn = document.getElementById('m-spotlight-watchlist-btn');
  const setFavorite = window.HeroActions.favorite(watchlistBtn, (message, type) => window.MobileApp?.toast(message, type));
  const progress = document.getElementById('m-spotlight-progress');

  let currentIndex = 0;
  const DURATION = 8000;
  let timer = null;

  function setSlide(idx) {
    currentIndex = idx;
    const movie = spotlights[idx];
    if (!movie) return;

    window.HeroArtwork.setBackdrop(bg, movie, true);

    if (title) { title.innerText = movie.banner_title || movie.name; title.title = movie.banner_title || movie.name; }
    if (rank) {
      rank.textContent = 'Phim nổi bật';
    }

    if (badges) {
      badges.replaceChildren();
      [movie.quality, movie.year, movie.has_song_ngu ? 'Song Ngữ' : movie.lang, movie.episode_current].map(window.HeroArtwork.cleanMeta).filter(Boolean).forEach(value => {
        const badge = document.createElement('span');
        badge.className = 'px-2 py-0.5 rounded-sm bg-surface-container-highest/80 font-label-badge text-[10px] text-on-surface font-semibold';
        badge.textContent = value; badges.appendChild(badge);
      });
    }

    if (playBtn) {
      playBtn.href = `/mobile/xem-phim/${movie.slug}/${movie.first_episode_slug || 'tap-1'}`;
      const label = playBtn.querySelector('span:last-child');
      if (label) label.textContent = movie.cta_label || 'Xem ngay';
    }
    if (infoBtn) infoBtn.href = `/mobile/phim/${movie.slug}`;

    setFavorite(movie);

    // Reset progress bar
    if (progress && spotlights.length > 1 && !reducedMotion?.matches) {
      progress.style.transition = 'none';
      progress.style.width = '0%';
      void progress.offsetWidth;
      progress.style.transition = `width ${DURATION}ms linear`;
      progress.style.width = '100%';
    }
  }

  const controls = [previous, next].filter(Boolean);
  controls.forEach(control => { control.disabled = spotlights.length < 2; });
  if (progress) progress.parentElement.hidden = spotlights.length < 2 || !!reducedMotion?.matches;
  const stop = () => {
    clearInterval(timer);
    timer = null;
    if (progress) { progress.style.transition = 'none'; progress.style.width = '0%'; }
  };
  const start = () => {
    stop();
    if (spotlights.length < 2 || document.hidden || reducedMotion?.matches || section?.matches(':focus-within')) return;
    timer = setInterval(() => setSlide((currentIndex + 1) % spotlights.length), DURATION);
    if (progress) {
      void progress.offsetWidth;
      progress.style.transition = `width ${DURATION}ms linear`;
      progress.style.width = '100%';
    }
  };
  if (previous) previous.onclick = () => { setSlide((currentIndex - 1 + spotlights.length) % spotlights.length); start(); };
  if (next) next.onclick = () => { setSlide((currentIndex + 1) % spotlights.length); start(); };
  section?.addEventListener('focusin', stop);
  section?.addEventListener('focusout', () => setTimeout(start, 0));
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  section?.addEventListener('keydown', event => {
    if (event.target.matches('input, textarea, select') || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    setSlide((currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + spotlights.length) % spotlights.length);
    start();
  });
  reducedMotion?.addEventListener?.('change', () => {
    if (progress) progress.parentElement.hidden = spotlights.length < 2 || reducedMotion.matches;
    start();
  });
  setSlide(0);
  start();
  window.addEventListener('pagehide', stop);
}

// 2:3 Vertical Poster Rail Renderer
function renderMobilePosterRail(containerId, list) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!list || list.length === 0) {
    container.innerHTML = '<p class="text-xs text-on-surface-variant py-2">Đang cập nhật danh sách phim...</p>';
    return;
  }

  container.classList.add('mobile-poster-rail');
  container.replaceChildren();
  list.slice(0, 15).forEach(movie => {
    const card = document.createElement('a');
    card.href = `/mobile/phim/${encodeURIComponent(movie.slug)}`;
    card.className = 'mobile-poster-card shrink-0 flex flex-col group touch-feedback cursor-pointer';
    const artwork = document.createElement('div');
    artwork.className = 'relative w-full aspect-[2/3] rounded-lg overflow-hidden bg-surface-container';
    const image = document.createElement('img');
    image.src = movie.poster_url || movie.thumb_url || '/favicon.svg';
    image.alt = movie.name || ''; image.loading = 'lazy'; image.decoding = 'async';
    image.className = 'w-full h-full object-cover';
    artwork.appendChild(image);
    const episode = window.HeroArtwork.cleanMeta(movie.episode_current);
    if (episode) {
      const badge = document.createElement('span');
      badge.className = 'absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/80 text-white text-[10px]';
      badge.textContent = episode; artwork.appendChild(badge);
    }
    const title = document.createElement('h3');
    title.className = 'font-label-md font-bold text-on-surface truncate';
    title.textContent = movie.name || ''; title.title = movie.name || '';
    const subtitle = document.createElement('p');
    subtitle.className = 'text-[11px] text-on-surface-variant truncate';
    subtitle.textContent = [movie.year, movie.has_song_ngu ? 'Song Ngữ' : movie.lang].map(window.HeroArtwork.cleanMeta).filter(Boolean).join(' · ');
    card.append(artwork, title, subtitle); container.appendChild(card);
  });
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

// Use the same account/guest progress source as the desktop home and player.
function renderMobileContinueWatching() {
  const section = document.getElementById('m-section-continue');
  const manage = section?.querySelector('button[onclick*="TTPHIM_continue_watching"], [data-history-manage]');
  if (manage) {
    const link = document.createElement('a');
    link.className = manage.className;
    link.dataset.historyManage = '';
    link.href = '/mobile/danh-sach?tab=history';
    link.textContent = 'Quản lý lịch sử';
    manage.replaceWith(link);
  }
  return window.ContinueWatching?.mount({
    section: document.getElementById('m-section-continue'),
    rail: document.getElementById('m-rail-continue'),
    mobile: true
  });
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

