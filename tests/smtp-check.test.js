'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkSmtp } = require('../scripts/check-smtp.cjs');
const env = { SMTP_HOST:'smtp.example.test', SMTP_FROM:'test@example.test', SMTP_USER:'fixture', SMTP_PASS:'fixture-secret' };
test('SMTP diagnostic reports missing configuration without loading secrets or creating a transport', async () => {
  const result = await checkSmtp({ env:{}, argv:[], createTransport:() => { throw Error('must not connect'); } });
  assert.equal(result.stage,'configuration'); assert.equal(result.ok,false); assert.ok(result.missing.includes('SMTP_HOST'));
});
test('SMTP verify sends nothing by default and requires explicit recipient for send', async () => {
  let verified=0, sent=0, closed=0;
  const createTransport = options => { assert.equal(options.requireTLS,true); assert.equal(options.tls.rejectUnauthorized,true); return { verify:async()=>verified++, sendMail:async()=>{sent++;return {accepted:['test@example.test']};},close:()=>closed++ }; };
  assert.equal((await checkSmtp({env,argv:[],createTransport})).stage,'transport_verified');
  assert.equal(sent,0); assert.equal(verified,1); assert.equal(closed,1);
  assert.equal((await checkSmtp({env,argv:['--send'],createTransport})).ok,false); assert.equal(verified,1);
  const accepted=await checkSmtp({env,argv:['--send','--to','test@example.test'],createTransport});
  assert.equal(accepted.stage,'message_accepted'); assert.equal(accepted.delivered,false); assert.equal(sent,1);
});
test('SMTP errors are redacted and rejected recipients never imply delivery', async () => {
  const failure=await checkSmtp({env,argv:[],createTransport:()=>({verify:async()=>{throw Object.assign(Error(env.SMTP_PASS),{code:'EAUTH'});}})});
  assert.equal(failure.code,'EAUTH'); assert.doesNotMatch(JSON.stringify(failure),/fixture-secret/);
  const rejected=await checkSmtp({env,argv:['--send','--to','test@example.test'],createTransport:()=>({verify:async()=>{},sendMail:async()=>({accepted:[],rejected:['test@example.test']})})});
  assert.equal(rejected.ok,false); assert.equal(rejected.delivered,false);
});
