import { readFile } from 'node:fs/promises';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { runAuditDataApiLab } from './audit-data-api-e2e.mjs';

async function configuredAppUrl() {
 const source=await readFile(new URL('../.env.local',import.meta.url),'utf8');
 const lines=source.split(/\r?\n/).filter(line=>/^\s*NEXT_PUBLIC_SUPABASE_URL\s*=/.test(line));
 if(lines.length!==1)throw new Error('STOP: the configured Operatr project URL could not be identified.');
 const match=/^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*(['"]?)(https:\/\/[^\s'"#]+)\1\s*(?:#.*)?$/.exec(lines[0]);
 if(!match)throw new Error('STOP: the configured Operatr project URL could not be identified.');
 return match[2];
}
function terminal() {
 let muted=false;
 const output=new Writable({write(chunk,_encoding,done){if(!muted)process.stdout.write(chunk);done();}});
 const rl=readline.createInterface({input:process.stdin,output,terminal:true});
 return {ask(label,hidden=false){return new Promise(resolve=>{process.stdout.write(label);muted=hidden;rl.question('',answer=>{muted=false;if(hidden)process.stdout.write('\n');resolve(answer.trim());});});},close(){rl.close();}};
}
async function main() {
 if(!process.stdin.isTTY||!process.stdout.isTTY)throw new Error('STOP: run in an interactive terminal.');
 const appUrl=await configuredAppUrl(),cli=terminal();
 let stagingUrl,publicKey,secretKey;
 try {
  stagingUrl=await cli.ask('DISPOSABLE test-project URL: ');
  let stage,actual;
  try {stage=new URL(stagingUrl);actual=new URL(appUrl);} catch {throw new Error('STOP: use canonical HTTPS Supabase project URLs.');}
  if(stage.origin===actual.origin)throw new Error('STOP: the disposable project matches the Operatr project.');
  publicKey=await cli.ask('DISPOSABLE publishable key (hidden): ',true);
  secretKey=await cli.ask('DISPOSABLE secret key (hidden): ',true);
 } finally {cli.close();}
 await runAuditDataApiLab({stagingUrl,appUrl,publicKey,secretKey});
}
main().catch(error=>{
 const msg=typeof error?.message==='string'&&/^(STOP:|FAIL:|FAIL or INCONCLUSIVE:|INCONCLUSIVE:|CLEANUP NEEDED:)/.test(error.message)?error.message:'INCONCLUSIVE: the disposable test could not complete.';
 console.error(msg);process.exitCode=1;
});
