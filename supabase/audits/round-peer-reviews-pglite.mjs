// Real PostgreSQL execution against isolated dependency fixtures, never Production.
// Run: PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node supabase/audits/round-peer-reviews-pglite.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const root = fileURLToPath(new URL('../../', import.meta.url))
const db = new PGlite()
const member = n => `10000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const user = n => `20000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const round = n => `30000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const request = n => `40000000-0000-0000-0000-${String(n).padStart(12,'0')}`
let passed = 0
async function ok(name, fn) { await fn(); passed++; console.log('PASS '+name) }
async function no(name, fn, message) {
  await assert.rejects(fn, e => !message || e.message.includes(message), name)
  passed++; console.log('PASS '+name)
}
async function as(n, fn, role='authenticated') {
  await db.exec('BEGIN')
  try {
    await db.exec('SET LOCAL ROLE '+role)
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[n?user(n):''])
    const result = await fn()
    await db.exec('COMMIT')
    return result
  } catch(e) { await db.exec('ROLLBACK'); throw e }
}
async function rpc(n, name, args=[], role='authenticated') {
  return as(n, async()=> (await db.query(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS data`,args)).rows[0].data, role)
}
const settings = (n,enabled,version,from=-60,to=60) => rpc(10,'admin_save_round_peer_review_settings',[
  round(n),enabled,new Date(Date.now()+from*60_000).toISOString(),new Date(Date.now()+to*60_000).toISOString(),version,'实际到场名单确认测试'])
const roster = (n,ids,version) => rpc(10,'admin_confirm_round_peer_review_roster',[round(n),ids.map(member),version,'工作人员核对并确认到场'])
const review = (actor,target,score=4.5,comment='交流愉快',version=0,n=1) => rpc(actor,'player_save_round_peer_review',[round(n),member(target),score,comment,version])
const report = (actor,target,details='具体的活动事实说明至少十个字',version=0,n=1) => rpc(actor,'player_save_round_peer_report',[round(n),member(target),'other',details,version])
const get = (actor,n=1,search='',page=1,size=24) => rpc(actor,'player_get_round_peer_reviews',[round(n),search,page,size])
const editReport = (actor,target,details,version,n=5,category='privacy',requestId=null) => rpc(actor,'player_update_round_peer_report',[round(n),member(target),category,details,version,requestId])
const event = async(actor,n) => (await rpc(actor,'player_list_round_peer_review_events')).events.find(e=>e.round_id===round(n))

try {
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE TABLE public.members(id uuid PRIMARY KEY,user_id uuid UNIQUE,account_status text,status text,membership_type text,anonymized_at timestamptz);
    CREATE TABLE public.admin_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE,role text);
    CREATE TABLE public.member_identity(member_id uuid PRIMARY KEY REFERENCES public.members,full_name text,nickname text);
    CREATE TABLE public.match_rounds(id uuid PRIMARY KEY,round_name text,purpose text,activity_start date,status text);
    CREATE TABLE public.match_round_submissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),round_id uuid REFERENCES public.match_rounds,member_id uuid REFERENCES public.members,cancelled_at timestamptz,UNIQUE(round_id,member_id));
    CREATE TABLE public.mutual_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),overall_score numeric);
    CREATE TABLE public.member_dynamic_stats(member_id uuid PRIMARY KEY,avg_review_score numeric);
    CREATE TABLE private.member_profile_metrics(member_id uuid PRIMARY KEY,compatibility_score numeric);
    CREATE FUNCTION private.member_master_current_admin_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT id FROM public.admin_users WHERE user_id=auth.uid()$$;
    -- Dependency fixture: verifies the existing preflight is preserved and
    -- delegated to, without claiming to replay the unrelated master migration.
    CREATE FUNCTION public.admin_preflight_member_lifecycle(p_member_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
      BEGIN
        IF NOT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=auth.uid() AND role='super_admin') THEN RAISE EXCEPTION 'LEGACY_SUPER_ADMIN_REQUIRED'; END IF;
        RETURN jsonb_build_object('member_id',p_member_id,'legacy_guard_preserved',true,'can_hard_delete',true,'counts',jsonb_build_object('existing_count',7));
      END$$;
    GRANT USAGE ON SCHEMA public,auth,private TO authenticated,anon,service_role;
    GRANT EXECUTE ON FUNCTION public.admin_preflight_member_lifecycle(uuid) TO authenticated;
  `)
  const beforeOid = (await db.query("SELECT 'public.admin_preflight_member_lifecycle(uuid)'::regprocedure::oid AS oid")).rows[0].oid
  const migrationSql=fs.readFileSync(root+'supabase/migrations/20261002165912_round_peer_reviews.sql','utf8')
  await db.exec('ALTER TABLE public.match_round_submissions DROP COLUMN cancelled_at')
  await no('missing cancellation dependency fails before feature installation',()=>db.exec(migrationSql),'PEER_DEPENDENCIES_MISSING')
  await db.exec('ROLLBACK')
  assert.equal((await db.query("SELECT to_regclass('private.round_peer_reviews') AS relation")).rows[0].relation,null)
  await db.exec('ALTER TABLE public.match_round_submissions ADD COLUMN cancelled_at timestamptz')
  await db.exec(migrationSql)
  await ok('complete migration applies and preserves preflight implementation OID',async()=>{
    assert.equal((await db.query("SELECT 'private.peer_review_prior_member_preflight(uuid)'::regprocedure::oid AS oid")).rows[0].oid,beforeOid)
  })
  for(let i=1;i<=9;i++) {
    await db.query('INSERT INTO public.members VALUES($1,$2,$3,$4,$5,$6)',[member(i),user(i),i===6?'suspended':'active',i===7?'pending':'approved',i===8?'staff':'player',i===9?new Date().toISOString():null])
    await db.query('INSERT INTO public.member_identity VALUES($1,$2,$3)',[member(i),i<3?'同名玩家':`玩家${i}`,`昵称${i}`])
  }
  await db.query("INSERT INTO public.admin_users(user_id,role) VALUES($1,'admin'),($2,'super_admin'),($3,'admin')",[user(10),user(11),user(6)])
  for(let i=1;i<=4;i++) await db.query("INSERT INTO public.match_rounds VALUES($1,$2,'registration',current_date,'closed')",[round(i),'单场活动'+i])
  for(let i=1;i<=9;i++) await db.query('INSERT INTO public.match_round_submissions(round_id,member_id,cancelled_at) VALUES($1,$2,$3)',[round(1),member(i),i===5?new Date().toISOString():null])
  await db.exec("INSERT INTO public.mutual_reviews(overall_score) VALUES(3); INSERT INTO public.member_dynamic_stats VALUES('10000000-0000-0000-0000-000000000001',3.2); INSERT INTO private.member_profile_metrics VALUES('10000000-0000-0000-0000-000000000001',4.2)")
  const baseline = JSON.stringify((await db.query("SELECT (SELECT jsonb_agg(t) FROM public.mutual_reviews t) AS reviews,(SELECT jsonb_agg(t) FROM public.member_dynamic_stats t) AS stats,(SELECT jsonb_agg(t) FROM private.member_profile_metrics t) AS metrics")).rows)

  await no('anonymous cannot execute player RPC',()=>rpc(null,'player_list_round_peer_review_events',[],'anon'),'permission denied')
  await no('service role cannot call player API without human identity',()=>rpc(null,'player_list_round_peer_review_events',[],'service_role'),'permission denied')
  await no('missing authenticated identity rejected',()=>rpc(null,'player_list_round_peer_review_events',[]),'PEER_AUTH_REQUIRED')
  await no('player cannot read admin data',()=>rpc(1,'admin_get_round_peer_reviews',[round(1)]),'PEER_ADMIN_REQUIRED')
  await no('suspended linked administrator rejected',()=>rpc(6,'admin_list_round_peer_review_events',[]),'PEER_ADMIN_REQUIRED')
  await ok('existing administrator without player row can configure',async()=>assert.equal((await settings(1,false,0)).version,1))
  await no('opening before confirmed roster rejected',()=>settings(1,true,1),'PEER_ROSTER_REQUIRED')
  await no('stale settings version rejected',()=>settings(1,false,0),'PEER_VERSION_CONFLICT')
  await no('short admin reason rejected',()=>rpc(10,'admin_save_round_peer_review_settings',[round(1),false,new Date().toISOString(),new Date(Date.now()+1000).toISOString(),1,'no']),'PEER_REASON_REQUIRED')
  await no('inverted window rejected',()=>settings(1,false,1,60,-60),'PEER_SETTINGS_INVALID')
  for(const id of [5,6,7,8,9]) await no('cancelled/inactive/unapproved/staff/anonymized excluded '+id,()=>roster(1,[1,id],1),'PEER_NOT_ELIGIBLE')
  await no('duplicate roster rejected',()=>roster(1,[1,1],1),'PEER_ROSTER_REQUIRED')
  await ok('eligible confirmed roster',async()=>assert.equal((await roster(1,[1,2,3,4],1)).version,2))
  await ok('never opened event keeps other names private',async()=>{const data=await get(1);assert.equal(data.participants.length,0);assert.equal(data.total,0);assert.equal(data.participant_count,0);assert.equal(data.eligible,true)})
  await no('closed review denied',()=>review(1,2),'PEER_WINDOW_CLOSED')
  await no('never opened report denied',()=>report(1,2),'PEER_REPORT_UNAVAILABLE')
  await ok('opening confirmed roster',async()=>assert.equal((await settings(1,true,2)).version,3))
  await ok('search by nickname across roster before pagination',async()=>{
    const data=await get(1,1,'昵称4',1,1); assert.equal(data.total,1); assert.equal(data.participants[0].member_id,member(4)); assert.equal(data.participants.length,1);assert.equal(data.participant_count,3)
  })
  await ok('same names remain distinct by member ID and no contact info returned',async()=>{
    const data=await get(3,1,'同名',1,1);assert.equal(data.total,2);assert.equal(data.participants.length,1)
    assert.deepEqual(Object.keys(data.participants[0]).sort(),['full_name','member_id','nickname'])
  })
  await no('invalid pagination rejected',()=>get(1,1,'',0,24),'PEER_PAGINATION_INVALID')
  await no('unconfirmed outsider cannot enumerate names',()=>get(5),'PEER_NOT_ELIGIBLE')
  await no('self rating rejected',()=>review(1,1),'PEER_NOT_ELIGIBLE')
  await no('cross-round target rejected',()=>review(1,2,4,'',0,2),'PEER_NOT_ELIGIBLE')
  for(const score of [0,5.5,4.3,null,'NaN','Infinity']) await no('invalid rating '+score,()=>review(1,2,score),'PEER_SCORE_INVALID')
  await no('comment max length enforced',()=>review(1,2,4,'字'.repeat(501)),'PEER_COMMENT_INVALID')
  const rv=await review(1,2)
  await ok('half score saved',async()=>assert.equal(rv.score,4.5))
  await no('unique pair rejects duplicate insert',()=>review(1,2),'PEER_VERSION_CONFLICT')
  const rv2=await review(1,2,3.5,'修改后评价',rv.version)
  await ok('review revision and optimistic version',async()=>{assert.equal(rv2.version,2);assert.equal(rv2.score,3.5)})
  await no('stale edit cannot overwrite newer score',()=>review(1,2,5,'',rv.version),'PEER_VERSION_CONFLICT')
  await ok('recipient cannot read others reviews',async()=>{const data=await get(2);assert.equal(data.reviews.length,0)})
  await no('report requires details',()=>report(1,3,'短'),'PEER_REPORT_INVALID')
  await no('report long details rejected',()=>report(1,3,'长'.repeat(2001)),'PEER_REPORT_INVALID')
  const rp=await report(1,3)
  await ok('report-only creates no score',async()=>{const data=await get(1);assert.equal(data.reviews.length,1);assert.equal(data.reports.length,1)})
  await ok('report recipient cannot see reporter or complaint',async()=>assert.deepEqual((await get(3)).reports,[]))
  for(const table of ['round_peer_review_settings','round_peer_review_participants','round_peer_reviews','round_peer_reports','round_peer_review_audit']) {
    await no('direct table read denied '+table,()=>as(1,()=>db.query('SELECT * FROM private.'+table)),'permission denied')
    await no('direct table write denied '+table,()=>as(1,()=>db.query('DELETE FROM private.'+table)),'permission denied')
  }
  await ok('RLS enabled and API roles have no table privileges',async()=>{
    const rows=(await db.query("SELECT c.relname,c.relrowsecurity,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS access FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relname IN ('round_peer_review_settings','round_peer_review_participants','round_peer_reviews','round_peer_reports','round_peer_review_audit')")).rows
    assert.equal(rows.length,5);for(const row of rows){assert.equal(row.relrowsecurity,true);assert.equal(row.access,false)}
  })
  await ok('all peer helpers inaccessible, exposed functions authenticated only and fixed search path',async()=>{
    const rows=(await db.query("SELECT n.nspname,p.proname,p.proconfig,has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('service_role',p.oid,'EXECUTE') AS service FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='private' AND p.proname LIKE 'peer_%') OR (n.nspname='public' AND p.proname LIKE '%round_peer_%')")).rows
    assert.ok(rows.length>=20)
    for(const row of rows){assert.equal(row.auth,row.nspname==='public',row.proname);assert.equal(row.anon,false,row.proname);assert.equal(row.service,false,row.proname);assert.ok(row.proconfig.includes('search_path=""'),row.proname)}
  })
  await no('atomic feedback rolls back rating on bad report',()=>rpc(2,'player_submit_round_peer_feedback',[round(1),member(4),5,'同时提交',0,'other','短',0,request(1)]),'PEER_REPORT_INVALID')
  await ok('failed atomic submission left no rating',async()=>assert.equal((await get(2)).reviews.length,0))
  const atomicArgs=[round(1),member(4),4,'原子评价',0,'other','原子举报的具体事实描述',0,request(2)]
  const atomic=await rpc(2,'player_submit_round_peer_feedback',atomicArgs)
  await ok('atomic rating and complaint succeed',async()=>{assert.equal(atomic.review.score,4);assert.equal(atomic.report.status,'pending')})
  await ok('same request retried returns original response without revisions',async()=>assert.deepEqual(await rpc(2,'player_submit_round_peer_feedback',atomicArgs),atomic))
  await no('same key different body refused',()=>rpc(2,'player_submit_round_peer_feedback',[...atomicArgs.slice(0,2),3,...atomicArgs.slice(3)]),'PEER_REQUEST_CONFLICT')
  const moderated=await rpc(10,'admin_resolve_round_peer_report',[rp.id,'resolved','工作人员已核实完成',rp.version,'依据活动现场情况处理'])
  await ok('report moderation stores internal note privately',async()=>{assert.equal(moderated.status,'resolved');assert.equal((await get(1)).reports[0].internal_note,undefined)})
  const rp2=await report(1,3,'补充的新事实信息已经超过十个字',moderated.version)
  await ok('supplements preserve original and reopen pending',async()=>{assert.equal(rp2.details,rp.details);assert.ok(rp.created_at);assert.equal(rp2.created_at,rp.created_at);assert.equal(rp2.supplements.length,1);assert.equal(rp2.status,'pending')})
  await no('stale report update rejected',()=>report(1,3,'另一份补充说明超过十个字',moderated.version),'PEER_VERSION_CONFLICT')
  await ok('expired window closes rating but leaves reporting available',async()=>{
    await settings(1,true,3,-120,-60);const data=await get(1);assert.equal(data.can_review,false);assert.equal(data.can_report,true)
  })
  await no('score edit after deadline rejected',()=>review(1,2,5,'',2),'PEER_WINDOW_CLOSED')
  const rp3=await report(1,3,'截止以后的补充说明超过十个字',rp2.version)
  await ok('report supplement after deadline accepted',async()=>assert.equal(rp3.supplements.length,2))
  await settings(1,false,4,-120,-60)
  await ok('paused previously opened event still allows report',async()=>assert.equal((await get(1)).can_report,true))
  await settings(2,false,0,60,120);await roster(2,[1,2],1);await settings(2,true,2,60,120)
  await ok('future scheduled event does not expose roster names',async()=>assert.deepEqual((await get(1,2)).participants,[]))
  await no('cannot backdate first opening into an already expired window',()=>settings(2,true,3,-120,-60),'PEER_SETTINGS_INVALID')
  await no('future opening cannot report',()=>report(1,2,undefined,0,2),'PEER_REPORT_UNAVAILABLE')
  await no('future opening cannot score',()=>review(1,2,4,'',0,2),'PEER_WINDOW_CLOSED')
  await ok('manual roster permits active participant without signup',async()=>{const detail=await rpc(10,'admin_get_round_peer_reviews',[round(2)]);assert.equal(detail.participants[0].source,'manual')})
  const invalid=await rpc(10,'admin_moderate_round_peer_review',[rv.id,false,2,'互评信息待工作人员复核'])
  await settings(1,true,5)
  await no('author cannot undo moderation by editing',()=>review(1,2,4,'',invalid.version),'PEER_REVIEW_INVALIDATED')
  await rpc(10,'admin_moderate_round_peer_review',[rv.id,true,invalid.version,'工作人员核实恢复有效'])
  await roster(1,[1,2,3],6)
  await ok('removed participant scores preserved invalid',async()=>{
    const detail=await rpc(10,'admin_get_round_peer_reviews',[round(1)]);assert.equal(detail.reviews.find(r=>r.reviewee_id===member(4)).valid,false)
    assert.equal(detail.participants.find(p=>p.member_id===member(4)).included,false)
  })
  await ok('removed author retains own records without roster access',async()=>{const data=await get(2);assert.equal(data.reviews.find(r=>r.reviewee_id===member(4)).valid,false)})
  await no('removed participant cannot submit',()=>review(4,1),'PEER_NOT_ELIGIBLE')
  await db.query('UPDATE public.match_round_submissions SET cancelled_at=now() WHERE round_id=$1 AND member_id=$2',[round(1),member(2)])
  await no('later cancellation removes submission eligibility',()=>review(2,1),'PEER_NOT_ELIGIBLE')
  await ok('cancelled player cannot enumerate roster',async()=>{const data=await get(2);assert.equal(data.participants.length,0);assert.equal(data.can_report,false);assert.equal(data.eligible,false);assert.equal(data.reviews.length,1);assert.equal(data.reports.length,1)})
  await ok('admin and player readers work in READ ONLY transactions',async()=>{
    await db.exec('BEGIN READ ONLY')
    try {
      await db.exec('SET LOCAL ROLE authenticated')
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user(10)])
      await db.query('SELECT public.admin_get_round_peer_reviews($1)',[round(1)])
      await db.query('SELECT public.admin_list_round_peer_review_events()')
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user(1)])
      await db.query('SELECT public.player_get_round_peer_reviews($1)',[round(1)])
      await db.query('SELECT public.player_list_round_peer_review_events()')
      await db.exec('COMMIT')
    } catch(e) {await db.exec('ROLLBACK');throw e}
  })
  await ok('all nine allowed half steps execute in PostgreSQL',async()=>{
    let version=0
    for(const score of [1,1.5,2,2.5,3,3.5,4,4.5,5]) {const saved=await review(3,1,score,'九档输入测试',version);assert.equal(saved.score,score);version=saved.version}
  })
  await ok('RLS independently hides rows even if SELECT is accidentally granted',async()=>{
    await db.exec('GRANT SELECT ON private.round_peer_reports TO authenticated')
    try {assert.equal((await as(3,()=>db.query('SELECT * FROM private.round_peer_reports'))).rows.length,0)}
    finally {await db.exec('REVOKE SELECT ON private.round_peer_reports FROM authenticated')}
  })
  await ok('audit exposes revisions only to admins',async()=>{const detail=await rpc(10,'admin_get_round_peer_reviews',[round(1)]);assert.ok(detail.audit.some(a=>a.action==='review_revised'));assert.ok(detail.audit.some(a=>a.action==='report_moderated'))})

  // Upgrade the original installed feature with existing real review/report
  // rows. Every test below executes PostgreSQL functions rather than mocks.
  const peerSnapshot = async() => JSON.stringify((await db.query(`SELECT
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM private.round_peer_review_settings t) AS settings,
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM private.round_peer_review_participants t) AS participants,
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM private.round_peer_reviews t) AS reviews,
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM private.round_peer_reports t) AS reports,
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM private.round_peer_review_audit t) AS audit`)).rows)
  const existingPeerData=await peerSnapshot()
  const readerOids=(await db.query("SELECT 'public.player_list_round_peer_review_events()'::regprocedure::oid AS list,'public.player_get_round_peer_reviews(uuid,text,integer,integer)'::regprocedure::oid AS detail")).rows
  await db.exec(fs.readFileSync(root+'supabase/migrations/20261003042356_peer_review_history_and_pending_report_edits.sql','utf8'))
  await ok('forward migration preserves all existing data and reader function OIDs',async()=>{
    assert.equal(await peerSnapshot(),existingPeerData)
    assert.deepEqual((await db.query("SELECT 'public.player_list_round_peer_review_events()'::regprocedure::oid AS list,'public.player_get_round_peer_reviews(uuid,text,integer,integer)'::regprocedure::oid AS detail")).rows,readerOids)
  })
  await ok('pre-upgrade feedback also suppresses repeat reminders',async()=>{
    assert.equal((await event(1,1)).has_submitted_feedback,true)
    assert.equal((await event(2,1)).has_submitted_feedback,true) // cancelled author, invalid review
    assert.equal((await event(4,1)).has_submitted_feedback,false)
  })
  for(let i=13;i<=18;i++) {
    await db.query("INSERT INTO public.members VALUES($1,$2,'active','approved','player',NULL)",[member(i),user(i)])
    await db.query('INSERT INTO public.member_identity VALUES($1,$2,$3)',[member(i),`历史玩家${i}`,`历史昵称${i}`])
    await db.query('INSERT INTO public.match_round_submissions(round_id,member_id) VALUES($1,$2)',[round(3),member(i)])
  }
  for(let i=5;i<=7;i++) await db.query("INSERT INTO public.match_rounds VALUES($1,$2,'registration',current_date,'closed')",[round(i),'更新验证活动'+i])
  for(let i=13;i<=18;i++) await db.query('INSERT INTO public.match_round_submissions(round_id,member_id) VALUES($1,$2)',[round(5),member(i)])
  await settings(5,false,0);await roster(5,[13,14,15,16,17,18],1);await settings(5,true,2)
  await settings(6,false,0,60,120);await roster(6,[13,14,15],1);await settings(6,true,2,60,120)
  await settings(7,false,0);await roster(7,[13,14,15],1)
  await ok('empty eligible event has no submitted marker or historical targets',async()=>{
    assert.equal((await event(13,5)).has_submitted_feedback,false)
    assert.deepEqual((await get(13,5)).history_targets,[])
  })
  const historyReview=await review(13,14,4.5,'历史评分验证',0,5)
  let editable=await report(13,14,'原始待处理举报说明至少十个字',0,5)
  await report(13,15,'仅举报对象的事实说明至少十个字',0,5)
  await report(14,13,'只有举报没有评分也已经提交过',0,5)
  const invalidOnly=await review(15,16,3,'之后会标记无效的历史评分',0,5)
  await rpc(10,'admin_moderate_round_peer_review',[invalidOnly.id,false,invalidOnly.version,'工作人员依据事实标记无效'])
  await ok('review only, report only and invalid feedback each set submitted marker for their round',async()=>{
    for(const actor of [13,14,15]) assert.equal((await event(actor,5)).has_submitted_feedback,true)
    assert.equal((await event(16,5)).has_submitted_feedback,false)
    assert.equal((await event(13,6)).has_submitted_feedback,false)
  })
  await ok('history targets deduplicate the review/report union outside current query and page',async()=>{
    const data=await get(13,5,'历史昵称17',9,1)
    assert.equal(data.participants.length,0);assert.equal(data.total,1)
    assert.deepEqual(data.history_targets.map(t=>t.member_id),[member(14),member(15)])
    for(const target of data.history_targets){
      assert.equal(target.full_name,'历史玩家'+Number(target.member_id.slice(-12)))
      assert.equal(target.nickname,'历史昵称'+Number(target.member_id.slice(-12)))
      assert.equal(target.can_review,true);assert.equal(target.can_report,true)
      assert.deepEqual(Object.keys(target).sort(),['can_report','can_review','full_name','member_id','nickname'])
    }
    assert.equal(data.reviews.length,1);assert.equal(data.reports.length,2)
  })
  await ok('invalid historical review forbids editing but retains reporting and eligible name',async()=>{
    const target=(await get(15,5)).history_targets[0]
    assert.equal(target.member_id,member(16));assert.equal(target.full_name,'历史玩家16')
    assert.equal(target.can_review,false);assert.equal(target.can_report,true)
  })
  await no('anonymous cannot execute pending report update',()=>rpc(null,'player_update_round_peer_report',[round(5),member(14),'other','不能由匿名调用的举报正文',1,null],'anon'),'permission denied')
  await no('service role cannot execute pending report update',()=>rpc(null,'player_update_round_peer_report',[round(5),member(14),'other','不能由服务角色调用的举报正文',1,null],'service_role'),'permission denied')
  await no('pending report update derives authenticated actor',()=>editReport(null,14,'不能由未登录调用的举报正文',1),'PEER_AUTH_REQUIRED')
  await no('another eligible player cannot edit the author report',()=>editReport(16,14,'其他玩家无法覆盖现有举报正文',1),'PEER_REPORT_NOT_FOUND')
  await no('pending report update rejects self target',()=>editReport(13,13,'玩家不能对自己提交举报正文',1),'PEER_NOT_ELIGIBLE')
  await no('pending report update rejects outsider target',()=>editReport(13,1,'对象不在本次已经确认的名单',1),'PEER_NOT_ELIGIBLE')
  for(const value of ['short','字'.repeat(2001),null]) await no('pending report body length validation '+String(value).length,()=>editReport(13,14,value,1),'PEER_REPORT_INVALID')
  await no('pending report category validation',()=>editReport(13,14,'有效的举报具体事实说明内容',1,5,'invalid'),'PEER_REPORT_INVALID')
  for(const version of [0,null,2]) await no('pending report expected version validation '+version,()=>editReport(13,14,'有效的举报具体事实说明内容',version),'PEER_VERSION_CONFLICT')
  const editArgs=[round(5),member(14),'privacy','  修改后的隐私举报具体说明内容  ',editable.version,request(100)]
  const editResult=await rpc(13,'player_update_round_peer_report',editArgs)
  await ok('pending report edit replaces body/category with full audit and safe return',async()=>{
    const updated=editResult.report
    assert.equal(editResult.review,null);assert.equal(updated.details,'修改后的隐私举报具体说明内容')
    assert.equal(updated.category,'privacy');assert.equal(updated.version,editable.version+1)
    assert.equal(updated.created_at,editable.created_at);assert.deepEqual(updated.supplements,[])
    assert.equal(updated.status,'pending');assert.equal(updated.internal_note,undefined);assert.equal(updated.reporter_id,undefined)
    const audit=(await db.query("SELECT * FROM private.round_peer_review_audit WHERE action='report_updated' AND subject_id=$1",[editable.id])).rows
    assert.equal(audit.length,1);assert.equal(audit[0].before_values.details,editable.details)
    assert.equal(audit[0].after_values.details,updated.details);assert.equal(audit[0].after_values.version,updated.version)
    assert.equal(audit[0].actor_member_id,member(13));assert.equal(audit[0].request_id,request(100))
  })
  editable=editResult.report
  await ok('exact update retry has identical receipt and makes no additional revision or audit',async()=>{
    const snapshot=await peerSnapshot()
    assert.deepEqual(await rpc(13,'player_update_round_peer_report',editArgs),editResult)
    assert.equal(await peerSnapshot(),snapshot)
  })
  await no('same update request ID cannot submit changed payload',()=>rpc(13,'player_update_round_peer_report',[...editArgs.slice(0,3),'另一个正文不能重用原来的请求标识',...editArgs.slice(4)]),'PEER_REQUEST_CONFLICT')
  await no('submit endpoint cannot reuse an update request ID',()=>rpc(13,'player_submit_round_peer_feedback',[round(5),member(14),null,'',0,'other','不同端点无法重用相同的请求标识',editable.version,request(100)]),'PEER_REQUEST_CONFLICT')
  await no('old pending report version cannot overwrite a committed edit',()=>editReport(13,14,'持有旧版本的编辑不得覆盖新内容',1),'PEER_VERSION_CONFLICT')
  const submitOnlyArgs=[round(5),member(16),null,'',0,'other','通过原接口单独提交另一份举报',0,request(101)]
  const submitOnly=await rpc(13,'player_submit_round_peer_feedback',submitOnlyArgs)
  await no('update endpoint cannot reuse submit request ID',()=>editReport(13,16,'另一种调用也不能重复使用请求标识',submitOnly.report.version,5,'privacy',request(101)),'PEER_REQUEST_CONFLICT')
  for(const status of ['reviewing','resolved','dismissed']) {
    editable=await rpc(10,'admin_resolve_round_peer_report',[editable.id,status,'管理员内部处理说明不会向玩家公开',editable.version,'工作人员根据现场记录进行处理'])
    await no('pending body edit refuses '+status,()=>editReport(13,14,'处理中或处理后不得替换原举报正文',editable.version),'PEER_REPORT_NOT_EDITABLE')
    editable=await report(13,14,'处理后仍然可以追加补充事实说明',editable.version,5)
    await ok('legacy supplement reopens '+status+' without replacing edited body',async()=>{
      assert.equal(editable.status,'pending');assert.equal(editable.category,'privacy');assert.equal(editable.details,editResult.report.details)
    })
  }
  await ok('late retry returns original receipt after moderation and supplements without overwriting them',async()=>{
    const snapshot=await peerSnapshot()
    assert.deepEqual(await rpc(13,'player_update_round_peer_report',editArgs),editResult)
    assert.equal(await peerSnapshot(),snapshot)
  })
  const previousSupplements=editable.supplements
  const editedAgain=await editReport(13,14,'保留三份补充说明仅修改待处理正文',editable.version,5,'disruption',request(102))
  await ok('pending body edits preserve existing supplements and original creation time',async()=>{
    assert.equal(editedAgain.report.category,'disruption');assert.deepEqual(editedAgain.report.supplements,previousSupplements)
    assert.equal(editedAgain.report.created_at,editable.created_at)
  })
  editable=editedAgain.report
  await settings(5,true,3,-120,-60)
  await ok('expired history retains eligible names and reports while disabling rating edits',async()=>{
    for(const target of (await get(13,5)).history_targets){assert.equal(target.can_review,false);assert.equal(target.can_report,true);assert.ok(target.full_name)}
  })
  editable=(await editReport(13,14,'截止后仍可以修正尚未处理的举报正文',editable.version)).report
  await settings(5,false,4,-120,-60)
  await ok('paused previously opened round still accepts pending report edits',async()=>{
    editable=(await editReport(13,14,'暂停评分期间仍可修正待处理举报正文',editable.version)).report
    assert.equal((await get(13,5)).history_targets.find(t=>t.member_id===member(14)).can_report,true)
  })
  // Trusted legacy fixtures demonstrate that histories alone must not reveal
  // identities in events that have never been open.
  for(const n of [6,7]) await db.query("INSERT INTO private.round_peer_reports(round_id,reporter_id,reviewee_id,category,details) VALUES($1,$2,$3,'other','迁移前历史保留的测试举报事实说明')",[round(n),member(13),member(14)])
  for(const n of [6,7]) {
    await ok('never-opened historical target stays nameless round '+n,async()=>{
      const data=await get(13,n);assert.equal(data.reports.length,1);assert.deepEqual(data.participants,[])
      assert.deepEqual(data.history_targets,[{member_id:member(14),full_name:'',nickname:null,can_review:false,can_report:false}])
      assert.equal((await event(13,n)).has_submitted_feedback,true)
    })
    await no('never-opened historical report cannot be edited round '+n,()=>editReport(13,14,'未开放场次无法修改历史举报信息',1,n),'PEER_REPORT_UNAVAILABLE')
  }
  await roster(5,[13,14,16,17,18],5)
  await ok('removed target history remains readable but identity and actions are hidden',async()=>{
    const data=await get(13,5,'查不到的昵称',8,1)
    assert.ok(data.reports.some(r=>r.reviewee_id===member(15)))
    assert.deepEqual(data.history_targets.find(t=>t.member_id===member(15)),{member_id:member(15),full_name:'',nickname:null,can_review:false,can_report:false})
    assert.equal((await event(15,5)).has_submitted_feedback,true)
    for(const target of (await get(15,5)).history_targets){assert.equal(target.full_name,'');assert.equal(target.nickname,null);assert.equal(target.can_report,false)}
  })
  await no('removed target cannot receive pending report edit',()=>editReport(13,15,'移出名单之后不得再修改相关举报',1),'PEER_NOT_ELIGIBLE')
  await db.query('UPDATE public.match_round_submissions SET cancelled_at=now() WHERE round_id=$1 AND member_id=$2',[round(5),member(16)])
  await ok('cancelled target history remains but loses names and edit eligibility',async()=>{
    assert.deepEqual((await get(13,5)).history_targets.find(t=>t.member_id===member(16)),{member_id:member(16),full_name:'',nickname:null,can_review:false,can_report:false})
  })
  await no('cancelled target pending report cannot be edited',()=>editReport(13,16,'取消报名对象不得修改现有举报正文',submitOnly.report.version),'PEER_NOT_ELIGIBLE')
  await db.query("UPDATE public.members SET anonymized_at=now(),account_status='closed' WHERE id=$1",[member(14)])
  await ok('anonymization redacts history identity, complaint text and update audit snapshots',async()=>{
    const data=await get(13,5)
    assert.deepEqual(data.history_targets.find(t=>t.member_id===member(14)),{member_id:member(14),full_name:'',nickname:null,can_review:false,can_report:false})
    const scrubbed=data.reports.find(r=>r.reviewee_id===member(14));assert.equal(scrubbed.details,null);assert.deepEqual(scrubbed.supplements,[])
    assert.equal((await event(13,5)).has_submitted_feedback,true)
    const audit=(await db.query("SELECT * FROM private.round_peer_review_audit WHERE action='report_updated' AND subject_id=$1",[editable.id])).rows
    assert.ok(audit.length>=4)
    for(const row of audit){assert.deepEqual(row.before_values,{});assert.deepEqual(row.after_values,{});assert.equal(row.payload_hash,null)}
  })
  await no('old idempotent update cannot resurrect anonymized report snapshots',()=>rpc(13,'player_update_round_peer_report',editArgs),'PEER_REQUEST_CONFLICT')
  await no('fresh pending update rejects anonymized target',()=>editReport(13,14,'匿名化之后不能重新引入举报正文',editable.version),'PEER_NOT_ELIGIBLE')
  await db.query('UPDATE public.match_round_submissions SET cancelled_at=now() WHERE round_id=$1 AND member_id=$2',[round(5),member(13)])
  await ok('cancelled author keeps own history without any target identities',async()=>{
    const data=await get(13,5);assert.equal(data.eligible,false);assert.equal(data.reports.length,3);assert.equal(data.reviews.length,1)
    for(const target of data.history_targets){assert.equal(target.full_name,'');assert.equal(target.nickname,null);assert.equal(target.can_review,false);assert.equal(target.can_report,false)}
    assert.equal((await event(13,5)).has_submitted_feedback,true)
  })
  await ok('new history readers remain valid in a READ ONLY transaction',async()=>{
    await db.exec('BEGIN READ ONLY')
    try {
      await db.exec('SET LOCAL ROLE authenticated')
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user(13)])
      await db.query('SELECT public.player_get_round_peer_reviews($1,$2,$3,$4)',[round(5),'missing',9,1])
      await db.query('SELECT public.player_list_round_peer_review_events()')
      await db.exec('COMMIT')
    } catch(e) {await db.exec('ROLLBACK');throw e}
  })

  await no('ordinary admin retains legacy lifecycle restriction',()=>rpc(10,'admin_preflight_member_lifecycle',[member(1)]),'LEGACY_SUPER_ADMIN_REQUIRED')
  await ok('preflight adds business counts and denies hard delete',async()=>{const data=await rpc(11,'admin_preflight_member_lifecycle',[member(1)]);assert.equal(data.can_hard_delete,false);assert.equal(data.legacy_guard_preserved,true);assert.equal(data.counts.existing_count,7);assert.ok(data.counts.round_peer_reports_written>0)})
  await no('FK prevents deleting member with peer data',()=>db.query('DELETE FROM public.members WHERE id=$1',[member(1)]),'foreign key')
  await no('FK prevents deleting configured round',()=>db.query('DELETE FROM public.match_rounds WHERE id=$1',[round(1)]),'foreign key')
  await db.query("UPDATE public.members SET anonymized_at=now(),account_status='closed' WHERE id=$1",[member(3)])
  await ok('anonymization clears free text, revisions and roster access',async()=>{
    const reports=(await db.query('SELECT * FROM private.round_peer_reports WHERE reviewee_id=$1',[member(3)])).rows
    assert.ok(reports.length);for(const row of reports){assert.equal(row.details,null);assert.deepEqual(row.supplements,[]);assert.equal(row.internal_note,null)}
    const audit=(await db.query('SELECT * FROM private.round_peer_review_audit WHERE subject_id=$1',[rp.id])).rows
    assert.ok(audit.length);for(const row of audit){assert.deepEqual(row.before_values,{});assert.deepEqual(row.after_values,{});assert.equal(row.reason,null)}
    assert.equal((await db.query('SELECT included FROM private.round_peer_review_participants WHERE round_id=$1 AND member_id=$2',[round(1),member(3)])).rows[0].included,false)
  })
  await no('admin cannot reintroduce a participant audit note after anonymization',()=>rpc(10,'admin_set_round_peer_review_participant',[round(1),member(3),false,'匿名后再次写入对象说明']),'PEER_NOT_ELIGIBLE')
  await no('anonymized actor cannot read previously authored feedback',()=>get(3),'PEER_AUTH_REQUIRED')
  await no('cannot reintroduce complaint on anonymized target',()=>report(1,3,'匿名之后试图补充举报的信息',rp3.version),'PEER_NOT_ELIGIBLE')
  await ok('legacy metrics and mutual reviews remain byte-for-byte unchanged',async()=>{
    assert.equal(JSON.stringify((await db.query("SELECT (SELECT jsonb_agg(t) FROM public.mutual_reviews t) AS reviews,(SELECT jsonb_agg(t) FROM public.member_dynamic_stats t) AS stats,(SELECT jsonb_agg(t) FROM private.member_profile_metrics t) AS metrics")).rows),baseline)
  })
  await ok('audit actor snapshot does not block removing an administrator role',async()=>{
    const adminId=(await db.query("INSERT INTO public.admin_users(user_id,role) VALUES($1,'admin') RETURNING id",[user(12)])).rows[0].id
    await rpc(12,'admin_resolve_round_peer_report',[atomic.report.id,'reviewing','工作人员继续核实情况',atomic.report.version,'依据现场记录跟进举报'])
    await db.query('DELETE FROM public.admin_users WHERE id=$1',[adminId])
    assert.equal((await db.query('SELECT count(*)::integer AS n FROM private.round_peer_review_audit WHERE actor_admin_id=$1',[adminId])).rows[0].n,1)
  })
  await ok('read-only release inventory has no failing check',async()=>{
    const results=await db.exec(fs.readFileSync(root+'supabase/audits/round-peer-reviews-postflight.sql','utf8'))
    for(const result of results) for(const row of result.rows??[]) assert.equal(row.ok,true,JSON.stringify(row))
  })
  console.log(`All ${passed} peer-review database checks passed`)
} finally { await db.close() }
