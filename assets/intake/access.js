'use strict';
const $=id=>document.getElementById(id),msg=text=>{$('message').textContent=text};
const el=(tag,props={},text)=>{const n=document.createElement(tag);Object.assign(n,props);if(text!==undefined)n.textContent=text;return n};
async function request(action,body,{referral=false,token='',pdf=false}={}){
  const headers={};if(body)headers['Content-Type']='application/json';if(token)headers.Authorization='Bearer '+token;
  const r=await fetch('/api/'+(referral?'referral':'intake')+'?action='+action,{method:body?'POST':'GET',headers,credentials:'same-origin',cache:'no-store',body:body?JSON.stringify(body):undefined});
  if(!r.ok){const value=await r.json().catch(()=>({}));const e=new Error(value.error||'Please try again.');e.status=r.status;throw e}
  return pdf?r.blob():r.json();
}
function download(blob,name){
  const url=URL.createObjectURL(blob),a=el('a',{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function signedOut(){
  $('login').hidden=false;$('adminActions').hidden=true;$('records').replaceChildren();$('password').value='';$('code').value='';
}
async function loadRecords(){
  try{
    const records=await request('list');$('login').hidden=true;$('adminActions').hidden=false;$('records').replaceChildren();
    msg(records.length?`${records.length} recent intake${records.length===1?'':'s'}.`:'No client intakes have been submitted yet.');
    for(const r of records){
      const item=el('article',{className:'intake-record'}),ref='DSI-'+r.id.slice(0,8).toUpperCase();
      item.append(el('h2',{},r.name),el('p',{},`${ref} · ${r.type} · ${new Date(r.createdAt).toLocaleString()}`),
        el('p',{},`Email: prospect ${r.prospectEmailStatus}; agency ${r.agencyEmailStatus}. Download link ${r.revoked?'revoked':'expires '+new Date(r.expiresAt).toLocaleDateString()}.`));
      const actions=el('div',{className:'review-actions'}),pdf=el('button',{className:'primary'},'Download PDF');
      pdf.onclick=async()=>{pdf.disabled=true;try{download(await request('download',{id:r.id},{pdf:true}),ref+'.pdf');msg('Completed form downloaded.')}catch(e){if(e.status===401)signedOut();msg(e.message)}finally{pdf.disabled=false}};
      const retry=el('button',{className:'secondary'},'Retry pending emails');
      retry.disabled=r.revoked||new Date(r.expiresAt)<new Date()||(r.prospectEmailStatus==='accepted'&&r.agencyEmailStatus==='accepted');
      retry.onclick=async()=>{retry.disabled=true;try{await request('resend',{id:r.id});await loadRecords()}catch(e){if(e.status===401)signedOut();msg(e.message);retry.disabled=false}};
      const revoke=el('button',{className:'quiet'},'Revoke private link');revoke.disabled=r.revoked;
      revoke.onclick=async()=>{if(!confirm('Revoke this prospect’s private download link? The agency will still retain the completed form.'))return;
        revoke.disabled=true;try{await request('revoke',{id:r.id});await loadRecords()}catch(e){if(e.status===401)signedOut();msg(e.message);revoke.disabled=false}};
      actions.append(pdf,retry,revoke);item.append(actions);$('records').append(item);
    }
  }catch(e){if(e.status===401)signedOut();msg(e.message)}
}
document.addEventListener('DOMContentLoaded',()=>{
  document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
  const update=()=>$('theme').textContent=document.documentElement.dataset.theme==='dark'?'Light mode':'Dark mode';
  update();$('theme').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';update()};
  if(document.body.dataset.view==='copy'){
    // Fragment is never sent to the web server in the page request.
    const token=location.hash.slice(1);
    history.replaceState(null,'',location.pathname);
    if(!/^[A-Za-z0-9_-]{43}$/.test(token)){$('download').disabled=true;msg('This private link is incomplete. Open the full link from your email or call 480.789.1844.');return}
    $('download').onclick=async()=>{
      $('download').disabled=true;msg('Preparing your download…');
      try{download(await request('copy',undefined,{token,pdf:true}),'Desert-Shield-Completed-Intake.pdf');msg('Your completed form has downloaded. Store it securely.')}
      catch(e){msg(e.message)}finally{$('download').disabled=false}
    };
  }else{
    $('login').onsubmit=async e=>{
      e.preventDefault();const button=$('login').querySelector('button');button.disabled=true;msg('Signing in…');
      try{await request('login',{password:$('password').value,code:$('code').value},{referral:true});$('password').value='';$('code').value='';await loadRecords()}
      catch(e){msg(e.message)}finally{button.disabled=false}
    };
    $('refresh').onclick=loadRecords;
    $('logout').onclick=async()=>{try{await request('logout',{}, {referral:true})}catch{/* Clear sensitive UI even if logout response fails. */}signedOut();msg('Signed out of this view. If the connection failed, close your browser to protect this session.');};
    loadRecords();
    // Hide private data on back/forward cache restoration and after session lifetime.
    addEventListener('pageshow',e=>{if(e.persisted){signedOut();loadRecords()}});
  }
});
