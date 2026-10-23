// Isolated PostgreSQL publication/ACL/state-machine tests; never connects to a live database.
import assert from 'node:assert/strict'
process.on('uncaughtException', error=>{console.error(error.message,error.where||'',error.internalQuery||'',error.position||'');process.exit(1)})
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const root=fileURLToPath(new URL('../../',import.meta.url))
const read=p=>readFileSync(root+'/'+p,'utf8')
function extractFunction(source,name) {
 const i=source.indexOf('CREATE OR REPLACE FUNCTION '+name+'(');assert.ok(i>=0,name)
 const sub=source.slice(i),match=/AS (\$[a-z_]*\$)/i.exec(sub);assert.ok(match,name)
 const end=sub.indexOf(match[1]+';',match.index+match[0].length);return sub.slice(0,end+match[1].length+1)
}
const db=new PGlite()
let checks=0
const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++}
const query=async(sql,args=[])=> (await db.query(sql,args)).rows
const scalar=async(sql,args=[])=>Object.values((await query(sql,args))[0])[0]
const rejects=async(sql,pattern,args=[])=>{await assert.rejects(()=>db.query(sql,args),pattern);checks++}
function table(path,name) { const s=read('supabase/migrations/'+path);const i=s.indexOf('CREATE TABLE '+name+' ('); assert.ok(i>=0,name);return s.slice(i,s.indexOf('\n);',i)+3) }
await db.exec(`
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('role',current_setting('request.jwt.claim.role',true)) $$;
CREATE TABLE public.members(id uuid PRIMARY KEY,user_id uuid,status text DEFAULT 'approved',account_status text DEFAULT 'active',anonymized_at timestamptz);
CREATE TABLE public.admin_users(id uuid PRIMARY KEY,user_id uuid);
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=auth.uid()) $$;
CREATE FUNCTION public.update_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at=now();RETURN NEW;END$$;
CREATE FUNCTION private.member_master_current_admin_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT id FROM public.admin_users WHERE user_id=auth.uid() $$;
CREATE FUNCTION private.profile_current_approved_member_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT id FROM public.members WHERE user_id=auth.uid() AND status='approved' AND account_status='active' AND anonymized_at IS NULL $$;
CREATE TABLE public.match_rounds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),round_name text NOT NULL,purpose text DEFAULT 'matching',status text DEFAULT 'open',survey_start timestamptz DEFAULT now()-interval '1 day',survey_end timestamptz DEFAULT now()+interval '1 day',deleted_at timestamptz,created_at timestamptz DEFAULT now());
CREATE TABLE public.match_round_submissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),round_id uuid REFERENCES public.match_rounds(id),member_id uuid REFERENCES public.members(id),cancelled_at timestamptz,created_at timestamptz DEFAULT now());
`)
await db.exec(table('004_matching.sql','public.match_sessions'))
await db.exec(table('004_matching.sql','public.match_results'))
await db.exec(read('supabase/migrations/015_matching_enhance.sql'))
await db.exec(read('supabase/migrations/024_cancellation_request.sql'))
await db.exec(`
ALTER TABLE public.match_sessions ADD COLUMN round_id uuid REFERENCES public.match_rounds(id),ADD COLUMN audit_reason text;
ALTER TABLE public.match_results ADD COLUMN audit_reason text;
CREATE TABLE public.mutual_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),match_result_id uuid REFERENCES public.match_results(id),reviewer_id uuid,reviewee_id uuid,comment text);
ALTER TABLE public.match_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_sessions ON public.match_sessions FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
CREATE POLICY admin_results ON public.match_results FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
CREATE POLICY member_master_match_results_active_self_read ON public.match_results FOR SELECT TO authenticated USING(true);
CREATE POLICY member_master_match_sessions_active_member_read ON public.match_sessions FOR SELECT TO authenticated USING(true);
`)
// Real notification structure plus the incremental columns available before this migration.
await db.exec(`CREATE TABLE public.community_profiles(id uuid PRIMARY KEY); CREATE TABLE public.community_posts(id uuid PRIMARY KEY); CREATE TABLE public.community_comments(id uuid PRIMARY KEY); CREATE TABLE public.community_reports(id uuid PRIMARY KEY); CREATE TABLE public.community_announcements(id uuid PRIMARY KEY);`)
await db.exec(table('20260716165130_community_v1_schema.sql','public.community_notifications'))
await db.exec(`ALTER TABLE public.community_notifications ADD COLUMN round_id uuid REFERENCES public.match_rounds(id);
GRANT USAGE ON SCHEMA public,auth,private TO authenticated,anon,service_role;
GRANT SELECT ON public.members,public.admin_users,public.match_rounds TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.match_sessions,public.match_results,public.unmatched_diagnostics TO authenticated;
GRANT SELECT ON public.community_notifications TO authenticated;
`)
const admin='10000000-0000-4000-8000-000000000001',adminUser='10000000-0000-4000-8000-000000000002'
const members=Array.from({length:8},(_,i)=>`20000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`)
const users=members.map((_,i)=>`30000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`)
await db.query('INSERT INTO public.admin_users VALUES($1,$2)',[admin,adminUser])
for(let i=0;i<members.length;i++)await db.query('INSERT INTO public.members(id,user_id) VALUES($1,$2)',[members[i],users[i]])
const round=await scalar("INSERT INTO public.match_rounds(round_name) VALUES('隔离测试轮次') RETURNING id")
// Existing draft row tests the metadata-only legacy marker: old business values remain untouched.
const legacy=await scalar("INSERT INTO public.match_sessions(round_id,created_by,total_candidates,total_matched,total_unmatched) VALUES($1,$2,2,2,0) RETURNING id",[round,admin])
await db.query('INSERT INTO public.match_results(session_id,member_a_id,member_b_id) VALUES($1,$2,$3)',[legacy,members[6],members[7]])
const oldSession=await scalar('SELECT to_jsonb(session) FROM public.match_sessions session WHERE id=$1',[legacy])
// Pre-migration published data may contain a cancelled older result for a
// member who is actively matched elsewhere in the same session. Insert the
// cancelled row first so provenance backfill must explicitly prefer active.
const backfillRound=await scalar("INSERT INTO public.match_rounds(round_name,status) VALUES('已发布历史回填','matched') RETURNING id")
const backfillSession=await scalar("INSERT INTO public.match_sessions(round_id,created_by,status,total_candidates,total_matched,total_unmatched) VALUES($1,$2,'confirmed',3,2,1) RETURNING id",[backfillRound,admin])
await db.query("INSERT INTO public.match_results(session_id,member_a_id,member_b_id,status) VALUES($1,$2,$3,'cancelled')",[backfillSession,members[4],members[6]])
const backfillActive=await scalar("INSERT INTO public.match_results(session_id,member_a_id,member_b_id,status) VALUES($1,$2,$3,'confirmed') RETURNING id",[backfillSession,members[4],members[5]])

await db.exec(extractFunction(read('supabase/migrations/20260829175645_user_member_master_v1.sql'),'private.member_master_lock_non_anonymized_subjects'))
await db.exec(extractFunction(read('supabase/migrations/20260830174115_fix_operational_audit_trigger_record_scope.sql'),'private.member_master_capture_operational_audit_reason'))
await db.exec('ALTER TABLE public.unmatched_diagnostics ADD COLUMN audit_reason text; ALTER TABLE public.mutual_reviews ADD COLUMN audit_reason text;')
for(const name of ['match_sessions','match_results','unmatched_diagnostics','mutual_reviews'])await db.exec(`CREATE TRIGGER member_master_capture_audit_reason BEFORE INSERT OR UPDATE OR DELETE ON public.${name} FOR EACH ROW EXECUTE FUNCTION private.member_master_capture_operational_audit_reason()`)
await db.query('UPDATE public.members SET anonymized_at=now() WHERE id=$1',[members[7]])
await db.exec(read('supabase/migrations/20261022183350_matching_publication_delivery.sql'))
const newSession=await scalar("SELECT to_jsonb(session)-ARRAY['results_ready','publication_version','published_at'] FROM public.match_sessions session WHERE id=$1",[legacy])
check(newSession,oldSession,'DDL preserves all original legacy business values')
check(await scalar('SELECT results_ready FROM public.match_sessions WHERE id=$1',[legacy]),true,'legacy DDL marker')
check(await scalar('SELECT result_id FROM matching_publication.roster roster JOIN matching_publication.publications publication ON publication.id=roster.publication_id WHERE publication.session_id=$1 AND roster.member_id=$2',[backfillSession,members[4]]),backfillActive,'legacy active result wins over earlier cancelled history in roster')
check(await scalar('SELECT outcome FROM matching_publication.roster roster JOIN matching_publication.publications publication ON publication.id=roster.publication_id WHERE publication.session_id=$1 AND roster.member_id=$2',[backfillSession,members[4]]),'matched','legacy active result outcome is matched')
check(await scalar('SELECT count(*)::int FROM public.community_notifications WHERE match_session_id=$1',[backfillSession]),0,'legacy backfill sends no retroactive notice')

await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${adminUser}',false)`)
const create=async(r=round,ids=[members[0],members[1]],extraUnmatched=[])=>{
 const s=await scalar("INSERT INTO public.match_sessions(round_id,created_by,total_candidates,total_matched,total_unmatched,audit_reason) VALUES($1,$2,$3,$4,$5,'隔离测试审计') RETURNING id",[r,admin,ids.length+extraUnmatched.length,ids.length,extraUnmatched.length])
 const result=await scalar("INSERT INTO public.match_results(session_id,member_a_id,member_b_id,group_members,best_slot,audit_reason) VALUES($1,$2,$3,$4,$5,'隔离测试审计') RETURNING id",[s,ids[0],ids[1],ids.length>2?ids:[],'2026-10-25 下午'])
 for(const m of extraUnmatched)await db.query("INSERT INTO public.unmatched_diagnostics(session_id,member_id,reason,audit_reason) VALUES($1,$2,'overflow','隔离测试审计')",[s,m])
 return {s,result}
}
const finalize=async s=>scalar("SELECT public.admin_finalize_matching_session($1,$2,'open',round.survey_start,round.survey_end,'完成隔离测试') FROM public.match_rounds round WHERE id=$2",[s,round])
const publish=async(s,version=0)=>scalar("SELECT public.admin_publish_match_session($1,$2,'发布隔离测试')",[s,version])
const unpublish=async(s,version=1)=>scalar("SELECT public.admin_unpublish_match_session($1,$2,'撤回隔离测试')",[s,version])
const first=await create(round,members.slice(0,3),[members[3]])
const otherGroup=await scalar("INSERT INTO public.match_results(session_id,member_a_id,member_b_id,audit_reason) VALUES($1,$2,$3,'隔离测试审计') RETURNING id",[first.s,members[5],members[6]])
await db.query("UPDATE public.match_sessions SET total_candidates=6,total_matched=5,audit_reason='隔离测试审计' WHERE id=$1",[first.s])
check(await scalar('SELECT results_ready FROM public.match_sessions WHERE id=$1',[first.s]),false,'new rows not ready')
await rejects("SELECT public.admin_publish_match_session($1,0,'发布隔离测试')",/INCOMPLETE/,[first.s])
await rejects('UPDATE public.match_sessions SET results_ready=true WHERE id=$1',/REQUIRES_WITHDRAWAL/,[first.s])
await finalize(first.s)
check(await scalar('SELECT status FROM public.match_rounds WHERE id=$1',[round]),'open','finalize preserves ongoing collection')
const pub=await publish(first.s)
check(pub.publication_version,1,'first publish version')
check((await publish(first.s)).already_applied,true,'publish retry idempotent')
check(await scalar('SELECT count(*)::int FROM public.community_notifications WHERE match_session_id=$1',[first.s]),6,'one transaction creates matched/unmatched notices once')
await db.exec('RESET ROLE')
check(await scalar('SELECT count(*)::int FROM matching_publication.active_assignments WHERE round_id=$1',[round]),5,'group member_a duplication not double counted')
await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${adminUser}',false)`)
await rejects('UPDATE public.match_results SET best_slot=$2 WHERE id=$1',/REQUIRES_WITHDRAWAL/,[first.result,'2026-10-26 上午'])
await rejects("UPDATE public.match_results SET status='cancelled' WHERE id=$1",/REQUIRES_WITHDRAWAL/,[first.result])
await rejects('DELETE FROM public.match_results WHERE id=$1',/REQUIRES_WITHDRAWAL/,[first.result])
await rejects('DELETE FROM public.match_sessions WHERE id=$1',/REQUIRES_WITHDRAWAL/,[first.s])
await rejects('UPDATE public.match_sessions SET total_matched=0 WHERE id=$1',/REQUIRES_WITHDRAWAL/,[first.s])
await rejects("UPDATE public.match_results SET cancellation_status='rejected',cancellation_reviewed_at=now() WHERE id=$1",/REQUIRES_WITHDRAWAL/,[first.result])
await rejects("UPDATE public.match_results SET cancellation_status='pending',cancellation_requested_at=now(),cancellation_requested_by=$2 WHERE id=$1",/REQUIRES_WITHDRAWAL/,[first.result,members[0]])
await rejects("INSERT INTO public.unmatched_diagnostics(session_id,member_id,reason) VALUES($1,$2,'late')",/REQUIRES_WITHDRAWAL/,[first.s,members[7]])
await rejects('INSERT INTO matching_publication.write_context VALUES(txid_current(),pg_backend_pid(),$1,$2)',/permission denied/,[first.s,'publish'])
await db.query("SELECT set_config('app.matching_publication_write','on',false)")
await rejects("UPDATE public.match_results SET status='draft' WHERE id=$1",/REQUIRES_WITHDRAWAL/,[first.result])
const competing=await create(round,[members[1],members[4]])
await finalize(competing.s)
await rejects("SELECT public.admin_publish_match_session($1,0,'发布隔离测试')",/CONFLICT/,[competing.s])
check(await scalar('SELECT count(*)::int FROM public.community_notifications WHERE match_session_id=$1',[competing.s]),0,'conflict rolls back notices')
check(await scalar('SELECT status FROM public.match_sessions WHERE id=$1',[competing.s]),'draft','conflict leaves draft')
// Player RLS exposes only their published result, never a competing draft.
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[users[1]])
check((await query('SELECT id FROM public.match_results')).map(r=>r.id),[first.result],'player direct Data API RLS protects draft')
await rejects("SELECT public.admin_publish_match_session($1,0,'不合法发布')",/ADMIN_REQUIRED/,[competing.s])
await rejects("SELECT public.request_my_match_cancellation($1,'申请取消',0)",/STALE/,[first.result])
await scalar("SELECT public.request_my_match_cancellation($1,'申请取消',1)",[first.result])
check(await scalar('SELECT cancellation_status FROM public.match_results WHERE id=$1',[first.result]),'pending','published player cancellation request preserved')
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[adminUser])
await scalar("SELECT public.admin_approve_matching_cancellation($1,1,(SELECT cancellation_requested_at FROM public.match_results WHERE id=$1),'批准隔离取消')",[first.result])
check(await scalar('SELECT status FROM public.match_sessions WHERE id=$1',[first.s]),'confirmed','cancellation keeps other publication intact')
check(await scalar('SELECT status FROM public.match_results WHERE id=$1',[otherGroup]),'confirmed','cancelling one group leaves another published group intact')
check(await scalar("SELECT count(*)::int FROM public.community_notifications WHERE notification_type='matching_cancelled' AND match_result_id=$1",[first.result]),3,'all affected group members notified once')
check((await scalar("SELECT public.admin_approve_matching_cancellation($1,1,(SELECT cancellation_requested_at FROM public.match_results WHERE id=$1),'批准隔离取消')",[first.result])).already_applied,true,'cancel approval retry idempotent')
await publish(competing.s)
await db.exec('RESET ROLE')
check(await scalar('SELECT count(*)::int FROM matching_publication.active_assignments WHERE round_id=$1',[round]),4,'cancelled assignment released for another session')
await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${users[1]}',false)`)
check((await scalar('SELECT public.get_my_matching_publications()'))[0].result_id,competing.result,'active assignment wins over old cancelled outcome')
check((await query('SELECT id FROM public.match_results')).length,2,'published cancelled history remains visible')
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[adminUser])
await unpublish(first.s)
await publish(first.s,1)
check(await scalar("SELECT count(*)::int FROM public.community_notifications WHERE match_session_id=$1 AND publication_version=2 AND notification_type='matching_unmatched' AND recipient_member_id=$2",[first.s,members[1]]),0,'old batch never sends unmatched to new assigned member')
await rejects("SELECT public.admin_unpublish_match_session($1,1,'旧页面撤回')",/STALE/,[first.s])
await unpublish(first.s,2)
check((await unpublish(first.s,2)).already_applied,true,'withdraw retry idempotent')
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[users[0]])
check((await query('SELECT id FROM public.match_results WHERE id=$1',[first.result])).length,0,'withdrawn history hidden from direct API')
await rejects("SELECT public.request_my_match_cancellation($1,'旧链接取消',2)",/NOT_PUBLISHED/,[first.result])
await rejects('INSERT INTO public.mutual_reviews(match_result_id,reviewer_id,reviewee_id,match_publication_version) VALUES($1,$2,$3,2)',/NOT_PUBLISHED|permission denied/,[first.result,members[0],members[1]])
await db.exec('RESET ROLE')
await rejects('INSERT INTO public.mutual_reviews(match_result_id,reviewer_id,reviewee_id,match_publication_version) VALUES($1,$2,$3,2)',/NOT_PUBLISHED/,[first.result,members[0],members[1]])
await rejects('INSERT INTO public.mutual_reviews(match_result_id,reviewer_id,reviewee_id,match_publication_version) VALUES($1,$2,$3,0)',/NOT_PUBLISHED/,[competing.result,members[1],members[4]])
await db.query('INSERT INTO public.mutual_reviews(match_result_id,reviewer_id,reviewee_id,match_publication_version) VALUES($1,$2,$3,1)',[competing.result,members[1],members[4]])
check(await scalar('SELECT count(*)::int FROM public.mutual_reviews'),1,'current published review version accepted')
// Metadata-only privacy erasure stays allowed while published.
await db.query("UPDATE public.match_results SET cancellation_requested_by=NULL,cancellation_reason=NULL,audit_reason='隐私清除审计' WHERE id=$1",[first.result])
check(await scalar('SELECT publication_version FROM public.match_results WHERE id=$1',[first.result]),1,'privacy erasure does not change publication provenance')
await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${adminUser}',false)`)
// Admin draft delete must not reset a matched round with another live session.
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[adminUser])
await db.exec('RESET ROLE')
await db.query("UPDATE public.match_rounds SET status='matched' WHERE id=$1",[round])
await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${adminUser}',false)`)
await scalar("SELECT public.admin_delete_match_session_draft($1,2,'删除旧隔离草稿')",[first.s])
check(await scalar('SELECT status FROM public.match_rounds WHERE id=$1',[round]),'matched','older draft deletion preserves surviving session round')
check(await scalar("SELECT count(*)::int FROM public.community_notifications WHERE match_session_id=$1 AND notification_type='matching_withdrawn'",[first.s])>0,true,'withdrawal notices survive old draft deletion')
await rejects("SELECT public.admin_delete_match_session_draft($1,1,'删除发布会话')",/REQUIRES_WITHDRAWAL/,[competing.s])
await db.exec('RESET ROLE')
check(await scalar('SELECT count(*)::int FROM matching_publication.write_context'),0,'trusted contexts never survive transaction completion')
// Failures after notices begin still roll back statuses, assignments and notices.
const failureRound=await scalar("INSERT INTO public.match_rounds(round_name) VALUES('事务失败轮次') RETURNING id")
await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${adminUser}',false)`)
const failure=await create(failureRound,[members[5],members[6]])
await rejects("SELECT public.admin_finalize_matching_session($1,$2,'closed',survey_start,survey_end,'失败截止测试') FROM public.match_rounds WHERE id=$2",/STALE/,[failure.s,failureRound])
check(await scalar('SELECT results_ready FROM public.match_sessions WHERE id=$1',[failure.s]),false,'failed finalize never marks ready')
check(await scalar('SELECT status FROM public.match_rounds WHERE id=$1',[failureRound]),'open','failed finalize never drifts round status')
await scalar("SELECT public.admin_finalize_matching_session($1,$2,'open',survey_start,survey_end,'完成失败测试') FROM public.match_rounds WHERE id=$2",[failure.s,failureRound])
await db.exec('RESET ROLE')
await db.exec("CREATE FUNCTION public.test_notice_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.notification_type='matching_published' THEN RAISE EXCEPTION 'TEST_NOTIFICATION_FAIL';END IF;RETURN NEW;END$$; CREATE TRIGGER test_notice_failure BEFORE INSERT ON public.community_notifications FOR EACH ROW EXECUTE FUNCTION public.test_notice_failure()")
await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${adminUser}',false)`)
await rejects("SELECT public.admin_publish_match_session($1,0,'发布失败测试')",/TEST_NOTIFICATION_FAIL/,[failure.s])
check(await scalar('SELECT status FROM public.match_sessions WHERE id=$1',[failure.s]),'draft','notification failure rolls back session status')
check(await scalar('SELECT status FROM public.match_results WHERE id=$1',[failure.result]),'draft','notification failure rolls back result status')
check(await scalar('SELECT count(*)::int FROM public.community_notifications WHERE match_session_id=$1',[failure.s]),0,'notification failure leaves no notices')
await db.exec('RESET ROLE; DROP TRIGGER test_notice_failure ON public.community_notifications;')
check(await scalar('SELECT count(*)::int FROM matching_publication.active_assignments WHERE round_id=$1',[failureRound]),0,'failed publish leaves no assignment')
// A split before first publication is an unmatched participant, not a lost
// candidate, and can be withdrawn/republished without changing stored totals.
await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${adminUser}',false)`)
const split=await create(failureRound,[members[0],members[3]])
await db.query("UPDATE public.match_results SET status='cancelled',audit_reason='拆分测试配对' WHERE id=$1",[split.result])
await db.query("UPDATE public.match_sessions SET total_matched=0,total_unmatched=2,audit_reason='拆分测试汇总' WHERE id=$1",[split.s])
await scalar("SELECT public.admin_finalize_matching_session($1,$2,'open',survey_start,survey_end,'完成拆分测试') FROM public.match_rounds WHERE id=$2",[split.s,failureRound])
await publish(split.s)
check(await scalar("SELECT count(*)::int FROM public.community_notifications WHERE match_session_id=$1 AND notification_type='matching_unmatched'",[split.s]),2,'split members receive unmatched outcome')
check(await scalar('SELECT total_candidates FROM public.match_sessions WHERE id=$1',[split.s]),2,'split candidates not dropped from totals')
await unpublish(split.s)
await publish(split.s,1)
check(await scalar('SELECT publication_version FROM public.match_sessions WHERE id=$1',[split.s]),2,'never-published split can be republished with intact roster')
await rejects("SELECT public.admin_publish_match_session($1,0,'匿名化记录拒绝发布')",/INVALID_MEMBER/,[legacy])
check(await scalar('SELECT count(*)::int FROM public.community_notifications WHERE match_session_id=$1',[legacy]),0,'invalid legacy member creates no notice')
// Request token prevents an old approval from approving a new application in
// the same publication version (reject -> request again -> stale admin page).
const aba=await create(failureRound,[members[0],members[3]])
await scalar("SELECT public.admin_finalize_matching_session($1,$2,'open',survey_start,survey_end,'完成审批测试') FROM public.match_rounds WHERE id=$2",[aba.s,failureRound])
await publish(aba.s)
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[users[0]])
await scalar("SELECT public.request_my_match_cancellation($1,'首次申请取消',1)",[aba.result])
const requestOne=await scalar('SELECT cancellation_requested_at::text FROM public.match_results WHERE id=$1',[aba.result])
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[adminUser])
await scalar("SELECT public.admin_reject_matching_cancellation($1,1,$2,'拒绝首次申请')",[aba.result,requestOne])
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[users[0]])
await scalar("SELECT public.request_my_match_cancellation($1,'再次申请取消',1)",[aba.result])
const requestTwo=await scalar('SELECT cancellation_requested_at::text FROM public.match_results WHERE id=$1',[aba.result])
check(requestTwo!==requestOne,true,'each request has distinct database timestamp token')
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[adminUser])
await rejects("SELECT public.admin_approve_matching_cancellation($1,1,$2,'过时审批页面')",/STALE/,[aba.result,requestOne])
check(await scalar('SELECT cancellation_status FROM public.match_results WHERE id=$1',[aba.result]),'pending','stale request approval preserves latest pending request')
await scalar("SELECT public.admin_approve_matching_cancellation($1,1,$2,'批准当前申请')",[aba.result,requestTwo])
check(await scalar('SELECT status FROM public.match_results WHERE id=$1',[aba.result]),'cancelled','current request approval accepted')
await db.exec('RESET ROLE')
const closedRound=await scalar("INSERT INTO public.match_rounds(round_name,status) VALUES('已截止测试','closed') RETURNING id")
await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${adminUser}',false)`)
const closed=await create(closedRound,[members[5],members[6]])
await scalar("SELECT public.admin_finalize_matching_session($1,$2,'closed',survey_start,survey_end,'完成已截止测试') FROM public.match_rounds WHERE id=$2",[closed.s,closedRound])
check(await scalar('SELECT status FROM public.match_rounds WHERE id=$1',[closedRound]),'matched','closed finalize retains original matched transition')
await scalar("SELECT public.admin_delete_match_session_draft($1,0,'删除唯一草稿')",[closed.s])
check(await scalar('SELECT status FROM public.match_rounds WHERE id=$1',[closedRound]),'closed','deleting sole draft restores original closed behavior')
await db.exec('RESET ROLE')
check(await scalar('SELECT count(*)::int FROM matching_publication.write_context'),0,'all later operations clear trusted contexts')
// Withdrawal clears active publication provenance. A later manual split is
// a new unmatched outcome, not an approved historical cancellation.
await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${adminUser}',false)`)
const afterWithdraw=await create(failureRound,[members[5],members[6]])
await scalar("SELECT public.admin_finalize_matching_session($1,$2,'open',survey_start,survey_end,'完成撤回拆分测试') FROM public.match_rounds WHERE id=$2",[afterWithdraw.s,failureRound])
await publish(afterWithdraw.s)
await unpublish(afterWithdraw.s)
check(await scalar('SELECT publication_version FROM public.match_results WHERE id=$1',[afterWithdraw.result]),0,'withdrawn active result no longer carries published provenance')
await db.query("UPDATE public.match_results SET status='cancelled',audit_reason='撤回后拆分' WHERE id=$1",[afterWithdraw.result])
await db.query("UPDATE public.match_sessions SET total_matched=0,total_unmatched=2,audit_reason='撤回拆分汇总' WHERE id=$1",[afterWithdraw.s])
await publish(afterWithdraw.s,1)
check(await scalar("SELECT count(*)::int FROM public.community_notifications WHERE match_session_id=$1 AND publication_version=2 AND notification_type='matching_unmatched'",[afterWithdraw.s]),2,'withdraw then split sends new batch unmatched outcome')
await db.exec('RESET ROLE')
// Role ACL: exposed schema contains no new definer implementation; private data
// and direct RPC helpers cannot be read/invoked by anon/service_role.
check(await scalar("SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('admin_publish_match_session','admin_unpublish_match_session','admin_delete_match_session_draft','admin_approve_matching_cancellation','admin_reject_matching_cancellation','get_my_matching_publications','admin_finalize_matching_session') AND p.prosecdef"),0,'public wrappers are all invoker')
check(await scalar("SELECT has_table_privilege('authenticated','matching_publication.write_context','INSERT')"),false,'context cannot be forged')
check(await scalar("SELECT has_function_privilege('anon','public.admin_publish_match_session(uuid,integer,text)','EXECUTE')"),false,'anonymous publish denied')
check(await scalar("SELECT has_function_privilege('service_role','matching_publication.publish_session(uuid,integer,text)','EXECUTE')"),false,'service role cannot bypass operator authorization')
export const auditContext=process.env.MATCHING_CANCELLATION_BOUNDARY_SUITE==='1'?{db,query,scalar,read,extractFunction,admin,adminUser,members,users,role:async(user=adminUser)=>{await db.exec('RESET ROLE');if(user){await db.exec('SET ROLE authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user])}else await db.query("SELECT set_config('request.jwt.claim.sub','',false)")}}:null
if(!auditContext)await db.close()
console.log(JSON.stringify({passed:checks,scope:'real migration SQL, isolated PostgreSQL only'}))
