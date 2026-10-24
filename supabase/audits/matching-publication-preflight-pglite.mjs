// Final publication guard with real collection, engine, SQL proof and participant receipt.
// Offline fixtures only: real SQL guards/RPCs; auth and readiness outcomes are fixture-controlled.
// PGLITE_MODULE / ESBUILD_MODULE may point at installed packages outside the repo.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
const root=fileURLToPath(new URL('../../',import.meta.url))
const {build}=await import(process.env.ESBUILD_MODULE || 'esbuild')
const temporary=mkdtempSync(join(tmpdir(),'matching-publication-preflight-'))
const bundle=await build({stdin:{contents:`export {prepareMatchingRunInput} from './src/lib/matching/run-input'; export {runFullMatching} from './src/lib/matching/run-matching'; export {buildUnmatchedDiagnostics} from './src/lib/matching/unmatched-diagnostics'; export {preparePublicationPreflightInput,inspectPublicationPreflight} from './src/lib/matching/publication-preflight'`,resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',alias:{'@':join(root,'src')}})
writeFileSync(join(temporary,'engine.mjs'),bundle.outputFiles[0].contents)
const {prepareMatchingRunInput,runFullMatching,buildUnmatchedDiagnostics,preparePublicationPreflightInput,inspectPublicationPreflight}=await import(pathToFileURL(join(temporary,'engine.mjs')).href)
process.env.MATCHING_RUN_LIFECYCLE_SUITE='1'
const {auditContext:ctx}=await import('./matching-run-input-pglite.mjs')
const {db,scalar,role,read,admin,adminUser}=ctx
let checks=0
const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++}
const server=async()=>{await role('service_role');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[adminUser])}
await role()
await db.exec(read('supabase/migrations/20261023112514_matching_run_lifecycle.sql'))
await db.exec(`CREATE FUNCTION private.member_master_is_super_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=auth.uid() AND role='super_admin') $$;
 ALTER TABLE public.questionnaire_versions ADD COLUMN kind text;
 CREATE TABLE public.questionnaire_templates(kind text PRIMARY KEY,published_version_id uuid REFERENCES public.questionnaire_versions(id));
 CREATE TABLE public.interview_evaluations(id uuid PRIMARY KEY,attractiveness_score numeric);
 GRANT SELECT ON public.members,public.interview_evaluations,public.match_results TO service_role;`)
await db.exec(read('supabase/migrations/20261023080507_protect_admin_assessment_score_columns.sql'))
for(const name of ['private.round_peer_review_settings','private.round_peer_review_participants','private.round_peer_reviews']){
 const sql=read('supabase/migrations/20261002165912_round_peer_reviews.sql'),i=sql.indexOf('CREATE TABLE '+name+' (')
 await db.exec(sql.slice(i,sql.indexOf('\n);',i)+3))
}
const quiz=randomUUID(),weights={E:.3,A:.3,O:.15,C:.1,N:.15}
await db.query("INSERT INTO public.questionnaire_versions(id,kind,version,template) VALUES($1,'quiz',1,$2)",[quiz,{quizConfig:{dimensions:Object.fromEntries(Object.entries(weights).map(([key,matchWeight])=>[key,{matchWeight}]))}}])
await db.query("INSERT INTO public.questionnaire_templates VALUES('quiz',$1)",[quiz])
await db.exec(read('supabase/migrations/20261023155710_matching_scoring_v3_snapshot.sql'))
const extract=(source,name)=>{
 const i=source.indexOf('CREATE OR REPLACE FUNCTION '+name+'(')
 assert.ok(i>=0,name)
 const sub=source.slice(i),m=/AS (\$[a-z_]*\$)/i.exec(sub)
 return sub.slice(0,sub.indexOf(m[1]+';',m.index+m[0].length)+m[1].length+1)
}
// Install the actual collection validators and compare-and-save entry points.
await db.exec(`ALTER TABLE public.match_rounds ADD COLUMN activity_start date DEFAULT '2026-10-25',ADD COLUMN activity_end date DEFAULT '2026-11-01',ADD COLUMN content_config jsonb DEFAULT '{}',ADD COLUMN config_revision integer DEFAULT 0;
 ALTER TABLE public.match_round_submissions ADD COLUMN custom_answers jsonb DEFAULT '{}',ADD COLUMN config_revision integer DEFAULT 0,ADD COLUMN audit_reason text;
 ALTER TABLE public.match_round_submissions ADD CONSTRAINT flow_unique_submission UNIQUE(round_id,member_id);
 CREATE FUNCTION private.member_master_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT public.is_admin()$$;`)
const content=read('supabase/migrations/20260929120921_matching_content_editor.sql')
for(const name of ['private.round_answer_structure','private.validate_round_custom_answers','private.guard_round_content_write','private.member_master_guard_round_submission_write'])await db.exec(extract(content,name))
await db.exec(`CREATE TRIGGER guard_round_content_write BEFORE INSERT OR UPDATE ON public.match_rounds FOR EACH ROW EXECUTE FUNCTION private.guard_round_content_write();
 CREATE TRIGGER member_master_guard_round_submission_write BEFORE INSERT OR UPDATE ON public.match_round_submissions FOR EACH ROW EXECUTE FUNCTION private.member_master_guard_round_submission_write();`)
const soft=read('supabase/migrations/20261010101614_matching_round_soft_delete.sql')
const patch=soft.slice(soft.indexOf("  definition := pg_get_functiondef('private.member_master_guard_round_submission_write()"),soft.indexOf("  definition := pg_get_functiondef('private.guard_match_session_round_purpose()"))
await db.exec('DO $migration$ DECLARE definition text; original text; replacement text; BEGIN '+patch+' END $migration$;')
const readiness=read('supabase/migrations/20261022162627_matching_profile_readiness.sql'),rs=readiness.indexOf('CREATE FUNCTION private.guard_matching_profile_readiness()')
await db.exec(readiness.slice(rs,readiness.indexOf('REVOKE ALL ON FUNCTION',rs)))
await db.exec(read('supabase/migrations/20261022175617_matching_survey_submission_concurrency.sql'))
await db.exec(read('supabase/migrations/20261022180705_isolate_matching_submission_guard.sql'))
// Actual private AFTER audit is required before the cancellation fix may install.
await db.exec(`ALTER TABLE public.admin_users ADD COLUMN name text DEFAULT '隔离管理员';
 CREATE TABLE private.member_profile_audit_log(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id uuid REFERENCES public.members(id) ON DELETE CASCADE,member_id_snapshot uuid,
 action_type text,section text,changed_fields text[],before_values jsonb,after_values jsonb,
 reason text,source text,actor_user_id uuid,actor_admin_id uuid,actor_name text,metadata jsonb);
 ALTER TABLE private.member_profile_audit_log ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON private.member_profile_audit_log FROM PUBLIC,anon,authenticated;`)
const master=read('supabase/migrations/20260829175645_user_member_master_v1.sql')
await db.exec(extract(master,'private.member_master_lock_non_anonymized_subjects'))
await db.exec(extract(master,'private.member_master_changed_fields'))
await db.exec(extract(master,'private.member_master_audit_related_record_change'))
await db.exec(extract(read('supabase/migrations/20260830174115_fix_operational_audit_trigger_record_scope.sql'),'private.member_master_capture_operational_audit_reason'))
await db.exec('CREATE TRIGGER member_master_capture_audit_reason BEFORE INSERT OR UPDATE OR DELETE ON public.match_results FOR EACH ROW EXECUTE FUNCTION private.member_master_capture_operational_audit_reason()')
await db.exec('CREATE TRIGGER member_master_audit_related_change AFTER INSERT OR UPDATE OR DELETE ON public.match_results FOR EACH ROW EXECUTE FUNCTION private.member_master_audit_related_record_change()')
await db.exec(read('supabase/migrations/20261023173445_matching_cancellation_publication_boundary.sql'))
await db.exec(read('supabase/migrations/20261023173550_matching_run_eligibility_diagnostics.sql'))
await db.exec(read('supabase/migrations/20261023180532_matching_adjustment_unified_rules.sql'))
const rejects=async(work,pattern,message)=>{await assert.rejects(work,pattern,message);checks++}
const asAdmin=async()=>{await role('authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[adminUser]);await db.exec("SELECT set_config('request.jwt.claim.role','authenticated',false)")}
const asPlayer=async user=>{await role('authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec("SELECT set_config('request.jwt.claim.role','authenticated',false)")}
const asFixture=async()=>{await role();await db.exec("SELECT set_config('request.jwt.claim.role','service_role',false)")}
const answers=(mode='双人',date='2026-10-27')=>({game_type_pref:mode,gender_pref:'都可以',availability:{[date]:['下午']},interest_tags:['桌游'],social_style:null,message:'原问卷填写保持',custom_answers:{}})
let fixtureNumber=0
const fixture=async(modes=['双人','双人'])=>{
 await asFixture();const n=++fixtureNumber
 const round=await scalar("INSERT INTO public.match_rounds(round_name,status) VALUES($1,'draft') RETURNING id",[`发布前复核隔离${n}`])
 await db.query("UPDATE public.match_rounds SET status='open' WHERE id=$1",[round])
 const ids=modes.map(()=>randomUUID()),users=ids.map(()=>randomUUID()),saved=[]
 for(let i=0;i<ids.length;i++){
  await asFixture()
  await db.query('INSERT INTO public.members(id,user_id,member_number) VALUES($1,$2,$3)',[ids[i],users[i],`PUBLICATION_FIXTURE_${n}_${i}`])
  await db.query("INSERT INTO public.member_identity(member_id,full_name,gender,hobby_tags) VALUES($1,$2,'男',ARRAY['桌游'])",[ids[i],`隔离测试成员${n}-${i}`])
  await db.query("INSERT INTO public.member_interests(member_id,scenario_mode_pref) VALUES($1,ARRAY['多人本','双人本'])",[ids[i]])
  await db.query('INSERT INTO public.personality_quiz_results(member_id,score_e,score_a,score_o,score_c,score_n) VALUES($1,50,60,70,40,30)',[ids[i]])
  await asPlayer(users[i]);saved.push(await scalar('SELECT public.save_my_matching_submission($1,NULL,NULL,0,$2)',[round,answers(modes[i])]))
 }
 return {round,ids,users,saved,modes}
}
const run=async(f)=>{
 await server();const request=randomUUID()
 const receipt=await scalar("SELECT public.admin_begin_matching_run_v3($1,$2,$3,'最终发布复核隔离','隔离五步联合验收')",[f.round,request,admin])
 const engine=prepareMatchingRunInput(receipt.capture).engineInput
 const output=runFullMatching(engine.candidates,engine.config,new Map(engine.idMap),new Map(engine.pairRelations))
 const diagnostics=buildUnmatchedDiagnostics(engine,output.unmatchedIds)
 await scalar('SELECT public.admin_stage_matching_run($1,$2,$3,$4)',[request,admin,receipt.lease_token,engine])
 const done=await scalar('SELECT public.admin_complete_matching_run_v2($1,$2,$3,$4,$5,$6)',[request,admin,receipt.lease_token,output.rows,output.unmatchedIds,diagnostics])
 return {...f,session:done.session_id,request,receipt,engine,output}
}
const resultRows=async f=>{await asFixture();return scalar("SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY id),'[]'::jsonb) FROM public.match_results r WHERE session_id=$1",[f.session])}
const scoreRows=async f=>{await asFixture();return scalar("SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'member_a_id',member_a_id,'member_b_id',member_b_id,'group_members',group_members,'total_score',total_score,'score_breakdown',score_breakdown,'best_slot',best_slot,'rank',rank) ORDER BY id),'[]'::jsonb) FROM public.match_results WHERE session_id=$1",[f.session])}
const noticeCount=async f=>{await asFixture();return scalar('SELECT count(*)::integer FROM public.community_notifications WHERE match_session_id=$1',[f.session])}
// First reproduce the historical bypass against the real old public endpoint.
const old=await run(await fixture())
await asFixture();await db.query('UPDATE public.match_round_submissions SET cancelled_at=now() WHERE round_id=$1 AND member_id=$2',[old.round,old.ids[0]])
await asAdmin();check((await scalar("SELECT public.admin_publish_match_session($1,0,'证明旧发布未检查报名')",[old.session])).published,true,'old API reproduces publication despite withdrawn current registration')
await scalar("SELECT public.admin_unpublish_match_session($1,1,'隔离撤回旧故障证据')",[old.session])
await asFixture();await db.query('UPDATE public.match_round_submissions SET cancelled_at=NULL WHERE round_id=$1 AND member_id=$2',[old.round,old.ids[0]])
const publicationMigration='supabase/migrations/20261024091455_matching_publication_final_preflight.sql'
const businessDigestSql=`SELECT jsonb_build_object(
 'rounds',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM public.match_rounds r),
 'submissions',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM public.match_round_submissions r),
 'sessions',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM public.match_sessions r),
 'results',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM public.match_results r),
 'notifications',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM public.community_notifications r),
 'questionnaires',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM public.questionnaire_versions r))`
await asFixture();const businessBefore=await scalar(businessDigestSql)
const unchangedFunctions=await scalar(`SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(p.prosrc)) FROM pg_proc p WHERE p.oid IN (
 'matching_publication.unpublish_session(uuid,integer,text)'::regprocedure,
 'matching_publication.review_cancellation(uuid,integer,timestamptz,text,boolean)'::regprocedure,
 'matching_publication.request_cancellation(uuid,text,integer)'::regprocedure,
 'matching_adjustment.complete(uuid,uuid,uuid,jsonb,uuid[],jsonb)'::regprocedure)`)
await db.exec(read(publicationMigration))
check(await scalar(businessDigestSql),businessBefore,'guard migration does not rewrite any existing answer, scheme, questionnaire or notice')
const prepare=async(f,version=0)=>{await server();return scalar('SELECT public.admin_prepare_match_publication($1,$2,$3)',[f.session,admin,version])}
const authorize=async(f,prepared,version=0)=>{await server();return scalar('SELECT public.admin_authorize_match_publication($1,$2,$3,$4)',[f.session,admin,version,prepared.revision_token])}
const commit=async(f,proof,version=0)=>{await asAdmin();return scalar("SELECT public.admin_publish_checked_match_session($1,$2,'最终复核隔离发布',$3)",[f.session,version,proof.preflight_id])}
const checked=async(f,prepared,version=0)=>{const proof=await authorize(f,prepared,version);return proof.already_applied?proof:commit(f,proof,version)}
const publish=async(f,version=0)=>{const prepared=await prepare(f,version);if(prepared.already_applied)return prepared;assert.equal(inspectPublicationPreflight(preparePublicationPreflightInput(prepared.capture),prepared.current_rows).passed,true,'trusted publish stops before authorization when current hard inspection fails');return checked(f,prepared,version)}
const rejectedState=async f=>{await asFixture();return scalar(`SELECT jsonb_build_object('session',(SELECT to_jsonb(s) FROM public.match_sessions s WHERE id=$1),
 'results',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM public.match_results r WHERE session_id=$1),
 'publications',(SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY id),'[]') FROM matching_publication.publications p WHERE session_id=$1),
 'assignments',(SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY member_id),'[]') FROM matching_publication.active_assignments a WHERE round_id=$2),
 'notices',(SELECT COALESCE(jsonb_agg(to_jsonb(n) ORDER BY id),'[]') FROM public.community_notifications n WHERE match_session_id=$1))`,[f.session,f.round])}
const rejectLive=async(f,issue,label)=>{
 const before=await rejectedState(f)
 if(issue==='member_unavailable'){
  await rejects(()=>prepare(f),/MATCH_PUBLICATION_INELIGIBLE/,`${label} is rejected by SQL qualification before a proof can be issued`)
  check(await rejectedState(f),before,`${label} leaves draft, score, publication, assignments and notifications completely unchanged`)
  return null
 }
 const prepared=await prepare(f),input=preparePublicationPreflightInput(prepared.capture)
 const inspected=inspectPublicationPreflight(input,prepared.current_rows)
 check(inspected.passed,false,`${label} is rejected by the shared current-input inspection`)
 check(inspected.issues.some(row=>row.code===issue),true,`${label} reports its safe failure category`)
 // The trusted server stops here. Raw service credentials are not a browser capability.
 check(await rejectedState(f),before,`${label} leaves draft, score, publication, assignments and notifications completely unchanged`)
 return {prepared,input}
}


// RPCs are server-only; both the public old path and directly granted old
// internal function must fail closed without the trusted checked transaction.
for(const signature of [
 'public.admin_prepare_match_publication(uuid,uuid,integer)',
 'public.admin_authorize_match_publication(uuid,uuid,integer,text)',
])for(const actor of ['anon','authenticated','service_role'])check(await scalar("SELECT has_function_privilege($1,$2,'EXECUTE')",[actor,signature]),actor==='service_role',`${signature} has only service execution`)
const basic=await run(await fixture())
for(const sql of ["SELECT public.admin_publish_match_session($1,0,'旧公开入口不得绕过')","SELECT matching_publication.publish_session($1,0,'旧内部入口不得绕过')"]){
 await asAdmin();await rejects(()=>scalar(sql,[basic.session]),/MATCH_PUBLICATION_|permission denied/,'old administrator path cannot bypass preflight')
 await server();await rejects(()=>scalar(sql,[basic.session]),/MATCH_PUBLICATION_|permission denied/,'service cannot use the old path without a checked proof')
}
await server();await rejects(()=>scalar('SELECT public.admin_prepare_match_publication($1,$2,0)',[basic.session,randomUUID()]),/ADMIN/,'invalid service actor cannot capture current private matching inputs')
const initial=await prepare(basic)
check(inspectPublicationPreflight(preparePublicationPreflightInput(initial.capture),initial.current_rows).passed,true,'actual normal v3 output passes current qualification and hard constraints')
await asPlayer(basic.users[0]);check(await scalar('SELECT count(*)::integer FROM public.match_results WHERE session_id=$1',[basic.session]),0,'player cannot read an unpublished draft')
const basicScores=await scoreRows(basic)
const published=await checked(basic,initial)
check([published.published,published.publication_version],[true,1],'checked current proof publishes atomically')
check(await scoreRows(basic),basicScores,'publication leaves scores, scoring explanations, roster, rank and recommended time untouched')
check(await noticeCount(basic),2,'only the two explicit test accounts receive matching publication notices')
check((await publish(basic)).already_applied,true,'lost publish response is recovered idempotently')
check(await noticeCount(basic),2,'idempotent publication retry does not duplicate notifications')
await asFixture();await db.query('UPDATE public.match_round_submissions SET cancelled_at=clock_timestamp() WHERE round_id=$1 AND member_id=$2',[basic.round,basic.ids[0]])
check((await publish(basic)).already_applied,true,'later eligibility changes cannot turn an already successful version receipt into a second publish')
await asAdmin();check((await scalar("SELECT public.admin_publish_match_session($1,0,'旧入口只允许成功回执')",[basic.session])).already_applied,true,'old endpoint may return the already-applied publication receipt without a new proof')
check(await noticeCount(basic),2,'receipt recovery after current qualification changes creates no new notices')
await asFixture();await db.query('UPDATE public.match_round_submissions SET cancelled_at=NULL WHERE round_id=$1 AND member_id=$2',[basic.round,basic.ids[0]])
for(let i=0;i<basic.ids.length;i++){
 await asPlayer(basic.users[i]);const outcomes=await scalar('SELECT public.get_my_matching_publications()')
 check(outcomes.find(item=>item.round_id===basic.round)?.status,'matched',`test player ${i+1} sees a matched station outcome`)
 check(await scalar('SELECT count(*)::integer FROM public.match_results WHERE session_id=$1',[basic.session]),1,`test player ${i+1} can read the published partner and time`)
 check(await scalar('SELECT count(*)::integer FROM public.community_notifications WHERE recipient_member_id=$1 AND match_session_id=$2',[basic.ids[i],basic.session]),1,`test player ${i+1} has exactly one publication notice`)
}

// A pending adjustment to this exact saved plan must finish or fail before it
// can be published. A separate new normal run still uses the full pool.
const adjusting=await run(await fixture())
await asFixture();const adjustingResult=await scalar('SELECT id FROM public.match_results WHERE session_id=$1',[adjusting.session])
await server();const pendingAdjustment=await scalar("SELECT public.admin_begin_matching_adjustment($1,$2,'split','{}',$3,$4,'隔离未完成拆分操作',NULL)",[adjusting.session,admin,adjustingResult,randomUUID()])
await rejects(()=>prepare(adjusting),/MATCH_PUBLICATION_.*BUSY/,'publication refuses a still-running adjustment to the same scheme')
await server();await scalar("SELECT public.admin_fail_matching_adjustment($1,$2,$3,'SAVE_FAILED')",[pendingAdjustment.operation.id,admin,pendingAdjustment.lease_token])
check((await publish(adjusting)).published,true,'explicitly failed adjustment leaves the unchanged old scheme publishable')
const running=await run(await fixture())
await server();const runningRequest=randomUUID(),pendingRun=await scalar("SELECT public.admin_begin_matching_run_v3($1,$2,$3,'并行新批次隔离','隔离收集中再运行')",[running.round,runningRequest,admin])
check((await publish(running)).published,true,'a separate uncommitted normal run does not expand or replace the valid saved scheme')
await server();await scalar("SELECT public.admin_fail_matching_run($1,$2,$3,'SAVE_FAILED')",[runningRequest,admin,pendingRun.lease_token])

// A withdrawal after a completed run blocks the whole publication. Returning
// to qualification is an explicit fixture reset, never a publishing side effect.
const withdrawn=await run(await fixture())
await asFixture();await db.query('UPDATE public.match_round_submissions SET cancelled_at=clock_timestamp() WHERE round_id=$1 AND member_id=$2',[withdrawn.round,withdrawn.ids[0]])
await rejectLive(withdrawn,'member_unavailable','withdrawn round registration')
for(const [name,mutate,reset] of [
 ['profile readiness',async f=>{await db.query('INSERT INTO private.test_readiness VALUES($1,false)',[f.ids[0]])},async f=>{await db.query('DELETE FROM private.test_readiness WHERE member_id=$1',[f.ids[0]])}],
 ['approval status',async f=>{await db.query("UPDATE public.members SET status='pending' WHERE id=$1",[f.ids[0]])},async f=>{await db.query("UPDATE public.members SET status='approved' WHERE id=$1",[f.ids[0]])}],
 ['player membership',async f=>{await db.query("UPDATE public.members SET membership_type='staff' WHERE id=$1",[f.ids[0]])},async f=>{await db.query("UPDATE public.members SET membership_type='player' WHERE id=$1",[f.ids[0]])}],
 ['current record scope',async f=>{await db.query("UPDATE public.members SET record_scope='historical' WHERE id=$1",[f.ids[0]])},async f=>{await db.query("UPDATE public.members SET record_scope='current' WHERE id=$1",[f.ids[0]])}],
 ['active account',async f=>{await db.query("UPDATE public.members SET account_status='suspended' WHERE id=$1",[f.ids[0]])},async f=>{await db.query("UPDATE public.members SET account_status='active' WHERE id=$1",[f.ids[0]])}],
]){
 const f=await run(await fixture());await asFixture();await mutate(f);await rejectLive(f,'member_unavailable',name)
 await asFixture();await reset(f);check((await publish(f)).published,true,`${name} may publish after explicit correction`)
}

// Each hard constraint is tested after the plan was successfully scored and
// saved. The trusted service stops before authorizing a failed inspection.
for(const [name,mutate] of [
 ['duo game-type conflict',async f=>{await db.query("UPDATE public.match_round_submissions SET game_type_pref='多人' WHERE round_id=$1 AND member_id=$2",[f.round,f.ids[0]])}],
 ['two-way gender preference',async f=>{await db.query("UPDATE public.match_round_submissions SET gender_pref='女' WHERE round_id=$1 AND member_id=$2",[f.round,f.ids[0]])}],
 ['current taboo',async f=>{await db.query("INSERT INTO public.member_boundaries(member_id,taboo_tags) VALUES($1,ARRAY['桌游'])",[f.ids[0]])}],
 ['current manual blacklist',async f=>{await db.query("INSERT INTO public.pair_relationships VALUES($1,$2,'隔离当前禁配','blacklist')",[f.ids[0],f.ids[1]])}],
 ['old one-point blacklist',async f=>{await db.query('INSERT INTO public.mutual_reviews(reviewer_id,reviewee_id,overall_score) VALUES($1,$2,1)',[f.ids[0],f.ids[1]])}],
 ['old mutual-five cooldown',async f=>{await db.query('INSERT INTO public.mutual_reviews(reviewer_id,reviewee_id,overall_score) VALUES($1,$2,5),($2,$1,5)',[f.ids[0],f.ids[1]])}],
]){
 const f=await run(await fixture());await asFixture();await mutate(f);await rejectLive(f,'hard_constraint',name)
}
const originalTime=await run(await fixture())
await asFixture();await db.query('UPDATE public.match_round_submissions SET availability=$1 WHERE round_id=$2',[{'2026-10-28':['下午']},originalTime.round])
const badTime=await rejectLive(originalTime,'original_time_unavailable','different new common time cannot replace the stored recommendation')
// The server intentionally stops after this failed inspection and never seals a proof.

// Pool qualification and pairwise relationships apply to all members, while
// the existing gender rule remains at least one compatible peer per person.
const multi=await run(await fixture(Array(8).fill('多人')))
check([multi.output.rows.length,multi.output.totalMatched],[1,8],'eight-person actual output stays a single unrestricted multiplayer pool')
const multiScores=await scoreRows(multi)
await asFixture();await db.query("UPDATE public.match_round_submissions SET gender_pref='女' WHERE round_id=$1 AND member_id=$2",[multi.round,multi.ids[0]])
await rejectLive(multi,'hard_constraint','pool member has no gender-compatible peer')
await asFixture();await db.query("UPDATE public.member_identity SET gender='女' WHERE member_id=$1",[multi.ids[7]])
const poolPreparation=await prepare(multi)
check(inspectPublicationPreflight(preparePublicationPreflightInput(poolPreparation.capture),poolPreparation.current_rows).passed,true,'existing pool gender semantics accept at least one compatible peer')
await checked(multi,poolPreparation)
check(await scoreRows(multi),multiScores,'pool publishes its original actual mean and distribution without rescoring')
check(await noticeCount(multi),8,'all eight explicit test players receive a single pool notice')
const poolConflict=await run(await fixture(Array(8).fill('多人')))
await asFixture();await db.query("INSERT INTO public.pair_relationships VALUES($1,$2,'池尾成员硬冲突','blacklist')",[poolConflict.ids[6],poolConflict.ids[7]])
await rejectLive(poolConflict,'hard_constraint','pool conflict between two non-anchor members')

// Scoring-only changes do not become publication gates and never write new scores.
const softFixture=await run(await fixture()),softScores=await scoreRows(softFixture)
const softPreparation=await prepare(softFixture)
await asFixture();await db.query('UPDATE public.personality_quiz_results SET score_e=99,score_a=1 WHERE member_id=ANY($1)',[softFixture.ids])
await db.query("UPDATE public.questionnaire_versions SET template=$1 WHERE id=$2",[{quizConfig:{dimensions:{E:{matchWeight:1},A:{matchWeight:0},O:{matchWeight:0},C:{matchWeight:0},N:{matchWeight:0}}}},quiz])
await db.query("INSERT INTO private.round_peer_review_settings(round_id,opens_at,closes_at,roster_confirmed) VALUES($1,now()-interval '1 day',now()+interval '1 day',true)",[softFixture.round])
for(const member of softFixture.ids)await db.query("INSERT INTO private.round_peer_review_participants(round_id,member_id,source) VALUES($1,$2,'registered')",[softFixture.round,member])
await db.query('INSERT INTO private.round_peer_reviews(round_id,reviewer_id,reviewee_id,score) VALUES($1,$2,$3,1)',[softFixture.round,softFixture.ids[0],softFixture.ids[1]])
check((await checked(softFixture,softPreparation)).published,true,'personality scores, published dimension weights and new activity feedback do not invalidate a hard-only proof')
check(await scoreRows(softFixture),softScores,'old frozen duo score and factor explanations survive live soft-score changes')

// CAS binds proof to the exact draft and current hard inputs. Newly registered
// unrelated players preserve ongoing collection and do not poison the proof.
const stale=await run(await fixture()),staleProof=await prepare(stale)
await asFixture();await db.query("UPDATE public.match_round_submissions SET availability=$1 WHERE round_id=$2 AND member_id=$3",[{'2026-10-28':['下午']},stale.round,stale.ids[0]])
const staleState=await rejectedState(stale)
await rejects(()=>checked(stale,staleProof),/MATCH_PUBLICATION_.*STALE|MATCH_PUBLICATION_.*CONSTRAINT/,'hard-input update after preparation rejects stale proof')
check(await rejectedState(stale),staleState,'stale proof creates no publication or notices')
const rowStale=await run(await fixture()),rowProof=await prepare(rowStale)
await asAdmin();await db.query("UPDATE public.match_results SET status='locked',locked_by=$1,locked_at=clock_timestamp(),audit_reason='隔离合法锁定方案' WHERE session_id=$2",[admin,rowStale.session])
await rejects(()=>checked(rowStale,rowProof),/MATCH_PUBLICATION_.*STALE|MATCH_PUBLICATION_.*CHANGED/,'saved-result change after preparation rejects stale proof')
const collecting=await run(await fixture()),collectingProof=await prepare(collecting)
await asFixture();const late=randomUUID(),lateUser=randomUUID()
await db.query("INSERT INTO public.members(id,user_id,member_number) VALUES($1,$2,'PUBLICATION_LATE_FIXTURE')",[late,lateUser])
await db.query("INSERT INTO public.member_identity(member_id,full_name,gender) VALUES($1,'后到隔离账号','男')",[late])
await asPlayer(lateUser);await scalar('SELECT public.save_my_matching_submission($1,NULL,NULL,0,$2)',[collecting.round,answers()])
check((await checked(collecting,collectingProof)).published,true,'late unrelated signup is accepted while the preexisting valid plan publishes')
await asFixture();check(await scalar('SELECT status FROM public.match_rounds WHERE id=$1',[collecting.round]),'open','publication preserves collect-while-running mode')
check(await scalar('SELECT count(*)::integer FROM public.community_notifications WHERE recipient_member_id=$1',[late]),0,'unmatched late applicant is not sent a test notice for an earlier frozen batch')

// The short proof is private, actor-bound, single-use and rechecked inside the
// authenticated write. No test here claims multi-connection race execution.
await asFixture()
for(const actor of ['anon','authenticated','service_role'])for(const table of ['matching_publication_preflight.proofs','matching_publication_preflight.write_context'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])check(await scalar('SELECT has_table_privilege($1,$2,$3)',[actor,table,privilege]),false,`${actor} has no ${privilege} grant on ${table}`)
for(const actor of ['anon','authenticated','service_role'])check(await scalar("SELECT has_function_privilege($1,'public.admin_publish_checked_match_session(uuid,integer,text,uuid)','EXECUTE')",[actor]),actor==='authenticated','checked final publish retains authenticated administrator identity')
check(await scalar("SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='matching_publication_preflight' AND c.relkind='r' AND c.relrowsecurity"),2,'proof and trusted-context tables both have RLS enabled')
const proofFixture=await run(await fixture()),proofPreparation=await prepare(proofFixture)
check(inspectPublicationPreflight(preparePublicationPreflightInput(proofPreparation.capture),proofPreparation.current_rows).passed,true,'proof test is initially valid under the actual hard validator')
const issued=await authorize(proofFixture,proofPreparation)
await role('authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[ctx.superUser])
await rejects(()=>scalar("SELECT public.admin_publish_checked_match_session($1,0,'另一个管理员不能借用凭证',$2)",[proofFixture.session,issued.preflight_id]),/PREFLIGHT_INVALID/,'proof cannot be borrowed by a different valid administrator')
await asPlayer(proofFixture.users[0]);await rejects(()=>scalar("SELECT public.admin_publish_checked_match_session($1,0,'普通成员不能发布结果',$2)",[proofFixture.session,issued.preflight_id]),/ADMIN_REQUIRED/,'participant cannot use an administrator proof')
await asAdmin();await rejects(()=>db.query('INSERT INTO matching_publication_preflight.write_context VALUES(txid_current(),pg_backend_pid(),$1,$2)',[proofFixture.session,issued.preflight_id]),/permission denied/,'browser administrator cannot forge the private transaction context')
await asFixture();await db.query('UPDATE matching_publication_preflight.proofs SET expires_at=clock_timestamp()-interval \'1 second\' WHERE id=$1',[issued.preflight_id])
await rejects(()=>commit(proofFixture,issued),/PREFLIGHT_EXPIRED/,'expired proof requires another current hard validation')
check(await noticeCount(proofFixture),0,'expired or stolen proof sends no notifications')

const legacyGate=await run(await fixture())
await asFixture();await db.query("INSERT INTO public.member_boundaries(member_id,taboo_tags) VALUES($1,ARRAY['导入硬冲突'])",[legacyGate.ids[0]])
const legacyMetadata={source:'legacy-temp',normalized_name:'',legacy_profile:{interest_tags:['导入硬冲突'],social_tags:[]}}
await db.query('UPDATE public.match_round_submissions SET import_metadata=$1 WHERE round_id=$2 AND member_id=$3',[legacyMetadata,legacyGate.round,legacyGate.ids[1]])
const legacyPreparation=await prepare(legacyGate),legacyInput=preparePublicationPreflightInput(legacyPreparation.capture)
check(inspectPublicationPreflight(legacyInput,legacyPreparation.current_rows).passed,true,'invalid legacy metadata gate leaves original profile hard tags in effect')
const legacyProof=await authorize(legacyGate,legacyPreparation)
await asFixture();await db.query('UPDATE public.match_round_submissions SET import_metadata=$1 WHERE round_id=$2 AND member_id=$3',[{...legacyMetadata,normalized_name:'现在启用导入资料'},legacyGate.round,legacyGate.ids[1]])
const legacyCurrent=await prepare(legacyGate)
check(legacyCurrent.capture.source.eligibility.map(e=>[e.eligible,e.import_exempt]),legacyPreparation.capture.source.eligibility.map(e=>[e.eligible,e.import_exempt]),'legacy gate counterexample keeps qualification and import exemption flags exactly unchanged')
check(inspectPublicationPreflight(preparePublicationPreflightInput(legacyCurrent.capture),legacyCurrent.current_rows).passed,false,'activating legacy hard tags introduces a real current taboo conflict')
await rejects(()=>commit(legacyGate,legacyProof),/PREFLIGHT_STALE/,'legacy import validity gate change invalidates the previously signed proof')
check(await noticeCount(legacyGate),0,'legacy gate race does not publish or notify')

const signed=await run(await fixture()),signedPreparation=await prepare(signed),signedProof=await authorize(signed,signedPreparation)
await asFixture();await db.query("INSERT INTO public.pair_relationships VALUES($1,$2,'签发后新增硬冲突','blacklist')",[signed.ids[0],signed.ids[1]])
await rejects(()=>commit(signed,signedProof),/PREFLIGHT_STALE/,'new hard conflict after proof issuance is rejected by the final authenticated transaction')
check(await noticeCount(signed),0,'stale issued proof creates no notice or partial publication')
const noLongerEligible=await run(await fixture()),eligiblePreparation=await prepare(noLongerEligible),eligibleProof=await authorize(noLongerEligible,eligiblePreparation)
await asFixture();await db.query('UPDATE public.match_round_submissions SET cancelled_at=clock_timestamp() WHERE round_id=$1 AND member_id=$2',[noLongerEligible.round,noLongerEligible.ids[0]])
await rejects(()=>commit(noLongerEligible,eligibleProof),/INELIGIBLE/,'registration withdrawal after proof issuance is checked again by final SQL')
check(await noticeCount(noLongerEligible),0,'newly ineligible member cannot be published using an earlier proof')

const atomic=await run(await fixture()),atomicPreparation=await prepare(atomic),atomicProof=await authorize(atomic,atomicPreparation)
await asFixture();const atomicBefore=await rejectedState(atomic)
await db.exec(`CREATE FUNCTION public.preflight_fixture_notice_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.match_session_id='${atomic.session}'::uuid THEN RAISE EXCEPTION 'FIXTURE_PUBLICATION_NOTICE_FAILED'; END IF; RETURN NEW; END$$;
 CREATE TRIGGER preflight_fixture_notice_failure BEFORE INSERT ON public.community_notifications FOR EACH ROW EXECUTE FUNCTION public.preflight_fixture_notice_failure()`)
await rejects(()=>commit(atomic,atomicProof),/FIXTURE_PUBLICATION_NOTICE_FAILED/,'notification insertion failure rolls back the whole original publication transaction')
check(await rejectedState(atomic),atomicBefore,'notification failure leaves scores, assignments, roster publication and draft state untouched')
await asFixture();check(await scalar('SELECT used_at IS NULL FROM matching_publication_preflight.proofs WHERE id=$1',[atomicProof.preflight_id]),true,'failed transaction does not consume the proof')
check(await scalar('SELECT count(*)::integer FROM matching_publication_preflight.write_context'),0,'failed publication leaves no trusted proof context')
check(await scalar('SELECT count(*)::integer FROM matching_publication.write_context'),0,'failed publication leaves no legacy write context')
await db.exec('DROP TRIGGER preflight_fixture_notice_failure ON public.community_notifications')
check((await commit(atomic,atomicProof)).published,true,'the same unconsumed valid proof succeeds after the failure cause is removed')
check(await noticeCount(atomic),2,'recovered atomic publish notifies each test recipient once')
await asFixture();check(await scalar('SELECT used_at IS NOT NULL FROM matching_publication_preflight.proofs WHERE id=$1',[atomicProof.preflight_id]),true,'successful publication records consumption of its proof')

const privacy=await run(await fixture()),privacyPreparation=await prepare(privacy),privacyProof=await authorize(privacy,privacyPreparation)
await asFixture();await db.query("UPDATE public.members SET anonymized_at=clock_timestamp(),account_status='closed' WHERE id=$1",[privacy.ids[0]])
check(await scalar("SELECT member_ids='{}'::uuid[] AND revision_token='privacy-redacted' AND redacted_at IS NOT NULL FROM matching_publication_preflight.proofs WHERE id=$1",[privacyProof.preflight_id]),true,'member erasure removes private proof roster and invalidates its token')
await rejects(()=>commit(privacy,privacyProof),/INELIGIBLE|PREFLIGHT_INVALID/,'an anonymized participant cannot be restored through a saved publication proof')
check(await noticeCount(privacy),0,'privacy invalidation never sends a publication notification')

// Existing versioned withdrawal/cancellation rules remain unchanged.
await asPlayer(basic.users[0])
const actualId=await scalar('SELECT id FROM public.match_results WHERE session_id=$1',[basic.session])
await scalar("SELECT public.request_my_match_cancellation($1,'测试账号取消申请',1)",[actualId])
const token=await scalar('SELECT cancellation_requested_at::text FROM public.match_results WHERE id=$1',[actualId])
await asAdmin();await scalar("SELECT public.admin_unpublish_match_session($1,1,'测试保留原撤回规则')",[basic.session])
check((await publish(basic,1)).publication_version,2,'explicit existing withdrawal then checked reissue increments version normally')
await asAdmin();await rejects(()=>scalar("SELECT public.admin_approve_matching_cancellation($1,2,$2,'旧申请不能影响新版')",[actualId,token]),/STALE/,'old cancellation request cannot cross publication versions')
await asFixture();check(await scalar(`SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(p.prosrc)) FROM pg_proc p WHERE p.oid IN (
 'matching_publication.unpublish_session(uuid,integer,text)'::regprocedure,
 'matching_publication.review_cancellation(uuid,integer,timestamptz,text,boolean)'::regprocedure,
 'matching_publication.request_cancellation(uuid,text,integer)'::regprocedure,
 'matching_adjustment.complete(uuid,uuid,uuid,jsonb,uuid[],jsonb)'::regprocedure)`),unchangedFunctions,'withdrawal, cancellation and adjustment-save function definitions remain unchanged')
check(await scalar('SELECT count(*)::integer FROM matching_publication.write_context'),0,'every successful or failed checked publication clears the trusted transaction context')
await asFixture();const postflight=(await db.exec(read('supabase/audits/matching-publication-preflight-postflight.sql'))).flatMap(result=>result.rows??[]).find(row=>row.verification)?.verification
check(postflight.status,'PASS',`read-only postflight confirms the actual final schema: ${JSON.stringify(postflight.checks)}`)
console.log(`Matching publication preflight audit: ${checks} checks passed; isolated PGlite only; fixtures are fake test accounts.`)
await db.close();rmSync(temporary,{recursive:true,force:true})
