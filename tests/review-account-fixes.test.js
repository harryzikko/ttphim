'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const wait=()=>new Promise(resolve=>setTimeout(resolve,25));
async function fixture(mobile=false){
 const dom=new JSDOM(read(mobile?'public/mobile/tai-khoan.html':'public/tai-khoan.html'),{url:'http://account.test/'+(mobile?'mobile/':'')+'tai-khoan',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
 const w=dom.window;if(w.document.readyState==='loading')await new Promise(resolve=>w.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
 const state={user:{id:'A',name:'Account A',email:'a@example.test',avatar:'/images/avatars/vietnam-boy-v1.webp',mfa_enabled:false,email_verified:true},writes:[],requests:[],rejectWrite:false};
 w.showToast=()=>{};w.confirm=()=>true;w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.fetch=async(url,options={})=>{
  state.requests.push({url,options});let data=[],status=200,envelope;
  if(url==='/api/auth/me')data={...state.user};
  else if(url==='/api/user/library')data={watchlist:[],history:[],continueWatching:[]};
  else if(url==='/api/auth/mfa/setup')data={secret:'FIXTUREONLY',otpauthUrl:'otpauth://totp/CineViet?secret=FIXTUREONLY'};
  else if(url==='/api/auth/mfa/confirm'){state.user.mfa_enabled=true;data={user:{...state.user},recoveryCodes:['FIXTURE-ONE','FIXTURE-TWO']};}
  else if(url==='/api/user/profile'){
   if(options.headers['X-Account-ID']!==state.user.id){status=409;envelope={status:false,code:'ACCOUNT_CHANGED'};}
   else{state.writes.push({id:state.user.id,body:JSON.parse(options.body)});data={...state.user,...JSON.parse(options.body)};}
  }
  return {status,headers:{get:()=>null},json:async()=>envelope||{status:true,data}};
 };
 for(const file of ['public/js/api.js',...(mobile?['public/mobile/js/account-security.js','public/mobile/js/tai-khoan.js']:['public/js/account.js'])])w.eval(read(file));
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await wait();
 return {w,state,el:id=>w.document.getElementById(id),close:()=>w.close()};
}
test('private account switches hide/lock stale forms and prevent writes to the new identity',async()=>{
 for(const focus of [false,true]){
  const f=await fixture();try{
   assert.equal(f.el('input-profile-name').value,'Account A');
   f.state.user={...f.state.user,id:'B',name:'Account B',email:'b@example.test'};
   if(focus){f.w.dispatchEvent(new f.w.Event('focus'));await wait();}
   else{f.el('btn-save-profile').click();await wait();}
   assert.equal(f.w.document.querySelector('main').hidden,true);assert.equal(f.w.document.querySelector('main').inert,true);assert.equal(f.el('input-profile-name').value,'');
   const result=await f.w.API.updateProfile('stale name');assert.equal(result.code,'ACCOUNT_CHANGED');assert.deepEqual(f.state.writes,[]);
  }finally{f.close();}
 }
});
test('mobile MFA enrollment and one-time recovery survive focus for the same account, then clear on explicit close',async()=>{
 const f=await fixture(true);try{
  f.el('m-security').open=true;await wait();f.el('m-mfa-password').value='fixture-password';f.el('m-mfa-setup').click();await wait();
  assert.equal(f.el('m-mfa-enrollment').hidden,false);const secret=f.el('m-mfa-secret').textContent;
  f.w.dispatchEvent(new f.w.Event('focus'));await wait();assert.equal(f.el('m-mfa-enrollment').hidden,false);assert.equal(f.el('m-mfa-secret').textContent,secret);assert.equal(f.el('m-mfa-confirm').hidden,false);
  f.el('m-mfa-code').value='123456';f.el('m-mfa-confirm').click();await wait();assert.equal(f.el('m-mfa-recovery').hidden,false);
  f.w.dispatchEvent(new f.w.Event('focus'));await wait();assert.equal(f.el('m-mfa-recovery').hidden,false);assert.match(f.el('m-mfa-recovery-codes').textContent,/FIXTURE-ONE/);
  f.el('m-security').open=false;f.el('m-security').dispatchEvent(new f.w.Event('toggle'));assert.equal(f.el('m-mfa-recovery-codes').textContent,'');
 }finally{f.close();}
});
test('mobile MFA secrets clear when the authenticated identity changes',async()=>{
 const f=await fixture(true);try{
  f.el('m-security').open=true;await wait();f.el('m-mfa-password').value='fixture-password';f.el('m-mfa-setup').click();await wait();
  f.state.user={...f.state.user,id:'B'};f.w.dispatchEvent(new f.w.Event('focus'));await wait();
  assert.equal(f.el('m-mfa-secret').textContent,'');assert.equal(f.el('m-mfa-enrollment').hidden,true);assert.equal(f.w.document.querySelector('main').hidden,true);
 }finally{f.close();}
});
test('registration SMTP warning tells the truth and routes to resend instead of requesting a duplicate registration',async()=>{
 const dom=new JSDOM(read('public/auth.html'),{url:'http://auth.test/dang-ky',runScripts:'outside-only'});const w=dom.window;
 if(w.document.readyState==='loading')await new Promise(r=>w.document.addEventListener('DOMContentLoaded',r,{once:true}));
 const timers=[];w.setTimeout=fn=>{timers.push(fn);return 1;};w.API={register:async()=>({status:true,data:{verificationPending:true}})};
 w.eval(read('public/js/auth.js'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 try{w.document.getElementById('identityInput').value='fixture@example.test';w.document.getElementById('passwordInput').value='fixture-password';w.document.getElementById('genderMale').checked=true;w.document.getElementById('authForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await wait();assert.match(w.document.getElementById('authStatus').textContent,/Chưa gửi được/);assert.equal(timers.length,1);assert.match(read('public/js/auth.js'),/verification=pending#tab-security/);}finally{w.close();}
});
