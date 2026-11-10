import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAuditDataApiLab } from '../scripts/audit-data-api-e2e.mjs';

function fixture({ breakForgery=false }={}) {
 const users=new Map(),vault=new Map(),google=new Map(),events=[];
 const ok=(x,status=200)=>Response.json(x,{status});
 const denied=()=>ok({code:'42501'},403);
 const request=async(url,init={})=>{
  const path=url.pathname, method=init.method||'GET', h=init.headers||{}, body=init.body?JSON.parse(init.body):null;
  const service=h.apikey==='sb_secret_test';
  const current=(h.Authorization||'').replace(/^Bearer jwt-/,'');
  if(path.endsWith('/operatr_audit_data_api_lab_marker')) return service?ok([{marker:'operatr-audit-data-api-lab-v1'}]):denied();
  if(path==='/auth/v1/admin/users' && method==='POST') {const u={id:body.id,email:body.email,password:body.password};users.set(u.id,u);return ok({id:u.id,email:u.email});}
  if(path.startsWith('/auth/v1/admin/users/')) {
   const id=path.split('/').at(-1),u=users.get(id);
   if(!u)return ok({message:'not found'},404);
   if(method==='DELETE'){users.delete(id);for(let i=events.length-1;i>=0;i--)if(events[i].owner_id===id)events.splice(i,1);return ok({});}
   return ok({id:u.id,email:u.email});
  }
  if(path==='/auth/v1/token') {const u=[...users.values()].find(x=>x.email===body.email&&x.password===body.password);return u?ok({access_token:`jwt-${u.id}`,user:{id:u.id}}):denied();}
  if(path.endsWith('/vault_security_events')) {
   if(!service && !users.has(current))return denied();
   if(method!=='GET')return breakForgery?ok({},201):denied();
   const filter=url.searchParams.get('owner_id')?.slice(3);
   return ok(events.filter(e=>(!filter||e.owner_id===filter)&&(service||e.owner_id===current)));
  }
  const table=path.split('/').at(-1),store=table==='vault_credentials'?vault:table==='google_workspace_connections'?google:null;
  if(store) {
   const id=url.searchParams.get('user_id')?.slice(3);
   if(method==='GET') return ok([...store.values()].filter(x=>!id||x.user_id===id).slice(0,1));
   if(method==='POST') {if(!users.has(current)||current!==body.user_id)return denied();store.set(body.user_id,body);events.push({owner_id:body.user_id,object_kind:table==='vault_credentials'?'vault_credential':'google_connection',operation:'INSERT'});return ok([body],201);}
   if(method==='PATCH' && users.has(current) && current===id) {const row=store.get(id);if(!row)return ok([]);Object.assign(row,body);events.push({owner_id:id,object_kind:table==='vault_credentials'?'vault_credential':'google_connection',operation:'UPDATE'});return ok([row]);}
   if(method==='DELETE' && (service || (users.has(current)&&current===id))) {const row=store.get(id);if(row){store.delete(id);events.push({owner_id:id,object_kind:table==='vault_credentials'?'vault_credential':'google_connection',operation:'DELETE'});}return service?new Response(null,{status:204}):ok(row?[row]:[]);}
  }
  throw Error(`unexpected fixture request: ${path}`);
 };
 return {request,users,vault,google,events};
}
const args={stagingUrl:'https://testproj.supabase.co',appUrl:'https://actualproj.supabase.co',publicKey:'sb_publishable_test',secretKey:'sb_secret_test'};
test('synthetic Data API test verifies isolation and cleans test accounts and rows',async()=>{
 const f=fixture(),logs=[];
 await runAuditDataApiLab({...args,request:f.request,log:x=>logs.push(x)});
 assert.equal(logs.length,4);assert.ok(logs.every(x=>x.startsWith('PASS:')));
 assert.equal(f.users.size,0);assert.equal(f.vault.size,0);assert.equal(f.google.size,0);assert.equal(f.events.length,0);
});
test('rejects the actual project before any network request',async()=>{
 let calls=0;
 await assert.rejects(runAuditDataApiLab({...args,stagingUrl:args.appUrl,request:async()=>{calls++;}}),/matches the Operatr project/);
 assert.equal(calls,0);
});
test('detects forgery exposure and still removes synthetic records',async()=>{
 const f=fixture({breakForgery:true});
 await assert.rejects(runAuditDataApiLab({...args,request:f.request,log:()=>{}}),/forged audit insert/);
 assert.equal(f.users.size,0);assert.equal(f.vault.size,0);assert.equal(f.google.size,0);assert.equal(f.events.length,0);
});
