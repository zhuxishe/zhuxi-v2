// Offline real-RPC regression for the explicit 4-6-person board group kind.
import assert from 'node:assert/strict'
import {rmSync} from 'node:fs'
process.env.MATCHING_BOARD_MEMBER_LOCK_SUITE='1'
process.env.MATCHING_BOARD_SMALL_GROUP_SKIP_MIGRATION='1'
const {boardAuditContext:ctx}=await import('./matching-board-pglite.mjs')
const {db,scalar,role,read,admin,server,adminRole,session,ids,get,params,persist,answers,submit,prepareMatchingRunInput,buildManualAdjustment,preparePublicationPreflightInput,inspectPublicationPreflight,temporary}=ctx
let checks=0
const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++}
const rejects=async(work,pattern,message)=>{await assert.rejects(work,error=>pattern.test(String(error.message)),message);checks++}
const layout=(small,waiting=[],slot=waiting.length?'2026-10-27_下午':null)=>({waitingDuoIds:[],brokenPairs:[],multiMode:'grouped',waitingMultiIds:waiting,multiPoolSlot:slot,...(small===undefined?{}:{smallGroupMemberIds:small})})
const group=(board,members,slot='2026-10-27_下午')=>buildManualAdjustment(prepareMatchingRunInput(board.capture).engineInput,members).map(row=>({...row,best_slot:slot}))
const protectedState=()=>scalar("SELECT jsonb_build_object('results',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.match_results r),'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.match_sessions s),'submissions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.match_round_submissions s),'snapshots',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM matching_run.snapshots s),'board',(SELECT jsonb_agg(to_jsonb(s) ORDER BY session_id) FROM matching_board.state s),'notices',(SELECT count(*) FROM public.community_notifications),'publications',(SELECT count(*) FROM matching_publication.publications),'audits',(SELECT count(*) FROM private.member_profile_audit_log),'operations',(SELECT count(*) FROM matching_board.operations))")
await role()
const beforeMigration=await protectedState()
await db.exec(read('supabase/migrations/20261030103412_matching_board_small_groups.sql'))
check(await protectedState(),beforeMigration,'migration preserves all existing local business data and audits')
for(const signature of ['matching_board.validate_small_groups(jsonb,jsonb,jsonb,jsonb)','matching_board.active_small_groups(uuid,jsonb)']){
 for(const actor of ['anon','authenticated','service_role'])check(await scalar('SELECT has_function_privilege($1,$2,\'EXECUTE\')',[actor,signature]),false,`${signature}: ${actor} has no direct access`)
 check(await scalar('SELECT prosecdef FROM pg_proc WHERE oid=$1::regprocedure',[signature]),false,`${signature} is invoker only`)
}
let board=await get()
const duos=board.results.filter(row=>row.member_b_id),pool=board.results.find(row=>!row.member_b_id)
check(board.layout,{waitingDuoIds:[],brokenPairs:[]},'legacy layout does not acquire group metadata')
check(pool.group_members.length,4,'a legacy four-person pool remains an ordinary pool')
await persist(params(board));board=await get()
check(board.layout,{waitingDuoIds:[],brokenPairs:[]},'old valid clients can still save legacy boards')
const smallIds=[...pool.group_members]
await rejects(()=>persist(params(board,{layout:{waitingDuoIds:[],brokenPairs:[],smallGroupMemberIds:[smallIds]}})),/SMALL_GROUP_LAYOUT/,'small markers require explicit grouped mode')
for(const markers of [null,{},'small',[null],[{}],[[null,null,null,null]],[[1,2,3,4]]])await rejects(()=>persist(params(board,{layout:layout(markers)})),/SMALL_GROUP_LAYOUT/,'malformed nested marker shapes are rejected')
await rejects(()=>persist(params(board,{layout:layout([[...smallIds.slice(0,3),smallIds[0]]])})),/SMALL_GROUP_LAYOUT/,'duplicate people inside a marker are rejected')
await rejects(()=>persist(params(board,{layout:layout([smallIds,smallIds])})),/SMALL_GROUP_LAYOUT/,'overlapping or repeated group markers are rejected')
await rejects(()=>persist(params(board,{layout:layout([ids.slice(0,4)])})),/SMALL_GROUP_OUTPUT/,'a marker must refer to one actual multiplayer row')
await rejects(()=>persist(params(board,{layout:layout([ids.slice(0,5)])})),/SMALL_GROUP_OUTPUT/,'a marker cannot span separate results')
for(const count of [0,1,2,3,7])await rejects(()=>persist(params(board,{layout:layout([ids.slice(0,count)])})),/SMALL_GROUP_SIZE/,'small markers enforce 4-6 before persistence')
const markArgs=params(board,{layout:layout([smallIds])})
const marked=await persist(markArgs);board=await get()
check(marked.already_applied,false,'first explicit classification is saved')
check(board.layout,layout([smallIds]),'classification survives a fresh server capture')
check(board.results.find(row=>row.id===pool.id),pool,'classifying a valid kept group preserves identity score and time')
check((await persist(markArgs)).already_applied,true,'identical save retry returns its receipt after the revision changes')
for(const missing of [undefined,[]])await rejects(()=>persist(params(board,{layout:layout(missing)})),/SMALL_GROUP_REQUIRED/,'kept small result cannot silently lose its classification')
await rejects(()=>persist(params(board,{keep:duos.map(row=>row.id),rows:group(board,smallIds),layout:layout(undefined)})),/SMALL_GROUP_REQUIRED/,'a cached client cannot replace marked results while omitting the small-group field')
await rejects(()=>persist(params(board,{layout:layout([smallIds]),revision:markArgs[4]})),/STALE/,'old revisions cannot update classification')
await persist(params(board,{layout:layout([[...smallIds].reverse()])}));board=await get()
check(board.layout.smallGroupMemberIds[0].slice().sort(),smallIds.slice().sort(),'classification uses member sets rather than display order')
await adminRole();await db.query("UPDATE public.match_results SET status='locked',locked_by=$1,locked_at=now(),audit_reason='隔离小组锁定验证' WHERE id=$2",[admin,pool.id])
board=await get()
await rejects(()=>persist(params(board,{keep:duos.map(row=>row.id),layout:layout([]),unmatched:ids.slice(4,10)})),/LOCKED/,'locked small group cannot be dissolved')
await adminRole();await db.query("UPDATE public.match_results SET status='draft',locked_by=NULL,locked_at=NULL,audit_reason='隔离小组解锁验证' WHERE id=$1",[pool.id])
// Cancellation removes its active classification without inventing another group.
await role();await db.exec('BEGIN');await db.query("INSERT INTO matching_publication.write_context VALUES(txid_current(),pg_backend_pid(),$1,'cancellation')",[session]);await db.query("UPDATE public.match_results SET status='cancelled',audit_reason='隔离取消小组验证' WHERE id=$1",[pool.id])
check((await scalar('SELECT matching_board.current_layout($1)',[session])).smallGroupMemberIds,[],'cancelled results no longer appear as active small groups')
await db.exec('ROLLBACK')
// Erasure must remove the identity from stored metadata, not merely hide it.
await role();await db.exec('BEGIN');await db.query('UPDATE public.members SET anonymized_at=now() WHERE id=$1',[smallIds[0]]);await db.exec('SET CONSTRAINTS ALL IMMEDIATE')
check(await scalar("SELECT layout->'smallGroupMemberIds' FROM matching_board.state WHERE session_id=$1",[session]),[],'privacy erasure clears the affected small marker')
await db.exec('ROLLBACK')
// Dissolve old group, retaining its people as pending; no confirmation or notices.
board=await get();await persist(params(board,{keep:duos.map(row=>row.id),layout:layout([],smallIds),unmatched:ids.slice(4,10)}));board=await get()
check(board.layout,layout([],smallIds),'dissolved members can return to the pending pool')
await server();await rejects(()=>scalar('SELECT public.admin_prepare_match_publication($1,$2,0)',[session,admin]),/GROUPS_PENDING/,'pending people still block publication')
// All 10 cohort people become available for fixture-only independent groups.
for(let index=0;index<10;index++)await submit(index,answers('都可以'))
board=await get()
const first=ids.slice(0,5),second=ids.slice(5,10)
const twoRows=[...group(board,first),...group(board,second)]
const base=params(board,{keep:[],rows:twoRows,layout:layout([first,second]),unmatched:[]})
const badTime=structuredClone(twoRows);badTime[0].best_slot='2026-10-31_晚上'
await rejects(()=>persist(params(board,{keep:[],rows:badTime,layout:layout([first,second]),unmatched:[]})),/CONSTRAINT/,'small groups retain full common-time validation')
await role();const beforeFailure=await protectedState()
await db.exec("CREATE FUNCTION private.small_group_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'SMALL_GROUP_TEST_ROLLBACK'; END$$; CREATE TRIGGER small_group_test_failure BEFORE INSERT ON public.match_results FOR EACH ROW EXECUTE FUNCTION private.small_group_test_failure()")
await rejects(()=>persist(base),/SMALL_GROUP_TEST_ROLLBACK/,'row insertion failure rolls back the entire new grouping')
await role();check(await protectedState(),beforeFailure,'failed transaction preserves results metadata and audit state')
await db.exec('DROP TRIGGER small_group_test_failure ON public.match_results; DROP FUNCTION private.small_group_test_failure()')
await persist(base);board=await get()
check(board.results.map(row=>row.group_members.length),[5,5],'two five-person groups persist independently')
check(board.layout.smallGroupMemberIds,[first,second],'both small-group locations survive reload')
// Out-of-band owner corruption is caught by the final publication path too.
await role();await db.exec('BEGIN')
await db.query("INSERT INTO matching_publication.write_context VALUES(txid_current(),pg_backend_pid(),$1,'finalize')",[session])
await db.query("UPDATE matching_board.state SET layout=jsonb_set(layout,'{smallGroupMemberIds}',$2) WHERE session_id=$1",[session,[first.slice(0,3),second]])
// An unmatched marker is ignored by current_layout, so simulate an actual three-person
// active row and matching metadata: it must never pass the small-group final guard.
await db.query("UPDATE public.match_results SET group_members=$2,audit_reason='隔离最终人数保护' WHERE id=$1",[board.results.find(row=>row.group_members.includes(first[0])).id,first.slice(0,3)])
await rejects(()=>scalar('SELECT matching_board.assert_groups_ready($1)',[session]),/SMALL_GROUP_SIZE/,'final guard independently refuses a three-person classified group')
await db.exec('ROLLBACK')
await server();const preflight=await scalar('SELECT public.admin_prepare_match_publication($1,$2,0)',[session,admin])
check(inspectPublicationPreflight(preparePublicationPreflightInput(preflight.capture),preflight.current_rows).passed,true,'actual engine publication preflight accepts separate valid small groups')
const proof=await scalar('SELECT public.admin_authorize_match_publication($1,$2,0,$3)',[session,admin,preflight.revision_token])
await adminRole();await scalar("SELECT public.admin_publish_checked_match_session($1,0,'隔离发布四至六人组',$2)",[session,proof.preflight_id])
board=await get();check(board.session_status,'confirmed','small groups publish through the existing checked route')
await rejects(()=>persist(params(board,{layout:layout([first,second]),unmatched:[]})),/REQUIRES_DRAFT/,'published small groups remain read-only')
await role();check(await scalar('SELECT count(DISTINCT result_id)::integer FROM matching_publication.active_assignments WHERE member_id=ANY($1::uuid[])',[ids.slice(0,10)]),2,'players receive two distinct group assignments')
await adminRole();await scalar("SELECT public.admin_unpublish_match_session($1,1,'隔离恢复小组编辑')",[session])
board=await get()
// Existing ordinary time groups explicitly keep their 3+ and no-upper-limit rule.
const ordinaryThree=ids.slice(0,3),ordinarySeven=ids.slice(3,10)
await persist(params(board,{keep:[],rows:[...group(board,ordinaryThree),...group(board,ordinarySeven)],layout:layout([]),unmatched:[]}));board=await get()
check(board.results.map(row=>row.group_members.length).sort(),[3,7],'ordinary manual time groups retain their old sizes')
check(board.layout.smallGroupMemberIds,[],'ordinary groups do not acquire small classification')
await role();const postflight=await db.exec(read('supabase/audits/matching-board-small-groups-postflight.sql'))
check(postflight.find(result=>result.rows[0]?.verification)?.rows[0].verification.status,'PASS','new read-only schema postflight passes')
console.log(`Matching board small-group SQL/actual engine audit: ${checks} checks passed; isolated PGlite only.`)
await db.close();rmSync(temporary,{recursive:true,force:true})
