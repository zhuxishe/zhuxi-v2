// Offline CSV plans and actual PostgreSQL board transactions. This audit never
// opens a remote connection, uses a Production credential, or sends a real notice.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {writeFileSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
process.env.MATCHING_BOARD_MEMBER_LOCK_SUITE='1'
const {boardAuditContext:ctx}=await import('./matching-board-pglite.mjs')
const {db,scalar,role,read,admin,server,adminRole,session,ids,get,params,persist,answers,submit,prepareMatchingRunInput,temporary}=ctx
await role()
await db.exec(read('supabase/migrations/20261103121145_matching_board_manual_groups_messages.sql'))
const {build}=await import(process.env.ESBUILD_MODULE||'esbuild')
const root=fileURLToPath(new URL('../../',import.meta.url))
const bundle=await build({stdin:{contents:"export * from './src/lib/matching/board-csv'; export * from './src/lib/matching/board-csv-engine'; export {createBoardDraft,evaluateBoard} from './src/lib/matching/board-engine'",resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',alias:{'@':join(root,'src')}})
writeFileSync(join(temporary,'csv-engine.mjs'),bundle.outputFiles[0].contents)
const {createBoardCsvTemplate,previewBoardCsvText,parseBoardCsv,serializeBoardCsv,createBoardDraft,evaluateBoard}=await import(pathToFileURL(join(temporary,'csv-engine.mjs')).href)
let checks=0
const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++}
const rejects=async(work,pattern,message)=>{await assert.rejects(work,error=>pattern.test(String(error.message)),message);checks++}
const key='offline-csv-key-not-a-production-credential'
const slot='2026-10-27_下午',evening='2026-10-27_晚上'
const unwrap=value=>Array.isArray(value)?value[0]:value
function input(board){
 const source=new Map(board.capture.source.submissions.map(row=>[row.member_id,row]))
 const people=board.cohort_member_ids.map(id=>{const member=unwrap(source.get(id)?.member),identity=unwrap(member?.member_identity);return {id,name:identity?.full_name||identity?.nickname||'姓名未提供',memberNumber:member?.member_number??null,gender:identity?.gender??null}})
 const draft=createBoardDraft(board.results,board.cohort_member_ids,board.layout)
 const context={engine:prepareMatchingRunInput(board.capture).engineInput,originalRows:board.results,cohortMemberIds:board.cohort_member_ids,originalLayout:board.layout,lockedMemberIds:board.locked_member_ids??[]}
 return {sessionId:session,revision:board.base_revision,draft,people,context}
}
const preview=(board,csvText)=>previewBoardCsvText({...input(board),csvText},key)
const template=board=>createBoardCsvTemplate(input(board),key).csv
function edit(csv,callback){
 const parsed=parseBoardCsv(csv);assert.equal(parsed.errors.length,0)
 const rows=parsed.records.map(row=>[...row.cells]),headers=rows[0],index=name=>{const n=headers.indexOf(name);assert.ok(n>=0,name);return n}
 callback(rows,index)
 return serializeBoardCsv(rows)
}
const personRow=(rows,index,id)=>rows.slice(1).find(row=>row[index('玩家标识（勿改）')]===id)
function assign(row,index,pool,code='',section='',value=''){
 row[index('目标池')]=pool;row[index('组号')]=code;row[index('多人分组栏')]=section
 const [date='',period='']=value.split('_');row[index('推荐日期')]=date;row[index('推荐时段')]=period
}
const protectedState=async()=>{await role();return scalar("SELECT jsonb_build_object('rounds',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.match_rounds r),'submissions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.match_round_submissions s),'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.match_sessions s),'results',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.match_results r),'board',(SELECT jsonb_agg(to_jsonb(s) ORDER BY session_id) FROM matching_board.state s),'operations',(SELECT count(*) FROM matching_board.operations),'notices',(SELECT count(*) FROM public.community_notifications),'publications',(SELECT count(*) FROM matching_publication.publications))")}
const counts=async()=>{await role();return scalar("SELECT jsonb_build_object('notices',(SELECT count(*) FROM public.community_notifications),'publications',(SELECT count(*) FROM matching_publication.publications))")}
function saveArgs(board,plan){
 const source=input(board),evaluation=evaluateBoard(source.context,plan.draft,true),d=evaluation.draft
 const layout={waitingDuoIds:d.waitingDuoIds,brokenPairs:d.brokenPairs,unmatchedMessage:d.unmatchedMessage??'',...(d.multiMode==='grouped'?{multiMode:'grouped',waitingMultiIds:d.multi?.memberIds??[],multiPoolSlot:d.multi?.bestSlot??null,smallGroupMemberIds:(d.multiGroups??[]).filter(g=>g.groupKind==='small').map(g=>g.memberIds),manualSmallGroupMemberIds:(d.multiGroups??[]).filter(g=>g.groupKind==='small'&&g.manuallyAdjusted).map(g=>g.memberIds)}:{})}
 return params(board,{keep:evaluation.keepResultIds,rows:evaluation.changedRows,layout,unmatched:evaluation.unmatchedIds,engine:source.context.engine})
}
function valid(result,message){assert.ok(result.success&&result.preview&&!result.error&&!result.errors?.length,`${message}: ${JSON.stringify(result)}`);checks++;return result.preview}
function invalid(result,message){assert.ok(result.error||result.errors?.length,`${message}: ${JSON.stringify(result)}`);check(result.preview,undefined,message+' has no applicable draft')}

let board=await get(),csv=template(board)
await role();const originalState=await protectedState()
const unchanged=valid(preview(board,csv),'the exact saved template validates')
check(unchanged.unchanged,true,'legacy single-pool roundtrip is a no-op')
check(unchanged.draft,input(board).draft,'roundtrip keeps the original pool representation and stable result IDs')
const renamed=edit(csv,(rows,index)=>{for(const row of rows.slice(1))if(row[index('组号')])row[index('组号')]='换名_'+row[index('组号')];rows.splice(1,rows.length-1,...rows.slice(1).reverse())})
check(valid(preview(board,renamed),'reordered and relabeled template validates').unchanged,true,'row order and cosmetic group numbering do not rebuild matches')
invalid(preview(board,edit(csv,rows=>{rows.pop()})),'missing members are rejected')
invalid(preview(board,edit(csv,rows=>{rows.push([...rows[1]])})),'duplicate members are rejected')
invalid(preview(board,edit(csv,(rows,index)=>{rows[1][index('玩家标识（勿改）')]=ids[10]})),'later registrants outside this cohort are rejected')
invalid(preview(board,edit(csv,(rows,index)=>{rows[1][index('姓名')]='修改玩家姓名'})),'reference identity changes are not profile edits')
invalid(preview(board,edit(csv,(rows,index)=>{rows[1][index('模板信息（勿改）')]='forged.token'})),'forged template metadata fails closed')
check(preview(board,csv.replaceAll('2026-10-27','2026-10-31')).preview,undefined,'no-common-time recommendations cannot be applied')
check(await protectedState(),originalState,'download and all CSV previews leave every business row and notice unchanged')

// A saved optional message is intentionally absent from the editable CSV schema.
await persist(params(board,{layout:{...board.layout,unmatchedMessage:'后台工作人员留言保持原样'}}));board=await get()
csv=template(board)
check(valid(preview(board,csv),'message-preserving roundtrip validates').draft.unmatchedMessage,'后台工作人员留言保持原样','CSV never clears the independently saved staff message')
const oldCsv=csv
for(let i=0;i<10;i++){const payload=answers('都可以');payload.availability['2026-10-27']=['下午','晚上'];await submit(i,payload)}
board=await get()
const stale=preview(board,oldCsv)
invalid(stale,'changed answers make a downloaded template stale')
check(stale.stale,true,'stale template status is explicit')
csv=template(board)
const bulk=edit(csv,(rows,index)=>{
 for(let i=0;i<7;i++)assign(personRow(rows,index,ids[i]),index,'多人','M07','4–6人分组',slot)
 for(let i=7;i<9;i++)assign(personRow(rows,index,ids[i]),index,'双人','D01','',evening)
 assign(personRow(rows,index,ids[9]),index,'未匹配')
})
await role();const beforeBulk=await protectedState(),noticeCounts=await counts()
const planned=valid(preview(board,bulk),'a complete 7-person multiplayer and alternate-time duo plan validates')
check(planned.draft.multiGroups[0].memberIds.length,7,'manual CSV can exceed the recommendation size')
check(planned.draft.multiGroups[0].manuallyAdjusted,true,'manual size permission is explicit and retained')
check(planned.draft.duos[0].bestSlot,evening,'manual duo recommendation is not replaced by algorithm time')
check(planned.draft.unmatchedMessage,'后台工作人员留言保持原样','bulk regrouping preserves staff copy')
check(await protectedState(),beforeBulk,'successful preview still performs no save or notification')
const args=saveArgs(board,planned)
await persist(args);board=await get()
check(board.results.filter(r=>r.group_members?.length).map(r=>r.group_members.length),[7],'explicit existing save RPC stores the seven-person group')
check(board.results.find(r=>r.member_b_id)?.best_slot,evening,'actual SQL save accepts and preserves the alternate valid duo time without migration')
check(board.layout.manualSmallGroupMemberIds[0].slice().sort(),ids.slice(0,7).sort(),'saved classification survives fresh read')
check(await counts(),noticeCounts,'manual CSV draft save creates neither publication nor notification')
check((await persist(args)).already_applied,true,'repeating the same saved operation returns its existing receipt')
const fresh=valid(preview(board,template(board)),'saved CSV grouping reopens and validates')
check(fresh.unchanged,true,'a newly downloaded unchanged manual plan is a no-op')
check(evaluateBoard(input(board).context,fresh.draft,true).keepResultIds.slice().sort(),board.results.map(r=>r.id).sort(),'unchanged CSV keeps saved result IDs and scores')

// Authoritative locks are reloaded by each preview; CSV has no unlock command.
const multi=board.results.find(r=>r.group_members?.length)
await adminRole();await db.query("UPDATE public.match_results SET status='locked',locked_by=$1,locked_at=now(),audit_reason='隔离CSV小组锁定核对' WHERE id=$2",[admin,multi.id])
board=await get();csv=template(board)
const lockedMove=edit(csv,(rows,index)=>assign(personRow(rows,index,ids[0]),index,'未匹配'))
await role();const lockedState=await protectedState()
invalid(preview(board,lockedMove),'a locked group cannot be altered through CSV')
check(await protectedState(),lockedState,'a refused lock change never partially applies')
await adminRole();await db.query("UPDATE public.match_results SET status='draft',locked_by=NULL,locked_at=NULL,audit_reason='隔离CSV小组解锁核对' WHERE id=$1",[multi.id])
board=await get()
await server();await scalar('SELECT public.admin_set_matching_board_member_lock($1,$2,$3,true,$4,$5)',[session,admin,ids[7],randomUUID(),board.base_revision])
board=await get();csv=template(board)
invalid(preview(board,edit(csv,(rows,index)=>{for(const id of ids.slice(7,9))assign(personRow(rows,index,id),index,'未匹配')})),'a personally pinned duo member cannot leave the duo pool')
await server();await scalar('SELECT public.admin_set_matching_board_member_lock($1,$2,$3,false,$4,$5)',[session,admin,ids[7],randomUUID(),board.base_revision])
board=await get()

// Save remains optimistic and atomic even after a successful readonly preview.
csv=template(board)
const pending=valid(preview(board,csv),'plan for stale-save probe validates')
const pendingArgs=saveArgs(board,pending)
await persist(params(board,{unmatched:[ids[9]],layout:{...board.layout,unmatchedMessage:'其他管理员已保存新留言'}}));board=await get()
await role();const concurrentState=await protectedState()
await rejects(()=>persist(pendingArgs),/STALE/,'a concurrent board change rejects the old save rather than overwriting it')
await role();check(await protectedState(),concurrentState,'stale save leaves the newer saved state intact')
check(await counts(),noticeCounts,'all CSV validation, draft saves and stale rejections leave publication and notice counts unchanged')

// A current template is not permission to retain a now-ineligible matched player.
await role();await db.query('INSERT INTO private.test_readiness(member_id,ready) VALUES($1,false)',[ids[0]])
board=await get()
invalid(preview(board,template(board)),'unchanged templates still check current member eligibility')
await role();await db.query('DELETE FROM private.test_readiness WHERE member_id=$1',[ids[0]])
console.log(`Matching CSV plan/actual board SQL audit: ${checks} checks passed; isolated PGlite only.`)
await db.close();rmSync(temporary,{recursive:true,force:true})
