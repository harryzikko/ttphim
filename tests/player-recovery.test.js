const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function fixture() {
  const dom = new JSDOM('<div id="player"></div>', { url:'http://localhost/',runScripts:'outside-only' });
  dom.window.eval(read('public/js/player-ux.js')); dom.window.eval(read('public/js/player-recovery.js'));
  return {dom,window:dom.window,recovery:dom.window.PlayerRecovery,container:dom.window.document.getElementById('player')};
}
const ep={slug:'tap-02',name:'2',link_m3u8:'https://media.example/broken.m3u8',link_embed:'https://embed.example/two'};
const servers=[
 {server_name:'Primary',server_data:[ep]},
 {server_name:'Backup',server_data:[{slug:'tap-1',name:'1',link_m3u8:'https://media.example/one.m3u8'},{slug:'tap-2',name:'Season 1 Episode 2',link_m3u8:'https://media.example/two.m3u8'}]},
 {server_name:'Duplicate',server_data:[{...ep}]},
 {server_name:'Wrong season',server_data:[{slug:'season-2-episode-2',name:'2',link_m3u8:'https://media.example/wrong.m3u8'}]},
 {server_name:'Empty',server_data:[]}
];
test('recovery matches exact/numeric-alias episode slugs, rejects wrong episodes and deduplicates failed sources',()=>{
 const f=fixture();try{
  const failed=new Set([f.recovery.sourceKey('hls',ep.link_m3u8)]);
  const options=f.recovery.candidates(servers,ep,0,failed);
  assert.equal(options.length,2);assert.equal(options[0].serverIndex,1);assert.equal(options[0].engine,'hls');assert.equal(options[0].episode.slug,'tap-2');
  assert.equal(options[1].engine,'embed');assert.ok(!options.some(o=>o.url.includes('wrong')||o.url.includes('one.m3u8')||o.url.includes('broken')));
  assert.equal(f.recovery.mediaUrl('javascript:alert(1)'), '');assert.equal(f.recovery.mediaUrl('https://user:password@example.test/'), '');
 }finally{f.dom.window.close();}
});
test('source transition requires confirmation, resumes HLS only and cannot execute after prompt disposal',()=>{
 const f=fixture(),choices=[];try{
  const offer=f.recovery.offer({container:f.container,servers,episode:ep,serverIndex:0,time:123,failed:new Set([f.recovery.sourceKey('hls',ep.link_m3u8)]),choose:(...v)=>choices.push(v)});
  assert.equal(choices.length,0);assert.ok(f.container.textContent.includes('123 giây'));
  f.container.querySelector('.player-recovery-confirm').click();assert.equal(choices.length,1);assert.equal(choices[0][1],123);assert.equal(choices[0][0].serverIndex,1);
  const next=f.recovery.offer({container:f.container,servers,episode:ep,serverIndex:0,time:123,failed:new Set([f.recovery.sourceKey('hls',ep.link_m3u8)]),choose:(...v)=>choices.push(v)});
  const button=f.container.querySelector('.player-recovery-confirm');next.destroy();button.click();assert.equal(choices.length,1);
  const embed=f.recovery.offer({container:f.container,servers:[servers[0]],episode:ep,serverIndex:0,time:123,failed:new Set([f.recovery.sourceKey('hls',ep.link_m3u8)]),choose:(...v)=>choices.push(v)});
  assert.ok(f.container.textContent.includes('không bảo đảm'));f.container.querySelector('.player-recovery-confirm').click();assert.equal(choices.at(-1)[1],0);
 }finally{f.dom.window.close();}
});
test('missing exact episode leaves retry/cancel rather than switching to the first episode and labels remain text',()=>{
 const f=fixture();try{
  const offer=f.recovery.offer({container:f.container,servers:[servers[1]],episode:{slug:'tap-9',name:'9'},serverIndex:0,choose:()=>assert.fail('wrong episode'),retry:()=>{}});
  assert.equal(offer.options.length,0);assert.equal(f.container.querySelector('.player-recovery-confirm'),null);assert.ok(f.container.textContent.includes('Chưa có nguồn dự phòng khớp tập'));
  offer.destroy();f.recovery.offer({container:f.container,servers:[{server_name:'<img src=x onerror=alert(1)>',server_data:[ep]}],episode:ep,serverIndex:0,choose(){}});
  assert.equal(f.container.querySelector('img'),null);assert.ok(f.container.textContent.includes('<img'));
 }finally{f.dom.window.close();}
});
