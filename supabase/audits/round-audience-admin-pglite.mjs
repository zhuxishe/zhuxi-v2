// Isolated real PostgreSQL only. No credentials, Production data or live writes.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
process.env.ROUND_AUDIENCE_ADMIN_SUITE='1'
const {formalAccessAuditContext:ctx}=await import('./test-round-formal-access-pglite.mjs')
const {db,scalar,role,read,player,adminUser,superUser,superAdmin,accounts,real,formal,round,outsider,outsiderUser,fresh,freshUser}=ctx
let checks=0
const check=(a,b,label)=>{assert.deepEqual(a,b,label);checks++}
const rejects=async(work,pattern,label)=>{await assert.rejects(work,pattern,label);checks++}
const get=id=>scalar('SELECT public.admin_get_round_audience($1)',[id])
const receipt=id=>scalar('SELECT public.admin_get_round_audience_operation($1)',[id])
const save=(id,enabled,ids,revision,op=randomUUID(),reason='管理员核对后调整本期参与范围')=>scalar('SELECT public.admin_save_round_audience($1,$2,$3,$4,$5,$6)',[id,enabled,ids,revision,op,reason])
const business=`SELECT jsonb_build_object('members',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.members x),'rounds',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.match_rounds x),'submissions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.match_round_submissions x),'sessions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.match_sessions x),'results',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.match_results x),'notifications',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.community_notifications x),'settings',(SELECT jsonb_agg(to_jsonb(x) ORDER BY round_id) FROM test_pool_access.round_formal_player_access x),'listed',(SELECT jsonb_agg(to_jsonb(x) ORDER BY round_id,member_id) FROM private.test_round_members x))`
const policies="SELECT jsonb_agg(to_jsonb(p) ORDER BY schemaname,tablename,policyname) FROM pg_policies p WHERE schemaname='public'"
await role();const before=await scalar(business),oldPolicies=await scalar(policies)
await db.exec(read('supabase/migrations/20261028163133_round_audience_admin.sql'))
check(await scalar(business),before,'installation changes no business data, current modes or explicit lists')
check(await scalar(policies),oldPolicies,'existing public RLS policies unchanged')
check(await scalar('SELECT count(*)::int FROM test_pool_access.audience_admin_operations'),0,'installation creates no actions')
for(const apiRole of ['anon','authenticated','service_role'])check(await scalar("SELECT has_table_privilege($1,'test_pool_access.audience_admin_operations','SELECT,INSERT,UPDATE,DELETE')",[apiRole]),false,`${apiRole} no table access`)
for(const sig of ['admin_get_round_audience(uuid)','admin_save_round_audience(uuid,boolean,uuid[],text,uuid,text)','admin_get_round_audience_operation(uuid)']){
 check(await scalar('SELECT NOT prosecdef FROM pg_proc WHERE oid=$1::regprocedure',['public.'+sig]),true,`${sig} is an invoker wrapper`)
 for(const apiRole of ['anon','service_role'])check(await scalar('SELECT has_function_privilege($1,$2,\'EXECUTE\')',[apiRole,'public.'+sig]),false,`${apiRole} cannot call ${sig}`)
}
for(const apiRole of ['anon','service_role']){await role(apiRole);await rejects(()=>get(round),/permission denied/,`${apiRole} actual read denied`);await rejects(()=>save(round,true,[], 'revision'),/permission denied/,`${apiRole} actual save denied`)}
await player(outsiderUser);await rejects(()=>get(round),/FORBIDDEN/,'normal player cannot read admin snapshot');await rejects(()=>save(round,true,[],'revision'),/FORBIDDEN/,'normal player cannot write')
await player(adminUser);const normal=await get(round)
check(normal.canManage,false,'ordinary admin read only')
check(normal.members.every(m=>m.listed||m.participated),true,'ordinary admin does not receive unrelated selectable identities')
check(normal.members.every(m=>Object.keys(m).sort().join()===['id','name','memberNumber','isTest','listed','participated','eligible'].sort().join()),true,'member projection is only needed metadata')
await rejects(()=>save(round,true,normal.members.filter(m=>m.listed).map(m=>m.id),normal.revision),/FORBIDDEN/,'ordinary admin cannot save')
await player(superUser);const initial=await get(round)
check(initial.canManage,true,'super-admin may manage test matching round')
check(initial.enabled,true,'existing open mode preserved')
check(initial.counts.listed,33,'list count exact')
check(initial.members.some(m=>m.id===fresh&&m.eligible&&!m.listed),true,'super-admin receives eligible selectable member')
check(initial.members.some(m=>m.id===outsider&&m.participated),true,'history-only participant included')
const formalSnapshot=await get(formal)
check([formalSnapshot.isTest,formalSnapshot.enabled,formalSnapshot.canManage,formalSnapshot.members.length],[false,true,false,0],'formal activity is read-only normal-player scope')
await rejects(()=>save(formal,true,[],formalSnapshot.revision),/READ_ONLY/,'cannot convert or modify formal activity scope')
const makeRound=async(label,list=[accounts[0].id,real[0].id])=>{
 await role();const id=await scalar('INSERT INTO public.match_rounds(round_name) VALUES($1) RETURNING id',[label])
 await db.exec('BEGIN');await db.query('INSERT INTO private.test_pool_write_context VALUES(txid_current(),pg_backend_pid(),$1)',[id]);await db.query('UPDATE public.match_rounds SET is_test=true WHERE id=$1',[id]);await db.query('DELETE FROM private.test_pool_write_context WHERE round_id=$1',[id]);await db.exec('COMMIT')
 for(const m of list)await db.query('INSERT INTO private.test_round_members(round_id,member_id,created_by) VALUES($1,$2,$3)',[id,m,superAdmin])
 await player(superUser);return id
}
const target=await makeRound('后台参与范围保存隔离验证')
let snapshot=await get(target),ids=snapshot.members.filter(m=>m.listed).map(m=>m.id)
await rejects(()=>save(target,true,[...ids,ids[0]],snapshot.revision),/INPUT_INVALID/,'duplicate selected IDs rejected')
await rejects(()=>save(target,true,ids,snapshot.revision,randomUUID(),'短'),/INPUT_INVALID/,'reason required')
await rejects(()=>save(target,true,[...ids,randomUUID()],snapshot.revision),/INELIGIBLE/,'unknown ID rejected')
await role();const beforeWrite=await scalar(business);await player(superUser)
const op=randomUUID(),wanted=[...ids,fresh].sort(),reason='核实人员身份后开放本期正式玩家'
const first=await save(target,true,wanted,snapshot.revision,op,reason)
check([first.enabled,first.listedCount,first.alreadyApplied],[true,3,false],'saves scope and list together')
check([first.expectedRevision,first.memberIds,first.actorAdminId,first.reason],[snapshot.revision,wanted,superAdmin,reason],'receipt binds complete original request and actual actor')
let updated=await get(target)
check(first.revision,updated.revision,'receipt version is exact post-save version')
check(updated.operations[0].operationId,op,'operation visible in bounded history')
check(updated.operations[0].listedCount,3,'history list count exact')
check((await save(target,true,[...wanted].reverse(),snapshot.revision,op,reason)).alreadyApplied,true,'identical retry resolves before stale version; list order irrelevant')
await rejects(()=>save(target,false,wanted,snapshot.revision,op,reason),/OPERATION_CONFLICT/,'operation cannot change enabled flag')
await rejects(()=>save(target,true,wanted,updated.revision,op,reason),/OPERATION_CONFLICT/,'operation cannot change expected revision')
await rejects(()=>save(target,true,wanted,updated.revision,op,'这是另一个保存原因'),/OPERATION_CONFLICT/,'operation cannot change reason')
await rejects(()=>save(target,true,ids,snapshot.revision),/STALE/,'stale independent edit rejected')
await role();check(await scalar('SELECT count(*)::int FROM test_pool_access.audience_admin_operations WHERE round_id=$1',[target]),1,'retries do not duplicate application audit')
check(await scalar('SELECT count(*)::int FROM test_pool_access.round_formal_player_access_audit WHERE round_id=$1',[target]),1,'retries do not duplicate owner setter audit')
const afterWrite=await scalar(business)
for(const field of ['members','rounds','submissions','sessions','results','notifications'])check(afterWrite[field],beforeWrite[field],`audience save never mutates ${field}`)
for(const query of ['UPDATE test_pool_access.audience_admin_operations SET reason=\'改写历史理由\'','DELETE FROM test_pool_access.audience_admin_operations','TRUNCATE test_pool_access.audience_admin_operations'])await rejects(()=>db.exec(query),/AUDIT_IMMUTABLE/,'operation audit immutable')
await player(adminUser);await rejects(()=>receipt(op),/OPERATION_CONFLICT/,'ordinary other administrator cannot read another actor receipt')
await role();await db.query("UPDATE public.admin_users SET role='admin' WHERE id=$1",[superAdmin]);await player(superUser)
check((await receipt(op)).alreadyApplied,true,'downgraded active admin can recover own committed operation')
check((await get(target)).canManage,false,'downgraded admin snapshot is read only')
await rejects(()=>save(target,false,wanted,updated.revision),/FORBIDDEN/,'downgraded admin cannot issue new write')
await role();await db.query("UPDATE public.admin_users SET role='super_admin' WHERE id=$1",[superAdmin])
// Changes by the old controlled operator must invalidate existing browser state.
await player(superUser);snapshot=await get(target);await role();await scalar('SELECT test_pool_access.set_round_formal_player_access($1,false,$2,$3)',[target,'操作侧修改模式使旧网页失效',randomUUID()]);await player(superUser)
await rejects(()=>save(target,true,wanted,snapshot.revision),/STALE/,'owner-side mode change invalidates browser revision')
snapshot=await get(target);await role();await db.query('INSERT INTO private.test_round_members(round_id,member_id,created_by) VALUES($1,$2,$3)',[target,outsider,superAdmin]);await player(superUser)
await rejects(()=>save(target,true,wanted,snapshot.revision),/STALE/,'external explicit-list change invalidates browser revision')
// A formerly selectable identity can become ineligible before a save.
const gated=await makeRound('身份改变保存复核'),gatedSnapshot=await get(gated)
await role();await db.query("UPDATE public.members SET account_status='suspended' WHERE id=$1",[fresh]);await player(superUser)
await rejects(()=>save(gated,false,[accounts[0].id,real[0].id,fresh],gatedSnapshot.revision),/INELIGIBLE/,'new selection rechecks current eligibility')
await role();await db.query("UPDATE public.members SET account_status='active' WHERE id=$1",[fresh]);await player(superUser)
// Existing participants can never be removed. Off-list participants can be
// added in the same save before narrowing the mode, retaining their access.
const history=await makeRound('已有参与者保留', [real[0].id]);snapshot=await get(history);await save(history,true,[real[0].id],snapshot.revision)
await player(outsiderUser);await db.query('INSERT INTO public.match_round_submissions(round_id,member_id) VALUES($1,$2)',[history,outsider]);await player(superUser);snapshot=await get(history)
await rejects(()=>save(history,false,[real[0].id],snapshot.revision),/PARTICIPANTS_REQUIRED/,'narrowing cannot drop an off-list respondent')
await save(history,false,[real[0].id,outsider],snapshot.revision)
await player(outsiderUser);check((await scalar('SELECT public.get_my_test_round_ids()')).includes(history),true,'narrowed list retains actual respondent visibility')
await player(superUser);snapshot=await get(history)
await rejects(()=>save(history,true,[real[0].id],snapshot.revision),/PARTICIPANTS_REQUIRED/,'even broad mode cannot remove an already-listed participant')
// Historical cancelled answers and detached publication rosters still protect.
await role();await db.query('UPDATE public.match_round_submissions SET cancelled_at=now() WHERE round_id=$1',[history]);await player(superUser);snapshot=await get(history)
await rejects(()=>save(history,false,[real[0].id],snapshot.revision),/PARTICIPANTS_REQUIRED/,'cancelled respondent remains protected')
const detached=await makeRound('原会话已删除的发布名册',[])
await role();const pub=await scalar("INSERT INTO matching_publication.publications(session_id,round_id,version,round_name,reason) VALUES($1,$2,1,'历史名单','隔离后台范围保护') RETURNING id",[randomUUID(),detached]);await db.query("INSERT INTO matching_publication.roster(publication_id,member_id,outcome) VALUES($1,$2,'unmatched')",[pub,outsider]);await player(superUser);snapshot=await get(detached)
check(snapshot.members.some(m=>m.id===outsider&&m.participated),true,'detached publication participant appears in protected metadata')
await rejects(()=>save(detached,false,[],snapshot.revision),/PARTICIPANTS_REQUIRED/,'detached publication blocks participant loss')
await save(detached,false,[outsider],snapshot.revision)
// New participation since page load is a revision conflict before membership edit.
snapshot=await get(history);await role();await db.query("INSERT INTO private.round_peer_review_settings(round_id,opens_at,closes_at) VALUES($1,now(),now()+interval '1 day')",[history]);const newcomer=fresh;await db.query('INSERT INTO private.round_peer_review_participants(round_id,member_id,source) VALUES($1,$2,\'manual\')',[history,newcomer]);await player(superUser)
await rejects(()=>save(history,true,[real[0].id,outsider],snapshot.revision),/STALE/,'new historical participant invalidates old browser state')
// A committed operation is still recoverable after the round became read-only.
await role();await db.query('UPDATE public.match_rounds SET deleted_at=now() WHERE id=$1',[target]);await player(superUser)
check((await receipt(op)).operationId,op,'receipt readable after target soft deletion')
check((await save(target,true,wanted,first.expectedRevision,op,reason)).alreadyApplied,true,'exact successful save retry remains readable after deletion')
await rejects(()=>get(target),/NOT_FOUND/,'deleted round is not editable/readable as active config')
await role();await db.query('UPDATE public.match_rounds SET deleted_at=NULL WHERE id=$1',[target])
// A legacy owner receipt must not be replayed as a new browser list edit.
const collisionRound=await makeRound('旧操作编号冲突保护'),collisionOp=randomUUID()
await role();await scalar('SELECT test_pool_access.set_round_formal_player_access($1,true,$2,$3)',[collisionRound,reason,collisionOp]);await scalar('SELECT test_pool_access.set_round_formal_player_access($1,false,$2,$3)',[collisionRound,'后续已经关闭了模式',randomUUID()]);await player(superUser);snapshot=await get(collisionRound)
await rejects(()=>save(collisionRound,true,[fresh],snapshot.revision,collisionOp,reason),/OPERATION_CONFLICT/,'old owner receipt cannot silently skip requested current mode')
check((await get(collisionRound)).enabled,false,'collision leaves actual current mode intact')
// Failure after list/mode writes rolls back both audits and all configuration.
const atomicRound=await makeRound('最后审计失败全事务回滚');snapshot=await get(atomicRound)
await role();const atomicBefore=await scalar(business),atomicAudit=await scalar('SELECT count(*)::int FROM test_pool_access.round_formal_player_access_audit')
await db.exec("CREATE FUNCTION test_pool_access.fixture_abort_audience() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.reason='模拟最终审计失败回滚' THEN RAISE EXCEPTION 'INJECTED_AUDIENCE_FAILURE'; END IF; RETURN NEW; END$$;CREATE TRIGGER fixture_abort_audience BEFORE INSERT ON test_pool_access.audience_admin_operations FOR EACH ROW EXECUTE FUNCTION test_pool_access.fixture_abort_audience();")
await player(superUser);await rejects(()=>save(atomicRound,true,[fresh],snapshot.revision,randomUUID(),'模拟最终审计失败回滚'),/INJECTED_AUDIENCE_FAILURE/,'last write failure aborts list and scope changes')
await role();check(await scalar(business),atomicBefore,'atomic failure preserves every prior business/config/list row');check(await scalar('SELECT count(*)::int FROM test_pool_access.round_formal_player_access_audit'),atomicAudit,'atomic failure also rolls back nested operator audit')
await db.exec('DROP TRIGGER fixture_abort_audience ON test_pool_access.audience_admin_operations;DROP FUNCTION test_pool_access.fixture_abort_audience()')
// Active adjustment workers block changes even if the browser revision matches.
const busySession=await scalar("INSERT INTO public.match_sessions(round_id,algorithm,audit_reason) VALUES($1,'manual','范围并发保护测试') RETURNING id",[atomicRound]);await db.query("INSERT INTO matching_adjustment.operations(session_id,status,lease_expires_at) VALUES($1,'running',now()+interval '1 minute')",[busySession]);await player(superUser);snapshot=await get(atomicRound)
await rejects(()=>save(atomicRound,true,[fresh],snapshot.revision),/BUSY/,'active adjustment blocks audience edit');await role();await db.query('DELETE FROM matching_adjustment.operations WHERE session_id=$1',[busySession])
// No longer active administrators lose both read and recovery capability.
await db.exec('BEGIN');const boundAdmin=await scalar('SELECT id FROM public.members WHERE user_id=$1 LIMIT 1',[superUser]).catch(()=>null)
if(boundAdmin)await db.query("UPDATE public.members SET account_status='suspended' WHERE id=$1",[boundAdmin])
else await db.query("INSERT INTO public.members(id,user_id,account_status) VALUES($1,$2,'suspended')",[randomUUID(),superUser])
await player(superUser);await db.exec('SAVEPOINT blocked_read');await rejects(()=>get(round),/FORBIDDEN/,'inactive administrator cannot read audience');await db.exec('ROLLBACK TO SAVEPOINT blocked_read');await rejects(()=>receipt(op),/FORBIDDEN/,'inactive administrator cannot read operation');await db.exec('ROLLBACK');await role()
const hashRows=await db.query("SELECT oid::regprocedure::text signature,md5(prosrc) source_md5 FROM pg_proc WHERE oid IN('test_pool_access.set_round_formal_player_access(uuid,boolean,text,uuid)'::regprocedure,'private.test_account_round_allowed(uuid,uuid)'::regprocedure,'test_pool_access.get_my_test_round_ids()'::regprocedure)")
console.log(JSON.stringify({unchanged_dependencies:hashRows.rows}))
const postflight=(await db.exec(read('supabase/audits/round-audience-admin-postflight.sql'))).flatMap(r=>r.rows??[]).find(r=>r.verification)?.verification
check(postflight.status,'PASS','read-only administrator audience postflight passes')
console.log(`Round audience administrator audit: ${checks} checks passed; isolated PostgreSQL only.`)
await db.close()
