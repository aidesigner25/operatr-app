import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

class FakeRuntimeError extends Error {
 constructor(code, message, status, retryable) { super(message); this.code=code; this.status=status; this.retryable=retryable; }
}
function load(file, status) {
 const source=readFileSync(new URL(`../src/lib/server/${file}.ts`,import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const context={exports:{},URL,URLSearchParams,AbortSignal,DOMException,Response,require:()=>({ChatRuntimeError:FakeRuntimeError}),fetch:async()=>Response.json({message:'SENSITIVE_UPSTREAM_SENTINEL',error:{message:'SENSITIVE_UPSTREAM_SENTINEL'}},{status})};
 vm.runInNewContext(code,context);
 return context.exports;
}
for (const status of [401,429,500]) {
 test(`research services do not expose upstream error text for HTTP ${status}`, async () => {
  const apify=load('apify',status);
  const tavily=load('tavily',status);
  const check=(error)=>{
    assert.ok(!error.message.includes('SENSITIVE_UPSTREAM_SENTINEL'));
    assert.equal(error.status,status===401?409:status===429?429:502);
    return true;
  };
  await assert.rejects(apify.runApifyTask({task:'competitor_site',prompt:'Research https://example.com/pricing',credential:'synthetic',signal:AbortSignal.timeout(5000)}),check);
  await assert.rejects(tavily.searchTavily({query:'example',credential:'synthetic',signal:AbortSignal.timeout(5000)}),check);
 });
}
