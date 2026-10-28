'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const sharp=require('sharp');
const {createAvatarService,MAX_BYTES,managedName}=require('../src/services/avatarService');
const {avatars,avatarFor,avatarForGender}=require('../src/services/defaultAvatars');
async function fixture(){const directory=await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR||os.tmpdir(),'avatar-test-'));const data={users:[{id:'one',avatar:avatars[0]},{id:'two',avatar:avatars[1]}]};let fail=false;const db={async mutate(fn){if(fail)throw Error('DB unavailable');return fn(data);}};return{directory,data,service:createAvatarService({db,directory}),fail:()=>{fail=true;},close:()=>fs.rm(directory,{recursive:true,force:true})};}
const picture=()=>sharp({create:{width:800,height:400,channels:3,background:'#ea3344'}}).png().withMetadata().toBuffer();
test('two supplied default avatars follow gender and preserve custom avatars',async()=>{
 assert.equal(avatars.length,2);assert.equal(avatarForGender('male'),avatars[0]);assert.equal(avatarForGender('female'),avatars[1]);
 assert.equal(avatarFor({id:'old'}),avatarFor({id:'old'}));assert.equal(avatarFor({id:'old',avatar:'https://images.test/custom.jpg'}),'https://images.test/custom.jpg');
 assert.equal(avatarFor({id:'old',avatar:'/images/avatars/chibi-lan-v1.svg'}),avatars[1]);assert.equal(avatarFor({gender:'male',avatar:'/images/avatars/chibi-mai-v2.svg'}),avatars[0]);
 assert.equal(avatarFor({id:'old',avatar:'/media/avatars/'+'a'.repeat(32)+'.webp'}),'/media/avatars/'+'a'.repeat(32)+'.webp');
 for(const file of avatars){const metadata=await sharp(path.join(__dirname,'../public',file)).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.width,512);assert.equal(metadata.height,512);assert.equal(metadata.exif,undefined);}
 for(const file of avatars)for(const size of [40,72,512]){const rendered=await sharp(path.join(__dirname,'../public',file)).resize(size,size).png().toBuffer();const info=await sharp(rendered).metadata();assert.equal(info.width,size);assert.equal(info.height,size);}
});
test('server crops/reencodes image to metadata-free WebP and commits only its own account',async()=>{
 const f=await fixture();try{
  const result=await f.service.upload('one',await picture(),{left:.25,top:0,width:.5,height:1});assert.match(result.avatar,/^\/media\/avatars\/[a-f0-9]{32}\.webp$/);assert.equal(f.data.users[1].avatar,avatars[1]);
  const metadata=await sharp(await fs.readFile(path.join(f.directory,managedName(result.avatar)))).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.width,512);assert.equal(metadata.height,512);assert.equal(metadata.exif,undefined);
  const previous=result.avatar;await f.service.choose('one',avatars[1]);assert.equal(f.data.users[0].avatar,avatars[1]);assert.equal((await fs.readdir(f.directory)).length,0);assert.equal(managedName(previous).length,37);
 }finally{await f.close();}
});
test('invalid, huge, animated, tiny and malformed crop inputs leave old avatar and no files',async()=>{
 const f=await fixture();try{
  const original=f.data.users[0].avatar;
  const inputs=[Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"></svg>'),Buffer.from('not an image'),await sharp({create:{width:8,height:8,channels:3,background:'red'}}).png().toBuffer(),await sharp({create:{width:6000,height:4000,channels:3,background:'red'}}).png().toBuffer(),Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64')];
  for(const buffer of inputs)await assert.rejects(f.service.upload('one',buffer),e=>e.status===400);
  await assert.rejects(f.service.upload('one',Buffer.alloc(MAX_BYTES+1)),e=>e.status===413);
  for(const crop of [{left:-1,top:0,width:1,height:1},{left:0,top:0,width:1,height:1},{left:0,top:0,width:.5,height:1,extra:1},{left:0,top:0,width:NaN,height:1}])await assert.rejects(f.service.upload('one',await picture(),crop),e=>e.status===400);
  assert.equal(f.data.users[0].avatar,original);assert.equal((await fs.readdir(f.directory)).length,0);
 }finally{await f.close();}
});
test('failed DB commit and invalid account remove newly written file without changing an old avatar',async()=>{
 const f=await fixture();try{const old=f.data.users[0].avatar;await assert.rejects(f.service.upload('missing',await picture()),e=>e.status===401);assert.equal((await fs.readdir(f.directory)).length,0);f.fail();await assert.rejects(f.service.upload('one',await picture()),/DB unavailable/);assert.equal(f.data.users[0].avatar,old);assert.equal((await fs.readdir(f.directory)).length,0);await assert.rejects(f.service.choose('one','/media/avatars/'+'a'.repeat(32)+'.webp'),e=>e.status===400);}finally{await f.close();}
});
test('upload endpoint requires image media type, limits bytes and redacts service failures',async()=>{
 const express=require('express'),{createAvatarRouter}=require('../src/routes/avatarRoutes');let calls=0;const app=express();app.use(express.json());app.use((req,res,next)=>{if(req.get('authorization')!=='Bearer fixture')return res.status(401).json({status:false});req.user={id:'one'};next();});app.use('/api',createAvatarRouter({upload:async(id,buffer,crop)=>{calls++;assert.equal(id,'one');assert.ok(Buffer.isBuffer(buffer));assert.equal(crop.width,.5);return{id,avatar:avatars[0]};},choose:async()=>{throw Error('private internal message');}}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api/user/avatar`;
 try{
  assert.equal((await fetch(base,{method:'POST',body:'x'})).status,401);assert.equal(calls,0);
  assert.equal((await fetch(base,{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'image/svg+xml'},body:'<svg/>'})).status,415);
  const response=await fetch(base+'?crop='+encodeURIComponent(JSON.stringify({left:.25,top:0,width:.5,height:1})),{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'image/png'},body:await picture()});assert.equal(response.status,200);assert.equal(calls,1);
  assert.equal((await fetch(base,{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'image/png'},body:Buffer.alloc(MAX_BYTES+1)})).status,413);
  const failed=await fetch(base+'/default',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({avatar:avatars[0]})});assert.equal(failed.status,500);assert.doesNotMatch(await failed.text(),/private internal/);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('partial disk write failures clean up the file and preserve the committed avatar',async t=>{
 const f=await fixture();try{
  const original=fs.writeFile;
  t.mock.method(fs,'writeFile',async(file,bytes,options)=>{await original(file,bytes.subarray(0,8),options);throw Object.assign(Error('disk full'),{code:'ENOSPC'});});
  await assert.rejects(f.service.upload('one',await picture()),/disk full/);
  assert.equal(f.data.users[0].avatar,avatars[0]);assert.deepEqual(await fs.readdir(f.directory),[]);
 }finally{t.mock.restoreAll();await f.close();}
});
test('concurrent avatar saves leave only the currently committed file',async()=>{
 const f=await fixture();try{
  await Promise.all([f.service.upload('one',await picture()),f.service.upload('one',await picture())]);
  assert.deepEqual(await fs.readdir(f.directory),[managedName(f.data.users[0].avatar)]);
 }finally{await f.close();}
});
test('profile forms cannot restore stale or foreign avatar URLs',async()=>{
 const source=await fs.readFile(path.join(__dirname,'../src/routes/apiRoutes.js'),'utf8');
 const block=source.slice(source.indexOf("router.post('/user/profile'"),source.indexOf('// --- ADMIN MANAGEMENT'));
 assert.doesNotMatch(block,/avatar:\s*avatar|req\.user\.avatar/);
 assert.match(block,/const \{ name \} = req\.body/);
});
test('existing comments and replies resolve the current owner avatar, not the old snapshot',async()=>{
 const dbService=require('../src/services/dbService');
 const data={users:[{id:'one',avatar:avatars[1]}],comments:[{id:'c1',movie_slug:'fixture',user_id:'one',user_avatar:avatars[0],content:'hello',replies:[{id:'r1',user_id:'one',user_avatar:avatars[0],content:'reply'}]}]};
 const comments=await Object.getPrototypeOf(dbService).getComments.call({read:async()=>data},'fixture','one');
 assert.equal(comments[0].user_avatar,avatars[1]);assert.equal(comments[0].replies[0].user_avatar,avatars[1]);
 assert.equal(data.comments[0].user_avatar,avatars[0]);
});
