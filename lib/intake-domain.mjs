import { readFileSync } from 'node:fs';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { dateValid } from './referral-domain.mjs';

export const schema = JSON.parse(readFileSync(new URL('../assets/intake/schema.json', import.meta.url)));
export const fieldsFor = type => schema.forms[type]?.pages.flatMap(p=>p.rows.flatMap(r=>r.fields||[]))||[];
export const fail = (status,message)=>Object.assign(new Error(message),{status});
export const keyedHash = value=>createHmac('sha256',process.env.RATE_LIMIT_SECRET).update(value).digest('hex');
export const emailHash = email=>keyedHash('intake-email:'+email);
export const uuid = value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export const validToken = value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
export function normalizeEmail(value){
  if(typeof value!=='string')throw fail(400,'Enter a valid email address.');
  const email=value.trim().toLowerCase();
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail(400,'Enter a valid email address.');
  return email;
}
export function sameHash(a,b){
  return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
}
export function validateSubmission(body){
  if(!uuid(body.requestId)||!uuid(body.verificationId)||!validToken(body.ticket))throw fail(400,'Verify your email before submitting.');
  if(body.website||body.sharingPermission!==true)throw fail(400,'Confirm permission to share the information for this insurance request.');
  if(!Object.hasOwn(schema.forms,body.type)||body.version!==schema.version)throw fail(400,'This form version is no longer supported. Reload the intake page.');
  if(!body.values||typeof body.values!=='object'||Array.isArray(body.values))throw fail(400,'Invalid form details.');
  const fields=fieldsFor(body.type),allowed=new Set(fields.map(f=>f.key)),values={};
  if(Object.keys(body.values).some(k=>!allowed.has(k)))throw fail(400,'The form contains an unrecognized field.');
  for(const f of fields){
    let v=body.values[f.key];
    if(v===undefined)continue;
    if(f.type==='checkbox'){
      if(typeof v!=='boolean')throw fail(400,'Invalid selection: '+f.label);
      values[f.key]=v;continue;
    }
    if(typeof v!=='string'||v.length>(f.type==='textarea'?4000:500)||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v))throw fail(400,'Invalid or oversized answer: '+f.label);
    v=v.trim();
    if(f.required&&!v)throw fail(400,f.label+' is required.');
    if(f.type==='select'&&v&&!f.options.includes(v))throw fail(400,'Choose a listed answer: '+f.label);
    if(f.type==='date'&&v&&!dateValid(v))throw fail(400,'Enter a valid date: '+f.label);
    if(f.type==='number'&&v&&(!Number.isFinite(Number(v))||Number(v)<0))throw fail(400,'Enter a nonnegative number: '+f.label);
    if(['driver_count','power_count','trailer_count'].includes(f.key)&&v&&!Number.isInteger(Number(v)))throw fail(400,f.label+' must be a whole number.');
    values[f.key]=v;
  }
  for(const f of fields.filter(f=>f.required))if(!values[f.key])throw fail(400,f.label+' is required.');
  values.email=normalizeEmail(values.email);
  if(!values.ack_i_have_reviewed_the_information)throw fail(400,'Confirm that you reviewed the information.');
  const vins=Object.entries(values).filter(([k,v])=>k.endsWith('_vin')&&v).map(([k,v])=>{
    const vin=v.toUpperCase();
    if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin))throw fail(400,'A VIN must contain 17 letters/numbers without I, O or Q.');
    values[k]=vin;return vin;
  });
  if(new Set(vins).size!==vins.length)throw fail(400,'Each vehicle or trailer VIN must be unique.');
  for(let i=1;i<=3;i++){
    const dob=values[`driver${i}_dob`],hire=values[`driver${i}_hire`];
    if(dob&&(dob<'1900-01-01'||dob>=new Date().toISOString().slice(0,10)))throw fail(400,'Check the driver date of birth.');
    if(body.type==='trucking'&&dob&&hire&&hire<=dob)throw fail(400,'A driver hire date must be after their date of birth.');
  }
  if(body.type==='trucking'){
    const keys=['radius_0_50','radius_51_200','radius_201_500','radius_500'];
    if(keys.some(k=>values[k])){
      if(keys.some(k=>values[k]===undefined||values[k]===''||Number(values[k])>100)||Math.abs(keys.reduce((s,k)=>s+Number(values[k]),0)-100)>.001)throw fail(400,'Complete all four radius percentages so they total 100%.');
    }
  }
  if(JSON.stringify(values).length>70000)throw fail(413,'The intake is too large. Please shorten long notes.');
  return {type:body.type,version:body.version,values,sharingPermission:true};
}

export function receiptEmails(record,emailInfo,origin,from,agency){
  const reference='DSI-'+record.id.slice(0,8).toUpperCase();
  const label=schema.forms[record.intake_type].short;
  return [
    {audience:'prospect',from,to:[emailInfo.to],subject:'Your Desert Shield insurance intake copy',
      text:`Thank you for completing your insurance intake with Desert Shield Insurance.\n\nYour ${label.toLowerCase()} intake reference is ${reference}.\n\nView and download your completed form:\n${origin}/intake-copy.html#${emailInfo.token}\n\nKeep this private link secure. Anyone with this link can download this form. The link expires 7 days after submission. Contact the agency if you need a correction or replacement link.\n\nSubmitting an intake does not bind or confirm insurance coverage. Coverage requires written confirmation from an authorized representative.\n\nChris Conover\nDesert Shield Insurance LLC\n480.789.1844\nchris@desertshieldinsurance.com`},
    {audience:'agency',from,to:[agency],subject:`New ${label.toLowerCase()} intake | ${reference}`,
      text:`A new ${label.toLowerCase()} intake is ready for review.\n\nReference: ${reference}\n\nSign in to view the completed form:\n${origin}/admin-intake.html\n\nUse your existing agency administrator password and authenticator code. Review unanswered questions and verify all details before submitting to a market.\n\nNo insurance coverage has been bound.`}
  ];
}
