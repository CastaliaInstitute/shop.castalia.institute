// Replace the initial broad bench crops with tighter product-focused crops.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const root=process.cwd();
const env=process.env,host=`${env.SHOPIFY_STORE_HANDLE.trim()}.myshopify.com`,token=env.SHOPIFY_ACCESS_TOKEN.trim();
const state=JSON.parse(readFileSync('state/population-state.json','utf8'));
const seed=JSON.parse(readFileSync('catalog/products.json','utf8'));
const only=new Set(process.argv.slice(2));
for(const p of seed.products){
 if(only.size && !only.has(p.id)) continue;
 const file=resolve(root,'theme/art',`${p.id}.png`); if(!existsSync(file)){console.log('skip',p.id);continue;}
 const id=state.products[p.id]?.gqlId?.split('/').pop(); if(!id){console.log('no id',p.id);continue;}
 const listR=await fetch(`https://${host}/admin/api/2025-01/products/${id}/images.json`,{headers:{'X-Shopify-Access-Token':token}});
 const list=(await listR.json()).images||[];
 if(!list.length){console.log('no existing',p.id);continue;}
 const b64=readFileSync(file).toString('base64');
 const image=list[0];
 const r=await fetch(`https://${host}/admin/api/2025-01/products/${id}/images/${image.id}.json`,{
   method:'PUT',headers:{'X-Shopify-Access-Token':token,'Content-Type':'application/json'},
   body:JSON.stringify({image:{id:image.id,attachment:b64,filename:`${p.id}.png`,alt:`${p.title} — detail from the Atelier bench`}})
 });
 if(r.ok) console.log('updated',p.id); else console.log('FAILED',p.id,r.status,(await r.text()).slice(0,160));
}
