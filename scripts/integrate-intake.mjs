// Idempotent, narrowly scoped integration of an additive intake entry point.
import {readdir,readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
for(const entry of await readdir(root)){
  if(!entry.endsWith('.html')||['client-intake.html','intake-copy.html','admin-intake.html'].includes(entry))continue;
  const url=new URL(entry,root);let html=await readFile(url,'utf8');
  html=html.replace('<a href="contact.html" class="btn btn--primary btn--sm hide-mobile">Get a Quote</a>',
    '<a href="client-intake.html" class="btn btn--primary btn--sm hide-mobile">Client Intake</a>');
  if(!html.includes('class="intake-nav-link"')){
    html=html.replace('<li><a href="contact.html">Contact</a></li></ul>',
      '<li class="intake-nav-link"><a href="client-intake.html">Client Intake</a></li><li><a href="contact.html">Contact</a></li></ul>');
  }
  if(['index.html','trucking-insurance.html','business-insurance.html','personal-insurance.html'].includes(entry)){
    const type=entry.startsWith('personal')?'personal':entry.startsWith('business')?'business':'trucking';
    html=html.replace('<a href="contact.html" class="btn btn--primary">Get a Same-Day Quote</a>',
      `<a href="client-intake.html#${type}" class="btn btn--primary">Start Your ${type==='trucking'?'Trucking ':type==='personal'?'Personal ':type==='business'?'Business ':''}Intake</a>`);
  }
  await writeFile(url,html);
}
