// Actual SQL migration / RPC regression. Isolated PostgreSQL only; no live access.
import assert from 'node:assert/strict'
process.env.MATCHING_CANCELLATION_BOUNDARY_SUITE='1'
const {auditContext:c}=await import('./matching-publication-pglite.mjs')
const {db,query,scalar,read,extractFunction,admin,adminUser,members,users,role}=c
let checks=0
const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++}
const rejects=async(sql,pattern,args=[])=>{await assert.rejects(()=>db.query(sql,args),pattern);checks++}
const create=async(ids=members.slice(0,2))=>{
 await role(null)
 const round=await scalar("INSERT INTO public.match_rounds(round_name) VALUES('取消版本隔离测试') RETURNING id")
 await role()
 const session=await scalar("INSERT INTO public.match_sessions(round_id,created_by,total_candidates,total_matched,total_unmatched,audit_reason) VALUES($1,$2,$3,$3,0,'隔离测试审计') RETURNING id",[round,admin,ids.length])
 const result=await scalar("INSERT INTO public.match_results(session_id,member_a_id,member_b_id,group_members,best_slot,audit_reason) VALUES($1,$2,$3,$4,'2026-10-25 下午','隔离测试审计') RETURNING id",[session,ids[0],ids[1],ids.length>2?ids:[]])
 await scalar("SELECT public.admin_finalize_matching_session($1,$2,'open',survey_start,survey_end,'完成版本隔离测试') FROM public.match_rounds WHERE id=$2",[session,round])
 await scalar("SELECT public.admin_publish_match_session($1,0,'发布版本隔离测试')",[session])
 return {round,session,result}
}
const publish=async(f,version)=>{await role();return scalar("SELECT public.admin_publish_match_session($1,$2,'重新发布隔离测试')",[f.session,version])}
const withdraw=async(f,version=1)=>{await role();return scalar("SELECT public.admin_unpublish_match_session($1,$2,'撤回版本隔离测试')",[f.session,version])}
const request=async(f,version=1,reason='本人申请取消测试')=>{
 await role(users[0]);await scalar("SELECT public.request_my_match_cancellation($1,$2,$3)",[f.result,reason,version])
 return scalar('SELECT cancellation_requested_at::text FROM public.match_results WHERE id=$1',[f.result])
}
const review=async(f,requestedAt,version=1,approve=true)=>{
 await role();return scalar(`SELECT public.admin_${approve?'approve':'reject'}_matching_cancellation($1,$2,$3,'审批版本隔离测试')`,[f.result,version,requestedAt])
}
const cancellation=async f=>scalar("SELECT jsonb_build_object('owner',cancellation_publication_version,'by',cancellation_requested_by,'reason',cancellation_reason,'at',cancellation_requested_at,'status',cancellation_status,'reviewer',cancellation_reviewed_by,'reviewed_at',cancellation_reviewed_at) FROM public.match_results WHERE id=$1",[f.result])
const cleared={owner:null,by:null,reason:null,at:null,status:null,reviewer:null,reviewed_at:null}

// Both original failures are demonstrated through the old real RPCs first.
const oldPending=await create();const oldToken=await request(oldPending)
await withdraw(oldPending);await publish(oldPending,1)
await review(oldPending,oldToken,2)
check(await scalar('SELECT status FROM public.match_results WHERE id=$1',[oldPending.result]),'cancelled','pre-fix reproduced: pending V1 incorrectly approves V2')
const oldApproved=await create();await review(oldApproved,await request(oldApproved));await withdraw(oldApproved)
await db.query("UPDATE public.match_results SET status='draft',audit_reason='恢复取消测试' WHERE id=$1",[oldApproved.result])
await db.query("UPDATE public.match_sessions SET total_matched=2,total_unmatched=0,audit_reason='恢复取消汇总' WHERE id=$1",[oldApproved.session])
await publish(oldApproved,1)
check(await scalar('SELECT cancellation_status FROM public.match_results WHERE id=$1',[oldApproved.result]),'approved','pre-fix reproduced: restored V2 still carries approved cancellation')

// Install the established real AFTER audit body, its changed-field helper and
// a private, RLS-protected schema-compatible log. No new archive is introduced.
await role(null)
await db.exec(`ALTER TABLE public.admin_users ADD COLUMN name text DEFAULT '隔离管理员', ADD COLUMN role text DEFAULT 'super_admin';
 CREATE TABLE private.member_profile_audit_log(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id uuid REFERENCES public.members(id) ON DELETE CASCADE,member_id_snapshot uuid,
 action_type text,section text,changed_fields text[],before_values jsonb,after_values jsonb,
 reason text,source text,actor_user_id uuid,actor_admin_id uuid,actor_name text,metadata jsonb);
 ALTER TABLE private.member_profile_audit_log ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON private.member_profile_audit_log FROM PUBLIC,anon,authenticated;
 GRANT SELECT,INSERT ON private.member_profile_audit_log TO service_role;
 GRANT USAGE,SELECT ON SEQUENCE private.member_profile_audit_log_id_seq TO service_role;`)
const master=read('supabase/migrations/20260829175645_user_member_master_v1.sql')
await db.exec(extractFunction(master,'private.member_master_changed_fields'))
await db.exec(extractFunction(master,'private.member_master_audit_related_record_change'))
await db.exec('CREATE TRIGGER member_master_audit_related_change AFTER INSERT OR UPDATE OR DELETE ON public.match_results FOR EACH ROW EXECUTE FUNCTION private.member_master_audit_related_record_change()')
// Production uses explicit safe-column grants rather than table SELECT.
await db.exec(`ALTER TABLE public.members ADD COLUMN attractiveness_score numeric;
 CREATE TABLE public.interview_evaluations(id uuid PRIMARY KEY,attractiveness_score numeric);
 GRANT SELECT ON public.members,public.interview_evaluations,public.match_results TO service_role;`)
await db.exec(read('supabase/migrations/20261023080507_protect_admin_assessment_score_columns.sql'))
const preserved=['members','match_rounds','match_sessions','match_results','community_notifications']
const fingerprint=async()=>Object.fromEntries(await Promise.all(preserved.map(async t=>[t,await scalar(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t)-'cancellation_publication_version' ORDER BY id),'[]'::jsonb)::text) FROM public.${t} t`)])))
const before=await fingerprint()
console.log(JSON.stringify({prior_function_hashes:await query("SELECT p.oid::regprocedure::text AS name,md5(pg_get_functiondef(p.oid)) AS hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='matching_publication' AND p.proname IN('guard_result','unpublish_session','review_cancellation','request_cancellation')) OR (n.nspname='private' AND p.proname='member_master_audit_related_record_change') ORDER BY p.proname")}))
await db.exec('ALTER TABLE public.match_results DISABLE TRIGGER member_master_audit_related_change')
await assert.rejects(()=>db.exec(read('supabase/migrations/20261023173445_matching_cancellation_publication_boundary.sql')),/AUDIT_REQUIRED/);checks++
await db.exec('ROLLBACK; ALTER TABLE public.match_results ENABLE TRIGGER member_master_audit_related_change')
check(await scalar("SELECT count(*)::int FROM pg_attribute WHERE attrelid='public.match_results'::regclass AND attname='cancellation_publication_version' AND NOT attisdropped"),0,'missing audit protection blocks the whole migration before DDL')
await db.exec(read('supabase/migrations/20261023173445_matching_cancellation_publication_boundary.sql'))
check(await fingerprint(),before,'DDL/function migration does not alter prior business rows or send notices')
check(await scalar("SELECT has_column_privilege('authenticated','public.match_results','cancellation_publication_version','SELECT')"),true,'safe request version is available through existing RLS')
check(await scalar("SELECT has_column_privilege('anon','public.match_results','cancellation_publication_version','SELECT')"),false,'new request metadata is not anonymously exposed')
for(const field of ['total_score','score_breakdown'])check(await scalar("SELECT has_column_privilege('authenticated','public.match_results',$1,'SELECT')",[field]),false,'protected score grant is unchanged')

// Pending V1 is invalidated on withdrawal, and cannot affect V2 even if an
// operator supplies the newer session version with the old timestamp.
const pending=await create(members.slice(0,3));const token=await request(pending)
check(await scalar('SELECT cancellation_publication_version FROM public.match_results WHERE id=$1',[pending.result]),1,'new request is bound to publication V1')
await withdraw(pending)
check(await cancellation(pending),cleared,'withdrawal clears pending request and all decision metadata')
await rejects("SELECT public.admin_approve_matching_cancellation($1,1,$2,'过时审批隔离测试')",/STALE/,[pending.result,token])
await publish(pending,1)
await rejects("SELECT public.admin_approve_matching_cancellation($1,2,$2,'旧申请套用新版本')",/STALE/,[pending.result,token])
check(await scalar('SELECT status FROM public.match_results WHERE id=$1',[pending.result]),'confirmed','old pending request leaves V2 effective')
await role(null)
check(await scalar("SELECT count(*)::int FROM private.member_profile_audit_log WHERE metadata->>'record_id'=$1 AND before_values->>'cancellation_status'='pending' AND after_values->'cancellation_status'='null'::jsonb",[pending.result]),3,'withdrawal archives old pending state for each whole-pool member')
check(await scalar("SELECT bool_and(before_values->>'cancellation_reason'='本人申请取消测试' AND (before_values->>'cancellation_publication_version')::int=1) FROM private.member_profile_audit_log WHERE metadata->>'record_id'=$1 AND before_values->>'cancellation_status'='pending' AND after_values->'cancellation_status'='null'::jsonb",[pending.result]),true,'private archive retains prior request reason and owning publication')
await role()
const newToken=await request(pending,2)
await role(null)
await db.exec("CREATE FUNCTION public.test_cancel_notice_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.notification_type='matching_cancelled' THEN RAISE EXCEPTION 'TEST_CANCEL_NOTICE_FAIL'; END IF; RETURN NEW; END$$; CREATE TRIGGER test_cancel_notice_failure BEFORE INSERT ON public.community_notifications FOR EACH ROW EXECUTE FUNCTION public.test_cancel_notice_failure()")
await role()
await rejects("SELECT public.admin_approve_matching_cancellation($1,2,$2,'审批失败事务回归')",/TEST_CANCEL_NOTICE_FAIL/,[pending.result,newToken])
check((await cancellation(pending)).status,'pending','failed cancellation approval retains the request')
check(await scalar('SELECT status FROM public.match_results WHERE id=$1',[pending.result]),'confirmed','failed cancellation approval retains the live result')
await role(null)
check(await scalar('SELECT count(*)::int FROM matching_publication.active_assignments WHERE result_id=$1',[pending.result]),3,'failed cancellation approval retains all pool assignments')
await db.exec('DROP TRIGGER test_cancel_notice_failure ON public.community_notifications')
await review(pending,newToken,2)
check(await scalar('SELECT status FROM public.match_results WHERE id=$1',[pending.result]),'cancelled','new V2 request cancels the whole pool as before')
check((await review(pending,newToken,2)).already_applied,true,'current-version approval retry remains idempotent')
check(await scalar("SELECT count(*)::int FROM public.community_notifications WHERE match_result_id=$1 AND publication_version=2 AND notification_type='matching_cancelled'",[pending.result]),3,'whole pool receives exactly one cancellation notice each')

// Approved -> withdrawn -> restored -> published has no stale UI status.
const approved=await create();const approvedToken=await request(approved);await review(approved,approvedToken)
await withdraw(approved)
check(await cancellation(approved),cleared,'withdrawal clears an approved decision without restoring its cancelled result')
check(await scalar('SELECT status FROM public.match_results WHERE id=$1',[approved.result]),'cancelled','withdrawal itself does not restore cancelled results')
await db.query("UPDATE public.match_results SET status='draft',locked_by=NULL,locked_at=NULL,audit_reason='恢复配对隔离测试' WHERE id=$1",[approved.result])
await db.query("UPDATE public.match_sessions SET total_matched=2,total_unmatched=0,audit_reason='恢复配对汇总测试' WHERE id=$1",[approved.session])
await publish(approved,1)
check(await cancellation(approved),cleared,'new valid publication does not inherit cancelled UI metadata')
await rejects("SELECT public.admin_approve_matching_cancellation($1,2,$2,'旧审批不可应用新结果')",/STALE/,[approved.result,approvedToken])
const retryToken=await request(approved,2)
await review(approved,retryToken,2,false)
check(await scalar('SELECT status FROM public.match_results WHERE id=$1',[approved.result]),'confirmed','rejected cancellation leaves effective result')
const repeatedToken=await request(approved,2)
check((await cancellation(approved)).reviewer,null,'new request after rejection clears previous reviewer')
check((await cancellation(approved)).reviewed_at,null,'new request after rejection clears previous decision time')
await role()
await rejects("SELECT public.admin_approve_matching_cancellation($1,2,$2,'过时同版本申请')",/STALE/,[approved.result,retryToken])
await review(approved,repeatedToken,2)

// Existing withdrawn legacy drafts are not backfilled; simply restoring a
// previously approved result through the normal admin edit drops stale fields.
await role()
await withdraw(oldApproved,2)
await db.query("UPDATE public.match_results SET status='cancelled',audit_reason='旧草稿还原测试' WHERE id=$1",[oldApproved.result])
await db.query("UPDATE public.match_results SET status='draft',audit_reason='旧草稿恢复测试' WHERE id=$1",[oldApproved.result])
check(await cancellation(oldApproved),cleared,'draft restoration clears historical cancelled metadata too')

// A notification failure rolls the entire withdrawal back, including clearing
// the request. Retry later succeeds with no half-state or duplicate notices.
const failure=await create();const failureToken=await request(failure)
await role(null)
await db.exec("CREATE FUNCTION public.test_withdrawal_notice_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.notification_type='matching_withdrawn' THEN RAISE EXCEPTION 'TEST_WITHDRAW_NOTICE_FAIL'; END IF;RETURN NEW;END$$; CREATE TRIGGER test_withdrawal_notice_failure BEFORE INSERT ON public.community_notifications FOR EACH ROW EXECUTE FUNCTION public.test_withdrawal_notice_failure()")
await role()
await rejects("SELECT public.admin_unpublish_match_session($1,1,'失败撤回隔离测试')",/TEST_WITHDRAW_NOTICE_FAIL/,[failure.session])
check(await scalar('SELECT status FROM public.match_sessions WHERE id=$1',[failure.session]),'confirmed','failed withdrawal keeps publication live')
check((await cancellation(failure)).status,'pending','failed withdrawal keeps original request intact')
check((await cancellation(failure)).owner,1,'failed withdrawal keeps request ownership')
await role(null);await db.exec('DROP TRIGGER test_withdrawal_notice_failure ON public.community_notifications')
await withdraw(failure)
check((await withdraw(failure)).already_applied,true,'withdraw retry does not duplicate or resurrect state')
check(await scalar("SELECT count(*)::int FROM public.community_notifications WHERE match_session_id=$1 AND notification_type='matching_withdrawn'",[failure.session]),2,'withdraw retry sends no duplicate notices')
await rejects("SELECT public.admin_approve_matching_cancellation($1,1,$2,'失败后旧审批测试')",/STALE/,[failure.result,failureToken])

// Version metadata cannot be forged; no extra archive exposure is added.
const guarded=await create();await request(guarded)
await role()
await rejects("UPDATE public.match_results SET cancellation_publication_version=2,audit_reason='直接篡改申请版本' WHERE id=$1",/REQUIRES_WITHDRAWAL|REQUIRES_RPC/,[guarded.result])
await role(users[0])
await rejects('SELECT * FROM private.member_profile_audit_log',/permission denied/)
await rejects("SELECT public.admin_approve_matching_cancellation($1,1,now(),'普通玩家审批测试')",/ADMIN_REQUIRED/,[guarded.result])
await role(users[4])
await rejects("SELECT public.request_my_match_cancellation($1,'无关成员申请测试',1)",/PARTICIPANT_REQUIRED/,[guarded.result])
await role(null)
// Actual privacy scrub clears authored fields while keeping numeric provenance.
await db.query("UPDATE public.match_results SET cancellation_requested_by=NULL,cancellation_reason=NULL,audit_reason='既有隐私清理路径' WHERE id=$1",[guarded.result])
check((await cancellation(guarded)).owner,1,'existing privacy scrub may preserve only non-authored version metadata')
check((await cancellation(guarded)).reason,null,'existing privacy scrub remains allowed while published')
for(const who of ['anon','service_role'])for(const signature of ['matching_publication.unpublish_session(uuid,integer,text)','matching_publication.review_cancellation(uuid,integer,timestamptz,text,boolean)','matching_publication.request_cancellation(uuid,text,integer)'])check(await scalar("SELECT has_function_privilege($1,$2,'EXECUTE')",[who,signature]),false,`${who} cannot bypass cancellation helper authorization`)
check(await scalar("SELECT has_function_privilege('authenticated','matching_publication.guard_result()','EXECUTE')"),false,'trigger implementation is not an RPC')
check(await scalar('SELECT count(*)::int FROM matching_publication.write_context'),0,'no trusted write context survives any request')
const postflight=await db.exec(read('supabase/audits/matching-cancellation-boundary-postflight.sql'))
check(postflight.find(result=>result.rows[0]?.verification)?.rows[0].verification.status,'PASS','actual read-only postflight passes against exercised state')
await db.close()
console.log(JSON.stringify({passed:checks,scope:'phase5 cancellation version boundary real SQL, isolated PostgreSQL; plus 77 prior publication checks'}))
