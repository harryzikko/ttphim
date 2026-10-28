'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const seasonService = require('../src/services/seasonService');
const kkphimService = require('../src/services/kkphimService');

test('extractFranchiseName strips season suffixes and numbers', () => {
  assert.equal(seasonService.extractFranchiseName('Đấu Phá Thương Khung (Phần 5)'), 'Đấu Phá Thương Khung');
  assert.equal(seasonService.extractFranchiseName('Loki (Phần 2)'), 'Loki');
  assert.equal(seasonService.extractFranchiseName('Stranger Things: Season 4'), 'Stranger Things');
  assert.equal(seasonService.extractFranchiseName('Thế Giới Hoàn Mỹ'), 'Thế Giới Hoàn Mỹ');
  assert.equal(seasonService.extractFranchiseName('Đấu Phá Thương Khung 2: Ngừng Chiến'), 'Đấu Phá Thương Khung');
  assert.equal(seasonService.extractFranchiseName('Đảo Hải Tặc (Live Action) (Phần 1)'), 'Đảo Hải Tặc (Live Action)');
});

test('extractSeasonNumber detects season number or special editions', () => {
  assert.equal(seasonService.extractSeasonNumber('Đấu Phá Thương Khung (Phần 5)'), 5);
  assert.equal(seasonService.extractSeasonNumber('Loki (Phần 2)'), 2);
  assert.equal(seasonService.extractSeasonNumber('Đấu Phá Thương Khung 3: Trừ Gian Diệt Ác'), 3);
  assert.equal(seasonService.extractSeasonNumber('Đấu Phá Thương Khung Bản Đặc Biệt 1'), 100);
  assert.equal(seasonService.extractSeasonNumber('Đấu Phá Thương Khung'), 1);
});

test('formatSeasonLabel produces human-friendly season label with year', () => {
  const item1 = { name: 'Đấu Phá Thương Khung', season_number: 1, year: 2018 };
  assert.equal(seasonService.formatSeasonLabel(item1), 'Phần 1 (2018)');

  const item2 = { name: 'Đấu Phá Thương Khung 2: Ngừng Chiến', season_number: 2, year: 2023 };
  assert.equal(seasonService.formatSeasonLabel(item2), 'Phần 2: Ngừng Chiến (2023)');

  const itemSpecial = { name: 'Đấu Phá Thương Khung Bản Đặc Biệt 1 (Định Mệnh)', season_number: 100, year: 2017 };
  assert.equal(seasonService.formatSeasonLabel(itemSpecial), 'Đấu Phá Thương Khung Bản Đặc Biệt 1 (Định Mệnh) (2017)');
});

test('isAnime and isLiveAction strictly separate anime from live-action adaptations', () => {
  // Live action movie/series should not be classified as anime
  assert.equal(seasonService.isAnime({ name: 'Đảo Hải Tặc (Live Action) (Phần 1)', type: 'series' }), false);
  assert.equal(seasonService.isAnime({ name: 'Đấu Phá Thương Khung', type: 'series', category: [{ slug: 'hanh-dong' }] }), false);
  assert.equal(seasonService.isLiveAction('Đảo Hải Tặc (Live Action) (Phần 1)'), true);
  assert.equal(seasonService.isLiveAction('Đảo Hải Tặc (1999)'), false);

  // Anime / Hoạt hình detection
  assert.equal(seasonService.isAnime({ name: 'Đảo Hải Tặc', type: 'hoathinh' }), true);
  assert.equal(seasonService.isAnime({ name: 'Thanh Gươm Diệt Quỷ (Phần 1)', type: 'series', country: [{ slug: 'nhat-ban' }], origin_name: 'Demon Slayer (Season 1)' }), true);
  assert.equal(seasonService.isAnime({ name: 'Đấu Phá Thương Khung (Phần 5)', type: 'hoathinh' }), true);
  assert.equal(seasonService.isAnime({ name: 'Đấu Phá Thương Khung Bản Đặc Biệt 1', type: 'series' }), true);
});

test('isSeries distinguishes episodic series from single standalone movies', () => {
  assert.equal(seasonService.isSeries({ type: 'series' }), true);
  assert.equal(seasonService.isSeries({ type: 'tvshows' }), true);
  assert.equal(seasonService.isSeries({ type: 'hoathinh', episode_current: 'Hoàn Tất (12/12)' }), true);
  assert.equal(seasonService.isSeries({ type: 'hoathinh', episode_current: 'Tập 50' }), true);

  assert.equal(seasonService.isSeries({ type: 'single' }), false);
  assert.equal(seasonService.isSeries({ type: 'hoathinh', episode_current: 'Full' }), false);
});

test('hasCompatibleCountry prevents foreign movies with same translated name from merging', () => {
  const vnMovie = { country: [{ slug: 'viet-nam' }] };
  const caMovie = { country: [{ slug: 'canada' }, { slug: 'au-my' }] };
  const vnMovie2 = { country: [{ slug: 'viet-nam' }] };
  const otherCountryMovie = { country: [{ slug: 'quoc-gia-khac' }] };

  assert.equal(seasonService.hasCompatibleCountry(vnMovie, caMovie), false);
  assert.equal(seasonService.hasCompatibleCountry(vnMovie, vnMovie2), true);
  assert.equal(seasonService.hasCompatibleCountry(vnMovie, otherCountryMovie), true);
});

test('kkphimService.isSameMovie isolates distinct seasons and prevents deduplication loss', () => {
  const part1 = {
    name: 'Đấu Phá Thương Khung (Phần 1)',
    slug: 'dau-pha-thuong-khung-phan-1',
    year: '2017',
    type: 'hoathinh'
  };
  const part2 = {
    name: 'Đấu Phá Thương Khung (Phần 2)',
    slug: 'dau-pha-thuong-khung-phan-2',
    year: '2018',
    type: 'hoathinh'
  };
  const part4 = {
    name: 'Đấu Phá Thương Khung (Phần 4)',
    slug: 'dau-pha-thuong-khung-phan-4',
    year: '2021',
    type: 'hoathinh'
  };
  const part5 = {
    name: 'Đấu Phá Thương Khung (Phần 5)',
    slug: 'dau-pha-thuong-khung-phan-5',
    year: '2022',
    type: 'hoathinh'
  };

  // Adjacent year sequels must never be considered duplicates
  assert.equal(kkphimService.isSameMovie(part1, part2), false, 'Part 1 and Part 2 must not be merged');
  assert.equal(kkphimService.isSameMovie(part4, part5), false, 'Part 4 and Part 5 must not be merged');

  // Anime vs live action isolation
  const liveAction = {
    name: 'Đảo Hải Tặc',
    slug: 'dao-hai-tac-live-action',
    year: '2023',
    type: 'series'
  };
  const anime = {
    name: 'Đảo Hải Tặc',
    slug: 'dao-hai-tac',
    year: '1999',
    type: 'hoathinh'
  };
  assert.equal(kkphimService.isSameMovie(liveAction, anime), false, 'Live-action and anime must not be merged');
});

test('getFranchiseSeasons finds all 5 parts for Đấu Phá Thương Khung', async () => {
  const seasons = await seasonService.getFranchiseSeasons('dau-pha-thuong-khung-phan-5');
  assert.ok(seasons.length >= 5, 'Should find at least 5 main parts');

  const slugs = seasons.map(s => s.slug);
  assert.ok(slugs.includes('dau-pha-thuong-khung-phan-1'), 'Phần 1 must be present');
  assert.ok(slugs.includes('dau-pha-thuong-khung-phan-2'), 'Phần 2 must be present');
  assert.ok(slugs.includes('dau-pha-thuong-khung-phan-3'), 'Phần 3 must be present');
  assert.ok(slugs.includes('dau-pha-thuong-khung-phan-4'), 'Phần 4 must be present');
  assert.ok(slugs.includes('dau-pha-thuong-khung-phan-5'), 'Phần 5 must be present');
});

