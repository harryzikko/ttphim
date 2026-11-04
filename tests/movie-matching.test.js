'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  removeAccents,
  cleanTitle,
  extractTmdbId,
  extractSeasonIdentifier,
  isAnime,
  isSeriesFormat,
  isSingleFormat,
  isCompatibleMovie
} = require('../src/services/movieMatching');

test('extractSeasonIdentifier accurately detects season from diverse string patterns', () => {
  assert.equal(extractSeasonIdentifier({ name: 'Đấu Phá Thương Khung (Phần 5)' }), 'season_5');
  assert.equal(extractSeasonIdentifier({ name: 'Loki (Season 2)' }), 'season_2');
  assert.equal(extractSeasonIdentifier({ name: 'Stranger Things: Part 4' }), 'season_4');
  assert.equal(extractSeasonIdentifier({ name: 'Đấu Phá Thương Khung 5' }), 'season_5');
  assert.equal(extractSeasonIdentifier({ slug: 'dau-pha-thuong-khung-5' }), 'season_5');
  assert.equal(extractSeasonIdentifier({ slug: 'loki-phan-2' }), 'season_2');
  assert.equal(extractSeasonIdentifier({ name: 'Đấu Phá Thương Khung Bản Đặc Biệt 1' }), 'special_1');
  assert.equal(extractSeasonIdentifier({ name: 'Thử Thách Thần Tượng', origin_name: 'Running Man' }), 'season_none');
  assert.equal(extractSeasonIdentifier({ name: 'Danh Ca Đại Chiến', origin_name: 'Running Man 2013' }), 'season_none');
});

test('Running Man (Thử Thách Thần Tượng) is never merged with Danh Ca Đại Chiến (Running Man 2013)', () => {
  const runningManShow = {
    name: 'Thử Thách Thần Tượng',
    origin_name: 'Running Man',
    type: 'tvshows',
    year: 2010,
    episode_total: '1000',
    episode_current: 'Tập 824',
    episodes: [{ server_name: 'Vietsub', server_data: Array(824).fill({ name: '1' }) }]
  };

  const danhCaDaiChienMovie = {
    name: 'Danh Ca Đại Chiến',
    original_name: 'Running Man 2013',
    origin_name: 'Running Man 2013',
    type: 'single',
    year: 2012,
    total_episodes: 1,
    current_episode: 'FULL',
    episodes: [{ server_name: 'NC', items: [{ name: 'Full' }] }]
  };

  assert.equal(
    isCompatibleMovie(runningManShow, danhCaDaiChienMovie),
    false,
    'Running Man TV Show (824 eps) must NEVER merge with Danh Ca Đại Chiến single movie'
  );
  assert.equal(
    isCompatibleMovie(danhCaDaiChienMovie, runningManShow),
    false,
    'Symmetric check: single movie must not merge with TV show'
  );
});

test('Remakes across distant release years are not merged together', () => {
  const tronChay1987 = {
    name: 'Trốn Chạy Tử Thần',
    origin_name: 'The Running Man',
    type: 'single',
    year: 1987
  };

  const tronChay2025 = {
    name: 'Trốn Chạy Tử Thần',
    origin_name: 'The Running Man',
    type: 'single',
    year: 2025
  };

  assert.equal(
    isCompatibleMovie(tronChay2025, tronChay1987),
    false,
    'The 2025 remake must not merge with the 1987 classic'
  );
});

test('Distinct numbered seasons are strictly isolated', () => {
  const season1 = {
    name: 'Đấu Phá Thương Khung (Phần 1)',
    slug: 'dau-pha-thuong-khung-phan-1',
    year: 2017,
    type: 'hoathinh'
  };

  const season5 = {
    name: 'Đấu Phá Thương Khung (Phần 5)',
    slug: 'dau-pha-thuong-khung-phan-5',
    year: 2022,
    type: 'hoathinh'
  };

  const season5NguonC = {
    name: 'Đấu Phá Thương Khung 5',
    slug: 'dau-pha-thuong-khung-5',
    year: 2022,
    type: 'hoathinh'
  };

  assert.equal(isCompatibleMovie(season5, season1), false, 'Phần 5 must not merge with Phần 1');
  assert.equal(isCompatibleMovie(season5, season5NguonC), true, 'Phần 5 from KKPhim must match Phần 5 from NguonC');
});

test('Anime and Live-Action adaptations remain isolated', () => {
  const anime = {
    name: 'Đảo Hải Tặc',
    origin_name: 'One Piece',
    type: 'hoathinh',
    year: 1999
  };

  const liveAction = {
    name: 'Đảo Hải Tặc (Live Action)',
    origin_name: 'One Piece (Live Action)',
    type: 'series',
    year: 2023
  };

  assert.equal(isCompatibleMovie(anime, liveAction), false, 'Anime and live action must not merge');
});

test('Multi-episode series is protected against 1-episode FULL placeholder takeover', () => {
  const targetSeries = {
    name: 'Võ Thần Chúa Tể',
    type: 'hoathinh',
    episode_total: '500',
    episode_current: 'Tập 460',
    year: 2020
  };

  const candidateTrailerOrSingle = {
    name: 'Võ Thần Chúa Tể',
    type: 'single',
    total_episodes: 1,
    current_episode: 'FULL',
    year: 2020
  };

  assert.equal(
    isCompatibleMovie(targetSeries, candidateTrailerOrSingle),
    false,
    '500-episode series must not merge with 1-episode FULL placeholder'
  );
});
