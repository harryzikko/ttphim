// Native mobile security uses the account controller's authoritative session gate.
window.MobileAccountSecurity = {
  create({ action, verify, goLogin, acceptUser }) {
    const el = id => document.getElementById(id);
    const root = el('m-security');
    if (!root) return null;
    let user = null;
    let locked = true;
    let cooldownUntil = 0;
    let enrollmentTimer;
    let sessionsLoaded = false;
    let sessionsLoading = false;
    let ended = false;
    let anchorHandled = false;
    let sensitiveEpoch = 0;
    const text = (id, value) => { el(id).textContent = value; };
    const status = value => text('m-security-status', value);
    const unauthorized = value => Number(value?.httpStatus || value?.statusCode || value?.status) === 401;
    function checked(response) {
      if (!response?.status || unauthorized(response)) {
        throw Object.assign(new Error(response?.message || 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.'), {
          httpStatus: response?.httpStatus, retryAfter: response?.retryAfter
        });
      }
      return response.data;
    }
    function controls() {
      for (const node of root.querySelectorAll('button, input')) node.disabled = locked || ended || !user;
      const seconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      el('m-email-resend').disabled = locked || ended || !user || Boolean(user.email_verified) || seconds > 0;
      el('m-email-resend').textContent = seconds ? `Gửi lại sau ${seconds} giây` : 'Gửi lại email xác minh';
      el('m-mfa-setup').hidden = Boolean(user?.mfa_enabled);
      el('m-mfa-disable').hidden = !user?.mfa_enabled;
      el('m-mfa-confirm').hidden = el('m-mfa-enrollment').hidden;
      el('m-mfa-confirm').disabled ||= el('m-mfa-enrollment').hidden;
      el('m-sessions-revoke-others').disabled ||= !sessionsLoaded;
      el('m-mfa-uri').tabIndex = locked || ended ? -1 : 0;
      el('m-mfa-uri').setAttribute('aria-disabled', String(locked || ended));
    }
    function clearEnrollment() {
      sensitiveEpoch++;
      clearTimeout(enrollmentTimer);
      text('m-mfa-secret', '');
      el('m-mfa-uri').removeAttribute('href');
      el('m-mfa-uri').hidden = true;
      el('m-mfa-enrollment').hidden = true;
      el('m-mfa-password').value = '';
      el('m-mfa-code').value = '';
      controls();
    }
    function clearRecovery() {
      text('m-mfa-recovery-codes', '');
      el('m-mfa-recovery').hidden = true;
    }
    function clearSensitive() {
      clearEnrollment();
      clearRecovery();
      for (const id of ['m-password-current', 'm-password-new', 'm-password-confirm']) el(id).value = '';
    }
    function leave() {
      ended = true;
      user = null;
      clearSensitive();
      try { localStorage.removeItem('kk_user'); } catch (_) { /* Cache is not auth authority. */ }
      goLogin();
    }
    function run(operation) {
      return action(async () => {
        try { await operation(); }
        catch (error) {
          if (unauthorized(error) && !await verify()) { clearSensitive(); return; }
          status(error.message || 'Không thể kết nối máy chủ. Vui lòng thử lại.');
        }
      });
    }
    function bind(id, operation) { el(id).addEventListener('click', () => run(operation)); }
    function update(next) {
      user = next;
      text('m-email-state', next.email_verified ? 'Email đã được xác minh.' : 'Email chưa được xác minh. Kiểm tra hộp thư hoặc gửi lại liên kết.');
      text('m-mfa-state', next.mfa_enabled ? 'MFA đang bật.' : 'MFA chưa được bật.');
      controls();
    }
    function safeTotpUri(value) {
      if (typeof value !== 'string' || /[\s\u0000-\u001f\u007f]/.test(value)) return null;
      try {
        const url = new URL(value);
        return url.protocol === 'otpauth:' && url.hostname === 'totp' && !url.username && !url.password && !url.port && url.pathname.length > 1 && url.searchParams.get('secret') ? url.href : null;
      } catch (_) { return null; }
    }
    function date(value) {
      if (!value) return 'Không rõ';
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? 'Không rõ' : parsed.toLocaleString('vi-VN');
    }
    async function loadSessions() {
      if (sessionsLoading) return;
      sessionsLoading = true;
      sessionsLoaded = false;
      controls();
      text('m-sessions-status', 'Đang tải phiên đăng nhập…');
      el('m-sessions-list').replaceChildren();
      try {
        const sessions = checked(await API.getSessions());
        if (!Array.isArray(sessions)) throw new Error('Dữ liệu phiên không hợp lệ. Nhấn làm mới để thử lại.');
        for (const session of sessions) {
          if (!session || !['string', 'number'].includes(typeof session.id)) continue;
          const item = document.createElement('li');
          const title = document.createElement('h3');
          title.textContent = session.device || 'Thiết bị không rõ';
          item.append(title);
          if (session.current) {
            const badge = document.createElement('span');
            badge.className = 'm-session-current';
            badge.textContent = 'Thiết bị này';
            item.append(badge);
          }
          const detail = document.createElement('p');
          detail.textContent = `IP: ${session.ip || 'Không rõ'} · Đăng nhập: ${date(session.created_at)} · Hết hạn: ${date(session.expires_at)}`;
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = session.current ? 'Đăng xuất thiết bị này' : 'Thu hồi phiên';
          button.addEventListener('click', () => run(async () => {
            if (!window.confirm(session.current ? 'Đăng xuất khỏi thiết bị này?' : 'Thu hồi phiên đăng nhập trên thiết bị này?')) return;
            checked(await API.revokeSession(session.id));
            if (session.current) { leave(); return; }
            await loadSessions();
            status('Đã thu hồi phiên đăng nhập.');
          }));
          item.append(detail, button);
          el('m-sessions-list').append(item);
        }
        sessionsLoaded = true;
        text('m-sessions-status', sessions.length ? 'Danh sách phiên từ máy chủ.' : 'Không có phiên đăng nhập đang hoạt động.');
      } catch (error) {
        text('m-sessions-status', 'Không thể tải phiên đăng nhập. Nhấn làm mới để thử lại.');
        throw error;
      } finally { sessionsLoading = false; controls(); }
    }
    bind('m-security-refresh', async () => {
      if (await verify()) status('Đã kiểm tra trạng thái tài khoản từ máy chủ.');
    });
    bind('m-email-resend', async () => {
      if (user.email_verified || cooldownUntil > Date.now()) return;
      try {
        const response = await API.requestVerification();
        checked(response);
        const delay = Number(response.retryAfter || response.data?.retryAfter);
        if (Number.isFinite(delay) && delay > 0) cooldownUntil = Date.now() + Math.ceil(delay) * 1000;
        status(response.message || 'Yêu cầu gửi email xác minh đã được máy chủ chấp nhận. Kiểm tra hộp thư.');
      } catch (error) {
        const delay = Number(error.retryAfter);
        if (Number.isFinite(delay) && delay > 0) cooldownUntil = Date.now() + Math.ceil(delay) * 1000;
        throw error;
      } finally { controls(); }
    });
    el('m-password-form').addEventListener('submit', event => {
      event.preventDefault();
      run(async () => {
        const oldPassword = el('m-password-current').value;
        const newPassword = el('m-password-new').value;
        if (!oldPassword || newPassword.length < 6 || newPassword.length > 256) throw new Error('Nhập mật khẩu hiện tại và mật khẩu mới 6–256 ký tự.');
        if (newPassword !== el('m-password-confirm').value) throw new Error('Xác nhận mật khẩu mới không trùng khớp.');
        if (!window.confirm('Đổi mật khẩu và đăng xuất các phiên đăng nhập?')) return;
        checked(await API.changePassword(oldPassword, newPassword));
        leave();
      });
    });
    bind('m-mfa-setup', async () => {
      const password = el('m-mfa-password').value;
      if (!password) throw new Error('Vui lòng nhập mật khẩu hiện tại.');
      clearEnrollment();
      clearRecovery();
      const epoch = sensitiveEpoch;
      const data = checked(await API.setupMfa(password));
      if (ended || !root.open || epoch !== sensitiveEpoch) { clearEnrollment(); return; }
      if (typeof data?.secret !== 'string' || !data.secret) throw new Error('Máy chủ không trả về khóa thiết lập. Vui lòng thử lại.');
      text('m-mfa-secret', data.secret);
      const uri = safeTotpUri(data.otpauthUrl);
      if (uri) { el('m-mfa-uri').href = uri; el('m-mfa-uri').hidden = false; }
      el('m-mfa-enrollment').hidden = false;
      enrollmentTimer = setTimeout(() => { clearEnrollment(); status('Khóa thiết lập đã được ẩn sau 5 phút. Hãy thiết lập lại nếu chưa xác nhận.'); }, 300000);
      status('Nhập khóa vào ứng dụng xác thực rồi xác nhận bằng mã 6 số trong vòng 5 phút.');
      controls();
    });
    bind('m-mfa-confirm', async () => {
      const code = el('m-mfa-code').value.trim();
      if (el('m-mfa-enrollment').hidden || !/^\d{6}$/.test(code)) throw new Error('Vui lòng nhập mã 6 số từ ứng dụng xác thực.');
      const epoch = sensitiveEpoch;
      const data = checked(await API.confirmMfa(code));
      const showRecovery = !ended && root.open && epoch === sensitiveEpoch;
      clearEnrollment();
      acceptUser(data?.user);
      clearRecovery();
      if (showRecovery && Array.isArray(data.recoveryCodes) && data.recoveryCodes.length) {
        text('m-mfa-recovery-codes', data.recoveryCodes.join('\n'));
        el('m-mfa-recovery').hidden = false;
      }
      status('Đã bật MFA. Lưu ngay mã khôi phục nếu được hiển thị.');
      await loadSessions();
    });
    bind('m-mfa-disable', async () => {
      const password = el('m-mfa-password').value;
      const code = el('m-mfa-code').value.trim();
      if (!password || !code) throw new Error('Cần mật khẩu hiện tại và mã ứng dụng hoặc mã khôi phục.');
      if (!window.confirm('Tắt xác thực hai bước? Các phiên khác sẽ bị thu hồi.')) return;
      try {
        const data = checked(await API.disableMfa(password, code));
        clearRecovery();
        acceptUser(data?.user);
        status('Đã tắt MFA. Các phiên khác đã bị thu hồi.');
        await loadSessions();
      } finally { clearEnrollment(); }
    });
    el('m-mfa-cancel').addEventListener('click', clearEnrollment);
    el('m-mfa-saved').addEventListener('click', clearRecovery);
    bind('m-sessions-refresh', loadSessions);
    bind('m-sessions-revoke-others', async () => {
      if (!window.confirm('Đăng xuất tất cả thiết bị khác và giữ thiết bị này?')) return;
      checked(await API.revokeOtherSessions());
      status('Đã đăng xuất các thiết bị khác.');
      await loadSessions();
    });
    el('m-mfa-uri').addEventListener('click', event => { if (locked || ended) event.preventDefault(); });
    root.addEventListener('toggle', () => {
      if (ended) return;
      if (!root.open) clearSensitive();
      else if (!locked && !sessionsLoaded && !sessionsLoading) run(loadSessions);
    });
    const cooldownTimer = setInterval(controls, 1000);
    window.addEventListener('pagehide', () => { ended = true; clearInterval(cooldownTimer); clearSensitive(); });
    return {
      update, clearSensitive,
      setLocked(value) {
        locked = value;
        controls();
        if (!locked && !anchorHandled) {
          anchorHandled = true;
          if (/^#m-security(?:-devices)?$/.test(window.location.hash)) root.open = true;
        }
      },
      async openDevices() {
        root.open = true;
        window.history.replaceState(null, '', '#m-security-devices');
        const devices = el('m-security-devices');
        devices.focus();
        devices.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
        if (!sessionsLoaded) await loadSessions();
      }
    };
  }
};
