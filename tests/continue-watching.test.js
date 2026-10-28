const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const code = fs.readFileSync(path.join(__dirname, '../public/js/continue-watching.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const item = { movie_slug:'film',movie_name:'Film',episode_slug:'tap-2',episode_name:'Tập 2',current_time:120,duration:600,updated_at:'2026-01-02' };
function fixture(api = {}, mobile = false) {
  const dom = new JSDOM('<section class="hidden"><span id="continue-watching-count"></span><div id="rail"></div></section>', {url:'http://localhost/',runScripts:'outside-only'});
  const {window} = dom, messages = [];
  window.showToast = (...args) => messages.push(args);
  window.API = {getMe:async()=>({id:'member'}),getLibrary:async()=>({history:[item]}),...api};
  window.eval(code);
  const section = window.document.querySelector('section'), rail = window.document.getElementById('rail');
  return {dom,window,section,rail,messages,mount:()=>window.ContinueWatching.mount({section,rail,mobile})};
}

test('desktop and mobile render the same genuine account progress with safe links and no invented quality', async () => {
  for(const mobile of [false,true]) {
    const h = fixture({},mobile);
    try {
      await h.mount();
      assert.equal(h.rail.querySelector('.continue-play').getAttribute('href'),`${mobile?'/mobile':''}/xem-phim/film/tap-2`);
      assert.ok(h.rail.textContent.includes('2:00 / 10:00'));
      assert.equal(h.rail.querySelector('.continue-track>span').style.width,'20%');
      assert.ok(!/FHD|110 phút|45%/.test(h.rail.textContent));
      assert.ok(h.rail.querySelector('button').getAttribute('aria-label').includes('lịch sử'));
    } finally {h.dom.window.close();}
  }
});

test('desktop and mobile guests never read or display guest/account progress or hidden counts', async () => {
  for (const mobile of [false,true]) {
    let libraryCalls=0,storageCalls=0;
    const h=fixture({getMe:async()=>null,getLibrary:()=>{libraryCalls++;return{history:[item]};}},mobile);
    try {
      h.window.localStorage.setItem('TTPhim_progress_guest',JSON.stringify({film:item,hidden:{...item,movie_slug:'hidden',continue_hidden:true}}));
      h.window.localStorage.setItem('TTPhim_progress_other',JSON.stringify({secret:{...item,movie_slug:'secret',continue_hidden:true}}));
      h.window.localStorage.setItem('kk_user',JSON.stringify({id:'other',role:'admin'}));
      const before = {...h.window.localStorage};
      await h.window.ContinueWatching.mount({section:h.section,rail:h.rail,mobile,storage:{getItem:()=>{storageCalls++;return'{}';},setItem:()=>{storageCalls++;}}});
      assert.equal(libraryCalls,0);assert.equal(storageCalls,0);
      assert.equal(h.section.hidden,true);assert.equal(h.rail.children.length,0);
      assert.equal(h.section.querySelector('#continue-watching-count').textContent,'');
      assert.deepEqual({...h.window.localStorage},before);
      assert.equal(h.rail.querySelector('.continue-hidden-list'),null);
    } finally {h.dom.window.close();}
  }
});

test('failed hide preserves the card and snapshot; successful hide preserves playback history', async () => {
  let success=false;
  const h=fixture({setContinueHidden:async()=>({status:success})});
  try {
    h.window.localStorage.setItem('TTPhim_progress_member',JSON.stringify({film:item}));
    await h.mount();const remove=h.rail.querySelector('.continue-remove');
    remove.click();await tick();
    assert.equal(h.rail.querySelectorAll('.continue-card').length,1);assert.equal(remove.disabled,false);
    assert.equal(h.messages.length,1);assert.equal(h.messages[0][1],'error');
    assert.ok(h.window.localStorage.getItem('TTPhim_progress_member').includes('film'));
    success=true;remove.click();await tick();
    assert.equal(h.section.hidden,true); assert.equal(h.rail.children.length,0);
    const saved=JSON.parse(h.window.localStorage.getItem('TTPhim_progress_member')).film;
    assert.equal(saved.current_time,120);assert.equal(saved.continue_hidden,true);
  } finally {h.dom.window.close();}
});

test('library/auth failures show a retry, not a guest fallback or a false empty history', async () => {
  let offline=true;
  const h=fixture({getLibrary:async()=>{if(offline)throw Error('offline');return{history:[item]};}});
  try {
    await h.mount();assert.equal(h.section.hidden,false);assert.equal(h.rail.querySelector('.continue-card'),null);
    assert.ok(h.rail.textContent.includes('không bị xóa'));offline=false;h.rail.querySelector('.continue-retry').click();await tick();
    assert.ok(h.rail.querySelector('.continue-card'));
  } finally {h.dom.window.close();}
  const other=fixture({getMe:async()=>{throw Error('authentication unavailable');}});
  try {other.window.localStorage.setItem('TTPhim_progress_guest',JSON.stringify({film:item}));await other.mount();assert.equal(other.section.hidden,true);assert.equal(other.rail.children.length,0);assert.equal(other.section.querySelector('#continue-watching-count').textContent,'');}finally{other.dom.window.close();}
});

test('normalization removes completed/invalid records, prefers the latest and never invents a duration', async () => {
  const h=fixture({getLibrary:async()=>({history:[item,{...item,current_time:960,duration:1000,updated_at:'2026-01-03'},{...item,movie_slug:'unknown-duration',current_time:25,duration:0},{...item,movie_slug:'untouched',current_time:0},{...item,movie_slug:'bad/slug'}]})});
  try {await h.mount();assert.equal(h.rail.querySelectorAll('.continue-card').length,1);assert.ok(h.rail.textContent.includes('Đã lưu tại 0:25'));assert.ok(h.rail.textContent.includes('Chưa có thời lượng'));}finally{h.dom.window.close();}
});

test('stored titles and images cannot inject markup and stale responses do not replace a newer mount', async () => {
  const attack='<img src=x onerror=alert(1)>';
  let release;const pending=new Promise(resolve=>{release=resolve;});let calls=0;
  const h=fixture({getLibrary:()=>++calls===1?pending:Promise.resolve({history:[{...item,movie_name:attack,poster_url:'javascript:alert(1)'}]})});
  try {
    const first=h.mount();await tick();await h.mount();release({history:[]});await first;
    assert.equal(h.rail.querySelectorAll('.continue-card').length,1);assert.ok(h.rail.textContent.includes(attack));
    assert.equal(h.rail.querySelector('[onerror]'),null);assert.equal(h.rail.querySelector('img').getAttribute('src'),'/favicon.svg');
  } finally {h.dom.window.close();}
});

test('desktop and mobile show only visible progress, never hidden titles or restore controls', async () => {
  for(const mobile of [false,true]) {
    let onlyHidden=false;
    const hidden={...item,movie_slug:'private-hidden',movie_name:'Hidden title',continue_hidden:true};
    const h=fixture({getLibrary:async()=>({history:onlyHidden?[hidden]:[item,hidden]})},mobile);
    try {
      await h.mount();assert.equal(h.rail.querySelectorAll('.continue-card').length,1);
      assert.equal(h.section.querySelector('#continue-watching-count').textContent,'1 phim');
      assert.equal(h.rail.querySelector('details,summary,.continue-restore'),null);assert.ok(!h.rail.textContent.includes('Hidden title'));
      onlyHidden=true;await h.mount();assert.equal(h.section.hidden,true);assert.equal(h.rail.children.length,0);
      assert.equal(h.section.querySelector('#continue-watching-count').textContent,'');
    } finally {h.dom.window.close();}
  }
});

test('logout, account switch and restored tabs clear counts immediately and reject stale library responses', async () => {
  for (const mobile of [false,true]) {
    let user={id:'member'},release,libraryCalls=0;
    const h=fixture({getMe:async()=>user,getLibrary:async()=>{libraryCalls++;return{history:[item,{...item,movie_slug:'secret-hidden',continue_hidden:true}]};}},mobile);
    try {
      await h.mount();await tick();
      assert.equal(h.rail.querySelectorAll('.continue-card').length,1);assert.equal(h.rail.querySelector('.continue-hidden-list'),null);
      user=null;h.window.dispatchEvent(new h.window.Event('ttphim:auth-changed'));
      assert.equal(h.section.hidden,true);assert.equal(h.rail.children.length,0);assert.equal(h.section.querySelector('#continue-watching-count').textContent,'');
      await tick();const guestCalls=libraryCalls;
      h.window.dispatchEvent(new h.window.Event('focus'));await tick();assert.equal(libraryCalls,guestCalls);
      user={id:'member'};h.window.API.getLibrary=()=>new Promise(resolve=>{release=resolve;});
      const pending=h.mount();await tick();user=null;
      const restored=new h.window.Event('pageshow');Object.defineProperty(restored,'persisted',{value:true});h.window.dispatchEvent(restored);await tick();
      release({history:[item,{...item,continue_hidden:true,movie_slug:'secret-hidden'}]});await pending;
      assert.equal(h.section.hidden,true);assert.equal(h.rail.children.length,0);assert.equal(h.section.querySelector('#continue-watching-count').textContent,'');
    } finally {h.dom.window.close();}
  }
});

test('expired library access never exposes cached counts and remounts do not accumulate auth listeners',async()=>{
  let expired=false,checks=0;
  const h=fixture({getMe:async()=>{checks++;return{id:'member'};},getLibrary:async()=>{if(expired)throw Object.assign(Error('expired'),{httpStatus:401});return{history:[item]};}});
  try{
    await h.mount();await tick();await h.mount();await tick();
    const before=checks;expired=true;h.window.dispatchEvent(new h.window.Event('focus'));await tick();
    assert.equal(checks,before+1);assert.equal(h.section.hidden,true);assert.equal(h.rail.children.length,0);assert.equal(h.section.querySelector('#continue-watching-count').textContent,'');
  }finally{h.dom.window.close();}
});
