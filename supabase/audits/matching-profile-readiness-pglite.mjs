// Matching profile gate: isolated PostgreSQL authorization, completion and trigger verification. This script never contacts a live database.
// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite module.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
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
const root = process.env.MATCHING_READINESS_TEST_ROOT || fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(root + '/' + path, 'utf8')
const migrationPath = 'supabase/migrations/' + readdirSync(root + '/supabase/migrations').find(name => name.endsWith('_questionnaire_templates_versions.sql'))
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
  CREATE TABLE public.match_rounds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), purpose text NOT NULL DEFAULT 'matching');
  CREATE TABLE public.match_round_submissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), round_id uuid NOT NULL REFERENCES public.match_rounds(id), member_id uuid NOT NULL REFERENCES public.members(id), game_type_pref text NOT NULL DEFAULT '都可以', gender_pref text NOT NULL DEFAULT '都可以', availability jsonb NOT NULL DEFAULT '{}', interest_tags text[] DEFAULT '{}', social_style text, message text, import_metadata jsonb, custom_answers jsonb, cancelled_at timestamptz, config_revision integer, audit_reason text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), UNIQUE(round_id,member_id));
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

await bootstrap(read('supabase/migrations/20261006150631_preinterview_birth_date.sql'))
// Load the real pure TypeScript default builders without a server or network.
const require = createRequire(import.meta.url)
const ts = require('typescript')
const modules = new Map()
function loadTs(path) {
  if (!existsSync(path)) path += '.ts'
  if (statSync(path).isDirectory()) path = resolve(path,'index.ts')
  if (path.endsWith('.json')) return JSON.parse(readFileSync(path,'utf8'))
  if (modules.has(path)) return modules.get(path).exports
  const loadedModule = { exports: {} }; modules.set(path,loadedModule)
  const localRequire = spec => spec.startsWith('@/') ? loadTs(resolve(root,'src',spec.slice(2)))
    : spec.startsWith('.') ? loadTs(resolve(dirname(path),spec)) : require(spec)
  const code = ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText
  new Function('require','module','exports',code)(localRequire,loadedModule,loadedModule.exports)
  return loadedModule.exports
}
const {buildDefaultTemplate} = loadTs(root+'/src/lib/questionnaires/defaults.ts')
const defaults = Object.fromEntries(['interview','supplementary','personality','quiz'].map(kind=>[kind,buildDefaultTemplate(kind)]))

const clone = value => structuredClone(value)
const authRpc = (n, sql, args=[]) => asUser(n, async () => (await db.query(sql,args)).rows[0]?.result)
const get = (n,kind) => authRpc(n,'SELECT public.get_my_questionnaire($1) AS result',[kind])
const initialize = (n,kind,template=defaults[kind]) => authRpc(n,'SELECT public.initialize_questionnaire_template($1,$2) AS result',[kind,template])
const adminList = n => authRpc(n,'SELECT public.get_admin_questionnaires() AS result')
const draft = (n,kind,revision,template) => authRpc(n,'SELECT public.save_questionnaire_draft($1,$2,$3) AS result',[kind,revision,template])
const publish = (n,kind,revision) => authRpc(n,'SELECT public.publish_questionnaire_draft($1,$2) AS result',[kind,revision])
const saveSnapshot = (n,runtime,answers,options={}) => authRpc(n,'SELECT public.save_my_questionnaire($1,$2,$3,$4::smallint,$5,$6) AS result',[runtime.kind,options.versionId??runtime.versionId,answers,options.step??null,options.complete??true,options.revision??runtime.revision])
const retake = n => authRpc(n,"SELECT public.start_my_questionnaire_retake('quiz') AS result")
const custom = (id,patch={}) => ({id,sectionId:'location',type:'single',label:{zh:'额外问题',ja:'追加の質問'},required:true,active:true,locked:false,options:[{id:'yes',value:'yes',label:{zh:'是',ja:'はい'}},{id:'no',value:'no',label:{zh:'否',ja:'いいえ'}}],...patch})
const scalar = async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.value

await db.exec('GRANT EXECUTE ON FUNCTION private.member_master_is_admin() TO authenticated;')
await db.exec(read('supabase/migrations/034_personality_quiz_config.sql'))
await db.exec(migration)
// Apply the independent profile-refresh migration when testing an integrated checkout.
const profileRefresh = process.env.MATCHING_PROFILE_REFRESH_SQL || 'supabase/migrations/20261022161420_questionnaire_profile_snapshot_refresh.sql'
const hasProfileRefresh = existsSync(resolve(root, profileRefresh))
if (hasProfileRefresh) await db.exec(readFileSync(resolve(root,profileRefresh),'utf8'))
await db.exec(extractFunction(read('supabase/migrations/20260831234821_fix_member_readonly_authorization_lock.sql'), 'private.profile_current_approved_member_id'))
await db.exec(read('supabase/migrations/20260907203032_reject_blank_personality_completion.sql'))
await db.exec(extractFunction(read('supabase/migrations/20260907194820_player_profile_consistency.sql'), 'public.save_my_supplementary'))
await db.exec('GRANT EXECUTE ON FUNCTION public.get_my_profile_summary() TO authenticated;')
await db.exec(extractTable(read('supabase/migrations/006_maintenance.sql'), 'public.member_dynamic_stats'))
await db.exec(`
  ALTER TABLE public.match_round_submissions ENABLE ROW LEVEL SECURITY;
  CREATE POLICY own_or_admin ON public.match_round_submissions FOR ALL TO authenticated USING (
    member_id IN (SELECT id FROM public.members WHERE user_id=auth.uid()) OR private.member_master_is_admin()
  ) WITH CHECK (member_id IN (SELECT id FROM public.members WHERE user_id=auth.uid()) OR private.member_master_is_admin());
  GRANT SELECT,INSERT,UPDATE,DELETE ON public.match_round_submissions TO authenticated,service_role;
  GRANT SELECT ON public.match_rounds TO authenticated,service_role;
`)
const gateMigration = 'supabase/migrations/' + readdirSync(root + '/supabase/migrations').find(name => name.endsWith('_matching_profile_readiness.sql'))
await db.exec(read(gateMigration))
const readiness = n => authRpc(n,'SELECT public.get_my_matching_readiness() AS result')
const adminReadiness = n => authRpc(900,'SELECT public.get_member_matching_readiness($1) AS result',[member(n)])
const summary = n => authRpc(n,'SELECT public.get_my_profile_summary() AS result')
const matching = uuid(4,1), registration = uuid(4,2), announcement = uuid(4,3)
await db.query("INSERT INTO public.match_rounds(id,purpose) VALUES($1,'matching'),($2,'registration'),($3,'announcement')",[matching,registration,announcement])
for(let n=1;n<=25;n++) await fixture(n,{status:'approved',stage:'complete',step:4})
await fixture(26)
await db.query("INSERT INTO auth.users(id,email) VALUES($1,'ordinary-admin@fixture.local')",[user(901)])
await db.query("INSERT INTO public.admin_users(user_id,email,name,role) VALUES($1,'ordinary-admin@fixture.local','Ordinary admin','admin')",[user(901)])
const allMissing = {supplementary:false,personality:false,quiz:false,missing:['supplementary','personality','quiz']}
const allReady = {supplementary:true,personality:true,quiz:true,missing:[]}
const fill = template => Object.fromEntries(template.questions.filter(q=>q.active&&q.required).map(q=>[q.id,q.type==='rating'?4:q.type==='multi'?[q.options[0].value]:q.type==='single'?(q.dimension?Number(q.options[0].value):q.options[0].value):'fixture']))
const completeKind = async(n,kind,answers) => { const current=await get(n,kind); return saveSnapshot(n,current,answers??fill(current.template)) }
const insert = (actor,n,round=matching,extra={},role='authenticated') => asUser(actor,()=>db.query('INSERT INTO public.match_round_submissions(round_id,member_id,message,import_metadata) VALUES($1,$2,$3,$4) RETURNING id',[round,member(n),extra.message??null,extra.import_metadata??null]),role)
const update = (actor,n,patch,role='authenticated') => asUser(actor,()=>db.query('UPDATE public.match_round_submissions SET message=$1 WHERE round_id=$2 AND member_id=$3',[patch,matching,member(n)]),role)

await check('RPC is scoped; anon/non-player/non-admin cannot inspect readiness',async()=>{
  assert.deepEqual(await readiness(1),allMissing)
  await reject(()=>asUser(null,()=>db.query('SELECT public.get_my_matching_readiness()'),'anon'),'permission denied')
  await reject(()=>readiness(26),'MATCHING_PLAYER_REQUIRED')
  await reject(()=>authRpc(1,'SELECT public.get_member_matching_readiness($1) AS result',[member(2)]),'MATCHING_ADMIN_REQUIRED')
  assert.deepEqual(await adminReadiness(2),allMissing)
  await reject(()=>authRpc(1,'SELECT private.member_matching_readiness($1) AS result',[member(2)]),'permission denied')
})
await check('Uninitialized templates do not create sessions or count empty legacy defaults',async()=>{
  await db.query('INSERT INTO public.member_interests(member_id) VALUES($1)',[member(1)])
  await db.query('INSERT INTO public.member_language(member_id) VALUES($1)',[member(1)])
  await db.query('INSERT INTO public.member_personality(member_id) VALUES($1)',[member(1)])
  assert.deepEqual(await readiness(1),allMissing)
  assert.equal(await scalar('SELECT count(*)::int AS value FROM public.questionnaire_assignments'),0)
})
await check('Complete legacy answers work before initialization; score-only quiz does not',async()=>{
  const personality=fill(defaults.personality)
  await db.query(`INSERT INTO public.member_personality(member_id,extroversion,initiative,emotional_stability,expression_style_tags,group_role_tags,warmup_speed,planning_style,coop_compete_tendency,boundary_strength,reply_speed) VALUES($1,4,4,4,$2,$3,$4,$5,$6,$7,$8)`,[member(2),personality.expression_style_tags,personality.group_role_tags,personality.warmup_speed,personality.planning_style,personality.coop_compete_tendency,personality.boundary_strength,personality.reply_speed])
  await db.query("INSERT INTO public.member_interests(member_id,activity_area) VALUES($1,'池袋')",[member(2)])
  await db.query("INSERT INTO public.personality_quiz_results(member_id,answers,score_e) VALUES($1,'[]',50)",[member(2)])
  assert.deepEqual(await readiness(2),{supplementary:true,personality:true,quiz:false,missing:['quiz']})
  const answers=defaults.quiz.questions.map(q=>({questionId:Number(q.id.slice(5)),score:Number(q.options[0].value)}))
  await db.query('UPDATE public.personality_quiz_results SET answers=$1 WHERE member_id=$2',[JSON.stringify(answers),member(2)])
  assert.deepEqual(await readiness(2),allReady)
})
await check('Uninitialized templates accept an explicit empty legacy supplementary submission',async()=>{
  const empty=Object.fromEntries(defaults.supplementary.questions.map(q=>[q.id,q.type==='multi'?[]:['accept_beginners','accept_cross_school','graduation_year'].includes(q.id)?null:'']))
  assert.equal((await readiness(8)).supplementary,false)
  await authRpc(8,'SELECT public.save_my_supplementary($1) AS result',[empty])
  assert.equal((await readiness(8)).supplementary,true)
  await reject(()=>asUser(8,()=>db.query('INSERT INTO private.matching_legacy_supplementary_completions(member_id) VALUES($1)',[member(9)])),'permission denied')
})
await check('Uninitialized quiz validates against configured legacy questions, not hard-coded defaults',async()=>{
  const config=clone(defaults.quiz.quizConfig)
  config.questions[0].id=200; config.questions[0].options[0].score=7
  await db.query('INSERT INTO public.personality_quiz_config(questions,dimensions,type_labels,type_descriptions,scoring) VALUES($1,$2,$3,$4,$5)',[JSON.stringify(config.questions),config.dimensions,config.typeLabels,config.typeDescriptions,config.scoring])
  const answers=config.questions.map(q=>({questionId:q.id,score:q.options[0].score}))
  await db.query('INSERT INTO public.personality_quiz_results(member_id,answers) VALUES($1,$2)',[member(10),JSON.stringify(answers)])
  assert.equal((await readiness(10)).quiz,true)
  await db.exec('DELETE FROM public.personality_quiz_config')
})
for(const kind of ['supplementary','personality','quiz']) await initialize(900,kind)
await check('Explicit empty legacy completion remains valid when imported into versioned forms',async()=>{
  await get(8,'supplementary')
  assert.equal((await readiness(8)).supplementary,true)
})
await check('Imported partial personality is not complete despite runtime.completed',async()=>{
  await db.query("INSERT INTO public.member_personality(member_id,warmup_speed) VALUES($1,'快速熟络')",[member(3)])
  const runtime=await get(3,'personality')
  assert.equal(runtime.completed,true)
  assert.equal((await readiness(3)).personality,false)
  await db.query("UPDATE public.member_personality SET warmup_speed='invalid' WHERE member_id=$1",[member(2)])
  // Member 2 is still unassigned: malformed required legacy values fail closed.
  assert.equal((await readiness(2)).personality,false)
})
await check('Empty/optional-only questionnaire needs explicit submission; explicit empty is valid',async()=>{
  const runtime=await get(4,'supplementary')
  assert.equal(runtime.completed,false)
  assert.equal((await readiness(4)).supplementary,false)
  await saveSnapshot(4,runtime,{}, {complete:false})
  assert.equal((await readiness(4)).supplementary,false)
  await completeKind(4,'supplementary',{})
  assert.equal((await readiness(4)).supplementary,true)
  // Existing empty legacy language row must also be explicitly submitted.
  const legacy=await get(1,'supplementary')
  assert.equal(legacy.completed,true)
  assert.equal((await readiness(1)).supplementary,false)
  await saveSnapshot(1,legacy,{}, {complete:true})
  assert.equal((await readiness(1)).supplementary,true)
  assert.equal(await scalar("SELECT legacy_imported AS value FROM public.questionnaire_responses WHERE member_id=$1 AND kind='supplementary'",[member(1)]),false)
})
await check('Personality missing/invalid required answers cannot complete; valid answers pass',async()=>{
  const current=await get(4,'personality')
  await reject(()=>saveSnapshot(4,current,{}),'QUESTIONNAIRE_REQUIRED')
  await reject(()=>saveSnapshot(4,current,{...fill(current.template),warmup_speed:'invalid'}),'QUESTIONNAIRE_OPTION_INVALID')
  await completeKind(4,'personality')
  assert.equal((await readiness(4)).personality,true)
})
await check('Quiz all required answers complete; failed retake leaves prior valid eligibility',async()=>{
  const current=await get(4,'quiz')
  await reject(()=>saveSnapshot(4,current,{}),'QUESTIONNAIRE_REQUIRED')
  await completeKind(4,'quiz')
  assert.deepEqual(await readiness(4),allReady)
  const next=await retake(4)
  assert.equal(next.completed,false)
  assert.equal((await readiness(4)).quiz,true)
  await saveSnapshot(4,next,{}, {complete:false})
  assert.equal((await readiness(4)).quiz,true)
})
await check('Profile summary uses the same three flags and preserves other profile fields',async()=>{
  const result=await summary(4)
  assert.equal(result.supplementary_complete,true)
  assert.equal(result.personality_complete,true)
  assert.equal(result.quiz_complete,true)
  for(const field of ['member_id','member_number','identity_complete','level','activity_count','community_profile_id']) assert.ok(field in result)
})
await check('Publishing new required questions does not invalidate old bound completed versions',async()=>{
  const initial=(await adminList(900)).find(x=>x.kind==='supplementary')
  const template=clone(initial.draft)
  template.questions.push(custom('required_extra'))
  const edited=await draft(900,'supplementary',initial.revision,template)
  await publish(900,'supplementary',edited.revision)
  assert.equal((await readiness(4)).supplementary,true)
  const newer=await get(5,'supplementary')
  assert.equal(newer.template.questions.some(q=>q.id==='required_extra'),true)
  await reject(()=>saveSnapshot(5,newer,{}),'QUESTIONNAIRE_REQUIRED')
  await saveSnapshot(5,newer,{required_extra:'yes'})
  assert.equal((await readiness(5)).supplementary,true)
})
await check('Disabled required fields no longer block the bound version or summary',async()=>{
  const initial=(await adminList(900)).find(x=>x.kind==='personality')
  const template=clone(initial.draft)
  template.questions.find(q=>q.id==='warmup_speed').active=false
  const edited=await draft(900,'personality',initial.revision,template)
  await publish(900,'personality',edited.revision)
  await completeKind(11,'personality')
  assert.equal((await readiness(11)).personality,true)
  assert.equal((await summary(11)).personality_complete,true)
})
await check('Incomplete imported quiz is rejected and callers cannot forge completion records',async()=>{
  await db.query("INSERT INTO public.personality_quiz_results(member_id,answers) VALUES($1,'[]')",[member(12)])
  assert.equal((await get(12,'quiz')).completed,true)
  assert.equal((await readiness(12)).quiz,false)
  await reject(()=>asUser(12,()=>db.query("UPDATE public.questionnaire_responses SET completed_at=now(),legacy_imported=false WHERE member_id=$1",[member(12)])),'permission denied')
})
await check('User and both administrator roles cannot insert matching submissions while incomplete',async()=>{
  await reject(()=>insert(6,6),'MATCHING_PROFILE_INCOMPLETE')
  await reject(()=>insert(900,6),'MATCHING_PROFILE_INCOMPLETE')
  await reject(()=>insert(901,6),'MATCHING_PROFILE_INCOMPLETE')
})
await check('Caller-controlled import metadata/JWT claims/GUCs cannot bypass enforcement',async()=>{
  await reject(()=>asUser(6,async()=>{
    await db.query("SELECT set_config('request.jwt.claim.role','service_role',true),set_config('app.matching_readiness_bypass','on',true),set_config('app.member_master_submission_self_service','off',true)")
    await db.query("INSERT INTO public.match_round_submissions(round_id,member_id,import_metadata) VALUES($1,$2,'{\"source\":\"legacy-temp\"}')",[matching,member(6)])
  }),'MATCHING_PROFILE_INCOMPLETE')
  await db.query("INSERT INTO public.members(id,status,profile_stage,record_source) VALUES($1,'approved','complete','import')",[member(31)])
  await reject(()=>insert(900,31,matching,{import_metadata:{source:'legacy-temp'}}),'MATCHING_PROFILE_INCOMPLETE')
})
await check('Real service-role historical import and compensation remain allowed',async()=>{
  await insert(null,6,matching,{message:'historical'},'service_role')
  await update(null,6,'compensated historical','service_role')
  await reject(()=>update(6,6,'user rewrite'),'MATCHING_PROFILE_INCOMPLETE')
  await reject(()=>update(900,6,'admin rewrite'),'MATCHING_PROFILE_INCOMPLETE')
})
await check('Matching signup passes after completing three forms',async()=>{
  await insert(4,4)
  await update(4,4,'updated')
  assert.equal(await scalar('SELECT count(*)::int AS value FROM public.match_round_submissions WHERE round_id=$1 AND member_id=$2',[matching,member(4)]),1)
})
await check('Cancellation/delete and non-matching registrations are unaffected',async()=>{
  await asUser(6,()=>db.query('UPDATE public.match_round_submissions SET cancelled_at=now() WHERE member_id=$1',[member(6)]))
  await reject(()=>asUser(6,()=>db.query('UPDATE public.match_round_submissions SET cancelled_at=NULL WHERE member_id=$1',[member(6)])),'MATCHING_PROFILE_INCOMPLETE')
  await asUser(6,()=>db.query('DELETE FROM public.match_round_submissions WHERE member_id=$1',[member(6)]))
  await insert(6,6,registration)
  await insert(6,6,announcement)
})
await check('Anonymous callers cannot bypass trigger through direct writes',async()=>{
  await reject(()=>insert(null,7,matching,{},'anon'),'permission denied')
})
await check('Existing anonymization removes the legacy receipt without blocking matching answer cleanup',async()=>{
  assert.equal(await scalar('SELECT count(*)::int AS value FROM private.matching_legacy_supplementary_completions WHERE member_id=$1',[member(8)]),1)
  await db.query('UPDATE public.members SET anonymized_at=now() WHERE id=$1',[member(8)])
  assert.equal(await scalar('SELECT count(*)::int AS value FROM private.matching_legacy_supplementary_completions WHERE member_id=$1',[member(8)]),0)
})
const editSection = (n,section,payload) => authRpc(900,'SELECT public.admin_update_member_section($1,$2,$3,$4,NULL) AS result',[member(n),section,payload,'Matching readiness fixture'])
const snapshots = n => scalar('SELECT jsonb_agg(to_jsonb(r) ORDER BY r.kind,r.created_at,r.id) AS value FROM public.questionnaire_responses r WHERE member_id=$1',[member(n)])
const effective = (n,kind,template,answers) => scalar('SELECT private.matching_current_profile_answers($1,$2,$3,$4) AS value',[member(n),kind,template,answers])
let canonicalRuntime
await check('Admin canonical changes affect readiness and signup immediately without opening forms',async()=>{
  const initial=(await adminList(900)).find(x=>x.kind==='supplementary')
  const template=clone(initial.draft)
  template.questions.find(q=>q.id==='activity_area').required=true
  template.questions.push(custom('optional_extra',{required:false}))
  const edited=await draft(900,'supplementary',initial.revision,template)
  await publish(900,'supplementary',edited.revision)
  const current=await get(19,'supplementary')
  canonicalRuntime=await saveSnapshot(19,current,{...fill(current.template),nearest_station:'Old station',optional_extra:'yes',accept_beginners:false})
  await completeKind(19,'personality'); await completeKind(19,'quiz')
  assert.deepEqual(await readiness(19),allReady)
  const before=await snapshots(19)
  await editSection(19,'interests',{activity_area:null,nearest_station:'New station',accept_beginners:true})
  assert.deepEqual(await readiness(19),{supplementary:false,personality:true,quiz:true,missing:['supplementary']})
  assert.equal((await summary(19)).supplementary_complete,false)
  await reject(()=>insert(19,19),'MATCHING_PROFILE_INCOMPLETE')
  assert.deepEqual(await snapshots(19),before)
  await editSection(19,'interests',{activity_area:canonicalRuntime.answers.activity_area})
  assert.deepEqual(await readiness(19),allReady)
  await insert(19,19)
  const personalityBefore=await snapshots(4)
  const warmup=await scalar('SELECT warmup_speed AS value FROM public.member_personality WHERE member_id=$1',[member(4)])
  await editSection(4,'personality',{warmup_speed:null})
  assert.deepEqual(await readiness(4),{supplementary:true,personality:false,quiz:true,missing:['personality']})
  const profile=await summary(4)
  assert.deepEqual([profile.supplementary_complete,profile.personality_complete,profile.quiz_complete],[true,false,true])
  await reject(()=>update(4,4,'blocked after admin correction'),'MATCHING_PROFILE_INCOMPLETE')
  assert.deepEqual(await snapshots(4),personalityBefore)
  await editSection(4,'personality',{warmup_speed:warmup})
  assert.deepEqual(await readiness(4),allReady)
})
await check('Read-only merge preserves bound versions, custom/inactive answers and matches form refresh',async()=>{
  const initial=(await adminList(900)).find(x=>x.kind==='supplementary')
  const newer=clone(initial.draft); newer.questions.push(custom('future_required'))
  const edited=await draft(900,'supplementary',initial.revision,newer)
  await publish(900,'supplementary',edited.revision)
  const before=await snapshots(19)
  assert.deepEqual(await readiness(19),allReady)
  const merged=await effective(19,'supplementary',canonicalRuntime.template,canonicalRuntime.answers)
  assert.equal(merged.activity_area,canonicalRuntime.answers.activity_area)
  assert.equal(merged.nearest_station,'New station')
  assert.equal(merged.optional_extra,'yes'); assert.equal(merged.required_extra,'yes')
  assert.equal(merged.accept_beginners,true)
  assert.equal('future_required' in merged,false)
  const inactive=clone(canonicalRuntime.template)
  inactive.questions.find(q=>q.id==='nearest_station').active=false
  assert.equal((await effective(19,'supplementary',inactive,canonicalRuntime.answers)).nearest_station,'Old station')
  assert.deepEqual(await snapshots(19),before)
  if(hasProfileRefresh){
    const refreshed=await get(19,'supplementary')
    assert.deepEqual(refreshed.answers,merged)
    assert.equal(refreshed.versionId,canonicalRuntime.versionId)
  }
  await reject(()=>authRpc(19,'SELECT private.matching_current_profile_answers($1,$2,$3,$4) AS result',[member(19),'supplementary',canonicalRuntime.template,canonicalRuntime.answers]),'permission denied')
})
await check('Canonical defaults stay unconfirmed unless that field was already answered',async()=>{
  const initial=(await adminList(900)).find(x=>x.kind==='personality')
  const optional=clone(initial.draft); optional.questions.find(q=>q.id==='extroversion').required=false
  const edited=await draft(900,'personality',initial.revision,optional)
  await publish(900,'personality',edited.revision)
  const current=await get(22,'personality')
  const completed=await saveSnapshot(22,current,fill(current.template))
  const before=await snapshots(22)
  assert.equal((await effective(22,'personality',completed.template,completed.answers)).extroversion,undefined)
  assert.equal((await readiness(22)).personality,true)
  assert.deepEqual(await snapshots(22),before)
  const explicit=await saveSnapshot(22,completed,{extroversion:3})
  await editSection(22,'personality',{extroversion:4})
  const merged=await effective(22,'personality',explicit.template,explicit.answers)
  assert.equal(merged.extroversion,4)
  if(hasProfileRefresh) assert.deepEqual((await get(22,'personality')).answers,merged)
  await editSection(19,'interests',{accept_beginners:null})
  const stored=await get(19,'supplementary')
  await editSection(19,'interests',{accept_beginners:true})
  const booleanMerged=await effective(19,'supplementary',stored.template,stored.answers)
  assert.equal(booleanMerged.accept_beginners,true)
  if(hasProfileRefresh) assert.deepEqual((await get(19,'supplementary')).answers,booleanMerged)
})
await check('Canonical quiz corrections affect unbound legacy rows but never rewrite completed retake history',async()=>{
  const legacy=await scalar('SELECT answers AS value FROM public.personality_quiz_results WHERE member_id=$1',[member(2)])
  assert.equal(await scalar("SELECT count(*)::int AS value FROM public.questionnaire_assignments WHERE member_id=$1 AND kind='quiz'",[member(2)]),0)
  await editSection(2,'quiz',{answers:[]})
  assert.equal((await readiness(2)).quiz,false)
  await editSection(2,'quiz',{answers:legacy})
  assert.equal((await readiness(2)).quiz,true)
  const before=await snapshots(4)
  const current=await scalar('SELECT answers AS value FROM public.personality_quiz_results WHERE member_id=$1',[member(4)])
  await editSection(4,'quiz',{answers:[],score_e:1})
  assert.equal((await readiness(4)).quiz,true)
  assert.deepEqual(await snapshots(4),before)
  assert.equal((await get(4,'quiz')).completed,false)
  assert.equal((await summary(4)).quiz_complete,true)
  await editSection(4,'quiz',{answers:current})
})
await check('A database authenticated login cannot impersonate service_role with set_config',async()=>{
  const roleDb=new PGlite()
  await roleDb.exec('CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; SET SESSION AUTHORIZATION authenticated;')
  await reject(()=>roleDb.query("SELECT set_config('role','service_role',false)"),'permission denied')
  await roleDb.close()
})
console.log(`Matching readiness audit: ${passed} checks passed; isolated PGlite only.`)
await db.close()
