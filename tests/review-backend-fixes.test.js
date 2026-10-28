'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {hashPassword,verifyPassword,passwordValid}=require('../src/services/passwordService');
const dbService=require('../src/services/dbService');
const {createIdentityService}=require('../src/services/identityService');
const {createIdentityRouter}=require('../src/routes/identityRoutes');
const express=require('express');
const prototype=Object.getPrototypeOf(dbService);
function fixture(){const data={users:[],history:[],watchlist:[],comments:[]};return {data,db:{read:async()=>data,write:async()=>data,mutate:async fn=>fn(data)}};}
async function listen(app,run){const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));try{return await run(`http://127.0.0.1:${server.address().port}`);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}}
test('all password write paths enforce 6-256 without revoking a rejected change',async()=>{
 const {data,db}=fixture();data.users.push({id:'one',email:'one@example.test',password:await hashPassword('old-password'),token_version:4});
 for(const password of ['short','x'.repeat(257)]){
  assert.equal(passwordValid(password),false);
  assert.equal((await prototype.changePassword.call(db,'one','old-password',password)).status,false);
  await assert.rejects(prototype.updateUser.call(db,'one',{password}),/256/);
  await assert.rejects(prototype.createUser.call(db,{email:'new@example.test',password}),/256/);
  await assert.rejects(prototype.createUserByAdmin.call(db,{email:'admin-created@example.test',password}),/256/);
 }
 assert.equal(data.users[0].token_version,4);assert.equal(await verifyPassword('old-password',data.users[0].password),true);
 const password='x'.repeat(256);assert.equal((await prototype.changePassword.call(db,'one','old-password',password)).status,true);
 const service=createIdentityService({db,mail:{assertReady(){},sendIdentityMail:async()=>{}}});
 const login=await service.login({email:'one@example.test',password},{ip:'fixture'});assert.equal(login.user.id,'one');
});
test('SMTP failure after commit creates a recoverable signed-in account, then resend works',async()=>{
 const {data,db}=fixture();let offline=true;
 const mail={assertReady(){},sendIdentityMail:async()=>{if(offline)throw Error('private transport details');}};
 const service=createIdentityService({db,mail});const app=express();app.use(express.json());app.use('/api/auth',createIdentityRouter({service}));
 await listen(app,async base=>{
  const response=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'mail@example.test',password:'fixture-password',gender:'female'})});
  const result=await response.json();assert.equal(response.status,200);assert.equal(result.status,true);assert.equal(result.data.verificationPending,true);assert.match(result.message,/Tài khoản đã tạo/);assert.doesNotMatch(JSON.stringify(result),/private transport/);assert.match(response.headers.get('set-cookie'),/HttpOnly/);
  assert.equal(data.users.length,1);assert.equal(data.users[0].email_verified,false);assert.equal(data.identity_tokens.length,0);assert.equal(data.identity_sessions.length,1);
  offline=false;await service.requestVerification(result.data.user.id,{ip:'fixture'});assert.equal(data.identity_tokens.length,1);
  assert.equal((await service.login({email:'mail@example.test',password:'fixture-password'},{ip:'fixture'})).user.id,result.data.user.id);
 });
});
test('unconfigured mail fails before account creation',async()=>{
 const {data,db}=fixture();const service=createIdentityService({db,mail:{assertReady(){throw Error('unconfigured');}}});
 await assert.rejects(service.register({email:'none@example.test',password:'fixture-password'}),/unconfigured/);assert.equal(data.users.length,0);
});
test('trusted cross-origin PATCH and account binding pass preflight; untrusted origin stays blocked',async()=>{
 const config=require('../src/config'),security=require('../src/services/requestSecurity');const origin='https://web-fixture.example.test';config.ALLOWED_ORIGINS.push(origin);
 try{const app=express();app.use(security.corsMiddleware,security.originGuard);app.use((req,res,next)=>{req.user={id:'B'};next();});app.use(security.accountGuard);let writes=0;app.patch('/user/preferences',(req,res)=>{writes++;res.json({status:true});});
 await listen(app,async base=>{
  const preflight=await fetch(base+'/user/preferences',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'PATCH','Access-Control-Request-Headers':'content-type,x-account-id'}});
  assert.equal(preflight.headers.get('access-control-allow-origin'),origin);assert.match(preflight.headers.get('access-control-allow-methods'),/PATCH/);assert.match(preflight.headers.get('access-control-allow-headers'),/X-Account-ID/i);
  const stale=await fetch(base+'/user/preferences',{method:'PATCH',headers:{Origin:origin,'X-Account-ID':'A'}});assert.equal(stale.status,409);assert.equal((await stale.json()).code,'ACCOUNT_CHANGED');assert.equal(writes,0);
  assert.equal((await fetch(base+'/user/preferences',{method:'PATCH',headers:{Origin:origin,'X-Account-ID':'B'}})).status,200);assert.equal(writes,1);
  assert.equal((await fetch(base+'/user/preferences',{method:'PATCH',headers:{Origin:'https://untrusted.example.test','X-Account-ID':'B'}})).status,403);assert.equal(writes,1);
 });}finally{config.ALLOWED_ORIGINS.splice(config.ALLOWED_ORIGINS.indexOf(origin),1);}
});
