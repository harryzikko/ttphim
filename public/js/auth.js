// TTPhim - Auth Controller
document.addEventListener('DOMContentLoaded', () => {
  let isRegisterMode = false;

  const tabLoginBtn = document.getElementById('tabLoginBtn');
  const tabRegisterBtn = document.getElementById('tabRegisterBtn');
  const registerNameField = document.getElementById('registerNameField');
  const authForm = document.getElementById('authForm');
  const identityInput = document.getElementById('identityInput');
  const nameInput = document.getElementById('nameInput');
  const passwordInput = document.getElementById('passwordInput');
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const eyeIcon = document.getElementById('eyeIcon');
  const submitBtn = authForm ? authForm.querySelector('button[type="submit"]') || authForm.querySelector('button:not([type="button"])') : null;

  // Toggle Login/Register Mode
  function setMode(register) {
    isRegisterMode = register;
    if (isRegisterMode) {
      tabRegisterBtn.className = 'py-2 rounded-md font-label-lg text-label-lg transition-all duration-300 text-center text-on-primary-container bg-primary-container shadow-md';
      tabLoginBtn.className = 'py-2 rounded-md font-label-lg text-label-lg transition-all duration-300 text-center text-on-surface-variant hover:text-on-surface';
      if (registerNameField) registerNameField.classList.remove('hidden');
      if (registerNameField) registerNameField.classList.add('flex');
      if (submitBtn) submitBtn.innerText = 'Tạo Tài Khoản Mới';
    } else {
      tabLoginBtn.className = 'py-2 rounded-md font-label-lg text-label-lg transition-all duration-300 text-center text-on-primary-container bg-primary-container shadow-md';
      tabRegisterBtn.className = 'py-2 rounded-md font-label-lg text-label-lg transition-all duration-300 text-center text-on-surface-variant hover:text-on-surface';
      if (registerNameField) registerNameField.classList.add('hidden');
      if (registerNameField) registerNameField.classList.remove('flex');
      if (submitBtn) submitBtn.innerText = 'Đăng Nhập Ngay';
    }
  }

  if (tabLoginBtn) tabLoginBtn.addEventListener('click', () => setMode(false));
  if (tabRegisterBtn) tabRegisterBtn.addEventListener('click', () => setMode(true));

  // Auto detect /dang-ky route or ?mode=register
  if (window.location.pathname === '/dang-ky' || new URLSearchParams(window.location.search).get('mode') === 'register') {
    setMode(true);
  }

  // Toggle Password Visibility
  if (togglePasswordBtn && passwordInput && eyeIcon) {
    togglePasswordBtn.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      eyeIcon.innerText = isPassword ? 'visibility' : 'visibility_off';
    });
  }

  // Handle Form Submit
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = identityInput.value.trim();
      const password = passwordInput.value;
      const name = nameInput ? nameInput.value.trim() : '';

      if (!email || !password) {
        window.showToast('Vui lòng điền đầy đủ email và mật khẩu', 'error');
        return;
      }

      if (submitBtn) submitBtn.disabled = true;

      try {
        let res;
        if (isRegisterMode) {
          res = await API.register(email, password, name);
        } else {
          res = await API.login(email, password);
        }

        if (res.status) {
          window.showToast(res.message || 'Thao tác thành công!');
          setTimeout(() => {
            const redirect = new URLSearchParams(window.location.search).get('redirect') || '/';
            window.location.href = redirect;
          }, 800);
        } else {
          window.showToast(res.message || 'Đăng nhập không thành công', 'error');
        }
      } catch (err) {
        window.showToast('Lỗi máy chủ kết nối', 'error');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

});

