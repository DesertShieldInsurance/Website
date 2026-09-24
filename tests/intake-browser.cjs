const {chromium}=require('playwright');
const fs=require('fs/promises'),path=require('path');
const ROOT='/home/user/workspace/desert-shield-live/public',QA='/home/user/workspace/desert-shield-intake-qa';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.pdf':'application/pdf','.ttf':'font/ttf'};
const token='A'.repeat(43);
(async()=>{
 await fs.mkdir(QA,{recursive:true});
 const browser=await chromium.launch({headless:true}),ctx=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 const page=await ctx.newPage(),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
 let submitted=false,admin=false,revoked=false;
 await page.route('https://intake.test/**',async r=>{
  const u=new URL(r.request().url());
  if(u.pathname.startsWith('/api/')){
    const action=u.searchParams.get('action'),body=r.request().postDataJSON?.()||{};
    if(r.request().method()!=='GET')writes.push(action);
    if(action==='config')return r.fulfill({json:{enabled:true,version:'1.0'}});
    if(action==='start')return r.fulfill({json:{verificationId:'11111111-1111-4111-8111-111111111111'}});
    if(action==='verify')return r.fulfill({json:{ticket:token}});
    if(action==='submit'){submitted=true;return r.fulfill({status:201,json:{id:'22222222-2222-4222-8222-222222222222',reference:'DSI-22222222',emailStatus:{prospect:'accepted',agency:'accepted'}}})}
    if(action==='copy'||action==='download')return r.fulfill({body:Buffer.from('%PDF TEST'),contentType:'application/pdf',headers:{'Content-Disposition':'attachment; filename="test.pdf"'}});
    if(action==='login'){admin=true;return r.fulfill({json:{ok:true}})}
    if(action==='logout'){admin=false;return r.fulfill({json:{ok:true}})}
    if(action==='list')return admin?r.fulfill({json:[{id:'22222222-2222-4222-8222-222222222222',type:'trucking',name:'Fictional Carrier',createdAt:new Date().toISOString(),prospectEmailStatus:'accepted',agencyEmailStatus:'accepted',expiresAt:new Date(Date.now()+86400000).toISOString(),revoked}]})
      :r.fulfill({status:401,json:{error:'Sign in with your agency administrator account.'}});
    if(action==='resend')return r.fulfill({json:{emailStatus:{prospect:'accepted',agency:'accepted'}}});
    if(action==='revoke'){revoked=true;return r.fulfill({json:{ok:true}})}
    return r.fulfill({status:404,json:{error:'Not found'}});
  }
  const name=u.pathname.slice(1)||'index.html';
  if(name.includes('..'))return r.abort();
  try{return r.fulfill({body:await fs.readFile(path.join(ROOT,name)),contentType:mime[path.extname(name)]||'application/octet-stream'})}catch{return r.fulfill({status:404,body:'Not found'})}
 });
 await page.goto('https://intake.test/client-intake.html#trucking');
 await page.getByLabel('Legal business name').fill('Fictional Carrier');
 await page.getByLabel('Primary contact / title').fill('Taylor Test');
 await page.getByLabel(/^Email/).fill('prospect@example.invalid');
 for(const pathType of ['trucking','personal','business']){
  await page.getByLabel('What would you like to insure?').selectOption(pathType);
  const n=await page.locator('#steps button').count();
  for(let i=0;i<n;i++){await page.locator('#steps button').nth(i).click();assertFit(await page.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]),pathType+' desktop '+i)}
 }
 await page.getByLabel('What would you like to insure?').selectOption('trucking');
 await page.locator('#steps').getByRole('button',{name:/Coverage request & review/}).click();
 await page.getByLabel('I have reviewed the information').check();
 await page.locator('#steps button').last().click();
 await page.getByRole('button',{name:'Send verification code'}).click();
 await page.getByLabel('Six-digit code from your email').fill('123456');
 await page.getByRole('button',{name:'Verify email'}).click();
 await page.getByRole('button',{name:'Submit intake to agency'}).click();
 if(submitted)throw Error('Submitted without permission');
 await page.getByLabel(/I have authority/).check();
 await page.getByRole('button',{name:'Submit intake to agency'}).click();
 await page.getByText('Your intake has been received').waitFor();
 if(!submitted)throw Error('Submission not posted');
 await page.screenshot({path:QA+'/receipt.png',fullPage:true});
 await page.setViewportSize({width:375,height:812});
 await page.goto('https://intake.test/client-intake.html#personal');
 const n=await page.locator('#steps button').count();
 for(let i=0;i<n;i++){await page.locator('#steps button').nth(i).click();assertFit(await page.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]),'personal mobile '+i)}
 await page.screenshot({path:QA+'/mobile.png',fullPage:true});
 await page.goto('https://intake.test/intake-copy.html#'+token);
 if(await locationHash(page)!=='')throw Error('Private token was not removed from visible URL');
 let d=page.waitForEvent('download');await page.getByRole('button',{name:'Download completed form'}).click();await (await d).cancel();
 await page.goto('https://intake.test/admin-intake.html');await page.getByLabel('Password').fill('fictional');
 await page.getByLabel('Authenticator code').fill('123456');await page.getByRole('button',{name:'Sign in'}).click();
 await page.getByText('Fictional Carrier').waitFor();
 d=page.waitForEvent('download');await page.getByRole('button',{name:'Download PDF'}).click();await (await d).cancel();
 page.once('dialog',x=>x.accept());await page.getByRole('button',{name:'Revoke private link'}).click();if(!revoked)throw Error('Revoke did not post');
 await page.getByRole('button',{name:'Sign out'}).click();await page.getByRole('button',{name:'Sign in'}).waitFor({state:'visible'});
 const intakeHtml=await fs.readFile(ROOT+'/client-intake.html','utf8');
 if(/gtag|googletagmanager|fbq|facebook\.com\/tr/i.test(intakeHtml))throw Error('Intake page includes analytics');
 for(const name of ['index.html','trucking-insurance.html','business-insurance.html','personal-insurance.html','contact.html']){
  const html=await fs.readFile(ROOT+'/'+name,'utf8');if(!html.includes('client-intake.html'))throw Error(name+' missing intake entry');
 }
 if(errors.length)throw Error(errors.join('; '));
 for(const action of ['start','verify','submit','login','download','revoke','logout'])if(!writes.includes(action))throw Error('Missing interaction '+action);
 await fs.writeFile(QA+'/results.json',JSON.stringify({status:'pass',writes,checks:['all 3 paths desktop/mobile','email verification','permission gate','receipt','token removed from URL','prospect PDF','admin auth/list/download/revoke/logout','no analytics','site entry links']},null,2));
 console.log('PASS integrated browser QA');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
function assertFit([width,viewport],where){if(width>viewport)throw Error('horizontal overflow '+where+' '+width+'/'+viewport)}
async function locationHash(page){return page.evaluate(()=>location.hash)}
