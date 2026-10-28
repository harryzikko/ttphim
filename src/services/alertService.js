const db = require('./dbService');
const config = require('../config');
const crypto = require('crypto');

async function notify(kind, summary, options = {}) {
  if (!/^[a-z_]{1,40}$/.test(kind)) throw new Error('Invalid alert category');
  const now = Date.now();
  const alert = { id: crypto.randomUUID(), kind, summary: String(summary).slice(0, 300), created_at: new Date(now).toISOString(), severity: options.severity || 'warning' };
  let duplicate = false;
  try {
    await db.mutate(data => {
      data.operational_alerts ||= [];
      duplicate = data.operational_alerts.some(item => item.kind === kind && now - Date.parse(item.created_at) < 300000);
      if (!duplicate) data.operational_alerts.unshift(alert);
      data.operational_alerts = data.operational_alerts.slice(0, 200);
    });
  } catch { /* An unavailable database must not prevent an external outage alert. */ }
  if (duplicate || process.env.ALERTS_ENABLED !== 'true' || !config.ALERT_WEBHOOK_URL) return { delivered: false, duplicate };
  const url = new URL(config.ALERT_WEBHOOK_URL);
  if (url.protocol !== 'https:') throw new Error('Alert webhook requires HTTPS');
  const response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: 'cineviet', ...alert }) });
  if (!response.ok) throw new Error('Alert webhook rejected the notification');
  return { delivered: true };
}
module.exports = { notify };
