'use strict';

function stars(record) {
  const score = Number(record.score);
  const scale = record.scale === 10 || (!record.scale && score > 5) ? 10 : 5;
  return Number.isFinite(score) && score >= 1 && score <= scale ? score * 5 / scale : null;
}
function summarizeRatings(records = [], movieSlug, userId = null) {
  const latest = new Map();
  for (const record of records) {
    if (record.movie_slug !== movieSlug || !record.user_id || record.user_id === 'anonymous' || stars(record) === null) continue;
    const previous = latest.get(record.user_id);
    const time = value => Date.parse(value.updated_at || value.created_at || '') || 0;
    if (!previous || time(record) > time(previous)) latest.set(record.user_id, record);
  }
  const values = [...latest.values()].map(stars);
  const count = values.length;
  const average = count ? values.reduce((sum, score) => sum + score, 0) / count : null;
  const distribution = Object.fromEntries([5, 4, 3, 2, 1].map(score => [score, values.filter(value => Math.round(value) === score).length]));
  return { scale: 5, total: count, avg: average === null ? null : Number(average.toFixed(2)),
    score_10: average === null ? null : Number((average * 2).toFixed(1)), distribution,
    user_score: latest.has(userId) ? stars(latest.get(userId)) : null };
}
function upsertRating(data, { movie_slug, user_id, score }) {
  if (!Number.isInteger(score) || score < 1 || score > 5 || !user_id || !movie_slug) throw new Error('Rating must be an integer between 1 and 5');
  data.ratings = (data.ratings || []).filter(record => !(record.movie_slug === movie_slug && record.user_id === user_id));
  data.ratings.unshift({ id: 'rate_' + require('crypto').randomUUID(), movie_slug, user_id, score, scale: 5, created_at: new Date().toISOString() });
  return { score, ...summarizeRatings(data.ratings, movie_slug, user_id) };
}
module.exports = { summarizeRatings, upsertRating };
