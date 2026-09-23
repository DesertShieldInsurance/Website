import { neon } from '@neondatabase/serverless';
import { randomUUID, createHmac } from 'node:crypto';
import { referralSchema, patchSchema, publicNotes, hash, token, encrypt, decrypt, verifyPassword, verifyTotp, publicReferral, within30 } from '../lib/referral-domain.mjs';

const required = ['DATABASE_URL','REFERRAL_ENCRYPTION_KEY','ADMIN_PASSWORD_HASH','ADMIN_TOTP_SECRET','RATE_LIMIT_SECRET','RESEND_API_KEY','REFERRAL_EMAIL_FROM','REFERRAL_ORIGIN'];
const cookieName='__Host-ds-referral';
const json=(res,status,value)=>res.status(status).json(value);
const fail=(status,message)=>Object.assign(new Error(message),{status});
function configured(){return required.every(k=>process.env[k])&&Buffer.from(process.env.REFERRAL_ENCRYPTION_KEY||'','base64').length===32;}
function origin(){return new URL(process.env.REFERRAL_ORIGIN).origin;}
function allowedOrigins(){
  const o=new URL(origin());const hosts=new Set([o.host]);
  if(o.hostname.startsWith('www.'))hosts.add(o.host.slice(4));else hosts.add('www.'+o.host);
  return [...hosts].map(h=>`${o.protocol}//${h}`);
}
function assertOrigin(req){
  if(!allowedOrigins().includes(req.headers.origin))throw fail(403,'This request must come from the agency website.');
  if(!String(req.headers['content-type']||'').startsWith('application/json'))throw fail(415,'JSON is required.');
}
function parseBody(req){
  if(Number(req.headers['content-length']||0)>100000)throw fail(413,'The submission is too large.');
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(JSON.stringify(body||{}).length>100000)throw fail(413,'The submission is too large.');
  return body||{};
}
function idCheck(id){if(!/^[a-f0-9-]{36}$/.test(id||''))throw fail(400,'Invalid referral.');return id;}
async function limit(sql,req,action,max,seconds){
  // Trust Vercel's overwritten client IP header, not an arbitrary forwarded-for value.
  const ip=String(req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
  const key=createHmac('sha256',process.env.RATE_LIMIT_SECRET).update(`${action}:${ip}`).digest('hex');
  const [r]=await sql`INSERT INTO referral_rate_limits (key,hits,resets_at)
    VALUES (${key},1,now()+${seconds}*interval '1 second')
    ON CONFLICT (key) DO UPDATE SET
      hits=CASE WHEN referral_rate_limits.resets_at < now() THEN 1 ELSE referral_rate_limits.hits+1 END,
      resets_at=CASE WHEN referral_rate_limits.resets_at < now() THEN now()+${seconds}*interval '1 second' ELSE referral_rate_limits.resets_at END
    RETURNING hits`;
  if(r.hits>max)throw fail(429,'Too many attempts. Please wait before trying again.');
}
async function admin(sql,req){
  const c=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(`${cookieName}=`));
  if(!c)throw fail(401,'Sign in to manage referrals.');
  const value=c.slice(cookieName.length+1);
  if(!/^[A-Za-z0-9_-]{43}$/.test(value))throw fail(401,'Sign in to manage referrals.');
  const rows=await sql`SELECT token_hash FROM referral_sessions WHERE token_hash=${hash(value)} AND expires_at>now()`;
  if(!rows.length)throw fail(401,'Sign in to manage referrals.');
  return hash(value);
}
function adminRow(r){
  const privateData=decrypt(r.private_encrypted);
  const {vins,drivers,...contact}=privateData;
  delete contact.requestId;delete contact.website;
  return {...publicReferral(r),private:contact,version:r.version,emailStatus:r.email_status,tokenRevoked:r.token_revoked};
}
function trackingURL(t){return `${origin()}/referral-status.html#/status/${t}`;}
async function sendConfirmation(sql,r,force=false){
  if(r.email_status==='accepted'&&!force)return 'accepted';
  if(r.token_revoked||new Date(r.token_expires_at)<=new Date())throw fail(409,'This tracking link is revoked or expired. Do not resend it.');
  const info=decrypt(r.email_encrypted);
  let status='failed';
  try{
    const body={
      from:process.env.REFERRAL_EMAIL_FROM,
      to:[info.to],
      subject:'Your Desert Shield referral was received',
      text:`Thank you for the introduction.\n\nWe received your referral for ${r.company}. Our team will contact the carrier about their insurance needs.\n\nFollow the referral's progress here:\n${trackingURL(info.token)}\n\nKeep this link private. Anyone with it can view this referral's limited status. It expires after 90 days. Driver license numbers and dates of birth are never shown on this page.\n\n${r.reward_status==='pending_review'?'Your proposed $25 gift card is pending verification of a complete, eligible submission. It does not depend on a policy purchase.\n\n':''}A referral is not a quote or binder. Coverage is not in force until the agency confirms it.\n\nChris Conover\nDesert Shield Insurance\n480.789.1844\nChris@desertshieldinsurance.com`
    };
    if(process.env.REFERRAL_NOTIFY_EMAIL)body.bcc=[process.env.REFERRAL_NOTIFY_EMAIL];
    const response=await fetch('https://api.resend.com/emails',{
      method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':force?`referral-${r.id}-${randomUUID()}`:`referral-${r.id}`},
      body:JSON.stringify(body),signal:AbortSignal.timeout(12000)
    });
    if(response.ok)status='accepted';
  }catch{/* Never log email payloads, tokens, or provider credentials. */}
  await sql`UPDATE referrals SET email_status=${status} WHERE id=${r.id}`;
  await sql`INSERT INTO referral_audit (referral_id,action) VALUES (${r.id},${'confirmation_email_'+status})`;
  return status;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private, max-age=0');
  res.setHeader('Pragma','no-cache');
  res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Content-Type-Options','nosniff');
  try{
    const action=String(req.query?.action||'');
    const method=req.method;
    const methods={config:'GET',status:'GET',submit:'POST',login:'POST',logout:'POST',list:'GET',update:'PATCH',packet:'POST',resend:'POST'};
    if(!methods[action])return json(res,404,{error:'Not found.'});
    if(method!==methods[action]){res.setHeader('Allow',methods[action]);return json(res,405,{error:'Method not allowed.'});}
    if(action==='config')return json(res,200,{enabled:configured()&&process.env.REFERRALS_ENABLED==='true',rewards:process.env.REFERRAL_REWARDS_APPROVED==='true'});
    if(!configured())throw fail(503,'Online referrals are being set up. Please call the agency.');
    const sql=neon(process.env.DATABASE_URL);
    if(method!=='GET')assertOrigin(req);
    const body=method==='GET'?{}:parseBody(req);
    if(action==='submit'){
      if(process.env.REFERRALS_ENABLED!=='true')throw fail(503,'Online referrals are not enabled yet.');
      await limit(sql,req,'submit',20,3600);
      const parsed=referralSchema.safeParse(body);
      if(!parsed.success)throw fail(400,parsed.error.issues[0]?.message||'Please check the referral details.');
      const p=parsed.data, requestHash=hash(JSON.stringify(p));
      let [existing]=await sql`SELECT * FROM referrals WHERE request_id=${p.requestId}`;
      if(existing){
        if(existing.request_hash!==requestHash)throw fail(409,'This submission was already saved with different details. Refresh to start a new referral.');
        if(existing.token_revoked||new Date(existing.token_expires_at)<=new Date())throw fail(409,'This submission is already saved. Please contact the agency for status access.');
        const info=decrypt(existing.email_encrypted);
        return json(res,200,{id:existing.id,token:info.token,trackingUrl:trackingURL(info.token),emailStatus:existing.email_status});
      }
      const id=randomUUID(), t=token();
      const reward=p.complete&&within30(p.coverageDate)&&process.env.REFERRAL_REWARDS_APPROVED==='true'?'pending_review':'not_eligible';
      const secret=encrypt(p),emailInfo=encrypt({to:p.brokerEmail,token:t});
      const rows=await sql`WITH added AS (
        INSERT INTO referrals (id,request_id,request_hash,token_hash,token_expires_at,company,private_encrypted,coverage_date,vehicle_count,driver_count,packet_complete,reward_status,email_encrypted)
        VALUES (${id},${p.requestId},${requestHash},${hash(t)},now()+interval '90 days',${p.insuredName},${secret},${p.coverageDate||null},${p.vins.length},${p.drivers.length},${p.complete},${reward},${emailInfo})
        ON CONFLICT (request_id) DO NOTHING RETURNING *
      ), activity AS (
        INSERT INTO referral_events (referral_id,status,note,actor) SELECT id,'received',${publicNotes[0]},'submission' FROM added
      ) SELECT * FROM added`;
      if(!rows.length)throw fail(409,'A matching submission is being saved. Try again in a moment.');
      const r=rows[0],emailStatus=await sendConfirmation(sql,r);
      return json(res,201,{id,token:t,trackingUrl:trackingURL(t),emailStatus});
    }
    if(action==='status'){
      await limit(sql,req,'status',180,60);
      const t=String(req.headers.authorization||'').replace(/^Bearer /,'');
      if(!/^[A-Za-z0-9_-]{43}$/.test(t))throw fail(404,'This link is invalid, expired, or revoked.');
      const [r]=await sql`SELECT id,company,status,public_note,created_at,updated_at,packet_complete,vehicle_count,driver_count,reward_status FROM referrals WHERE token_hash=${hash(t)} AND token_expires_at>now() AND token_revoked=false`;
      if(!r)throw fail(404,'This link is invalid, expired, or revoked.');
      const events=await sql`SELECT status,note,created_at FROM referral_events WHERE referral_id=${r.id} ORDER BY created_at,id`;
      return json(res,200,publicReferral(r,events));
    }
    if(action==='login'){
      await limit(sql,req,'login',8,900);
      if(typeof body.password!=='string'||body.password.length>1024||typeof body.code!=='string')throw fail(401,'The password or authenticator code was not accepted.');
      const pass=verifyPassword(body.password,process.env.ADMIN_PASSWORD_HASH);
      const step=verifyTotp(body.code,process.env.ADMIN_TOTP_SECRET);
      if(!pass||step===null)throw fail(401,'The password or authenticator code was not accepted.');
      const used=await sql`INSERT INTO referral_totp_used (step,expires_at) VALUES (${step},now()+interval '2 minutes') ON CONFLICT DO NOTHING RETURNING step`;
      if(!used.length)throw fail(401,'Wait for a new authenticator code and try again.');
      const t=token();
      await sql`INSERT INTO referral_sessions (token_hash,expires_at) VALUES (${hash(t)},now()+interval '8 hours')`;
      res.setHeader('Set-Cookie',`${cookieName}=${t}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);
      return json(res,200,{ok:true});
    }
    const sessionHash=await admin(sql,req);
    if(action==='logout'){
      await sql`DELETE FROM referral_sessions WHERE token_hash=${sessionHash}`;
      res.setHeader('Set-Cookie',`${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
      return json(res,200,{ok:true});
    }
    if(action==='list'){
      const rows=await sql`SELECT * FROM referrals ORDER BY created_at DESC LIMIT 200`;
      return json(res,200,rows.map(adminRow));
    }
    if(action==='update'){
      const result=patchSchema.safeParse(body);
      if(!result.success)throw fail(400,'Choose a valid status and next step.');
      const p=result.data;
      const [previous]=await sql`SELECT * FROM referrals WHERE id=${p.id}`;
      if(!previous)throw fail(404,'Referral not found.');
      if(['approved','sent'].includes(p.rewardStatus)&&p.rewardStatus!==previous.reward_status){
        if(!previous.packet_complete||previous.reward_status==='not_eligible'||process.env.REFERRAL_REWARDS_APPROVED!=='true')throw fail(400,'This referral is not eligible for a gift-card approval.');
        if(p.rewardStatus==='sent'&&previous.reward_status!=='approved')throw fail(400,'Approve the gift card before marking it sent.');
      }
      if(previous.reward_status==='sent'&&p.rewardStatus!=='sent')throw fail(400,'A sent gift card cannot be undone here.');
      const rows=await sql`WITH changed AS (
        UPDATE referrals SET status=${p.status},public_note=${p.publicNote},reward_status=${p.rewardStatus},token_revoked=(token_revoked OR ${p.revoke||false}),updated_at=now(),version=version+1
        WHERE id=${p.id} AND version=${p.version} RETURNING *
      ), activity AS (
        INSERT INTO referral_events (referral_id,status,note) SELECT id,status,public_note FROM changed WHERE ${previous.status!==p.status||previous.public_note!==p.publicNote}
      ), audit AS (
        INSERT INTO referral_audit (referral_id,action) SELECT id,${p.revoke?'tracking_revoked':`updated:${p.status}:${p.rewardStatus}`} FROM changed
      ) SELECT * FROM changed`;
      if(!rows.length)throw fail(409,'This referral changed in another window. Refresh before saving.');
      return json(res,200,adminRow(rows[0]));
    }
    if(action==='packet'){
      const id=idCheck(body.id);
      const [r]=await sql`SELECT private_encrypted FROM referrals WHERE id=${id}`;
      if(!r)throw fail(404,'Referral not found.');
      await sql`INSERT INTO referral_audit (referral_id,action) VALUES (${id},'sensitive_packet_viewed')`;
      const p=decrypt(r.private_encrypted);
      return json(res,200,{vins:p.vins,drivers:p.drivers});
    }
    if(action==='resend'){
      await limit(sql,req,'resend',10,3600);
      const id=idCheck(body.id);
      const [r]=await sql`SELECT * FROM referrals WHERE id=${id}`;
      if(!r)throw fail(404,'Referral not found.');
      return json(res,200,{emailStatus:await sendConfirmation(sql,r,true)});
    }
  }catch(e){
    // Deliberately avoid logging requests, SQL parameters, private fields, or bearer links.
    return json(res,e.status||500,{error:e.status?e.message:'We could not complete this request. Please try again or call the agency.'});
  }
}
