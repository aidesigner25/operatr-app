import { randomBytes, randomUUID } from 'node:crypto';

function canonical(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname) || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/') throw new Error('STOP: use canonical HTTPS Supabase project URLs.');
  return url.origin;
}

/** Synthetic, disposable-project-only test. Never logs response bodies or keys. */
export async function runAuditDataApiLab({ stagingUrl, appUrl, publicKey, secretKey, request=fetch, log=console.log }) {
  const base=canonical(stagingUrl);
  if (base===canonical(appUrl)) throw new Error('STOP: the disposable project matches the Operatr project.');
  if (!publicKey || !secretKey || publicKey===secretKey) throw new Error('STOP: distinct test-project API keys are required.');
  const serviceHeaders={apikey:secretKey,...(secretKey.startsWith('sb_secret_')?{}:{Authorization:`Bearer ${secretKey}`})};
  const anonHeaders={apikey:publicKey};
  async function call(path, options={}, headers=serviceHeaders) {
    let response;
    try { response=await request(new URL(path,base),{...options,headers:{...headers,...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})},signal:AbortSignal.timeout(15000),redirect:'error',cache:'no-store'}); }
    catch { throw new Error('INCONCLUSIVE: a test-project request failed or timed out.'); }
    return {ok:response.ok,status:response.status,body:await response.json().catch(()=>null)};
  }
  const marker=await call('/rest/v1/operatr_audit_data_api_lab_marker?select=marker&marker=eq.operatr-audit-data-api-lab-v1');
  if (!marker.ok || !Array.isArray(marker.body) || marker.body.length!==1 || marker.body[0].marker!=='operatr-audit-data-api-lab-v1') throw new Error('STOP: the disposable audit lab marker was not verified.');
  const deniedMarker=await call('/rest/v1/operatr_audit_data_api_lab_marker?select=marker',{},anonHeaders);
  if (![401,403].includes(deniedMarker.status)) throw new Error('INCONCLUSIVE: public marker access was not denied.');
  const rows = (result,n) => result.ok && Array.isArray(result.body) && result.body.length===n;
  for (const table of ['vault_credentials','google_workspace_connections']) {
    if (!rows(await call(`/rest/v1/${table}?select=user_id&limit=1`),0)) throw new Error('STOP: disposable credential tables are not empty.');
  }
  const accounts=[0,1].map(()=>({id:randomUUID(),email:`operatr-audit-${randomUUID()}@example.com`,password:randomBytes(32).toString('base64url'),token:null}));
  const userHeaders=account=>({apikey:publicKey,Authorization:`Bearer ${account.token}`});
  let failure=null, uncertainCreate=false, cleanupFailure=false;
  try {
    for (const a of accounts) {
      const before=await call(`/auth/v1/admin/users/${a.id}`);
      if(before.status!==404) throw new Error('STOP: synthetic account identifier was not available.');
      let created;
      try { created=await call('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({id:a.id,email:a.email,password:a.password,email_confirm:true})}); }
      catch { uncertainCreate=true; throw new Error('INCONCLUSIVE: synthetic account creation outcome is unknown.'); }
      if(!created.ok || created.body?.id!==a.id || created.body?.email?.toLowerCase()!==a.email) { uncertainCreate=true; throw new Error('INCONCLUSIVE: synthetic account creation was not confirmed.'); }
      const signed=await call('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:a.email,password:a.password})},anonHeaders);
      if(!signed.ok || typeof signed.body?.access_token!=='string' || signed.body?.user?.id!==a.id) throw new Error('INCONCLUSIVE: synthetic account sign-in failed.');
      a.token=signed.body.access_token;
    }
    for (const a of accounts) {
      const headers=userHeaders(a);
      const vault=await call('/rest/v1/vault_credentials?select=id',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({id:randomUUID(),user_id:a.id,provider:'openai',encrypted_credential:'v1.synthetic-value',key_id:'lab',encryption_version:1,last_four:'test'})},headers);
      if(!rows(vault,1)) throw new Error('FAIL or INCONCLUSIVE: owner vault insert.');
      const google=await call('/rest/v1/google_workspace_connections?select=user_id',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({user_id:a.id,encrypted_refresh_token:'v1.synthetic-google'})},headers);
      if(!rows(google,1)) throw new Error('FAIL or INCONCLUSIVE: owner Google insert.');
    }
    const auditPath=id=>`/rest/v1/vault_security_events?owner_id=eq.${id}&select=owner_id,object_kind,operation`;
    for(let i=0;i<2;i++) {
      const a=accounts[i],other=accounts[1-i],headers=userHeaders(a);
      const own=await call(auditPath(a.id),{},headers);
      if(!rows(own,2)||!own.body.some(x=>x.object_kind==='vault_credential'&&x.operation==='INSERT')||!own.body.some(x=>x.object_kind==='google_connection'&&x.operation==='INSERT')) throw new Error('FAIL or INCONCLUSIVE: owner audit events were not recorded.');
      if(!rows(await call(auditPath(other.id),{},headers),0)) throw new Error('FAIL or INCONCLUSIVE: cross-account audit read.');
      const forged=await call('/rest/v1/vault_security_events',{method:'POST',body:JSON.stringify({owner_id:a.id,object_kind:'vault_credential',operation:'INSERT'})},headers);
      if(![401,403].includes(forged.status)||forged.body?.code!=='42501') throw new Error('FAIL or INCONCLUSIVE: forged audit insert was not denied as expected.');
      for(const method of ['PATCH','DELETE']) {
        const attempt=await call(`/rest/v1/vault_security_events?owner_id=eq.${a.id}`,{method,...(method==='PATCH'?{body:JSON.stringify({operation:'DELETE'})}:{})},headers);
        if(![401,403].includes(attempt.status)||attempt.body?.code!=='42501') throw new Error('FAIL or INCONCLUSIVE: audit modification was not denied as expected.');
      }
      if(!rows(await call(auditPath(a.id),{},headers),2)) throw new Error('FAIL: audit events changed after forbidden requests.');
    }
    for (const a of accounts) {
      const headers=userHeaders(a);
      for (const [table,column,value] of [
        ['vault_credentials','encrypted_credential','v1.synthetic-updated'],
        ['google_workspace_connections','encrypted_refresh_token','v1.synthetic-google-updated'],
      ]) {
        const path=`/rest/v1/${table}?user_id=eq.${a.id}&select=user_id`;
        const update=await call(path,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({[column]:value})},headers);
        if(!rows(update,1)) throw new Error('FAIL or INCONCLUSIVE: synthetic owner update.');
        const deleted=await call(path,{method:'DELETE',headers:{Prefer:'return=representation'}},headers);
        if(!rows(deleted,1)) throw new Error('FAIL or INCONCLUSIVE: synthetic owner delete.');
      }
      const recorded=await call(auditPath(a.id),{},headers);
      if(!rows(recorded,6)) throw new Error('FAIL or INCONCLUSIVE: expected six security events.');
      for(const kind of ['vault_credential','google_connection']) for(const operation of ['INSERT','UPDATE','DELETE']) {
        if(recorded.body.filter(e=>e.object_kind===kind&&e.operation===operation).length!==1) throw new Error('FAIL or INCONCLUSIVE: missing or duplicate security event.');
      }
    }
    log('PASS: real Data API recorded one event for each synthetic insert, update, and delete');
    const anonymous=await call('/rest/v1/vault_security_events?select=id&limit=1',{},anonHeaders);
    if(![401,403].includes(anonymous.status)) throw new Error('FAIL or INCONCLUSIVE: anonymous audit access was not denied.');
    log('PASS: real Data API recorded each owner’s synthetic events and blocked cross-owner reads and event forgery');
    log('PASS: anonymous requests cannot read synthetic security events');
  } catch(error) { failure=error instanceof Error?error.message:'INCONCLUSIVE: test did not complete.'; }
  finally {
    for (const a of accounts) {
      try {
        const existing=await call(`/auth/v1/admin/users/${a.id}`);
        if(existing.status===404) { if(uncertainCreate) cleanupFailure=true; continue; }
        if(!existing.ok||existing.body?.id!==a.id||existing.body?.email?.toLowerCase()!==a.email) { cleanupFailure=true; continue; }
        for(const table of ['vault_credentials','google_workspace_connections']) {
          const removed=await call(`/rest/v1/${table}?user_id=eq.${a.id}`,{method:'DELETE'});
          if(!removed.ok) cleanupFailure=true;
        }
        const deleted=await call(`/auth/v1/admin/users/${a.id}`,{method:'DELETE'});
        const verifyUser=await call(`/auth/v1/admin/users/${a.id}`);
        const verifyEvents=await call(`/rest/v1/vault_security_events?owner_id=eq.${a.id}&select=id`);
        const verifyVault=await call(`/rest/v1/vault_credentials?user_id=eq.${a.id}&select=id`);
        const verifyGoogle=await call(`/rest/v1/google_workspace_connections?user_id=eq.${a.id}&select=user_id`);
        if(!deleted.ok||verifyUser.status!==404||!rows(verifyEvents,0)||!rows(verifyVault,0)||!rows(verifyGoogle,0)) cleanupFailure=true;
      } catch { cleanupFailure=true; }
    }
  }
  if(cleanupFailure) throw new Error('CLEANUP NEEDED: inspect only the disposable project for synthetic audit test accounts and rows before retrying.');
  if(failure) throw new Error(failure);
  log('PASS: synthetic account, credential, and audit-event cleanup verified');
}
