// Offline PostgreSQL pin/lock regression. Reuses the original board's real
// fixture and SQL with the current migrations. No remote connection.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {rmSync} from 'node:fs'
process.env.MATCHING_BOARD_MEMBER_LOCK_SUITE='1'
const {boardAuditContext:ctx}=await import('./matching-board-pglite.mjs')
const {db,scalar,role,read,admin,server,adminRole,player,session,ids,get,params,persist,prepareMatchingRunInput,buildManualAdjustment,preparePublicationPreflightInput,inspectPublicationPreflight,temporary}=ctx
let checks=0
const check=(a,b,message)=>{assert.deepEqual(a,b,message);checks++}
const rejects=async(work,pattern,message)=>{await assert.rejects(work,error=>{if(!pattern.test(String(error.message))){console.error(message, error.message);return false}return true},message);checks++}
await role()
// Deliberately grant fixture-only direct DML so trigger safety is tested even
// beyond the production table ACL. The migration does not grant this access.
await db.exec('GRANT INSERT,UPDATE,DELETE ON public.match_results TO service_role')
const wrappers=['public.admin_set_matching_board_member_lock(uuid,uuid,uuid,boolean,uuid,text)','public.admin_get_matching_board_member_lock_operation(uuid,uuid)']
for(const signature of wrappers)for(const actor of ['anon','authenticated','service_role'])check(await scalar("SELECT has_function_privilege($1,$2,'EXECUTE')",[actor,signature]),actor==='service_role',`${signature}: ${actor} execute boundary`)
for(const table of ['matching_board.member_locks','matching_board.member_lock_operations'])for(const actor of ['anon','authenticated','service_role'])check(await scalar("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE')",[actor,table]),false,`${table}: ${actor} has no direct access`)
const set=async(member,locked,board,operation=randomUUID(),actor=admin)=>{await server();return scalar('SELECT public.admin_set_matching_board_member_lock($1,$2,$3,$4,$5,$6)',[session,actor,member,locked,operation,board.base_revision])}
const receipt=async(operation,actor=admin)=>{await server();return scalar('SELECT public.admin_get_matching_board_member_lock_operation($1,$2)',[operation,actor])}
const empty={waitingDuoIds:[],brokenPairs:[]}
let board=await get()
const originalBoard=board,duos=board.results.filter(r=>r.member_b_id),pool=board.results.find(r=>!r.member_b_id)
let other=duos[1]
const pair=duos[0],a=pair.member_a_id,b=pair.member_b_id,unmatched=ids.slice(8,10)
await role()
const originalData=await scalar("SELECT jsonb_build_object('results',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.match_results r WHERE session_id=$1),'session',(SELECT to_jsonb(s) FROM public.match_sessions s WHERE id=$1),'notifications',(SELECT count(*) FROM public.community_notifications))",[session])
check([board.locked_member_ids,board.member_lock_operations],[[],[]],'migration starts with no pins and no invented audit')
await rejects(()=>set(a,true,board,randomUUID(),randomUUID()),/ADMIN/,'unknown actor cannot pin')
await adminRole()
await rejects(()=>scalar('SELECT public.admin_set_matching_board_member_lock($1,$2,$3,true,$4,$5)',[session,admin,a,randomUUID(),board.base_revision]),/permission denied/,'browser administrator cannot bypass server wrapper')
await rejects(()=>set(unmatched[0],true,board),/NOT_IN_DUO/,'unmatched member cannot be pinned')
await rejects(()=>set(pool.group_members[0],true,board),/NOT_IN_DUO/,'multi member cannot be pinned')
await rejects(()=>set(a,null,board),/INPUT_INVALID/,'explicit target boolean is mandatory')
const lockId=randomUUID(),first=await set(a,true,board,lockId)
check([first.locked,first.already_applied,first.expected_revision],[true,false,board.base_revision],'atomic set returns bound target and original revision')
board=await get()
check(board.locked_member_ids,[a],'fresh capture retains pin')
check(first.base_revision,board.base_revision,'receipt points to actual committed revision')
check(board.member_lock_operations.map(o=>Object.keys(o).sort()),[['created_at','id','locked']],'public history excludes actor, member identity and audit text')
check((await set(a,true,originalBoard,lockId)).already_applied,true,'lost-response retry resolves before stale-version check')
check((await receipt(lockId)).base_revision,first.base_revision,'receipt confirms same operation')
check(await receipt(randomUUID()),null,'unknown receipt is null')
await rejects(()=>set(a,false,originalBoard,lockId),/REQUEST_CONFLICT/,'operation ID cannot be reused for opposite target')
await rejects(()=>set(b,true,originalBoard),/STALE/,'another editor cannot overwrite stale pin state')
await rejects(()=>persist(params(originalBoard)),/STALE/,'pin changes invalidate old board save')
await role()
check(await scalar('SELECT count(*)::integer FROM matching_board.member_lock_operations WHERE session_id=$1',[session]),1,'replay and failed writes create no duplicate audit')
check(await scalar('SELECT reason FROM matching_board.member_lock_operations WHERE id=$1',[lockId]),'后台锁定双人池成员','server supplies fixed audit reason without caller text')
check(await scalar("SELECT jsonb_build_object('results',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.match_results r WHERE session_id=$1),'session',(SELECT to_jsonb(s) FROM public.match_sessions s WHERE id=$1),'notifications',(SELECT count(*) FROM public.community_notifications))",[session]),originalData,'pin alone changes no matches, counters, questionnaire, or notifications')
await set(a,false,board)
board=await get()
check(board.locked_member_ids,[],'personal unpin persists')
check(board.base_revision!==originalBoard.base_revision,true,'lock-unlock ABA still invalidates original snapshot')
await set(a,true,board);board=await get()
// One pinned member may be split into duo waiting and then get a new partner.
const gray={waitingDuoIds:[a,b],brokenPairs:[{key:pair.id,memberIds:[a,b]}]}
await persist(params(board,{keep:[other.id,pool.id],unmatched:[...unmatched,a,b],layout:gray}))
board=await get()
check([board.locked_member_ids,board.layout],[ [a],gray ],'single pin allows board split into duo waiting')
await rejects(()=>persist(params(board,{unmatched:[...unmatched,a,b],layout:empty})),/MEMBER_LOCKED/,'pinned waiting member cannot be moved into unmatched')
await role()
await rejects(()=>db.query('UPDATE matching_board.state SET layout=$2 WHERE session_id=$1',[session,empty]),/MEMBER_LOCKED/,'deferred constraint also rejects direct state-only bypass')
await server()
await rejects(()=>scalar("SELECT public.admin_preview_matching_adjustment($1,$2,'restore','{}',$3)",[session,admin,pair.id]).then(async()=>{
 await server();return db.query("INSERT INTO public.match_results(session_id,member_a_id,group_members,status,rank,best_slot,total_score,score_breakdown,audit_reason) VALUES($1,$2,$3,'draft',99,$4,0,'[]','隔离尝试跨池绕过')",[session,a,[a,...pool.group_members],pool.best_slot])
}),/MEMBER_LOCKED/,'a direct service/owner insert cannot put pinned waiting into multi')
// Actual legacy restore keeps a pinned waiting member in the duo pool.
await server()
let operation=await scalar("SELECT public.admin_begin_matching_adjustment($1,$2,'restore','{}',$3,$4,'隔离恢复已锁等待成员',NULL)",[session,admin,pair.id,randomUUID()])
let engine=prepareMatchingRunInput(operation.capture).engineInput
await scalar('SELECT public.admin_stage_matching_adjustment($1,$2,$3,$4)',[operation.operation.id,admin,operation.lease_token,engine])
await scalar('SELECT public.admin_complete_matching_adjustment($1,$2,$3,$4,$5,$6)',[operation.operation.id,admin,operation.lease_token,buildManualAdjustment(engine,operation.selected_member_ids),[],[]])
board=await get()
check(board.results.some(r=>r.id===pair.id),true,'legacy restore accepts pinned member when final placement stays duo')
await server()
await rejects(()=>scalar("SELECT public.admin_begin_matching_adjustment($1,$2,'split','{}',$3,$4,'旧拆对会离开双人池',NULL)",[session,admin,pair.id,randomUUID()]),/MEMBER_LOCKED/,'legacy split is refused because its final destination is cancelled pool')
// Normalize historical waiting layout left by legacy restore before proving
// a lone cancellation would actually leave the pinned member unmatched.
await persist(params(board));board=await get()
await server()
await rejects(()=>db.query("UPDATE public.match_results SET status='cancelled',audit_reason='隔离直接取消绕过' WHERE id=$1",[pair.id]),/MEMBER_LOCKED/,'deferred result guard refuses lone cancellation even with service/owner privileges')
// With both members pinned, the existing pair is fixed until one is unpinned.
await set(b,true,board);board=await get()
await rejects(()=>persist(params(board,{keep:[other.id,pool.id],unmatched:[...unmatched,a,b],layout:gray})),/MEMBER_LOCKED/,'two pins preserve original pair even when final waiting stays duo')
await server()
await rejects(()=>db.query("UPDATE public.match_results SET best_slot='2026-10-30_下午',audit_reason='隔离双锁时间绕过' WHERE id=$1",[pair.id]),/MEMBER_LOCKED/,'two pins preserve original time')
await set(b,false,board);board=await get()
await persist(params(board,{keep:[other.id,pool.id],unmatched:[...unmatched,a,b],layout:gray}))
board=await get()
// Waiting people may both be pinned and then form a new pair.
await set(b,true,board);board=await get()
engine=prepareMatchingRunInput(board.capture).engineInput
const newRows=buildManualAdjustment(engine,[a,b])
await persist(params(board,{rows:newRows,unmatched}))
board=await get()
const newPair=board.results.find(r=>r.member_b_id&&[r.member_a_id,r.member_b_id].includes(a))
check(newPair.id!==pair.id,true,'two independently pinned waiting people can form a new pair')
await rejects(()=>persist(params(board,{keep:[other.id,pool.id],unmatched:[...unmatched,a,b],layout:gray})),/MEMBER_LOCKED/,'the newly saved doubly pinned pair is now protected')
await set(b,false,board);board=await get()
// Legacy result-wide lock remains independent of personal unpin.
await adminRole();await db.query("UPDATE public.match_results SET status='locked',locked_by=$1,locked_at=now(),audit_reason='隔离原有整组锁定' WHERE id=$2",[admin,newPair.id])
board=await get();await set(a,false,board);board=await get()
check(board.results.find(r=>r.id===newPair.id).status,'locked','personal unpin does not release legacy pair lock')
await rejects(()=>persist(params(board,{keep:[other.id,pool.id],unmatched:[...unmatched,a,b],layout:gray})),/LOCKED/,'legacy pair lock still prevents board split')
await adminRole();await db.query("UPDATE public.match_results SET status='draft',locked_by=NULL,locked_at=NULL,audit_reason='隔离恢复原有整组锁' WHERE id=$1",[newPair.id])
board=await get()
// Running old workers serialize with pin writes.
await persist(params(board,{keep:[other.id,pool.id],unmatched:[...unmatched,a,b],layout:gray}))
board=await get();await server()
operation=await scalar("SELECT public.admin_begin_matching_adjustment($1,$2,'manual',$3,NULL,$4,'隔离并发工人占用',NULL)",[session,admin,[a,b],randomUUID()])
await rejects(()=>set(a,true,board),/BUSY/,'live legacy worker blocks pin writes')
await server();await scalar("SELECT public.admin_fail_matching_adjustment($1,$2,$3,'SAVE_FAILED')",[operation.operation.id,admin,operation.lease_token])
board=await get();await set(a,true,board);board=await get()
// Actual old manual matching can pair a single pinned waiting member.
await server();operation=await scalar("SELECT public.admin_begin_matching_adjustment($1,$2,'manual',$3,NULL,$4,'隔离单锁成员人工配对',NULL)",[session,admin,[a,b],randomUUID()])
engine=prepareMatchingRunInput(operation.capture).engineInput
await scalar('SELECT public.admin_stage_matching_adjustment($1,$2,$3,$4)',[operation.operation.id,admin,operation.lease_token,engine])
await scalar('SELECT public.admin_complete_matching_adjustment($1,$2,$3,$4,$5,$6)',[operation.operation.id,admin,operation.lease_token,buildManualAdjustment(engine,[a,b]),[],[]])
board=await get()
// A single pin fixes the pool, not its partner: actually swap both duos and
// then restore their compositions, preserving the pin throughout both saves.
engine=prepareMatchingRunInput(board.capture).engineInput
const otherIds=[other.member_a_id,other.member_b_id]
await persist(params(board,{keep:[pool.id],rows:[...buildManualAdjustment(engine,[a,otherIds[0]]),...buildManualAdjustment(engine,[b,otherIds[1]])],unmatched}))
board=await get()
check(board.results.some(r=>r.member_b_id&&[r.member_a_id,r.member_b_id].includes(a)&&[r.member_a_id,r.member_b_id].includes(otherIds[0])),true,'one pinned member can receive a different partner inside duo pool')
check(board.locked_member_ids,[a],'changing partner preserves the personal pin')
engine=prepareMatchingRunInput(board.capture).engineInput
await persist(params(board,{keep:[pool.id],rows:[...buildManualAdjustment(engine,[a,b]),...buildManualAdjustment(engine,otherIds)],unmatched}))
board=await get()
other=board.results.find(r=>r.member_b_id&&[r.member_a_id,r.member_b_id].includes(otherIds[0]))
const finalPair=board.results.find(r=>r.member_b_id&&[r.member_a_id,r.member_b_id].includes(a))
await set(b,true,board);board=await get()
// Pin transaction and audit roll back together after a forced late failure.
await role()
await db.exec("CREATE FUNCTION private.pin_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'PIN_TEST_ROLLBACK'; END$$; CREATE TRIGGER pin_test_failure BEFORE INSERT ON matching_board.member_lock_operations FOR EACH ROW EXECUTE FUNCTION private.pin_test_failure()")
await rejects(()=>set(a,false,board),/PIN_TEST_ROLLBACK/,'audit failure rejects full unpin transaction')
await role();await db.exec('DROP TRIGGER pin_test_failure ON matching_board.member_lock_operations; DROP FUNCTION private.pin_test_failure()')
check((await get()).locked_member_ids.slice().sort(),[a,b].sort(),'audit failure rolls back pin state')
await role()
const postflight=await db.exec(read('supabase/audits/matching-board-member-lock-postflight.sql'))
check(postflight.find(r=>r.rows[0]?.verification)?.rows[0].verification.status,'PASS','read-only postflight validates new tables functions triggers and invariant')
// Existing publication and player cancellation remain authoritative.
await server()
const preparation=await scalar('SELECT public.admin_prepare_match_publication($1,$2,0)',[session,admin])
check(inspectPublicationPreflight(preparePublicationPreflightInput(preparation.capture),preparation.current_rows).passed,true,'existing publication preflight accepts pinned pairs')
const proof=await scalar('SELECT public.admin_authorize_match_publication($1,$2,0,$3)',[session,admin,preparation.revision_token])
await adminRole();await scalar("SELECT public.admin_publish_checked_match_session($1,0,'隔离发布个人双锁方案',$2)",[session,proof.preflight_id])
board=await get()
await rejects(()=>set(a,false,board),/REQUIRES_DRAFT/,'published pin cannot be edited')
await player(ids.indexOf(a));await scalar('SELECT public.request_my_match_cancellation($1,$2,$3)',[finalPair.id,'隔离测试申请取消',1])
await role();const requested=await scalar('SELECT cancellation_requested_at FROM public.match_results WHERE id=$1',[finalPair.id])
await adminRole();await scalar("SELECT public.admin_approve_matching_cancellation($1,1,$2,'隔离批准玩家取消')",[finalPair.id,requested])
board=await get()
check(board.locked_member_ids,[],'approved cancellation releases affected pins instead of blocking player lifecycle')
await adminRole();await scalar("SELECT public.admin_unpublish_match_session($1,1,'隔离撤回测试方案')",[session])
board=await get()
// Privacy must release only its subject, retaining an independently pinned
// waiting partner. Roll this fixture privacy operation back before separately
// testing draft deletion: the existing member lifecycle forbids deleting
// historical results of an already anonymized subject.
await set(other.member_a_id,true,board);board=await get()
const remainingUnmatched=board.cohort_member_ids.filter(id=>!board.results.some(r=>(r.group_members??[r.member_a_id,r.member_b_id]).includes(id)))
const otherWaiting={waitingDuoIds:[other.member_a_id,other.member_b_id],brokenPairs:[{key:other.id,memberIds:[other.member_a_id,other.member_b_id]}]}
await persist(params(board,{keep:[pool.id],unmatched:[...remainingUnmatched,other.member_a_id,other.member_b_id],layout:otherWaiting}))
board=await get();await set(other.member_b_id,true,board);board=await get()
await role()
check(await scalar('SELECT count(*)::integer FROM matching_board.member_locks WHERE session_id<>$1',[session]),0,'pins are scoped to exactly this matching session')
await db.exec('BEGIN')
await db.query('UPDATE public.members SET anonymized_at=now() WHERE id=$1',[other.member_a_id])
await db.exec('SET CONSTRAINTS ALL IMMEDIATE')
check(await scalar('SELECT count(*)::integer FROM matching_board.member_locks WHERE member_id=$1',[other.member_a_id]),0,'anonymization removes its subject pin')
check(await scalar('SELECT layout FROM matching_board.state WHERE session_id=$1',[session]),{waitingDuoIds:[other.member_b_id],brokenPairs:[]},'anonymization retains unrelated pinned waiting member and removes gray identity')
check(await scalar("SELECT count(*)::integer FROM matching_board.member_lock_operations WHERE session_id=$1 AND redacted_at IS NOT NULL AND member_id IS NULL AND request_hash='privacy-redacted' AND expected_revision='privacy-redacted' AND result_revision='privacy-redacted' AND reason='隐私处理已清除'",[session]),1,'privacy scrubs operation identity hashes revisions and reason')
await db.exec('ROLLBACK')
await adminRole();await scalar("SELECT public.admin_delete_match_session_draft($1,1,'隔离清除个人锁测试草稿')",[session])
await role()
check(await scalar('SELECT count(*)::integer FROM matching_board.member_locks WHERE session_id=$1',[session]),0,'draft deletion cascades pins')
check(await scalar('SELECT count(*)::integer FROM matching_board.member_lock_operations WHERE session_id=$1',[session]),0,'draft deletion cascades pin receipts')
console.log(`Matching board member-pin SQL audit: ${checks} checks passed; isolated PGlite only (single connection).`)
await db.close();rmSync(temporary,{recursive:true,force:true})
