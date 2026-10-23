// Isolated PostgreSQL checks. This script never connects to a live database.
// PGLITE_MODULE may point to an installed @electric-sql/pglite entry point.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

process.on('uncaughtException', error => { console.error(error.message, error.code || '', error.where || ''); process.exit(1) })

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const root = process.env.COMPOSITE_SCORE_TEST_ROOT || fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(root + '/' + path, 'utf8')
const migrationName = readdirSync(root + '/supabase/migrations').find(name => name.endsWith('_member_composite_scores.sql'))
assert.ok(migrationName, 'Missing composite score migration')
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


await db.exec(read('supabase/migrations/012_eval_attractiveness.sql'))
await db.exec(extractFunction(read('supabase/migrations/029_lock_function_search_paths.sql'), 'public.sync_attractiveness_score'))
await db.exec(`ALTER TABLE public.interview_evaluations ADD COLUMN interviewer_name text;
  ALTER TABLE public.interview_evaluations ADD CONSTRAINT fixture_eval_unique UNIQUE(member_id,interviewer_id);
  CREATE TRIGGER on_eval_upsert_sync_score AFTER INSERT OR UPDATE ON public.interview_evaluations
    FOR EACH ROW EXECUTE FUNCTION public.sync_attractiveness_score();`)

const uid = n => `10000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const mid = n => `20000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const aid = n => `30000000-0000-0000-0000-${String(n).padStart(12,'0')}`
for (const n of [1,2,3,4,5,900,901]) {
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[uid(n),`fixture${n}@example.invalid`])
}
for (const n of [900,901]) await db.query('INSERT INTO public.admin_users(id,user_id,email,name) VALUES($1,$2,$3,$4)',[aid(n),uid(n),`fixture${n}@example.invalid`,`Admin ${n}`])
for (const n of [1,2,3,4,5]) await db.query(`INSERT INTO public.members(id,user_id,email,status,profile_stage,record_source,record_scope)
  VALUES($1,$2,$3,'pending','draft','admin','current')`,[mid(n),uid(n),`fixture${n}@example.invalid`])
await db.query("UPDATE public.members SET attractiveness_score=4,interview_date='2020-01-02',interviewer='Historical interviewer' WHERE id=$1",[mid(2)])
await db.query("UPDATE public.members SET attractiveness_score=2, account_status='closed',anonymized_at=now() WHERE id=$1",[mid(3)])
await db.exec(migration)

async function asUser(n, callback, role='authenticated') {
  await db.exec('BEGIN')
  try {
    await db.exec('SET LOCAL ROLE '+role)
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)",[n?uid(n):'',role])
    const result=await callback()
    await db.exec('COMMIT')
    return result
  } catch(error) {await db.exec('ROLLBACK');throw error}
}
const readScore=async(n,actor=900)=>(await asUser(actor,()=>db.query('SELECT public.admin_get_member_composite_scores($1) AS value',[mid(n)]))).rows[0].value
const fields=['attractiveness_score','sexual_value_score','economic_value_score','emotional_value_score']
const scores=(a=3,b=3,c=3,d=3)=>Object.fromEntries(fields.map((k,i)=>[k,[a,b,c,d][i]]))
const save=async(n,payload,version=null,actor=900,reason='核对面试评分')=>(await asUser(actor,()=>db.query('SELECT public.admin_update_member_composite_scores($1,$2::jsonb,$3,$4::timestamptz) AS value',[mid(n),JSON.stringify(payload),reason,version]))).rows[0].value
const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0]
let passed=0
async function check(name,run){await run();passed++;console.log('PASS '+name)}
const rejects=(run,pattern)=>assert.rejects(run,e=>{assert.match(e.message,pattern);return true})

await check('existing A preserved; B/C/D remain NULL; no closed-account backfill',async()=>{
  const value=await readScore(2)
  assert.equal(value.attractiveness_score,4)
  for(const f of fields.slice(1))assert.equal(value[f],null)
  assert.equal((await one('SELECT count(*)::int n FROM private.member_composite_scores')).n,1)
})
await check('reading an unrated member does not persist UI defaults',async()=>{
  const value=await readScore(1)
  for(const f of fields)assert.equal(value[f],null)
  assert.equal(value.updated_at,null)
  assert.equal((await one('SELECT count(*)::int n FROM private.member_composite_scores')).n,1)
})
await check('ordinary member cannot read or save scores through public RPC',async()=>{
  await rejects(()=>readScore(1,1),/ADMIN_REQUIRED/)
  await rejects(()=>save(1,scores(),null,1),/ADMIN_REQUIRED/)
})
await check('anonymous and service roles cannot call public score RPCs',async()=>{
  for(const role of ['anon','service_role'])await rejects(()=>asUser(null,()=>db.query('SELECT public.admin_get_member_composite_scores($1)',[mid(1)]),role),/permission denied/)
})
await check('private storage and private helper are not directly readable by browser roles',async()=>{
  for(const role of ['anon','authenticated','service_role']) await rejects(()=>asUser(1,()=>db.query('SELECT * FROM private.member_composite_scores'),role),/permission denied/)
  await rejects(()=>asUser(900,()=>db.query('SELECT * FROM private.member_composite_score_audit')),/permission denied/)
})
await check('first explicit save persists four scores, mirrors A and creates exactly one audit',async()=>{
  const before=await one('SELECT interview_date,interviewer FROM public.members WHERE id=$1',[mid(1)])
  const saved=await save(1,scores(5,4,2,1))
  assert.equal(saved.attractiveness_score,5)
  assert.ok(saved.updated_at)
  assert.equal((await one('SELECT attractiveness_score s FROM public.members WHERE id=$1',[mid(1)])).s,5)
  assert.deepEqual(await one('SELECT interview_date,interviewer FROM public.members WHERE id=$1',[mid(1)]),before)
  assert.equal((await one('SELECT count(*)::int n FROM public.interview_evaluations')).n,0)
  assert.equal((await one('SELECT count(*)::int n FROM private.member_composite_score_audit')).n,1)
  assert.deepEqual(await readScore(1,901),saved)
})
await check('a second first-save and stale update fail instead of overwriting another admin',async()=>{
  await rejects(()=>save(1,scores(),null,901),/VERSION_CONFLICT/)
  const first=await readScore(1)
  await save(1,scores(5,3,2,1),first.updated_at,901)
  await rejects(()=>save(1,scores(2,2,2,2),first.updated_at),/VERSION_CONFLICT/)
})
await check('B/C/D-only changes do not modify the member A mirror or interview metadata',async()=>{
  const before=await one('SELECT * FROM public.members WHERE id=$1',[mid(2)])
  const v=await readScore(2)
  await save(2,scores(4,1,2,5),v.updated_at)
  assert.deepEqual(await one('SELECT * FROM public.members WHERE id=$1',[mid(2)]),before)
})
await check('no-op saves preserve score version and audit count',async()=>{
  const v=await readScore(2)
  const n=(await one('SELECT count(*)::int n FROM private.member_composite_score_audit')).n
  assert.deepEqual(await save(2,scores(4,1,2,5),v.updated_at),v)
  assert.equal((await one('SELECT count(*)::int n FROM private.member_composite_score_audit')).n,n)
})
await check('invalid ranges, fractions, strings, null, missing and extra keys fail atomically',async()=>{
  const invalid=[scores(0),scores(6),scores(1.5),scores('3'),scores(null),{attractiveness_score:3},{...scores(),nickname:'forbidden'}]
  const v=await readScore(2)
  for(const x of invalid)await rejects(()=>save(2,x,v.updated_at),/PAYLOAD_INVALID/)
  assert.deepEqual(await readScore(2),v)
})
await check('empty and whitespace-only reasons fail',async()=>{
  for(const reason of ['', '   ', '\n\n\n\n','　　\t\n'])await rejects(()=>save(4,scores(),null,900,reason),/REASON_REQUIRED/)
})
await check('closed and missing members cannot be read or scored',async()=>{
  await rejects(()=>readScore(3),/MEMBER_UNAVAILABLE/)
  await rejects(()=>save(3,scores()),/MEMBER_UNAVAILABLE/)
  await rejects(()=>readScore(99),/MEMBER_UNAVAILABLE/)
})
await check('legacy A entry point is blocked, unrelated section writes still delegate',async()=>{
  await rejects(()=>db.query("SELECT private.member_master_apply_admin_section($1,'application',$2::jsonb,$3)",[mid(1),JSON.stringify({attractiveness_score:1}),aid(900)]),/USE_SHARED_EDITOR/)
  await db.query("SELECT private.member_master_apply_admin_section($1,'application',$2::jsonb,$3)",[mid(1),JSON.stringify({interview_date:'2020-02-03'}),aid(900)])
  assert.equal((await one('SELECT interview_date::text d FROM public.members WHERE id=$1',[mid(1)])).d,'2020-02-03')
})
await check('saving real interviewer evaluation cannot overwrite shared A',async()=>{
  const dimensions=['communication','articulation','enthusiasm','sincerity','social_comfort','humor','emotional_stability','boundary_respect','team_orientation','interest_alignment','japanese_ability','time_commitment','leadership_potential','openness','responsibility','first_impression','overall_recommendation']
  await db.query("SELECT private.member_master_apply_admin_section($1,'interview_evaluation',$2::jsonb,$3)",[mid(1),JSON.stringify(Object.fromEntries(dimensions.map(k=>[k,3]))),aid(900)])
  assert.equal((await one('SELECT attractiveness_score s FROM public.members WHERE id=$1',[mid(1)])).s,5)
  assert.equal((await one('SELECT attractiveness_score s FROM public.interview_evaluations WHERE member_id=$1',[mid(1)])).s,null)
  await db.query("UPDATE public.interview_evaluations SET attractiveness_score=1 WHERE member_id=$1",[mid(1)])
  assert.equal((await one('SELECT attractiveness_score s FROM public.members WHERE id=$1',[mid(1)])).s,5)
})
await check('future anonymization erases shared scores and score history',async()=>{
  await save(5,scores(1,2,3,4))
  await db.query("UPDATE public.members SET account_status='closed',anonymized_at=now() WHERE id=$1",[mid(5)])
  assert.equal((await one('SELECT attractiveness_score s FROM public.members WHERE id=$1',[mid(5)])).s,null)
  assert.equal((await one('SELECT count(*)::int n FROM private.member_composite_scores WHERE member_id=$1',[mid(5)])).n,0)
  assert.equal((await one('SELECT count(*)::int n FROM private.member_composite_score_audit WHERE member_id=$1',[mid(5)])).n,0)
  await rejects(()=>save(5,scores()),/MEMBER_UNAVAILABLE/)
})
await db.close()
console.log(`PASS ${passed} composite-score PostgreSQL checks`)
