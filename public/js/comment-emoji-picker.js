(function (root) {
  'use strict';
  const groups = [
    ['Cảm xúc', [['😀','Vui vẻ'],['😄','Cười tươi'],['😂','Cười ra nước mắt'],['🤣','Cười lăn'],['😊','Mỉm cười'],['🥰','Yêu thích'],['😍','Mắt trái tim'],['🤩','Ngưỡng mộ'],['🥹','Xúc động'],['😎','Ngầu'],['🤔','Suy nghĩ'],['😮','Ngạc nhiên'],['😱','Sợ hãi'],['😢','Buồn'],['😭','Khóc'],['😴','Buồn ngủ']]],
    ['Cử chỉ', [['👍','Đồng ý'],['👎','Không đồng ý'],['👏','Vỗ tay'],['🙌','Hoan hô'],['🫶','Yêu thương'],['👌','Tuyệt vời'],['🤝','Bắt tay'],['🙏','Cảm ơn'],['💪','Mạnh mẽ'],['✌️','Chiến thắng'],['🤞','Hy vọng'],['👀','Đang xem']]],
    ['Điện ảnh', [['🍿','Bỏng ngô'],['🎬','Điện ảnh'],['🎥','Máy quay'],['📺','Truyền hình'],['🎭','Diễn xuất'],['🎶','Âm nhạc'],['🎧','Tai nghe'],['🏆','Giải thưởng'],['🚀','Phiêu lưu'],['👻','Kinh dị'],['🕵️','Trinh thám'],['🐉','Giả tưởng']]],
    ['Biểu tượng', [['❤️','Trái tim'],['🧡','Tim cam'],['💛','Tim vàng'],['💚','Tim xanh'],['💙','Tim xanh dương'],['💔','Tan vỡ'],['🔥','Ngọn lửa'],['⭐','Ngôi sao'],['✨','Lấp lánh'],['💯','Một trăm điểm'],['🎉','Chúc mừng'],['💥','Bùng nổ']]]
  ];
  const mounted = new WeakMap();
  let sequence = 0, active = null;
  function mount({ button, input }) {
    if (!button || !input) return null;
    if (mounted.has(button)) return mounted.get(button);
    const doc = button.ownerDocument, panel = doc.createElement('div');
    const id = `comment-emoji-picker-${++sequence}`;
    panel.id = id; panel.className = 'comment-emoji-picker'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Chọn biểu tượng cảm xúc');
    button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', id); button.setAttribute('aria-expanded', 'false');
    const heading = doc.createElement('div'); heading.className = 'comment-emoji-heading';
    const title = doc.createElement('strong'); title.textContent = 'Chọn icon';
    const dismiss = doc.createElement('button'); dismiss.type = 'button'; dismiss.textContent = '×'; dismiss.setAttribute('aria-label', 'Đóng bảng icon');
    heading.append(title, dismiss);
    const tabs = doc.createElement('div'); tabs.className = 'comment-emoji-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Nhóm icon');
    const grid = doc.createElement('div'); grid.className = 'comment-emoji-grid'; grid.id = id + '-grid'; grid.setAttribute('role', 'tabpanel');
    const status = doc.createElement('p'); status.className = 'comment-emoji-status'; status.setAttribute('role', 'status');
    panel.append(heading, tabs, grid, status); doc.body.appendChild(panel);
    let start = input.selectionStart || 0, end = input.selectionEnd || 0, destroyed = false;
    const remember = () => { start = input.selectionStart ?? input.value.length; end = input.selectionEnd ?? start; };
    const close = (focusButton = false) => {
      panel.hidden = true; button.setAttribute('aria-expanded', 'false'); if (active === controller) active = null;
      if (focusButton) button.focus({ preventScroll: true });
    };
    function position() {
      if (panel.hidden) return;
      const rect = button.getBoundingClientRect(), width = Math.min(352, Math.max(0, root.innerWidth - 24));
      panel.style.width = width + 'px'; panel.style.maxHeight = Math.max(80, root.innerHeight - 24) + 'px';
      const height = panel.getBoundingClientRect().height;
      panel.style.left = Math.max(12, Math.min(rect.left, root.innerWidth - width - 12)) + 'px';
      const below = rect.bottom + 8;
      panel.style.top = Math.max(12, Math.min(below + height <= root.innerHeight - 12 ? below : rect.top - height - 8, root.innerHeight - height - 12)) + 'px';
    }
    function insert(emoji) {
      if (input.disabled || input.readOnly) return;
      const from = Math.min(start, input.value.length), to = Math.min(Math.max(end, from), input.value.length);
      if (input.maxLength >= 0 && input.value.length - (to - from) + emoji.length > input.maxLength) {
        status.textContent = 'Bình luận đã đạt giới hạn ký tự.'; return;
      }
      input.setRangeText(emoji, from, to, 'end'); remember();
      input.dispatchEvent(new root.Event('input', { bubbles: true }));
      close(); input.focus({ preventScroll: true });
    }
    function render(index) {
      status.textContent = '';
      [...tabs.children].forEach((tab, n) => { tab.setAttribute('aria-selected', String(n === index)); tab.tabIndex = n === index ? 0 : -1; });
      grid.setAttribute('aria-labelledby', tabs.children[index].id); grid.replaceChildren();
      for (const [emoji, label] of groups[index][1]) {
        const option = doc.createElement('button'); option.type = 'button'; option.className = 'comment-emoji-option';
        option.textContent = emoji; option.title = label; option.setAttribute('aria-label', label); option.dataset.emoji = emoji;
        option.onclick = () => insert(emoji); grid.appendChild(option);
      }
      position();
    }
    groups.forEach(([name], index) => {
      const tab = doc.createElement('button'); tab.type = 'button'; tab.textContent = name; tab.id = id + '-tab-' + index;
      tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', grid.id);
      tab.onclick = () => render(index);
      tab.onkeydown = event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? groups.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + groups.length) % groups.length;
        render(target); tabs.children[target].focus();
      };
      tabs.appendChild(tab);
    });
    const toggle = () => {
      if (destroyed || input.disabled || input.readOnly) return;
      if (!panel.hidden) { close(true); return; }
      remember(); active?.close(); active = controller;
      panel.hidden = false; button.setAttribute('aria-expanded', 'true'); render(0); position(); tabs.children[0].focus({ preventScroll: true });
    };
    const outside = event => { if (!panel.hidden && !panel.contains(event.target) && !button.contains(event.target)) close(); };
    const escape = event => { if (!panel.hidden && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); } };
    const controller = {
      close,
      destroy() {
        close(); destroyed = true; mounted.delete(button); panel.remove();
        button.removeEventListener('click', toggle); doc.removeEventListener('pointerdown', outside); doc.removeEventListener('keydown', escape, true);
        root.removeEventListener('resize', position); root.removeEventListener('scroll', position, true);
        for (const event of ['select','input','keyup','pointerup']) input.removeEventListener(event, remember);
        button.removeAttribute('aria-controls'); button.removeAttribute('aria-expanded'); button.removeAttribute('aria-haspopup');
      }
    };
    mounted.set(button, controller); render(0); dismiss.onclick = () => close(true);
    button.addEventListener('click', toggle); doc.addEventListener('pointerdown', outside); doc.addEventListener('keydown', escape, true);
    root.addEventListener('resize', position); root.addEventListener('scroll', position, true);
    for (const event of ['select','input','keyup','pointerup']) input.addEventListener(event, remember);
    return controller;
  }
  function scan() {
    root.document.querySelectorAll('[data-comment-emoji-target]').forEach(button => mount({ button, input: root.document.getElementById(button.dataset.commentEmojiTarget) }));
  }
  root.CommentEmojiPicker = { mount };
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', scan, { once: true }); else scan();
  }
})(typeof window === 'undefined' ? globalThis : window);
