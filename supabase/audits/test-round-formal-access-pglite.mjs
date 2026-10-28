// Real SQL in isolated PostgreSQL. No credentials, network, or live account writes.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
process.env.TEST_ROUND_FORMAL_ACCESS_SUITE='1'
const {testPoolAuditContext:ctx}=await import('./test-account-pool-pglite.mjs')
const {db,scalar,role,read,accounts,real,formal,round,ids,outsider,outsiderUser,server,player,superAdmin}=ctx
let checks=0
const check=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++}
const rejects=async(work,pattern,label)=>{await assert.rejects(work,pattern,label);checks++}
const invoke=(target,enabled,reason='按管理员授权开放本轮正式玩家',operation=randomUUID())=>scalar('SELECT test_pool_access.set_round_formal_player_access($1,$2,$3,$4)',[target,enabled,reason,operation])
const businessSql=`SELECT jsonb_build_object('members',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.members x),'submissions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.match_round_submissions x),'results',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.match_results x),'sessions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.match_sessions x),'rounds',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.match_rounds x),'notifications',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.community_notifications x),'allowlist',(SELECT jsonb_agg(to_jsonb(x) ORDER BY round_id,member_id) FROM private.test_round_members x))`
const preservedFunctionsSql=`SELECT jsonb_object_agg(oid::regprocedure::text,md5(prosrc)) FROM pg_proc WHERE oid IN('public.get_my_test_round_ids()'::regprocedure,'private.test_round_visible_to_current_user(uuid)'::regprocedure,'test_pool_access.test_round_visible_to_current_user(uuid)'::regprocedure,'private.test_round_same_domain(uuid,uuid)'::regprocedure,'matching_publication.can_read_result(uuid)'::regprocedure)`
await role()
const baseline=await scalar(businessSql),functions=await scalar(preservedFunctionsSql)
const metadata=await scalar("SELECT jsonb_object_agg(oid::regprocedure::text,jsonb_build_object('owner',proowner,'acl',proacl::text,'definer',prosecdef,'path',proconfig::text)) FROM pg_proc WHERE oid IN('private.test_account_round_allowed(uuid,uuid)'::regprocedure,'test_pool_access.get_my_test_round_ids()'::regprocedure)")
await db.exec(read('supabase/migrations/20261028134535_test_round_formal_player_access.sql'))
check(await scalar(businessSql),baseline,'migration does not rewrite any existing business record or notify')
check(await scalar(preservedFunctionsSql),functions,'public wrappers, visibility wrapper, same-domain history and own-result predicate unchanged')
check(await scalar("SELECT jsonb_object_agg(oid::regprocedure::text,jsonb_build_object('owner',proowner,'acl',proacl::text,'definer',prosecdef,'path',proconfig::text)) FROM pg_proc WHERE oid IN('private.test_account_round_allowed(uuid,uuid)'::regprocedure,'test_pool_access.get_my_test_round_ids()'::regprocedure)"),metadata,'changed predicates retain owner ACL definer and safe search_path')
check(await scalar("SELECT strpos(pg_get_functiondef('public.admin_configure_test_round(uuid,uuid,uuid[],text)'::regprocedure),'FOR UPDATE;') < strpos(pg_get_functiondef('public.admin_configure_test_round(uuid,uuid,uuid[],text)'::regprocedure),'TEST_ROUND_DYNAMIC_AUDIENCE_ACTIVE')"),true,'legacy audience check runs after the shared round row lock')
check(await scalar('SELECT count(*)::int FROM test_pool_access.round_formal_player_access'),0,'installation opens no rounds')
check(await scalar('SELECT count(*)::int FROM test_pool_access.round_formal_player_access_audit'),0,'installation creates no operator actions')
for(const apiRole of ['anon','authenticated','service_role']){
 check(await scalar("SELECT has_function_privilege($1,'test_pool_access.set_round_formal_player_access(uuid,boolean,text,uuid)','EXECUTE')",[apiRole]),false,`${apiRole} cannot execute setter`)
 for(const table of ['round_formal_player_access','round_formal_player_access_audit'])check(await scalar('SELECT has_table_privilege($1,$2,\'SELECT,INSERT,UPDATE,DELETE\')',[apiRole,'test_pool_access.'+table]),false,`${apiRole} has no table access`)
 await role(apiRole)
 await rejects(()=>invoke(round,true),/permission denied/,`${apiRole} actual invocation denied`)
 await role()
}
check(await scalar("SELECT NOT prosecdef FROM pg_proc WHERE oid='test_pool_access.set_round_formal_player_access(uuid,boolean,text,uuid)'::regprocedure"),true,'setter cannot elevate a caller')
await player(outsiderUser);check(await scalar('SELECT public.get_my_test_round_ids()'),[],'default still hides this test round from normal outsider')
await role();await rejects(()=>invoke(formal,true),/ROUND_UNAVAILABLE/,'formal round cannot acquire test audience setting');await rejects(()=>invoke(round,true,'短'),/INPUT_INVALID/,'reason required');await rejects(()=>invoke(round,null),/INPUT_INVALID/,'boolean required')
const fingerprint=await scalar(businessSql),op=randomUUID()
const enabled=await invoke(round,true,'允许所有正常正式玩家报名本期测试',op)
check([enabled.enabled,enabled.previous_enabled,enabled.changed,enabled.already_applied],[true,false,true,false],'enable returns a concrete receipt')
check([enabled.database_session_user,enabled.database_effective_user],['postgres','postgres'],'receipt records actual DB identities')
check(await scalar(businessSql),fingerprint,'opening changes no existing members, answers, matches, notifications or explicit allowlist')
check((await invoke(round,true,'允许所有正常正式玩家报名本期测试',op)).already_applied,true,'identical retry returns original receipt')
check(await scalar('SELECT count(*)::int FROM test_pool_access.round_formal_player_access_audit'),1,'identical retry creates no extra audit')
await rejects(()=>invoke(round,false,'允许所有正常正式玩家报名本期测试',op),/OPERATION_CONFLICT/,'operation cannot reverse original action')
await rejects(()=>invoke(round,true,'换一个不同的理由',op),/OPERATION_CONFLICT/,'operation cannot be reused with a different reason')
await rejects(()=>db.query('UPDATE test_pool_access.round_formal_player_access_audit SET enabled=false WHERE operation_id=$1',[op]),/AUDIT_IMMUTABLE/,'audit updates denied even to owner')
await rejects(()=>db.query('DELETE FROM test_pool_access.round_formal_player_access_audit WHERE operation_id=$1',[op]),/AUDIT_IMMUTABLE/,'audit deletion denied even to owner')
await rejects(()=>db.exec('TRUNCATE test_pool_access.round_formal_player_access_audit'),/AUDIT_IMMUTABLE/,'audit truncate denied even to owner')
check(await scalar('SELECT private.test_account_round_allowed($1,$2)',[round,outsider]),true,'normal formal outsider is admitted without allowlist insertion')
check(await scalar('SELECT count(*)::int FROM private.test_round_members WHERE round_id=$1',[round]),33,'original33-person allowlist is untouched')
await player(outsiderUser);check(await scalar('SELECT public.get_my_test_round_ids()'),[round],'normal account sees opened test round through actual authenticated RPC')
check(await scalar('SELECT count(*)::int FROM public.match_rounds WHERE id=$1',[round]),1,'actual restrictive RLS permits opened round')
check(await scalar('SELECT count(*)::int FROM public.match_results r JOIN public.match_sessions s ON s.id=r.session_id WHERE s.round_id=$1',[round]),0,'opening round does not reveal another member results')
await role();check(await scalar('SELECT private.test_account_round_allowed($1,$2)',[formal,outsider]),true,'formal round rule unchanged')
check(await scalar('SELECT private.test_account_round_allowed($1,$2)',[formal,accounts[0].id]),false,'TST still excluded from formal round')
await player(accounts[0].user);check(await scalar('SELECT public.get_my_test_round_ids()'),[round],'existing allowed TST retains scope')
await role();await db.exec('BEGIN');await db.query('DELETE FROM private.test_round_members WHERE round_id=$1 AND member_id=$2',[round,accounts[0].id]);check(await scalar('SELECT private.test_account_round_allowed($1,$2)',[round,accounts[0].id]),false,'open-to-formal mode cannot admit an unlisted TST');await player(accounts[0].user);check((await scalar('SELECT public.get_my_test_round_ids()')).includes(round),false,'unlisted TST also excluded through own RPC');await role();await db.exec('ROLLBACK')
await role()
const otherRound=await scalar("INSERT INTO public.match_rounds(round_name) VALUES('另一限定测试轮次') RETURNING id")
// One TST was retired by the parent suite. Set up this second fake round using
// its legitimate existing private write context, without reviving that identity.
await role();await db.exec('BEGIN');await db.query('INSERT INTO private.test_pool_write_context VALUES(txid_current(),pg_backend_pid(),$1)',[otherRound]);await db.query('UPDATE public.match_rounds SET is_test=true WHERE id=$1',[otherRound]);await db.query('DELETE FROM private.test_pool_write_context WHERE round_id=$1',[otherRound]);await db.exec('COMMIT')
check(await scalar('SELECT private.test_account_round_allowed($1,$2)',[otherRound,outsider]),false,'other test round remains closed to normal outsider')
check(await scalar('SELECT private.test_account_round_allowed($1,$2)',[otherRound,accounts[0].id]),false,'TST without explicit membership is not automatically admitted')
await player(outsiderUser);check(await scalar('SELECT public.get_my_test_round_ids()'),[round],'RPC cannot discover other test round')
await role('anon');await db.exec("SELECT set_config('request.jwt.claim.sub','',false)");await rejects(()=>scalar('SELECT public.get_my_test_round_ids()'),/permission denied/,'anon still cannot use own-test-round RPC');check(await scalar('SELECT private.test_round_visible_to_current_user($1)',[round]),false,'anonymous remains unable to discover opened round')
await role()
const freshUser=randomUUID(),fresh=randomUUID();await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[freshUser,'new-formal@example.invalid']);await db.query('INSERT INTO public.members(id,user_id) VALUES($1,$2)',[fresh,freshUser]);await db.query("INSERT INTO public.member_identity(member_id,full_name) VALUES($1,'新的正常正式玩家')",[fresh])
check(await scalar('SELECT private.test_account_round_allowed($1,$2)',[round,fresh]),true,'newly eligible account is admitted dynamically')
for(const [column,value] of [['status','pending'],['account_status','suspended'],['record_scope','legacy'],['membership_type','staff'],['user_id',null],['anonymized_at','2026-10-28T00:00:00Z']]){
 await db.exec('BEGIN')
 try{await db.query(`UPDATE public.members SET ${column}=$2 WHERE id=$1`,[fresh,value]);check(await scalar('SELECT private.test_account_round_allowed($1,$2)',[round,fresh]),false,`dynamic admission rejects ${column}=${value}`);await player(freshUser);check((await scalar('SELECT public.get_my_test_round_ids()')).includes(round),false,`authenticated RPC rejects ${column}=${value}`);await role()}finally{await db.exec('ROLLBACK')}
}
await player(freshUser);check((await scalar('SELECT public.get_my_test_round_ids()')).includes(round),true,'new formal account sees target through own RPC')
await role();await db.exec('BEGIN');await db.query("UPDATE public.match_rounds SET status='closed',survey_end=now()-interval '1 day' WHERE id=$1",[round]);await player(freshUser);check((await scalar('SELECT public.get_my_test_round_ids()')).includes(round),true,'closing signup does not hide historical test round access');check(await scalar("SELECT count(*)::int FROM public.match_rounds WHERE id=$1 AND status='open' AND survey_start<=now() AND survey_end>now()",[round]),0,'closed signup still absent from actionable activity list');await role();await db.exec('ROLLBACK')
// The parent fixture deliberately retains an old off-list peer roster row.
// It must also prevent a destructive close; a clean independent round can close.
await rejects(()=>invoke(round,false,'旧参与记录也需要保留访问'),/PARTICIPANTS_EXIST/,'existing off-list peer roster prevents destructive close')
await invoke(otherRound,true)
check((await invoke(otherRound,false,'尚无人新增报名暂时关闭')).enabled,false,'safe close succeeds before any off-list participation')
check(await scalar('SELECT private.test_account_round_allowed($1,$2)',[otherRound,outsider]),false,'safe close restores original allowlist-only policy')
await server();await rejects(()=>scalar("SELECT public.admin_configure_test_round($1,$2,$3,'旧固定名单入口尝试覆盖')",[superAdmin,round,ids]),/DYNAMIC_AUDIENCE_ACTIVE/,'old fixed33 initializer refuses active dynamic audience')
await role()
// Use the unchanged actual self-read/self-insert policies for the participation test.
const master=read('supabase/migrations/20260829175645_user_member_master_v1.sql')
for(const name of ['member_master_round_submissions_active_self_read','member_master_round_submissions_active_self_insert']){const start=master.indexOf('CREATE POLICY '+name+'\n');const end=master.indexOf('\n  );',start);assert.ok(start>=0&&end>start);await db.exec(master.slice(start,end+5))}
await db.exec('ALTER TABLE public.match_round_submissions ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT ON public.match_round_submissions TO authenticated;')
await player(outsiderUser);await db.query('INSERT INTO public.match_round_submissions(round_id,member_id) VALUES($1,$2)',[round,outsider]);check(await scalar('SELECT count(*)::int FROM public.match_round_submissions WHERE round_id=$1',[round]),1,'new participant reads only own answer despite opened test round')
await rejects(()=>db.query('INSERT INTO public.match_round_submissions(round_id,member_id) VALUES($1,$2)',[round,fresh]),/row-level security/,'cannot submit as another normal player')
await role();await rejects(()=>invoke(round,false,'不能让新增参与者失去历史'),/PARTICIPANTS_EXIST/,'close rejected after off-list participant has an answer')
check(await scalar('SELECT enabled FROM test_pool_access.round_formal_player_access WHERE round_id=$1',[round]),true,'failed close preserves the open setting')
await db.exec('BEGIN');await db.query('UPDATE public.match_round_submissions SET cancelled_at=now() WHERE round_id=$1 AND member_id=$2',[round,outsider]);await rejects(()=>invoke(round,false,'取消过的参与也必须保留历史'),/PARTICIPANTS_EXIST/,'cancelled answers also prevent destructive close');await db.exec('ROLLBACK')
const targetSession=await scalar('SELECT id FROM public.match_sessions WHERE round_id=$1 LIMIT 1',[round]);await db.query("INSERT INTO matching_adjustment.operations(session_id,status,lease_expires_at) VALUES($1,'running',now()+interval '1 minute')",[targetSession]);await rejects(()=>invoke(round,true,'并发调整时不改开放范围'),/BUSY/,'active adjustment blocks audience operation');await db.query('DELETE FROM matching_adjustment.operations WHERE session_id=$1',[targetSession])
// Isolate each retained-participation source in its own otherwise-empty round.
const cleanRound=async(label)=>{
 await role();const id=await scalar('INSERT INTO public.match_rounds(round_name) VALUES($1) RETURNING id',[label]);
 await db.exec('BEGIN');await db.query('INSERT INTO private.test_pool_write_context VALUES(txid_current(),pg_backend_pid(),$1)',[id]);await db.query('UPDATE public.match_rounds SET is_test=true WHERE id=$1',[id]);await db.query('DELETE FROM private.test_pool_write_context WHERE round_id=$1',[id]);await db.exec('COMMIT');await invoke(id,true);return id
}
for(const kind of ['answer','cancelled_answer','published_unmatched','diagnostic','matched_result']){
 const target=await cleanRound('独立保留来源 '+kind)
 let result=null,session=null
 if(kind==='answer'||kind==='cancelled_answer')await db.query('INSERT INTO public.match_round_submissions(round_id,member_id,cancelled_at) VALUES($1,$2,$3)',[target,outsider,kind==='cancelled_answer'?new Date().toISOString():null])
 if(kind==='published_unmatched'){
  const publication=await scalar("INSERT INTO matching_publication.publications(session_id,round_id,version,round_name,reason) VALUES($1,$2,1,'会话已不存在的历史','隔离历史保护验证') RETURNING id",[randomUUID(),target]);
  await db.query("INSERT INTO matching_publication.roster(publication_id,member_id,outcome) VALUES($1,$2,'unmatched')",[publication,outsider])
 }
 if(kind==='diagnostic'||kind==='matched_result'){
  session=await scalar("INSERT INTO public.match_sessions(round_id,algorithm,total_candidates,total_matched,audit_reason) VALUES($1,'manual',2,2,'隔离参与记录保护') RETURNING id",[target])
  if(kind==='diagnostic')await db.query("INSERT INTO public.unmatched_diagnostics(session_id,member_id,reason) VALUES($1,$2,'unmatched_after_all_stages')",[session,outsider])
  else result=await scalar("INSERT INTO public.match_results(session_id,member_a_id,member_b_id,audit_reason) VALUES($1,$2,$3,'隔离真实结果读取权限') RETURNING id",[session,outsider,real[0].id])
 }
 await rejects(()=>invoke(target,false,'独立来源不能因关闭失去历史'),/PARTICIPANTS_EXIST/,`off-list ${kind} alone prevents destructive close`)
 check(await scalar('SELECT enabled FROM test_pool_access.round_formal_player_access WHERE round_id=$1',[target]),true,`${kind} rejected close keeps enabled`)
 if(result){
  await db.exec('BEGIN');await db.query("INSERT INTO matching_publication.write_context VALUES(txid_current(),pg_backend_pid(),$1,'fixture')",[session]);await db.query("UPDATE public.match_results SET status='confirmed',publication_version=1 WHERE id=$1",[result]);await db.query("UPDATE public.match_sessions SET status='confirmed',publication_version=1,published_at=now() WHERE id=$1",[session]);await db.query('DELETE FROM matching_publication.write_context WHERE session_id=$1',[session]);await db.exec('COMMIT')
  await player(outsiderUser);check(await scalar('SELECT count(*)::int FROM public.match_results WHERE id=$1',[result]),1,'actual participant can read a confirmed current result after open audience')
  await player(freshUser);check((await scalar('SELECT public.get_my_test_round_ids()')).includes(target),true,'bystander has round visibility');check(await scalar('SELECT count(*)::int FROM public.match_results WHERE id=$1',[result]),0,'bystander cannot read another confirmed current result despite round visibility');await role()
 }
}
const postflight=(await db.exec(read('supabase/audits/test-round-formal-access-postflight.sql'))).flatMap(r=>r.rows??[]).find(r=>r.verification)?.verification
check(postflight.status,'PASS','read-only structural postflight passes')
console.log(`Test round formal player audience audit: ${checks} checks passed; isolated PGlite only.`)
await db.close()
