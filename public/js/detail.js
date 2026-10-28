// TTPhim - Movie Detail Page Controller (Real Data Binding)
document.addEventListener('DOMContentLoaded', async () => {
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const safeUrl = (value, fallback = '/favicon.svg') => {
    try { const url = new URL(value, window.location.href); return /^https?:$/.test(url.protocol) ? url.href : fallback; } catch (_) { return fallback; }
  };
  const pathSegment = value => encodeURIComponent(String(value ?? '')).replace(/'/g, '%27');
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

  // Extract slug from URL path /phim/:slug or query param
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  let slug = pathParts[1];
  if (!slug || slug === 'phim') {
    const urlParams = new URLSearchParams(window.location.search);
    slug = urlParams.get('slug');
  }

  // If still no slug, fallback to latest movie
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

  let cleanupAutoNext = () => {};
  window.addEventListener('pagehide', event => { if (!event.persisted) cleanupAutoNext(); });

  let detailData;
  try {
    console.log('[TTPhim] Fetching movie detail for slug:', slug);
    detailData = await API.getMovieDetail(slug);
  } catch (err) {
    console.error('[TTPhim] Failed to fetch movie detail:', err);
    window.showToast?.('Không thể tải thông tin phim từ máy chủ. Vui lòng thử lại.', 'error');
    return;
  }
  if (!detailData?.movie) {
    window.showToast?.('Không tìm thấy thông tin phim', 'error');
    return;
  }
  try { renderDetail(detailData); }
  catch (err) {
    console.error('[TTPhim] Failed to initialize movie detail:', err);
    window.showToast?.('Không thể hiển thị đầy đủ trang phim. Vui lòng tải lại trang.', 'error');
  }

  function renderDetail({ movie, episodes, related, inWatchlist }) {
    if (window.EpisodeSources) episodes = (episodes || []).map(server => ({ ...server, server_data: EpisodeSources.playable(server) }));
    document.title = `${movie.name}${movie.year ? ` (${movie.year})` : ''} - CineViet`;

    // Ambient backdrop
    const backdrop = document.querySelector('section.relative div[style*="background-image"]');
    if (backdrop) {
      backdrop.style.backgroundImage = `url('${movie.thumb_url || movie.poster_url}')`;
    }

    // Breadcrumb
    const breadcrumb = document.getElementById('detail-breadcrumb') || document.querySelector('main nav');
    if (breadcrumb) {
      const primaryCat = movie.category?.[0];
      breadcrumb.innerHTML = `
        <a class="hover:text-primary transition-colors flex items-center gap-1" href="/">
          <span class="material-symbols-outlined text-[16px]">home</span>Trang Chủ
        </a>
        <span>/</span>
        <a class="hover:text-primary transition-colors" href="/kham-pha?category=${pathSegment(primaryCat ? primaryCat.slug : 'all')}">${escapeHtml(primaryCat ? primaryCat.name : 'Phim')}</a>
        <span>/</span>
        <span class="text-on-surface font-semibold truncate">${escapeHtml(movie.name)}</span>
      `;
    }

    // Poster
    const posterImg = document.querySelector('section div.aspect-\\[2\\/3\\] img');
    if (posterImg) {
      posterImg.src = safeUrl(movie.poster_url || movie.thumb_url);
      posterImg.alt = movie.name;
    }

    // Quick stats under poster
    const statViews = document.querySelector('p.text-secondary-container.font-bold');
    if (statViews) {
      const hasViews = (typeof movie.view === 'number' || typeof movie.view === 'string') && String(movie.view).trim() !== '' && Number.isFinite(Number(movie.view)) && Number(movie.view) >= 0;
      statViews.innerText = hasViews ? Number(movie.view).toLocaleString('vi-VN') : 'Chưa có dữ liệu';
    }

    const statStatus = document.querySelector('p.text-on-surface.font-semibold');
    if (statStatus) {
      statStatus.innerText = movie.episode_current || (movie.status === 'completed' ? 'Trọn Bộ' : 'Đang chiếu');
    }

    // Titles
    const titleEl = document.querySelector('h1.font-display-hero, h1.text-display-hero-mobile, h1');
    if (titleEl) titleEl.innerText = movie.name;

    const subTitleEl = document.querySelector('p.font-headline-sm.italic');
    if (subTitleEl) subTitleEl.innerText = `${movie.origin_name || ''} • (${movie.year})`;

    // Meta Pills Badges
    const pillsContainer = document.querySelector('div.flex.flex-wrap.items-center.gap-space-xs.sm\\:gap-space-sm') ||
                           document.querySelector('div.flex.flex-wrap.items-center.gap-space-xs');
    if (pillsContainer) {
      pillsContainer.innerHTML = `
        <span class="px-2.5 py-1 rounded-md bg-surface-container-high text-on-surface font-label-md text-label-md">${escapeHtml(movie.year)}</span>
        <span class="px-2.5 py-1 rounded-md bg-surface-container-high text-on-surface font-label-md text-label-md">${escapeHtml(movie.episode_current || movie.time || 'Chưa có thông tin tập')}</span>
        <span class="px-2.5 py-1 rounded-md bg-primary-container/20 text-primary-fixed-dim font-label-md text-label-md font-bold">${movie.chieurap ? 'Chiếu Rạp' : '16+'}</span>
        <span class="px-2.5 py-1 rounded-md bg-secondary-container/20 text-secondary-fixed font-label-md text-label-md font-semibold flex items-center gap-1">
          <span class="material-symbols-outlined text-[16px]">high_quality</span>${escapeHtml(movie.quality || 'FHD')}
        </span>
        <span class="px-2.5 py-1 rounded-md bg-tertiary-container/30 text-tertiary font-label-md text-label-md flex items-center gap-1">
          <span class="material-symbols-outlined text-[16px]">translate</span>${escapeHtml(movie.lang || 'Chưa rõ ngôn ngữ')}
        </span>
      `;
    }

    // Genres Tags
    const genresContainer = document.querySelector('div.flex.flex-wrap.items-center.gap-2:has(.mr-1)');
    if (genresContainer && movie.category) {
      genresContainer.innerHTML = `
        <span class="text-body-sm font-body-sm text-on-surface-variant mr-1">Thể loại:</span>
        ${movie.category.map(c => `
          <a class="px-3 py-1 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors font-label-md text-label-md" href="/kham-pha?category=${pathSegment(c.slug)}">
            ${escapeHtml(c.name)}
          </a>
        `).join('')}
      `;
    }

    // Action Watch CTA
    const firstServerIndex = Math.max(0, (episodes || []).findIndex(server => server.server_data?.length));
    const firstEpSlug = episodes?.[firstServerIndex]?.server_data?.[0]?.slug || 'tap-1';
    const watchBtn = document.querySelector('a.bg-primary-container:has(.material-symbols-outlined)') || document.querySelector('a.bg-primary-container');
    if (watchBtn) {
      watchBtn.href = `/xem-phim/${pathSegment(movie.slug)}/${pathSegment(firstEpSlug)}?server=${firstServerIndex}`;
      const ep0Name = episodes?.[firstServerIndex]?.server_data?.[0]?.name;
      const firstEpLabel = ep0Name ? (/full/i.test(ep0Name) ? 'Bản Full' : `Tập ${cleanEpName(ep0Name)}`) : 'Bản Full';
      watchBtn.innerHTML = `
        <span class="material-symbols-outlined text-[26px]" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
        <span>Xem Phim Ngay (${escapeHtml(firstEpLabel)})</span>
      `;
      if (window.EpisodeSources && !episodes?.[firstServerIndex]?.server_data?.length) { watchBtn.removeAttribute('href'); watchBtn.setAttribute('aria-disabled', 'true'); watchBtn.textContent = 'Chưa có tập phát'; }
    }

    // Bookmark / Watchlist toggle button
    const bookmarkBtn = document.getElementById('detail-favorite-btn') || document.querySelector('button[title="Thêm vào danh sách yêu thích"]');
    if (bookmarkBtn) {
      const renderFavorite = added => {
        bookmarkBtn.classList.toggle('text-primary-container', added);
        bookmarkBtn.setAttribute('aria-pressed', String(added));
        bookmarkBtn.setAttribute('aria-label', added ? 'Bỏ yêu thích' : 'Yêu thích');
        bookmarkBtn.title = added ? 'Bỏ yêu thích' : 'Yêu thích';
        const icon = bookmarkBtn.querySelector('.material-symbols-outlined');
        if (icon) { icon.textContent = 'favorite'; icon.style.fontVariationSettings = `'FILL' ${added ? 1 : 0}`; }
      };
      renderFavorite(!!inWatchlist);
      bookmarkBtn.onclick = async () => {
        let storedUser;
        try { storedUser = await API.getMe(); }
        catch (_) { window.showToast('Chưa xác minh được phiên đăng nhập. Vui lòng thử lại.', 'error'); return; }
        if (!storedUser) {
          window.showToast('Vui lòng đăng nhập để lưu phim vào danh sách yêu thích!', 'warning');
          setTimeout(() => {
            window.location.href = `/auth?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
          }, 800);
          return;
        }

        const res = await API.toggleWatchlist({
          movie_slug: movie.slug,
          movie_name: movie.name,
          origin_name: movie.origin_name,
          poster_url: movie.poster_url,
          thumb_url: movie.thumb_url,
          year: movie.year,
          type: movie.type || '',
          category: Array.isArray(movie.category) ? movie.category.map(item => typeof item === 'string' ? item : item.name).filter(Boolean) : [],
          quality: movie.quality,
          lang: movie.lang
        });

        if (res && res.status && res.data) {
          if (res.data.added) {
            window.showToast(`Đã thêm "${movie.name}" vào danh sách yêu thích!`);
            renderFavorite(true);
          } else {
            window.showToast(`Đã xóa "${movie.name}" khỏi danh sách yêu thích!`);
            renderFavorite(false);
          }
        } else {
          window.showToast(res?.message || 'Vui lòng đăng nhập để lưu phim vào danh sách yêu thích', 'error');
          setTimeout(() => {
            window.location.href = `/auth?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
          }, 800);
        }
      };
    }

    // Share Button
    const shareBtn = document.querySelector('button[title="Chia sẻ phim"]');
    if (shareBtn) {
      shareBtn.onclick = () => {
        navigator.clipboard.writeText(window.location.href);
        window.showToast('Đã sao chép liên kết phim vào bộ nhớ tạm!');
      };
    }


    // Download Button
    const downloadBtn = document.querySelector('button[title="Tải xuống tập phim"]');
    if (downloadBtn) {
      downloadBtn.onclick = () => {
        const firstEpSlug = episodes?.[0]?.server_data?.[0]?.slug || 'tap-1';
        window.showToast(`Chuyển đến trình phát tập ${firstEpSlug} để tải về...`, 'info');
        setTimeout(() => {
          window.location.href = `/xem-phim/${movie.slug}/${firstEpSlug}`;
        }, 500);
      };
    }

    // Synopsis
    const synopsis = document.getElementById('synopsis-text');
    if (synopsis) {
      synopsis.innerText = movie.content || 'Nội dung phim đang được cập nhật...';
    }

    // Cast & Crew Rail with Avatars (Powered by TMDb & IMDb)
    const castContainer = document.getElementById('detail-cast-crew-section') ||
                          document.querySelector('div.border-t.border-transparent.bg-surface-container-lowest\\/60');
    if (castContainer) {
      function getPersonUrl(name, isDirector = false) {
        if (!name || !name.trim()) return '/kham-pha';
        const cleanName = name.trim();
        const base = isDirector ? 'dao-dien' : 'dien-vien';
        const slug = cleanName
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[đĐ]/g, 'd')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');

        if (slug && slug.length > 0) {
          return `/${base}/${slug}?name=${encodeURIComponent(cleanName)}`;
        }
        return `/${base}?name=${encodeURIComponent(cleanName)}`;
      }

      function attachCastScroll(wrapper) {
        const carousel = wrapper.querySelector('.cast-carousel');
        const prevBtn = wrapper.querySelector('.cast-scroll-prev');
        const nextBtn = wrapper.querySelector('.cast-scroll-next');
        if (!carousel) return;
        if (prevBtn) {
          prevBtn.onclick = (e) => {
            e.preventDefault();
            carousel.scrollBy({ left: -300, behavior: 'smooth' });
          };
        }
        if (nextBtn) {
          nextBtn.onclick = (e) => {
            e.preventDefault();
            carousel.scrollBy({ left: 300, behavior: 'smooth' });
          };
        }
      }

      // If SSR already rendered the full cast-crew-wrapper, preserve it and just attach scroll events
      const existingWrapper = castContainer.querySelector('.cast-crew-wrapper');
      if (existingWrapper && existingWrapper.querySelector('.cast-carousel img')) {
        attachCastScroll(castContainer);
      } else {
        const credits = movie.credits || {};
        let directorsList = [...(credits.directors || movie.tmdb_directors || [])];
        let actorsList = [...(credits.cast || movie.tmdb_cast || [])];

        const seenDirs = new Set(directorsList.map(d => (d.name || '').toLowerCase().trim()));
        const seenActors = new Set(actorsList.map(a => (a.name || '').toLowerCase().trim()));

        if (Array.isArray(movie.director)) {
          movie.director.filter(Boolean).forEach(d => {
            const clean = d.trim();
            if (clean && !seenDirs.has(clean.toLowerCase())) {
              seenDirs.add(clean.toLowerCase());
              directorsList.push({
                name: clean,
                character: 'Đạo diễn',
                avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(clean)}&background=1d1f29&color=f59e0b&size=256&bold=true`,
                isDirector: true
              });
            }
          });
        }

        if (Array.isArray(movie.actor)) {
          movie.actor.filter(Boolean).forEach(a => {
            const clean = a.trim();
            if (clean && !seenActors.has(clean.toLowerCase())) {
              seenActors.add(clean.toLowerCase());
              actorsList.push({
                name: clean,
                character: 'Diễn viên',
                avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(clean)}&background=e50914&color=fff&size=256&bold=true`,
                isDirector: false
              });
            }
          });
        }

        const totalCount = directorsList.length + actorsList.length;
        if (totalCount > 0) {
          castContainer.innerHTML = `
            <div class="cast-crew-wrapper col-span-full w-full bg-surface-container-low rounded-xl p-space-md lg:p-space-lg flex flex-col gap-space-sm shadow-md border border-white/5">
              <div class="flex items-center justify-between border-b border-white/5 pb-2.5">
                <div class="flex items-center gap-2">
                  <span class="w-2 h-5 rounded-full bg-primary-container inline-block"></span>
                  <span class="font-headline-sm text-headline-sm font-bold text-on-surface flex items-center gap-2">
                    <span class="material-symbols-outlined text-primary-container text-[20px]">recent_actors</span>
                    <span>Đạo Diễn & Diễn Viên</span>
                    <span class="px-2 py-0.5 rounded-full bg-surface-container text-primary font-label-badge text-label-badge font-bold">${totalCount}</span>
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[12px] text-on-surface-variant/70 hidden md:inline mr-1">Chạm vào nghệ sĩ để xem tiểu sử & danh sách phim TMDb</span>
                  <button type="button" class="cast-scroll-prev p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer" title="Cuộn sang trái">
                    <span class="material-symbols-outlined text-[20px]">chevron_left</span>
                  </button>
                  <button type="button" class="cast-scroll-next p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer" title="Cuộn sang phải">
                    <span class="material-symbols-outlined text-[20px]">chevron_right</span>
                  </button>
                </div>
              </div>

              <div class="cast-carousel flex items-start gap-3 sm:gap-4 overflow-x-auto pb-2 pt-2 scrollbar-none scroll-smooth">
                ${directorsList.map(d => {
                  const fallback = `https://ui-avatars.com/api/?name=${pathSegment(d.name)}&background=1d1f29&color=f59e0b&size=256&bold=true`;
                  const avatarUrl = d.avatar || fallback;
                  return `
                    <a href="${escapeHtml(getPersonUrl(d.name, true))}" class="group flex flex-col items-center gap-2 shrink-0 text-center w-24 sm:w-28 p-2 rounded-xl hover:bg-surface-container/60 transition-all cursor-pointer" title="Đạo diễn: ${escapeHtml(d.name)}">
                      <div class="relative w-18 h-18 sm:w-20 sm:h-20 rounded-full overflow-hidden p-0.5 ring-2 ring-amber-500/80 bg-surface-container shadow-lg group-hover:scale-105 group-hover:ring-amber-400 group-hover:shadow-[0_0_20px_rgba(245,158,11,0.4)] transition-all duration-300">
                        <img src="${escapeHtml(safeUrl(avatarUrl))}" alt="${escapeHtml(d.name)}" class="w-full h-full object-cover rounded-full" loading="lazy" onerror="this.onerror=null;this.src='${fallback}';" />
                        <span class="absolute bottom-0 inset-x-0 bg-amber-500/90 text-black text-[9px] font-black uppercase tracking-wider py-0.5 text-center">Đạo Diễn</span>
                      </div>
                      <div class="w-full">
                        <span class="text-xs sm:text-[13px] font-bold text-white group-hover:text-primary transition-colors line-clamp-1 block">${escapeHtml(d.name)}</span>
                        <span class="text-[11px] text-amber-400/90 font-medium line-clamp-1 mt-0.5">Đạo diễn</span>
                      </div>
                    </a>
                  `;
                }).join('')}

                ${actorsList.map(a => {
                  const fallback = `https://ui-avatars.com/api/?name=${pathSegment(a.name)}&background=1d1f29&color=e50914&size=256&bold=true`;
                  const avatarUrl = a.avatar || fallback;
                  return `
                    <a href="${escapeHtml(getPersonUrl(a.name, false))}" class="group flex flex-col items-center gap-2 shrink-0 text-center w-24 sm:w-28 p-2 rounded-xl hover:bg-surface-container/60 transition-all cursor-pointer" title="Diễn viên: ${escapeHtml(a.name)} (${escapeHtml(a.character || 'Diễn viên')})">
                      <div class="relative w-18 h-18 sm:w-20 sm:h-20 rounded-full overflow-hidden p-0.5 ring-2 ring-white/20 bg-surface-container shadow-lg group-hover:scale-105 group-hover:ring-primary-container group-hover:shadow-[0_0_20px_rgba(229,9,20,0.5)] transition-all duration-300">
                        <img src="${escapeHtml(safeUrl(avatarUrl))}" alt="${escapeHtml(a.name)}" class="w-full h-full object-cover rounded-full" loading="lazy" onerror="this.onerror=null;this.src='${fallback}';" />
                      </div>
                      <div class="w-full">
                        <span class="text-xs sm:text-[13px] font-bold text-white group-hover:text-primary transition-colors line-clamp-1 block">${escapeHtml(a.name)}</span>
                        <span class="text-[11px] text-on-surface-variant line-clamp-1 mt-0.5" title="${escapeHtml(a.character || 'Diễn viên')}">${escapeHtml(a.character || 'Diễn viên')}</span>
                      </div>
                    </a>
                  `;
                }).join('')}
              </div>
            </div>
          `;
          attachCastScroll(castContainer);
        }
      }
    }

    // Episodes & Servers Section
    renderEpisodesSection(movie, episodes);

    // Reviews & Star Ratings
    initDetailReviewsAndRatings(movie, episodes);

    // Related movies
    renderRelated(movie, related);
  }


  function renderEpisodesSection(movie, episodes) {
    cleanupAutoNext();
    const selectorSection = document.getElementById('episode-selector');
    if (!selectorSection) return;
    const watchBtn = document.querySelector('#detail-action-deck > a') || document.querySelector('a.bg-primary-container');

    if (!episodes || episodes.length === 0) {
      selectorSection.innerHTML = `
        <div class="bg-surface-container-low rounded-2xl p-space-lg text-center text-on-surface-variant">
          <span class="material-symbols-outlined text-[48px] text-surface-variant mb-2">hourglass_empty</span>
          <p class="font-headline-sm">Tập phim đang được cập nhật. Vui lòng quay lại sau!</p>
        </div>
      `;
      return;
    }

    let activeServerIndex = Math.max(0, episodes.findIndex(server => server.server_data?.length));
    let activeRangeIndex = 0;
    let isAscending = true;
    let isAutoNext = false;

    const serverPicker = selectorSection.querySelector('div.flex.flex-wrap.items-center.gap-space-xs.bg-surface-container-highest');
    const episodeGrid = selectorSection.querySelector('div.grid.grid-cols-1.sm\\:grid-cols-2.lg\\:grid-cols-4');
    const rangeContainer = document.getElementById('episode-range-container') ||
                           selectorSection.querySelector('div.flex.items-center.gap-2:has(.range-tab)') ||
                           selectorSection.querySelector('div.flex.items-center.gap-2');
    const loadMoreBtn = selectorSection.querySelector('div.mt-space-lg.flex.justify-center button');
    const autoNextBtn = document.getElementById('btn-toggle-autonext');
    const autoNextIndicator = document.getElementById('autonext-indicator');
    const autoNextText = document.getElementById('autonext-status-text');
    const reverseBtn = document.getElementById('btn-reverse-episodes');
    const sortIcon = document.getElementById('sort-order-icon');

    // Use the same confirmed account/guest preferences as the watch player.
    if (autoNextBtn) {
      const page = window.location.pathname + window.location.search;
      let active = true, controller = null, unsubscribe = null, loading = true, ownerId;
      let identityTask = null, refreshQueued = false;
      let preferenceState = { ready: false, busy: false, error: '' };
      const isCurrent = () => active && page === window.location.pathname + window.location.search &&
        document.getElementById('btn-toggle-autonext') === autoNextBtn;
      cleanupAutoNext = () => {
        active = false; refreshQueued = false; unsubscribe?.(); controller?.destroy();
        window.removeEventListener('focus', refreshAutoNext);
        window.removeEventListener('storage', storageAutoNext);
        window.removeEventListener('ttphim:auth-changed', refreshAutoNext);
        window.removeEventListener('cineviet:profile-updated', refreshAutoNext);
        window.removeEventListener('pageshow', restoredAutoNext);
        document.removeEventListener('visibilitychange', visibleAutoNext);
      };
      function updateAutoNextUI() {
        if (!isCurrent()) return;
        autoNextBtn.disabled = loading || preferenceState.busy;
        autoNextBtn.setAttribute('aria-busy', String(loading || preferenceState.busy));
        autoNextBtn.setAttribute('aria-pressed', String(isAutoNext));
        autoNextBtn.title = preferenceState.error || '';
        if (autoNextIndicator) autoNextIndicator.className = isAutoNext && preferenceState.ready
          ? 'w-2 h-2 rounded-full bg-emerald-400 inline-block shadow-[0_0_8px_rgba(52,211,153,0.8)]'
          : 'w-2 h-2 rounded-full bg-outline/60 inline-block';
        if (autoNextText) {
          autoNextText.className = isAutoNext && preferenceState.ready ? 'text-emerald-400' : 'text-outline';
          autoNextText.innerText = loading ? 'ĐANG TẢI...' : !preferenceState.ready ? 'THỬ LẠI' : isAutoNext ? 'BẬT' : 'TẮT';
        }
      }
      async function loadAutoNext(reload = false) {
        if (identityTask) return identityTask;
        loading = true;
        updateAutoNextUI();
        const operation = (async () => {
          try {
            const user = await API.getMe();
            if (!isCurrent()) return null;
            const nextOwner = user?.id == null ? null : String(user.id);
            const changed = Boolean(controller) && nextOwner !== ownerId;
            if (!controller || changed) {
              unsubscribe?.(); controller?.destroy(); ownerId = nextOwner;
              const nextController = window.PlayerPreferences.create({ api: API, user });
              controller = nextController;
              unsubscribe = controller.subscribe((value, state) => {
                if (!isCurrent() || controller !== nextController) return;
                isAutoNext = value.auto_next; preferenceState = state;
                updateAutoNextUI();
              });
              reload = true;
            }
            if (reload || !preferenceState.ready) await controller.load();
            return { ready: preferenceState.ready, changed };
          } catch (_) {
            preferenceState = { ready: false, busy: false, error: 'Chưa tải được tùy chọn. Vui lòng thử lại.' };
            return null;
          } finally { loading = false; updateAutoNextUI(); }
        })();
        identityTask = operation;
        try { return await operation; }
        finally {
          if (identityTask === operation) identityTask = null;
          if (refreshQueued && isCurrent()) { refreshQueued = false; void loadAutoNext(true); }
        }
      }
      function refreshAutoNext() {
        if (!isCurrent()) return;
        if (identityTask) { refreshQueued = true; return; }
        void loadAutoNext(true);
      }
      function storageAutoNext(event) { if (event.key === 'kk_user' || event.key === null) refreshAutoNext(); }
      function visibleAutoNext() { if (document.visibilityState === 'visible') refreshAutoNext(); }
      function restoredAutoNext(event) { if (event.persisted) refreshAutoNext(); }
      window.addEventListener('focus', refreshAutoNext);
      window.addEventListener('storage', storageAutoNext);
      window.addEventListener('ttphim:auth-changed', refreshAutoNext);
      window.addEventListener('cineviet:profile-updated', refreshAutoNext);
      window.addEventListener('pageshow', restoredAutoNext);
      document.addEventListener('visibilitychange', visibleAutoNext);
      autoNextBtn.onclick = async () => {
        if (!isCurrent() || loading || preferenceState.busy) return;
        const wasReady = preferenceState.ready;
        const result = await loadAutoNext();
        if (!isCurrent() || !result?.ready || !wasReady) return;
        if (result.changed || loading) {
          window.showToast?.('Tài khoản đã thay đổi. Tùy chọn đã được tải lại; hãy bấm lại để thay đổi.');
          return;
        }
        const target = controller;
        const saved = await target.update({ auto_next: !isAutoNext });
        if (!isCurrent() || target !== controller) return;
        if (saved) window.showToast?.(target.get().auto_next ? 'Đã BẬT tự động chuyển tập tiếp theo' : 'Đã TẮT tự động chuyển tập');
        else window.showToast?.(preferenceState.error || 'Chưa lưu được tùy chọn. Vui lòng thử lại.', 'error');
      };
      loadAutoNext(true);
    }

    // Setup Reverse Sort Toggle
    if (reverseBtn) {
      reverseBtn.onclick = () => {
        isAscending = !isAscending;
        if (sortIcon) {
          sortIcon.style.transform = isAscending ? 'rotate(0deg)' : 'rotate(180deg)';
          sortIcon.classList.toggle('text-primary-container', !isAscending);
        }
        activeRangeIndex = 0;
        window.showToast(isAscending ? 'Sắp xếp: Tập 1 đến mới nhất' : 'Sắp xếp: Tập mới nhất đến tập 1');
        renderEpisodesList();
      };
    }

    function renderServerTabs() {
      if (window.EpisodeSources && serverPicker) {
        EpisodeSources.render(serverPicker, episodes, activeServerIndex, index => {
          activeServerIndex = index;
          activeRangeIndex = 0;
          renderServerTabs();
          renderEpisodesList();
          const firstEp = EpisodeSources.playable(episodes[index])[0];
          if (watchBtn && firstEp) {
            watchBtn.href = `/xem-phim/${pathSegment(movie.slug)}/${pathSegment(firstEp.slug)}?server=${index}`;
            const label = watchBtn.querySelector('span:last-child');
            if (label) label.textContent = `Xem phim ngay (${firstEp.name || 'Tập 1'})`;
          }
        });
        return;
      }
      if (!serverPicker) return;
      serverPicker.innerHTML = episodes.map((srv, idx) => {
        const sName = srv.server_name || `Server #${idx + 1}`;
        const icon = idx === 0 ? 'bolt' : (sName.includes('Song Ngữ') || sName.includes('Thuyết minh') ? 'record_voice_over' : 'subtitles');
        return `
        <button class="server-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-label-md text-label-md transition-all cursor-pointer ${idx === activeServerIndex ? 'bg-primary-container text-on-primary-container font-bold shadow-sm' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'}" data-index="${idx}" type="button">
          <span class="material-symbols-outlined text-[16px]">${icon}</span>
          <span>${escapeHtml(sName)}</span>
        </button>
      `;
      }).join('');

      serverPicker.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          activeServerIndex = parseInt(btn.dataset.index, 10);
          activeRangeIndex = 0;
          renderServerTabs();
          renderEpisodesList();
          // Update main Watch Now CTA button to match chosen server
          const firstEp = episodes[activeServerIndex]?.server_data?.[0];
          if (watchBtn && firstEp) {
            watchBtn.href = `/xem-phim/${movie.slug}/${firstEp.slug}?server=${activeServerIndex}`;
            const watchLabel = watchBtn.querySelector('span:last-child');
            if (watchLabel) {
              watchLabel.innerText = `Xem Phim Ngay (Tập ${cleanEpName(firstEp.name)})`;
            }
          }
        });
      });
    }

    function renderEpisodesList() {
      if (!episodeGrid) return;
      const currentServer = episodes[activeServerIndex];
      const rawEps = window.EpisodeSources?.playable(currentServer) || currentServer?.server_data || [];
      const allEps = isAscending ? [...rawEps] : [...rawEps].reverse();

      if (allEps.length === 0) {
        episodeGrid.innerHTML = `<div class="col-span-full p-8 text-center text-on-surface-variant">Server này chưa có tập phim nào</div>`;
        if (rangeContainer) rangeContainer.innerHTML = '';
        if (loadMoreBtn) loadMoreBtn.parentElement.style.display = 'none';
        return;
      }

      // Smart dynamic chunk size
      let chunkSize = 25;
      if (allEps.length <= 25) {
        chunkSize = allEps.length || 1;
      } else if (allEps.length <= 60) {
        chunkSize = 25;
      } else {
        chunkSize = 50;
      }
      const totalRanges = Math.ceil(allEps.length / chunkSize);

      if (rangeContainer && totalRanges > 1) {
        if (totalRanges <= 4) {
          // Pill tabs in a neat single row that never wraps
          rangeContainer.className = 'flex items-center gap-2 min-w-0 max-w-full';
          rangeContainer.innerHTML = `
            <span class="text-body-sm font-medium text-on-surface-variant shrink-0 flex items-center gap-1">
              <span class="material-symbols-outlined text-[16px] text-primary">view_carousel</span>
              <span class="hidden sm:inline">Phân đoạn:</span>
            </span>
            <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              ${Array.from({ length: totalRanges }).map((_, rIdx) => {
                const startEp = allEps[rIdx * chunkSize];
                const endEp = allEps[Math.min((rIdx + 1) * chunkSize - 1, allEps.length - 1)];
                const startName = startEp ? cleanEpName(startEp.name) : `${rIdx * chunkSize + 1}`;
                const endName = endEp ? cleanEpName(endEp.name) : `${Math.min((rIdx + 1) * chunkSize, allEps.length)}`;
                const label = startName !== endName 
                  ? `Tập ${startName} - ${endName}` 
                  : `Tập ${startName}`;
                const isActive = rIdx === activeRangeIndex;
                return `
                  <button class="range-tab shrink-0 px-3 py-1 rounded-lg font-label-md text-label-md font-semibold transition-all cursor-pointer ${isActive ? 'bg-primary-container text-on-primary-container shadow-sm' : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface'}" data-range="${rIdx}" type="button">
                    ${escapeHtml(label)}
                  </button>
                `;
              }).join('')}
            </div>
          `;

          rangeContainer.querySelectorAll('.range-tab').forEach(b => {
            b.addEventListener('click', () => {
              activeRangeIndex = parseInt(b.dataset.range, 10);
              renderEpisodesList();
            });
          });
        } else {
          // Netflix-style Dropdown Select for 5+ ranges (e.g. 100-200+ episodes)
          rangeContainer.className = 'flex items-center gap-2 min-w-0';
          rangeContainer.innerHTML = `
            <span class="text-body-sm font-medium text-on-surface-variant shrink-0 flex items-center gap-1">
              <span class="material-symbols-outlined text-[18px] text-primary">view_carousel</span>
              <span class="font-semibold text-on-surface">Đoạn tập:</span>
            </span>
            <div class="relative inline-flex items-center">
              <select id="episode-range-select" class="range-select appearance-none bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-semibold text-xs sm:text-sm py-1.5 pl-3 pr-8 rounded-lg border border-outline-variant/30 focus:border-primary focus:outline-none transition-all cursor-pointer shadow-sm">
                ${Array.from({ length: totalRanges }).map((_, rIdx) => {
                  const startEp = allEps[rIdx * chunkSize];
                  const endEp = allEps[Math.min((rIdx + 1) * chunkSize - 1, allEps.length - 1)];
                  const startName = startEp ? cleanEpName(startEp.name) : `${rIdx * chunkSize + 1}`;
                  const endName = endEp ? cleanEpName(endEp.name) : `${Math.min((rIdx + 1) * chunkSize, allEps.length)}`;
                  const label = startName !== endName 
                    ? `Tập ${startName} - ${endName}` 
                    : `Tập ${startName}`;
                  const countInChunk = Math.min((rIdx + 1) * chunkSize, allEps.length) - (rIdx * chunkSize);
                  return `<option value="${rIdx}" ${rIdx === activeRangeIndex ? 'selected' : ''}>${escapeHtml(label)} (${countInChunk} tập)</option>`;
                }).join('')}
              </select>
              <span class="material-symbols-outlined absolute right-2 pointer-events-none text-on-surface-variant text-[18px]">expand_more</span>
            </div>
            <div class="flex items-center gap-0.5">
              <button type="button" id="btn-range-prev" class="p-1 rounded-md bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none" title="Đoạn trước" ${activeRangeIndex === 0 ? 'disabled' : ''}>
                <span class="material-symbols-outlined text-[18px]">chevron_left</span>
              </button>
              <button type="button" id="btn-range-next" class="p-1 rounded-md bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none" title="Đoạn kế tiếp" ${activeRangeIndex === totalRanges - 1 ? 'disabled' : ''}>
                <span class="material-symbols-outlined text-[18px]">chevron_right</span>
              </button>
            </div>
            <span class="text-xs text-on-surface-variant font-medium hidden md:inline">(${allEps.length} tập)</span>
          `;

          const rangeSelect = rangeContainer.querySelector('#episode-range-select');
          if (rangeSelect) {
            rangeSelect.addEventListener('change', e => {
              activeRangeIndex = parseInt(e.target.value, 10);
              renderEpisodesList();
            });
          }
          const prevBtn = rangeContainer.querySelector('#btn-range-prev');
          const nextBtn = rangeContainer.querySelector('#btn-range-next');
          if (prevBtn) {
            prevBtn.onclick = () => {
              if (activeRangeIndex > 0) {
                activeRangeIndex--;
                renderEpisodesList();
              }
            };
          }
          if (nextBtn) {
            nextBtn.onclick = () => {
              if (activeRangeIndex < totalRanges - 1) {
                activeRangeIndex++;
                renderEpisodesList();
              }
            };
          }
        }
      } else if (rangeContainer) {
        rangeContainer.className = 'flex items-center gap-2';
        rangeContainer.innerHTML = `
          <span class="material-symbols-outlined text-[16px] text-primary">video_library</span>
          <span class="text-body-sm font-medium text-on-surface-variant">Trọn bộ ${allEps.length} tập</span>
        `;
      }

      // Slice current range
      const displayedEps = totalRanges > 1 ? allEps.slice(activeRangeIndex * chunkSize, (activeRangeIndex + 1) * chunkSize) : allEps;
      episodeGrid.innerHTML = displayedEps.map(ep => {
        const epLabel = /full/i.test(ep.name) ? 'Bản Full' : `Tập ${cleanEpName(ep.name)}`;
        return `<a class="episode-choice" data-episode-thumb href="/xem-phim/${pathSegment(movie.slug)}/${pathSegment(ep.slug)}?server=${activeServerIndex}" aria-label="Xem ${escapeHtml(epLabel)}"><span class="episode-choice-copy"><span class="episode-choice-label">${escapeHtml(epLabel)}</span><span class="episode-choice-subtitle">${escapeHtml(movie.name)}</span></span><span class="episode-choice-play material-symbols-outlined" aria-hidden="true">play_arrow</span></a>`;
      }).join('');
      window.EpisodeSources?.decorateThumbnails(episodeGrid, displayedEps, movie);

      // Update loadMoreBtn
      if (loadMoreBtn) {
        if (activeRangeIndex < totalRanges - 1) {
          loadMoreBtn.parentElement.style.display = 'flex';
          const nextStart = (activeRangeIndex + 1) * chunkSize + 1;
          const nextEnd = Math.min((activeRangeIndex + 2) * chunkSize, allEps.length);
          loadMoreBtn.innerHTML = `
            <span>Xem tiếp các tập ${nextStart} - ${nextEnd}</span>
            <span class="material-symbols-outlined text-[18px]">expand_more</span>
          `;
          loadMoreBtn.onclick = () => {
            activeRangeIndex++;
            renderEpisodesList();
          };
        } else {
          loadMoreBtn.parentElement.style.display = 'none';
        }
      }
    }

    // Netflix-style Season / Parts Selector
    async function loadMovieSeasons() {
      const seasonsWrapper = document.getElementById('movie-seasons-wrapper');
      const seasonsSelect = document.getElementById('movie-seasons-select');
      if (!seasonsWrapper || !seasonsSelect) return;
      try {
        const seasons = await API.getMovieSeasons(movie.slug);
        if (Array.isArray(seasons) && seasons.length > 1) {
          seasonsSelect.innerHTML = seasons.map(s => {
            return `<option value="${escapeHtml(s.slug)}" ${s.is_current ? 'selected' : ''}>${escapeHtml(s.label || s.name)}</option>`;
          }).join('');
          seasonsWrapper.classList.remove('hidden');
          seasonsWrapper.classList.add('flex');
          seasonsSelect.onchange = e => {
            const nextSlug = e.target.value;
            if (nextSlug && nextSlug !== movie.slug) {
              window.location.href = `/phim/${pathSegment(nextSlug)}`;
            }
          };
        } else {
          seasonsWrapper.classList.add('hidden');
          seasonsWrapper.classList.remove('flex');
        }
      } catch (_) {
        seasonsWrapper.classList.add('hidden');
        seasonsWrapper.classList.remove('flex');
      }
    }

    loadMovieSeasons();
    renderServerTabs();
    renderEpisodesList();
  }

  // --- Real Reviews & Star Ratings in Detail Page ---
  function initDetailReviewsAndRatings(movie, episodes = []) {
    window.MovieRatings?.mount(movie);
    const commentListContainer = document.getElementById('detail-comments-list') || document.querySelector('div.space-y-space-sm');
    const reviewForm = document.getElementById('detail-review-form') || document.querySelector('form[onsubmit="event.preventDefault();"]');

    let currentSort = 'newest'; // 'newest' | 'featured'
    let currentUser = null;

    // Load current user for form identity
    try {
      const stored = localStorage.getItem('kk_user');
      if (stored) currentUser = JSON.parse(stored);
    } catch (e) {}

    const formAvatar = document.getElementById('comment-form-avatar');
    const formUserName = document.getElementById('comment-form-username');
    if (currentUser) {
      if (formAvatar && currentUser.avatar) { formAvatar.src = safeUrl(currentUser.avatar); formAvatar.dataset.avatarUser = currentUser.id; }
      if (formUserName) formUserName.innerHTML = `${escapeHtml(currentUser.name)} <span class="px-2 py-0.5 rounded-full bg-primary-container/20 text-primary-fixed-dim text-[10px] font-bold">Thành Viên</span>`;
    }

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


    const textarea = document.getElementById('detail-comment-textarea') || reviewForm?.querySelector('textarea');
    let reviewRequest = 0;
    const threadScope = commentListContainer && window.CommentThreads?.scope({ list: commentListContainer, servers: episodes, onChange: () => loadReviews() });
    const commentEpisode = threadScope?.composer(textarea);

    // Sort Filter Tabs
    const sortNewestBtn = document.getElementById('btn-sort-newest');
    const sortFeaturedBtn = document.getElementById('btn-sort-featured');
    if (sortNewestBtn && sortFeaturedBtn) {
      sortNewestBtn.onclick = () => {
        currentSort = 'newest';
        sortNewestBtn.className = 'px-3 py-1 rounded bg-surface-container-highest text-on-surface font-label-badge text-label-badge transition-colors cursor-pointer';
        sortFeaturedBtn.className = 'px-3 py-1 rounded hover:bg-surface-container-high text-on-surface-variant font-label-badge text-label-badge transition-colors cursor-pointer';
        loadReviews();
      };

      sortFeaturedBtn.onclick = () => {
        currentSort = 'featured';
        sortFeaturedBtn.className = 'px-3 py-1 rounded bg-surface-container-highest text-on-surface font-label-badge text-label-badge transition-colors cursor-pointer';
        sortNewestBtn.className = 'px-3 py-1 rounded hover:bg-surface-container-high text-on-surface-variant font-label-badge text-label-badge transition-colors cursor-pointer';
        loadReviews();
      };
    }

    // 2. Load & Render Real Comments
    async function loadReviews() {
      if (!commentListContainer) return;
      const request = ++reviewRequest;
      let comments;
      try { comments = await API.getComments(movie.slug); }
      catch (_) { if (request === reviewRequest) commentListContainer.textContent = 'Chưa tải được bình luận. Hãy chọn lại bộ lọc để thử lại.'; return; }
      if (request !== reviewRequest) return;
      if (threadScope) comments = threadScope.filter(comments);
      const countBadge = document.getElementById('comment-count-badge');
      if (countBadge) countBadge.innerText = comments.length.toLocaleString('vi-VN');

      if (currentSort === 'featured') {
        comments.sort((a, b) => (b.likes || 0) - (a.likes || 0));
      } else {
        comments.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      }

      if (comments.length === 0) {
        commentListContainer.innerHTML = `
          <div class="py-12 text-center text-on-surface-variant bg-surface-container-low rounded-2xl flex flex-col items-center gap-2">
            <span class="material-symbols-outlined text-[36px] text-surface-variant">chat_bubble_outline</span>
            <p class="font-body-md">Chưa có bình luận trong mục này.</p>
          </div>
        `;
        return;
      }

      const likedIds = getLikedCommentIds();

      commentListContainer.innerHTML = comments.map(c => {
        const isLiked = c.liked === true;
        const relTime = formatRelativeTime(c.created_at);
        const score = c.rating == null ? 0 : Math.min(5, Math.max(0, Number(c.rating) || 0));
        const replies = c.replies || [];

        return `
        <div class="p-space-md rounded-2xl bg-surface-container-low transition-all border border-white/5 shadow-sm space-y-3" id="comment-card-${escapeHtml(c.id)}">
          <div class="flex items-start justify-between gap-space-sm">
            <div class="flex items-center gap-3">
              <img data-avatar-user="${escapeHtml(c.user_id || '')}" class="w-10 h-10 rounded-full object-cover shrink-0 ring-1 ring-white/10" src="${escapeHtml(safeUrl(c.user_avatar || '/images/avatar-default.svg'))}" alt="${escapeHtml(c.user_name)}" />
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-label-lg text-label-lg text-on-surface font-semibold">${escapeHtml(c.user_name)}</span>
                  <span class="px-2 py-0.5 rounded-full bg-surface-container-highest text-secondary-fixed font-label-badge text-[10px] font-bold">${c.user_role === 'admin' ? 'Quản trị viên' : 'Thành viên'}</span>
                </div>
                <span class="text-body-sm font-body-sm text-on-surface-variant">${relTime}</span>
              </div>
            </div>
            
            <div class="flex text-[#E2B616] shrink-0" ${score ? '' : 'hidden'} title="${Number(score) || 0}/5 sao">
              ${Array.from({ length: 5 }).map((_, i) => `
                <span class="material-symbols-outlined text-[16px]" style="font-variation-settings: 'FILL' ${i < score ? 1 : 0};">${i < score ? 'star' : 'star'}</span>
              `).join('')}
            </div>
          </div>

          <!-- Comment Body / Spoiler Handling -->
          ${c.is_spoil ? `
            <div class="spoiler-wrapper relative rounded-xl bg-surface-container p-3 border border-amber-500/30 overflow-hidden">
              <div class="spoiler-notice flex items-center justify-between text-xs text-amber-400 font-semibold mb-1">
                <span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">visibility_off</span> Cảnh báo: Bình luận có chứa chi tiết Spoil phim</span>
                <button type="button" class="btn-toggle-spoiler text-xs text-primary underline cursor-pointer hover:brightness-125">Bấm để xem</button>
              </div>
              <p class="spoiler-body text-body-md font-body-md text-on-surface filter blur-[5px] select-none transition-all duration-300 leading-relaxed">${escapeHtml(c.content)}</p>
            </div>
          ` : `
            <p class="text-body-md font-body-md text-on-surface leading-relaxed">${escapeHtml(c.content)}</p>
          `}

          <!-- Actions Bar -->
          <div class="flex items-center gap-space-lg text-body-sm font-body-sm text-on-surface-variant pt-1 border-t border-surface-container-highest/60">
            <button class="btn-like-review flex items-center gap-1.5 ${isLiked ? 'text-primary font-bold' : 'hover:text-primary'} transition-colors cursor-pointer" data-id="${escapeHtml(c.id)}" data-liked="${isLiked}">
              <span class="material-symbols-outlined text-[18px]">${isLiked ? 'favorite' : 'thumb_up'}</span>
              <span class="like-counter">${Number(c.likes) || 0}</span>
            </button>
            <button class="flex items-center gap-1.5 hover:text-on-surface transition-colors cursor-pointer btn-open-reply" data-id="${escapeHtml(c.id)}" data-name="${escapeHtml(c.user_name)}">
              <span class="material-symbols-outlined text-[18px]">reply</span>
              <span>Trả lời (${replies.length})</span>
            </button>
          </div>

          <!-- Inline Reply Box (Hidden by default) -->
          <div class="reply-box-container hidden pt-2 border-t border-surface-container-highest" id="reply-box-${escapeHtml(c.id)}">
            <div class="flex gap-2 items-center">
              <input type="text" class="reply-input flex-1 px-3.5 py-2 rounded-xl bg-surface-container text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:bg-surface-container-high transition-colors" placeholder="Viết phản hồi cho ${escapeHtml(c.user_name)}..." />
              <button type="button" class="btn-send-reply px-4 py-2 rounded-xl bg-primary-container text-on-primary-container text-xs font-bold hover:brightness-110 cursor-pointer shadow-md flex items-center gap-1 shrink-0" data-id="${escapeHtml(c.id)}">
                <span>Gửi</span>
                <span class="material-symbols-outlined text-[14px]">send</span>
              </button>
              <button type="button" class="btn-close-reply p-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface cursor-pointer shrink-0" data-id="${escapeHtml(c.id)}">
                <span class="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          </div>

          <!-- Nested Replies List -->
          ${replies.length > 0 ? `
            <div data-comment-replies class="space-y-2.5 pl-4 sm:pl-6 border-l-2 border-surface-container-highest pt-1">
              ${replies.map(r => `
                <div class="bg-surface-container/60 p-2.5 rounded-xl space-y-1">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <img data-avatar-user="${escapeHtml(r.user_id || '')}" src="${escapeHtml(safeUrl(r.user_avatar || '/favicon.svg'))}" class="w-6 h-6 rounded-full object-cover shrink-0" />
                      <span class="font-label-md text-xs font-bold text-on-surface">${escapeHtml(r.user_name)}</span>
                      <span class="text-[11px] text-on-surface-variant">${formatRelativeTime(r.created_at)}</span>
                    </div>
                  </div>
                  <p class="text-xs text-on-surface-variant pl-8 leading-relaxed">${escapeHtml(r.content)}</p>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
      }).join('');
      window.CommentThreads?.protect(commentListContainer, comments, 'comment-card-');

      // Wire up Spoiler Toggles
      commentListContainer.querySelectorAll('.btn-toggle-spoiler').forEach(btn => {
        if (window.CommentThreads) return;
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

      // Wire up Like Buttons (Toggle Like/Unlike)
      commentListContainer.querySelectorAll('.btn-like-review').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const currentlyLiked = btn.dataset.liked === 'true';
          const newAction = currentlyLiked ? 'unlike' : 'like';

          const counter = btn.querySelector('.like-counter');
          const icon = btn.querySelector('.material-symbols-outlined');

          if (btn.disabled) return;
          btn.disabled = true;
          let newLikes;
          try { newLikes = await API.likeComment(id, newAction); }
          catch (error) {
            window.showToast?.(error.message || 'Không thể thích bình luận. Vui lòng thử lại.', 'error');
            if (error.httpStatus === 401) window.location.href = `/auth?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
            return;
          } finally { btn.disabled = false; }
          toggleLikedCommentId(id, !currentlyLiked);

          btn.dataset.liked = (!currentlyLiked).toString();
          if (counter) counter.innerText = newLikes;
          if (!currentlyLiked) {
            btn.classList.add('text-primary', 'font-bold');
            if (icon) icon.innerText = 'favorite';
            window.showToast('❤️ Đã thích bình luận!');
          } else {
            btn.classList.remove('text-primary', 'font-bold');
            if (icon) icon.innerText = 'thumb_up';
          }
        });
      });

      // Wire up Reply Box Open / Close / Submit
      commentListContainer.querySelectorAll('.btn-open-reply').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const box = document.getElementById(`reply-box-${id}`);
          if (box) {
            box.classList.toggle('hidden');
            const input = box.querySelector('.reply-input');
            if (!box.classList.contains('hidden') && input) input.focus();
          }
        });
      });

      commentListContainer.querySelectorAll('.btn-close-reply').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const box = document.getElementById(`reply-box-${id}`);
          if (box) box.classList.add('hidden');
        });
      });

      commentListContainer.querySelectorAll('.btn-send-reply').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const box = document.getElementById(`reply-box-${id}`);
          const input = box?.querySelector('.reply-input');
          const content = input ? input.value.trim() : '';

          if (!content) {
            window.showToast('Vui lòng nhập nội dung phản hồi', 'error');
            return;
          }

          btn.disabled = true;
          const res = await API.postReply(id, content, currentUser?.name || 'Khán giả CineViet');
          btn.disabled = false;

          if (res.status) {
            window.showToast('Đã gửi phản hồi thành công!');
            if (input) input.value = '';
            box.classList.add('hidden');
            loadReviews();
          } else {
            window.showToast(res.message || 'Lỗi gửi phản hồi', 'error');
          }
        });
      });
    }

    // 3. Post Comment Handler
    const submitBtn = document.getElementById('btn-submit-detail-comment') || reviewForm?.querySelector('button[type="submit"]');
    const spoilCheck = document.getElementById('comment-spoil-checkbox');
    textarea?.addEventListener('keydown', event => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) { event.preventDefault(); submitBtn?.click(); }
    });

    submitBtn?.addEventListener('click', async (e) => {
      e.preventDefault();
      const content = textarea ? textarea.value.trim() : '';
      if (!content) {
        window.showToast('Vui lòng nhập nội dung cảm nhận', 'error');
        if (textarea) textarea.focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> Đang gửi...`;

      const commentPayload = {
        content,
        is_spoil: spoilCheck ? spoilCheck.checked : false,
        episode_slug: commentEpisode?.value || null,
        user_name: currentUser?.name || 'Khán giả CineViet'
      };

      let res;
      try { res = await API.postComment(movie.slug, commentPayload); }
      catch (_) { res = { status: false, message: 'Không thể gửi bình luận. Vui lòng thử lại.' }; }
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Gửi</span><span class="material-symbols-outlined" aria-hidden="true">send</span>`;

      if (res.status) {
        window.showToast('🎉 Đã gửi bình luận thành công!');
        if (textarea) textarea.value = '';
        if (spoilCheck) spoilCheck.checked = false;
        loadReviews();
      } else {
        window.showToast(res.message || 'Lỗi gửi bình luận', 'error');
      }
    });

    loadReviews();
  }

  // Wire up Similar Movies Rail scroll buttons for SSR or client load
  function initSimilarRailButtons() {
    const railSimilar = document.getElementById('rail-similar');
    const prevSimilar = document.getElementById('btn-similar-prev');
    const nextSimilar = document.getElementById('btn-similar-next');
    if (railSimilar && prevSimilar && nextSimilar) {
      prevSimilar.onclick = () => railSimilar.scrollBy({ left: -360, behavior: 'smooth' });
      nextSimilar.onclick = () => railSimilar.scrollBy({ left: 360, behavior: 'smooth' });
    }
  }
  initSimilarRailButtons();

  function renderRelated(movie, related) {
    if (!related || related.length === 0) return;
    const relSection = document.getElementById('related-movies-section');
    if (!relSection) return;

    const heading = document.getElementById('similar-movies-heading') || relSection.querySelector('h2');
    if (heading) {
      heading.innerText = `Phim Tương Tự (${movie.category?.[0]?.name || 'Điện ảnh'})`;
    }

    const rail = document.getElementById('rail-similar') || relSection.querySelector('div.flex.overflow-x-auto') || relSection.querySelector('div.grid');
    if (!rail) return;

    rail.className = 'flex overflow-x-auto gap-4 sm:gap-5 pb-4 pt-1 no-scrollbar scroll-smooth pl-1';
    rail.id = 'rail-similar';

    const formatLangBadge = (lang) => {
      if (!lang) return '';
      const clean = String(lang).trim();
      if (/vietsub\s*\+\s*thuyết\s*minh/i.test(clean)) return 'Vietsub • TM';
      if (/thuyết\s*minh/i.test(clean)) return 'Thuyết Minh';
      if (/lồng\s*tiếng/i.test(clean)) return 'Lồng Tiếng';
      return clean;
    };

    rail.innerHTML = related.slice(0, 16).map(m => `
      <div class="movie-card group relative rounded-xl overflow-hidden bg-surface-container flex flex-col cursor-pointer border border-white/5 w-[155px] sm:w-[175px] md:w-[195px] shrink-0" onclick="window.location.href='/phim/${pathSegment(m.slug)}'">
        <div class="relative w-full aspect-[2/3] overflow-hidden bg-surface-container-high">
          <img src="${escapeHtml(safeUrl(m.poster_url || m.thumb_url))}" alt="${escapeHtml(m.name)}" loading="lazy" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-108" />
          <div class="absolute top-2 left-2 flex flex-col gap-1 z-10 items-start pointer-events-none">
            ${m.has_song_ngu ? `
              <span class="badge-song-ngu">
                <span class="material-symbols-outlined">record_voice_over</span>Song Ngữ
              </span>` : ''}
            ${m.lang ? `<span class="badge-glass-sub">${escapeHtml(formatLangBadge(m.lang))}</span>` : ''}
          </div>
          <div class="absolute top-2 right-2 z-10 pointer-events-none">
            <span class="badge-glass-quality">${escapeHtml(m.quality || 'FHD')}</span>
          </div>
          <div class="absolute inset-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent p-3 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-all duration-300 z-10">
            <p class="font-body-sm text-[11px] text-white/90 line-clamp-3 mb-2 leading-relaxed drop-shadow">${escapeHtml(m.content || m.name)}</p>
            <div class="flex items-center gap-1.5">
              <a href="/xem-phim/${pathSegment(m.slug)}" class="movie-card-play-btn flex-1 py-1.5 rounded-lg bg-primary-container text-on-primary-container font-label-badge text-[11px] font-bold text-center hover:bg-inverse-primary transition-all flex items-center justify-center gap-1 shadow-lg shadow-primary-container/50">
                <span class="material-symbols-outlined text-[15px]" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
                <span>Xem</span>
              </a>
              <button class="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-sm cursor-pointer" title="Chi tiết phim" onclick="event.stopPropagation(); window.location.href='/phim/${pathSegment(m.slug)}'">
                <span class="material-symbols-outlined text-[16px]">info</span>
              </button>
            </div>
          </div>
        </div>
        <div class="p-2.5 flex flex-col gap-0.5">
          <h3 class="font-label-md text-[13px] text-on-surface font-bold truncate group-hover:text-primary transition-colors">${escapeHtml(m.name)}</h3>
          <div class="flex items-center justify-between text-on-surface-variant font-body-sm text-[11px]">
            <span class="text-amber-400 font-semibold truncate max-w-[105px]">${escapeHtml(m.episode_current || m.time || 'Trọn Bộ')}</span>
            <span class="text-on-surface-variant/80">${escapeHtml(m.year || 2026)}</span>
          </div>
        </div>
      </div>
    `).join('');

    initSimilarRailButtons();
  }
});


