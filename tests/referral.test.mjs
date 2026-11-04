import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createHandler} from '../api/referral.js';
import {referralSchema,hash,decrypt,publicNotes,legacyNotes,patchSchema} from '../lib/referral-domain.mjs';

Object.assign(process.env,{DATABASE_URL:'test-only',REFERRAL_ENCRYPTION_KEY:randomBytes(32).toString('base64'),
  ADMIN_PASSWORD_HASH:'salt:00',ADMIN_TOTP_SECRET:'JBSWY3DPEHPK3PXP',
  RATE_LIMIT_SECRET:randomBytes(32).toString('hex'),RESEND_API_KEY:'mock-only',REFERRAL_EMAIL_FROM:'Agency <test@example.invalid>',
  REFERRAL_NOTIFY_EMAIL:'agency@example.invalid',REFERRAL_ORIGIN:'https://desertshieldinsurance.com',REFERRALS_ENABLED:'true',REFERRAL_REWARDS_APPROVED:'true'});
const broker={brokerName:'Fictional Partner',brokerCompany:'Fictional Brokerage',brokerEmail:'partner@example.invalid',brokerPhone:'480-555-0100',permission:true,website:''};
const trucking=()=>({requestId:randomUUID(),referralType:'trucking',...broker,insuredName:'Fictional Carrier LLC',dot:'1234567',insuredPhone:'480-555-0101',insuredEmail:'carrier@example.invalid'});
const personal=()=>({requestId:randomUUID(),referralType:'personal',...broker,insuredName:'Fictional Household',insuredPhone:'480-555-0102',insuredEmail:'',coverageNeeds:['Auto','Home'],location:'Mesa, AZ',notes:'Two drivers, renewal next month.'});
const business=()=>({requestId:randomUUID(),referralType:'business',...broker,insuredName:'Fictional Electric LLC',contactName:'Pat Owner',insuredPhone:'',insuredEmail:'owner@example.invalid',operations:'Residential electrical contractor',coverageNeeds:['General liability','Workers’ compensation'],employees:'2 to 5',location:'85201',coverageDate:'2999-01-01'});
function response(){
  return {headers:{},code:0,data:null,setHeader(k,v){this.headers[k]=v},status(v){this.code=v;return this},json(v){this.data=v;return this}};
}
test('referral validation accepts each referral type and rejects stuck-prone gaps only where contact is impossible',()=>{
  assert.equal(referralSchema.safeParse(trucking()).success,true);
  assert.equal(referralSchema.safeParse(personal()).success,true);
  assert.equal(referralSchema.safeParse(business()).success,true);
  const legacy=trucking();delete legacy.referralType;
  assert.equal(referralSchema.parse(legacy).referralType,'trucking');
  const minimal={requestId:randomUUID(),referralType:'personal',...broker,insuredName:'Only A Name',insuredEmail:'reach@example.invalid'};
  assert.equal(referralSchema.safeParse(minimal).success,true,'name plus one contact method is enough');
  for(const mutate of [
    p=>{p.insuredPhone='';p.insuredEmail='';},
    p=>{p.coverageNeeds=['Something invented'];},
    p=>{p.employees='A lot';},
    p=>{p.vins=['1FUJGLDR5CSBF1234'];},
    p=>{p.complete=true;},
    p=>{p.insuredEmail='not-an-email';},
    p=>{p.insuredName='';}
  ]){const p=business();mutate(p);assert.equal(referralSchema.safeParse(p).success,false);}
  for(const mutate of [p=>{p.dot='';},p=>{p.insuredPhone='';},p=>{p.insuredEmail='';}]){const p=trucking();mutate(p);assert.equal(referralSchema.safeParse(p).success,false,'trucking keeps its original requirements');}
  for(const note of [...publicNotes,...legacyNotes])assert.equal(patchSchema.safeParse({id:randomUUID(),version:1,status:'contacted',publicNote:note,rewardStatus:'not_eligible'}).success,true);
});
test('personal and business referrals persist, track and appear in admin alongside trucking',async()=>{
  const db=new PGlite();
  await db.exec(await readFile(new URL('../db/001-referrals.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../db/003-referral-types.sql',import.meta.url),'utf8'));
  const sql=async(strings,...values)=>(await db.query(strings.reduce((s,t,i)=>s+(i?'$'+i:'')+t,''),values)).rows;
  const sent=[];
  const handler=createHandler({sqlFactory:()=>sql,mail:async(p,key)=>{sent.push({p,key});return 'accepted';}});
  async function call(action,body,opts={}){
    const req={query:{action},method:opts.method||(body?'POST':'GET'),headers:{origin:'https://desertshieldinsurance.com','content-type':'application/json',...opts.headers},body,socket:{remoteAddress:opts.ip||'test-ip'}};
    const res=response();await handler(req,res);return res;
  }
  const results={};
  for(const [k,make] of Object.entries({trucking,personal,business})){
    const r=await call('submit',make());assert.equal(r.code,201,JSON.stringify(r.data));results[k]=r.data;
  }
  const rows=(await db.query('SELECT * FROM referrals ORDER BY created_at')).rows;
  assert.deepEqual(rows.map(r=>r.referral_type),['trucking','personal','business']);
  assert.equal(rows.every(r=>r.reward_status==='not_eligible'),true);
  const biz=rows[2];
  assert.ok(!biz.private_encrypted.includes('Electric'));
  assert.equal(decrypt(biz.private_encrypted).operations,'Residential electrical contractor');
  assert.equal(biz.coverage_date instanceof Date?biz.coverage_date.toISOString().slice(0,10):String(biz.coverage_date).slice(0,10),'2999-01-01');
  const personalMail=sent.find(m=>m.p.text.includes('Fictional Household')).p.text;
  assert.match(personalMail,/personal insurance referral/);
  assert.ok(!personalMail.includes('Driver license'));
  assert.match(sent.find(m=>m.p.text.includes('Fictional Carrier')).p.text,/Driver license numbers/);
  const status=await call('status',undefined,{headers:{authorization:'Bearer '+results.personal.token}});
  assert.equal(status.code,200);assert.equal(status.data.referralType,'personal');assert.equal(status.data.company,'Fictional Household');
  assert.equal(Object.keys(status.data).some(k=>/phone|email|notes|location/i.test(k)),false,'tracking page never receives contact details');
  // A trucking submission from a browser that still runs the previous script has no referralType.
  const old=trucking();delete old.referralType;
  assert.equal((await call('submit',old)).code,201);
  const session=randomBytes(32).toString('base64url');
  await db.query("INSERT INTO referral_sessions VALUES ($1,now()+interval '1 hour')",[hash(session)]);
  const headers={cookie:'__Host-ds-referral='+session};
  const list=await call('list',undefined,{headers});
  assert.equal(list.code,200);
  const adminBiz=list.data.find(r=>r.company==='Fictional Electric LLC');
  assert.equal(adminBiz.referralType,'business');assert.equal(adminBiz.private.contactName,'Pat Owner');assert.deepEqual(adminBiz.private.coverageNeeds,['General liability','Workers’ compensation']);
  assert.equal(list.data.filter(r=>r.referralType==='trucking').length,2);
  const update=await call('update',{id:adminBiz.id,version:adminBiz.version,status:'contacted',publicNote:publicNotes[1],rewardStatus:'not_eligible'},{headers,method:'PATCH'});
  assert.equal(update.code,200);assert.equal(update.data.status,'contacted');
  const legacyUpdate=await call('update',{id:adminBiz.id,version:update.data.version,status:'quoted',publicNote:legacyNotes[3],rewardStatus:'not_eligible'},{headers,method:'PATCH'});
  assert.equal(legacyUpdate.code,200);
  assert.equal((await call('update',{id:adminBiz.id,version:legacyUpdate.data.version,status:'quoted',publicNote:legacyNotes[3],rewardStatus:'approved'},{headers,method:'PATCH'})).code,400,'no gift card path for business referrals');
  await db.close();
});
