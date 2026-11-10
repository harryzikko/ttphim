(function (global) {
  'use strict';

  var playerState = {
    open: false,
    movie: null,
    servers: [],
    serverIndex: 0,
    episode: null,
    hls: null,
    hudTimer: null,
    progressTimer: null,
    drawerOpen: false,
    pendingSeekSec: 0,
    keyHandler: null,
    onClose: null
  };

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return '00:00';
    var total = Math.floor(sec);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    return h > 0 ? (h + ':' + pad(m) + ':' + pad(s)) : (pad(m) + ':' + pad(s));
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function extractEmbeddedM3u8(embedUrl) {
    if (!embedUrl || typeof embedUrl !== 'string') return '';
    var match = embedUrl.match(/(?:url|file)=([^&]+)/i);
    if (match && match[1]) {
      try {
        var decoded = decodeURIComponent(match[1]);
        if (decoded.indexOf('.m3u8') !== -1 || decoded.indexOf('http') === 0) return decoded;
      } catch (_) {}
    }
    return '';
  }

  function preferHlsServers(episodes) {
    var list = Array.isArray(episodes) ? episodes : [];
    var kk = list.filter(function (srv) {
      var n = String(srv.server_name || '').toLowerCase();
      return n.indexOf('nc') === -1 && n.indexOf('nguonc') === -1 && n.indexOf('song ngữ') === -1 && n.indexOf('vicdn') === -1 && n.indexOf('vp') === -1;
    });
    if (kk.length) return kk;
    var hasM3u8 = list.filter(function (srv) {
      return Array.isArray(srv.server_data) && srv.server_data.some(function (ep) { return ep && ep.link_m3u8; });
    });
    return hasM3u8.length ? hasM3u8 : list;
  }

  function showHud() {
    var hud = document.getElementById('tv-player-hud');
    if (hud) hud.classList.remove('faded');
    clearTimeout(playerState.hudTimer);
    playerState.hudTimer = setTimeout(function () {
      if (!playerState.drawerOpen) {
        var v = document.getElementById('tv-video');
        if (v && !v.paused && hud) hud.classList.add('faded');
      }
    }, 5200);
  }

  function saveProgress() {
    var v = document.getElementById('tv-video');
    if (!v || !playerState.movie || !playerState.episode) return;
    var dur = isFinite(v.duration) && v.duration > 0 ? Math.floor(v.duration) : 0;
    var cur = isFinite(v.currentTime) && v.currentTime > 0 ? Math.floor(v.currentTime) : 0;
    if (cur < 5 || dur <= 0) return;
    var pct = Math.min(100, Math.round((cur / dur) * 100));
    global.TvApi.saveHistory({
      movie_slug: playerState.movie.slug,
      movie_name: playerState.movie.name || playerState.movie.slug,
      origin_name: playerState.movie.origin_name || '',
      poster_url: global.TvApi.fullImg(playerState.movie.poster_url || playerState.movie.thumb_url),
      thumb_url: global.TvApi.fullImg(playerState.movie.thumb_url || playerState.movie.poster_url),
      episode_slug: playerState.episode.slug || 'tap-1',
      episode_name: playerState.episode.name || playerState.episode.slug || 'Tập 1',
      server_name: (playerState.servers[playerState.serverIndex] || {}).server_name || '',
      current_time: cur,
      duration: dur,
      progress_percent: pct
    });
  }

  function destroyHls() {
    if (playerState.hls) {
      try { playerState.hls.destroy(); } catch (_) {}
      playerState.hls = null;
    }
    var v = document.getElementById('tv-video');
    if (v) {
      try { v.pause(); v.removeAttribute('src'); v.load(); } catch (_) {}
    }
  }

  function togglePlayPause() {
    var v = document.getElementById('tv-video');
    if (!v || v.classList.contains('hidden')) return;
    showHud();
    if (v.paused) v.play().catch(function () {});
    else v.pause();
    updatePlayIcon();
  }

  function seekDelta(sec) {
    var v = document.getElementById('tv-video');
    if (!v || v.classList.contains('hidden') || !isFinite(v.duration)) return;
    showHud();
    v.currentTime = Math.max(0, Math.min(v.duration - 1, (v.currentTime || 0) + sec));
    updateTimeUi();
  }

  function updatePlayIcon() {
    var v = document.getElementById('tv-video');
    var btn = document.getElementById('tv-btn-playpause');
    if (btn && v) btn.textContent = v.paused ? '▶ Phát' : '❚❚ Tạm dừng';
  }

  function updateTimeUi() {
    var v = document.getElementById('tv-video');
    var timeEl = document.getElementById('tv-player-time');
    var fillEl = document.getElementById('tv-seek-fill');
    if (!v) return;
    var cur = v.currentTime || 0;
    var dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    if (timeEl) timeEl.textContent = formatTime(cur) + ' / ' + formatTime(dur);
    if (fillEl) fillEl.style.width = (dur > 0 ? Math.min(100, (cur / dur) * 100) : 0) + '%';
  }

  function setStatus(msg) {
    var el = document.getElementById('tv-player-status');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('hidden', !msg);
  }

  function renderDrawer(mode) {
    var drawer = document.getElementById('tv-player-drawer');
    if (!drawer) return;
    playerState.drawerOpen = true;
    drawer.classList.remove('hidden');

    if (mode === 'episodes') {
      var srv = playerState.servers[playerState.serverIndex] || {};
      var eps = Array.isArray(srv.server_data) ? srv.server_data : [];
      var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
        '<h3 style="font-size:22px;font-weight:800;">Danh Sách Tập</h3>' +
        '<button class="tv-btn" style="height:40px;padding:0 18px;font-size:14px;" data-focusable="true" id="tv-drawer-close">Đóng</button></div>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">';
      eps.forEach(function (ep, idx) {
        var active = playerState.episode && ep.slug === playerState.episode.slug;
        html += '<button class="tv-ep-btn' + (active ? ' active' : '') + '" data-focusable="true" data-ep-idx="' + idx + '">' + escapeHtml(ep.name || ep.slug || ('Tập ' + (idx + 1))) + '</button>';
      });
      html += '</div>';
      drawer.innerHTML = html;
      drawer.querySelectorAll('[data-ep-idx]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var idx = Number(btn.getAttribute('data-ep-idx'));
          closeDrawer();
          playEpisode(eps[idx], 0);
        });
      });
    } else if (mode === 'servers') {
      var sHtml = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
        '<h3 style="font-size:22px;font-weight:800;">Chọn Server Phát</h3>' +
        '<button class="tv-btn" style="height:40px;padding:0 18px;font-size:14px;" data-focusable="true" id="tv-drawer-close">Đóng</button></div>' +
        '<div style="display:flex;flex-direction:column;gap:12px;">';
      playerState.servers.forEach(function (srv, idx) {
        var active = idx === playerState.serverIndex;
        sHtml += '<button class="tv-ep-btn' + (active ? ' active' : '') + '" style="text-align:left;padding:0 16px;" data-focusable="true" data-srv-idx="' + idx + '">' + escapeHtml(srv.server_name || ('Server ' + (idx + 1))) + '</button>';
      });
      sHtml += '</div>';
      drawer.innerHTML = sHtml;
      drawer.querySelectorAll('[data-srv-idx]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var idx = Number(btn.getAttribute('data-srv-idx'));
          var srv = playerState.servers[idx];
          var eps = (srv && srv.server_data) || [];
          var match = eps.find(function (e) { return playerState.episode && e.slug === playerState.episode.slug; }) || eps[0];
          playerState.serverIndex = idx;
          closeDrawer();
          if (match) playEpisode(match, 0);
        });
      });
    }

    var closeBtn = document.getElementById('tv-drawer-close');
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
    global.TvSpatial.focusFirst(drawer);
  }

  function closeDrawer() {
    var drawer = document.getElementById('tv-player-drawer');
    if (drawer) {
      drawer.classList.add('hidden');
      drawer.innerHTML = '';
    }
    playerState.drawerOpen = false;
    showHud();
    global.TvSpatial.focusSelector('#tv-btn-playpause', document.getElementById('tv-player-layer'));
  }

  function playEpisode(ep, seekSec) {
    if (!ep) return;
    destroyHls();
    playerState.episode = ep;
    playerState.pendingSeekSec = seekSec > 0 ? seekSec : 0;

    var srv = playerState.servers[playerState.serverIndex] || {};
    var titleEl = document.getElementById('tv-player-title');
    if (titleEl) {
      titleEl.textContent = (playerState.movie.name || '') + ' — ' + (ep.name || ep.slug || '') + ' • ' + (srv.server_name || '');
    }

    var video = document.getElementById('tv-video');
    var iframe = document.getElementById('tv-iframe');
    var streamUrl = (ep.link_m3u8 || '').trim() || extractEmbeddedM3u8(ep.link_embed);

    if (streamUrl) {
      iframe.classList.add('hidden');
      iframe.src = 'about:blank';
      video.classList.remove('hidden');
      setStatus('Đang tải luồng phim HD/4K…');

      if (global.Hls && global.Hls.isSupported()) {
        var hls = new global.Hls({ enableWorker: true, maxBufferLength: 30, backBufferLength: 20 });
        playerState.hls = hls;
        hls.on(global.Hls.Events.MANIFEST_PARSED, function () {
          setStatus('');
          if (playerState.pendingSeekSec > 0) {
            try { video.currentTime = playerState.pendingSeekSec; } catch (_) {}
            playerState.pendingSeekSec = 0;
          }
          video.play().catch(function () {});
          updatePlayIcon();
        });
        hls.on(global.Hls.Events.ERROR, function (_, data) {
          if (data && data.fatal) {
            if (ep.link_embed) {
              fallbackToEmbed(ep.link_embed);
            } else {
              setStatus('Luồng HLS gián đoạn. Nhấn Server để đổi nguồn.');
            }
          }
        });
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl') || video.canPlayType('application/x-mpegURL')) {
        video.src = streamUrl;
        video.onloadedmetadata = function () {
          setStatus('');
          if (playerState.pendingSeekSec > 0) {
            try { video.currentTime = playerState.pendingSeekSec; } catch (_) {}
            playerState.pendingSeekSec = 0;
          }
          video.play().catch(function () {});
          updatePlayIcon();
        };
        video.onerror = function () {
          if (ep.link_embed) fallbackToEmbed(ep.link_embed);
          else setStatus('TV không giải mã được nguồn này. Hãy thử đổi Server.');
        };
      } else if (ep.link_embed) {
        fallbackToEmbed(ep.link_embed);
      } else {
        setStatus('Trình phát TV không hỗ trợ định dạng này.');
      }
    } else if (ep.link_embed) {
      fallbackToEmbed(ep.link_embed);
    } else {
      setStatus('Tập phim này chưa có nguồn phát khả dụng.');
    }
    showHud();
  }

  function fallbackToEmbed(embedUrl) {
    destroyHls();
    var video = document.getElementById('tv-video');
    var iframe = document.getElementById('tv-iframe');
    setStatus('');
    video.classList.add('hidden');
    iframe.classList.remove('hidden');
    iframe.src = embedUrl;
  }

  function handlePlayerKey(code) {
    if (code === 461 || code === 27 || code === 8) {
      if (playerState.drawerOpen) {
        closeDrawer();
        return true;
      }
      close();
      return true;
    }
    if (playerState.drawerOpen) return false;

    if (code === 415 || code === 19 || code === 32) {
      togglePlayPause();
      return true;
    }
    if (code === 412) { seekDelta(-10); return true; }
    if (code === 417) { seekDelta(10); return true; }
    if (code === 413) { close(); return true; }

    var hud = document.getElementById('tv-player-hud');
    if (hud && hud.classList.contains('faded')) {
      showHud();
      if (code === 37) { seekDelta(-10); return true; }
      if (code === 39) { seekDelta(10); return true; }
      if (code === 13) { togglePlayPause(); return true; }
      global.TvSpatial.focusSelector('#tv-btn-playpause', document.getElementById('tv-player-layer'));
      return true;
    }
    showHud();
    return false;
  }

  function open(opts) {
    var layer = document.getElementById('tv-player-layer');
    if (!layer) return;

    playerState.open = true;
    playerState.movie = opts.movie || {};
    playerState.servers = preferHlsServers(opts.episodes || []);
    playerState.serverIndex = Math.max(0, Math.min(opts.serverIndex || 0, Math.max(0, playerState.servers.length - 1)));
    playerState.onClose = opts.onClose || null;
    playerState.drawerOpen = false;

    layer.innerHTML =
      '<video id="tv-video" class="tv-video" playsinline></video>' +
      '<iframe id="tv-iframe" class="tv-iframe hidden" allowfullscreen></iframe>' +
      '<div id="tv-player-status" class="hidden" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(11,13,19,0.9);border:1px solid rgba(255,255,255,0.16);padding:18px 28px;border-radius:14px;font-size:18px;font-weight:700;"></div>' +
      '<div id="tv-player-hud" class="tv-player-hud">' +
      '  <div class="tv-hud-top">' +
      '    <div style="display:flex;align-items:center;gap:16px;">' +
      '      <button class="tv-btn" id="tv-player-back" data-focusable="true">← Quay lại</button>' +
      '      <div><div id="tv-player-title" style="font-size:22px;font-weight:800;"></div><div style="font-size:13px;color:#94A3B8;">CineViet LG webOS Player • OK / Play / Back</div></div>' +
      '    </div>' +
      '  </div>' +
      '  <div>' +
      '    <div class="tv-seek-track"><div id="tv-seek-fill" class="tv-seek-fill"></div></div>' +
      '    <div class="tv-hud-controls">' +
      '      <div class="tv-hud-group">' +
      '        <button class="tv-btn tv-btn-primary" id="tv-btn-playpause" data-focusable="true">❚❚ Tạm dừng</button>' +
      '        <button class="tv-btn" id="tv-btn-rw" data-focusable="true">↺ -10s</button>' +
      '        <button class="tv-btn" id="tv-btn-ff" data-focusable="true">+10s ↻</button>' +
      '        <span id="tv-player-time" style="font-size:16px;font-weight:700;color:#E2E8F0;margin-left:8px;">00:00 / 00:00</span>' +
      '      </div>' +
      '      <div class="tv-hud-group">' +
      '        <button class="tv-btn" id="tv-btn-episodes" data-focusable="true">Tập phim</button>' +
      '        <button class="tv-btn" id="tv-btn-servers" data-focusable="true">Server</button>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '</div>' +
      '<aside id="tv-player-drawer" class="tv-player-drawer hidden"></aside>';

    layer.classList.remove('hidden');
    layer.setAttribute('aria-hidden', 'false');

    var video = document.getElementById('tv-video');
    video.addEventListener('timeupdate', updateTimeUi);
    video.addEventListener('play', updatePlayIcon);
    video.addEventListener('pause', updatePlayIcon);

    document.getElementById('tv-player-back').addEventListener('click', close);
    document.getElementById('tv-btn-playpause').addEventListener('click', togglePlayPause);
    document.getElementById('tv-btn-rw').addEventListener('click', function () { seekDelta(-10); });
    document.getElementById('tv-btn-ff').addEventListener('click', function () { seekDelta(10); });
    document.getElementById('tv-btn-episodes').addEventListener('click', function () { renderDrawer('episodes'); });
    document.getElementById('tv-btn-servers').addEventListener('click', function () { renderDrawer('servers'); });

    playerState.keyHandler = handlePlayerKey;
    global.TvSpatial.pushHandler(playerState.keyHandler);
    clearInterval(playerState.progressTimer);
    playerState.progressTimer = setInterval(saveProgress, 12000);

    var srv = playerState.servers[playerState.serverIndex] || {};
    var eps = Array.isArray(srv.server_data) ? srv.server_data : [];
    var targetEp = eps.find(function (e) { return opts.episodeSlug && e.slug === opts.episodeSlug; }) || eps[0];
    playEpisode(targetEp, opts.startSec || 0);
    global.TvSpatial.focusSelector('#tv-btn-playpause', layer);
  }

  function close() {
    if (!playerState.open) return;
    saveProgress();
    destroyHls();
    clearTimeout(playerState.hudTimer);
    clearInterval(playerState.progressTimer);
    if (playerState.keyHandler) {
      global.TvSpatial.popHandler(playerState.keyHandler);
      playerState.keyHandler = null;
    }
    var layer = document.getElementById('tv-player-layer');
    if (layer) {
      layer.classList.add('hidden');
      layer.setAttribute('aria-hidden', 'true');
      layer.innerHTML = '';
    }
    playerState.open = false;
    if (playerState.onClose) playerState.onClose();
  }

  global.TvPlayer = { open: open, close: close };
})(window);
