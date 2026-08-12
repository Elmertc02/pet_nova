import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('approval migration defines schema, policies, and RPC functions', async () => {
  const sql = await readFile(
    new URL('../supabase-quality-record-approval.sql', import.meta.url),
    'utf8',
  );

  [
    'new_quality_record_history',
    'submit_new_quality_record',
    'review_new_quality_record',
    'get_quality_certificate_source',
    'get_current_quality_role',
    'approved_migrated',
    'user_profiles',
    'security definer',
    'production formats update authenticated',
    'bottle formats update authenticated',
    'formats update authenticated',
    "notify pgrst, 'reload schema'",
  ].forEach((token) => assert.match(sql.toLowerCase(), new RegExp(token)));

  assert.match(
    sql.toLowerCase(),
    /create policy "formats update authenticated"[\s\S]*public\.can_review_new_quality_record\(\)/,
  );
});

test('approval migration creates user profiles before altering them', async () => {
  const sql = (
    await readFile(
      new URL('../supabase-quality-record-approval.sql', import.meta.url),
      'utf8',
    )
  ).toLowerCase();

  const createIndex = sql.indexOf('create table if not exists public.user_profiles');
  const seedIndex = sql.indexOf('insert into public.user_profiles');
  const alterIndex = sql.indexOf('alter table public.user_profiles');

  assert.notEqual(createIndex, -1);
  assert.notEqual(seedIndex, -1);
  assert.notEqual(alterIndex, -1);
  assert.ok(createIndex < alterIndex);
  assert.ok(createIndex < seedIndex);
});

test('legacy quality setup cannot restore direct writes', async () => {
  const sql = await readFile(
    new URL('../supabase-new-quality-records.sql', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(sql.toLowerCase(), /grant select,\s*insert,\s*update,\s*delete/);
  assert.doesNotMatch(sql.toLowerCase(), /create policy "new quality records update authenticated"/);
  assert.match(sql.toLowerCase(), /revoke insert,\s*update,\s*delete/);
});

test('format policies restrict writes to admin and calidad', async () => {
  const sql = await readFile(new URL('../supabase-unify-formats.sql', import.meta.url), 'utf8');
  assert.match(sql.toLowerCase(), /role in \('admin', 'calidad'\)/);
});
