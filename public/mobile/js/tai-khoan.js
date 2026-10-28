// CineViet - Mobile account (the server session is the only auth authority).
document.addEventListener('DOMContentLoaded', async () => {
  const main = document.querySelector('main');
  if (!main) return;
  const content = main.firstElementChild;
  const el = id => document.getElementById(id);
  const edit = el('editProfileBtn');
  const logout = el('btnLogout');
  let currentUser = null;
  let busy = false;
  let loading = false;
  let leaving = false;
  let security = null;
  let profileRefreshPending = false;
  const loginUrl = '/auth?redirect=' + encodeURIComponent('/mobile/tai-khoan');

  const status = document.createElement('div');
  status.className = 'mx-4 mb-4 p-4 rounded-2xl bg-surface-container text-sm text-on-surface';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const message = document.createElement('p');
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Thử lại';
  retry.className = 'mt-3 px-4 py-2 rounded-full bg-primary-container text-white';
  retry.hidden = true;
  status.append(message, retry);
  main.prepend(status);

  function tell(text, canRetry = false) {
    message.textContent = text;
    retry.hidden = !canRetry;
    status.hidden = !text;
  }

  function lock(locked) {
    if (locked) security?.clearSensitive();
    if (content) {
      content.hidden = locked;
      content.style.display = locked ? 'none' : '';
      content.inert = locked;
    }
    if (edit) edit.disabled = locked || busy;
    if (logout) logout.disabled = locked || busy;
    security?.setLocked(locked || busy);
  }

  function goLogin() {
    leaving = true;
    currentUser = null;
    lock(true);
    tell('Vui lòng đăng nhập để quản lý tài khoản.');
    window.location.href = loginUrl;
  }

  function unauthorized(value) {
    return Number(value?.httpStatus || value?.statusCode || value?.status) === 401;
  }

  function renderProfile(user) {
    if (el('userName')) el('userName').textContent = user.name || 'Chưa có tên hiển thị';
    if (el('userEmail')) el('userEmail').textContent = user.email || '';
    security?.update(user);
    const avatar = el('userAvatar');
    if (avatar) {
      const safe = typeof user.avatar === 'string' && /^(https?:\/\/|\/(?!\/))/.test(user.avatar);
      avatar.hidden = !safe;
      if (safe) avatar.src = user.avatar;
      else avatar.removeAttribute('src');
    }
  }

  function unavailableStats() {
    for (const id of ['statHours', 'statMovies', 'statWatchlist']) {
      if (el(id)) {
        el(id).textContent = 'Chưa có dữ liệu';
        el(id).title = 'Chưa có thống kê từ máy chủ';
      }
    }
  }

  // Remove demo membership claims and actions with no real implementation.
  const profile = el('userName')?.closest('section');
  profile?.nextElementSibling?.remove();
  el('userName')?.nextElementSibling?.remove();
  el('userAvatar')?.parentElement?.nextElementSibling?.remove();
  edit?.previousElementSibling?.remove();
  for (const id of ['settingQuality', 'settingAudio']) el(id)?.remove();
  for (const button of document.querySelectorAll('.toggle-btn')) {
    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
    button.title = 'Chưa hỗ trợ tại đây';
    // Playback preferences owns autoplay and replaces this legacy control separately.
    if (button.dataset.setting !== 'autoplay_next') {
      button.closest('div.flex.items-center.justify-between')?.remove();
    }
  }
  el('btnReportIssue')?.remove();
  for (const link of main.querySelectorAll('a[href^="tel:"], a[href*="tab=downloads"]')) link.remove();
  if (el('userName')) el('userName').textContent = 'Đang xác minh tài khoản…';
  if (el('userEmail')) el('userEmail').textContent = '';
  if (el('userAvatar')) {
    el('userAvatar').removeAttribute('src');
    el('userAvatar').hidden = true;
  }
  unavailableStats();
  lock(true);

  const devices = el('settingDevices');
  if (devices) {
    const link = document.createElement('a');
    link.id = devices.id;
    link.className = devices.className;
    link.href = '#m-security-devices';
    const label = document.createElement('span');
    label.className = 'text-xs font-bold text-on-surface';
    label.textContent = 'Quản lý phiên đăng nhập & thiết bị';
    link.append(label);
    devices.replaceWith(link);
  }

  async function verify() {
    try {
      const user = await API.getMe();
      if (!user || unauthorized(user)) {
        goLogin();
        return null;
      }
      // Do not accept a failed API envelope as a profile.
      if (user.status === false || (!user.id && !user.email)) throw new Error('Invalid profile');
      if (currentUser?.id && user.id !== currentUser.id) {
        leaving = true; currentUser = null; lock(true); window.location.reload(); return null;
      }
      currentUser = user;
      renderProfile(user);
      return user;
    } catch (error) {
      if (unauthorized(error)) goLogin();
      else {
        currentUser = null;
        lock(true);
        tell('Không thể xác minh tài khoản. Vui lòng thử lại.', true);
      }
      return null;
    }
  }

  async function loadAccount() {
    if (loading || leaving || busy) return;
    loading = true;
    lock(true);
    tell('Đang xác minh tài khoản…');
    unavailableStats();
    try {
      if (!await verify()) return;
      lock(false);
      tell('');
      try {
        const library = await API.getLibrary();
        if (unauthorized(library)) { goLogin(); return; }
        if (library?.status === false) throw new Error('Library unavailable');
        if (Array.isArray(library?.watchlist) && el('statWatchlist')) {
          el('statWatchlist').textContent = String(library.watchlist.length);
          el('statWatchlist').title = 'Số phim trong danh sách trên máy chủ';
        }
        // History positions are not completed movies or actual viewing hours.
      } catch (error) {
        if (unauthorized(error)) goLogin();
        else tell('Không thể tải thống kê thư viện. Vui lòng thử lại.', true);
      }
    } finally {
      loading = false;
      flushProfileRefresh();
    }
  }

  async function action(run) {
    if (!currentUser || busy || loading || leaving) return;
    busy = true;
    lock(false);
    try {
      if (!await verify()) return;
      await run();
    } catch (error) {
      if (unauthorized(error)) goLogin();
      else tell(error.message || 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.');
    } finally {
      busy = false;
      if (currentUser && !leaving) lock(false);
      flushProfileRefresh();
    }
  }

  function flushProfileRefresh() {
    if (!profileRefreshPending || loading || busy || leaving) return;
    profileRefreshPending = false;
    void (async () => {
      loading = true;
      try { if (await verify()) { lock(false); tell(''); } }
      finally { loading = false; flushProfileRefresh(); }
    })();
  }

  security = window.MobileAccountSecurity?.create({
    action, verify, goLogin,
    acceptUser(user) {
      if (!user || (!user.id && !user.email)) throw new Error('Không thể xác minh trạng thái bảo mật. Hãy kiểm tra lại.');
      currentUser = user;
      renderProfile(user);
    }
  });

  edit?.addEventListener('click', () => action(async () => {
    const name = window.prompt('Nhập tên hiển thị mới của bạn:', currentUser.name || '');
    if (!name?.trim() || name.trim() === currentUser.name) return;
    const response = await API.updateProfile(name.trim(), currentUser.avatar);
    if (unauthorized(response)) { goLogin(); return; }
    if (!response?.status || !response.data || typeof response.data.name !== 'string') {
      throw new Error(response?.message || 'Không thể cập nhật hồ sơ. Vui lòng thử lại.');
    }
    currentUser = { ...currentUser, ...response.data };
    renderProfile(currentUser);
    tell('Đã cập nhật tên hồ sơ.');
  }));

  logout?.addEventListener('click', () => action(async () => {
    if (!window.confirm('Bạn có chắc chắn muốn đăng xuất tài khoản trên thiết bị này?')) return;
    const result = await API.logout();
    // The SDK rejects failed logout envelopes; require its confirmed success data too.
    if (!result || result.status === false) throw new Error('Không thể đăng xuất. Vui lòng thử lại.');
    leaving = true;
    currentUser = null;
    lock(true);
    window.location.href = '/mobile';
  }));

  for (const link of main.querySelectorAll('a[href^="/mobile/danh-sach"], #settingDevices')) {
    link.addEventListener('click', event => {
      event.preventDefault();
      action(async () => {
        if (link.id === 'settingDevices') await security?.openDevices();
        else window.location.href = link.getAttribute('href');
      });
    });
  }
  retry.addEventListener('click', loadAccount);
  window.addEventListener?.('cineviet:profile-updated', () => {
    profileRefreshPending = true;
    flushProfileRefresh();
  });
  window.addEventListener?.('pageshow', event => { if (event.persisted) window.location.reload(); });
  await loadAccount();
  if (currentUser && /[?&]verification=pending(?:&|$)/.test(window.location.search || '')) {
    if (el('m-security')) el('m-security').open = true;
    if (el('m-security-status')) el('m-security-status').textContent = 'Tài khoản đã tạo nhưng chưa gửi được email xác minh. Hãy bấm Gửi lại email xác minh.';
  }
});
