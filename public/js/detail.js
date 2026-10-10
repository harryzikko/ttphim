// TTPhim - Movie Detail Page Controller (Real Data Binding)
document.addEventListener('DOMContentLoaded', async () => {
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

  try {
    console.log('[TTPhim] Fetching movie detail for slug:', slug);
    const detailData = await API.getMovieDetail(slug);
    if (!detailData || !detailData.movie) {
      if (window.showToast) window.showToast('Không tìm thấy thông tin phim', 'error');
      return;
    }

    renderDetail(detailData);
  } catch (err) {
    console.error('[TTPhim] Failed to load movie detail:', err);
    if (window.showToast) window.showToast('Lỗi tải thông tin phim từ máy chủ', 'error');
  }

  function renderDetail({ movie, episodes, related, inWatchlist }) {
    document.title = `${movie.name} (${movie.year}) - Xem Phim Full HD Vietsub | TTPhim`;

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
        <a class="hover:text-primary transition-colors" href="/kham-pha?category=${primaryCat ? primaryCat.slug : 'all'}">${primaryCat ? primaryCat.name : 'Phim'}</a>
        <span>/</span>
        <span class="text-on-surface font-semibold truncate">${movie.name}</span>
      `;
    }

    // Poster
    const posterImg = document.querySelector('section div.aspect-\\[2\\/3\\] img');
    if (posterImg) {
      posterImg.src = movie.poster_url || movie.thumb_url;
      posterImg.alt = movie.name;
    }

    // Quick stats under poster
    const statViews = document.querySelector('p.text-secondary-container.font-bold');
    if (statViews) statViews.innerText = (movie.view || 128000).toLocaleString('vi-VN');

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
        <span class="px-2.5 py-1 rounded-md bg-surface-container-high text-on-surface font-label-md text-label-md">${movie.year}</span>
        <span class="px-2.5 py-1 rounded-md bg-surface-container-high text-on-surface font-label-md text-label-md">${movie.episode_current || movie.time || '1 Tập'}</span>
        <span class="px-2.5 py-1 rounded-md bg-primary-container/20 text-primary-fixed-dim font-label-md text-label-md font-bold">${movie.chieurap ? 'Chiếu Rạp' : '16+'}</span>
        <span class="px-2.5 py-1 rounded-md bg-secondary-container/20 text-secondary-fixed font-label-md text-label-md font-semibold flex items-center gap-1">
          <span class="material-symbols-outlined text-[16px]">high_quality</span>${movie.quality || '4K Ultra HD'}
        </span>
        <span class="px-2.5 py-1 rounded-md bg-tertiary-container/30 text-tertiary font-label-md text-label-md flex items-center gap-1">
          <span class="material-symbols-outlined text-[16px]">translate</span>${movie.lang || 'Vietsub'}
        </span>
      `;
    }

    // Genres Tags
    const genresContainer = document.querySelector('div.flex.flex-wrap.items-center.gap-2:has(.mr-1)');
    if (genresContainer && movie.category) {
      genresContainer.innerHTML = `
        <span class="text-body-sm font-body-sm text-on-surface-variant mr-1">Thể loại:</span>
        ${movie.category.map(c => `
          <a class="px-3 py-1 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors font-label-md text-label-md" href="/kham-pha?category=${c.slug}">
            ${c.name}
          </a>
        `).join('')}
      `;
    }

    // Action Watch CTA
    const firstEpSlug = episodes?.[0]?.server_data?.[0]?.slug || 'tap-1';
    const watchBtn = document.querySelector('a.bg-primary-container:has(.material-symbols-outlined)') || document.querySelector('a.bg-primary-container');
    if (watchBtn) {
      watchBtn.href = `/xem-phim/${movie.slug}/${firstEpSlug}`;
      const ep0Name = episodes?.[0]?.server_data?.[0]?.name;
      const firstEpLabel = ep0Name ? (/full/i.test(ep0Name) ? 'Bản Full' : `Tập ${cleanEpName(ep0Name)}`) : 'Bản Full';
      watchBtn.innerHTML = `
        <span class="material-symbols-outlined text-[26px]" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
        <span>Xem Phim Ngay (${firstEpLabel})</span>
      `;
    }

    // Bookmark / Watchlist toggle button
    const bookmarkBtn = document.querySelector('button[title="Thêm vào danh sách yêu thích"]');
    if (bookmarkBtn) {
      if (inWatchlist) bookmarkBtn.classList.add('text-primary-container');
      bookmarkBtn.onclick = async () => {
        const res = await API.toggleWatchlist({
          movie_slug: movie.slug,
          movie_name: movie.name,
          origin_name: movie.origin_name,
          poster_url: movie.poster_url,
          thumb_url: movie.thumb_url,
          year: movie.year,
          quality: movie.quality,
          lang: movie.lang
        });
        if (res.data?.added) {
          window.showToast(`Đã thêm "${movie.name}" vào danh sách yêu thích!`);
          bookmarkBtn.classList.add('text-primary-container');
        } else {
          window.showToast(`Đã xóa "${movie.name}" khỏi danh sách yêu thích!`);
          bookmarkBtn.classList.remove('text-primary-container');
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

    // Trailer HD Button
    const trailerBtn = document.getElementById('btn-watch-trailer') || Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Trailer HD'));
    if (trailerBtn) {
      trailerBtn.onclick = () => {
        openTrailerModal(movie);
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

    // Cast & Crew Rail with Avatars
    const castContainer = document.querySelector('div.border-t.border-transparent.bg-surface-container-lowest\\/60');
    if (castContainer && (movie.director?.length || movie.actor?.length)) {
      function slugifyPerson(str) {
        if (!str) return '';
        return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      }

      const directors = (movie.director || []).filter(Boolean);
      const actors = (movie.actor || []).filter(Boolean);

      castContainer.innerHTML = `
        <div class="col-span-full space-y-3">
          <div class="flex items-center justify-between border-b border-white/5 pb-2">
            <span class="text-label-badge font-label-badge text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5 font-bold">
              <span class="material-symbols-outlined text-[17px] text-primary-container">recent_actors</span>
              <span>Đạo Diễn & Diễn Viên (${directors.length + actors.length})</span>
            </span>
            <span class="text-[11px] text-on-surface-variant/80 hidden sm:inline">Chạm vào nghệ sĩ để xem phim đã đóng</span>
          </div>
          
          <div class="flex items-center gap-4 overflow-x-auto pb-2 scrollbar-none pt-1">
            ${directors.map(d => `
              <a href="/dao-dien/${slugifyPerson(d)}" class="group flex flex-col items-center gap-1.5 shrink-0 text-center w-20 cursor-pointer" title="Đạo diễn: ${d}">
                <div class="w-14 h-14 rounded-full overflow-hidden border-2 border-primary-container/80 p-0.5 bg-surface-container shadow-md group-hover:scale-110 group-hover:border-primary-container group-hover:shadow-[0_0_15px_rgba(229,9,20,0.5)] transition-all">
                  <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(d)}&background=1d1f29&color=fff&size=128&bold=true" alt="${d}" class="w-full h-full object-cover rounded-full" loading="lazy" />
                </div>
                <span class="text-xs font-bold text-white group-hover:text-primary transition-colors line-clamp-1 block w-full">${d}</span>
                <span class="text-[10px] text-primary font-semibold block uppercase">Đạo Diễn</span>
              </a>
            `).join('')}

            ${actors.map(a => `
              <a href="/dien-vien/${slugifyPerson(a)}" class="group flex flex-col items-center gap-1.5 shrink-0 text-center w-20 cursor-pointer" title="Diễn viên: ${a}">
                <div class="w-14 h-14 rounded-full overflow-hidden border-2 border-white/20 p-0.5 bg-surface-container shadow-md group-hover:scale-110 group-hover:border-primary-container group-hover:shadow-[0_0_15px_rgba(229,9,20,0.5)] transition-all">
                  <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(a)}&background=e50914&color=fff&size=128&bold=true" alt="${a}" class="w-full h-full object-cover rounded-full" loading="lazy" />
                </div>
                <span class="text-xs font-bold text-white group-hover:text-primary transition-colors line-clamp-1 block w-full">${a}</span>
                <span class="text-[10px] text-on-surface-variant font-semibold block uppercase">Diễn Viên</span>
              </a>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Episodes & Servers Section
    renderEpisodesSection(movie, episodes);

    // Reviews & Star Ratings
    initDetailReviewsAndRatings(movie);

    // Related movies
    renderRelated(movie, related);
  }

  function openTrailerModal(movie) {
    let embedUrl = null;
    if (movie.trailer_url) {
      const ytMatch = movie.trailer_url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
      if (ytMatch && ytMatch[1]) {
        embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`;
      } else {
        embedUrl = movie.trailer_url;
      }
    }

    if (!embedUrl) {
      window.showToast('Phim này chưa có bản Trailer trực tuyến chính thức từ nhà phân phối.', 'info');
      return;
    }

    let modal = document.getElementById('trailer-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'trailer-modal';
      modal.className = 'fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4';
      modal.innerHTML = `
        <div class="relative w-full max-w-4xl bg-surface-container rounded-2xl overflow-hidden shadow-2xl border border-surface-container-highest flex flex-col">
          <div class="p-4 bg-surface-container-high flex items-center justify-between border-b border-surface-container-highest">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-primary text-[22px]">smart_display</span>
              <h3 class="font-headline-sm text-on-surface font-bold truncate">Trailer: <span id="trailer-title"></span></h3>
            </div>
            <button id="close-trailer-btn" class="p-1.5 rounded-full hover:bg-surface-container-highest text-on-surface transition-colors cursor-pointer">
              <span class="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          <div class="w-full aspect-video bg-black">
            <iframe id="trailer-iframe" class="w-full h-full border-0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.querySelector('#close-trailer-btn').onclick = () => {
        modal.classList.add('hidden');
        modal.querySelector('#trailer-iframe').src = '';
      };
      modal.onclick = (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
          modal.querySelector('#trailer-iframe').src = '';
        }
      };
    }

    modal.querySelector('#trailer-title').innerText = movie.name;
    modal.querySelector('#trailer-iframe').src = embedUrl;
    modal.classList.remove('hidden');
  }

  function renderEpisodesSection(movie, episodes) {
    const selectorSection = document.getElementById('episode-selector');
    if (!selectorSection) return;

    if (!episodes || episodes.length === 0) {
      selectorSection.innerHTML = `
        <div class="bg-surface-container-low rounded-2xl p-space-lg text-center text-on-surface-variant">
          <span class="material-symbols-outlined text-[48px] text-surface-variant mb-2">hourglass_empty</span>
          <p class="font-headline-sm">Tập phim đang được cập nhật. Vui lòng quay lại sau!</p>
        </div>
      `;
      return;
    }

    let activeServerIndex = 0;
    let activeRangeIndex = 0;
    let isAscending = true;
    let isAutoNext = localStorage.getItem('TTPhim_auto_next') !== 'false';

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

    // Setup Auto-Next Toggle
    function updateAutoNextUI() {
      if (autoNextIndicator && autoNextText) {
        if (isAutoNext) {
          autoNextIndicator.className = 'w-2 h-2 rounded-full bg-emerald-400 inline-block shadow-[0_0_8px_rgba(52,211,153,0.8)]';
          autoNextText.className = 'text-emerald-400';
          autoNextText.innerText = 'BẬT';
        } else {
          autoNextIndicator.className = 'w-2 h-2 rounded-full bg-outline/60 inline-block';
          autoNextText.className = 'text-outline';
          autoNextText.innerText = 'TẮT';
        }
      }
    }
    updateAutoNextUI();

    if (autoNextBtn) {
      autoNextBtn.onclick = () => {
        isAutoNext = !isAutoNext;
        localStorage.setItem('TTPhim_auto_next', isAutoNext ? 'true' : 'false');
        updateAutoNextUI();
        window.showToast(isAutoNext ? 'Đã BẬT tự động chuyển tập tiếp theo' : 'Đã TẮT tự động chuyển tập');
      };
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
      if (!serverPicker) return;
      serverPicker.innerHTML = episodes.map((srv, idx) => {
        const sName = srv.server_name || `Server #${idx + 1}`;
        const icon = idx === 0 ? 'bolt' : (sName.includes('Song Ngữ') || sName.includes('Thuyết minh') ? 'record_voice_over' : 'subtitles');
        return `
        <button class="server-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-label-md text-label-md transition-all cursor-pointer ${idx === activeServerIndex ? 'bg-primary-container text-on-primary-container font-bold shadow-sm' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'}" data-index="${idx}" type="button">
          <span class="material-symbols-outlined text-[16px]">${icon}</span>
          <span>${sName}</span>
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
      const rawEps = currentServer?.server_data || [];
      const allEps = isAscending ? [...rawEps] : [...rawEps].reverse();

      if (allEps.length === 0) {
        episodeGrid.innerHTML = `<div class="col-span-full p-8 text-center text-on-surface-variant">Server này chưa có tập phim nào</div>`;
        if (rangeContainer) rangeContainer.innerHTML = '';
        if (loadMoreBtn) loadMoreBtn.parentElement.style.display = 'none';
        return;
      }

      // Chunk episodes into ranges of 12
      const chunkSize = 12;
      const totalRanges = Math.ceil(allEps.length / chunkSize);

      if (rangeContainer && totalRanges > 1) {
        rangeContainer.innerHTML = `
          <span class="text-body-sm font-body-sm text-on-surface-variant">Phân đoạn tập:</span>
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
              <button class="range-tab px-3 py-1 rounded-md font-label-md text-label-md font-semibold transition-all cursor-pointer ${isActive ? 'bg-on-surface text-surface' : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface'}" data-range="${rIdx}" type="button">
                ${label}
              </button>
            `;
          }).join('')}
        `;

        rangeContainer.querySelectorAll('.range-tab').forEach(b => {
          b.addEventListener('click', () => {
            activeRangeIndex = parseInt(b.dataset.range, 10);
            renderEpisodesList();
          });
        });
      } else if (rangeContainer) {
        rangeContainer.innerHTML = `<span class="text-body-sm font-body-sm text-on-surface-variant">Trọn bộ ${allEps.length} tập</span>`;
      }

      // Slice current range
      const displayedEps = totalRanges > 1 ? allEps.slice(activeRangeIndex * chunkSize, (activeRangeIndex + 1) * chunkSize) : allEps;
      const latestEpSlug = rawEps.length > 1 ? rawEps[rawEps.length - 1].slug : null;

      episodeGrid.innerHTML = displayedEps.map((ep, idx) => {
        const epLabel = /full/i.test(ep.name) ? 'Bản Full' : `Tập ${cleanEpName(ep.name)}`;
        return `
        <div class="group relative flex flex-col bg-surface-container-low rounded-xl overflow-hidden hover:bg-surface-container hover:scale-[1.02] transition-all duration-300 cursor-pointer shadow-md" onclick="window.location.href='/xem-phim/${movie.slug}/${ep.slug}?server=${activeServerIndex}'">
          <div class="relative w-full aspect-video bg-surface-container-highest overflow-hidden">
            <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src="${movie.thumb_url || movie.poster_url}" alt="${epLabel}" />
            <div class="absolute inset-0 bg-black/40 group-hover:bg-black/10 transition-colors"></div>
            <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div class="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shadow-lg">
                <span class="material-symbols-outlined text-[24px]" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
              </div>
            </div>
            ${ep.slug === latestEpSlug ? '<span class="absolute top-2 left-2 px-2 py-0.5 rounded bg-primary-container text-on-primary-container font-label-badge text-label-badge font-bold">TẬP MỚI</span>' : ''}
            <span class="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-surface-container-lowest/80 text-on-surface font-label-badge text-label-badge">${movie.quality || 'FHD'}</span>
          </div>
          <div class="p-space-sm flex flex-col flex-1 justify-between">
            <div class="flex items-center justify-between">
              <h4 class="text-label-lg font-label-lg font-bold text-on-surface group-hover:text-primary transition-colors truncate">${epLabel}</h4>
              <span class="text-body-sm font-body-sm text-secondary-fixed font-semibold">${movie.lang || 'Vietsub'}</span>
            </div>
            <p class="text-body-sm font-body-sm text-on-surface-variant line-clamp-1 mt-1">${movie.name} - ${epLabel}</p>
          </div>
        </div>
      `;
      }).join('');

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

    renderServerTabs();
    renderEpisodesList();
  }

  // --- Real Reviews & Star Ratings in Detail Page ---
  function initDetailReviewsAndRatings(movie) {
    const starContainer = document.querySelector('div.p-space-sm.rounded-xl.bg-surface-container div.flex.items-center.gap-1');
    const commentListContainer = document.getElementById('detail-comments-list') || document.querySelector('div.space-y-space-sm');
    const reviewForm = document.getElementById('detail-review-form') || document.querySelector('form[onsubmit="event.preventDefault();"]');

    let currentSort = 'newest'; // 'newest' | 'featured'
    let selectedFormRating = 5;
    let currentUser = null;

    // Load current user for form identity
    try {
      const stored = localStorage.getItem('kk_user');
      if (stored) currentUser = JSON.parse(stored);
    } catch (e) {}

    const formAvatar = document.getElementById('comment-form-avatar');
    const formUserName = document.getElementById('comment-form-username');
    if (currentUser) {
      if (formAvatar && currentUser.avatar) formAvatar.src = currentUser.avatar;
      if (formUserName) formUserName.innerHTML = `${currentUser.name} <span class="px-2 py-0.5 rounded-full bg-primary-container/20 text-primary-fixed-dim text-[10px] font-bold">Thành Viên</span>`;
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

    // 1. Star Rating for Movie
    if (starContainer) {
      const stars = starContainer.querySelectorAll('span.material-symbols-outlined');
      stars.forEach((star, idx) => {
        star.classList.add('cursor-pointer');
        star.addEventListener('mouseenter', () => {
          stars.forEach((s, i) => {
            s.style.fontVariationSettings = i <= idx ? "'FILL' 1" : "'FILL' 0";
            s.style.color = i <= idx ? '#E2B616' : '';
          });
        });

        star.addEventListener('mouseleave', () => {
          const userRated = parseInt(localStorage.getItem(`rated_${movie.slug}`), 10) || 0;
          stars.forEach((s, i) => {
            s.style.fontVariationSettings = i < userRated ? "'FILL' 1" : "'FILL' 0";
            s.style.color = i < userRated ? '#E2B616' : '';
          });
        });

        star.addEventListener('click', async () => {
          const score = idx + 1;
          localStorage.setItem(`rated_${movie.slug}`, score);
          stars.forEach((s, i) => {
            s.style.fontVariationSettings = i <= idx ? "'FILL' 1" : "'FILL' 0";
            s.style.color = i <= idx ? '#E2B616' : '';
          });
          const res = await API.rateMovie(movie.slug, score);
          if (res.status) {
            window.showToast(`⭐ Cảm ơn bạn đã chấm ${score} sao cho phim!`);
            const scoreDisplay = document.querySelector('span.text-display-hero-mobile');
            if (scoreDisplay && res.data?.avg) {
              scoreDisplay.innerText = res.data.avg;
            }
          }
        });
      });

      // Restore user rated score
      const userRated = parseInt(localStorage.getItem(`rated_${movie.slug}`), 10);
      if (userRated) {
        stars.forEach((s, i) => {
          s.style.fontVariationSettings = i < userRated ? "'FILL' 1" : "'FILL' 0";
          s.style.color = i < userRated ? '#E2B616' : '';
        });
      }
    }

    // Form Rating Stars (Inside Post Form)
    const formStarsContainer = document.getElementById('comment-form-stars');
    const formStarLabel = document.getElementById('form-star-label');
    if (formStarsContainer) {
      const fStars = formStarsContainer.querySelectorAll('.form-star-btn');
      fStars.forEach(btn => {
        btn.addEventListener('click', () => {
          selectedFormRating = parseInt(btn.dataset.val, 10) || 5;
          if (formStarLabel) formStarLabel.innerText = `${selectedFormRating}/5`;
          fStars.forEach(b => {
            const v = parseInt(b.dataset.val, 10);
            const icon = b.querySelector('.material-symbols-outlined');
            if (v <= selectedFormRating) {
              b.className = 'form-star-btn text-[#E2B616] cursor-pointer';
              if (icon) icon.style.fontVariationSettings = "'FILL' 1";
            } else {
              b.className = 'form-star-btn text-surface-variant cursor-pointer';
              if (icon) icon.style.fontVariationSettings = "'FILL' 0";
            }
          });
        });
      });
    }

    // Quick Emojis
    const textarea = document.getElementById('detail-comment-textarea') || reviewForm?.querySelector('textarea');
    document.querySelectorAll('.btn-emoji-quick').forEach(b => {
      b.addEventListener('click', () => {
        const emoji = b.dataset.emoji;
        if (textarea && emoji) {
          textarea.value += (textarea.value ? ' ' : '') + emoji;
          textarea.focus();
        }
      });
    });

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
      let comments = await API.getComments(movie.slug);
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
            <p class="font-body-md">Chưa có bình luận nào cho bộ phim này. Hãy là người đầu tiên chia sẻ cảm nhận!</p>
          </div>
        `;
        return;
      }

      const likedIds = getLikedCommentIds();

      commentListContainer.innerHTML = comments.map(c => {
        const isLiked = likedIds.includes(c.id);
        const relTime = formatRelativeTime(c.created_at);
        const score = c.rating || 5;
        const replies = c.replies || [];

        return `
        <div class="p-space-md rounded-2xl bg-surface-container-low transition-all border border-white/5 shadow-sm space-y-3" id="comment-card-${c.id}">
          <div class="flex items-start justify-between gap-space-sm">
            <div class="flex items-center gap-3">
              <img class="w-10 h-10 rounded-full object-cover shrink-0 ring-1 ring-white/10" src="${c.user_avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAPbHo0WbRHUQwGQOjadraD_tAk7XQUGjJQPQDSvK5RZfRCVSUufHkI5ytr1RnoudWNDKzqxm86HwkNOfZhdJ6gH5wUBF8Hu6sx3uE-8dvCv61CH5Sl6_6rcVCCUeOGM4Ub3reCBWB2-ittRPKQslAi-yOnv0WlNzjOskqtQAYGefgmgohy9WNwv1lISujIp8aIK3M0rynROP6yxRZcTMSyWswRJsdzf7K4DhDzjq8'}" alt="${c.user_name}" />
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-label-lg text-label-lg text-on-surface font-semibold">${c.user_name}</span>
                  <span class="px-2 py-0.5 rounded-full bg-surface-container-highest text-secondary-fixed font-label-badge text-[10px] font-bold">Thành Viên</span>
                </div>
                <span class="text-body-sm font-body-sm text-on-surface-variant">${relTime}</span>
              </div>
            </div>
            
            <div class="flex text-[#E2B616] shrink-0" title="${score}/5 sao">
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
              <p class="spoiler-body text-body-md font-body-md text-on-surface filter blur-[5px] select-none transition-all duration-300 leading-relaxed">${c.content}</p>
            </div>
          ` : `
            <p class="text-body-md font-body-md text-on-surface leading-relaxed">${c.content}</p>
          `}

          <!-- Actions Bar -->
          <div class="flex items-center gap-space-lg text-body-sm font-body-sm text-on-surface-variant pt-1 border-t border-surface-container-highest/60">
            <button class="btn-like-review flex items-center gap-1.5 ${isLiked ? 'text-primary font-bold' : 'hover:text-primary'} transition-colors cursor-pointer" data-id="${c.id}" data-liked="${isLiked}">
              <span class="material-symbols-outlined text-[18px]">${isLiked ? 'favorite' : 'thumb_up'}</span>
              <span class="like-counter">${c.likes || 0}</span>
            </button>
            <button class="flex items-center gap-1.5 hover:text-on-surface transition-colors cursor-pointer btn-open-reply" data-id="${c.id}" data-name="${c.user_name}">
              <span class="material-symbols-outlined text-[18px]">reply</span>
              <span>Trả lời (${replies.length})</span>
            </button>
          </div>

          <!-- Inline Reply Box (Hidden by default) -->
          <div class="reply-box-container hidden pt-2 border-t border-surface-container-highest" id="reply-box-${c.id}">
            <div class="flex gap-2 items-center">
              <input type="text" class="reply-input flex-1 px-3.5 py-2 rounded-xl bg-surface-container text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:bg-surface-container-high transition-colors" placeholder="Viết phản hồi cho ${c.user_name}..." />
              <button type="button" class="btn-send-reply px-4 py-2 rounded-xl bg-primary-container text-on-primary-container text-xs font-bold hover:brightness-110 cursor-pointer shadow-md flex items-center gap-1 shrink-0" data-id="${c.id}">
                <span>Gửi</span>
                <span class="material-symbols-outlined text-[14px]">send</span>
              </button>
              <button type="button" class="btn-close-reply p-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface cursor-pointer shrink-0" data-id="${c.id}">
                <span class="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          </div>

          <!-- Nested Replies List -->
          ${replies.length > 0 ? `
            <div class="space-y-2.5 pl-4 sm:pl-6 border-l-2 border-surface-container-highest pt-1">
              ${replies.map(r => `
                <div class="bg-surface-container/60 p-2.5 rounded-xl space-y-1">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <img src="${r.user_avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuCSbujeZINk45JTMl1uHDHy58dzZtklTE0t5uPEhCwlICLLPGtijYtFO9JeqSqDGusRdB1gt7qycyJ5OX6kz4PYsmWLL5tvWy-spdqpz_DrG4qLJz8bQgtQlXHllA2zvsiuNrLj_cdZxocwgDBP1kYO7DK8ESLeW9ehVKs4rk50GYzAAygACch82GxO5zi10RYSftDRhD9PgHoAOvOFxw2ZKO2w05zb0jDbKL3RAg4'}" class="w-6 h-6 rounded-full object-cover shrink-0" />
                      <span class="font-label-md text-xs font-bold text-on-surface">${r.user_name}</span>
                      <span class="text-[11px] text-on-surface-variant">${formatRelativeTime(r.created_at)}</span>
                    </div>
                  </div>
                  <p class="text-xs text-on-surface-variant pl-8 leading-relaxed">${r.content}</p>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
      }).join('');

      // Wire up Spoiler Toggles
      commentListContainer.querySelectorAll('.btn-toggle-spoiler').forEach(btn => {
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

          const newLikes = await API.likeComment(id, newAction);
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
          const res = await API.postReply(id, content, currentUser?.name || 'Khán giả TTPhim');
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
        rating: selectedFormRating,
        is_spoil: spoilCheck ? spoilCheck.checked : false,
        user_name: currentUser?.name || 'Khán giả TTPhim'
      };

      const res = await API.postComment(movie.slug, commentPayload);
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Đăng Bình Luận</span><span class="material-symbols-outlined text-[16px]">send</span>`;

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
  const initSimilarRailButtons = () => {
    const railSimilar = document.getElementById('rail-similar');
    const prevSimilar = document.getElementById('btn-similar-prev');
    const nextSimilar = document.getElementById('btn-similar-next');
    if (railSimilar && prevSimilar && nextSimilar) {
      prevSimilar.onclick = () => railSimilar.scrollBy({ left: -360, behavior: 'smooth' });
      nextSimilar.onclick = () => railSimilar.scrollBy({ left: 360, behavior: 'smooth' });
    }
  };
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
      <div class="movie-card group relative rounded-xl overflow-hidden bg-surface-container flex flex-col cursor-pointer border border-white/5 w-[155px] sm:w-[175px] md:w-[195px] shrink-0" onclick="window.location.href='/phim/${m.slug}'">
        <div class="relative w-full aspect-[2/3] overflow-hidden bg-surface-container-high">
          <img src="${m.poster_url || m.thumb_url}" alt="${m.name}" loading="lazy" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-108" />
          <div class="absolute top-2 left-2 flex flex-col gap-1 z-10 items-start pointer-events-none">
            ${m.has_song_ngu ? `
              <span class="badge-song-ngu">
                <span class="material-symbols-outlined">record_voice_over</span>Song Ngữ
              </span>` : ''}
            ${m.lang ? `<span class="badge-glass-sub">${formatLangBadge(m.lang)}</span>` : ''}
          </div>
          <div class="absolute top-2 right-2 z-10 pointer-events-none">
            <span class="badge-glass-quality">${m.quality || 'FHD'}</span>
          </div>
          <div class="absolute inset-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent p-3 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-all duration-300 z-10">
            <p class="font-body-sm text-[11px] text-white/90 line-clamp-3 mb-2 leading-relaxed drop-shadow">${m.content || m.name}</p>
            <div class="flex items-center gap-1.5">
              <a href="/xem-phim/${m.slug}" class="movie-card-play-btn flex-1 py-1.5 rounded-lg bg-primary-container text-on-primary-container font-label-badge text-[11px] font-bold text-center hover:bg-inverse-primary transition-all flex items-center justify-center gap-1 shadow-lg shadow-primary-container/50">
                <span class="material-symbols-outlined text-[15px]" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
                <span>Xem</span>
              </a>
              <button class="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-sm cursor-pointer" title="Chi tiết phim" onclick="event.stopPropagation(); window.location.href='/phim/${m.slug}'">
                <span class="material-symbols-outlined text-[16px]">info</span>
              </button>
            </div>
          </div>
        </div>
        <div class="p-2.5 flex flex-col gap-0.5">
          <h3 class="font-label-md text-[13px] text-on-surface font-bold truncate group-hover:text-primary transition-colors">${m.name}</h3>
          <div class="flex items-center justify-between text-on-surface-variant font-body-sm text-[11px]">
            <span class="text-amber-400 font-semibold truncate max-w-[105px]">${m.episode_current || m.time || 'Trọn Bộ'}</span>
            <span class="text-on-surface-variant/80">${m.year || 2026}</span>
          </div>
        </div>
      </div>
    `).join('');

    initSimilarRailButtons();
  }
});


