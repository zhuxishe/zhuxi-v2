// Isolated in-memory PostgreSQL verification. This script never contacts a live database.
// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite module.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

process.on('uncaughtException', error => {
  console.error(error.message, error.where || '', error.internalQuery || '', 'position=' + error.position)
  if (error.position && typeof error.query === 'string') {
    const offset = Number(error.position) - 1
    console.error(error.query.slice(Math.max(0, offset - 120), offset + 120))
  }
  process.exit(1)
})

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const root = process.env.MEMBER_NUMBER_TEST_ROOT || fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(root + '/' + path, 'utf8')
const migrationPath = 'supabase/migrations/' + readdirSync(root + '/supabase/migrations').find(name => name.endsWith('_member_number_allocation.sql'))
const migration = read(migrationPath)
const master = read('supabase/migrations/20260829175645_user_member_master_v1.sql')
const profile = read('supabase/migrations/20260717133952_player_profile_v1.sql')
const db = new PGlite()
const bootstrapSQL = []
async function bootstrap(sql) { bootstrapSQL.push(sql); await db.exec(sql) }

function extractFunction(source, name) {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`)
  assert.ok(start >= 0, `Missing real SQL function ${name}`)
  const definition = source.slice(start)
  const delimiter = /AS (\$[a-z_]*\$)/i.exec(definition)
  assert.ok(delimiter, name)
  const end = definition.indexOf(delimiter[1] + ';', delimiter.index + delimiter[0].length)
  assert.ok(end >= 0, name)
  return definition.slice(0, end + delimiter[1].length + 1)
}

function extractTable(source, name) {
  const pattern = new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?${name.replaceAll('.', '\\.')} \\(`, 'i')
  const match = pattern.exec(source)
  assert.ok(match, `Missing real SQL table ${name}`)
  return source.slice(match.index, source.indexOf('\n);', match.index) + 3)
}

await bootstrap(`
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE SCHEMA private;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('role', current_setting('request.jwt.claim.role', true))$$;
  CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
  GRANT USAGE ON SCHEMA public, auth, private TO anon, authenticated, service_role;
`)
for (const path of ['001_core_members.sql', '002_admin_interview.sql', '003_supplementary.sql']) {
  await bootstrap(read('supabase/migrations/' + path))
}
await bootstrap(`
  ALTER TABLE public.members
    ADD COLUMN account_status text NOT NULL DEFAULT 'active',
    ADD COLUMN profile_stage text NOT NULL DEFAULT 'not_started',
    ADD COLUMN record_source text NOT NULL DEFAULT 'app',
    ADD COLUMN record_scope text NOT NULL DEFAULT 'current',
    ADD COLUMN membership_type text NOT NULL DEFAULT 'player',
    ADD COLUMN onboarding_step smallint NOT NULL DEFAULT 0,
    ADD COLUMN last_profile_saved_at timestamptz,
    ADD COLUMN submitted_at timestamptz,
    ADD COLUMN account_linked_at timestamptz,
    ADD COLUMN anonymized_at timestamptz,
    ADD COLUMN line_user_id text,
    ADD COLUMN wechat_openid text;
  ALTER TABLE public.member_identity
    ADD COLUMN height_weight text,
    ADD COLUMN phone text,
    ADD COLUMN sns_accounts text,
    ADD COLUMN personal_avatar_path text;
  ALTER TABLE public.member_interests
    ADD COLUMN scenario_theme_tags text[] DEFAULT '{}',
    ADD COLUMN game_type_pref text;
`)
for (const name of ['private.member_duplicate_candidates', 'private.member_auth_tombstones', 'private.member_privacy_review_queue']) {
  await bootstrap(extractTable(master, name))
}
await bootstrap(extractTable(read('supabase/migrations/017_personality_quiz.sql'), 'public.personality_quiz_results'))
await bootstrap(extractTable(read('supabase/migrations/006_maintenance.sql'), 'public.member_verification'))
await bootstrap(extractTable(profile, 'private.member_profile_metrics'))
await bootstrap(extractTable(profile, 'private.member_profile_audit_log'))
await bootstrap(master.slice(master.indexOf('ALTER TABLE private.member_profile_audit_log\n'), master.indexOf('CREATE INDEX IF NOT EXISTS member_profile_audit_snapshot_created_idx')))
// Empty auxiliary fixtures let the actual lifecycle RPC execute its full scrub.
// Allocation, validation, auditing and lifecycle business functions are loaded from migrations.
await bootstrap(`
  CREATE TABLE public.legacy_members(id uuid PRIMARY KEY, canonical_member_id uuid, member_no text, full_name text, gender text, school text, department text, interest_tags text[], social_tags text[], game_mode text, compatibility_score integer, session_count integer, match_history jsonb);
  CREATE TABLE public.match_round_submissions(member_id uuid, game_type_pref text, gender_pref text, availability jsonb, interest_tags text[], social_style text, message text, import_metadata jsonb);
  CREATE TABLE public.script_play_records(member_id uuid, can_view_full boolean, comment text);
  CREATE TABLE public.unmatched_diagnostics(member_id uuid, details jsonb);
  CREATE TABLE public.community_profiles(id uuid PRIMARY KEY, nickname text, avatar_kind text, avatar_path text, preset_avatar text);
  CREATE TABLE private.community_profile_members(profile_id uuid, member_id uuid);
  CREATE TABLE public.community_nickname_history(profile_id uuid, old_nickname text, new_nickname text, changed_by_member_id uuid);
  CREATE TABLE private.community_media_cleanup_queue(bucket_id text, object_path text, reason text, processed_at timestamptz, last_error text, queued_at timestamptz, UNIQUE(bucket_id,object_path));
  CREATE TABLE public.member_notes(member_id uuid, note text);
  CREATE TABLE public.player_feedback(member_id uuid, member_name_snapshot text, content text, admin_note text);
  CREATE TABLE public.mutual_reviews(reviewer_id uuid, reviewee_id uuid, comment text);
  CREATE TABLE public.match_results(member_a_id uuid, member_b_id uuid, group_members uuid[], cancellation_requested_by uuid, cancellation_reason text);
  CREATE TABLE public.pair_relationships(member_a_id uuid, member_b_id uuid, feedback_a text, feedback_b text, notes text);
  CREATE TABLE public.activity_records(id uuid, participant_ids uuid[], late_member_ids uuid[], no_show_member_ids uuid[], notes text);
  CREATE TABLE public.community_posts(id uuid PRIMARY KEY, author_profile_id uuid, title text, body text, status text, deleted_at timestamptz, updated_at timestamptz);
  CREATE TABLE public.community_post_images(post_id uuid, storage_path text, thumbnail_path text);
  CREATE TABLE private.community_post_authors(post_id uuid, member_id uuid);
  CREATE TABLE public.community_comments(id uuid PRIMARY KEY, author_profile_id uuid, body text, status text, removal_source text, deleted_at timestamptz, updated_at timestamptz);
  CREATE TABLE private.community_comment_authors(comment_id uuid, member_id uuid);
  CREATE UNIQUE INDEX member_privacy_review_queue_pending ON private.member_privacy_review_queue(member_id_snapshot,entity_table,entity_id) WHERE status='pending';
`)
for (const name of [
  'private.member_master_is_admin', 'private.member_master_is_super_admin',
  'private.member_master_current_admin_id', 'private.member_master_changed_fields',
  'private.member_master_validate_payload_keys', 'private.member_master_jsonb_text_array',
  'private.member_master_prepare_audit_event', 'private.member_master_reject_audit_mutation',
  'public.ensure_my_member_record', 'public.save_my_onboarding_step', 'public.submit_my_onboarding',
  'private.member_master_section_snapshot', 'private.member_master_apply_admin_section',
  'public.admin_update_member_section', 'public.admin_anonymize_member',
]) await bootstrap(extractFunction(master, name))
await bootstrap(extractFunction(profile, 'private.profile_normalize_nickname'))
await bootstrap(extractFunction(read('supabase/migrations/20260902073905_archive_historical_member_records.sql'), 'private.member_master_audit_member_change'))
await bootstrap(extractFunction(read('supabase/migrations/20260902073905_archive_historical_member_records.sql'), 'private.member_master_sync_lifecycle'))
await bootstrap(extractFunction(read('supabase/migrations/20260907194820_player_profile_consistency.sql'), 'private.player_profile_require_submission_before_approval'))
await bootstrap(extractFunction(read('supabase/migrations/20260830163614_fix_member_restore_and_quiz_answers.sql'), 'public.admin_restore_member_event'))
await bootstrap(`
  CREATE TRIGGER member_master_sync_lifecycle BEFORE INSERT OR UPDATE OF status, member_number, user_id, email, line_user_id, wechat_openid, account_status, profile_stage, record_source, record_scope, onboarding_step, account_linked_at, anonymized_at ON public.members FOR EACH ROW EXECUTE FUNCTION private.member_master_sync_lifecycle();
  CREATE TRIGGER member_master_audit_member_change AFTER INSERT OR UPDATE OF status, member_number, account_status, anonymized_at ON public.members FOR EACH ROW EXECUTE FUNCTION private.member_master_audit_member_change();
  CREATE TRIGGER member_master_prepare_audit_event BEFORE INSERT ON private.member_profile_audit_log FOR EACH ROW EXECUTE FUNCTION private.member_master_prepare_audit_event();
  CREATE TRIGGER member_master_reject_audit_mutation BEFORE UPDATE OR DELETE ON private.member_profile_audit_log FOR EACH ROW EXECUTE FUNCTION private.member_master_reject_audit_mutation();
  CREATE TRIGGER player_profile_require_submission_before_approval BEFORE UPDATE OF status ON public.members FOR EACH ROW EXECUTE FUNCTION private.player_profile_require_submission_before_approval();
  GRANT SELECT ON public.members, public.member_identity, public.admin_users TO authenticated;
  REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
  REVOKE ALL ON FUNCTION public.save_my_onboarding_step(smallint,jsonb), public.submit_my_onboarding(), public.admin_update_member_section(uuid,text,jsonb,text,timestamptz), public.admin_restore_member_event(bigint,text), public.admin_anonymize_member(uuid,text) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.save_my_onboarding_step(smallint,jsonb), public.submit_my_onboarding(), public.admin_update_member_section(uuid,text,jsonb,text,timestamptz), public.admin_restore_member_event(bigint,text), public.admin_anonymize_member(uuid,text) TO authenticated;
`)

const uuid = (kind, n) => `${kind}0000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const user = n => uuid(1, n)
const member = n => uuid(2, n)
const admin = uuid(3, 1)
await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [user(900), 'admin@fixture.local'])
await db.query("INSERT INTO public.admin_users(id,user_id,email,name,role) VALUES($1,$2,'admin@fixture.local','Fixture super admin','super_admin')", [admin, user(900)])
async function fixture(n, options = {}) {
  const bindAuth = options.scope !== 'historical' && options.source !== 'import' && options.source !== 'legacy' && !options.anonymizedAt
  if (bindAuth) await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [user(n), `member-${n}@fixture.local`])
  await db.query(`INSERT INTO public.members(id,user_id,email,status,profile_stage,member_number,record_scope,record_source,account_status,anonymized_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [member(n), bindAuth ? user(n) : null, bindAuth ? `member-${n}@fixture.local` : null, options.status || 'pending', options.stage || 'not_started', options.number || null, options.scope || 'current', options.source || 'app', options.accountStatus || 'active', options.anonymizedAt || null])
  if (options.name) await db.query("INSERT INTO public.member_identity(member_id,full_name,gender,age_range,nationality,current_city) VALUES($1,$2,'other','20-30','中国','东京')", [member(n), options.name])
}
async function asUser(n, operation, role = 'authenticated') {
  await db.exec('BEGIN')
  try {
    await db.exec('SET LOCAL ROLE ' + role)
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.role',$2,true)", [n ? user(n) : '', role])
    const result = await operation()
    await db.exec('COMMIT')
    return result
  } catch (error) {
    await db.exec('ROLLBACK')
    throw error
  }
}
const namePayload = full_name => ({ full_name, gender: 'other', age_range: '20-30', nationality: '中国', current_city: '东京' })
const registerName = (n, fullName) => asUser(n, () => db.query('SELECT public.save_my_onboarding_step(1::smallint,$1::jsonb)', [JSON.stringify(namePayload(fullName))]))
const adminEdit = (n, section, payload) => asUser(900, () => db.query("SELECT public.admin_update_member_section($1,$2,$3::jsonb,'编号隔离验证',NULL) AS result", [member(n), section, JSON.stringify(payload)]))
const approve = n => adminEdit(n, 'application', { status: 'approved' })
const changeNumber = (n, number) => adminEdit(n, 'account', { member_number: number })
const restoreEvent = eventId => asUser(900, () => db.query("SELECT public.admin_restore_member_event($1::bigint,'编号恢复隔离验证') AS result", [eventId]))
const completeSubmission = n => asUser(n, async () => {
  await db.query("SELECT public.save_my_onboarding_step(2::smallint,'{}'::jsonb)")
  await db.query("SELECT public.save_my_onboarding_step(3::smallint,'{\"hobby_tags\":[\"旅行\"],\"activity_type_tags\":[\"剧本杀\"]}'::jsonb)")
  await db.query("SELECT public.save_my_onboarding_step(4::smallint,'{\"personality_self_tags\":[\"慢热\"],\"taboo_tags\":[]}'::jsonb)")
  await db.query('SELECT public.submit_my_onboarding()')
})
async function numberOf(n) { return (await db.query('SELECT member_number FROM public.members WHERE id=$1', [member(n)])).rows[0].member_number }
let passed = 0
let applicationApprovalEventId
let accountNumberEventId
async function check(name, run) { await run(); passed++; console.log('PASS ' + name) }

await fixture(1, { status: 'approved', stage: 'complete', name: '吴璠', number: '竹溪社-002' })
await fixture(2, { status: 'approved', stage: 'complete', name: 'Existing high number', number: 'ZXS_277' })
await fixture(3, { status: 'approved', name: '吴璠', number: 'IMP-history', scope: 'historical', source: 'import' })
await fixture(4, { status: 'approved', name: 'Import fixture', number: 'IMP-current', source: 'import' })
await fixture(5, { status: 'approved', stage: 'complete', name: '竹溪社', number: 'ZXS_000' })
await fixture(6, { status: 'approved', name: '吴璠', number: '竹溪社-006', accountStatus: 'closed' })
await fixture(7, { status: 'approved', name: '吴璠', number: '竹溪社-007', accountStatus: 'closed', anonymizedAt: '2026-10-06T00:00:00Z' })
await db.exec(migration)

await check('migration corrects current roster member 吴璠 from 竹溪社-002 to ZXS_081', async () => {
  assert.equal(await numberOf(1), 'ZXS_081')
})
await check('existing official ZXS_000 is preserved despite name 竹溪社 differing from roster 竹溪社官方', async () => {
  assert.equal(await numberOf(5), 'ZXS_000')
})
await check('migration preserves closed and anonymized records even when roster names and old number formats match', async () => {
  assert.equal(await numberOf(6), '竹溪社-006')
  assert.equal(await numberOf(7), '竹溪社-007')
})
await check('historical and import member numbers are preserved', async () => {
  assert.equal(await numberOf(3), 'IMP-history')
  assert.equal(await numberOf(4), 'IMP-current')
  await db.query("UPDATE public.member_identity SET full_name='Historical renamed' WHERE member_id=$1", [member(3)])
  await db.query("UPDATE public.member_identity SET full_name='Imported renamed' WHERE member_id=$1", [member(4)])
  assert.equal(await numberOf(3), 'IMP-history')
  assert.equal(await numberOf(4), 'IMP-current')
})
await check('reserved roster is complete without creating online members', async () => {
  const roster = (await db.query('SELECT * FROM private.member_number_roster()')).rows
  assert.equal(roster.filter(row => row.member_number !== 'ZXS_000').length, 247)
  assert.equal(roster.find(row => row.full_name === '吴璠').member_number, 'ZXS_081')
  assert.equal((await db.query('SELECT count(*)::int AS total FROM public.members')).rows[0].total, 7)
})
await check('first successful name registration reserves 278 then 279', async () => {
  await fixture(10)
  await fixture(11)
  await registerName(10, 'New member A')
  await registerName(11, 'New member B')
  assert.equal(await numberOf(10), 'ZXS_278')
  assert.equal(await numberOf(11), 'ZXS_279')
})
await check('actual submission guard rejects approval after only the first name registration', async () => {
  await assert.rejects(approve(10), /MEMBER_PROFILE_SUBMISSION_REQUIRED/)
  const state = (await db.query('SELECT status,profile_stage,onboarding_step,member_number FROM public.members WHERE id=$1', [member(10)])).rows[0]
  assert.deepEqual(state, { status: 'pending', profile_stage: 'in_progress', onboarding_step: 1, member_number: 'ZXS_278' })
})
await check('actual completed submissions allow reverse-order approval without changing registration-order numbers', async () => {
  await completeSubmission(10)
  await completeSubmission(11)
  applicationApprovalEventId = (await approve(11)).rows[0].result.event_id
  await approve(10)
  assert.equal(await numberOf(10), 'ZXS_278')
  assert.equal(await numberOf(11), 'ZXS_279')
})
await check('repeated approval does not allocate a new number', async () => {
  const before = await numberOf(10)
  await approve(10)
  assert.equal(await numberOf(10), before)
})
await check('name resubmission keeps the number allocated on the first registration', async () => {
  await fixture(12)
  await registerName(12, 'New member C')
  const before = await numberOf(12)
  await registerName(12, 'New member C renamed')
  assert.equal(await numberOf(12), before)
})
await check('an unregistered roster member receives the reserved number on normal registration', async () => {
  const roster = (await db.query("SELECT full_name,member_number FROM private.member_number_roster() WHERE member_number='ZXS_035'")).rows[0]
  await fixture(13)
  await registerName(13, roster.full_name)
  assert.equal(await numberOf(13), 'ZXS_035')
  await completeSubmission(13)
  await approve(13)
  assert.equal(await numberOf(13), 'ZXS_035')
})
await check('admin cannot take an unclaimed roster number for a different member', async () => {
  await assert.rejects(changeNumber(12, 'ZXS_036'), /MEMBER_NUMBER_(TAKEN|RESERVED)/)
})
await check('duplicate number edits reject atomically and keep the prior value', async () => {
  const before = await numberOf(12)
  await assert.rejects(changeNumber(12, 'ZXS_278'), /MEMBER_NUMBER_TAKEN/)
  assert.equal(await numberOf(12), before)
})
await check('manual high number raises the next allocation to 441', async () => {
  accountNumberEventId = (await changeNumber(12, 'ZXS_440')).rows[0].result.event_id
  await fixture(14)
  await registerName(14, 'After high manual number')
  assert.equal(await numberOf(14), 'ZXS_441')
})
await check('retired former number cannot be manually reassigned', async () => {
  await assert.rejects(changeNumber(14, 'ZXS_280'), /MEMBER_NUMBER_(TAKEN|RETIRED)/)
})
await check('actual anonymization clears the highest number without reusing it', async () => {
  await asUser(900, () => db.query("SELECT public.admin_anonymize_member($1,'编号匿名化隔离验证')", [member(14)]))
  assert.equal(await numberOf(14), null)
  await fixture(15)
  await registerName(15, 'After anonymization')
  assert.equal(await numberOf(15), 'ZXS_442')
  await assert.rejects(changeNumber(15, 'ZXS_441'), /MEMBER_NUMBER_(TAKEN|RETIRED)/)
})
await check('membership number automatically grows beyond three digits', async () => {
  await changeNumber(15, 'ZXS_999')
  await fixture(16)
  await registerName(16, 'Four digit member')
  assert.equal(await numberOf(16), 'ZXS_1000')
})
await check('old lowercase and extra-zero audit numbers remain retired and raise allocation high-water mark', async () => {
  await db.query(`INSERT INTO private.member_profile_audit_log(member_id,member_id_snapshot,action_type,section,changed_fields,before_values,after_values,source)
    VALUES($1,$1,'profile_update','account',ARRAY['member_number'],'{"member_number":"zxs_001234"}'::jsonb,'{}'::jsonb,'legacy_profile')`, [member(16)])
  await assert.rejects(changeNumber(16, 'ZXS_1234'), /MEMBER_NUMBER_(TAKEN|RETIRED)/)
  await fixture(17)
  await registerName(17, 'After historical number variant')
  assert.equal(await numberOf(17), 'ZXS_1235')
})
await check('private allocation functions and sequence are inaccessible to API roles', async () => {
  const names = [...migration.matchAll(/CREATE OR REPLACE FUNCTION (private\.member_number_[a-z_]+)\(/g)].map(match => match[1])
  const functions = (await db.query("SELECT p.oid,n.nspname || '.' || p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'member_number_%'")).rows
  for (const fn of functions) {
    assert.ok(names.includes(fn.name), fn.name)
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal((await db.query('SELECT has_function_privilege($1,$2::oid,\'EXECUTE\') AS allowed', [role, fn.oid])).rows[0].allowed, false, `${role} can execute ${fn.name}`)
    }
  }
  assert.ok(functions.length >= 8)
  const sequences = (await db.query("SELECT c.oid,n.nspname || '.' || c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relkind='S' AND c.relname LIKE 'member_number_%'")).rows
  assert.equal(sequences.length, 1)
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal((await db.query("SELECT has_sequence_privilege($1,$2::oid,'USAGE,SELECT,UPDATE') AS allowed", [role, sequences[0].oid])).rows[0].allowed, false, `${role} can access allocation sequence`)
  }
  await assert.rejects(asUser(16, () => db.query('SELECT private.member_number_next()')), /permission denied/)
})
await check('allocations, corrections, edits and retirement remain in immutable audit history', async () => {
  const rows = (await db.query("SELECT before_values,after_values,metadata FROM private.member_profile_audit_log WHERE changed_fields && ARRAY['member_number']::text[] OR section LIKE '%number%'")).rows
  const text = JSON.stringify(rows)
  for (const number of ['ZXS_081', 'ZXS_278', 'ZXS_440', 'ZXS_441', 'ZXS_1000']) assert.ok(text.includes(number), `Missing audit of ${number}`)
  await assert.rejects(db.query("UPDATE private.member_profile_audit_log SET metadata='{}'"), /MEMBER_MASTER_AUDIT_APPEND_ONLY/)
})
await check('actual restore RPC rejects account number events through its existing section whitelist', async () => {
  assert.ok(accountNumberEventId)
  await assert.rejects(restoreEvent(accountNumberEventId), /MEMBER_MASTER_EVENT_NOT_RESTORABLE/)
  assert.equal(await numberOf(12), 'ZXS_440')
})
await check('actual identity restore keeps the existing number and does not issue or retire a number', async () => {
  const before = await numberOf(10)
  const beforeLedger = (await db.query("SELECT count(*)::int AS count FROM private.member_profile_audit_log WHERE metadata ? 'member_number_event'")).rows[0].count
  const edited = await adminEdit(10, 'identity', { full_name: 'Restoration fixture renamed' })
  assert.equal(await numberOf(10), before)
  await restoreEvent(edited.rows[0].result.event_id)
  assert.equal((await db.query('SELECT full_name FROM public.member_identity WHERE member_id=$1', [member(10)])).rows[0].full_name, 'New member A')
  assert.equal(await numberOf(10), before)
  assert.equal((await db.query("SELECT count(*)::int AS count FROM private.member_profile_audit_log WHERE metadata ? 'member_number_event'")).rows[0].count, beforeLedger)
})
await check('actual application restore and subsequent approval preserve the assigned number', async () => {
  const before = await numberOf(11)
  const beforeSequence = (await db.query('SELECT last_value FROM private.member_number_sequence')).rows[0].last_value
  await restoreEvent(applicationApprovalEventId)
  assert.equal((await db.query('SELECT status FROM public.members WHERE id=$1', [member(11)])).rows[0].status, 'pending')
  assert.equal(await numberOf(11), before)
  await approve(11)
  assert.equal(await numberOf(11), before)
  assert.equal((await db.query('SELECT last_value FROM private.member_number_sequence')).rows[0].last_value, beforeSequence)
})

if (process.env.MEMBER_NUMBER_BASELINE_JSON) await check('read-only production snapshot backfills only current records and preserves official/historical numbers', async () => {
  const baseline = JSON.parse(readFileSync(process.env.MEMBER_NUMBER_BASELINE_JSON, 'utf8')).rows[0].preflight
  const history = process.env.MEMBER_NUMBER_HISTORY_JSON
    ? JSON.parse(readFileSync(process.env.MEMBER_NUMBER_HISTORY_JSON, 'utf8')).rows[0].history_preflight.number_history
    : null
  const isolated = new PGlite()
  try {
    for (const sql of bootstrapSQL) await isolated.exec(sql)
    if (baseline.functions?.member_master_sync_lifecycle) await isolated.exec(baseline.functions.member_master_sync_lifecycle)
    // Seed the snapshot through the existing internal audit suppression flag.
    // Original audit IDs can then be imported without colliding with fixture-created events.
    // The real prepare-event and append-only audit triggers remain installed throughout.
    if (history) await isolated.query("SELECT set_config('app.member_master_skip_member_audit','on',false)")
    for (const row of baseline.snapshot) {
      const current = row.scope === 'current'
      const bindAuth = current && !row.anonymized_at
      if (bindAuth) await isolated.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [row.id, `fixture-${row.id}@example.local`])
      await isolated.query(`INSERT INTO public.members(id,user_id,email,status,member_number,record_scope,record_source,account_status,anonymized_at,created_at,updated_at,profile_stage)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11)`, [row.id, bindAuth ? row.id : null, bindAuth ? `fixture-${row.id}@example.local` : null,
        row.status, row.number, row.scope, row.source, row.account_status ?? (row.anonymized_at ? 'closed' : current ? 'active' : 'unbound'), row.anonymized_at, row.created_at, row.profile_stage ?? 'not_started'])
      if (row.full_name !== null) await isolated.query(`INSERT INTO public.member_identity(member_id,full_name,gender,age_range,nationality,current_city,created_at)
        VALUES($1,$2,'other','fixture','fixture','fixture',$3)`, [row.id, row.full_name, row.identity_created_at || row.created_at])
    }
    if (history) {
      await isolated.query("SELECT set_config('app.member_master_skip_member_audit','off',false)")
      for (const event of history) {
        await isolated.query(`INSERT INTO private.member_profile_audit_log
          (id,member_id,member_id_snapshot,action_type,section,changed_fields,before_values,after_values,source,metadata,created_at)
          OVERRIDING SYSTEM VALUE
          VALUES($1,$2,$2,$3,$4,ARRAY['member_number'],jsonb_build_object('member_number',$5::text),jsonb_build_object('member_number',$6::text),$7,
            jsonb_strip_nulls(jsonb_build_object('member_number',$8::text,'member_number_event',$9::text)),$10)`,
        [event.id, event.member_id_snapshot, event.action_type, event.section ?? 'account', event.before_number, event.after_number,
          event.source, event.metadata_number, event.number_event ?? event.event ?? null, event.created_at])
      }
      await isolated.query("SELECT setval(pg_get_serial_sequence('private.member_profile_audit_log','id')::regclass,COALESCE((SELECT max(id) FROM private.member_profile_audit_log),1),true)")
      assert.equal((await isolated.query('SELECT count(*)::int AS count FROM private.member_profile_audit_log')).rows[0].count, history.length)
      await assert.rejects(isolated.query("UPDATE private.member_profile_audit_log SET metadata='{}'"), /MEMBER_MASTER_AUDIT_APPEND_ONLY/)
      console.log(`Loaded ${history.length} original number-history events with append-only audit protection`)
    }
    const originalAuditRows = history ? (await isolated.query('SELECT * FROM private.member_profile_audit_log ORDER BY id')).rows : null
    await isolated.exec(migration)
    if (history) {
      const preserved = (await isolated.query('SELECT * FROM private.member_profile_audit_log WHERE id=ANY($1::bigint[]) ORDER BY id', [history.map(event => event.id)])).rows
      assert.deepEqual(preserved, originalAuditRows, 'Original number-history events were rewritten')
      const target = baseline.snapshot.find(row => row.full_name === '陈风' && row.scope === 'current')
      assert.ok(target)
      assert.deepEqual((await isolated.query("SELECT id FROM public.members WHERE member_number='ZXS_001'")).rows, [{ id: target.id }])
      const enabled = (await isolated.query("SELECT tgname,tgenabled FROM pg_trigger WHERE tgname IN ('member_number_before_write','member_number_audit_change','member_number_on_identity_saved') ORDER BY tgname")).rows
      assert.equal(enabled.length, 3)
      assert.ok(enabled.every(trigger => trigger.tgenabled === 'O'), 'Number-allocation trigger left disabled')
      console.log('Verified sole 陈风 ownership of ZXS_001, original history unchanged, all 3 number triggers enabled')
    }
    const roster = new Map((await isolated.query('SELECT * FROM private.member_number_roster()')).rows.map(row => [row.full_name, row.member_number]))
    const actual = new Map((await isolated.query('SELECT id,member_number FROM public.members')).rows.map(row => [row.id, row.member_number]))
    assert.equal(actual.size, baseline.snapshot.length)
    let matched = 0
    for (const row of baseline.snapshot) {
      const expected = row.full_name === null ? undefined : roster.get(row.full_name.trim())
      if (row.scope !== 'current' || ['legacy', 'import'].includes(row.source) || row.anonymized_at || row.account_status === 'closed') {
        assert.equal(actual.get(row.id), row.number, 'Historical/import/anonymous record was rewritten')
      } else if (expected) {
        assert.equal(actual.get(row.id), expected, 'Roster member did not receive their reserved number')
        matched++
      } else if (row.number?.toUpperCase().match(/^ZXS_[0-9]{3,18}$/)) {
        const digits = String(BigInt(row.number.slice(4))).padStart(3, '0')
        assert.equal(actual.get(row.id), 'ZXS_' + digits, 'Existing canonical number was reassigned')
      } else if (row.full_name) {
        assert.match(actual.get(row.id), /^ZXS_[0-9]{3,}$/)
        assert.ok(BigInt(actual.get(row.id).slice(4)) >= 248n)
      }
    }
    assert.equal(matched, Array.isArray(baseline.current_roster_matches) ? baseline.current_roster_matches.length : Number(baseline.current_roster_matches))
    console.log(`Verified ${actual.size} baseline member records, ${matched} current roster matches; no records created`)
  } finally { await isolated.close() }
})

if (process.env.MEMBER_NUMBER_BASELINE_JSON && process.env.MEMBER_NUMBER_HISTORY_JSON) {
  const originalSnapshot = JSON.parse(readFileSync(process.env.MEMBER_NUMBER_BASELINE_JSON, 'utf8')).rows[0].preflight
  const originalHistory = JSON.parse(readFileSync(process.env.MEMBER_NUMBER_HISTORY_JSON, 'utf8')).rows[0].history_preflight.number_history
  const official = originalSnapshot.snapshot.find(row => row.number === 'ZXS_000' && row.scope === 'current')
  assert.ok(official, 'Missing official-account fixture')
  const clone = value => JSON.parse(JSON.stringify(value))
  const nextHistoryId = Math.max(...originalHistory.map(row => Number(row.id))) + 1

  async function loadBaselineFixture(baseline, history) {
    const isolated = new PGlite()
    for (const sql of bootstrapSQL) await isolated.exec(sql)
    if (baseline.functions?.member_master_sync_lifecycle) await isolated.exec(baseline.functions.member_master_sync_lifecycle)
    await isolated.query("SELECT set_config('app.member_master_skip_member_audit','on',false)")
    for (const row of baseline.snapshot) {
      const current = row.scope === 'current'
      const bindAuth = current && !row.anonymized_at
      if (bindAuth) await isolated.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [row.id, `fixture-${row.id}@example.local`])
      await isolated.query(`INSERT INTO public.members(id,user_id,email,status,member_number,record_scope,record_source,account_status,anonymized_at,created_at,updated_at,profile_stage)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11)`, [row.id, bindAuth ? row.id : null, bindAuth ? `fixture-${row.id}@example.local` : null,
        row.status, row.number, row.scope, row.source, row.account_status ?? (row.anonymized_at ? 'closed' : current ? 'active' : 'unbound'), row.anonymized_at, row.created_at, row.profile_stage ?? 'not_started'])
      if (row.full_name !== null) await isolated.query(`INSERT INTO public.member_identity(member_id,full_name,gender,age_range,nationality,current_city,created_at)
        VALUES($1,$2,'other','fixture','fixture','fixture',$3)`, [row.id, row.full_name, row.identity_created_at || row.created_at])
    }
    await isolated.query("SELECT set_config('app.member_master_skip_member_audit','off',false)")
    for (const event of history) {
      await isolated.query(`INSERT INTO private.member_profile_audit_log
        (id,member_id,member_id_snapshot,action_type,section,changed_fields,before_values,after_values,source,metadata,created_at)
        OVERRIDING SYSTEM VALUE
        VALUES($1,$2,$2,$3,$4,ARRAY['member_number'],jsonb_build_object('member_number',$5::text),jsonb_build_object('member_number',$6::text),$7,
          jsonb_strip_nulls(jsonb_build_object('member_number',$8::text,'member_number_event',$9::text)),$10)`,
      [event.id, event.member_id_snapshot, event.action_type, event.section ?? 'account', event.before_number, event.after_number,
        event.source, event.metadata_number, event.number_event ?? event.event ?? null, event.created_at])
    }
    await isolated.query("SELECT setval(pg_get_serial_sequence('private.member_profile_audit_log','id')::regclass,COALESCE((SELECT max(id) FROM private.member_profile_audit_log),1),true)")
    return isolated
  }

  const stateOf = async isolated => ({
    members: (await isolated.query('SELECT id,member_number FROM public.members ORDER BY id')).rows,
    audits: (await isolated.query('SELECT * FROM private.member_profile_audit_log ORDER BY id')).rows,
    triggers: (await isolated.query("SELECT tgname,tgenabled FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname")).rows,
    functions: (await isolated.query("SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND proname LIKE 'member_number_%' ORDER BY proname")).rows,
    sequence: (await isolated.query("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relname='member_number_sequence'")).rows,
    constraints: (await isolated.query("SELECT conname FROM pg_constraint WHERE conrelid='public.members'::regclass ORDER BY conname")).rows,
  })
  async function rejectedCorrection(name, mutate, { setup, expected = /MEMBER_NUMBER_RETIRED/ } = {}) {
    await check(name, async () => {
      const baseline = clone(originalSnapshot)
      const history = clone(originalHistory)
      mutate(baseline, history)
      const isolated = await loadBaselineFixture(baseline, history)
      try {
        if (setup) await setup(isolated, baseline)
        const before = await stateOf(isolated)
        await assert.rejects(isolated.exec(migration), expected)
        await isolated.exec('ROLLBACK')
        assert.deepEqual(await stateOf(isolated), before, 'Failed correction left data, audit, triggers or migration objects changed')
      } finally { await isolated.close() }
    })
  }
  const extraEvent = overrides => ({
    id: nextHistoryId, member_id_snapshot: official.id, action_type: 'member_lifecycle_update', section: 'account', source: 'admin',
    before_number: null, after_number: 'ZXS_001', metadata_number: null, number_event: null, created_at: '2026-10-06T00:00:00Z', ...overrides,
  })
  await rejectedCorrection('third-account historical claim of ZXS_001 still rejects and rolls back the whole migration', (baseline, history) => {
    const third = baseline.snapshot.find(row => row.id !== official.id && row.full_name !== '陈风')
    assert.ok(third)
    history.push(extraEvent({ member_id_snapshot: third.id }))
  })
  await rejectedCorrection('explicit retirement of ZXS_001 still rejects and rolls back the whole migration', (_, history) => {
    history.push(extraEvent({ before_number: 'ZXS_001', after_number: null, metadata_number: 'ZXS_001', number_event: 'retired' }))
  })
  await rejectedCorrection('closed official account blocks the correction and rolls back the whole migration', baseline => {
    baseline.snapshot.find(row => row.id === official.id).account_status = 'closed'
  })
  await rejectedCorrection('anonymized official account blocks the correction and rolls back the whole migration', baseline => {
    const row = baseline.snapshot.find(row => row.id === official.id)
    row.account_status = 'closed'
    row.anonymized_at = '2026-10-06T00:00:00Z'
  })
  await rejectedCorrection('different evidence timestamp blocks the correction and rolls back the whole migration', (_, history) => {
    const event = history.find(row => Number(row.id) === 1333)
    assert.ok(event)
    event.created_at = new Date(new Date(event.created_at).getTime() + 1000).toISOString()
  })
  await rejectedCorrection('different evidence source blocks the correction and rolls back the whole migration', (_, history) => {
    const event = history.find(row => Number(row.id) === 1333)
    assert.ok(event)
    event.source = 'legacy_profile'
  })
  await rejectedCorrection('historical canonical alias zxs_0001 without related audit cannot be overwritten', (baseline, history) => {
    const occupant = baseline.snapshot.find(row => row.scope === 'historical')
    assert.ok(occupant)
    occupant.number = 'zxs_0001'
    const unrelated = history.filter(event => event.member_id_snapshot !== occupant.id)
    history.splice(0, history.length, ...unrelated)
  }, { expected: /MEMBER_NUMBER_TAKEN/ })
  await rejectedCorrection('closed target account blocks the correction and rolls back the whole migration', baseline => {
    const target = baseline.snapshot.find(row => row.full_name === '陈风' && row.scope === 'current')
    assert.ok(target)
    target.account_status = 'closed'
  })
  await rejectedCorrection('anonymized target account blocks the correction and rolls back the whole migration', baseline => {
    const target = baseline.snapshot.find(row => row.full_name === '陈风' && row.scope === 'current')
    assert.ok(target)
    target.account_status = 'closed'
    target.anonymized_at = '2026-10-06T00:00:00Z'
  })
  for (const eventId of [1333, 1334]) {
    await rejectedCorrection(`missing known audit ${eventId} blocks the correction and rolls back the whole migration`, (_, history) => {
      const eventIndex = history.findIndex(event => Number(event.id) === eventId)
      assert.ok(eventIndex >= 0)
      history.splice(eventIndex, 1)
    })
  }
  await rejectedCorrection('AFTER-trigger error while BEFORE guard is disabled restores the guard and the whole transaction', () => {}, {
    expected: /TEST_CORRECTION_AFTER_FAILURE/,
    setup: async (isolated, baseline) => {
      const target = baseline.snapshot.find(row => row.full_name === '陈风' && row.scope === 'current')
      assert.ok(target)
      await isolated.query("SELECT set_config('test.member_number_correction_target',$1,false)", [target.id])
      await isolated.exec(`
        CREATE FUNCTION private.member_number_test_after_failure() RETURNS trigger LANGUAGE plpgsql AS $test_abort$
        BEGIN
          IF NEW.id = current_setting('test.member_number_correction_target', true)::uuid
             AND OLD.member_number IS NULL AND NEW.member_number = 'ZXS_001' THEN
            IF (SELECT tgenabled FROM pg_trigger WHERE tgname='member_number_before_write') IS DISTINCT FROM 'D'::"char" THEN
              RAISE EXCEPTION 'TEST_FAILURE_DID_NOT_REACH_DISABLED_GUARD';
            END IF;
            RAISE EXCEPTION 'TEST_CORRECTION_AFTER_FAILURE';
          END IF;
          RETURN NEW;
        END;
        $test_abort$;
        CREATE TRIGGER zz_member_number_test_after_failure AFTER UPDATE OF member_number ON public.members
          FOR EACH ROW EXECUTE FUNCTION private.member_number_test_after_failure();
      `)
    },
  })
}

await db.close()
console.log(`PASS ${passed} member-number database checks`)
