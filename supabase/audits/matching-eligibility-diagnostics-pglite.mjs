// Eligibility counts and evidence-based saved diagnostics against real SQL and
// TypeScript. In-memory PostgreSQL only; never reads credentials or a live DB.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
const root=fileURLToPath(new URL('../../',import.meta.url))
const {build}=await import(process.env.ESBUILD_MODULE || 'esbuild')
const temporary=mkdtempSync(join(tmpdir(),'matching-eligibility-diagnostics-'))
const bundle=await build({stdin:{contents:`export {prepareMatchingRunInput} from './src/lib/matching/run-input'; export {runFullMatching} from './src/lib/matching/run-matching'; export {buildUnmatchedDiagnostics} from './src/lib/matching/unmatched-diagnostics'`,resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',alias:{'@':join(root,'src')}})
writeFileSync(join(temporary,'engine.mjs'),bundle.outputFiles[0].contents)
const {prepareMatchingRunInput,runFullMatching,buildUnmatchedDiagnostics}=await import(pathToFileURL(join(temporary,'engine.mjs')).href)
process.env.MATCHING_RUN_LIFECYCLE_SUITE='1'
const {auditContext:ctx}=await import('./matching-run-input-pglite.mjs')
const {db,scalar,query,role,read,admin,adminUser,superAdmin,superUser}=ctx
let checks=0
const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++}
const rejects=async(sql,pattern,args=[])=>{await assert.rejects(()=>db.query(sql,args),pattern);checks++}
const server=async()=>{await role('service_role');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[adminUser])}
const auth=async(user=adminUser)=>{await role('authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user])}
await role()
await db.exec(read('supabase/migrations/20261023112514_matching_run_lifecycle.sql'))
await db.exec(`CREATE FUNCTION private.member_master_is_super_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=auth.uid() AND role='super_admin') $$;
 ALTER TABLE public.questionnaire_versions ADD COLUMN kind text;
 CREATE TABLE public.questionnaire_templates(kind text PRIMARY KEY,published_version_id uuid REFERENCES public.questionnaire_versions(id));
 CREATE TABLE public.interview_evaluations(id uuid PRIMARY KEY,attractiveness_score numeric);
 GRANT SELECT ON public.members,public.interview_evaluations,public.match_results TO service_role;`)
await db.exec(read('supabase/migrations/20261023080507_protect_admin_assessment_score_columns.sql'))
for(const name of ['private.round_peer_review_settings','private.round_peer_review_participants','private.round_peer_reviews']){
 const sql=read('supabase/migrations/20261002165912_round_peer_reviews.sql'),i=sql.indexOf('CREATE TABLE '+name+' (')
 await db.exec(sql.slice(i,sql.indexOf('\n);',i)+3))
}
const quiz=randomUUID(),weights={E:.3,A:.3,O:.15,C:.1,N:.15}
await db.query("INSERT INTO public.questionnaire_versions(id,kind,version,template) VALUES($1,'quiz',1,$2)",[quiz,{quizConfig:{dimensions:Object.fromEntries(Object.entries(weights).map(([key,matchWeight])=>[key,{matchWeight}]))}}])
await db.query("INSERT INTO public.questionnaire_templates VALUES('quiz',$1)",[quiz])
await db.exec(read('supabase/migrations/20261023155710_matching_scoring_v3_snapshot.sql'))
const functions=await scalar("SELECT jsonb_object_agg(p.oid::regprocedure::text,pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('matching_run','matching_publication','public')")
const beforeMigration=await scalar("SELECT jsonb_build_object('members',(SELECT count(*) FROM public.members),'rounds',(SELECT count(*) FROM public.match_rounds),'results',(SELECT count(*) FROM public.match_results),'notifications',(SELECT count(*) FROM public.community_notifications),'questionnaires',(SELECT jsonb_agg(to_jsonb(q) ORDER BY id) FROM public.questionnaire_versions q))")
await db.exec(read('supabase/migrations/20261023173550_matching_run_eligibility_diagnostics.sql'))
check(await scalar("SELECT jsonb_build_object('members',(SELECT count(*) FROM public.members),'rounds',(SELECT count(*) FROM public.match_rounds),'results',(SELECT count(*) FROM public.match_results),'notifications',(SELECT count(*) FROM public.community_notifications),'questionnaires',(SELECT jsonb_agg(to_jsonb(q) ORDER BY id) FROM public.questionnaire_versions q))"),beforeMigration,'migration does not rewrite member, questionnaire, matching or notification rows')
const afterFunctions=await scalar("SELECT jsonb_object_agg(p.oid::regprocedure::text,pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('matching_run','matching_publication','public')")
for(const [name,definition] of Object.entries(functions))if(!name.startsWith('matching_run.job_metadata('))check(afterFunctions[name],definition,`unrelated existing SQL implementation stays unchanged: ${name}`)

const members=Array.from({length:7},()=>randomUUID()),users=members.map(()=>randomUUID())
for(let i=0;i<members.length;i++){
 await db.query('INSERT INTO public.members(id,user_id,member_number) VALUES($1,$2,$3)',[members[i],users[i],`DIAGNOSTIC_${i}`])
 await db.query("INSERT INTO public.member_identity(member_id,full_name,gender,hobby_tags,secret_identity_note) VALUES($1,$2,'male',ARRAY['桌游'],'private raw identity note')",[members[i],`私有原始姓名${i}`])
 await db.query("INSERT INTO public.member_interests(member_id,scenario_mode_pref) VALUES($1,ARRAY['多人本','双人本'])",[members[i]])
 await db.query('INSERT INTO public.personality_quiz_results(member_id,score_e,score_a,score_o,score_c,score_n) VALUES($1,50,60,70,40,30)',[members[i]])
}
await db.query('INSERT INTO private.test_readiness VALUES($1,false),($2,false)',[members[4],members[5]])
await db.query("UPDATE public.members SET status='pending',account_status='unbound',user_id=NULL,record_scope='historical' WHERE id=$1",[members[5]])
const newRound=async(count=members.length)=>{
 await role()
 const id=await scalar("INSERT INTO public.match_rounds(round_name,status) VALUES('资格诊断专项隔离测试','open') RETURNING id")
 for(let i=0;i<count;i++)await db.query("INSERT INTO public.match_round_submissions(round_id,member_id,game_type_pref,availability,message) VALUES($1,$2,'双人',$3,'private raw answer')",[id,members[i],{[`2026-10-${27+Math.max(0,i-1)}`]:['下午']}])
 if(count>6)await db.query('UPDATE public.match_round_submissions SET cancelled_at=now() WHERE round_id=$1 AND member_id=$2',[id,members[6]])
 return id
}
const begin=async(round,version=3)=>{await server();return scalar(`SELECT public.admin_begin_matching_run${version===3?'_v3':''}($1,$2,$3,'资格诊断隔离方案','资格诊断真实链路验证')`,[round,randomUUID(),admin])}
const summary=async(round,actor=admin)=>scalar('SELECT public.admin_get_matching_eligibility_summary($1,$2)',[round,actor])
const stage=async(receipt,engine)=>scalar('SELECT public.admin_stage_matching_run($1,$2,$3,$4)',[receipt.run.id,admin,receipt.lease_token,engine])
const complete=async(receipt,rows,ids,diagnostics,actor=admin)=>scalar('SELECT public.admin_complete_matching_run_v2($1,$2,$3,$4,$5,$6)',[receipt.run.id,actor,receipt.lease_token,rows,ids,diagnostics])
const runState=async(receipt)=>{
 await role()
 return scalar("SELECT jsonb_build_object('job',(SELECT to_jsonb(j) FROM matching_run.jobs j WHERE id=$1),'snapshot',(SELECT to_jsonb(s) FROM matching_run.snapshots s WHERE id=$2),'sessions',(SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY id),'[]') FROM public.match_sessions s WHERE round_id=$3),'results',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]') FROM public.match_results r JOIN public.match_sessions s ON s.id=r.session_id WHERE s.round_id=$3),'diagnostics',(SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.id),'[]') FROM public.unmatched_diagnostics d JOIN public.match_sessions s ON s.id=d.session_id WHERE s.round_id=$3),'notifications',(SELECT count(*) FROM public.community_notifications))",[receipt.run.id,receipt.capture.snapshot_id,receipt.run.round_id])
}
const round=await newRound()
await server()
const preflight=await summary(round)
await role()
const source=await scalar('SELECT matching_run.source($1)',[round])
check(preflight.submitted_count,source.submissions.length,'preflight uses the same canonical source submission count')
check(preflight.eligible_count,source.eligibility.filter(e=>e.eligible).length,'preflight uses the same canonical source eligibility')
check([preflight.submitted_count,preflight.eligible_count,preflight.excluded_count],[7,4,3],'preflight distinguishes total applicants, eligible and excluded')
const expectedExclusions={}
for(const entry of source.eligibility.filter(e=>!e.eligible))for(const reason of entry.reasons)expectedExclusions[reason]=(expectedExclusions[reason]||0)+1
check(Object.fromEntries(preflight.exclusion_summary.map(({reason,count})=>[reason,count])),expectedExclusions,'each exclusion reason is counted using canonical reasons, including overlaps')
check(preflight.exclusion_summary.reduce((sum,row)=>sum+row.count,0)>preflight.excluded_count,true,'overlapping reason totals are not misrepresented as distinct excluded members')
check(Object.keys(preflight).sort(),['round_id','submitted_count','eligible_count','excluded_count','exclusion_summary','checked_at'].sort(),'preflight exposes only safe aggregate fields')
for(const raw of [members[0],users[0],'private raw','私有原始姓名','readiness','availability','blacklist','feedback'])check(JSON.stringify(preflight).includes(raw),false,`preflight never returns raw field or actor data: ${raw}`)
check(typeof preflight.checked_at,'string','preflight reports its observation time')
await server()
await rejects('SELECT public.admin_get_matching_eligibility_summary($1,$2)',/SERVER_ADMIN_REQUIRED/,[round,members[0]])
await rejects('SELECT public.admin_get_matching_eligibility_summary($1,$2)',/ROUND_UNAVAILABLE/,[randomUUID(),admin])
for(const actorRole of ['anon','authenticated']){
 await role(actorRole)
 if(actorRole==='authenticated')await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[adminUser])
 await rejects('SELECT public.admin_get_matching_eligibility_summary($1,$2)',/permission denied/,[round,admin])
 await rejects('SELECT public.admin_complete_matching_run_v2($1,$2,$3,$4,$5,$6)',/permission denied/,[randomUUID(),admin,randomUUID(),[],[],[]])
}
await role()
for(const name of ['public.admin_get_matching_eligibility_summary(uuid,uuid)','public.admin_complete_matching_run_v2(uuid,uuid,uuid,jsonb,uuid[],jsonb)']){
 check(await scalar("SELECT has_function_privilege('service_role',$1,'EXECUTE')",[name]),true,`${name} is executable by service only`)
 for(const actorRole of ['anon','authenticated'])check(await scalar('SELECT has_function_privilege($1,$2,\'EXECUTE\')',[actorRole,name]),false,`${name} rejects direct ${actorRole} execution`)
}

const receipt=await begin(round)
check([receipt.run.submitted_count,receipt.run.eligible_count,receipt.run.excluded_count],[7,4,3],'captured run metadata preserves original qualification counts')
check(receipt.run.counts_available,true,'captured run explicitly confirms counts are available')
check(receipt.run.exclusion_summary,preflight.exclusion_summary,'captured exclusions agree with the immediately preceding preflight')
const engine=prepareMatchingRunInput(receipt.capture).engineInput
const result=runFullMatching(engine.candidates,engine.config,new Map(engine.idMap),new Map(engine.pairRelations))
const diagnostic=buildUnmatchedDiagnostics(engine,result.unmatchedIds)
check(result.totalMatched,2,'real scorer selects the two candidates with a common time')
check(diagnostic.length,2,'real TypeScript adapter emits one diagnostic for each remaining candidate')
check(diagnostic.every(row=>row.reason==='no_common_time'),true,'real diagnostics prove absent overlap against every frozen candidate')
await stage(receipt,engine)
const beforeInvalid=await runState(receipt)
const violations=[]
const invalid=async(label,mutate,pattern=/DIAGNOSTICS_INVALID|DIAGNOSTICS_COHORT_MISMATCH/)=>{
 const payload=structuredClone(diagnostic),mutated=mutate(payload);const changed=mutated===undefined?payload:mutated
 await server();await db.exec('BEGIN')
 let error=null
 try{await complete(receipt,result.rows,result.unmatchedIds,changed)}catch(caught){error=caught}
 finally{await db.exec('ROLLBACK')}
 if(!error||!pattern.test(error.message))violations.push({label,message:error?.message??'accepted'})
 else checks++
 check(await runState(receipt),beforeInvalid,`${label}: failed completion leaves the full job, snapshot and business state unchanged`)
}
await invalid('missing diagnostic',rows=>rows.slice(1))
await invalid('duplicate diagnostic member',rows=>{rows[1]=structuredClone(rows[0])})
await invalid('foreign diagnostic member',rows=>{rows[0].member_id=members[4]})
await invalid('extra root data',rows=>{rows[0].raw_answer='private raw answer'})
await invalid('extra nested data',rows=>{rows[0].details.private_note='private raw answer'})
await invalid('cohort size mismatch',rows=>{rows[0].details.cohort_size=5})
await invalid('negative count',rows=>{rows[0].details.shared_time_peer_count=-1})
await invalid('count reaches entire cohort',rows=>{rows[0].details.shared_time_peer_count=4})
await invalid('fractional count',rows=>{rows[0].details.shared_time_peer_count=.5})
await invalid('missing count',rows=>{delete rows[0].details.feasible_duo_count})
await invalid('unknown version',rows=>{rows[0].details.version='matching_diagnostic:2'})
await invalid('wrong search certainty',rows=>{rows[0].details.search_mode='bounded'})
await invalid('reason and code disagree',rows=>{rows[0].reason='not_selected'})
await invalid('null diagnostics',()=>null)
// These semantic contradictions are still unsafe even on a service-only RPC:
// a successful response should never persist a formally self-contradictory fact.
await invalid('duo count exceeds common-time count',rows=>{rows[0].details.feasible_duo_count=1})
await invalid('multi count exceeds common-time count',rows=>{rows[0].details.multi_max_shared_peer_count=1})
await invalid('no-common-time code despite overlap',rows=>{rows[0].details.shared_time_peer_count=1})
await invalid('impossibility code despite feasible duo',rows=>{rows[0].details.code='no_feasible_combination';rows[0].reason='no_feasible_combination';rows[0].details.shared_time_peer_count=2;rows[0].details.feasible_duo_count=1})
await invalid('impossibility code despite possible pool upper bound',rows=>{rows[0].details.code='no_feasible_combination';rows[0].reason='no_feasible_combination';rows[0].details.shared_time_peer_count=2;rows[0].details.multi_max_shared_peer_count=2})
await invalid('uncertain code despite proven absent common time',rows=>{rows[0].details.code='not_selected';rows[0].reason='not_selected'})
await invalid('uncertain code despite proven impossible combination',rows=>{rows[0].details.code='not_selected';rows[0].reason='not_selected';rows[0].details.shared_time_peer_count=1;rows[0].details.multi_max_shared_peer_count=1})
await server()
await rejects('SELECT public.admin_complete_matching_run_v2($1,$2,$3,$4,$5,$6)',/NOT_FOUND|OWNER|ADMIN_REQUIRED/,[receipt.run.id,superAdmin,receipt.lease_token,result.rows,result.unmatchedIds,diagnostic])
check(await runState(receipt),beforeInvalid,'a different real administrator cannot complete this batch')
await server()
const saved=await complete(receipt,result.rows,result.unmatchedIds,diagnostic)
check(saved.run.status,'succeeded','real TS output and diagnostics save successfully through the new RPC')
const replay=await complete(receipt,result.rows,result.unmatchedIds,diagnostic)
check(replay.session_id,saved.session_id,'completion retries return the original plan without another insert')
await role()
check(await scalar("SELECT jsonb_agg(jsonb_build_object('member_id',member_id,'reason',reason,'details',details) ORDER BY member_id) FROM public.unmatched_diagnostics WHERE session_id=$1",[saved.session_id]),[...diagnostic].sort((a,b)=>a.member_id.localeCompare(b.member_id)),'saved diagnostics exactly equal the safe TS DTO')
check(await scalar('SELECT status FROM public.match_rounds WHERE id=$1',[round]),'open','diagnostic save preserves ongoing collection')
check(await scalar('SELECT count(*)::int FROM public.community_notifications'),beforeInvalid.notifications,'running and diagnosing never sends publication notices')

// A failed run keeps its original reasons even when live data subsequently changes.
const failedRound=await newRound(),failed=await begin(failedRound)
await scalar('SELECT public.admin_fail_matching_run($1,$2,$3,$4)',[failed.run.id,admin,failed.lease_token,'ENGINE_FAILED'])
await role();await db.query("UPDATE public.members SET status='approved',account_status='active',user_id=$2,record_scope='current' WHERE id=$1",[members[5],users[5]])
await db.query('UPDATE private.test_readiness SET ready=true WHERE member_id=ANY($1::uuid[])',[members.slice(4,6)])
await auth()
const failedMetadata={run:(await scalar('SELECT public.admin_list_round_matching_runs($1)',[failedRound])).find(run=>run.id===failed.run.id)}
check([failedMetadata.run.submitted_count,failedMetadata.run.eligible_count,failedMetadata.run.excluded_count],[7,4,3],'failed run retains frozen eligibility counts after current profiles change')
check(failedMetadata.run.exclusion_summary,preflight.exclusion_summary,'failed run retains frozen exclusion reasons rather than reconstructing from current profiles')
check(failedMetadata.run.counts_available,true,'failed captured run has trustworthy counts')
check('capture' in failedMetadata,false,'authenticated run metadata does not include raw captured answers')
check('engine_input' in failedMetadata,false,'authenticated run metadata does not include frozen private scoring data')

const captureFailedRound=await newRound(2)
await role();await db.query("UPDATE public.questionnaire_templates SET published_version_id=NULL WHERE kind='quiz'")
const captureFailed=await begin(captureFailedRound)
check(captureFailed.run.status,'failed','capture failure is durably recorded')
check(captureFailed.run.error_code,'INPUT_CAPTURE_FAILED','capture failure exposes a safe error code')
check(captureFailed.run.counts_available,false,'capture failure never presents unknown counts as zero')
check([captureFailed.run.submitted_count,captureFailed.run.eligible_count,captureFailed.run.excluded_count],[null,null,null],'unavailable capture counts remain null')
check(captureFailed.run.exclusion_summary,null,'capture failure cannot invent an exclusion distribution')
await role();await db.query("UPDATE public.questionnaire_templates SET published_version_id=$1 WHERE kind='quiz'",[quiz])

// Old completion remains callable after adding the separate new RPC.
const oldRound=await newRound(2),old=await begin(oldRound,2)
const oldEngine=prepareMatchingRunInput(old.capture).engineInput
const oldResult=runFullMatching(oldEngine.candidates,oldEngine.config,new Map(oldEngine.idMap),new Map(oldEngine.pairRelations))
await stage(old,oldEngine)
const oldSaved=await scalar('SELECT public.admin_complete_matching_run($1,$2,$3,$4,$5)',[old.run.id,admin,old.lease_token,oldResult.rows,oldResult.unmatchedIds])
check(oldSaved.run.status,'succeeded','old five-argument completion contract remains compatible')

// The existing erasure trigger removes raw source while retaining safe totals.
await role();await db.query('UPDATE public.members SET anonymized_at=now() WHERE id=$1',[members[0]])
await auth()
const redacted={run:(await scalar('SELECT public.admin_list_round_matching_runs($1)',[failedRound])).find(run=>run.id===failed.run.id)}
check(redacted.run.snapshot_status,'redacted','existing erasure trigger marks the failed input redacted')
check(redacted.run.counts_available,true,'privacy-erased run retains its non-personal captured totals')
check([redacted.run.submitted_count,redacted.run.eligible_count,redacted.run.excluded_count],[7,4,3],'privacy erasure does not invent replacement counts')
check(redacted.run.exclusion_summary,null,'privacy-erased run does not reconstruct reasons from current data')
check(redacted.run.can_recover,false,'redacted inputs remain unrecoverable')
await role();await db.query('DELETE FROM matching_run.snapshots WHERE id=$1',[failed.capture.snapshot_id])
await auth()
const missing={run:(await scalar('SELECT public.admin_list_round_matching_runs($1)',[failedRound])).find(run=>run.id===failed.run.id)}
check(missing.run.snapshot_status,'missing','missing snapshot remains distinct from a captured or redacted input')
check(missing.run.counts_available,false,'missing snapshot does not claim captured-source availability')
check(missing.run.exclusion_summary,null,'missing source does not manufacture reason counts')

check(violations,[],'every malformed or contradictory diagnostic is rejected before saving')
console.log(`Matching eligibility/diagnostic audit: ${checks} checks passed; isolated PGlite only.`)
await db.close();rmSync(temporary,{recursive:true,force:true})
