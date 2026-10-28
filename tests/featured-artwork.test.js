const {test}=require('node:test');
const assert=require('node:assert/strict');
const {TmdbService}=require('../src/services/tmdbService');
const {createFeaturedArtwork}=require('../src/services/featuredArtwork');
const banners=require('../src/services/bannerService');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const image=(file,width,height,extra={})=>({file_path:file,width,height,iso_639_1:null,...extra});
const identity=(id,type='movie')=>({tmdb:{id,type}});

test('featured artwork selects sharp original backdrops/posters from exact TMDb ID with responsive sizes',async()=>{
  const service=new TmdbService(),calls=[];
  service.fetchTmdb=async(endpoint,params,options)=>{calls.push([endpoint,params,options]);return{id:820000001,backdrops:[image('/small.jpg',1280,720),image('/best.jpg',3840,2160),image('/text.jpg',3840,2160,{iso_639_1:'en'}),image('/../../bad.jpg',8000,4500),image('/portrait.jpg',6000,9000)],posters:[image('/poster-small.jpg',500,750),image('/poster.jpg',2000,3000)]};};
  const result=await service.getMovieArtwork(identity(820000001));
  assert.equal(calls[0][0],'/movie/820000001/images');assert.equal(calls[0][2].timeoutMs,2500);
  assert.equal(result.backdrop.url,'https://image.tmdb.org/t/p/original/best.jpg');assert.equal(result.backdrop.width,3840);
  assert.match(result.backdrop.srcset,/w780\/best.jpg 780w/);assert.match(result.backdrop.srcset,/original\/best.jpg 3840w/);
  assert.equal(result.poster.url,'https://image.tmdb.org/t/p/original/poster.jpg');
});
test('artwork coalesces/cache requests per ID and media type, missing IDs never search by name',async()=>{
  const service=new TmdbService(),calls=[];
  service.fetchTmdb=async endpoint=>{calls.push(endpoint);await tick();return{id:820000002,backdrops:[image(endpoint.startsWith('/tv')?'/tv.jpg':'/movie.jpg',1920,1080)],posters:[]};};
  await Promise.all([service.getMovieArtwork(identity(820000002)),service.getMovieArtwork(identity(820000002))]);await service.getMovieArtwork(identity(820000002));
  assert.equal(calls.length,1);assert.equal((await service.getMovieArtwork(identity(820000002,'tv'))).backdrop.url,'https://image.tmdb.org/t/p/original/tv.jpg');assert.equal(calls.length,2);
  assert.equal(await service.getMovieArtwork({name:'Unverified matching title'}),null);assert.equal(calls.length,2);
});
test('confirmed absent images are empty, mismatched responses and unavailable TMDb cannot invent images',async()=>{
  const service=new TmdbService();service.fetchTmdb=async()=>({id:820000003,backdrops:[],posters:[]});
  const absent=await service.getMovieArtwork(identity(820000003));assert.equal(absent.backdrop,null);assert.equal(absent.poster,null);
  service.fetchTmdb=async()=>({id:1,backdrops:[image('/wrong.jpg',3840,2160)],posters:[]});await assert.rejects(service.getMovieArtwork(identity(820000004)));
  service.fetchTmdb=async()=>null;await assert.rejects(service.getMovieArtwork(identity(820000005)));
});
const artwork={backdrop:{url:'https://image.tmdb.org/t/p/original/bg.jpg',srcset:'https://image.tmdb.org/t/p/w1280/bg.jpg 1280w'},poster:{url:'https://image.tmdb.org/t/p/original/poster.jpg',srcset:'https://image.tmdb.org/t/p/w500/poster.jpg 500w'}};
const movie={slug:'film',name:'Film',type:'single',tmdb:{id:550,type:'movie'},thumb_url:'https://source.test/bg.jpg',poster_url:'https://source.test/poster.jpg'};

test('home enrichment is spotlight-only, preserves original cards/settings and creates browser fallback URLs',async()=>{
  const prepare=createFeaturedArtwork({provider:{getMovieArtwork:async()=>artwork}}),data={spotlights:[movie],latest:[movie]},settings={featured_slugs:['film']};
  const before=structuredClone({data,settings}),result=await prepare(data,settings);
  assert.equal(result.spotlights[0].thumb_url,artwork.backdrop.url);assert.equal(result.spotlights[0].banner_mobile,artwork.backdrop.url);assert.equal(result.spotlights[0].hero_poster_url,artwork.poster.url);
  assert.equal(result.spotlights[0].hero_backdrop_fallback,movie.thumb_url);assert.equal(result.spotlights[0].hero_poster_fallback,movie.poster_url);
  assert.equal(result.latest[0].thumb_url,movie.thumb_url);assert.deepEqual({data,settings},before);
});
test('manual desktop/mobile banner choices win without erasing TMDb poster or affecting ads',async()=>{
  const prepare=createFeaturedArtwork({provider:{getMovieArtwork:async()=>artwork}});
  const settings={featured_slugs:['film'],banner_config:banners.normalize({slides:[{slug:'film',image_desktop:'https://manual.test/desktop.jpg',image_mobile:'https://manual.test/mobile.jpg',title:'Manual copy'}],ads:[]})};
  const result=await prepare({spotlights:[movie]},settings),hero=result.spotlights[0];
  assert.equal(hero.thumb_url,'https://manual.test/desktop.jpg');assert.equal(hero.banner_mobile,'https://manual.test/mobile.jpg');assert.equal(hero.hero_backdrop_srcset,'');assert.equal(hero.hero_mobile_srcset,'');assert.equal(hero.banner_title,'Manual copy');assert.equal(hero.hero_poster_url,artwork.poster.url);
});
test('unavailable/slow TMDb and disabled hero return source artwork without blocking or mutating pins',async()=>{
  for(const provider of [{getMovieArtwork:async()=>{throw Error('offline');}},{getMovieArtwork:()=>new Promise(()=>{})},{}]){
    const prepare=createFeaturedArtwork({provider,timeoutMs:5});const result=await prepare({spotlights:[movie]},{featured_slugs:['film']});
    assert.equal(result.spotlights[0].thumb_url,movie.thumb_url);assert.equal(result.spotlights[0].hero_artwork_source,'provider');assert.equal(result.spotlights[0].hero_poster_url,movie.poster_url);
  }
  let calls=0;const prepare=createFeaturedArtwork({provider:{getMovieArtwork:async()=>{calls++;return artwork;}}});const result=await prepare({spotlights:[movie]},{featured_slugs:['film'],banner_config:{hero_enabled:false,slides:[]}});assert.equal(calls,0);assert.deepEqual(result.spotlights,[]);
});

test('server-rendered first hero includes safe TMDb images and source fallback before hydration',()=>{
  const fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
  const template=require('../src/services/templateService');
  const raw=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  const hero={...movie,name:'A &quot; title',hero_backdrop_url:artwork.backdrop.url,hero_backdrop_srcset:artwork.backdrop.srcset,hero_backdrop_fallback:movie.thumb_url,hero_poster_url:artwork.poster.url,hero_poster_fallback:movie.poster_url,hero_poster_srcset:artwork.poster.srcset,category:[]};
  const dom=new JSDOM(template.renderHome(raw,{spotlights:[hero]}));
  try{const bg=dom.window.document.getElementById('hero-backdrop-img-1'),poster=dom.window.document.getElementById('hero-poster-img');assert.equal(bg.getAttribute('src'),artwork.backdrop.url);assert.equal(bg.getAttribute('srcset'),artwork.backdrop.srcset);assert.equal(bg.dataset.heroFallback,movie.thumb_url);assert.equal(poster.getAttribute('src'),artwork.poster.url);assert.equal(poster.dataset.heroFallback,movie.poster_url);assert.equal(dom.window.document.querySelector('script[src*="hero-artwork.js"]').getAttribute('src'),'/js/hero-artwork.js?v=3.3.0');}finally{dom.window.close();}
});

test('artwork outage is briefly throttled without being mistaken for a valid image result',async()=>{
  const service=new TmdbService();let calls=0;service.fetchTmdb=async()=>{calls++;return null;};
  await assert.rejects(service.getMovieArtwork(identity(820000006)));assert.equal(await service.getMovieArtwork(identity(820000006)),null);assert.equal(calls,1);
});

test('artwork-only identity fallback requires one exact original-title/year/type match and never changes rating identity',async()=>{
  const service=new TmdbService();let calls=0;
  service.fetchTmdb=async(endpoint,params)=>{calls++;assert.equal(endpoint,'/search/movie');return{results:[{id:880000001,original_title:'Artwork Exact Unique',title:'Different display',release_date:'2001-04-01'},{id:880000002,title:'Artwork Exact Unique',release_date:'2002-01-01'}]};};
  const movie={origin_name:'Artwork Exact Unique',year:2001,type:'single',tmdb:{id:null,type:null}};
  assert.deepEqual(await service.resolveArtworkReference(movie),{id:880000001,mediaType:'movie'});assert.equal(calls,1);
  assert.deepEqual(await service.resolveArtworkReference(movie),{id:880000001,mediaType:'movie'});assert.equal(calls,1);
  const rating=await service.getMovieRating(movie);assert.equal(rating.tmdb_id,null);assert.equal(calls,1);
  service.fetchTmdb=async()=>({results:[{id:880000003,title:'Artwork Ambiguous',release_date:'2001-01-01'},{id:880000004,title:'Artwork Ambiguous',release_date:'2001-02-01'}]});
  assert.equal(await service.resolveArtworkReference({...movie,origin_name:'Artwork Ambiguous'}),null);
  service.fetchTmdb=async()=>({results:[{id:880000005,title:'Almost Artwork',release_date:'2001-01-01'}]});
  assert.equal(await service.resolveArtworkReference({...movie,origin_name:'Artwork Not Exact'}),null);
});
