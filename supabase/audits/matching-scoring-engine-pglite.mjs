// Real source -> TypeScript adapter/scorer -> real completion RPC, offline only.
// PGLITE_MODULE / ESBUILD_MODULE may point at installed packages outside the repo.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
const root=fileURLToPath(new URL('../../',import.meta.url))
const {build}=await import(process.env.ESBUILD_MODULE || 'esbuild')
const temporary=mkdtempSync(join(tmpdir(),'matching-scoring-engine-'))
const bundle=await build({stdin:{contents:`export {prepareMatchingRunInput} from './src/lib/matching/run-input'; export {runFullMatching} from './src/lib/matching/run-matching'`,resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',alias:{'@':join(root,'src')}})
writeFileSync(join(temporary,'engine.mjs'),bundle.outputFiles[0].contents)
const {prepareMatchingRunInput,runFullMatching}=await import(pathToFileURL(join(temporary,'engine.mjs')).href)
process.env.MATCHING_RUN_LIFECYCLE_SUITE='1'
const {auditContext:ctx}=await import('./matching-run-input-pglite.mjs')
const {db,scalar,role,read,admin,adminUser}=ctx
let checks=0
const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++}
const server=async()=>{await role('service_role');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[adminUser])}
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
const members=Array.from({length:7},()=>randomUUID())
for(let i=0;i<members.length;i++){
 await db.query('INSERT INTO public.members(id,user_id,member_number) VALUES($1,$2,$3)',[members[i],randomUUID(),`ENGINE_${i}`])
 await db.query("INSERT INTO public.member_identity(member_id,full_name,gender,hobby_tags) VALUES($1,$2,'male',ARRAY['桌游'])",[members[i],`隔离成员${i}`])
 await db.query("INSERT INTO public.member_interests(member_id,scenario_mode_pref) VALUES($1,ARRAY['多人本','双人本'])",[members[i]])
 await db.query('INSERT INTO public.member_dynamic_stats(member_id,activity_count) VALUES($1,$2)',[members[i],i*2])
 await db.query('INSERT INTO public.personality_quiz_results(member_id,score_e,score_a,score_o,score_c,score_n) VALUES($1,50,60,70,40,30)',[members[i]])
}
const newRound=async(mode,count)=>{
 await role()
 const id=await scalar("INSERT INTO public.match_rounds(round_name,status) VALUES('实际引擎保存隔离验证','open') RETURNING id")
 for(const member of members.slice(0,count))await db.query('INSERT INTO public.match_round_submissions(round_id,member_id,game_type_pref) VALUES($1,$2,$3)',[id,member,mode])
 return id
}
for(const version of [2,3])for(const [mode,count] of [['双人',4],['多人',7]]){
 const round=await newRound(mode,count),request=randomUUID()
 await server()
 const receipt=await scalar(`SELECT public.admin_begin_matching_run${version===3?'_v3':''}($1,$2,$3,'真实引擎隔离方案','实际引擎到数据库兼容验证')`,[round,request,admin])
 check(receipt.acquired,true,`${version}/${mode} captures the full input`)
 const engine=prepareMatchingRunInput(receipt.capture).engineInput
 check(engine.algorithm_version,`max_coverage_split:${version}`,'captured adapter dispatches original version')
 const output=runFullMatching(engine.candidates,engine.config,new Map(engine.idMap),new Map(engine.pairRelations))
 check(output.totalMatched,count,'real scorer preserves eligible coverage')
 check(output.rows.length,mode==='多人'?1:2,'one multiplayer pool remains unlimited')
 check(output.rows.every(row=>typeof row.game_type==='string'),true,'real output contains the engine game type')
 if(mode==='多人')check(output.rows[0].score_breakdown===null,version===2,'legacy null and new summary remain versioned')
 await scalar('SELECT public.admin_stage_matching_run($1,$2,$3,$4)',[request,admin,receipt.lease_token,engine])
 // Failure paths use real engine rows too, and must leave the batch retryable.
 const malformed=structuredClone(output.rows);malformed[0].score_breakdown={kind:'unknown',version:'weighted_feedback:1',factors:[]}
 await assert.rejects(()=>scalar('SELECT public.admin_complete_matching_run($1,$2,$3,$4,$5)',[request,admin,receipt.lease_token,malformed,output.unmatchedIds]),/OUTPUT_INVALID/);checks++
 const saved=await scalar('SELECT public.admin_complete_matching_run($1,$2,$3,$4,$5)',[request,admin,receipt.lease_token,output.rows,output.unmatchedIds])
 check(saved.run.status,'succeeded','actual TypeScript output saves atomically through real SQL')
 const replay=await scalar('SELECT public.admin_complete_matching_run($1,$2,$3,$4,$5)',[request,admin,receipt.lease_token,output.rows,output.unmatchedIds])
 check(replay.session_id,saved.session_id,'lost response retry keeps one saved plan')
 await role()
 const stored=await scalar('SELECT jsonb_agg(jsonb_build_object(\'score\',total_score,\'breakdown\',score_breakdown) ORDER BY rank) FROM public.match_results WHERE session_id=$1',[saved.session_id])
 check(stored,output.rows.map(row=>({score:row.total_score,breakdown:row.score_breakdown})),'saved scores and breakdowns equal real engine output')
 check(await scalar('SELECT status FROM public.match_rounds WHERE id=$1',[round]),'open','collection continues after the run')
 const config=await scalar('SELECT config FROM public.match_sessions WHERE id=$1',[saved.session_id])
 if(version===3){check('activityFeedback' in config.scoringPolicy,false,'public config omits raw direction records');check(config.scoringPolicy.dimensionWeights,weights,'safe config retains actual published weights')}
 else check(config,engine.config,'legacy public configuration is unchanged')
}
console.log(`Matching actual engine/SQL audit: ${checks} checks passed; isolated PGlite only.`)
await db.close()
rmSync(temporary,{recursive:true,force:true})
