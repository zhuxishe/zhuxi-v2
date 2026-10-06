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
const root = process.env.BIRTH_DATE_TEST_ROOT || fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(root + '/' + path, 'utf8')
const migrationPath = 'supabase/migrations/' + readdirSync(root + '/supabase/migrations').find(name => name.endsWith('_preinterview_birth_date.sql'))
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
  CREATE TABLE public.match_round_submissions(member_id uuid, game_type_pref text, gender_pref text, availability jsonb, interest_tags text[], social_style text, message text, import_metadata jsonb, custom_answers jsonb);
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
await bootstrap(extractFunction(read('supabase/migrations/20260830162310_admin_create_missing_member_identity.sql'), 'public.admin_update_member_section'))
await bootstrap(extractFunction(read('supabase/migrations/20260902073905_archive_historical_member_records.sql'), 'private.member_master_audit_member_change'))
await bootstrap(extractFunction(read('supabase/migrations/20260902073905_archive_historical_member_records.sql'), 'private.member_master_sync_lifecycle'))
await bootstrap(extractFunction(read('supabase/migrations/20260907194820_player_profile_consistency.sql'), 'private.player_profile_require_submission_before_approval'))
await bootstrap(extractFunction(read('supabase/migrations/20260830163614_fix_member_restore_and_quiz_answers.sql'), 'public.admin_restore_member_event'))
// Keep the later privacy extension in the baseline to ensure the DOB patch preserves it.
const matchingContent = read('supabase/migrations/20260929120921_matching_content_editor.sql')
const privacyPatchStart = matchingContent.indexOf('DO $migration$', matchingContent.indexOf('-- Extend the existing privacy workflow'))
await bootstrap(matchingContent.slice(privacyPatchStart, matchingContent.indexOf('$migration$;', privacyPatchStart) + '$migration$;'.length))

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

// Model current Production SELECT grants together with its real read policies.
// The anon grant is deliberately retained: RLS must still return no identity rows.
await bootstrap(`
  GRANT SELECT ON public.member_identity TO anon;
  DROP POLICY admin_read_identity ON public.member_identity;
  DROP POLICY admin_read_members ON public.members;
  GRANT EXECUTE ON FUNCTION private.member_master_is_super_admin() TO authenticated;
`)
for (const name of ['member_master_members_admin_or_active_self_read', 'member_master_identity_admin_or_active_self_read']) {
  const start = master.indexOf('CREATE POLICY ' + name)
  await bootstrap(master.slice(start, master.indexOf(';', start) + 1))
}

const uuid = (kind, n) => `${kind}0000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const user = n => uuid(1, n)
const member = n => uuid(2, n)
const admin = uuid(3, 1)
await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [user(900), 'admin@fixture.local'])
await db.query("INSERT INTO public.admin_users(id,user_id,email,name,role) VALUES($1,$2,'admin@fixture.local','Fixture super admin','super_admin')", [admin, user(900)])
async function fixture(n, options = {}) {
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [user(n), `member-${n}@fixture.local`])
  await db.query(`INSERT INTO public.members(id,user_id,email,status,profile_stage,onboarding_step)
    VALUES($1,$2,$3,$4,$5,$6)`, [member(n), user(n), `member-${n}@fixture.local`, options.status || 'pending', options.stage || 'not_started', options.step || 0])
  if (options.name) await db.query("INSERT INTO public.member_identity(member_id,full_name,gender,age_range,nationality,current_city) VALUES($1,$2,'other','23-25','中国','东京')", [member(n), options.name])
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
const save = (n, step, payload) => asUser(n, () => db.query('SELECT public.save_my_onboarding_step($1::smallint,$2::jsonb)', [step, JSON.stringify(payload)]))
const basic = (override = {}) => ({ full_name: 'Birthday fixture', gender: 'other', birth_date: '2000-02-29', nationality: '中国', current_city: '东京', ...override })
const adminEdit = (n, payload) => asUser(900, () => db.query("SELECT public.admin_update_member_section($1,'identity',$2::jsonb,'生日兼容验证',NULL) AS result", [member(n), JSON.stringify(payload)]))
const identityOf = async n => (await db.query('SELECT birth_date::text, age_range, legacy_age_range, school_name, degree_level, full_name FROM public.member_identity WHERE member_id=$1', [member(n)])).rows[0]
const submit = n => asUser(n, () => db.query('SELECT public.submit_my_onboarding()'))
let passed = 0
async function check(name, run) { await run(); passed++; console.log('PASS ' + name) }
const reject = (operation, message) => assert.rejects(operation, error => error.message.includes(message))
await fixture(1, { name: 'Legacy incomplete', stage: 'in_progress', step: 4 })
await fixture(2, { name: 'Legacy approved', status: 'approved', stage: 'complete', step: 4 })
await fixture(3, { name: 'Legacy submitted', stage: 'submitted', step: 4 })
for (let n = 4; n <= 12; n++) await fixture(n)
const originalRows = (await db.query('SELECT to_jsonb(i) AS identity FROM public.member_identity i ORDER BY member_id')).rows
await db.exec(migration)
await db.exec(read('supabase/audits/preinterview-birth-date-postflight.sql'))
console.log('PASS read-only postflight')
await check('additive migration preserves every existing identity field and updated_at', async () => {
  const actual = (await db.query("SELECT to_jsonb(i) - ARRAY['birth_date','legacy_age_range'] AS identity FROM public.member_identity i ORDER BY member_id")).rows
  assert.deepEqual(actual, originalRows)
  assert.deepEqual((await identityOf(1)), { birth_date: null, age_range: '23-25', legacy_age_range: null, school_name: null, degree_level: null, full_name: 'Legacy incomplete' })
})
await check('RLS blocks anon reads despite SELECT grant and isolates authenticated identities', async () => {
  const anonRows = await asUser(null, () => db.query('SELECT member_id FROM public.member_identity'), 'anon')
  assert.deepEqual(anonRows.rows, [])
  const ownRows = await asUser(1, () => db.query('SELECT member_id FROM public.member_identity ORDER BY member_id'))
  assert.deepEqual(ownRows.rows, [{ member_id: member(1) }])
  const unauthenticatedRows = await asUser(null, () => db.query('SELECT member_id FROM public.member_identity'))
  assert.deepEqual(unauthenticatedRows.rows, [])
  await db.query("UPDATE public.members SET account_status='suspended' WHERE id=$1", [member(1)])
  const suspendedRows = await asUser(1, () => db.query('SELECT member_id FROM public.member_identity'))
  assert.deepEqual(suspendedRows.rows, [])
  await db.query("UPDATE public.members SET account_status='active' WHERE id=$1", [member(1)])
  const adminRows = await asUser(900, () => db.query('SELECT member_id FROM public.member_identity'))
  assert.equal(adminRows.rows.length, 3)
})
await check('age boundaries are exact and leap birthday changes on March 1', async () => {
  for (const [birthday, today, expected] of [
    ['2008-10-08', '2026-10-07', '18以下'], ['2008-10-07', '2026-10-07', '18-20'],
    ['2005-10-08', '2026-10-07', '18-20'], ['2005-10-07', '2026-10-07', '21-23'],
    ['2002-10-07', '2026-10-07', '24-26'], ['1999-10-07', '2026-10-07', '27-29'],
    ['1996-10-07', '2026-10-07', '30+'], ['2008-02-29', '2026-02-28', '18以下'],
    ['2008-02-29', '2026-03-01', '18-20'],
  ]) {
    const { rows } = await db.query('SELECT private.member_age_range_for_birth_date($1::date,$2::date) AS band', [birthday, today])
    assert.equal(rows[0].band, expected, `${birthday} at ${today}`)
  }
})
await check('step 1 requires a birthday and rejects old age-only payload safely', async () => {
  const payload = basic({ age_range: '21-23' }); delete payload.birth_date
  await reject(() => save(4, 1, payload), 'MEMBER_MASTER_REQUIRED_FIELDS_MISSING')
  assert.equal(await identityOf(4), undefined)
})
await check('birthdays reject null, malformed, impossible, numeric, old and future values', async () => {
  for (const birth_date of [null, '', '2000-2-29', '2001-02-29', '2000-13-01', '2000-01-32', 20000101, '1899-12-31', '9999-01-01', '2000-01-01T00:00:00Z']) {
    await reject(() => save(4, 1, basic({ birth_date })), birth_date === null ? 'MEMBER_MASTER_REQUIRED_FIELDS_MISSING' : 'MEMBER_MASTER_BIRTH_DATE_INVALID')
  }
  assert.equal(await identityOf(4), undefined)
})
await check('new birthday insert derives age and never invents historical age data', async () => {
  await save(4, 1, basic({ age_range: 'tampered band' }))
  const identity = await identityOf(4)
  const { rows } = await db.query("SELECT private.member_age_range_for_birth_date('2000-02-29', (now() AT TIME ZONE 'Asia/Tokyo')::date) AS band")
  assert.equal(identity.birth_date, '2000-02-29')
  assert.equal(identity.age_range, rows[0].band)
  assert.equal(identity.legacy_age_range, null)
})
await check('legacy age range is captured only on first birthday and retained on correction', async () => {
  await save(1, 1, basic())
  assert.equal((await identityOf(1)).legacy_age_range, '23-25')
  await save(1, 1, basic({ birth_date: '1990-01-01' }))
  const identity = await identityOf(1)
  assert.equal(identity.age_range, '30+')
  assert.equal(identity.legacy_age_range, '23-25')
})
await check('old admin clients cannot overwrite the birthday-derived age band', async () => {
  await adminEdit(1, { age_range: '18-20', full_name: 'Old admin edit' })
  assert.equal((await identityOf(1)).age_range, '30+')
  assert.equal((await identityOf(1)).legacy_age_range, '23-25')
})
await check('legacy approved profiles remain editable without birthday or school', async () => {
  await adminEdit(2, { full_name: 'Legacy renamed', age_range: '27-29' })
  assert.deepEqual(await identityOf(2), { birth_date: null, age_range: '27-29', legacy_age_range: null, school_name: null, degree_level: null, full_name: 'Legacy renamed' })
})
await check('existing submitted requests remain idempotent despite missing new fields', async () => {
  await submit(3)
  assert.equal((await identityOf(3)).birth_date, null)
})
await check('incomplete legacy draft cannot submit before adding birthday and education', async () => {
  await reject(() => submit(1), 'MEMBER_MASTER_REQUIRED_FIELDS_MISSING')
})
await check('school and supported degree are both required at step 2', async () => {
  for (const payload of [{}, { school_name: '学校' }, { degree_level: '修士' }, { school_name: '  ', degree_level: '修士' }, { school_name: '学校', degree_level: '' }, { school_name: '学校', degree_level: 'invalid' }]) {
    await reject(() => save(4, 2, payload), 'MEMBER_MASTER_REQUIRED_FIELDS_MISSING')
  }
  await save(4, 2, { school_name: '  早稻田大学  ', degree_level: '研究生/预科' })
  assert.equal((await identityOf(4)).school_name, '早稻田大学')
  assert.equal((await identityOf(4)).degree_level, '研究生/预科')
})
await check('complete four-step onboarding submits and audits birthday as calendar date', async () => {
  await save(4, 3, { hobby_tags: ['旅行'], activity_type_tags: ['剧本杀'] })
  await save(4, 4, { personality_self_tags: ['慢热'], taboo_tags: [] })
  await submit(4)
  const { rows } = await db.query("SELECT status,profile_stage,onboarding_step FROM public.members WHERE id=$1", [member(4)])
  assert.deepEqual(rows[0], { status: 'pending', profile_stage: 'submitted', onboarding_step: 4 })
  const audit = await db.query("SELECT after_values->>'birth_date' AS birthday FROM private.member_profile_audit_log WHERE member_id=$1 AND section='onboarding_step_1'", [member(4)])
  assert.equal(audit.rows[0].birthday, '2000-02-29')
})
await check('new server submission checks block bypassing education validation', async () => {
  await db.query("UPDATE public.members SET profile_stage='in_progress' WHERE id=$1", [member(4)])
  await db.query('UPDATE public.member_identity SET school_name=NULL WHERE member_id=$1', [member(4)])
  await reject(() => submit(4), 'MEMBER_MASTER_REQUIRED_FIELDS_MISSING')
})
await check('final submission independently requires birthday on a legacy completed draft', async () => {
  await db.query(`INSERT INTO public.member_identity(member_id,full_name,gender,age_range,nationality,current_city,school_name,degree_level,hobby_tags,activity_type_tags,personality_self_tags)
    VALUES($1,'Draft missing DOB','other','21-23','中国','东京','学校','修士',ARRAY['音乐'],ARRAY['剧本杀'],ARRAY['慢热'])`, [member(8)])
  await db.query("UPDATE public.members SET onboarding_step=4,profile_stage='in_progress' WHERE id=$1", [member(8)])
  await reject(() => submit(8), 'MEMBER_MASTER_REQUIRED_FIELDS_MISSING')
})
await check('existing account-status, completed-profile, and step-order protections remain', async () => {
  await db.query("UPDATE public.members SET account_status='closed' WHERE id=$1", [member(9)])
  await reject(() => save(9, 1, basic()), 'MEMBER_MASTER_ACCOUNT_BLOCKED')
  await reject(() => save(2, 1, basic()), 'MEMBER_MASTER_ONBOARDING_LOCKED')
  await reject(() => save(10, 2, { school_name: '学校', degree_level: '修士' }), 'MEMBER_MASTER_STEP_OUT_OF_ORDER')
})
await check('admin can create a first identity using birthday without legacy age field', async () => {
  await adminEdit(5, basic())
  const identity = await identityOf(5)
  assert.equal(identity.birth_date, '2000-02-29')
  // The compatibility insert receives a computed band, not a historical answer.
  assert.equal(identity.legacy_age_range, null)
})
await check('admin validates calendar format and rejects direct historical snapshot writes', async () => {
  await reject(() => adminEdit(2, { birth_date: '2001-02-29' }), 'MEMBER_MASTER_BIRTH_DATE_INVALID')
  await reject(() => adminEdit(2, { legacy_age_range: 'forged' }), 'MEMBER_MASTER_PAYLOAD_INVALID')
})
await check('new audit snapshots restore birthday and retain original historical age', async () => {
  const result = await adminEdit(1, { birth_date: '2002-01-01' })
  const event = result.rows[0].result.event_id
  await asUser(900, () => db.query("SELECT public.admin_restore_member_event($1,'生日恢复验证')", [event]))
  const identity = await identityOf(1)
  assert.equal(identity.birth_date, '1990-01-01')
  assert.equal(identity.age_range, '30+')
  assert.equal(identity.legacy_age_range, '23-25')
})
await check('old audit snapshots without birthday keys restore unrelated fields safely', async () => {
  const result = await adminEdit(2, { full_name: 'Change after upgrade' })
  const event = result.rows[0].result.event_id
  // Pre-migration snapshots lack both new keys; emulate stored historical audit content.
  await db.exec('ALTER TABLE private.member_profile_audit_log DISABLE TRIGGER member_master_reject_audit_mutation')
  await db.query("UPDATE private.member_profile_audit_log SET before_values=before_values-ARRAY['birth_date','legacy_age_range'] WHERE id=$1", [event])
  await db.exec('ALTER TABLE private.member_profile_audit_log ENABLE TRIGGER member_master_reject_audit_mutation')
  await adminEdit(2, { birth_date: '2002-01-01' })
  await asUser(900, () => db.query("SELECT public.admin_restore_member_event($1,'历史恢复验证')", [event]))
  assert.equal((await identityOf(2)).full_name, 'Legacy renamed')
  assert.equal((await identityOf(2)).birth_date, '2002-01-01')
  assert.equal((await identityOf(2)).legacy_age_range, '27-29')
})
await check('anonymization clears exact birthday and historical age without restoring either', async () => {
  await asUser(900, () => db.query("SELECT public.admin_anonymize_member($1,'生日匿名化验证')", [member(1)]))
  const identity = await identityOf(1)
  assert.equal(identity.birth_date, null)
  assert.equal(identity.legacy_age_range, null)
  assert.equal(identity.age_range, 'anonymized')
})
await check('anonymous, unauthenticated, and player-as-admin access stays denied', async () => {
  await reject(() => asUser(null, () => db.query('SELECT public.save_my_onboarding_step(1::smallint,$1::jsonb)', [JSON.stringify(basic())]), 'anon'), 'permission denied')
  await reject(() => asUser(null, () => db.query('SELECT public.save_my_onboarding_step(1::smallint,$1::jsonb)', [JSON.stringify(basic())])), 'MEMBER_MASTER_AUTH_REQUIRED')
  await reject(() => asUser(4, () => db.query("SELECT public.admin_update_member_section($1,'identity','{}','未授权验证',NULL)", [member(2)])), 'MEMBER_MASTER_ADMIN_REQUIRED')
  await reject(() => save(6, 1, basic({ member_id: member(2) })), 'MEMBER_MASTER_PAYLOAD_INVALID')
})
await check('private helpers are not executable and public onboarding ACLs stay narrow', async () => {
  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const signature of ['private.member_birth_date_from_payload(jsonb)', 'private.member_age_range_for_birth_date(date,date)', 'private.member_identity_sync_birth_date()']) {
      const { rows } = await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed', [role, signature])
      assert.equal(rows[0].allowed, false, `${role}: ${signature}`)
    }
  }
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const { rows } = await db.query("SELECT has_function_privilege($1,'public.save_my_onboarding_step(smallint,jsonb)','EXECUTE') AS allowed", [role])
    assert.equal(rows[0].allowed, role === 'authenticated')
  }
})
await check('JST range validation stays independent of database session timezone', async () => {
  const { rows } = await db.query("SELECT (now() AT TIME ZONE 'Asia/Tokyo')::date::text AS today, ((now() AT TIME ZONE 'Asia/Tokyo')::date + 1)::text AS tomorrow")
  await db.exec("SET TIME ZONE 'America/Los_Angeles'")
  await save(6, 1, basic({ birth_date: rows[0].today }))
  assert.equal((await identityOf(6)).birth_date, rows[0].today)
  await reject(() => save(7, 1, basic({ birth_date: rows[0].tomorrow })), 'MEMBER_MASTER_BIRTH_DATE_INVALID')
})
console.log(`PASS ${passed} preinterview birthday database checks`)
await db.close()
