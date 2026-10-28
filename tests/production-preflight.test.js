const test=require('node:test');
const assert=require('node:assert/strict');
const {inspect}=require('../scripts/production-preflight.cjs');
test('preflight fails closed for missing production settings and never serializes secret values',()=>{
 const result=inspect({});assert.equal(result.ready,false);assert.ok(result.checks.some(item=>item.id==='public_origin'&&!item.ok));
 const env={PUBLIC_ORIGIN:'https://cineviet.test',JWT_SECRET:'secret-signing-value-'.repeat(3),DB_PATH:process.platform==='win32'?'C:\\persistent\\film.json':'/persistent/film.json',MFA_ENCRYPTION_KEY:'ab'.repeat(32),REQUIRE_VERIFIED_EMAIL:'true',REQUIRE_ADMIN_MFA:'true',SMTP_HOST:'smtp.test',SMTP_FROM:'sender@example.test',SMTP_USER:'smtp-user',SMTP_PASS:'never-print-this',BACKUP_DIR:process.platform==='win32'?'C:\\backups':'/backups',BACKUP_ENCRYPTION_KEY:'cd'.repeat(32)};
 const good=inspect(env);assert.equal(good.ready,true);for(const key of ['JWT_SECRET','MFA_ENCRYPTION_KEY','SMTP_PASS','BACKUP_ENCRYPTION_KEY'])assert.ok(!JSON.stringify(good).includes(env[key]));
 assert.equal(inspect({...env,PUBLIC_ORIGIN:'http://localhost:3001'}).ready,false);
 assert.equal(inspect({...env,TRUST_PROXY:'true'}).ready,false);
 assert.equal(inspect({...env,BACKUP_ENCRYPTION_KEY:env.MFA_ENCRYPTION_KEY}).ready,false);
 assert.equal(inspect({...env,DEPLOYMENT_MODE:'replicated'}).ready,false);
 assert.ok(good.externalAcceptance.length>0);
});
