(function (root) {
  'use strict';
  function mediaUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try { const url = new URL(value); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : ''; }
    catch (_) { return ''; }
  }
  const sourceKey = (engine, url) => `${engine}:${mediaUrl(url)}`;
  function candidates(servers, currentEpisode, serverIndex, failed = new Set()) {
    const result = [], seen = new Set(failed);
    (servers || []).forEach((server, index) => {
      const episodes = Array.isArray(server.server_data) ? server.server_data : [];
      const same = root.PlayerUX.episodeMatches;
      const episode = episodes.find(ep => same(ep.slug, currentEpisode?.slug)) || episodes.find(ep => (!ep.slug || !currentEpisode?.slug) && same(ep.name, currentEpisode?.name));
      if (!episode) return;
      for (const [engine, field] of [['hls', 'link_m3u8'], ['embed', 'link_embed']]) {
        const url = mediaUrl(episode[field]), key = sourceKey(engine, url);
        if (!url || seen.has(key)) continue;
        seen.add(key);
        result.push({ serverIndex: index, episode, engine, url, label: server.server_name || `Server ${index + 1}`, sameServer: index === serverIndex });
      }
    });
    return result.sort((a, b) => Number(a.engine === 'embed') - Number(b.engine === 'embed') || Number(a.sameServer) - Number(b.sameServer));
  }
  function offer({ container, servers, episode, serverIndex, time = 0, failed = new Set(), choose, retry, message }) {
    const options = candidates(servers, episode, serverIndex, failed);
    const panel = document.createElement('section'); panel.className = 'player-recovery';
    panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', 'Nguồn phát dự phòng');
    const node = (tag, text, cls) => { const el = document.createElement(tag); if (text) el.textContent = text; if (cls) el.className = cls; return el; };
    const heading = node('h3', 'Nguồn hiện tại chưa phát được');
    const description = node('p', message || 'Bạn có thể thử lại hoặc xác nhận chuyển sang nguồn khác có đúng tập này.');
    const select = node('select'); select.setAttribute('aria-label', 'Chọn nguồn dự phòng đúng tập');
    options.forEach((option, index) => {
      const el = node('option', `${option.label} · ${option.episode.name || option.episode.slug} · ${option.engine === 'hls' ? 'HLS' : 'Iframe'}`); el.value = String(index); select.appendChild(el);
    });
    const note = node('p', '', 'player-recovery-note');
    const update = () => {
      const option = options[Number(select.value) || 0];
      note.textContent = !option ? 'Chưa có nguồn dự phòng khớp tập này. Bạn có thể thử lại nguồn hiện tại hoặc chọn server thủ công.' : option.engine === 'hls' ? `Đúng tập ${option.episode.name || option.episode.slug}. Sẽ thử khôi phục mốc ${Math.floor(Math.max(0, time))} giây khi video cho phép.` : 'Nguồn iframe không bảo đảm tua tiếp đúng mốc đã lưu. Chỉ chuyển sau khi bạn xác nhận.';
    };
    select.onchange = update;
    const actions = node('div', '', 'player-recovery-actions');
    let active = true;
    const destroy = () => { active = false; panel.remove(); };
    if (options.length) {
      const confirm = node('button', 'Chuyển nguồn đã chọn', 'player-recovery-confirm'); confirm.type = 'button';
      confirm.onclick = () => { if (!active) return; const option = options[Number(select.value) || 0]; destroy(); choose(option, option.engine === 'hls' ? Math.max(0, Number(time) || 0) : 0); };
      actions.appendChild(confirm);
    }
    if (retry) { const button = node('button', 'Thử lại nguồn hiện tại'); button.type = 'button'; button.onclick = () => { if (!active) return; destroy(); retry(); }; actions.appendChild(button); }
    const cancel = node('button', 'Để sau'); cancel.type = 'button'; cancel.onclick = destroy; actions.appendChild(cancel);
    panel.append(heading, description); if (options.length) panel.appendChild(select); panel.append(note, actions); update(); container.appendChild(panel);
    actions.querySelector('button')?.focus({ preventScroll: true });
    return { destroy, options };
  }
  root.PlayerRecovery = { mediaUrl, sourceKey, candidates, offer };
})(typeof window === 'undefined' ? globalThis : window);
