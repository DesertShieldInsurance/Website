import { neon } from '@neondatabase/serverless';
import { randomUUID,randomInt } from 'node:crypto';
import { hash,token,encrypt,decrypt } from '../lib/referral-domain.mjs';
import { fail,keyedHash,emailHash,uuid,validToken,normalizeEmail,sameHash,validateSubmission,receiptEmails,schema } from '../lib/intake-domain.mjs';
import { createIntakePDF } from '../lib/intake-pdf.mjs';

export const config={maxDuration:60};
const required=['DATABASE_URL','REFERRAL_ENCRYPTION_KEY','RATE_LIMIT_SECRET','RESEND_API_KEY','REFERRAL_EMAIL_FROM','REFERRAL_ORIGIN'];
const configured=()=>required.every(k=>process.env[k])&&Buffer.from(process.env.REFERRAL_ENCRYPTION_KEY||'','base64').length===32;
const origin=()=>new URL(process.env.REFERRAL_ORIGIN).origin;
const json=(res,status,data)=>res.status(status).json(data);
const bearer=req=>String(req.headers.authorization||'').replace(/^Bearer /,'');
function assertOrigin(req){
  const url=new URL(origin()),allowed=[url.origin];
  url.hostname=url.hostname.startsWith('www.')?url.hostname.slice(4):'www.'+url.hostname;
  allowed.push(url.origin);
  if(!allowed.includes(req.headers.origin))throw fail(403,'Open this form on the Desert Shield website.');
  if(!String(req.headers['content-type']||'').startsWith('application/json'))throw fail(415,'JSON is required.');
}
function bodyOf(req){
  if(Number(req.headers['content-length']||0)>85000)throw fail(413,'The request is too large.');
  let body;
  try{body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};}catch{throw fail(400,'Invalid request.');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw fail(400,'Invalid request.');
  if(JSON.stringify(body).length>85000)throw fail(413,'The request is too large.');
  return body;
}
async function limit(sql,req,action,max,seconds,identity){
  const ip=String(req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
  const key=keyedHash(`intake:${action}:${identity||ip}`);
  const [r]=await sql`INSERT INTO referral_rate_limits (key,hits,resets_at)
    VALUES (${key},1,now()+${seconds}*interval '1 second')
    ON CONFLICT (key) DO UPDATE SET
    hits=CASE WHEN referral_rate_limits.resets_at<now() THEN 1 ELSE referral_rate_limits.hits+1 END,
    resets_at=CASE WHEN referral_rate_limits.resets_at<now() THEN now()+${seconds}*interval '1 second' ELSE referral_rate_limits.resets_at END
    RETURNING hits`;
  if(r.hits>max)throw fail(429,'Too many attempts. Wait before trying again or call the agency.');
}
async function admin(sql,req){
  const cookie=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-ds-referral='));
  const t=cookie?.split('=')[1];
  if(!validToken(t))throw fail(401,'Sign in with your agency administrator account.');
  const rows=await sql`SELECT token_hash FROM referral_sessions WHERE token_hash=${hash(t)} AND expires_at>now()`;
  if(!rows.length)throw fail(401,'Your administrator session expired. Sign in again.');
}
export async function sendMail(payload,idempotencyKey){
  for(let attempt=0;attempt<2;attempt++){
    try{
      const r=await fetch('https://api.resend.com/emails',{
        method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},
        body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)
      });
      if(r.ok)return 'accepted';
      if(r.status<500&&r.status!==429)return 'failed';
    }catch{/* No customer data, OTPs or credentials are logged. */}
    if(!attempt)await new Promise(r=>setTimeout(r,350));
  }
  return 'failed';
}
async function receipts(sql,row,mail){
  const messages=receiptEmails(row,decrypt(row.email_encrypted),origin(),process.env.REFERRAL_EMAIL_FROM,
    'chris@desertshieldinsurance.com');
  for(const message of messages){
    const {audience,...payload}=message;
    if(row[audience+'_email_status']==='accepted')continue;
    const result=await mail(payload,`intake-${row.id}-${audience}`);
    if(audience==='prospect')await sql`UPDATE intake_submissions SET prospect_email_status=${result} WHERE id=${row.id}`;
    else await sql`UPDATE intake_submissions SET agency_email_status=${result} WHERE id=${row.id}`;
    row[audience+'_email_status']=result;
    await sql`INSERT INTO intake_audit(submission_id,action) VALUES (${row.id},${audience+'_email_'+result})`;
  }
  return {prospect:row.prospect_email_status,agency:row.agency_email_status};
}
function pdfResponse(res,row){
  const bytes=Buffer.from(decrypt(row.pdf_encrypted),'base64');
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`attachment; filename="Desert-Shield-${row.intake_type}-${row.id.slice(0,8)}.pdf"`);
  return res.status(200).send(bytes);
}
export function createHandler({sqlFactory=neon,mail=sendMail,pdf=createIntakePDF}={}){
 return async function handler(req,res){
  for(const [k,v] of Object.entries({'Cache-Control':'no-store, private, max-age=0','Pragma':'no-cache','X-Robots-Tag':'noindex, nofollow, noarchive','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}))res.setHeader(k,v);
  try{
    const action=String(req.query?.action||''),methods={config:'GET',start:'POST',verify:'POST',submit:'POST',copy:'GET',list:'GET',download:'POST',resend:'POST',revoke:'POST'};
    if(!methods[action])return json(res,404,{error:'Not found.'});
    if(req.method!==methods[action]){res.setHeader('Allow',methods[action]);return json(res,405,{error:'Method not allowed.'});}
    if(!configured()||process.env.INTAKE_ENABLED==='false'){
      if(action==='config')return json(res,200,{enabled:false});
      throw fail(503,'Online submission is temporarily unavailable. You can download a draft or call 480.789.1844.');
    }
    const sql=sqlFactory(process.env.DATABASE_URL);
    if(action==='config'){
      const [ready]=await sql`SELECT to_regclass('public.intake_submissions') AS table_name`;
      return json(res,200,{enabled:!!ready.table_name,version:schema.version});
    }
    if(req.method!=='GET')assertOrigin(req);
    const body=req.method==='GET'?{}:bodyOf(req);
    if(action==='start'){
      if(body.website)throw fail(400,'Unable to process this request.');
      const email=normalizeEmail(body.email);
      await limit(sql,req,'start',8,3600);
      await limit(sql,req,'start-email',5,3600,emailHash(email));
      const id=randomUUID(),code=String(randomInt(100000,1000000));
      await sql`INSERT INTO intake_verifications(id,email_hash,email_encrypted,code_hash,expires_at)
        VALUES (${id},${emailHash(email)},${encrypt(email)},${keyedHash(id+':'+code)},now()+interval '10 minutes')`;
      const result=await mail({from:process.env.REFERRAL_EMAIL_FROM,to:[email],subject:'Your Desert Shield verification code',
        text:`Your Desert Shield insurance intake verification code is ${code}.\n\nIt expires in 10 minutes. Enter it only on desertshieldinsurance.com. Do not share this code.\n\nIf you did not request this code, you can ignore this email. No insurance intake has been submitted by this verification request.\n\nDesert Shield Insurance LLC\n480.789.1844`},`intake-verify-${id}`);
      if(result!=='accepted')throw fail(503,'The verification email could not be sent. Your form has not been submitted. Try later or call the agency.');
      return json(res,200,{verificationId:id,expiresIn:600});
    }
    if(action==='verify'){
      await limit(sql,req,'verify',25,900);
      if(!uuid(body.verificationId)||!/^\d{6}$/.test(body.code||''))throw fail(400,'Enter the six-digit code from your email.');
      const [v]=await sql`UPDATE intake_verifications SET attempts=attempts+1
        WHERE id=${body.verificationId} AND expires_at>now() AND attempts<5 AND verified_at IS NULL
        RETURNING code_hash`;
      if(!v||!sameHash(v.code_hash,keyedHash(body.verificationId+':'+body.code)))throw fail(400,'The code is incorrect, expired, or already used. Request a new code if needed.');
      const t=token();
      const claimed=await sql`UPDATE intake_verifications SET ticket_hash=${hash(t)},verified_at=now(),expires_at=now()+interval '30 minutes'
        WHERE id=${body.verificationId} AND verified_at IS NULL RETURNING id`;
      if(!claimed.length)throw fail(400,'This code has already been used.');
      return json(res,200,{ticket:t});
    }
    if(action==='submit'){
      await limit(sql,req,'submit',15,3600);
      const payload=validateSubmission(body),requestHash=keyedHash(JSON.stringify(payload));
      const [verification]=await sql`SELECT id FROM intake_verifications WHERE id=${body.verificationId}
        AND ticket_hash=${hash(body.ticket)} AND verified_at IS NOT NULL AND expires_at>now()
        AND email_hash=${emailHash(payload.values.email)} AND (used_by IS NULL OR used_by=${body.requestId})`;
      if(!verification)throw fail(403,'Email verification expired or does not match this form. Verify the current email address.');
      const [existing]=await sql`SELECT * FROM intake_submissions WHERE request_id=${body.requestId}`;
      if(existing){
        if(existing.request_hash!==requestHash)throw fail(409,'This intake was already saved. Contact the agency about corrections.');
        return json(res,200,{id:existing.id,reference:'DSI-'+existing.id.slice(0,8).toUpperCase(),emailStatus:{prospect:existing.prospect_email_status,agency:existing.agency_email_status},duplicate:true});
      }
      const id=randomUUID(),reference='DSI-'+id.slice(0,8).toUpperCase(),t=token();
      let bytes;
      try{bytes=await pdf(payload,reference);}catch{throw fail(400,'The PDF could not be created. Remove unusual symbols from the answers and try again, or call the agency.');}
      const rows=await sql`WITH verified AS (
        UPDATE intake_verifications SET used_by=${body.requestId}
        WHERE id=${body.verificationId} AND ticket_hash=${hash(body.ticket)} AND expires_at>now()
        AND (used_by IS NULL OR used_by=${body.requestId}) RETURNING id
      ) INSERT INTO intake_submissions(id,request_id,request_hash,intake_type,schema_version,private_encrypted,pdf_encrypted,email_encrypted,token_hash,token_expires_at)
        SELECT ${id},${body.requestId},${requestHash},${payload.type},${payload.version},${encrypt(payload)},${encrypt(bytes.toString('base64'))},
        ${encrypt({to:payload.values.email,token:t})},${hash(t)},now()+interval '7 days' FROM verified
        ON CONFLICT(request_id) DO NOTHING RETURNING *`;
      if(!rows.length)throw fail(409,'A matching request is being processed. Retry once without changing your answers.');
      const row=rows[0];let emailStatus={prospect:'pending',agency:'pending'};
      try{
        await sql`INSERT INTO intake_audit(submission_id,action) VALUES (${id},'submitted_verified_email')`;
        emailStatus=await receipts(sql,row,mail);
      }catch{/* Intake is already saved; never falsely report a failed submission. */}
      return json(res,201,{id,reference,emailStatus});
    }
    if(action==='copy'){
      await limit(sql,req,'copy',30,3600);
      const t=bearer(req);
      if(!validToken(t))throw fail(404,'This download link is invalid or expired.');
      const [row]=await sql`SELECT id,intake_type,pdf_encrypted FROM intake_submissions WHERE token_hash=${hash(t)}
        AND token_expires_at>now() AND token_revoked=false`;
      if(!row)throw fail(404,'This download link is invalid, expired or revoked. Contact the agency for help.');
      await sql`INSERT INTO intake_audit(submission_id,action) VALUES (${row.id},'prospect_pdf_downloaded')`;
      return pdfResponse(res,row);
    }
    await admin(sql,req);
    if(action==='list'){
      const rows=await sql`SELECT id,intake_type,private_encrypted,created_at,prospect_email_status,agency_email_status,token_expires_at,token_revoked
        FROM intake_submissions ORDER BY created_at DESC LIMIT 200`;
      return json(res,200,rows.map(r=>({id:r.id,type:r.intake_type,name:decrypt(r.private_encrypted).values.legal_name,
        createdAt:r.created_at,prospectEmailStatus:r.prospect_email_status,agencyEmailStatus:r.agency_email_status,expiresAt:r.token_expires_at,revoked:r.token_revoked})));
    }
    if(!uuid(body.id))throw fail(400,'Invalid intake reference.');
    const [row]=await sql`SELECT * FROM intake_submissions WHERE id=${body.id}`;
    if(!row)throw fail(404,'Intake not found.');
    if(action==='download'){
      await sql`INSERT INTO intake_audit(submission_id,action) VALUES (${row.id},'admin_pdf_downloaded')`;
      return pdfResponse(res,row);
    }
    if(action==='resend'){
      await limit(sql,req,'retry-mail',10,3600);
      if(row.token_revoked||new Date(row.token_expires_at)<=new Date())throw fail(409,'This link has expired or been revoked. Do not resend it.');
      return json(res,200,{emailStatus:await receipts(sql,row,mail)});
    }
    if(action==='revoke'){
      await sql`UPDATE intake_submissions SET token_revoked=true WHERE id=${row.id}`;
      await sql`INSERT INTO intake_audit(submission_id,action) VALUES (${row.id},'link_revoked')`;
      return json(res,200,{ok:true});
    }
  }catch(e){return json(res,e.status||500,{error:e.status?e.message:'We could not complete this request. Try again or call 480.789.1844.'});}
 };
}
export default createHandler();
