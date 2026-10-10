// Executes the real migration and existing write/RPC guards against synthetic
// PostgreSQL fixtures. Never connects to Production or reads real user data.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(root + path, 'utf8')
const db = new PGlite()
const member = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const user = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const round = n => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`
function extract(source, name) {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${name}`)
  const end = source.indexOf('$function$;', start)
  assert.ok(start >= 0 && end >= 0, name)
  return source.slice(start, end + '$function$;'.length)
}
const master = read('supabase/migrations/20260829175645_user_member_master_v1.sql')
const query = async (sql, args = []) => (await db.query(sql, args)).rows
async function as(n, operation, role = 'authenticated') {
  await db.exec('BEGIN')
  try {
    await db.exec(`SET LOCAL ROLE ${role}`)
    await query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)", [n ? user(n) : '', role])
    const value = await operation()
    await db.exec('COMMIT')
    return value
  } catch (error) { await db.exec('ROLLBACK'); throw error }
}
const call = (actor, name, args = [], role = 'authenticated') => as(actor, async () =>
  (await query(`SELECT public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) AS result`, args))[0].result, role)
const remove = (n, actor = 10, name = `活动${n}`, revision = 0) => call(actor, 'admin_delete_match_round', [round(n), name, revision])
let passed = 0
async function ok(name, operation) { await operation(); passed++; console.log('PASS ' + name) }
async function no(name, operation, message) {
  await assert.rejects(operation, error => error.message.includes(message), name)
  passed++; console.log('PASS ' + name)
}
try {
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('role',current_setting('request.jwt.claim.role',true))$$;
    CREATE TABLE public.admin_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,role text);
    CREATE TABLE public.members(id uuid PRIMARY KEY,user_id uuid,status text,account_status text,anonymized_at timestamptz,membership_type text DEFAULT 'player');
    CREATE TABLE public.member_identity(member_id uuid PRIMARY KEY REFERENCES public.members,full_name text,nickname text);
    CREATE TABLE public.match_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE FUNCTION public.update_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at=now(); RETURN NEW; END$$;
    GRANT USAGE ON SCHEMA public,auth,private TO anon,authenticated,service_role;
  `)
  await db.exec(read('supabase/migrations/026_security_hardening.sql'))
  await db.exec(read('supabase/migrations/018_matching_rounds.sql'))
  await db.exec(read('supabase/migrations/035_match_round_import_metadata.sql'))
  await db.exec('ALTER TABLE public.match_round_submissions ADD COLUMN audit_reason text, ADD COLUMN cancelled_at timestamptz')
  for (const name of ['private.member_master_is_admin()', 'private.member_master_is_super_admin()', 'private.member_master_current_admin_id()',
    'private.member_master_lock_non_anonymized_subjects(', 'private.member_master_guard_round_submission_write()',
    'private.member_master_guard_anonymized_dependent_write()', 'public.admin_anonymize_member(']) await db.exec(extract(master, name))
  await db.exec(extract(read('supabase/migrations/20260831234821_fix_member_readonly_authorization_lock.sql'), 'private.profile_current_approved_member_id()'))
  await db.exec(extract(read('supabase/migrations/20260830174115_fix_operational_audit_trigger_record_scope.sql'), 'private.member_master_capture_operational_audit_reason()'))
  await db.exec(master.slice(master.indexOf('DROP POLICY IF EXISTS player_read_open_rounds ON public.match_rounds;'),
    master.indexOf('CREATE OR REPLACE FUNCTION private.member_master_guard_round_submission_write()')))
  await db.exec(`
    DROP POLICY admin_all_submissions ON public.match_round_submissions;
    CREATE POLICY member_master_round_submissions_admin_audited_write ON public.match_round_submissions FOR ALL TO authenticated
      USING (private.member_master_is_super_admin()) WITH CHECK (private.member_master_is_super_admin());
    CREATE TRIGGER member_master_capture_audit_reason BEFORE INSERT OR UPDATE OR DELETE ON public.match_round_submissions
      FOR EACH ROW EXECUTE FUNCTION private.member_master_capture_operational_audit_reason();
    CREATE TRIGGER member_master_guard_anonymized_write BEFORE INSERT OR UPDATE ON public.match_round_submissions
      FOR EACH ROW EXECUTE FUNCTION private.member_master_guard_anonymized_dependent_write();
    CREATE TRIGGER member_master_guard_round_submission_write BEFORE INSERT OR UPDATE ON public.match_round_submissions
      FOR EACH ROW EXECUTE FUNCTION private.member_master_guard_round_submission_write();
    GRANT SELECT ON public.members,public.admin_users TO authenticated;
    GRANT SELECT,INSERT,UPDATE ON public.match_rounds,public.match_round_submissions,public.match_sessions TO authenticated;
    GRANT ALL ON public.match_rounds,public.match_round_submissions,public.match_sessions TO service_role;
    CREATE TABLE public.mutual_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),overall_score numeric);
    CREATE TABLE public.member_dynamic_stats(member_id uuid PRIMARY KEY,avg_review_score numeric);
    CREATE TABLE private.member_profile_metrics(member_id uuid PRIMARY KEY,compatibility_score numeric);
    CREATE FUNCTION public.admin_preflight_member_lifecycle(p_member_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
      SELECT jsonb_build_object('member_id',p_member_id,'can_hard_delete',true,'counts','{}'::jsonb)$$;
  `)
  await db.exec(read('supabase/migrations/20260929120921_matching_content_editor.sql'))
  await db.exec(extract(read('supabase/migrations/20260929153531_registration_cancellation.sql'), 'private.guard_registration_cancellation()'))
  await db.exec(`CREATE TRIGGER member_master_guard_registration_cancellation BEFORE INSERT OR UPDATE ON public.match_round_submissions
    FOR EACH ROW EXECUTE FUNCTION private.guard_registration_cancellation()`)
  await db.exec(read('supabase/migrations/20260929153645_registration_operation.sql'))
  await db.exec(read('supabase/migrations/20261002165912_round_peer_reviews.sql'))
  await db.exec(read('supabase/migrations/20261003042356_peer_review_history_and_pending_report_edits.sql'))
  const acl = async () => query(`SELECT r.role,c.relname,has_table_privilege(r.role,c.oid,'SELECT') AS read,
    has_table_privilege(r.role,c.oid,'INSERT') AS create,has_table_privilege(r.role,c.oid,'UPDATE') AS edit,
    has_table_privilege(r.role,c.oid,'DELETE') AS erase FROM pg_class c CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) r(role)
    WHERE c.oid IN ('public.match_rounds'::regclass,'public.match_round_submissions'::regclass) ORDER BY r.role,c.relname`)
  const originalAcl = await acl()
  await db.exec(read('supabase/migrations/20261010101614_matching_round_soft_delete.sql'))
  await ok('migration does not expand table grants', async () => assert.deepEqual(await acl(), originalAcl))
  for (let n = 1; n <= 4; n++) await query("INSERT INTO public.members(id,user_id,status,account_status) VALUES($1,$2,'approved','active')", [member(n), user(n)])
  await query("INSERT INTO public.admin_users(user_id,role) VALUES($1,'super_admin'),($2,'admin'),($3,'super_admin')", [user(10), user(11), user(4)])
  await query("UPDATE public.members SET account_status='suspended' WHERE id=$1", [member(4)])
  const event = (await query("SELECT (now()+interval '2 days')::text AS start,(now()+interval '2 days 3 hours')::text AS end"))[0]
  const registrationConfig = { eventStart: new Date(event.start).toISOString(), eventEnd: new Date(event.end).toISOString(),
    location: { zh: '东京' }, questions: [{ id: 'note', type: 'text', required: true, label: { zh: '备注' }, options: [] }] }
  for (let n = 1; n <= 9; n++) await query(`INSERT INTO public.match_rounds(id,round_name,survey_start,survey_end,activity_start,activity_end,status,purpose,content_config)
    VALUES($1,$2,now()-interval '2 days',now()+interval '1 day',current_date+1,current_date+2,$3,$4,$5)`,
  [round(n), `活动${n}`, n === 3 ? 'matched' : n === 6 ? 'draft' : 'open', [1,4,5,7,9].includes(n) ? 'registration' : n === 6 ? 'announcement' : 'matching',
    JSON.stringify([1,4,5,7,9].includes(n) ? registrationConfig : {})])
  const signup = (n, actor = 1) => call(actor, 'manage_my_registration', [round(n), 'create', null, 0, { note: '保留已有报名答案' }])
  await signup(1)
  const times = [new Date(Date.now() - 60_000).toISOString(), new Date(Date.now() + 3_600_000).toISOString()]
  for (const n of [1,4,5,9]) {
    await call(10, 'admin_save_round_peer_review_settings', [round(n), false, ...times, 0, '创建用于现场互评的名册'])
    await call(10, 'admin_confirm_round_peer_review_roster', [round(n), [member(1), member(2)], 1, '核对实际到场的两位玩家'])
    await call(10, 'admin_save_round_peer_review_settings', [round(n), true, ...times, 2, '开放活动参与者的互相评价'])
  }
  await query('INSERT INTO public.match_sessions(round_id) VALUES($1)', [round(2)])
  const review = await call(1, 'player_save_round_peer_review', [round(4), member(2), 4.5, '测试评价', 0])
  await call(10, 'admin_moderate_round_peer_review', [review.id, false, review.version, '已失效的评价仍保留原始历史'])
  const report = await call(1, 'player_save_round_peer_report', [round(5), member(2), 'other', '保留活动现场问题的完整事实描述', 0])
  await call(10, 'admin_resolve_round_peer_report', [report.id, 'resolved', '审核完成', report.version, '已处理的举报仍保留审核历史'])
  const baseline = await query(`SELECT (SELECT count(*) FROM public.match_round_submissions)::integer AS signups,
    (SELECT count(*) FROM private.round_peer_review_participants)::integer AS roster,
    (SELECT count(*) FROM private.round_peer_reviews)::integer AS reviews,(SELECT count(*) FROM private.round_peer_reports)::integer AS reports`)
  await no('anonymous cannot call delete RPC', () => call(null, 'admin_delete_match_round', [round(1), '活动1', 0], 'anon'), 'permission denied')
  await no('service role is not a human deletion API', () => call(null, 'admin_delete_match_round', [round(1), '活动1', 0], 'service_role'), 'permission denied')
  await no('player cannot delete a round', () => remove(1, 1), 'ROUND_DELETE_FORBIDDEN')
  await no('ordinary administrator cannot delete', () => remove(1, 11), 'ROUND_DELETE_FORBIDDEN')
  await no('suspended linked super administrator cannot delete', () => remove(1, 4), 'ROUND_DELETE_FORBIDDEN')
  await no('missing identity cannot delete', () => remove(1, null), 'ROUND_DELETE_FORBIDDEN')
  await no('round name confirmation must match exactly', () => remove(1, 10, '活动1 '), 'ROUND_DELETE_CONFIRMATION')
  await no('stale editor revision cannot delete changed content', () => remove(1, 10, '活动1', 99), 'ROUND_DELETE_CHANGED')
  await no('missing expected revision rejected', () => remove(1, 10, '活动1', null), 'ROUND_DELETE_CHANGED')
  await no('unknown round rejected', () => remove(999), 'ROUND_NOT_FOUND')
  await no('round with any session cannot delete', () => remove(2), 'ROUND_DELETE_HAS_MATCHES')
  await no('matched status alone prevents deletion', () => remove(3), 'ROUND_DELETE_HAS_MATCHES')
  await no('invalidated review still prevents deletion', () => remove(4), 'ROUND_DELETE_HAS_FEEDBACK')
  await no('resolved report still prevents deletion', () => remove(5), 'ROUND_DELETE_HAS_FEEDBACK')
  await no('direct update cannot forge a deletion marker', () => as(10, () => query('UPDATE public.match_rounds SET deleted_at=now(),deleted_by=(SELECT id FROM public.admin_users WHERE user_id=auth.uid()),status=\'closed\' WHERE id=$1', [round(1)])), 'ROUND_DELETE_FORBIDDEN')
  await ok('round with signup and confirmed roster can be removed', async () => assert.equal(await remove(1), true))
  await ok('draft announcement can be removed', async () => assert.equal(await remove(6), true))
  await ok('unused matching round can be removed', async () => assert.equal(await remove(8), true))
  await ok('successful deletion retry is idempotent', async () => assert.equal(await remove(1), true))
  await ok('deletion retains answers, roster, reviews and reports', async () => {
    assert.deepEqual(await query(`SELECT (SELECT count(*) FROM public.match_round_submissions)::integer AS signups,
      (SELECT count(*) FROM private.round_peer_review_participants)::integer AS roster,
      (SELECT count(*) FROM private.round_peer_reviews)::integer AS reviews,(SELECT count(*) FROM private.round_peer_reports)::integer AS reports`), baseline)
    assert.deepEqual((await query('SELECT custom_answers FROM public.match_round_submissions WHERE round_id=$1', [round(1)]))[0].custom_answers, { note: '保留已有报名答案' })
    const deleted = (await query('SELECT * FROM public.match_rounds WHERE id=$1', [round(1)]))[0]
    assert.equal(deleted.status, 'closed'); assert.ok(deleted.deleted_at); assert.ok(deleted.deleted_by)
    const settings = (await query('SELECT * FROM private.round_peer_review_settings WHERE round_id=$1', [round(1)]))[0]
    assert.equal(settings.enabled, false); assert.equal(settings.version, 4); assert.equal(settings.roster_confirmed, true)
  })
  for (const actor of [1,10,11]) await ok('removed rounds hidden from authenticated round reads actor ' + actor, async () => {
    assert.equal((await as(actor, () => query('SELECT id FROM public.match_rounds WHERE id=$1', [round(1)]))).length, 0)
  })
  await ok('inner participation join hides removed activity', async () => assert.equal((await as(1, () => query(`SELECT s.id FROM public.match_round_submissions s
    JOIN public.match_rounds r ON r.id=s.round_id WHERE s.member_id=$1 AND r.id=$2`, [member(1), round(1)]))).length, 0))
  for (const [actor,name] of [[1,'player_list_round_peer_review_events'],[10,'admin_list_round_peer_review_events']]) await ok(name + ' excludes removed activity', async () => {
    assert.ok(!(await call(actor,name)).events.some(event => event.round_id === round(1)))
  })
  await no('removed player review deep link rejected', () => call(1,'player_get_round_peer_reviews',[round(1),'',1,24]), 'PEER_ROUND_NOT_FOUND')
  await no('removed admin review deep link rejected', () => call(10,'admin_get_round_peer_reviews',[round(1)]), 'PEER_ROUND_NOT_FOUND')
  await no('cannot reopen removed peer review settings', () => call(10,'admin_save_round_peer_review_settings',[round(1),true,...times,4,'尝试重新开放已删除的活动']), 'PEER_ROUND_NOT_FOUND')
  await no('cannot re-confirm removed roster', () => call(10,'admin_confirm_round_peer_review_roster',[round(1),[member(1),member(2)],4,'尝试重新确认已删除的活动']), 'PEER_NOT_ELIGIBLE')
  await no('cannot add member to removed roster', () => call(10,'admin_set_round_peer_review_participant',[round(1),member(3),true,'尝试添加到已删除的活动']), 'PEER_NOT_ELIGIBLE')
  await no('cannot remove member through stale admin business operation', () => call(10,'admin_set_round_peer_review_participant',[round(1),member(2),false,'尝试调整已删除活动的名单']), 'PEER_ROUND_NOT_FOUND')
  await no('new score cannot be saved after deletion', () => call(1,'player_save_round_peer_review',[round(1),member(2),5,'',0]), 'PEER_NOT_ELIGIBLE')
  await no('opened_at does not leave reporting open after deletion', () => call(1,'player_save_round_peer_report',[round(1),member(2),'other','不能向已删除的活动新增举报内容',0]), 'PEER_NOT_ELIGIBLE')
  await no('cannot submit new registration after deletion', () => signup(1,2), 'REGISTRATION_CANCEL_UNAVAILABLE')
  await no('privileged import cannot add signup to removed activity', () => as(null, () => query(`INSERT INTO public.match_round_submissions(round_id,member_id,game_type_pref,gender_pref,availability,custom_answers)
    VALUES($1,$2,'都可以','都可以','{}','{"note":"旧页面"}')`, [round(1),member(3)]),'service_role'), 'ROUND_NOT_FOUND')
  await no('privileged mutation cannot edit preserved signup', () => as(null, () => query("UPDATE public.match_round_submissions SET custom_answers='{\"note\":\"修改\"}' WHERE round_id=$1", [round(1)]),'service_role'), 'ROUND_NOT_FOUND')
  await no('cannot attach new match session to removed matching round', () => query('INSERT INTO public.match_sessions(round_id) VALUES($1)', [round(8)]), 'ROUND_MATCHING_ONLY')
  await no('privileged stale operation cannot reopen removed round', () => query("UPDATE public.match_rounds SET status='open' WHERE id=$1",[round(8)]), 'ROUND_NOT_FOUND')
  await no('privileged stale operation cannot restore deletion marker', () => query('UPDATE public.match_rounds SET deleted_at=NULL,deleted_by=NULL WHERE id=$1',[round(8)]), 'ROUND_NOT_FOUND')
  await ok('controlled privacy scrub still clears preserved answers', () => as(10, async () => {
    await query("SELECT set_config('app.round_anonymize_member',$1,true),set_config('app.member_master_explicit_audit','on',true)",[member(1)])
    await query("UPDATE public.match_round_submissions SET custom_answers='{}' WHERE round_id=$1",[round(1)])
    assert.deepEqual((await query('SELECT custom_answers FROM public.match_round_submissions WHERE round_id=$1',[round(1)]))[0].custom_answers,{})
  }))
  await ok('unrelated live registration and scoring remain usable', async () => {
    assert.ok((await signup(7,3)).id)
    assert.equal((await call(1,'player_save_round_peer_review',[round(9),member(2),4.5,'仍然可以互评',0])).score,4.5)
  })
  await ok('internal helper stays inaccessible and public delete RPC is auth-only', async () => {
    assert.equal((await query("SELECT has_function_privilege('authenticated','private.guard_match_round_deletion()','EXECUTE') AS allowed"))[0].allowed,false)
    for (const role of ['anon','service_role']) for (const schema of ['public','private']) assert.equal((await query(`SELECT has_function_privilege($1,'${schema}.admin_delete_match_round(uuid,text,integer)','EXECUTE') AS allowed`,[role]))[0].allowed,false)
    const security = await query("SELECT n.nspname,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='admin_delete_match_round' ORDER BY n.nspname")
    assert.deepEqual(security.map(row=>[row.nspname,row.prosecdef]),[['private',true],['public',false]])
    assert.ok(security.every(row=>row.proconfig.includes('search_path=""')))
  })
  await no('private implementation repeats authorization for direct invocation', () => as(1, () => query('SELECT private.admin_delete_match_round($1,$2,$3)', [round(7),'活动7',0])), 'ROUND_DELETE_FORBIDDEN')
  await no('cannot erase a living administrator from the deletion audit', () => query('UPDATE public.match_rounds SET deleted_by=NULL WHERE id=$1',[round(1)]), 'ROUND_NOT_FOUND')
  await ok('administrator FK removal preserves the deletion marker', async () => {
    await query('DELETE FROM public.admin_users WHERE user_id=$1',[user(10)])
    const record=(await query('SELECT deleted_at,deleted_by,status FROM public.match_rounds WHERE id=$1',[round(1)]))[0]
    assert.ok(record.deleted_at);assert.equal(record.deleted_by,null);assert.equal(record.status,'closed')
  })
  await ok('read-only postflight verifies the final database state', () => db.exec(read('supabase/audits/matching-round-delete-postflight.sql')))
  if (process.env.MATCH_ROUND_DELETE_AUDIT_EXTENSION) {
    const { auditDeletionMetadata } = await import(process.env.MATCH_ROUND_DELETE_AUDIT_EXTENSION)
    await auditDeletionMetadata(db, { query, as, call, member, user, round, read })
  }
  console.log(`All ${passed} isolated PostgreSQL checks passed`)
} finally { await db.close() }
