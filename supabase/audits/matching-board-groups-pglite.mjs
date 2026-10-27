// Offline PostgreSQL integration for explicit manual multiplayer grouping.
// Uses real SQL RPCs, TypeScript candidate adapters, and publication semantics.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {rmSync} from 'node:fs'
process.env.MATCHING_BOARD_MEMBER_LOCK_SUITE='1'
const {boardAuditContext:ctx}=await import('./matching-board-pglite.mjs')
const {db,scalar,role,read,admin,server,adminRole,session,ids,get,params,persist,answers,submit,prepareMatchingRunInput,buildManualAdjustment,preparePublicationPreflightInput,inspectPublicationPreflight,temporary}=ctx
let checks=0
const check=(a,b,message)=>{assert.deepEqual(a,b,message);checks++}
const rejects=async(work,pattern,message)=>{await assert.rejects(work,error=>{if(!pattern.test(String(error.message))){console.error(message,error.message);return false}return true},message);checks++}
const layout=(waiting=[],slot=waiting.length?'2026-10-27_下午':null,duo=[])=>({waitingDuoIds:duo,brokenPairs:[],multiMode:'grouped',waitingMultiIds:waiting,multiPoolSlot:slot})
const group=(board,members,slot='2026-10-27_下午')=>buildManualAdjustment(prepareMatchingRunInput(board.capture).engineInput,members).map(row=>({...row,best_slot:slot}))
await role()
const beforeMigrationData=await scalar("SELECT jsonb_build_object('snapshots',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM matching_run.snapshots s),'notices',(SELECT count(*) FROM public.community_notifications),'publications',(SELECT count(*) FROM matching_publication.publications))")
for(const name of ['matching_board.validate_group_rows(jsonb,jsonb)','matching_board.validate_waiting_multi(jsonb,uuid[],text)','matching_board.assert_groups_ready(uuid)'])for(const actor of ['anon','authenticated','service_role'])check(await scalar("SELECT has_function_privilege($1,$2,'EXECUTE')",[actor,name]),false,`${name}: ${actor} has no direct execution`)
let board=await get()
const duos=board.results.filter(r=>r.member_b_id),originalPool=board.results.find(r=>!r.member_b_id)
check(board.layout,{waitingDuoIds:[],brokenPairs:[]},'legacy capture has no invented group mode')
check(originalPool.group_members.length,4,'legacy pool remains intact before explicit grouping')
await adminRole();await db.query("UPDATE public.match_results SET status='locked',locked_by=$1,locked_at=now(),audit_reason='隔离锁定旧多人池' WHERE id=$2",[admin,originalPool.id])
board=await get()
await rejects(()=>persist(params(board,{keep:duos.map(r=>r.id),rows:group(board,ids.slice(4,7)),layout:layout([ids[7]]),unmatched:ids.slice(7,10)})),/LOCKED/,'locked legacy pool cannot be split into groups')
await adminRole();await db.query("UPDATE public.match_results SET status='draft',locked_by=NULL,locked_at=NULL,audit_reason='隔离解除旧多人池锁' WHERE id=$1",[originalPool.id])
board=await get()
await rejects(()=>persist(params(board,{keep:duos.map(r=>r.id),rows:group(board,ids.slice(4,7)),layout:layout([ids[7]],'2026-10-30_下午'),unmatched:ids.slice(7,10)})),/MULTI_TIME_CHANGED/,'first grouping preserves waiting members original pool anchor')
await rejects(()=>persist(params(board,{keep:duos.map(r=>r.id),rows:group(board,ids.slice(4,7)),layout:layout([ids[7]],null),unmatched:ids.slice(7,10)})),/TIME_INVALID/,'nonempty waiting pool requires a valid shared slot')
await rejects(()=>persist(params(board,{keep:duos.map(r=>r.id),rows:group(board,ids.slice(4,7)),layout:layout([ids[7]],'2026-10-27_下午',[ids[7]]),unmatched:ids.slice(7,10)})),/LAYOUT_INVALID/,'waiting member cannot occupy both duo and multi pools')
// A failed worker created before grouping must not recover against the new layout.
await server()
const legacyOperation=await scalar("SELECT public.admin_begin_matching_adjustment($1,$2,'manual',$3,NULL,$4,'隔离旧手工任务恢复边界',NULL)",[session,admin,ids.slice(8,10),randomUUID()])
await scalar("SELECT public.admin_fail_matching_adjustment($1,$2,$3,'SAVE_FAILED')",[legacyOperation.operation.id,admin,legacyOperation.lease_token])
const firstArgs=params(board,{keep:duos.map(r=>r.id),rows:group(board,ids.slice(4,7),'2026-10-30_下午'),layout:layout([ids[7]]),unmatched:ids.slice(7,10)})
const first=await persist(firstArgs)
board=await get()
check(first.already_applied,false,'first grouping is saved once')
check(board.layout,layout([ids[7]]),'one ungrouped member persists with its original ingress time')
check(board.results.filter(r=>!r.member_b_id).map(r=>[r.group_members.length,r.best_slot]),[[3,'2026-10-30_下午']],'formal group may select another actual common date')
await role()
check(await scalar('SELECT status FROM public.match_results WHERE id=$1',[originalPool.id]),'cancelled','original pool remains as cancelled history')
check(await scalar('SELECT to_jsonb(r) FROM public.match_results r WHERE id=$1',[duos[0].id]),duos[0],'unrelated duo remains byte-identical')
check(await scalar('SELECT total_matched FROM public.match_sessions WHERE id=$1',[session]),7,'waiting member is not counted as matched')
check((await persist(firstArgs)).already_applied,true,'same request resolves through the original receipt after mode transition')
await rejects(()=>persist(params(board,{unmatched:ids.slice(7,10)})),/GROUPED_REQUIRED/,'old clients cannot silently downgrade the grouped layout')
await server();await rejects(()=>scalar('SELECT public.admin_prepare_match_publication($1,$2,0)',[session,admin]),/GROUPS_PENDING/,'publication preflight refuses pending multiplayer members')
await adminRole();await rejects(()=>scalar("SELECT public.admin_publish_match_session($1,0,'隔离试图绕过待分组')",[session]),/GROUPS_PENDING/,'final original publication route independently refuses pending pool')
await server();await rejects(()=>scalar("SELECT public.admin_preview_matching_adjustment($1,$2,'pool','{}',NULL)",[session,admin]),/BOARD_GROUPED/,'legacy adjustment cannot bypass grouped pool ownership')
await rejects(()=>scalar("SELECT public.admin_begin_matching_adjustment($1,$2,'manual',$3,NULL,$4,'隔离旧手工任务恢复边界',NULL)",[session,admin,ids.slice(8,10),legacyOperation.operation.id]),/BOARD_GROUPED/,'failed legacy operation cannot recover after grouped mode is saved')

await role();check(await scalar("SELECT jsonb_build_object('snapshots',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM matching_run.snapshots s),'notices',(SELECT count(*) FROM public.community_notifications),'publications',(SELECT count(*) FROM matching_publication.publications))"),beforeMigrationData,'draft grouping changes no automatic snapshot, publication, or notification')
// Add two eligible existing-cohort members to the second explicit group.
for(const index of [8,9]){const payload=answers('都可以');payload.availability['2026-10-30']=['下午'];await submit(index,payload)}
board=await get()
const firstGroup=board.results.find(r=>!r.member_b_id)
const secondRows=group(board,ids.slice(7,10))
await rejects(()=>persist(params(board,{rows:group(board,[ids[4],ids[7],ids[8]]),layout:layout(),unmatched:[ids[9]]})),/COHORT_MISMATCH/,'kept and new groups cannot share one person')
await rejects(()=>persist(params(board,{keep:duos.map(r=>r.id),rows:[...group(board,ids.slice(4,7)),...group(board,[ids[6],ids[7],ids[8]])],layout:layout(),unmatched:[ids[9]]})),/COHORT_MISMATCH/,'new group rows enforce cross-group uniqueness')
const bad=structuredClone(secondRows);bad[0].best_slot='2026-10-31_上午'
await rejects(()=>persist(params(board,{rows:bad,layout:layout(),unmatched:[]})),/CONSTRAINT/,'chosen formal group time must be available to every member')
const tiny=structuredClone(secondRows);tiny[0].group_members=ids.slice(7,9)
await rejects(()=>persist(params(board,{rows:tiny,layout:layout(),unmatched:[ids[9]]})),/OUTPUT_INVALID/,'a two-person formal multiplayer group cannot be saved')
// Rollback includes original results, pending layout and audits.
await role()
const beforeFailure=await scalar("SELECT jsonb_build_object('results',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.match_results r WHERE session_id=$1),'layout',(SELECT to_jsonb(s) FROM matching_board.state s WHERE session_id=$1),'audit',(SELECT count(*) FROM private.member_profile_audit_log),'ops',(SELECT count(*) FROM matching_board.operations))",[session])
await db.exec("CREATE FUNCTION private.group_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'GROUP_TEST_ROLLBACK'; END$$; CREATE TRIGGER group_test_failure BEFORE INSERT ON public.match_results FOR EACH ROW EXECUTE FUNCTION private.group_test_failure()")
const secondArgs=params(board,{rows:secondRows,layout:layout(),unmatched:[]})
await rejects(()=>persist(secondArgs),/GROUP_TEST_ROLLBACK/,'failed group insertion rolls back the whole atomic board')
await role();check(await scalar("SELECT jsonb_build_object('results',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.match_results r WHERE session_id=$1),'layout',(SELECT to_jsonb(s) FROM matching_board.state s WHERE session_id=$1),'audit',(SELECT count(*) FROM private.member_profile_audit_log),'ops',(SELECT count(*) FROM matching_board.operations))",[session]),beforeFailure,'failure leaves all saved state and audit counts intact')
await db.exec('DROP TRIGGER group_test_failure ON public.match_results; DROP FUNCTION private.group_test_failure()')
await persist(secondArgs)
board=await get()
check(board.results.filter(r=>!r.member_b_id).length,2,'two disjoint formal multiplayer groups survive a fresh capture')
check(board.layout,layout(),'empty waiting pool resets its anchor')
check(board.results.find(r=>r.id===firstGroup.id),firstGroup,'untouched formal group keeps its identity score and selected time')
// Fresh edit with only kept rows must accept multiple preserved groups too.
await persist(params(board,{layout:layout(),unmatched:[]}));board=await get()
await adminRole();await db.query("UPDATE public.match_results SET status='locked',locked_by=$1,locked_at=now(),audit_reason='隔离锁定正式小组' WHERE id=$2",[admin,firstGroup.id])
board=await get()
await rejects(()=>persist(params(board,{keep:board.results.filter(r=>r.id!==firstGroup.id).map(r=>r.id),layout:layout(),unmatched:ids.slice(4,7)})),/LOCKED/,'formal group locks protect the full group')
await adminRole();await db.query("UPDATE public.match_results SET status='draft',locked_by=NULL,locked_at=NULL,audit_reason='隔离解除正式小组锁' WHERE id=$1",[firstGroup.id])
await server()
const preparation=await scalar('SELECT public.admin_prepare_match_publication($1,$2,0)',[session,admin])
check(inspectPublicationPreflight(preparePublicationPreflightInput(preparation.capture),preparation.current_rows).passed,true,'actual TypeScript publication preflight accepts the two valid saved groups')
// Empty waiting state is normalized before revision and publication checks.
await role();await db.exec('BEGIN')
await db.query("UPDATE matching_board.state SET layout=layout||'{\"multiPoolSlot\":\"2026-10-30_下午\"}'::jsonb WHERE session_id=$1",[session])
// Empty waiting normalizes the anchor, so a harmless stale JSON hint does not
// change effective layout or publication state; restore before the real proof.
check(await scalar('SELECT matching_board.current_layout($1)',[session]),layout(),'capture normalizes empty waiting metadata')
await db.exec('ROLLBACK');await server()
const proof=await scalar('SELECT public.admin_authorize_match_publication($1,$2,0,$3)',[session,admin,preparation.revision_token])
await adminRole();await scalar("SELECT public.admin_publish_checked_match_session($1,0,'隔离发布两个独立多人组',$2)",[session,proof.preflight_id])
board=await get()
check([board.session_status,board.results.filter(r=>!r.member_b_id).length],['confirmed',2],'publication retains separate group results')
await rejects(()=>persist(params(board,{layout:layout(),unmatched:[]})),/REQUIRES_DRAFT/,'published group board is read-only')
await role()
check(await scalar('SELECT count(DISTINCT a.result_id)::integer FROM matching_publication.active_assignments a JOIN matching_publication.publications p ON p.id=a.publication_id WHERE p.session_id=$1 AND a.member_id=ANY($2::uuid[])',[session,ids.slice(4,10)]),2,'published multi members receive two separate group assignments')
await adminRole();await scalar("SELECT public.admin_unpublish_match_session($1,1,'隔离撤回两组验证')",[session])
// No six-person ceiling: one explicitly selected group may contain eight.
for(const memberId of [duos[0].member_a_id,duos[0].member_b_id])await submit(ids.indexOf(memberId),answers('都可以'))
board=await get()
const largeIds=[duos[0].member_a_id,duos[0].member_b_id,...ids.slice(4,10)]
await persist(params(board,{keep:[duos[1].id],rows:group(board,largeIds),layout:layout(),unmatched:[]}));board=await get()
check(board.results.find(r=>!r.member_b_id).group_members.length,8,'formal group has no six-person upper limit')
// Save two ungrouped members, prove current input and pins still protect them.
await persist(params(board,{keep:[duos[1].id],rows:group(board,largeIds.slice(0,6)),layout:layout(largeIds.slice(6)),unmatched:largeIds.slice(6)}));board=await get()
check(board.layout.waitingMultiIds.length,2,'two pending members may be saved')
await role();await db.query('INSERT INTO private.test_readiness(member_id,ready) VALUES($1,false)',[largeIds[6]])
const ineligibleWaiting=await get()
await rejects(()=>persist(params(ineligibleWaiting,{layout:layout(largeIds.slice(6)),unmatched:largeIds.slice(6)})),/TIME_INVALID|CONSTRAINT/,'a waiting member also requires current matching eligibility')
await role();await db.query('DELETE FROM private.test_readiness WHERE member_id=$1',[largeIds[6]])
board=await get()

await rejects(()=>persist(params(board,{layout:layout(largeIds.slice(6),'2026-10-30_下午'),unmatched:largeIds.slice(6)})),/MULTI_TIME_CHANGED/,'existing pending member keeps the original waiting anchor')
await role();await db.exec('BEGIN')
await db.query('UPDATE public.members SET anonymized_at=now() WHERE id=$1',[largeIds[6]])
await db.exec('SET CONSTRAINTS ALL IMMEDIATE')
check(await scalar('SELECT layout FROM matching_board.state WHERE session_id=$1',[session]),layout([largeIds[7]]),'privacy removes only the affected waiting identity and preserves group mode')
await db.exec('ROLLBACK')
await role();const postflight=await db.exec(read('supabase/audits/matching-board-groups-postflight.sql'))
check(postflight.find(result=>result.rows[0]?.verification)?.rows[0].verification.status,'PASS','actual read-only group postflight passes')
console.log(`Matching board manual-group SQL/actual engine audit: ${checks} checks passed; isolated PGlite only.`)
await db.close();rmSync(temporary,{recursive:true,force:true})
