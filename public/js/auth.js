// TTPhim - Auth Controller
document.addEventListener('DOMContentLoaded', () => {
  function safeRedirect(value) {
    const target = String(value || '').trim();
    if (!target || /^[\\/]{2}/.test(target) || /[\u0000-\u001f\u007f\\]/.test(target)) return '/';
    try {
      const url = new URL(target, window.location.origin);
      return /^https?:$/.test(url.protocol) && url.origin === window.location.origin ? url.href : '/';
    } catch (_) { return '/'; }
  }
  const el = id => document.getElementById(id);
  const authForm = el('authForm');
  const submitBtn = authForm?.querySelector('button[type="submit"]') || authForm?.querySelector('button:not([type="button"])');
  const params = new URLSearchParams(window.location.search);
  let isRegisterMode = false, flow = '', challengeId = '', challengeExpires = 0;
  let authBusy = false, securityBusy = false;
  const cooldowns = new Map();
  const cooling = button => cooldowns.has(button);
  function handleFailure(response, button) {
    if (response.httpStatus !== 429 && response.code !== 'RATE_LIMITED') return status(response.message || 'Không thể đăng nhập. Vui lòng thử lại.', true);
    const seconds = Math.min(86400, Math.max(1, Math.ceil(Number(response.retryAfter) || 60)));
    const previous = cooldowns.get(button);
    if (previous) clearInterval(previous.timer);
    const record = { until: Date.now() + seconds * 1000, label: previous?.label || button?.textContent || 'Thử lại' };
    record.update = () => {
      const remaining = Math.max(0, Math.ceil((record.until - Date.now()) / 1000));
      if (!remaining) {
        clearInterval(record.timer); cooldowns.delete(button);
        if (button) { button.disabled = false; button.textContent = button === submitBtn ? (isRegisterMode ? 'Tạo tài khoản mới' : 'Đăng nhập ngay') : record.label; }
        if (el('authStatus')) el('authStatus').textContent = 'Bạn có thể thử lại. Hãy kiểm tra kỹ email và mật khẩu trước khi gửi.';
        return;
      }
      const wait = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
      if (button) { button.disabled = true; button.textContent = `Thử lại sau ${wait}`; }
      if (el('authStatus')) el('authStatus').textContent = `Quá nhiều yêu cầu. Vui lòng chờ ${wait} rồi thử lại.`;
    };
    cooldowns.set(button, record); record.update(); record.timer = setInterval(record.update, 1000);
    window.showToast?.('Bạn đã thử quá nhiều lần. Vui lòng chờ hết thời gian hiển thị rồi thử lại.', 'error');
  }
  let token = new URLSearchParams((window.location.hash || '').replace(/^#/, '')).get('token') || params.get('token') || '';
  if (token && window.history?.replaceState) {
    params.delete('token');
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }
  function status(message, error = false) {
    if (el('authStatus')) el('authStatus').textContent = message;
    window.showToast?.(message, error ? 'error' : undefined);
  }
  function setMode(register) {
    flow = ''; challengeId = ''; challengeExpires = 0;
    isRegisterMode = register;
    el('securityFlow')?.classList.add('hidden');
    authForm?.classList.remove('hidden');
    el('tabWrapper')?.classList.remove('hidden');
    el('registerNameField')?.classList.toggle('hidden', !register);
    el('registerNameField')?.classList.toggle('flex', register);
    if (el('registerGenderField')) el('registerGenderField').hidden = !register;
    authForm?.querySelectorAll('input[name="gender"]').forEach(input => { input.disabled = !register; input.required = register; });
    if (submitBtn) submitBtn.textContent = register ? 'Tạo tài khoản mới' : 'Đăng nhập ngay';
    for (const [id, active] of [['tabLoginBtn', !register], ['tabRegisterBtn', register]]) {
      const button = el(id);
      if (button) button.className = `py-2 rounded-md font-label-lg transition-all text-center ${active ? 'text-on-primary-container bg-primary-container shadow-md' : 'text-on-surface-variant hover:text-on-surface'}`;
    }
    if (el('passwordInput')) el('passwordInput').autocomplete = register ? 'new-password' : 'current-password';
    el('securityForm')?.reset();
    cooldowns.get(submitBtn)?.update();
  }
  function showFlow(mode) {
    flow = mode;
    if (el('securitySubmit')) el('securitySubmit').disabled = false;
    authForm?.classList.add('hidden');
    el('tabWrapper')?.classList.add('hidden');
    el('securityFlow')?.classList.remove('hidden');
    const titles = { forgot: 'Quên mật khẩu', reset: 'Đặt lại mật khẩu', verify: 'Xác minh email', mfa: 'Xác thực hai bước' };
    const help = { forgot: 'Nhập email của bạn. Nếu tài khoản tồn tại, bạn sẽ nhận được hướng dẫn.', reset: 'Liên kết chỉ dùng một lần, có hiệu lực 30 phút. Tất cả phiên cũ sẽ bị đăng xuất.', verify: 'Xác nhận email bằng liên kết trong thư. Liên kết có hiệu lực 24 giờ.', mfa: 'Nhập mã 6 số từ ứng dụng xác thực hoặc một mã khôi phục. Phiên xác minh có hiệu lực 5 phút.' };
    if (el('securityTitle')) el('securityTitle').textContent = titles[mode];
    if (el('securityHelp')) el('securityHelp').textContent = help[mode];
    for (const [field, active] of [['Email', mode === 'forgot'], ['Password', mode === 'reset'], ['Confirm', mode === 'reset'], ['Code', mode === 'mfa']]) {
      el(`security${field}Field`)?.classList.toggle('hidden', !active);
      const input = el(`security${field}`);
      if (input) { input.disabled = !active; input.required = active; }
    }
    if (el('securitySubmit')) el('securitySubmit').textContent = mode === 'verify' ? 'Xác minh email' : mode === 'reset' ? 'Lưu mật khẩu mới' : mode === 'forgot' ? 'Gửi hướng dẫn' : 'Xác nhận đăng nhập';
    if ((mode === 'reset' || mode === 'verify') && !token) {
      status('Liên kết thiếu mã xác nhận. Vui lòng mở lại liên kết trong email.', true);
      if (el('securitySubmit')) el('securitySubmit').disabled = true;
    }
  }
  function signedIn(message) {
    status(message || 'Đăng nhập thành công!');
    setTimeout(() => { window.location.href = safeRedirect(params.get('redirect') || '/'); }, 800);
  }
  el('tabLoginBtn')?.addEventListener('click', () => setMode(false));
  el('tabRegisterBtn')?.addEventListener('click', () => setMode(true));
  el('forgotPasswordLink')?.addEventListener('click', event => { event.preventDefault(); showFlow('forgot'); });
  el('securityBack')?.addEventListener('click', () => { token = ''; setMode(false); status('Bạn có thể đăng nhập hoặc yêu cầu liên kết mới.'); });
  el('togglePasswordBtn')?.addEventListener('click', () => {
    const input = el('passwordInput');
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    if (el('eyeIcon')) el('eyeIcon').textContent = input.type === 'password' ? 'visibility_off' : 'visibility';
  });
  authForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (authBusy || cooling(submitBtn)) return;
    const email = el('identityInput')?.value.trim(), password = el('passwordInput')?.value;
    if (!email || !password) return status('Vui lòng điền đầy đủ email và mật khẩu', true);
    const gender = authForm?.querySelector('input[name="gender"]:checked')?.value;
    if (isRegisterMode && !['male', 'female'].includes(gender)) return status('Vui lòng chọn giới tính Nam hoặc Nữ.', true);
    authBusy = true;
    if (submitBtn) submitBtn.disabled = true;
    try {
      const res = isRegisterMode ? await API.register(email, password, el('nameInput')?.value.trim() || '', gender) : await API.login(email, password);
      if (!res.status) return handleFailure(res, submitBtn);
      if (el('passwordInput')) el('passwordInput').value = '';
      if (res.data?.mfaRequired) {
        challengeId = res.data.challengeId; challengeExpires = res.data.expiresAt;
        showFlow('mfa'); status('Nhập mã xác thực để hoàn tất đăng nhập.');
      } else if (isRegisterMode) {
        const pending = res.data?.verificationPending === true;
        status(pending ? 'Tài khoản đã tạo. Chưa gửi được email xác minh; bạn có thể gửi lại trong phần Bảo mật.' : 'Tài khoản đã tạo. Hãy kiểm tra email để xác minh.');
        setTimeout(() => { window.location.href = pending ? '/tai-khoan?verification=pending#tab-security' : '/tai-khoan'; }, 800);
      } else signedIn(res.message);
    } catch (_) { status('Không thể kết nối máy chủ. Vui lòng thử lại.', true); }
    finally { authBusy = false; if (submitBtn) submitBtn.disabled = cooling(submitBtn); }
  });
  el('securityForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = el('securitySubmit');
    if (securityBusy || cooling(button)) return;
    securityBusy = true;
    if (button) button.disabled = true;
    try {
      let res;
      if (flow === 'forgot') res = await API.forgotPassword(el('securityEmail').value.trim());
      else if (flow === 'reset') {
        if (el('securityPassword').value !== el('securityConfirm').value) return status('Mật khẩu xác nhận không trùng khớp', true);
        res = await API.resetPassword(token, el('securityPassword').value);
      } else if (flow === 'verify') res = await API.verifyEmail(token);
      else if (flow === 'mfa') {
        if (!challengeId || Date.now() >= challengeExpires) { setMode(false); return status('Phiên xác minh đã hết hạn. Vui lòng đăng nhập lại.', true); }
        res = await API.completeMfaLogin(challengeId, el('securityCode').value.trim());
      }
      if (!res?.status) return handleFailure(res || { message: 'Không thể xác nhận. Vui lòng thử lại.' }, button);
      if (flow === 'mfa') { challengeId = ''; el('securityCode').value = ''; signedIn(res.message); }
      else if (flow === 'reset' || flow === 'verify') {
        token = ''; setMode(false); status(res.message || 'Thành công. Bạn có thể đăng nhập.');
      } else status(res.message);
    } catch (_) { status('Không thể kết nối máy chủ. Vui lòng thử lại.', true); }
    finally { securityBusy = false; if (button) button.disabled = cooling(button); }
  });
  if (window.location.pathname === '/dang-ky' || params.get('mode') === 'register') setMode(true);
  if (['forgot', 'reset', 'verify'].includes(params.get('mode'))) showFlow(params.get('mode'));
  window.addEventListener?.('pagehide', () => { token = ''; challengeId = ''; el('securityForm')?.reset(); for (const record of cooldowns.values()) clearInterval(record.timer); cooldowns.clear(); });
});
