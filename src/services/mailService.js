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
    if (production && (!env.SMTP_HOST || !env.SMTP_FROM || !env.SMTP_USER || !env.SMTP_PASS) && !adapter) {
      throw new Error('SMTP delivery is not configured');
    }
  }
  async function sendIdentityMail({ email, token, purpose }) {
    assertReady();
    const mode = purpose === 'reset' ? 'reset' : 'verify';
    // Fragments keep bearer tokens out of HTTP access logs and Referer headers.
    const url = `${publicOrigin()}/dang-nhap?mode=${mode}#token=${encodeURIComponent(token)}`;
    const message = {
      from: env.SMTP_FROM || 'CineViet <no-reply@localhost>', to: email,
      subject: purpose === 'reset' ? 'CineViet - Dat lai mat khau' : 'CineViet - Xac minh email',
      text: `${purpose === 'reset' ? 'Dat lai mat khau' : 'Xac minh email'}: ${url}\nNeu ban khong yeu cau, hay bo qua thu nay.`
    };
    if (adapter) return adapter(message);
    if (!env.SMTP_HOST && !production) {
      outbox.push(message);
      if (outbox.length > 100) outbox.shift();
      return { accepted: [email], development: true };
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
