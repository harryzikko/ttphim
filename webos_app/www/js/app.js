(function (global) {
  'use strict';

  var Api = global.TvApi;
  var Spatial = global.TvSpatial;
  var Player = global.TvPlayer;

  var appState = {
    tab: 'home',
    homeData: Api.getCachedHome(),
    history: [],
    watchlist: [],
    heroIndex: 0,
    heroTimer: null,
    searchQuery: '',
    searchResults: [],
    searchTrending: [],
    searchTimer: null,
    loginPollTimer: null,
    loginCountdownTimer: null,
    loginSession: null,
    loginSeconds: 300,
    lastStageFocus: null
  };

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatMmSs(sec) {
    var total = Math.max(0, Math.floor(Number(sec) || 0));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    var p = function (n) { return n < 10 ? '0' + n : String(n); };
    return h > 0 ? (h + ':' + p(m) + ':' + p(s)) : (p(m) + ':' + p(s));
  }

  function updateSidebarUser() {
    var user = Api.getUser();
    var avatarEl = document.getElementById('tv-sidebar-avatar');
    var nameEl = document.getElementById('tv-sidebar-name');
    if (nameEl) nameEl.textContent = (user && user.name) ? user.name : 'Khách';
    if (avatarEl) {
      if (user && user.avatar) {
        avatarEl.innerHTML = '<img src="' + esc(Api.fullImg(user.avatar)) + '" alt="" />';
      } else {
        var letter = (user && user.name) ? user.name.charAt(0).toUpperCase() : 'K';
        avatarEl.textContent = letter;
      }
    }
  }

  function setActiveNav(tab) {
    var btns = document.querySelectorAll('.tv-nav-item');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-nav') === tab);
    }
  }

  function movieCardHtml(m, extraAttrs) {
    var slug = m.slug || m.movie_slug || '';
    var name = m.name || m.movie_name || '';
    var img = Api.fullImg(m.poster_url || m.thumb_url);
    var badge = m.episode_current || m.quality || '';
    var meta = [m.origin_name || '', m.year || ''].filter(Boolean).join(' • ');
    return '<button class="tv-card" data-focusable="true" data-slug="' + esc(slug) + '" ' + (extraAttrs || '') + '>' +
      '<div class="tv-card-poster">' +
      (img ? '<img src="' + esc(img) + '" alt="' + esc(name) + '" loading="lazy" />' : '') +
      (badge ? '<span class="tv-card-badge">' + esc(badge) + '</span>' : '') +
      '<div class="tv-card-scrim"></div>' +
      '</div>' +
      '<div class="tv-card-title">' + esc(name) + '</div>' +
      '<div class="tv-card-meta">' + esc(meta) + '</div>' +
      '</button>';
  }

  function rankingCardHtml(m, rank) {
    var slug = m.slug || m.movie_slug || '';
    var name = m.name || m.movie_name || '';
    var img = Api.fullImg(m.poster_url || m.thumb_url);
    var metric = m.quality || m.episode_current || '';
    return '<button class="tv-card" data-focusable="true" data-slug="' + esc(slug) + '">' +
      '<div class="tv-card-poster">' +
      (img ? '<img src="' + esc(img) + '" alt="' + esc(name) + '" loading="lazy" />' : '') +
      '<div class="tv-card-scrim" style="height:120px;"></div>' +
      (metric ? '<span class="tv-rank-metric">' + esc(metric) + '</span>' : '') +
      '<span class="tv-rank-num">' + rank + '</span>' +
      '</div>' +
      '<div class="tv-card-title">' + esc(name) + '</div>' +
      '<div class="tv-card-meta">' + esc(m.origin_name || '') + '</div>' +
      '</button>';
  }

  function continueCardHtml(item, idx) {
    var img = Api.fullImg(item.thumb_url || item.poster_url);
    var pct = Math.max(4, Math.min(100, Number(item.progress_percent) || 12));
    var subtitle = (item.episode_name || 'Đang xem') + ' • ' + formatMmSs(item.current_time);
    return '<button class="tv-cw-card" data-focusable="true" data-cw-idx="' + idx + '">' +
      '<div class="tv-cw-thumb">' +
      (img ? '<img src="' + esc(img) + '" alt="' + esc(item.movie_name) + '" loading="lazy" />' : '') +
      '<div class="tv-card-scrim"></div>' +
      '<div class="tv-cw-play-chip">▶</div>' +
      '<div class="tv-cw-bar"><div class="tv-cw-bar-fill" style="width:' + pct + '%;"></div></div>' +
      '</div>' +
      '<div class="tv-card-title">' + esc(item.movie_name || item.movie_slug) + '</div>' +
      '<div class="tv-card-meta">' + esc(subtitle) + '</div>' +
      '</button>';
  }

  function renderSection(title, sub, innerHtml, isRail) {
    if (!innerHtml) return '';
    return '<section class="tv-section">' +
      '<div class="tv-section-head">' +
      '<span class="tv-section-sub">' + esc(sub) + '</span>' +
      '<h2 class="tv-section-title">' + esc(title) + '</h2>' +
      '</div>' +
      (isRail ? ('<div class="tv-rail">' + innerHtml + '</div>') : innerHtml) +
      '</section>';
  }

  function pickSpotlightBackdrop(sp) {
    return Api.fullImg(sp.hero_backdrop_url || sp.thumb_url || sp.poster_url || sp.hero_poster_url);
  }

  function renderHeroHtml(spotlights) {
    if (!spotlights || !spotlights.length) return '';
    var sp = spotlights[appState.heroIndex % spotlights.length];
    var bg = pickSpotlightBackdrop(sp);
    var title = sp.banner_title || sp.name || '';
    var desc = sp.banner_description || sp.content || '';
    var dots = '';
    for (var i = 0; i < Math.min(spotlights.length, 7); i++) {
      dots += '<span class="tv-hero-dot' + (i === (appState.heroIndex % spotlights.length) ? ' active' : '') + '"></span>';
    }
    return '<div class="tv-hero" id="tv-hero">' +
      (bg ? '<img class="tv-hero-backdrop" id="tv-hero-img" src="' + esc(bg) + '" alt="" />' : '') +
      '<div class="tv-hero-scrim-left"></div>' +
      '<div class="tv-hero-scrim-bottom"></div>' +
      '<div class="tv-hero-content">' +
      '  <div class="tv-hero-badges">' +
      '    <span class="tv-pill tv-pill-red">NỔI BẬT</span>' +
      (sp.quality ? '<span class="tv-pill tv-pill-gold">' + esc(sp.quality) + '</span>' : '') +
      (sp.year ? '<span class="tv-pill">' + esc(sp.year) + '</span>' : '') +
      (sp.lang ? '<span class="tv-pill">' + esc(sp.lang) + '</span>' : '') +
      '  </div>' +
      '  <h1 class="tv-hero-title" id="tv-hero-title">' + esc(title) + '</h1>' +
      (sp.origin_name ? '<div class="tv-hero-origin">' + esc(sp.origin_name) + '</div>' : '') +
      (desc ? '<p class="tv-hero-desc">' + esc(desc.replace(/<[^>]+>/g, '')) + '</p>' : '') +
      '  <div class="tv-hero-actions">' +
      '    <button class="tv-btn tv-btn-primary" id="tv-hero-play" data-focusable="true" data-slug="' + esc(sp.slug) + '">▶ Phát ngay</button>' +
      '    <button class="tv-btn" id="tv-hero-detail" data-focusable="true" data-slug="' + esc(sp.slug) + '">ⓘ Chi tiết phim</button>' +
      '  </div>' +
      '</div>' +
      '<div class="tv-hero-dots">' + dots + '</div>' +
      '</div>';
  }

  function wireStageCardClicks(stage) {
    stage.querySelectorAll('.tv-card[data-slug]').forEach(function (card) {
      card.addEventListener('click', function () {
        openDetail(card.getAttribute('data-slug'));
      });
    });
    stage.querySelectorAll('.tv-cw-card[data-cw-idx]').forEach(function (card) {
      card.addEventListener('click', function () {
        var idx = Number(card.getAttribute('data-cw-idx'));
        var item = appState.history[idx];
        if (item) openContinueDialog(item);
      });
    });
    var heroPlay = document.getElementById('tv-hero-play');
    if (heroPlay) {
      heroPlay.addEventListener('click', function () {
        openDirectPlay(heroPlay.getAttribute('data-slug'), null, 0);
      });
    }
    var heroDetail = document.getElementById('tv-hero-detail');
    if (heroDetail) {
      heroDetail.addEventListener('click', function () {
        openDetail(heroDetail.getAttribute('data-slug'));
      });
    }
  }

  function renderHome() {
    var stage = document.getElementById('tv-stage');
    if (!appState.homeData) {
      stage.innerHTML = '<div class="tv-loading-screen"><div class="tv-spinner"></div><div>Đang tải kho phim CineViet…</div></div>';
      Api.getHome().then(function (data) {
        appState.homeData = data;
        if (appState.tab === 'home') renderHome();
      }).catch(function (err) {
        stage.innerHTML = '<div class="tv-loading-screen"><div style="color:#FCA5A5;">' + esc(err.message) + '</div><button class="tv-btn tv-btn-primary" id="tv-home-retry" data-focusable="true">Thử lại</button></div>';
        document.getElementById('tv-home-retry').addEventListener('click', function () { appState.homeData = null; renderHome(); });
        Spatial.focusFirst(stage);
      });
      return;
    }

    var d = appState.homeData;
    var html = '';
    if (d.spotlights && d.spotlights.length) html += renderHeroHtml(d.spotlights);

    if (appState.history && appState.history.length) {
      html += renderSection('Tiếp Tục Xem', 'XEM TIẾP DỞ DANG', appState.history.map(continueCardHtml).join(''), true);
    }
    if (d.rankings && d.rankings.length) {
      html += renderSection('Bảng Xếp Hạng Hôm Nay', 'TOP THỊNH HÀNH', d.rankings.slice(0, 10).map(function (m, i) { return rankingCardHtml(m, i + 1); }).join(''), true);
    }
    if (d.latest && d.latest.length) {
      html += renderSection('Phim Mới Cập Nhật', 'MỚI NHẤT', d.latest.map(function (m) { return movieCardHtml(m); }).join(''), true);
    }
    if (d.cinema && d.cinema.length) {
      html += renderSection('Phim Chiếu Rạp', 'BẢN ĐẸP CHUẨN RẠP', d.cinema.map(function (m) { return movieCardHtml(m); }).join(''), true);
    }
    if (d.series && d.series.length) {
      html += renderSection('Phim Bộ Hot', 'TRUYỀN HÌNH ĐẶC SẮC', d.series.map(function (m) { return movieCardHtml(m); }).join(''), true);
    }
    if (d.singles && d.singles.length) {
      html += renderSection('Phim Lẻ Chọn Lọc', 'ĐIỆN ẢNH ĐỈNH CAO', d.singles.map(function (m) { return movieCardHtml(m); }).join(''), true);
    }
    if (d.tvshows && d.tvshows.length) {
      html += renderSection('TV Shows', 'GIẢI TRÍ ĐẶC SẮC', d.tvshows.map(function (m) { return movieCardHtml(m); }).join(''), true);
    }
    if (d.anime && d.anime.length) {
      html += renderSection('Hoạt Hình & Anime', 'THẾ GIỚI ANIME', d.anime.map(function (m) { return movieCardHtml(m); }).join(''), true);
    }

    stage.innerHTML = html;
    wireStageCardClicks(stage);
    clearInterval(appState.heroTimer);
    if (d.spotlights && d.spotlights.length > 1) {
      appState.heroTimer = setInterval(function () {
        if (appState.tab !== 'home') return;
        var detail = document.getElementById('tv-detail-layer');
        var player = document.getElementById('tv-player-layer');
        if ((detail && !detail.classList.contains('hidden')) || (player && !player.classList.contains('hidden'))) return;
        var active = Spatial.getCurrent();
        if (active && (active.id === 'tv-hero-play' || active.id === 'tv-hero-detail')) return;
        appState.heroIndex = (appState.heroIndex + 1) % d.spotlights.length;
        var heroEl = document.getElementById('tv-hero');
        if (heroEl) {
          var tmp = document.createElement('div');
          tmp.innerHTML = renderHeroHtml(d.spotlights);
          heroEl.parentNode.replaceChild(tmp.firstChild, heroEl);
          wireStageCardClicks(stage);
        }
      }, 9000);
    }
    if (!Spatial.getCurrent() || !Spatial.getCurrent().isConnected) {
      Spatial.focusSelector('#tv-hero-play', stage) || Spatial.focusFirst(stage);
    }
  }

  function renderCatalogGrid(typeKey, title, subtitle) {
    var stage = document.getElementById('tv-stage');
    stage.innerHTML = '<div class="tv-loading-screen"><div class="tv-spinner"></div><div>Đang tải ' + esc(title) + '…</div></div>';
    Api.getCatalog(typeKey, 1, 40).then(function (movies) {
      if (appState.tab !== (typeKey === 'phim-bo' ? 'series' : 'singles')) return;
      var html = '<div class="tv-catalog-head"><h1 class="tv-catalog-title">' + esc(title) + '</h1><div class="tv-catalog-sub">' + movies.length + ' phim — ' + esc(subtitle) + '</div></div>' +
        '<div class="tv-grid-5">' + movies.map(function (m) { return movieCardHtml(m); }).join('') + '</div>';
      stage.innerHTML = html;
      wireStageCardClicks(stage);
    }).catch(function (err) {
      stage.innerHTML = '<div class="tv-loading-screen"><div>' + esc(err.message) + '</div></div>';
    });
  }

  function renderSearch() {
    var stage = document.getElementById('tv-stage');
    var keysRows = [
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
      ['K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'],
      ['U', 'V', 'W', 'X', 'Y', 'Z', '0', '1', '2', '3'],
      ['4', '5', '6', '7', '8', '9', '-', '&', '.', ':']
    ];
    var chips = ['Chiếu rạp', 'Hành động', 'Kinh dị', 'Tình cảm', 'Hàn Quốc', 'Anime', 'Thuyết minh'];

    var kbdHtml = keysRows.map(function (row) {
      return '<div class="tv-kbd-row">' + row.map(function (ch) {
        return '<button class="tv-key" data-focusable="true" data-key="' + esc(ch) + '">' + esc(ch) + '</button>';
      }).join('') + '</div>';
    }).join('') +
      '<div class="tv-kbd-row-actions">' +
      '  <button class="tv-key" data-focusable="true" data-act="back">⌫ Xóa</button>' +
      '  <button class="tv-key" data-focusable="true" data-act="space">Khoảng trắng</button>' +
      '  <button class="tv-key" data-focusable="true" data-act="clear">Xóa hết</button>' +
      '</div>';

    var rightList = appState.searchQuery.trim() ? appState.searchResults : appState.searchTrending;
    var rightTitle = appState.searchQuery.trim()
      ? ('Kết quả cho "' + appState.searchQuery + '" (' + rightList.length + ')')
      : 'Phim Thịnh Hành Đề Xuất';

    stage.innerHTML =
      '<div class="tv-search-layout">' +
      '  <div class="tv-search-left">' +
      '    <h1 style="font-size:28px;font-weight:900;">Tìm Kiếm Phim</h1>' +
      '    <div class="tv-search-box" id="tv-search-display">' +
      (appState.searchQuery ? esc(appState.searchQuery) : '<span class="tv-search-placeholder">Nhập tên phim bằng bàn phím TV…</span>') +
      '    </div>' +
      '    <div class="tv-chips">' + chips.map(function (c) {
        return '<button class="tv-chip" data-focusable="true" data-chip="' + esc(c) + '">' + esc(c) + '</button>';
      }).join('') + '</div>' +
      '    <div class="tv-kbd">' + kbdHtml + '</div>' +
      '  </div>' +
      '  <div class="tv-search-right">' +
      '    <h2 id="tv-search-heading" style="font-size:22px;font-weight:800;margin-bottom:14px;">' + esc(rightTitle) + '</h2>' +
      '    <div id="tv-search-grid" class="tv-grid-4">' +
      (rightList.length ? rightList.map(function (m) { return movieCardHtml(m); }).join('') : '<div style="color:#94A3B8;font-size:17px;">Không tìm thấy phim phù hợp.</div>') +
      '    </div>' +
      '  </div>' +
      '</div>';

    if (!appState.searchTrending.length) {
      Api.getCatalog('phim-moi-cap-nhat', 1, 16).then(function (items) {
        appState.searchTrending = items || [];
        if (appState.tab === 'search' && !appState.searchQuery.trim()) updateSearchGrid();
      }).catch(function () {});
    }

    function updateSearchGrid() {
      var box = document.getElementById('tv-search-display');
      var head = document.getElementById('tv-search-heading');
      var grid = document.getElementById('tv-search-grid');
      if (box) {
        box.innerHTML = appState.searchQuery ? esc(appState.searchQuery) : '<span class="tv-search-placeholder">Nhập tên phim bằng bàn phím TV…</span>';
      }
      var list = appState.searchQuery.trim() ? appState.searchResults : appState.searchTrending;
      if (head) head.textContent = appState.searchQuery.trim() ? ('Kết quả cho "' + appState.searchQuery + '" (' + list.length + ')') : 'Phim Thịnh Hành Đề Xuất';
      if (grid) {
        grid.innerHTML = list.length ? list.map(function (m) { return movieCardHtml(m); }).join('') : '<div style="color:#94A3B8;font-size:17px;">Không tìm thấy phim phù hợp.</div>';
        wireStageCardClicks(grid);
      }
    }

    function triggerSearch() {
      clearTimeout(appState.searchTimer);
      var q = appState.searchQuery.trim();
      if (!q) {
        appState.searchResults = [];
        updateSearchGrid();
        return;
      }
      updateSearchGrid();
      appState.searchTimer = setTimeout(function () {
        Api.searchMovies(q).then(function (items) {
          appState.searchResults = items || [];
          if (appState.tab === 'search') updateSearchGrid();
        }).catch(function () {});
      }, 280);
    }

    stage.querySelectorAll('.tv-key').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ch = btn.getAttribute('data-key');
        var act = btn.getAttribute('data-act');
        if (ch) appState.searchQuery += ch.toLowerCase();
        else if (act === 'space') appState.searchQuery += ' ';
        else if (act === 'back') appState.searchQuery = appState.searchQuery.slice(0, -1);
        else if (act === 'clear') appState.searchQuery = '';
        triggerSearch();
      });
    });

    stage.querySelectorAll('.tv-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        appState.searchQuery = chip.getAttribute('data-chip') || '';
        triggerSearch();
      });
    });

    wireStageCardClicks(stage);
  }

  function clearAccountTimers() {
    clearInterval(appState.loginPollTimer);
    clearInterval(appState.loginCountdownTimer);
  }

  function renderAccount() {
    clearAccountTimers();
    var stage = document.getElementById('tv-stage');
    if (Api.isLoggedIn()) {
      var user = Api.getUser() || {};
      var avatarInner = user.avatar
        ? '<img src="' + esc(Api.fullImg(user.avatar)) + '" alt="" />'
        : esc((user.name || 'U').charAt(0).toUpperCase());

      stage.innerHTML =
        '<div class="tv-account-wrap">' +
        '  <div class="tv-profile-card">' +
        '    <div class="tv-profile-left">' +
        '      <div class="tv-profile-avatar">' + avatarInner + '</div>' +
        '      <div>' +
        '        <h1 style="font-size:28px;font-weight:900;">' + esc(user.name || 'Khán giả CineViet') + '</h1>' +
        '        <div style="color:#94A3B8;font-size:15px;margin-top:4px;">' + esc(user.email || 'Đã liên kết qua mã TV QR') + '</div>' +
        '      </div>' +
        '    </div>' +
        '    <button class="tv-btn tv-btn-primary" id="tv-logout-btn" data-focusable="true">Đăng xuất tài khoản</button>' +
        '  </div>' +
        '  <div class="tv-profile-card">' +
        '    <div><div style="font-size:19px;font-weight:800;">CineViet LG webOS TV</div><div style="color:#94A3B8;font-size:14px;margin-top:4px;">Phiên bản v1.0.0 • Giao diện Nocturne Cinema 10ft</div></div>' +
        '    <div style="color:#10B981;font-weight:800;font-size:15px;">● Đã đồng bộ</div>' +
        '  </div>' +
        '  <div id="tv-watchlist-mount"><div class="tv-loading-screen" style="height:200px;"><div class="tv-spinner"></div></div></div>' +
        '</div>';

      document.getElementById('tv-logout-btn').addEventListener('click', function () {
        Api.logout();
        appState.watchlist = [];
        appState.history = Api.getLocalHistory();
        updateSidebarUser();
        renderAccount();
      });

      Api.getUserLibrary().then(function (lib) {
        appState.watchlist = lib.watchlist || [];
        var mount = document.getElementById('tv-watchlist-mount');
        if (!mount) return;
        if (!appState.watchlist.length) {
          mount.innerHTML = '<div style="color:#94A3B8;font-size:16px;padding:18px;">Chưa có phim yêu thích nào. Bấm Yêu thích trong chi tiết phim để lưu tại đây.</div>';
        } else {
          mount.innerHTML = renderSection('Danh Sách Yêu Thích (' + appState.watchlist.length + ')', 'ĐÃ LƯU', appState.watchlist.map(function (m) { return movieCardHtml(m); }).join(''), true);
          wireStageCardClicks(mount);
        }
      }).catch(function () {});
      return;
    }

    // TV QR + 6-Digit Activation Login (matches TvLoginScreen.kt)
    stage.innerHTML = '<div class="tv-loading-screen"><div class="tv-spinner"></div><div>Đang tạo mã liên kết TV…</div></div>';
    Api.createTvSession().then(function (s) {
      if (appState.tab !== 'account') return;
      appState.loginSession = s;
      appState.loginSeconds = Number(s.expires_in) || 300;
      var code = String(s.code || '------').slice(0, 6);
      var qrUrl = s.qr_url || ('https://cineviet.live/tv-login?code=' + encodeURIComponent(code));
      var qrImgUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=8&data=' + encodeURIComponent(qrUrl);

      var digitsHtml = '';
      for (var i = 0; i < 6; i++) {
        digitsHtml += '<div class="tv-digit">' + esc(code.charAt(i) || '-') + '</div>';
      }

      stage.innerHTML =
        '<div class="tv-login-wrap">' +
        '  <div class="tv-login-card">' +
        '    <div class="tv-qr-panel">' +
        '      <img src="' + esc(qrImgUrl) + '" alt="QR đăng nhập CineViet TV" onerror="this.style.display=\'none\'" />' +
        '      <div class="tv-qr-caption">Quét mã QR bằng camera điện thoại để đăng nhập ngay</div>' +
        '    </div>' +
        '    <div>' +
        '      <h1 style="font-size:30px;font-weight:900;">Đăng Nhập TV Bằng Mã 6 Số</h1>' +
        '      <p style="color:#94A3B8;font-size:16px;margin-top:8px;line-height:1.5;">Mở <strong style="color:#FFFFFF;">cineviet.live/tv-login</strong> trên điện thoại hoặc máy tính và nhập mã bên dưới để đồng bộ lịch sử xem &amp; yêu thích:</p>' +
        '      <div class="tv-code-digits">' + digitsHtml + '</div>' +
        '      <div id="tv-login-timer" style="color:#FFB800;font-size:15px;font-weight:700;margin-bottom:22px;">Hiệu lực còn: ' + appState.loginSeconds + ' giây</div>' +
        '      <div style="display:flex;gap:14px;">' +
        '        <button class="tv-btn tv-btn-primary" id="tv-login-refresh" data-focusable="true">↻ Làm mới mã</button>' +
        '        <button class="tv-btn" id="tv-login-skip" data-focusable="true">Bỏ qua, xem ngay</button>' +
        '      </div>' +
        '    </div>' +
        '  </div>' +
        '</div>';

      document.getElementById('tv-login-refresh').addEventListener('click', renderAccount);
      document.getElementById('tv-login-skip').addEventListener('click', function () { switchTab('home'); });
      Spatial.focusSelector('#tv-login-refresh', stage);

      appState.loginCountdownTimer = setInterval(function () {
        appState.loginSeconds -= 1;
        var tEl = document.getElementById('tv-login-timer');
        if (tEl) tEl.textContent = 'Hiệu lực còn: ' + Math.max(0, appState.loginSeconds) + ' giây';
        if (appState.loginSeconds <= 0 && appState.tab === 'account') renderAccount();
      }, 1000);

      appState.loginPollTimer = setInterval(function () {
        if (!s.token || appState.tab !== 'account') return;
        Api.getTvStatus(s.token).then(function (resp) {
          if (resp && resp.status === 'approved' && resp.token) {
            clearAccountTimers();
            Api.saveSession(resp.token, resp.user);
            updateSidebarUser();
            syncUserLibrary();
            renderAccount();
          } else if (resp && resp.status === 'expired') {
            renderAccount();
          }
        }).catch(function () {});
      }, 3000);
    }).catch(function (err) {
      stage.innerHTML = '<div class="tv-loading-screen"><div style="color:#FCA5A5;">' + esc(err.message) + '</div><button class="tv-btn tv-btn-primary" id="tv-login-retry" data-focusable="true">Thử lại</button></div>';
      document.getElementById('tv-login-retry').addEventListener('click', renderAccount);
      Spatial.focusFirst(stage);
    });
  }

  function openContinueDialog(item) {
    var modal = document.getElementById('tv-modal-layer');
    modal.innerHTML =
      '<div class="tv-modal-box">' +
      '  <h2 style="font-size:24px;font-weight:900;">' + esc(item.movie_name || item.movie_slug) + '</h2>' +
      '  <div style="color:#94A3B8;font-size:15px;">Đã xem ' + esc(item.episode_name || '') + ' đến mốc ' + formatMmSs(item.current_time) + '</div>' +
      '  <div style="display:flex;flex-direction:column;gap:12px;margin-top:6px;">' +
      '    <button class="tv-btn tv-btn-primary" id="tv-cw-resume" data-focusable="true">▶ Xem tiếp từ ' + formatMmSs(item.current_time) + '</button>' +
      '    <button class="tv-btn" id="tv-cw-restart" data-focusable="true">↺ Phát lại từ đầu</button>' +
      '    <button class="tv-btn" id="tv-cw-detail" data-focusable="true">ⓘ Xem thông tin phim</button>' +
      '    <button class="tv-btn" id="tv-cw-remove" data-focusable="true">🗑 Xóa khỏi Tiếp tục xem</button>' +
      '    <button class="tv-btn" id="tv-cw-cancel" data-focusable="true">Đóng</button>' +
      '  </div>' +
      '</div>';
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    function closeModal() {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML = '';
    }

    document.getElementById('tv-cw-resume').addEventListener('click', function () {
      closeModal();
      openDirectPlay(item.movie_slug, item.episode_slug, Number(item.current_time) || 0);
    });
    document.getElementById('tv-cw-restart').addEventListener('click', function () {
      closeModal();
      openDirectPlay(item.movie_slug, item.episode_slug, 0);
    });
    document.getElementById('tv-cw-detail').addEventListener('click', function () {
      closeModal();
      openDetail(item.movie_slug);
    });
    document.getElementById('tv-cw-remove').addEventListener('click', function () {
      Api.removeHistory(item.movie_slug).then(function () {
        appState.history = appState.history.filter(function (x) { return x.movie_slug !== item.movie_slug; });
        closeModal();
        if (appState.tab === 'home') renderHome();
      });
    });
    document.getElementById('tv-cw-cancel').addEventListener('click', closeModal);
    Spatial.focusSelector('#tv-cw-resume', modal);
  }

  function openDirectPlay(slug, epSlug, startSec) {
    Api.getMovieDetail(slug).then(function (data) {
      Api.trackView(slug);
      var hist = data.watchedHistory;
      var seek = startSec > 0 ? startSec : (hist && (!epSlug || hist.episode_slug === epSlug) ? Number(hist.current_time) || 0 : 0);
      Player.open({
        movie: data.movie || { slug: slug },
        episodes: data.episodes || [],
        episodeSlug: epSlug || (hist && hist.episode_slug) || null,
        startSec: seek,
        onClose: function () {
          syncUserLibrary();
          var detail = document.getElementById('tv-detail-layer');
          if (detail && !detail.classList.contains('hidden')) {
            Spatial.focusFirst(detail);
          } else {
            Spatial.focusFirst(document.getElementById('tv-stage'));
          }
        }
      });
    }).catch(function () {});
  }

  function openDetail(slug) {
    var layer = document.getElementById('tv-detail-layer');
    appState.lastStageFocus = Spatial.getCurrent();
    layer.innerHTML = '<div class="tv-loading-screen"><div class="tv-spinner"></div><div>Đang tải thông tin phim…</div></div>';
    layer.classList.remove('hidden');
    layer.setAttribute('aria-hidden', 'false');

    Api.getMovieDetail(slug).then(function (data) {
      Api.trackView(slug);
      var movie = data.movie || {};
      var episodes = Array.isArray(data.episodes) ? data.episodes : [];
      var selectedServer = 0;
      var inWatchlist = Boolean(data.inWatchlist);
      var history = data.watchedHistory;
      var poster = Api.fullImg(movie.poster_url || movie.thumb_url);
      var backdrop = Api.fullImg(movie.thumb_url || movie.poster_url);

      function renderDetailView() {
        var srv = episodes[selectedServer] || { server_data: [] };
        var epList = Array.isArray(srv.server_data) ? srv.server_data : [];
        var playLabel = (history && history.episode_slug) ? ('▶ Xem tiếp ' + (history.episode_name || '')) : '▶ Xem Ngay';
        var genres = Array.isArray(movie.category) ? movie.category.map(function (c) { return c.name; }).filter(Boolean).join(', ') : '';
        var cleanDesc = String(movie.content || '').replace(/<[^>]+>/g, '');

        var srvHtml = episodes.map(function (s, idx) {
          return '<button class="tv-chip' + (idx === selectedServer ? ' active' : '') + '" style="' + (idx === selectedServer ? 'background:#E50914;color:#FFF;' : '') + '" data-focusable="true" data-det-srv="' + idx + '">' + esc(s.server_name || ('Server ' + (idx + 1))) + '</button>';
        }).join('');

        var epHtml = epList.slice(0, 80).map(function (ep, idx) {
          var isCur = history && history.episode_slug === ep.slug;
          return '<button class="tv-ep-btn' + (isCur ? ' active' : '') + '" data-focusable="true" data-det-ep="' + esc(ep.slug) + '">' + esc(ep.name || ('Tập ' + (idx + 1))) + '</button>';
        }).join('');

        layer.innerHTML =
          '<div class="tv-detail-backdrop-wrap">' + (backdrop ? '<img src="' + esc(backdrop) + '" alt="" />' : '') + '<div class="tv-detail-scrim"></div></div>' +
          '<div class="tv-detail-body">' +
          '  <div><button class="tv-btn" id="tv-detail-back" data-focusable="true">← Quay lại</button></div>' +
          '  <div class="tv-detail-top">' +
          '    <div class="tv-detail-poster">' + (poster ? '<img src="' + esc(poster) + '" alt="' + esc(movie.name) + '" />' : '') + '</div>' +
          '    <div class="tv-detail-info">' +
          '      <div class="tv-hero-badges">' +
          (movie.quality ? '<span class="tv-pill tv-pill-gold">' + esc(movie.quality) + '</span>' : '') +
          (movie.year ? '<span class="tv-pill">' + esc(movie.year) + '</span>' : '') +
          (movie.episode_current ? '<span class="tv-pill tv-pill-red">' + esc(movie.episode_current) + '</span>' : '') +
          (movie.time ? '<span class="tv-pill">' + esc(movie.time) + '</span>' : '') +
          '      </div>' +
          '      <h1 style="font-size:40px;font-weight:900;line-height:1.12;">' + esc(movie.name || '') + '</h1>' +
          (movie.origin_name ? '<div style="font-size:18px;color:#CBD5E1;font-weight:600;">' + esc(movie.origin_name) + '</div>' : '') +
          (genres ? '<div style="font-size:15px;color:#94A3B8;">Thể loại: ' + esc(genres) + '</div>' : '') +
          (cleanDesc ? '<p style="font-size:16px;line-height:1.55;color:#CBD5E1;max-width:860px;">' + esc(cleanDesc) + '</p>' : '') +
          '      <div style="display:flex;gap:14px;margin-top:8px;">' +
          '        <button class="tv-btn tv-btn-primary" id="tv-detail-play" data-focusable="true">' + esc(playLabel) + '</button>' +
          '        <button class="tv-btn" id="tv-detail-fav" data-focusable="true">' + (inWatchlist ? '♥ Đã yêu thích' : '♡ Yêu thích') + '</button>' +
          '      </div>' +
          '    </div>' +
          '  </div>' +
          (episodes.length ? ('<div><h2 style="font-size:20px;font-weight:800;margin-bottom:12px;">Chọn Nguồn Phát</h2><div class="tv-chips">' + srvHtml + '</div></div>') : '') +
          (epList.length ? ('<div><h2 style="font-size:20px;font-weight:800;margin-bottom:12px;">Danh Sách Tập (' + epList.length + ')</h2><div class="tv-ep-grid">' + epHtml + '</div></div>') : '') +
          '</div>';

        document.getElementById('tv-detail-back').addEventListener('click', closeDetail);
        document.getElementById('tv-detail-play').addEventListener('click', function () {
          var epSlug = (history && history.episode_slug) || (epList[0] && epList[0].slug) || null;
          var startSec = (history && history.episode_slug === epSlug) ? (Number(history.current_time) || 0) : 0;
          Player.open({ movie: movie, episodes: episodes, serverIndex: selectedServer, episodeSlug: epSlug, startSec: startSec, onClose: syncUserLibrary });
        });
        document.getElementById('tv-detail-fav').addEventListener('click', function () {
          Api.toggleWatchlist({ movie_slug: movie.slug, movie_name: movie.name, poster_url: poster, thumb_url: backdrop }).then(function () {
            inWatchlist = !inWatchlist;
            var favBtn = document.getElementById('tv-detail-fav');
            if (favBtn) favBtn.textContent = inWatchlist ? '♥ Đã yêu thích' : '♡ Yêu thích';
          }).catch(function () {
            closeDetail();
            switchTab('account');
          });
        });

        layer.querySelectorAll('[data-det-srv]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            selectedServer = Number(btn.getAttribute('data-det-srv'));
            renderDetailView();
          });
        });
        layer.querySelectorAll('[data-det-ep]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var epSlug = btn.getAttribute('data-det-ep');
            var startSec = (history && history.episode_slug === epSlug) ? (Number(history.current_time) || 0) : 0;
            Player.open({ movie: movie, episodes: episodes, serverIndex: selectedServer, episodeSlug: epSlug, startSec: startSec, onClose: syncUserLibrary });
          });
        });
        Spatial.focusSelector('#tv-detail-play', layer) || Spatial.focusFirst(layer);
      }

      renderDetailView();
    }).catch(function (err) {
      layer.innerHTML = '<div class="tv-loading-screen"><div style="color:#FCA5A5;">' + esc(err.message) + '</div><button class="tv-btn tv-btn-primary" id="tv-detail-err-back" data-focusable="true">Quay lại</button></div>';
      document.getElementById('tv-detail-err-back').addEventListener('click', closeDetail);
      Spatial.focusFirst(layer);
    });
  }

  function closeDetail() {
    var layer = document.getElementById('tv-detail-layer');
    if (layer) {
      layer.classList.add('hidden');
      layer.setAttribute('aria-hidden', 'true');
      layer.innerHTML = '';
    }
    if (appState.lastStageFocus && appState.lastStageFocus.isConnected) {
      Spatial.setFocus(appState.lastStageFocus);
    } else {
      Spatial.focusFirst(document.getElementById('tv-stage'));
    }
  }

  function openExitDialog() {
    var modal = document.getElementById('tv-modal-layer');
    modal.innerHTML =
      '<div class="tv-modal-box">' +
      '  <h2 style="font-size:24px;font-weight:900;">Thoát CineViet TV?</h2>' +
      '  <div style="color:#94A3B8;font-size:16px;">Bạn muốn thoát ứng dụng CineViet trên LG webOS TV?</div>' +
      '  <div style="display:flex;gap:14px;justify-content:flex-end;margin-top:8px;">' +
      '    <button class="tv-btn" id="tv-exit-cancel" data-focusable="true">Ở lại</button>' +
      '    <button class="tv-btn tv-btn-primary" id="tv-exit-confirm" data-focusable="true">Thoát ứng dụng</button>' +
      '  </div>' +
      '</div>';
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    function closeM() {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML = '';
      Spatial.focusFirst(document.getElementById('tv-stage'));
    }
    document.getElementById('tv-exit-cancel').addEventListener('click', closeM);
    document.getElementById('tv-exit-confirm').addEventListener('click', function () {
      if (global.webOS && global.webOS.platformBack) global.webOS.platformBack();
      else global.close();
    });
    Spatial.focusSelector('#tv-exit-cancel', modal);
  }

  function switchTab(tab) {
    if (appState.tab === tab && tab !== 'account') return;
    clearAccountTimers();
    appState.tab = tab;
    setActiveNav(tab);

    if (tab === 'home') renderHome();
    else if (tab === 'series') renderCatalogGrid('phim-bo', 'Kho Phim Bộ Đang Hot', 'Tuyển chọn phim bộ cập nhật liên tục');
    else if (tab === 'singles') renderCatalogGrid('phim-le', 'Kho Phim Lẻ Đặc Sắc', 'Tuyển tập điện ảnh đặc sắc chuẩn rạp');
    else if (tab === 'search') renderSearch();
    else if (tab === 'account') renderAccount();
  }

  function syncUserLibrary() {
    Api.getUserLibrary().then(function (lib) {
      appState.history = lib.history || [];
      appState.watchlist = lib.watchlist || [];
      if (appState.tab === 'home' && appState.homeData) {
        var detail = document.getElementById('tv-detail-layer');
        var player = document.getElementById('tv-player-layer');
        if ((!detail || detail.classList.contains('hidden')) && (!player || player.classList.contains('hidden'))) {
          renderHome();
        }
      }
    }).catch(function () {
      appState.history = Api.getLocalHistory();
    });
  }

  function init() {
    updateSidebarUser();
    appState.history = Api.getLocalHistory();
    syncUserLibrary();

    document.querySelectorAll('.tv-nav-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.getAttribute('data-nav'));
      });
    });

    Spatial.pushHandler(function (code) {
      if (code === 461 || code === 27 || code === 8) {
        var modal = document.getElementById('tv-modal-layer');
        if (modal && !modal.classList.contains('hidden')) {
          modal.classList.add('hidden');
          modal.setAttribute('aria-hidden', 'true');
          modal.innerHTML = '';
          Spatial.focusFirst(document.getElementById('tv-stage'));
          return true;
        }
        var detail = document.getElementById('tv-detail-layer');
        if (detail && !detail.classList.contains('hidden')) {
          closeDetail();
          return true;
        }
        if (appState.tab !== 'home') {
          switchTab('home');
          Spatial.focusFirst(document.getElementById('tv-stage'));
          return true;
        }
        openExitDialog();
        return true;
      }
      return false;
    });

    renderHome();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
