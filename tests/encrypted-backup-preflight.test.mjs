import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesSupabaseProject, findBackupMount } from '../scripts/create-encrypted-backup.mjs';

test('matches only the configured Supabase project over approved database hosts', () => {
 const expected='https://example123.supabase.co';
 assert.equal(matchesSupabaseProject(expected,'postgresql://postgres:fake@db.example123.supabase.co:5432/postgres'),true);
 assert.equal(matchesSupabaseProject(expected,'postgresql://postgres.example123:fake@aws-0-us-east-1.pooler.supabase.com:5432/postgres'),true);
 for (const bad of [
  'postgresql://postgres.other:fake@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
  'postgresql://postgres:fake@db.other.supabase.co:5432/postgres',
  'postgresql://postgres.example123:fake@attacker.pooler.supabase.com.evil.test/postgres',
  'postgresql://postgres:fake@db.example123.supabase.co:5432/other',
  'postgresql://postgres@db.example123.supabase.co:5432/postgres',
  'https://postgres:fake@db.example123.supabase.co/postgres'
 ]) assert.equal(matchesSupabaseProject(expected,bad),false);
 assert.equal(matchesSupabaseProject('https://example123.supabase.co.evil.test','postgresql://postgres:fake@db.example123.supabase.co/postgres'),false);
});


test('selects only the mounted backup image, independently of its volume name', () => {
 const image = { 'image-path':'/Users/example/Downloads/Operatr Backups.dmg', 'system-entities':[{'mount-point':'/Volumes/Untitled'}] };
 assert.equal(findBackupMount({images:[image]}), '/Volumes/Untitled');
 assert.equal(findBackupMount({images:[]}), null);
 assert.equal(findBackupMount({images:[image,image]}), null);
 assert.equal(findBackupMount({images:[{'image-path':'/tmp/unrelated.dmg','system-entities':[{'mount-point':'/Volumes/Untitled'}]}]}), null);
});
