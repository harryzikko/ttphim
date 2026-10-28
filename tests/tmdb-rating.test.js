const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {TmdbService,ratingReference}=require('../src/services/tmdbService');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('TMDb identity uses only explicit valid IDs and known movie/tv media types',async()=>{
  assert.deepEqual(ratingReference({tmdb:{id:'550',type:'movie'},type:'series'}),{id:550,mediaType:'movie'});
  assert.deepEqual(ratingReference({tmdb_id:1399,type:'series'}),{id:1399,mediaType:'tv'});
  assert.deepEqual(ratingReference({tmdbId:'550',tmdb_type:'movie'}),{id:550,mediaType:'movie'});
  const service=new TmdbService();let calls=0;service.fetchTmdb=async()=>{calls++;};
  for(const movie of [{name:'Do not search by name',imdb:{id:'tt123',rating:9}},{tmdb:{id:'../movie/1',type:'movie'}},{tmdb:{id:0,type:'tv'}},{tmdb:{id:5,type:'person'}},{tmdb:{id:5},type:'hoathinh'},{tmdb:{id:Number.MAX_SAFE_INTEGER+1,type:'movie'}}]){
    const result=await service.getMovieRating(movie);assert.equal(result.tmdb_id,null);assert.equal(result.score_10,null);
  }
  assert.equal(calls,0);
});
test('TMDb rating reads exact ID/type, caches and coalesces lookups without mixing movie/tv IDs',async()=>{
  const service=new TmdbService(),calls=[];service.fetchTmdb=async endpoint=>{calls.push(endpoint);await tick();return{id:910000001,vote_average:endpoint.startsWith('/tv')?7.4:8.125,vote_count:125};};
  const movie={tmdb:{id:910000001,type:'movie'}};
  const [a,b]=await Promise.all([service.getMovieRating(movie),service.getMovieRating(movie)]);
  assert.equal(a.score_10,8.125);assert.equal(b.vote_count,125);assert.equal(calls.length,1);a.score_10=1;
  assert.equal((await service.getMovieRating(movie)).score_10,8.125);
  const tv=await service.getMovieRating({tmdb:{id:910000001,type:'tv'}});assert.equal(tv.score_10,7.4);assert.equal(tv.url,'https://www.themoviedb.org/tv/910000001');assert.deepEqual(calls,['/movie/910000001','/tv/910000001']);
});
test('TMDb zero votes are unrated and malformed/outage results are not cached as scores',async()=>{
  const service=new TmdbService();service.fetchTmdb=async()=>({id:910000002,vote_average:0,vote_count:0});
  const unrated=await service.getMovieRating({tmdb:{id:910000002,type:'movie'}});assert.equal(unrated.score_10,null);assert.equal(unrated.vote_count,0);
  const movie={tmdb:{id:910000003,type:'movie'}};
  for(const response of [null,{id:1,vote_average:8,vote_count:10},{id:910000003,vote_average:11,vote_count:10},{id:910000003,vote_average:'8',vote_count:10},{id:910000003,vote_average:8,vote_count:-1}]){
    service.fetchTmdb=async()=>response;await assert.rejects(service.getMovieRating(movie),{statusCode:502});
  }
  service.fetchTmdb=async()=>({id:910000003,vote_average:6.5,vote_count:2});assert.equal((await service.getMovieRating(movie)).score_10,6.5);
});
function frontend(movie,external){
  const dom=new JSDOM(read('public/chi-tiet.html'),{url:'http://localhost/phim/film',runScripts:'outside-only'}),w=dom.window;const calls=[];
  w.eval(read('public/js/movie-ratings.js'));
  const api={request:async url=>{calls.push(url);return url.endsWith('/tmdb-rating')?external():{status:true,data:{total:0,score_10:null,distribution:{}}};},rateMovie:async()=>({status:false})};
  w.MovieRatings.mount(movie,api);return{dom,w,doc:w.document,calls,api};
}
const rating={source:'tmdb',tmdb_id:550,media_type:'movie',score_10:8.125,vote_count:1234};
test('TMDb UI is separate from website votes, shows real score/count and safe canonical link',async()=>{
  const h=frontend({slug:'film',tmdb:{id:550,type:'movie'},imdb:{rating:9.9}},()=>({status:true,data:{...rating,url:'javascript:alert(1)'}}));
  try{await tick();assert.equal(h.doc.querySelector('.tmdb-label').textContent,'TMDb');const link=h.doc.getElementById('movie-tmdb-score');assert.equal(link.textContent,'8.1/10');assert.equal(link.href,'https://www.themoviedb.org/movie/550');assert.equal(link.hidden,false);assert.ok(h.doc.getElementById('movie-tmdb-status').textContent.includes('1.234'));assert.equal(h.doc.querySelector('[data-rating-score]').textContent,'—');assert.equal(h.doc.querySelector('.imdb-label'),null);}finally{h.w.close();}
});
test('TMDb UI distinguishes missing ID, unrated and retryable errors, never uses IMDb value',async()=>{
  const missing=frontend({slug:'film',imdb:{rating:9.9}},()=>assert.fail('missing TMDb ID must not fetch'));
  try{await tick();assert.equal(missing.calls.some(url=>url.endsWith('tmdb-rating')),false);assert.equal(missing.doc.getElementById('movie-tmdb-status').textContent,'Chưa có dữ liệu');assert.equal(missing.doc.getElementById('movie-tmdb-score').hidden,true);}finally{missing.w.close();}
  let mode='error';const h=frontend({slug:'film',tmdb:{id:550,type:'movie'}},()=>mode==='error'?{status:false}:{status:true,data:{...rating,score_10:null,vote_count:0}});
  try{await tick();assert.equal(h.doc.getElementById('movie-tmdb-retry').hidden,false);mode='unrated';h.doc.getElementById('movie-tmdb-retry').click();await tick();assert.equal(h.doc.getElementById('movie-tmdb-status').textContent,'Chưa có đánh giá');assert.equal(h.doc.getElementById('movie-tmdb-score').hidden,true);assert.equal(h.doc.getElementById('movie-tmdb-retry').hidden,true);}finally{h.w.close();}
});
test('late TMDb response cannot overwrite a different mounted movie',async()=>{
  let release;const pending=new Promise(resolve=>{release=resolve;});const h=frontend({slug:'old',tmdb:{id:550,type:'movie'}},()=>pending);
  try{await tick();h.w.MovieRatings.mount({slug:'new',tmdb:{id:551,type:'tv'}},{...h.api,request:async url=>url.endsWith('tmdb-rating')?{status:true,data:{...rating,tmdb_id:551,media_type:'tv',score_10:7.5}}:{status:true,data:{total:0,distribution:{}}}});await tick();release({status:true,data:rating});await tick();assert.equal(h.doc.getElementById('movie-tmdb-score').textContent,'7.5/10');assert.equal(h.doc.getElementById('movie-tmdb-score').href,'https://www.themoviedb.org/tv/551');}finally{h.w.close();}
});
