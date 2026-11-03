// Per-member messages using actual protected PostgreSQL RPCs. Local fixtures
// only: no remote connections, Production credentials or real notifications.
import assert from 'node:assert/strict'
import {rmSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
process.env.MATCHING_BOARD_MEMBER_LOCK_SUITE='1'
const {boardAuditContext:ctx}=await import('./matching-board-pglite.mjs')
const {db,scalar,role,read,admin,server,adminRole,player,round,session,ids,get,params,persist,temporary}=ctx
const {build}=await import(process.env.ESBUILD_MODULE||'esbuild')
const bundle=await build({stdin:{contents:"export {matchingReviewPublicationSignature} from './src/lib/matching/session-review'",resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',alias:{'@':fileURLToPath(new URL('../../src',import.meta.url))}})
writeFileSync(join(temporary,'personal-review-hash.mjs'),bundle.outputFiles[0].contents)
const {matchingReviewPublicationSignature}=await import(pathToFileURL(join(temporary,'personal-review-hash.mjs')).href)
let checks=0
const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++}
const rejects=async(work,pattern,message)=>{await assert.rejects(work,error=>pattern.test(String(error.message)),message);checks++}
const layout=(common='',personal)=>({waitingDuoIds:[],brokenPairs:[],unmatchedMessage:common,...(personal===undefined?{}:{unmatchedMemberMessages:personal})})
const common='统一：我们会继续协调。',personalA='个人甲：你的日期较少，工作人员会单独联系。',personalB='个人乙：请留意后续安排。'
const outcome=async index=>{await player(index);return (await scalar('SELECT public.get_my_matching_publications()')).find(item=>item.round_id===round)}
const protectedState=()=>scalar("SELECT jsonb_build_object('rounds',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.match_rounds r),'submissions',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.match_round_submissions r),'results',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.match_results r),'sessions',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.match_sessions r),'board',(SELECT jsonb_agg(to_jsonb(r) ORDER BY session_id) FROM matching_board.state r),'publications',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM matching_publication.publications r),'roster',(SELECT jsonb_agg(to_jsonb(r)-'unmatched_message' ORDER BY publication_id,member_id) FROM matching_publication.roster r),'notices',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.community_notifications r),'operations',(SELECT count(*) FROM matching_board.operations))")
const deliveryState=async()=>{await role();return scalar("SELECT jsonb_build_object('notices',(SELECT count(*) FROM public.community_notifications),'publications',(SELECT count(*) FROM matching_publication.publications))")}
async function publish(expected){
 await server();const preparation=await scalar('SELECT public.admin_prepare_match_publication($1,$2,$3)',[session,admin,expected])
 const proof=await scalar('SELECT public.admin_authorize_match_publication($1,$2,$3,$4)',[session,admin,expected,preparation.revision_token])
 await adminRole();return scalar("SELECT public.admin_publish_checked_match_session($1,$2,'隔离个人留言发布验证',$3)",[session,expected,proof.preflight_id])
}
await role();await db.exec(read('supabase/migrations/20261103121145_matching_board_manual_groups_messages.sql'))
// A pre-migration historical roster retains its common-message semantics.
const legacy=await scalar("INSERT INTO matching_publication.publications(session_id,round_id,version,round_name,published_at,reason,unmatched_message) VALUES($1,$2,99,'历史隔离轮次','2020-01-01','隔离历史留言',$3) RETURNING id",[session,round,'历史统一留言'])
await db.query("INSERT INTO matching_publication.roster(publication_id,member_id,outcome) VALUES($1,$2,'unmatched')",[legacy,ids[9]])
const before=await protectedState()
await db.exec(read('supabase/migrations/20261103145800_matching_board_personal_unmatched_messages.sql'))
check(await protectedState(),before,'migration has no existing business, layout, roster, notification or result backfill')
check(await scalar('SELECT unmatched_message IS NULL FROM matching_publication.roster WHERE publication_id=$1',[legacy]),true,'old roster SQL NULL retains old common-message behavior')
check((await outcome(9)).unmatched_message,'历史统一留言','legacy player card reads exactly its prior common message')
await role()
for(const signature of ['matching_board.normalize_unmatched_member_messages(jsonb,uuid[])','matching_board.resolve_unmatched_member_message(text,jsonb,uuid)','matching_publication.guard_roster_unmatched_message()']){
 for(const actor of ['anon','authenticated','service_role'])check(await scalar("SELECT has_function_privilege($1,$2,'EXECUTE')",[actor,signature]),false,`${signature} is not directly callable by ${actor}`)
 check(await scalar('SELECT prosecdef FROM pg_proc WHERE oid=$1::regprocedure',[signature]),false,`${signature} is invoker only`)
}
const normalize=(messages,cohort=ids.slice(0,10))=>scalar('SELECT matching_board.normalize_unmatched_member_messages($1,$2)',[messages===undefined?null:JSON.stringify(messages),cohort])
check(await normalize(undefined),{},'undefined SQL value is legacy empty map')
check(await normalize({[ids[8]]:'  '+personalA+'\n ',[ids[9]]:null,[ids[0]]:' \u3000\n '}),{[ids[8]]:personalA,[ids[9]]:null},'canonical map trims text, drops blank fallback entries and preserves explicit no-message')
check(await normalize({[ids[8]]:'🌿'.repeat(300)}),{[ids[8]]:'🌿'.repeat(300)},'Unicode 300 characters are accepted')
for(const messages of [null,[],1,'text',{outside:'text'},{[ids[10]]:'text'},{[ids[8]]:1},{[ids[8]]:{}},{[ids[8]]:'字'.repeat(301)}])await rejects(()=>normalize(messages),/MEMBER_MESSAGES_INVALID/,'invalid map shape, cohort key or overlong text fails closed')
check(await scalar('SELECT matching_board.resolve_unmatched_member_message($1,$2,$3)',[common,{},ids[8]]),common,'missing personal note uses common fallback')
check(await scalar('SELECT matching_board.resolve_unmatched_member_message($1,$2,$3)',[common,{[ids[8]]:personalA},ids[8]]),personalA,'personal text replaces rather than appends the common message')
check(await scalar('SELECT matching_board.resolve_unmatched_member_message($1,$2,$3)',[common,{[ids[8]]:null},ids[8]]),null,'explicit null suppresses the common message')
let board=await get();check(board.layout.unmatchedMemberMessages,undefined,'reading an old draft does not add a map')
const deliveryBefore=await deliveryState()
const personal={[ids[8]]:'  '+personalA+' ',[ids[9]]:personalB,[ids[0]]:'已匹配人员不应收到这段专属文字'}
const request=params(board,{layout:layout(common,personal)})
await persist(request);board=await get()
const canonical={[ids[8]]:personalA,[ids[9]]:personalB,[ids[0]]:personal[ids[0]]}
check(board.layout.unmatchedMemberMessages,canonical,'actual save and recapture preserve each member-specific note')
check((await persist(request)).already_applied,true,'receipt-first retry does not duplicate a personal-message save')
await rejects(()=>persist(params(board,{layout:layout(common)})),/MEMBER_MESSAGES_REQUIRED/,'cached clients cannot silently clear existing personal messages')
await rejects(()=>persist(params(board,{layout:layout(common,{[ids[10]]:'outside'})})),/MEMBER_MESSAGES_INVALID/,'save validates member notes against this exact cohort')
check(await deliveryState(),deliveryBefore,'draft edits, retries and rejections do not publish or send notifications')
await server();const preparation=await scalar('SELECT public.admin_prepare_match_publication($1,$2,0)',[session,admin])
check(preparation.unmatched_member_messages,canonical,'server-only preparation exposes the canonical map for review signature binding')
check(matchingReviewPublicationSignature(session,board.results,board.capture,common,board.unmatched_message_recipient_ids,canonical),matchingReviewPublicationSignature(session,preparation.current_rows,preparation.capture,preparation.unmatched_message,preparation.unmatched_message_recipient_ids,preparation.unmatched_member_messages),'full board and matched-only publication capture agree while binding unmatched-only personal notes')
const proof=await scalar('SELECT public.admin_authorize_match_publication($1,$2,0,$3)',[session,admin,preparation.revision_token])
await role();await db.exec('BEGIN')
await persist(params(board,{layout:layout(common,{...canonical,[ids[9]]:'准备后被修改'})}))
const changed=await get();check(changed.base_revision===board.base_revision,false,'a personal-only edit invalidates the board review revision')
await adminRole();await rejects(()=>scalar("SELECT public.admin_publish_checked_match_session($1,0,'隔离个人留言版本保护',$2)",[session,proof.preflight_id]),/PREFLIGHT_STALE/,'a personal-only edit invalidates the final publication proof')
await db.exec('ROLLBACK')
// A recipient that is ineligible at publication gets a frozen JSON null,
// rather than a legacy NULL that could later inherit the common message.
await role();await db.exec('BEGIN')
await db.query("UPDATE public.members SET account_status='blocked' WHERE id=$1",[ids[9]])
const excludedPublish=await publish(0)
await role();check(await scalar('SELECT unmatched_message IS NULL FROM matching_publication.roster WHERE publication_id=$1 AND member_id=$2',[excludedPublish.publication_id,ids[9]]),false,'new ineligible recipients get an explicit frozen absence')
check(await scalar('SELECT unmatched_message FROM matching_publication.roster WHERE publication_id=$1 AND member_id=$2',[excludedPublish.publication_id,ids[9]]),null,'ineligible recipients do not freeze private or common text')
await db.query("UPDATE public.members SET account_status='active' WHERE id=$1",[ids[9]])
check((await outcome(9)).unmatched_message,null,'restoring eligibility later never exposes an unplanned common or personal note')
await role();await db.exec('ROLLBACK')
const first=await publish(0)
check(first.published,true,'the existing checked publication route freezes personalized messages')
check((await outcome(8)).unmatched_message,personalA,'player A sees only their own note')
check((await outcome(9)).unmatched_message,personalB,'player B sees their different note')
check(JSON.stringify(await outcome(8)).includes(personalB),false,'player A never receives player B text or the map')
check(JSON.stringify(await outcome(9)).includes(personalA),false,'player B never receives player A text or the map')
check((await outcome(0)).unmatched_message,null,'matched users see no unmatched staff message')
check((await outcome(10)).unmatched_message,null,'a later unrelated signup cannot see this batch personal notes')
await role();check(await scalar('SELECT unmatched_message FROM matching_publication.roster WHERE publication_id=$1 AND member_id=$2',[first.publication_id,ids[8]]),personalA,'effective personal string is frozen into only its roster row')
await rejects(()=>db.query('UPDATE matching_publication.roster SET unmatched_message=$1 WHERE publication_id=$2 AND member_id=$3',[JSON.stringify('改写历史'),first.publication_id,ids[8]]),/MEMBER_MESSAGE_IMMUTABLE/,'published personal text cannot be changed in place')
await rejects(()=>db.query('UPDATE matching_publication.roster SET unmatched_message=$1 WHERE publication_id=$2',['"借用旧版空值"',legacy]),/MEMBER_MESSAGE_IMMUTABLE/,'legacy SQL NULL cannot be filled after publication outside its creation context')
await adminRole();await scalar("SELECT public.admin_unpublish_match_session($1,1,'隔离撤回后单人留言验证')",[session]);board=await get()
await persist(params(board,{layout:layout(common,{[ids[8]]:null,[ids[9]]:' \u3000\n '})}));board=await get()
check(board.layout.unmatchedMemberMessages,{[ids[8]]:null},'blank personal text returns to common while null remains explicit no-message')
check((await outcome(8)).unmatched_message,null,'withdrawn cards never reveal the new draft note')
await role();check(await scalar('SELECT unmatched_message FROM matching_publication.roster WHERE publication_id=$1 AND member_id=$2',[first.publication_id,ids[8]]),personalA,'draft editing after withdrawal does not rewrite historical personalized text')
const second=await publish(1)
check((await outcome(8)).unmatched_message,null,'player can explicitly suppress the common note in the next version')
check((await outcome(9)).unmatched_message,common,'blank override falls back to the common note in the next version')
await role();check(await scalar('SELECT unmatched_message FROM matching_publication.roster WHERE publication_id=$1 AND member_id=$2',[second.publication_id,ids[8]]),null,'explicit no-message is stored as JSON null')
check(await scalar('SELECT unmatched_message IS NULL FROM matching_publication.roster WHERE publication_id=$1 AND member_id=$2',[second.publication_id,ids[8]]),false,'new no-message is distinguishable from a legacy SQL NULL')
// Privacy cleanup removes the targeted draft entry and the corresponding frozen
// roster field instead of retaining a private personal reason after erasure.
await role();await db.exec('BEGIN')
await db.query('UPDATE public.members SET anonymized_at=now() WHERE id=$1',[ids[8]])
await db.exec('SET CONSTRAINTS ALL IMMEDIATE')
check(await scalar("SELECT COALESCE(layout->'unmatchedMemberMessages','{}'::jsonb) ? $2 FROM matching_board.state WHERE session_id=$1",[session,ids[8]]),false,'anonymization deletes the targeted draft message entry')
check(await scalar("SELECT count(*)::integer FROM matching_publication.roster WHERE member_id=$1 AND unmatched_message IS DISTINCT FROM 'null'::jsonb",[ids[8]]),0,'anonymization redacts every personalized frozen roster field')
check(await scalar('SELECT count(*)::integer FROM matching_publication.roster WHERE member_id=$1',[ids[8]]),2,'privacy cleanup preserves the historical roster structure')
await db.exec('ROLLBACK')
await role('anon');await rejects(()=>scalar('SELECT public.get_my_matching_publications()'),/permission denied/,'anonymous access cannot retrieve any personal note')
await role();const postflight=await db.exec(read('supabase/audits/matching-board-personal-messages-postflight.sql'))
check(postflight.find(result=>result.rows[0]?.verification)?.rows[0].verification.status,'PASS','read-only personal-message schema and invariant checks pass')
console.log(`Matching personal unmatched-message SQL audit: ${checks} checks passed; isolated PGlite only.`)
await db.close();rmSync(temporary,{recursive:true,force:true})
