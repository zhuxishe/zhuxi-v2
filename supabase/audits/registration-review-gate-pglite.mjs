// Isolated PostgreSQL integration tests for per-activity registration review gates.
// Replays real registration, roster, peer-review and cancellation guards.
// Matching publication and test-scope identity are dependency fixtures; no network.
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
  await db.exec(read('supabase/migrations/20261010104319_flexible_registration_and_roster_signup.sql'))
  await db.exec(read('supabase/migrations/20261010114440_restore_cancelled_attendance_registration.sql'))
  await db.exec(read('supabase/migrations/20261010123021_automatic_registration_review_roster.sql'))
  await db.exec(`ALTER TABLE public.members ADD COLUMN is_test boolean NOT NULL DEFAULT false;
    ALTER TABLE public.match_rounds ADD COLUMN is_test boolean NOT NULL DEFAULT false;
    ALTER TABLE public.match_sessions ADD COLUMN publication_version integer DEFAULT 0,ADD COLUMN status text;
    CREATE TABLE public.match_results(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid REFERENCES public.match_sessions,
      member_a_id uuid,member_b_id uuid,group_members uuid[],status text,publication_version integer DEFAULT 0);
    ALTER TABLE public.mutual_reviews ADD COLUMN match_result_id uuid REFERENCES public.match_results,
      ADD COLUMN reviewer_id uuid,ADD COLUMN reviewee_id uuid;
    CREATE SCHEMA matching_publication;
    CREATE FUNCTION private.test_account_round_allowed(r uuid,m uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS(SELECT 1 FROM public.match_rounds rr JOIN public.members mm ON mm.id=m WHERE rr.id=r AND rr.is_test=mm.is_test)$$;
  `)
  const publicationSql=read('supabase/migrations/20261022183350_matching_publication_delivery.sql')
  await db.exec(publicationSql.slice(publicationSql.indexOf('CREATE TABLE matching_publication.publications'),publicationSql.indexOf('-- A protected row')))
  const idsStart=publicationSql.indexOf('CREATE FUNCTION matching_publication.member_ids(')
  await db.exec(publicationSql.slice(idsStart,publicationSql.indexOf('$function$;',idsStart)+'$function$;'.length))
  const session = n => `40000000-0000-4000-8000-${String(n).padStart(12,'0')}`
  const result = n => `50000000-0000-4000-8000-${String(n).padStart(12,'0')}`
  const eventConfig = (endMinutes=-60) => ({ eventStart:new Date(Date.now()-86_400_000).toISOString(),
    eventEnd:new Date(Date.now()+endMinutes*60_000).toISOString(),location:{zh:'测试场地'},questions:[] })
  const createRound = async(n,{purpose='registration',status='open',config=eventConfig(),name=`活动${n}`,start='2026-11-04',end='2026-11-17'}={}) => query(`
    INSERT INTO public.match_rounds(id,round_name,survey_start,survey_end,activity_start,activity_end,status,purpose,content_config)
    VALUES($1,$2,now()-interval '2 days',now()+interval '2 days',$3,$4,$5,$6,$7)`,[round(n),name,start,end,status,purpose,JSON.stringify(config)])
  const signup = (n,m) => as(null,()=>query(`INSERT INTO public.match_round_submissions(round_id,member_id,game_type_pref,gender_pref,availability,custom_answers)
    VALUES($1,$2,'都可以','都可以','{}','{}') RETURNING *`,[round(n),member(m)]),'service_role')
  const peerSetup = async(n,people=[1,2],{enabled=true,closed=false}={}) => {
    await query(`INSERT INTO private.round_peer_review_settings(round_id,enabled,opens_at,closes_at,roster_confirmed,opened_at,auto_include_registered)
      VALUES($1,$2,now()-interval '2 days',now()+$3::interval,true,now()-interval '2 days',false)`,[round(n),enabled,closed?'-1 hour':'1 day'])
    for (const m of people) await query(`INSERT INTO private.round_peer_review_participants(round_id,member_id,included,source) VALUES($1,$2,true,'registered')`,[round(n),member(m)])
  }
  const gate = (m,n=99) => call(m,'player_get_registration_review_gate',[round(n)])
  const review = (m,target,n,score=4.5) => call(m,'player_save_round_peer_review',[round(n),member(target),score,'',0])
  const blockIds = async(m,n=99) => (await gate(m,n)).blockers.map(b=>b.round_id)
  const state = async(n,m=1) => (await call(11,'admin_get_round_review_requirements',[round(n)])).participants.find(p=>p.member_id===member(m))?.state
  const publishMatch = async(n,people=[1,2]) => {
    await query(`INSERT INTO public.match_sessions(id,round_id,status,publication_version) VALUES($1,$2,'confirmed',1)`,[session(n),round(n)])
    await query(`INSERT INTO matching_publication.publications(id,session_id,round_id,version,round_name,reason) VALUES($1,$1,$2,1,'隔离测试','隔离测试正式发布')`,[session(n),round(n)])
    if (people.length) await query(`INSERT INTO public.match_results(id,session_id,member_a_id,member_b_id,group_members,status,publication_version)
      VALUES($1,$2,$3,$4,$5,'confirmed',1)`,[result(n),session(n),member(people[0]),member(people[1]),people.length>2?people.map(member):null])
    for (const person of people) {
      await query(`INSERT INTO matching_publication.roster(publication_id,member_id,result_id,outcome) VALUES($1,$2,$3,'matched')`,[session(n),member(person),result(n)])
      await query(`INSERT INTO matching_publication.active_assignments(round_id,member_id,publication_id,result_id) VALUES($1,$2,$3,$4)`,[round(n),member(person),session(n),result(n)])
    }
    if (!people.length) await query(`INSERT INTO matching_publication.roster(publication_id,member_id,result_id,outcome) VALUES($1,$2,NULL,'unmatched')`,[session(n),member(1)])
  }
  // Existing historical, clean draft, and previously-used draft scope.
  await createRound(1,{status:'closed'})
  await signup(1,1);await signup(1,2);await peerSetup(1)
  await createRound(2,{purpose:'matching',status:'matched',config:{},name:'竹溪社11月匹配活动'})
  await signup(2,8);await signup(2,9);await publishMatch(2,[8,9])
  await query('INSERT INTO public.mutual_reviews(match_result_id,reviewer_id,reviewee_id,overall_score) VALUES($1,$2,$3,4)',[result(2),member(8),member(9)])
  await createRound(3,{status:'draft'})
  await createRound(4,{status:'draft'});await signup(4,1)
  await createRound(5,{purpose:'matching',status:'matched',config:{},name:'竹溪社11月匹配活动',start:'2026-10-01',end:'2026-10-17'})
  await createRound(6,{status:'draft'})
  await call(11,'admin_save_round_peer_review_settings',[round(6),false,new Date(Date.now()+60_000).toISOString(),new Date(Date.now()+86_400_000).toISOString(),0,'提前配置未发布活动',false])
  await createRound(7,{status:'draft'})
  await peerSetup(7,[],{enabled:true})
  await createRound(9,{status:'draft'})
  await peerSetup(9,[1,2],{enabled:false})
  await createRound(8,{purpose:'matching',status:'matched',config:{},name:'竹溪社11月匹配活动'})
  await no('ambiguous historical identity aborts before schema creation',()=>db.exec(read('supabase/migrations/20261105095725_registration_review_gate.sql')),'REVIEW_GATE_HISTORICAL_ROUND_AMBIGUOUS')
  await db.exec('ROLLBACK')
  assert.equal((await query("SELECT to_regnamespace('registration_review_gate') AS schema"))[0].schema,null)
  await query("UPDATE public.match_rounds SET round_name='不同名称的历史活动' WHERE id=$1",[round(8)])
  await db.exec(read('supabase/migrations/20261105095725_registration_review_gate.sql'))
  await ok('migration scope includes only named November historical round',async()=>{
    const required=await query('SELECT round_id FROM private.round_review_requirements WHERE required')
    assert.deepEqual(required.map(r=>r.round_id),[round(2)])
  })
  await query("UPDATE public.match_rounds SET status='open' WHERE id IN ($1,$2,$3,$4,$5,$6)",[round(1),round(3),round(4),round(6),round(7),round(9)])
  await ok('reopening old rounds does not opt in; clean existing draft first publication does',async()=>{
    assert.equal((await call(11,'admin_get_round_review_requirements',[round(1)])).required,false)
    assert.equal((await call(11,'admin_get_round_review_requirements',[round(3)])).required,true)
    assert.equal((await call(11,'admin_get_round_review_requirements',[round(4)])).required,false)
    assert.equal((await call(11,'admin_get_round_review_requirements',[round(6)])).required,true)
    assert.equal((await call(11,'admin_get_round_review_requirements',[round(9)])).required,false)
  })
  await ok('enabled past-opening settings without any participants do not mark a draft as historically published',async()=>{
    assert.equal((await call(11,'admin_get_round_review_requirements',[round(7)])).required,true)
  })
  await ok('preexisting successful score already satisfies enrolled historical activity',async()=>assert.equal(await state(2,8),'completed'))
  await query("UPDATE private.round_peer_review_settings SET closes_at=now()-interval '1 hour' WHERE round_id=$1",[round(1)])
  await no('unscoped old event does not acquire late-rating allowance',()=>review(1,2,1),'PEER_WINDOW_CLOSED')
  await createRound(99,{config:eventConfig(10_000)})
  await createRound(10,{config:eventConfig(120)})
  await signup(10,1);await signup(10,2);await peerSetup(10)
  await ok('overlapping unfinished activity does not block registration',async()=>assert.deepEqual(await blockIds(1),[]))
  await createRound(11);await signup(11,1);await signup(11,2);await peerSetup(11)
  await ok('independently ended second activity blocks while first still runs',async()=>assert.deepEqual(await blockIds(1),[round(11)]))
  await ok('own active target registration is never blocked',async()=>assert.deepEqual(await blockIds(1,10),[]))
  await review(2,1,11)
  await ok('counterpart rating never completes my requirement',async()=>assert.deepEqual(await blockIds(1),[round(11)]))
  await call(1,'player_save_round_peer_report',[round(11),member(2),'other','这里是足够详细的实际情况说明',0])
  await ok('report without a score does not complete requirement',async()=>assert.deepEqual(await blockIds(1),[round(11)]))
  await review(1,2,11)
  await ok('one self-authored score completes event with optional empty comment',async()=>assert.deepEqual(await blockIds(1),[]))
  await query(`UPDATE public.match_rounds SET content_config=$2 WHERE id=$1`,[round(10),JSON.stringify(eventConfig())])
  await ok('completing later event first never clears earlier event when it ends',async()=>assert.deepEqual(await blockIds(1),[round(10)]))
  await review(1,2,10)
  await ok('all completed activities clear regardless of signup/evaluation order',async()=>assert.deepEqual(await blockIds(1),[]))
  await query('UPDATE private.round_peer_reviews SET valid=false WHERE round_id=$1 AND reviewer_id=$2',[round(10),member(1)])
  await ok('later moderation invalidation does not retract successful completion',async()=>assert.equal(await state(10),'completed'))

  await createRound(12);await signup(12,1);await signup(12,2);await peerSetup(12,[1,2],{closed:true})
  await ok('normal closed window still blocks with reachable late-review form',async()=>{
    assert.deepEqual(await blockIds(1),[round(12)])
    const detail=await call(1,'player_get_round_peer_reviews',[round(12),'',1,24])
    assert.equal(detail.can_review,true);assert.equal(detail.late_review,true);assert.equal(detail.review_required,true)
    const item=(await call(1,'player_list_round_peer_review_events')).events.find(r=>r.round_id===round(12))
    assert.equal(item.can_review,true);assert.equal(item.late_review,true);assert.equal(item.review_required,true)
  })
  await query('UPDATE private.round_peer_review_settings SET enabled=false WHERE round_id=$1',[round(12)])
  await ok('active administrator pause temporarily removes blocker',async()=>{assert.deepEqual(await blockIds(1),[]);assert.equal(await state(12),'unavailable')})
  await no('pause still rejects late review',()=>review(1,2,12),'PEER_WINDOW_CLOSED')
  await query('UPDATE private.round_peer_review_settings SET enabled=true WHERE round_id=$1',[round(12)])
  await review(1,2,12)
  await ok('late score unlocks and late edit allowance ends immediately',async()=>{
    assert.deepEqual(await blockIds(1),[])
    const detail=await call(1,'player_get_round_peer_reviews',[round(12),'',1,24])
    assert.equal(detail.can_review,false);assert.equal(detail.late_review,false)
  })
  await no('completed participant cannot keep editing after cutoff',()=>call(1,'player_save_round_peer_review',[round(12),member(2),3,'',1]),'PEER_WINDOW_CLOSED')

  await createRound(13);await signup(13,1);await signup(13,2);await peerSetup(13)
  await createRound(14);await signup(14,1);await signup(14,2);await peerSetup(14)
  await ok('multiple outstanding activities all returned',async()=>assert.deepEqual(new Set(await blockIds(1)),new Set([round(13),round(14)])))
  await no('ordinary player cannot administer exemptions',()=>call(1,'admin_set_round_review_exemption',[round(13),member(1),true,'测试核对免除评价',0]),'PEER_ADMIN_REQUIRED')
  await no('admin reason is required',()=>call(11,'admin_set_round_review_exemption',[round(13),member(1),true,'x',0]),'PEER_REASON_REQUIRED')
  await call(11,'admin_set_round_review_exemption',[round(13),member(1),true,'确认本人实际未参加',0])
  await ok('individual exemption clears only selected event/member',async()=>{assert.deepEqual(await blockIds(1),[round(14)]);assert.equal(await state(13),'exempt');assert.equal(await state(13,2),'pending')})
  await no('stale exemption write is rejected',()=>call(11,'admin_set_round_review_exemption',[round(13),member(1),false,'纠正本人参与记录',0]),'PEER_VERSION_CONFLICT')
  await call(11,'admin_set_round_review_exemption',[round(13),member(1),false,'纠正本人参与记录',1])
  await ok('revoking exemption restores unmet obligation and records both decisions',async()=>{
    assert.equal(await state(13),'pending')
    assert.equal((await query('SELECT count(*)::int n FROM private.round_review_exemption_audit WHERE round_id=$1 AND member_id=$2',[round(13),member(1)]))[0].n,2)
  })
  await no('final direct insert guard rejects new signup',()=>as(1,()=>query(`INSERT INTO public.match_round_submissions(round_id,member_id,game_type_pref,gender_pref,availability,custom_answers)
    VALUES($1,$2,'都可以','都可以','{}','{}')`,[round(99),member(1)])),'REGISTRATION_REVIEW_REQUIRED')
  await ok('write rejection carries the same typed blocker detail as preflight',async()=>{
    await assert.rejects(()=>as(1,()=>query(`INSERT INTO public.match_round_submissions(round_id,member_id,game_type_pref,gender_pref,availability,custom_answers)
      VALUES($1,$2,'都可以','都可以','{}','{}')`,[round(99),member(1)])),e=>{
      const details=JSON.parse(e.detail)
      assert.deepEqual(new Set(details.blockers.map(b=>b.round_id)),new Set([round(13),round(14)]))
      assert.ok(details.blockers.every(b=>b.purpose==='registration'&&b.review_href.endsWith('/reviews')&&b.ended_at))
      return e.message==='REGISTRATION_REVIEW_REQUIRED'
    })
  })
  await no('client setting alone cannot impersonate roster administrator',()=>as(1,async()=>{
    await query("SELECT set_config('app.round_roster_signup',$1,true)",[round(99)+':'+member(1)])
    return query(`INSERT INTO public.match_round_submissions(round_id,member_id,game_type_pref,gender_pref,availability,custom_answers)
      VALUES($1,$2,'都可以','都可以','{}','{}')`,[round(99),member(1)])
  }),'REGISTRATION_REVIEW_REQUIRED')
  await createRound(101,{config:eventConfig(10_000)})
  await call(11,'admin_save_round_peer_review_settings',[round(101),false,new Date(Date.now()-60_000).toISOString(),new Date(Date.now()+86_400_000).toISOString(),0,'后台确认实际到场测试',false])
  await call(11,'admin_confirm_round_peer_review_roster',[round(101),[member(1),member(2)],1,'后台确认实际到场测试'])
  await ok('ordinary administrator attendance supplementation retains authenticated exemption',async()=>{
    assert.equal((await query('SELECT count(*)::int n FROM public.match_round_submissions WHERE round_id=$1',[round(101)]))[0].n,2)
  })
  await createRound(102,{purpose:'matching',config:{},start:'2020-01-01',end:'2030-01-01'})
  await no('matching direct insert also enforces review gate',()=>as(1,()=>query(`INSERT INTO public.match_round_submissions(round_id,member_id,game_type_pref,gender_pref,availability,custom_answers)
    VALUES($1,$2,'都可以','都可以','{"2026-11-06":["下午"]}','{}')`,[round(102),member(1)])),'REGISTRATION_REVIEW_REQUIRED')
  await signup(99,1)
  await ok('existing administrative import path is preserved',async()=>assert.deepEqual(await blockIds(1),[]))
  const current=(await query('SELECT * FROM public.match_round_submissions WHERE round_id=$1 AND member_id=$2',[round(99),member(1)]))[0]
  await call(1,'manage_my_registration',[round(99),'update',current.updated_at,0,{}])
  await ok('existing active registration edit is not blocked by other missing scores',async()=>assert.deepEqual(await blockIds(1),[]))
  const updated=(await query('SELECT * FROM public.match_round_submissions WHERE id=$1',[current.id]))[0]
  await call(1,'manage_my_registration',[round(99),'cancel',updated.updated_at,0,{}])
  const cancelled=(await query('SELECT * FROM public.match_round_submissions WHERE id=$1',[current.id]))[0]
  await no('rejoin RPC is blocked after prior cancellation',()=>call(1,'manage_my_registration',[round(99),'rejoin',cancelled.updated_at,0,{}]),'REGISTRATION_REVIEW_REQUIRED')
  await no('direct cancelled-to-active restore is guarded even with transition token',()=>as(1,async()=>{
    await query("SELECT set_config('app.registration_transition',$1,true)",[current.id+':rejoin'])
    return query('UPDATE public.match_round_submissions SET cancelled_at=NULL WHERE id=$1',[current.id])
  }),'REGISTRATION_REVIEW_REQUIRED')
  await peerSetup(99,[1,2],{enabled:false})
  await call(11,'admin_confirm_round_peer_review_roster',[round(99),[member(1),member(2)],1,'工作人员确认实际参加'])
  await ok('attendance confirmation can restore a cancelled registration despite other obligations',async()=>{
    assert.equal((await query('SELECT cancelled_at FROM public.match_round_submissions WHERE id=$1',[current.id]))[0].cancelled_at,null)
  })
  const restored=(await query('SELECT * FROM public.match_round_submissions WHERE id=$1',[current.id]))[0]
  await call(1,'manage_my_registration',[round(99),'cancel',restored.updated_at,0,{}])
  const recancelled=(await query('SELECT * FROM public.match_round_submissions WHERE id=$1',[current.id]))[0]
  await review(1,2,13);await review(1,2,14)
  await call(1,'manage_my_registration',[round(99),'rejoin',recancelled.updated_at,0,{}])
  await ok('rejoin succeeds immediately once all obligations completed',async()=>assert.deepEqual(await blockIds(1),[]))

  await createRound(15);await signup(15,1)
  await ok('missing review settings never create permanent exemption',async()=>assert.equal(await state(15),'unavailable'))
  await peerSetup(15,[1])
  await ok('single attendee has no real target and no blocker',async()=>assert.equal(await state(15),'no_target'))
  await signup(15,2)
  await query("INSERT INTO private.round_peer_review_participants(round_id,member_id,included,source) VALUES($1,$2,true,'registered')",[round(15),member(2)])
  await ok('subsequent real target is evaluated live; no-target was not stored exemption',async()=>assert.equal(await state(15),'pending'))
  await review(1,2,15)

  await createRound(16,{purpose:'matching',config:{},start:'2020-01-01',end:'2020-01-02'})
  await signup(16,1);await signup(16,2);await signup(16,3);await publishMatch(16,[1,2,3])
  await ok('matching ended-at includes full final date in Tokyo',async()=>{
    const data=await call(11,'admin_get_round_review_requirements',[round(16)])
    assert.equal(new Date(data.ended_at).toISOString(),'2020-01-02T15:00:00.000Z')
    assert.equal(await state(16),'pending')
  })
  await createRound(100,{config:eventConfig(10_000)})
  await ok('matching blocker links to published legacy review form',async()=>assert.equal((await gate(1,100)).blockers.find(b=>b.round_id===round(16)).review_href,'/app/reviews/new/'+result(16)))
  await peerSetup(16,[1,2,3],{closed:true})
  await no('matching generic peer review never receives a late submission exception',()=>review(1,2,16),'PEER_WINDOW_CLOSED')
  await ok('matching generic peer UI never claims to satisfy the registration review gate',async()=>{
    const detail=await call(1,'player_get_round_peer_reviews',[round(16),'',1,24])
    assert.equal(detail.review_required,false);assert.equal(detail.late_review,false);assert.equal(detail.can_review,false)
    const item=(await call(1,'player_list_round_peer_review_events')).events.find(r=>r.round_id===round(16))
    assert.equal(item.review_required,false);assert.equal(item.late_review,false)
  })
  await query("UPDATE private.round_peer_review_settings SET closes_at=now()+interval '1 day' WHERE round_id=$1",[round(16)])
  await review(1,2,16)
  await ok('ordinary open matching peer review is preserved but cannot complete the matching obligation',async()=>assert.equal(await state(16),'pending'))
  await query("UPDATE private.round_peer_review_settings SET closes_at=now()-interval '1 hour' WHERE round_id=$1",[round(16)])
  await query('DELETE FROM matching_publication.active_assignments WHERE round_id=$1 AND member_id=$2',[round(16),member(1)])
  await ok('missing canonical active assignment never emits unreachable blocker',async()=>assert.notEqual(await state(16),'pending'))
  await query('INSERT INTO matching_publication.active_assignments(round_id,member_id,publication_id,result_id) VALUES($1,$2,$3,$4)',[round(16),member(1),session(16),result(16)])
  await query('UPDATE matching_publication.publications SET withdrawn_at=now() WHERE id=$1',[session(16)])
  await ok('withdrawn publication never emits a blocker',async()=>assert.equal(await state(16),'unavailable'))
  await query('UPDATE matching_publication.publications SET withdrawn_at=NULL WHERE id=$1',[session(16)])
  await query('INSERT INTO public.mutual_reviews(match_result_id,reviewer_id,reviewee_id,overall_score) VALUES($1,$2,$3,4)',[result(16),member(2),member(1)])
  await ok('incoming matching review does not count',async()=>assert.equal(await state(16),'pending'))
  await query('INSERT INTO public.mutual_reviews(match_result_id,reviewer_id,reviewee_id,overall_score) VALUES($1,$2,$3,4)',[result(16),member(1),member(2)])
  await ok('one matching score suffices in a multi-member group',async()=>assert.equal(await state(16),'completed'))
  await createRound(17,{purpose:'matching',config:{},start:'2020-01-01',end:'2020-01-02'});await signup(17,1)
  await ok('matching roster not yet published is unavailable',async()=>assert.equal(await state(17),'unavailable'))
  await publishMatch(17,[])
  await ok('published unmatched player has no target',async()=>assert.equal(await state(17),'no_target'))
  await createRound(18)
  await query('UPDATE public.match_rounds SET is_test=true WHERE id=$1',[round(18)])
  await signup(18,1);await signup(18,2);await peerSetup(18)
  await ok('test activities never create formal blockers',async()=>assert.ok(!(await blockIds(1,100)).includes(round(18))))
  await createRound(19);await signup(19,1);await signup(19,2);await peerSetup(19,[1,2],{closed:true})
  await ok('late combined score and report preserve atomic submission and retry',async()=>{
    const requestId='60000000-0000-4000-8000-000000000019'
    const args=[round(19),member(2),1,'',0,'other','详细记录活动中所发生的真实问题',0,requestId]
    const saved=await call(1,'player_submit_round_peer_feedback',args)
    assert.equal(saved.review.score,1);assert.equal(saved.report.category,'other')
    assert.deepEqual(await call(1,'player_submit_round_peer_feedback',args),saved)
    assert.equal(await state(19),'completed')
  })
  await createRound(20);await signup(20,1);await signup(20,2);await signup(20,3);await peerSetup(20,[1,2,3],{closed:true})
  await ok('same-transaction late second target sees newly completed state after settings lock',async()=>as(1,async()=>{
    await query('SELECT public.player_save_round_peer_review($1,$2,4,\'\',0)',[round(20),member(2)])
    await db.exec('SAVEPOINT second_review')
    await assert.rejects(()=>query('SELECT public.player_save_round_peer_review($1,$2,4,\'\',0)',[round(20),member(3)]),e=>e.message.includes('PEER_WINDOW_CLOSED'))
    await db.exec('ROLLBACK TO SAVEPOINT second_review')
  }))
  await ok('exemption relations are included in lifecycle preflight',async()=>{
    const preflight=await call(10,'admin_preflight_member_lifecycle',[member(1)])
    assert.equal(preflight.counts.round_review_exemptions,1)
    assert.equal(preflight.counts.round_review_exemption_decisions,2)
    assert.equal(preflight.can_hard_delete,false)
  })
  await no('anonymous cannot execute player gate',()=>call(null,'player_get_registration_review_gate',[round(100)],'anon'),'permission denied')
  await no('player cannot read another member exemption administration',()=>call(1,'admin_get_round_review_requirements',[round(16)]),'PEER_ADMIN_REQUIRED')
  await no('direct private obligation table access is denied',()=>as(1,()=>query('SELECT * FROM private.round_review_exemptions')),'permission denied')
  await no('private evaluator is not directly callable',()=>as(1,()=>query('SELECT registration_review_gate.requirement($1,$2)',[round(16),member(2)])),'permission denied')
  await ok('privacy anonymization clears exemption reasons and audit prose',async()=>{
    await query('UPDATE public.members SET anonymized_at=now() WHERE id=$1',[member(1)])
    assert.equal((await query('SELECT count(*)::int n FROM private.round_review_exemptions WHERE member_id=$1 AND reason IS NOT NULL',[member(1)]))[0].n,0)
    assert.equal((await query('SELECT count(*)::int n FROM private.round_review_exemption_audit WHERE member_id=$1 AND reason IS NOT NULL',[member(1)]))[0].n,0)
  })
  await ok('read-only postflight executes against installed schema',async()=>{
    await db.exec(read('supabase/audits/registration-review-gate-postflight.sql'))
  })
  console.log(`PASS ${passed} isolated registration review gate checks`)
} catch(error) {
  console.error(error.message,error.where??'',error.internalQuery??'')
  process.exitCode=1
} finally { await db.close() }
