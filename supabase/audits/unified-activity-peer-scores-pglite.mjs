// Isolated migration regression. Reuse the real gate fixture's dependency setup,
// without replaying unrelated migrations or connecting to any Supabase project.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const root = fileURLToPath(new URL('../../', import.meta.url))
const prior = readFileSync(root + 'supabase/audits/registration-review-gate-pglite.mjs', 'utf8')
const marker = '  // Existing historical, clean draft, and previously-used draft scope.'
assert.ok(prior.includes(marker), 'gate dependency fixture boundary')
const setup = prior.slice(0, prior.indexOf(marker))
  .replace(/^import .*$/gm, '')
  .replace(/^const \{ PGlite \} = .*$/m, '')
  .replace(/^const root = .*$/m, 'const root = auditRoot')
const tests = String.raw`
  // Existing rounds are deliberately present before this migration.
  await createRound(1,{status:'open'}); await signup(1,1);await signup(1,2);await peerSetup(1)
  await createRound(2,{purpose:'matching',status:'matched',config:{},name:'竹溪社11月匹配活动'})
  await signup(2,8);await signup(2,9);await publishMatch(2,[8,9])
  await createRound(3,{status:'draft'})
  await db.exec(read('supabase/migrations/20261105095725_registration_review_gate.sql'))
  const migration = read('supabase/migrations/20261117090302_unified_activity_peer_scores.sql')
  const originalSettings = await query('SELECT * FROM private.round_peer_review_settings ORDER BY round_id')
  await query('INSERT INTO private.member_profile_metrics VALUES($1,4.7)',[member(1)])
  await query('INSERT INTO public.member_dynamic_stats VALUES($1,4.2)',[member(1)])
  await db.exec(migration)
  const score = m => call(11,'admin_get_member_peer_score',[member(m)])
  const context = (m,n) => call(m,'player_get_round_peer_reviews',[round(n),'',1,24])
  const feedback = (m,target,n,value,{reviewVersion=0,category=null,details=null,reportVersion=0,id=null}={}) =>
    call(m,'player_submit_round_peer_feedback',[round(n),member(target),value,'',reviewVersion,category,details,reportVersion,id])
  await ok('migration preserves every legacy setting',async()=>assert.deepEqual(await query('SELECT * FROM private.round_peer_review_settings ORDER BY round_id'),originalSettings))
  await ok('all existing rounds including unused draft are legacy',async()=>assert.equal((await query("SELECT count(*)::int n FROM private.round_review_versions WHERE review_system='legacy'"))[0].n,3))
  await ok('legacy single score still accepts one without a report',async()=>assert.equal((await review(1,2,1,1)).score,1))
  await ok('existing valid single-score history contributes before new reviews exist',async()=>assert.deepEqual([ (await score(2)).score,(await score(2)).review_count,(await score(2)).activity_count ],[1,1,1]))
  await ok('legacy context explicitly labels its unchanged path',async()=>assert.equal((await context(1,1)).review_system,'legacy'))
  await ok('November matching route remains legacy',async()=>assert.equal((await call(8,'player_get_match_review_route',[result(2)])).review_system,'legacy'))
  await no('route cannot disclose another members match',()=>call(1,'player_get_match_review_route',[result(2)]),'PEER_NOT_ELIGIBLE')
  await query('INSERT INTO public.mutual_reviews(match_result_id,reviewer_id,reviewee_id,overall_score) VALUES($1,$2,$3,1)',[result(2),member(8),member(9)])
  await ok('newly submitted old five-dimension score still completes old gate',async()=>assert.equal(await state(2,8),'completed'))
  await ok('old five-dimension score is never imported into member trial',async()=>assert.equal((await score(9)).review_count,0))
  await query("INSERT INTO public.match_sessions(id,status,publication_version) VALUES($1,'confirmed',1)",[session(201)])
  await query("INSERT INTO public.match_results(id,session_id,member_a_id,member_b_id,status,publication_version) VALUES($1,$2,$3,$4,'confirmed',1)",[result(201),session(201),member(8),member(9)])
  await ok('legacy round-less published result keeps its old route',async()=>assert.deepEqual(await call(8,'player_get_match_review_route',[result(201)]),{review_system:'legacy',round_id:null,reviewed:false}))
  await query("UPDATE public.match_results SET status='cancelled' WHERE id=$1",[result(201)])
  await ok('legacy cancelled published result remains routable for its participant',async()=>assert.equal((await call(8,'player_get_match_review_route',[result(201)])).review_system,'legacy'))
  await no('legacy route still rejects outsiders',()=>call(1,'player_get_match_review_route',[result(201)]),'PEER_NOT_ELIGIBLE')


  await createRound(10,{config:eventConfig(120)})
  await ok('new registration initializes enabled window and confirmed empty roster',async()=>{
    const settings=(await call(11,'admin_get_round_peer_reviews',[round(10)])).settings
    assert.equal(settings.review_system,'unified');assert.equal(settings.enabled,true);assert.equal(settings.roster_confirmed,true)
    assert.equal(settings.auto_include_registered,true)
    const times=await query("SELECT abs(extract(epoch from(s.closes_at-(r.content_config->>'eventEnd')::timestamptz))-604800)<1 same FROM private.round_peer_review_settings s JOIN public.match_rounds r ON r.id=s.round_id WHERE r.id=$1",[round(10)])
    assert.equal(times[0].same,true)
  })
  await signup(10,1)
  await ok('one registered attendee can open empty review roster',async()=>assert.equal((await context(1,10)).participant_count,0))
  await signup(10,2);await signup(10,3)
  await ok('registrations automatically become review targets',async()=>assert.equal((await context(1,10)).participant_count,2))
  await no('one star alone is rejected',()=>review(1,2,10,1),'PEER_ONE_STAR_REPORT_REQUIRED')
  await ok('failed one-star write creates no score',async()=>assert.equal((await context(1,10)).reviewed_count,0))
  const request=round(777)
  const submitted=await feedback(1,2,10,1,{category:'other',details:'这里记录确实发生的具体互动情况',id:request})
  await ok('combined one-star and report commit atomically',async()=>{assert.equal(submitted.review.score,1);assert.equal(submitted.report.status,'pending')})
  await ok('idempotent retry returns same feedback receipt',async()=>assert.deepEqual(await feedback(1,2,10,1,{category:'other',details:'这里记录确实发生的具体互动情况',id:request}),submitted))
  await ok('one-star comment edit reuses existing report',async()=>assert.equal((await call(1,'player_save_round_peer_review',[round(10),member(2),1,'补充说明',submitted.review.version])).version,2))
  await no('invalid score rolls back an otherwise valid combined report',()=>feedback(1,3,10,0,{category:'other',details:'这里记录确实发生的具体互动情况'}),'PEER_SCORE_INVALID')
  await ok('atomic failure leaves no report orphan',async()=>assert.equal((await query('SELECT count(*)::int n FROM private.round_peer_reports WHERE round_id=$1 AND reporter_id=$2 AND reviewee_id=$3',[round(10),member(1),member(3)]))[0].n,0))
  await call(11,'admin_resolve_round_peer_report',[submitted.report.id,'dismissed','举报材料不足以支持处理',submitted.report.version,'管理员独立处理举报'])
  await ok('dismissing report neither invalidates score nor creates blacklist',async()=>assert.equal((await query('SELECT valid FROM private.round_peer_reviews WHERE id=$1',[submitted.review.id]))[0].valid,true))
  await no('other players cannot read member aggregate',()=>call(1,'admin_get_member_peer_score',[member(2)]),'PEER_ADMIN_REQUIRED')
  await no('anonymous cannot execute aggregate',()=>call(null,'admin_get_member_peer_score',[member(2)],'anon'),'permission denied')

  await createRound(11,{purpose:'matching',status:'open',config:{}})
  for(const person of [1,2,3,4]) await signup(11,person)
  await no('unpublished matching participant cannot view review context',()=>context(1,11),'PEER_NOT_ELIGIBLE')
  await publishMatch(11,[1,2])
  // A second publication/duo in the same round, not the actor's own group.
  await query("INSERT INTO public.match_sessions(id,round_id,status,publication_version) VALUES($1,$2,'confirmed',1)",[session(111),round(11)])
  await query("INSERT INTO matching_publication.publications(id,session_id,round_id,version,round_name,reason) VALUES($1,$1,$2,1,'测试另一组','正式发布另一组')",[session(111),round(11)])
  await query("INSERT INTO public.match_results(id,session_id,member_a_id,member_b_id,status,publication_version) VALUES($1,$2,$3,$4,'confirmed',1)",[result(111),session(111),member(3),member(4)])
  for(const m of [3,4]) {
    await query("INSERT INTO matching_publication.roster VALUES($1,$2,$3,'matched')",[session(111),member(m),result(111)])
    await query('INSERT INTO matching_publication.active_assignments VALUES($1,$2,$3,$4)',[round(11),member(m),session(111),result(111)])
  }
  await ok('new matching route is unified with correct target round',async()=>assert.deepEqual(await call(1,'player_get_match_review_route',[result(11)]),{review_system:'unified',round_id:round(11),reviewed:false}))
  await ok('published matching activity exposes all actual eligible participants, including another group',async()=>assert.equal((await context(1,11)).participant_count,3))
  await no('new activity cannot be written into old five-dimensional table',()=>query('INSERT INTO public.mutual_reviews(match_result_id,reviewer_id,reviewee_id,overall_score) VALUES($1,$2,$3,5)',[result(11),member(1),member(2)]),'PEER_UNIFIED_REVIEW_REQUIRED')
  const peer=await review(1,3,11,4.5)
  await ok('cross-group unified score satisfies matching card and gate',async()=>{
    assert.equal((await call(1,'player_get_match_review_route',[result(11)])).reviewed,true)
    assert.deepEqual((await call(1,'player_list_unified_reviewed_match_ids')).match_ids,[result(11)])
    assert.equal(await state(11,1),'completed')
  })
  await query('UPDATE matching_publication.publications SET withdrawn_at=now() WHERE id=$1',[session(111)])
  await no('withdrawn target cannot receive a new or edited score',()=>call(1,'player_save_round_peer_review',[round(11),member(3),4,'',peer.version]),'PEER_NOT_ELIGIBLE')
  await ok('withdrawal does not silently erase historical personal trial score',async()=>assert.equal((await score(3)).review_count,1))
  const unchangedRoster=(await call(11,'admin_get_round_peer_reviews',[round(11)])).settings.version
  await call(11,'admin_confirm_round_peer_review_roster',[round(11),[1,2,3,4].map(member),unchangedRoster,'保存原有名单不升级未发布者'])
  await no('ordinary roster save does not convert withdrawn auto participant into manual exception',()=>call(1,'player_save_round_peer_review',[round(11),member(3),4,'',peer.version]),'PEER_NOT_ELIGIBLE')
  await call(11,'admin_set_round_peer_review_participant',[round(11),member(5),true,'管理员确认该人实际参加交流'])
  await ok('explicit matching manual attendee can review after a formal activity publication',async()=>{
    assert.equal((await context(5,11)).eligible,true)
    assert.equal((await review(5,1,11,4)).score,4)
  })

  await query('UPDATE matching_publication.publications SET withdrawn_at=NULL WHERE id=$1',[session(111)])
  await call(11,'admin_set_round_peer_review_participant',[round(11),member(4),false,'管理员确认没有参加实际交流'])
  await query('UPDATE matching_publication.active_assignments SET result_id=result_id WHERE round_id=$1 AND member_id=$2',[round(11),member(4)])
  await ok('republishing never restores explicit admin exclusion or pauses whole new activity',async()=>{
    assert.equal((await context(1,11)).participant_count,3)
    assert.equal((await context(1,11)).settings.enabled,true)
  })

  await createRound(12,{config:eventConfig()}); await signup(12,5);await signup(12,6)
  await query('UPDATE private.round_peer_review_settings SET closes_at=now()-interval \'1 hour\' WHERE round_id=$1',[round(12)])
  await ok('ended new activity remains pending after normal deadline',async()=>assert.equal(await state(12,5),'pending'))
  const late=await review(5,6,12,4)
  await ok('late one-score completion clears pending requirement',async()=>assert.equal(await state(12,5),'completed'))
  await no('late score cannot be revised again after completed',()=>call(5,'player_save_round_peer_review',[round(12),member(6),5,'',late.version]),'PEER_WINDOW_CLOSED')
  await call(11,'admin_moderate_round_peer_review',[late.id,false,late.version,'管理员核实该评价需要作废'])
  await ok('invalidation does not recreate completed debt',async()=>assert.equal(await state(12,5),'completed'))
  await no('invalidated late score cannot be resubmitted as another supplement',()=>review(5,6,12,3),'PEER_WINDOW_CLOSED')
  await createRound(14,{purpose:'matching',status:'open',config:{},start:'2020-01-01',end:'2020-01-02'})
  // Deliberately inconsistent dates cannot yield a usable default review window.
  await signup(14,8);await signup(14,9)
  await no('matching publication without a usable review window fails explicitly',()=>publishMatch(14,[8,9]),'PEER_SETTINGS_REQUIRED')
  await createRound(15,{purpose:'matching',status:'open',config:{},start:new Date(Date.now()-4*86400000).toISOString().slice(0,10),end:new Date(Date.now()-2*86400000).toISOString().slice(0,10)})
  await signup(15,8);await signup(15,9);await publishMatch(15,[8,9])
  await query("UPDATE private.round_peer_review_settings SET opens_at=now()-interval '2 days',closes_at=now()-interval '1 hour' WHERE round_id=$1",[round(15)])
  await ok('new matching late debt links to its unified round form',async()=>{
    const required=(await call(11,'admin_get_round_review_requirements',[round(15)])).participants.find(p=>p.member_id===member(8))
    assert.equal(required.state,'pending')
    assert.equal((await query('SELECT registration_review_gate.requirement($1,$2) value',[round(15),member(8)]))[0].value.review_href,'/app/matches/rounds/'+round(15)+'/reviews')
  })
  await review(8,9,15,4)
  await no('new matching allows only its one missing late score',()=>review(8,9,15,5),'PEER_WINDOW_CLOSED')
  await call(11,'admin_set_round_peer_review_participant',[round(15),member(7),true,'管理员确认未报名但实际参加'])
  await ok('manual matching attendance owes a score without fabricating a signup',async()=>{
    assert.equal((await query('SELECT count(*)::int n FROM public.match_round_submissions WHERE round_id=$1 AND member_id=$2',[round(15),member(7)]))[0].n,0)
    assert.equal(await state(15,7),'pending')
    const blocked=(await query('SELECT registration_review_gate.blockers($1,$2) value',[member(7),round(999)]))[0].value
    assert.ok(blocked.blockers.some(b=>b.round_id===round(15)))
  })
  await call(11,'admin_set_round_review_exemption',[round(15),member(7),true,'管理员明确免除本次评价义务',0])
  await ok('manual matching attendee is available in admin exemption list',async()=>assert.equal(await state(15,7),'exempt'))
  await call(11,'admin_set_round_review_exemption',[round(15),member(7),false,'管理员撤回原有评价免除决定',1])
  await review(7,8,15,4)
  await ok('manual matching attendee can complete the missing late score',async()=>assert.equal(await state(15,7),'completed'))



  await createRound(13,{config:eventConfig(120)})
  for(const people of [[],[5]]) {
    const s=(await call(11,'admin_get_round_peer_reviews',[round(13)])).settings
    await call(11,'admin_confirm_round_peer_review_roster',[round(13),people.map(member),s.version,'确认实际到场评价名册'])
  }
  await ok('new roster accepts zero or one participant',async()=>assert.equal((await context(5,13)).participant_count,0))
  await call(11,'admin_set_round_peer_review_participant',[round(13),member(5),false,'管理员明确移除该名成员'])
  await ok('manual exclusion survives automatic signup synchronization',async()=>{
    await query('SELECT private.sync_registered_peer_review_roster($1,NULL,NULL,$2)',[round(13),'测试自动同步不恢复移除'])
    assert.equal((await query('SELECT included FROM private.round_peer_review_participants WHERE round_id=$1 AND member_id=$2',[round(13),member(5)]))[0].included,false)
  })
  await no('explicit restoration cannot re-add an excluded participant',()=>call(11,'admin_restore_unified_review_registration',[round(13),member(5),'不能绕过明确排除的名单']),'PEER_NOT_ELIGIBLE')
  const oldVersion=(await call(11,'admin_get_round_peer_reviews',[round(1)])).settings.version
  await no('old roster keeps its at-least-two rule',()=>call(11,'admin_confirm_round_peer_review_roster',[round(1),[],oldVersion,'旧活动不修改名单规则']),'PEER_ROSTER_REQUIRED')

  // Different reviewer weights, not different review counts: (5 + 1) / 2 = 3.
  for(const n of [20,21,22]) {
    await createRound(n,{config:eventConfig(120)});for(const m of [5,6,7]) await signup(n,m)
    await review(5,7,n,5)
  }
  await feedback(6,7,22,1,{category:'other',details:'这是一条说明实际互动情况的举报'})
  await ok('member trial weights reviewers equally and exposes explainable source records',async()=>{
    const v=await score(7);assert.equal(v.score,3);assert.equal(v.reviewer_count,2);assert.equal(v.activity_count,3);assert.equal(v.review_count,4)
    assert.equal(v.eligible_for_publication,true);assert.equal(v.sources.find(s=>s.reviewer_id===member(5)).score,5)
  })
  const cancelRow=(await query('SELECT updated_at FROM public.match_round_submissions WHERE round_id=$1 AND member_id=$2',[round(22),member(5)]))[0]
  await call(5,'manage_my_registration',[round(22),'cancel',cancelRow.updated_at,0,{}])
  await ok('cancelled attendance retains valid history in trial',async()=>assert.equal((await score(7)).review_count,4))
  const roster22=(await call(11,'admin_get_round_peer_reviews',[round(22)])).settings.version
  await call(11,'admin_confirm_round_peer_review_roster',[round(22),[5,6,7].map(member),roster22,'保存仍包含取消者的原有名单'])
  await ok('ordinary new roster save neither restores cancelled registration nor invalidates old ratings',async()=>{
    assert.ok((await query('SELECT cancelled_at FROM public.match_round_submissions WHERE round_id=$1 AND member_id=$2',[round(22),member(5)]))[0].cancelled_at)
    assert.equal((await score(7)).review_count,4)
  })
  await call(11,'admin_restore_unified_review_registration',[round(22),member(5),'管理员明确恢复实际参与资格'])
  await ok('explicit restoration keeps original signup and historical scores',async()=>assert.equal((await query('SELECT cancelled_at FROM public.match_round_submissions WHERE round_id=$1 AND member_id=$2',[round(22),member(5)]))[0].cancelled_at,null))
  await query("UPDATE public.members SET account_status='closed' WHERE id=$1",[member(5)])
  await ok('ordinary account exit does not erase valid historical reputation',async()=>assert.equal((await score(7)).score,3))
  await query('UPDATE public.members SET is_test=true WHERE id=$1',[member(6)])
  await ok('test reviewers are excluded',async()=>assert.equal((await score(7)).reviewer_count,1))
  await query('UPDATE public.members SET is_test=false WHERE id=$1',[member(6)])
  await query('UPDATE public.members SET anonymized_at=now() WHERE id=$1',[member(6)])
  await ok('anonymized reviewers are excluded and publication eligibility drops',async()=>{
    const v=await score(7);assert.equal(v.reviewer_count,1);assert.equal(v.eligible_for_publication,false)
  })
  await ok('published/manual profile score and legacy dynamic metrics are untouched',async()=>{
    assert.equal(String((await query('SELECT compatibility_score FROM private.member_profile_metrics WHERE member_id=$1',[member(1)]))[0].compatibility_score),'4.7')
    assert.equal(String((await query('SELECT avg_review_score FROM public.member_dynamic_stats WHERE member_id=$1',[member(1)]))[0].avg_review_score),'4.2')
  })
  // Execute the unchanged production v3 single-review source against these
  // reviews; its two dependency helpers only supply a minimal candidate capture.
  await db.exec("CREATE SCHEMA matching_run; CREATE FUNCTION matching_run.source(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('eligibility',(SELECT jsonb_agg(jsonb_build_object('member_id',id,'eligible',true)) FROM public.members))$$; CREATE FUNCTION matching_run.published_scoring_policy() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '{}'::jsonb$$;")
  const scoringSql=read('supabase/migrations/20261023155710_matching_scoring_v3_snapshot.sql')
  const scoringStart=scoringSql.indexOf('CREATE FUNCTION matching_run.source_v3(')
  await db.exec(scoringSql.slice(scoringStart,scoringSql.indexOf('$function$;',scoringStart)+'$function$;'.length))
  await ok('unchanged v3 pair source includes new singles, ignores legacy five-dimension records and never reads personal aggregate',async()=>{
    const source=(await query('SELECT matching_run.source_v3($1) value',[round(11)]))[0].value
    const singles=source.scoring_policy.activityFeedback
    assert.ok(singles.some(r=>r.id===submitted.review.id&&r.score===1))
    assert.ok(singles.some(r=>r.id===peer.id&&r.score===4.5))
    assert.ok(singles.every(r=>Object.keys(r).sort().join(',')==='id,reviewee_id,reviewer_id,round_id,score,version'))
    assert.equal(source.member_peer_score,undefined)
  })
  let firstRoundingReview
  for(const [n,value] of [[30,5],[31,4.5],[32,4]]) {
    await createRound(n,{config:eventConfig(120)});for(const m of [2,3,4]) await signup(n,m)
    const saved=await review(2,4,n,value);if(n===30) firstRoundingReview=saved
  }
  const negative=await feedback(3,4,32,1,{category:'other',details:'明确记录这次实际互动中的具体问题'})
  await ok('trial rounds only the final reviewer-weighted mean to one decimal',async()=>assert.equal((await score(4)).score,2.8))
  await call(2,'player_save_round_peer_review',[round(30),member(4),3,'修改同一场评分',firstRoundingReview.version])
  await ok('editing a review recalculates the trial without adding reviewer/activity/review counts',async()=>{
    const v=await score(4);assert.equal(v.score,2.4);assert.equal(v.reviewer_count,2);assert.equal(v.activity_count,3);assert.equal(v.review_count,4)
  })
  await call(11,'admin_moderate_round_peer_review',[negative.review.id,false,negative.review.version,'管理员明确作废这一条评分'])
  await ok('explicit invalidation immediately removes only that score and updates qualification',async()=>{
    const v=await score(4);assert.equal(v.score,3.8);assert.equal(v.review_count,3);assert.equal(v.eligible_for_publication,false)
  })
  await ok('only authenticated narrow entrypoints expose new implementations',async()=>{
    const acl=await query("SELECT p.proname,has_function_privilege('authenticated',p.oid,'EXECUTE') auth,has_function_privilege('anon',p.oid,'EXECUTE') anon FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='unified_peer_review'")
    const allowed=new Set(['match_review_route','reviewed_match_ids','member_peer_score','restore_registration'])
    for(const row of acl){assert.equal(row.anon,false);assert.equal(row.auth,allowed.has(row.proname),row.proname)}
    assert.equal((await query("SELECT has_table_privilege('authenticated','private.round_review_versions','SELECT') access"))[0].access,false)
  })
  console.log('PASS '+passed+' unified activity peer score checks')
} finally { await db.close() }
`
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
try {
  await new AsyncFunction('assert','PGlite','readFileSync','fileURLToPath','auditRoot',setup+tests)(assert,PGlite,readFileSync,fileURLToPath,root)
} catch(error) { console.error({message:error.message,where:error.where,query:error.query,stack:error.stack?.split('\n').slice(-4).join('\n')});process.exitCode=1 }
