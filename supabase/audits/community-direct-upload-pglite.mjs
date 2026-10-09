// Isolated PostgreSQL audit. No Production connection or user data is used.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
process.on('uncaughtException', error => { console.error(error.message, error.where || '', error.internalQuery || ''); process.exit(1) })
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(root + path, 'utf8')
const base = read('supabase/migrations/20260716165130_community_v1_schema.sql')
function table(name) {
  const start = base.indexOf(`CREATE TABLE ${name} (`)
  assert.ok(start >= 0, name)
  return base.slice(start, base.indexOf('\n);', start) + 3)
}
function fn(name) {
  const start = base.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`)
  assert.ok(start >= 0, name)
  return base.slice(start, base.indexOf('\n$$;', start) + 4)
}
const db = new PGlite()
await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth; CREATE SCHEMA private; CREATE SCHEMA storage;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT current_setting('request.jwt.claims', true)::jsonb$$;
  CREATE TABLE public.members(id uuid PRIMARY KEY, user_id uuid, status text);
  CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE POLICY other_bucket_access ON storage.objects FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  GRANT USAGE ON SCHEMA public, auth, private, storage TO anon, authenticated, service_role;
  GRANT SELECT ON public.members TO service_role;
  GRANT ALL ON storage.objects TO anon, authenticated, service_role;
  GRANT SELECT ON storage.buckets TO service_role;
  INSERT INTO public.members VALUES
    ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'approved'),
    ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'approved');
`)
await db.exec(table('private.community_media_cleanup_queue'))
await db.exec(table('private.community_processed_uploads'))
await db.exec(`GRANT ALL ON ALL TABLES IN SCHEMA private TO service_role`)
await db.exec(fn('public.community_register_processed_upload'))
await db.exec(read('supabase/migrations/20261009161042_community_direct_image_uploads.sql'))
const member = '10000000-0000-4000-8000-000000000001'
const user = '20000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
async function query(sql, args = []) { return (await db.query(sql, args)).rows }
async function call(name, args) {
  const params = args.map((_, i) => `$${i + 1}`).join(',')
  return (await query(`SELECT public.${name}(${params}) AS result`, args))[0].result
}
async function expectReject(promise, expression) { await assert.rejects(promise, expression) }
await db.exec(`SET ROLE authenticated`)
await expectReject(call('community_prepare_direct_upload', [member, user, 'photo', 10]), /permission denied/)
await expectReject(query('SELECT * FROM private.community_direct_uploads'), /permission denied/)
await expectReject(query("INSERT INTO storage.objects(bucket_id,name) VALUES ('community-upload-staging','forged')"), /row-level security/)
await db.exec(`RESET ROLE; INSERT INTO storage.objects(bucket_id,name) VALUES ('community-upload-staging','secret'), ('community-media','existing'); SET ROLE authenticated`)
assert.deepEqual((await query('SELECT name FROM storage.objects')).map(row => row.name), ['existing'])
await db.exec(`RESET ROLE; SET ROLE service_role; SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`)
await expectReject(call('community_prepare_direct_upload', [member, user, 'photo', 20971521]), /Invalid upload metadata/)
await expectReject(call('community_prepare_direct_upload', [member, '20000000-0000-4000-8000-000000000002', 'photo', 10]), /not found/)

const nine = []
for (let i = 0; i < 9; i++) nine.push(await call('community_prepare_direct_upload', [member, user, 'photo', 20971520]))
assert.equal(new Set(nine.map(row => row.staging_path)).size, 9)
assert.ok(nine.every(row => row.staging_path.startsWith(user + '/')))
await expectReject(call('community_claim_direct_upload', [nine[0].id, other]), /not found/)
const first = await call('community_claim_direct_upload', [nine[0].id, member])
const busy = await call('community_claim_direct_upload', [nine[0].id, member])
assert.equal(busy.busy, true)
assert.equal(busy.claim_token, first.claim_token)
const result = { storagePath: first.storage_path, thumbnailPath: first.thumbnail_path, width: 2400, height: 1600, byteSize: 12345, mimeType: 'image/webp', previewUrl: '/api/community/media?valid' }
await expectReject(call('community_finish_direct_upload', [first.id, member, first.claim_token, result]), /Storage objects do not exist/)
await query('INSERT INTO storage.objects(bucket_id,name) VALUES ($1,$2),($1,$3)', ['community-media', first.storage_path, first.thumbnail_path])
await expectReject(call('community_finish_direct_upload', [first.id, member, first.claim_token, { ...result, storagePath: 'other/path' }]), /Invalid processed upload result/)
assert.deepEqual(await call('community_finish_direct_upload', [first.id, member, first.claim_token, result]), result)
assert.deepEqual((await call('community_claim_direct_upload', [first.id, member])).result, result)
assert.deepEqual(await call('community_finish_direct_upload', [first.id, member, first.claim_token, result]), result)
assert.equal(await call('community_cancel_direct_upload', [first.id, member, first.claim_token]), false)
assert.equal((await query('SELECT count(*)::integer AS count FROM private.community_processed_uploads'))[0].count, 1)

const cancelled = await call('community_claim_direct_upload', [nine[1].id, member])
assert.equal(await call('community_cancel_direct_upload', [cancelled.id, member, null]), true)
await expectReject(call('community_finish_direct_upload', [cancelled.id, member, cancelled.claim_token, { ...result, storagePath: cancelled.storage_path, thumbnailPath: cancelled.thumbnail_path }]), /claim expired/)
await expectReject(call('community_claim_direct_upload', [cancelled.id, member]), /cancelled/)
assert.equal((await query('SELECT count(*)::integer AS count FROM private.community_media_cleanup_queue WHERE object_path = $1', [cancelled.staging_path]))[0].count, 1)

const stale = await call('community_claim_direct_upload', [nine[2].id, member])
await query("UPDATE private.community_direct_uploads SET processing_started_at = now() - interval '6 minutes' WHERE id=$1", [stale.id])
const retried = await call('community_claim_direct_upload', [stale.id, member])
assert.notEqual(retried.claim_token, stale.claim_token)
assert.notEqual(retried.storage_path, stale.storage_path)
assert.equal((await query('SELECT count(*)::integer AS count FROM private.community_media_cleanup_queue WHERE object_path=$1', [stale.storage_path]))[0].count, 1)
assert.equal(await call('community_cancel_direct_upload', [stale.id, member, stale.claim_token]), false)

// Immediate cleanup may already have run; replay during token lifetime must be
// caught by the delayed pass, without queuing completed display images.
await query("UPDATE private.community_media_cleanup_queue SET processed_at = now() WHERE object_path=$1", [cancelled.staging_path])
await query("INSERT INTO storage.objects(bucket_id,name) VALUES ('community-upload-staging',$1)", [cancelled.staging_path])
await query("UPDATE private.community_direct_uploads SET created_at = now() - interval '28 hours', expires_at = now() - interval '2 hours' WHERE id IN ($1,$2)", [first.id, cancelled.id])
// No final sweep at 26h: a near-expiry signed token could have created a
// resumable URL that is still within its documented 24h resource lifetime.
await query("UPDATE private.community_direct_uploads SET created_at = now() - interval '26 hours' WHERE id=$1", [cancelled.id])
assert.equal(await call('community_queue_expired_direct_uploads', []), 1)
assert.notEqual((await query('SELECT processed_at FROM private.community_media_cleanup_queue WHERE object_path=$1', [cancelled.staging_path]))[0].processed_at, null)
await query("UPDATE private.community_direct_uploads SET created_at = now() - interval '28 hours' WHERE id=$1", [cancelled.id])
assert.equal(await call('community_queue_expired_direct_uploads', []), 1)
assert.equal((await query('SELECT processed_at FROM private.community_media_cleanup_queue WHERE object_path=$1', [cancelled.staging_path]))[0].processed_at, null)
assert.equal((await query('SELECT count(*)::integer AS count FROM private.community_media_cleanup_queue WHERE object_path=$1', [first.storage_path]))[0].count, 0)
await query("UPDATE private.community_direct_uploads SET expires_at = now() - interval '1 second' WHERE id=$1", [nine[3].id])
await expectReject(call('community_claim_direct_upload', [nine[3].id, member]), /expired/)

// Outstanding quota accepts a full nine-photo selection, then bounds abuse.
while ((await query("SELECT count(*)::integer AS count FROM private.community_direct_uploads WHERE member_id=$1 AND state IN ('pending','processing') AND expires_at > now()", [member]))[0].count < 18) {
  await call('community_prepare_direct_upload', [member, user, 'avatar', 20])
}
await expectReject(call('community_prepare_direct_upload', [member, user, 'photo', 20]), /upload limit/)
assert.equal((await query("SELECT file_size_limit FROM storage.buckets WHERE id='community-upload-staging'"))[0].file_size_limit, 20971520)
const stagingClaim = await call('community_claim_staging_cleanup', [500])
assert.ok(stagingClaim.paths.includes(cancelled.staging_path))
assert.ok(!stagingClaim.paths.includes(stale.storage_path))
assert.deepEqual((await call('community_claim_staging_cleanup', [500])).paths, [])
assert.equal(await call('community_complete_staging_cleanup', [stagingClaim.claimToken, 'temporary Storage error']), stagingClaim.paths.length)
const stageRetry = await call('community_claim_staging_cleanup', [500])
assert.deepEqual(stageRetry.paths, stagingClaim.paths)
assert.equal(await call('community_complete_staging_cleanup', [stageRetry.claimToken, null]), stageRetry.paths.length)
assert.equal(await call('community_complete_staging_cleanup', [stageRetry.claimToken, null]), 0)
assert.equal((await query('SELECT processed_at FROM private.community_media_cleanup_queue WHERE object_path=$1', [stale.storage_path]))[0].processed_at, null)
await query("INSERT INTO private.community_media_cleanup_queue(bucket_id,object_path,reason) SELECT 'community-upload-staging', 'bulk/' || value::text, 'audit' FROM generate_series(1,501) value")
assert.equal((await call('community_claim_staging_cleanup', [10000])).paths.length, 500)
assert.equal((await call('community_claim_staging_cleanup', [500])).paths.length, 1)
await db.exec(read('supabase/audits/community-direct-upload-postflight.sql'))
console.log('PASS: direct upload ownership, private storage RLS, limits, nine-photo batch, claims, idempotency, normalization proof registration, cancellation and delayed cleanup')
await db.close()
