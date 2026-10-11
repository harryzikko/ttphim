// Shared web-player lifecycle and progress helpers. No dependency on Hls.js.
(function (root) {
  'use strict';
  function episodeMatches(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    const number = value => String(value).match(/^(?:tap-|tập\s*|episode-)?(\d+)$/i)?.[1];
    const left = number(a), right = number(b);
    return left != null && right != null && Number(left) === Number(right);
  }
  function selectInitial(servers, requestedEpisode, requestedServer, history) {
    const explicitServer = requestedServer !== null && requestedServer !== undefined && /^\d+$/.test(String(requestedServer));
    let server = explicitServer ? Number(requestedServer) : Math.max(0, servers.findIndex(s => s.server_name === history?.server_name));
    if (!servers[server]) server = 0;
    const target = requestedEpisode || history?.episode_slug;
    let index = (servers[server]?.server_data || []).findIndex(ep => episodeMatches(ep.slug, target) || episodeMatches(ep.name, target));
    if (index < 0 && !explicitServer && target) {
      for (let i = 0; i < servers.length; i++) {
        const found = (servers[i].server_data || []).findIndex(ep => episodeMatches(ep.slug, target) || episodeMatches(ep.name, target));
        if (found >= 0) { server = i; index = found; break; }
      }
    }
    index = Math.max(0, index);
    const episode = servers[server]?.server_data?.[index];
    const same = episodeMatches(episode?.slug, history?.episode_slug);
    const resume = same && Number(history?.progress_percent) < 95 ? Math.max(0, Number(history?.current_time) || 0) : 0;
    return { server, index, episode, resume };
  }

  function createSession(options) {
    const video = options.video;
    const Hls = options.Hls;
    const state = options.onState || (() => {});
    let active = true, hls = null, deadline = null, retryTimer = null, networkRetries = 0, mediaRetries = 0, resumed = false;
    const listeners = [];
    let cancelled = false;
    const emit = (name, message) => { if (active) state(name, message); };
    const listen = (event, callback) => {
      const guarded = (...args) => { if (active) callback(...args); };
      video.addEventListener(event, guarded);
      listeners.push([event, guarded]);
    };
    const clearDeadline = () => { clearTimeout(deadline); deadline = null; };
    function destroy() {
      cancelled = true;
      if (!active) return;
      active = false;
      clearDeadline();
      clearTimeout(retryTimer);
      listeners.forEach(([event, callback]) => video.removeEventListener(event, callback));
      if (hls) hls.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    function fail(message) {
      if (!active) return;
      const time = video.currentTime || options.initialTime || 0;
      options.onBeforeStop?.();
      destroy();
      cancelled = false;
      queueMicrotask(() => {
        if (cancelled) return;
        if (options.embedUrl && options.onFallback) options.onFallback(time);
        else state('error', message || 'Không thể phát video. Hãy thử lại hoặc chọn server khác.');
      });
    }
    function armDeadline() {
      if (deadline || !active) return;
      deadline = setTimeout(() => fail('Nguồn phim phản hồi quá chậm. Hãy thử lại hoặc chọn server khác.'), options.timeout || 20000);
    }
    function play() {
      if (!active) return;
      const promise = video.play();
      if (promise?.catch) promise.catch(error => {
        if (!active || error?.name === 'AbortError') return;
        clearDeadline();
        if (error?.name === 'NotAllowedError') emit('paused', 'Nhấn Phát để bắt đầu xem.');
        else fail('Trình duyệt không thể phát nguồn video này.');
      });
    }
    listen('loadedmetadata', () => {
      if (!resumed && options.initialTime > 0 && Number.isFinite(video.duration)) {
        video.currentTime = Math.min(options.initialTime, Math.max(0, video.duration - 2));
        resumed = true;
      }
    });
    listen('canplay', () => { clearDeadline(); emit(video.paused ? 'paused' : 'ready'); });
    listen('playing', () => { clearDeadline(); emit('ready'); });
    listen('waiting', () => { emit('loading', 'Đang tải video…'); armDeadline(); });
    listen('stalled', () => { if (!video.paused) { emit('loading', 'Kết nối chậm, đang tải lại…'); armDeadline(); } });
    listen('pause', clearDeadline);
    listen('error', () => fail('Nguồn video không khả dụng.'));
    emit('loading', 'Đang kết nối nguồn phim…');
    armDeadline();
    if (!options.url) {
      fail('Tập phim chưa có nguồn phát.');
    } else if (Hls?.isSupported()) {
      hls = new Hls({ enableWorker: true, backBufferLength: 30, maxBufferLength: 30 });
      options.onHls?.(hls);
      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        if (!active) return;
        options.onManifest?.(data, hls);
        play();
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!active || !data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries++ < 2) {
          emit('loading', 'Kết nối gián đoạn, đang thử lại…');
          clearTimeout(retryTimer);
          retryTimer = setTimeout(() => { if (active) hls.startLoad(); }, 1000 * networkRetries);
          armDeadline();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries++ < 1) {
          hls.recoverMediaError();
          armDeadline();
        } else fail('Nguồn phim gặp lỗi sau khi thử lại.');
      });
      hls.loadSource(options.url);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      listen('loadedmetadata', play);
      video.src = options.url;
      video.load();
    } else fail('Trình duyệt không hỗ trợ nguồn phát này.');
    return { destroy, play, isActive: () => active };
  }

  function createProgress({ movie, user, api, storage = root.localStorage }) {
    const key = `TTPhim_progress_${user?.id || 'guest'}`;
    const read = () => { try { return JSON.parse(storage.getItem(key) || '{}'); } catch (_) { return {}; } };
    let pending = null;
    return {
      get: () => read()[movie.slug] || null,
      save(episode, server, video, keepalive = false) {
        if (!episode || !Number.isFinite(video.duration) || video.duration <= 0 || !Number.isFinite(video.currentTime) || video.currentTime <= 0) return Promise.resolve();
        const data = {
          movie_slug: movie.slug, movie_name: movie.name, origin_name: movie.origin_name,
          poster_url: movie.poster_url, thumb_url: movie.thumb_url,
          episode_slug: episode.slug, episode_name: episode.name, server_name: server,
          current_time: video.currentTime, duration: video.duration,
          progress_percent: Math.min(100, Math.round(video.currentTime / video.duration * 100)),
          updated_at: new Date().toISOString()
        };
        try {
          const records = read();
          records[movie.slug] = data;
          const recent = Object.entries(records).sort((a, b) => b[1].updated_at.localeCompare(a[1].updated_at)).slice(0, 100);
          storage.setItem(key, JSON.stringify(Object.fromEntries(recent)));
        } catch (_) {}
        if (!user || (pending && !keepalive)) return Promise.resolve();
        const request = api.request('/api/user/history', { method: 'POST', body: JSON.stringify(data), keepalive }).catch(() => null);
        if (!keepalive) { pending = request; request.finally(() => { if (pending === request) pending = null; }); }
        return request;
      }
    };
  }

  function createStatus(container, { retry, fallback, changeServer, play } = {}) {
    const panel = document.createElement('div');
    panel.className = 'player-status';
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    container.appendChild(panel);
    return (state, message) => {
      panel.replaceChildren();
      panel.hidden = state === 'ready' || (state === 'paused' && !message);
      if (panel.hidden) return;
      panel.dataset.state = state;
      const text = document.createElement('p');
      text.textContent = message || 'Đang tải…';
      panel.appendChild(text);
      const add = (label, action) => {
        if (!action) return;
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = label;
        button.onclick = event => { event.stopPropagation(); action(); };
        panel.appendChild(button);
      };
      if (state === 'error') { add('Thử lại', retry); add('Đổi server', changeServer); add('Dùng server nhúng', fallback); }
      if (state === 'paused' && message) add('Phát', play);
      if (state === 'loading' || state === 'embed') add('Đổi server', changeServer);
      if (state === 'next') add('Hủy chuyển tập', retry);
    };
  }
  root.PlayerUX = { createSession, createProgress, selectInitial, episodeMatches, createStatus };
})(typeof window === 'undefined' ? globalThis : window);
