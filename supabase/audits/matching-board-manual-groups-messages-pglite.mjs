// Real PostgreSQL guards and actual matching-engine outputs. Offline fixtures
// only: this program has no remote connection or Production credentials.
import assert from 'node:assert/strict'
import {rmSync} from 'node:fs'
process.env.MATCHING_BOARD_MEMBER_LOCK_SUITE='1'
const {boardAuditContext:ctx}=await import('./matching-board-pglite.mjs')
const {db,scalar,role,read,admin,server,adminRole,player,session,ids,get,params,persist,answers,submit,prepareMatchingRunInput,buildManualAdjustment,preparePublicationPreflightInput,inspectPublicationPreflight,temporary}=ctx
let checks=0
const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++}
const rejects=async(work,pattern,message)=>{await assert.rejects(work,error=>pattern.test(String(error.message)),message);checks++}
const layout=(small=[],manual=[],waiting=[],message='',slot=null)=>({waitingDuoIds:[],brokenPairs:[],multiMode:'grouped',waitingMultiIds:waiting,multiPoolSlot:slot,smallGroupMemberIds:small,manualSmallGroupMemberIds:manual,unmatchedMessage:message})
const group=(board,members,slot='2026-10-27_下午')=>buildManualAdjustment(prepareMatchingRunInput(board.capture).engineInput,members).map(row=>({...row,best_slot:slot}))
const protectedState=()=>scalar("SELECT jsonb_build_object('results',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.match_results r),'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.match_sessions s),'rounds',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.match_rounds r),'submissions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.match_round_submissions s),'snapshots',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM matching_run.snapshots s),'board',(SELECT jsonb_agg(to_jsonb(s) ORDER BY session_id) FROM matching_board.state s),'notices',(SELECT count(*) FROM public.community_notifications),'publications',(SELECT count(*) FROM matching_publication.publications),'audits',(SELECT count(*) FROM private.member_profile_audit_log),'operations',(SELECT count(*) FROM matching_board.operations))")
const outcomes=async index=>{await player(index);return scalar('SELECT public.get_my_matching_publications()')}
await role()
const beforeMigration=await protectedState()
await db.exec(read('supabase/migrations/20261103121145_matching_board_manual_groups_messages.sql'))
check(await protectedState(),beforeMigration,'migration changes no existing business row, result, configuration, assignment, audit or notification')
for(const signature of ['matching_board.normalize_unmatched_message(text)','matching_board.validate_layout_extras(jsonb,jsonb)','matching_board.active_manual_small_groups(uuid,jsonb)','matching_board.unmatched_message_recipient_ids(uuid)','matching_publication.guard_unmatched_message()']){
 for(const actor of ['anon','authenticated','service_role'])check(await scalar("SELECT has_function_privilege($1,$2,'EXECUTE')",[actor,signature]),false,`${signature}: no direct ${actor} access`)
 check(await scalar('SELECT prosecdef FROM pg_proc WHERE oid=$1::regprocedure',[signature]),false,`${signature}: invoker only`)
}
let board=await get()
check(board.layout,{waitingDuoIds:[],brokenPairs:[]},'opening an old board adds no saved message or manual marker')
await persist(params(board));board=await get()
check(board.layout,{waitingDuoIds:[],brokenPairs:[]},'legacy save payloads still work before adopting new metadata')
const legacyPool=board.results.find(row=>!row.member_b_id)
const changedLegacy=group(board,legacyPool.group_members,'2026-10-30_下午')
await rejects(()=>persist(params(board,{keep:board.results.filter(row=>row.member_b_id).map(row=>row.id),rows:changedLegacy})),/MULTI_TIME_CHANGED/,'legacy single-pool common-time retention is unchanged')
// Validation-only probes isolate malformed classification inputs from scoring.
const seven=ids.slice(0,7),three=ids.slice(7,10)
const row=members=>({member_b_id:null,group_members:members})
const validate=(value,previous={},kept=[])=>scalar('SELECT matching_board.validate_small_groups($1,$2,$3,$4)',[value,[row(seven),row(three)],previous,kept])
await role()
await rejects(()=>validate(layout([seven],[])),/SMALL_GROUP_SIZE/,'an automatic recommendation marker never permits seven people')
await rejects(()=>validate(layout([three],[])),/SMALL_GROUP_SIZE/,'an automatic recommendation marker never permits three people')
await validate(layout([seven,three],[seven,three]));checks++
for(const manual of [null,{},'manual',[null],[{}],[[1,2,3]],[[...seven.slice(0,6),seven[0]]],[seven,seven]])await rejects(()=>validate({...layout([seven,three]),manualSmallGroupMemberIds:manual}),/LAYOUT_INVALID/,'malformed manual markers fail closed')
await rejects(()=>validate(layout([seven],[three])),/MANUAL_GROUP_OUTPUT/,'manual permission must refer to one exact classified small group')
await rejects(()=>validate(layout([seven],[seven.slice(0,3)])),/MANUAL_GROUP_OUTPUT/,'a subset marker cannot authorize a different whole group')
// Everyone in this isolated cohort may join either kind, with one shared date.
for(let index=0;index<10;index++)await submit(index,answers('都可以'))
board=await get()
const message='本轮暂未找到合适安排。\n工作人员会继续协调，请留意站内通知。'
const grouped=layout([seven,three],[seven,three],[],message)
await persist(params(board,{keep:[],rows:[...group(board,seven),...group(board,three)],layout:grouped,unmatched:[]}));board=await get()
check(board.results.map(result=>result.group_members.length).sort(),[3,7],'three- and seven-person manually adjusted small groups both persist')
check(board.layout,grouped,'manual markers and public message survive a fresh read')
await role();await db.exec('BEGIN');await db.query('UPDATE public.members SET anonymized_at=now() WHERE id=$1',[seven[0]]);await db.exec('SET CONSTRAINTS ALL IMMEDIATE')
check(await scalar("SELECT layout->'manualSmallGroupMemberIds' FROM matching_board.state WHERE session_id=$1",[session]),[three],'privacy cleanup removes the affected seven-person manual classification')
check(await scalar("SELECT layout->'smallGroupMemberIds' FROM matching_board.state WHERE session_id=$1",[session]),[three],'privacy cleanup keeps the ordinary and manual classification sets aligned')
await db.exec('ROLLBACK')
for(const key of ['manualSmallGroupMemberIds','unmatchedMessage']){
 const old={...grouped};delete old[key]
 await rejects(()=>persist(params(board,{layout:old,unmatched:[]})),/MANUAL_GROUP_REQUIRED|UNMATCHED_MESSAGE_REQUIRED/,'cached clients cannot silently drop new saved information')
}
await rejects(()=>persist(params(board,{layout:{...grouped,manualSmallGroupMemberIds:[]},unmatched:[]})),/MANUAL_GROUP_REQUIRED|SMALL_GROUP_SIZE/,'kept manual small groups retain their manual classification')
for(const note of [null,{},300,'字'.repeat(301),'😀'.repeat(301)])await rejects(()=>persist(params(board,{layout:{...grouped,unmatchedMessage:note},unmatched:[]})),/UNMATCHED_MESSAGE_INVALID/,'message type and Unicode length are validated in the database')
await persist(params(board,{layout:{...grouped,unmatchedMessage:'😀'.repeat(300)},unmatched:[]}));board=await get()
check(Array.from(board.layout.unmatchedMessage).length,300,'300 Unicode codepoints are accepted')
await persist(params(board,{layout:{...grouped,unmatchedMessage:''},unmatched:[]}));board=await get()
check(board.layout.unmatchedMessage,'','explicit empty text clears a draft message')
const whitespace='\uFEFF\u00A0\t\n\u3000'
await persist(params(board,{layout:{...grouped,unmatchedMessage:whitespace+'😀'.repeat(300)+whitespace},unmatched:[]}));board=await get()
check(board.layout.unmatchedMessage,'😀'.repeat(300),'saved normalization matches JavaScript trim for Unicode whitespace and codepoint length')
await persist(params(board,{layout:{...grouped,unmatchedMessage:whitespace},unmatched:[]}));board=await get()
check(board.layout.unmatchedMessage,'','Unicode-whitespace-only public messages normalize to empty')
// One manual group, one duo and one unmatched player exercise frozen delivery.
const duo=ids.slice(7,9),unmatched=[ids[9]]
await persist(params(board,{keep:[],rows:[...group(board,seven),...group(board,duo)],layout:layout([seven],[seven],[],message),unmatched}));board=await get()
check(board.unmatched_message_recipient_ids,unmatched,'board capture exposes the authoritative message recipient plan')
await role()
const noticesBefore=await scalar('SELECT count(*)::integer FROM public.community_notifications')
check((await outcomes(9)).find(item=>item.round_id===ctx.round).unmatched_message,null,'a draft message never appears in a waiting player outcome')
await server()
const initialPreparation=await scalar('SELECT public.admin_prepare_match_publication($1,$2,0)',[session,admin])
check(initialPreparation.unmatched_message,message,'publication preparation exposes the exact saved public message')
check(initialPreparation.unmatched_message_recipient_ids,unmatched,'publication preparation and board use the same recipient plan')
const firstProof=await scalar('SELECT public.admin_authorize_match_publication($1,$2,0,$3)',[session,admin,initialPreparation.revision_token])
// A change to an unmatched recipient must invalidate the final proof too, even
// though the preflight hard-source capture intentionally contains only matches.
for(const change of ["account_status='blocked'","user_id=NULL"]){
 await role();await db.exec('BEGIN');await db.query('UPDATE public.members SET '+change+' WHERE id=$1',[ids[9]])
 const changedBoard=await get()
 check(changedBoard.unmatched_message_recipient_ids,[],'blocked or unbound people are excluded from the public message plan')
 check(changedBoard.base_revision===board.base_revision,false,'recipient eligibility changes invalidate the board review revision')
 await server();const changedPreparation=await scalar('SELECT public.admin_prepare_match_publication($1,$2,0)',[session,admin])
 check(changedPreparation.unmatched_message_recipient_ids,[],'publication preparation uses actual notification account eligibility')
 check(changedPreparation.revision_token===initialPreparation.revision_token,false,'recipient eligibility changes invalidate the SQL publication token')
 await adminRole();await rejects(()=>scalar("SELECT public.admin_publish_checked_match_session($1,0,'隔离接收资格保护',$2)",[session,firstProof.preflight_id]),/PREFLIGHT_STALE/,'recipient-only changes invalidate an old publication proof')
 await db.exec('ROLLBACK')
}
// A valid independent assignment elsewhere in this round suppresses an
// unmatched notice and is also bound into the first board's proof.
await role();await db.exec('BEGIN')
const otherSession=await scalar("INSERT INTO public.match_sessions(round_id,created_by,algorithm,total_candidates,total_matched,total_unmatched,audit_reason) VALUES($1,$2,'manual',2,2,0,'隔离另一批次分配') RETURNING id",[ctx.round,admin])
await db.query("INSERT INTO matching_publication.write_context VALUES(txid_current(),pg_backend_pid(),$1,'publish')",[otherSession])
await db.query("UPDATE public.match_sessions SET status='confirmed',results_ready=true,publication_version=1,published_at=clock_timestamp(),audit_reason='隔离另一批次发布' WHERE id=$1",[otherSession])
const otherResult=await scalar("INSERT INTO public.match_results(session_id,member_a_id,member_b_id,status,publication_version,best_slot,audit_reason) VALUES($1,$2,$3,'confirmed',1,'2026-10-27_下午','隔离另一批次配对') RETURNING id",[otherSession,ids[9],ids[10]])
const otherPublication=await scalar("INSERT INTO matching_publication.publications(session_id,round_id,version,round_name,reason) VALUES($1,$2,1,'隔离另一批次','隔离验证') RETURNING id",[otherSession,ctx.round])
await db.query("INSERT INTO matching_publication.roster(publication_id,member_id,result_id,outcome) VALUES($1,$2,$4,'matched'),($1,$3,$4,'matched')",[otherPublication,ids[9],ids[10],otherResult])
await db.query('INSERT INTO matching_publication.active_assignments(round_id,member_id,publication_id,result_id) VALUES($1,$2,$4,$5),($1,$3,$4,$5)',[ctx.round,ids[9],ids[10],otherPublication,otherResult])
await db.query('DELETE FROM matching_publication.write_context WHERE session_id=$1',[otherSession])
const assignedBoard=await get();check(assignedBoard.unmatched_message_recipient_ids,[],'another active assignment suppresses the planned unmatched message')
check(assignedBoard.base_revision===board.base_revision,false,'another assignment invalidates the board review revision')
await server();const assignedPreparation=await scalar('SELECT public.admin_prepare_match_publication($1,$2,0)',[session,admin])
check(assignedPreparation.unmatched_message_recipient_ids,[],'preparation excludes players already actively assigned elsewhere')
check(assignedPreparation.revision_token===initialPreparation.revision_token,false,'another assignment changes the SQL publication token')
await adminRole();await rejects(()=>scalar("SELECT public.admin_publish_checked_match_session($1,0,'隔离跨批次版本保护',$2)",[session,firstProof.preflight_id]),/PREFLIGHT_STALE/,'a cross-batch recipient change invalidates the previously authorized proof')
await db.exec('ROLLBACK')
await persist(params(board,{layout:layout([seven],[seven],[],message+' 已更新'),unmatched}));board=await get()
await adminRole()
await rejects(()=>scalar("SELECT public.admin_publish_checked_match_session($1,0,'隔离验证留言版本',$2)",[session,firstProof.preflight_id]),/PREFLIGHT_STALE/,'changing only the saved message invalidates a previously authorized publication proof')
await role();check(await scalar('SELECT count(*)::integer FROM public.community_notifications'),noticesBefore,'draft message edits and rejected publication never send notifications')
await server();const preparation=await scalar('SELECT public.admin_prepare_match_publication($1,$2,0)',[session,admin])
check(inspectPublicationPreflight(preparePublicationPreflightInput(preparation.capture),preparation.current_rows).passed,true,'actual engine preflight still enforces all formal group constraints')
const proof=await scalar('SELECT public.admin_authorize_match_publication($1,$2,0,$3)',[session,admin,preparation.revision_token])
await adminRole();const published=await scalar("SELECT public.admin_publish_checked_match_session($1,0,'隔离发布人工小组及留言',$2)",[session,proof.preflight_id])
check(published.published,true,'approved checked route publishes isolated fixture')
check((await outcomes(9)).find(item=>item.round_id===ctx.round).unmatched_message,message+' 已更新','unmatched player reads the frozen publication message')
check((await outcomes(0)).find(item=>item.round_id===ctx.round).unmatched_message,null,'matched player does not receive the unmatched message')
check((await outcomes(10)).find(item=>item.round_id===ctx.round).unmatched_message,null,'a later unrelated registrant never reads another cohort message')
await role();const frozen=await scalar('SELECT unmatched_message FROM matching_publication.publications WHERE id=$1',[published.publication_id])
await rejects(()=>db.query('UPDATE matching_publication.publications SET unmatched_message=$1 WHERE id=$2',['改写历史',published.publication_id]),/MESSAGE_IMMUTABLE/,'a published message cannot be rewritten')
// Previously published cancellations become `cancelled`, not `unmatched`, in
// the next roster. The message plan must reflect that exact existing behavior.
await role();await db.exec('BEGIN')
const priorDuo=board.results.find(result=>result.member_b_id)
await player(7);await scalar("SELECT public.request_my_match_cancellation($1,'隔离取消申请验证',1)",[priorDuo.id])
await role();const requestedAt=await scalar('SELECT cancellation_requested_at FROM public.match_results WHERE id=$1',[priorDuo.id])
await adminRole();await scalar("SELECT public.admin_approve_matching_cancellation($1,1,$2,'隔离批准取消验证')",[priorDuo.id,requestedAt])
await scalar("SELECT public.admin_unpublish_match_session($1,1,'隔离取消后撤回验证')",[session])
const cancelledBoard=await get();check(cancelledBoard.unmatched_message_recipient_ids,unmatched,'historically published cancelled members are not public unmatched-message recipients')
await server();const cancellationPreparation=await scalar('SELECT public.admin_prepare_match_publication($1,$2,1)',[session,admin])
check(cancellationPreparation.unmatched_message_recipient_ids,unmatched,'cancelled outcome exclusion matches between board and publication')
const cancellationProof=await scalar('SELECT public.admin_authorize_match_publication($1,$2,1,$3)',[session,admin,cancellationPreparation.revision_token])
await adminRole();const cancellationPublish=await scalar("SELECT public.admin_publish_checked_match_session($1,1,'隔离取消对象接收核对',$2)",[session,cancellationProof.preflight_id])
await role();check(await scalar("SELECT array_agg(member_id ORDER BY member_id) FROM matching_publication.roster WHERE publication_id=$1 AND outcome='unmatched'",[cancellationPublish.publication_id]),unmatched,'the actual publication roster confirms the planned unmatched set')
check(await scalar("SELECT count(*)::integer FROM matching_publication.roster WHERE publication_id=$1 AND outcome='cancelled'",[cancellationPublish.publication_id]),2,'previously published cancellations keep the existing cancelled outcome')
check(await scalar("SELECT array_agg(recipient_member_id ORDER BY recipient_member_id) FROM public.community_notifications WHERE match_publication_id=$1 AND notification_type='matching_unmatched'",[cancellationPublish.publication_id]),unmatched,'actual unmatched notification recipients equal the planned message recipients')
await db.exec('ROLLBACK')
await adminRole();await scalar("SELECT public.admin_unpublish_match_session($1,1,'隔离撤回后编辑验证')",[session]);board=await get()
await persist(params(board,{layout:layout([seven],[seven],[],'下一版工作人员留言'),unmatched}));board=await get()
check((await outcomes(9)).find(item=>item.round_id===ctx.round).unmatched_message,null,'withdrawn cards hide the prior message and never show the newer draft')
await role();check(await scalar('SELECT unmatched_message FROM matching_publication.publications WHERE id=$1',[published.publication_id]),frozen,'withdrawal and draft edits preserve the historical message')

await server();const secondPreparation=await scalar('SELECT public.admin_prepare_match_publication($1,$2,1)',[session,admin])
const secondProof=await scalar('SELECT public.admin_authorize_match_publication($1,$2,1,$3)',[session,admin,secondPreparation.revision_token])
await adminRole();const secondPublished=await scalar("SELECT public.admin_publish_checked_match_session($1,1,'隔离发布第二版留言',$2)",[session,secondProof.preflight_id])
check(secondPublished.publication_version,2,'a new publication receives an independent message version')
check((await outcomes(9)).find(item=>item.round_id===ctx.round).unmatched_message,'下一版工作人员留言','the unmatched player receives the new version message')
await role();check(await scalar('SELECT unmatched_message FROM matching_publication.publications WHERE id=$1',[published.publication_id]),frozen,'republishing does not rewrite the first publication message')
await adminRole();await scalar("SELECT public.admin_unpublish_match_session($1,2,'隔离恢复候选编辑')",[session]);board=await get()
// Dissolve a group into waiting, alongside a person available on another date.
await submit(9,answers('都可以','2026-10-29'));board=await get()
const waiting=[...seven,ids[9]],keptDuo=board.results.find(result=>result.member_b_id)
await persist(params(board,{keep:[keptDuo.id],rows:[],layout:layout([],[],waiting,'候选人员待安排'),unmatched:waiting}));board=await get()
check(board.layout.waitingMultiIds,waiting,'dissolved candidates with disjoint dates remain safely in the unassigned waiting area')
check(board.layout.multiPoolSlot,null,'an unassigned waiting area may have no common slot')
check(board.unmatched_message_recipient_ids,[],'waiting-multi candidates are excluded from the unmatched message preview while publication is blocked')
await server();await rejects(()=>scalar('SELECT public.admin_prepare_match_publication($1,$2,2)',[session,admin]),/GROUPS_PENDING/,'waiting candidates still block publication')
// Confirmed results still need exact full-group availability even though waiting
// candidates intentionally do not. This is not a global constraint relaxation.
const invalidRows=group(board,seven);invalidRows[0].best_slot='2026-10-31_晚上'
await rejects(()=>persist(params(board,{keep:[keptDuo.id],rows:invalidRows,layout:layout([seven],[seven]),unmatched})),/CONSTRAINT/,'manual size flexibility never permits a non-shared group time')
await role('anon');await rejects(()=>scalar('SELECT public.get_my_matching_publications()'),/permission denied/,'anonymous callers cannot retrieve publication messages')
await role();const postflight=await db.exec(read('supabase/audits/matching-board-manual-groups-messages-postflight.sql'))
check(postflight.find(result=>result.rows[0]?.verification)?.rows[0].verification.status,'PASS','new read-only schema and invariant verification passes')
console.log(`Matching manual groups/messages SQL audit: ${checks} checks passed; isolated PGlite only.`)
await db.close();rmSync(temporary,{recursive:true,force:true})
