import { readFile, writeFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const source=await readFile(new URL('contact.html',root),'utf8');
const head=source.match(/<head>([\s\S]*?)<\/head>/)[1];
const originalForm=source.match(/<form[\s\S]*?data-consent-form[\s\S]*?<\/form>/)[0];
const campaigns=[
  {file:'quote-trucking.html',title:'Truck Insurance Quote | Desert Shield',eyebrow:'OWNER-OPERATORS · NEW AUTHORITY · SMALL FLEETS',
    headline:'Truck insurance.<br>A direct line to your agent.',
    intro:'Tell Chris about your operation. Compare liability, cargo and physical damage options without navigating a call center.',
    topic:'Trucking Insurance',type:'trucking',question:'Number of power units',questionName:'power_units',
    states:[['AZ','Arizona'],['TN','Tennessee'],['MS','Mississippi'],['TX','Texas'],['CA','California'],['GA','Georgia'],['NC','North Carolina'],['UT','Utah'],['NM','New Mexico'],['NV','Nevada'],['OR','Oregon']],
    benefits:['Insurance options for new and established authorities','Help coordinating insurer filings and certificate requirements','Coverage reviewed for your freight, equipment and operating radius']},
  {file:'quote-business.html',title:'Arizona Business Insurance Quote | Desert Shield',eyebrow:'ARIZONA CONTRACTORS · SMALL BUSINESSES',
    headline:'Protect the business<br>you’re building.',
    intro:'Review your general liability, workers’ compensation and commercial coverage options with an independent Mesa insurance agent.',
    topic:'Business Insurance',type:'business',question:'Business / trade',questionName:'business_trade',
    states:[['AZ','Arizona']],benefits:['General liability and contract requirements','Workers’ compensation and commercial property options','Direct help reviewing limits, certificates and renewal options']}
];
for(const c of campaigns){
  // Match only the optional topic field, without removing contact fields.
  let form=originalForm.replace('data-consent-form','data-consent-form data-paid-lead')
    .replace(/<div class="field">\s*<label for="topic">[\s\S]*?<\/div>/,
      `<input type="hidden" name="topic" value="${c.topic}"><input type="hidden" name="lead_type" value="${c.type}">
      <div class="field"><label for="state">Business / garaging state *</label><select id="state" name="state" required><option value="">Choose your state</option>${c.states.map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</select></div>
      <div class="field"><label for="operation">${c.question} *</label><input id="operation" name="${c.questionName}" required ${c.type==='trucking'?'type="number" min="1" max="500" step="1"':'type="text" maxlength="100"'}></div>`)
    .replace('New Quote Request — Desert Shield Insurance',`New ${c.type} quote request — Desert Shield Insurance`)
    .replace('placeholder="Tell us a bit about your business, fleet, or what you\'re looking to cover."',
      'placeholder="When do you need coverage? What would you like us to review? Please do not include driver licenses, dates of birth or payment information."');
  const pageHead=head.replace(/<title>.*?<\/title>/,`<title>${c.title}</title>`)
    .replace(/<meta name="description"[^>]+>/,`<meta name="description" content="${c.intro.replace(/’/g,"'")}">`)
    .replace(/<link rel="canonical"[^>]+>/,`<link rel="canonical" href="https://desertshieldinsurance.com/${c.file}">`)
    .replace(/<meta property="og:title"[^>]+>/,`<meta property="og:title" content="${c.title}">`)
    .replace(/<meta property="og:description"[^>]+>/,`<meta property="og:description" content="${c.intro.replace(/’/g,"'")}">`);
  const html=`<!doctype html><html lang="en"><head>${pageHead}
  <meta name="robots" content="noindex,follow"><link rel="stylesheet" href="assets/css/paid-landings.css"></head>
  <body><a class="skip-link" href="#quote">Skip to quote form</a>
  <header class="paid-header container"><a href="index.html" class="brand" aria-label="Desert Shield Insurance home"><img class="paid-logo" src="assets/intake/logo.png" width="58" height="58" alt="Desert Shield Insurance"><span class="brand__word">Desert Shield<span class="sub">Insurance</span></span></a><div class="nav-actions"><a class="btn btn--outline btn--sm" href="tel:+14807891844">480.789.1844</a><button class="theme-toggle" data-theme-toggle aria-label="Switch to dark mode"></button></div></header>
  <main class="container paid-layout"><section class="paid-intro"><span class="eyebrow">${c.eyebrow}</span><h1>${c.headline}</h1><p class="lede">${c.intro}</p>
  <div class="btn-row"><a class="btn btn--primary" href="#quote">Request a quote review</a><a class="btn btn--outline" href="tel:+14807891844">Call Chris</a></div>
  <ul class="check-list" role="list">${c.benefits.map(b=>`<li>${b}</li>`).join('')}</ul>
  <div class="founder-card"><img src="assets/images/chris-headshot.jpg" alt="Chris Conover, founder and licensed agent"><div><span class="founder-card__title">Your licensed agent</span><h3>Chris Conover</h3><p>Mesa, Arizona. Call or email me directly.</p></div></div>
  <p class="paid-hours">Monday–Saturday, 8 a.m.–5 p.m. Arizona time. Closed Sunday.<br>We serve clients by phone and online; no walk-in office visits.</p>
  <div class="btn-row"><a class="btn btn--outline" href="tel:+14807891844">Call Chris</a><a class="btn btn--ghost" href="mailto:Chris@desertshieldinsurance.com">Email Chris</a></div>
  <p class="form-fine-print">Coverage availability, eligibility, premiums and timing depend on underwriting and policy terms. Submitting a request does not bind coverage.</p></section>
  <section id="quote" class="paid-form sidebar__box" aria-labelledby="quote-heading"><span class="eyebrow">START WITH A SHORT REQUEST</span><h2 id="quote-heading">Request your quote review</h2><p>Share the basics. Chris will follow up about your coverage needs.</p>${form}</section></main>
  <footer class="container paid-footer"><p>© 2026 Desert Shield Insurance LLC · <a href="privacy-policy.html">Privacy policy</a> · <a href="terms-conditions.html">Terms &amp; conditions</a></p><p>Already ready to share detailed information? <a href="client-intake.html#${c.type}">Use our secure ${c.type} intake</a>. Do not email sensitive underwriting documents without arranging a secure method.</p><p>${c.type==='trucking'?'<a href="quote-business.html">Looking for Arizona business insurance?</a>':'<a href="quote-trucking.html">Looking for commercial trucking insurance?</a>'}</p></footer>
  <script src="assets/js/attribution.js" defer></script><script src="assets/js/site.js" defer></script></body></html>`;
  await writeFile(new URL(c.file,root),html);
}
console.log('Built trucking and Arizona business quote landing pages.');
