function validateDatabase(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid database object');
  for (const field of ['users', 'watchlist', 'history', 'comments']) {
    if (!Array.isArray(data[field])) throw new Error(`Missing database array: ${field}`);
  }
  const ids = new Set();
  for (const user of data.users) {
    if (!user || typeof user.id !== 'string' || !user.id || ids.has(user.id) ||
        typeof user.email !== 'string' || typeof user.password !== 'string' ||
        (user.token_version != null && (!Number.isSafeInteger(user.token_version) || user.token_version < 0))) {
      throw new Error('Invalid or duplicate user');
    }
    ids.add(user.id);
  }
  return data;
}
module.exports = { validateDatabase };
