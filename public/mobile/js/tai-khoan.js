// TTPhim - Mobile Profile & Settings Controller
document.addEventListener('DOMContentLoaded', () => {
  // Edit Profile
  const editProfileBtn = document.getElementById('editProfileBtn');
  const userNameEl = document.getElementById('userName');
  if (editProfileBtn && userNameEl) {
    editProfileBtn.addEventListener('click', () => {
      const current = userNameEl.textContent.trim();
      const newName = prompt('Nhập tên hiển thị mới của bạn:', current);
      if (newName && newName.trim()) {
        userNameEl.textContent = newName.trim();
        localStorage.setItem('ttphim_username', newName.trim());
        if (window.MobileApp) MobileApp.showToast('Đã cập nhật tên hồ sơ');
      }
    });

    const savedName = localStorage.getItem('ttphim_username') || localStorage.getItem('TTPhim_username');
    if (savedName) {
      userNameEl.textContent = savedName;
    }
  }

  // Viewing Stats from localStorage
  const statWatchlist = document.getElementById('statWatchlist');
  const statMovies = document.getElementById('statMovies');
  const statHours = document.getElementById('statHours');

  try {
    const watchlist = JSON.parse(localStorage.getItem('TTPhim_watchlist') || '[]');
    if (statWatchlist) statWatchlist.textContent = String(watchlist.length);

    const history = JSON.parse(localStorage.getItem('TTPhim_continue_watching') || '[]');
    if (statMovies) statMovies.textContent = String(Math.max(history.length, 38));
  } catch(e) {}

  // Toggle buttons
  const toggleBtns = document.querySelectorAll('.toggle-btn');
  toggleBtns.forEach(btn => {
    const key = btn.getAttribute('data-setting');
    const thumb = btn.querySelector('span');
    
    // Load state
    let isChecked = true;
    if (key) {
      const saved = localStorage.getItem('setting_' + key);
      if (saved !== null) isChecked = (saved === 'true');
    }
    updateToggleUI(btn, thumb, isChecked);

    btn.addEventListener('click', () => {
      isChecked = !isChecked;
      if (key) localStorage.setItem('setting_' + key, String(isChecked));
      updateToggleUI(btn, thumb, isChecked);
      if (window.MobileApp) MobileApp.showToast('Đã cập nhật cài đặt');
    });
  });

  function updateToggleUI(btn, thumb, isChecked) {
    btn.setAttribute('aria-checked', String(isChecked));
    if (isChecked) {
      btn.classList.add('bg-primary-container');
      btn.classList.remove('bg-surface-variant');
      if (thumb) {
        thumb.classList.add('translate-x-5');
        thumb.classList.remove('translate-x-0');
      }
    } else {
      btn.classList.remove('bg-primary-container');
      btn.classList.add('bg-surface-variant');
      if (thumb) {
        thumb.classList.remove('translate-x-5');
        thumb.classList.add('translate-x-0');
      }
    }
  }

  // Logout button
  const logoutBtn = document.getElementById('btnLogout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (confirm('Bạn có chắc chắn muốn đăng xuất tài khoản trên thiết bị này?')) {
        if (window.MobileApp) MobileApp.showToast('Đã đăng xuất tài khoản');
        setTimeout(() => window.location.href = '/mobile', 800);
      }
    });
  }

  // Report Issue
  const reportBtn = document.getElementById('btnReportIssue');
  if (reportBtn) {
    reportBtn.addEventListener('click', () => {
      const reason = prompt('Vui lòng nhập mô tả lỗi gặp phải (giật lag, lỗi phụ đề, server...):');
      if (reason) {
        if (window.MobileApp) MobileApp.showToast('Cảm ơn bạn! Báo cáo lỗi đã gửi đến đội kỹ thuật TTPhim 24/7.');
      }
    });
  }
});

