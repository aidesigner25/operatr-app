// Interactive manual export to a user-mounted local volume. No restore or DB writes.
import { mkdirSync, statSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import readline from 'node:readline';
import { Writable } from 'node:stream';

export function matchesSupabaseProject(projectUrl, connectionString) {
  try {
    const project = new URL(projectUrl);
    const db = new URL(connectionString);
    const match = /^([a-z0-9]+)\.supabase\.co$/i.exec(project.hostname);
    if (project.protocol !== 'https:' || !match || !['postgres:', 'postgresql:'].includes(db.protocol) || !db.password || db.pathname !== '/postgres') return false;
    const ref = match[1].toLowerCase();
    const host = db.hostname.toLowerCase();
    const user = decodeURIComponent(db.username).toLowerCase();
    const direct = host === `db.${ref}.supabase.co` && user === 'postgres';
    const pooler = host.endsWith('.pooler.supabase.com') && user === `postgres.${ref}`;
    return direct || pooler;
  } catch { return false; }
}
export function findBackupMount(info) {
  if (!info || !Array.isArray(info.images)) return null;
  const mounts = info.images
    .filter(image => typeof image['image-path'] === 'string' && basename(image['image-path']) === 'Operatr Backups.dmg')
    .flatMap(image => Array.isArray(image['system-entities']) ? image['system-entities'] : [])
    .map(entity => entity['mount-point'])
    .filter(path => typeof path === 'string' && /^\/Volumes\/[^/]+$/.test(path));
  return mounts.length === 1 ? mounts[0] : null;
}
function mountedBackupVolume() {
  const info = spawnSync('hdiutil', ['info','-plist'], {encoding:'utf8', maxBuffer: 4*1024*1024, timeout: 10000});
  if (info.status !== 0) throw new Error('mount');
  const json = spawnSync('plutil', ['-convert','json','-o','-','-'], {input:info.stdout, encoding:'utf8', maxBuffer:4*1024*1024, timeout:10000});
  if (json.status !== 0) throw new Error('mount');
  let volume;
  try { volume = findBackupMount(JSON.parse(json.stdout)); } catch { throw new Error('mount'); }
  if (!volume) throw new Error('mount');
  try {
    const imageStat = statSync(volume);
    if (!imageStat.isDirectory() || imageStat.dev === statSync('/Volumes').dev) throw new Error('mount');
  } catch { throw new Error('mount'); }
  return volume;
}
function promptHidden(label) {
  const muted = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const rl = readline.createInterface({ input: process.stdin, output: muted, terminal: true });
  return new Promise(resolveValue => {
    process.stdout.write(label);
    rl.question('', answer => { process.stdout.write('\n'); rl.close(); resolveValue(answer.trim()); });
  });
}
async function main() {
  if (process.argv.length !== 2 || !process.stdin.isTTY || !process.stdout.isTTY) throw new Error('interactive');
  const volume = mountedBackupVolume();
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!projectUrl) throw new Error('project');
  const dbUrl = await promptHidden('Paste the actual Operatr DATABASE connection string (hidden): ');
  if (!matchesSupabaseProject(projectUrl, dbUrl)) throw new Error('mismatch');
  process.umask(0o077);
  const date = new Date().toISOString().replace(/[:.]/g,'-');
  const destination = join(volume, `operatr-${date}`);
  mkdirSync(destination, { mode: 0o700 });
  const dumps = [
    { name:'roles.sql', flags:['--role-only'] },
    { name:'schema.sql', flags:[] },
    { name:'data.sql', flags:['--data-only','--use-copy','-x','storage.buckets_vectors','-x','storage.vector_indexes'] },
  ];
  for (const dump of dumps) {
    process.stdout.write(`Exporting ${dump.name}...\n`);
    const file = join(destination,dump.name);
    const result = spawnSync('npx', ['--yes','supabase@3.1.0','db','dump',`--remote=${dbUrl}`,'-f',file,...dump.flags], { encoding:'utf8', maxBuffer:2*1024*1024, timeout:600000 });
    if (result.error || result.status !== 0 || statSync(file).size === 0) throw new Error('export');
  }
  console.log(`PASS: three export commands completed in ${destination}`);
  console.log('This has not been restore-tested; exports are separate operations and may not represent a single point in time.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    const msgs = {
      interactive:'STOP: run without arguments in an interactive terminal.',
      mount:'STOP: could not identify exactly one mounted Operatr Backups.dmg image. Open it in Finder, then retry.',
      project:'STOP: NEXT_PUBLIC_SUPABASE_URL is not configured.',
      mismatch:'STOP: connection string does not match the configured Operatr project.',
      export:'STOP: export did not complete; leave any partial files in the encrypted image and report this message.'
    };
    console.error(msgs[error?.message] || 'STOP: backup did not complete. Keep any partial files in the encrypted image and report this message.');
    process.exitCode=1;
  });
}
