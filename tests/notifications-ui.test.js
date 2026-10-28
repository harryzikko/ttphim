const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const notification = { id:'owned',type:'follow_episode',read:false,title:'<img src=x onerror=alert(1)>',message:'New episode',url:'/' };

test('desktop notifications use server read state, keyboard activation and retry failed writes', async () => {
  const dom = new JSDOM('<header><div><button aria-label="Thông báo"><span class="rounded-full"></span></button></div></header>',{url:'http://localhost/',runScripts:'outside-only'});
  const w = dom.window; let init, success=false, writes=0;
  w.document.addEventListener = (event,fn) => { if(event==='DOMContentLoaded')init=fn; };
  w.API={getNotifications:async()=>[{...notification}],markFollowNotificationRead:async id=>{assert.equal(id,'owned');writes++;return{status:success};},getSiteAnnouncement:async()=>null};
  w.localStorage.setItem('TTPhim_read_notifications',JSON.stringify(['owned']));
  try {
    w.eval(read('public/js/header.js')); await init();
    w.document.querySelector('header button').click(); await tick();
    assert.equal(w.document.getElementById('notif-unread-count').textContent,'1 mới');
    assert.equal(w.document.querySelector('#notif-items-list img'),null);
    let item=w.document.querySelector('.notif-item');
    item.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true})); await tick();
    assert.equal(writes,1); assert.equal(w.document.getElementById('notif-unread-count').style.display,'inline-block');
    success=true; w.document.querySelector('.notif-item').click(); await tick();
    assert.equal(writes,2);assert.equal(w.document.getElementById('notif-unread-count').style.display,'none');
  } finally {w.close();}
});

test('desktop mark-all reports partial failure and leaves failed notification unread', async () => {
  const dom=new JSDOM('<header><div><button aria-label="Thông báo"></button></div></header>',{url:'http://localhost/',runScripts:'outside-only'});
  const w=dom.window;let init;
  w.document.addEventListener=(event,fn)=>{if(event==='DOMContentLoaded')init=fn;};
  w.API={getNotifications:async()=>[{...notification},{...notification,id:'second'}],getSiteAnnouncement:async()=>null,markFollowNotificationRead:async id=>({status:id==='owned'})};
  try {
    w.eval(read('public/js/header.js'));await init();w.document.querySelector('header button').click();await tick();
    w.document.getElementById('notif-mark-all').click();await tick();await tick();
    assert.equal(w.document.getElementById('notif-unread-count').textContent,'1 mới');
    assert.equal(w.document.getElementById('notif-mark-all').disabled,false);
    assert.ok(w.document.getElementById('toast-container').textContent.includes('Chưa thể'));
  } finally {w.close();}
});

test('mobile notification dialog retries, renders provider text safely and persists read before navigation', async () => {
  const dom=new JSDOM('',{url:'http://localhost/mobile',runScripts:'outside-only'});
  const w=dom.window;let offline=true,writes=0;
  w.document.addEventListener=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.dispatchEvent(new w.Event('close'));};
  w.API={getNotifications:async()=>{if(offline)throw Error();return[{...notification,url:'/mobile'}];},markFollowNotificationRead:async()=>{writes++;return{status:false};}};
  try {
    w.eval(read('public/mobile/js/mobile-app.js')+'\nwindow.testApp=MobileApp;');
    await w.testApp.openNotifications();
    let dialog=w.document.querySelector('dialog');assert.ok(dialog.textContent.includes('Không thể tải'));
    offline=false;[...dialog.querySelectorAll('button')].find(el=>el.textContent==='Thử lại').click();await tick();
    assert.equal(dialog.querySelector('img'),null);assert.ok(dialog.textContent.includes(notification.title));
    const item=dialog.querySelector('strong').parentElement;item.click();await tick();
    assert.equal(writes,1);assert.equal(item.disabled,false);
    dialog.querySelector('button').click();assert.equal(w.document.querySelector('dialog'),null);
  } finally {w.close();}
});
