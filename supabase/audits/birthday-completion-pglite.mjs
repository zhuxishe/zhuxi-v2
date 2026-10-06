// Isolated PostgreSQL checks using real migration functions, triggers and constraints.
// No live database calls. Run with PGLITE_MODULE pointing to @electric-sql/pglite.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const root = process.env.BIRTH_DATE_TEST_ROOT || fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(root + '/' + path, 'utf8')
const migration = suffix => read('supabase/migrations/' + readdirSync(root + '/supabase/migrations').find(name => name.endsWith(suffix)))
const master = migration('_user_member_master_v1.sql')
const birthday = migration('_preinterview_birth_date.sql')
const profile = migration('_player_profile_v1.sql')
const community = migration('_community_v1_schema.sql')
function realFunction(source, name) {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`)
  assert.ok(start >= 0, name)
  const definition = source.slice(start)
  const delimiter = /AS (\$[a-z_]*\$)/i.exec(definition)
  const end = definition.indexOf(delimiter[1] + ';', delimiter.index + delimiter[0].length)
  return definition.slice(0, end + delimiter[1].length + 1)
}
function realTable(source, name) {
  const match = new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?${name.replaceAll('.', '\\.')} \\(`, 'i').exec(source)
  assert.ok(match, name)
  return source.slice(match.index, source.indexOf('\n);', match.index) + 3)
}
const db = new PGlite()
await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth; CREATE SCHEMA private;
  CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('role',current_setting('request.jwt.claim.role',true),'is_anonymous',current_setting('request.jwt.claim.is_anonymous',true))$$;
  GRANT USAGE ON SCHEMA public, auth, private TO anon, authenticated, service_role;
`)
for (const name of ['001_core_members.sql', '002_admin_interview.sql', '003_supplementary.sql']) await db.exec(read('supabase/migrations/' + name))
await db.exec(`
  ALTER TABLE public.members ADD COLUMN account_status text NOT NULL DEFAULT 'active',
    ADD COLUMN record_scope text NOT NULL DEFAULT 'current',
    ADD COLUMN membership_type text NOT NULL DEFAULT 'player',
    ADD COLUMN anonymized_at timestamptz,
    ADD COLUMN profile_stage text NOT NULL DEFAULT 'complete',
    ADD COLUMN onboarding_step smallint NOT NULL DEFAULT 4;
  ALTER TABLE public.member_identity ADD COLUMN birth_date date, ADD COLUMN legacy_age_range text;
  CREATE TABLE public.community_profiles(id uuid PRIMARY KEY);
  CREATE TABLE public.community_posts(id uuid PRIMARY KEY);
  CREATE TABLE public.community_comments(id uuid PRIMARY KEY);
  CREATE TABLE public.community_reports(id uuid PRIMARY KEY);
  CREATE TABLE public.community_announcements(id uuid PRIMARY KEY);
`)
await db.exec(realTable(community, 'public.community_notifications'))
await db.exec(realTable(profile, 'private.member_profile_audit_log'))
await db.exec(master.slice(master.indexOf('ALTER TABLE private.member_profile_audit_log\n'), master.indexOf('CREATE INDEX IF NOT EXISTS member_profile_audit_snapshot_created_idx')))
for (const name of ['private.member_master_changed_fields', 'private.member_master_prepare_audit_event', 'private.member_master_reject_audit_mutation']) await db.exec(realFunction(master, name))
for (const name of ['private.member_birth_date_from_payload', 'private.member_age_range_for_birth_date', 'private.member_identity_sync_birth_date']) await db.exec(realFunction(birthday, name))
await db.exec(`
  CREATE TRIGGER member_identity_sync_birth_date BEFORE INSERT OR UPDATE OF birth_date,age_range ON public.member_identity
    FOR EACH ROW EXECUTE FUNCTION private.member_identity_sync_birth_date();
  CREATE TRIGGER member_profile_audit_prepare BEFORE INSERT ON private.member_profile_audit_log
    FOR EACH ROW EXECUTE FUNCTION private.member_master_prepare_audit_event();
  CREATE TRIGGER member_profile_audit_append_only BEFORE UPDATE OR DELETE ON private.member_profile_audit_log
    FOR EACH ROW EXECUTE FUNCTION private.member_master_reject_audit_mutation();
`)
const user = n => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const member = n => `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`
async function fixture(n, options = {}) {
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [user(n), `fixture-${n}@local.invalid`])
  await db.query(`INSERT INTO public.members(id,user_id,status,account_status,record_scope,membership_type,anonymized_at)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [member(n), options.unbound ? null : user(n), options.status || 'approved', options.account || 'active', options.scope || 'current', options.type || 'player', options.anonymized ? '2026-01-01' : null])
  if (!options.missingIdentity) await db.query(`INSERT INTO public.member_identity(member_id,full_name,gender,age_range,nationality,current_city,birth_date)
    VALUES($1,'Fixture player','other','20-24','中国','东京',$2)`, [member(n), options.birthDate || null])
}
async function asUser(n, operation, role = 'authenticated', anonymous = false) {
  await db.exec('BEGIN')
  try {
    await db.exec('SET LOCAL ROLE ' + role)
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true),set_config('request.jwt.claim.is_anonymous',$3,true)", [n ? user(n) : '', role, String(anonymous)])
    const result = await operation()
    await db.exec('COMMIT')
    return result
  } catch (error) { await db.exec('ROLLBACK'); throw error }
}
const get = n => asUser(n, async () => (await db.query('SELECT public.get_my_birthday_completion() AS state')).rows[0].state)
const complete = (n, value) => asUser(n, async () => (await db.query('SELECT public.complete_my_birth_date($1) AS state', [value])).rows[0].state)
const identity = async n => (await db.query('SELECT to_jsonb(identity) AS value FROM public.member_identity identity WHERE member_id=$1', [member(n)])).rows[0]?.value
const notices = async n => (await db.query("SELECT read_at FROM public.community_notifications WHERE recipient_member_id=$1 AND notification_type='birthday_completion'", [member(n)])).rows
const reject = (operation, message) => assert.rejects(operation, error => error.message.includes(message))
const audits = async n => (await db.query('SELECT * FROM private.member_profile_audit_log WHERE member_id=$1', [member(n)])).rows
const dispatch = () => db.exec(read('supabase/audits/birthday-completion-dispatch.sql'))
let passed = 0
async function check(name, run) { await run(); passed++; console.log('PASS ' + name) }
for (const n of [1, 2, 11, 12, 13, 14, 15, 16]) await fixture(n)
await fixture(3, { birthDate: '1990-01-01' })
await fixture(4, { status: 'pending' })
await fixture(5, { account: 'suspended' })
await fixture(6, { scope: 'historical' })
await fixture(7, { type: 'observer' })
await fixture(8, { unbound: true })
await fixture(9, { anonymized: true })
await fixture(10, { missingIdentity: true })
const baseline = (await db.query('SELECT to_jsonb(identity) AS value FROM public.member_identity identity ORDER BY member_id')).rows
await db.exec(migration('_birthday_completion_campaign.sql'))
await check('migration preserves all existing identities and creates no recipients or notices', async () => {
  assert.deepEqual((await db.query('SELECT to_jsonb(identity) AS value FROM public.member_identity identity ORDER BY member_id')).rows, baseline)
  assert.equal((await db.query('SELECT count(*)::int AS count FROM private.birthday_completion_campaign')).rows[0].count, 0)
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.community_notifications')).rows[0].count, 0)
  assert.equal((await get(1)).eligible, false)
  await db.exec(read('supabase/audits/birthday-completion-postflight.sql'))
})
await check('failed first dispatch rolls back its permanent marker and recipient snapshot', async () => {
  await db.exec(`CREATE FUNCTION private.test_fail_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'TEST_DISPATCH_FAILURE'; END$$;
    CREATE TRIGGER test_fail_dispatch BEFORE INSERT ON public.community_notifications FOR EACH ROW EXECUTE FUNCTION private.test_fail_dispatch();`)
  await reject(dispatch, 'TEST_DISPATCH_FAILURE')
  await db.exec('ROLLBACK')
  for (const table of ['private.birthday_completion_campaign', 'private.birthday_completion_recipients', 'public.community_notifications']) {
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count, 0)
  }
  await db.exec('DROP TRIGGER test_fail_dispatch ON public.community_notifications; DROP FUNCTION private.test_fail_dispatch();')
})
await check('first dispatch selects only existing eligible players and creates one notice each', async () => {
  await dispatch()
  assert.deepEqual((await db.query('SELECT member_id FROM private.birthday_completion_recipients ORDER BY member_id')).rows.map(row => row.member_id), [1, 2, 11, 12, 13, 14, 15, 16].map(member))
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.community_notifications')).rows[0].count, 8)
  assert.deepEqual(await get(1), { eligible: true, birth_date: null, age_range: '20-24' })
})
await check('dispatch retries neither resend nor add future registrations', async () => {
  await fixture(99)
  const before = (await db.query('SELECT to_jsonb(notification) AS value FROM public.community_notifications notification ORDER BY recipient_member_id')).rows
  await dispatch()
  assert.deepEqual((await db.query('SELECT to_jsonb(notification) AS value FROM public.community_notifications notification ORDER BY recipient_member_id')).rows, before)
  assert.deepEqual(await get(99), { eligible: false, birth_date: null, age_range: null })
  await reject(() => complete(99, '2000-01-01'), 'BIRTH_DATE_NOT_ELIGIBLE')
})
await check('invalid or empty dates cannot change identity, notifications or audit', async () => {
  const before = await identity(1)
  for (const value of [null, '', '2000-2-02', '2000-02-30', '1899-12-31', '2999-01-01', 'not-a-date']) {
    await reject(() => complete(1, value), 'BIRTH_DATE_INVALID')
  }
  assert.deepEqual(await identity(1), before)
  assert.equal((await notices(1))[0].read_at, null)
  assert.equal((await audits(1)).length, 0)
})
await check('completion atomically stores birthday, derives band, retains old band and marks notice read', async () => {
  const memberBefore = (await db.query('SELECT to_jsonb(member) AS value FROM public.members member WHERE id=$1', [member(1)])).rows[0].value
  const state = await complete(1, '2000-01-01')
  const after = await identity(1)
  const expected = (await db.query("SELECT private.member_age_range_for_birth_date('2000-01-01',(now() AT TIME ZONE 'Asia/Tokyo')::date) AS band")).rows[0].band
  assert.deepEqual(state, { eligible: true, birth_date: '2000-01-01', age_range: expected })
  assert.equal(after.age_range, expected)
  assert.equal(after.legacy_age_range, '20-24')
  assert.equal(after.school_name, null)
  assert.equal(after.degree_level, null)
  assert.ok((await notices(1))[0].read_at)
  const audit = await audits(1)
  assert.equal(audit.length, 1)
  assert.equal(audit[0].section, 'identity')
  assert.equal(audit[0].actor_user_id, user(1))
  assert.deepEqual(audit[0].metadata, { flow: 'birthday_completion' })
  assert.ok(audit[0].changed_fields.includes('birth_date'))
  assert.equal(audit[0].before_values.birth_date, null)
  assert.equal(audit[0].after_values.birth_date, '2000-01-01')
  assert.deepEqual((await db.query('SELECT to_jsonb(member) AS value FROM public.members member WHERE id=$1', [member(1)])).rows[0].value, memberBefore)
})
await check('same-value retries are idempotent and another birthday cannot overwrite an existing one', async () => {
  const before = await identity(1)
  assert.equal((await complete(1, '2000-01-01')).birth_date, '2000-01-01')
  assert.deepEqual(await identity(1), before)
  assert.equal((await audits(1)).length, 1)
  await reject(() => complete(1, '2001-01-01'), 'BIRTH_DATE_ALREADY_SET')
  await reject(() => complete(3, '2001-01-01'), 'BIRTH_DATE_NOT_ELIGIBLE')
  assert.equal((await identity(3)).birth_date, '1990-01-01')
})
await check('RPC ownership comes solely from auth uid and cannot access or modify another player', async () => {
  assert.equal((await get(16)).birth_date, null)
  await complete(16, '1998-05-06')
  assert.equal((await identity(16)).birth_date, '1998-05-06')
  assert.equal((await identity(2)).birth_date, null)
  assert.equal((await identity(1)).birth_date, '2000-01-01')
  await reject(() => asUser(16, () => db.query('SELECT public.complete_my_birth_date($1,$2)', ['2000-01-01', member(2)])), 'does not exist')
})
await check('missing identity fails closed without reconstructing or changing member state', async () => {
  await db.query('DELETE FROM public.member_identity WHERE member_id=$1', [member(11)])
  assert.equal((await get(11)).eligible, false)
  await reject(() => complete(11, '2000-01-01'), 'BIRTH_DATE_NOT_ELIGIBLE')
  assert.equal(await identity(11), undefined)
  assert.equal((await audits(11)).length, 0)
})
await check('suspended, anonymized and anonymous sessions cannot complete birthday', async () => {
  await db.query("UPDATE public.members SET account_status='suspended' WHERE id=$1", [member(14)])
  await reject(() => complete(14, '2000-01-01'), 'BIRTH_DATE_NOT_ELIGIBLE')
  assert.equal((await get(14)).eligible, false)
  await db.query("UPDATE public.members SET anonymized_at=now() WHERE id=$1", [member(14)])
  await reject(() => complete(14, '2000-01-01'), 'BIRTH_DATE_NOT_ELIGIBLE')
  await reject(() => asUser(15, () => db.query("SELECT public.complete_my_birth_date('2000-01-01')"), 'authenticated', true), 'BIRTH_DATE_NOT_ELIGIBLE')
  await reject(() => complete(null, '2000-01-01'), 'BIRTH_DATE_NOT_ELIGIBLE')
  await reject(() => asUser(null, () => db.query("SELECT public.complete_my_birth_date('2000-01-01')"), 'anon'), 'permission denied')
})
await check('administrator birthday writes settle the same reminder without requiring school', async () => {
  await db.query("UPDATE public.member_identity SET birth_date='1999-02-03' WHERE member_id=$1", [member(13)])
  assert.ok((await notices(13))[0].read_at)
  assert.equal((await get(13)).birth_date, '1999-02-03')
  await reject(() => complete(13, '1998-02-03'), 'BIRTH_DATE_ALREADY_SET')
})
await check('audit failure rolls back birthday, derived age and notification read state', async () => {
  await db.exec(`CREATE FUNCTION private.test_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'TEST_AUDIT_FAILURE'; END$$;
    CREATE TRIGGER test_fail_audit BEFORE INSERT ON private.member_profile_audit_log FOR EACH ROW EXECUTE FUNCTION private.test_fail_audit();`)
  const before = await identity(12)
  await reject(() => complete(12, '2000-01-01'), 'TEST_AUDIT_FAILURE')
  assert.deepEqual(await identity(12), before)
  assert.equal((await notices(12))[0].read_at, null)
  assert.equal((await audits(12)).length, 0)
  await db.exec('DROP TRIGGER test_fail_audit ON private.member_profile_audit_log; DROP FUNCTION private.test_fail_audit();')
})
await check('notification failure also rolls back birthday and audit', async () => {
  await db.exec(`CREATE FUNCTION private.test_fail_notice() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'TEST_NOTICE_FAILURE'; END$$;
    CREATE TRIGGER test_fail_notice BEFORE UPDATE ON public.community_notifications FOR EACH ROW EXECUTE FUNCTION private.test_fail_notice();`)
  const before = await identity(12)
  await reject(() => complete(12, '2000-01-01'), 'TEST_NOTICE_FAILURE')
  assert.deepEqual(await identity(12), before)
  assert.equal((await audits(12)).length, 0)
  await db.exec('DROP TRIGGER test_fail_notice ON public.community_notifications; DROP FUNCTION private.test_fail_notice();')
  await complete(12, '2000-01-01')
})
await check('expired/deleted notices neither remove eligibility nor cause a resend', async () => {
  await db.query("DELETE FROM public.community_notifications WHERE recipient_member_id=$1 AND notification_type='birthday_completion'", [member(2)])
  await dispatch()
  assert.deepEqual(await notices(2), [])
  assert.equal((await get(2)).eligible, true)
  assert.equal((await complete(2, '2000-02-29')).birth_date, '2000-02-29')
  assert.equal((await get(99)).eligible, false)
})
await check('private cohort cannot be read or modified by clients and postflight passes', async () => {
  await reject(() => asUser(1, () => db.query('SELECT * FROM private.birthday_completion_recipients')), 'permission denied')
  await reject(() => asUser(99, () => db.query('INSERT INTO private.birthday_completion_recipients(member_id) VALUES($1)', [member(99)])), 'permission denied')
  await reject(() => asUser(1, () => db.query('DELETE FROM private.birthday_completion_campaign')), 'permission denied')
  await db.exec(read('supabase/audits/birthday-completion-postflight.sql'))
})
console.log(`PASS ${passed} birthday completion database checks`)
await db.close()
