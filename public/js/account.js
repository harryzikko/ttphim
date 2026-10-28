// CineViet - User Account & Profile Controller
document.addEventListener('DOMContentLoaded', async () => {
  let currentUser = null;
  let selectedAvatar = null;

  // Tabs switching
  const tabBtns = document.querySelectorAll('.account-tab-btn');
  const panes = document.querySelectorAll('.account-pane');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;

      tabBtns.forEach(b => {
        b.className = 'account-tab-btn px-5 py-2.5 rounded-full bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high font-semibold text-sm transition-all whitespace-nowrap cursor-pointer';
      });
      btn.className = 'account-tab-btn active px-5 py-2.5 rounded-full bg-primary text-white font-bold text-sm transition-all whitespace-nowrap cursor-pointer';

      panes.forEach(p => p.classList.add('hidden'));
      const targetPane = document.getElementById(tabId);
      if (targetPane) targetPane.classList.remove('hidden');
    });
  });
  const activateHashTab = () => {
    const id = String(window.location.hash || '').slice(1);
    [...tabBtns].find(button => button.dataset.tab === id)?.click();
  };
  window.addEventListener?.('hashchange', activateHashTab);
  activateHashTab();
  window.addEventListener?.('cineviet:profile-updated', event => {
    if (!currentUser || event.detail?.id !== currentUser.id) return;
    currentUser = { ...currentUser, ...event.detail }; selectedAvatar = currentUser.avatar;
    const image = document.getElementById('profile-avatar-img');
    if (image) image.src = currentUser.avatar;
  });

  // Load User Info
  async function loadUserInfo() {
    try {
      currentUser = await API.getMe();
      if (!currentUser) {
        window.location.href = '/dang-nhap';
        return;
      }
      renderProfile(currentUser);
      if (/[?&]verification=pending(?:&|$)/.test(window.location.search || '')) securityStatus('Tài khoản đã tạo nhưng chưa gửi được email xác minh. Hãy bấm Gửi lại email xác minh.');
      loadLibraryStats();
      if (API.getSessions) loadSessions();
    } catch (_) { window.showToast('Không thể tải tài khoản. Vui lòng tải lại trang.', 'error'); }
  }

  function renderProfile(user) {
    // Header
    const nameDisplay = document.getElementById('profile-name-display');
    const emailDisplay = document.getElementById('profile-email-display');
    const avatarImg = document.getElementById('profile-avatar-img');
    const vipBadge = document.getElementById('profile-vip-badge');
    const createdDisplay = document.getElementById('profile-created-display');

    if (nameDisplay) nameDisplay.innerText = user.name;
    if (emailDisplay) emailDisplay.innerText = user.email;
    if (avatarImg && typeof user.avatar === 'string' && /^(https?:\/\/|\/(?!\/))/.test(user.avatar)) avatarImg.src = user.avatar;
    if (createdDisplay) {
      const dateStr = user.created_at ? new Date(user.created_at).toLocaleDateString('vi-VN') : '15/01/2023';
      createdDisplay.textContent = `Gia nhập CineViet từ: ${dateStr}`;
    }

    if (vipBadge) {
      if (user.role === 'admin') {
        vipBadge.className = 'px-3 py-1 rounded-full bg-primary/20 text-primary border border-primary/30 font-bold text-xs uppercase tracking-wider';
        vipBadge.innerText = 'Quản Trị Viên';
      } else {
        vipBadge.className = 'px-3 py-1 rounded-full bg-surface-container-highest text-on-surface font-bold text-xs uppercase tracking-wider';
        vipBadge.innerText = 'Khán Giả';
      }
    }

    // Form inputs
    const inputName = document.getElementById('input-profile-name');
    const inputEmail = document.getElementById('input-profile-email');
    if (inputName) inputName.value = user.name || '';
    if (inputEmail) inputEmail.value = user.email || '';

    // Avatar Presets selection
    selectedAvatar = user.avatar;
    document.querySelectorAll('#avatar-presets img').forEach(img => {
      if (img.src === user.avatar) {
        img.classList.add('ring-primary', 'scale-110');
      } else {
        img.classList.remove('ring-primary', 'scale-110');
      }
      img.addEventListener('click', () => {
        document.querySelectorAll('#avatar-presets img').forEach(i => i.classList.remove('ring-primary', 'scale-110'));
        img.classList.add('ring-primary', 'scale-110');
        selectedAvatar = img.src;
        if (avatarImg) avatarImg.src = selectedAvatar;
      });
    });
    renderSecurity(user);
  }

  // Load Library Stats
  async function loadLibraryStats() {
    try {
      const lib = await API.getLibrary();
      if (!lib) return;
      const favEl = document.getElementById('stat-fav-count');
      const watchEl = document.getElementById('stat-watch-count');
      const histEl = document.getElementById('stat-history-count');

      if (favEl) favEl.innerText = lib.watchlist?.length || 0;
      if (watchEl) watchEl.innerText = lib.continueWatching?.length || 0;
      if (histEl) histEl.innerText = lib.history?.length || 0;
    } catch(e) {}
  }

  // Save Profile Form
  const saveProfileBtn = document.getElementById('btn-save-profile');
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async () => {
      const name = document.getElementById('input-profile-name')?.value.trim();
      if (!name) {
        window.showToast('Vui lòng nhập họ và tên hiển thị', 'error');
        return;
      }

      saveProfileBtn.disabled = true;
      try {
        const res = await API.updateProfile(name, selectedAvatar);
        if (res.status) {
          window.showToast('Cập nhật thông tin cá nhân thành công!');
          currentUser = res.data;
          renderProfile(res.data);
        } else {
          window.showToast(res.message || 'Lỗi lưu thông tin', 'error');
        }
      } catch (_) {
        window.showToast('Không thể kết nối máy chủ. Vui lòng thử lại.', 'error');
      } finally {
        saveProfileBtn.disabled = false;
      }
    });
  }

  // Change Password Form
  const submitPasswordBtn = document.getElementById('btn-submit-password');
  if (submitPasswordBtn) {
    submitPasswordBtn.addEventListener('click', async () => {
      const oldPass = document.getElementById('input-old-password')?.value;
      const newPass = document.getElementById('input-new-password')?.value;
      const confirmPass = document.getElementById('input-confirm-password')?.value;

      if (!oldPass || !newPass) {
        window.showToast('Vui lòng nhập đầy đủ mật khẩu cũ và mới', 'error');
        return;
      }
      if (newPass.length < 6 || newPass.length > 256) {
        window.showToast('Mật khẩu mới cần 6–256 ký tự', 'error');
        return;
      }
      if (newPass !== confirmPass) {
        window.showToast('Xác nhận mật khẩu mới không trùng khớp', 'error');
        return;
      }

      submitPasswordBtn.disabled = true;
      try {
        const res = await API.changePassword(oldPass, newPass);
        if (res.status) {
          currentUser = null;
          localStorage.removeItem('kk_user');
          document.getElementById('input-old-password').value = '';
          document.getElementById('input-new-password').value = '';
          document.getElementById('input-confirm-password').value = '';
          window.showToast('Đổi mật khẩu thành công. Vui lòng đăng nhập lại.');
          window.location.replace('/dang-nhap?redirect=%2Ftai-khoan');
        } else {
          window.showToast(res.message || 'Mật khẩu hiện tại không chính xác', 'error');
        }
      } catch (_) {
        window.showToast('Không thể kết nối máy chủ. Vui lòng thử lại.', 'error');
      } finally {
        submitPasswordBtn.disabled = false;
      }
    });
  }

  const el = id => document.getElementById(id);
  function securityStatus(message, error = false) {
    if (el('security-status')) el('security-status').textContent = message;
    window.showToast(message, error ? 'error' : undefined);
  }
  function renderSecurity(user) {
    if (el('email-verification-state')) el('email-verification-state').textContent = user.email_verified ? 'Email đã được xác minh.' : 'Email chưa được xác minh. Kiểm tra hộp thư hoặc gửi lại liên kết.';
    if (el('btn-resend-verification')) el('btn-resend-verification').disabled = Boolean(user.email_verified);
    if (el('mfa-state')) el('mfa-state').textContent = user.mfa_enabled ? 'MFA đang bật.' : 'MFA chưa được bật.';
    el('btn-mfa-setup')?.classList.toggle('hidden', Boolean(user.mfa_enabled));
    el('btn-mfa-disable')?.classList.toggle('hidden', !user.mfa_enabled);
  }
  function clearEnrollment() {
    if (el('mfa-secret')) el('mfa-secret').textContent = '';
    el('mfa-uri')?.removeAttribute('href');
    el('mfa-enrollment')?.classList.add('hidden');
    el('btn-mfa-confirm')?.classList.add('hidden');
    for (const id of ['mfa-password', 'mfa-code']) if (el(id)) el(id).value = '';
  }
  function clearRecovery() {
    if (el('mfa-recovery-codes')) el('mfa-recovery-codes').textContent = '';
    el('mfa-recovery')?.classList.add('hidden');
  }
  function action(id, operation) {
    const button = el(id);
    button?.addEventListener('click', async () => {
      button.disabled = true;
      try { await operation(); }
      catch (error) { securityStatus(error.message || 'Không thể kết nối máy chủ. Vui lòng thử lại.', true); }
      finally { button.disabled = false; }
    });
  }
  function checked(res) {
    if (!res?.status) throw new Error(res?.message || 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.');
    return res.data;
  }
  async function loadSessions() {
    const root = el('security-sessions');
    if (!root) return;
    root.textContent = 'Đang tải phiên đăng nhập...';
    try {
      const sessions = checked(await API.getSessions());
      root.replaceChildren();
      if (!sessions?.length) root.textContent = 'Không có phiên đăng nhập đang hoạt động.';
      for (const session of sessions || []) {
        const item = document.createElement('li');
        item.className = 'p-4 rounded-xl bg-surface-container-high space-y-2 break-words';
        const label = document.createElement('p');
        label.textContent = `${session.device || 'Thiết bị không rõ'}${session.current ? ' (Thiết bị này)' : ''}`;
        const detail = document.createElement('p');
        detail.className = 'text-xs text-on-surface-variant';
        detail.textContent = `${session.ip || ''} | Đăng nhập: ${new Date(session.created_at).toLocaleString('vi-VN')} | Hết hạn: ${new Date(session.expires_at).toLocaleString('vi-VN')}`;
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'text-primary underline text-sm';
        button.textContent = session.current ? 'Đăng xuất thiết bị này' : 'Thu hồi phiên';
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            checked(await API.revokeSession(session.id));
            if (session.current) {
              localStorage.removeItem('kk_user');
              window.location.replace('/dang-nhap?redirect=%2Ftai-khoan');
            } else { await loadSessions(); securityStatus('Đã thu hồi phiên đăng nhập.'); }
          } catch (_) { securityStatus('Không thể thu hồi phiên. Vui lòng thử lại.', true); }
          finally { button.disabled = false; }
        });
        item.append(label, detail, button); root.append(item);
      }
    } catch (_) { root.textContent = 'Không thể tải phiên đăng nhập. Nhấn làm mới để thử lại.'; }
  }
  action('btn-resend-verification', async () => {
    const res = await API.requestVerification(); checked(res); securityStatus(res.message || 'Đã gửi email xác minh.');
  });
  action('btn-refresh-sessions', loadSessions);
  action('btn-revoke-others', async () => {
    const res = await API.revokeOtherSessions(); checked(res); await loadSessions(); securityStatus('Đã đăng xuất các thiết bị khác.');
  });
  action('btn-mfa-setup', async () => {
    const password = el('mfa-password').value;
    if (!password) throw new Error('Vui lòng nhập mật khẩu hiện tại.');
    const data = checked(await API.setupMfa(password));
    clearEnrollment(); clearRecovery();
    el('mfa-secret').textContent = data.secret;
    if (typeof data.otpauthUrl === 'string' && /^otpauth:\/\/totp\//.test(data.otpauthUrl)) el('mfa-uri').setAttribute('href', data.otpauthUrl);
    el('mfa-enrollment').classList.remove('hidden');
    el('btn-mfa-confirm').classList.remove('hidden');
    securityStatus('Nhập khóa vào ứng dụng và xác nhận bằng mã 6 số trong vòng 5 phút.');
  });
  action('btn-mfa-confirm', async () => {
    const data = checked(await API.confirmMfa(el('mfa-code').value.trim()));
    clearEnrollment();
    currentUser = data.user; renderSecurity(currentUser);
    el('mfa-recovery-codes').textContent = (data.recoveryCodes || []).join('\n');
    el('mfa-recovery').classList.remove('hidden');
    await loadSessions(); securityStatus('Đã bật MFA. Hãy lưu mã khôi phục ngay.');
  });
  action('btn-mfa-disable', async () => {
    const password = el('mfa-password').value, code = el('mfa-code').value.trim();
    if (!password || !code) throw new Error('Cần mật khẩu hiện tại và mã xác thực hoặc mã khôi phục.');
    const data = checked(await API.disableMfa(password, code));
    clearEnrollment(); clearRecovery();
    currentUser = data.user; renderSecurity(currentUser);
    await loadSessions(); securityStatus('Đã tắt MFA. Các phiên khác đã bị thu hồi.');
  });
  action('btn-recovery-saved', async () => { clearRecovery(); securityStatus('Đã ẩn mã khôi phục.'); });
  window.addEventListener?.('pagehide', () => { clearEnrollment(); clearRecovery(); });
  // Initial load
  loadUserInfo();
});

