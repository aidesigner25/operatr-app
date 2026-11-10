import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

test('request IDs are generated server-side even when a client provides one', () => {
 const source=readFileSync(new URL('../src/lib/server/http.ts',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 let count=0;
 const context={exports:{},require:()=>({}),crypto:{randomUUID:()=>`server-generated-${++count}`}};
 vm.runInNewContext(code,context);
 assert.equal(context.exports.createRequestId('claimed-id'),'server-generated-1');
 assert.equal(context.exports.createRequestId('x'.repeat(10000)),'server-generated-2');
 assert.equal(context.exports.createRequestId(null),'server-generated-3');
});
