/* Episode scope and spoiler presentation shared by detail and watch controllers. */
(() => {
  'use strict';
  const key = value => {
    const text = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const number = text.match(/^(?:tap[\s_-]*|episode[\s_-]*|ep[\s_-]*)?(\d+)$/);
    return number ? String(Number(number[1])) : text;
  };
  function episodeOptions(servers) {
    const seen = new Set(), result = [];
    for (const server of servers || []) for (const ep of server.server_data || []) {
      if (!ep.slug || seen.has(key(ep.slug))) continue;
      seen.add(key(ep.slug)); result.push({ slug: ep.slug, name: /^\d+$/.test(key(ep.slug)) ? `Tập ${key(ep.slug)}` : ep.name || ep.slug });
    }
    return result;
  }
  function scope({ list, servers, current = () => '', onChange, watch = false }) {
    const options = episodeOptions(servers);
    const bar = document.createElement('div'); bar.className = 'comment-scope-bar';
    const label = document.createElement('label'); label.textContent = 'Xem bình luận';
    const select = document.createElement('select');
    const id = `comment-scope-${list.id || 'list'}`; select.id = id; label.htmlFor = id;
    const add = (value, text) => { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); };
    add('all', 'Tất cả bình luận'); add('general', 'Chung về phim');
    if (watch) add('current', 'Tập đang xem');
    options.forEach(ep => add(ep.slug, ep.name));
    select.value = watch ? 'current' : 'all';
    select.addEventListener('change', () => onChange());
    const status = document.createElement('span'); status.className = 'comment-scope-count'; status.setAttribute('role', 'status');
    bar.append(label, select, status); list.before(bar);
    return {
      filter(comments) {
        const value = select.value, episode = value === 'current' ? current() : value;
        const result = comments.filter(comment => value === 'all' || (value === 'general' ? !comment.episode_slug : key(comment.episode_slug) === key(episode)));
        if (watch) {
          const currentName = options.find(ep => key(ep.slug) === key(current()))?.name || 'Tập đang xem';
          select.querySelector('option[value="current"]').textContent = `${currentName} · đang xem`;
          const input = document.getElementById('watch-comment-input') || document.getElementById('m-comment-input');
          if (input) input.placeholder = `Chia sẻ cảm nghĩ về ${currentName.toLowerCase()}...`;
        }
        status.textContent = `${result.length} bình luận`;
        return result;
      },
      select,
      composer(textarea, currentEpisode = '') {
        if (!textarea) return null;
        const wrapper = document.createElement('label'); wrapper.className = 'comment-episode-composer'; wrapper.textContent = 'Về';
        const picker = document.createElement('select'); picker.setAttribute('aria-label', 'Tập phim của bình luận mới');
        const general = document.createElement('option'); general.value = ''; general.textContent = 'Chung về phim'; picker.append(general);
        options.forEach(ep => { const option = document.createElement('option'); option.value = ep.slug; option.textContent = ep.name; picker.append(option); });
        if (currentEpisode) picker.value = options.find(ep => key(ep.slug) === key(currentEpisode))?.slug || '';
        wrapper.append(picker); textarea.before(wrapper); return picker;
      }
    };
  }
  function protect(list, comments, prefix) {
    comments.forEach(comment => {
      const card = document.getElementById(prefix + comment.id);
      if (!card || !list.contains(card)) return;
      const badge = document.createElement('span'); badge.className = 'comment-episode-badge';
      const numeric = key(comment.episode_slug);
      badge.textContent = comment.episode_slug ? /^\d+$/.test(numeric) ? `Tập ${numeric}` : comment.episode_slug : 'Chung về phim';
      card.prepend(badge);
      if (!comment.is_spoil) return;
      const body = card.querySelector('.spoiler-body');
      const toggle = card.querySelector('.btn-toggle-spoiler,.btn-toggle-watch-spoil,[data-spoiler-toggle]');
      const replies = card.querySelector('[data-comment-replies]');
      if (!body || !toggle) return;
      body.classList.remove('blur-[5px]', 'select-none');
      body.hidden = true; if (replies) replies.hidden = true;
      const id = `spoiler-content-${prefix}${comment.id}`; body.id = id;
      toggle.setAttribute('aria-controls', id); toggle.setAttribute('aria-expanded', 'false'); toggle.textContent = 'Hiện spoiler';
      toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(expanded)); toggle.textContent = expanded ? 'Ẩn spoiler' : 'Hiện spoiler';
        body.hidden = !expanded; if (replies) replies.hidden = !expanded;
      });
    });
  }
  function spoilerInput(textarea) {
    const label = document.createElement('label'); label.className = 'comment-spoiler-input';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
    label.title = 'Ẩn nội dung cho đến khi người đọc chủ động mở';
    label.append(checkbox, document.createTextNode('Có spoiler'));
    const compose = textarea.closest('#watch-comment-composer,#m-comment-composer');
    const tools = compose?.querySelector('.comment-compose-tools');
    const send = tools?.querySelector('#watch-send-btn,#m-comment-send');
    if (tools && send) tools.insertBefore(label, send); else textarea.after(label);
    return checkbox;
  }
  window.CommentThreads = { scope, protect, spoilerInput, key, episodeOptions };
})();
