'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const sharp = require('sharp');
const { createAvatarService, managedName } = require('../src/services/avatarService');
const { avatars } = require('../src/services/defaultAvatars');

test('browser avatar crop/upload, failure rollback, mobile security and cross-tab owner-only sync', async t => {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (_) { t.skip('Playwright unavailable'); return; }
  try { await fs.access(chromium.executablePath()); } catch (_) { t.skip('Chromium unavailable'); return; }
  const express = require('express');
  const { createAvatarRouter } = require('../src/routes/avatarRoutes');
  const directory = await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'avatar-browser-'));
  const data = { users:[{ id:'avatar-fixture', name:'Fixture', email:'fixture@example.test', avatar:avatars[0], email_verified:true, created_at:'2025-01-01' }] };
  let fail = false;
  const db = { mutate:async fn => { if (fail) throw Error('fixture failure'); return fn(data); } };
  const app = express(); app.use(express.json());
  app.use((req,res,next) => { req.user = data.users[0]; next(); });
  app.get('/api/auth/me', (req,res) => res.json({status:true,data:data.users[0]}));
  app.get('/api/user/library', (req,res) => res.json({status:true,data:{watchlist:[],history:[],continueWatching:[]}}));
  app.get('/api/user/sessions', (req,res) => res.json({status:true,data:[]}));
  app.get('/api/user/preferences', (req,res) => res.json({status:true,data:{}}));
  app.use('/api', createAvatarRouter(createAvatarService({db,directory})));
  app.use('/media/avatars', express.static(directory));
  app.use(express.static(path.join(__dirname,'../public'), {extensions:['html']}));
  const server = app.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({headless:true});
  const context = await browser.newContext();
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  try {
    const page = await context.newPage();
    const errors=[]; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base+'/tai-khoan');
    await page.waitForFunction(() => document.getElementById('profile-avatar-img').getAttribute('src').includes('vietnam-boy'));
    // Two different accounts with the same name must not share an avatar update.
    const other = await context.newPage();
    await other.goto(base+'/tai-khoan');
    await other.evaluate(() => {
      const one=document.createElement('img');one.id='own-comment';one.dataset.avatarUser='avatar-fixture';one.src='/images/avatars/vietnam-boy-v1.webp';
      const two=document.createElement('img');two.id='other-comment';two.dataset.avatarUser='other-account';two.src='/images/avatars/vietnam-boy-v1.webp';
      document.body.append(one,two);
    });
    await page.locator('.avatar-open').click();
    await page.locator('.avatar-presets button').first().waitFor();
    const original=await page.locator('#profile-avatar-img').getAttribute('src');
    await page.getByRole('button',{name:'Chọn avatar nữ',exact:true}).click();
    assert.equal(await page.locator('#profile-avatar-img').getAttribute('src'),original);
    await page.getByRole('button',{name:'Lưu avatar',exact:true}).click();
    await page.waitForFunction(() => !document.querySelector('.avatar-dialog').open);
    await other.waitForFunction(() => document.getElementById('own-comment').src.includes('vietnam-girl'));
    assert.match(await other.locator('#other-comment').getAttribute('src'),/vietnam-boy/);
    assert.match(await page.locator('#profile-avatar-img').getAttribute('src'),/vietnam-girl/);
    assert.match(await page.locator('#nav-user-avatar').getAttribute('src'),/vietnam-girl/);

    const input=await sharp(Buffer.from('<svg width="800" height="400"><rect width="800" height="400" fill="#e43d45"/><rect width="400" height="200" fill="#35a5cb"/><rect x="400" y="200" width="400" height="200" fill="#f4cf52"/></svg>')).jpeg().withMetadata({orientation:6}).toBuffer();
    await page.locator('.avatar-open').click();
    await page.locator('input[type=file]').setInputFiles({name:'phone.jpg',mimeType:'image/jpeg',buffer:input});
    await page.locator('.avatar-editor').waitFor({state:'visible'});
    await page.getByRole('slider',{name:'Phóng ảnh'}).fill('1.5');
    await page.getByRole('slider',{name:'Vị trí ngang'}).fill('75');
    await page.getByRole('slider',{name:'Vị trí dọc'}).fill('25');
    const previewBytes=Buffer.from((await page.locator('.avatar-editor canvas').evaluate(canvas=>canvas.toDataURL('image/png'))).split(',')[1],'base64');
    const previous=data.users[0].avatar;
    fail=true;
    await page.getByRole('button',{name:'Lưu avatar',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('.avatar-error').textContent && !document.querySelector('.avatar-save').disabled);
    assert.equal(data.users[0].avatar,previous);
    assert.match(await page.locator('#profile-avatar-img').getAttribute('src'),/vietnam-girl/);
    fail=false;
    await page.getByRole('button',{name:'Lưu avatar',exact:true}).click();
    await page.waitForFunction(() => !document.querySelector('.avatar-dialog').open);
    assert.match(data.users[0].avatar,/^\/media\/avatars\/[a-f0-9]{32}\.webp$/);
    const saved=await fs.readFile(path.join(directory,managedName(data.users[0].avatar)));
    const metadata=await sharp(saved).metadata();
    const expected=await sharp(previewBytes).removeAlpha().raw().toBuffer();
    const actual=await sharp(saved).removeAlpha().raw().toBuffer();
    let difference=0;for(let i=0;i<expected.length;i++)difference+=Math.abs(expected[i]-actual[i]);
    assert.ok(difference/expected.length<5,`Server crop differs from oriented browser preview: ${difference/expected.length}`);
    assert.equal(metadata.width,512);assert.equal(metadata.height,512);assert.equal(metadata.exif,undefined);
    await other.waitForFunction(() => document.getElementById('own-comment').src.includes('/media/avatars/'));
    await page.reload();
    await page.waitForFunction(() => document.getElementById('profile-avatar-img').getAttribute('src').startsWith('/media/avatars/'));
    assert.equal(errors.length,0,errors.join('\n'));

    for (const [route,width,height] of [['/tai-khoan',1440,900],['/tai-khoan',320,800],['/mobile/tai-khoan',320,800],['/mobile/tai-khoan',390,844],['/mobile/tai-khoan',820,1180]]) {
      await page.setViewportSize({width,height}); await page.goto(base+route);
      await page.locator('.avatar-open').click();
      await page.locator('.avatar-presets button').first().waitFor();
      await page.locator('input[type=file]').setInputFiles({name:'crop.png',mimeType:'image/png',buffer:await sharp({create:{width:600,height:400,channels:3,background:'#f4b74a'}}).png().toBuffer()});
      await page.locator('.avatar-editor').waitFor({state:'visible'});
      const geometry=await page.locator('.avatar-dialog').evaluate(el => {const r=el.getBoundingClientRect();return {x:r.x,right:r.right,width:innerWidth,overflow:el.scrollWidth>el.clientWidth+1};});
      assert.ok(geometry.x>=0&&geometry.right<=width+1&&!geometry.overflow,JSON.stringify({route,width,geometry}));
      if(process.env.PI_SCRATCH_DIR) await page.screenshot({path:path.join(process.env.PI_SCRATCH_DIR,`avatar-crop-${route.startsWith('/mobile')?'mobile':'desktop'}-${width}.png`)});
      await page.getByRole('button',{name:'Hủy',exact:true}).click();
      if(route.startsWith('/mobile')) {
        await page.locator('#settingDevices').click();
        assert.equal(new URL(page.url()).pathname,'/mobile/tai-khoan');
        await page.locator('#m-security-devices').waitFor({state:'visible'});
        if(process.env.PI_SCRATCH_DIR) await page.screenshot({path:path.join(process.env.PI_SCRATCH_DIR,`account-security-mobile-${width}.png`)});
      }
    }
    assert.equal(errors.length,0,errors.join('\n'));
  } finally {
    await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true,force:true});
  }
});
