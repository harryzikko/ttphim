const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { summarizeRatings, upsertRating } = require('../src/services/ratingService');
const { removeTimestampPrefix } = require('../src/services/commentFormatting');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('ratings have honest empty state, latest unique votes and explicit scale conversion', () => {
  assert.equal(summarizeRatings([], 'film').score_10, null);
  const ratings = [
    { movie_slug:'film',user_id:'a',score:1,created_at:'2026-01-01' },
    { movie_slug:'film',user_id:'a',score:5,created_at:'2026-02-01' },
    { movie_slug:'film',user_id:'b',score:8,scale:10 },
    { movie_slug:'film',user_id:'anonymous',score:5 },
    { movie_slug:'other',user_id:'c',score:5 },
    { movie_slug:'film',user_id:'bad',score:'not-a-score' }
  ];
  const result = summarizeRatings(ratings,'film','a');
  assert.equal(result.total,2); assert.equal(result.score_10,9); assert.equal(result.avg,4.5);
  assert.equal(result.user_score,5); assert.deepEqual(result.distribution,{1:0,2:0,3:0,4:1,5:1});
  assert.equal(ratings.length,6);
});

test('rating updates replace duplicate votes for that account only and reject invalid stars', () => {
  const data={ratings:[]};
  upsertRating(data,{movie_slug:'film',user_id:'a',score:5});
  upsertRating(data,{movie_slug:'film',user_id:'b',score:3});
  const result=upsertRating(data,{movie_slug:'film',user_id:'a',score:1});
  assert.equal(data.ratings.length,2); assert.equal(result.score_10,4); assert.equal(result.total,2);
  for(const score of [0,6,1.5,NaN,'5']) assert.throws(()=>upsertRating(data,{movie_slug:'film',user_id:'a',score}));
});

test('legacy duplicate timestamp labels are stripped without stripping ordinary message text', () => {
  assert.equal(removeTimestampPrefix('[00:03] [00:03] hi','00:03'),'hi');
  assert.equal(removeTimestampPrefix('[01:03] hi','00:03'),'[01:03] hi');
  assert.equal(removeTimestampPrefix('hello [00:03]','00:03'),'hello [00:03]');
  assert.equal(removeTimestampPrefix('[00:03] hi',null),'[00:03] hi');
});

function fixture(api) {
  const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../public/chi-tiet.html'),'utf8'),{url:'http://localhost/phim/film',runScripts:'outside-only'});
  dom.window.API=api;
  dom.window.eval(fs.readFileSync(path.join(__dirname,'../public/js/movie-ratings.js'),'utf8'));
  dom.window.MovieRatings.mount({slug:'film',imdb:{id:'tt123'}});
  return dom;
}

test('rating UI renders true empty state, no default TMDb and no fictional counts', async () => {
  const dom=fixture({request:async()=>({status:true,data:summarizeRatings([],'film')}),rateMovie:async()=>({status:false})});
  try {
    await tick(); const doc=dom.window.document;
    assert.equal(doc.querySelector('[data-rating-score]').textContent,'—');
    assert.equal(doc.querySelector('[data-rating-count]').textContent,'Chưa có đánh giá');
    assert.equal(doc.querySelector('#movie-tmdb-status').textContent,'Chưa có dữ liệu');assert.equal(doc.querySelector('#movie-tmdb-score').hidden,true);assert.equal(doc.querySelector('#movie-imdb-score'),null);
    assert.ok([...doc.querySelectorAll('.rating-percent')].every(el=>el.textContent==='0%'));
    assert.equal(doc.querySelector('#movie-rating-buttons [aria-pressed="true"]'),null);
    assert.ok(!doc.querySelector('#movie-rating-card').textContent.includes('124.5k'));
  } finally { dom.window.close(); }
});

test('rating UI updates both score displays only after a successful save; failures leave buttons enabled', async () => {
  const data={ratings:[]};let fail=true;
  const dom=fixture({request:async()=>({status:true,data:summarizeRatings(data.ratings,'film','a')}),rateMovie:async(slug,score)=>fail?{status:false,message:'Vui lòng đăng nhập'}:{status:true,data:upsertRating(data,{movie_slug:slug,user_id:'a',score})}});
  try {
    await tick();const doc=dom.window.document;const button=doc.querySelector('[data-score="4"]');
    button.click();await tick();
    assert.ok(doc.querySelector('#movie-rating-status').textContent.includes('đăng nhập'));
    assert.equal(button.disabled,false);assert.equal(doc.querySelector('[data-rating-score]').textContent,'—');
    fail=false;button.click();await tick();
    assert.ok([...doc.querySelectorAll('[data-rating-score]')].every(el=>el.textContent==='8.0'));
    assert.equal(doc.querySelector('[data-rating-count]').textContent,'1 lượt bình chọn');
    assert.equal(button.getAttribute('aria-pressed'),'true');
    assert.equal(doc.querySelector('.rating-row:nth-child(2) .rating-percent').textContent,'100%');
  } finally { dom.window.close(); }
});

test('comment composer has no duplicate rating controls or rating payload', () => {
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../public/chi-tiet.html'), 'utf8'));
  try {
    const doc = dom.window.document;
    assert.equal(doc.querySelectorAll('#movie-rating-buttons button').length, 5);
    assert.equal(doc.querySelector('#detail-review-form [data-score], #detail-review-form [data-val], #comment-form-stars'), null);
    assert.ok(doc.querySelector('#detail-review-form textarea'));
    const controller = fs.readFileSync(path.join(__dirname, '../public/js/detail.js'), 'utf8');
    assert.ok(!controller.includes('selectedFormRating'));
    assert.ok(!controller.includes('rating:'));
  } finally { dom.window.close(); }
});
