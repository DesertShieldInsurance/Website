import { readFile } from 'node:fs/promises';
import { PDFDocument,rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { schema,fieldsFor } from './intake-domain.mjs';

export async function createIntakePDF(payload,reference){
  const {type,values}=payload;
  const file=`Desert-Shield-${type[0].toUpperCase()+type.slice(1)}-Fillable.pdf`;
  const doc=await PDFDocument.load(await readFile(new URL('../assets/intake/'+file,import.meta.url)));
  doc.registerFontkit(fontkit);
  const font=await doc.embedFont(await readFile(new URL('../assets/intake/NotoSans-Regular.ttf',import.meta.url)),{subset:true});
  const form=doc.getForm();
  for(const f of fieldsFor(type)){
    const value=values[f.key];
    if(f.type==='checkbox'){if(value)form.getCheckBox(f.key).check();}
    else if(f.type==='select')form.getDropdown(f.key).select(value||'Select');
    else if(value!==undefined){
      const field=form.getTextField(f.key);field.setText(value);field.setFontSize(9);
      if(f.type==='textarea'||value.length>30)field.enableMultiline();
    }
  }
  form.updateFieldAppearances(font);
  form.flatten();
  let page,y=0;
  function next(){
    page=doc.addPage([612,792]);y=698;
    page.drawText('DESERT SHIELD INSURANCE',{x:36,y:754,size:14,font,color:rgb(.03,.19,.35)});
    page.drawText(`Complete response record | ${reference}`,{x:36,y:730,size:10,font});
    page.drawText('Confidential | Intake only; no coverage bound',{x:36,y:30,size:9,font});
  }
  function lines(text){
    const result=[];
    for(const paragraph of String(text).split('\n')){
      let line='';
      // Character wrapping also bounds a single long pasted word.
      for(const c of paragraph){
        if(font.widthOfTextAtSize(line+c,10)>540){result.push(line);line='';}
        line+=c;
      }
      result.push(line);
    }
    return result;
  }
  for(const section of schema.forms[type].pages){
    const fields=section.rows.flatMap(r=>r.fields||[]).filter(f=>values[f.key]!==undefined&&values[f.key]!==''&&values[f.key]!==false);
    if(!fields.length)continue;
    if(!page||y<140)next();
    y-=20;page.drawText(section.title,{x:36,y,size:12,font});y-=22;
    for(const f of fields){
      for(const line of lines(f.label+': '+(values[f.key]===true?'Selected':values[f.key]))){
        if(y<65)next();
        page.drawText(line,{x:36,y,size:10,font});y-=14;
      }
      y-=8;
    }
  }
  for(const p of doc.getPages())p.drawText(reference,{x:400,y:18,size:8,font,color:rgb(.3,.36,.4)});
  doc.setTitle(schema.forms[type].title+' | '+reference);
  doc.setAuthor('Perplexity Computer');
  return Buffer.from(await doc.save());
}
