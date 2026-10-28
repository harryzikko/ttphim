const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const variants=[['detail','public/chi-tiet.html','detail-emoji-btn','detail-comment-textarea'],['watch','public/xem-phim.html','watch-emoji-btn','watch-comment-input'],['mobile watch','public/mobile/xem-phim.html','m-comment-emoji-btn','m-comment-input']];
function fixture(file,buttonId,inputId){
  const dom=new JSDOM(read(file),{url:'http://localhost/qa',runScripts:'outside-only'}),w=dom.window;
  w.eval(read('public/js/comment-emoji-picker.js'));
  const button=w.document.getElementById(buttonId),input=w.document.getElementById(inputId);
  const controller=w.CommentEmojiPicker.mount({button,input});
  const panel=w.document.getElementById(button.getAttribute('aria-controls'));
  return{w,dom,button,input,panel,controller};
}
for(const [name,file,buttonId,inputId] of variants)test(name+': picker inserts chosen emoji at cursor/selection, preserves draft and never submits',()=>{
  const h=fixture(file,buttonId,inputId);let events=0,submits=0;
  try{
    h.input.addEventListener('input',()=>events++);h.input.closest('form')?.addEventListener('submit',event=>{event.preventDefault();submits++;});
    assert.equal(h.w.document.querySelector('.btn-emoji-quick'),null);assert.equal(h.panel.hidden,true);assert.equal(h.button.type,'button');
    h.input.value='First LAST';h.input.setSelectionRange(6,10);h.button.click();assert.equal(h.panel.hidden,false);assert.equal(h.input.value,'First LAST');assert.equal(events,0);
    h.panel.querySelector('[aria-label="Cười ra nước mắt"]').click();assert.equal(h.input.value,'First 😂');assert.equal(events,1);assert.equal(submits,0);assert.equal(h.panel.hidden,true);assert.equal(h.w.document.activeElement,h.input);
    h.input.setSelectionRange(0,0);h.button.click();[...h.panel.querySelectorAll('[role="tab"]')].find(tab=>tab.textContent==='Điện ảnh').click();h.panel.querySelector('[aria-label="Bỏng ngô"]').click();assert.equal(h.input.value,'🍿First 😂');assert.equal(events,2);assert.equal(h.input.selectionStart,'🍿'.length);
    assert.equal(h.w.document.querySelectorAll('.comment-emoji-picker').length,1);assert.equal(h.w.CommentEmojiPicker.mount({button:h.button,input:h.input}),h.controller);
    assert.ok(h.w.document.querySelector('script[src="/js/comment-emoji-picker.js?v=1.0.0"]'));
  }finally{h.controller.destroy();h.w.close();}
});
test('picker supports keyboard tabs, Escape and outside close with truthful ARIA state',()=>{
  const h=fixture(...variants[0].slice(1));
  try{
    h.button.click();assert.equal(h.button.getAttribute('aria-expanded'),'true');assert.equal(h.panel.getAttribute('role'),'dialog');
    const first=h.panel.querySelector('[role="tab"]');first.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    assert.equal(h.w.document.activeElement.textContent,'Cử chỉ');assert.equal(h.w.document.activeElement.getAttribute('aria-selected'),'true');
    h.w.document.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(h.panel.hidden,true);assert.equal(h.w.document.activeElement,h.button);assert.equal(h.button.getAttribute('aria-expanded'),'false');
    h.button.click();h.w.document.body.dispatchEvent(new h.w.Event('pointerdown',{bubbles:true}));assert.equal(h.panel.hidden,true);assert.equal(h.input.value,'');
  }finally{h.controller.destroy();h.w.close();}
});
test('character limits, disabled inputs and literal HTML drafts are preserved',()=>{
  const h=fixture(...variants[1].slice(1));
  try{
    h.input.maxLength=4;h.input.value='full';h.button.click();h.panel.querySelector('[aria-label="Cười ra nước mắt"]').click();assert.equal(h.input.value,'full');assert.equal(h.panel.hidden,false);assert.ok(h.panel.querySelector('[role="status"]').textContent.includes('giới hạn'));
    h.controller.close();h.input.maxLength=2000;h.input.value='<img src=x onerror=alert(1)>';h.input.setSelectionRange(h.input.value.length,h.input.value.length);h.button.click();h.panel.querySelector('[aria-label="Cười ra nước mắt"]').click();assert.ok(h.input.value.endsWith('😂'));assert.equal(h.panel.querySelector('img'),null);
    h.input.disabled=true;h.button.click();assert.equal(h.panel.hidden,true);
  }finally{h.controller.destroy();h.w.close();}
});
test('only one picker is open and destroyed controls have no live handlers',()=>{
  const h=fixture(...variants[0].slice(1));
  try{
    const button=h.w.document.createElement('button'),input=h.w.document.createElement('textarea');h.w.document.body.append(button,input);
    const second=h.w.CommentEmojiPicker.mount({button,input});h.button.click();button.click();assert.equal(h.panel.hidden,true);assert.equal(button.getAttribute('aria-expanded'),'true');
    second.destroy();button.click();assert.equal(button.hasAttribute('aria-controls'),false);assert.equal(h.w.document.querySelectorAll('.comment-emoji-picker').length,1);
  }finally{h.controller.destroy();h.w.close();}
});
