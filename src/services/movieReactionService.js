'use strict';

const VALID_REACTIONS = ['fire', 'heart', 'laugh', 'cry', 'shock'];

const REACTION_LABELS = {
  fire: { emoji: '🔥', label: 'Siêu phẩm' },
  heart: { emoji: '❤️', label: 'Quá hay' },
  laugh: { emoji: '😂', label: 'Hài hước' },
  cry: { emoji: '😢', label: 'Cảm động' },
  shock: { emoji: '😱', label: 'Kịch tính' }
};

function summarizeReactions(records = [], movieSlug, userId = null) {
  const latest = new Map();
  for (const record of records) {
    if (record.movie_slug !== movieSlug || !record.user_id || !VALID_REACTIONS.includes(record.reaction)) continue;
    const previous = latest.get(record.user_id);
    const time = value => Date.parse(value.created_at || '') || 0;
    if (!previous || time(record) > time(previous)) {
      latest.set(record.user_id, record);
    }
  }

  const counts = { fire: 0, heart: 0, laugh: 0, cry: 0, shock: 0 };
  for (const item of latest.values()) {
    if (counts[item.reaction] !== undefined) {
      counts[item.reaction]++;
    }
  }

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const userReaction = userId && latest.has(userId) ? latest.get(userId).reaction : null;

  return {
    total,
    counts,
    user_reaction: userReaction,
    labels: REACTION_LABELS
  };
}

function toggleReaction(data, { movie_slug, user_id, reaction }) {
  if (!VALID_REACTIONS.includes(reaction)) {
    throw Object.assign(new Error('Cảm xúc không hợp lệ. Chọn: fire, heart, laugh, cry, shock'), { status: 400 });
  }
  if (!movie_slug || !user_id) {
    throw Object.assign(new Error('Thiếu thông tin người dùng hoặc phim'), { status: 400 });
  }

  if (!data.movie_reactions) data.movie_reactions = [];

  const existingIndex = data.movie_reactions.findIndex(
    r => r.movie_slug === movie_slug && r.user_id === user_id
  );

  let newReaction = reaction;
  if (existingIndex >= 0) {
    const existing = data.movie_reactions[existingIndex];
    if (existing.reaction === reaction) {
      // Toggle off
      data.movie_reactions.splice(existingIndex, 1);
      newReaction = null;
    } else {
      // Change reaction
      existing.reaction = reaction;
      existing.created_at = new Date().toISOString();
    }
  } else {
    data.movie_reactions.unshift({
      id: 'react_' + require('crypto').randomUUID(),
      movie_slug,
      user_id,
      reaction,
      created_at: new Date().toISOString()
    });
  }

  return summarizeReactions(data.movie_reactions, movie_slug, user_id);
}

module.exports = {
  VALID_REACTIONS,
  REACTION_LABELS,
  summarizeReactions,
  toggleReaction
};
