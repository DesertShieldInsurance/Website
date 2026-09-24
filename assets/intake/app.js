'use strict';
let schema, type='trucking', step=0, state={trucking:{},personal:{},business:{}}, exporting=false;
const ASSETS='/assets/intake/';
let liveEnabled=false,verification={},sending=false;
const submitted={},requestIds={trucking:crypto.randomUUID(),personal:crypto.randomUUID(),business:crypto.randomUUID()};
async function api(action,body){
  const r=await fetch('/api/intake?action='+action,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},
    credentials:'same-origin',cache:'no-store',body:body?JSON.stringify(body):undefined});
  const result=await r.json().catch(()=>({error:'The service could not be reached. Please try again.'}));
  if(!r.ok)throw new Error(result.error||'Please try again.');
  return result;
}
const $=id=>document.getElementById(id);
const el=(tag,props={},text)=>{const n=document.createElement(tag);Object.assign(n,props);if(text!==undefined)n.textContent=text;return n};
const allFields=form=>form.pages.flatMap(p=>p.rows.flatMap(r=>r.fields||[]));
const form=()=>schema.forms[type];
const values=()=>state[type];
function status(message,error=false){$('status').textContent=message;$('status').className=error?'error':'';}
function saveBlob(blob,name){
  const url=URL.createObjectURL(blob),a=el('a',{href:url,download:name});
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function render(){
  const f=form(),review=step===f.pages.length;
  $('steps').replaceChildren();
  [...f.pages.map(p=>p.title),'Review & submit'].forEach((title,i)=>{
    const b=el('button',{type:'button',className:'step'+(i===step?' current':'')});
    b.append(el('span',{className:'num'},String(i+1).padStart(2,'0')),el('span',{},title));
    if(i===step)b.setAttribute('aria-current','step');
    b.onclick=()=>{step=i;status('');render();$('main').focus()};
    $('steps').append(b);
  });
  $('progressText').textContent=`${f.short} intake · ${review?'Review':`Section ${step+1} of ${f.pages.length}`}`;
  $('progress').style.width=`${100*(step+1)/(f.pages.length+1)}%`;
  const sheet=$('sheet');sheet.replaceChildren();
  $('blankTemplate').href=ASSETS+`Desert-Shield-${type[0].toUpperCase()+type.slice(1)}-Fillable.pdf`;
  if(submitted[type]){renderReceipt(sheet,submitted[type]);$('next').hidden=true;$('back').disabled=true;$('savedHint').textContent='Submitted to agency';return}
  if(review)renderReview(sheet);else renderPage(sheet,f.pages[step]);
  $('back').disabled=step===0;
  $('next').hidden=review;
  $('next').disabled=false;
  $('next').textContent=step===f.pages.length-1?'Review intake':'Continue';
}
function renderPage(sheet,p){
  sheet.append(el('h2',{},p.title),el('p',{className:'description'},p.description+' Fields marked * are required to generate a review copy.'));
  p.rows.forEach(r=>{
    if(r.note){sheet.append(el('p',{className:'form-note'},r.note));return}
    if(r.heading){sheet.append(el('h3',{className:'section-head'},r.heading));return}
    const checkbox=r.fields.every(f=>f.type==='checkbox');
    const container=el('div',{className:checkbox?'check-row':`field-row${r.fields.length===1?' single':r.fields.length===3?' three':''}`});
    r.fields.forEach(f=>{
      const id='field-'+f.key,field=el('div',{className:'field'});
      const label=el('label',{htmlFor:id},f.label+(f.required?' *':''));
      let input;
      if(f.type==='select'){
        input=el('select',{id});
        f.options.forEach(v=>input.append(el('option',{value:v==='Select'?'':v},v)));
      }else if(f.type==='textarea'){
        input=el('textarea',{id,rows:4,maxLength:4000});
      }else{
        input=el('input',{id,type:f.type==='number'?'number':f.type==='checkbox'?'checkbox':f.type==='date'?'date':f.type==='email'?'email':f.type==='tel'?'tel':'text'});
        if(f.type==='number'){input.min='0';input.step='any';}
        if(f.type!=='checkbox')input.maxLength=500;
      }
      input.name=f.key;
      if(f.required)input.required=true;
      if(f.type==='checkbox')input.checked=!!values()[f.key];else input.value=values()[f.key]||'';
      input.oninput=()=>{
        values()[f.key]=f.type==='checkbox'?input.checked:input.value;
        $('savedHint').textContent='Changes are not yet saved';
      };
      if(checkbox){label.prepend(input);container.append(label)}
      else{field.append(label,input);container.append(field)}
    });
    sheet.append(container);
  });
}
function validation(){
  const v=values(), errors=[];
  allFields(form()).filter(f=>f.required).forEach(f=>{if(!String(v[f.key]||'').trim())errors.push(f.label+' is required.')});
  if(v.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email))errors.push('Enter a valid contact email.');
  if(!v.ack_i_have_reviewed_the_information)errors.push('Confirm that you have reviewed the information in the final intake section.');
  const radius=['radius_0_50','radius_51_200','radius_201_500','radius_500'];
  if(type==='trucking'&&radius.some(k=>String(v[k]||'')!=='')){
    if(radius.some(k=>String(v[k]??'')==='')||radius.reduce((s,k)=>s+Number(v[k]),0)!==100)errors.push('Enter all four radius percentages so they total 100%.');
  }
  allFields(form()).filter(f=>f.type==='number').forEach(f=>{
    if(v[f.key]!==undefined&&v[f.key]!==''&&(!Number.isFinite(Number(v[f.key]))||Number(v[f.key])<0))errors.push(f.label+' must be a nonnegative number.');
  });
  return errors;
}
function renderReview(sheet){
  sheet.append(el('h2',{},'Review your information'),el('p',{className:'description'},
    'Check your answers before sending them to Desert Shield Insurance. Unanswered fields remain blank; your agent may request additional information for a specific insurance market.'));
  const actions=el('div',{className:'review-actions'});
  const pdf=el('button',{className:'primary',type:'button'},'Create review PDF');
  pdf.onclick=()=>exportPDF(false);
  const draft=el('button',{className:'secondary',type:'button'},'Download draft PDF');
  draft.onclick=()=>exportPDF(true);
  actions.append(pdf,draft);sheet.append(actions);
  sheet.append(el('p',{className:'form-note'},'Downloading a PDF alone does not send it to the agency. Use the verification and submission steps below to send your intake.'));
  renderSubmission(sheet);
  form().pages.forEach((p,i)=>{
    const s=el('section',{className:'review-section'}),h=el('h3',{},p.title),edit=el('button',{className:'quiet',type:'button'},'Edit');
    edit.setAttribute('aria-label','Edit '+p.title);edit.onclick=()=>{step=i;render();$('main').focus()};
    h.append(edit);s.append(h);
    const list=el('dl');let count=0;
    p.rows.flatMap(r=>r.fields||[]).forEach(f=>{
      const val=values()[f.key];
      if(val!==undefined&&val!==''&&val!==false){
        list.append(el('dt',{},f.label),el('dd',{},val===true?'Selected':String(val)));count++;
      }
    });
    s.append(count?list:el('p',{className:'empty'},'No information entered in this section.'));
    sheet.append(s);
  });
}
function renderSubmission(sheet){
  const section=el('section',{className:'submission-box'});
  section.append(el('h3',{},'Send to Desert Shield'));
  if(!liveEnabled){
    section.append(el('p',{},'Online submission is temporarily unavailable. Save your draft and call 480.789.1844 for assistance.'));
    sheet.append(section);return;
  }
  const email=String(values().email||'').trim().toLowerCase();
  section.append(el('p',{},'We will verify '+(email||'your contact email')+' before accepting this form. After submission, you and the agency receive separate emails with links to the completed form. Your private link expires in 7 days.'));
  const permission=el('label',{className:'permission'});
  const check=el('input',{type:'checkbox',id:'sharePermission'});
  permission.append(check,el('span',{},'I have authority and any necessary permission to provide this information, including information about other people, for this insurance request. I agree to the privacy policy and understand that this does not bind coverage or authorize marketing texts.'));
  section.append(permission);
  const policy=el('a',{href:'/privacy-policy.html',target:'_blank',rel:'noopener noreferrer'},'Read the privacy policy');
  section.append(policy);
  const send=el('button',{className:'secondary',type:'button'},'Send verification code');
  const codeLabel=el('label',{htmlFor:'emailCode'},'Six-digit code from your email');
  const code=el('input',{id:'emailCode',type:'text',inputMode:'numeric',maxLength:6,autocomplete:'one-time-code'});
  const verify=el('button',{className:'secondary',type:'button'},'Verify email');
  const submit=el('button',{className:'primary',type:'button'},'Submit intake to agency');
  const message=el('p',{className:'form-note'});
  message.setAttribute('role','status');
  submit.disabled=!(verification.ticket&&verification.email===email);
  send.onclick=async()=>{
    const errors=validation();
    if(errors.length){status(errors.join(' '),true);$('main').scrollIntoView({behavior:'smooth'});return}
    send.disabled=true;message.textContent='Sending your verification code…';
    try{const data=await api('start',{email,website:''});verification={id:data.verificationId,email};submit.disabled=true;message.textContent='Code sent. Check your inbox; the code expires in 10 minutes.'}
    catch(e){message.textContent=e.message}
    finally{send.disabled=false}
  };
  verify.onclick=async()=>{
    if(!verification.id||verification.email!==email){message.textContent='Request a code for the current email address first.';return}
    verify.disabled=true;
    try{const data=await api('verify',{verificationId:verification.id,code:code.value.trim()});verification.ticket=data.ticket;submit.disabled=false;message.textContent='Email verified. Check the permission box and submit when ready.'}
    catch(e){message.textContent=e.message}
    finally{verify.disabled=false}
  };
  submit.onclick=async()=>{
    if(sending)return;
    const errors=validation();
    if(errors.length){message.textContent=errors.join(' ');return}
    if(!check.checked){message.textContent='Confirm your permission to share this information.';return}
    if(!verification.ticket||verification.email!==String(values().email||'').trim().toLowerCase()){message.textContent='Verify the current contact email before submitting.';return}
    sending=true;submit.disabled=true;message.textContent='Creating and securely saving your completed form…';
    try{
      const result=await api('submit',{requestId:requestIds[type],type,version:schema.version,values:values(),
        verificationId:verification.id,ticket:verification.ticket,sharingPermission:true,website:''});
      submitted[type]=result;status('');render();$('main').scrollIntoView({behavior:'smooth'});
    }catch(e){message.textContent=e.message;submit.disabled=false}
    finally{sending=false}
  };
  const verifyActions=el('div',{className:'review-actions'});verifyActions.append(send);
  const verifyRow=el('div',{className:'verify-row'});const codeField=el('div');codeField.append(codeLabel,code);verifyRow.append(codeField,verify);
  section.append(verifyActions,verifyRow,message,submit);
  sheet.append(section);
}
function renderReceipt(sheet,result){
  sheet.append(el('h2',{},'Your intake has been received'),el('p',{},'Reference: '+result.reference));
  sheet.append(el('p',{},'Your completed form is saved for agency review. We will contact you about missing information or next steps. No coverage has been bound.'));
  const accepted=result.emailStatus?.prospect==='accepted';
  sheet.append(el('p',{},accepted?'Your private download email has been accepted by our email provider. Check your inbox and spam folder. The link expires in 7 days.':'Your intake is saved, but the confirmation email is pending or could not be sent. Please call 480.789.1844 with your reference for help.'));
  if(result.emailStatus?.agency!=='accepted')sheet.append(el('p',{},'The agency can see your saved intake, but its email notification is pending. Call if your request is urgent.'));
  const b=el('button',{className:'secondary',type:'button'},'Download my local review PDF');b.onclick=()=>exportPDF(true);sheet.append(b);
}
async function exportPDF(draft){
  if(exporting)return;
  const errors=draft?[]:validation();
  if(errors.length){status(errors.join(' '),true);$('main').scrollIntoView({behavior:'smooth'});return}
  exporting=true;status('Preparing your branded PDF…');
  try{
    if(!window.PDFLib||!window.fontkit)throw new Error('The PDF tools did not load. Refresh and try again.');
    const file=`Desert-Shield-${type[0].toUpperCase()+type.slice(1)}-Fillable.pdf`;
    const [res,fontRes]=await Promise.all([fetch(ASSETS+file),fetch(ASSETS+'NotoSans-Regular.ttf')]);
    if(!res.ok||!fontRes.ok)throw new Error('Could not load the PDF template. Please try again.');
    const pdf=await PDFLib.PDFDocument.load(await res.arrayBuffer());
    pdf.registerFontkit(fontkit);
    const font=await pdf.embedFont(await fontRes.arrayBuffer(),{subset:true});
    const pf=pdf.getForm();
    for(const f of allFields(form())){
      const val=values()[f.key];
      if(f.type==='checkbox'){if(val)pf.getCheckBox(f.key).check();else pf.getCheckBox(f.key).uncheck();}
      else if(f.type==='select')pf.getDropdown(f.key).select(val||'Select');
      else if(val!==undefined){
        const tf=pf.getTextField(f.key);tf.setText(String(val));tf.setFontSize(9);
        // Two short lines are preferable to horizontally hidden text.
        if(f.type==='textarea'||String(val).length>30)tf.enableMultiline();
      }
    }
    // A separate readable response appendix guarantees long answers are never lost
    // behind a fixed-size AcroForm field when viewed or printed.
    let ap, y=0;
    const newPage=()=>{
      ap=pdf.addPage([612,792]);y=698;
      ap.drawText('DESERT SHIELD INSURANCE',{x:36,y:754,size:14,font,color:PDFLib.rgb(.03,.19,.35)});
      ap.drawText('Complete response record | '+form().short+' intake',{x:36,y:730,size:10,font});
      ap.drawText('Confidential | Intake only; no coverage bound',{x:36,y:30,size:9,font});
    };
    const lineWrap=(str,width,size)=>{
      const result=[];
      for(const para of String(str).split('\n')){
        let current='';
        for(const word of para.split(/\s+/)){
          if(font.widthOfTextAtSize(word,size)>width){
            if(current){result.push(current);current='';}
            let part='';
            for(const char of word){if(font.widthOfTextAtSize(part+char,size)>width){result.push(part);part='';}part+=char;}
            current=part;continue;
          }
          if(current&&font.widthOfTextAtSize(current+' '+word,size)>width){result.push(current);current=word;}
          else current+=(current?' ':'')+word;
        }
        result.push(current);
      }
      return result;
    };
    for(const p of form().pages){
      const entered=p.rows.flatMap(r=>r.fields||[]).filter(f=>values()[f.key]!==undefined&&values()[f.key]!==''&&values()[f.key]!==false);
      if(!entered.length)continue;
      if(!ap||y<120)newPage();
      y-=20;ap.drawText(p.title,{x:36,y,size:12,font});y-=22;
      for(const f of entered){
        const lines=lineWrap(f.label+': '+(values()[f.key]===true?'Selected':values()[f.key]),540,10);
        for(const line of lines){if(y<65)newPage();ap.drawText(line,{x:36,y,size:10,font});y-=14}
        y-=8;
      }
    }
    pf.updateFieldAppearances(font);
    pdf.setTitle(form().title+(draft?' - Draft':' - Review Copy'));
    pdf.setAuthor('Perplexity Computer');
    const bytes=await pdf.save();
    saveBlob(new Blob([bytes],{type:'application/pdf'}),`Desert-Shield-${type}-${draft?'draft':'review'}.pdf`);
    status('Your local PDF was created, with a full response appendix for long answers. This download action does not submit or email the form.');
  }catch(e){status('PDF not created. '+e.message,true)}
  finally{exporting=false}
}
document.addEventListener('DOMContentLoaded',async()=>{
  const dark=matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme=dark?'dark':'light';$('theme').textContent=dark?'Light mode':'Dark mode';
  $('theme').onclick=()=>{const d=document.documentElement.dataset.theme==='dark';document.documentElement.dataset.theme=d?'light':'dark';$('theme').textContent=d?'Dark mode':'Light mode'};
  try{
    const response=await fetch(ASSETS+'schema.json');if(!response.ok)throw new Error('Forms unavailable');
    schema=await response.json();
    const selected=location.hash.slice(1);if(Object.hasOwn(schema.forms,selected))type=selected;
    try{liveEnabled=(await api('config')).enabled===true}catch{liveEnabled=false}
    $('formType').replaceChildren();
    Object.entries(schema.forms).forEach(([k,f])=>$('formType').append(el('option',{value:k},f.title)));
    $('formType').value=type;
    addEventListener('hashchange',()=>{
      const selected=location.hash.slice(1);
      if(Object.hasOwn(schema.forms,selected)){type=selected;step=0;$('formType').value=type;status('');render();}
    });
    ['formType','saveDraft','loadDraft','back','next'].forEach(id=>$(id).disabled=false);
    $('formType').onchange=()=>{type=$('formType').value;step=0;status('');render()};
    $('next').onclick=()=>{step=Math.min(step+1,form().pages.length);status('');render();$('main').scrollIntoView({behavior:'smooth'})};
    $('back').onclick=()=>{step=Math.max(step-1,0);status('');render();$('main').scrollIntoView({behavior:'smooth'})};
    $('saveDraft').onclick=()=>{
      saveBlob(new Blob([JSON.stringify({version:schema.version,type,values:values()},null,2)],{type:'application/json'}),`Desert-Shield-${type}-draft.json`);
      $('savedHint').textContent='Draft download created';
      status('Draft downloaded. This file contains your entered information in plain text; store it securely. Use Open draft to resume.');
    };
    $('loadDraft').onclick=()=>$('draftFile').click();
    $('draftFile').onchange=async event=>{
      const file=event.target.files[0];if(!file)return;
      try{
        if(file.size>1024*1024)throw new Error('Draft must be smaller than 1 MB.');
        const d=JSON.parse(await file.text());
        if(d.version!==schema.version||!Object.hasOwn(schema.forms,d.type)||!d.values||Array.isArray(d.values)||typeof d.values!=='object')throw new Error('Choose a valid Desert Shield v1.0 draft.');
        const clean={};
        for(const f of allFields(schema.forms[d.type])){
          const v=d.values[f.key];if(v===undefined)continue;
          if(f.type==='checkbox'){if(typeof v!=='boolean')throw new Error('Invalid checkbox value.');clean[f.key]=v;}
          else{
            if(typeof v!=='string'||v.length>(f.type==='textarea'?4000:500))throw new Error('Invalid or oversized field value.');
            if(f.type==='select'&&v&&!f.options.includes(v))throw new Error('Invalid selection.');
            clean[f.key]=v;
          }
        }
        if(submitted[d.type])throw new Error('This intake type was already submitted in this tab. Open a new tab for a new customer.');
        type=d.type;state[type]=clean;step=0;requestIds[type]=crypto.randomUUID();verification={};$('formType').value=type;render();status('Draft opened in this tab. No form answers were uploaded or sent.');
      }catch(e){status('Draft not opened. '+e.message,true)}
      event.target.value='';
    };
    render();
  }catch(e){$('sheet').replaceChildren(el('h2',{},'Forms could not load'),el('p',{},'Please refresh to try again.'));status(e.message,true)}
});
