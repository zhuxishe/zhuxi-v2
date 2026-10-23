// Manual/pool adjustment transactions with actual TypeScript rules and PostgreSQL guards.
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
const temporary=mkdtempSync(join(tmpdir(),'matching-adjustment-'))
const bundle=await build({stdin:{contents:`export {prepareMatchingRunInput} from './src/lib/matching/run-input'; export {runFullMatching} from './src/lib/matching/run-matching'; export {buildUnmatchedDiagnostics} from './src/lib/matching/unmatched-diagnostics'; export {buildManualAdjustment,inspectManualAdjustment,runPoolAdjustment} from './src/lib/matching/adjustment-engine'`,resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',alias:{'@':join(root,'src')}})
writeFileSync(join(temporary,'engine.mjs'),bundle.outputFiles[0].contents)
const {prepareMatchingRunInput,runFullMatching,buildUnmatchedDiagnostics,buildManualAdjustment,inspectManualAdjustment,runPoolAdjustment}=await import(pathToFileURL(join(temporary,'engine.mjs')).href)
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
const ids=Array.from({length:18},()=>randomUUID()),users=ids.map(()=>randomUUID())
for(let i=0;i<ids.length;i++){
 await db.query('INSERT INTO public.members(id,user_id,member_number) VALUES($1,$2,$3)',[ids[i],users[i],`ADJUST_${i}`])
 await db.query("INSERT INTO public.member_identity(member_id,full_name,gender,hobby_tags) VALUES($1,$2,'male',ARRAY['桌游'])",[ids[i],`调整隔离成员${i}`])
 await db.query("INSERT INTO public.member_interests(member_id,scenario_mode_pref) VALUES($1,ARRAY['多人本','双人本'])",[ids[i]])
 await db.query('INSERT INTO public.personality_quiz_results(member_id,score_e,score_a,score_o,score_c,score_n) VALUES($1,50,60,70,40,30)',[ids[i]])
}
const player=async i=>{await role('authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[users[i]]);await db.exec("SELECT set_config('request.jwt.claim.role','authenticated',false)")}
const adminRole=async()=>{await role('authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[adminUser]);await db.exec("SELECT set_config('request.jwt.claim.role','authenticated',false)")}
const round=await scalar("INSERT INTO public.match_rounds(round_name,status) VALUES('第5批调整隔离','draft') RETURNING id")
await db.query("UPDATE public.match_rounds SET status='open' WHERE id=$1",[round])
const answers=(mode='双人',date='2026-10-27')=>({game_type_pref:mode,gender_pref:'都可以',availability:{[date]:['下午']},interest_tags:['桌游'],social_style:null,message:'原问卷保持',custom_answers:{}})
const save=async(i,payload=answers(),old=null)=>{await player(i);return scalar('SELECT public.save_my_matching_submission($1,$2,$3,0,$4)',[round,old?.id??null,old?.updated_at??null,payload])}
const saved=[]
saved[0]=await save(0);saved[1]=await save(1)
await server()
const request=randomUUID()
const normal=await scalar("SELECT public.admin_begin_matching_run_v3($1,$2,$3,'调整前原方案','隔离创建原始匹配方案')",[round,request,admin])
const normalEngine=prepareMatchingRunInput(normal.capture).engineInput
const normalOutput=runFullMatching(normalEngine.candidates,normalEngine.config,new Map(normalEngine.idMap),new Map(normalEngine.pairRelations))
await scalar('SELECT public.admin_stage_matching_run($1,$2,$3,$4)',[request,admin,normal.lease_token,normalEngine])
const normalDone=await scalar('SELECT public.admin_complete_matching_run_v2($1,$2,$3,$4,$5,$6)',[request,admin,normal.lease_token,normalOutput.rows,normalOutput.unmatchedIds,[]])
const session=normalDone.session_id
check(normalOutput.totalMatched,2,'normal full-pool pipeline still works after the new guard')
await role()
const originalResult=await scalar('SELECT id FROM public.match_results WHERE session_id=$1',[session])
const originalRow=await scalar('SELECT to_jsonb(r) FROM public.match_results r WHERE id=$1',[originalResult])
const originalInput=await scalar('SELECT to_jsonb(s) FROM matching_run.snapshots s WHERE session_id=$1',[session])
for(let i=2;i<ids.length;i++)saved[i]=await save(i,answers(i>=4&&i<=11?'多人':'双人'))
const preview=async(kind='manual',selected=[],resultId=null)=>{await server();return scalar('SELECT public.admin_preview_matching_adjustment($1,$2,$3,$4,$5)',[session,admin,kind,selected,resultId])}
const begin=async(kind='manual',selected=[],resultId=null,operation=randomUUID(),expectedRevision=null)=>{await server();return scalar("SELECT public.admin_begin_matching_adjustment($1,$2,$3,$4,$5,$6,'隔离调整完整验证',$7)",[session,admin,kind,selected,resultId,operation,expectedRevision])}
const stage=async(receipt)=>{const input=receipt.engine_input??prepareMatchingRunInput(receipt.capture).engineInput;await server();await scalar('SELECT public.admin_stage_matching_adjustment($1,$2,$3,$4)',[receipt.operation.id,admin,receipt.lease_token,input]);return input}
const complete=async(receipt,rows=[],unmatched=[],diagnostics=[])=>{await server();return scalar('SELECT public.admin_complete_matching_adjustment($1,$2,$3,$4,$5,$6)',[receipt.operation.id,admin,receipt.lease_token,rows,unmatched,diagnostics])}
const firstPreview=await preview()
check(firstPreview.summary.eligible_count,16,'manual preview includes eligible later registrations outside the original batch')
const manual=await begin('manual',[ids[2],ids[3]],null,randomUUID(),firstPreview.base_revision)
const manualEngine=await stage(manual)
const manualRows=buildManualAdjustment(manualEngine,[ids[2],ids[3]])
const manualDone=await complete(manual,manualRows)
check(manualDone.operation.status,'succeeded','actual TS manual output saves through the new atomic RPC')
await role()
check(await scalar('SELECT count(*)::integer FROM public.match_results WHERE session_id=$1 AND status<>\'cancelled\'',[session]),2,'manual action appends one result without replacing the original')
check(await scalar('SELECT to_jsonb(r) FROM public.match_results r WHERE id=$1',[originalResult]),originalRow,'unselected old result and its scores are unchanged')
check(await scalar('SELECT to_jsonb(s) FROM matching_run.snapshots s WHERE session_id=$1',[session]),originalInput,'original normal-run snapshot remains unchanged')
const rejects=async(work,pattern,message)=>{await assert.rejects(work,pattern,message);checks++}
const get=async operation=>{await server();return scalar('SELECT public.admin_get_matching_adjustment($1,$2)',[operation,admin])}
const fail=async(receipt,code='SAVE_FAILED')=>{await server();return scalar('SELECT public.admin_fail_matching_adjustment($1,$2,$3,$4)',[receipt.operation.id,admin,receipt.lease_token,code])}
const split=async(result)=>{const operation=await begin('split',[],result);return complete(operation)}
const resultId=async(operation)=>{await role();return scalar('SELECT result_ids[1] FROM matching_adjustment.operations WHERE id=$1',[operation.operation.id])}
const resultValue=async id=>{await role();return scalar("SELECT to_jsonb(r)-ARRAY['status','locked_by','locked_at','audit_reason','cancellation_requested_by','cancellation_reason','cancellation_requested_at','cancellation_status','cancellation_reviewed_by','cancellation_reviewed_at','cancellation_publication_version'] FROM public.match_results r WHERE id=$1",[id])}
const originalStable=await resultValue(originalResult)
const questionnairesBefore=await scalar("SELECT jsonb_build_object('templates',(SELECT jsonb_agg(to_jsonb(t)) FROM public.questionnaire_templates t),'versions',(SELECT jsonb_agg(to_jsonb(v)) FROM public.questionnaire_versions v))")
const publicFns=[
 'public.admin_preview_matching_adjustment(uuid,uuid,text,uuid[],uuid)',
 'public.admin_begin_matching_adjustment(uuid,uuid,text,uuid[],uuid,uuid,text,text)',
 'public.admin_stage_matching_adjustment(uuid,uuid,uuid,jsonb)',
 'public.admin_complete_matching_adjustment(uuid,uuid,uuid,jsonb,uuid[],jsonb)',
 'public.admin_fail_matching_adjustment(uuid,uuid,uuid,text)',
 'public.admin_get_matching_adjustment(uuid,uuid)',
 'public.admin_list_matching_adjustments(uuid,uuid)',
]
await role()
for(const signature of publicFns)for(const actor of ['anon','authenticated','service_role'])check(await scalar('SELECT has_function_privilege($1,$2,\'EXECUTE\')',[actor,signature]),actor==='service_role',`${signature} is server-only`)
for(const actor of ['anon','authenticated','service_role'])for(const table of ['matching_adjustment.operations','matching_adjustment.subjects'])check(await scalar('SELECT has_table_privilege($1,$2,\'SELECT\')',[actor,table]),false,`${actor} cannot read raw adjustment tables`)
await server()
await rejects(()=>scalar('SELECT public.admin_preview_matching_adjustment($1,$2,\'manual\',\'{}\',NULL)',[session,randomUUID()]),/ADMIN/,'invalid server actor cannot preview')
await adminRole()
await rejects(()=>scalar('SELECT public.admin_get_matching_adjustment($1,$2)',[manual.operation.id,admin]),/permission denied/,'browser administrator cannot call the server-only receipt RPC')
await rejects(()=>db.query("INSERT INTO public.match_results(session_id,member_a_id,member_b_id,audit_reason) VALUES($1,$2,$3,'浏览器绕过尝试')",[session,ids[12],ids[13]]),/REQUIRES_RPC/,'browser cannot directly insert a result')
await rejects(()=>db.query("UPDATE public.match_results SET member_b_id=$1,audit_reason='浏览器改人尝试' WHERE id=$2",[ids[12],originalResult]),/REQUIRES_RPC/,'browser cannot replace a result member')
await rejects(()=>db.query("UPDATE public.match_results SET total_score=999,audit_reason='浏览器改分尝试' WHERE id=$1",[originalResult]),/REQUIRES_RPC/,'browser cannot replace a score')
await rejects(()=>db.query("UPDATE public.match_results SET status='cancelled',audit_reason='浏览器取消绕过' WHERE id=$1",[originalResult]),/REQUIRES_RPC/,'browser cannot directly split a result')
await db.query("UPDATE public.match_results SET status='locked',locked_by=$1,locked_at=now(),audit_reason='既有锁定操作' WHERE id=$2",[admin,originalResult])
check(await scalar('SELECT status FROM public.match_results WHERE id=$1',[originalResult]),'locked','existing administrator lock still works')
await db.query("UPDATE public.match_results SET status='draft',locked_by=NULL,locked_at=NULL,audit_reason='既有解锁操作' WHERE id=$1",[originalResult])
check(await scalar('SELECT status FROM public.match_results WHERE id=$1',[originalResult]),'draft','existing administrator unlock still works')
await server()
const duplicate=await begin('manual',[ids[2],ids[3]],null,manual.operation.id)
check([duplicate.acquired,duplicate.operation.status],[false,'succeeded'],'successful operation replay returns the same receipt')
await rejects(()=>begin('manual',[ids[12],ids[13]],null,manual.operation.id),/REQUEST_CONFLICT/,'same operation ID rejects a different payload')
check((await complete(manual,manualRows)).operation.status,'succeeded','lost completion reply can be retried idempotently')

// The same qualification function retains the existing current/offline import exemptions.
await role()
await db.query('INSERT INTO private.test_readiness(member_id,ready) VALUES($1,false),($2,false)',[ids[16],ids[17]])
let qualification=await preview()
check(qualification.excluded_members.find(item=>item.id===ids[16]).reasons.includes('profile_incomplete'),true,'manual preview excludes incomplete ordinary profiles')
await role();await db.exec("SELECT set_config('request.jwt.claim.role','service_role',false)")
await db.query('UPDATE private.test_readiness SET ready=true WHERE member_id=ANY($1)',[ids.slice(16,18)])
await db.query('UPDATE public.match_round_submissions SET import_metadata=$1 WHERE round_id=$2 AND member_id=$3',[{source:'current',normalized_name:'有效线上导入',matched_member_id:ids[16]},round,ids[16]])
await db.query("UPDATE public.members SET user_id=NULL,account_status='unbound',record_source='import',record_scope='historical',member_number=$1 WHERE id=$2",[`IMP-${round.slice(0,8)}-1`,ids[17]])
await db.query('UPDATE public.match_round_submissions SET import_metadata=$1 WHERE round_id=$2 AND member_id=$3',[{source:'temp',normalized_name:'合法临时导入'},round,ids[17]])
await db.query('UPDATE private.test_readiness SET ready=false WHERE member_id=ANY($1)',[ids.slice(16,18)])
qualification=await preview()
check(qualification.available_members.some(item=>item.id===ids[16]),true,'valid current import keeps the established questionnaire exemption')
check(qualification.available_members.some(item=>item.id===ids[17]),true,'valid offline import remains visible and eligible')
check(qualification.capture.source.eligibility.filter(item=>[ids[16],ids[17]].includes(item.member_id)).every(item=>item.eligible&&item.import_exempt),true,'preview capture proves the same import exemptions used by auto matching')
await role();await db.exec("SELECT set_config('request.jwt.claim.role','service_role',false)")
await db.query('DELETE FROM private.test_readiness WHERE member_id=ANY($1)',[ids.slice(16,18)])
await db.query("UPDATE public.members SET user_id=$1,account_status='active',record_source='app',record_scope='current',member_number='ADJUST_17' WHERE id=$2",[users[17],ids[17]])
await db.query('UPDATE public.match_round_submissions SET import_metadata=NULL WHERE round_id=$1 AND member_id=ANY($2)',[round,ids.slice(16,18)])

// One pool, with a real score and more than six members, never replaces the old duo.
const multiSelection=ids.slice(4,12)
const multi=await begin('manual',multiSelection)
const multiEngine=await stage(multi)
const multiRows=buildManualAdjustment(multiEngine,multiSelection)
const multiDone=await complete(multi,multiRows)
check(multiDone.operation.status,'succeeded','eight-person actual TS pool saves')
check(multiRows[0].score_breakdown.pairCount,28,'pool retains actual existing pair score distribution')
const multiResult=await resultId(multiDone),multiBefore=await resultValue(multiResult)
await rejects(()=>begin('manual',[ids[12],ids[13],ids[14]]),/SECOND_MULTI_POOL/,'an existing pool blocks an extra manual pool')
check((await preview()).has_existing_multi_pool,true,'preview reports the existing pool')

// Split and restoration preserve the original score, members and recommended time.
await split(multiResult)
await adminRole()
await rejects(()=>db.query("UPDATE public.match_results SET status='draft',audit_reason='浏览器直接恢复' WHERE id=$1",[multiResult]),/REQUIRES_RPC/,'browser cannot directly restore a result')
const restore=await begin('restore',[],multiResult)
const restoreEngine=await stage(restore)
await complete(restore,buildManualAdjustment(restoreEngine,restore.selected_member_ids))
check(await resultValue(multiResult),multiBefore,'restoration preserves all original score and result fields')
await split(multiResult)
// Cancel-pool scope contains the cancelled pool only; it excludes late never-matched members.
const poolPreview=await preview('pool')
check(new Set(poolPreview.selected_member_ids),new Set(multiSelection),'cancel pool stays scoped to this session cancelled results')
await role()
await db.query("UPDATE public.members SET status='pending' WHERE id=$1",[ids[11]])
const excludedPool=await preview('pool')
check([excludedPool.summary.submitted_count,excludedPool.summary.eligible_count,excludedPool.summary.excluded_count],[8,7,1],'cancel-pool preview and calculation use identical qualification')
check(excludedPool.excluded_members.find(item=>item.id===ids[11]).reasons.includes('member_not_approved'),true,'ineligible cancelled member remains recorded with a reason')
const pool=await begin('pool')
const poolEngine=await stage(pool)
const poolOutput=runPoolAdjustment(poolEngine,pool.has_existing_multi_pool)
const poolDiagnostics=buildUnmatchedDiagnostics(poolEngine,poolOutput.unmatchedIds)
const poolDone=await complete(pool,poolOutput.rows,poolOutput.unmatchedIds,poolDiagnostics)
check(poolDone.operation.status,'succeeded','actual TS cancel-pool computation commits')
check(poolOutput.totalMatched,7,'valid remaining cancelled members form one pool')
check(await resultValue(originalResult),originalStable,'cancel-pool operation does not affect unrelated original duo')
await role()
check(await scalar('SELECT count(*)::integer FROM public.match_results WHERE session_id=$1 AND status<>\'cancelled\' AND cardinality(group_members)>2',[session]),1,'whole plan still has only one active multiplayer pool')
await db.query("UPDATE public.members SET status='approved' WHERE id=$1",[ids[11]])

// Transaction failure leaves no half result, then the same operation recovers.
const failing=await begin('manual',[ids[12],ids[13]])
const failingEngine=await stage(failing),failingRows=buildManualAdjustment(failingEngine,[ids[12],ids[13]])
await role()
const beforeFailure=await scalar('SELECT count(*)::integer FROM public.match_results WHERE session_id=$1',[session])
await db.exec("CREATE FUNCTION public.adjust_summary_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.total_matched<>OLD.total_matched THEN RAISE EXCEPTION 'ADJUST_SUMMARY_FAILED'; END IF; RETURN NEW; END $$; CREATE TRIGGER adjust_summary_fail BEFORE UPDATE ON public.match_sessions FOR EACH ROW EXECUTE FUNCTION public.adjust_summary_fail()")
await rejects(()=>complete(failing,failingRows),/ADJUST_SUMMARY_FAILED/,'summary failure aborts the full save transaction')
await role()
check(await scalar('SELECT count(*)::integer FROM public.match_results WHERE session_id=$1',[session]),beforeFailure,'failed summary leaves no inserted result')
await db.exec('DROP TRIGGER adjust_summary_fail ON public.match_sessions')
const failed=await fail(failing)
check(failed.operation.can_recover,true,'recoverable save failure advertises same-number recovery')
const resumed=await begin('manual',[ids[12],ids[13]],null,failing.operation.id)
check(resumed.operation.attempt,2,'recovery increments the attempt, preserving operation number')
check(resumed.engine_input,failingEngine,'recovery preserves the exact captured input and scoring policy')
await rejects(()=>complete(failing,failingRows),/LEASE_STALE/,'a previous attempt token cannot save after recovery')
check((await complete(resumed,failingRows)).operation.status,'succeeded','same-number recovery commits after the transient fault is fixed')

// State changes are rejected instead of quietly replacing occupied members.
const busy=await begin('manual',[ids[14],ids[15]])
await rejects(()=>begin('manual',[ids[16],ids[17]]),/BUSY/,'one active worker per plan')
await stage(busy)
await role()
await db.query("UPDATE public.members SET account_status='suspended' WHERE id=$1",[ids[14]])
await rejects(()=>complete(busy,buildManualAdjustment(prepareMatchingRunInput(busy.capture).engineInput,[ids[14],ids[15]])),/INELIGIBLE/,'qualification is rechecked at commit')
await fail(busy,'ADJUSTMENT_CHANGED')
check((await get(busy.operation.id)).operation.can_recover,false,'terminal stale-input error does not advertise recovery')
await role();await db.query("UPDATE public.members SET account_status='active' WHERE id=$1",[ids[14]])
await rejects(()=>begin('manual',[ids[14],ids[15]],null,busy.operation.id),/NOT_RECOVERABLE/,'terminal operation requires a fresh checked operation')

// The commit RPC independently blocks forged hard-conflict output, even without the UI.
const forgedRow=(a,b)=>[{member_a_id:a,member_b_id:b,group_members:null,total_score:0,score_breakdown:[],rank:1,best_slot:'2026-10-27_下午',game_type:'双人'}]
await role();await db.exec("SELECT set_config('request.jwt.claim.role','service_role',false)")
await db.query("UPDATE public.match_round_submissions SET game_type_pref='多人' WHERE round_id=$1 AND member_id=$2",[round,ids[14]])
const wrongType=await begin('manual',[ids[14],ids[15]]),wrongTypeEngine=await stage(wrongType)
check(inspectManualAdjustment(wrongTypeEngine,[ids[14],ids[15]]).passed,false,'actual TS preview rejects multiplayer-only applicant in a duo')
await rejects(()=>complete(wrongType,forgedRow(ids[14],ids[15])),/CONSTRAINT/,'SQL final checks reject a forged duo with multiplayer-only applicant')
await fail(wrongType,'CONSTRAINTS_FAILED')
await role();await db.exec("SELECT set_config('request.jwt.claim.role','service_role',false)")
await db.query("UPDATE public.match_round_submissions SET game_type_pref='双人' WHERE round_id=$1 AND member_id=$2",[round,ids[14]])
await db.query("INSERT INTO public.pair_relationships(member_a_id,member_b_id,status,notes) VALUES($1,$2,'blacklist','隔离硬约束')",[ids[14],ids[15]])
const blacklist=await begin('manual',[ids[14],ids[15]]),blacklistEngine=await stage(blacklist)
check(inspectManualAdjustment(blacklistEngine,[ids[14],ids[15]]).passed,false,'actual TS check retains the old blacklist veto')
await rejects(()=>complete(blacklist,forgedRow(ids[14],ids[15])),/CONSTRAINT/,'SQL final checks reject a forged blacklisted duo')
await fail(blacklist,'CONSTRAINTS_FAILED')
await role();await db.query('DELETE FROM public.pair_relationships WHERE member_a_id=$1 AND member_b_id=$2',[ids[14],ids[15]])
await db.query('UPDATE public.match_round_submissions SET cancelled_at=now() WHERE round_id=$1 AND member_id=$2',[round,ids[15]])
const cancelledPreview=await preview('manual',[ids[14],ids[15]])
check(cancelledPreview.excluded_members.find(item=>item.id===ids[15]).reasons.includes('cancelled'),true,'cancelled registration is excluded independently of result cancellation')
await rejects(()=>begin('manual',[ids[14],ids[15]]),/INELIGIBLE/,'manual begin rejects an applicant who withdrew registration')
await role();await db.query('UPDATE public.match_round_submissions SET cancelled_at=NULL WHERE round_id=$1 AND member_id=$2',[round,ids[15]])

// Qualification and hard inputs are current at commit; the original scoring input stays frozen.
const changedHard=await begin('manual',[ids[14],ids[15]]),changedHardEngine=await stage(changedHard)
await role();await db.exec("SELECT set_config('request.jwt.claim.role','service_role',false)")
await db.query('UPDATE public.match_round_submissions SET availability=$1 WHERE round_id=$2 AND member_id=$3',[{'2026-10-28':['下午']},round,ids[14]])
await rejects(()=>complete(changedHard,buildManualAdjustment(changedHardEngine,[ids[14],ids[15]])),/STALE|CHANGED/,'a changed selected hard input invalidates the staged operation')
await fail(changedHard,'ADJUSTMENT_CHANGED')
await role();await db.exec("SELECT set_config('request.jwt.claim.role','service_role',false)")
await db.query('UPDATE public.match_round_submissions SET availability=$1 WHERE round_id=$2 AND member_id=$3',[{'2026-10-27':['下午']},round,ids[14]])

// A changed plan revision invalidates an older preflight and an already staged operation.
const stalePreview=await preview()
await adminRole()
await db.query("UPDATE public.match_results SET status='locked',locked_by=$1,locked_at=now(),audit_reason='并发锁定使版本失效' WHERE id=$2",[admin,originalResult])
await rejects(()=>begin('manual',[ids[14],ids[15]],null,randomUUID(),stalePreview.base_revision),/STALE/,'preflight is bound to the checked plan revision')
await adminRole()
await db.query("UPDATE public.match_results SET status='draft',locked_by=NULL,locked_at=NULL,audit_reason='并发解锁恢复草稿' WHERE id=$1",[originalResult])
const staleOperation=await begin('manual',[ids[14],ids[15]])
const staleEngine=await stage(staleOperation)
await adminRole()
await db.query("UPDATE public.match_results SET status='locked',locked_by=$1,locked_at=now(),audit_reason='运行中其他编辑版本' WHERE id=$2",[admin,originalResult])
await rejects(()=>complete(staleOperation,buildManualAdjustment(staleEngine,[ids[14],ids[15]])),/STALE/,'commit rejects a concurrently changed plan')
await fail(staleOperation,'ADJUSTMENT_CHANGED')
check((await get(staleOperation.operation.id)).operation.can_recover,false,'changed revision cannot be recovered as a fresh input')
await adminRole()
await db.query("UPDATE public.match_results SET status='draft',locked_by=NULL,locked_at=NULL,audit_reason='恢复其他编辑草稿' WHERE id=$1",[originalResult])

// Existing pool means cancelled multiplayer applicants stay waiting, without coercion to duos.
await split(originalResult)
await role();await db.exec("SELECT set_config('request.jwt.claim.role','service_role',false)")
for(let i=0;i<2;i++)await db.query("UPDATE public.match_round_submissions SET game_type_pref='多人' WHERE round_id=$1 AND member_id=$2",[round,ids[i]])
let restricted=await begin('pool');const restrictedEngine=await stage(restricted)
const restrictedOutput=runPoolAdjustment(restrictedEngine,restricted.has_existing_multi_pool)
check(restricted.has_existing_multi_pool,true,'cancel pool retains the existing active multiplayer pool boundary')
check(restrictedOutput.rows.length,0,'multiplayer-only cancelled applicants cannot create a second pool or forced duo')
check(restrictedOutput.totalUnmatched>=2,true,'unallocated cancelled applicants remain in the pool')
const restrictedDiagnostics=buildUnmatchedDiagnostics(restrictedEngine,restrictedOutput.unmatchedIds)
await role()
const diagBeforeFailure=await scalar('SELECT count(*)::integer FROM public.unmatched_diagnostics WHERE session_id=$1',[session])
await db.exec("CREATE FUNCTION public.adjust_diag_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'ADJUST_DIAG_FAILED'; END$$; CREATE TRIGGER adjust_diag_fail BEFORE INSERT ON public.unmatched_diagnostics FOR EACH ROW EXECUTE FUNCTION public.adjust_diag_fail()")
await rejects(()=>complete(restricted,restrictedOutput.rows,restrictedOutput.unmatchedIds,restrictedDiagnostics),/ADJUST_DIAG_FAILED/,'diagnostic insert failure rolls the whole adjustment back')
await role()
check(await scalar('SELECT count(*)::integer FROM public.unmatched_diagnostics WHERE session_id=$1',[session]),diagBeforeFailure,'diagnostic failure leaves the original current explanation set intact')
await db.exec('DROP TRIGGER adjust_diag_fail ON public.unmatched_diagnostics')
await fail(restricted)
restricted=await begin('pool',[],null,restricted.operation.id)
check(restricted.engine_input,restrictedEngine,'diagnostic failure recovers with the same frozen input')
await complete(restricted,restrictedOutput.rows,restrictedOutput.unmatchedIds,restrictedDiagnostics)
await role()
check(await scalar('SELECT count(*)::integer FROM public.unmatched_diagnostics WHERE session_id=$1 AND member_id=ANY($2)',[session,ids.slice(0,2)]),2,'new trusted current diagnostics are saved for the still-unmatched cancelled members')
await adminRole()
await rejects(()=>db.query('DELETE FROM public.unmatched_diagnostics WHERE session_id=$1',[session]),/REQUIRES_RPC/,'browser cannot delete diagnostics to fake a complete plan')
await role();await db.exec("SELECT set_config('request.jwt.claim.role','service_role',false)")
for(let i=0;i<2;i++)await db.query("UPDATE public.match_round_submissions SET game_type_pref='双人' WHERE round_id=$1 AND member_id=$2",[round,ids[i]])
await role();await db.exec("SELECT set_config('request.jwt.claim.role','service_role',false)")
for(let i=0;i<2;i++)await db.query('UPDATE public.match_round_submissions SET availability=$1 WHERE round_id=$2 AND member_id=$3',[{'2026-10-28':['下午']},round,ids[i]])
const unavailableTime=await begin('restore',[],originalResult),unavailableEngine=await stage(unavailableTime)
await rejects(()=>complete(unavailableTime,buildManualAdjustment(unavailableEngine,unavailableTime.selected_member_ids)),/ORIGINAL_TIME_UNAVAILABLE/,'restoration refuses to silently replace an unavailable original time')
await fail(unavailableTime,'ORIGINAL_TIME_UNAVAILABLE')
check((await get(unavailableTime.operation.id)).operation.can_recover,false,'invalid original-time operation cannot be resumed without a new check')
await role()
check(await scalar('SELECT status FROM public.match_results WHERE id=$1',[originalResult]),'cancelled','failed restoration leaves the original result cancelled')
await db.exec("SELECT set_config('request.jwt.claim.role','service_role',false)")
for(let i=0;i<2;i++)await db.query('UPDATE public.match_round_submissions SET availability=$1 WHERE round_id=$2 AND member_id=$3',[{'2026-10-27':['下午']},round,ids[i]])
const restoreOriginal=await begin('restore',[],originalResult),restoreOriginalEngine=await stage(restoreOriginal)
await complete(restoreOriginal,buildManualAdjustment(restoreOriginalEngine,restoreOriginal.selected_member_ids))
check(await resultValue(originalResult),originalStable,'restoring an original duo keeps its original score and recommended time')
await role()
check(await scalar('SELECT count(*)::integer FROM public.unmatched_diagnostics WHERE session_id=$1 AND member_id=ANY($2)',[session,ids.slice(0,2)]),0,'restoration clears the current unmatched view for reallocated members')
check(await scalar('SELECT jsonb_array_length(prior_diagnostics) FROM matching_adjustment.operations WHERE id=$1',[restoreOriginal.operation.id]),2,'displaced original diagnostics remain in the private operation record')

// A changed selected relation is rejected atomically, rather than ignoring a new blacklist.
const changedRelation=await begin('manual',[ids[14],ids[15]]),relationEngine=await stage(changedRelation)
await role();await db.query("INSERT INTO public.pair_relationships(member_a_id,member_b_id,status,notes) VALUES($1,$2,'blacklist','运行期间新增关系')",[ids[14],ids[15]])
await rejects(()=>complete(changedRelation,buildManualAdjustment(relationEngine,[ids[14],ids[15]])),/STALE|CHANGED/,'a new selected-member blacklist invalidates the staged operation')
await fail(changedRelation,'ADJUSTMENT_CHANGED')
await role();await db.query('DELETE FROM public.pair_relationships WHERE member_a_id=$1 AND member_b_id=$2',[ids[14],ids[15]])

// Result insert failure is also all-or-nothing and recoverable under the same ID.
const insertFailure=await begin('manual',[ids[14],ids[15]]),insertEngine=await stage(insertFailure),insertRows=buildManualAdjustment(insertEngine,[ids[14],ids[15]])
await role()
const insertCount=await scalar('SELECT count(*)::integer FROM public.match_results WHERE session_id=$1',[session])
await db.exec("CREATE FUNCTION public.adjust_insert_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'ADJUST_RESULT_INSERT_FAILED'; END$$; CREATE TRIGGER adjust_insert_fail BEFORE INSERT ON public.match_results FOR EACH ROW EXECUTE FUNCTION public.adjust_insert_fail()")
await rejects(()=>complete(insertFailure,insertRows),/ADJUST_RESULT_INSERT_FAILED/,'result insert failure aborts without changing summary or diagnostics')
await role()
check(await scalar('SELECT count(*)::integer FROM public.match_results WHERE session_id=$1',[session]),insertCount,'result failure leaves no partial row')
await db.exec('DROP TRIGGER adjust_insert_fail ON public.match_results')
await fail(insertFailure)
const recoveredInsert=await begin('manual',[ids[14],ids[15]],null,insertFailure.operation.id)
await complete(recoveredInsert,insertRows)
await split(await resultId(recoveredInsert))

// Expired worker ownership changes token, while a different actor never sees raw inputs.
const expired=await begin('manual',[ids[14],ids[15]]),expiredEngine=await stage(expired)
const badMap=structuredClone(expiredEngine);badMap.idMap[1]=badMap.idMap[0]
await server()
await rejects(()=>scalar('SELECT public.admin_stage_matching_adjustment($1,$2,$3,$4)',[expired.operation.id,admin,expired.lease_token,badMap]),/COHORT_MISMATCH/,'duplicate idMap entries cannot be staged')
const foreignReceipt=await scalar('SELECT public.admin_get_matching_adjustment($1,$2)',[expired.operation.id,ctx.superAdmin])
check([foreignReceipt.capture,foreignReceipt.engine_input,foreignReceipt.operation.can_recover],[null,null,false],'another admin receives no raw input and cannot recover the owner operation')
await role();await db.query("UPDATE matching_adjustment.operations SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[expired.operation.id])
check((await get(expired.operation.id)).operation.can_recover,true,'an expired valid operation is recoverable')
const expiredRecovery=await begin('manual',[ids[15],ids[14]],null,expired.operation.id)
check([expiredRecovery.acquired,expiredRecovery.operation.attempt],[true,2],'same member set in another selection order recovers one expired operation')
check(expiredRecovery.engine_input,expiredEngine,'expired recovery retains its frozen engine and policy')
await rejects(()=>complete(expired,buildManualAdjustment(expiredEngine,[ids[14],ids[15]])),/LEASE_STALE/,'an expired earlier token cannot save after another attempt reacquires the lease')
await complete(expiredRecovery,buildManualAdjustment(expiredEngine,[ids[14],ids[15]]))
await split(await resultId(expiredRecovery))

// Independent new registration or published scoring changes do not rewrite a frozen operation.
const concurrent=await begin('manual',[ids[14],ids[15]]),concurrentEngine=await stage(concurrent),concurrentRows=buildManualAdjustment(concurrentEngine,[ids[14],ids[15]])
await role()
const late=randomUUID(),lateUser=randomUUID();ids.push(late);users.push(lateUser)
await db.query("INSERT INTO public.members(id,user_id,member_number) VALUES($1,$2,'ADJUST_LATE')",[late,lateUser])
await db.query("INSERT INTO public.member_identity(member_id,full_name,gender,hobby_tags) VALUES($1,'操作期间新报名','male',ARRAY['桌游'])",[late])
await save(ids.length-1)
await role()
const revisedQuiz=randomUUID()
await db.query("INSERT INTO public.questionnaire_versions(id,kind,version,template) VALUES($1,'quiz',2,$2)",[revisedQuiz,{quizConfig:{dimensions:Object.fromEntries(Object.entries({E:1,A:0,O:0,C:0,N:0}).map(([key,matchWeight])=>[key,{matchWeight}]))}}])
await db.query("UPDATE public.questionnaire_templates SET published_version_id=$1 WHERE kind='quiz'",[revisedQuiz])
check((await complete(concurrent,concurrentRows)).operation.status,'succeeded','unrelated new applicant and new published personality policy do not invalidate frozen selected inputs')
await role()
check(await scalar('SELECT engine_input FROM matching_adjustment.operations WHERE id=$1',[concurrent.operation.id]),concurrentEngine,'saved adjustment retains its original policy and exact member cohort')
await db.query("UPDATE public.questionnaire_templates SET published_version_id=$1 WHERE kind='quiz'",[quiz])
await db.query('DELETE FROM public.questionnaire_versions WHERE id=$1',[revisedQuiz])

// Existing publication, cancellation versions and notices remain protected.
await adminRole()
await scalar("SELECT public.admin_publish_match_session($1,0,'调整后的方案发布验证')",[session])
await player(0)
check((await scalar('SELECT public.get_my_matching_publications()')).find(item=>item.round_id===round).result_id,originalResult,'player receives the original retained duo after adjusted-plan publication')
await scalar("SELECT public.request_my_match_cancellation($1,'原版本取消申请验证',1)",[originalResult])
const oldRequestAt=await scalar('SELECT cancellation_requested_at::text FROM public.match_results WHERE id=$1',[originalResult])
await adminRole()
await scalar("SELECT public.admin_unpublish_match_session($1,1,'调整后撤回仍保持保护')",[session])
await scalar("SELECT public.admin_publish_match_session($1,1,'调整后重新发布第二版')",[session])
await rejects(()=>scalar("SELECT public.admin_approve_matching_cancellation($1,2,$2,'第一版旧申请不能生效')",[originalResult,oldRequestAt]),/STALE/,'stage-one old cancellation version cannot affect a re-published adjusted plan')
await player(0)
await scalar("SELECT public.request_my_match_cancellation($1,'当前版本整结果取消',2)",[originalResult])
const currentRequestAt=await scalar('SELECT cancellation_requested_at::text FROM public.match_results WHERE id=$1',[originalResult])
await adminRole()
await scalar("SELECT public.admin_approve_matching_cancellation($1,2,$2,'当前版本取消整个原配对')",[originalResult,currentRequestAt])
check(await scalar('SELECT status FROM public.match_results WHERE id=$1',[originalResult]),'cancelled','existing current-version cancellation still cancels the complete duo')
await scalar("SELECT public.admin_unpublish_match_session($1,2,'撤回后用新检查恢复原配对')",[session])
const publishedRestore=await begin('restore',[],originalResult),publishedRestoreEngine=await stage(publishedRestore)
await complete(publishedRestore,buildManualAdjustment(publishedRestoreEngine,publishedRestore.selected_member_ids))
check(await resultValue(originalResult),originalStable,'checked restore after real cancellation keeps the old score and members')
await adminRole()
await scalar("SELECT public.admin_publish_match_session($1,2,'恢复后发布第三版结果')",[session])
await player(0)
check(await scalar('SELECT cancellation_status FROM public.match_results WHERE id=$1',[originalResult]),null,'restoration and republishing do not inherit old approved cancellation status')
await scalar("SELECT public.request_my_match_cancellation($1,'第三版仍能再次申请取消',3)",[originalResult])
await adminRole()
await scalar("SELECT public.admin_unpublish_match_session($1,3,'清理隔离发布等待后续隐私测试')",[session])
await role()
check(await scalar('SELECT count(*)::integer FROM matching_publication.active_assignments WHERE round_id=$1',[round]),0,'withdrawal clears all effective assignments without automatic replacement')

// Privacy erases captured sources and displaced explanations together.
const privacy=await begin('manual',[ids[16],ids[17]])
await stage(privacy)
await role()
await db.query("UPDATE matching_adjustment.operations SET prior_diagnostics='[{\"details\":{\"private\":\"old fixture explanation\"}}]'::jsonb WHERE id=$1",[privacy.operation.id])
await db.query("UPDATE public.members SET anonymized_at=now() WHERE id=$1",[ids[16]])
check(await scalar('SELECT source IS NULL AND engine_input IS NULL AND result_snapshot IS NULL AND prior_diagnostics=\'[]\'::jsonb AND redacted_at IS NOT NULL FROM matching_adjustment.operations WHERE id=$1',[privacy.operation.id]),true,'anonymization clears raw input, staged engine, old result snapshot and prior diagnostics')
check((await get(privacy.operation.id)).operation.can_recover,false,'redacted operation is never recoverable')
await rejects(()=>stage(privacy),/REDACTED/,'redacted input cannot be re-staged')
await fail(privacy,'PRIVACY_REDACTED')

await role()
check(await scalar("SELECT jsonb_build_object('templates',(SELECT jsonb_agg(to_jsonb(t)) FROM public.questionnaire_templates t),'versions',(SELECT jsonb_agg(to_jsonb(v)) FROM public.questionnaire_versions v))"),questionnairesBefore,'all original questionnaire definitions remain unchanged')
check(await scalar('SELECT to_jsonb(s) FROM matching_run.snapshots s WHERE session_id=$1',[session]),originalInput,'all adjustments preserve the original normal-run frozen source')
const postflight=await db.exec(read('supabase/audits/matching-adjustment-postflight.sql'))
check(postflight.find(result=>result.rows[0]?.verification)?.rows[0].verification.status,'PASS','actual read-only production postflight passes against fully exercised isolated state')
await adminRole()
await scalar("SELECT public.admin_delete_match_session_draft($1,3,'保留既有显式删除草稿路径')",[session])
await role()
check(await scalar('SELECT count(*)::integer FROM public.match_results WHERE session_id=$1',[session]),0,'existing explicit draft deletion cascades result rows through the new guard')
check(await scalar('SELECT count(*)::integer FROM public.unmatched_diagnostics WHERE session_id=$1',[session]),0,'existing explicit draft deletion cascades diagnostics through the new guard')
check(await scalar('SELECT count(*)::integer FROM matching_adjustment.operations WHERE session_id=$1',[session]),0,'draft deletion also removes private adjustment captures')
console.log(`Matching adjustment SQL/actual engine audit: ${checks} checks passed; isolated PGlite only.`)
await db.close();rmSync(temporary,{recursive:true,force:true})
