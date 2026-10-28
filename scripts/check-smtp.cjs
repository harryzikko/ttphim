'use strict';
// Deliberately does not load .env or print SMTP values, credentials, or raw errors.
async function checkSmtp({ env = process.env, argv = process.argv.slice(2), createTransport } = {}) {
  const required = ['SMTP_HOST', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASS'];
  const missing = required.filter(key => !env[key]);
  if (missing.length) return { ok: false, stage: 'configuration', missing };
  const send = argv.includes('--send');
  const to = argv[argv.indexOf('--to') + 1];
  if (send && (!argv.includes('--to') || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(to || ''))) {
    return { ok: false, stage: 'configuration', message: 'Use --send --to recipient@example.com to explicitly send one test message.' };
  }
  const port = Number(env.SMTP_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || /[\r\n]/.test(env.SMTP_FROM)) return { ok: false, stage: 'configuration', message: 'Invalid SMTP port or sender.' };
  let transport;
  let stage = 'transport';
  try {
    transport = (createTransport || require('nodemailer').createTransport)({
      host: env.SMTP_HOST, port, secure: port === 465, requireTLS: true,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      logger: false, debug: false
    });
    await transport.verify();
    if (!send) return { ok: true, stage: 'transport_verified', delivered: false, message: 'TLS/auth verified. No message sent; inbox delivery remains unverified.' };
    stage = 'send';
    const result = await transport.sendMail({ from: env.SMTP_FROM, to,
      subject: 'CineViet - Kiem tra SMTP',
      text: 'Thu kiem tra SMTP CineViet. Hay kiem tra hop thu den/spam va header SPF, DKIM, DMARC. SMTP accepted khong dong nghia da nhan thu.'
    });
    if (!result.accepted?.length || result.rejected?.length) return { ok: false, stage: 'send', delivered: false, message: 'Recipient was not accepted.' };
    return { ok: true, stage: 'message_accepted', delivered: false, message: 'SMTP accepted the message. Confirm receipt in inbox/spam and inspect SPF/DKIM/DMARC separately.' };
  } catch (error) {
    const code = ['EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ETLS', 'EENVELOPE', 'EMESSAGE', 'EDNS'].includes(error.code) ? error.code : 'SMTP_FAILED';
    return { ok: false, stage, code, delivered: false };
  } finally { transport?.close?.(); }
}
if (require.main === module) checkSmtp().then(result => { console.log(JSON.stringify(result, null, 2)); process.exitCode = result.ok ? 0 : 2; });
module.exports = { checkSmtp };
