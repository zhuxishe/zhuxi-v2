// Real migration verification in an isolated, in-memory PostgreSQL database.
// No network, Production database, member allocation or account mutation occurs.
// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite module.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const root = process.env.MEMBER_OVERVIEW_TEST_ROOT || fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(root + '/' + path, 'utf8')
const allocation = read('supabase/migrations/20261006111856_member_number_allocation.sql')
const master = read('supabase/migrations/20260829175645_user_member_master_v1.sql')
const profile = read('supabase/migrations/20260717133952_player_profile_v1.sql')
const overview = read('supabase/migrations/20261006123243_admin_member_overview.sql')
const db = new PGlite()

function extractFunction(source, name) {
  const pattern = new RegExp(`CREATE (?:OR REPLACE )?FUNCTION ${name.replaceAll('.', '\\.')}\\(`, 'i')
  const match = pattern.exec(source)
  assert.ok(match, `Missing real SQL function ${name}`)
  const definition = source.slice(match.index)
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
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
  CREATE TABLE auth.users(id uuid PRIMARY KEY, last_sign_in_at timestamptz, deleted_at timestamptz);
  GRANT USAGE ON SCHEMA public, auth, private TO anon, authenticated, service_role;
`)
await db.exec(read('supabase/migrations/001_core_members.sql'))
await db.exec(read('supabase/migrations/002_admin_interview.sql'))
await db.exec(`
  ALTER TABLE public.members
    ADD COLUMN user_id uuid REFERENCES auth.users(id),
    ADD COLUMN account_status text NOT NULL DEFAULT 'active',
    ADD COLUMN record_source text NOT NULL DEFAULT 'app',
    ADD COLUMN record_scope text NOT NULL DEFAULT 'current',
    ADD COLUMN membership_type text NOT NULL DEFAULT 'player',
    ADD COLUMN anonymized_at timestamptz;
  CREATE SEQUENCE private.member_number_sequence START WITH 300;
`)
await db.exec(extractTable(master, 'private.member_auth_tombstones'))
await db.exec(extractTable(profile, 'private.member_profile_audit_log'))
await db.exec(master.slice(master.indexOf('ALTER TABLE private.member_profile_audit_log\n'), master.indexOf('CREATE INDEX IF NOT EXISTS member_profile_audit_snapshot_created_idx')))
for (const name of ['private.member_number_roster', 'private.member_number_canonical', 'private.member_number_history_contains']) {
  await db.exec(extractFunction(allocation, name))
  const grant = allocation.split('\n').find(line => line.startsWith(`REVOKE ALL ON FUNCTION ${name}(`))
  assert.ok(grant, `Missing real SQL ACL for ${name}`)
  await db.exec(grant)
}
await db.exec(overview)

const uuid = (kind, n) => `${kind}0000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const user = n => uuid(1, n)
const member = n => uuid(2, n)
const signIn = '2026-10-06T03:00:00Z'
async function fixture(n, options = {}) {
  const auth = options.auth !== false
  if (auth) await db.query('INSERT INTO auth.users(id,last_sign_in_at,deleted_at) VALUES($1,$2,$3)', [user(n), options.login === false ? null : signIn, options.deleted ? signIn : null])
  await db.query(`INSERT INTO public.members(id,user_id,member_number,status,account_status,record_scope,record_source,membership_type,anonymized_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [member(n), auth ? user(n) : null, options.number ?? `ZXS_${String(n).padStart(3, '0')}`, options.status || 'approved', options.accountStatus || 'active', options.scope || 'current', options.source || 'app', options.type || 'player', options.anonymized ? signIn : null])
  if (options.gender) await db.query(`INSERT INTO public.member_identity(member_id,full_name,gender,age_range,nationality,current_city)
    VALUES($1,$2,$3,'20-30','中国','东京')`, [member(n), options.name || `Fixture member ${n}`, options.gender])
}
async function administrator(n, role = 'super_admin') {
  await db.query('INSERT INTO auth.users(id,last_sign_in_at) VALUES($1,$2)', [user(n), signIn])
  await db.query('INSERT INTO public.admin_users(id,user_id,email,name,role) VALUES($1,$2,$3,$4,$5)', [uuid(3, n), user(n), `admin-${n}@fixture.local`, `Fixture admin ${n}`, role])
}
async function asUser(n, operation, role = 'authenticated', readOnly = false) {
  await db.exec(readOnly ? 'BEGIN READ ONLY' : 'BEGIN')
  try {
    await db.exec('SET LOCAL ROLE ' + role)
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [n ? user(n) : ''])
    const result = await operation()
    await db.exec('COMMIT')
    return result
  } catch (error) {
    await db.exec('ROLLBACK')
    throw error
  }
}
const metrics = (n = 900, role = 'authenticated', readOnly = false) => asUser(n, async () => (await db.query('SELECT public.admin_member_dashboard_metrics() AS result')).rows[0].result, role, readOnly)
const list = (search = null, filter = 'all', page = 1, size = 50, n = 900, role = 'authenticated', readOnly = false) => asUser(n, async () => (await db.query('SELECT public.admin_legacy_member_status($1,$2,$3,$4) AS result', [search, filter, page, size])).rows[0].result, role, readOnly)
async function row(number) { return (await list(number)).items.find(item => item.member_number === number) }
async function history(number, field) {
  await db.query(`INSERT INTO private.member_profile_audit_log(member_id,member_id_snapshot,action_type,${field})
    VALUES($1,$1,'member_lifecycle_update',$2::jsonb)`, [member(1), JSON.stringify({ member_number: number })])
}
let passed = 0
async function check(name, run) { await run(); passed++; console.log('PASS ' + name) }

await administrator(900)
await administrator(901, 'admin')
await administrator(902)
await administrator(903)
await administrator(904)
await administrator(905)
await administrator(906)
await db.query("INSERT INTO public.members(id,user_id,status,account_status) VALUES($1,$2,'inactive','closed')", [member(902), user(902)])
await db.query('UPDATE auth.users SET deleted_at=$1 WHERE id=$2', [signIn, user(904)])
await db.query("INSERT INTO public.members(id,user_id,status,account_status) VALUES($1,$2,'approved','suspended')", [member(905), user(905)])
await db.query("INSERT INTO public.members(id,user_id,status,account_status,anonymized_at) VALUES($1,$2,'approved','active',$3)", [member(906), user(906), signIn])
await db.query(`INSERT INTO private.member_auth_tombstones(auth_user_id,member_id_snapshot,status,profile_stage,record_source,onboarding_step,anonymized_at)
  VALUES($1,$2,'inactive','not_started','app',0,$3)`, [user(903), member(903), signIn])
await fixture(1, { gender: 'male' })
await fixture(2, { gender: 'female', login: false })
await fixture(3, { gender: 'male', type: 'staff' })
await fixture(4, { gender: 'female', status: 'pending' })
await fixture(5, { gender: 'male', status: 'rejected' })
await fixture(6, { gender: 'female', status: 'inactive' })
await fixture(7, { gender: 'male', accountStatus: 'suspended' })
await fixture(8, { gender: 'female', accountStatus: 'unbound', status: 'pending', auth: false })
await fixture(9, { gender: 'male', accountStatus: 'closed' })
await fixture(10, { gender: 'female', accountStatus: 'closed', anonymized: true, auth: false })
await fixture(11, { gender: 'male', scope: 'historical', source: 'legacy' })
await fixture(12, { gender: 'female', scope: 'historical', source: 'import' })
await fixture(13, { gender: 'male', auth: false })
await fixture(14, { gender: 'female', deleted: true })
await fixture(15, { gender: 'other' })
await fixture(16)
await fixture(17, { number: 'ZXS_777', gender: 'other', name: '李佩泽' })
await fixture(21, { gender: 'female' })
await fixture(22, { gender: 'female', anonymized: true })
await fixture(23, { gender: 'other', source: 'import' })
await fixture(24, { gender: 'other', source: 'legacy' })
await fixture(30, { number: 'ZXS_000', gender: 'male' })
await history(' zxs_000018 ', 'before_values')
await history('ZXS_019', 'after_values')
await history('ZXS_020', 'metadata')
await history('not-a-number', 'metadata')

await check('real offline roster contains 248 rows and excludes official number from the 247-player list', async () => {
  assert.equal((await db.query('SELECT count(*)::int AS total FROM private.member_number_roster()')).rows[0].total, 248)
  const result = await list(null, 'all', 1, 100)
  assert.equal(result.total, 247)
  assert.equal(result.summary.total, 247)
  assert.equal(result.items.length, 100)
  assert.ok(result.items.every(item => item.member_number !== 'ZXS_000'))
})
await check('gender counts only active current approved male/female users with valid Auth, including approved staff', async () => {
  assert.deepEqual(await metrics(), { male_count: 2, female_count: 2, legacy_total: 247, legacy_activated: 8 })
})
await check('activation requires valid Auth, normal account and a previous login, independently of approval', async () => {
  assert.equal((await row('ZXS_001')).activated, true)
  assert.equal((await row('ZXS_002')).registered, true)
  assert.equal((await row('ZXS_002')).has_logged_in, false)
  assert.equal((await row('ZXS_002')).activated, false)
  assert.equal((await row('ZXS_004')).activated, true)
  assert.equal((await row('ZXS_005')).activated, true)
  assert.equal((await row('ZXS_007')).activated, false)
})
await check('pending and inactive approvals remain unknown; rejected is explicitly false', async () => {
  assert.equal((await row('ZXS_004')).approved, null)
  assert.equal((await row('ZXS_005')).approved, false)
  assert.equal((await row('ZXS_006')).approved, null)
  assert.equal((await row('ZXS_001')).approved, true)
})
await check('unbound and deleted Auth identities do not invent a login or count as activated', async () => {
  for (const number of ['ZXS_008', 'ZXS_013', 'ZXS_014']) {
    const item = await row(number)
    assert.equal(item.registered, false)
    assert.equal(item.has_logged_in, null)
    assert.equal(item.last_sign_in_at, null)
    assert.equal(item.activated, false)
  }
})
await check('closed and anonymized users never reveal member links, registration, approval or login fields', async () => {
  for (const number of ['ZXS_009', 'ZXS_010', 'ZXS_022']) {
    const item = await row(number)
    for (const key of ['member_id', 'registered', 'approved', 'has_logged_in', 'last_sign_in_at']) assert.equal(item[key], null)
    assert.equal(item.account_status, 'closed')
    assert.equal(item.activated, false)
  }
})
await check('historical/import records and same-name differently numbered accounts cannot establish roster identity', async () => {
  for (const number of ['ZXS_011', 'ZXS_012', 'ZXS_017', 'ZXS_023', 'ZXS_024']) {
    const item = await row(number)
    assert.equal(item.member_id, null)
    assert.equal(item.registered, null)
    assert.equal(item.account_status, 'unverified')
    assert.equal(item.activated, false)
  }
})
await check('real number history recognizes retired reservations without restoring identity or claiming unregistered', async () => {
  for (const number of ['ZXS_018', 'ZXS_019', 'ZXS_020']) {
    const item = await row(number)
    assert.equal(item.account_status, 'retired')
    assert.equal(item.registered, null)
    assert.equal(item.member_id, null)
    assert.equal(item.last_sign_in_at, null)
  }
})
await check('untouched reservations remain unknown rather than falsely claiming no registration', async () => {
  const item = await row('ZXS_247')
  assert.equal(item.account_status, 'unverified')
  assert.equal(item.registered, null)
  assert.equal(item.has_logged_in, null)
})
await check('search matches literal member numbers and Chinese names without wildcard interpretation', async () => {
  assert.equal((await list('ZXS_001')).total, 1)
  assert.equal((await list('陈风')).items[0].member_number, 'ZXS_001')
  assert.equal((await list('zxs_001')).total, 1)
  assert.equal((await list('  ZXS_001  ')).total, 1)
  assert.equal((await list('ZXS_')).total, 247)
  for (const search of ['%', 'ZXS_%', '_%', 'ZXS_00_']) assert.equal((await list(search)).total, 0)
})
await check('filters partition the full roster consistently, with global summary unaffected by search', async () => {
  const activated = await list(null, 'activated', 1, 100)
  const inactive = await list(null, 'inactive', 1, 100)
  const unverified = await list(null, 'unverified', 1, 100)
  assert.equal(activated.total, 8)
  assert.equal(activated.total + inactive.total + unverified.total, 247)
  assert.ok(activated.items.every(item => item.activated))
  assert.ok(inactive.items.every(item => !item.activated && item.account_status !== 'unverified'))
  assert.ok(unverified.items.every(item => item.account_status === 'unverified'))
  assert.deepEqual((await list('ZXS_001')).summary, { total: 247, activated: 8 })
  assert.equal((await list(null, 'not-a-filter')).total, 247)
})
await check('pagination covers each reservation exactly once in stable reserved-number order', async () => {
  const items = []
  for (let page = 1; page <= 5; page++) {
    const result = await list(null, 'all', page, 50)
    assert.equal(result.total_pages, 5)
    assert.equal(result.page, page)
    items.push(...result.items)
  }
  assert.equal(items.length, 247)
  assert.equal(new Set(items.map(item => item.member_number)).size, 247)
  assert.equal(items[0].member_number, 'ZXS_001')
  assert.equal(items.at(-1).member_number, 'ZXS_247')
})
await check('empty search results and page/page-size bounds return accurate totals and safe pages', async () => {
  const empty = await list('does not exist', 'all', 99)
  assert.deepEqual(empty.items, [])
  assert.equal(empty.total, 0)
  assert.equal(empty.total_pages, 0)
  assert.equal(empty.page, 1)
  const low = await list(null, 'all', -3, -5)
  assert.equal(low.page, 1)
  assert.equal(low.page_size, 1)
  const high = await list(null, 'all', 2147483647, 2147483647)
  assert.equal(high.page, 3)
  assert.equal(high.page_size, 100)
  assert.equal(high.items.length, 47)
  const defaults = await list(null, null, null, null)
  assert.equal(defaults.page_size, 50)
  assert.equal(defaults.page, 1)
})
await check('ordinary admin can read aggregate cards but cannot obtain the sensitive roster', async () => {
  assert.deepEqual(await metrics(901), await metrics())
  await assert.rejects(list(null, 'all', 1, 50, 901), /MEMBER_OVERVIEW_ADMIN_REQUIRED/)
})
await check('players, absent JWT identity, closed admins and tombstoned admins cannot invoke either RPC', async () => {
  for (const n of [1, null, 902, 903, 905, 906]) {
    await assert.rejects(metrics(n), /MEMBER_OVERVIEW_ADMIN_REQUIRED/)
    await assert.rejects(list(null, 'all', 1, 50, n), /MEMBER_OVERVIEW_ADMIN_REQUIRED/)
  }
})
await check('a soft-deleted Auth admin cannot reuse an unexpired JWT to read metrics or sensitive roster data', async () => {
  await assert.rejects(metrics(904), /MEMBER_OVERVIEW_ADMIN_REQUIRED/)
  await assert.rejects(list(null, 'all', 1, 50, 904), /MEMBER_OVERVIEW_ADMIN_REQUIRED/)
})
await check('anon and service-role direct RPC execution has no grant', async () => {
  for (const role of ['anon', 'service_role']) {
    await assert.rejects(metrics(900, role), /permission denied for function admin_member_dashboard_metrics/)
    await assert.rejects(list(null, 'all', 1, 50, 900, role), /permission denied for function admin_legacy_member_status/)
  }
})
await check('private helpers and private source data are inaccessible even to a super-admin JWT', async () => {
  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const sql of [
      'SELECT private.member_overview_require_admin(false)',
      'SELECT * FROM private.member_overview_roster_rows()',
      'SELECT * FROM private.member_number_roster()',
      "SELECT private.member_number_history_contains('ZXS_001')",
      "SELECT private.member_number_canonical('ZXS_001')",
      'SELECT * FROM private.member_auth_tombstones',
      'SELECT * FROM private.member_profile_audit_log',
      'SELECT * FROM auth.users',
    ]) await assert.rejects(asUser(900, () => db.query(sql), role), /permission denied/)
  }
})
await check('empty eligible gender population returns zero counts rather than invented proportions', async () => {
  await db.exec('BEGIN')
  try {
    await db.exec("UPDATE public.member_identity SET gender='other'")
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user(900)])
    const result = (await db.query('SELECT public.admin_member_dashboard_metrics() AS result')).rows[0].result
    assert.equal(result.male_count, 0)
    assert.equal(result.female_count, 0)
  } finally { await db.exec('ROLLBACK') }
})
async function snapshot() {
  const result = {}
  for (const name of ['public.members', 'public.member_identity', 'public.admin_users', 'auth.users', 'private.member_auth_tombstones', 'private.member_profile_audit_log']) {
    result[name] = (await db.query(`SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text),'[]'::jsonb) AS data FROM ${name} AS row`)).rows[0].data
  }
  result.sequence = (await db.query('SELECT last_value,is_called FROM private.member_number_sequence')).rows[0]
  return result
}
await check('both real RPCs execute in READ ONLY transactions and preserve members, numbers, Auth and audit history', async () => {
  const before = await snapshot()
  assert.deepEqual(await metrics(900, 'authenticated', true), await metrics())
  assert.equal((await list(null, 'all', 1, 50, 900, 'authenticated', true)).total, 247)
  assert.deepEqual(await snapshot(), before)
})
await check('the exact Production postflight script is read-only and returns only non-identifying aggregates', async () => {
  const before = await snapshot()
  const results = await db.exec(read('supabase/audits/admin_member_overview_postflight.sql'))
  const verification = results.flatMap(result => result.rows).find(row => row.verification)?.verification
  assert.equal(verification?.result, 'PASS')
  assert.deepEqual(verification.metrics, await metrics())
  assert.deepEqual(Object.keys(verification).sort(), ['first_page_items', 'last_page_items', 'metrics', 'result', 'unverified'])
  assert.deepEqual(await snapshot(), before)
})

await db.close()
console.log(`PASS ${passed} isolated member overview checks`)
