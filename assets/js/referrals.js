const app = document.querySelector('#app');
const DEMO = window.DS_DEMO === true;
const labels = { received:'Received',contacted:'Contacted',info_needed:'Info needed',quoted:'Quoted',bound:'Bound',closed:'Closed' };
const notes = [
  'Your referral is with our team. We will contact the carrier.',
  'We have connected with the carrier.',
  'We are gathering the information needed to prepare options.',
  'We are waiting on loss runs.',
  'Coverage options have been shared with the carrier.',
  'Coverage has been placed. Thank you for the introduction.',
  'This referral is closed. Contact our team with any questions.'
];
const states = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ');
const esc = x => String(x ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = v => new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'America/Phoenix'}).format(new Date(v));
const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Phoenix',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const eligibleDate = v => { const n=(Date.parse(v)-Date.parse(today()))/86400000;return n>=0&&n<=30; };
let config = { enabled:false, rewards:false }, demo, step=0, history=[], currentToken='', records=[], selected='', filter='all', query='', busy=false;
let data = blank(), driver = {}, complete = false, lastScreen='', savedResponse=null, statusTimer;
function blank(){return {requestId:crypto.randomUUID(),brokerName:'',brokerCompany:'',brokerEmail:'',brokerPhone:'',insuredName:'',dot:'',insuredPhone:'',insuredEmail:'',vins:[],drivers:[],coverageDate:'',sensitivePermission:false,permission:false,allVehicles:false,allDrivers:false};}
const fields = [
  ['brokerName',"First, what’s your name?",'Let’s make sure the carrier knows who introduced us.','Your full name','text','name'],
  ['brokerCompany','Who do you work with?','Your brokerage or transportation company.','Company name','text','organization'],
  ['brokerEmail','Where should we send your tracking link?','We’ll email your confirmation and a private link. No account or password needed.','Your work email','email','email'],
  ['brokerPhone','What’s the best number for you?','For questions about this referral. This does not sign you up for marketing texts.','Your phone number','tel','tel'],
  ['insuredName','Who are you referring?','Enter the trucking company’s legal name or the owner-operator’s name.','Insured / company name','text','off'],
  ['dot','What’s their DOT number?','This helps us identify the right trucking operation.','USDOT number','text','off'],
  ['insuredPhone','How can we reach them?','The best phone number for the carrier or owner-operator.','Insured’s phone number','tel','off'],
  ['insuredEmail','And their email address?','We’ll use this to follow up about their insurance needs.','Insured’s email address','email','off']
];
if (matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.dataset.theme='dark';
async function api(action,body,method='POST',trackingToken){
  if(DEMO) return demo.request(action,body,method,trackingToken);
  const headers={'Content-Type':'application/json'};
  if(trackingToken) headers.Authorization=`Bearer ${trackingToken}`;
  const res=await fetch(`/api/referral?action=${encodeURIComponent(action)}`,{method,credentials:'same-origin',headers,body:method==='GET'?undefined:JSON.stringify(body||{}),cache:'no-store'});
  const value=await res.json().catch(()=>({error:'The service could not be reached. Please try again.'}));
  if(!res.ok) throw new Error(value.error||'Please try again.');
  return value;
}
function shell(content,view='form'){
  app.innerHTML=`
  <div class="utility"><span>Independent insurance. Personal service.</span><a href="tel:+14807891844">480.789.1844 <span class="desktop"> · Mesa, Arizona</span></a></div>
  <header class="header"><a href="https://desertshieldinsurance.com" class="brand" aria-label="Desert Shield Insurance home">
  <svg viewBox="0 0 200 240" role="img" aria-label="Desert Shield"><path d="M100 14C70 14 38 22 28 35v85c0 58 30 97 72 119 42-22 72-61 72-119V35c-10-13-42-21-72-21Z" fill="#1b3557"/><path d="M100 25c-26 0-54 7-61 16v78c0 51 25 85 61 106 36-21 61-55 61-106V41c-7-9-35-16-61-16Z" fill="#e3c08c"/><path d="m66 43 68 0 8 24-42 27-42-27Z" fill="#1b3557"/><path d="M73 50h24v34L67 64m60-14h-24v34l30-20" fill="#e3c08c"/><path d="M49 98v65m14-65v88m14-88v103m14-103v112m14-112v112m14-112v103m14-103v87m14-87v65" stroke="#1b3557" stroke-width="7"/></svg>
  <span class="wordmark">Desert Shield<small>Insurance</small></span></a>
  <nav class="headernav" aria-label="Main navigation"><a class="desktop" href="https://desertshieldinsurance.com/trucking-insurance.html">Trucking insurance</a><a class="active desktop" href="${DEMO?'#/':'partner-referrals.html'}">Partner referrals</a><button class="theme" aria-label="Toggle color theme" title="Toggle color theme">◐</button></nav></header>
  ${DEMO?`<div class="previewbar"><span>INTERACTIVE PREVIEW · Sample data only. No emails or gift cards sent.</span><nav aria-label="Preview views"><button data-view="form" class="${view==='form'?'selected':''}">Referral form</button><button data-view="status" class="${view==='status'?'selected':''}">Broker view</button><button data-view="admin" class="${view==='admin'?'selected':''}">Admin preview</button></nav></div>`:''}
  <main id="main" class="main">${content}</main>
  <footer class="footer"><span>© ${new Date().getFullYear()} Desert Shield Insurance LLC</span><div><a href="https://desertshieldinsurance.com/privacy-policy.html" target="_blank" rel="noopener noreferrer">Privacy policy</a><a href="https://desertshieldinsurance.com/terms-conditions.html" target="_blank" rel="noopener noreferrer">Terms & conditions</a></div></footer>`;
  document.querySelector('.theme').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';};
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
    location.hash=b.dataset.view==='admin'?'#/admin':b.dataset.view==='status'?`#/status/${currentToken||'sample-referral'}`:'#/';
  });
}
function intro(){return `<aside class="intro"><div class="eyebrow">The Desert Shield partner program</div><h1>A good introduction.<br><span>A better road ahead.</span></h1><p>You know the carriers. We know trucking insurance. Connect us, and stay in the loop from the first call to the finish line.</p><div class="benefitline"><span>No partner login</span><span>Your own tracking link</span></div><div class="roadphoto"><img src="assets/images/hero-highway.jpg" alt="Truck traveling along an Arizona desert highway"><div>Built for the people who keep trucking moving.</div></div><div class="agent"><img src="assets/images/chris-headshot.jpg" alt="Chris Conover"><p><strong>A real person on the other end.</strong>Chris Conover · <a href="tel:+14807891844">480.789.1844</a></p></div></aside>`;}
function formShell(){
  const stage=typeof step==='number'?(step<4?0:1):step==='choice'?1:2;
  const percent=typeof step==='number'?(step+1)/8*70:step==='choice'?75:step==='review'?95:85;
  shell(`<div class="breadcrumb"><a href="https://desertshieldinsurance.com">Home</a><span>/</span><span>Partner referrals</span></div><div class="layout">${intro()}<section class="formwrap" aria-label="Partner referral form"><div class="formcard"><div class="formtop"><div class="stages"><span class="${stage===0?'current':''}"><b>${stage>0?'✓':'1'}</b>Your details</span><span class="${stage===1?'current':''}"><b>${stage>1?'✓':'2'}</b>The carrier</span><span class="${stage===2?'current':''}"><b>3</b>Send or complete</span></div><div class="progress" role="progressbar" aria-label="Referral progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><i style="width:${percent}%"></i></div></div><div id="step" class="formbody enter"></div><div class="formfoot"><button class="back" ${history.length?'':'disabled'}>← Back</button><span>Only the basics are required.</span></div></div><div class="below"><span>Your referral stays between us.</span><a href="tel:+14807891844">Need a hand? Call Chris</a></div></section></div>`);
  document.querySelector('.back').onclick=()=>{if(history.length){step=history.pop();renderForm();}};
}
function go(next){history.push(step);step=next;renderForm();}
function msg(text){const el=document.querySelector('#error');if(el){el.textContent=text;el.setAttribute('role','alert');}}
function fieldForm(title,help,label,type,value,next,extra=''){
  const el=document.querySelector('#step');
  el.innerHTML=`<div class="stepmeta">${typeof step==='number'?`Question ${step+1} of 8 · ${step<4?'About you':'About the carrier'}`:'Optional · Complete submission'}</div><h2><label for="answer">${title}</label></h2><p class="help" id="help">${help}</p><form id="question" novalidate><input id="answer" class="field" type="${type}" placeholder="${esc(label)}" value="${esc(value)}" aria-describedby="help error" ${extra}><div class="error" id="error" aria-live="polite"></div><div class="actions"><button class="btn" type="submit">Continue <span aria-hidden="true">→</span></button><span class="keyhint">press Enter ↵</span></div></form>${typeof step==='string'?`<button class="textbtn" id="partial">Submit what I have instead</button>`:''}`;
  document.querySelector('#question').onsubmit=e=>{e.preventDefault();next(document.querySelector('#answer').value.trim());};
  document.querySelector('#partial')?.addEventListener('click',()=>{complete=false;go('review');});
  if(lastScreen) document.querySelector('#answer')?.focus({preventScroll:true});
}
function renderForm(){
  if(!config.enabled){shell(`<section class="track detail"><div class="eyebrow">Partner referrals</div><h1>Let’s connect your carrier.</h1><p style="margin-top:20px">Online referrals are not available yet. Please call Chris to make an introduction.</p><a class="btn" style="margin-top:24px" href="tel:+14807891844">Call 480.789.1844</a></section>`);return;}
  formShell();
  const el=document.querySelector('#step');
  if(typeof step==='number'){
    const [key,title,help,placeholder,type,autocomplete]=fields[step];
    fieldForm(title,help,placeholder,type,data[key],v=>{
      if(!v) return msg('Please enter '+placeholder.toLowerCase()+'.');
      if(v.length>(type==='email'?254:type==='tel'?30:160)) return msg('Please shorten this entry.');
      if(type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return msg('Please enter a valid email address.');
      if(type==='tel'&&(!/^\+?[\d\s().-]+$/.test(v)||v.replace(/\D/g,'').length<10||v.replace(/\D/g,'').length>15)) return msg('Please enter a valid phone number, including area code.');
      if(key==='dot'&&!/^\d{1,8}$/.test(v)) return msg('Enter a DOT number using 1 to 8 digits.');
      data[key]=v;go(step===7?'choice':step+1);
    },`autocomplete="${autocomplete}" ${key==='dot'?'inputmode="numeric" maxlength="8"':'maxlength="254"'}`);
  } else if(step==='choice'){
    el.innerHTML=`<div class="stepmeta">The basics are ready</div><h2>Send it now.<br>Or go one step further.</h2><p class="help">You’ve given us enough to contact ${esc(data.insuredName)}. You can stop here, with no extra paperwork.</p><button class="btn" id="sendbasic">Send basic referral <span>→</span></button><div class="rewardcard"><div class="amount">${config.rewards?'$25':'+'}</div><div><strong>${config.rewards?'A thank-you for a complete submission.':'Have the full submission handy?'}</strong><p>${config.rewards?'Coverage needed in the next 30 days? Add every vehicle VIN and every driver’s license number, state, and date of birth. The referrer earns a $25 gift card after verification, whether or not coverage binds.':'Add the coverage date, every VIN, and authorized driver details to help us prepare options.'}</p>${DEMO?'<p style="margin-top:8px"><b>Proposed offer:</b> subject to compliance approval before launch.</p>':''}<button class="textbtn" id="full">${config.rewards?'Continue for the $25 gift card':'Add complete information'} →</button></div></div><p class="small" style="margin-top:16px">Nothing has been submitted yet. You’ll review permission before sending.</p>`;
    document.querySelector('#sendbasic').onclick=()=>{complete=false;go('review');};
    document.querySelector('#full').onclick=()=>go('coverage');
  } else if(step==='coverage'){
    fieldForm('When do they need coverage?','Use the actual effective or renewal date. Gift-card eligibility, if offered, is based on a date from today through the next 30 days.','Coverage needed date','date',data.coverageDate,v=>{
      if(!v||v<today())return msg('Choose today or a future coverage date.');
      data.coverageDate=v;go(eligibleDate(v)?'permission':'outside');
    },`min="${today()}"`);
  } else if(step==='outside'){
    el.innerHTML=`<div class="stepmeta">Coverage timing</div><h2>We can still help.</h2><p class="help">This date is outside the 30-day gift-card window. You can send the basic referral or continue adding information without a gift-card offer.</p><div class="options"><button class="btn" id="without">Continue without gift card →</button><button class="btn secondary" id="basic">Send basic referral</button></div>`;
    document.querySelector('#without').onclick=()=>go('permission');
    document.querySelector('#basic').onclick=()=>{complete=false;go('review');};
  } else if(step==='permission'){
    el.innerHTML=`<div class="stepmeta">Before adding driver information</div><h2>Do you have permission to share?</h2><p class="help">Driver license numbers and dates of birth are sensitive. Only add them if you are authorized by the company and affected drivers to share them with Desert Shield for insurance quoting.</p><div class="options"><button class="btn" id="authorized">Yes, I’m authorized →</button><button class="btn secondary" id="notauthorized">No, send the basic referral</button></div><p class="small" style="margin-top:20px">${DEMO?'Preview: use fictional driver information only.':'Driver details are excluded from email and the broker tracking page.'}</p>`;
    document.querySelector('#authorized').onclick=()=>{data.sensitivePermission=true;go('vin');};
    document.querySelector('#notauthorized').onclick=()=>{complete=false;data.drivers=[];data.sensitivePermission=false;go('review');};
  } else if(step==='vin'){
    fieldForm(`Vehicle ${data.vins.length+1}: what’s the VIN?`,'Include every truck and trailer that needs coverage. Enter the 17-character VIN.','17-character VIN','text','',v=>{
      v=v.toUpperCase();
      if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return msg('A VIN needs 17 letters and numbers. I, O, and Q are not used.');
      if(data.vins.includes(v))return msg('That VIN has already been added.');
      data.vins.push(v);history=history.filter(s=>s!=='vin');step='vehicles';renderForm();
    },'maxlength="17" autocapitalize="characters" autocomplete="off"');
  } else if(step==='vehicles'){
    el.innerHTML=`<div class="stepmeta">Vehicle list</div><h2>${data.vins.length} vehicle${data.vins.length===1?'':'s'} added.</h2><p class="help">Have you included every truck and trailer needing coverage?</p><div>${data.vins.map((v,i)=>`<div class="listitem"><span>Vehicle ${i+1} · ${esc(v)}</span><button class="textbtn" data-remove-vin="${i}">Remove</button></div>`).join('')}</div><div class="actions"><button id="vehiclesdone" class="btn">That’s every vehicle →</button><button id="addvin" class="btn secondary" ${data.vins.length>=100?'disabled':''}>Add another VIN</button></div><div class="error" id="error"></div><button class="textbtn" id="partial">Submit what I have</button>`;
    document.querySelector('#addvin').onclick=()=>go('vin');
    document.querySelector('#vehiclesdone').onclick=()=>{if(!data.vins.length)return msg('Add at least one VIN, or submit a basic referral.');data.allVehicles=true;driver={};go(data.drivers.length?'drivers':'driverName');};
    document.querySelector('#partial').onclick=()=>{complete=false;go('review');};
    document.querySelectorAll('[data-remove-vin]').forEach(b=>b.onclick=()=>{data.vins.splice(+b.dataset.removeVin,1);data.allVehicles=false;renderForm();});
  } else if(['driverName','license','state','dob'].includes(step)){
    const map={driverName:['name',`Driver ${data.drivers.length+1}: what’s their name?`,'Use the name as it appears on their driver license.','Driver’s full name','text','license'],license:['license','What’s their driver license number?','This is for insurance quoting. It will not appear on the tracking page.','Driver license number','text','state'],dob:['dob','What’s their date of birth?','Use the date shown on the driver license.','Date of birth','date','drivers']};
    if(step==='state'){
      el.innerHTML=`<div class="stepmeta">Driver ${data.drivers.length+1} · License state</div><h2><label for="state">Which state issued the license?</label></h2><p class="help">Select the state printed on the driver license.</p><form id="stateform"><select id="state" class="field" required><option value="">Choose a state</option>${states.map(s=>`<option ${driver.state===s?'selected':''}>${s}</option>`).join('')}</select><div class="actions"><button class="btn">Continue →</button></div></form><button class="textbtn" id="partial">Submit what I have instead</button>`;
      document.querySelector('#stateform').onsubmit=e=>{e.preventDefault();driver.state=document.querySelector('#state').value;go('dob');};
      document.querySelector('#partial').onclick=()=>{complete=false;go('review');};
    }else{
      const [key,title,help,label,type,next]=map[step];
      fieldForm(title,help,label,type,driver[key]||'',v=>{
        if(!v)return msg('Please enter '+label.toLowerCase()+'.');
        if(key==='license'&&!/^[A-Z0-9 -]{3,30}$/i.test(v))return msg('Enter 3 to 30 letters or numbers.');
        if(key==='dob'&&(v>=today()||v<'1900-01-01'))return msg('Enter a valid date of birth in the past.');
        driver[key]=v;
        if(next==='drivers'){
          if(!driver.name||!driver.license||!driver.state)return msg('Use Back to finish this driver’s information.');
          if(data.drivers.some(d=>d.state===driver.state&&d.license.toUpperCase().replace(/[ -]/g,'')===driver.license.toUpperCase().replace(/[ -]/g,'')))return msg('That driver license is already on the list. Use Back to correct it.');
          data.drivers.push({...driver});driver={};
          history=history.filter(s=>!['driverName','license','state','dob','drivers'].includes(s));
          step='drivers';renderForm();return;
        }
        go(next);
      },type==='date'?`max="${today()}" min="1900-01-01" autocomplete="off"`:'maxlength="160" autocomplete="off"');
    }
  } else if(step==='drivers'){
    el.innerHTML=`<div class="stepmeta">Driver list</div><h2>${data.drivers.length} driver${data.drivers.length===1?'':'s'} added.</h2><p class="help">Include every driver who will operate the insured vehicles.</p>${data.drivers.map((d,i)=>`<div class="listitem"><span>${esc(d.name)} · ${esc(d.state)} license · ••••${esc(d.license.slice(-4))}</span><button class="textbtn" data-remove-driver="${i}">Remove</button></div>`).join('')}<div class="actions"><button id="driversdone" class="btn">That’s every driver →</button><button id="adddriver" class="btn secondary" ${data.drivers.length>=100?'disabled':''}>Add another driver</button></div><div class="error" id="error"></div><button class="textbtn" id="partial">Submit what I have</button>`;
    document.querySelector('#adddriver').onclick=()=>{driver={};go('driverName');};
    document.querySelector('#driversdone').onclick=()=>{if(!data.drivers.length)return msg('Add at least one driver, or submit a basic referral.');data.allDrivers=true;complete=true;go('review');};
    document.querySelector('#partial').onclick=()=>{complete=false;go('review');};
    document.querySelectorAll('[data-remove-driver]').forEach(b=>b.onclick=()=>{data.drivers.splice(+b.dataset.removeDriver,1);data.allDrivers=false;renderForm();});
  } else if(step==='review'){
    el.innerHTML=`<div class="stepmeta">One last check</div><h2>Ready to make the introduction?</h2><p class="help">We’ll contact the carrier and send your private tracking link to <strong>${esc(data.brokerEmail)}</strong>.</p><dl class="summary"><div><dt>Carrier</dt><dd>${esc(data.insuredName)}</dd></div><div><dt>DOT number</dt><dd>${esc(data.dot)}</dd></div><div><dt>Carrier phone</dt><dd>${esc(data.insuredPhone)}</dd></div><div><dt>Carrier email</dt><dd>${esc(data.insuredEmail)}</dd></div><div><dt>Submission</dt><dd>${complete?'Complete packet':data.vins.length||data.drivers.length?'Partial packet':'Basic referral'}</dd></div>${data.vins.length||data.drivers.length?`<div><dt>Details included</dt><dd>${data.vins.length} vehicles · ${data.drivers.length} drivers</dd></div>`:''}${data.coverageDate?`<div><dt>Coverage needed</dt><dd>${esc(data.coverageDate)}</dd></div>`:''}</dl>${complete&&config.rewards&&eligibleDate(data.coverageDate)?'<div class="notice">$25 gift card: pending verification after submission. No policy purchase is required. No card is issued on this screen.</div>':''}<form id="submitform"><label class="check"><input id="permission" type="checkbox" required ${data.permission?'checked':''}><span>I have permission to share this information and for Desert Shield Insurance to contact the carrier about insurance. This is not consent for automated marketing calls or texts.</span></label>${complete?`<label class="check"><input id="allcomplete" type="checkbox" required><span>I confirm this packet includes every vehicle needing coverage and every driver, and I’m authorized to share these details for quoting.</span></label>`:''}<div class="honeypot" aria-hidden="true"><label>Website<input id="website" tabindex="-1" autocomplete="off"></label></div><div class="error" id="error" aria-live="polite"></div><div class="actions"><button class="btn" id="submitreferral">Submit ${complete?'complete packet':'referral'} →</button><button type="button" class="textbtn" id="edit">Edit basic details</button></div><p class="small" style="margin-top:16px">A referral is not a quote or binder. Coverage is not in force until confirmed by the agency.</p></form>`;
    document.querySelector('#edit').onclick=()=>go(0);
    document.querySelector('#submitform').onsubmit=async e=>{
      e.preventDefault();if(busy)return;busy=true;
      const b=document.querySelector('#submitreferral');b.disabled=true;b.textContent='Submitting…';
      try{
        data.permission=document.querySelector('#permission').checked;
        const payload={...data,complete,website:document.querySelector('#website').value};
        if(!payload.coverageDate)delete payload.coverageDate;
        const result=await api('submit',payload);
        currentToken=result.token; savedResponse={...result,brokerEmail:data.brokerEmail,company:data.insuredName};
        data=blank();driver={};complete=false;history=[];step=0;showSuccess();
      }catch(e){msg(e.message);b.disabled=false;b.textContent='Try submitting again →';}
      finally{busy=false;}
    };
  }
  lastScreen=String(step);
}
function showSuccess(){
  const r=savedResponse;
  shell(`<div class="track detail"><div class="successmark">✓</div><div class="eyebrow">${DEMO?'Sample submission complete':'Referral received'}</div><h1>A good introduction is the start.</h1><p style="margin-top:20px">Thank you for referring ${esc(r.company)}. ${DEMO?'This is a preview. No email has been sent.':r.emailStatus==='accepted'?`The confirmation email for ${esc(r.brokerEmail)} has been accepted by our email provider. Delivery is not yet confirmed.`:'Your referral is saved, but the confirmation email could not be sent. Save your private tracking link now; our team can retry the email.'}</p><div class="notice"><strong>Your private tracking link</strong><p>Anyone with this link can view this referral’s limited status. Keep it private. It does not show driver details.</p><a class="trackinglink" id="tracklink" href="${esc(r.trackingUrl)}">${esc(r.trackingUrl)}</a></div><div class="actions"><button class="btn" id="opentracking">View referral status →</button><button class="btn secondary" id="copylink">Copy tracking link</button><button class="textbtn" id="another">Refer another carrier</button></div><p class="small" id="copyresult" aria-live="polite"></p></div>`);
  document.querySelector('#opentracking').onclick=()=>{location.hash=`#/status/${r.token}`;};
  document.querySelector('#another').onclick=()=>{savedResponse=null;renderForm();};
  document.querySelector('#copylink').onclick=async()=>{try{await navigator.clipboard.writeText(r.trackingUrl);document.querySelector('#copyresult').textContent='Tracking link copied.';}catch{document.querySelector('#copyresult').textContent='Select the tracking link above to copy it.';}};
}
function pipeline(status,editable=false){
  const values=Object.keys(labels).filter(v=>v!=='closed');
  return `<div class="pipeline" aria-label="Referral status">${values.map((s,i)=>`<${editable?'button':'div'} ${editable?`data-status="${s}" aria-pressed="${s===status}"`:s===status?'aria-current="step"':''} class="${s===status?'current':''}"><span>${i+1}</span>${labels[s]}</${editable?'button':'div'}>`).join('')}</div>`;
}
async function showStatus(t,quiet=false){
  const hashAtStart=location.hash;
  if(!quiet)shell(`<section class="track detail"><div class="skeleton"></div><div class="skeleton big"></div><p>Loading this referral…</p></section>`,'status');
  try{
    const r=await api('status',null,'GET',t);
    if(location.hash!==hashAtStart)return;
    shell(`<section class="track"><div class="breadcrumb"><span>Partner program</span><span>/</span><span>Private referral tracking</span></div><div class="detail"><div class="trackinglabel"><span>REFERRAL · ${esc(r.id.slice(0,8).toUpperCase())}</span><span class="badge ${r.status==='bound'?'good':'navy'}">${labels[r.status]}</span></div><h1>${esc(r.company)}</h1><p style="margin-top:10px;font-size:14px">Your introduction. A clear view of what happens next.</p>${pipeline(r.status)}<div class="notice"><strong>${r.status==='closed'?'Referral closed':'Latest update'}</strong><p>${esc(r.publicNote)}</p><p style="margin-top:8px">Updated ${fmt(r.updatedAt)} · ${DEMO?'Sample data':'Refreshes every 30 seconds'}</p></div><div class="contactgrid"><div><strong>Submission received</strong><p>${fmt(r.createdAt)} · ${r.complete?'Complete packet':r.vehicleCount||r.driverCount?'Partial packet':'Basic referral'}</p><p>${r.vehicleCount} vehicles · ${r.driverCount} drivers on file</p></div><div><strong>${r.rewardStatus==='not_eligible'?'Thank you for the referral':'Gift-card status'}</strong><p>${rewardLabel(r.rewardStatus)}</p></div></div><h3>Referral activity</h3><ol class="timeline">${[...(r.events||[])].reverse().map(e=>`<li><time>${fmt(e.createdAt)}</time><div><strong>${labels[e.status]}</strong><p>${esc(e.note)}</p></div></li>`).join('')}</ol><div class="actions"><a class="btn secondary" href="mailto:Chris@desertshieldinsurance.com">Ask Chris a question</a><button class="textbtn" id="refreshstatus">Refresh status</button></div><p class="small" style="margin-top:20px">Read-only tracking. Driver licenses, dates of birth, pricing, and internal notes are not displayed. A status update is not evidence of coverage.</p></div><div class="below"><span>Keep this link private. Access expires after 90 days.</span></div></section>`,'status');
    document.querySelector('#refreshstatus').onclick=()=>showStatus(t);
  }catch(e){if(location.hash!==hashAtStart)return;shell(`<section class="track detail"><div class="eyebrow">Private referral tracking</div><h1>We couldn’t open this referral.</h1><p style="margin-top:20px">${esc(e.message)}</p><p style="margin-top:12px">Check the full link in your confirmation email. If it expired, contact Chris for help.</p><a class="btn secondary" style="margin-top:24px" href="tel:+14807891844">Call the agency</a></section>`,'status');}
}
function rewardLabel(s){return {not_eligible:'No gift card requested or this referral does not meet the offer criteria.',pending_review:'$25 gift card pending verification. No binding requirement.',approved:'$25 gift card approved. Delivery is being arranged.',sent:'$25 gift card marked sent by the agency.',declined:'Not eligible after review. Please contact Chris with questions.'}[s]||s;}
async function showAdmin(){
  const hashAtStart=location.hash;
  shell(`<section class="shell"><div class="skeleton"></div><div class="skeleton big"></div><p>Loading referral manager…</p></section>`,'admin');
  try{const loaded=await api('list',null,'GET');if(location.hash!==hashAtStart)return;records=loaded;renderAdmin();}
  catch(e){if(location.hash!==hashAtStart)return;showLogin(e.message.includes('Sign in')?'':e.message);}
}
function showLogin(error=''){
  shell(`<section class="login formcard"><div class="formbody"><div class="eyebrow">Agency access only</div><h1>Referral manager</h1><p class="help" style="margin-top:16px">Sign in to manage referrals. Partner tracking links cannot access this area.</p><form id="login"><label class="fieldlabel" for="password">Admin password</label><input class="field" id="password" type="password" required autocomplete="current-password"><label class="fieldlabel" for="otp">Authenticator code</label><input class="field" id="otp" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code"><div class="error" id="error">${esc(error)}</div><button class="btn" id="signin">Sign in →</button></form></div></section>`,'admin');
  document.querySelector('#login').onsubmit=async e=>{e.preventDefault();const b=document.querySelector('#signin');b.disabled=true;try{await api('login',{password:document.querySelector('#password').value,code:document.querySelector('#otp').value});await showAdmin();}catch(e){msg(e.message);b.disabled=false;}};
}
function renderAdmin(){
  const shown=records.filter(r=>(filter==='all'||r.status===filter||filter==='reward'&&r.rewardStatus==='pending_review')&&`${r.company} ${r.private.brokerName} ${r.private.brokerCompany} ${r.private.dot}`.toLowerCase().includes(query.toLowerCase()));
  if(!shown.some(r=>r.id===selected))selected=shown[0]?.id||'';
  shell(`<section class="shell"><div class="pagetitle"><div><div class="eyebrow">Agency workspace ${DEMO?'· Sample data':''}</div><h1>Referral manager</h1><p>Every introduction, with a clear next step.</p></div><div class="actions" style="margin:0"><button class="btn secondary" id="reload">Refresh</button>${DEMO?'':'<button class="textbtn" id="logout">Sign out</button>'}</div></div><div class="metrics"><div class="metric"><span>Total referrals loaded</span><b>${records.length}</b></div><div class="metric"><span>In progress</span><b>${records.filter(r=>!['bound','closed'].includes(r.status)).length}</b></div><div class="metric"><span>Coverage bound</span><b>${records.filter(r=>r.status==='bound').length}</b></div><div class="metric"><span>Gift cards to review</span><b>${records.filter(r=>r.rewardStatus==='pending_review').length}</b></div></div><div class="filters"><input id="search" class="field" aria-label="Search referrals" placeholder="Search carrier, DOT, or referring partner…" value="${esc(query)}"><select class="field" id="filter" aria-label="Filter referrals"><option value="all">All referrals</option>${Object.entries(labels).map(([v,l])=>`<option value="${v}" ${v===filter?'selected':''}>${l}</option>`).join('')}<option value="reward" ${filter==='reward'?'selected':''}>Gift cards to review</option></select></div><div class="adminlayout"><div class="referrallist">${shown.length?shown.map(r=>`<button class="referralrow ${selected===r.id?'selected':''}" data-record="${r.id}"><strong>${esc(r.company)}</strong><p>${esc(r.private.brokerCompany)} · ${fmt(r.createdAt)}</p><span class="badge ${r.status==='bound'?'good':''}">${labels[r.status]}</span> ${r.complete?'<span class="badge navy">Full packet</span>':''}</button>`).join(''):'<div class="centerbox"><h3>No matching referrals</h3><p>Try another search or status. New referrals appear here after submission.</p></div>'}</div><article class="detail" id="detail"></article></div><p class="small" style="margin-top:16px">${DEMO?'Changes apply only to this sample preview and reset when the page reloads.':'Showing the latest 200 referrals. Clicked pipeline statuses save immediately. Gift-card controls only record approval and fulfillment; they do not purchase or send a gift card.'}</p></section>`,'admin');
  document.querySelector('#filter').value=filter;
  document.querySelector('#filter').onchange=e=>{filter=e.target.value;renderAdmin();};
  document.querySelector('#search').oninput=e=>{const pos=e.target.selectionStart;query=e.target.value;renderAdmin();const i=document.querySelector('#search');i.focus();i.setSelectionRange(pos,pos);};
  document.querySelectorAll('[data-record]').forEach(b=>b.onclick=()=>{selected=b.dataset.record;renderAdmin();});
  document.querySelector('#reload').onclick=()=>showAdmin();
  document.querySelector('#logout')?.addEventListener('click',async()=>{try{await api('logout');records=[];showLogin();}catch(e){alert(e.message);}});
  renderDetail(records.find(r=>r.id===selected));
}
function renderDetail(r){
  const el=document.querySelector('#detail');
  if(!r){el.innerHTML='<div class="centerbox"><h2>Your next introduction starts here.</h2><p>Select a referral to update its progress.</p></div>';return;}
  el.innerHTML=`<div class="detailhead"><div><h2>${esc(r.company)}</h2><p>DOT ${esc(r.private.dot)} · Received ${fmt(r.createdAt)}</p></div><span class="badge">${labels[r.status]}</span></div><h3>Update referral status</h3><p class="small">Choose one stage. Changes appear on the broker’s private link.</p>${pipeline(r.status,true)}<button class="textbtn" id="close">${r.status==='closed'?'Reopen referral':'Close referral'}</button><label class="fieldlabel" for="publicnote" style="margin-top:16px">Broker-visible next step</label><select id="publicnote" class="field">${notes.map(n=>`<option ${r.publicNote===n?'selected':''}>${esc(n)}</option>`).join('')}</select><div class="actions" style="margin-top:12px"><button class="btn secondary" id="savenote">Save next step</button><button class="textbtn" id="reemail">Resend confirmation</button></div><div id="savefeedback" class="toast" role="status"></div><div class="contactgrid"><div><strong>Referring partner</strong><p>${esc(r.private.brokerName)}<br>${esc(r.private.brokerCompany)}<br>${esc(r.private.brokerEmail)}<br>${esc(r.private.brokerPhone)}</p></div><div><strong>Carrier contact</strong><p>${esc(r.private.insuredPhone)}<br>${esc(r.private.insuredEmail)}<br>Coverage: ${esc(r.private.coverageDate||'Not provided')}</p></div></div><h3>Gift-card review</h3><p class="small">${rewardLabel(r.rewardStatus)}</p>${r.complete&&r.rewardStatus!=='not_eligible'?`<div class="actions" style="margin-top:12px"><button class="btn secondary" id="rewardapprove" ${r.rewardStatus==='sent'?'disabled':''}>${r.rewardStatus==='approved'?'Mark gift card sent':'Approve $25 gift card'}</button><button class="textbtn" id="rewarddecline" ${r.rewardStatus==='sent'?'disabled':''}>Not eligible</button></div>`:''}<details id="privatepacket"><summary>Authorized quoting details · ${r.vehicleCount} vehicles / ${r.driverCount} drivers</summary><div id="packetbody"><p class="small">Sensitive details are fetched only when opened. Do not share or screenshot them.</p></div></details><details><summary>Tracking link controls</summary><p class="small">The link expires 90 days after submission. Revocation prevents future access and cannot be undone here.</p><button class="textbtn" id="revoke" ${r.tokenRevoked?'disabled':''}>${r.tokenRevoked?'Tracking access revoked':'Revoke tracking access'}</button></details><p class="small" style="margin-top:16px">Confirmation email: ${esc(r.emailStatus)}${r.emailStatus==='accepted'?' by provider (not delivery confirmation)':''}</p>`;
  async function update(patch,feedback='Saved. The broker view is up to date.'){
    const buttons=[...el.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
    try{const updated=await api('update',{id:r.id,version:r.version,status:r.status,publicNote:r.publicNote,rewardStatus:r.rewardStatus,...patch},'PATCH');records=records.map(x=>x.id===updated.id?updated:x);renderAdmin();document.querySelector('#savefeedback').textContent=feedback;}
    catch(e){document.querySelector('#savefeedback').textContent=e.message;document.querySelector('#savefeedback').style.color='var(--color-error)';buttons.forEach(b=>b.disabled=false);}
  }
  el.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>update({status:b.dataset.status,publicNote:notes[{received:0,contacted:1,info_needed:2,quoted:4,bound:5}[b.dataset.status]]}));
  document.querySelector('#close').onclick=()=>{if(confirm(r.status==='closed'?'Reopen this referral?':'Close this referral? The broker will see Closed.'))update({status:r.status==='closed'?'received':'closed',publicNote:notes[r.status==='closed'?0:6]});};
  document.querySelector('#savenote').onclick=()=>update({publicNote:document.querySelector('#publicnote').value});
  document.querySelector('#rewardapprove')?.addEventListener('click',()=>{const sent=r.rewardStatus==='approved';if(confirm(sent?'Confirm you already sent the $25 gift card outside this system?':'Approve this complete, verified submission for a $25 gift card? This does not send or purchase a card.'))update({rewardStatus:sent?'sent':'approved'},sent?'Gift card marked sent.':'Gift card approved. Send it through your chosen provider, then mark it sent.');});
  document.querySelector('#rewarddecline')?.addEventListener('click',()=>{if(confirm('Mark this submission ineligible for the gift card?'))update({rewardStatus:'declined'});});
  document.querySelector('#revoke').onclick=()=>{if(confirm('Revoke this broker tracking link? The old link will stop working immediately.'))update({revoke:true},'Tracking link revoked.');};
  document.querySelector('#reemail').onclick=async e=>{if(!confirm('Email a referral confirmation and tracking link to '+r.private.brokerEmail+'?'))return;e.target.disabled=true;try{const res=await api('resend',{id:r.id});document.querySelector('#savefeedback').textContent=DEMO?'Preview only. No email was sent.':res.emailStatus==='accepted'?'Confirmation accepted by email provider. Delivery not yet confirmed.':'Email failed. Check email configuration and try again.';}catch(err){document.querySelector('#savefeedback').textContent=err.message;}finally{e.target.disabled=false;}};
  document.querySelector('#privatepacket').ontoggle=async e=>{
    if(!e.target.open){document.querySelector('#packetbody').innerHTML='<p class="small">Sensitive details hidden.</p>';return;}
    const box=document.querySelector('#packetbody');box.innerHTML='<p class="small">Loading authorized details…</p>';
    try{const p=await api('packet',{id:r.id});if(!e.target.open)return;box.innerHTML=`${p.vins.map((v,i)=>`<div class="listitem">Vehicle ${i+1}: ${esc(v)}</div>`).join('')}${p.drivers.map(d=>`<div class="listitem"><span>${esc(d.name)}<br>License: ${esc(d.license)} (${esc(d.state)})<br>DOB: ${esc(d.dob)}</span></div>`).join('')}${!p.vins.length&&!p.drivers.length?'<p>No vehicle or driver details provided.</p>':''}`;}catch(err){box.textContent=err.message;}
  };
}
async function route(){
  clearInterval(statusTimer);
  const hashRoute=location.hash.slice(1);
  const path=hashRoute|| (location.pathname.includes('admin')?'/admin':location.pathname.includes('referral-status')?'/status/':'/');
  if(path.startsWith('/admin'))return showAdmin();
  if(path.startsWith('/status/')){currentToken=path.slice(8);await showStatus(currentToken);statusTimer=setInterval(()=>{if(!document.hidden)showStatus(currentToken,true);},30000);return;}
  if(savedResponse)return showSuccess();
  renderForm();
}
window.addEventListener('hashchange',route);
window.addEventListener('beforeunload',e=>{if(data.brokerName||data.insuredName){e.preventDefault();e.returnValue='';}});
try{
  if(DEMO){demo=(await import('./referral-demo.js')).default;config={enabled:true,rewards:true};}
  else config=await api('config',null,'GET');
}catch{config={enabled:false,rewards:false};}
route();
