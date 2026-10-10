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
let passed = 0
async function ok(name, operation) { await operation(); passed++; console.log('PASS ' + name) }
async function no(name, operation, message) {
  await assert.rejects(operation, error => error.message.includes(message), name)
  passed++; console.log('PASS ' + name)
}
try {
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE ROLE authenticator NOLOGIN NOINHERIT; GRANT authenticated TO authenticator;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('role',current_setting('request.jwt.claim.role',true))$$;
    CREATE TABLE public.admin_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,role text);
    CREATE TABLE public.members(id uuid PRIMARY KEY,user_id uuid,status text,account_status text,anonymized_at timestamptz,membership_type text DEFAULT 'player',record_scope text DEFAULT 'current');
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

  await db.exec(`CREATE TABLE public.community_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipient_member_id uuid REFERENCES public.members,
    notification_type text NOT NULL CHECK (notification_type IN ('like')), title_zh text, title_ja text, body_zh text, body_ja text
  )`)
  await db.exec(read('supabase/migrations/20260929142902_round_submission_notifications.sql'))
  for (let n = 1; n <= 14; n++) {
    await query("INSERT INTO public.members(id,user_id,status,account_status) VALUES($1,$2,'approved','active')", [member(n), user(n)])
    await query('INSERT INTO public.member_identity(member_id,full_name) VALUES($1,$2)', [member(n), `测试成员${n}`])
  }
  await query("INSERT INTO public.admin_users(user_id,role) VALUES($1,'super_admin'),($2,'admin'),($3,'moderator')", [user(10), user(11), user(12)])
  const dates = (await query("SELECT (now()-interval '2 days')::text AS start,(now()-interval '1 day')::text AS end"))[0]
  const config = { eventStart: new Date(dates.start).toISOString(), eventEnd: new Date(dates.end).toISOString(),
    location: { zh: '东京' }, questions: [{ id: 'note', type: 'text', required: true, label: { zh: '备注' }, options: [] }] }
  const createRound = async (n, purpose = 'registration', content = config) => query(`INSERT INTO public.match_rounds
    (id,round_name,survey_start,survey_end,activity_start,activity_end,status,purpose,content_config)
    VALUES($1,$2,now()-interval '5 days',now()-interval '3 days',current_date-2,current_date-1,'closed',$3,$4)`,
    [round(n), `活动${n}`, purpose, JSON.stringify(content)])
  for (const n of [1,2,4,5,6]) await createRound(n)
  await createRound(3, 'matching', {})
  const insertSignup = (n, m, answers = { note: '原有答案' }) => as(null, () => query(`INSERT INTO public.match_round_submissions
    (round_id,member_id,game_type_pref,gender_pref,availability,custom_answers) VALUES($1,$2,'都可以','都可以','{}',$3) RETURNING *`,
    [round(n), member(m), JSON.stringify(answers)]), 'service_role')
  await insertSignup(1,1)
  await insertSignup(1,2)
  await as(2, async () => {
    await query("SELECT set_config('app.registration_transition',id::text || ':cancel',true) FROM public.match_round_submissions WHERE round_id=$1 AND member_id=$2",[round(1),member(2)])
    return query('UPDATE public.match_round_submissions SET cancelled_at=now() WHERE round_id=$1 AND member_id=$2',[round(1),member(2)])
  }, 'service_role')
  await insertSignup(3,1,{})
  const times = [new Date(Date.now()-60_000).toISOString(),new Date(Date.now()+3_600_000).toISOString()]
  for (const n of [1,2,3,4,5,6]) {
    await query(`INSERT INTO private.round_peer_review_settings(round_id,enabled,opens_at,closes_at,roster_confirmed,opened_at)
      VALUES($1,$2,$3,$4,$2,$3)`, [round(n), n !== 5, ...times])
  }
  for (const [n,m,included,source] of [[1,1,true,'registered'],[1,2,true,'manual'],[1,3,true,'manual'],[1,4,false,'manual'],[1,5,true,'manual'],[4,7,true,'manual'],[5,6,true,'manual']]) {
    await query('INSERT INTO private.round_peer_review_participants(round_id,member_id,included,source) VALUES($1,$2,$3,$4)', [round(n),member(m),included,source])
  }
  await query("UPDATE public.members SET account_status='suspended' WHERE id=$1", [member(5)])
  await call(10,'admin_delete_match_round',[round(4),'活动4',0])
  await call(1,'player_save_round_peer_review',[round(1),member(3),4.5,'原有评价',0])
  const originalSignup = (await query('SELECT * FROM public.match_round_submissions WHERE round_id=$1 AND member_id=$2', [round(1),member(1)]))[0]
  const originalReview = (await query('SELECT * FROM private.round_peer_reviews WHERE round_id=$1', [round(1)]))[0]
  const originalSettings = (await query('SELECT * FROM private.round_peer_review_settings WHERE round_id=$1', [round(1)]))[0]
  await db.exec(read('supabase/migrations/20261010104253_matching_round_deletion_audit_trash.sql'))
  // Mirror Supabase CLI's NOINHERIT login and explicit postgres role switch.
  await db.exec('CREATE ROLE cli_login_postgres LOGIN NOINHERIT; GRANT postgres TO cli_login_postgres; SET SESSION AUTHORIZATION cli_login_postgres; SET ROLE postgres')
  await ok('migration login has postgres membership without inherited privileges', async () => {
    const role=(await query("SELECT session_user,current_user,pg_has_role(session_user,'postgres','MEMBER') AS member,pg_has_role(session_user,'postgres','USAGE') AS usage"))[0]
    assert.equal(role.session_user,'cli_login_postgres'); assert.equal(role.current_user,'postgres')
    assert.equal(role.member,true); assert.equal(role.usage,false)
  })
  await db.exec(read('supabase/migrations/20261010104319_flexible_registration_and_roster_signup.sql'))
  await db.exec('SET SESSION AUTHORIZATION postgres; SET ROLE postgres')
  await ok('API roles cannot acquire postgres migration membership', async () => {
    const roles=await query("SELECT rolname FROM pg_roles WHERE rolname IN ('authenticator','anon','authenticated','service_role') AND pg_has_role(oid,'postgres','MEMBER')")
    assert.deepEqual(roles,[])
  })
  await ok('postflight verifies migration guards, private grants and complete backfill', async () => {
    await db.exec(read('supabase/audits/flexible-registration-postflight.sql'))
  })
  await ok('migration keeps ordinary table permissions unchanged', async () => assert.deepEqual(await acl(), originalAcl))
  await ok('historical confirmed manual attendance gets one empty signup', async () => {
    const rows = await query('SELECT custom_answers,cancelled_at FROM public.match_round_submissions WHERE round_id=$1 AND member_id=$2',[round(1),member(3)])
    assert.equal(rows.length,1); assert.deepEqual(rows[0].custom_answers,{}); assert.equal(rows[0].cancelled_at,null)
  })
  await ok('historical cancelled, removed, inactive, unconfirmed and deleted records are not restored', async () => {
    for (const [n,m] of [[1,4],[1,5],[4,7],[5,6]]) assert.equal((await query('SELECT id FROM public.match_round_submissions WHERE round_id=$1 AND member_id=$2',[round(n),member(m)])).length,0)
    assert.ok((await query('SELECT cancelled_at FROM public.match_round_submissions WHERE round_id=$1 AND member_id=$2',[round(1),member(2)]))[0].cancelled_at)
  })
  await ok('backfill preserves old answers, ratings, review settings and sends no notices', async () => {
    assert.deepEqual((await query('SELECT * FROM public.match_round_submissions WHERE id=$1',[originalSignup.id]))[0],originalSignup)
    assert.deepEqual((await query('SELECT * FROM private.round_peer_reviews WHERE id=$1',[originalReview.id]))[0],originalReview)
    assert.deepEqual((await query('SELECT * FROM private.round_peer_review_settings WHERE round_id=$1',[round(1)]))[0],originalSettings)
    assert.equal((await query('SELECT * FROM public.community_notifications')).length,0)
  })
  const version = async n => (await query('SELECT version FROM private.round_peer_review_settings WHERE round_id=$1',[round(n)]))[0].version
  const confirm = async (n, ids, actor=11) => call(actor,'admin_confirm_round_peer_review_roster',[round(n),ids.map(member),await version(n),'确认现场参加并同步补录报名'])
  await ok('ordinary admin supplements a closed ended activity and preserves review opening', async () => {
    await confirm(2,[1,8])
    assert.equal((await query('SELECT id FROM public.match_round_submissions WHERE round_id=$1',[round(2)])).length,2)
    const settings=(await query('SELECT * FROM private.round_peer_review_settings WHERE round_id=$1',[round(2)]))[0]
    assert.equal(settings.enabled,true); assert.equal(settings.roster_confirmed,true)
    assert.equal((await query('SELECT * FROM public.community_notifications WHERE round_id=$1',[round(2)])).length,2)
  })
  await ok('supplemented player has normal participation record and can rate another attendee', async () => {
    assert.equal((await as(8,()=>query('SELECT * FROM public.match_round_submissions WHERE round_id=$1',[round(2)]))).length,1)
    const context=await call(8,'player_get_round_peer_reviews',[round(2)])
    assert.equal(context.can_review,true)
    await call(8,'player_save_round_peer_review',[round(2),member(1),4,'现场交流愉快',0])
    await call(1,'player_save_round_peer_review',[round(2),member(8),4.5,'欢迎参加',0])
  })
  await ok('saving unchanged roster repeats neither signup nor notification and keeps answers', async () => {
    const signups=await query('SELECT * FROM public.match_round_submissions WHERE round_id=$1 ORDER BY id',[round(2)])
    await confirm(2,[1,8],10)
    assert.deepEqual(await query('SELECT * FROM public.match_round_submissions WHERE round_id=$1 ORDER BY id',[round(2)]),signups)
    assert.equal((await query('SELECT * FROM public.community_notifications WHERE round_id=$1',[round(2)])).length,2)
  })
  await no('bad roster saves neither signup nor partial participants',()=>confirm(2,[1,9,5]),'PEER_NOT_ELIGIBLE')
  await ok('failed confirmation rolls back new member signup',async()=>assert.equal((await query('SELECT id FROM public.match_round_submissions WHERE round_id=$1 AND member_id=$2',[round(2),member(9)])).length,0))
  await no('cancelled player is not silently restored by roster save',()=>confirm(1,[1,2]),'PEER_NOT_ELIGIBLE')
  await no('ordinary player cannot supplement attendance',()=>confirm(2,[1,9],9),'PEER_ADMIN_REQUIRED')
  await no('moderator cannot supplement attendance',()=>confirm(2,[1,9],12),'PEER_ADMIN_REQUIRED')
  await no('deleted activity cannot be supplemented',()=>confirm(4,[1,9]),'PEER_')
  await no('stale save cannot create a late signup',()=>call(11,'admin_confirm_round_peer_review_roster',[round(2),[member(1),member(9)],0,'测试过期名册不会部分补录']),'PEER_VERSION_CONFLICT')
  for (const actor of [10,11]) await ok(`admin ${actor} reopens past activity with deadline after event`,async()=>{
    await as(actor,()=>query("UPDATE public.match_rounds SET status='open',survey_start=now()-interval '1 day',survey_end=now()+interval '6 days' WHERE id=$1",[round(1)]))
  })
  await ok('existing signups do not lock fixed activity dates and times',async()=>{
    await as(11,()=>query("UPDATE public.match_rounds SET activity_start=current_date-4,activity_end=current_date-3,content_config=jsonb_set(jsonb_set(content_config,'{eventStart}',to_jsonb((now()-interval '4 days')::text)),'{eventEnd}',to_jsonb((now()-interval '3 days')::text)) WHERE id=$1",[round(1)]))
  })
  await no('end before start still fails',()=>as(11,()=>query("UPDATE public.match_rounds SET content_config=jsonb_set(content_config,'{eventEnd}',to_jsonb((now()-interval '8 days')::text)) WHERE id=$1",[round(1)])),'ROUND_EVENT_TIME_INVALID')
  await no('question structure still cannot erase existing answers',()=>as(11,()=>query("UPDATE public.match_rounds SET content_config=jsonb_set(content_config,'{questions}','[]') WHERE id=$1",[round(1)])),'ROUND_STRUCTURE_LOCKED')
  await no('existing registration cannot be changed into a matching questionnaire',()=>as(11,()=>query("UPDATE public.match_rounds SET purpose='matching' WHERE id=$1",[round(1)])),'ROUND_STRUCTURE_LOCKED')
  await no('matching availability dates remain locked once answered',()=>as(11,()=>query('UPDATE public.match_rounds SET activity_end=activity_end+1 WHERE id=$1',[round(3)])),'ROUND_STRUCTURE_LOCKED')
  await ok('matching review roster does not invent availability or matching submissions',async()=>{
    await confirm(3,[1,9]); assert.equal((await query('SELECT * FROM public.match_round_submissions WHERE round_id=$1 AND member_id=$2',[round(3),member(9)])).length,0)
  })
  const revision=async n=>(await query('SELECT config_revision FROM public.match_rounds WHERE id=$1',[round(n)]))[0].config_revision
  await ok('normal player can sign up to reopened past event with genuine answers',async()=>{
    await call(9,'manage_my_registration',[round(1),'create',null,await revision(1),{note:'玩家自行填写'}])
    assert.equal((await query('SELECT * FROM public.community_notifications WHERE round_id=$1 AND recipient_member_id=$2',[round(1),member(9)])).length,1)
  })
  await no('ordinary player still must answer required questions',async()=>call(13,'manage_my_registration',[round(1),'create',null,await revision(1),{}]),'ROUND_ANSWER_REQUIRED')
  await no('ordinary player still cannot register for closed round',async()=>call(13,'manage_my_registration',[round(2),'create',null,await revision(2),{note:'不应提交'}]),'REGISTRATION_CANCEL_UNAVAILABLE')
  await ok('reopening preserves normal cancellation and rejoin behavior',async()=>{
    let signup=(await query('SELECT * FROM public.match_round_submissions WHERE round_id=$1 AND member_id=$2',[round(1),member(9)]))[0]
    await call(9,'manage_my_registration',[round(1),'cancel',signup.updated_at,await revision(1),{}])
    signup=(await query('SELECT * FROM public.match_round_submissions WHERE id=$1',[signup.id]))[0]
    assert.ok(signup.cancelled_at)
    await call(9,'manage_my_registration',[round(1),'rejoin',signup.updated_at,await revision(1),{note:'玩家自行填写'}])
    assert.equal((await query('SELECT * FROM public.community_notifications WHERE round_id=$1 AND recipient_member_id=$2',[round(1),member(9)])).length,1)
  })
  await ok('supplemented empty answers do not prevent normal cancellation after reopening',async()=>{
    await as(11,()=>query("UPDATE public.match_rounds SET status='open',survey_start=now()-interval '1 day',survey_end=now()+interval '1 day' WHERE id=$1",[round(2)]))
    const signup=(await query('SELECT * FROM public.match_round_submissions WHERE round_id=$1 AND member_id=$2',[round(2),member(8)]))[0]
    await call(8,'manage_my_registration',[round(2),'cancel',signup.updated_at,await revision(2),{}])
    const cancelled=(await query('SELECT * FROM public.match_round_submissions WHERE id=$1',[signup.id]))[0]
    assert.ok(cancelled.cancelled_at); assert.deepEqual(cancelled.custom_answers,{})
    assert.equal((await call(8,'player_get_round_peer_reviews',[round(2)])).can_review,false)
    await assert.rejects(()=>call(8,'manage_my_registration',[round(2),'rejoin',cancelled.updated_at,cancelled.config_revision,{}]),e=>e.message.includes('ROUND_ANSWER_REQUIRED'))
    await call(8,'manage_my_registration',[round(2),'rejoin',cancelled.updated_at,cancelled.config_revision,{note:'恢复报名时由玩家填写'}])
  })
  await ok('supplementing a paused review does not unexpectedly open scoring',async()=>{
    await query('UPDATE private.round_peer_review_settings SET enabled=false WHERE round_id=$1',[round(6)])
    await confirm(6,[1,14]); assert.equal((await call(14,'player_get_round_peer_reviews',[round(6)])).can_review,false)
  })
  await ok('ordinary players cannot write another participant registration',async()=>{
    await assert.rejects(()=>as(9,()=>query("INSERT INTO public.match_round_submissions(round_id,member_id,game_type_pref,gender_pref,availability,custom_answers) VALUES($1,$2,'都可以','都可以','{}','{}')",[round(6),member(13)])))
  })
  console.log(`PASS ${passed} registration and roster database checks`)
} catch (error) {
  console.error(error.message)
  if (error.detail) console.error(error.detail)
  if (error.where) console.error(error.where)
  process.exitCode=1
} finally { await db.close() }
