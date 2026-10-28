const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('Song Ngu navigation is inserted once immediately after cinema and marked active', async () => {
  const dom = new JSDOM(read('public/index.html'), { url:'http://localhost/kham-pha?type=song-ngu', runScripts:'outside-only' });
  const { window } = dom;
  const callbacks = [];
  window.document.addEventListener = (name, callback) => { if (name === 'DOMContentLoaded') callbacks.push(callback); };
  window.API = { getMe: async()=>null, getSiteAnnouncement: async()=>({}), getCategories:async()=>({categories:[],countries:[]}) };
  window.eval(read('public/js/header.js'));
  try {
    for (const callback of callbacks) await callback();
    await new Promise(resolve=>setImmediate(resolve));
    const link = window.document.querySelector('header nav [data-path="song-ngu"]');
    assert.ok(link);
    assert.equal(link.previousElementSibling.dataset.path, 'chieu-rap');
    assert.equal(link.getAttribute('href'), '/kham-pha?type=song-ngu');
    assert.equal(link.textContent, 'Song Ngữ');
    assert.equal(link.classList.contains('font-semibold'), true);
    assert.equal(window.document.querySelectorAll('header nav [data-path="song-ngu"]').length, 1);
  } finally { dom.window.close(); }
});

test('bilingual catalog paginates real indexed items and searches accents without contacting primary API', async () => {
  const source = read('src/services/vicdnService.js').replace('module.exports = new ViCDNService();', 'module.exports = Object.create(ViCDNService.prototype);');
  const context = { module:{exports:{}}, require: name => name === './catalogFormat' ? require('../src/services/catalogFormat') : require(name), console, URL };
  vm.runInNewContext(source, context);
  const service = context.module.exports;
  service.isInitialized = true;
  service.allMovies = [
    {slug:'movie-a',vname:'Hành Động',ename:'Action',year:2025,poster:'poster-a',type:'movie'},
    {slug:'tv-b',vname:'Bộ Phim',ename:'Series',year:2026,poster:'https://images.example/b.jpg',type:'tv',stt:2,total:8},
    {slug:'movie-c',vname:'Hành Trình',ename:'Journey',year:2024}
  ];
  const result = await service.getCatalog({page:2,limit:1});
  assert.equal(result.items[0].slug,'tv-b');
  assert.equal(result.items[0].has_song_ngu,true);
  assert.equal(result.items[0].source,'vicdn');
  assert.equal(result.items[0].poster_url,'https://images.example/b.jpg');
  assert.equal(result.pagination.totalItems,3);assert.equal(result.pagination.totalPages,3);
  const filtered = await service.getCatalog({keyword:'hanh',sort:'year'});
  assert.equal(filtered.items.length,2);assert.equal(filtered.items[0].slug,'movie-a');
  assert.equal((await service.getCatalog({year:2026})).items.length,1);
});

test('bilingual server labels omit provider branding without changing episode links',async()=>{
  const source=read('src/services/vicdnService.js').replace('module.exports = new ViCDNService();','module.exports = Object.create(ViCDNService.prototype);');
  const context={module:{exports:{}},require,console,URL};vm.runInNewContext(source,context);
  const service=context.module.exports;
  const info={slug:'tv-qa',vname:'QA',type:'tv',list_episodes:['1|https://player.example/episode-1']};
  service.findMatch=async()=>info;service.fetchInfo=async()=>info;
  const matched=await service.getBilingualServer({slug:'qa'}),direct=await service.getMovieDetail(info.slug);
  for(const server of [matched,direct.episodes[0]]){
    assert.equal(server.server_name,'Song Ngữ (Đa Giọng & Phụ Đề)');assert.equal(server.is_song_ngu,true);
    assert.equal(server.server_data[0].slug,'tap-1');assert.equal(server.server_data[0].link_embed,'https://player.example/episode-1');
  }
});
