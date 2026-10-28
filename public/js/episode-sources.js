/* Source indices remain provider-owned so existing watch URLs and recovery stay valid. */
(() => {
  'use strict';
  const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const validUrl = value => { try { return /^https?:$/.test(new URL(value).protocol); } catch (_) { return false; } };
  function playable(server) {
    const seen = new Set();
    return (server?.server_data || []).filter(ep => {
      if (!ep || !(validUrl(ep.link_m3u8) || validUrl(ep.link_embed))) return false;
      const key = fold(ep.slug || ep.name || ep.link_m3u8 || ep.link_embed).replace(/^(tap|episode|ep)[\s_-]*/, '').replace(/^0+(?=\d)/, '');
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
  function language(server) {
    const text = fold([server?.language, server?.lang, server?.server_name].filter(Boolean).join(' '));
    if (/song ngu|da giong|da ngon ngu|multi[ -]?(audio|language)/.test(text)) return { id: 'multi', label: 'Song Ngữ' };
    if (/long tieng|dubbed|\bdub\b/.test(text)) return { id: 'dub', label: 'Lồng tiếng' };
    if (/thuyet minh|\bvoice[ -]?over\b/.test(text)) return { id: 'voice', label: 'Thuyết minh' };
    if (/vietsub|phu de|subtitles?|\bsub\b/.test(text)) return { id: 'sub', label: 'Phụ đề' };
    if (server?.is_nguonc || server?.server_type === 'nguonc' || /(?:^|\s)nc(?:\s|$)/.test(text)) return { id: 'sub', label: 'Phụ đề' };
    return { id: 'unknown', label: 'Chưa phân loại' };
  }
  function groups(servers = []) {
    const result = [];
    servers.forEach((server, index) => {
      const lang = language(server);
      let group = result.find(item => item.id === lang.id);
      if (!group) { group = { ...lang, sources: [] }; result.push(group); }
      group.sources.push({ index, name: server.server_name || `Server ${index + 1}`, count: playable(server).length });
    });
    return result;
  }
  function render(container, servers, selected, onSelect) {
    if (!container) return;
    const model = groups(servers);
    const active = model.find(group => group.sources.some(source => source.index === selected)) || model[0];
    const focused = container.contains(document.activeElement) && document.activeElement.matches(':focus-visible') ? { source: document.activeElement.dataset.sourceIndex, language: document.activeElement.dataset.language } : null;
    container.classList.add('episode-sources');
    container.replaceChildren();
    function row(label) {
      const wrapper = document.createElement('div'); wrapper.className = 'episode-sources-row';
      const heading = document.createElement('span'); heading.className = 'episode-sources-label'; heading.textContent = label;
      const buttons = document.createElement('div'); buttons.className = 'episode-sources-buttons'; buttons.setAttribute('role', 'group'); buttons.setAttribute('aria-label', label);
      wrapper.append(heading, buttons); container.append(wrapper); return buttons;
    }
    const langs = row('Bản xem');
    model.forEach(group => {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.language = group.id;
      button.className = 'episode-language-btn'; button.textContent = group.label;
      button.setAttribute('aria-pressed', String(group === active));
      button.disabled = !group.sources.some(source => source.count);
      button.addEventListener('click', () => {
        if (group === active) return;
        const target = group.sources.find(source => source.count);
        if (target) onSelect(target.index);
      }); langs.append(button);
    });
    const sources = row('Server');
    active?.sources.forEach(source => {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.sourceIndex = String(source.index);
      button.className = 'episode-source-btn'; button.setAttribute('aria-pressed', String(source.index === selected));
      button.disabled = !source.count;
      const name = document.createElement('span');
      const generic = /^(?:vietsub|phu de|thuyet minh|long tieng|song ngu)(?:\s*\([^)]*\))?$/i.test(fold(source.name).trim());
      name.textContent = generic ? `Server ${source.index + 1}` : String(source.name).replace(/máy chủ/gi, 'Server');
      const count = document.createElement('span'); count.className = 'episode-source-count'; count.textContent = `${source.count} tập`;
      button.append(name, count); button.title = `${String(source.name).replace(/máy chủ/gi, 'Server')}: ${source.count} tập có liên kết phát; không phải tổng tập dự kiến`;
      button.addEventListener('click', () => { if (source.index !== selected) onSelect(source.index); }); sources.append(button);
    });
    container.setAttribute('aria-label', 'Chọn bản xem và Server. Số tập là số tập có liên kết phát.');
    container.querySelectorAll('.episode-sources-buttons').forEach(row => {
      const current = row.querySelector('[aria-pressed="true"]');
      if (current && row.scrollWidth > row.clientWidth) row.scrollLeft = Math.max(0, current.offsetLeft - row.offsetLeft - (row.clientWidth - current.clientWidth) / 2);
    });
    if (focused) {
      const target = [...container.querySelectorAll('button')].find(button => focused.source != null ? button.dataset.sourceIndex === focused.source : button.dataset.language === focused.language);
      target?.focus({ preventScroll: true });
    }
  }
  function thumbnail(episode, movie = {}) {
    for (const value of [episode?.thumb_url, episode?.thumbnail, episode?.poster_url, movie.thumb_url, movie.poster_url]) {
      if (typeof value !== 'string' || !value.trim()) continue;
      try {
        const url = new URL(value, window.location.href);
        if (/^https?:$/.test(url.protocol)) return url.href;
      } catch (_) {}
    }
    return '/images/episode-placeholder.svg';
  }
  function image(episode, movie) {
    const img = document.createElement('img');
    img.className = 'episode-thumb'; img.alt = ''; img.width = 160; img.height = 90;
    img.loading = 'lazy'; img.decoding = 'async'; img.src = thumbnail(episode, movie);
    img.addEventListener('error', () => { img.src = '/images/episode-placeholder.svg'; }, { once: true });
    return img;
  }
  function decorateThumbnails(container, episodes, movie) {
    if (!container) return;
    container.querySelectorAll('[data-episode-thumb]').forEach((element, index) => {
      element.prepend(image(episodes[index], movie));
    });
  }
  window.EpisodeSources = { groups, language, playable, render, thumbnail, image, decorateThumbnails };
})();
