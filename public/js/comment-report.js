document.addEventListener('DOMContentLoaded', () => {
  const root = document.querySelector('main');
  if (!root) return;
  function attach() {
    for (const reply of root.querySelectorAll('.btn-reply-watch[data-id],.btn-open-reply[data-id]')) {
      if (reply.parentElement.querySelector('[data-report-comment]')) continue;
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = 'Báo cáo'; button.className = 'text-xs hover:text-primary cursor-pointer';
      button.dataset.reportComment = reply.dataset.id;
      reply.after(button);
    }
  }
  attach();
  new MutationObserver(attach).observe(root, { childList: true, subtree: true });
  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-report-comment]');
    if (!button || button.disabled) return;
    const reason = window.prompt('Lý do báo cáo bình luận (tối đa 500 ký tự):');
    if (reason === null || !reason.trim()) return;
    if (reason.length > 500) return window.showToast?.('Lý do quá dài', 'error');
    button.disabled = true;
    try {
      const response = await fetch(`/api/comments/${encodeURIComponent(button.dataset.reportComment)}/report`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() })
      });
      const data = await response.json();
      if (!response.ok || !data.status) throw new Error(data.message || 'Không thể gửi báo cáo');
      window.showToast?.('Báo cáo đã được gửi cho quản trị viên.');
    } catch (error) { window.showToast?.(error.message, 'error'); }
    finally { button.disabled = false; }
  });
});
