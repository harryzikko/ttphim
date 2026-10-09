// TTPhim - User Account & Profile Controller
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

  // Load User Info
  async function loadUserInfo() {
    currentUser = await API.getMe();
    if (!currentUser) {
      window.location.href = '/dang-nhap';
      return;
    }

    renderProfile(currentUser);
    loadLibraryStats();
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
    if (avatarImg && user.avatar) avatarImg.src = user.avatar;
    if (createdDisplay) {
      const dateStr = user.created_at ? new Date(user.created_at).toLocaleDateString('vi-VN') : '15/01/2023';
      createdDisplay.innerHTML = `<span class="material-symbols-outlined text-[15px]">calendar_month</span> Gia nhập TTPhim từ: ${dateStr}`;
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
      const res = await API.updateProfile(name, selectedAvatar);
      saveProfileBtn.disabled = false;

      if (res.status) {
        window.showToast('🎉 Cập nhật thông tin cá nhân thành công!');
        currentUser = res.data;
        renderProfile(res.data);
      } else {
        window.showToast(res.message || 'Lỗi lưu thông tin', 'error');
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
      if (newPass.length < 6) {
        window.showToast('Mật khẩu mới phải có ít nhất 6 ký tự', 'error');
        return;
      }
      if (newPass !== confirmPass) {
        window.showToast('Xác nhận mật khẩu mới không trùng khớp', 'error');
        return;
      }

      submitPasswordBtn.disabled = true;
      const res = await API.changePassword(oldPass, newPass);
      submitPasswordBtn.disabled = false;

      if (res.status) {
        window.showToast('🔐 Đổi mật khẩu thành công! Hãy lưu lại mật khẩu mới.');
        document.getElementById('input-old-password').value = '';
        document.getElementById('input-new-password').value = '';
        document.getElementById('input-confirm-password').value = '';
      } else {
        window.showToast(res.message || 'Mật khẩu hiện tại không chính xác', 'error');
      }
    });
  }

  // Initial load
  loadUserInfo();
});

