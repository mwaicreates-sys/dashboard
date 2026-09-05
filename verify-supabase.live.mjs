// ⚠️  WARNING — WRITES TO PRODUCTION: the auth-trigger probe at the end
// ⚠️  POSTs /auth/v1/signup and CREATES A REAL AUTH USER in the live
// ⚠️  Supabase project. Do not run casually or against shared environments.
// Probe v2: full shape of existing tables + auth trigger probe. Key never printed.
// (Column-shape probes above are read-only; only the signup probe writes.)
import { readFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}));
const BASE=env.NEXT_PUBLIC_SUPABASE_URL, KEY=env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const H={apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'};
const fmt=b=>{if(b===null)return 'EMPTY';const c=b.code??b.error_code??(b.message?'':'OK');return (c?c+' ':'')+String(b.message??'').slice(0,70)};
async function col(t,c){const r=await fetch(`${BASE}/rest/v1/${t}?select=${c}&limit=1`,{headers:H});return fmt(await r.json().catch(()=>({})))}
const CODES={
 profiles:['user_id','avatar_url','website','phone','business_name','display_name','username','bio'],
 accounts:['user_id','created_at','updated_at','balance','account_number','icon','notes','description','opening_date'],
 categories:['user_id','created_at','updated_at','icon','budget','group','parent','parent_category_id','slug'],
 transactions:['user_id','created_at','updated_at','transaction_date','due_date','recurring','receipt_url','reference','payment_method','vendor','merchant','is_income','signed_amount','balance_after'],
 budgets:['user_id','created_at','updated_at','amount','limit_amount','budget_amount','start_date','end_date','month_year','name','title']
};
console.log('== EXTENDED SHAPE (existing tables) ==');
for(const [t,cols] of Object.entries(CODES)){
  const out=[];
  for(const c of cols){const res=await col(t,c);
    if(res.startsWith('42703')||res.startsWith('PGRST204'))continue;
    if(res.startsWith('42501')||res==='EMPTY'||res.startsWith('OK'))out.push(c+':ok');
    else out.push(c+':?('+res.slice(0,40)+')');}
  console.log(' '+t+':',out.length?out.join(' '):'(no extra columns found)');
}
console.log('\n== AUTH TRIGGER PROBE (signup; autoconfirm=false so no session) ==');
const email='cloud-verify+'+Date.now()+'@example.com';
const sr=await fetch(BASE+'/auth/v1/signup',{method:'POST',headers:H,body:JSON.stringify({email,password:'Verify-Only-9x!'})});
const sj=await sr.json().catch(()=>({}));
console.log(' status:',sr.status);
console.log(' body:',JSON.stringify(sj).slice(0,300));
console.log(' -> trigger diagnosis:', sr.status===200&&sj.id?'NO handle_new_user trigger fired (or none exists): user created; businesses missing would have errored a present trigger':sr.status>=500?'A trigger fired and ERRORED (consistent with a handle_new_user referencing missing tables)':sr.status===400?'signup rejected: '+JSON.stringify(sj).slice(0,150):'other');
