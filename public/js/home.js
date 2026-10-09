// TTPhim - Home Page Controller (Real API Data Binding)
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
  if (!lang) return 'Vietsub';
  let s = String(lang).trim();
  if (/vietsub\s*(\+|\/|\&|,)\s*thuyết minh/i.test(s)) return 'Vietsub • TM';
  if (/thuyết minh/i.test(s)) return 'Thuyết Minh';
  if (/lồng tiếng/i.test(s)) return 'Lồng Tiếng';
  if (/song ngữ/i.test(s)) return 'Song Ngữ';
  return s;
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[TTPhim] Initializing Home Page with live API data...');

  // Initialize interactive quick genre navigation pills immediately
  initQuickGenreBar();

  try {
    const homeData = await API.getHome();
    if (!homeData) {
      console.error('[TTPhim] Empty homeData returned');
      return;
    }

    console.log('[TTPhim] Home data loaded successfully:', {
      spotlights: homeData.spotlights?.length,
      latest: homeData.latest?.length,
      cinema: homeData.cinema?.length,
      series: homeData.series?.length,
      rankings: homeData.rankings?.length
    });

    renderHeroSpotlight(homeData.spotlights || []);
    renderSection1ContinueWatching(homeData);
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
    console.error('[TTPhim] Failed to load home data:', err);
    if (window.showToast) window.showToast('Lỗi tải dữ liệu phim từ TTPhim API', 'error');
  }

  // --- 1. HERO SPOTLIGHT ---
  function renderHeroSpotlight(rawSpotlights) {
    const spotlights = (rawSpotlights || []).slice(0, 10);
    const heroSection = document.querySelectorAll('main section')[0];
    if (!heroSection) return;

    const timerBar = document.getElementById('spotlight-timer-bar');
    const prevBtn = document.getElementById('hero-prev-btn');
    const nextBtn = document.getElementById('hero-next-btn');
    const dotsContainer = document.getElementById('hero-slide-dots');

    if (!spotlights || spotlights.length === 0) {
      // Clean empty state when no movie is pinned by admin
      const heroTitle = heroSection.querySelector('h1.font-display-hero') || heroSection.querySelector('h1');
      const heroSubTitle = heroSection.querySelector('p.font-headline-sm');
      const heroExcerpt = heroSection.querySelector('p.font-body-lg');
      const playBtn = heroSection.querySelector('#hero-play-btn') || heroSection.querySelector('a.bg-primary-container');
      const trailerBtn = heroSection.querySelector('#hero-trailer-btn');
      const heroPosterCard = document.getElementById('hero-poster-card');
      const heroPosterRank = document.getElementById('hero-poster-rank-badge');
      const heroPosterImg = document.getElementById('hero-poster-img');

      if (heroTitle) heroTitle.innerHTML = 'TTPhim Cinema Experience';
      if (heroSubTitle) heroSubTitle.innerText = 'Kho Phim Chuẩn Điện Ảnh 4K HDR Không Quảng Cáo';
      if (heroExcerpt) heroExcerpt.innerText = 'Hiện tại chưa có phim nào được ghim lên Banner nổi bật. Quản trị viên có thể vào trang Quản Trị (Admin) để ghim phim lên Banner trang chủ.';
      if (playBtn) {
        playBtn.href = '/kham-pha';
        const span = playBtn.querySelector('span:last-child');
        if (span) span.innerText = 'Khám Phá Phim';
      }
      if (trailerBtn) trailerBtn.style.display = 'none';
      if (heroPosterRank) heroPosterRank.innerText = 'Banner Trang Chủ';
      if (heroPosterImg) heroPosterImg.src = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop&q=80';
      if (heroPosterCard) heroPosterCard.href = '/kham-pha';

      if (timerBar) timerBar.style.display = 'none';
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'none';
      if (dotsContainer) dotsContainer.innerHTML = '';
      return;
    }

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

    // Dual background layers for cinematic crossfade
    const layer1 = document.getElementById('hero-bg-layer-1');
    const layer2 = document.getElementById('hero-bg-layer-2');
    let activeBgSlot = 1;
    const heroBgFallback = heroSection.querySelector('div[style*="background-image"]');
    const flareStreak = document.getElementById('hero-anamorphic-flare');
    const contentDeck = document.getElementById('hero-content-deck') || heroSection.querySelector('div.max-w-3xl');

    const heroTitle = heroSection.querySelector('h1.font-display-hero') || heroSection.querySelector('h1');
    const heroSubTitle = heroSection.querySelector('p.font-headline-sm');
    const heroExcerpt = heroSection.querySelector('p.font-body-lg');
    const heroRating = heroSection.querySelector('span.font-label-lg');
    const heroMetaSpans = heroSection.querySelectorAll('div.flex.flex-wrap.items-center.gap-space-sm span.px-2.py-0\\.5');
    const heroGenres = heroSection.querySelector('div.flex.items-center.gap-2.text-on-surface-variant');
    const playBtn = heroSection.querySelector('a.bg-primary-container:has(.material-symbols-outlined)') || heroSection.querySelector('a.bg-primary-container');
    const trailerBtn = heroSection.querySelector('#hero-trailer-btn') || Array.from(heroSection.querySelectorAll('button')).find(b => b.innerText.includes('Xem Trailer'));
    const infoBtn = heroSection.querySelector('button[title="Thông tin chi tiết"]');
    const bookmarkBtn = heroSection.querySelector('button[title="Thêm vào danh sách"]');
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

        const newBgUrl = movie.thumb_url || movie.poster_url;

        // 1. Crossfade background layers with Ken Burns slow zoom
        if (layer1 && layer2) {
          if (activeBgSlot === 1) {
            layer2.style.backgroundImage = `url('${newBgUrl}')`;
            layer2.className = 'hero-bg-layer active';
            layer1.className = 'hero-bg-layer prev';
            activeBgSlot = 2;
          } else {
            layer1.style.backgroundImage = `url('${newBgUrl}')`;
            layer1.className = 'hero-bg-layer active';
            layer2.className = 'hero-bg-layer prev';
            activeBgSlot = 1;
          }
        } else if (heroBgFallback) {
          heroBgFallback.style.opacity = '0.35';
          setTimeout(() => {
            heroBgFallback.style.backgroundImage = `url('${newBgUrl}')`;
            heroBgFallback.style.opacity = '1';
          }, 180);
        }

        // 2. Trigger Anamorphic Flare Flash Streak
        if (flareStreak) {
          flareStreak.classList.remove('flash');
          void flareStreak.offsetWidth; // Reflow
          flareStreak.classList.add('flash');
        }

        // 3. Staggered Content Reveal Animation
        if (contentDeck) {
          contentDeck.classList.remove('cinema-text-animate');
          void contentDeck.offsetWidth; // Reflow
          contentDeck.classList.add('cinema-text-animate');
        }

        // 4. Update texts and badges
        if (heroTitle) {
          heroTitle.innerHTML = `${movie.name} <span class="text-primary-container block sm:inline">${movie.episode_current ? `(${movie.episode_current})` : ''}</span>`;
        }
        if (heroSubTitle) {
          heroSubTitle.innerText = `${movie.origin_name || ''} (${movie.year || 2026})`;
        }
        if (heroExcerpt) {
          heroExcerpt.innerText = movie.content || 'Nội dung bộ phim đặc sắc đang chờ bạn khám phá trên TTPhim...';
        }
        if (heroRating) {
          heroRating.innerText = movie.rating || '9.2';
        }
        if (heroMetaSpans && heroMetaSpans.length >= 3) {
          heroMetaSpans[0].innerText = movie.quality || '4K HDR';
          heroMetaSpans[1].innerText = movie.chieurap ? 'Chiếu Rạp' : 'T16';
          heroMetaSpans[2].innerText = movie.time || '120 phút';
          if (heroMetaSpans.length >= 4) {
            if (movie.has_song_ngu) {
              heroMetaSpans[3].className = 'px-2 py-0.5 rounded-md bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-label-badge text-label-badge font-bold flex items-center gap-1 shadow-md shadow-purple-600/30';
              heroMetaSpans[3].innerHTML = '<span class="material-symbols-outlined text-[13px]">record_voice_over</span> Song Ngữ';
            } else {
              heroMetaSpans[3].className = 'px-2 py-0.5 rounded bg-secondary-container/20 text-secondary font-label-badge text-label-badge flex items-center gap-1';
              heroMetaSpans[3].innerHTML = `<span class="material-symbols-outlined text-[13px]">translate</span> ${movie.lang || 'Vietsub'}`;
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
          if (playLabel) playLabel.innerText = 'Xem Phim';
        }
        if (trailerBtn) {
          trailerBtn.onclick = () => openSpotlightTrailer(movie);
        }
        if (infoBtn) {
          infoBtn.onclick = () => window.location.href = `/phim/${movie.slug}`;
        }
        if (bookmarkBtn) {
          bookmarkBtn.onclick = async () => {
            const res = await API.toggleWatchlist({
              movie_slug: movie.slug,
              movie_name: movie.name,
              origin_name: movie.origin_name,
              poster_url: movie.poster_url,
              thumb_url: movie.thumb_url,
              year: movie.year,
              quality: movie.quality
            });
            if (res.data?.added) {
              window.showToast(`Đã thêm "${movie.name}" vào danh sách yêu thích!`);
              bookmarkBtn.classList.add('text-primary-container');
            } else {
              window.showToast(`Đã bỏ lưu "${movie.name}" khỏi danh sách`);
              bookmarkBtn.classList.remove('text-primary-container');
            }
          };
        }

        // 4b. Update Right-side poster card
        if (heroPosterImg) {
          heroPosterImg.src = movie.poster_url || movie.thumb_url;
          heroPosterImg.alt = movie.name;
        }
        if (heroPosterCard) {
          heroPosterCard.href = `/xem-phim/${movie.slug}/${movie.first_episode_slug || 'tap-1'}`;
        }
        if (heroPosterRank) {
          heroPosterRank.innerHTML = `<span class="material-symbols-outlined text-[13px]">stars</span> #${String(index + 1).padStart(2, '0')} Nổi Bật`;
        }

        // 5. Update slide indicator dots under large poster
        if (dotsContainer) {
          dotsContainer.innerHTML = spotlights.map((_, idx) => `
            <button class="h-1.5 rounded-full transition-all duration-300 ${idx === index ? 'w-6 bg-primary-container shadow-md shadow-primary-container/50' : 'w-2 bg-white/30 hover:bg-white/60'} cursor-pointer" data-index="${idx}" title="Chuyển đến phim ${idx + 1}" type="button"></button>
          `).join('');

          dotsContainer.querySelectorAll('button').forEach((btn, idx) => {
            btn.onclick = (e) => {
              e.preventDefault();
              updateSlide(idx);
            };
          });
        }

        if (indicatorRail) {
          const cards = indicatorRail.querySelectorAll('.spotlight-thumb-btn');
          cards.forEach((card, i) => {
            const dot = card.querySelector('.spotlight-thumb-dot');
            if (i === index) {
              card.classList.add('active-thumb', 'ring-2', 'ring-primary-container', 'scale-105', 'shadow-[0_0_20px_rgba(229,9,20,0.55)]');
              card.classList.remove('opacity-60', 'ring-1', 'ring-white/10');
              card.classList.add('opacity-100');
              if (dot) dot.classList.remove('hidden');
              const scrollTarget = card.offsetLeft - (indicatorRail.clientWidth / 2) + (card.clientWidth / 2);
              indicatorRail.scrollTo({ left: scrollTarget, behavior: 'smooth' });
            } else {
              card.classList.remove('active-thumb', 'ring-2', 'ring-primary-container', 'scale-105', 'shadow-[0_0_20px_rgba(229,9,20,0.55)]');
              card.classList.add('opacity-60', 'ring-1', 'ring-white/10');
              card.classList.remove('opacity-100');
              if (dot) dot.classList.add('hidden');
            }
          });
        }

        // 6. Reset & Animate Progress Bar
        startTimerBar();
      } catch (slideErr) {
        console.error('[Spotlight Slide Error]', slideErr);
      }
    }

    let isPaused = false;

    function startTimerBar() {
      if (!timerBar) return;
      timerBar.style.transition = 'none';
      timerBar.style.width = '';
      timerBar.classList.remove('running', 'paused');
      void timerBar.offsetWidth; // Reflow to reset CSS keyframe animation
      timerBar.classList.add('running');
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
      isPaused = false;
      if (timerBar) {
        timerBar.classList.remove('paused');
      }
    }

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
        <div class="spotlight-thumb-btn ${idx === 0 ? 'active-thumb ring-2 ring-primary-container scale-105 shadow-[0_0_20px_rgba(229,9,20,0.55)] opacity-100' : 'ring-1 ring-white/10 opacity-60 hover:opacity-100'} relative w-[70px] sm:w-[78px] md:w-[86px] aspect-[2/3] rounded-xl overflow-hidden bg-surface-container-high shrink-0 cursor-pointer text-left select-none group/thumb transition-all duration-300" data-index="${idx}">
          <img src="${m.poster_url || m.thumb_url}" alt="${m.name}" class="w-full h-full object-cover object-top transition-transform duration-500 group-hover/thumb:scale-105" loading="lazy" />
          <span class="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[9px] font-bold text-white shadow">${String(idx + 1).padStart(2, '0')}</span>
          <span class="spotlight-thumb-dot absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary-container animate-pulse ${idx === 0 ? '' : 'hidden'}"></span>
          <div class="absolute inset-x-0 bottom-0 p-1 pt-3.5 bg-gradient-to-t from-black/95 via-black/50 to-transparent flex items-end">
            <p class="text-[9px] sm:text-[10px] font-semibold text-white truncate w-full leading-tight text-center drop-shadow">${m.name}</p>
          </div>
        </div>
      `).join('');

      indicatorRail.querySelectorAll('.spotlight-thumb-btn').forEach((card, idx) => {
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
      document.getElementById('hero-trailer-btn'),
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

  async function openSpotlightTrailer(movie) {
    let trailerUrl = movie.trailer_url;
    if (!trailerUrl) {
      try {
        window.showToast('Đang kết nối luồng Trailer HD...', 'info');
        const detailData = await API.getMovieDetail(movie.slug);
        trailerUrl = detailData?.movie?.trailer_url;
      } catch(e) {}
    }

    let embedUrl = null;
    if (trailerUrl) {
      const ytMatch = trailerUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
      if (ytMatch && ytMatch[1]) {
        embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`;
      } else {
        embedUrl = trailerUrl;
      }
    }

    if (!embedUrl) {
      window.showToast(`Phim "${movie.name}" hiện chưa có bản Trailer trực tuyến chính thức.`, 'info');
      return;
    }

    let modal = document.getElementById('home-trailer-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'home-trailer-modal';
      modal.className = 'fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4';
      modal.innerHTML = `
        <div class="relative w-full max-w-4xl bg-surface-container rounded-2xl overflow-hidden shadow-2xl border border-surface-container-highest flex flex-col">
          <div class="p-4 bg-surface-container-high flex items-center justify-between border-b border-surface-container-highest">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-primary text-[22px]">smart_display</span>
              <h3 class="font-headline-sm text-on-surface font-bold truncate">Trailer: <span id="home-trailer-title"></span></h3>
            </div>
            <button id="close-home-trailer-btn" class="p-1.5 rounded-full hover:bg-surface-container-highest text-on-surface transition-colors cursor-pointer">
              <span class="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          <div class="w-full aspect-video bg-black">
            <iframe id="home-trailer-iframe" class="w-full h-full border-0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.querySelector('#close-home-trailer-btn').onclick = () => {
        modal.classList.add('hidden');
        modal.querySelector('#home-trailer-iframe').src = '';
      };
      modal.onclick = (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
          modal.querySelector('#home-trailer-iframe').src = '';
        }
      };
    }

    modal.querySelector('#home-trailer-title').innerText = movie.name;
    modal.querySelector('#home-trailer-iframe').src = embedUrl;
    modal.classList.remove('hidden');
  }

  // --- 2. SECTION 1: TIẾP TỤC XEM (CONTINUE WATCHING) ---
  async function renderSection1ContinueWatching(homeData) {
    const sec = document.getElementById('section-continue-watching') || document.querySelectorAll('main section')[1];
    if (!sec) return;

    const rail = sec.querySelector('#rail-continue-watching') || sec.querySelector('div.flex.overflow-x-auto') || sec.querySelector('div.grid');
    if (!rail) return;

    // Ensure horizontal rail styling
    rail.className = 'flex overflow-x-auto gap-4 sm:gap-5 pb-4 pt-1 no-scrollbar scroll-smooth pl-1 cursor-grab select-none';
    rail.id = 'rail-continue-watching';

    // Wire up "Quản lý lịch sử" link directly to Tab 0: Đang Xem Dở
    const manageLink = document.getElementById('btn-manage-history') || sec.querySelector('a[href*="danh-sach"]') || sec.querySelector('a:has(span)');
    if (manageLink) {
      manageLink.setAttribute('href', '/danh-sach-cua-toi?tab=continue');
      manageLink.onclick = (e) => {
        e.preventDefault();
        window.location.href = '/danh-sach-cua-toi?tab=continue';
      };
    }

    let items = [];
    try {
      const lib = await API.getLibrary();
      if (lib.continueWatching && lib.continueWatching.length > 0) {
        items = lib.continueWatching.slice(0, 10);
      } else if (lib.history && lib.history.length > 0) {
        // Fallback to in-progress history (< 95%)
        items = lib.history.filter(h => (h.progress_percent || 0) < 95).slice(0, 10);
      }
    } catch(e) {
      console.warn('Error fetching continue watching library:', e);
    }

    // If no real items, hide the section completely (no fake fallback!)
    if (items.length === 0) {
      sec.classList.add('hidden');
      rail.innerHTML = '';
      return;
    }

    sec.classList.remove('hidden');

    // Update count badge
    const countBadge = document.getElementById('continue-watching-count') || sec.querySelector('span.font-label-badge');
    if (countBadge) countBadge.innerText = `${items.length} Phim`;

    rail.innerHTML = items.map(item => {
      const thumbImg = item.thumb_url || item.poster_url;
      const progress = Math.max(1, item.progress_percent || 1);
      const durationMins = item.duration ? Math.round(item.duration / 60) : 110;
      const epSlug = item.episode_slug || 'tap-1';

      return `
        <div class="group relative rounded-xl bg-surface-container overflow-hidden transition-all duration-300 hover:shadow-2xl hover:scale-[1.02] cursor-pointer flex flex-col w-[280px] sm:w-[320px] md:w-[350px] shrink-0 border border-white/5" onclick="window.location.href='/xem-phim/${item.movie_slug}/${epSlug}'">
          <!-- Top Horizontal Thumbnail (16:9) -->
          <div class="relative aspect-video w-full overflow-hidden bg-surface-container-high">
            <img class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" src="${thumbImg}" alt="${item.movie_name}" loading="lazy" />
            <div class="absolute inset-0 bg-gradient-to-t from-surface-container-lowest/90 via-transparent to-black/30"></div>
            
            <a class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40" href="/xem-phim/${item.movie_slug}/${epSlug}">
              <span class="w-12 h-12 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                <span class="material-symbols-outlined text-[28px]" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
              </span>
            </a>

            <span class="badge-glass-ep absolute top-2 right-2">
              ${formatEpBadge(item.episode_name)}
            </span>

            <button class="btn-remove-continue-item absolute top-2 left-2 w-7 h-7 rounded-full bg-black/70 hover:bg-error text-white/80 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 cursor-pointer" title="Xóa khỏi danh sách tiếp tục xem" data-slug="${item.movie_slug}">
              <span class="material-symbols-outlined text-[15px]">close</span>
            </button>

            <!-- Bottom Progress Line Inside Thumbnail -->
            <div class="absolute inset-x-0 bottom-0 h-1.5 bg-black/60">
              <div class="h-full bg-primary-container" style="width: ${progress}%;"></div>
            </div>
          </div>

          <!-- Bottom Meta & Progress -->
          <div class="p-3 space-y-1 flex-1 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between">
                <h3 class="font-headline-sm text-[14px] text-on-surface truncate group-hover:text-primary transition-colors font-bold">${item.movie_name}</h3>
                <span class="font-label-badge text-[11px] text-primary-container font-semibold">${item.quality || 'FHD'}</span>
              </div>
              <p class="font-body-sm text-[12px] text-on-surface-variant truncate">${item.origin_name || item.movie_name}</p>
            </div>
            <div class="flex justify-between items-center pt-1 font-body-sm text-[11px] text-on-surface-variant">
              <span class="text-secondary font-medium">Đã xem ${progress}%</span>
              <span class="text-on-surface-variant/80">${durationMins} phút</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Wire up Prev & Next scroll buttons and drag scroll
    wireScrollButtons('btn-continue-prev', 'btn-continue-next', 'rail-continue-watching', 340);
    enableDragScroll(rail);

    // Attach remove handlers
    rail.querySelectorAll('.btn-remove-continue-item').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        const slug = btn.dataset.slug;
        await API.removeFromHistory(slug);
        if (window.showToast) window.showToast('Đã xóa phim khỏi danh sách tiếp tục xem');
        await renderSection1ContinueWatching(homeData);
      });
    });
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
            <span class="badge-glass-quality">${movie.quality || 'FHD'}</span>
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
        <div class="top10-item flex items-end shrink-0 group cursor-pointer select-none transition-transform duration-300 hover:-translate-y-2" onclick="window.location.href='/phim/${movie.slug}'">
          <!-- 1. FULL UNCOVERED NUMBER (Left Block, 100% Visible) -->
          <div class="${numColWidth} h-[240px] sm:h-[270px] flex items-end justify-center shrink-0 pr-1 select-none pointer-events-none">
            <span class="rank-num ${rankClass} ${numFontSize}">
              ${rank}
            </span>
          </div>

          <!-- 2. CINEMA POSTER CARD (Right Block, Never Covers Number) -->
          <div class="relative w-[180px] sm:w-[200px] md:w-[220px] aspect-[2/3] rounded-2xl overflow-hidden bg-surface-container shadow-[0_12px_36px_rgba(0,0,0,0.85)] border border-white/10 transition-all duration-300 group-hover:shadow-[0_18px_48px_rgba(0,0,0,0.95)] group-hover:border-primary/50 shrink-0">
            <img src="${movie.poster_url || movie.thumb_url}" alt="${movie.name}" loading="lazy" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-108" />

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
              <span class="badge-glass-quality">${movie.quality || 'FHD'}</span>
            </div>

            <!-- Quick Play Hover Overlay -->
            <div class="absolute inset-0 bg-black/45 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20">
              <span class="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center shadow-2xl transform scale-90 group-hover:scale-100 transition-transform">
                <span class="material-symbols-outlined text-[28px]" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
              </span>
            </div>

            <!-- Bottom Gradient Overlay & Real Metadata -->
            <div class="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-[#0B0B0C] via-[#0B0B0C]/90 to-transparent z-10 flex flex-col gap-1">
              <h4 class="font-label-md text-label-md font-bold text-on-surface truncate group-hover:text-primary transition-colors">${movie.name}</h4>
              <div class="flex items-center justify-between text-on-surface-variant font-body-sm text-[11px]">
                <span class="flex items-center gap-1.5 text-amber-400 font-bold">
                  <span class="material-symbols-outlined text-[14px] text-primary">visibility</span>
                  ${movie.views || '0'} lượt xem
                </span>
                <span class="text-white/60 font-medium">${movie.year || ''}</span>
              </div>
            </div>
          </div>
        </div>
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
              <span class="badge-glass-quality">${movie.quality || 'FHD'}</span>
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

