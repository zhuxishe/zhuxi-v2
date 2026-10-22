// Isolated PostgreSQL checks. This script never connects to a live database.
// PGLITE_MODULE may point to an installed @electric-sql/pglite entry point.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

process.on('uncaughtException', error => { console.error(error.message, error.code || '', error.where || ''); process.exit(1) })

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const root = process.env.PENDING_IGNORE_TEST_ROOT || fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(root + '/' + path, 'utf8')
const migrationName = readdirSync(root + '/supabase/migrations').find(name => name.endsWith('_pending_application_ignore.sql'))
assert.ok(migrationName, 'Missing pending application ignore migration')
const migration = read('supabase/migrations/' + migrationName)
const master = read('supabase/migrations/20260829175645_user_member_master_v1.sql')
const profile = read('supabase/migrations/20260717133952_player_profile_v1.sql')
const db = new PGlite()

function extractFunction(source, name) {
  const start = Math.max(source.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`), source.indexOf(`CREATE FUNCTION ${name}(`))
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

await db.exec(`
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
for (const name of ['001_core_members.sql', '002_admin_interview.sql', '003_supplementary.sql']) {
  await db.exec(read('supabase/migrations/' + name))
}
await db.exec(`
  ALTER TABLE public.members
    ADD COLUMN account_status text NOT NULL DEFAULT 'active',
    ADD COLUMN profile_stage text NOT NULL DEFAULT 'submitted',
    ADD COLUMN record_source text NOT NULL DEFAULT 'app',
    ADD COLUMN record_scope text NOT NULL DEFAULT 'current',
    ADD COLUMN membership_type text NOT NULL DEFAULT 'player',
    ADD COLUMN onboarding_step smallint NOT NULL DEFAULT 4,
    ADD COLUMN last_profile_saved_at timestamptz,
    ADD COLUMN submitted_at timestamptz DEFAULT now(),
    ADD COLUMN account_linked_at timestamptz,
    ADD COLUMN anonymized_at timestamptz,
    ADD COLUMN line_user_id text,
    ADD COLUMN wechat_openid text;
`)
await db.exec(extractTable(read('supabase/migrations/017_personality_quiz.sql'), 'public.personality_quiz_results'))
await db.exec(extractTable(read('supabase/migrations/006_maintenance.sql'), 'public.member_verification'))
await db.exec(extractTable(profile, 'private.member_profile_audit_log'))
await db.exec(master.slice(master.indexOf('ALTER TABLE private.member_profile_audit_log\n'), master.indexOf('CREATE INDEX IF NOT EXISTS member_profile_audit_snapshot_created_idx')))
for (const name of [
  'private.member_master_is_admin', 'private.member_master_is_super_admin',
  'private.member_master_current_admin_id', 'private.member_master_changed_fields',
  'private.member_master_validate_payload_keys', 'private.member_master_jsonb_text_array',
  'private.member_master_prepare_audit_event', 'private.member_master_reject_audit_mutation',
  'private.member_master_section_snapshot', 'private.member_master_apply_admin_section',
]) await db.exec(extractFunction(master, name))
for (const name of ['private.peer_current_admin', 'private.peer_lock_admin']) {
  await db.exec(extractFunction(read('supabase/migrations/20261002165912_round_peer_reviews.sql'), name))
}
await db.exec(extractFunction(read('supabase/migrations/20260830162310_admin_create_missing_member_identity.sql'), 'public.admin_update_member_section'))
for (const name of ['private.member_master_audit_member_change', 'private.member_master_sync_lifecycle']) {
  await db.exec(extractFunction(read('supabase/migrations/20260902073905_archive_historical_member_records.sql'), name))
}
await db.exec(extractFunction(read('supabase/migrations/20260907194820_player_profile_consistency.sql'), 'private.player_profile_require_submission_before_approval'))
await db.exec(`
  CREATE TRIGGER member_master_sync_lifecycle BEFORE INSERT OR UPDATE OF status, member_number, user_id, email, line_user_id, wechat_openid, account_status, profile_stage, record_source, record_scope, onboarding_step, account_linked_at, anonymized_at ON public.members FOR EACH ROW EXECUTE FUNCTION private.member_master_sync_lifecycle();
  CREATE TRIGGER member_master_audit_member_change AFTER INSERT OR UPDATE OF status, member_number, account_status, anonymized_at ON public.members FOR EACH ROW EXECUTE FUNCTION private.member_master_audit_member_change();
  CREATE TRIGGER member_profile_audit_prepare BEFORE INSERT ON private.member_profile_audit_log FOR EACH ROW EXECUTE FUNCTION private.member_master_prepare_audit_event();
  CREATE TRIGGER member_profile_audit_append_only BEFORE UPDATE OR DELETE ON private.member_profile_audit_log FOR EACH ROW EXECUTE FUNCTION private.member_master_reject_audit_mutation();
  CREATE TRIGGER player_profile_require_submission_before_approval BEFORE UPDATE OF status ON public.members FOR EACH ROW EXECUTE FUNCTION private.player_profile_require_submission_before_approval();
  GRANT SELECT ON public.members, public.member_identity, public.admin_users TO authenticated;
  REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION private.member_master_is_admin(), private.member_master_is_super_admin() TO authenticated;
  REVOKE ALL ON FUNCTION public.admin_update_member_section(uuid,text,jsonb,text,timestamptz) FROM PUBLIC, anon, service_role;
  GRANT EXECUTE ON FUNCTION public.admin_update_member_section(uuid,text,jsonb,text,timestamptz) TO authenticated;
  -- Observe all canonical member writes, including timestamp-only updates.
  CREATE TABLE private.fixture_member_writes(member_id uuid, operation text);
  CREATE FUNCTION private.fixture_observe_member_write() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN INSERT INTO private.fixture_member_writes VALUES(NEW.id,TG_OP); RETURN NEW; END$$;
  CREATE TRIGGER fixture_observe_member_write AFTER UPDATE ON public.members FOR EACH ROW EXECUTE FUNCTION private.fixture_observe_member_write();
`)

const uuid = (kind, n) => `${kind}0000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const user = n => uuid(1, n)
const member = n => uuid(2, n)
const adminId = uuid(3, 900)
for (const [n, role, name] of [[900, 'admin', 'Fixture administrator'], [901, 'super_admin', 'Fixture super administrator']]) {
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [user(n), `admin-${n}@fixture.local`])
  await db.query('INSERT INTO public.admin_users(id,user_id,email,name,role) VALUES($1,$2,$3,$4,$5)', [uuid(3, n), user(n), `admin-${n}@fixture.local`, name, role])
}
async function fixture(n, options = {}) {
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [user(n), `member-${n}@fixture.local`])
  await db.query(`INSERT INTO public.members(id,user_id,email,status,profile_stage,onboarding_step,record_source,record_scope)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [member(n), options.source === 'legacy' ? null : user(n), options.source === 'legacy' ? null : `member-${n}@fixture.local`, options.status || 'pending', options.stage || 'submitted', options.step ?? 4, options.source || 'app', options.scope || 'current'])
  if (options.identity !== false) await db.query(`INSERT INTO public.member_identity(member_id,full_name,gender,age_range,nationality,current_city,hobby_tags,activity_type_tags,personality_self_tags)
    VALUES($1,$2,'other','23-25','中国','东京',ARRAY['fixture'],ARRAY['fixture'],ARRAY['fixture'])`, [member(n), `Fixture member ${n}`])
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
const updatedAt = async n => (await db.query('SELECT updated_at::text AS value FROM public.members WHERE id=$1', [member(n)])).rows[0].value
const ignoredAt = async n => (await db.query('SELECT ignored_at::text AS value FROM public.member_application_ignores WHERE member_id=$1', [member(n)])).rows[0]?.value
const setIgnored = (actor, n, ignored, reason, expectedUpdatedAt, expectedIgnoredAt = null, role = 'authenticated') => asUser(actor, () => db.query('SELECT public.admin_set_pending_application_ignored($1,$2,$3,$4::timestamptz,$5::timestamptz) AS result', [member(n), ignored, reason, expectedUpdatedAt, expectedIgnoredAt]), role)
const approve = (actor, n, reason, expectedUpdatedAt, role = 'authenticated') => asUser(actor, () => db.query('SELECT public.admin_approve_pending_application($1,$2,$3::timestamptz) AS result', [member(n), reason, expectedUpdatedAt]), role)
const reason = '确认并非活动目标人群'
let passed = 0
async function check(name, run) { await run(); passed++; console.log('PASS ' + name) }
async function rejects(operation, pattern) {
  await assert.rejects(operation, error => {
    assert.ok(pattern.test(error.message + ' ' + error.code), `Unexpected SQL rejection: ${error.message} (${error.code})`)
    return true
  })
}

for (let n = 1; n <= 12; n++) await fixture(n)
await fixture(20, { status: 'approved' })
await fixture(21, { stage: 'in_progress', step: 3 })
await fixture(22, { identity: false })
await fixture(23, { source: 'legacy', scope: 'historical' })
await fixture(24)
await db.query("UPDATE public.members SET account_status='suspended' WHERE id=$1", [member(24)])
await db.query("INSERT INTO auth.users(id,email) VALUES($1,'non-member@fixture.local')", [user(888)])
await db.exec(migration)
await db.exec(read('supabase/audits/pending-application-ignore-postflight.sql'))
console.log('PASS read-only postflight')

await check('anon, authenticated without identity, players and service_role cannot invoke admin mutations', async () => {
  const token = await updatedAt(1)
  for (const [actor, role] of [[null, 'anon'], [null, 'authenticated'], [1, 'authenticated'], [20, 'authenticated'], [888, 'authenticated'], [null, 'service_role']]) {
    await rejects(async () => setIgnored(actor, 1, true, reason, token, null, role), /42501|ADMIN_REQUIRED|permission denied/i)
    await rejects(async () => approve(actor, 1, reason, token, role), /42501|ADMIN_REQUIRED|permission denied/i)
  }
  assert.equal(await ignoredAt(1), undefined)
})

await check('ordinary admin can ignore; actor snapshots and append-only audit come from the authenticated session', async () => {
  const before = (await db.query('SELECT to_jsonb(m) AS value FROM public.members m WHERE id=$1', [member(1)])).rows[0].value
  await setIgnored(900, 1, true, reason, await updatedAt(1))
  const ignore = (await db.query('SELECT * FROM public.member_application_ignores WHERE member_id=$1', [member(1)])).rows[0]
  assert.equal(ignore.actor_admin_id, adminId)
  assert.equal(ignore.actor_name, 'Fixture administrator')
  assert.equal(ignore.reason, reason)
  const audit = (await db.query("SELECT * FROM private.member_profile_audit_log WHERE member_id=$1 AND section='application_queue' ORDER BY id DESC LIMIT 1", [member(1)])).rows[0]
  assert.equal(audit.action_type, 'related_record_change')
  assert.equal(audit.actor_admin_id, adminId)
  assert.equal(audit.actor_user_id, user(900))
  assert.equal(audit.actor_name, 'Fixture administrator')
  assert.equal(audit.actor_role_snapshot, 'admin')
  assert.equal(audit.reason, reason)
  assert.deepEqual((await db.query('SELECT to_jsonb(m) AS value FROM public.members m WHERE id=$1', [member(1)])).rows[0].value, before)
  assert.equal((await db.query('SELECT count(*)::int AS count FROM private.fixture_member_writes WHERE member_id=$1', [member(1)])).rows[0].count, 0)
})

await check('RLS hides internal notes from players; direct writes are blocked even for admin and service role', async () => {
  assert.equal((await asUser(1, () => db.query('SELECT * FROM public.member_application_ignores'))).rows.length, 0)
  assert.equal((await asUser(null, () => db.query('SELECT * FROM public.member_application_ignores'))).rows.length, 0)
  assert.equal((await asUser(900, () => db.query('SELECT * FROM public.member_application_ignores'))).rows.length, 1)
  for (const [actor, role] of [[1, 'authenticated'], [900, 'authenticated'], [null, 'service_role']]) {
    for (const sql of [
      "INSERT INTO public.member_application_ignores(member_id,ignored_at,actor_admin_id,actor_name,reason) VALUES($1,now(),$2,'Forged actor','伪造忽略理由')",
      "UPDATE public.member_application_ignores SET actor_name='Forged actor' WHERE member_id=$1 AND actor_admin_id=$2",
      'DELETE FROM public.member_application_ignores WHERE member_id=$1 AND actor_admin_id=$2',
    ]) await rejects(() => asUser(actor, () => db.query(sql, [member(1), adminId]), role), /42501|permission denied/i)
  }
  await rejects(() => db.query("UPDATE private.member_profile_audit_log SET reason='changed' WHERE section='application_queue'"), /APPEND_ONLY/)
})

await check('reason validation rejects blank Unicode text and out-of-range code-point lengths', async () => {
  for (const value of ['', 'abc', ' '.repeat(5), '\u3000'.repeat(5), '\u00a0\t\n\u3000', '字'.repeat(501), '😀'.repeat(501)]) {
    await rejects(async () => setIgnored(900, 2, true, value, await updatedAt(2)), /REASON|22023/i)
  }
  await setIgnored(900, 2, true, '😀'.repeat(4), await updatedAt(2))
  await setIgnored(900, 3, true, '字'.repeat(500), await updatedAt(3))
})

await check('scope and canonical version are checked inside the mutation', async () => {
  for (const n of [20, 21, 22, 23, 24]) await rejects(async () => setIgnored(900, n, true, reason, await updatedAt(n)), /PENDING|ELIGIB|APPLICATION|NOT_FOUND|PROFILE|55000|P0002/)
  await rejects(async () => setIgnored(900, 4, true, reason, '2000-01-01T00:00:00Z'), /VERSION|CONFLICT|PT409|40001/)
  await rejects(async () => setIgnored(900, 4, true, reason, null), /VERSION|CONFLICT|PT409|40001/)
  await rejects(async () => approve(900, 4, '资料审核确认通过', null), /VERSION|CONFLICT|PT409|40001/)
  assert.equal(await ignoredAt(4), undefined)
})

await check('ignored applications cannot be approved by a stale queue selection', async () => {
  const staleVersion = await updatedAt(1)
  await rejects(async () => approve(900, 1, '资料审核确认通过', staleVersion), /IGNORED|PENDING|APPLICATION|ELIGIB|55000/)
  assert.equal((await db.query('SELECT status FROM public.members WHERE id=$1', [member(1)])).rows[0].status, 'pending')
})

await check('duplicate ignore requests do not replace the actor, reason, token or append audit noise', async () => {
  const before = (await db.query('SELECT to_jsonb(i) AS value FROM public.member_application_ignores i WHERE member_id=$1', [member(1)])).rows[0].value
  const eventCount = (await db.query("SELECT count(*)::int AS count FROM private.member_profile_audit_log WHERE member_id=$1 AND section='application_queue'", [member(1)])).rows[0].count
  await rejects(async () => setIgnored(901, 1, true, '另一管理员不应覆盖', await updatedAt(1)), /ALREADY_IGNORED|PT409/)
  assert.deepEqual((await db.query('SELECT to_jsonb(i) AS value FROM public.member_application_ignores i WHERE member_id=$1', [member(1)])).rows[0].value, before)
  assert.equal((await db.query("SELECT count(*)::int AS count FROM private.member_profile_audit_log WHERE member_id=$1 AND section='application_queue'", [member(1)])).rows[0].count, eventCount)
})

await check('restore requires matching ignore token and records a second permanent audit event', async () => {
  const version = await updatedAt(1)
  const token = await ignoredAt(1)
  await rejects(async () => setIgnored(900, 1, false, '确认需要重新跟进', version, null), /VERSION|CONFLICT|IGNORED|TOKEN|EXPECTED|22023|PT409/)
  await rejects(async () => setIgnored(900, 1, false, '确认需要重新跟进', version, '2000-01-01T00:00:00Z'), /VERSION|CONFLICT|PT409|40001/)
  await setIgnored(900, 1, false, '确认需要重新跟进', version, token)
  assert.equal(await ignoredAt(1), undefined)
  await rejects(() => setIgnored(900, 1, false, '重复恢复不得新增记录', version, token), /VERSION|CONFLICT|PT409|40001/)
  assert.equal(await updatedAt(1), version)
  assert.equal((await db.query("SELECT count(*)::int AS count FROM private.member_profile_audit_log WHERE member_id=$1 AND section='application_queue'", [member(1)])).rows[0].count, 2)
  await setIgnored(901, 1, true, '再次核实后暂时忽略', version)
  const newToken = await ignoredAt(1)
  assert.notEqual(newToken, token)
  await rejects(async () => setIgnored(900, 1, false, '旧页面不应撤销新忽略', version, token), /VERSION|CONFLICT|PT409|40001/)
  assert.equal(await ignoredAt(1), newToken)
})

await check('eligible applications retain actual existing approval validation and audit behavior', async () => {
  await approve(900, 5, '资料审核确认通过', await updatedAt(5))
  const row = (await db.query('SELECT status,profile_stage,onboarding_step FROM public.members WHERE id=$1', [member(5)])).rows[0]
  assert.deepEqual(row, { status: 'approved', profile_stage: 'complete', onboarding_step: 4 })
  assert.equal((await db.query("SELECT count(*)::int AS count FROM private.member_profile_audit_log WHERE member_id=$1 AND action_type='admin_section_update' AND section='application'", [member(5)])).rows[0].count, 1)
  await rejects(async () => setIgnored(900, 5, true, reason, await updatedAt(5)), /PENDING|ELIGIB|APPLICATION|55000/)
  await db.query("UPDATE public.member_identity SET hobby_tags='{}' WHERE member_id=$1", [member(6)])
  await rejects(async () => approve(900, 6, '资料审核确认通过', await updatedAt(6)), /PROFILE_SUBMISSION_REQUIRED/)
})

await check('the opposite serialized order rejects ignore after approval, and restores allow later approval', async () => {
  const beforeApproval = await updatedAt(8)
  await approve(900, 8, '资料审核确认通过', beforeApproval)
  await rejects(() => setIgnored(901, 8, true, reason, beforeApproval), /NOT_ELIGIBLE|PT409/)
  assert.equal(await ignoredAt(8), undefined)
  const beforeIgnore = await updatedAt(9)
  await setIgnored(900, 9, true, reason, beforeIgnore)
  await setIgnored(901, 9, false, '确认本次申请需要跟进', beforeIgnore, await ignoredAt(9))
  await approve(900, 9, '资料审核确认通过', beforeIgnore)
  assert.equal((await db.query('SELECT status FROM public.members WHERE id=$1', [member(9)])).rows[0].status, 'approved')
})

await check('anonymized applicants cannot accept new notes or expose existing notes to administrators', async () => {
  await setIgnored(900, 7, true, reason, await updatedAt(7))
  await db.query("UPDATE public.members SET anonymized_at=now(),account_status='closed' WHERE id=$1", [member(7)])
  const rows = await asUser(900, () => db.query('SELECT * FROM public.member_application_ignores WHERE member_id=$1', [member(7)]))
  assert.deepEqual(rows.rows, [])
  assert.equal(await ignoredAt(7), undefined)
  await rejects(async () => setIgnored(900, 7, true, reason, await updatedAt(7)), /ANONYM|PENDING|ELIGIB|APPLICATION|LOCKED|55000/)
  await rejects(async () => setIgnored(900, 7, false, '重新处理匿名化用户', await updatedAt(7), await ignoredAt(7)), /ANONYM|PENDING|ELIGIB|APPLICATION|LOCKED|55000/)
})

await check('a suspended administrator loses access to mutations despite an existing admin row', async () => {
  await db.query("INSERT INTO public.members(id,user_id,email,status,account_status) VALUES($1,$2,'admin-900@fixture.local','approved','suspended')", [member(900), user(900)])
  await rejects(async () => setIgnored(900, 10, true, reason, await updatedAt(10)), /ADMIN_REQUIRED|42501/)
  await rejects(async () => approve(900, 10, '资料审核确认通过', await updatedAt(10)), /ADMIN_REQUIRED|42501/)
  await setIgnored(901, 10, true, reason, await updatedAt(10))
})

await db.exec(read('supabase/audits/pending-application-ignore-postflight.sql'))
console.log(`PASS ${passed} pending application ignore PostgreSQL checks`)
await db.close()
