const db = require('./dbService');
const crypto = require('crypto');
const sessionEvents = require('./sessionEvents');

function audit(data, actorId, action, targetId, detail = {}) {
  data.audit_log ||= [];
  data.audit_log.unshift({ id: crypto.randomUUID(), actor_id: actorId, action, target_id: String(targetId).slice(0, 200),
    detail, created_at: new Date().toISOString() });
  data.audit_log = data.audit_log.slice(0, 5000);
}
function findComment(data, id) {
  for (const parent of data.comments || []) {
    if (parent.id === id) return parent;
    const reply = (parent.replies || []).find(item => item.id === id);
    if (reply) return reply;
  }
  return null;
}
function text(value, max = 500) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw Object.assign(new Error('Invalid reason'), { status: 400 });
  return value.trim();
}
async function reportComment(user, id, reason) {
  reason = text(reason);
  return db.mutate(data => {
    if (!findComment(data, id)) throw Object.assign(new Error('Comment not found'), { status: 404 });
    data.comment_reports ||= [];
    const duplicate = data.comment_reports.find(item => item.user_id === user.id && item.comment_id === id && item.status === 'pending');
    if (duplicate) return { id: duplicate.id, duplicate: true };
    const report = { id: crypto.randomUUID(), user_id: user.id, comment_id: id, reason, status: 'pending', created_at: new Date().toISOString() };
    data.comment_reports.unshift(report);
    data.comment_reports = data.comment_reports.slice(0, 2000);
    return { id: report.id, duplicate: false };
  });
}
async function setVisibility(actor, id, hidden, reason) {
  if (typeof hidden !== 'boolean') throw Object.assign(new Error('hidden must be boolean'), { status: 400 });
  reason = text(reason);
  return db.mutate(data => {
    const comment = findComment(data, id);
    if (!comment) throw Object.assign(new Error('Comment not found'), { status: 404 });
    comment.hidden = hidden;
    comment.moderated_at = new Date().toISOString();
    audit(data, actor.id, hidden ? 'comment.hide' : 'comment.restore', id, { reason });
    for (const report of data.comment_reports || []) if (report.comment_id === id && report.status === 'pending') report.status = 'resolved';
    return { id, hidden };
  });
}
async function setBlocked(actor, id, blocked, reason) {
  if (typeof blocked !== 'boolean') throw Object.assign(new Error('blocked must be boolean'), { status: 400 });
  reason = text(reason);
  const result = await db.mutate(data => {
    const user = data.users.find(item => item.id === id);
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
    if (actor.id === id && blocked) throw Object.assign(new Error('Cannot block your own account'), { status: 400 });
    if (user.role === 'admin' && blocked && data.users.filter(item => item.role === 'admin' && !item.blocked).length <= 1) {
      throw Object.assign(new Error('Cannot block the last active administrator'), { status: 400 });
    }
    user.blocked = blocked;
    user.token_version = (user.token_version || 0) + 1;
    data.sessions = (data.sessions || []).filter(item => item.user_id !== id);
    audit(data, actor.id, blocked ? 'user.block' : 'user.unblock', id, { reason });
    return { id, blocked };
  });
  sessionEvents.emit('revoked', id);
  return result;
}
async function overview() {
  const data = await db.getRawDatabase();
  return { reports: (data.comment_reports || []).slice(0, 200),
    comments: (data.comments || []).slice(0, 200).map(item => ({ id: item.id, movie_slug: item.movie_slug, user_name: item.user_name, content: item.content, hidden: !!item.hidden,
      replies: (item.replies || []).map(reply => ({ id: reply.id, content: reply.content, hidden: !!reply.hidden })) })),
    users: data.users.map(user => ({ id: user.id, name: user.name, email: user.email, role: user.role, blocked: !!user.blocked })),
    audit: (data.audit_log || []).slice(0, 200) };
}
module.exports = { audit, reportComment, setVisibility, setBlocked, overview };
