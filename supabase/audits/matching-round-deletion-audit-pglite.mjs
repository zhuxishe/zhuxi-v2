// Run the existing 48 real-SQL guards first, then this forward migration.
// All data below is synthetic; no Production network or credentials are used.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

export async function auditDeletionMetadata(db, { query, as, call, member, user, round, read }) {
  let passed = 0
  async function ok(name, fn) { await fn(); passed++; console.log('PASS audit/trash ' + name) }
  async function no(name, fn, message) { await assert.rejects(fn, e => e.message.includes(message), name); passed++; console.log('PASS audit/trash ' + name) }
  await db.exec(`ALTER TABLE public.admin_users ADD COLUMN email text, ADD COLUMN name text;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);`)
  await query("INSERT INTO public.admin_users(user_id,role,email,name) VALUES($1,'super_admin','contact-not-login@example.test','管理员原名'),($2,'super_admin','second-contact@example.test','第二管理员')",[user(10),user(12)])
  for (const n of [1,4,10,11,12]) await query('INSERT INTO auth.users VALUES($1,$2)',[user(n),`login-${n}@example.test`])
  await db.exec(read('supabase/migrations/20261010104253_matching_round_deletion_audit_trash.sql'))
  const remove = (n, operator='实际执行人', reason='移除重复创建的测试活动', actor=10, revision=0, name=`新版活动${n}`) =>
    call(actor,'admin_delete_match_round',[round(n),name,revision,operator,reason])
  const trash = (actor=10,limit=10,offset=0) => call(actor,'admin_list_deleted_match_rounds',[limit,offset])
  const audit = n => query('SELECT * FROM private.match_round_deletion_audit WHERE round_id=$1',[round(n)])
  const newRound = n => query(`INSERT INTO public.match_rounds(id,round_name,survey_start,survey_end,activity_start,activity_end,status,purpose,content_config)
    VALUES($1,$2,now()-interval '1 hour',now()+interval '1 day',current_date+2,current_date+2,'draft','registration','{}')`,[round(n),`新版活动${n}`])
  for (const n of [20,21,22]) await newRound(n)
  await ok('migration does not invent audit records for old deletions',async()=>assert.equal((await query('SELECT count(*)::integer AS n FROM private.match_round_deletion_audit'))[0].n,0))
  await no('old public three-argument deletion is blocked',()=>call(10,'admin_delete_match_round',[round(20),'新版活动20',0]),'ROUND_DELETE_AUDIT_REQUIRED')
  await no('old private three-argument deletion is blocked',()=>as(10,()=>query('SELECT private.admin_delete_match_round($1,$2,$3)',[round(20),'新版活动20',0])),'ROUND_DELETE_AUDIT_REQUIRED')
  await no('old core cannot be called directly by authenticated users',()=>as(10,()=>query('SELECT private.perform_match_round_deletion($1,$2,$3)',[round(20),'新版活动20',0])),'permission denied')
  for (const role of ['anon','service_role']) {
    await no(role+' cannot execute new deletion',()=>call(null,'admin_delete_match_round',[round(20),'新版活动20',0,'测试','测试原因'],role),'permission denied')
    await no(role+' cannot read trash RPC',()=>call(null,'admin_list_deleted_match_rounds',[10,0],role),'permission denied')
  }
  for (const actor of [1,11,4,null]) {
    await no('unauthorized delete actor '+actor,()=>remove(20,undefined,undefined,actor),'ROUND_DELETE_FORBIDDEN')
    await no('unauthorized trash actor '+actor,()=>trash(actor),'ROUND_DELETE_FORBIDDEN')
  }
  for (const operator of [null,'',' \t\n\u3000','名'.repeat(81)]) await no('invalid executor '+JSON.stringify(operator),()=>remove(20,operator),'ROUND_DELETE_OPERATOR_INVALID')
  for (const reason of [null,'','一',' \t\n\u3000','因'.repeat(501)]) await no('invalid reason '+JSON.stringify(reason),()=>remove(20,undefined,reason),'ROUND_DELETE_REASON_INVALID')
  await no('wrong name still rejected with valid audit fields',()=>remove(20,undefined,undefined,10,0,'错误名称'),'ROUND_DELETE_CONFIRMATION')
  await no('stale version still rejected with valid audit fields',()=>remove(20,undefined,undefined,10,99),'ROUND_DELETE_CHANGED')
  await no('matching history remains protected',()=>remove(2,undefined,undefined,10,0,'活动2'),'ROUND_DELETE_HAS_MATCHES')
  await no('invalidated feedback remains protected',()=>remove(4,undefined,undefined,10,0,'活动4'),'ROUND_DELETE_HAS_FEEDBACK')
  await no('resolved complaint remains protected',()=>remove(5,undefined,undefined,10,0,'活动5'),'ROUND_DELETE_HAS_FEEDBACK')
  await ok('rejected operations create no audit rows and do not mark deleted',async()=>{
    assert.equal((await audit(20)).length,0)
    assert.equal((await query('SELECT deleted_at FROM public.match_rounds WHERE id=$1',[round(20)]))[0].deleted_at,null)
  })
  await db.exec(`CREATE FUNCTION private.test_reject_deletion_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'TEST_AUDIT_WRITE_FAILED'; END$$;
    CREATE TRIGGER test_reject_deletion_audit BEFORE INSERT ON private.match_round_deletion_audit FOR EACH ROW EXECUTE FUNCTION private.test_reject_deletion_audit()`)
  await no('audit insert failure rolls back the deletion itself',()=>remove(21),'TEST_AUDIT_WRITE_FAILED')
  await db.exec('DROP TRIGGER test_reject_deletion_audit ON private.match_round_deletion_audit; DROP FUNCTION private.test_reject_deletion_audit()')
  await ok('failed audit left live round and no audit entry',async()=>{
    assert.equal((await query('SELECT deleted_at FROM public.match_rounds WHERE id=$1',[round(21)]))[0].deleted_at,null)
    assert.equal((await audit(21)).length,0)
  })
  await ok('audited deletion succeeds',async()=>assert.equal(await remove(20,' \t实际执行人\u3000','\n移除重复创建的测试活动\t'),true))
  const original=(await audit(20))[0]
  await ok('stored details are trimmed, timestamp generated and actual login email recorded',async()=>{
    assert.equal(original.operator_name,'实际执行人'); assert.equal(original.reason,'移除重复创建的测试活动')
    assert.equal(original.account_email_snapshot,'login-10@example.test');assert.equal(original.admin_name_snapshot,'管理员原名')
    assert.equal(original.auth_user_id_snapshot,user(10));assert.ok(original.admin_id_snapshot)
    const record=(await query('SELECT * FROM public.match_rounds WHERE id=$1',[round(20)]))[0]
    assert.deepEqual(original.deleted_at,record.deleted_at);assert.equal(original.round_name,record.round_name)
    assert.deepEqual(original.activity_start,record.activity_start);assert.deepEqual(original.activity_end,record.activity_end)
    assert.deepEqual(original.survey_end,record.survey_end);assert.equal(record.status,'closed')
  })
  await ok('retry by another valid super admin does not overwrite original audit',async()=>{
    assert.equal(await remove(20,'另一执行人','另一个删除原因',12,999),true)
    assert.deepEqual((await audit(20))[0],original)
  })
  await ok('legacy retry cannot fabricate missing names or reasons',async()=>{
    assert.equal(await remove(1,'现在填写的名字','不能追填以前的删除原因',10,0,'活动1'),true)
    assert.equal((await audit(1)).length,0)
  })
  await ok('trash clearly distinguishes old records and only returns display fields',async()=>{
    const data=await trash();assert.equal(data.total,4);assert.equal(data.items.length,4)
    const current=data.items.find(item=>item.id===round(20));const legacy=data.items.find(item=>item.id===round(1))
    assert.equal(current.legacy,false);assert.equal(current.deleted_admin_email,'login-10@example.test')
    assert.equal(current.executor_name,'实际执行人');assert.equal(current.reason,'移除重复创建的测试活动')
    assert.equal(legacy.legacy,true);assert.equal(legacy.executor_name,null);assert.equal(legacy.reason,null);assert.equal(legacy.deleted_admin_email,null)
    assert.deepEqual(Object.keys(current).sort(),['id','round_name','purpose','activity_start','activity_end','survey_end','deleted_at','deleted_admin_email','executor_name','reason','legacy'].sort())
    assert.ok(!JSON.stringify(data).includes(user(10)));assert.ok(!JSON.stringify(data).includes(original.admin_id_snapshot))
  })
  await ok('pagination keeps total count and stable order',async()=>{
    const first=await trash(10,1,0);const second=await trash(10,1,1)
    assert.equal(first.total,4);assert.equal(first.items.length,1);assert.equal(first.items[0].id,round(20))
    assert.equal(second.total,4);assert.equal(second.items.length,1);assert.notEqual(first.items[0].id,second.items[0].id)
    assert.deepEqual((await trash(10,10,99)).items,[])
  })
  for (const [limit,offset] of [[0,0],[101,0],[null,0],[10,-1],[10,null],[10,1000001]]) await no('invalid pagination '+limit+','+offset,()=>trash(10,limit,offset),'ROUND_TRASH_PAGINATION_INVALID')
  await ok('trash RPC is usable in read-only transactions',async()=>{
    await db.exec('BEGIN READ ONLY; SET LOCAL ROLE authenticated')
    try {
      await query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user(10)])
      assert.equal((await query('SELECT public.admin_list_deleted_match_rounds(10,0) AS result'))[0].result.total,4)
      await db.exec('COMMIT')
    } catch(error) {await db.exec('ROLLBACK');throw error}
  })
  for (const role of ['authenticated','anon','service_role']) {
    await no(role+' cannot read audit table directly',()=>as(10,()=>query('SELECT * FROM private.match_round_deletion_audit'),role),'permission denied')
    await no(role+' cannot rewrite audit table directly',()=>as(10,()=>query("UPDATE private.match_round_deletion_audit SET reason='篡改'"),role),'permission denied')
  }
  await no('audit rows are immutable even to maintenance SQL update',()=>query("UPDATE private.match_round_deletion_audit SET reason='修改原因' WHERE round_id=$1",[round(20)]),'ROUND_DELETE_AUDIT_IMMUTABLE')
  await no('audit rows cannot be removed by maintenance SQL delete',()=>query('DELETE FROM private.match_round_deletion_audit WHERE round_id=$1',[round(20)]),'ROUND_DELETE_AUDIT_IMMUTABLE')
  await no('audited round cannot be hard deleted',()=>query('DELETE FROM public.match_rounds WHERE id=$1',[round(20)]),'foreign key constraint')
  await no('missing actual Auth account is rejected',async()=>{
    await query('DELETE FROM auth.users WHERE id=$1',[user(12)])
    await remove(21,undefined,undefined,12)
  },'ROUND_DELETE_FORBIDDEN')
  await no('missing actual Auth account cannot list trash',()=>trash(12),'ROUND_DELETE_FORBIDDEN')
  await query('INSERT INTO auth.users VALUES($1,$2)',[user(12),'restored-login-12@example.test'])
  await ok('maximum character counts are accepted',async()=>assert.equal(await remove(22,'名'.repeat(80),'因'.repeat(500)),true))
  await ok('v boundary letters are not removed by whitespace trimming',async()=>{
    await newRound(24);assert.equal(await remove(24,'vanv','v理由v'),true)
    const row=(await audit(24))[0];assert.equal(row.operator_name,'vanv');assert.equal(row.reason,'v理由v')
  })
  await ok('Unicode characters counted consistently',async()=>{
    await newRound(23);assert.equal(await remove(23,'😀'.repeat(80),'因'.repeat(2)),true)
  })
  await ok('account and administrator rename does not rewrite historical snapshots',async()=>{
    await query("UPDATE auth.users SET email='changed@example.test' WHERE id=$1",[user(10)])
    await query("UPDATE public.admin_users SET name='管理员新名',email='changed-contact@example.test' WHERE user_id=$1",[user(10)])
    assert.deepEqual((await audit(20))[0],original)
    assert.equal((await trash()).items.find(item=>item.id===round(20)).deleted_admin_email,'login-10@example.test')
  })
  await ok('removing the deleting admin preserves immutable audit snapshots',async()=>{
    await query('DELETE FROM public.admin_users WHERE user_id=$1',[user(10)])
    assert.equal((await query('SELECT deleted_by FROM public.match_rounds WHERE id=$1',[round(20)]))[0].deleted_by,null)
    assert.deepEqual((await audit(20))[0],original)
    assert.equal((await trash(12)).items.find(item=>item.id===round(20)).deleted_admin_email,'login-10@example.test')
  })
  await ok('all exposed wrappers are invoker and private implementations are guarded',async()=>{
    const rows=await query("SELECT n.nspname,p.proname,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname IN('admin_delete_match_round','admin_list_deleted_match_rounds','perform_match_round_deletion')")
    assert.ok(rows.filter(row=>row.nspname==='public').every(row=>!row.prosecdef))
    assert.ok(rows.every(row=>row.proconfig.includes('search_path=\"\"')))
    for (const role of ['anon','service_role','authenticated']) assert.equal((await query("SELECT has_function_privilege($1,'private.perform_match_round_deletion(uuid,text,integer)','EXECUTE') AS allowed",[role]))[0].allowed,false)
  })
  await ok('new read-only postflight passes',()=>db.exec(read('supabase/audits/matching-round-deletion-audit-postflight.sql')))
  console.log(`All ${passed} additional deletion audit/trash PostgreSQL checks passed`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./matching-round-delete-pglite.mjs',import.meta.url))],{
    stdio:'inherit',env:{...process.env,MATCH_ROUND_DELETE_AUDIT_EXTENSION:pathToFileURL(fileURLToPath(import.meta.url)).href}
  })
  process.exit(result.status ?? 1)
}
