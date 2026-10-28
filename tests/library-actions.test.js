const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function fixture(tab = 'watchlist', overrides = {}) {
  const dom = new JSDOM(read('public/danh-sach.html'), {url:`http://localhost/danh-sach?tab=${tab}`,runScripts:'outside-only'});
  const {window} = dom, messages = []; let initialize, fetches = 0;
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {get(){return this.textContent;},set(value){this.textContent=value;}});
  window.document.addEventListener = (event, callback) => {if(event === 'DOMContentLoaded') initialize = callback;};
  const movie={movie_slug:'film',movie_name:'Film',episode_name:'Tập 1',episode_slug:'tap-1',category:['Hành Động'],type:'series',current_time:30,duration:100,progress_percent:30,updated_at:'2026-01-01'};
  const data={history:[movie],watchlist:[movie],continueWatching:[movie]};
  window.fetch=async()=>{fetches++;return{status:200,ok:true,json:async()=>({status:true,data})};};
  window.API={getBaseUrl:()=>'',setContinueHidden:async()=>({status:false}),removeFromWatchlist:async()=>({status:false}),removeFromHistory:async()=>({status:false}),clearHistory:async()=>({status:false}),batchRemoveWatchlist:async()=>({status:false}),...overrides};
  window.showToast=(...args)=>messages.push(args);window.confirm=()=>true;
  window.eval(read('public/js/library.js'));await initialize();await tick();
  return{dom,window,doc:window.document,data,messages,fetches:()=>fetches};
}

test('library deletion failures preserve cards, release controls and never show success', async () => {
  for(const [tab,selector] of [['watchlist','.btn-remove-wl'],['continue','.btn-remove-hist'],['history','.btn-remove-single-hist']]) {
    const h=await fixture(tab);
    try {
      const button=h.doc.querySelector(selector);assert.ok(button);button.click();await tick();
      assert.equal(h.fetches(),1);assert.equal(button.disabled,false);assert.ok(h.doc.querySelector(selector));
      assert.equal(h.messages.length,1);assert.equal(h.messages[0][1],'error');
    }finally{h.dom.window.close();}
  }
});

test('successful watchlist removal reloads only after the server confirms', async () => {
  let h, resolve;
  h=await fixture('watchlist',{removeFromWatchlist:()=>new Promise(done=>{resolve=done;})});
  try{
    const button=h.doc.querySelector('.btn-remove-wl');button.click();button.click();assert.equal(button.disabled,true);assert.equal(h.fetches(),1);
    h.data.watchlist=[];resolve({status:true});await tick();await tick();
    assert.equal(h.fetches(),2);assert.equal(h.doc.querySelector('.btn-remove-wl'),null);assert.equal(h.messages[0][1],undefined);
  }finally{h.dom.window.close();}
});

test('batch and clear-history failures retain the selection and history', async () => {
  const h=await fixture('watchlist');
  try{
    h.doc.getElementById('toggleBatchBtn').click();h.doc.querySelector('.card-batch-cb').click();
    h.doc.querySelector('#batchActionBar button.bg-error-container').click();await tick();
    assert.equal(h.doc.querySelector('.card-batch-cb').checked,true);assert.equal(h.fetches(),1);assert.equal(h.messages[0][1],'error');
    h.doc.querySelectorAll('.tab-btn')[2].click();h.doc.querySelector('#btn-clear-all-history').click();await tick();
    assert.ok(h.doc.querySelector('.btn-remove-single-hist'));assert.equal(h.fetches(),1);assert.equal(h.messages.at(-1)[1],'error');
  }finally{h.dom.window.close();}
});

test('library filters arrays and counts unique titles without inventing episode totals', async () => {
  const h=await fixture();
  try{
    const action=[...h.doc.querySelectorAll('div.flex.items-center.gap-space-xs.overflow-x-auto button')].find(el=>el.textContent.includes('Hành Động'));
    action.click();assert.ok(h.doc.querySelector('.btn-remove-wl'));assert.equal(h.messages.length,0);
    assert.ok(h.doc.getElementById('stat-watching-count').textContent.trim().startsWith('1 '));
    assert.ok(h.doc.getElementById('stat-history-count').textContent.includes('tựa phim'));
    assert.equal(h.doc.getElementById('library-sync-status').textContent,'Đã tải dữ liệu mới nhất');
  }finally{h.dom.window.close();}
});

test('continue hides only after confirmation and History restores without deletion', async () => {
  let h, resolve; const calls=[];
  h=await fixture('continue',{setContinueHidden:(slug,hidden)=>{calls.push([slug,hidden]);return new Promise(done=>{resolve=done;});},removeFromHistory:()=>assert.fail('hide must not delete history')});
  try {
    const button=h.doc.querySelector('.btn-remove-hist');button.click();await tick();
    assert.equal(button.disabled,true);assert.equal(h.fetches(),1);
    h.data.history[0].continue_hidden=true;h.data.continueWatching=[];resolve({status:true});await tick();await tick();
    assert.equal(h.doc.querySelector('.btn-remove-hist'),null);assert.equal(h.data.history[0].current_time,30);
    h.doc.querySelectorAll('.tab-btn')[2].click();
    const restore=h.doc.querySelector('.btn-continue-visibility');assert.ok(restore);restore.click();await tick();
    h.data.history[0].continue_hidden=false;resolve({status:true});await tick();await tick();
    assert.deepEqual(calls,[['film',true],['film',false]]);assert.equal(h.data.history.length,1);assert.equal(h.data.history[0].episode_slug,'tap-1');
  } finally {h.dom.window.close();}
});
