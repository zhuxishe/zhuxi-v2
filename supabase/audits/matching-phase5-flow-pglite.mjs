// Collection RPC -> frozen input -> real engine -> atomic save -> publication -> player receipt.
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
const temporary=mkdtempSync(join(tmpdir(),'matching-phase5-flow-'))
const bundle=await build({stdin:{contents:`export {prepareMatchingRunInput} from './src/lib/matching/run-input'; export {runFullMatching} from './src/lib/matching/run-matching'; export {buildUnmatchedDiagnostics} from './src/lib/matching/unmatched-diagnostics'`,resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',alias:{'@':join(root,'src')}})
writeFileSync(join(temporary,'engine.mjs'),bundle.outputFiles[0].contents)
const {prepareMatchingRunInput,runFullMatching,buildUnmatchedDiagnostics}=await import(pathToFileURL(join(temporary,'engine.mjs')).href)
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
const ids=Array.from({length:10},()=>randomUUID()),users=ids.map(()=>randomUUID())
for(let i=0;i<ids.length;i++){
 await db.query('INSERT INTO public.members(id,user_id,member_number) VALUES($1,$2,$3)',[ids[i],users[i],`FLOW_${i}`])
 await db.query("INSERT INTO public.member_identity(member_id,full_name,gender,hobby_tags) VALUES($1,$2,'male',ARRAY['桌游'])",[ids[i],`全流程隔离成员${i}`])
 await db.query("INSERT INTO public.member_interests(member_id,scenario_mode_pref) VALUES($1,ARRAY['多人本','双人本'])",[ids[i]])
 await db.query('INSERT INTO public.personality_quiz_results(member_id,score_e,score_a,score_o,score_c,score_n) VALUES($1,50,60,70,40,30)',[ids[i]])
}
const round=await scalar("INSERT INTO public.match_rounds(round_name,status) VALUES('第5批真实全流程隔离','draft') RETURNING id")
await db.query("UPDATE public.match_rounds SET status='open' WHERE id=$1",[round])
const player=async i=>{await role('authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[users[i]]);await db.exec("SELECT set_config('request.jwt.claim.role','authenticated',false)")}
const adminRole=async()=>{await role('authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[adminUser]);await db.exec("SELECT set_config('request.jwt.claim.role','authenticated',false)")}
const answers=(date='2026-10-27')=>({game_type_pref:'多人',gender_pref:'都可以',availability:{[date]:['下午']},interest_tags:['桌游'],social_style:null,message:'原问题填写方式',custom_answers:{}})
const save=async(i,payload=answers(),old=null)=>{await player(i);return scalar('SELECT public.save_my_matching_submission($1,$2,$3,0,$4)',[round,old?.id??null,old?.updated_at??null,payload])}
const saved=[]
for(let i=0;i<9;i++)saved.push(await save(i,answers(i===7?'2026-10-28':'2026-10-27')))
await role();await db.query("UPDATE public.members SET status='pending' WHERE id=$1",[ids[8]])
await server()
let preview=await scalar('SELECT public.admin_get_matching_eligibility_summary($1,$2)',[round,admin])
check([preview.submitted_count,preview.eligible_count,preview.excluded_count],[9,8,1],'player RPC answers feed exact full-pool qualification counts')
check(preview.exclusion_summary.some(row=>row.reason==='member_not_approved'&&row.count===1),true,'preview explains ineligible identity without individual details')
const request=randomUUID(),begin=()=>scalar("SELECT public.admin_begin_matching_run_v3($1,$2,$3,'第5批全流程','隔离完整回归验证')",[round,request,admin])
const receipt=await begin()
check(receipt.acquired,true,'open collection captures one versioned run')
check((await begin()).acquired,false,'duplicate request does not start another worker')
let engine=prepareMatchingRunInput(receipt.capture).engineInput
const output=runFullMatching(engine.candidates,engine.config,new Map(engine.idMap),new Map(engine.pairRelations))
const diagnostics=buildUnmatchedDiagnostics(engine,output.unmatchedIds)
check(output.totalMatched,7,'seven people remain a single unrestricted multiplayer pool')
check(output.rows.length,1,'no extra multiplayer subgroup is generated')
check(diagnostics.map(d=>d.reason),['no_common_time'],'unmatched explanation comes from the complete frozen cohort')
await scalar('SELECT public.admin_stage_matching_run($1,$2,$3,$4)',[request,admin,receipt.lease_token,engine])
await save(9)
await save(0,{...answers('2026-10-29'),message:'运行期间继续改答'},saved[0])
await server()
preview=await scalar('SELECT public.admin_get_matching_eligibility_summary($1,$2)',[round,admin])
check(preview.eligible_count,9,'collection and edits continue while the original run is staged')
check(engine.candidates.length,8,'late answers cannot change the staged cohort')
await role()
await db.exec("CREATE FUNCTION public.flow_save_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'FLOW_SAVE_FAILED'; END$$; CREATE TRIGGER flow_save_failure BEFORE INSERT ON public.unmatched_diagnostics FOR EACH ROW EXECUTE FUNCTION public.flow_save_failure()")
await server()
const complete=(r,rows=output.rows,diags=diagnostics)=>scalar('SELECT public.admin_complete_matching_run_v2($1,$2,$3,$4,$5,$6)',[request,admin,r.lease_token,rows,output.unmatchedIds,diags])
await assert.rejects(()=>complete(receipt),/FLOW_SAVE_FAILED/);checks++
await role()
check(await scalar('SELECT count(*)::integer FROM public.match_sessions WHERE round_id=$1',[round]),0,'save failure rolls back the entire plan')
await db.exec('DROP TRIGGER flow_save_failure ON public.unmatched_diagnostics')
await server()
const failed=await scalar("SELECT public.admin_fail_matching_run($1,$2,$3,'SAVE_FAILED')",[request,admin,receipt.lease_token])
check([failed.run.counts_available,failed.run.submitted_count,failed.run.eligible_count,failed.run.excluded_count],[true,9,8,1],'failure reports original captured qualification counts')
const recovered=await begin()
check(recovered.capture.snapshot_id,receipt.capture.snapshot_id,'failure recovery keeps the same snapshot')
check(recovered.engine_input,engine,'failure recovery retains the exact old engine input and score version')
const done=await complete(recovered)
check(done.run.status,'succeeded','recovered actual output saves successfully')
check((await complete(recovered)).session_id,done.session_id,'lost response retry is idempotent')
await role()
check(await scalar('SELECT status FROM public.match_rounds WHERE id=$1',[round]),'open','successful run keeps collection open')
const result=await scalar('SELECT id FROM public.match_results WHERE session_id=$1',[done.session_id])
check(await scalar('SELECT details FROM public.unmatched_diagnostics WHERE session_id=$1',[done.session_id]),diagnostics[0].details,'saved diagnostic equals the trusted frozen calculation')
await adminRole()
const published=await scalar("SELECT public.admin_publish_match_session($1,0,'隔离发布实际方案')",[done.session_id])
check(published.publication_version,1,'completed plan publishes atomically')
await role()
check(await scalar('SELECT count(*)::integer FROM public.community_notifications WHERE match_session_id=$1 AND notification_type=\'matching_published\'',[done.session_id]),7,'only the frozen matched roster receives matched notifications')
await role()
check(await scalar("SELECT count(*)::integer FROM public.community_notifications WHERE match_session_id=$1 AND notification_type='matching_unmatched'",[done.session_id]),1,'frozen unmatched member receives the unmatched notice')
await player(0)
check((await scalar('SELECT public.get_my_matching_publications()')).find(r=>r.round_id===round).result_id,result,'player receives the published actual multiplayer result')
await scalar("SELECT public.request_my_match_cancellation($1,'隔离旧版本申请',1)",[result])
const pendingAt=await scalar('SELECT cancellation_requested_at::text FROM public.match_results WHERE id=$1',[result])
await adminRole()
await scalar("SELECT public.admin_unpublish_match_session($1,1,'隔离撤回等待重发')",[done.session_id])
await scalar("SELECT public.admin_publish_match_session($1,1,'隔离重新发布V2')",[done.session_id])
await assert.rejects(()=>scalar("SELECT public.admin_approve_matching_cancellation($1,2,$2,'旧申请不能取消新结果')",[result,pendingAt]),/STALE/);checks++
await player(0)
check((await scalar('SELECT public.get_my_matching_publications()')).find(r=>r.round_id===round).status,'matched','stale cancellation cannot damage current player receipt')
await scalar("SELECT public.request_my_match_cancellation($1,'隔离当前版本申请',2)",[result])
const currentAt=await scalar('SELECT cancellation_requested_at::text FROM public.match_results WHERE id=$1',[result])
await adminRole()
await scalar("SELECT public.admin_approve_matching_cancellation($1,2,$2,'隔离整池取消保持原规则')",[result,currentAt])
await role()
check(await scalar('SELECT count(*)::integer FROM matching_publication.active_assignments WHERE round_id=$1',[round]),0,'whole-pool cancellation remains unchanged')
await adminRole()
await scalar("SELECT public.admin_unpublish_match_session($1,2,'隔离撤回已取消方案')",[done.session_id])
await db.query("UPDATE public.match_results SET status='draft',audit_reason='隔离恢复原结果' WHERE id=$1",[result])
await db.query("UPDATE public.match_sessions SET total_matched=7,total_unmatched=1,audit_reason='隔离恢复原统计' WHERE id=$1",[done.session_id])
await scalar("SELECT public.admin_publish_match_session($1,2,'隔离恢复后发布V3')",[done.session_id])
await player(0)
const fresh=await scalar('SELECT cancellation_status FROM public.match_results WHERE id=$1',[result])
check(fresh,null,'restored publication no longer displays prior approved cancellation')
await scalar("SELECT public.request_my_match_cancellation($1,'隔离恢复后可再次申请',3)",[result])
check(await scalar('SELECT cancellation_publication_version FROM public.match_results WHERE id=$1',[result]),3,'new cancellation binds the new publication version')
await server()
const next=await scalar("SELECT public.admin_begin_matching_run_v3($1,$2,$3,'下一完整池批次','隔离已有有效匹配仍可入选')",[round,randomUUID(),admin])
check(next.capture.source.eligibility.filter(e=>e.eligible).length,9,'next run keeps every valid registered member including current assignments')
const nextEngine=prepareMatchingRunInput(next.capture).engineInput
const nextOutput=runFullMatching(nextEngine.candidates,nextEngine.config,new Map(nextEngine.idMap),new Map(nextEngine.pairRelations))
await scalar('SELECT public.admin_stage_matching_run($1,$2,$3,$4)',[next.run.id,admin,next.lease_token,nextEngine])
const alternate=await scalar('SELECT public.admin_complete_matching_run_v2($1,$2,$3,$4,$5,$6)',[next.run.id,admin,next.lease_token,nextOutput.rows,nextOutput.unmatchedIds,buildUnmatchedDiagnostics(nextEngine,nextOutput.unmatchedIds)])
check(alternate.session_id!==done.session_id,true,'repeat run retains the old plan and saves an alternative draft')
await adminRole()
await assert.rejects(()=>scalar("SELECT public.admin_publish_match_session($1,0,'重复结果发布保护验证')",[alternate.session_id]),/CONFLICT/);checks++
await role()
check(await scalar('SELECT count(*)::integer FROM matching_publication.active_assignments WHERE round_id=$1',[round]),7,'blocked alternative publication leaves the seven-person effective pool intact')
check(await scalar('SELECT count(*)::integer FROM public.community_notifications WHERE match_session_id=$1',[alternate.session_id]),0,'blocked alternative publication sends no notice')
console.log(`Matching phase 5 complete flow audit: ${checks} checks passed; isolated SQL and actual TypeScript engine only.`)
await db.close()
rmSync(temporary,{recursive:true,force:true})
