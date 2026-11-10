const config = require('../config');

function createMailService({ adapter, production = config.IS_PRODUCTION, origin = config.PUBLIC_ORIGIN || process.env.PUBLIC_ORIGIN, env = process.env } = {}) {
  const outbox = [];
  let transport;
  function publicOrigin() {
    const url = new URL(origin || (production ? '' : 'http://localhost:3001'));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (production && url.protocol !== 'https:')) throw new Error('PUBLIC_ORIGIN must be an HTTPS origin in production');
    return url.origin;
  }
  function assertReady() {
    publicOrigin();
    if (production && (!env.SMTP_HOST || !env.SMTP_FROM || !env.SMTP_USER || !env.SMTP_PASS) && !adapter && env.ALLOW_SIMULATED_MAIL !== 'true') {
      throw new Error('SMTP delivery is not configured');
    }
  }
  async function sendIdentityMail({ email, token, purpose }) {
    assertReady();
    const mode = purpose === 'reset' ? 'reset' : 'verify';
    // Fragments keep bearer tokens out of HTTP access logs and Referer headers.
    const url = `${publicOrigin()}/dang-nhap?mode=${mode}#token=${encodeURIComponent(token)}`;
    const message = {
      from: env.SMTP_FROM || 'CineViet <admin@cineviet.live>', to: email,
      subject: purpose === 'reset' ? 'CineViet - Đặt lại mật khẩu tài khoản' : 'CineViet - Xác minh địa chỉ email',
      text: `${purpose === 'reset' ? 'Đặt lại mật khẩu CineViet' : 'Xác minh email CineViet'}: ${url}\nNếu bạn không yêu cầu, vui lòng bỏ qua thư này.\nMã xác nhận của bạn: ${token}`,
      html: `<div style="font-family:Inter,system-ui,sans-serif;max-width:540px;margin:0 auto;background:#11131c;color:#e5e6e9;padding:32px 24px;border-radius:12px;border:1px solid #232733;">
        <div style="text-align:center;margin-bottom:24px;">
          <span style="font-size:24px;font-weight:800;color:#fff;letter-spacing:0.05em;">CINE<span style="color:#e50914">VIET</span></span>
        </div>
        <h2 style="font-size:20px;font-weight:700;color:#fff;margin:0 0 12px;text-align:center;">
          ${purpose === 'reset' ? 'Yêu cầu đặt lại mật khẩu' : 'Xác minh địa chỉ email'}
        </h2>
        <p style="font-size:14px;line-height:1.6;color:#a3a6ae;margin:0 0 24px;text-align:center;">
          ${purpose === 'reset' ? 'Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản CineViet của mình. Vui lòng bấm vào nút bên dưới để tạo mật khẩu mới:' : 'Cảm ơn bạn đã tham gia CineViet! Vui lòng bấm vào nút bên dưới để xác minh tài khoản:'}
        </p>
        <div style="text-align:center;margin:28px 0;">
          <a href="${url}" style="display:inline-block;padding:12px 28px;background:#e50914;color:#fff;font-weight:700;font-size:14px;text-decoration:none;border-radius:9999px;box-shadow:0 4px 18px rgba(229,9,20,0.4);">
            ${purpose === 'reset' ? 'Đặt Lại Mật Khẩu Ngay' : 'Xác Minh Email Ngay'}
          </a>
        </div>
        <p style="font-size:12px;color:#717582;line-height:1.5;margin:24px 0 0;text-align:center;border-top:1px solid #1f2330;padding-top:18px;">
          Liên kết có hiệu lực trong 30 phút. Nếu không thực hiện yêu cầu này, bạn có thể yên tâm bỏ qua email này.<br>Mã xác nhận bảo mật: <code style="color:#ff9800;background:#1a1e2b;padding:2px 6px;border-radius:4px;">${token}</code><br>Hỗ trợ: <a href="mailto:admin@cineviet.live" style="color:#a3a6ae;">admin@cineviet.live</a>
        </p>
      </div>`
    };
    if (adapter) return adapter(message);
    if (!env.SMTP_HOST) {
      outbox.push(message);
      if (outbox.length > 100) outbox.shift();
      console.log(`[PASSWORD RESET RECOVERY] Email: ${email} -> ${url}`);
      return { accepted: [email], development: !production, simulated: true };
    }
    if (!transport) {
      transport = require('nodemailer').createTransport({
        host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 465),
        secure: Number(env.SMTP_PORT || 465) === 465,
        requireTLS: true, tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
        logger: false, debug: false
      });
    }
    const result = await transport.sendMail(message);
    if (!result.accepted?.length) throw new Error('Mail was not accepted');
    return result;
  }
  return { assertReady, sendIdentityMail, ...(production ? {} : { outbox }) };
}
module.exports = { createMailService };
