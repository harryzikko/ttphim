'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('browser account switch reloads stale pages, rejects cookie races and preserves same-user mobile MFA',async t=>{
 let chromium;try{({chromium}=require('playwright'));}catch(_){t.skip('Playwright unavailable');return;}if(!fs.existsSync(chromium.executablePath())){t.skip('Chromium unavailable');return;}
 const express=require('express'),{accountGuard}=require('../src/services/requestSecurity');const root=path.join(__dirname,'../public');
 const users={A:{id:'A',name:'Account A',email:'a@example.test',avatar:'/images/avatars/vietnam-boy-v1.webp',email_verified:true,mfa_enabled:false},B:{id:'B',name:'Account B',email:'b@example.test',avatar:'/images/avatars/vietnam-girl-v1.webp',email_verified:true,mfa_enabled:false}};let active='A';let writes=0;
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user=users[active];next();});
 app.get('/api/auth/me',(req,res)=>res.json({status:true,data:req.user}));app.use(accountGuard);
 app.get('/api/user/library',(req,res)=>res.json({status:true,data:{watchlist:[],history:[],continueWatching:[]}}));app.get('/api/auth/sessions',(req,res)=>res.json({status:true,data:[]}));
 app.post('/api/user/profile',(req,res)=>{writes++;Object.assign(req.user,{name:req.body.name});res.json({status:true,data:req.user});});
 app.post('/api/auth/mfa/setup',(req,res)=>res.json({status:true,data:{secret:'FIXTUREONLY',otpauthUrl:'otpauth://totp/Fixture?secret=FIXTUREONLY'}}));
 app.post('/api/auth/mfa/confirm',(req,res)=>{req.user.mfa_enabled=true;res.json({status:true,data:{user:req.user,recoveryCodes:['FIXTURE-ONE','FIXTURE-TWO']}});});
 app.get('/fixture',(req,res)=>res.send('<!doctype html><title>Other tab</title>'));
 app.use(express.static(root,{extensions:['html']}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true});const context=await browser.newContext();await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 try{
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/tai-khoan');await page.waitForFunction(()=>document.getElementById('input-profile-name').value==='Account A');
  const other=await context.newPage();await other.goto(base+'/fixture');active='B';
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>document.getElementById('input-profile-name')?.value==='Account B');assert.equal(writes,0);assert.equal(users.B.name,'Account B');
  active='A';await page.reload();await page.waitForFunction(()=>document.getElementById('input-profile-name').value==='Account A');
  await page.locator('#input-profile-name').fill('Stale draft');active='B';
  // No focus/storage event: the request's confirmed owner must catch this cookie race.
  await page.locator('#btn-save-profile').click();await page.waitForFunction(()=>document.getElementById('input-profile-name')?.value==='Account B');assert.equal(writes,0);assert.equal(users.B.name,'Account B');
  active='A';const mobile=await context.newPage();mobile.on('pageerror',e=>errors.push(e.message));await mobile.setViewportSize({width:390,height:844});await mobile.goto(base+'/mobile/tai-khoan');await mobile.locator('#userName').filter({hasText:'Account A'}).waitFor();
  await mobile.locator('#m-security summary').click();await mobile.locator('#m-mfa-password').fill('fixture-password');await mobile.locator('#m-mfa-setup').click();await mobile.locator('#m-mfa-secret').filter({hasText:'FIXTUREONLY'}).waitFor();
  await mobile.evaluate(()=>window.dispatchEvent(new Event('focus')));await mobile.waitForTimeout(100);assert.equal(await mobile.locator('#m-mfa-enrollment').isVisible(),true);
  await mobile.locator('#m-mfa-code').fill('123456');await mobile.locator('#m-mfa-confirm').click();await mobile.locator('#m-mfa-recovery-codes').filter({hasText:'FIXTURE-ONE'}).waitFor();
  await mobile.evaluate(()=>window.dispatchEvent(new Event('focus')));await mobile.waitForTimeout(100);assert.equal(await mobile.locator('#m-mfa-recovery').isVisible(),true);
  active='B';await mobile.evaluate(()=>window.dispatchEvent(new Event('focus')));await mobile.locator('#userName').filter({hasText:'Account B'}).waitFor();assert.equal(await mobile.locator('#m-mfa-recovery-codes').textContent(),'');assert.equal(await mobile.locator('#m-mfa-secret').textContent(),'');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
