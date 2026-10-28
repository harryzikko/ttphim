'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/auth.html'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'public/js/auth.js'), 'utf8');

test('registration requires an explicit gender; switching to login disables hidden radios', async () => {
  const dom = new JSDOM(html, { url: 'http://auth.test/dang-ky', runScripts:'outside-only' });
  const w = dom.window;
  if(w.document.readyState==='loading')await new Promise(resolve=>w.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  const calls=[];
  w.API={register:async(...args)=>{calls.push(args);return {status:false,message:'fixture'};},login:async()=>({status:false})};
  w.eval(controller); w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  try {
    const doc=w.document;
    assert.equal(doc.getElementById('registerGenderField').hidden,false);
    assert.equal(doc.getElementById('genderFemale').required,true);
    doc.getElementById('identityInput').value='fixture@example.test';doc.getElementById('passwordInput').value='fixture-password';
    doc.getElementById('authForm').dispatchEvent(new w.Event('submit',{cancelable:true}));
    await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,0);
    doc.getElementById('genderFemale').checked=true;
    doc.getElementById('authForm').dispatchEvent(new w.Event('submit',{cancelable:true}));
    await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,1);assert.equal(calls[0][3],'female');
    doc.getElementById('tabLoginBtn').click();
    assert.equal(doc.getElementById('registerGenderField').hidden,true);
    assert.equal(doc.getElementById('genderFemale').disabled,true);assert.equal(doc.getElementById('genderFemale').required,false);
  } finally { w.close(); }
});

test('browser registration sends gender through SDK/route/service and receives matching supplied avatar', async t => {
  let chromium;
  try { ({chromium}=require('playwright')); } catch (_) {t.skip('Playwright unavailable');return;}
  if(!fs.existsSync(chromium.executablePath())){t.skip('Chromium unavailable');return;}
  const express=require('express');
  const {createIdentityService}=require('../src/services/identityService');
  const {createIdentityRouter}=require('../src/routes/identityRoutes');
  const {avatars}=require('../src/services/defaultAvatars');
  const data={users:[],comments:[],history:[],watchlist:[]};
  const db={mutate:async fn=>fn(data)};
  const service=createIdentityService({db,mail:{assertReady(){},sendIdentityMail:async()=>({accepted:['fixture']})}});
  const app=express();app.use(express.json());
  const bodies=[];app.use('/api/auth/register',(req,res,next)=>{bodies.push(req.body);next();});
  app.use('/api/auth',createIdentityRouter({service}));
  app.get('/tai-khoan',(req,res)=>res.send('<!doctype html><title>Fixture account</title><p>Registered</p>'));
  app.get('/dang-ky',(req,res)=>res.send(html));
  app.use(express.static(path.join(root,'public')));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext();
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  try {
    const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
    for(const [gender,avatar,width]of [['male',avatars[0],1440],['female',avatars[1],390]]){
      await page.setViewportSize({width,height:900});await page.goto(base+'/dang-ky');
      await page.locator('#registerGenderField').waitFor({state:'visible'});
      await page.locator('#identityInput').fill(`${gender}@example.test`);await page.locator('#passwordInput').fill('fixture-password');await page.locator('#nameInput').fill('Same name');
      const before=bodies.length;
      await page.locator('#authForm').evaluate(form=>form.requestSubmit());
      assert.equal(bodies.length,before);
      await page.locator(gender==='male'?'label[for="genderMale"]':'label[for="genderFemale"]').click();
      const responsePromise=page.waitForResponse(response=>response.url()===base+'/api/auth/register'&&response.request().method()==='POST');
      await page.locator('#authForm button[type="submit"]').click();
      const response=await responsePromise;assert.equal(response.status(),200);
      const result=await response.json();assert.equal(result.data.user.avatar,avatar);assert.equal(result.data.user.gender,gender);
      assert.equal(bodies.at(-1).gender,gender);
      await page.waitForURL(base+'/tai-khoan');
      const cached=await page.evaluate(()=>JSON.parse(localStorage.getItem('kk_user')));assert.equal(cached.gender,gender);assert.equal(cached.avatar,avatar);
    }
    assert.equal(data.users.length,2);assert.equal(data.users[0].gender,'male');assert.equal(data.users[1].gender,'female');
    for(const width of [320,390,820,1440]){
      await page.setViewportSize({width,height:900});await page.goto(base+'/dang-ky');
      await page.locator('#registerGenderField').waitFor({state:'visible'});
      await page.locator('#registerGenderField img').first().evaluate(image=>image.decode());
      const metrics=await page.locator('.auth-gender-options').evaluate(el=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,options:[...el.children].map(label=>({width:label.offsetWidth,height:label.offsetHeight,image:label.querySelector('img').naturalWidth}))}));
      assert.equal(metrics.overflow,false,JSON.stringify({width,metrics}));assert.equal(metrics.options.length,2);
      for(const option of metrics.options){assert.ok(option.height>=44);assert.equal(option.image,512);}
      await page.locator('#genderMale').focus();await page.keyboard.press('Space');assert.equal(await page.locator('#genderMale').isChecked(),true);
      if(process.env.PI_SCRATCH_DIR)await page.screenshot({path:path.join(process.env.PI_SCRATCH_DIR,`registration-gender-${width}.png`),fullPage:true});
      await page.locator('#tabLoginBtn').click();assert.equal(await page.locator('#registerGenderField').isVisible(),false);
    }
    assert.deepEqual(errors,[]);
  } finally {await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
