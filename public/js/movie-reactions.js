(function (root) {
  'use strict';

  const REACTIONS = [
    { key: 'fire', emoji: '🔥', label: 'Siêu phẩm' },
    { key: 'heart', emoji: '❤️', label: 'Quá hay' },
    { key: 'laugh', emoji: '😂', label: 'Hài hước' },
    { key: 'cry', emoji: '😢', label: 'Cảm động' },
    { key: 'shock', emoji: '😱', label: 'Kịch tính' }
  ];

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function mount(target, movieSlug, api = root.API) {
    const container = typeof target === 'string' ? document.querySelector(target) : target;
    if (!container || !movieSlug) return null;

    let state = {
      total: 0,
      counts: { fire: 0, heart: 0, laugh: 0, cry: 0, shock: 0 },
      user_reaction: null
    };

    container.className = 'movie-reactions-wrapper py-3 px-4 bg-surface-container/60 rounded-xl border border-white/5 shadow-sm my-3';
    container.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-primary text-[18px]">add_reaction</span>
          <span class="font-headline-sm text-xs sm:text-sm font-bold text-on-surface">Cảm xúc khán giả</span>
          <span id="reactions-total-count" class="text-[11px] text-on-surface-variant px-2 py-0.5 rounded-full bg-surface-container-high font-medium">0 lượt</span>
        </div>
        <div class="flex items-center gap-1.5 sm:gap-2 flex-wrap" id="reactions-button-list">
          ${REACTIONS.map(r => `
            <button type="button" data-reaction="${r.key}" class="reaction-btn px-2.5 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border border-transparent active:scale-95" title="${escapeHtml(r.label)}">
              <span class="text-sm select-none">${r.emoji}</span>
              <span class="reaction-label text-[11px] hidden sm:inline">${escapeHtml(r.label)}</span>
              <span class="reaction-count text-[11px] text-on-surface-variant font-mono">0</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;

    const totalEl = container.querySelector('#reactions-total-count');
    const buttons = container.querySelectorAll('.reaction-btn');

    function render() {
      if (totalEl) {
        totalEl.textContent = state.total ? `${state.total.toLocaleString('vi-VN')} lượt` : 'Chưa có lượt';
      }
      buttons.forEach(btn => {
        const key = btn.dataset.reaction;
        const count = state.counts[key] || 0;
        const isSelected = state.user_reaction === key;
        const countEl = btn.querySelector('.reaction-count');
        if (countEl) countEl.textContent = count;

        if (isSelected) {
          btn.classList.add('bg-primary-container/20', 'border-primary', 'text-primary');
          btn.classList.remove('bg-surface-container-high', 'border-transparent', 'text-on-surface');
          if (countEl) countEl.classList.add('text-primary', 'font-bold');
        } else {
          btn.classList.remove('bg-primary-container/20', 'border-primary', 'text-primary');
          btn.classList.add('bg-surface-container-high', 'border-transparent', 'text-on-surface');
          if (countEl) countEl.classList.remove('text-primary', 'font-bold');
        }
      });
    }

    async function load() {
      try {
        const res = await api.getMovieReactions(movieSlug);
        if (res && res.counts) {
          state = res;
          render();
        }
      } catch (_) {}
    }

    buttons.forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault();
        const key = btn.dataset.reaction;
        btn.disabled = true;
        try {
          const res = await api.reactMovie(movieSlug, key);
          if (res?.httpStatus === 401) {
            if (root.showToast) root.showToast('Vui lòng đăng nhập để bày tỏ cảm xúc', 'info');
            return;
          }
          if (res?.status && res.data) {
            state = res.data;
            render();
            if (root.showToast) {
              const label = REACTIONS.find(r => r.key === key)?.label || '';
              if (state.user_reaction === key) {
                root.showToast(`Đã thả cảm xúc: ${label}!`, 'info');
              } else {
                root.showToast('Đã bỏ cảm xúc', 'info');
              }
            }
          }
        } catch (_) {
          if (root.showToast) root.showToast('Không thể gửi cảm xúc lúc này', 'error');
        } finally {
          btn.disabled = false;
        }
      };
    });

    load();
    return { load, getState: () => state };
  }

  root.MovieReactions = { mount, REACTIONS };
})(typeof window === 'undefined' ? globalThis : window);
