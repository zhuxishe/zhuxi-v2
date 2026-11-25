// Real SQL migration/ACL/aggregation regression in isolated PGlite. Reuses the
// established gate dependency fixture; no production/network calls or writes.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const root = fileURLToPath(new URL('../../', import.meta.url))
const prior = readFileSync(root + 'supabase/audits/registration-review-gate-pglite.mjs', 'utf8')
const marker = '  // Existing historical, clean draft, and previously-used draft scope.'
assert.ok(prior.includes(marker), 'dependency fixture boundary')
const setup = prior.slice(0, prior.indexOf(marker))
  .replace(/^import .*$/gm, '')
  .replace(/^const \{ PGlite \} = .*$/m, '')
  .replace(/^const root = .*$/m, 'const root = auditRoot')
const tests = String.raw`
  await db.exec("ALTER TABLE public.admin_users ADD COLUMN name text; ALTER TABLE public.members ADD COLUMN member_number text; ALTER TABLE private.member_profile_metrics ADD COLUMN compatibility_status text DEFAULT 'published', ADD COLUMN score_source text DEFAULT 'initial', ADD COLUMN internal_note text DEFAULT '初始分', ADD COLUMN published_at timestamptz DEFAULT now(), ADD COLUMN updated_at timestamptz DEFAULT now(), ADD COLUMN published_by uuid, ADD COLUMN updated_by uuid")
  for(const n of [1,2,3]) {
    await createRound(n,{config:eventConfig(120)});await peerSetup(n,[1,2,3,4,5,6,7,8,9,10,11,12,13,14])
  }
  await db.exec(read('supabase/migrations/20261105095725_registration_review_gate.sql'))
  await db.exec(read('supabase/migrations/20261117090302_unified_activity_peer_scores.sql'))
  for(let n=1;n<=14;n++) await query('UPDATE public.members SET member_number=$2 WHERE id=$1',[member(n),'ZX'+String(n).padStart(3,'0')])
  await query("UPDATE public.member_identity SET full_name='陈甲',nickname='小竹' WHERE member_id=$1",[member(1)])
  await query("UPDATE public.member_identity SET full_name='陈乙',nickname='唯一昵称' WHERE member_id IN($1,$2)",[member(2),member(5)])
  const received=[]
  for(const [n,value] of [[1,5],[2,4.5],[3,4]]) received.push(await review(4,1,n,value))
  const low=await review(5,1,1,1)
  await call(5,'player_save_round_peer_review',[round(1),member(1),1,'真实原始留言，不要代写或摘要',low.version])
  const invalid=await review(3,1,2,2)
  const invalidOne=await call(11,'admin_moderate_round_peer_review',[invalid.id,false,invalid.version,'第一次作废原因'])
  const restored=await call(11,'admin_moderate_round_peer_review',[invalid.id,true,invalidOne.version,'核实后恢复有效评分'])
  await call(11,'admin_moderate_round_peer_review',[invalid.id,false,restored.version,'最近一次作废的具体原因'])
  const second=await review(4,2,1,5)
  await review(4,5,1,5)
  const onlyInvalid=await review(4,3,1,3)
  await call(11,'admin_moderate_round_peer_review',[onlyInvalid.id,false,onlyInvalid.version,'无效记录不形成个人试算'])
  await review(6,1,1,1)
  await review(8,7,1,4)
  await call(5,'player_save_round_peer_report',[round(1),member(1),'other','REPORT_SECRET_NOT_FOR_SCORE_DIRECTORY',0])
  await query("UPDATE private.round_peer_reviews SET created_at=CASE WHEN reviewee_id=$1 THEN '2026-01-01'::timestamptz WHEN reviewee_id=$2 THEN '2026-01-02'::timestamptz WHEN reviewee_id=$3 THEN '2026-01-03'::timestamptz ELSE '2025-01-01'::timestamptz END,updated_at=now()",[member(1),member(2),member(5)])
  await query("UPDATE public.members SET is_test=true WHERE id IN($1,$2)",[member(6),member(14)])
  await query("UPDATE public.members SET record_scope='historical' WHERE id=$1",[member(8)])
  await query("UPDATE public.members SET account_status='closed' WHERE id=$1",[member(9)])
  await query("UPDATE public.members SET membership_type='staff' WHERE id=$1",[member(12)])
  await query('UPDATE public.members SET user_id=NULL WHERE id=$1',[member(13)])
  await query("INSERT INTO private.member_profile_metrics(member_id,compatibility_score,compatibility_status,score_source,internal_note) VALUES($1,4.7,'published','manual','运营原有备注；不是个人互评试算')",[member(1)])
  await query("UPDATE public.admin_users SET name='真实指标维护者' WHERE user_id=$1",[user(10)])
  await query('UPDATE private.member_profile_metrics SET published_by=(SELECT id FROM public.admin_users WHERE user_id=$2),updated_by=(SELECT id FROM public.admin_users WHERE user_id=$2) WHERE member_id=$1',[member(1),user(10)])
  for(const n of [4,5,6]) await createRound(n,{config:eventConfig(120)})
  await signup(4,1);await signup(5,1)
  const cancelling=(await query('SELECT updated_at FROM public.match_round_submissions WHERE round_id=$1 AND member_id=$2',[round(5),member(1)]))[0]
  await call(1,'manage_my_registration',[round(5),'cancel',cancelling.updated_at,0,{}])
  await call(11,'admin_set_round_peer_review_participant',[round(6),member(1),false,'仅历史名册关联，不确认实际参与'])
  const oldScores=new Map()
  for(let n=1;n<=14;n++) oldScores.set(n,await call(11,'admin_get_member_peer_score',[member(n)]))
  const fingerprint=async()=>query("SELECT md5(COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY id)::text FROM private.round_peer_reviews r),'')) reviews,md5(COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY id)::text FROM private.round_peer_reports r),'')) reports,md5(COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY member_id)::text FROM private.member_profile_metrics r),'')) metrics")
  const before=await fingerprint()
  await db.exec(read('supabase/migrations/20261118094142_admin_peer_score_directory.sql'))
  const list=(actor=10,{search='',page=1,size=30,sort='latest_review_at',direction='desc',status='all'}={})=>call(actor,'admin_list_member_peer_scores',[search,page,size,sort,direction,status])
  const detail=(m,actor=10,{validity='valid',page=1,size=20,activity=null}={})=>call(actor,'admin_get_member_peer_score_detail',[member(m),validity,page,size,activity===null?null:round(activity)])
  await ok('migration and first reads never change any score/report/profile data',async()=>assert.deepEqual(await fingerprint(),before))
  await ok('existing member-score RPC retains its exact released JSON for every fixture member',async()=>{
    for(const [n,value] of oldScores) assert.deepEqual(await call(11,'admin_get_member_peer_score',[member(n)]),value,'member '+n)
  })
  const eligibleIds=[1,2,3,4,5,7,10,11,13].map(member)
  await ok('directory includes all current formal active players including unrated, excluding other scopes',async()=>{
    const v=await list();assert.equal(v.total,eligibleIds.length);assert.deepEqual(v.members.map(m=>m.member_id).sort(),[...eligibleIds].sort())
    const empty=v.members.find(m=>m.member_id===member(3));assert.equal(empty.score,null);assert.equal(empty.sample_status,'unrated');assert.equal(empty.review_count,0)
  })
  await ok('unbound but approved active current player remains an unrated directory and detail entry',async()=>{
    const row=(await list()).members.find(m=>m.member_id===member(13));assert.ok(row);assert.equal(row.score,null)
    assert.equal((await detail(13)).member.member_id,member(13))
  })
  await ok('directory and detail summaries equal the established personal formula and counts',async()=>{
    const v=await list()
    for(const row of v.members){const old=oldScores.get(Number(row.member_id.slice(-12)));const d=await detail(Number(row.member_id.slice(-12)))
      for(const key of ['score','reviewer_count','activity_count','review_count']){assert.equal(row[key],old[key]);assert.equal(d.summary[key],old[key])}
      assert.equal(d.summary.eligible_for_publication,old.eligible_for_publication)
    }
    assert.equal(v.members.find(m=>m.member_id===member(1)).score,2.8)
  })
  await ok('score descending has stable UUID tiebreak and puts every scored member first',async()=>{
    const v=await list(10,{sort:'score'});assert.deepEqual(v.members.slice(0,4).map(m=>m.member_id),[2,5,7,1].map(member))
    assert.ok(v.members.slice(4).every(m=>m.score===null))
  })
  await ok('ascending score still keeps unrated players last',async()=>{
    const v=await list(10,{sort:'score',direction:'asc'});assert.deepEqual(v.members.slice(0,4).map(m=>m.member_id),[1,7,2,5].map(member))
    assert.ok(v.members.slice(4).every(m=>m.score===null))
  })
  await ok('different-reviewer sort uses distinct people, not review count',async()=>{
    const v=await list(10,{sort:'reviewer_count'});assert.equal(v.members[0].member_id,member(1));assert.equal(v.members[0].reviewer_count,2)
  })
  await ok('latest review means original creation, not later editing time',async()=>{
    const v=await list(10,{sort:'latest_review_at'});assert.deepEqual(v.members.slice(0,4).map(m=>m.member_id),[5,2,1,7].map(member))
    assert.ok(v.members[0].latest_review_at.startsWith('2026-01-03'))
  })
  await ok('name nickname and membership-number searches work without leaking unrelated data',async()=>{
    assert.deepEqual((await list(10,{search:'小竹'})).members.map(m=>m.member_id),[member(1)])
    assert.deepEqual((await list(10,{search:'ZX002'})).members.map(m=>m.member_id),[member(2)])
    assert.equal((await list(10,{search:' 陈乙 '})).total,2)
    assert.equal((await list(10,{search:'zx002'})).total,1)
    assert.equal((await list(10,{search:'%'})).total,0)
  })
  await ok('ordinary admin retains the original member-number privacy boundary',async()=>{
    const v=await list(11);assert.equal(v.can_view_member_number,false);assert.ok(v.members.every(m=>m.member_number===null))
    assert.equal((await list(11,{search:'ZX002'})).total,0)
    assert.equal((await detail(2,11)).member.member_number,null)
    assert.equal((await list(10)).can_view_member_number,true)
  })
  await ok('sample status filters are qualification-only and include unrated players',async()=>{
    assert.deepEqual((await list(10,{status:'ready'})).members.map(m=>m.member_id),[member(1)])
    assert.equal((await list(10,{status:'accumulating'})).total,3)
    assert.equal((await list(10,{status:'unrated'})).total,5)
  })
  await ok('pagination returns exact totals, stable nonoverlapping pages and an empty overflow page',async()=>{
    const ids=[];for(let page=1;page<=5;page++){const v=await list(10,{page,size:2});assert.equal(v.total,9);assert.equal(v.members.length,Math.min(2,9-(page-1)*2));ids.push(...v.members.map(m=>m.member_id))}
    assert.deepEqual(ids,(await list()).members.map(m=>m.member_id));assert.equal(new Set(ids).size,9)
    assert.deepEqual((await list(10,{page:20,size:2})).members,[])
  })
  await ok('detail returns original comments, reviewer identity, original activity dates and separate timestamps',async()=>{
    const d=await detail(1);const row=d.reviews.find(r=>r.review_id===low.id)
    assert.equal(row.comment,'真实原始留言，不要代写或摘要');assert.equal(row.reviewer_nickname,'唯一昵称')
    assert.equal(row.activity_start,'2026-11-04');assert.equal(row.activity_end,'2026-11-17')
    assert.ok(row.created_at.startsWith('2026-01-01'));assert.notEqual(row.updated_at,row.created_at)
    assert.equal(row.valid,true);assert.equal(row.latest_invalidation_reason,null)
  })
  await ok('invalid toggle includes the original invalid score and only the latest invalidation reason',async()=>{
    const d=await detail(1,10,{validity:'invalid'});assert.equal(d.total,1);assert.equal(d.reviews[0].review_id,invalid.id)
    assert.equal(d.reviews[0].score,2);assert.equal(d.reviews[0].latest_invalidation_reason,'最近一次作废的具体原因');assert.ok(d.reviews[0].invalidated_at)
    assert.equal(d.summary.score,2.8);assert.equal(d.summary.review_count,4)
    assert.equal((await detail(1,10,{validity:'all'})).total,5)
    assert.equal((await detail(3,10,{validity:'invalid'})).total,1)
  })
  await ok('detail pagination remains bounded independently of summary',async()=>{
    const first=await detail(1,10,{size:2});const next=await detail(1,10,{size:2,page:2})
    assert.equal(first.total,4);assert.equal(next.total,4);assert.equal(first.reviews.length,2);assert.equal(next.reviews.length,2)
    assert.equal(new Set([...first.reviews,...next.reviews].map(r=>r.review_id)).size,4)
  })
  await ok('activity filtering and pagination never change the all-history score or grouping summaries',async()=>{
    const all=await detail(1,10,{validity:'all'});const selected=await detail(1,10,{activity:2,size:1})
    assert.equal(selected.total,1);assert.equal(selected.reviews.length,1);assert.equal(selected.reviews[0].round_id,round(2))
    assert.deepEqual(selected.summary,all.summary);assert.deepEqual(selected.reviewer_summaries,all.reviewer_summaries)
    assert.deepEqual(selected.activity_summaries,all.activity_summaries)
    const repeated=selected.reviewer_summaries.find(r=>r.reviewer_id===member(4));assert.equal(repeated.score,4.5);assert.equal(repeated.review_count,3)
    const activity=selected.activity_summaries.find(r=>r.round_id===round(2));assert.equal(activity.review_count,1);assert.equal(activity.invalid_review_count,1)
    assert.equal(activity.average_score,4.5)
    assert.equal((await detail(1,10,{activity:999})).total,0)
  })
  await ok('activity overview includes zero-score registrations and distinguishes cancellation/roster from attendance',async()=>{
    const activities=(await detail(1)).activity_summaries
    assert.equal(activities.length,6);assert.equal(new Set(activities.map(a=>a.round_id)).size,6)
    const active=activities.find(a=>a.round_id===round(4));assert.equal(active.registration_status,'active');assert.equal(active.review_count,0);assert.equal(active.average_score,null)
    const cancelled=activities.find(a=>a.round_id===round(5));assert.equal(cancelled.registration_status,'cancelled');assert.equal(cancelled.in_review_roster,true);assert.equal(cancelled.roster_included,true)
    const removed=activities.find(a=>a.round_id===round(6));assert.equal(removed.registration_status,'none');assert.equal(removed.in_review_roster,true);assert.equal(removed.roster_included,false);assert.equal(removed.roster_source,'manual')
    assert.ok(activities.every(a=>!('attended' in a)&&!('checked_in' in a)))
    const empty=await detail(1,10,{activity:4});assert.equal(empty.total,0);assert.equal(empty.summary.score,2.8);assert.equal(empty.activity_summaries.length,6)
  })
  await ok('operational public score and notes are read-only distinct source data',async()=>{
    const d=await detail(1);assert.equal(d.operational_score.score,4.7);assert.equal(d.operational_score.status,'published')
    assert.equal(d.operational_score.source,'manual');assert.equal(d.operational_score.internal_note,'运营原有备注；不是个人互评试算')
    assert.equal(d.summary.score,2.8);assert.equal((await detail(2)).operational_score,null)
    assert.equal(d.operational_score.published_by_name,'真实指标维护者');assert.equal(d.operational_score.updated_by_name,'真实指标维护者')
    assert.equal('published_by' in d.operational_score,false);assert.equal('updated_by' in d.operational_score,false)
    assert.equal('note_author' in d.operational_score,false)
  })
  await ok('neither list nor any detail mode exposes reports, report notes or request payloads',async()=>{
    const text=JSON.stringify([await list(),await detail(1),await detail(1,10,{validity:'all'})])
    for(const secret of ['REPORT_SECRET_NOT_FOR_SCORE_DIRECTORY','reporter_id','report_status','supplements','payload_hash','before_values','after_values']) assert.ok(!text.includes(secret),secret)
  })
  for(const actor of [1,12]) {
    await no('non-admin/moderator cannot list scores '+actor,()=>list(actor),'PEER_ADMIN_REQUIRED')
    await no('non-admin/moderator cannot read detail '+actor,()=>detail(1,actor),'PEER_ADMIN_REQUIRED')
  }
  await no('anonymous cannot invoke list',()=>call(null,'admin_list_member_peer_scores',[],'anon'),'permission denied')
  await no('service role has no new directory RPC access',()=>call(null,'admin_list_member_peer_scores',[],'service_role'),'permission denied')
  await no('direct internal source is not granted to app users',()=>as(11,()=>query('SELECT * FROM unified_peer_review.score_review_rows(NULL,\'all\')')),'permission denied')
  await no('invalid page is rejected',()=>list(10,{page:0}),'PEER_DIRECTORY_PAGINATION_INVALID')
  await no('oversized page is rejected',()=>list(10,{size:101}),'PEER_DIRECTORY_PAGINATION_INVALID')
  await no('unknown sort cannot enter SQL',()=>list(10,{sort:'score; DELETE FROM public.members'}),'PEER_DIRECTORY_FILTER_INVALID')
  await no('unknown sample filter is rejected',()=>list(10,{status:'published'}),'PEER_DIRECTORY_FILTER_INVALID')
  await no('oversized search is rejected',()=>list(10,{search:'a'.repeat(101)}),'PEER_DIRECTORY_FILTER_INVALID')
  await no('invalid review selector is rejected',()=>detail(1,10,{validity:'reports'}),'PEER_DIRECTORY_FILTER_INVALID')
  for(const n of [6,8,9,12,14]) await no('directory details cannot bypass excluded member scope '+n,()=>detail(n),'PEER_DIRECTORY_MEMBER_NOT_FOUND')
  await ok('directory remains readable inside a READ ONLY transaction',async()=>as(11,async()=>{
    await db.exec('SET TRANSACTION READ ONLY')
    assert.ok((await query("SELECT public.admin_list_member_peer_scores() value"))[0].value.members.length)
    assert.equal((await query('SELECT public.admin_get_member_peer_score_detail($1) value',[member(1)]))[0].value.summary.score,2.8)
  }))
  await ok('all administrator reading leaves business records byte-identical',async()=>assert.deepEqual(await fingerprint(),before))
  // Exit of an evaluator removes that evaluator from the current-player list,
  // not from other people's valid historical experience.
  await query("UPDATE public.members SET account_status='closed' WHERE id=$1",[member(4)])
  await ok('ordinary evaluator exit does not change recipients historical score',async()=>{
    assert.equal((await detail(1)).summary.score,2.8);assert.equal((await list()).total,8)
    assert.equal((await call(11,'admin_get_member_peer_score',[member(1)])).score,2.8)
  })
  await query('UPDATE public.members SET anonymized_at=now() WHERE id=$1',[member(5)])
  await ok('anonymization removes the evaluator and scrubbed scores from both source and directory summaries',async()=>{
    assert.equal((await detail(1)).summary.score,4.5)
    assert.equal((await detail(1,10,{validity:'all'})).reviews.some(r=>r.reviewer_id===member(5)),false)
    assert.equal((await call(11,'admin_get_member_peer_score',[member(1)])).score,4.5)
  })
  await ok('ACLs expose only the two new authenticated admin-checked entrypoints',async()=>{
    const signatures=['unified_peer_review.score_review_rows(uuid[],text)','unified_peer_review.score_summary(uuid[])','unified_peer_review.list_member_scores(text,integer,integer,text,text,text)','unified_peer_review.member_score_detail(uuid,text,integer,integer,uuid)']
    for(const [index,fn] of signatures.entries()) {
      const acl=(await query("SELECT has_function_privilege('authenticated',$1,'EXECUTE') a,has_function_privilege('anon',$1,'EXECUTE') n,has_function_privilege('service_role',$1,'EXECUTE') s",[fn]))[0]
      assert.equal(acl.a,index>=2);assert.equal(acl.n,false);assert.equal(acl.s,false)
    }
  })
  // Ensure list payload size stays page-bounded with a substantially larger
  // all-player universe. The aggregate is one shared set query, never per-row RPCs.
  await query("INSERT INTO public.members(id,user_id,status,account_status,member_number) SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'approved','active','LOAD'||n FROM generate_series(1000,1999) n")
  await ok('large unrated population is included without expanding a 30-row payload',async()=>{
    const v=await list();assert.equal(v.total,1007);assert.equal(v.members.length,30)
    assert.ok(v.members.every(row=>!('sources' in row)&&!('reviews' in row)))
  })

  const readers = [
    ['admin_list_member_peer_scores', [], 'unified_peer_review.list_member_scores()'],
    ['admin_get_member_peer_score_detail', [member(1)], 'unified_peer_review.member_score_detail($1)'],
    ['admin_get_member_peer_score', [member(1)], 'unified_peer_review.member_peer_score($1)'],
  ]
  const superAdminResults = []
  for (const [name, args] of readers) superAdminResults.push(await call(10, name, args))
  await db.exec(read('supabase/migrations/20261125094930_restrict_admin_peer_scores_to_super_admin.sql'))
  for (const [index, [name, args, internalCall]] of readers.entries()) {
    await no('ordinary administrator cannot read ' + name, () => call(11, name, args), 'PEER_SUPER_ADMIN_REQUIRED')
    await no('internal reader enforces the same role for ' + name, () => as(11, () => query('SELECT ' + internalCall, args)), 'PEER_SUPER_ADMIN_REQUIRED')
    await no('player cannot read ' + name, () => call(1, name, args), 'PEER_ADMIN_REQUIRED')
    await no('anonymous cannot read ' + name, () => call(null, name, args, 'anon'), 'permission denied')
    await ok('super administrator retains identical results from ' + name, async () => {
      assert.deepEqual(await call(10, name, args), superAdminResults[index])
    })
  }
  await ok('ordinary administrators retain access to activity review operations', async () => {
    assert.ok(await call(11, 'admin_get_round_review_requirements', [round(1)]))
  })
  console.log('PASS '+passed+' admin peer-score directory checks')
} finally { await db.close() }
`
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
try {
  await new AsyncFunction('assert','PGlite','readFileSync','fileURLToPath','auditRoot',setup+tests)(assert,PGlite,readFileSync,fileURLToPath,root)
} catch(error) {
  console.error({message:error.message,where:error.where,query:error.query,stack:error.stack?.split('\n').slice(-4).join('\n')})
  process.exitCode=1
}
