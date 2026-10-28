// CineViet - Home Page Controller (Real API Data Binding)
function formatEpBadge(epName) {
  if (!epName) return 'Tập 01';
  const str = String(epName).trim();
  if (/^full$/i.test(str)) return 'Full';
  if (/^trọn bộ$/i.test(str)) return 'Trọn Bộ';
  const numMatch = str.match(/\d+/);
  if (numMatch) {
    const num = parseInt(numMatch[0], 10);
    const padded = num < 10 ? `0${num}` : `${num}`;
    return `Tập ${padded}`;
  }
  if (/^tập/i.test(str)) return str;
  return `Tập ${str}`;
}

function formatLangBadge(lang) {
  if (!lang) return '';
  let s = String(lang).trim();
  if (/vietsub\s*(\+|\/|\&|,)\s*thuyết minh/i.test(s)) return 'Vietsub • TM';
  if (/thuyết minh/i.test(s)) return 'Thuyết Minh';
  if (/lồng tiếng/i.test(s)) return 'Lồng Tiếng';
  if (/song ngữ/i.test(s)) return 'Song Ngữ';
  return s;
}

document.addEventListener('DOMContentLoaded', async () => {
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const pathSegment = value => encodeURIComponent(String(value ?? '')).replace(/'/g, '%27');
  const safeImageUrl = value => {
    try { const url = new URL(value, window.location.href); return /^https?:$/.test(url.protocol) ? url.href : '/favicon.svg'; }
    catch (_) { return '/favicon.svg'; }
  };
  console.log('[CineViet] Initializing Home Page with live API data...');

  // Initialize interactive quick genre navigation pills immediately
  initQuickGenreBar();
  renderSection1ContinueWatching();

  try {
    const homeData = await API.getHome();
    if (!homeData) {
      console.error('[CineViet] Empty homeData returned');
      return;
    }

    console.log('[CineViet] Home data loaded successfully:', {
      spotlights: homeData.spotlights?.length,
      latest: homeData.latest?.length,
      cinema: homeData.cinema?.length,
      series: homeData.series?.length,
      rankings: homeData.rankings?.length
    });

    renderHeroSpotlight(homeData.spotlights || []);
    renderSection2Latest(homeData.latest || []);

    // Rail 1: Phim Chiếu Rạp Bom Tấn
    renderSectionRail('rail-chieu-rap', homeData.cinema, 'chieurap');
    wireScrollButtons('btn-chieurap-prev', 'btn-chieurap-next', 'rail-chieu-rap');

    // Rail 2: Phim Bộ Đang Thịnh Hành
    renderSectionRail('rail-phim-bo', homeData.series, 'series');
    wireScrollButtons('btn-phimbo-prev', 'btn-phimbo-next', 'rail-phim-bo');

    // Rail 3: Top 10 Thịnh Hành Hôm Nay
    renderSection4Top10(homeData.rankings || []);

    // Rail 4: Phim Lẻ Đặc Sắc Tuyển Chọn
    renderSectionRail('rail-phim-le', homeData.singles, 'default');
    wireScrollButtons('btn-phimle-prev', 'btn-phimle-next', 'rail-phim-le');

    // Rail 5: TV Shows & Gameshow Giải Trí
    renderSectionRail('rail-tv-shows', homeData.tvshows, 'tvshows');
    wireScrollButtons('btn-tvshows-prev', 'btn-tvshows-next', 'rail-tv-shows');

    // Rail 6: Thế Giới Anime & Hoạt Hình
    renderSectionRail('rail-anime', homeData.anime, 'anime');
    wireScrollButtons('btn-anime-prev', 'btn-anime-next', 'rail-anime');

    renderSection3Categories(homeData);

  } catch (err) {
    console.error('[CineViet] Failed to load home data:', err);
    if (window.showToast) window.showToast('Lỗi tải dữ liệu phim từ KKPhim API', 'error');
  }

  // --- 1. HERO SPOTLIGHT ---
  function renderHeroSpotlight(rawSpotlights) {
    const spotlights = (rawSpotlights || []).slice(0, 10);
    if (!spotlights.length) { document.getElementById('home-hero')?.setAttribute('hidden', ''); return; }
    const heroSection = document.getElementById('home-hero');
    if (!heroSection) return;
    heroSection.hidden = false;

    const timerBar = document.getElementById('spotlight-timer-bar');
    const prevBtn = document.getElementById('hero-prev-btn');
    const nextBtn = document.getElementById('hero-next-btn');
    const dotsContainer = document.getElementById('hero-slide-dots');
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    heroSection.setAttribute('aria-roledescription', 'carousel');
    heroSection.setAttribute('aria-label', 'Phim nổi bật');


    // When movies ARE pinned: ensure controls visibility
    if (spotlights.length === 1) {
      if (timerBar) timerBar.style.display = 'none';
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'none';
      if (dotsContainer) dotsContainer.innerHTML = '';
    } else {
      if (timerBar) timerBar.style.display = '';
      if (prevBtn) prevBtn.style.display = '';
      if (nextBtn) nextBtn.style.display = '';
    }

    let currentIndex = 0;

    // Contain-fit image layers crossfade without zooming or cropping.
    const layer1 = document.getElementById('hero-bg-layer-1');
    const layer2 = document.getElementById('hero-bg-layer-2');
    let activeBgSlot = 1;

    const heroTitle = heroSection.querySelector('h1.font-display-hero') || heroSection.querySelector('h1');
    const heroSubTitle = heroSection.querySelector('p.font-headline-sm');
    const heroExcerpt = heroSection.querySelector('p.font-body-lg');
    const heroRating = heroSection.querySelector('span.font-label-lg');
    const heroMetaSpans = heroSection.querySelectorAll('div.flex.flex-wrap.items-center.gap-space-sm span.px-2.py-0\\.5');
    const heroGenres = heroSection.querySelector('div.flex.items-center.gap-2.text-on-surface-variant');
    const playBtn = heroSection.querySelector('a.bg-primary-container:has(.material-symbols-outlined)') || heroSection.querySelector('a.bg-primary-container');
    const infoBtn = heroSection.querySelector('button[title="Thông tin chi tiết"]');
    const bookmarkBtn = document.getElementById('hero-favorite-btn');
    const setFavorite = window.HeroActions.favorite(bookmarkBtn);
    const indicatorRail = document.getElementById('spotlight-poster-rail');
    const heroPosterImg = document.getElementById('hero-poster-img');
    const heroPosterCard = document.getElementById('hero-poster-card');
    const heroPosterRank = document.getElementById('hero-poster-rank-badge');

    const SLIDE_DURATION = 7500; // 7.5s per slide

    function updateSlide(index) {
      try {
        currentIndex = index;
        const movie = spotlights[index];
        if (!movie) return;

        if (layer1 && layer2) {
          const nextLayer = activeBgSlot === 1 ? layer2 : layer1;
          const previousLayer = activeBgSlot === 1 ? layer1 : layer2;
          window.HeroArtwork.setBackdrop(nextLayer, movie, false);
          nextLayer.className = 'hero-bg-layer active';
          nextLayer.setAttribute('aria-hidden', 'false');
          previousLayer.className = 'hero-bg-layer prev';
          previousLayer.setAttribute('aria-hidden', 'true');
          activeBgSlot = activeBgSlot === 1 ? 2 : 1;
        }

        // 4. Update texts and badges
        if (heroTitle) {
          heroTitle.textContent = movie.banner_title || movie.name;
          heroTitle.title = movie.banner_title || movie.name;
        }
        if (heroSubTitle) {
          heroSubTitle.innerText = [movie.origin_name, movie.year].map(window.HeroArtwork.cleanMeta).filter(Boolean).join(' · ');
        }
        if (heroExcerpt) {
          const text = new DOMParser().parseFromString(movie.banner_description || movie.content || '', 'text/html');
          heroExcerpt.textContent = text.body.textContent || '';
        }
        if (heroRating) {
          heroRating.parentElement.style.display = 'none';
        }
        if (heroMetaSpans && heroMetaSpans.length >= 3) {
          const metadata = [movie.quality, movie.episode_current || (movie.chieurap ? 'Chiếu Rạp' : ''), movie.time].map(window.HeroArtwork.cleanMeta);
          metadata.forEach((value, index) => { heroMetaSpans[index].textContent = value; heroMetaSpans[index].hidden = !value; });
          if (heroMetaSpans.length >= 4) {
            if (movie.has_song_ngu) {
              heroMetaSpans[3].className = 'px-2 py-0.5 rounded bg-secondary-container/20 text-secondary font-label-badge text-label-badge flex items-center gap-1';
              heroMetaSpans[3].innerHTML = '<span class="material-symbols-outlined text-[13px]">record_voice_over</span> Song Ngữ';
              heroMetaSpans[3].hidden = false;
            } else {
              heroMetaSpans[3].className = 'px-2 py-0.5 rounded bg-secondary-container/20 text-secondary font-label-badge text-label-badge flex items-center gap-1';
              const lang = window.HeroArtwork.cleanMeta(movie.lang);
              heroMetaSpans[3].replaceChildren();
              if (lang) {
                const icon = document.createElement('span'); icon.className = 'material-symbols-outlined text-[13px]'; icon.textContent = 'translate';
                heroMetaSpans[3].append(icon, document.createTextNode(` ${lang}`));
              }
              heroMetaSpans[3].hidden = !lang;
            }
          }
        }
        if (heroGenres && movie.category) {
          const catArray = Array.isArray(movie.category) ? movie.category : [];
          heroGenres.innerHTML = catArray.slice(0, 3).map(c => `
            <span class="px-2 py-1 rounded bg-surface-container-low">${typeof c === 'string' ? c : c.name}</span>
          `).join(' <span>•</span> ');
        }
        if (playBtn) {
          playBtn.href = `/xem-phim/${movie.slug}/${movie.first_episode_slug || 'tap-1'}`;
          const playLabel = playBtn.querySelector('span:last-child');
          if (playLabel) playLabel.innerText = movie.cta_label || 'Xem ngay';
        }
        if (infoBtn) {
          infoBtn.onclick = () => window.location.href = `/phim/${movie.slug}`;
        }
        setFavorite(movie);

        // Hero poster uses the high-resolution selection; rails stay unchanged.
        window.HeroArtwork.setPoster(heroPosterImg, movie);
        if (heroPosterCard) {
          heroPosterCard.href = `/xem-phim/${movie.slug}/${movie.first_episode_slug || 'tap-1'}`;
        }
        if (heroPosterRank) {
          heroPosterRank.textContent = 'Phim nổi bật';
        }

        // 5. Update slide indicator dots under large poster
        if (dotsContainer) {
          dotsContainer.innerHTML = spotlights.map((_, idx) => `
            <button class="h-1.5 rounded-full ${idx === index ? 'w-6 bg-primary-container' : 'w-2 bg-white/30 hover:bg-white/60'} cursor-pointer" data-index="${idx}" aria-label="Chuyển đến phim ${idx + 1}" aria-current="${idx === index ? 'true' : 'false'}" type="button"></button>
          `).join('');

          dotsContainer.querySelectorAll('button').forEach((btn, idx) => {
            btn.onclick = (e) => {
              e.preventDefault();
              updateSlide(idx);
              dotsContainer.querySelectorAll('button')[idx]?.focus();
            };
          });
        }

        if (indicatorRail) {
          const cards = indicatorRail.querySelectorAll('.spotlight-thumb-btn');
          cards.forEach((card, i) => {
            const dot = card.querySelector('.spotlight-thumb-dot');
            card.setAttribute('aria-pressed', String(i === index));
            if (i === index) {
              card.classList.add('active-thumb', 'ring-2', 'ring-primary-container', 'scale-105', 'shadow-[0_0_20px_rgba(229,9,20,0.55)]');
              card.classList.remove('opacity-60', 'ring-1', 'ring-white/10');
              card.classList.add('opacity-100');
              if (dot) dot.classList.remove('hidden');
              const scrollTarget = card.offsetLeft - (indicatorRail.clientWidth / 2) + (card.clientWidth / 2);
              indicatorRail.scrollTo({ left: scrollTarget, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
            } else {
              card.classList.remove('active-thumb', 'ring-2', 'ring-primary-container', 'scale-105', 'shadow-[0_0_20px_rgba(229,9,20,0.55)]');
              card.classList.add('opacity-60', 'ring-1', 'ring-white/10');
              card.classList.remove('opacity-100');
              if (dot) dot.classList.add('hidden');
            }
          });
        }

        // Reset the progress animation for the active film.
        startTimerBar();
      } catch (slideErr) {
        console.error('[Spotlight Slide Error]', slideErr);
      }
    }

    let isPaused = !!reducedMotion?.matches;

    function startTimerBar() {
      if (!timerBar) return;
      timerBar.style.transition = 'none';
      timerBar.style.width = '';
      timerBar.classList.remove('running', 'paused');
      void timerBar.offsetWidth; // Reflow to reset CSS keyframe animation
      timerBar.classList.add('running');
      if (reducedMotion?.matches) timerBar.hidden = true;
      if (isPaused) {
        timerBar.classList.add('paused');
      }
    }

    function pauseCountdown() {
      isPaused = true;
      if (timerBar) {
        timerBar.classList.add('paused');
      }
    }

    function resumeCountdown() {
      if (document.hidden || heroSection.matches(':focus-within') || heroSection.matches(':hover') || reducedMotion?.matches) return;
      isPaused = false;
      if (timerBar) {
        timerBar.classList.remove('paused');
      }
    }
    heroSection.addEventListener('focusin', pauseCountdown);
    heroSection.addEventListener('focusout', () => setTimeout(resumeCountdown, 0));
    document.addEventListener('visibilitychange', () => document.hidden ? pauseCountdown() : resumeCountdown());
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) pauseCountdown();
    heroSection.addEventListener('mouseenter', pauseCountdown);
    heroSection.addEventListener('mouseleave', resumeCountdown);
    reducedMotion?.addEventListener?.('change', () => reducedMotion.matches ? pauseCountdown() : resumeCountdown());
    heroSection.addEventListener('keydown', event => {
      if (event.target.matches('input, textarea, select') || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      updateSlide((currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + spotlights.length) % spotlights.length);
    });

    // Automatically transition to next slide when countdown animation finishes
    if (timerBar) {
      timerBar.addEventListener('animationend', () => {
        if (!isPaused && spotlights.length > 1) {
          currentIndex = (currentIndex + 1) % spotlights.length;
          updateSlide(currentIndex);
        }
      });
    }

    // Prev / Next button listeners
    if (prevBtn) {
      prevBtn.onclick = (e) => {
        e.preventDefault();
        currentIndex = (currentIndex - 1 + spotlights.length) % spotlights.length;
        updateSlide(currentIndex);
      };
    }
    if (nextBtn) {
      nextBtn.onclick = (e) => {
        e.preventDefault();
        currentIndex = (currentIndex + 1) % spotlights.length;
        updateSlide(currentIndex);
      };
    }

    // Render poster thumbnails into rail if element exists
    if (indicatorRail) {
      indicatorRail.innerHTML = spotlights.map((m, idx) => `
        <button type="button" aria-label="Chuyển đến phim ${idx + 1}" aria-pressed="${idx === 0}" class="spotlight-thumb-btn ${idx === 0 ? 'active-thumb ring-2 ring-primary-container opacity-100' : 'ring-1 ring-white/10 opacity-60 hover:opacity-100'} relative w-[70px] sm:w-[78px] md:w-[86px] rounded-xl bg-surface-container-high shrink-0 cursor-pointer text-left select-none" data-index="${idx}">
          <img alt="" class="w-full aspect-[2/3] object-contain" loading="lazy" />
          <span class="spotlight-thumb-dot hidden"></span>
        </button>
      `).join('');

      indicatorRail.querySelectorAll('.spotlight-thumb-btn').forEach((card, idx) => {
        window.HeroArtwork.setPoster(card.querySelector('img'), spotlights[idx]);
        card.addEventListener('click', (e) => {
          e.preventDefault();
          updateSlide(idx);
        });
      });

      enableDragScroll(indicatorRail);
    }

    // Initialize first slide
    updateSlide(0);

    // Pause countdown when hovering directly over interactive elements (poster card, action buttons, controls)
    const interactiveDeck = [
      document.getElementById('hero-poster-deck'),
      document.getElementById('hero-action-deck'),
      document.getElementById('hero-poster-card'),
      document.getElementById('hero-play-btn'),
      prevBtn,
      nextBtn,
      dotsContainer,
      timerBar
    ].filter(Boolean);

    interactiveDeck.forEach(el => {
      el.addEventListener('mouseenter', pauseCountdown);
      el.addEventListener('mouseleave', resumeCountdown);
    });
  }


  // --- 2. SECTION 1: TIẾP TỤC XEM (CONTINUE WATCHING) ---
  async function renderSection1ContinueWatching() {
    const section = document.getElementById('section-continue-watching');
    const rail = document.getElementById('rail-continue-watching');
    if (!section || !rail) return;
    const manageLink = document.getElementById('btn-manage-history');
    if (manageLink) manageLink.href = '/danh-sach?tab=continue';
    await window.ContinueWatching?.mount({ section, rail });
    wireScrollButtons('btn-continue-prev', 'btn-continue-next', 'rail-continue-watching', 320);
  }

  // --- 3. SECTION 2: MỚI CẬP NHẬT HÔM NAY (LATEST MOVIES) ---
  function renderSection2Latest(latestMovies) {
    const sec = document.getElementById('section-moi-cap-nhat');
    if (!sec) return;

    const grid = sec.querySelector('div.grid');
    if (!grid || latestMovies.length === 0) return;

    // Show 12 cards (2 rows of 6)
    const displayList = latestMovies.slice(0, 12);

    grid.innerHTML = displayList.map(movie => `
      <div class="movie-card group relative rounded-xl overflow-hidden bg-surface-container flex flex-col cursor-pointer border border-white/5" onclick="window.location.href='/phim/${movie.slug}'">
        <div class="relative w-full aspect-[2/3] overflow-hidden bg-surface-container-high">
          <img src="${movie.poster_url || movie.thumb_url}" alt="${movie.name}" loading="lazy" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-108" />
          
          <!-- Badges -->
          <div class="absolute top-2 left-2 flex flex-col gap-1 z-10 items-start pointer-events-none">
            ${movie.has_song_ngu ? `
              <span class="badge-song-ngu">
                <span class="material-symbols-outlined">record_voice_over</span>Song Ngữ
              </span>` : ''}
            ${movie.lang ? `<span class="badge-glass-sub">${formatLangBadge(movie.lang)}</span>` : ''}
          </div>
          <div class="absolute top-2 right-2 z-10 pointer-events-none">
            <span class="badge-glass-quality">${escapeHtml(movie.quality || 'FHD')}</span>
          </div>

          <!-- Hover Overlay Details (Cinematic Frosted Backdrop) -->
          <div class="absolute inset-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent p-3.5 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-all duration-300 z-10">
            <p class="font-body-sm text-[12px] text-white/90 line-clamp-3 mb-3 leading-relaxed drop-shadow">${movie.content || movie.name}</p>
            <div class="flex items-center gap-2">
              <a href="/xem-phim/${movie.slug}" class="movie-card-play-btn flex-1 py-2 rounded-xl bg-primary-container text-on-primary-container font-label-badge text-[11px] font-bold text-center hover:bg-inverse-primary transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-primary-container/50">
                <span class="material-symbols-outlined text-[16px]" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
                <span>Xem Ngay</span>
              </a>
              <button class="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-sm cursor-pointer" title="Chi tiết phim" onclick="event.stopPropagation(); window.location.href='/phim/${movie.slug}'">
                <span class="material-symbols-outlined text-[18px]">info</span>
              </button>
            </div>
          </div>
        </div>

        <div class="p-3 flex flex-col gap-1">
          <h3 class="font-label-md text-label-md text-on-surface font-bold truncate group-hover:text-primary transition-colors">${movie.name}</h3>
          <div class="flex items-center justify-between text-on-surface-variant font-body-sm text-[12px]">
            <span class="text-amber-400 font-semibold truncate max-w-[110px]">${movie.episode_current || movie.time || 'Trọn Bộ'}</span>
            <span class="text-on-surface-variant/80">${movie.year}</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  // --- 4. SECTION 3: KHÁM PHÁ THEO KHU VỰC & THỂ LOẠI ---
  function renderSection3Categories(homeData) {
    const sec = document.getElementById('section-kham-pha-khu-vuc-the-loai');
    if (!sec) return;

    // Setup Tab Switcher listeners
    const tabBtnRegion = document.getElementById('tab-btn-explore-region');
    const tabBtnGenre = document.getElementById('tab-btn-explore-genre');
    const panelRegion = document.getElementById('tab-panel-region');
    const panelGenre = document.getElementById('tab-panel-genre');

    if (tabBtnRegion && tabBtnGenre && panelRegion && panelGenre) {
      tabBtnRegion.onclick = () => {
        tabBtnRegion.className = 'flex items-center gap-1.5 px-4 py-1.5 rounded-full font-label-md text-label-md bg-primary-container text-on-primary-container font-bold shadow-md transition-all cursor-pointer';
        tabBtnGenre.className = 'flex items-center gap-1.5 px-4 py-1.5 rounded-full font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-all cursor-pointer';
        panelRegion.classList.remove('hidden');
        panelGenre.classList.add('hidden');
      };

      tabBtnGenre.onclick = () => {
        tabBtnGenre.className = 'flex items-center gap-1.5 px-4 py-1.5 rounded-full font-label-md text-label-md bg-primary-container text-on-primary-container font-bold shadow-md transition-all cursor-pointer';
        tabBtnRegion.className = 'flex items-center gap-1.5 px-4 py-1.5 rounded-full font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-all cursor-pointer';
        panelGenre.classList.remove('hidden');
        panelRegion.classList.add('hidden');
      };
    }
  }

  // --- 5. SECTION 4: TOP 10 THỊNH HÀNH HÔM NAY ---
  function renderSection4Top10(rankings) {
    const sec = document.getElementById('bang-xep-hang');
    if (!sec) return;

    const rail = sec.querySelector('#top10-rail') || sec.querySelector('div.flex.overflow-x-auto') || sec.querySelector('div.grid');
    if (!rail || rankings.length === 0) return;

    const top10 = rankings.slice(0, 10);

    rail.className = 'flex overflow-x-auto gap-5 sm:gap-7 pb-6 pt-3 no-scrollbar scroll-smooth pl-2';
    rail.id = 'top10-rail';

    rail.innerHTML = top10.map((movie, idx) => {
      const rank = idx + 1;
      let rankClass = 'rank-num-default';
      let badgeClass = 'bg-black/65 backdrop-blur-md text-white/90 border border-white/14 shadow-sm';
      if (idx === 0) {
        rankClass = 'rank-num-1';
        badgeClass = 'bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-extrabold border border-amber-300/50 shadow-[0_2px_10px_rgba(245,158,11,0.4)]';
      } else if (idx === 1) {
        rankClass = 'rank-num-2';
        badgeClass = 'bg-gradient-to-r from-slate-200 to-slate-400 text-black font-extrabold border border-white/40 shadow-sm';
      } else if (idx === 2) {
        rankClass = 'rank-num-3';
        badgeClass = 'bg-gradient-to-r from-amber-700 to-amber-800 text-amber-100 font-extrabold border border-amber-500/40 shadow-sm';
      }

      const numColWidth = rank === 10 ? 'w-20 sm:w-24 md:w-28' : 'w-14 sm:w-16 md:w-20';
      const numFontSize = rank === 10 ? 'text-[85px] sm:text-[105px] md:text-[120px] -tracking-[6px]' : 'text-[100px] sm:text-[120px] md:text-[140px]';

      return `
        <a href="/phim/${pathSegment(movie.slug)}" class="top10-item flex items-end shrink-0 group cursor-pointer select-none transition-transform duration-300 hover:-translate-y-2">
          <!-- 1. FULL UNCOVERED NUMBER (Left Block, 100% Visible) -->
          <div class="${numColWidth} h-[240px] sm:h-[270px] flex items-end justify-center shrink-0 pr-1 select-none pointer-events-none">
            <span class="rank-num ${rankClass} ${numFontSize}">
              ${rank}
            </span>
          </div>

          <!-- 2. CINEMA POSTER CARD (Right Block, Never Covers Number) -->
          <div class="relative w-[180px] sm:w-[200px] md:w-[220px] aspect-[2/3] rounded-2xl overflow-hidden bg-surface-container shadow-[0_12px_36px_rgba(0,0,0,0.85)] border border-white/10 transition-all duration-300 group-hover:shadow-[0_18px_48px_rgba(0,0,0,0.95)] group-hover:border-primary/50 shrink-0">
            <img src="${escapeHtml(safeImageUrl(movie.poster_url || movie.thumb_url))}" alt="${escapeHtml(movie.name)}" loading="lazy" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-108" />

            <!-- Corner Rank Badges (Horizontal & Sleek) -->
            <div class="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 flex-wrap max-w-[85%] pointer-events-none">
              <span class="px-2 py-0.5 rounded-md ${badgeClass} font-label-badge text-[10px] font-black tracking-wider uppercase">
                #${rank}
              </span>
              ${movie.has_song_ngu ? `
                <span class="badge-song-ngu">
                  <span class="material-symbols-outlined">record_voice_over</span>Song Ngữ
                </span>` : ''}
            </div>

            <!-- Quality Badge -->
            <div class="absolute top-2.5 right-2.5 z-20 pointer-events-none">
              <span class="badge-glass-quality">${escapeHtml(movie.quality || 'FHD')}</span>
            </div>

            <!-- Quick Play Hover Overlay -->
            <div class="absolute inset-0 bg-black/45 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20">
              <span class="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center shadow-2xl transform scale-90 group-hover:scale-100 transition-transform">
                <span class="material-symbols-outlined text-[28px]" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
              </span>
            </div>

            <!-- Bottom Gradient Overlay & Real Metadata -->
            <div class="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-[#0B0B0C] via-[#0B0B0C]/90 to-transparent z-10 flex flex-col gap-1">
              <h4 class="font-label-md text-label-md font-bold text-on-surface truncate group-hover:text-primary transition-colors">${escapeHtml(movie.name)}</h4>
              <div class="flex items-center justify-between text-on-surface-variant font-body-sm text-[11px]">
                <span class="flex items-center gap-1.5 text-amber-400 font-bold">
                  <span class="material-symbols-outlined text-[14px] text-primary">visibility</span>
                  ${movie.views !== null && movie.views !== undefined && String(movie.views).trim() !== '' && Number.isFinite(Number(movie.views)) && Number(movie.views) >= 0 ? `${Number(movie.views).toLocaleString('vi-VN')} lượt xem` : 'Chưa có dữ liệu lượt xem'}
                </span>
                <span class="text-white/60 font-medium">${escapeHtml(movie.year || '')}</span>
              </div>
            </div>
          </div>
        </a>
      `;
    }).join('');

    // Wire up Prev & Next buttons
    const prevBtn = sec.querySelector('#btn-top10-prev');
    const nextBtn = sec.querySelector('#btn-top10-next');
    if (prevBtn) {
      prevBtn.onclick = () => {
        rail.scrollBy({ left: -340, behavior: 'smooth' });
      };
    }
    if (nextBtn) {
      nextBtn.onclick = () => {
        rail.scrollBy({ left: 340, behavior: 'smooth' });
      };
    }
    enableDragScroll(rail);
  }

  // --- 6. GENERIC RAIL RENDERER (Cinema, Series, Singles, TV Shows, Anime) ---
  function renderSectionRail(railId, items, badgeType = 'default') {
    const rail = document.getElementById(railId);
    if (!rail) return;
    if (!items || items.length === 0) return;

    rail.innerHTML = items.slice(0, 16).map(movie => {
      let badgeHtml = '';
      if (badgeType === 'chieurap') {
        badgeHtml = `<span class="badge-glass-cinema">Chiếu Rạp</span>`;
      } else if (badgeType === 'series') {
        badgeHtml = `<span class="badge-glass-series">${formatLangBadge(movie.lang || 'Phim Bộ')}</span>`;
      } else if (badgeType === 'tvshows') {
        badgeHtml = `<span class="badge-glass-tvshow">TV Show</span>`;
      } else if (badgeType === 'anime') {
        badgeHtml = `<span class="badge-glass-anime">Anime</span>`;
      } else if (movie.lang) {
        badgeHtml = `<span class="badge-glass-sub">${formatLangBadge(movie.lang)}</span>`;
      }

      const songNguBadge = movie.has_song_ngu ? `
        <span class="badge-song-ngu">
          <span class="material-symbols-outlined">record_voice_over</span>Song Ngữ
        </span>` : '';

      return `
        <div class="movie-card group relative rounded-xl overflow-hidden bg-surface-container flex flex-col cursor-pointer border border-white/5 w-[155px] sm:w-[175px] md:w-[195px] shrink-0" onclick="window.location.href='/phim/${movie.slug}'">
          <div class="relative w-full aspect-[2/3] overflow-hidden bg-surface-container-high">
            <img src="${movie.poster_url || movie.thumb_url}" alt="${movie.name}" loading="lazy" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-108" />
            <div class="absolute top-2 left-2 flex flex-col gap-1 z-10 items-start pointer-events-none">
              ${songNguBadge}
              ${badgeHtml}
            </div>
            <div class="absolute top-2 right-2 z-10 pointer-events-none">
              <span class="badge-glass-quality">${escapeHtml(movie.quality || 'FHD')}</span>
            </div>
            <div class="absolute inset-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent p-3 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-all duration-300 z-10">
              <p class="font-body-sm text-[11px] text-white/90 line-clamp-3 mb-2 leading-relaxed drop-shadow">${movie.content || movie.name}</p>
              <div class="flex items-center gap-1.5">
                <a href="/xem-phim/${movie.slug}" class="movie-card-play-btn flex-1 py-1.5 rounded-lg bg-primary-container text-on-primary-container font-label-badge text-[11px] font-bold text-center hover:bg-inverse-primary transition-all flex items-center justify-center gap-1 shadow-lg shadow-primary-container/50">
                  <span class="material-symbols-outlined text-[15px]" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
                  <span>Xem</span>
                </a>
                <button class="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-sm cursor-pointer" title="Chi tiết phim" onclick="event.stopPropagation(); window.location.href='/phim/${movie.slug}'">
                  <span class="material-symbols-outlined text-[16px]">info</span>
                </button>
              </div>
            </div>
          </div>
          <div class="p-2.5 flex flex-col gap-0.5">
            <h3 class="font-label-md text-[13px] text-on-surface font-bold truncate group-hover:text-primary transition-colors">${movie.name}</h3>
            <div class="flex items-center justify-between text-on-surface-variant font-body-sm text-[11px]">
              <span class="text-amber-400 font-semibold truncate max-w-[105px]">${movie.episode_current || movie.time || 'Trọn Bộ'}</span>
              <span class="text-on-surface-variant/80">${movie.year || 2026}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function wireScrollButtons(prevBtnId, nextBtnId, railId, scrollAmount = 360) {
    const prevBtn = document.getElementById(prevBtnId);
    const nextBtn = document.getElementById(nextBtnId);
    const rail = document.getElementById(railId);
    if (!rail) return;
    if (prevBtn) {
      prevBtn.onclick = () => rail.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    }
    if (nextBtn) {
      nextBtn.onclick = () => rail.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
    enableDragScroll(rail);
  }

  // --- 7. QUICK GENRE & CATEGORY NAVIGATION BAR ---
  function initQuickGenreBar() {
    const rail = document.getElementById('quick-genre-rail');
    const prevBtn = document.getElementById('quick-genre-prev');
    const nextBtn = document.getElementById('quick-genre-next');
    const fadeLeft = document.getElementById('quick-genre-fade-left');
    const fadeRight = document.getElementById('quick-genre-fade-right');
    if (!rail) return;

    function updateArrows() {
      const scrollLeft = rail.scrollLeft;
      const maxScroll = rail.scrollWidth - rail.clientWidth;

      if (fadeLeft) {
        if (scrollLeft > 15) {
          fadeLeft.classList.remove('opacity-0');
          fadeLeft.classList.add('opacity-100');
        } else {
          fadeLeft.classList.add('opacity-0');
          fadeLeft.classList.remove('opacity-100');
        }
      }

      if (fadeRight) {
        if (scrollLeft < maxScroll - 15) {
          fadeRight.classList.remove('opacity-0');
          fadeRight.classList.add('opacity-100');
        } else {
          fadeRight.classList.add('opacity-0');
          fadeRight.classList.remove('opacity-100');
        }
      }
    }

    if (prevBtn) {
      prevBtn.onclick = (e) => {
        e.stopPropagation();
        rail.scrollBy({ left: -320, behavior: 'smooth' });
      };
    }

    if (nextBtn) {
      nextBtn.onclick = (e) => {
        e.stopPropagation();
        rail.scrollBy({ left: 320, behavior: 'smooth' });
      };
    }

    rail.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);

    // Initial check after elements layout
    setTimeout(updateArrows, 120);

    enableDragScroll(rail);
  }

  // --- 8. SMOOTH MOUSE DRAG-TO-SCROLL & WHEEL HANDLER ---
  function enableDragScroll(container) {
    if (!container || container._hasDragScroll) return;
    container._hasDragScroll = true;

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let hasMoved = false;

    container.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Only main left click
      isDown = true;
      hasMoved = false;
      startX = e.pageX;
      scrollLeft = container.scrollLeft;
      container.style.scrollBehavior = 'auto';
    });

    const onDragEnd = () => {
      if (!isDown) return;
      isDown = false;
      container.classList.remove('drag-scroll-active');
      container.style.scrollBehavior = '';
      setTimeout(() => {
        hasMoved = false;
      }, 70);
    };

    window.addEventListener('mouseup', onDragEnd);

    window.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      const walk = e.pageX - startX;
      if (Math.abs(walk) > 6) {
        if (!hasMoved) {
          hasMoved = true;
          container.classList.add('drag-scroll-active');
        }
        e.preventDefault();
        container.scrollLeft = scrollLeft - walk;
      }
    });

    // Intercept click on links/cards if user was dragging
    container.addEventListener('click', (e) => {
      if (hasMoved) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);

    // Mouse wheel horizontal scroll support
    container.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        const maxScroll = container.scrollWidth - container.clientWidth;
        if (maxScroll > 0) {
          const atStart = container.scrollLeft <= 2 && e.deltaY < 0;
          const atEnd = container.scrollLeft >= maxScroll - 2 && e.deltaY > 0;
          if (!atStart && !atEnd) {
            e.preventDefault();
            container.scrollLeft += e.deltaY * 0.9;
          }
        }
      }
    }, { passive: false });
  }
});

