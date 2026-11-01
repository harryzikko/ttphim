const test = require('node:test');
const assert = require('node:assert/strict');
const movieReactionService = require('../src/services/movieReactionService');
const dbService = require('../src/services/dbService');

test('Movie Reactions Service - basic toggle and count lifecycle', async (t) => {
  const testSlug = 'test-reaction-movie-' + Date.now();
  const testUser = 'user-react-' + Date.now();
  const fakeDb = { movie_reactions: [] };

  // Initial state should be all zeros
  const initial = movieReactionService.summarizeReactions(fakeDb.movie_reactions, testSlug, testUser);
  assert.equal(initial.total, 0);
  assert.equal(initial.user_reaction, null);
  assert.equal(initial.counts.fire, 0);

  // User reacts with 'fire'
  const step1 = movieReactionService.toggleReaction(fakeDb, {
    movie_slug: testSlug,
    user_id: testUser,
    reaction: 'fire'
  });
  assert.equal(step1.user_reaction, 'fire');
  assert.equal(step1.counts.fire, 1);
  assert.equal(step1.total, 1);

  // User toggles 'fire' again -> should remove reaction
  const step2 = movieReactionService.toggleReaction(fakeDb, {
    movie_slug: testSlug,
    user_id: testUser,
    reaction: 'fire'
  });
  assert.equal(step2.user_reaction, null);
  assert.equal(step2.counts.fire, 0);
  assert.equal(step2.total, 0);

  // User reacts with 'heart'
  const step3 = movieReactionService.toggleReaction(fakeDb, {
    movie_slug: testSlug,
    user_id: testUser,
    reaction: 'heart'
  });
  assert.equal(step3.user_reaction, 'heart');
  assert.equal(step3.counts.heart, 1);
  assert.equal(step3.total, 1);

  // User switches from 'heart' to 'shock'
  const step4 = movieReactionService.toggleReaction(fakeDb, {
    movie_slug: testSlug,
    user_id: testUser,
    reaction: 'shock'
  });
  assert.equal(step4.user_reaction, 'shock');
  assert.equal(step4.counts.heart, 0);
  assert.equal(step4.counts.shock, 1);
  assert.equal(step4.total, 1);

  // Another user reacts with 'fire'
  const otherUser = 'other-user-' + Date.now();
  const step5 = movieReactionService.toggleReaction(fakeDb, {
    movie_slug: testSlug,
    user_id: otherUser,
    reaction: 'fire'
  });
  assert.equal(step5.user_reaction, 'fire');
  assert.equal(step5.counts.shock, 1);
  assert.equal(step5.counts.fire, 1);
  assert.equal(step5.total, 2);

  // Re-fetch state for first user
  const user1State = movieReactionService.summarizeReactions(fakeDb.movie_reactions, testSlug, testUser);
  assert.equal(user1State.user_reaction, 'shock');
  assert.equal(user1State.total, 2);

  // Invalid reaction rejected
  assert.throws(
    () => {
      movieReactionService.toggleReaction(fakeDb, {
        movie_slug: testSlug,
        user_id: testUser,
        reaction: 'invalid_emoji'
      });
    },
    /Cảm xúc không hợp lệ/
  );
});

test('dbService delegates movie reactions accurately', async (t) => {
  const slug = 'test-db-reaction-' + Date.now();
  const user = 'test-user-db-' + Date.now();

  const data = await dbService.getMovieReactions(slug, user);
  assert.equal(typeof data.counts, 'object');
  assert.equal(data.total, 0);

  const updated = await dbService.toggleMovieReaction(user, slug, 'laugh');
  assert.equal(updated.user_reaction, 'laugh');
  assert.equal(updated.counts.laugh, 1);

  const refreshed = await dbService.getMovieReactions(slug, user);
  assert.equal(refreshed.user_reaction, 'laugh');
  assert.equal(refreshed.counts.laugh, 1);
});
