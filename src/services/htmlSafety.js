function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function safeImageUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value, 'https://local.invalid');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    if (value.startsWith('/') && !value.startsWith('//')) return value;
    return /^https?:\/\//i.test(value) ? value : '';
  } catch {
    return '';
  }
}

function safeComment(comment) {
  return {
    ...comment,
    content: escapeHtml(comment.content),
    user_name: escapeHtml(comment.user_name),
    user_avatar: escapeHtml(safeImageUrl(comment.user_avatar)),
    timestamp_tag: escapeHtml(comment.timestamp_tag),
    created_at: escapeHtml(comment.created_at),
    rating: comment.rating == null ? null : Math.min(5, Math.max(1, Number.parseInt(comment.rating, 10) || 1)),
    likes: Math.max(0, Number(comment.likes) || 0),
    replies: (comment.replies || []).map(safeComment)
  };
}

module.exports = { escapeHtml, safeImageUrl, safeComment };
