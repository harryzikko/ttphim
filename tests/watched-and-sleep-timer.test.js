'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/services/dbService');

test('saveHistory accumulates watched_episodes when progress is >= 85%', async () => {
  const userId = 'test_user_watched_' + Date.now();
  const movieSlug = 'phim-test-watched';

  // Watch episode 1 with 30% -> not yet in watched_episodes
  await db.saveHistory(userId, {
    movie_slug: movieSlug,
    movie_name: 'Phim Test',
    episode_slug: 'tap-1',
    current_time: 300,
    duration: 1000
  });

  let history = await db.getHistory(userId);
  let record = history.find(h => h.movie_slug === movieSlug);
  assert.ok(record, 'Record should exist in history');
  assert.equal(record.progress_percent, 30);
  assert.deepEqual(record.watched_episodes, []);

  // Watch episode 1 to 90% -> should be added to watched_episodes
  await db.saveHistory(userId, {
    movie_slug: movieSlug,
    movie_name: 'Phim Test',
    episode_slug: 'tap-1',
    current_time: 900,
    duration: 1000
  });

  history = await db.getHistory(userId);
  record = history.find(h => h.movie_slug === movieSlug);
  assert.equal(record.progress_percent, 90);
  assert.ok(record.watched_episodes.includes('tap-1'), 'tap-1 should be marked watched');

  // Watch episode 2 to 95% -> watched_episodes should contain both tap-1 and tap-2
  await db.saveHistory(userId, {
    movie_slug: movieSlug,
    movie_name: 'Phim Test',
    episode_slug: 'tap-2',
    current_time: 950,
    duration: 1000
  });

  history = await db.getHistory(userId);
  record = history.find(h => h.movie_slug === movieSlug);
  assert.ok(record.watched_episodes.includes('tap-1'));
  assert.ok(record.watched_episodes.includes('tap-2'));
  assert.equal(record.watched_episodes.length, 2);

  // Clean up
  await db.clearHistory(userId);
});
