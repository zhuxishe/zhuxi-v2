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

// The one-time 249/250 correction is tested against fresh isolated databases.
// Keep this independent of the allocation tests and any optional live snapshots.
{
  const { randomUUID } = await import('node:crypto')
  const swapMigration = read('supabase/migrations/20261012121626_swap_member_numbers_249_250.sql')
  const swapTables = [
    'public.members', 'auth.users', 'public.member_identity', 'public.legacy_members',
    'public.community_notifications', 'private.member_role_assignments',
    'public.match_round_submissions', 'public.match_results', 'public.activity_records',
    'public.member_language', 'public.member_interests', 'private.member_profile_audit_log',
  ]
  async function swapState(isolated) {
    const tables = {}
    for (const table of swapTables) {
      tables[table] = (await isolated.query(`SELECT to_jsonb(row) AS row FROM ${table} AS row ORDER BY to_jsonb(row)::text`)).rows.map(row => row.row)
    }
    return {
      tables,
      triggers: (await isolated.query("SELECT tgrelid::regclass::text AS table_name,tgname,tgenabled FROM pg_trigger WHERE NOT tgisinternal ORDER BY table_name,tgname")).rows,
      sequence: (await isolated.query('SELECT last_value::text,is_called FROM private.member_number_sequence')).rows,
      constraints: (await isolated.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.members'::regclass ORDER BY conname")).rows,
    }
  }
  async function loadSwapFixture({ empty = false, unreviewedIdentity = false } = {}) {
    const isolated = new PGlite()
    for (const sql of bootstrapSQL) await isolated.exec(sql)
    await isolated.exec(`
      CREATE TABLE public.community_notifications(
        id uuid PRIMARY KEY, member_id uuid REFERENCES public.members(id),
        type text NOT NULL, title text, is_read boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE private.member_role_assignments(
        id uuid PRIMARY KEY, member_id uuid NOT NULL REFERENCES public.members(id),
        role_key text NOT NULL, assigned_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
      );
      ALTER TABLE public.match_round_submissions ADD CONSTRAINT swap_fixture_submissions_member_fk FOREIGN KEY(member_id) REFERENCES public.members(id);
      ALTER TABLE public.match_results ADD CONSTRAINT swap_fixture_match_a_fk FOREIGN KEY(member_a_id) REFERENCES public.members(id);
      ALTER TABLE public.match_results ADD CONSTRAINT swap_fixture_match_b_fk FOREIGN KEY(member_b_id) REFERENCES public.members(id);
      ALTER TABLE public.legacy_members ADD CONSTRAINT swap_fixture_legacy_canonical_fk FOREIGN KEY(canonical_member_id) REFERENCES public.members(id);
    `)
    const fixture = {
      isolated,
      formal: unreviewedIdentity ? randomUUID() : '627b6d93-b5f0-4cb6-82c8-4f9e76b2225a',
      internal: '9fc90347-548d-4999-b75a-d40c15e43716',
      third: randomUUID(), formalUser: randomUUID(), internalUser: randomUUID(),
    }
    if (!empty) {
      const createdAt = '2026-10-08T05:06:07.123Z'
      for (const [id, authId, name, number] of [
        [fixture.formal, fixture.formalUser, '祝安冬', 'ZXS_250'],
        [fixture.internal, fixture.internalUser, '测试专用·', 'ZXS_249'],
      ]) {
        await isolated.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3::jsonb)', [authId, `${authId}@fixture.local`, JSON.stringify({ fixture: name })])
        await isolated.query(`INSERT INTO public.members(id,user_id,email,status,member_number,account_status,profile_stage,record_source,record_scope,onboarding_step,submitted_at,last_profile_saved_at,account_linked_at,created_at,updated_at)
          VALUES($1,$2,$3,'approved',$4,'active','complete','app','current',4,$5,$5,$5,$5,$5)`, [id, authId, `${authId}@fixture.local`, number, createdAt])
        await isolated.query("INSERT INTO public.member_identity(id,member_id,full_name,gender,age_range,nationality,current_city,created_at,updated_at) VALUES($1,$2,$3,'other','20-30','中国','东京',$4,$4)", [randomUUID(), id, name, createdAt])
        await isolated.query("INSERT INTO private.member_role_assignments(id,member_id,role_key,assigned_at) VALUES($1,$2,'member',$3)", [randomUUID(), id, createdAt])
        await isolated.query("INSERT INTO public.community_notifications(id,member_id,type,title,created_at) VALUES($1,$2,'fixture','Existing notification',$3)", [randomUUID(), id, createdAt])
        await isolated.query("INSERT INTO public.match_round_submissions(member_id,game_type_pref,gender_pref,availability,message) VALUES($1,'fixture','any','{}'::jsonb,'Existing registration')", [id])
        await isolated.query("INSERT INTO public.member_language(member_id,japanese_level,created_at,updated_at) VALUES($1,'fixture',$2,$2)", [id, createdAt])
      }
      await isolated.query("INSERT INTO public.match_results(member_a_id,member_b_id,cancellation_reason) VALUES($1,$2,'Existing matching')", [fixture.formal, fixture.internal])
      await isolated.query("INSERT INTO public.activity_records(id,participant_ids,late_member_ids,no_show_member_ids,notes) VALUES($1,$2::uuid[],'{}','{}','Existing activity')", [randomUUID(), [fixture.formal, fixture.internal]])
    }
    await isolated.exec(migration)
    return fixture
  }
  async function rejectedSwap(name, mutate, expected = /MEMBER_NUMBER_SWAP_/) {
    await check(name, async () => {
      const fixture = await loadSwapFixture()
      const { isolated } = fixture
      try {
        await mutate(fixture)
        const before = await swapState(isolated)
        await assert.rejects(isolated.exec(swapMigration), expected)
        await isolated.exec('ROLLBACK')
        assert.deepEqual(await swapState(isolated), before, 'Rejected number swap changed data, audit, trigger state, sequence or constraints')
      } finally { await isolated.close() }
    })
  }

  await check('249/250 swap changes only the two member numbers, preserves all timestamps and relations, and appends accurate correction audit', async () => {
    const { isolated, formal, internal, third } = await loadSwapFixture()
    try {
      const before = await swapState(isolated)
      await isolated.exec(swapMigration)
      const after = await swapState(isolated)
      const expectedMembers = before.tables['public.members'].map(row => ({ ...row, member_number: row.id === formal ? 'ZXS_249' : row.id === internal ? 'ZXS_250' : row.member_number }))
      assert.deepEqual(after.tables['public.members'], expectedMembers)
      for (const table of swapTables.filter(table => !['public.members', 'private.member_profile_audit_log'].includes(table))) {
        assert.deepEqual(after.tables[table], before.tables[table], `Number swap changed ${table}`)
      }
      assert.deepEqual(after.triggers, before.triggers)
      assert.deepEqual(after.sequence, before.sequence)
      assert.deepEqual(after.constraints, before.constraints)
      const oldIds = new Set(before.tables['private.member_profile_audit_log'].map(row => row.id))
      const oldAudit = after.tables['private.member_profile_audit_log'].filter(row => oldIds.has(row.id))
      assert.deepEqual(oldAudit, before.tables['private.member_profile_audit_log'], 'Original audit rows changed')
      const newAudit = after.tables['private.member_profile_audit_log'].filter(row => !oldIds.has(row.id))
      assert.equal(newAudit.length, 9, 'Existing audit triggers and two semantic correction records must be preserved')
      const corrections = newAudit.filter(row => row.metadata?.member_number_event === 'pair_swap')
      assert.equal(corrections.length, 2, 'One semantic correction record is required per member')
      for (const [id, oldNumber, newNumber] of [[formal, 'ZXS_250', 'ZXS_249'], [internal, 'ZXS_249', 'ZXS_250']]) {
        const event = corrections.find(row => row.member_id_snapshot === id)
        assert.ok(event)
        assert.deepEqual(event.changed_fields, ['member_number'])
        assert.equal(event.before_values.member_number, oldNumber)
        assert.equal(event.after_values.member_number, newNumber)
        assert.equal(event.source, 'migration')
        assert.ok(event.reason)
        assert.equal(event.metadata.correction_scope, 'member_number_249_250_swap_2026_10_12')
        assert.equal(event.metadata.counterpart_member_id, id === formal ? internal : formal)
      }
      await isolated.exec(swapMigration)
      assert.deepEqual(await swapState(isolated), after, 'Repeated swap is not idempotent')
      await isolated.query("INSERT INTO public.members(id,status,record_source,account_status) VALUES($1,'pending','app','unbound')", [third])
      await assert.rejects(isolated.query("UPDATE public.members SET member_number='ZXS_249' WHERE id=$1", [third]), /MEMBER_NUMBER_TAKEN/)
      await isolated.query("UPDATE public.members SET member_number='ZXS_251' WHERE id=$1", [formal])
      await assert.rejects(isolated.query("UPDATE public.members SET member_number='ZXS_249' WHERE id=$1", [third]), /MEMBER_NUMBER_RETIRED/)
    } finally { await isolated.close() }
  })
  await check('249/250 correction skips a fresh database without relevant names or numbers', async () => {
    const { isolated } = await loadSwapFixture({ empty: true })
    try {
      const before = await swapState(isolated)
      await isolated.exec(swapMigration)
      assert.deepEqual(await swapState(isolated), before)
    } finally { await isolated.close() }
  })
  await rejectedSwap('249/250 correction rejects a missing target without leaving changes', async ({ isolated, formal }) => {
    await isolated.query("UPDATE public.member_identity SET full_name='Different formal fixture' WHERE member_id=$1", [formal])
  })
  await check('249/250 correction rejects a recreated same-name account with an unreviewed UUID', async () => {
    const { isolated } = await loadSwapFixture({ unreviewedIdentity: true })
    try {
      const before = await swapState(isolated)
      await assert.rejects(isolated.exec(swapMigration), /MEMBER_NUMBER_SWAP_IDENTITY_MISMATCH/)
      await isolated.exec('ROLLBACK')
      assert.deepEqual(await swapState(isolated), before)
    } finally { await isolated.close() }
  })
  await rejectedSwap('249/250 correction rejects a conflicting duplicate target name', async ({ isolated, third }) => {
    await isolated.query("INSERT INTO public.members(id,status,record_source,account_status) VALUES($1,'pending','app','unbound')", [third])
    await isolated.query("INSERT INTO public.member_identity(member_id,full_name,gender,age_range,nationality,current_city) VALUES($1,'祝安冬','other','fixture','fixture','fixture')", [third])
  })
  await rejectedSwap('249/250 correction rejects a closed formal account', async ({ isolated, formal }) => {
    await isolated.query("UPDATE public.members SET account_status='closed' WHERE id=$1", [formal])
  })
  await rejectedSwap('249/250 correction rejects anomalous approved lifecycle fields', async ({ isolated, formal }) => {
    await isolated.exec('ALTER TABLE public.members DISABLE TRIGGER member_master_sync_lifecycle')
    await isolated.query("UPDATE public.members SET profile_stage='in_progress',onboarding_step=1,submitted_at=NULL WHERE id=$1", [formal])
    await isolated.exec('ALTER TABLE public.members ENABLE TRIGGER member_master_sync_lifecycle')
  })
  await rejectedSwap('249/250 correction rejects unrelated historical ownership of either number', async ({ isolated, third }) => {
    await isolated.query("INSERT INTO public.members(id,status,record_source,account_status,member_number) VALUES($1,'pending','import','unbound','IMP-swap-history')", [third])
    await isolated.query(`INSERT INTO private.member_profile_audit_log(member_id,member_id_snapshot,action_type,section,changed_fields,before_values,after_values,source,metadata)
      VALUES($1,$1,'member_lifecycle_update','account',ARRAY['member_number'],'{}'::jsonb,'{"member_number":"ZXS_249"}'::jsonb,'migration','{"member_number":"ZXS_249","member_number_event":"allocated"}'::jsonb)`, [third])
  })
  await rejectedSwap('249/250 correction rejects another account holding a normalized alias of a target number', async ({ isolated, third }) => {
    await isolated.query("INSERT INTO public.members(id,status,record_source,account_status,member_number) VALUES($1,'pending','import','unbound','zxs_0250')", [third])
  }, /MEMBER_NUMBER_SWAP_THIRD_PARTY_CLAIM/)
  await rejectedSwap('249/250 correction rejects a linked legacy record', async ({ isolated, formal }) => {
    await isolated.query("INSERT INTO public.legacy_members(id,canonical_member_id,member_no,full_name) VALUES($1,$2,'No.fixture','Fixture legacy profile')", [randomUUID(), formal])
  }, /MEMBER_NUMBER_SWAP_LEGACY_LINK/)
  await rejectedSwap('249/250 correction rejects published member updates that could expose transient numbers', async ({ isolated }) => {
    await isolated.exec('CREATE PUBLICATION swap_fixture_realtime FOR TABLE public.members')
  }, /MEMBER_NUMBER_SWAP_REALTIME_PUBLICATION/)
  await rejectedSwap('249/250 correction rolls back an unexpected notification change from an existing trigger', async ({ isolated }) => {
    await isolated.exec(`
      CREATE OR REPLACE FUNCTION private.member_number_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE public.community_notifications SET title='Unexpected notification mutation' WHERE member_id=NEW.id;
        RETURN NULL;
      END;$$;
    `)
  }, /MEMBER_NUMBER_SWAP_DEPENDENCY_CHANGED/)
  await rejectedSwap('249/250 correction rolls back an unexpected registration change through a member foreign key', async ({ isolated }) => {
    await isolated.exec(`
      CREATE OR REPLACE FUNCTION private.member_number_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE public.match_round_submissions SET message='Unexpected registration mutation' WHERE member_id=NEW.id;
        RETURN NULL;
      END;$$;
    `)
  }, /MEMBER_NUMBER_SWAP_DEPENDENCY_CHANGED/)
  await rejectedSwap('249/250 correction rejects an unknown member trigger before changing data', async ({ isolated }) => {
    await isolated.exec(`
      CREATE FUNCTION private.member_number_swap_test_unknown_trigger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END;$$;
      CREATE TRIGGER zz_member_number_swap_test_unknown_trigger AFTER UPDATE ON public.members
        FOR EACH ROW EXECUTE FUNCTION private.member_number_swap_test_unknown_trigger();
    `)
  }, /MEMBER_NUMBER_SWAP_TRIGGER_MISMATCH/)
  await rejectedSwap('249/250 correction rejects an unreviewed function hidden behind a known trigger name', async ({ isolated }) => {
    await isolated.exec(`
      CREATE FUNCTION private.member_number_swap_test_unreviewed_function() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END;$$;
      DROP TRIGGER member_number_before_write ON public.members;
      CREATE TRIGGER member_number_before_write BEFORE UPDATE OF member_number ON public.members
        FOR EACH ROW EXECUTE FUNCTION private.member_number_swap_test_unreviewed_function();
    `)
  }, /MEMBER_NUMBER_SWAP_TRIGGER_MISMATCH/)
  for (const auditTrigger of ['member_master_prepare_audit_event', 'member_master_reject_audit_mutation']) {
    await rejectedSwap(`249/250 correction rejects disabled audit protection ${auditTrigger}`, async ({ isolated }) => {
      await isolated.exec(`ALTER TABLE private.member_profile_audit_log DISABLE TRIGGER ${auditTrigger}`)
    }, /MEMBER_NUMBER_SWAP_TRIGGER_MISMATCH/)
    await rejectedSwap(`249/250 correction rejects missing audit protection ${auditTrigger}`, async ({ isolated }) => {
      await isolated.exec(`DROP TRIGGER ${auditTrigger} ON private.member_profile_audit_log`)
    }, /MEMBER_NUMBER_SWAP_TRIGGER_MISMATCH/)
  }
  await rejectedSwap('249/250 correction rejects already reversed numbers with two correction markers for only one member', async ({ isolated, formal, internal }) => {
    await isolated.exec('ALTER TABLE public.members DISABLE TRIGGER member_number_before_write')
    await isolated.query('UPDATE public.members SET member_number=NULL WHERE id=$1', [internal])
    await isolated.query("UPDATE public.members SET member_number='ZXS_249' WHERE id=$1", [formal])
    await isolated.query("UPDATE public.members SET member_number='ZXS_250' WHERE id=$1", [internal])
    await isolated.exec('ALTER TABLE public.members ENABLE TRIGGER member_number_before_write')
    await isolated.query(`INSERT INTO private.member_profile_audit_log(member_id,member_id_snapshot,action_type,section,changed_fields,before_values,after_values,reason,source,metadata)
      SELECT $1::uuid,$1::uuid,'member_lifecycle_update','account',ARRAY['member_number'],'{"member_number":"ZXS_250"}'::jsonb,'{"member_number":"ZXS_249"}'::jsonb,
        'Invalid duplicate correction evidence','migration','{"member_number_event":"pair_swap","correction_scope":"member_number_249_250_swap_2026_10_12"}'::jsonb
      FROM generate_series(1,2)`, [formal])
  }, /MEMBER_NUMBER_SWAP_NUMBER_MISMATCH/)
  await rejectedSwap('249/250 failure after the validator is disabled restores all data and trigger states on rollback', async ({ isolated, formal }) => {
    await isolated.query("SELECT set_config('test.member_number_swap_target',$1,false)", [formal])
    await isolated.exec(`
      CREATE OR REPLACE FUNCTION private.member_number_audit_change() RETURNS trigger LANGUAGE plpgsql AS $swap_abort$
      BEGIN
        IF NEW.id = current_setting('test.member_number_swap_target', true)::uuid
           AND NEW.member_number = 'ZXS_249' THEN
          IF (SELECT tgenabled FROM pg_trigger WHERE tgname='member_number_before_write') IS DISTINCT FROM 'D'::"char" THEN
            RAISE EXCEPTION 'TEST_SWAP_FAILURE_DID_NOT_REACH_DISABLED_GUARD';
          END IF;
          RAISE EXCEPTION 'TEST_SWAP_AFTER_FAILURE';
        END IF;
        RETURN NEW;
      END;
      $swap_abort$;
    `)
  }, /TEST_SWAP_AFTER_FAILURE/)
}

// Whitespace/short-name restoration and release of reviewed unused numbers are
// verified separately from the initial allocation and the earlier pair swap.
{
  const { randomUUID } = await import('node:crypto')
  const reconciliationMigrationPath = 'supabase/migrations/20261012134601_normalize_roster_names_and_reconcile_numbers.sql'
  const reconciliationScope = 'roster_name_whitespace_reconciliation_2026_10_12'
  const reviewed = [
    { id: 'a1a1bd49-9248-44c2-b32b-9bcd9c765da4', name: '黄 浩淳', before: 'ZXS_261', after: 'ZXS_125', allocation: 2416, nameAudit: 2417, firstName: '黄 浩淳' },
    { id: '41864dff-e981-493b-9f45-4b78fe73e1be', name: '戚 晏瑄', before: 'ZXS_259', after: 'ZXS_201', allocation: 2274, nameAudit: 2275, firstName: '戚 晏瑄' },
    { id: '5a30803f-fa7b-445c-8343-a0a81be6063c', name: '叶一达', before: 'ZXS_255', after: 'ZXS_196', allocation: 1750, nameAudit: 1751, firstName: '叶' },
    { id: '5b488c7e-b66f-4046-bf42-aed40699d367', name: '程竹涓', before: 'ZXS_256', after: 'ZXS_255', allocation: 1967, nameAudit: 1968, firstName: '程竹涓' },
    { id: '3edcf451-447d-4eae-8403-5664d497efa1', name: '胡妤欣', before: 'ZXS_260', after: 'ZXS_256', allocation: 2318, nameAudit: 2319, firstName: '胡妤欣' },
  ]
  const reconciliationTables = [
    'public.members', 'auth.users', 'public.member_identity', 'public.legacy_members',
    'public.community_notifications', 'private.member_role_assignments',
    'public.match_round_submissions', 'public.match_results', 'public.activity_records',
    'public.member_language', 'public.member_interests', 'private.member_profile_audit_log',
  ]
  async function reconciliationState(isolated) {
    const tables = {}
    for (const table of reconciliationTables) {
      tables[table] = (await isolated.query(`SELECT to_jsonb(row) AS row FROM ${table} AS row ORDER BY to_jsonb(row)::text`)).rows.map(row => row.row)
    }
    return {
      tables,
      triggers: (await isolated.query("SELECT tgrelid::regclass::text AS table_name,tgname,tgenabled,pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE NOT tgisinternal ORDER BY table_name,tgname")).rows,
      sequence: (await isolated.query('SELECT last_value::text,log_cnt::text,is_called FROM private.member_number_sequence')).rows,
      constraints: (await isolated.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.members'::regclass ORDER BY conname")).rows,
    }
  }
  async function loadReconciliationFixture({ empty = false } = {}) {
    const isolated = new PGlite()
    for (const sql of bootstrapSQL) await isolated.exec(sql)
    await isolated.exec(`
      CREATE TABLE public.community_notifications(
        id uuid PRIMARY KEY, member_id uuid REFERENCES public.members(id),
        type text NOT NULL, title text, is_read boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE private.member_role_assignments(
        id uuid PRIMARY KEY, member_id uuid NOT NULL REFERENCES public.members(id),
        role_key text NOT NULL, assigned_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
      );
      ALTER TABLE public.match_round_submissions ADD CONSTRAINT reconciliation_submissions_member_fk FOREIGN KEY(member_id) REFERENCES public.members(id);
      ALTER TABLE public.match_results ADD CONSTRAINT reconciliation_match_a_fk FOREIGN KEY(member_a_id) REFERENCES public.members(id);
      ALTER TABLE public.match_results ADD CONSTRAINT reconciliation_match_b_fk FOREIGN KEY(member_b_id) REFERENCES public.members(id);
      ALTER TABLE public.legacy_members ADD CONSTRAINT reconciliation_legacy_canonical_fk FOREIGN KEY(canonical_member_id) REFERENCES public.members(id);
    `)
    // Install the original allocation on a clean database, so its one-time
    // backfill does not stand in for the reconciliation being tested.
    await isolated.exec(migration)
    const fixture = { isolated, third: randomUUID(), retired: randomUUID() }
    if (empty) return fixture
    await isolated.exec(`
      ALTER TABLE public.members DISABLE TRIGGER member_number_before_write;
      ALTER TABLE public.members DISABLE TRIGGER member_number_audit_change;
      ALTER TABLE public.members DISABLE TRIGGER member_master_audit_member_change;
    `)
    const createdAt = '2026-10-08T05:06:07.123Z'
    const anchors = [
      { id: '627b6d93-b5f0-4cb6-82c8-4f9e76b2225a', name: '祝安冬', before: 'ZXS_249' },
      { id: '9fc90347-548d-4999-b75a-d40c15e43716', name: '测试专用·', before: 'ZXS_250' },
    ]
    for (const target of [...reviewed, ...anchors, { id: fixture.retired, name: 'Truly retired fixture', before: 'ZXS_248', closed: true }]) {
      const authId = randomUUID()
      await isolated.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3::jsonb)', [authId, `${authId}@fixture.local`, JSON.stringify({ fixture: target.name })])
      await isolated.query(`INSERT INTO public.members(id,user_id,email,status,member_number,account_status,profile_stage,record_source,record_scope,onboarding_step,submitted_at,last_profile_saved_at,account_linked_at,created_at,updated_at)
        VALUES($1,$2,$3,'approved',$4,$5,'complete','app','current',4,$6,$6,$6,$6,$6)`, [target.id, authId, `${authId}@fixture.local`, target.before, target.closed ? 'closed' : 'active', createdAt])
      await isolated.query("INSERT INTO public.member_identity(id,member_id,full_name,gender,age_range,nationality,current_city,created_at,updated_at) VALUES($1,$2,$3,'other','20-30','中国','东京',$4,$4)", [randomUUID(), target.id, target.name, createdAt])
      await isolated.query("INSERT INTO private.member_role_assignments(id,member_id,role_key,assigned_at) VALUES($1,$2,'member',$3)", [randomUUID(), target.id, createdAt])
      await isolated.query("INSERT INTO public.community_notifications(id,member_id,type,title,created_at) VALUES($1,$2,'fixture','Existing notification',$3)", [randomUUID(), target.id, createdAt])
      await isolated.query("INSERT INTO public.match_round_submissions(member_id,game_type_pref,gender_pref,availability,message) VALUES($1,'fixture','any','{}'::jsonb,'Existing registration')", [target.id])
      await isolated.query("INSERT INTO public.member_language(member_id,japanese_level,created_at,updated_at) VALUES($1,'fixture',$2,$2)", [target.id, createdAt])
    }
    await isolated.query("INSERT INTO public.match_results(member_a_id,member_b_id,cancellation_reason) VALUES($1,$2,'Existing matching')", [reviewed[0].id, reviewed[1].id])
    await isolated.query("INSERT INTO public.activity_records(id,participant_ids,late_member_ids,no_show_member_ids,notes) VALUES($1,$2::uuid[],'{}','{}','Existing activity')", [randomUUID(), reviewed.map(row => row.id)])
    for (const target of reviewed) {
      for (const eventId of [target.allocation - 1, target.allocation]) {
        const metadata = eventId === target.allocation ? { member_number_event: 'allocated', member_number_origin: 'automatic', member_number: target.before, offline_roster_version: '2026-10-06' } : {}
        await isolated.query(`INSERT INTO private.member_profile_audit_log(id,member_id,member_id_snapshot,action_type,section,changed_fields,before_values,after_values,source,metadata,created_at)
          OVERRIDING SYSTEM VALUE VALUES($1,$2,$2,'member_lifecycle_update',$6,ARRAY['member_number'],'{"member_number":null}'::jsonb,$3::jsonb,'system',$4::jsonb,$5)`, [eventId, target.id, JSON.stringify({ member_number: target.before }), JSON.stringify(metadata), createdAt, eventId === target.allocation ? 'account' : 'member'])
      }
      await isolated.query(`INSERT INTO private.member_profile_audit_log(id,member_id,member_id_snapshot,action_type,section,changed_fields,before_values,after_values,source,metadata,created_at)
        OVERRIDING SYSTEM VALUE VALUES($1,$2,$2,'onboarding_step_saved','onboarding_step_1',ARRAY['full_name'],'{"full_name":null}'::jsonb,$3::jsonb,'app','{}'::jsonb,$4)`, [target.nameAudit, target.id, JSON.stringify({ full_name: target.firstName }), createdAt])
    }
    await isolated.query(`INSERT INTO private.member_profile_audit_log(id,member_id,member_id_snapshot,action_type,section,changed_fields,before_values,after_values,source,metadata,created_at)
      OVERRIDING SYSTEM VALUE VALUES(2051,$1,$1,'admin_section_update','identity',ARRAY['full_name'],'{"full_name":"叶"}'::jsonb,'{"full_name":"叶一达"}'::jsonb,'admin','{}'::jsonb,$2)`, [reviewed[2].id, createdAt])
    await isolated.query(`INSERT INTO private.member_profile_audit_log(id,member_id,member_id_snapshot,action_type,section,changed_fields,before_values,after_values,source,metadata,created_at)
      OVERRIDING SYSTEM VALUE VALUES(1000,$1,$1,'member_lifecycle_update','account',ARRAY['member_number'],'{"member_number":null}'::jsonb,'{"member_number":"ZXS_248"}'::jsonb,'system','{"member_number_event":"allocated","member_number":"ZXS_248","member_number_origin":"automatic"}'::jsonb,$2),
            (1001,$1,$1,'member_lifecycle_update','account',ARRAY['account_status'],'{"member_number":"ZXS_248","account_status":"active"}'::jsonb,'{"member_number":"ZXS_248","account_status":"closed"}'::jsonb,'system','{"member_number_event":"retired","member_number":"ZXS_248","member_number_origin":"account_lifecycle"}'::jsonb,$2)`, [fixture.retired, createdAt])
    await isolated.exec(`
      SELECT setval(pg_get_serial_sequence('private.member_profile_audit_log','id'),2417,true);
      SELECT setval('private.member_number_sequence',261,true);
      ALTER TABLE public.members ENABLE TRIGGER member_number_before_write;
      ALTER TABLE public.members ENABLE TRIGGER member_number_audit_change;
      ALTER TABLE public.members ENABLE TRIGGER member_master_audit_member_change;
    `)
    return fixture
  }
  async function reconciliationRegister(isolated, name) {
    const authId = randomUUID()
    const memberId = randomUUID()
    await isolated.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [authId, `${authId}@fixture.local`])
    await isolated.query("INSERT INTO public.members(id,user_id,email,status,record_source,account_status) VALUES($1,$2,$3,'pending','app','active')", [memberId, authId, `${authId}@fixture.local`])
    await reconciliationSaveName(isolated, authId, name)
    return { authId, memberId, number: (await isolated.query('SELECT member_number FROM public.members WHERE id=$1', [memberId])).rows[0].member_number }
  }
  async function reconciliationSaveName(isolated, authId, name) {
    await isolated.exec('BEGIN')
    try {
      await isolated.exec('SET LOCAL ROLE authenticated')
      await isolated.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)", [authId])
      await isolated.query('SELECT public.save_my_onboarding_step(1::smallint,$1::jsonb)', [JSON.stringify(namePayload(name))])
      await isolated.exec('COMMIT')
    } catch (error) {
      await isolated.exec('ROLLBACK')
      throw error
    }
  }
  async function rejectedReconciliation(name, mutate, expected = /MEMBER_NUMBER_RECONCILIATION_/) {
    await check(name, async () => {
      const fixture = await loadReconciliationFixture()
      try {
        await mutate(fixture)
        const before = await reconciliationState(fixture.isolated)
        await assert.rejects(fixture.isolated.exec(read(reconciliationMigrationPath)), expected)
        await fixture.isolated.exec('ROLLBACK')
        assert.deepEqual(await reconciliationState(fixture.isolated), before, 'Rejected reconciliation changed member/Auth/business/audit rows, trigger states, sequence or constraints')
      } finally { await fixture.isolated.close() }
    })
  }

  await check('name reconciliation restores three roster numbers, shifts the two legitimate new members, preserves prior swap anchors and all other rows', async () => {
    const { isolated } = await loadReconciliationFixture()
    try {
      const before = await reconciliationState(isolated)
      await isolated.exec(read(reconciliationMigrationPath))
      const after = await reconciliationState(isolated)
      const changedNumbers = new Map(reviewed.map(target => [target.id, target.after]))
      assert.deepEqual(after.tables['public.members'], before.tables['public.members'].map(row => ({ ...row, member_number: changedNumbers.get(row.id) || row.member_number })))
      for (const table of reconciliationTables.filter(table => !['public.members', 'private.member_profile_audit_log'].includes(table))) {
        assert.deepEqual(after.tables[table], before.tables[table], `Reconciliation changed ${table}`)
      }
      assert.deepEqual(after.triggers, before.triggers)
      assert.deepEqual(after.sequence, before.sequence, 'Correction must not advance or rewind the number sequence')
      assert.deepEqual(after.constraints, before.constraints)
      const oldIds = new Set(before.tables['private.member_profile_audit_log'].map(row => row.id))
      assert.deepEqual(after.tables['private.member_profile_audit_log'].filter(row => oldIds.has(row.id)), before.tables['private.member_profile_audit_log'])
      const correctionEvents = after.tables['private.member_profile_audit_log'].filter(row => row.metadata?.member_number_event === 'roster_reconciliation' && row.metadata?.correction_scope === reconciliationScope)
      assert.equal(correctionEvents.length, reviewed.length)
      for (const target of reviewed) {
        const event = correctionEvents.find(row => row.member_id_snapshot === target.id)
        assert.ok(event, `Missing correction for ${target.name}`)
        assert.deepEqual(event.changed_fields, ['member_number'])
        assert.equal(event.before_values.member_number, target.before)
        assert.equal(event.after_values.member_number, target.after)
        assert.equal(event.source, 'migration')
        assert.ok(event.reason)
      }
      const released = (await isolated.query('SELECT * FROM private.member_number_released_manifest() ORDER BY member_number')).rows
      assert.deepEqual(released.map(row => row.member_number), ['ZXS_257', 'ZXS_258', 'ZXS_259', 'ZXS_260', 'ZXS_261'])
      await isolated.exec(read(reconciliationMigrationPath))
      assert.deepEqual(await reconciliationState(isolated), after, 'Repeating reconciliation must be idempotent')
    } finally { await isolated.close() }
  })
  await check('future half-width and full-width whitespace names receive their reserved numbers while preserving the entered name and existing number on edits', async () => {
    const { isolated } = await loadReconciliationFixture({ empty: true })
    try {
      await isolated.exec(read(reconciliationMigrationPath))
      for (const [name, number] of [[' 吴 璠 ', 'ZXS_081'], ['陈　风', 'ZXS_001']]) {
        const registered = await reconciliationRegister(isolated, name)
        assert.equal(registered.number, number)
        assert.equal((await isolated.query('SELECT full_name FROM public.member_identity WHERE member_id=$1', [registered.memberId])).rows[0].full_name, name.trim())
        await reconciliationSaveName(isolated, registered.authId, name.replace(/[ 　]/g, ''))
        assert.equal((await isolated.query('SELECT member_number FROM public.members WHERE id=$1', [registered.memberId])).rows[0].member_number, number)
      }
      const registered = await reconciliationRegister(isolated, 'New numbered fixture')
      await reconciliationSaveName(isolated, registered.authId, '黄　浩淳')
      assert.equal((await isolated.query('SELECT member_number FROM public.members WHERE id=$1', [registered.memberId])).rows[0].member_number, registered.number)
    } finally { await isolated.close() }
  })
  await check('normalized duplicate roster names reject registration instead of silently choosing a reserved number', async () => {
    const { isolated } = await loadReconciliationFixture({ empty: true })
    try {
      await isolated.exec(read(reconciliationMigrationPath))
      await isolated.exec(`CREATE OR REPLACE FUNCTION private.member_number_roster() RETURNS TABLE(full_name text,member_number text)
        LANGUAGE sql IMMUTABLE SET search_path='' AS $$VALUES ('歧义 名','ZXS_081'),('歧义　名','ZXS_082')$$;`)
      await assert.rejects(reconciliationRegister(isolated, '歧 义名'), /MEMBER_NUMBER_.*AMBIGUOUS/)
    } finally { await isolated.close() }
  })
  await check('released numbers allocate once in order 257 through 261 and then continue at 262 without resetting the high-water sequence', async () => {
    const { isolated } = await loadReconciliationFixture()
    try {
      await isolated.exec(read(reconciliationMigrationPath))
      for (let n = 257; n <= 262; n++) {
        const registered = await reconciliationRegister(isolated, `Pool recipient ${n}`)
        assert.equal(registered.number, `ZXS_${n}`)
        assert.equal((await isolated.query('SELECT last_value::int AS last FROM private.member_number_sequence')).rows[0].last, n < 262 ? 261 : 262)
      }
      assert.deepEqual((await isolated.query('SELECT member_number FROM private.member_number_released_manifest() WHERE private.member_number_is_released(member_number)')).rows, [])
    } finally { await isolated.close() }
  })
  await check('replaying a completed repair after 257 is consumed preserves the consumed pool and every audit row', async () => {
    const { isolated } = await loadReconciliationFixture()
    try {
      await isolated.exec(read(reconciliationMigrationPath))
      assert.equal((await reconciliationRegister(isolated, 'Consumed release replay fixture')).number, 'ZXS_257')
      const before = await reconciliationState(isolated)
      const poolBefore = (await isolated.query('SELECT member_number,private.member_number_is_released(member_number) AS available FROM private.member_number_released_manifest() ORDER BY member_number')).rows
      assert.equal(poolBefore.find(row => row.member_number === 'ZXS_257').available, false)
      assert.equal(poolBefore.find(row => row.member_number === 'ZXS_258').available, true)
      await isolated.exec(read(reconciliationMigrationPath))
      assert.deepEqual(await reconciliationState(isolated), before)
      assert.deepEqual((await isolated.query('SELECT member_number,private.member_number_is_released(member_number) AS available FROM private.member_number_released_manifest() ORDER BY member_number')).rows, poolBefore)
    } finally { await isolated.close() }
  })
  await rejectedReconciliation('replaying completed repair rejects a missing release proof and preserves the entire pre-replay state', async ({ isolated }) => {
    await isolated.exec(read(reconciliationMigrationPath))
    await isolated.exec('ALTER TABLE private.member_profile_audit_log DISABLE TRIGGER member_master_reject_audit_mutation')
    const removed = await isolated.query("DELETE FROM private.member_profile_audit_log WHERE metadata->>'member_number_event'='pool_release' AND metadata->>'member_number'='ZXS_258' RETURNING id")
    assert.equal(removed.rows.length, 1)
    await isolated.exec('ALTER TABLE private.member_profile_audit_log ENABLE TRIGGER member_master_reject_audit_mutation')
  }, /MEMBER_NUMBER_RECONCILIATION_INCOMPLETE_RELEASE_EVIDENCE/)
  await rejectedReconciliation('replaying completed repair rejects five correction markers belonging to an unrelated member', async ({ isolated, retired }) => {
    await isolated.exec(read(reconciliationMigrationPath))
    await isolated.exec('ALTER TABLE private.member_profile_audit_log DISABLE TRIGGER member_master_reject_audit_mutation')
    const changed = await isolated.query("UPDATE private.member_profile_audit_log SET member_id=$1,member_id_snapshot=$1 WHERE metadata->>'member_number_event'='roster_reconciliation' AND metadata->>'correction_scope'=$2 RETURNING id", [retired, reconciliationScope])
    assert.equal(changed.rows.length, 5)
    await isolated.exec('ALTER TABLE private.member_profile_audit_log ENABLE TRIGGER member_master_reject_audit_mutation')
  }, /MEMBER_NUMBER_RECONCILIATION_IDENTITY_MISMATCH/)
  await check('issued and closed numbers cannot enter the release pool again, and truly retired 248 stays blocked', async () => {
    const { isolated, retired } = await loadReconciliationFixture()
    try {
      await isolated.exec(read(reconciliationMigrationPath))
      const first = await reconciliationRegister(isolated, 'Pool recipient to close')
      assert.equal(first.number, 'ZXS_257')
      await isolated.query("UPDATE public.members SET account_status='closed' WHERE id=$1", [first.memberId])
      assert.equal((await reconciliationRegister(isolated, 'Next after closed pool member')).number, 'ZXS_258')
      assert.equal((await isolated.query("SELECT private.member_number_is_released('ZXS_257') AS available")).rows[0].available, false)
      assert.equal((await isolated.query("SELECT private.member_number_is_released('ZXS_248') AS available")).rows[0].available, false)
      await isolated.exec('ALTER TABLE public.members DISABLE TRIGGER member_number_before_write')
      await isolated.query('UPDATE public.members SET member_number=NULL WHERE id=$1', [retired])
      await isolated.exec('ALTER TABLE public.members ENABLE TRIGGER member_number_before_write')
      const applicant = await reconciliationRegister(isolated, 'Retired number claimant')
      await assert.rejects(isolated.query("UPDATE public.members SET member_number='ZXS_248' WHERE id=$1", [applicant.memberId]), /MEMBER_NUMBER_RETIRED/)
      await isolated.exec('ALTER TABLE public.members DISABLE TRIGGER member_number_before_write')
      await isolated.query('UPDATE public.members SET member_number=NULL WHERE id=$1', [first.memberId])
      await isolated.exec('ALTER TABLE public.members ENABLE TRIGGER member_number_before_write')
      await assert.rejects(isolated.query("UPDATE public.members SET member_number='ZXS_257' WHERE id=$1", [applicant.memberId]), /MEMBER_NUMBER_RETIRED/)
    } finally { await isolated.close() }
  })
  await check('failed released-number registration rolls back its claim and leaves the next sequence value unchanged', async () => {
    const { isolated } = await loadReconciliationFixture()
    try {
      await isolated.exec(read(reconciliationMigrationPath))
      const originalAuditFunction = extractFunction(migration, 'private.member_number_audit_change')
      await isolated.exec(`CREATE OR REPLACE FUNCTION private.member_number_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.member_number='ZXS_257' THEN RAISE EXCEPTION 'TEST_RELEASED_CLAIM_FAILURE'; END IF; RETURN NULL; END;$$;`)
      const beforeSequence = (await isolated.query('SELECT last_value::text,is_called FROM private.member_number_sequence')).rows
      const beforeAudit = (await isolated.query('SELECT to_jsonb(a) AS row FROM private.member_profile_audit_log a ORDER BY id')).rows
      await assert.rejects(reconciliationRegister(isolated, 'Failed pool recipient'), /TEST_RELEASED_CLAIM_FAILURE/)
      assert.deepEqual((await isolated.query('SELECT last_value::text,is_called FROM private.member_number_sequence')).rows, beforeSequence)
      // The unnumbered account insertion is a separate successful operation;
      // its lifecycle audit survives, while the failed allocation does not.
      const auditAfter = (await isolated.query('SELECT to_jsonb(a) AS row FROM private.member_profile_audit_log a ORDER BY id')).rows
      assert.deepEqual(auditAfter.slice(0, beforeAudit.length), beforeAudit)
      assert.equal(auditAfter.some(row => row.row.metadata?.member_number_event === 'allocated' && row.row.metadata?.member_number === 'ZXS_257' && row.row.source !== 'migration'), false)
      await isolated.exec(originalAuditFunction)
      assert.equal((await reconciliationRegister(isolated, 'Successful pool recipient')).number, 'ZXS_257')
    } finally { await isolated.close() }
  })
  await check('new private release and reconciliation helpers remain unavailable to all API roles', async () => {
    const { isolated } = await loadReconciliationFixture({ empty: true })
    try {
      await isolated.exec(read(reconciliationMigrationPath))
      const helpers = (await isolated.query(`SELECT p.oid::regprocedure::text AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='private' AND p.proname LIKE 'member_number_%' ORDER BY p.proname`)).rows
      for (const role of ['anon', 'authenticated', 'service_role']) {
        for (const helper of helpers) {
          const permission = (await isolated.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed', [role, helper.signature])).rows[0].allowed
          assert.equal(permission, false, `${role} may execute ${helper.signature}`)
        }
      }
    } finally { await isolated.close() }
  })

  await rejectedReconciliation('reconciliation rejects a changed target name', async ({ isolated }) => {
    await isolated.query("UPDATE public.member_identity SET full_name='黄浩淳' WHERE member_id=$1", [reviewed[0].id])
  })
  await rejectedReconciliation('reconciliation rejects a closed target', async ({ isolated }) => {
    await isolated.query("UPDATE public.members SET account_status='closed' WHERE id=$1", [reviewed[0].id])
  })
  await rejectedReconciliation('reconciliation rejects abnormal approved lifecycle fields', async ({ isolated }) => {
    await isolated.exec('ALTER TABLE public.members DISABLE TRIGGER member_master_sync_lifecycle')
    await isolated.query("UPDATE public.members SET profile_stage='in_progress',onboarding_step=1,submitted_at=NULL WHERE id=$1", [reviewed[0].id])
    await isolated.exec('ALTER TABLE public.members ENABLE TRIGGER member_master_sync_lifecycle')
  })
  await rejectedReconciliation('reconciliation rejects changed original allocation evidence', async ({ isolated }) => {
    await isolated.exec('ALTER TABLE private.member_profile_audit_log DISABLE TRIGGER member_master_reject_audit_mutation')
    await isolated.query("UPDATE private.member_profile_audit_log SET metadata=metadata||'{\"member_number_origin\":\"manual\"}'::jsonb WHERE id=$1", [reviewed[0].allocation])
    await isolated.exec('ALTER TABLE private.member_profile_audit_log ENABLE TRIGGER member_master_reject_audit_mutation')
  })
  await rejectedReconciliation('reconciliation rejects missing short-name correction evidence for 叶一达', async ({ isolated }) => {
    await isolated.exec('ALTER TABLE private.member_profile_audit_log DISABLE TRIGGER member_master_reject_audit_mutation')
    await isolated.query('DELETE FROM private.member_profile_audit_log WHERE id=2051')
    await isolated.exec('ALTER TABLE private.member_profile_audit_log ENABLE TRIGGER member_master_reject_audit_mutation')
  })
  await rejectedReconciliation('reconciliation rejects another account claiming a target number through a normalized alias', async ({ isolated, third }) => {
    await isolated.query("INSERT INTO public.members(id,status,record_source,account_status,member_number) VALUES($1,'pending','import','unbound','zxs_0125')", [third])
  })
  await rejectedReconciliation('reconciliation rejects unrelated prior ownership of a restored roster number', async ({ isolated, third }) => {
    await isolated.query("INSERT INTO public.members(id,status,record_source,account_status) VALUES($1,'pending','import','unbound')", [third])
    await isolated.query(`INSERT INTO private.member_profile_audit_log(member_id,member_id_snapshot,action_type,section,changed_fields,before_values,after_values,source,metadata)
      VALUES($1,$1,'member_lifecycle_update','account',ARRAY['member_number'],'{}'::jsonb,'{"member_number":"ZXS_125"}'::jsonb,'system','{"member_number_event":"allocated","member_number":"ZXS_125"}'::jsonb)`, [third])
  })
  await rejectedReconciliation('reconciliation rejects unreviewed historical ownership of released 257', async ({ isolated, third }) => {
    await isolated.query("INSERT INTO public.members(id,status,record_source,account_status) VALUES($1,'pending','import','unbound')", [third])
    await isolated.query(`INSERT INTO private.member_profile_audit_log(member_id,member_id_snapshot,action_type,section,changed_fields,before_values,after_values,source,metadata)
      VALUES($1,$1,'member_lifecycle_update','account',ARRAY['member_number'],'{}'::jsonb,'{"member_number":"ZXS_257"}'::jsonb,'system','{"member_number_event":"retired","member_number":"ZXS_257"}'::jsonb)`, [third])
  })
  await rejectedReconciliation('reconciliation rejects a genuine new registration after the reviewed preflight without leaving any changes', async ({ isolated }) => {
    const registered = await reconciliationRegister(isolated, 'AfterPreflightNew')
    assert.equal(registered.number, 'ZXS_262', 'Fixture must represent a newly allocated account beyond the reviewed high-water mark')
  }, /MEMBER_NUMBER_RECONCILIATION_NEW_REGISTRATION_AFTER_PREFLIGHT/)
  await rejectedReconciliation('reconciliation rejects a member publication that could expose transient number updates', async ({ isolated }) => {
    await isolated.exec('CREATE PUBLICATION reconciliation_fixture_realtime FOR TABLE public.members')
  })
  await rejectedReconciliation('reconciliation rejects an unknown member trigger', async ({ isolated }) => {
    await isolated.exec(`CREATE FUNCTION private.reconciliation_unknown_trigger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END;$$;
      CREATE TRIGGER zz_reconciliation_unknown_trigger AFTER UPDATE ON public.members FOR EACH ROW EXECUTE FUNCTION private.reconciliation_unknown_trigger();`)
  })
  await rejectedReconciliation('reconciliation rejects a replaced function under a known trigger name', async ({ isolated }) => {
    await isolated.exec(`CREATE FUNCTION private.reconciliation_unknown_function() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END;$$;
      DROP TRIGGER member_number_before_write ON public.members;
      CREATE TRIGGER member_number_before_write BEFORE UPDATE OF member_number ON public.members FOR EACH ROW EXECUTE FUNCTION private.reconciliation_unknown_function();`)
  })
  for (const [table, trigger] of [['public.members', 'member_number_before_write'], ['public.members', 'members_updated_at'], ['private.member_profile_audit_log', 'member_master_prepare_audit_event'], ['private.member_profile_audit_log', 'member_master_reject_audit_mutation']]) {
    await rejectedReconciliation(`reconciliation rejects disabled protection ${trigger}`, async ({ isolated }) => {
      await isolated.exec(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`)
    })
  }
  for (const [table, column, value] of [['public.community_notifications', 'title', 'Unexpected notification mutation'], ['public.match_round_submissions', 'message', 'Unexpected registration mutation']]) {
    await rejectedReconciliation(`reconciliation rolls back hidden ${table} side effects`, async ({ isolated }) => {
      await isolated.exec(`CREATE OR REPLACE FUNCTION private.member_number_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN UPDATE ${table} SET ${column}='${value}' WHERE member_id=NEW.id; RETURN NULL; END;$$;`)
    })
  }
  await rejectedReconciliation('reconciliation rolls back changed original audit events during writes', async ({ isolated }) => {
    await isolated.exec(`CREATE OR REPLACE FUNCTION private.member_number_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        ALTER TABLE private.member_profile_audit_log DISABLE TRIGGER member_master_reject_audit_mutation;
        UPDATE private.member_profile_audit_log SET reason='Unexpected original evidence mutation' WHERE id=2416;
        ALTER TABLE private.member_profile_audit_log ENABLE TRIGGER member_master_reject_audit_mutation;
        RETURN NULL;
      END;$$;`)
  })
  await rejectedReconciliation('reconciliation failure after validators are disabled restores all guards and data', async ({ isolated }) => {
    await isolated.exec(`CREATE OR REPLACE FUNCTION private.member_number_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.id='${reviewed[0].id}'::uuid AND NEW.member_number IS NULL THEN
          IF (SELECT tgenabled FROM pg_trigger WHERE tgname='member_number_before_write') IS DISTINCT FROM 'D'::"char" THEN
            RAISE EXCEPTION 'TEST_RECONCILIATION_FAILURE_DID_NOT_REACH_DISABLED_GUARD';
          END IF;
          RAISE EXCEPTION 'TEST_RECONCILIATION_AFTER_FAILURE';
        END IF;
        RETURN NULL;
      END;$$;`)
  }, /TEST_RECONCILIATION_AFTER_FAILURE/)
}

await db.close()
console.log(`PASS ${passed} member-number database checks`)
