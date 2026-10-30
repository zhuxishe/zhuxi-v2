// Atomic three-pool board transactions with actual TypeScript rules and PostgreSQL guards.
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
const temporary=mkdtempSync(join(tmpdir(),'matching-board-'))
const bundle=await build({stdin:{contents:`export {prepareMatchingRunInput} from './src/lib/matching/run-input'; export {runFullMatching} from './src/lib/matching/run-matching'; export {buildUnmatchedDiagnostics} from './src/lib/matching/unmatched-diagnostics'; export {buildManualAdjustment,inspectManualAdjustment,runPoolAdjustment} from './src/lib/matching/adjustment-engine'; export {preparePublicationPreflightInput,inspectPublicationPreflight} from './src/lib/matching/publication-preflight'`,resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',alias:{'@':join(root,'src')}})
writeFileSync(join(temporary,'engine.mjs'),bundle.outputFiles[0].contents)
const {prepareMatchingRunInput,runFullMatching,buildUnmatchedDiagnostics,buildManualAdjustment,inspectManualAdjustment,runPoolAdjustment,preparePublicationPreflightInput,inspectPublicationPreflight}=await import(pathToFileURL(join(temporary,'engine.mjs')).href)
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

await db.exec(read('supabase/migrations/20261024091455_matching_publication_final_preflight.sql'))
// Use the actual current test-domain source/commit guards. Unrelated account
// provisioning and community fixtures are covered by test-account-pool-pglite.
const testScopeSql=read('supabase/migrations/20261025041806_test_account_pool_isolation.sql')
await db.exec('ALTER TABLE public.members ADD COLUMN is_test boolean NOT NULL DEFAULT false; ALTER TABLE public.match_rounds ADD COLUMN is_test boolean NOT NULL DEFAULT false;')
const scopeTableStart=testScopeSql.indexOf('CREATE TABLE private.test_round_members(')
await db.exec(testScopeSql.slice(scopeTableStart,testScopeSql.indexOf('\n);',scopeTableStart)+3))
const scopeFunction=(name)=>{
 const start=testScopeSql.indexOf('CREATE FUNCTION '+name+'(');assert.ok(start>=0,name)
 const end=testScopeSql.indexOf('$function$;',testScopeSql.indexOf('AS $function$',start))+'$function$;'.length
 return testScopeSql.slice(start,end)
}
for(const name of ['private.test_account_round_allowed','private.test_round_same_domain','private.test_review_same_domain','private.test_pool_assert_session_scope','private.test_pool_guard_result','private.test_pool_guard_notification'])await db.exec(scopeFunction(name))
await db.exec(`CREATE TRIGGER test_pool_result_scope BEFORE INSERT OR UPDATE OF session_id,member_a_id,member_b_id,group_members ON public.match_results FOR EACH ROW EXECUTE FUNCTION private.test_pool_guard_result();
 CREATE TRIGGER test_pool_diagnostic_scope BEFORE INSERT OR UPDATE OF session_id,member_id ON public.unmatched_diagnostics FOR EACH ROW EXECUTE FUNCTION private.test_pool_guard_result();
 CREATE TRIGGER test_pool_notification_scope BEFORE INSERT OR UPDATE OF recipient_member_id,round_id ON public.community_notifications FOR EACH ROW EXECUTE FUNCTION private.test_pool_guard_notification();`)
const sourceScopeStart=testScopeSql.indexOf('DO $migration$',testScopeSql.indexOf('-- Guarded surgical changes'))
await db.exec(testScopeSql.slice(sourceScopeStart,testScopeSql.indexOf('$migration$;',sourceScopeStart)+'$migration$;'.length))
await db.exec(read('supabase/migrations/20261025161221_matching_three_pool_board.sql'))
await db.exec(read('supabase/migrations/20261025170225_matching_board_member_locks.sql'))
await db.exec(read('supabase/migrations/20261027223546_matching_board_time_groups.sql'))
if(process.env.MATCHING_BOARD_SMALL_GROUP_SKIP_MIGRATION!=='1')await db.exec(read('supabase/migrations/20261030103412_matching_board_small_groups.sql'))
const ids=Array.from({length:12},()=>randomUUID()),users=ids.map(()=>randomUUID())
for(let i=0;i<ids.length;i++){
 await db.query('INSERT INTO public.members(id,user_id,member_number) VALUES($1,$2,$3)',[ids[i],users[i],`BOARD_${i}`])
 await db.query("INSERT INTO public.member_identity(member_id,full_name,gender,hobby_tags) VALUES($1,$2,'male',ARRAY['桌游'])",[ids[i],`三池隔离成员${i}`])
 await db.query("INSERT INTO public.member_interests(member_id,scenario_mode_pref) VALUES($1,ARRAY['多人本','双人本'])",[ids[i]])
 await db.query('INSERT INTO public.personality_quiz_results(member_id,score_e,score_a,score_o,score_c,score_n) VALUES($1,50,60,70,40,30)',[ids[i]])
}
const player=async i=>{await role('authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[users[i]]);await db.exec("SELECT set_config('request.jwt.claim.role','authenticated',false)")}
const adminRole=async()=>{await role('authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[adminUser]);await db.exec("SELECT set_config('request.jwt.claim.role','authenticated',false)")}
const round=await scalar("INSERT INTO public.match_rounds(round_name,status) VALUES('三池完整事务隔离','draft') RETURNING id")
await db.query("UPDATE public.match_rounds SET status='open' WHERE id=$1",[round])
const answers=(mode='双人',date='2026-10-27')=>({game_type_pref:mode,gender_pref:'都可以',availability:{[date]:['下午']},interest_tags:['桌游'],social_style:null,message:'原问卷保持',custom_answers:{}})
const saved=[]
const submit=async(i,payload=answers())=>{await player(i);saved[i]=await scalar('SELECT public.save_my_matching_submission($1,$2,$3,0,$4)',[round,saved[i]?.id??null,saved[i]?.updated_at??null,payload]);return saved[i]}
for(let i=0;i<10;i++){const payload=answers(i>=4&&i<=7?'多人':i>=8?'都可以':'双人',i===8?'2026-10-28':i===9?'2026-10-29':'2026-10-27');if(i>=4&&i<=7)payload.availability['2026-10-30']=['下午'];await submit(i,payload)}
await server()
const request=randomUUID()
const normal=await scalar("SELECT public.admin_begin_matching_run_v3($1,$2,$3,'三池原始批次','隔离创建原始匹配方案')",[round,request,admin])
const normalEngine=prepareMatchingRunInput(normal.capture).engineInput
const normalOutput=runFullMatching(normalEngine.candidates,normalEngine.config,new Map(normalEngine.idMap),new Map(normalEngine.pairRelations))
await scalar('SELECT public.admin_stage_matching_run($1,$2,$3,$4)',[request,admin,normal.lease_token,normalEngine])
const normalDone=await scalar('SELECT public.admin_complete_matching_run_v2($1,$2,$3,$4,$5,$6)',[request,admin,normal.lease_token,normalOutput.rows,normalOutput.unmatchedIds,buildUnmatchedDiagnostics(normalEngine,normalOutput.unmatchedIds)])
const session=normalDone.session_id
check([normalOutput.totalMatched,normalOutput.unmatchedIds.length],[8,2],'original actual matching engine produces two duos, one pool and two unmatched')
for(let i=10;i<12;i++)await submit(i)
const get=async()=>{await server();return scalar('SELECT public.admin_get_matching_board($1,$2)',[session,admin])}
const rejects=async(work,pattern,message)=>{await assert.rejects(work,pattern,message);checks++}
const emptyLayout={waitingDuoIds:[],brokenPairs:[]}
const params=(board,{keep=board.results.map(r=>r.id),rows=[],unmatched=ids.slice(8,10),layout=emptyLayout,operation=randomUUID(),engine=prepareMatchingRunInput(board.capture).engineInput,requestHash='a'.repeat(64),revision=board.base_revision}={})=>[session,admin,operation,'隔离三池统一保存验证',revision,engine,keep,rows,layout,unmatched,requestHash]
const persist=async args=>{await server();return scalar('SELECT public.admin_save_matching_board($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',args)}
export const boardAuditContext={db,scalar,role,read,admin,adminUser,server,adminRole,player,round,session,ids,users,get,params,persist,answers,submit,prepareMatchingRunInput,buildManualAdjustment,preparePublicationPreflightInput,inspectPublicationPreflight,temporary}
if(process.env.MATCHING_BOARD_MEMBER_LOCK_SUITE!=='1'){
let board=await get()
check(board.cohort_member_ids.slice().sort(),ids.slice(0,10).sort(),'later registrations never enter original cohort')
check(board.capture.source.submissions.length,10,'source excludes later registrations too')
check(board.results.length,3,'captured rows include every active original result')
await role()
const originalInput=await scalar('SELECT to_jsonb(s) FROM matching_run.snapshots s WHERE session_id=$1',[session])
const baselineCounts=await scalar("SELECT jsonb_build_object('notices',(SELECT count(*) FROM public.community_notifications),'publications',(SELECT count(*) FROM matching_publication.publications))")
const wrappers=['public.admin_get_matching_board(uuid,uuid)','public.admin_get_matching_board_operation(uuid,uuid)','public.admin_save_matching_board(uuid,uuid,uuid,text,text,jsonb,uuid[],jsonb,jsonb,uuid[],text)']
for(const signature of wrappers)for(const actor of ['anon','authenticated','service_role'])check(await scalar("SELECT has_function_privilege($1,$2,'EXECUTE')",[actor,signature]),actor==='service_role',`${signature} is server-only`)
for(const actor of ['anon','authenticated','service_role'])for(const table of ['matching_board.operations','matching_board.state'])check(await scalar("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE')",[actor,table]),false,`${actor} cannot read or change private board tables`)
await server();await rejects(()=>scalar('SELECT public.admin_get_matching_board($1,$2)',[session,randomUUID()]),/ADMIN/,'unknown actor cannot capture')
await adminRole();await rejects(()=>scalar('SELECT public.admin_get_matching_board($1,$2)',[session,admin]),/permission denied/,'browser administrator cannot capture sensitive input')
const duos=board.results.filter(r=>r.member_b_id),pool=board.results.find(r=>!r.member_b_id)
const keptDuo=duos[0],splitDuo=duos[1],splitIds=[splitDuo.member_a_id,splitDuo.member_b_id]
const layout={waitingDuoIds:splitIds,brokenPairs:[{key:splitDuo.id,memberIds:splitIds}]}
const splitSource=board.capture.source
const splitArgs=params(board,{keep:[keptDuo.id,pool.id],unmatched:[...splitIds,...ids.slice(8,10)],layout})
const splitResult=await persist(splitArgs)
check(splitResult.already_applied,false,'first atomic save returns a new receipt')
board=await get()
check(splitResult.base_revision,board.base_revision,'receipt revision matches the committed board snapshot')
check(board.layout,layout,'gray pair and waiting position survive a fresh capture')
check(board.results.length,2,'split cancels only the intended pair')
check(board.operations.map(o=>Object.keys(o).sort()),[['created_at','id','member_count','result_count']],'board history metadata exposes no actor or private reason')
check(board.operations[0].id,splitArgs[2],'saved operation appears in read-only history')
await role()
check(await scalar('SELECT to_jsonb(r) FROM public.match_results r WHERE id=$1',[keptDuo.id]),keptDuo,'kept duo is preserved byte-for-byte')
check(await scalar('SELECT to_jsonb(r) FROM public.match_results r WHERE id=$1',[pool.id]),pool,'kept multi pool and its time/score are preserved byte-for-byte')
check(await scalar('SELECT total_matched FROM public.match_sessions WHERE id=$1',[session]),6,'unpaired people never count as matched')
check(await scalar('SELECT source=$2::jsonb AND engine_input=$3::jsonb FROM matching_board.operations WHERE id=$1',[splitArgs[2],splitSource,splitArgs[5]]),true,'saved audit snapshot exactly matches the source and engine used by this operation')
check(await scalar('SELECT source IS NOT NULL AND engine_input=$2::jsonb AND cardinality(subject_ids)>=cardinality(member_ids) FROM matching_board.operations WHERE id=$1',[splitArgs[2],splitArgs[5]]),true,'same atomic save preserves actual current input and engine with privacy subjects')
const resultCount=await scalar('SELECT count(*)::integer FROM public.match_results WHERE session_id=$1',[session])
check((await persist(splitArgs)).already_applied,true,'exact saved payload replay is idempotent')
await role();check(await scalar('SELECT count(*)::integer FROM public.match_results WHERE session_id=$1',[session]),resultCount,'replay does not create extra results')
await server()
check((await scalar('SELECT public.admin_get_matching_board_operation($1,$2)',[splitArgs[2],admin])).request_hash,'a'.repeat(64),'lost-response receipt binds original server request hash')
check(await scalar('SELECT public.admin_get_matching_board_operation($1,$2)',[randomUUID(),admin]),null,'unknown operation has no receipt')
const changedReplay=[...splitArgs];changedReplay[3]='改变已保存请求理由'
await rejects(()=>persist(changedReplay),/REQUEST_CONFLICT/,'same operation ID rejects another payload')
await rejects(()=>persist(params(board,{keep:[keptDuo.id,pool.id],unmatched:[...splitIds,...ids.slice(8,10),ids[10]]})),/COHORT_MISMATCH/,'later entrant cannot be smuggled into unmatched')
await rejects(()=>persist(params(board,{keep:[keptDuo.id,pool.id],unmatched:[...splitIds,...ids.slice(8,10),splitIds[0]]})),/COHORT_MISMATCH/,'duplicate partition member rejected')
await rejects(()=>persist(params(board,{keep:[keptDuo.id,pool.id],unmatched:[...splitIds,...ids.slice(8,10)],layout:{waitingDuoIds:[keptDuo.member_a_id],brokenPairs:[]}})),/LAYOUT_INVALID/,'matched member cannot appear in waiting layout')
await rejects(()=>persist(params(board,{keep:[keptDuo.id,pool.id],unmatched:[...splitIds,...ids.slice(8,10)],layout:{waitingDuoIds:splitIds,brokenPairs:[{memberIds:splitIds},{memberIds:splitIds}]}})),/LAYOUT_INVALID/,'one person cannot appear in two gray links')
const engine=prepareMatchingRunInput(board.capture).engineInput
const newDuo=buildManualAdjustment(engine,splitIds)
const badTime=structuredClone(newDuo);badTime[0].best_slot='2026-10-29_下午'
await rejects(()=>persist(params(board,{rows:badTime,unmatched:ids.slice(8,10)})),/CONSTRAINT/,'no-common-time pair rejected by SQL')
const extraMulti=buildManualAdjustment(engine,[...pool.group_members])
await rejects(()=>persist(params(board,{rows:extraMulti,unmatched:[...splitIds,...ids.slice(8,10)]})),/SECOND_MULTI_POOL/,'existing multi pool forbids a second pool')
const retimed=structuredClone(extraMulti);retimed[0].best_slot='2026-10-30_下午'
await rejects(()=>persist(params(board,{keep:[keptDuo.id],rows:retimed,unmatched:[...splitIds,...ids.slice(8,10)]})),/MULTI_TIME_CHANGED/,'even another valid common slot cannot replace the existing pool time')
await adminRole()
await db.query("UPDATE public.match_results SET status='locked',locked_by=$1,locked_at=now(),audit_reason='验证锁定保护' WHERE id=$2",[admin,keptDuo.id])
let locked=await get()
await rejects(()=>persist(params(locked,{keep:[pool.id],unmatched:[...splitIds,...ids.slice(8,10),keptDuo.member_a_id,keptDuo.member_b_id]})),/LOCKED/,'locked result cannot be removed')
await adminRole();await db.query("UPDATE public.match_results SET status='draft',locked_by=NULL,locked_at=NULL,audit_reason='恢复隔离锁定' WHERE id=$1",[keptDuo.id])
await rejects(()=>persist(params(locked,{rows:newDuo,unmatched:ids.slice(8,10)})),/STALE/,'another editor changing result metadata invalidates old board')
board=await get()
const beforeInputChange=board
await submit(8,answers('都可以','2026-10-27'))
await rejects(()=>persist(params(beforeInputChange,{unmatched:[...splitIds,...ids.slice(8,10)]})),/STALE/,'changed availability invalidates the displayed board before save')
board=await get()
// Score-only source drift also invalidates a displayed preview.
const beforeScoreChange=board
await role();await db.query('UPDATE public.personality_quiz_results SET score_e=80 WHERE member_id=$1',[ids[8]])
await rejects(()=>persist(params(beforeScoreChange,{unmatched:[...splitIds,...ids.slice(8,10)]})),/STALE/,'changed personality score invalidates preview without changing hard constraints')
board=await get()
// Preserving a score is not permission to preserve an invalid current pair.
const keptIndex=ids.indexOf(keptDuo.member_a_id)
await submit(keptIndex,answers('双人','2026-10-31'))
const invalidKept=await get()
await rejects(()=>persist(params(invalidKept,{unmatched:[...splitIds,...ids.slice(8,10)]})),/CONSTRAINT/,'SQL rechecks current common time for an unchanged kept pair without rewriting its score')
await submit(keptIndex,answers())
board=await get()
// Existing asynchronous adjustment worker excludes board saves.
await server()
const busy=await scalar("SELECT public.admin_begin_matching_adjustment($1,$2,'manual',$3,NULL,$4,'隔离并发占用检查',NULL)",[session,admin,splitIds,randomUUID()])
await rejects(()=>persist(params(board,{unmatched:[...splitIds,...ids.slice(8,10)]})),/BUSY/,'live manual worker blocks board save')
await scalar("SELECT public.admin_fail_matching_adjustment($1,$2,$3,'SAVE_FAILED')",[busy.operation.id,admin,busy.lease_token])
board=await get()
// Force a failure after cancellation and verify full transactional rollback,
// including private operational audits and saved gray layout.
await role()
const rollbackBefore=await scalar("SELECT jsonb_build_object('results',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.match_results r WHERE session_id=$1),'session',(SELECT to_jsonb(s) FROM public.match_sessions s WHERE id=$1),'audit',(SELECT count(*) FROM private.member_profile_audit_log),'state',(SELECT to_jsonb(s) FROM matching_board.state s WHERE session_id=$1),'ops',(SELECT count(*) FROM matching_board.operations))",[session])
await db.exec("CREATE FUNCTION private.board_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'BOARD_TEST_ROLLBACK'; END$$; CREATE TRIGGER board_test_failure BEFORE INSERT ON public.match_results FOR EACH ROW EXECUTE FUNCTION private.board_test_failure()")
const combinedPool=buildManualAdjustment(prepareMatchingRunInput(board.capture).engineInput,[...pool.group_members,ids[8]])
const failedArgs=params(board,{keep:[keptDuo.id],rows:combinedPool,unmatched:[...splitIds,ids[9]],layout})
await rejects(()=>persist(failedArgs),/BOARD_TEST_ROLLBACK/,'injected insert failure rolls back earlier cancellation')
await role()
check(await scalar("SELECT jsonb_build_object('results',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.match_results r WHERE session_id=$1),'session',(SELECT to_jsonb(s) FROM public.match_sessions s WHERE id=$1),'audit',(SELECT count(*) FROM private.member_profile_audit_log),'state',(SELECT to_jsonb(s) FROM matching_board.state s WHERE session_id=$1),'ops',(SELECT count(*) FROM matching_board.operations))",[session]),rollbackBefore,'all result/session/audit/layout/receipt writes roll back together')
await db.exec('DROP TRIGGER board_test_failure ON public.match_results; DROP FUNCTION private.board_test_failure()')
const enlarged=await persist(failedArgs)
check(enlarged.already_applied,false,'same operation can retry after a rolled back failure')
board=await get()
check(board.results.find(r=>!r.member_b_id).group_members.length,5,'valid multi addition preserves one pool')
check(board.results.find(r=>!r.member_b_id).best_slot,pool.best_slot,'existing multi pool time remains fixed')
check(board.layout,layout,'unrelated pool change keeps gray duo intact')
const repairedRows=buildManualAdjustment(prepareMatchingRunInput(board.capture).engineInput,splitIds)
await persist(params(board,{rows:repairedRows,unmatched:[ids[9]]}))
board=await get()
check(board.layout,emptyLayout,'pairing clears saved waiting and gray state')
check(board.results.length,3,'new pair plus kept pair and expanded pool are valid')
await role()
check(await scalar('SELECT to_jsonb(s) FROM matching_run.snapshots s WHERE session_id=$1',[session]),originalInput,'original automatic input snapshot is unchanged')
check(await scalar("SELECT jsonb_build_object('notices',(SELECT count(*) FROM public.community_notifications),'publications',(SELECT count(*) FROM matching_publication.publications))"),baselineCounts,'board draft saves create no publication or notification')
// A fresh capture still cannot keep a now-ineligible matched person.
await db.query('INSERT INTO private.test_readiness(member_id,ready) VALUES($1,false)',[keptDuo.member_a_id])
const ineligible=await get()
await rejects(()=>persist(params(ineligible,{unmatched:[ids[9]]})),/MEMBER_INELIGIBLE/,'fresh capture cannot preserve a newly ineligible matched member')
await role();await db.query('DELETE FROM private.test_readiness WHERE member_id=$1',[keptDuo.member_a_id])
// SQL exception rolls back a staged batch with invalid UUID/layout too.
board=await get()
await rejects(()=>persist(params(board,{unmatched:[ids[9]],layout:{waitingDuoIds:[ids[9]],brokenPairs:[{memberIds:[ids[9],ids[9]]}]}})),/LAYOUT_INVALID/,'gray link cannot connect a person to themselves')
await role()
const postflight=await db.exec(read('supabase/audits/matching-board-postflight.sql'))
check(postflight.find(result=>result.rows[0]?.verification)?.rows[0].verification.status,'PASS','actual read-only deployment postflight passes')
// Published boards remain viewable with their waiting layout, while their
// write boundary still requires an explicitly withdrawn draft.
board=await get()
await persist(params(board,{unmatched:[ids[9]],layout:{waitingDuoIds:[ids[9]],brokenPairs:[]}}))
await server()
const preparation=await scalar('SELECT public.admin_prepare_match_publication($1,$2,0)',[session,admin])
check(inspectPublicationPreflight(preparePublicationPreflightInput(preparation.capture),preparation.current_rows).passed,true,'actual existing publication validator accepts the adjusted board')
const proof=await scalar('SELECT public.admin_authorize_match_publication($1,$2,0,$3)',[session,admin,preparation.revision_token])
await adminRole()
await scalar("SELECT public.admin_publish_checked_match_session($1,0,'隔离三池既有发布流程',$2)",[session,proof.preflight_id])
const published=await get()
check([published.read_only,published.session_status],[true,'confirmed'],'published board loads in read-only mode')
check(published.layout,{waitingDuoIds:[ids[9]],brokenPairs:[]},'publication preserves independent duo waiting position')
await rejects(()=>persist(params(published,{unmatched:[ids[9]]})),/REQUIRES_DRAFT/,'published board rejects every new save')
await adminRole()
await scalar("SELECT public.admin_unpublish_match_session($1,1,'隔离三池既有撤回流程')",[session])
await role()
// Privacy and deletion clean-up use the same original member lifecycle boundary.
await db.query("UPDATE public.members SET anonymized_at=now() WHERE id=$1",[ids[9]])
check(await scalar("SELECT bool_and(reason='隐私处理已清除' AND request_hash='privacy-redacted' AND cardinality(member_ids)=0 AND cardinality(subject_ids)=0 AND source IS NULL AND engine_input IS NULL AND redacted_at IS NOT NULL) FROM matching_board.operations WHERE session_id=$1",[session]),true,'anonymization clears every affected board audit payload token and reason')
await server();await rejects(()=>scalar('SELECT public.admin_get_matching_board_operation($1,$2)',[splitArgs[2],admin]),/REDACTED/,'privacy-redacted receipt cannot be replayed')
await adminRole()
await scalar("SELECT public.admin_delete_match_session_draft($1,1,'隔离验证显式删除草稿')",[session])
await role()
check(await scalar('SELECT count(*)::integer FROM matching_board.state WHERE session_id=$1',[session]),0,'draft deletion cascades board state')
check(await scalar('SELECT count(*)::integer FROM matching_board.operations WHERE session_id=$1',[session]),0,'draft deletion cascades board receipts')
console.log(`Matching three-pool board SQL/actual engine audit: ${checks} checks passed; isolated PGlite only.`)
await db.close();rmSync(temporary,{recursive:true,force:true})
}
