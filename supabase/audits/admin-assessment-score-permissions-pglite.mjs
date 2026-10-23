// Isolated PostgreSQL ACL and current player-query projection regression.
// Never connects to a live database. PGLITE_MODULE may point to an existing install.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(root + path, 'utf8')
const migration = read('supabase/migrations/20261023080507_protect_admin_assessment_score_columns.sql')
const db = new PGlite()
let checks = 0
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++ }
const query = async (sql, args = []) => (await db.query(sql, args)).rows
const scalar = async (sql, args = []) => Object.values((await query(sql, args))[0])[0]
const denied = async sql => { await assert.rejects(() => db.query(sql), error => error.code === '42501'); checks++ }
const role = async (name, user = '') => {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user])
  await db.exec(`SET ROLE ${name}`)
}
const members = ['20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002']
const users = ['30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002']
const admin = '30000000-0000-4000-8000-000000000003'
const tables = ['members', 'interview_evaluations', 'match_results']
const protectedColumns = { members: ['attractiveness_score'], interview_evaluations: ['attractiveness_score'], match_results: ['score_breakdown', 'total_score'] }
// Use every current column from the generated database contract. This fixture
// models ACL/RLS behavior, not the independent tables' full business constraints.
const types = read('src/types/database.types.ts')
function columns(table) {
  const match = new RegExp(`      ${table}: \\{\\s+Row: \\{([\\s\\S]*?)\\n        \\}`).exec(types)
  assert.ok(match, `${table} Row contract exists`)
  return [...match[1].matchAll(/^          (\w+): (.+)$/gm)].map(([, name, type]) => {
    const sqlType = name === 'id' || name.endsWith('_id') || name === 'cancellation_requested_by' || name === 'cancellation_reviewed_by' || name === 'locked_by'
      ? 'uuid' : type.includes('string[]') ? 'text[]' : type.includes('number') ? 'numeric' : type.includes('boolean') ? 'boolean' : type.includes('Json') ? 'jsonb' : 'text'
    return { name, sqlType }
  })
}
await db.exec(`
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
`)
for (const table of tables) {
  await db.exec(`CREATE TABLE public.${table} (${columns(table).map(({ name, sqlType }) => `"${name}" ${sqlType}${name === 'id' ? ' PRIMARY KEY' : ''}`).join(',')})`)
}
await db.exec(`
  CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid() = '${admin}'::uuid $$;
  ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.interview_evaluations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.match_results ENABLE ROW LEVEL SECURITY;
  CREATE POLICY member_self ON public.members FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
  CREATE POLICY evaluation_self ON public.interview_evaluations FOR SELECT TO authenticated USING (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()) OR public.is_admin());
  CREATE POLICY match_self ON public.match_results FOR SELECT TO authenticated USING (member_a_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()) OR public.is_admin());
  CREATE POLICY match_admin_insert ON public.match_results FOR INSERT TO authenticated WITH CHECK (public.is_admin());
  CREATE POLICY match_admin_update ON public.match_results FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  GRANT SELECT ON public.members, public.interview_evaluations, public.match_results TO PUBLIC, anon, authenticated, service_role;
  GRANT INSERT, UPDATE ON public.match_results TO authenticated, service_role;
  -- Explicit legacy column grants must be removed along with table grants.
  GRANT SELECT(attractiveness_score) ON public.members, public.interview_evaluations TO PUBLIC, anon, authenticated;
  GRANT SELECT(score_breakdown, total_score) ON public.match_results TO PUBLIC, anon, authenticated;
  CREATE FUNCTION public.test_admin_assessment(p_member_id uuid) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
  BEGIN
    IF NOT COALESCE(public.is_admin(), false) THEN RAISE EXCEPTION 'admin required' USING ERRCODE = '42501'; END IF;
    RETURN (SELECT attractiveness_score FROM public.members WHERE id = p_member_id);
  END $$;
  REVOKE ALL ON FUNCTION public.test_admin_assessment(uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.test_admin_assessment(uuid) TO authenticated;
`)
for (let i = 0; i < 2; i++) {
  await db.query('INSERT INTO public.members(id,user_id,status,account_status,attractiveness_score) VALUES($1,$2,\'approved\',\'active\',$3)', [members[i], users[i], i + 3])
  await db.query('INSERT INTO public.interview_evaluations(id,member_id,articulation,communication,attractiveness_score) VALUES($1,$1,3,4,$2)', [members[i], i + 3])
  await db.query('INSERT INTO public.match_results(id,member_a_id,status,publication_version,total_score,score_breakdown) VALUES($1,$1,\'confirmed\',1,80,$2)', [members[i], { compatibility: { score: i + 3 } }])
}
const snapshot = async () => {
  const result = {}
  for (const table of tables) result[table] = await query(`SELECT to_jsonb(t) AS row FROM public.${table} t ORDER BY id`)
  return result
}
const policies = () => query("SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE tablename = ANY($1) ORDER BY tablename,policyname", [tables])
const beforeData = await snapshot(), beforePolicies = await policies()
await db.exec(migration)
check(await snapshot(), beforeData, 'permission migration never rewrites score or member data')
check(await policies(), beforePolicies, 'all existing row policies preserved')
await db.exec(migration)
check(await policies(), beforePolicies, 'migration can safely be reapplied')
for (const table of tables) {
  for (const name of ['anon', 'authenticated']) {
    check(await scalar('SELECT has_table_privilege($1,$2,\'SELECT\')', [name, 'public.' + table]), false, `${name}: no full ${table} access`)
    for (const column of columns(table)) {
      check(await scalar('SELECT has_column_privilege($1,$2,$3,\'SELECT\')', [name, 'public.' + table, column.name]), !protectedColumns[table].includes(column.name), `${name}: ${table}.${column.name}`)
    }
  }
}
await role('authenticated', users[0])
check(await scalar('SELECT count(id) FROM public.members'), 1, 'member self RLS remains effective')
check(await query('SELECT articulation, communication FROM public.interview_evaluations'), [{ articulation: '3', communication: '4' }], 'other evaluation dimensions stay available under self RLS')
for (const table of tables) {
  for (const column of protectedColumns[table]) {
    await denied(`SELECT ${column} FROM public.${table}`)
    await denied(`SELECT id FROM public.${table} WHERE ${column} IS NOT NULL`)
    await denied(`SELECT id FROM public.${table} ORDER BY ${column}`)
  }
  await denied(`SELECT * FROM public.${table}`)
  await denied(`SELECT to_jsonb(t) FROM public.${table} t`)
  await denied(`SELECT row_to_json(t) FROM public.${table} t`)
}
await denied(`SELECT public.test_admin_assessment('${members[0]}')`)
await denied(`INSERT INTO public.match_results(id,member_a_id,total_score) VALUES(gen_random_uuid(),'${members[0]}',99)`)
// Read the actual application projections instead of duplicating their fields.
function projection(path, functionName, table) {
  const source = read(path).split(`export async function ${functionName}(`)[1]
  assert.ok(source, functionName)
  const match = new RegExp(`\\.from\\("${table}"\\)\\s*\\.select\\(\\s*([\x60"'])([\\s\\S]*?)\\1`).exec(source)
  assert.ok(match, `${functionName}: literal ${table} projection`)
  const top = [], text = match[2]
  let depth = 0, part = ''
  for (const char of text + ',') {
    if (char === ',' && depth === 0) { if (part.trim() && !part.includes('(')) top.push(part.trim()); part = ''; continue }
    if (char === '(') depth++
    if (char === ')') depth--
    part += char
  }
  assert.ok(top.length > 0 && top.every(field => /^\w+$/.test(field)), `${functionName}: explicit safe top-level projection`)
  return top
}
for (const [path, fn, table] of [
  ['src/lib/member-master/rpc.ts', 'fetchCanonicalMemberSnapshot', 'members'],
  ['src/lib/queries/profile.ts', 'fetchPlayerProfile', 'members'],
  ['src/lib/profile/details-query.ts', 'fetchMyProfileDetails', 'members'],
  ['src/lib/queries/matching.ts', 'fetchPlayerMatches', 'match_results'],
  ['src/lib/queries/matching.ts', 'fetchMatchDetail', 'match_results'],
  ['src/lib/queries/player-history.ts', 'fetchPlayerMatchHistory', 'match_results'],
]) {
  const fields = projection(path, fn, table)
  check((await query(`SELECT ${fields.map(field => `"${field}"`).join(',')} FROM public.${table}`)).length, 1, `${fn} current top-level projection succeeds under member ACL/RLS`)
}
await role('anon')
for (const table of tables) {
  check(await scalar(`SELECT count(id) FROM public.${table}`), 0, `anonymous RLS unchanged for ${table}`)
  for (const column of protectedColumns[table]) await denied(`SELECT ${column} FROM public.${table}`)
}
await role('authenticated', admin)
for (const table of tables) for (const column of protectedColumns[table]) await denied(`SELECT ${column} FROM public.${table}`)
check(await scalar(`SELECT public.test_admin_assessment('${members[0]}')`), '3', 'guarded SECURITY DEFINER admin read survives column ACL')
const inserted = await scalar(`INSERT INTO public.match_results(id,member_a_id,total_score,score_breakdown) VALUES(gen_random_uuid(),'${members[0]}',90,'{}') RETURNING id`)
check(typeof inserted, 'string', 'admin existing result INSERT with safe RETURNING survives')
await db.query('UPDATE public.match_results SET total_score=91,score_breakdown=$1 WHERE id=$2', [{ compatibility: { score: 3 } }, inserted])
checks++
await role('service_role')
for (const table of tables) check((await query(`SELECT * FROM public.${table}`)).length, table === 'match_results' ? 3 : 2, `service matching/admin full ${table} read survives`)
await db.exec('RESET ROLE')
await db.exec('ALTER TABLE public.members ADD COLUMN future_internal_score numeric')
check(await scalar("SELECT has_column_privilege('authenticated','public.members','future_internal_score','SELECT')"), false, 'future columns require an explicit access decision')
await db.close()
console.log(`Assessment score permissions: ${checks} checks passed; isolated PGlite only. Current top-level member/player projections verified; relation schema and PostgREST HTTP behavior are outside this fixture.`)
