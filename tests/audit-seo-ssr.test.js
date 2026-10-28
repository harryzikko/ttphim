'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const cookieParser = require('cookie-parser');
const { JSDOM } = require('jsdom');
const seo = require('../src/services/seoService');
const template = require('../src/services/templateService');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const data = () => ({ movie: { slug:'valid-film',name:'Phim <script>bad</script> thực',year:2026,content:'<p>Mô tả phim thật.</p>',thumb_url:'https://images.test/art.jpg',category:[],country:[],actor:[],director:[] }, episodes:[{server_name:'Vietsub',server_data:[{slug:'tap-1',name:'1',link_embed:'https://example.test/embed'}]}],related:[] });

test('SSR never renders spoiler or another episode comment before hydration', () => {
  const comments=[{id:'secret',user_name:'User',content:'AUDIT_SECRET_COMMENT',episode_slug:'tap-9',is_spoil:true,replies:[]}];
  for (const kind of ['detail','watch']) {
    const html=kind==='detail'?template.renderDetail(read('public/chi-tiet.html'),data(),comments):template.renderWatch(read('public/xem-phim.html'),data(),'tap-1',comments,0);
    assert.doesNotMatch(html,/AUDIT_SECRET_COMMENT/);
    const dom=new JSDOM(html);
    try { assert.ok(dom.window.document.querySelector(kind==='detail'?'#detail-comments-list [role="status"]':'#watch-comments-list [role="status"]')); }
    finally {dom.window.close();}
  }
});

test('SEO uses configured origin, safe metadata and an explicit duplicate/private index policy', () => {
  const meta=seo.metadata({path:'/mobile/phim/valid-film',query:{}},data().movie,'https://cineviet.test');
  assert.equal(meta.canonical,'https://cineviet.test/phim/valid-film');
  assert.equal(meta.index,true);
  const html=seo.decorate('<html><head><title>Old</title><meta name="description" content="Old"></head><body></body></html>',meta);
  const dom=new JSDOM(html);
  try {
    assert.equal(dom.window.document.querySelectorAll('title').length,1);
    assert.equal(dom.window.document.querySelectorAll('meta[name="description"]').length,1);
    assert.equal(dom.window.document.querySelector('meta[property="og:url"]').content,meta.canonical);
    assert.equal(dom.window.document.querySelectorAll('script').length,1);
    assert.ok(JSON.parse(dom.window.document.querySelector('script').textContent).name.includes('Phim'));
  } finally {dom.window.close();}
  assert.equal(seo.metadata({path:'/xem-phim/valid-film/tap-1',query:{}},data().movie,'').index,false);
  assert.equal(seo.metadata({path:'/kham-pha',query:{keyword:'test'}},null,'').index,false);
  assert.equal(seo.metadata({path:'/tai-khoan',query:{}},null,'').index,false);
  assert.equal(seo.sitemap(''),null);
  const xml=seo.sitemap('https://cineviet.test',['valid-film','valid-film','bad<script>']);
  assert.equal((xml.match(/\/phim\/valid-film/g)||[]).length,1); assert.doesNotMatch(xml,/script|localhost/);
});

test('real view routes distinguish missing movie/episode from outage and expose mobile metadata', async () => {
  let calls=0;
  const movies={async getMovieDetail(slug){calls++;if(slug==='outage')throw Error('Provider timeout');if(slug!=='valid-film')throw Object.assign(Error('Movie not found'),{status:404});return data();},async getHomeData(){return {latest:[{slug:'valid-film'}]};}};
  const stubs={
    '../config':{PUBLIC_DIR:path.join(root,'public'),PUBLIC_ORIGIN:'https://cineviet.test'},
    '../services/kkphimService':movies,
    '../services/templateService':template,
    '../services/tmdbService':{getMovieCredits:async()=>({cast:[],directors:[]})},
    '../services/dbService':{getSettings:async()=>({}),getComments:async()=>[],incrementMovieView:async()=>1},
    '../services/homePageService':{renderHomePage:async()=>read('public/index.html')},
    '../services/bannerService':{decorate:html=>html},
    '../services/pageError':require('../src/services/pageError'),
    '../services/seoService':seo
  };
  const context={module:{exports:{}},console:{error(){}},require:name=>Object.hasOwn(stubs,name)?stubs[name]:require(name)};
  vm.runInNewContext(read('src/routes/viewRoutes.js'),context);
  const app=express();app.use(cookieParser());app.use(context.module.exports);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    for(const route of ['/phim/missing','/mobile/phim/missing','/xem-phim/missing/tap-1','/mobile/xem-phim/missing/tap-1','/xem-phim/valid-film/tap-9','/mobile/xem-phim/valid-film/tap-9','/xem-phim/valid-film?server=999','/mobile/xem-phim/valid-film?server=999']) {
      const response=await fetch(base+route);assert.equal(response.status,404,route);const text=await response.text();assert.match(text,/Không tìm thấy nội dung/);assert.doesNotMatch(text,/Quỷ Quyệt/);
    }
    const unavailable=await fetch(base+'/phim/outage');assert.equal(unavailable.status,503);assert.equal(unavailable.headers.get('retry-after'),'30');
    for(const route of ['/phim/valid-film','/mobile/phim/valid-film']){
      const response=await fetch(base+route);assert.equal(response.status,200);const dom=new JSDOM(await response.text());
      try{assert.equal(dom.window.document.querySelector('link[rel="canonical"]').href,'https://cineviet.test/phim/valid-film');assert.match(dom.window.document.title,/thực/);assert.match(dom.window.document.querySelector('meta[name="description"]').content,/Mô tả phim thật/);}finally{dom.window.close();}
    }
    assert.equal((await fetch(base+'/mobile/xem-phim/valid-film/01?server=0')).status,200);
    const before=calls;const robots=await fetch(base+'/robots.txt');assert.equal(robots.status,200);assert.match(await robots.text(),/Sitemap: https:\/\/cineviet.test\/sitemap.xml/);assert.equal(calls,before);
    const sitemap=await fetch(base+'/sitemap.xml');assert.equal(sitemap.status,200);assert.match(await sitemap.text(),/https:\/\/cineviet.test\/phim\/valid-film/);
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
