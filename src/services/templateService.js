const kkphimService = require('./kkphimService');

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

function cleanEpName(name) {
  if (!name) return '01';
  const str = String(name).trim();
  const m = str.match(/\d+/);
  if (m) {
    const num = parseInt(m[0], 10);
    return isNaN(num) ? m[0] : (num < 10 ? `0${num}` : `${num}`);
  }
  return str;
}

class TemplateService {
  /**
   * Hydrate Home Page with 100% Real KKPhim API Data
   */
  renderHome(html, homeData) {
    if (!homeData) return html;

    const spotlight = homeData.spotlights?.[0];
    if (spotlight) {
      // Replace hero title
      html = html.replace(
        /<h1 class="font-display-hero[^>]*>.*?<\/h1>/s,
        `<h1 class="font-display-hero text-display-hero text-on-surface tracking-tight leading-none drop-shadow-2xl">${spotlight.name} <span class="text-primary-container block sm:inline">${spotlight.episode_current ? `(${spotlight.episode_current})` : ''}</span></h1>`
      );

      // Replace hero subtitle
      html = html.replace(
        /<p class="font-headline-sm text-headline-sm text-on-surface-variant font-medium tracking-wide">.*?<\/p>/s,
        `<p class="font-headline-sm text-headline-sm text-on-surface-variant font-medium tracking-wide">${spotlight.origin_name || ''} (${spotlight.year || 2026})</p>`
      );

      // Replace hero excerpt
      html = html.replace(
        /<p class="font-body-lg text-body-lg text-on-surface-variant line-clamp-3 max-w-2xl text-shadow">.*?<\/p>/s,
        `<p class="font-body-lg text-body-lg text-on-surface-variant line-clamp-3 max-w-2xl text-shadow">${spotlight.content || 'Khám phá thế giới điện ảnh sắc nét với chất lượng 4K HDR trên KKPhim...'}</p>`
      );

      // Replace hero bg
      const bgUrl = spotlight.thumb_url || spotlight.poster_url;
      if (bgUrl) {
        html = html.replace(
          /style="background-image:\s*url\('[^']*'\)"/,
          `style="background-image: url('${bgUrl}')"`
        );
      }

      // Replace Watch CTA link
      html = html.replace(
        /<a id="hero-play-btn" [^>]*>|<a class="flex items-center gap-space-sm px-space-lg py-3 rounded-full bg-primary-container[^"]*" href="[^"]*">/,
        `<a id="hero-play-btn" class="flex items-center gap-space-sm px-space-lg py-3 rounded-full bg-primary-container text-on-primary-container font-label-lg text-label-lg hover:bg-inverse-primary shadow-[0_4px_24px_rgba(229,9,20,0.45)] transition-all hover:scale-105 active:scale-95 cursor-pointer" href="/xem-phim/${spotlight.slug}/${spotlight.first_episode_slug || 'tap-1'}">`
      );

      // Replace Right-side hero poster card if present
      const posterUrl = spotlight.poster_url || spotlight.thumb_url;
      if (posterUrl) {
        html = html.replace(
          /id="hero-poster-img" src="[^"]*"/,
          `id="hero-poster-img" src="${posterUrl}"`
        );
        html = html.replace(
          /id="hero-poster-card" href="[^"]*"/,
          `id="hero-poster-card" href="/xem-phim/${spotlight.slug}/${spotlight.first_episode_slug || 'tap-1'}"`
        );
      }

      // Render initial slide dots under large poster
      if (homeData.spotlights.length > 1) {
        const dotsHtml = homeData.spotlights.slice(0, 10).map((_, idx) => `
          <button class="h-1.5 rounded-full transition-all duration-300 ${idx === 0 ? 'w-6 bg-primary-container shadow-md shadow-primary-container/50' : 'w-2 bg-white/30 hover:bg-white/60'} cursor-pointer" data-index="${idx}" title="Chuyển đến phim ${idx + 1}" type="button"></button>
        `).join('');

        html = html.replace(
          /<div id="hero-slide-dots"[^>]*>[\s\S]*?<\/div>/,
          `<div id="hero-slide-dots" class="flex items-center gap-1.5">${dotsHtml}</div>`
        );
      } else {
        html = html.replace(
          /<div id="hero-slide-dots"[^>]*>[\s\S]*?<\/div>/,
          `<div id="hero-slide-dots" class="flex items-center gap-1.5"></div>`
        );
      }
    } else {
      // Empty state when admin has not pinned any movie yet
      html = html.replace(
        /<h1 class="font-display-hero[^>]*>.*?<\/h1>/s,
        `<h1 class="font-display-hero text-display-hero text-on-surface tracking-tight leading-none drop-shadow-2xl">TTPhim Cinema Experience</h1>`
      );
      html = html.replace(
        /<p class="font-headline-sm text-headline-sm text-on-surface-variant font-medium tracking-wide">.*?<\/p>/s,
        `<p class="font-headline-sm text-headline-sm text-on-surface-variant font-medium tracking-wide">Kho Phim Chuẩn Điện Ảnh 4K HDR Không Quảng Cáo</p>`
      );
      html = html.replace(
        /<p class="font-body-lg text-body-lg text-on-surface-variant line-clamp-3 max-w-2xl text-shadow">.*?<\/p>/s,
        `<p class="font-body-lg text-body-lg text-on-surface-variant line-clamp-3 max-w-2xl text-shadow">Hiện tại chưa có phim nào được ghim lên Banner nổi bật. Quản trị viên có thể vào trang Quản Trị (Admin) để ghim phim lên Banner trang chủ.</p>`
      );
      html = html.replace(
        /<a id="hero-play-btn" [^>]*>|<a class="flex items-center gap-space-sm px-space-lg py-3 rounded-full bg-primary-container[^"]*" href="[^"]*">/,
        `<a id="hero-play-btn" class="flex items-center gap-space-sm px-space-lg py-3 rounded-full bg-primary-container text-on-primary-container font-label-lg text-label-lg hover:bg-inverse-primary shadow-[0_4px_24px_rgba(229,9,20,0.45)] transition-all hover:scale-105 active:scale-95 cursor-pointer" href="/kham-pha">`
      );
      html = html.replace(
        /<div id="hero-slide-dots"[^>]*>[\s\S]*?<\/div>/,
        `<div id="hero-slide-dots" class="flex items-center gap-1.5"></div>`
      );
    }

    // Section 1 (Tiếp Tục Xem) is handled dynamically on client-side by home.js via /api/user/library based on authenticated user history


    // Replace Section 2 (Mới Cập Nhật Hôm Nay) cards
    if (homeData.latest && homeData.latest.length > 0) {
      const latestCardsHtml = homeData.latest.slice(0, 12).map(m => `
        <div class="movie-card group relative rounded-xl overflow-hidden bg-surface-container flex flex-col cursor-pointer border border-white/5" onclick="window.location.href='/phim/${m.slug}'">
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
            <div class="absolute inset-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent p-3.5 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-all duration-300 z-10">
              <p class="font-body-sm text-[12px] text-white/90 line-clamp-3 mb-3 leading-relaxed drop-shadow">${m.content || m.name}</p>
              <div class="flex items-center gap-2">
                <a href="/xem-phim/${m.slug}" class="movie-card-play-btn flex-1 py-2 rounded-xl bg-primary-container text-on-primary-container font-label-badge text-[11px] font-bold text-center hover:bg-inverse-primary transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-primary-container/50">
                  <span class="material-symbols-outlined text-[16px]" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
                  <span>Xem Ngay</span>
                </a>
                <button class="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-sm cursor-pointer" title="Chi tiết phim" onclick="event.stopPropagation(); window.location.href='/phim/${m.slug}'">
                  <span class="material-symbols-outlined text-[18px]">info</span>
                </button>
              </div>
            </div>
          </div>
          <div class="p-3 flex flex-col gap-1">
            <h3 class="font-label-md text-label-md text-on-surface font-bold truncate group-hover:text-primary transition-colors">${m.name}</h3>
            <div class="flex items-center justify-between text-on-surface-variant font-body-sm text-[12px]">
              <span class="text-amber-400 font-semibold truncate max-w-[110px]">${m.episode_current || m.time || 'Trọn Bộ'}</span>
              <span class="text-on-surface-variant/80">${m.year}</span>
            </div>
          </div>
        </div>
      `).join('');

      html = html.replace(
        /(<h2 class="font-headline-lg text-headline-lg text-on-surface">Mới Cập Nhật Hôm Nay<\/h2>[\s\S]*?<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-space-md">)[\s\S]*?(<\/div>\s*<\/section>)/,
        `$1\n${latestCardsHtml}\n$2`
      );
    }

    // Hydrate Phim Chiếu Rạp Bom Tấn
    if (homeData.cinema && homeData.cinema.length > 0) {
      const cinemaCards = this.renderRailCards(homeData.cinema, 'chieurap');
      html = html.replace(
        /(<div id="rail-chieu-rap"[^>]*>)[\s\S]*?(<\/div>\s*<\/section>)/,
        `$1\n${cinemaCards}\n$2`
      );
    }

    // Hydrate Phim Bộ Đang Thịnh Hành
    if (homeData.series && homeData.series.length > 0) {
      const seriesCards = this.renderRailCards(homeData.series, 'series');
      html = html.replace(
        /(<div id="rail-phim-bo"[^>]*>)[\s\S]*?(<\/div>\s*<\/section>)/,
        `$1\n${seriesCards}\n$2`
      );
    }

    // Hydrate Phim Lẻ Đặc Sắc Tuyển Chọn
    if (homeData.singles && homeData.singles.length > 0) {
      const singleCards = this.renderRailCards(homeData.singles, 'default');
      html = html.replace(
        /(<div id="rail-phim-le"[^>]*>)[\s\S]*?(<\/div>\s*<\/section>)/,
        `$1\n${singleCards}\n$2`
      );
    }

    // Hydrate TV Shows & Gameshow Giải Trí
    if (homeData.tvshows && homeData.tvshows.length > 0) {
      const tvshowsCards = this.renderRailCards(homeData.tvshows, 'tvshows');
      html = html.replace(
        /(<div id="rail-tv-shows"[^>]*>)[\s\S]*?(<\/div>\s*<\/section>)/,
        `$1\n${tvshowsCards}\n$2`
      );
    }

    // Hydrate Thế Giới Anime & Hoạt Hình
    if (homeData.anime && homeData.anime.length > 0) {
      const animeCards = this.renderRailCards(homeData.anime, 'anime');
      html = html.replace(
        /(<div id="rail-anime"[^>]*>)[\s\S]*?(<\/div>\s*<\/section>)/,
        `$1\n${animeCards}\n$2`
      );
    }

    // Hydrate Section 3 (Khám Phá Theo Khu Vực & Thể Loại) background images
    const regImages = [
      homeData.series?.[0]?.thumb_url,
      homeData.series?.[1]?.thumb_url,
      homeData.cinema?.[0]?.thumb_url,
      homeData.anime?.[0]?.thumb_url
    ];
    const countries = ['han-quoc', 'trung-quoc', 'au-my', 'nhat-ban'];
    regImages.forEach((img, idx) => {
      if (img) {
        const reg = new RegExp(`(onclick="window\\.location\\.href='\\/kham-pha\\?country=${countries[idx]}'"><div class="card-bg-layer absolute inset-0 bg-cover bg-center[^"]*" style="background-image: url\\(')[^']*('\\);"><\\/div>)`);
        html = html.replace(reg, `$1${img}$2`);
      }
    });

    const genImages = [
      homeData.cinema?.[1]?.thumb_url || homeData.cinema?.[0]?.thumb_url,
      homeData.series?.[2]?.thumb_url || homeData.series?.[0]?.thumb_url,
      homeData.latest?.[2]?.thumb_url,
      homeData.latest?.[3]?.thumb_url
    ];
    const categories = ['hanh-dong', 'co-trang', 'kinh-di', 'tinh-cam'];
    genImages.forEach((img, idx) => {
      if (img) {
        const reg = new RegExp(`(onclick="window\\.location\\.href='\\/kham-pha\\?category=${categories[idx]}'"><div class="card-bg-layer absolute inset-0 bg-cover bg-center[^"]*" style="background-image: url\\(')[^']*('\\);"><\\/div>)`);
        html = html.replace(reg, `$1${img}$2`);
      }
    });

    // Replace Section 4 (Top 10 Thịnh Hành) cards
    if (homeData.rankings && homeData.rankings.length > 0) {
      const top10Html = homeData.rankings.slice(0, 10).map((m, idx) => {
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
          <div class="top10-item flex items-end shrink-0 group cursor-pointer select-none transition-transform duration-300 hover:-translate-y-2" onclick="window.location.href='/phim/${m.slug}'">
            <!-- 1. FULL UNCOVERED NUMBER (Left Block, 100% Visible) -->
            <div class="${numColWidth} h-[240px] sm:h-[270px] flex items-end justify-center shrink-0 pr-1 select-none pointer-events-none">
              <span class="rank-num ${rankClass} ${numFontSize}">
                ${rank}
              </span>
            </div>

            <!-- 2. CINEMA POSTER CARD (Right Block, Never Covers Number) -->
            <div class="relative w-[180px] sm:w-[200px] md:w-[220px] aspect-[2/3] rounded-2xl overflow-hidden bg-surface-container shadow-[0_12px_36px_rgba(0,0,0,0.85)] border border-white/10 transition-all duration-300 group-hover:shadow-[0_18px_48px_rgba(0,0,0,0.95)] group-hover:border-primary/50 shrink-0">
              <img src="${m.poster_url || m.thumb_url}" alt="${m.name}" loading="lazy" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-108" />

              <!-- Corner Rank Badges (Horizontal & Sleek) -->
              <div class="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 flex-wrap max-w-[85%] pointer-events-none">
                <span class="px-2 py-0.5 rounded-md ${badgeClass} font-label-badge text-[10px] font-black tracking-wider uppercase">
                  #${rank}
                </span>
                ${m.has_song_ngu ? `
                  <span class="badge-song-ngu">
                    <span class="material-symbols-outlined">record_voice_over</span>Song Ngữ
                  </span>` : ''}
              </div>

              <!-- Quality Badge -->
              <div class="absolute top-2.5 right-2.5 z-20 pointer-events-none">
                <span class="badge-glass-quality">${m.quality || 'FHD'}</span>
              </div>

              <!-- Quick Play Hover Overlay -->
              <div class="absolute inset-0 bg-black/45 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20">
                <span class="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center shadow-2xl transform scale-90 group-hover:scale-100 transition-transform">
                  <span class="material-symbols-outlined text-[28px]" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
                </span>
              </div>

              <!-- Bottom Gradient Overlay & Real Metadata -->
              <div class="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-[#0B0B0C] via-[#0B0B0C]/90 to-transparent z-10 flex flex-col gap-1">
                <h4 class="font-label-md text-label-md font-bold text-on-surface truncate group-hover:text-primary transition-colors">${m.name}</h4>
                <div class="flex items-center justify-between text-on-surface-variant font-body-sm text-[11px]">
                  <span class="flex items-center gap-1.5 text-amber-400 font-bold">
                    <span class="material-symbols-outlined text-[14px] text-primary">visibility</span>
                    ${m.views || '0'} lượt xem
                  </span>
                  <span class="text-white/60 font-medium">${m.year || ''}</span>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');

      html = html.replace(
        /(<div id="top10-rail"[\s\S]*?>)[\s\S]*?(<\/div>\s*<\/section>)/,
        `$1\n${top10Html}\n$2`
      );
    }

    return html;
  }

  /**
   * Helper to render standardized cards for horizontal rails
   */
  renderRailCards(items, badgeType = 'default') {
    if (!items || !items.length) return '';
    return items.slice(0, 16).map(m => {
      let badgeHtml = '';
      if (badgeType === 'chieurap') {
        badgeHtml = `<span class="badge-glass-cinema">Chiếu Rạp</span>`;
      } else if (badgeType === 'series') {
        badgeHtml = `<span class="badge-glass-series">${formatLangBadge(m.lang) || 'Phim Bộ'}</span>`;
      } else if (badgeType === 'tvshows') {
        badgeHtml = `<span class="badge-glass-tvshow">TV Show</span>`;
      } else if (badgeType === 'anime') {
        badgeHtml = `<span class="badge-glass-anime">Anime</span>`;
      } else if (m.lang) {
        badgeHtml = `<span class="badge-glass-sub">${formatLangBadge(m.lang)}</span>`;
      }

      const songNguBadge = m.has_song_ngu ? `
        <span class="badge-song-ngu">
          <span class="material-symbols-outlined">record_voice_over</span>Song Ngữ
        </span>` : '';

      return `
        <div class="movie-card group relative rounded-xl overflow-hidden bg-surface-container flex flex-col cursor-pointer border border-white/5 w-[155px] sm:w-[175px] md:w-[195px] shrink-0" onclick="window.location.href='/phim/${m.slug}'">
          <div class="relative w-full aspect-[2/3] overflow-hidden bg-surface-container-high">
            <img src="${m.poster_url || m.thumb_url}" alt="${m.name}" loading="lazy" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-108" />
            <div class="absolute top-2 left-2 flex flex-col gap-1 z-10 items-start pointer-events-none">
              ${songNguBadge}
              ${badgeHtml}
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
      `;
    }).join('');
  }

  /**
   * Hydrate Catalog Page with 100% Real KKPhim API Data
   */
  renderCatalog(html, catalogData, query = {}) {
    if (!catalogData || !catalogData.items) return html;

    // Hydrate selected country in dropdown
    if (query.country && query.country !== 'all') {
      html = html.replace(
        new RegExp(`(<option value="${query.country}")>`),
        `$1 selected>`
      );
    }

    // Hydrate selected category chip
    if (query.category && query.category !== 'all') {
      html = html.replace(
        new RegExp(`(class="genre-chip [^"]*)" data-genre="${query.category}"`),
        `class="genre-chip px-3 py-1 rounded-full bg-primary-container text-on-primary-container font-bold shadow-sm transition-all cursor-pointer" data-genre="${query.category}"`
      );
    }

    const getMovieTypeBadge = (m) => {
      const normFilter = (query.type || '').toLowerCase().trim();
      if (normFilter === 'chieu-rap' || normFilter === 'phim-chieu-rap') return 'Chiếu Rạp';
      if (normFilter === 'hoat-hinh' || normFilter === 'hoathinh') return 'Hoạt Hình';
      if (normFilter === 'tv-shows' || normFilter === 'tvshows') return 'TV Shows';
      if (normFilter === 'phim-bo') return 'Phim Bộ';
      if (normFilter === 'phim-le') return 'Phim Lẻ';

      // Fallback for "all" or genre/country filters:
      if (m.chieurap) return 'Chiếu Rạp';
      if (m.type === 'hoathinh' || m.type === 'hoat-hinh') return 'Hoạt Hình';
      if (m.type === 'tvshows' || m.type === 'tv-shows') return 'TV Shows';
      if (m.type === 'series') return 'Phim Bộ';
      if (m.type === 'single') return 'Phim Lẻ';
      if (m.episode_total && parseInt(m.episode_total, 10) > 1) return 'Phim Bộ';
      return 'Phim Lẻ';
    };

    const cardsHtml = catalogData.items.map(m => `
      <article class="group relative flex flex-col bg-surface-container rounded-xl overflow-hidden hover:bg-surface-container-high transition-all duration-300 hover:-translate-y-1.5 shadow-md hover:shadow-2xl cursor-pointer" onclick="window.location.href='/phim/${m.slug}'">
        <div class="relative w-full aspect-[2/3] overflow-hidden bg-surface-container-highest">
          <img src="${m.poster_url || m.thumb_url}" alt="${m.name}" loading="lazy" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
          <div class="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10 items-start pointer-events-none">
            ${m.has_song_ngu ? `
              <span class="badge-song-ngu">
                <span class="material-symbols-outlined">record_voice_over</span>Song Ngữ
              </span>` : ''}
            ${m.lang ? `<span class="badge-glass-sub">${formatLangBadge(m.lang)}</span>` : ''}
          </div>
          <div class="absolute top-2.5 right-2.5 z-10 pointer-events-none">
            <span class="badge-glass-quality">${m.quality || 'FHD'}</span>
          </div>
          <div class="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/80 to-transparent flex items-end justify-between z-10">
            <span class="font-label-badge text-[11px] text-amber-300 font-semibold truncate max-w-[110px]">${m.episode_current || m.time || 'Trọn Bộ'}</span>
            <span class="px-1.5 py-0.2 rounded bg-surface-container-high/90 text-on-surface-variant font-label-badge text-[10px]">${m.year}</span>
          </div>
          <div class="absolute inset-0 bg-primary-container/20 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20">
            <div class="w-12 h-12 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shadow-2xl scale-75 group-hover:scale-100 transition-transform">
              <span class="material-symbols-outlined text-[28px]" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
            </div>
          </div>
        </div>
        <div class="p-3 flex flex-col gap-1 flex-1 justify-between">
          <div>
            <h3 class="font-label-md text-label-md font-bold text-on-surface group-hover:text-primary transition-colors truncate">${m.name}</h3>
            <p class="font-body-sm text-[12px] text-on-surface-variant truncate">${m.origin_name || m.name}</p>
          </div>
          <div class="flex items-center justify-between text-on-surface-variant font-label-badge text-[11px] pt-1 border-t border-surface-container-highest">
            <span>${getMovieTypeBadge(m)}</span>
            <span class="text-secondary flex items-center gap-0.5"><span class="material-symbols-outlined text-[12px]">star</span> 8.9</span>
          </div>
        </div>
      </article>
    `).join('');

    html = html.replace(
      /(<section aria-label="Danh sách phim tìm kiếm"[^>]*>)[\s\S]*?(<\/section>)/,
      `$1\n${cardsHtml}\n$2`
    );

    // Hydrate selected year in dropdown
    if (query.year && query.year !== 'all') {
      html = html.replace(
        new RegExp(`(<option value="${query.year}")>`),
        `$1 selected>`
      );
    }

    // Update total count indicator
    const total = catalogData.pagination?.totalItems || 12450;
    const count = catalogData.items.length;
    html = html.replace(
      /Hiển thị <span class="text-on-surface font-bold">[^<]*<\/span> trên tổng số <span class="text-primary font-bold">[^<]*<\/span> phim/,
      `Hiển thị <span class="text-on-surface font-bold">1 - ${count}</span> trên tổng số <span class="text-primary font-bold">${total.toLocaleString('vi-VN')}</span> phim`
    );

    // Hydrate pagination in SSR
    const pagination = catalogData.pagination || { currentPage: 1, totalPages: 1 };
    const currentPage = parseInt(pagination.currentPage, 10) || 1;
    const totalPages = parseInt(pagination.totalPages, 10) || 1;
    const prevDisabled = currentPage <= 1;
    const nextDisabled = currentPage >= totalPages;

    let pages = [];
    const maxButtons = 5;
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    if (endPage - startPage < maxButtons - 1) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }
    for (let p = startPage; p <= endPage; p++) {
      pages.push(p);
    }

    const paginationHtml = `
      <!-- Previous Page Button -->
      <div class="flex items-center gap-2">
        <button class="px-4 py-2 rounded-lg bg-surface-container-high text-outline hover:text-on-surface hover:bg-surface-container-highest disabled:opacity-40 disabled:cursor-not-allowed font-label-md text-label-md flex items-center gap-1.5 transition-colors cursor-pointer" ${prevDisabled ? 'disabled' : ''} id="btn-prev-page" type="button" data-page="${currentPage - 1}">
          <span class="material-symbols-outlined text-[18px]">arrow_back</span>
          <span>Trang Trước</span>
        </button>
      </div>
      <!-- Numeric Page Selector -->
      <div class="flex items-center gap-1.5 flex-wrap justify-center font-label-md text-label-md" id="catalog-numeric-pages">
        ${pages.map(p => `
          <button class="w-10 h-10 rounded-lg font-label-md text-label-md transition-all cursor-pointer ${p === currentPage ? 'bg-primary-container text-on-primary-container font-bold shadow-md' : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'}" type="button" data-page="${p}">
            ${p}
          </button>
        `).join('')}
      </div>
      <!-- Next Page & Jump to input -->
      <div class="flex items-center gap-space-sm flex-wrap">
        <button class="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface hover:bg-surface-container-highest disabled:opacity-40 disabled:cursor-not-allowed font-label-md text-label-md flex items-center gap-1.5 transition-colors cursor-pointer" ${nextDisabled ? 'disabled' : ''} id="btn-next-page" type="button" data-page="${currentPage + 1}">
          <span>Trang Sau</span>
          <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
        </button>
        <!-- Jump To Page Form -->
        <div class="flex items-center gap-1.5 pl-space-xs font-body-sm text-body-sm text-outline">
          <span>Đến trang:</span>
          <input class="w-14 px-2 py-1.5 rounded-lg bg-surface-container-high text-on-surface text-center font-label-md text-label-md focus:outline-none focus:bg-surface-container-highest" id="jump-page-input" max="${totalPages}" min="1" placeholder="${currentPage}" type="number"/>
          <button class="px-2.5 py-1.5 rounded-lg bg-surface-container-highest text-on-surface hover:bg-primary-container hover:text-on-primary-container font-label-badge text-label-badge font-bold transition-colors cursor-pointer" id="btn-jump-page" type="button">
            ĐI
          </button>
        </div>
      </div>
    `;

    html = html.replace(
      /(<nav id="catalog-pagination"[^>]*>|<nav aria-label="Điều hướng phân trang"[^>]*>)[\s\S]*?(<\/nav>)/,
      `<nav id="catalog-pagination" aria-label="Điều hướng phân trang" class="flex flex-col md:flex-row items-center justify-between gap-space-md pt-space-lg pb-space-xl bg-surface-container-low/50 px-space-md py-space-md rounded-xl">\n${paginationHtml}\n</nav>`
    );

    return html;
  }

  /**
   * Hydrate Movie Detail Page (chi-tiet.html) with 100% Real KKPhim API Data
   */
  renderDetail(html, detailData, comments = []) {
    if (!detailData || !detailData.movie) return html;
    const { movie, episodes, related } = detailData;

    // 1. Page Title
    const titleStr = `${movie.name} (${movie.year}) - Xem Phim Full HD Vietsub | TTPhim`;
    html = html.replace(/<title>.*?<\/title>/i, `<title>${titleStr}</title>`);
    if (!html.includes('<title>')) {
      html = html.replace('<head>', `<head>\n  <title>${titleStr}</title>`);
    }

    // 2. Ambient Backdrop
    const bgUrl = movie.thumb_url || movie.poster_url;
    if (bgUrl) {
      html = html.replace(
        /(<!-- Ambient Backdrop Layer -->\s*<div class="[^"]*"[^>]*style="background-image:\s*url\(')[^']*('\)")/,
        `$1${bgUrl}$2`
      );
    }

    // 3. Breadcrumb
    const primaryCat = movie.category?.[0];
    const catName = primaryCat ? primaryCat.name : 'Phim';
    const catSlug = primaryCat ? primaryCat.slug : 'all';
    const breadcrumbHtml = `
      <a class="hover:text-primary transition-colors flex items-center gap-1" href="/">
        <span class="material-symbols-outlined text-[16px]">home</span>Trang Chủ
      </a>
      <span>/</span>
      <a class="hover:text-primary transition-colors" href="/kham-pha?category=${catSlug}">${catName}</a>
      <span>/</span>
      <span class="text-on-surface font-semibold truncate">${movie.name}</span>
    `;
    html = html.replace(
      /(<!-- Breadcrumb navigation -->\s*<nav[^>]*>)[\s\S]*?(<\/nav>)/,
      `$1\n${breadcrumbHtml}\n$2`
    );

    // 4. Vertical Poster
    html = html.replace(
      /(<div class="relative w-64 sm:w-72 lg:w-full max-w-\[320px\] aspect-\[2\/3\] rounded-xl overflow-hidden shadow-2xl bg-surface-container">\s*<img class="w-full h-full object-cover[^"]*"[^>]*src=")[^"]*("[^>]*\/>)/,
      `$1${movie.poster_url || movie.thumb_url}$2`
    );

    // 5. Quick Stat Bar under poster
    html = html.replace(
      /<p class="text-label-lg font-label-lg text-secondary-container font-bold">[^<]*<\/p>/,
      `<p class="text-label-lg font-label-lg text-secondary-container font-bold">${(movie.view || 128000).toLocaleString('vi-VN')}</p>`
    );
    html = html.replace(
      /<p class="text-label-lg font-label-lg text-on-surface font-semibold">[^<]*<\/p>/,
      `<p class="text-label-lg font-label-lg text-on-surface font-semibold">${movie.episode_current || (movie.status === 'completed' ? 'Trọn Bộ' : 'Đang chiếu')}</p>`
    );

    // 6. Title and Origin Name
    html = html.replace(
      /<h1 class="text-display-hero-mobile sm:text-display-hero font-display-hero text-on-surface font-extrabold tracking-tight leading-none mb-2">[\s\S]*?<\/h1>/,
      `<h1 class="text-display-hero-mobile sm:text-display-hero font-display-hero text-on-surface font-extrabold tracking-tight leading-none mb-2">\n${movie.name}\n</h1>`
    );
    html = html.replace(
      /<p class="text-headline-sm font-headline-sm text-on-surface-variant italic">[\s\S]*?<\/p>/,
      `<p class="text-headline-sm font-headline-sm text-on-surface-variant italic">\n${movie.origin_name || ''} • (${movie.year})\n</p>`
    );

    // 7. Metadata Pill Badges
    const pillsHtml = `
      <span class="px-2.5 py-1 rounded-md bg-surface-container-high text-on-surface font-label-md text-label-md">${movie.year}</span>
      <span class="px-2.5 py-1 rounded-md bg-surface-container-high text-on-surface font-label-md text-label-md">${movie.episode_current || movie.time || '1 Tập'}</span>
      <span class="px-2.5 py-1 rounded-md bg-primary-container/20 text-primary-fixed-dim font-label-md text-label-md font-bold">${movie.chieurap ? 'Chiếu Rạp' : '16+'}</span>
      <span class="px-2.5 py-1 rounded-md bg-secondary-container/20 text-secondary-fixed font-label-md text-label-md font-semibold flex items-center gap-1">
        <span class="material-symbols-outlined text-[16px]">high_quality</span>${movie.quality || '4K Ultra HD'}
      </span>
      <span class="px-2.5 py-1 rounded-md bg-tertiary-container/30 text-tertiary font-label-md text-label-md flex items-center gap-1">
        <span class="material-symbols-outlined text-[16px]">translate</span>${movie.lang || 'Vietsub'}
      </span>
      ${movie.has_song_ngu ? `
        <span class="px-2.5 py-1 rounded-md bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-label-md text-label-md font-bold flex items-center gap-1 shadow-md shadow-purple-600/30">
          <span class="material-symbols-outlined text-[16px]">record_voice_over</span>Server Song Ngữ
        </span>
      ` : ''}
    `;
    html = html.replace(
      /(<!-- Metadata Pill Badges -->\s*<div class="flex flex-wrap items-center gap-space-xs sm:gap-space-sm pt-1">)[\s\S]*?(<\/div>\s*<!-- Ratings Bar -->)/,
      `$1\n${pillsHtml}\n$2`
    );

    // 8. Genre tags
    if (movie.category && movie.category.length > 0) {
      const genresHtml = `
        <span class="text-body-sm font-body-sm text-on-surface-variant mr-1">Thể loại:</span>
        ${movie.category.map(c => `
          <a class="px-3 py-1 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors font-label-md text-label-md" href="/kham-pha?category=${c.slug}">${c.name}</a>
        `).join('')}
      `;
      html = html.replace(
        /(<!-- Genres Tags -->\s*<div class="flex flex-wrap items-center gap-2">)[\s\S]*?(<\/div>\s*<!-- Action CTA Group -->)/,
        `$1\n${genresHtml}\n$2`
      );
    }

    // 9. Watch CTA Button
    const firstEpSlug = episodes?.[0]?.server_data?.[0]?.slug || 'tap-1';
    const rawEpName = episodes?.[0]?.server_data?.[0]?.name || '1';
    const firstEpLabel = (/full/i.test(rawEpName)) ? 'Bản Full' : `Tập ${cleanEpName(rawEpName)}`;
    html = html.replace(
      /<a class="flex items-center gap-space-xs px-space-xl py-3\.5 rounded-full bg-primary-container[^"]*" href="[^"]*">[\s\S]*?<\/a>/,
      `<a class="flex items-center gap-space-xs px-space-xl py-3.5 rounded-full bg-primary-container text-on-primary-container font-headline-sm text-headline-sm shadow-[0_0_24px_rgba(229,9,20,0.5)] hover:bg-inverse-primary hover:scale-[1.02] active:scale-95 transition-all" href="/xem-phim/${movie.slug}/${firstEpSlug}?server=0">
        <span class="material-symbols-outlined text-[26px]" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
        <span>Xem Phim Ngay (${firstEpLabel})</span>
      </a>`
    );

    // 10. Synopsis
    html = html.replace(
      /(<p class="text-body-md font-body-md text-on-surface-variant leading-relaxed max-w-4xl[^"]*" id="synopsis-text">)[\s\S]*?(<\/p>)/,
      `$1\n${movie.content || 'Nội dung phim đang được cập nhật...'}\n$2`
    );

    // 11. Cast & Crew
    const directorStr = movie.director?.length ? movie.director.join(', ') : 'Đang cập nhật';
    const countryStr = movie.country?.map(c => c.name).join(', ') || 'Chính kịch';
    const actorStr = movie.actor?.length ? movie.actor.join(', ') : 'Đang cập nhật';
    const castHtml = `
      <div>
        <p class="text-label-badge font-label-badge text-on-surface-variant uppercase tracking-wider">Đạo Diễn</p>
        <p class="text-body-sm font-body-sm text-on-surface font-semibold mt-0.5">${directorStr}</p>
      </div>
      <div>
        <p class="text-label-badge font-label-badge text-on-surface-variant uppercase tracking-wider">Quốc Gia</p>
        <p class="text-body-sm font-body-sm text-on-surface font-semibold mt-0.5">${countryStr}</p>
      </div>
      <div class="sm:col-span-2 lg:col-span-1">
        <p class="text-label-badge font-label-badge text-on-surface-variant uppercase tracking-wider">Diễn Viên Chính</p>
        <p class="text-body-sm font-body-sm text-on-surface font-semibold mt-0.5 truncate">${actorStr}</p>
      </div>
    `;
    html = html.replace(
      /(<!-- Cast & Crew Metadata Grid -->\s*<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-space-sm pt-space-sm border-t border-transparent bg-surface-container-lowest\/60 p-space-md rounded-xl">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/section>)/,
      `$1\n${castHtml}\n$2`
    );

    // 12. Server Tabs & Episode Grid
    if (episodes && episodes.length > 0) {
      const serverTabsHtml = episodes.map((srv, idx) => {
        const sName = srv.server_name || `Server #${idx + 1}`;
        const icon = idx === 0 ? 'bolt' : (sName.includes('Song Ngữ') || sName.includes('Thuyết minh') ? 'record_voice_over' : 'subtitles');
        return `
        <button class="server-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${idx === 0 ? 'bg-primary-container text-on-primary-container font-bold shadow-sm' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'} font-label-md text-label-md transition-all cursor-pointer" type="button" data-index="${idx}">
          <span class="material-symbols-outlined text-[16px]">${icon}</span>
          <span>${sName}</span>
        </button>
      `;
      }).join('');

      html = html.replace(
        /(<!-- Server Picker Tabs -->\s*<div class="flex flex-wrap items-center gap-space-xs bg-surface-container-highest p-1\.5 rounded-xl">)[\s\S]*?(<\/div>\s*<\/div>)/,
        `$1\n${serverTabsHtml}\n$2`
      );

      // Episode Range Tabs & Cards
      const eps = episodes[0]?.server_data || [];
      const chunkSize = 12;
      const totalRanges = Math.ceil(eps.length / chunkSize);
      let rangeHtml = '';
      if (totalRanges > 1) {
        rangeHtml = `
          <span class="text-body-sm font-body-sm text-on-surface-variant">Phân đoạn tập:</span>
          ${Array.from({ length: totalRanges }).map((_, rIdx) => {
            const start = rIdx * chunkSize + 1;
            const end = Math.min((rIdx + 1) * chunkSize, eps.length);
            const isActive = rIdx === 0;
            return `
              <button class="range-tab px-3 py-1 rounded-md font-label-md text-label-md font-semibold transition-all cursor-pointer ${isActive ? 'bg-on-surface text-surface' : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface'}" data-range="${rIdx}" type="button">
                Tập ${start} - ${end}
              </button>
            `;
          }).join('')}
        `;
      } else {
        rangeHtml = `<span class="text-body-sm font-body-sm text-on-surface-variant">Trọn bộ ${eps.length || 1} tập</span>`;
      }

      html = html.replace(
        /(<div [^>]*id="episode-range-container"[^>]*>)[\s\S]*?(<\/div>)/,
        `$1\n${rangeHtml}\n$2`
      );

      const displayedEps = eps.slice(0, 12);
      const latestEpSlug = eps.length > 1 ? eps[eps.length - 1].slug : null;
      const epCardsHtml = displayedEps.map((e, idx) => {
        const epLabel = /full/i.test(e.name) ? 'Bản Full' : `Tập ${cleanEpName(e.name)}`;
        return `
        <div class="group relative flex flex-col bg-surface-container-low rounded-xl overflow-hidden hover:bg-surface-container hover:scale-[1.02] transition-all duration-300 cursor-pointer shadow-md" onclick="window.location.href='/xem-phim/${movie.slug}/${e.slug}?server=0'">
          <div class="relative w-full aspect-video bg-surface-container-highest overflow-hidden">
            <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src="${movie.thumb_url || movie.poster_url}" alt="${epLabel}" />
            <div class="absolute inset-0 bg-black/40 group-hover:bg-black/10 transition-colors"></div>
            <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div class="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shadow-lg">
                <span class="material-symbols-outlined text-[24px]" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
              </div>
            </div>
            ${e.slug === latestEpSlug ? '<span class="absolute top-2 left-2 px-2 py-0.5 rounded bg-primary-container text-on-primary-container font-label-badge text-label-badge font-bold">TẬP MỚI</span>' : ''}
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

      html = html.replace(
        /(<!-- Episode Grid Cards \(Thumbnails, durations, titles, progress\) -->\s*<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">)[\s\S]*?(<\/div>\s*<!-- Quick Pagination)/,
        `$1\n${epCardsHtml}\n</div>\n<!-- Quick Pagination`
      );

      // Handle Quick Pagination / Load More button
      if (eps.length <= 12) {
        html = html.replace(
          /(<!-- Quick Pagination \/ Load More Episodes -->\s*<div class="mt-space-lg flex justify-center">)[\s\S]*?(<\/div>)/,
          ''
        );
      } else {
        const nextStart = 13;
        const nextEnd = Math.min(24, eps.length);
        html = html.replace(
          /<span>Xem tiếp các tập 9 - 16<\/span>/,
          `<span>Xem tiếp các tập ${nextStart} - ${nextEnd}</span>`
        );
      }
    }

    // 13. Related & Recommended Movies Horizontal Rail (Identical to Home Rails)
    if (related && related.length > 0) {
      const relatedCardsHtml = this.renderRailCards(related, 'default');
      html = html.replace(
        /(<div id="rail-similar"[^>]*>)[\s\S]*?(<\/div>\s*<\/section>)/,
        `$1\n${relatedCardsHtml}\n$2`
      );

      // Update heading with movie category name
      const catName = movie.category?.[0]?.name ? `Phim Tương Tự (${movie.category[0].name})` : 'Phim Đề Xuất Tương Tự';
      html = html.replace(
        /<h2 class="font-headline-lg text-headline-lg text-on-surface" id="similar-movies-heading">[^<]*<\/h2>/,
        `<h2 class="font-headline-lg text-headline-lg text-on-surface" id="similar-movies-heading">${catName}</h2>`
      );
    }

    // 14. Community Discussion Feed
    let commentsFeedHtml = '';
    if (comments && comments.length > 0) {
      commentsFeedHtml = comments.map(c => `
        <div class="p-space-md rounded-2xl bg-surface-container-low transition-all">
          <div class="flex items-start justify-between gap-space-sm">
            <div class="flex items-center gap-3">
              <img class="w-10 h-10 rounded-full object-cover" src="${c.user_avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAPbHo0WbRHUQwGQOjadraD_tAk7XQUGjJQPQDSvK5RZfRCVSUufHkI5ytr1RnoudWNDKzqxm86HwkNOfZhdJ6gH5wUBF8Hu6sx3uE-8dvCv61CH5Sl6_6rcVCCUeOGM4Ub3reCBWB2-ittRPKQslAi-yOnv0WlNzjOskqtQAYGefgmgohy9WNwv1lISujIp8aIK3M0rynROP6yxRZcTMSyWswRJsdzf7K4DhDzjq8'}" alt="${c.user_name}" />
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-label-lg text-label-lg text-on-surface font-semibold">${c.user_name}</span>
                  ${c.is_vip ? '<span class="px-2 py-0.2 rounded bg-primary-container/20 text-primary-fixed-dim font-label-badge text-label-badge">VIP</span>' : '<span class="px-2 py-0.2 rounded bg-surface-container text-on-surface-variant font-label-badge text-label-badge">Thành viên</span>'}
                </div>
                <span class="text-body-sm font-body-sm text-on-surface-variant">${c.created_at || 'Vừa xong'}</span>
              </div>
            </div>
            <div class="flex text-[#E2B616]">
              ${Array.from({ length: c.rating || 5 }).map(() => '<span class="material-symbols-outlined text-[16px]" style="font-variation-settings: \'FILL\' 1;">star</span>').join('')}
            </div>
          </div>
          <p class="text-body-md font-body-md text-on-surface mt-space-sm leading-relaxed">${c.content}</p>
          <div class="flex items-center gap-space-lg mt-space-sm text-body-sm font-body-sm text-on-surface-variant">
            <button class="flex items-center gap-1.5 hover:text-primary transition-colors">
              <span class="material-symbols-outlined text-[18px]">thumb_up</span>
              <span>${c.likes || 1}</span>
            </button>
            <button class="flex items-center gap-1.5 hover:text-on-surface transition-colors">
              <span class="material-symbols-outlined text-[18px]">reply</span>
              <span>Trả lời</span>
            </button>
          </div>
        </div>
      `).join('');
    } else {
      commentsFeedHtml = `
        <div class="py-12 text-center text-on-surface-variant bg-surface-container-low rounded-2xl flex flex-col items-center gap-2">
          <span class="material-symbols-outlined text-[36px] text-surface-variant">chat_bubble_outline</span>
          <p class="font-body-md text-sm">Chưa có bình luận nào cho bộ phim này. Hãy là người đầu tiên chia sẻ cảm nhận!</p>
        </div>
      `;
    }

    html = html.replace(
      /(<!-- Comment Items List -->\s*<div class="space-y-space-sm"[^>]*>)[\s\S]*?(<\/div>\s*<\/div>\s*<\/div>\s*<\/section>\s*<!-- Related & Recommended Movies Rail Carousel -->)/,
      `$1\n${commentsFeedHtml}\n$2`
    );

    // 15. Sanitize all mock data-alt strings
    html = html.replace(/data-alt="[^"]*"/g, `data-alt="${movie.name}"`);

    return html;
  }

  /**
   * Hydrate Watch Movie Player Page (xem-phim.html) with 100% Real KKPhim API Data
   */
  renderWatch(html, detailData, activeEpSlug, comments = [], requestedServerIdx) {
    if (!detailData || !detailData.movie) return html;
    const { movie, episodes, related } = detailData;

    // Pick active server and episode
    const allServers = episodes || [];
    let activeServerIdx = 0;
    if (typeof requestedServerIdx === 'number' && requestedServerIdx >= 0 && requestedServerIdx < allServers.length) {
      activeServerIdx = requestedServerIdx;
    }

    let currentEp = null;
    const cleanNum = (val) => {
      if (!val) return '';
      const m = String(val).match(/\d+/);
      return m ? String(parseInt(m[0], 10)) : String(val).trim().toLowerCase();
    };

    if (activeEpSlug) {
      // 1. Try to find episode in the active/requested server first
      if (allServers[activeServerIdx]?.server_data) {
        currentEp = allServers[activeServerIdx].server_data.find(e => 
          e.slug === activeEpSlug || cleanNum(e.slug) === cleanNum(activeEpSlug) || cleanNum(e.name) === cleanNum(activeEpSlug)
        );
      }

      // 2. If not found in requested server, search across other servers
      if (!currentEp) {
        for (let s = 0; s < allServers.length; s++) {
          const found = allServers[s].server_data?.find(e => 
            e.slug === activeEpSlug || cleanNum(e.slug) === cleanNum(activeEpSlug) || cleanNum(e.name) === cleanNum(activeEpSlug)
          );
          if (found) {
            activeServerIdx = s;
            currentEp = found;
            break;
          }
        }
      }
    }

    if (!currentEp) {
      currentEp = allServers[activeServerIdx]?.server_data?.[0] || { name: '1', slug: 'tap-1', link_embed: '', link_m3u8: '' };
    }

    // Auto-extract link_m3u8 from link_embed if missing
    if (!currentEp.link_m3u8 && currentEp.link_embed) {
      const match = currentEp.link_embed.match(/[?&](?:url|file)=([^&]+)/i);
      if (match && match[1]) {
        try {
          const decoded = decodeURIComponent(match[1]);
          if (decoded.includes('.m3u8')) currentEp.link_m3u8 = decoded;
        } catch(e) {
          if (match[1].includes('.m3u8')) currentEp.link_m3u8 = match[1];
        }
      }
      if (!currentEp.link_m3u8) {
        const direct = currentEp.link_embed.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i);
        if (direct && direct[1]) currentEp.link_m3u8 = direct[1];
      }
    }

    // 1. Page Title
    const epDisplay = cleanEpName(currentEp.name);
    const titleStr = `Đang xem: ${movie.name} - Tập ${epDisplay} | TTPhim Cinema 4K`;
    html = html.replace(/<title>.*?<\/title>/i, `<title>${titleStr}</title>`);
    if (!html.includes('<title>')) {
      html = html.replace('<head>', `<head>\n  <title>${titleStr}</title>`);
    }

    // 2. Top Bar Navigation Strip
    html = html.replace(
      /<a\s+[^>]*data-path="chi-tiet-phim"[^>]*>/i,
      `<a class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container text-on-surface hover:bg-surface-container-highest transition-all group shrink-0" data-path="chi-tiet-phim" href="/phim/${movie.slug}">`
    );
    html = html.replace(
      /<h1 class="font-headline-sm text-headline-sm text-on-surface font-bold truncate">.*?<\/h1>/,
      `<h1 class="font-headline-sm text-headline-sm text-on-surface font-bold truncate">${movie.name}</h1>`
    );

    html = html.replace(
      /<span class="font-body-md text-body-md text-on-surface-variant truncate hidden md:inline">.*?<\/span>/,
      `<span class="font-body-md text-body-md text-on-surface-variant truncate hidden md:inline">Tập ${epDisplay}</span>`
    );

    // 3. Pre-hydrated Video Player Viewport (Prioritize link_m3u8 before link_embed)
    const playerInnerHtml = currentEp.link_m3u8 ? `
      <div id="kkphim-player-wrapper" class="relative w-full h-full bg-black rounded-xl overflow-hidden flex items-center justify-center select-none group focus:outline-none" tabindex="0">
        <video id="kkphim-player" class="w-full h-full rounded-xl object-contain bg-black" playsinline preload="auto" poster="${movie.thumb_url || movie.poster_url || ''}"></video>
        <div id="player-buffering" class="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div class="w-14 h-14 border-4 border-primary-container/20 border-t-primary-container rounded-full animate-spin"></div>
        </div>
        <div id="player-controls-top" class="absolute top-0 inset-x-0 z-30 px-4 py-3 bg-gradient-to-b from-black/90 via-black/40 to-transparent flex items-center justify-between transition-opacity duration-300 pointer-events-auto">
          <div class="flex items-center gap-2 min-w-0 pr-4">
            <span class="font-bold text-white text-sm lg:text-base truncate drop-shadow">${movie.name}</span>
            <span class="text-white/70 text-xs lg:text-sm drop-shadow whitespace-nowrap">· Tập ${epDisplay}</span>
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
        </div>
      </div>
    ` : (currentEp.link_embed ? `
      <iframe src="${currentEp.link_embed}" allowfullscreen class="w-full h-full border-0 rounded-xl" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>
    ` : `
      <div class="w-full h-full flex items-center justify-center text-on-surface-variant font-headline-sm">Tập phim đang được đồng bộ...</div>
    `);

    const partyOverlayHtml = `
      <div id="party-reactions-layer" class="absolute inset-0 pointer-events-none z-30 overflow-hidden"></div>
      <div id="party-sync-toast" class="absolute top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none bg-black/85 backdrop-blur-md px-4 py-2 rounded-full border border-white/15 text-white text-xs font-semibold flex items-center gap-2 shadow-2xl transition-all duration-300 opacity-0 -translate-y-2">
        <span class="material-symbols-outlined text-secondary-fixed text-[16px]">sync</span>
        <span id="party-sync-toast-text">Đồng bộ phát video</span>
      </div>
    `;

    html = html.replace(
      /(<div [^>]*id="player-viewport"[^>]*>)[\s\S]*?(<\/div>\s*<!-- Quick Interaction Bar Below Player -->)/,
      `$1\n${playerInnerHtml}\n${partyOverlayHtml}\n$2`
    );

    // 4. Server selector pills below player
    const serverPillsHtml = `
      <span class="text-on-surface-variant font-label-badge text-label-badge uppercase tracking-wider pl-1">Server:</span>
      ${allServers.map((s, idx) => {
        const sName = s.server_name || `Server #${idx + 1}`;
        const icon = idx === 0 ? 'bolt' : (sName.includes('Song Ngữ') || sName.includes('Thuyết minh') ? 'record_voice_over' : 'cloud_sync');
        const matchEp = s.server_data?.find(e => cleanNum(e.name) === cleanNum(currentEp?.name) || cleanNum(e.slug) === cleanNum(currentEp?.slug)) || s.server_data?.[0];
        const targetSlug = matchEp?.slug || currentEp.slug;
        return `
        <button class="server-pill-btn px-3 py-1.5 rounded-lg ${idx === activeServerIdx ? 'bg-primary-container text-on-primary-container font-bold shadow-sm' : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'} font-label-md text-label-md transition-all flex items-center gap-1.5 cursor-pointer" data-index="${idx}" data-target-slug="${targetSlug}">
          <span class="material-symbols-outlined text-[16px]">${icon}</span>
          <span>${sName}</span>
        </button>
      `;
      }).join('')}
    `;
    html = html.replace(
      /(<div class="flex items-center flex-wrap gap-2">\s*<!-- Server Selector Pills -->)[\s\S]*?(<\/div>\s*<!-- Utility Action Cluster -->)/,
      `$1\n${serverPillsHtml}\n$2`
    );

    // 5. Movie Info Below Player
    const directorStr = movie.director?.length ? movie.director.join(', ') : 'Đang cập nhật';
    const actorStr = movie.actor?.length ? movie.actor.join(', ') : 'Đang cập nhật';
    const catStr = movie.category?.map(c => c.name).join(', ') || 'Chính kịch';
    const infoSectionHtml = `
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-space-md">
        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-full bg-primary-container text-on-primary-container font-label-badge text-label-badge font-bold uppercase">HOT KKPHIM</span>
            <span class="px-2.5 py-0.5 rounded bg-surface-container-highest text-on-surface font-label-badge text-label-badge">${movie.year}</span>
            <span class="px-2.5 py-0.5 rounded bg-surface-container-highest text-on-surface font-label-badge text-label-badge">${movie.episode_current || movie.time || 'Trọn Bộ'}</span>
            <span class="px-2.5 py-0.5 rounded bg-surface-container-highest text-secondary-fixed font-label-badge text-label-badge">${movie.quality || 'FHD'}</span>
          </div>
          <h2 class="font-headline-lg text-headline-lg font-bold text-on-surface">${movie.name} ${movie.origin_name ? `(${movie.origin_name})` : ''}</h2>
          <p class="font-body-md text-body-md text-on-surface-variant leading-relaxed max-w-4xl">${movie.content || 'Nội dung phim đang cập nhật...'}</p>
        </div>
        <div class="flex flex-col items-center justify-center p-space-md rounded-xl bg-surface-container shrink-0 min-w-[140px] text-center shadow-inner">
          <div class="flex items-center gap-1 text-primary-container">
            <span class="material-symbols-outlined text-[28px]" style="font-variation-settings: 'FILL' 1;">star</span>
            <span class="font-headline-lg text-headline-lg font-black text-on-surface">9.6</span>
          </div>
          <span class="font-body-sm text-body-sm text-on-surface-variant mt-1">${(movie.view || 128000).toLocaleString('vi-VN')} lượt xem</span>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-x-6 gap-y-2 pt-space-xs font-body-sm text-body-sm text-on-surface-variant">
        <div><span class="text-on-surface font-semibold">Đạo diễn:</span> ${directorStr}</div>
        <div><span class="text-on-surface font-semibold">Diễn viên:</span> ${actorStr}</div>
        <div><span class="text-on-surface font-semibold">Thể loại:</span> ${catStr}</div>
      </div>
    `;
    html = html.replace(
      /(<!-- Movie Synopsis, Tags & Key Actors Row -->\s*<div class="w-full bg-surface-container-low rounded-xl p-space-md lg:p-space-lg flex flex-col gap-space-md shadow-md">)[\s\S]*?(<\/div>\s*<!-- Real-Time Interactive Live Chat)/,
      `$1\n${infoSectionHtml}\n$2`
    );

    // 6. Episode Drawer List
    const drawerEps = allServers[activeServerIdx]?.server_data || [];
    const drawerHtml = drawerEps.map(e => `
      <div class="ep-item w-full rounded-xl ${e.slug === currentEp.slug ? 'bg-surface-container-high border-l-4 border-l-primary-container shadow-md' : 'bg-surface-container hover:bg-surface-container-high'} p-2 flex gap-3 transition-colors cursor-pointer group" data-slug="${e.slug}" data-name="${e.name}">
        <div class="relative w-28 aspect-video rounded-lg overflow-hidden shrink-0 bg-surface-container-highest">
          <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" src="${movie.thumb_url || movie.poster_url}" alt="${e.name}" />
          ${e.slug === currentEp.slug ? `
            <div class="absolute inset-0 bg-surface-container-lowest/50 flex items-center justify-center">
              <div class="flex items-center gap-0.5">
                <span class="w-1 h-3 bg-primary-container animate-pulse"></span>
                <span class="w-1 h-4 bg-primary-container animate-pulse delay-75"></span>
                <span class="w-1 h-2 bg-primary-container animate-pulse delay-150"></span>
              </div>
            </div>
          ` : ''}
          <span class="absolute bottom-1 right-1 px-1 rounded bg-surface-container-lowest/90 font-label-badge text-[10px] text-on-surface">${movie.quality || 'FHD'}</span>
        </div>
        <div class="flex-1 min-w-0 flex flex-col justify-between py-0.5">
          <div>
            <h4 class="font-label-md text-label-md font-bold ${e.slug === currentEp.slug ? 'text-primary' : 'text-on-surface group-hover:text-primary'} transition-colors truncate block">${/full/i.test(e.name) ? 'Bản Full' : `Tập ${cleanEpName(e.name)}`}</h4>
            <p class="font-body-sm text-[12px] text-on-surface-variant line-clamp-1 mt-0.5 leading-snug">${movie.name}</p>
          </div>
          <div class="flex items-center justify-between font-label-badge text-[11px] text-on-surface-variant pt-1">
            <span>${movie.lang || 'Vietsub'}</span>
            ${e.slug === currentEp.slug ? `
              <span class="text-primary font-semibold flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-primary-container"></span> Đang phát</span>
            ` : `
              <span class="material-symbols-outlined text-[16px] group-hover:text-on-surface">play_circle</span>
            `}
          </div>
        </div>
      </div>
    `).join('');

    html = html.replace(
      /(<!-- Episode Scrollable List -->\s*<div class="p-2 space-y-2 overflow-y-auto flex-1 overscroll-contain" style="max-height: 700px;"[^>]*>)[\s\S]*?(<\/div>\s*<\/div>\s*<!-- Pane 2: Watch Party)/,
      `$1\n${drawerHtml}\n$2`
    );

    // 7. Phim Cùng Thể Loại
    if (related && related.length > 0) {
      const relatedRailHtml = related.slice(0, 4).map(r => `
        <a class="flex gap-3 items-center group p-1.5 rounded-lg hover:bg-surface-container transition-colors" href="/phim/${r.slug}">
          <div class="w-16 h-22 rounded-md overflow-hidden shrink-0 bg-surface-container-highest">
            <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" src="${r.poster_url || r.thumb_url}" alt="${r.name}" />
          </div>
          <div class="flex-1 min-w-0">
            <span class="font-label-md text-label-md font-bold text-on-surface group-hover:text-primary transition-colors truncate block">${r.name}</span>
            <span class="text-on-surface-variant font-body-sm text-[12px] block">${r.episode_current || r.year || 'Full HD'}</span>
            <div class="flex items-center gap-1 text-primary-container text-[12px] font-semibold mt-1">
              <span class="material-symbols-outlined text-[14px]" style="font-variation-settings: 'FILL' 1;">star</span>
              <span>9.2</span>
              <span class="text-on-surface-variant font-normal">· ${r.lang || 'Vietsub'}</span>
            </div>
          </div>
        </a>
      `).join('');

      html = html.replace(
        /(<!-- Continue Watching & Recommended For You Rail -->[\s\S]*?<div class="space-y-3">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/aside>)/,
        `$1\n${relatedRailHtml}\n$2`
      );
    }

    // 8. Comments List
    const commentsListHtml = (comments && comments.length > 0)
      ? comments.map(c => `
        <div class="flex items-start gap-3">
          <img class="w-9 h-9 rounded-full object-cover shrink-0" src="${c.user_avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuDmV0kJ3rLlFchh-aGILVOr-pQbdtHs2qQKQtkeKftGRHjg2nb7ii3xkFe2aJA7-Gldl5BqHuj4L_uiVmqQyW9CCgKPrUz_MCzKjGtUsI1R3dM0r3vXdhkgOsKaL_SVbs9gl7b2sTWQGr3VphY1X_pUChBkXZ-KPQtC6HeaIV7uxpjuEKEltMKcvR78AOcVjnQlk989xeMDULyOev-eHEjgdEO-N14MVTh2oQR_E3A'}" alt="${c.user_name || 'Khán giả'}" />
          <div class="flex-1 space-y-1">
            <div class="flex items-center gap-2">
              <span class="font-label-md text-label-md font-bold text-on-surface">${c.user_name || 'Khán giả'}</span>
              <span class="font-body-sm text-[12px] text-on-surface-variant">${c.created_at || 'Vừa xong'}</span>
            </div>
            <p class="font-body-md text-body-md text-on-surface">
              ${c.timestamp_tag ? `<span class="text-primary hover:underline cursor-pointer font-semibold">${c.timestamp_tag}</span> ` : ''}
              ${c.content}
            </p>
            <div class="flex items-center gap-4 text-on-surface-variant font-body-sm text-body-sm pt-1">
              <button class="flex items-center gap-1 hover:text-primary transition-colors"><span class="material-symbols-outlined text-[16px]">thumb_up</span> ${c.likes || 1}</button>
              <button class="hover:text-on-surface transition-colors">Trả lời</button>
            </div>
          </div>
        </div>
      `).join('')
      : `
        <div class="text-center py-8 text-on-surface-variant font-body-sm">
          <span class="material-symbols-outlined text-4xl mb-2 text-outline block">chat_bubble_outline</span>
          Chưa có bình luận nào. Hãy là người đầu tiên chia sẻ cảm nghĩ về bộ phim!
        </div>
      `;

    html = html.replace(
      /(<!-- Comment feed list -->\s*<div[^>]*id="watch-comments-list"[^>]*>)[\s\S]*?(<\/div>\s*<\/div>\s*<\/div>\s*<!-- Right Episode Playlist Drawer)/,
      `$1\n${commentsListHtml}\n$2`
    );

    // 9. Sanitize all mock data-alt strings
    html = html.replace(/data-alt="[^"]*"/g, `data-alt="${movie.name}"`);

    return html;
  }
}

module.exports = new TemplateService();

