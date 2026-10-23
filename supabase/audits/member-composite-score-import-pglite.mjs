// Synthetic data only; uses in-memory PostgreSQL and never connects to a live DB.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { generateImportSql, validateManifest, SCORE_KEYS } from './member-composite-score-import.mjs'

process.on('uncaughtException', error => { console.error(error.message, error.code || '', error.where || ''); process.exit(1) })
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const migrationName = readdirSync(root + '/supabase/migrations').find(name => name.endsWith('_member_composite_scores.sql'))
assert.ok(migrationName)
const id = n => `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const manifest = {
  batch: 'synthetic-score-import-55', source_sha256: 'a'.repeat(64), sheet_id: 'synthetic-spreadsheet', gid: 123,
  rows: Array.from({ length: 55 }, (_, index) => ({
    row: index + 3, member_id: id(index + 1), member_number: `ZXS_${String(index + 1).padStart(3, '0')}`,
    expected_name: index === 0 ? "Fixture O'Name \\ test" : `Fixture ${index + 1}`,
    expected_attractiveness_score: null,
    ...Object.fromEntries(SCORE_KEYS.map((key, k) => [key, ((index + k) % 5) + 1])),
  })),
}
const db = new PGlite()
await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth; CREATE SCHEMA private;
  CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;
  CREATE FUNCTION private.member_master_is_admin() RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
  CREATE FUNCTION private.member_master_current_admin_id() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;
  CREATE FUNCTION private.peer_lock_admin() RETURNS void LANGUAGE sql AS $$SELECT NULL::void$$;
  CREATE FUNCTION private.member_master_apply_admin_section(uuid,text,jsonb,uuid,boolean DEFAULT false)
    RETURNS void LANGUAGE sql AS $$SELECT NULL::void$$;
`)
for (const name of ['001_core_members.sql', '002_admin_interview.sql', '012_eval_attractiveness.sql']) await db.exec(read('supabase/migrations/' + name))
await db.exec(`ALTER TABLE public.members ADD COLUMN account_status text NOT NULL DEFAULT 'active', ADD COLUMN anonymized_at timestamptz;
  ALTER TABLE public.interview_evaluations ADD COLUMN interviewer_name text;
  CREATE TABLE public.community_profiles(id uuid PRIMARY KEY);
  CREATE TABLE public.community_posts(id uuid PRIMARY KEY);
  CREATE TABLE public.community_comments(id uuid PRIMARY KEY);
  CREATE TABLE public.community_reports(id uuid PRIMARY KEY);
  CREATE TABLE public.community_announcements(id uuid PRIMARY KEY);`)
const community = read('supabase/migrations/20260716165130_community_v1_schema.sql')
const notificationStart = community.indexOf('CREATE TABLE public.community_notifications (')
assert.ok(notificationStart >= 0)
await db.exec(community.slice(notificationStart, community.indexOf('\n);', notificationStart) + 3))
for (const row of [...manifest.rows, { member_id: id(99), member_number: 'ZXS_099', expected_name: 'Unrelated fixture' }]) {
  await db.query(`INSERT INTO public.members(id,member_number,interview_date,interviewer) VALUES($1,$2,'2020-01-02','Original interviewer')`, [row.member_id, row.member_number])
  await db.query(`INSERT INTO public.member_identity(member_id,full_name,gender,age_range,nationality,current_city)
    VALUES($1,$2,'other','fixture','fixture','fixture')`, [row.member_id, row.expected_name])
}
await db.query('UPDATE public.members SET attractiveness_score=4 WHERE id=$1', [id(99)])
const dimensions = ['communication','articulation','enthusiasm','sincerity','social_comfort','humor','emotional_stability','boundary_respect','team_orientation','interest_alignment','japanese_ability','time_commitment','leadership_potential','openness','responsibility','first_impression','overall_recommendation']
await db.query(`INSERT INTO public.interview_evaluations(member_id,${dimensions.join(',')},interviewer_name,interviewer_notes)
  VALUES($1,${dimensions.map(() => 4).join(',')},'Historical interviewer','Do not change this evaluation')`, [id(1)])
await db.query("INSERT INTO public.community_notifications(recipient_member_id,notification_type,body_zh) VALUES($1,'announcement','Original notification')", [id(1)])
await db.exec(read('supabase/migrations/' + migrationName))
const query = async (sql, args = []) => (await db.query(sql, args)).rows[0]
const run = async (mode = 'dry-run', input = manifest) => {
  try {
    const results = await db.exec(generateImportSql(input, mode))
    return results.flatMap(result => result.rows).find(row => row.composite_import_result)?.composite_import_result
  } catch (error) { await db.exec('ROLLBACK'); throw error }
}
let passed = 0
async function check(name, fn) { await fn(); passed++; console.log('PASS ' + name) }
async function reject(pattern) { await assert.rejects(() => run('apply'), pattern) }
async function targetCount() { return Number((await query('SELECT count(*) AS n FROM private.member_composite_scores WHERE member_id<>$1', [id(99)])).n) }

await check('manifest rejects wrong counts, duplicate IDs/numbers/rows, noninteger scores and nonnull expected A', async () => {
  for (const edit of [
    m => m.rows.pop(), m => { m.rows[1].member_id = m.rows[0].member_id },
    m => { m.rows[1].member_number = m.rows[0].member_number }, m => { m.rows[1].row = m.rows[0].row },
    m => { m.rows[0].economic_value_score = 2.5 }, m => { m.rows[0].sexual_value_score = '3' },
    m => { m.rows[0].emotional_value_score = 0 }, m => { m.rows[0].attractiveness_score = 6 },
    m => { m.rows[0].expected_attractiveness_score = 3 }, m => { m.batch = "x';DELETE FROM members;--" },
  ]) { const changed = structuredClone(manifest); edit(changed); assert.throws(() => validateManifest(changed)) }
})
await check('dry-run validates all 220 values and preserves rows after ROLLBACK', async () => {
  const result = await run()
  assert.equal(result.written_members, 55); assert.equal(result.written_score_values, 220)
  assert.equal(result.currently_identical_members, 55); assert.equal(result.audit_rows_added, 55)
  assert.deepEqual(result.protected_baseline, result.protected_after)
  assert.equal(result.target_before.length, 55)
  assert.ok(result.target_before.every(row => row.attractiveness_score === null && row.shared_score_before === null))
  assert.equal(await targetCount(), 0)
  assert.equal(Number((await query('SELECT count(*) n FROM private.member_composite_score_audit')).n), 0)
})
await check('identity changes stop before any scores are written', async () => {
  await db.query("UPDATE public.member_identity SET full_name='Different fixture' WHERE member_id=$1", [id(1)])
  await reject(/IDENTITY_OR_ACCOUNT_CHANGED/); assert.equal(await targetCount(), 0)
  await db.query('UPDATE public.member_identity SET full_name=$2 WHERE member_id=$1', [id(1), manifest.rows[0].expected_name])
})
await check('member number changes stop import', async () => {
  await db.query("UPDATE public.members SET member_number='ZXS_888' WHERE id=$1", [id(1)])
  await reject(/IDENTITY_OR_ACCOUNT_CHANGED/)
  await db.query('UPDATE public.members SET member_number=$2 WHERE id=$1', [id(1), manifest.rows[0].member_number])
})
await check('closed and anonymized accounts stop import', async () => {
  await db.query("UPDATE public.members SET account_status='closed' WHERE id=$1", [id(1)])
  await reject(/IDENTITY_OR_ACCOUNT_CHANGED/)
  await db.query("UPDATE public.members SET account_status='active',anonymized_at=now() WHERE id=$1", [id(1)])
  await reject(/IDENTITY_OR_ACCOUNT_CHANGED/)
  await db.query('UPDATE public.members SET anonymized_at=NULL WHERE id=$1', [id(1)])
})
await check('a newer member A aborts without overwriting it', async () => {
  await db.query('UPDATE public.members SET attractiveness_score=5 WHERE id=$1', [id(1)])
  await reject(/MEMBER_A_CHANGED/)
  assert.equal((await query('SELECT attractiveness_score FROM public.members WHERE id=$1', [id(1)])).attractiveness_score, 5)
  await db.query('UPDATE public.members SET attractiveness_score=NULL WHERE id=$1', [id(1)])
})
await check('an existing B/C/D score aborts even when A remains null', async () => {
  await db.query("INSERT INTO private.member_composite_scores(member_id,sexual_value_score,source,reason) VALUES($1,4,'admin','New admin assessment')", [id(1)])
  await reject(/SHARED_SCORE_ALREADY_EXISTS/)
  await db.query('DELETE FROM private.member_composite_scores WHERE member_id=$1', [id(1)])
  await db.query('DELETE FROM private.member_composite_score_audit WHERE member_id=$1', [id(1)])
})
await check('an entirely blank shared row can be filled with audit before-values retained', async () => {
  await db.query("INSERT INTO private.member_composite_scores(member_id,source,reason) VALUES($1,'existing_score','Unrated fixture')", [id(1)])
  const result = await run()
  assert.equal(result.shared_rows_added, 54); assert.equal(result.audit_rows_added, 55)
  assert.ok(result.target_before.find(row => row.member_id === id(1)).shared_score_before)
  assert.equal(await targetCount(), 1)
  await db.query('DELETE FROM private.member_composite_scores WHERE member_id=$1', [id(1)])
  await db.query('DELETE FROM private.member_composite_score_audit WHERE member_id=$1', [id(1)])
})
await check('an unexpected notification write is detected and rolled back atomically', async () => {
  await db.exec(`CREATE FUNCTION public.fixture_notify() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
    INSERT INTO public.community_notifications(recipient_member_id,notification_type) VALUES(NEW.id,'announcement');RETURN NEW;END$$;
    CREATE TRIGGER fixture_notify AFTER UPDATE OF attractiveness_score ON public.members FOR EACH ROW EXECUTE FUNCTION public.fixture_notify();`)
  await reject(/UNEXPECTED_SIDE_EFFECT/)
  assert.equal(await targetCount(), 0)
  assert.equal(Number((await query('SELECT count(*) n FROM public.community_notifications')).n), 1)
  await db.exec('DROP TRIGGER fixture_notify ON public.members; DROP FUNCTION public.fixture_notify()')
})
await check('unexpected changes to historical evaluations are detected and rolled back', async () => {
  await db.exec(`CREATE FUNCTION public.fixture_eval_write() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
    UPDATE public.interview_evaluations SET interviewer_notes='Changed' WHERE member_id=NEW.id;RETURN NEW;END$$;
    CREATE TRIGGER fixture_eval_write AFTER UPDATE OF attractiveness_score ON public.members FOR EACH ROW EXECUTE FUNCTION public.fixture_eval_write();`)
  await reject(/UNEXPECTED_SIDE_EFFECT/); assert.equal(await targetCount(), 0)
  assert.equal((await query('SELECT interviewer_notes FROM public.interview_evaluations')).interviewer_notes, 'Do not change this evaluation')
  await db.exec('DROP TRIGGER fixture_eval_write ON public.members; DROP FUNCTION public.fixture_eval_write()')
})
await check('partial preexisting batch is rejected', async () => {
  await db.query("INSERT INTO private.member_composite_score_audit(member_id,source,reason,import_batch) VALUES($1,'sheet_import','partial',$2)", [id(1), manifest.batch])
  await reject(/BATCH_ALREADY_USED_DIFFERENTLY/)
  await db.query('DELETE FROM private.member_composite_score_audit WHERE import_batch=$1', [manifest.batch])
})
await check('apply commits exactly 55 scores and audit events and leaves unrelated existing A unchanged', async () => {
  const result = await run('apply')
  assert.equal(result.status, 'applied'); assert.equal(result.written_members, 55)
  assert.equal(await targetCount(), 55)
  assert.equal((await query('SELECT attractiveness_score FROM public.members WHERE id=$1', [id(99)])).attractiveness_score, 4)
  assert.equal(Number((await query('SELECT count(*) n FROM private.member_composite_score_audit WHERE import_batch=$1', [manifest.batch])).n), 55)
})
await check('same batch retry is a no-op with no additional audit events', async () => {
  const result = await run('apply')
  assert.equal(result.status, 'already_applied'); assert.equal(result.written_members, 0)
  assert.equal(result.audit_rows_added, 0); assert.equal(result.currently_identical_members, 55)
})
await check('a later admin edit survives retry without even an updated_at change', async () => {
  await db.query("UPDATE private.member_composite_scores SET attractiveness_score=5,sexual_value_score=5,source='admin',import_batch=NULL,reason='Later admin change' WHERE member_id=$1", [id(1)])
  const before = await query('SELECT to_jsonb(s) value FROM private.member_composite_scores s WHERE member_id=$1', [id(1)])
  const result = await run('apply')
  assert.equal(result.status, 'already_applied'); assert.equal(result.written_members, 0)
  assert.equal(result.currently_identical_members, 54)
  assert.deepEqual(await query('SELECT to_jsonb(s) value FROM private.member_composite_scores s WHERE member_id=$1', [id(1)]), before)
})
await check('same batch with a changed manifest is rejected instead of treated as retry', async () => {
  const changed = structuredClone(manifest); changed.rows[0].economic_value_score = 5
  await assert.rejects(() => run('apply', changed), /BATCH_ALREADY_USED_DIFFERENTLY/)
})
await db.close()
console.log(`PASS ${passed} composite score import checks (in-memory fixture only)`)
