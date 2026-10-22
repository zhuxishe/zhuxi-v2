// Questionnaire versions: isolated PostgreSQL transactions/RLS verification. This script never contacts a live database.
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
const root = process.env.QUESTIONNAIRE_TEST_ROOT || fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(root + '/' + path, 'utf8')
const migrationPath = 'supabase/migrations/' + readdirSync(root + '/supabase/migrations').find(name => name.endsWith('_questionnaire_templates_versions.sql'))
const migration = read(migrationPath)
const refreshMigrationName = readdirSync(root + '/supabase/migrations').find(name => name.endsWith('_questionnaire_profile_snapshot_refresh.sql'))
assert.ok(refreshMigrationName, 'Missing profile snapshot refresh migration')
const refreshMigration = read('supabase/migrations/' + refreshMigrationName)
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
await db.exec('GRANT SELECT,INSERT,UPDATE,DELETE ON public.personality_quiz_config TO authenticated;')
await db.query("INSERT INTO auth.users(id,email) VALUES($1,'ordinary-admin@fixture.local')",[user(901)])
await db.query("INSERT INTO public.admin_users(user_id,email,name,role) VALUES($1,'ordinary-admin@fixture.local','Ordinary admin','admin')",[user(901)])
for(let n=1;n<=12;n++) await fixture(n,{status:'approved',stage:'complete',step:4})
for(let n=20;n<=24;n++) await fixture(n)
await db.query("INSERT INTO public.member_identity(member_id,full_name,gender,age_range,nationality,current_city,school_name,degree_level) VALUES($1,'Existing approved member','other','21-23','中国','东京都','Existing university','修士')",[member(1)])
await db.query("INSERT INTO public.member_interests(member_id,activity_area,budget_range,nearest_station) VALUES($1,'池袋','2000~4000円','Legacy station')",[member(1)])
const oldQuiz=defaults.quiz.quizConfig.questions.map(q=>({questionId:q.id,score:q.options[1].score}))
await db.query("INSERT INTO public.personality_quiz_results(member_id,answers,score_e,score_a,score_o,score_c,score_n,personality_type) VALUES($1,$2,66,66,66,66,66,'Legacy preserved')",[member(1),oldQuiz])
const beforeProfiles=await scalar("SELECT jsonb_agg(to_jsonb(i) ORDER BY member_id) AS value FROM public.member_identity i")
await db.exec(migration)
await db.exec(refreshMigration)
await check('migration does not rewrite existing profiles or eagerly allocate answers',async()=>{
  assert.deepEqual(await scalar("SELECT jsonb_agg(to_jsonb(i) ORDER BY member_id) AS value FROM public.member_identity i"),beforeProfiles)
  assert.equal(await scalar('SELECT count(*)::int AS value FROM public.questionnaire_responses'),0)
  assert.deepEqual(await get(2,'supplementary'),null)
})
await check('unauthenticated and ordinary players cannot initialize, edit, publish, or enumerate drafts',async()=>{
  await reject(()=>initialize(null,'supplementary'),'QUESTIONNAIRE_ADMIN_REQUIRED')
  await reject(()=>initialize(2,'supplementary'),'QUESTIONNAIRE_ADMIN_REQUIRED')
  await reject(()=>adminList(2),'QUESTIONNAIRE_ADMIN_REQUIRED')
  await reject(()=>publish(2,'supplementary',1),'QUESTIONNAIRE_SUPER_ADMIN_REQUIRED')
  await reject(()=>asUser(null,()=>db.query('SELECT public.get_admin_questionnaires()'),'anon'),'permission denied')
})
await check('first ordinary-admin initialization cannot publish an arbitrary baseline',async()=>{
  const forged=clone(defaults.interview);forged.questions[0].required=false
  await reject(()=>initialize(901,'interview',forged),'QUESTIONNAIRE_BASELINE_UNTRUSTED')
  assert.equal(await scalar('SELECT count(*)::int AS value FROM public.questionnaire_templates'),0)
})
await check('quiz baseline uses the real legacy config without changing it',async()=>{
  const legacyConfig=clone(defaults.quiz.quizConfig);legacyConfig.questions[7].text='Existing live custom wording';legacyConfig.questions[0].options[0].score=7
  await db.query('INSERT INTO public.personality_quiz_config(questions,dimensions,type_labels,type_descriptions,scoring) VALUES($1,$2,$3,$4,$5)',[legacyConfig.questions,legacyConfig.dimensions,legacyConfig.typeLabels,legacyConfig.typeDescriptions,legacyConfig.scoring])
  await reject(()=>initialize(901,'quiz',defaults.quiz),'QUESTIONNAIRE_BASELINE_UNTRUSTED')
  defaults.quiz=buildDefaultTemplate('quiz',legacyConfig)
  const before=await scalar('SELECT to_jsonb(q) AS value FROM public.personality_quiz_config q')
  const forbidden=await asUser(901,()=>db.query("UPDATE public.personality_quiz_config SET scoring='{\"minRaw\":0,\"maxRaw\":100,\"invertN\":false}' RETURNING id"))
  assert.deepEqual(forbidden.rows,[])
  const deleted=await asUser(901,()=>db.query('DELETE FROM public.personality_quiz_config RETURNING id'))
  assert.deepEqual(deleted.rows,[])
  const readable=await asUser(2,()=>db.query('SELECT questions FROM public.personality_quiz_config'))
  assert.equal(readable.rows.length,1)
  await initialize(901,'quiz')
  assert.deepEqual(await scalar('SELECT to_jsonb(q) AS value FROM public.personality_quiz_config q'),before)
})
await check('administrators lazily initialize four baselines idempotently',async()=>{
  for(const kind of ['interview','supplementary','personality'])await initialize(901,kind)
  for(const kind of ['interview','supplementary','personality','quiz'])await initialize(900,kind)
  assert.equal(await scalar('SELECT count(*)::int AS value FROM public.questionnaire_versions'),4)
  assert.equal(await scalar('SELECT count(*)::int AS value FROM public.questionnaire_responses'),0)
  assert.equal((await adminList(901)).length,4)
})
await check('profile refresh preserves unanswered defaults, false and null without inventing revisions',async()=>{
  for(const n of [13,14,15,16])await fixture(n,{status:'approved',stage:'complete',step:4})
  // Onboarding tags live in identity, not supplementary. Its default true/3
  // rows must keep the same unanswered state as the original draft builders.
  await db.query("INSERT INTO public.member_identity(member_id,full_name,gender,age_range,nationality,current_city,hobby_tags,activity_type_tags) VALUES($1,'Defaults fixture','other','21-23','中国','东京都',ARRAY['桌游'],ARRAY['聚餐'])",[member(13)])
  await db.query('INSERT INTO public.member_interests(member_id) VALUES($1)',[member(13)])
  await db.query('INSERT INTO public.member_personality(member_id) VALUES($1)',[member(13)])
  const {buildSupplementaryDraft,buildPersonalityDraft}=loadTs(root+'/src/lib/forms/player-enrichment.ts')
  const interests=await scalar('SELECT to_jsonb(i) AS value FROM public.member_interests i WHERE member_id=$1',[member(13)])
  const personality=await scalar('SELECT to_jsonb(p) AS value FROM public.member_personality p WHERE member_id=$1',[member(13)])
  assert.equal(buildSupplementaryDraft(interests,null).accept_beginners,null)
  assert.equal(buildPersonalityDraft(personality).extroversion,null)
  for(const kind of ['supplementary','personality']){
    const first=await get(13,kind),second=await get(13,kind)
    assert.equal(first.isBaseline,true);assert.equal(first.completed,false)
    assert.deepEqual(first.answers,{});assert.deepEqual(second,first)
  }
  await db.query('INSERT INTO public.member_interests(member_id,accept_beginners,accept_cross_school) VALUES($1,false,NULL)',[member(15)])
  const explicit=await get(15,'supplementary')
  assert.equal(explicit.answers.accept_beginners,false)
  assert.equal(explicit.answers.accept_cross_school,null)
  assert.deepEqual(await get(15,'supplementary'),explicit)
  // A real language row made the old builder accept the existing true flags.
  await db.query('INSERT INTO public.member_interests(member_id) VALUES($1)',[member(16)])
  await db.query('INSERT INTO public.member_language(member_id) VALUES($1)',[member(16)])
  assert.equal((await get(16,'supplementary')).answers.accept_beginners,true)
})
await check('baseline reads reflect admin corrections and reject an already open stale form before any refresh',async()=>{
  await db.query("INSERT INTO public.member_interests(member_id,nearest_station,activity_area,accept_beginners) VALUES($1,'Original fixture station',$2,false)",[member(14),defaults.supplementary.questions.find(q=>q.id==='activity_area').options[0].value])
  let current=await get(14,'supplementary');const before=clone(current)
  assert.equal(current.isBaseline,true)
  const edit=async(section,payload)=>authRpc(901,'SELECT public.admin_update_member_section($1,$2,$3,$4) AS result',[member(14),section,payload,'fixture correction'])
  await edit('interests',{nearest_station:'Admin corrected fixture station',accept_beginners:null})
  await edit('language',{communication_language_pref:['中文','日语']})
  // The save's internal get must detect the profile edit, even when the player
  // has not opened/reloaded another page since the administrator correction.
  await reject(()=>saveSnapshot(14,before,before.answers),'QUESTIONNAIRE_REVISION_CONFLICT')
  assert.equal(await scalar('SELECT nearest_station AS value FROM public.member_interests WHERE member_id=$1',[member(14)]),'Admin corrected fixture station')
  current=await get(14,'supplementary')
  assert.equal(current.versionId,before.versionId);assert.equal(current.isBaseline,true)
  assert.equal(current.completed,before.completed);assert.equal(current.revision,before.revision+1)
  assert.equal(current.answers.nearest_station,'Admin corrected fixture station')
  assert.equal(current.answers.accept_beginners,null)
  assert.deepEqual(current.answers.communication_language_pref,['中文','日语'])
  assert.deepEqual(await get(14,'supplementary'),current)
  await reject(()=>saveSnapshot(14,before,before.answers),'QUESTIONNAIRE_REVISION_CONFLICT')
  current=await saveSnapshot(14,current,current.answers)
  assert.equal(await scalar('SELECT nearest_station AS value FROM public.member_interests WHERE member_id=$1',[member(14)]),'Admin corrected fixture station')
  assert.deepEqual(await get(14,'supplementary'),current)
})
await check('profile refresh propagates deliberate clearing and false while treating equivalent empty form values idempotently',async()=>{
  const before=await get(14,'supplementary')
  await authRpc(901,'SELECT public.admin_update_member_section($1,$2,$3,$4) AS result',[member(14),'interests',{nearest_station:null,activity_area:'',accept_beginners:false,accept_cross_school:null},'fixture clearing'])
  await authRpc(901,'SELECT public.admin_update_member_section($1,$2,$3,$4) AS result',[member(14),'language',{communication_language_pref:[],japanese_level:null},'fixture clearing'])
  await reject(()=>saveSnapshot(14,before,before.answers),'QUESTIONNAIRE_REVISION_CONFLICT')
  let current=await get(14,'supplementary')
  assert.equal(current.answers.nearest_station,null);assert.equal(current.answers.activity_area,'')
  assert.equal(current.answers.accept_beginners,false);assert.equal(current.answers.accept_cross_school,null)
  assert.deepEqual(current.answers.communication_language_pref,[])
  current=await saveSnapshot(14,current,{...current.answers,nearest_station:'',activity_area:'',japanese_level:''})
  assert.deepEqual(await get(14,'supplementary'),current)
  assert.deepEqual(await get(14,'supplementary'),current)
})
let savedDraft
await check('draft writes are isolated and stale optimistic revisions cannot overwrite them',async()=>{
  const changed=clone(defaults.supplementary);changed.questions.push(custom('custom-uuid'))
  savedDraft=await draft(901,'supplementary',1,changed)
  assert.equal(savedDraft.revision,2)
  assert.deepEqual(savedDraft.published,defaults.supplementary)
  await reject(()=>draft(901,'supplementary',1,defaults.supplementary),'QUESTIONNAIRE_REVISION_CONFLICT')
  assert.equal((await adminList(900)).find(x=>x.kind==='supplementary').revision,2)
})
await check('only a super administrator can publish and publish checks the same revision',async()=>{
  await reject(()=>publish(901,'supplementary',2),'QUESTIONNAIRE_SUPER_ADMIN_REQUIRED')
  await reject(()=>publish(900,'supplementary',1),'QUESTIONNAIRE_REVISION_CONFLICT')
  const published=await publish(900,'supplementary',2)
  assert.equal(published.revision,3)
  assert.equal(published.versions.length,2)
})
await check('existing legacy answers bind baseline even when first visited after publication',async()=>{
  const existing=await get(1,'supplementary')
  assert.equal(existing.isBaseline,true)
  assert.equal(existing.completed,true)
  assert.equal(existing.answers.nearest_station,'Legacy station')
  assert.equal(existing.template.questions.some(q=>q.id==='custom-uuid'),false)
  const newlyFilling=await get(2,'supplementary')
  assert.equal(newlyFilling.isBaseline,false)
  assert.equal(newlyFilling.template.questions.at(-1).id,'custom-uuid')
})
await check('direct RPC rejects missing required and unknown single choices with no existing answer',async()=>{
  const runtime=await get(2,'supplementary')
  await reject(()=>saveSnapshot(2,runtime,{}),'QUESTIONNAIRE_REQUIRED')
  await reject(()=>saveSnapshot(2,runtime,{'custom-uuid':'forged-option'}),'QUESTIONNAIRE_OPTION_INVALID')
  assert.equal((await get(2,'supplementary')).revision,0)
  assert.equal(await scalar('SELECT count(*)::int AS value FROM public.member_language WHERE member_id=$1',[member(2)]),0)
})
await check('snapshot save atomically maps supplementary fields and rejects stale answers',async()=>{
  let runtime=await get(2,'supplementary')
  runtime=await saveSnapshot(2,runtime,{'custom-uuid':'yes',nearest_station:'New station',accept_beginners:false})
  assert.equal(runtime.revision,1)
  assert.equal(runtime.answers.accept_beginners,false)
  assert.equal(await scalar('SELECT nearest_station AS value FROM public.member_interests WHERE member_id=$1',[member(2)]),'New station')
  await reject(()=>saveSnapshot(2,runtime,{'custom-uuid':'no'},{revision:0}),'QUESTIONNAIRE_REVISION_CONFLICT')
  assert.equal((await get(2,'supplementary')).answers['custom-uuid'],'yes')
})
await check('a failure after legacy writes rolls back profile changes and the snapshot together',async()=>{
  const runtime=await get(2,'supplementary')
  await db.exec(`CREATE FUNCTION private.questionnaire_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'TEST_SNAPSHOT_FAILURE'; END$$;
    CREATE TRIGGER test_snapshot_failure BEFORE UPDATE ON public.questionnaire_responses FOR EACH ROW EXECUTE FUNCTION private.questionnaire_test_fail();`)
  await reject(()=>saveSnapshot(2,runtime,{nearest_station:'Must rollback'}),'TEST_SNAPSHOT_FAILURE')
  await db.exec('DROP TRIGGER test_snapshot_failure ON public.questionnaire_responses;DROP FUNCTION private.questionnaire_test_fail();')
  assert.equal(await scalar('SELECT nearest_station AS value FROM public.member_interests WHERE member_id=$1',[member(2)]),'New station')
  assert.equal((await get(2,'supplementary')).revision,runtime.revision)
})
await check('players cannot forge versions, responses, ownership, or another member session',async()=>{
  for(const table of ['questionnaire_templates','questionnaire_versions','questionnaire_responses','questionnaire_assignments']){
    await reject(()=>asUser(2,()=>db.exec(`DELETE FROM public.${table}`)),'permission denied')
  }
  const a=await get(2,'supplementary'),b=await get(1,'supplementary')
  await reject(()=>saveSnapshot(2,a,{},{versionId:b.versionId}),'QUESTIONNAIRE_VERSION_CONFLICT')
  const own=await asUser(2,()=>db.query('SELECT DISTINCT member_id FROM public.questionnaire_responses'))
  assert.deepEqual(own.rows,[{member_id:member(2)}])
  const ordinaryAdmin=await asUser(901,()=>db.query('SELECT member_id FROM public.questionnaire_responses'))
  assert.deepEqual(ordinaryAdmin.rows,[])
  const ordinaryBindings=await asUser(901,()=>db.query('SELECT member_id FROM public.questionnaire_assignments'))
  assert.deepEqual(ordinaryBindings.rows,[])
  const superAdmin=await asUser(900,()=>db.query('SELECT member_id FROM public.questionnaire_responses'))
  assert.ok(superAdmin.rows.length>=2)
  const templates=await asUser(2,()=>db.query('SELECT kind FROM public.questionnaire_templates'))
  assert.deepEqual(templates.rows,[])
  await reject(()=>asUser(2,()=>db.query('SELECT private.questionnaire_legacy($1,$2,$3)',[member(1),'supplementary',defaults.supplementary])),'permission denied')
})
await check('published versions remain immutable even for database owner and old editors keep old definitions',async()=>{
  const runtime=await get(1,'supplementary')
  await reject(()=>db.query("UPDATE public.questionnaire_versions SET template='{}' WHERE id=$1",[runtime.versionId]),'QUESTIONNAIRE_VERSION_IMMUTABLE')
  const saved=await saveSnapshot(1,runtime,{nearest_station:'Edited old answer'})
  assert.equal(saved.isBaseline,true)
  assert.equal(saved.template.questions.some(q=>q.id==='custom-uuid'),false)
})
await check('direct admin RPC cannot remove builtins, weaken core constraints or delete prior custom questions',async()=>{
  const interview=clone(defaults.interview);interview.questions[0].required=false
  await reject(()=>draft(901,'interview',1,interview),'QUESTIONNAIRE_BUILTIN_LOCKED')
  const current=(await adminList(901)).find(x=>x.kind==='supplementary')
  const removed=clone(current.draft);removed.questions=removed.questions.filter(q=>q.id!=='custom-uuid')
  await reject(()=>draft(901,'supplementary',current.revision,removed),'QUESTIONNAIRE_QUESTION_REMOVED')
})
await check('append-only mapped options work without the legacy hard-coded option list',async()=>{
  let row=(await adminList(901)).find(x=>x.kind==='supplementary');const template=clone(row.draft)
  template.questions.find(q=>q.id==='activity_area').options.push({id:'new_area',value:'New test area',label:{zh:'新增区域',ja:'新エリア'}})
  row=await draft(901,'supplementary',row.revision,template);await publish(900,'supplementary',row.revision)
  const runtime=await get(3,'supplementary')
  const saved=await saveSnapshot(3,runtime,{'custom-uuid':'yes',activity_area:'New test area'})
  assert.equal(saved.answers.activity_area,'New test area')
  assert.equal(await scalar('SELECT activity_area AS value FROM public.member_interests WHERE member_id=$1',[member(3)]),'New test area')
})
await check('personality deactivation preserves previous legacy values without inventing an answer',async()=>{
  await db.query('INSERT INTO public.member_personality(member_id,extroversion) VALUES($1,5)',[member(4)])
  const template=clone(defaults.personality);template.questions.find(q=>q.id==='extroversion').active=false
  let row=await draft(901,'personality',1,template);await publish(900,'personality',row.revision)
  // Member 5 has no legacy assessment and receives the new template.
  const runtime=await get(5,'personality');const answers={}
  await db.query('INSERT INTO public.member_personality(member_id,extroversion) VALUES($1,5)',[member(5)])
  for(const q of runtime.template.questions)if(q.active)answers[q.id]=q.type==='rating'?4:q.type==='multi'?[q.options[0].value]:q.options[0].value
  // Only the inactive score changed. Unanswered active DEFAULT 3 scores must
  // neither become answers nor invalidate a page that is filling them now.
  assert.deepEqual(await get(5,'personality'),runtime)
  const saved=await saveSnapshot(5,runtime,answers)
  assert.equal(Object.hasOwn(saved.answers,'extroversion'),false)
  assert.equal(saved.completed,true)
  assert.equal(await scalar('SELECT initiative AS value FROM public.member_personality WHERE member_id=$1',[member(5)]),4)
  assert.equal(await scalar('SELECT extroversion AS value FROM public.member_personality WHERE member_id=$1',[member(4)]),5)
  assert.equal(await scalar('SELECT extroversion AS value FROM public.member_personality WHERE member_id=$1',[member(5)]),5)
})
await check('onboarding step saves validate ownership, calendar dates and step requirements in SQL',async()=>{
  let runtime=await get(20,'interview')
  await reject(()=>saveSnapshot(20,runtime,{full_name:'New member'},{step:1,complete:false}),'QUESTIONNAIRE_REQUIRED')
  await reject(()=>saveSnapshot(20,runtime,{full_name:'New member',gender:'other',birth_date:'2999-01-01',nationality:'中国大陆',current_city:'东京都'},{step:1,complete:false}),'QUESTIONNAIRE_DATE_INVALID')
  runtime=await saveSnapshot(20,runtime,{full_name:'New member',gender:'other',birth_date:'2000-01-01',nationality:'中国大陆',current_city:'东京都'},{step:1,complete:false})
  assert.equal(runtime.completed,false)
  assert.equal(await scalar('SELECT full_name AS value FROM public.member_identity WHERE member_id=$1',[member(20)]),'New member')
  await reject(()=>saveSnapshot(20,runtime,{school_name:'Wrong step'},{step:1,complete:false}),'QUESTIONNAIRE_SECTION_INVALID')
  runtime=await saveSnapshot(20,runtime,{school_name:'School',degree_level:'修士'},{step:2,complete:false})
  runtime=await saveSnapshot(20,runtime,{hobby_tags:['桌游'],activity_type_tags:['桌游']},{step:3,complete:false})
  runtime=await saveSnapshot(20,runtime,{personality_self_tags:['温和']},{step:4,complete:false})
  runtime=await saveSnapshot(20,runtime,{},{complete:true})
  assert.equal(runtime.completed,true)
  assert.equal(await scalar('SELECT profile_stage AS value FROM public.members WHERE id=$1',[member(20)]),'submitted')
})
await check('retakes use latest published quiz while old answers, result and version remain unchanged',async()=>{
  const old=await get(1,'quiz');assert.equal(old.isBaseline,true);assert.equal(old.completed,true)
  const oldRow=await scalar('SELECT to_jsonb(r) AS value FROM public.questionnaire_responses r WHERE member_id=$1 AND kind=$2',[member(1),'quiz'])
  const changed=clone(defaults.quiz);changed.questions[0].label.zh='New version wording';changed.questions[0].options[0].score=9
  let row=await draft(901,'quiz',1,changed);await publish(900,'quiz',row.revision)
  assert.deepEqual(await get(1,'quiz'),old)
  let next=await retake(1);assert.equal(next.isBaseline,false);assert.notEqual(next.versionId,old.versionId)
  assert.equal(next.template.questions[0].label.zh,'New version wording');assert.deepEqual(next.answers,{})
  const answers=Object.fromEntries(next.template.questions.filter(q=>q.active).map(q=>[q.id,Number(q.options[0].value)]))
  next=await saveSnapshot(1,next,answers)
  assert.equal(next.completed,true)
  const archived=await scalar('SELECT to_jsonb(r) AS value FROM public.questionnaire_responses r WHERE id=$1',[oldRow.id])
  assert.deepEqual(archived,oldRow)
  assert.equal(archived.result_snapshot.personality_type,'Legacy preserved')
  await reject(()=>saveSnapshot(1,next,answers,{versionId:old.versionId}),'QUESTIONNAIRE_VERSION_CONFLICT')
  await reject(()=>db.query("UPDATE public.questionnaire_responses SET answers='{}' WHERE id=$1",[oldRow.id]),'QUESTIONNAIRE_HISTORY_IMMUTABLE')
})
await check('quiz scores come from immutable option scores, never supplied result fields',async()=>{
  const runtime=await get(6,'quiz');const answers=Object.fromEntries(runtime.template.questions.filter(q=>q.active).map(q=>[q.id,q.options[0].value]))
  await reject(()=>saveSnapshot(6,runtime,{...answers,score_e:100}),'QUESTIONNAIRE_ANSWERS_INVALID')
  await saveSnapshot(6,runtime,answers)
  const saved=await scalar('SELECT to_jsonb(r) AS value FROM public.personality_quiz_results r WHERE member_id=$1',[member(6)])
  assert.equal(saved.answers[0].score,9)
  assert.equal(saved.score_e,100)
})
await check('same-version retake increments revisions so a stale tab cannot overwrite the new session',async()=>{
  const old=await get(6,'quiz');const next=await retake(6)
  assert.equal(next.versionId,old.versionId)
  assert.ok(next.revision>old.revision)
  await reject(()=>saveSnapshot(6,old,old.answers),'QUESTIONNAIRE_REVISION_CONFLICT')
  await reject(()=>authRpc(6,'SELECT public.save_my_questionnaire($1,$2,$3) AS result',['quiz',next.versionId,{}]),'QUESTIONNAIRE_REVISION_REQUIRED')
  assert.deepEqual((await get(6,'quiz')).answers,{})
})
await check('publishing unchanged or restored baseline keeps the baseline UI marker',async()=>{
  const row=(await adminList(901)).find(x=>x.kind==='quiz')
  const restored=await draft(901,'quiz',row.revision,defaults.quiz)
  await publish(900,'quiz',restored.revision)
  const runtime=await get(7,'quiz')
  assert.equal(runtime.isBaseline,true)
  assert.deepEqual(runtime.template,defaults.quiz)
})
await check('optional scored quiz questions may remain unanswered and scores match the existing scorer',async()=>{
  let row=(await adminList(901)).find(x=>x.kind==='quiz');const template=clone(row.draft)
  template.questions[0].required=false
  row=await draft(901,'quiz',row.revision,template);await publish(900,'quiz',row.revision)
  const runtime=await get(8,'quiz')
  const answers=Object.fromEntries(runtime.template.questions.slice(1).map(q=>[q.id,Number(q.options[0].value)]))
  await saveSnapshot(8,runtime,answers)
  const result=await scalar('SELECT to_jsonb(r) AS value FROM public.personality_quiz_results r WHERE member_id=$1',[member(8)])
  const {calculateScores,generatePersonalityType}=loadTs(root+'/src/lib/constants/personality-quiz.ts')
  const expected=calculateScores(result.answers,template.quizConfig.scoring,template.quizConfig.questions)
  assert.equal(result.score_e,expected.E)
  assert.equal(result.personality_type,generatePersonalityType(expected,template.quizConfig.typeLabels.formal,template.quizConfig.scoring.invertN))
  assert.equal(result.answers.length,14)
})
await check('account suspension and anonymization block access, and erasure removes snapshots',async()=>{
  await db.query("UPDATE public.members SET account_status='suspended' WHERE id=$1",[member(2)])
  await reject(()=>get(2,'supplementary'),'QUESTIONNAIRE_PLAYER_REQUIRED')
  await db.query("UPDATE public.members SET account_status='active' WHERE id=$1",[member(2)])
  await db.query('UPDATE public.members SET anonymized_at=now() WHERE id=$1',[member(2)])
  assert.equal(await scalar('SELECT count(*)::int AS value FROM public.questionnaire_responses WHERE member_id=$1',[member(2)]),0)
  assert.equal(await scalar('SELECT count(*)::int AS value FROM public.questionnaire_assignments WHERE member_id=$1',[member(2)]),0)
})
await check('write transactions acquire row locks before profile/assignment writes',async()=>{
  await asUser(3,async()=>{
    await db.query("SELECT public.get_my_questionnaire('supplementary')")
    const locks=await db.query("SELECT mode FROM pg_locks WHERE relation='public.members'::regclass")
    assert.ok(locks.rows.some(x=>x.mode==='RowShareLock'))
  })
  const definition=await scalar("SELECT pg_get_functiondef('private.questionnaire_save_draft(text,integer,jsonb)'::regprocedure) AS value")
  assert.match(definition,/FOR UPDATE/i)
})
await check('future published versions refresh only active mappings and preserve custom, inactive and historical answers',async()=>{
  await fixture(17,{status:'approved',stage:'complete',step:4})
  let row=(await adminList(901)).find(x=>x.kind==='supplementary')
  const template=clone(row.draft)
  template.questions.find(q=>q.id==='nearest_station').active=false
  template.questions.push(custom('profile_refresh_custom',{type:'multi',required:false,options:[{id:'keep',value:'keep',label:{zh:'保留',ja:'保持'}}]}))
  row=await draft(901,'supplementary',row.revision,template);await publish(900,'supplementary',row.revision)
  let current=await get(17,'supplementary')
  assert.equal(current.isBaseline,false)
  const initial={...Object.fromEntries(current.template.questions.filter(q=>q.active&&q.required).map(q=>[q.id,q.options[0].value])),profile_refresh_custom:['keep'],activity_area:template.questions.find(q=>q.id==='activity_area').options[0].value,accept_cross_school:true}
  current=await saveSnapshot(17,current,initial)
  // Seed an already stored inactive answer to exercise retention explicitly.
  await db.query("UPDATE public.questionnaire_responses SET answers=answers||$2::jsonb WHERE id=(SELECT response_id FROM public.questionnaire_assignments WHERE member_id=$1 AND kind='supplementary')",[member(17),{nearest_station:'Pinned inactive answer'}])
  current=await get(17,'supplementary')
  const before=clone(current)
  // Only the current assignment may be refreshed, even when older responses
  // contain the same member/kind and version. This row is an isolated fixture.
  const historicalId=(await db.query("INSERT INTO public.questionnaire_responses(member_id,kind,version_id,answers,completed_at,revision) VALUES($1,'supplementary',$2,$3,now(),7) RETURNING id",[member(17),current.versionId,{profile_refresh_custom:['historical'],nearest_station:'Historical station'}])).rows[0].id
  const historicalBefore=await scalar('SELECT to_jsonb(r) AS value FROM public.questionnaire_responses r WHERE id=$1',[historicalId])
  await authRpc(901,'SELECT public.admin_update_member_section($1,$2,$3,$4) AS result',[member(17),'interests',{activity_area:template.questions.find(q=>q.id==='activity_area').options[1].value,nearest_station:'Inactive admin station',accept_cross_school:false},'future version correction'])
  await reject(()=>saveSnapshot(17,before,before.answers),'QUESTIONNAIRE_REVISION_CONFLICT')
  current=await get(17,'supplementary')
  assert.equal(current.versionId,before.versionId);assert.equal(current.completed,before.completed)
  assert.equal(current.answers.activity_area,template.questions.find(q=>q.id==='activity_area').options[1].value)
  assert.equal(current.answers.accept_cross_school,false)
  assert.deepEqual(current.answers.profile_refresh_custom,['keep'])
  assert.equal(current.answers.nearest_station,'Pinned inactive answer')
  assert.equal(current.revision,before.revision+1)
  assert.deepEqual(await scalar('SELECT to_jsonb(r) AS value FROM public.questionnaire_responses r WHERE id=$1',[historicalId]),historicalBefore)
  current=await saveSnapshot(17,current,current.answers)
  assert.equal(await scalar('SELECT nearest_station AS value FROM public.member_interests WHERE member_id=$1',[member(17)]),'Inactive admin station')
  assert.deepEqual(await get(17,'supplementary'),current)
})
await check('personality baseline refresh respects admin scores, tag changes and required-field clearing',async()=>{
  await fixture(18,{status:'approved',stage:'complete',step:4})
  const original=Object.fromEntries(defaults.personality.questions.map(q=>[q.id,q.type==='rating'?2:q.type==='multi'?[q.options[0].value]:q.options[0].value]))
  await authRpc(901,'SELECT public.admin_update_member_section($1,$2,$3,$4) AS result',[member(18),'personality',original,'initial assessment fixture'])
  const before=await get(18,'personality');assert.equal(before.isBaseline,true)
  await authRpc(901,'SELECT public.admin_update_member_section($1,$2,$3,$4) AS result',[member(18),'personality',{initiative:5,expression_style_tags:['幽默'],warmup_speed:null},'correct assessment fixture'])
  await reject(()=>saveSnapshot(18,before,before.answers),'QUESTIONNAIRE_REVISION_CONFLICT')
  let current=await get(18,'personality')
  assert.equal(current.versionId,before.versionId);assert.equal(current.revision,before.revision+1)
  assert.equal(current.answers.initiative,5);assert.equal(current.answers.warmup_speed,null)
  assert.deepEqual(current.answers.expression_style_tags,['幽默'])
  assert.deepEqual(await get(18,'personality'),current)
  await reject(()=>saveSnapshot(18,current,current.answers),'QUESTIONNAIRE_REQUIRED:warmup_speed')
  current=await saveSnapshot(18,current,{...current.answers,warmup_speed:original.warmup_speed})
  assert.equal(await scalar('SELECT initiative AS value FROM public.member_personality WHERE member_id=$1',[member(18)]),5)
  assert.deepEqual(await get(18,'personality'),current)
})
await check('explicit all-middle personality ratings survive reads while unconfirmed default scores stay unanswered',async()=>{
  await fixture(30,{status:'approved',stage:'complete',step:4})
  let row=(await adminList(901)).find(x=>x.kind==='personality')
  const template=clone(row.draft)
  for(const question of template.questions)question.active=question.type==='rating'
  row=await draft(901,'personality',row.revision,template);await publish(900,'personality',row.revision)
  await db.query('INSERT INTO public.member_personality(member_id) VALUES($1)',[member(30)])
  let current=await get(30,'personality')
  assert.equal(current.isBaseline,false);assert.equal(current.completed,false)
  assert.deepEqual(current.answers,{})
  assert.deepEqual(await get(30,'personality'),current)
  const explicit=Object.fromEntries(current.template.questions.filter(q=>q.active).map(q=>[q.id,3]))
  current=await saveSnapshot(30,current,explicit)
  assert.equal(current.completed,true)
  assert.deepEqual(current.answers,explicit)
  assert.deepEqual(await get(30,'personality'),current)
  assert.deepEqual(await get(30,'personality'),current)
  const before=clone(current)
  await authRpc(901,'SELECT public.admin_update_member_section($1,$2,$3,$4) AS result',[member(30),'personality',{initiative:4},'correct middle score fixture'])
  await reject(()=>saveSnapshot(30,before,before.answers),'QUESTIONNAIRE_REVISION_CONFLICT')
  current=await get(30,'personality')
  assert.deepEqual(current.answers,{...explicit,initiative:4})
  await authRpc(901,'SELECT public.admin_update_member_section($1,$2,$3,$4) AS result',[member(30),'personality',{initiative:3},'restore explicit middle score'])
  const restored=await get(30,'personality')
  assert.deepEqual(restored.answers,explicit);assert.equal(restored.revision,current.revision+1)
  assert.deepEqual(await get(30,'personality'),restored)
})
await check('an explicit supplementary false can be corrected to true without becoming an unanswered default',async()=>{
  await fixture(31,{status:'approved',stage:'complete',step:4})
  // This is a legacy explicitly answered false, without a language row or any
  // other supplementary value to defeat the old default-true import heuristic.
  await db.query('INSERT INTO public.member_interests(member_id,accept_beginners,accept_cross_school) VALUES($1,false,NULL)',[member(31)])
  const before=await get(31,'supplementary')
  assert.equal(before.isBaseline,true);assert.equal(before.answers.accept_beginners,false)
  assert.equal(before.answers.accept_cross_school,null)
  await authRpc(901,'SELECT public.admin_update_member_section($1,$2,$3,$4) AS result',[member(31),'interests',{accept_beginners:true},'correct explicit boolean fixture'])
  await reject(()=>saveSnapshot(31,before,before.answers),'QUESTIONNAIRE_REVISION_CONFLICT')
  const corrected=await get(31,'supplementary')
  assert.equal(corrected.answers.accept_beginners,true)
  assert.equal(corrected.answers.accept_cross_school,null)
  assert.equal(corrected.revision,before.revision+1)
  assert.deepEqual(await get(31,'supplementary'),corrected)
  assert.equal(await scalar('SELECT accept_beginners AS value FROM public.member_interests WHERE member_id=$1',[member(31)]),true)
})
await check('answering one required personality score never fills optional missing scores with database defaults',async()=>{
  await fixture(42,{status:'approved',stage:'complete',step:4})
  let row=(await adminList(901)).find(x=>x.kind==='personality')
  const template=clone(row.draft)
  for(const question of template.questions){question.active=question.type==='rating';question.required=question.id==='extroversion'}
  row=await draft(901,'personality',row.revision,template);await publish(900,'personality',row.revision)
  let current=await get(42,'personality')
  current=await saveSnapshot(42,current,{extroversion:4})
  assert.equal(current.completed,true);assert.deepEqual(current.answers,{extroversion:4})
  assert.deepEqual(await get(42,'personality'),current)
  assert.deepEqual(await get(42,'personality'),current)
  current=await saveSnapshot(42,current,{...current.answers,initiative:null})
  assert.deepEqual(current.answers,{extroversion:4,initiative:null})
  assert.deepEqual(await get(42,'personality'),current)
  // An optional 3 becomes a confirmed answer only when this session sends it.
  current=await saveSnapshot(42,current,{...current.answers,initiative:3})
  assert.deepEqual(current.answers,{extroversion:4,initiative:3})
  assert.deepEqual(await get(42,'personality'),current)
  await authRpc(901,'SELECT public.admin_update_member_section($1,$2,$3,$4) AS result',[member(42),'personality',{extroversion:3},'change confirmed rating to middle'])
  const corrected=await get(42,'personality')
  assert.deepEqual(corrected.answers,{extroversion:3,initiative:3})
  assert.equal(Object.hasOwn(corrected.answers,'emotional_stability'),false)
  assert.equal(corrected.revision,current.revision+1)
  assert.deepEqual(await get(42,'personality'),corrected)
})
await check('another answered supplementary field does not confirm missing default true flags',async()=>{
  await fixture(43,{status:'approved',stage:'complete',step:4})
  let row=(await adminList(901)).find(x=>x.kind==='supplementary')
  const template=clone(row.draft)
  for(const question of template.questions){question.active=['nearest_station','accept_beginners','accept_cross_school'].includes(question.id);question.required=question.id==='nearest_station'}
  row=await draft(901,'supplementary',row.revision,template);await publish(900,'supplementary',row.revision)
  let current=await get(43,'supplementary');assert.deepEqual(current.answers,{})
  // The real admin RPC creates an interests row with DEFAULT true flags while
  // setting only the station. Neither flag has an answer in this session.
  await authRpc(901,'SELECT public.admin_update_member_section($1,$2,$3,$4) AS result',[member(43),'interests',{nearest_station:'Admin fixture station'},'new canonical station fixture'])
  current=await get(43,'supplementary')
  assert.deepEqual(current.answers,{nearest_station:'Admin fixture station'})
  assert.equal(await scalar('SELECT accept_beginners AS value FROM public.member_interests WHERE member_id=$1',[member(43)]),true)
  assert.deepEqual(await get(43,'supplementary'),current)
  current=await saveSnapshot(43,current,current.answers)
  assert.equal(current.completed,true)
  await authRpc(901,'SELECT public.admin_update_member_section($1,$2,$3,$4) AS result',[member(43),'interests',{nearest_station:'Corrected fixture station',accept_beginners:true,accept_cross_school:true},'other answer must not confirm flags'])
  const corrected=await get(43,'supplementary')
  assert.deepEqual(corrected.answers,{nearest_station:'Corrected fixture station'})
  assert.deepEqual(await get(43,'supplementary'),corrected)
})
await check('stored nullable boolean answers follow real admin null to true corrections and later clearing',async()=>{
  await fixture(44,{status:'approved',stage:'complete',step:4})
  let current=await get(44,'supplementary')
  current=await saveSnapshot(44,current,{nearest_station:'Answered fixture station',accept_beginners:null,accept_cross_school:null})
  assert.equal(current.answers.accept_beginners,null)
  assert.deepEqual(await get(44,'supplementary'),current)
  const before=clone(current)
  const setBoolean=value=>authRpc(901,'SELECT public.admin_update_member_section($1,$2,$3,$4) AS result',[member(44),'interests',{accept_beginners:value},'correct nullable boolean fixture'])
  await setBoolean(true)
  await reject(()=>saveSnapshot(44,before,before.answers),'QUESTIONNAIRE_REVISION_CONFLICT')
  current=await get(44,'supplementary')
  assert.equal(current.answers.accept_beginners,true);assert.equal(current.answers.accept_cross_school,null)
  assert.equal(current.revision,before.revision+1)
  assert.deepEqual(await get(44,'supplementary'),current)
  const trueRevision=current.revision
  await setBoolean(null)
  current=await get(44,'supplementary')
  assert.equal(current.answers.accept_beginners,null);assert.equal(current.revision,trueRevision+1)
  await setBoolean(true)
  current=await get(44,'supplementary')
  assert.equal(current.answers.accept_beginners,true);assert.equal(current.revision,trueRevision+2)
  assert.equal(current.answers.accept_cross_school,null)
  assert.deepEqual(await get(44,'supplementary'),current)
})
console.log(`${passed} questionnaire database checks passed; isolated PGlite only (no live database).`)
await db.close()
