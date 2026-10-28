document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  const status = $('status');
  let pendingAction = null;
  async function request(url, body) {
    const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok || !data.status) throw new Error(data.message || (response.status === 401 ? 'Vui lòng đăng nhập lại.' : 'Không thể thực hiện thao tác.'));
    return data.data;
  }
  function table(id, labels, rows) {
    const root = $(id);
    root.replaceChildren();
    if (!rows.length) { const text = document.createElement('p'); text.className = 'muted'; text.textContent = 'Chưa có dữ liệu.'; root.append(text); return; }
    const wrap = document.createElement('div'); wrap.className = 'table-wrap';
    const element = document.createElement('table'); const head = element.createTHead().insertRow();
    labels.forEach(label => { const cell = document.createElement('th'); cell.textContent = label; head.append(cell); });
    const body = element.createTBody();
    for (const row of rows) {
      const tr = body.insertRow();
      for (const value of row) { const cell = tr.insertCell(); if (value instanceof Node) cell.append(value); else cell.textContent = String(value ?? '—'); }
    }
    wrap.append(element); root.append(wrap);
  }
  function action(label, path, body) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', () => {
      pendingAction = { path, body };
      $('action-title').textContent = label;
      $('action-reason').value = ''; $('action-error').textContent = '';
      $('action-dialog').showModal();
    });
    return button;
  }
  async function refresh() {
    $('refresh').disabled = true; status.textContent = 'Đang tải số liệu và xác minh quyền…';
    try {
      const [metrics, moderation] = await Promise.all([request('/api/admin/operations'), request('/api/admin/moderation')]);
      $('metrics').replaceChildren();
      for (const [label, value] of [
        ['Request API', metrics.requests], ['Tỷ lệ lỗi 5xx', `${(metrics.error_rate * 100).toFixed(2)}%`],
        ['P95 API (cận trên)', metrics.p95_upper_bound_ms == null ? 'Chưa có' : `${metrics.p95_upper_bound_ms} ms`],
        ['Start / Ready', `${metrics.playback.start || 0} / ${metrics.playback.ready || 0}`],
        ['Thời gian bắt đầu TB', metrics.mean_startup_ms == null ? 'Chưa có' : `${metrics.mean_startup_ms} ms`],
        ['Lỗi / Fallback', `${metrics.playback.error || 0} / ${metrics.playback.fallback || 0}`]
      ]) { const card = document.createElement('div'); card.className = 'metric'; const number = document.createElement('strong'); number.textContent = value; const text = document.createElement('span'); text.textContent = label; card.append(number, text); $('metrics').append(card); }
      table('sources', ['Nguồn', 'Trạng thái', 'Độ trễ', 'Kiểm tra gần nhất'], metrics.sources.map(item => [item.name, item.healthy ? 'Hoạt động' : 'Lỗi', `${item.response_ms} ms`, item.checked_at]));
      $('backup-state').textContent = metrics.backup ? JSON.stringify(metrics.backup, null, 2) : 'Chưa có backup được ghi nhận. Cần cấu hình thư mục và khóa mã hóa trước khi chạy.';
      table('alerts', ['Thời điểm', 'Mức độ', 'Loại', 'Thông báo'], metrics.alerts.map(item => [item.created_at, item.severity, item.kind, item.summary]));
      table('reports', ['Bình luận', 'Lý do', 'Trạng thái', 'Người báo cáo'], moderation.reports.map(item => [item.comment_id, item.reason, item.status, item.user_id]));
      const comments = [];
      for (const item of moderation.comments) {
        comments.push([item.user_name, item.content, item.hidden ? 'Đã ẩn' : 'Công khai', action(item.hidden ? 'Hiện bình luận' : 'Ẩn bình luận', `/api/admin/moderation/comments/${encodeURIComponent(item.id)}`, { hidden: !item.hidden })]);
        for (const reply of item.replies) comments.push(['↳ Phản hồi', reply.content, reply.hidden ? 'Đã ẩn' : 'Công khai', action(reply.hidden ? 'Hiện phản hồi' : 'Ẩn phản hồi', `/api/admin/moderation/comments/${encodeURIComponent(reply.id)}`, { hidden: !reply.hidden })]);
      }
      table('comments', ['Tác giả', 'Nội dung', 'Trạng thái', 'Thao tác'], comments);
      table('users', ['Tên', 'Email', 'Vai trò', 'Truy cập', 'Thao tác'], moderation.users.map(item => [item.name, item.email, item.role, item.blocked ? 'Đã khóa' : 'Hoạt động', action(item.blocked ? 'Mở tài khoản' : 'Khóa tài khoản', `/api/admin/moderation/users/${encodeURIComponent(item.id)}`, { blocked: !item.blocked })]));
      table('audit', ['Thời điểm', 'Admin', 'Thao tác', 'Đối tượng', 'Chi tiết'], moderation.audit.map(item => [item.created_at, item.actor_id, item.action, item.target_id, JSON.stringify(item.detail)]));
      status.textContent = `Đã cập nhật lúc ${new Date().toLocaleTimeString('vi-VN')}.`;
    } catch (error) { status.textContent = error.message; }
    finally { $('refresh').disabled = false; }
  }
  $('refresh').addEventListener('click', refresh);
  $('action-cancel').addEventListener('click', () => $('action-dialog').close());
  $('action-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!pendingAction || !$('action-reason').value.trim()) return;
    $('action-submit').disabled = true;
    try { await request(pendingAction.path, { ...pendingAction.body, reason: $('action-reason').value.trim() }); $('action-dialog').close(); await refresh(); }
    catch (error) { $('action-error').textContent = error.message; }
    finally { $('action-submit').disabled = false; }
  });
  for (const [id, endpoint] of [['backup', '/api/admin/operations/backup'], ['check-sources', '/api/admin/operations/sources/check']]) {
    $(id).addEventListener('click', async () => {
      $(id).disabled = true;
      try { await request(endpoint, {}); await refresh(); }
      catch (error) { status.textContent = error.message; }
      finally { $(id).disabled = false; }
    });
  }
  refresh();
});
