import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {PDFDocument} from 'pdf-lib';
import {createHandler} from '../api/intake.js';
import {validateSubmission,receiptEmails} from '../lib/intake-domain.mjs';
import {createIntakePDF} from '../lib/intake-pdf.mjs';
import {hash,decrypt} from '../lib/referral-domain.mjs';

Object.assign(process.env,{DATABASE_URL:'test-only',REFERRAL_ENCRYPTION_KEY:randomBytes(32).toString('base64'),
  RATE_LIMIT_SECRET:randomBytes(32).toString('hex'),RESEND_API_KEY:'mock-only',REFERRAL_EMAIL_FROM:'Agency <test@example.invalid>',
  REFERRAL_NOTIFY_EMAIL:'agency@example.invalid',REFERRAL_ORIGIN:'https://desertshieldinsurance.com'});
function submission(type='trucking'){
  return {requestId:randomUUID(),verificationId:randomUUID(),ticket:randomBytes(32).toString('base64url'),type,version:'1.0',website:'',sharingPermission:true,
    values:{legal_name:'Fictional Test Applicant',contact_name:'Test Contact',email:'prospect@example.invalid',ack_i_have_reviewed_the_information:true}};
}
function response(){
  return {headers:{},code:0,data:null,setHeader(k,v){this.headers[k]=v},status(v){this.code=v;return this},json(v){this.data=v;return this},send(v){this.data=v;return this}};
}
test('server-side validation rejects invalid/untrusted fields',()=>{
  assert.equal(validateSubmission(submission()).values.email,'prospect@example.invalid');
  for(const mutate of [
    p=>p.values.fake='injected',p=>p.values.ack_i_have_reviewed_the_information=false,
    p=>p.sharingPermission=false,p=>p.values.unit1_vin='invalid',
    p=>Object.assign(p.values,{radius_0_50:'25',radius_51_200:'25',radius_201_500:'25',radius_500:'30'}),
    p=>Object.assign(p.values,{driver1_dob:'1980-01-01',driver1_hire:'1970-01-01'}),
    p=>p.values.driver_count='2.5',p=>p.values.business_start='2026-02-31',
    p=>p.values.driver1_dob='2999-01-01',p=>p.values.email='not-an-email'
  ]){const p=submission();mutate(p);assert.throws(()=>validateSubmission(p));}
});
test('real server PDFs include immutable fields and complete answers',async()=>{
  for(const type of ['trucking','personal','business']){
    const p=validateSubmission(submission(type));
    p.values.submission_notes='Complete long answer. '.repeat(80);
    const bytes=await createIntakePDF(p,'DSI-TEST1234'),doc=await PDFDocument.load(bytes);
    assert.equal(doc.getForm().getFields().length,0);
    assert.ok(doc.getPageCount()>(type==='trucking'?10:type==='personal'?7:6));
    assert.ok(bytes.length>10000);
  }
});
test('verified submission, auth, idempotency, encrypted storage and safe downloads',async()=>{
  const db=new PGlite();
  await db.exec(`CREATE ROLE referral_app;CREATE TABLE referral_rate_limits(key text PRIMARY KEY,hits integer,resets_at timestamptz);
    CREATE TABLE referral_sessions(token_hash text PRIMARY KEY,expires_at timestamptz);`);
  await db.exec(await readFile(new URL('../db/002-intake.sql',import.meta.url),'utf8'));
  const sql=async(strings,...values)=>(await db.query(strings.reduce((s,t,i)=>s+(i?'$'+i:'')+t,''),values)).rows;
  const sent=[];let failReceipts=false;
  const handler=createHandler({sqlFactory:()=>sql,mail:async(p,key)=>{sent.push({p,key});return failReceipts&&key.includes('-prospect')?'failed':'accepted';},pdf:async()=>Buffer.from('%PDF-TEST-SNAPSHOT')});
  async function call(action,body,opts={}){
    const req={query:{action},method:opts.method||(body?'POST':'GET'),headers:{origin:'https://desertshieldinsurance.com','content-type':'application/json',...opts.headers},body,socket:{remoteAddress:opts.ip||'test-ip'}};
    const res=response();await handler(req,res);return res;
  }
  assert.equal((await call('config')).data.enabled,true);
  assert.equal((await call('start',{email:'test@example.invalid'},{headers:{origin:'https://evil.invalid'}})).code,403);
  assert.equal((await call('list')).code,401);
  assert.equal((await call('copy',undefined,{headers:{authorization:'Bearer '+randomBytes(32).toString('base64url')}})).code,404);
  const start=await call('start',{email:'prospect@example.invalid'});
  assert.equal(start.code,200);
  const id=start.data.verificationId,code=sent.at(-1).p.text.match(/code is (\d{6})/)[1];
  assert.equal((await call('verify',{verificationId:id,code:'000000'})).code,400);
  const verify=await call('verify',{verificationId:id,code});assert.equal(verify.code,200);
  assert.equal((await call('verify',{verificationId:id,code})).code,400);
  const p=submission();p.verificationId=id;p.ticket=verify.data.ticket;
  const mismatch=structuredClone(p);mismatch.values.email='someoneelse@example.invalid';
  assert.equal((await call('submit',mismatch)).code,403);
  failReceipts=true;
  const result=await call('submit',p);assert.equal(result.code,201);assert.equal(result.data.emailStatus.prospect,'failed');assert.equal(result.data.emailStatus.agency,'accepted');
  const duplicate=await call('submit',p);assert.equal(duplicate.code,200);assert.equal(duplicate.data.id,result.data.id);
  const changed=structuredClone(p);changed.values.legal_name='Changed Applicant';assert.equal((await call('submit',changed)).code,409);
  const rows=(await db.query('SELECT * FROM intake_submissions')).rows;assert.equal(rows.length,1);
  const row=rows[0];assert.ok(!row.private_encrypted.includes('Fictional'));assert.equal(decrypt(row.private_encrypted).values.legal_name,p.values.legal_name);
  assert.ok(!sent.filter(x=>x.key.includes(row.id)).some(x=>x.p.text.includes('Fictional')));
  const privateToken=decrypt(row.email_encrypted).token;
  const copy=await call('copy',undefined,{headers:{authorization:'Bearer '+privateToken}});
  assert.equal(copy.code,200);assert.equal(copy.data.toString(),'%PDF-TEST-SNAPSHOT');assert.match(copy.headers['Cache-Control'],/no-store/);
  assert.equal((await call('download',{id:row.id})).code,401);
  const session=randomBytes(32).toString('base64url');
  await db.query("INSERT INTO referral_sessions VALUES ($1,now()+interval '1 hour')",[hash(session)]);
  const headers={cookie:'__Host-ds-referral='+session};
  assert.equal((await call('list',undefined,{headers})).data[0].name,'Fictional Test Applicant');
  failReceipts=false;
  const retry=await call('resend',{id:row.id},{headers});assert.equal(retry.data.emailStatus.prospect,'accepted');
  assert.equal((await call('download',{id:row.id},{headers})).code,200);
  assert.equal((await call('revoke',{id:row.id},{headers})).code,200);
  assert.equal((await call('copy',undefined,{headers:{authorization:'Bearer '+privateToken}})).code,404);
  assert.equal((await call('resend',{id:row.id},{headers})).code,409);
  await db.query("UPDATE referral_sessions SET expires_at=now()-interval '1 second'");
  assert.equal((await call('list',undefined,{headers})).code,401);
  for(let i=0;i<5;i++)await call('start',{email:'limited@example.invalid'},{ip:'limit-test'});
  assert.equal((await call('start',{email:'limited@example.invalid'},{ip:'limit-test'})).code,429);
  await db.close();
});
