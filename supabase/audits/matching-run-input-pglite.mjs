// Isolated PostgreSQL round-input capture/ACL/privacy tests; never connects to a live database.
import assert from 'node:assert/strict'
process.on('uncaughtException', error=>{console.error(error.message,error.where||'',error.internalQuery||'',error.position||'');process.exit(1)})
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const root=fileURLToPath(new URL('../../',import.meta.url))
const read=p=>readFileSync(root+'/'+p,'utf8')
function extractFunction(source,name) {
 const i=source.indexOf('CREATE OR REPLACE FUNCTION '+name+'(');assert.ok(i>=0,name)
 const sub=source.slice(i),match=/AS (\$[a-z_]*\$)/i.exec(sub);assert.ok(match,name)
 const end=sub.indexOf(match[1]+';',match.index+match[0].length);return sub.slice(0,end+match[1].length+1)
}
const db=new PGlite()
let checks=0
const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++}
const query=async(sql,args=[])=> (await db.query(sql,args)).rows
const scalar=async(sql,args=[])=>Object.values((await query(sql,args))[0])[0]
const rejects=async(sql,pattern,args=[])=>{await assert.rejects(()=>db.query(sql,args),pattern);checks++}
function table(path,name) { const s=read('supabase/migrations/'+path);const i=s.indexOf('CREATE TABLE '+name+' ('); assert.ok(i>=0,name);return s.slice(i,s.indexOf('\n);',i)+3) }
await db.exec(`
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('role',current_setting('request.jwt.claim.role',true)) $$;
CREATE TABLE public.members(id uuid PRIMARY KEY,user_id uuid,status text DEFAULT 'approved',account_status text DEFAULT 'active',anonymized_at timestamptz);
CREATE TABLE public.admin_users(id uuid PRIMARY KEY,user_id uuid);
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=auth.uid()) $$;
CREATE FUNCTION public.update_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at=now();RETURN NEW;END$$;
CREATE FUNCTION private.member_master_current_admin_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT id FROM public.admin_users WHERE user_id=auth.uid() $$;
CREATE FUNCTION private.profile_current_approved_member_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT id FROM public.members WHERE user_id=auth.uid() AND status='approved' AND account_status='active' AND anonymized_at IS NULL $$;
CREATE TABLE public.match_rounds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),round_name text NOT NULL,purpose text DEFAULT 'matching',status text DEFAULT 'open',survey_start timestamptz DEFAULT now()-interval '1 day',survey_end timestamptz DEFAULT now()+interval '1 day',deleted_at timestamptz,created_at timestamptz DEFAULT now());
CREATE TABLE public.match_round_submissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),round_id uuid REFERENCES public.match_rounds(id),member_id uuid REFERENCES public.members(id),cancelled_at timestamptz,created_at timestamptz DEFAULT now());
`)
await db.exec(table('004_matching.sql','public.match_sessions'))
await db.exec(table('004_matching.sql','public.match_results'))
await db.exec(read('supabase/migrations/015_matching_enhance.sql'))
await db.exec(read('supabase/migrations/024_cancellation_request.sql'))
await db.exec(`
ALTER TABLE public.match_sessions ADD COLUMN round_id uuid REFERENCES public.match_rounds(id),ADD COLUMN audit_reason text;
ALTER TABLE public.match_results ADD COLUMN audit_reason text;
CREATE TABLE public.mutual_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),match_result_id uuid REFERENCES public.match_results(id),reviewer_id uuid,reviewee_id uuid,comment text);
ALTER TABLE public.match_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_sessions ON public.match_sessions FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
CREATE POLICY admin_results ON public.match_results FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
CREATE POLICY member_master_match_results_active_self_read ON public.match_results FOR SELECT TO authenticated USING(true);
CREATE POLICY member_master_match_sessions_active_member_read ON public.match_sessions FOR SELECT TO authenticated USING(true);
`)
// Real notification structure plus the incremental columns available before this migration.
await db.exec(`CREATE TABLE public.community_profiles(id uuid PRIMARY KEY); CREATE TABLE public.community_posts(id uuid PRIMARY KEY); CREATE TABLE public.community_comments(id uuid PRIMARY KEY); CREATE TABLE public.community_reports(id uuid PRIMARY KEY); CREATE TABLE public.community_announcements(id uuid PRIMARY KEY);`)
await db.exec(table('20260716165130_community_v1_schema.sql','public.community_notifications'))
await db.exec(`ALTER TABLE public.community_notifications ADD COLUMN round_id uuid REFERENCES public.match_rounds(id);
GRANT USAGE ON SCHEMA public,auth,private TO authenticated,anon,service_role;
GRANT SELECT ON public.members,public.admin_users,public.match_rounds TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.match_sessions,public.match_results,public.unmatched_diagnostics TO authenticated;
GRANT SELECT ON public.community_notifications TO authenticated;
`)

await db.exec(`
ALTER TABLE public.members ADD COLUMN membership_type text DEFAULT 'player',ADD COLUMN record_scope text DEFAULT 'current',ADD COLUMN record_source text DEFAULT 'app',ADD COLUMN member_number text,ADD COLUMN attractiveness_score numeric;
ALTER TABLE public.admin_users ADD COLUMN role text DEFAULT 'admin';
ALTER TABLE public.unmatched_diagnostics ADD COLUMN audit_reason text;
ALTER TABLE public.match_round_submissions ADD COLUMN game_type_pref text DEFAULT '双人',ADD COLUMN gender_pref text DEFAULT '都可以',ADD COLUMN availability jsonb DEFAULT '{"2026-10-27":["下午"]}',ADD COLUMN interest_tags text[] DEFAULT '{}',ADD COLUMN social_style text,ADD COLUMN message text,ADD COLUMN updated_at timestamptz DEFAULT now(),ADD COLUMN import_metadata jsonb;
CREATE TABLE public.member_identity(member_id uuid PRIMARY KEY,full_name text,nickname text,gender text,school_name text,hobby_tags text[],personality_self_tags text[],taboo_tags text[],current_city text,secret_identity_note text,updated_at timestamptz DEFAULT now());
CREATE TABLE public.member_personality(member_id uuid PRIMARY KEY,warmup_speed text,expression_style_tags text[],group_role_tags text[]);
CREATE TABLE public.member_interests(member_id uuid PRIMARY KEY,scenario_mode_pref text[],scenario_theme_tags text[],accept_beginners boolean DEFAULT true,accept_cross_school boolean DEFAULT true,activity_area text);
CREATE TABLE public.member_language(member_id uuid PRIMARY KEY,communication_language_pref text[],japanese_level text);
CREATE TABLE public.member_boundaries(member_id uuid PRIMARY KEY,taboo_tags text[],deal_breakers text[]);
CREATE TABLE public.member_dynamic_stats(member_id uuid PRIMARY KEY,activity_count integer,reliability_score numeric);
CREATE TABLE public.personality_quiz_results(member_id uuid PRIMARY KEY,score_e integer,score_a integer,score_o integer,score_c integer,score_n integer,completed_at timestamptz,updated_at timestamptz);
CREATE TABLE public.pair_relationships(member_a_id uuid,member_b_id uuid,notes text,status text DEFAULT 'blacklist');
ALTER TABLE public.mutual_reviews ADD COLUMN overall_score integer;
CREATE TABLE public.questionnaire_versions(id uuid PRIMARY KEY,version integer,template jsonb);
CREATE TABLE public.questionnaire_responses(id uuid PRIMARY KEY,member_id uuid,kind text,version_id uuid,revision integer,completed_at timestamptz,updated_at timestamptz);
CREATE TABLE public.questionnaire_assignments(member_id uuid,kind text,response_id uuid);
CREATE TABLE private.test_readiness(member_id uuid PRIMARY KEY,ready boolean DEFAULT true);
CREATE FUNCTION private.member_matching_readiness(p_member_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT CASE WHEN COALESCE((SELECT ready FROM private.test_readiness WHERE member_id=p_member_id),true) THEN '{"supplementary":true,"personality":true,"quiz":true,"missing":[]}'::jsonb ELSE '{"supplementary":true,"personality":false,"quiz":true,"missing":["personality"]}'::jsonb END $$;
`)
await db.exec(read('supabase/migrations/20261022183350_matching_publication_delivery.sql'))
const admin='10000000-0000-4000-8000-000000000001',adminUser='10000000-0000-4000-8000-000000000002'
const superAdmin='10000000-0000-4000-8000-000000000003',superUser='10000000-0000-4000-8000-000000000004'
const members=Array.from({length:18},(_,i)=>`20000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`)
const users=members.map((_,i)=>`30000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`)
await db.query("INSERT INTO public.admin_users VALUES($1,$2,'admin'),($3,$4,'super_admin')",[admin,adminUser,superAdmin,superUser])
for(let i=0;i<members.length;i++)await db.query("INSERT INTO public.members(id,user_id,member_number) VALUES($1,$2,$3)",[members[i],users[i],`ZXS_${i+1}`])
const round=await scalar("INSERT INTO public.match_rounds(round_name) VALUES('隔离输入捕获') RETURNING id")
const legacy=await scalar("INSERT INTO public.match_sessions(round_id,created_by,algorithm,audit_reason) VALUES($1,$2,'max_coverage_split','旧会话隔离') RETURNING id",[round,admin])
const businessBefore=await scalar('SELECT to_jsonb(s) FROM public.match_sessions s WHERE id=$1',[legacy])
await db.exec(read('supabase/migrations/20261023054728_matching_run_input_snapshot.sql'))
check(await scalar("SELECT to_jsonb(s)-'input_snapshot_required' FROM public.match_sessions s WHERE id=$1",[legacy]),businessBefore,'migration does not rewrite existing session fields')
check(await scalar('SELECT input_snapshot_required FROM public.match_sessions WHERE id=$1',[legacy]),false,'legacy lacks input marker without pretending snapshot')
const role=async r=>{await db.exec('RESET ROLE');if(r)await db.exec(`SET ROLE ${r}`)}
const capture=async(r=round,actor=admin)=>scalar("SELECT public.admin_capture_matching_input($1,$2,'隔离捕获测试')",[r,actor])
const metadata=async s=>scalar('SELECT public.admin_get_matching_input_metadata($1)',[s])
const engine=cap=>({candidates:cap.source.submissions.filter(s=>cap.source.eligibility.find(e=>e.member_id===s.member_id).eligible).map(s=>({submissionId:s.member_id,name:s.member.member_identity?.full_name||'隔离'})),pairRelations:[],idMap:cap.source.submissions.filter(s=>cap.source.eligibility.find(e=>e.member_id===s.member_id).eligible).map(s=>[s.member_id,s.member_id]),config:{unchanged:true},algorithm_version:'max_coverage_split:1',adapter_version:1})
const createSession=async(cap,actor=admin)=>{
 await role('authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[actor===admin?adminUser:superUser])
 return scalar("INSERT INTO public.match_sessions(round_id,created_by,algorithm,config,total_candidates,total_matched,total_unmatched,audit_reason) VALUES($1,$2,'max_coverage_split',$3,$4,0,$4,'隔离批次写入') RETURNING id",[cap.source.round.id,actor,{unchanged:true},cap.source.eligibility.filter(e=>e.eligible).length])
}
const seal=async(cap,s,input=engine(cap),actor=admin)=>{await role('service_role');return scalar('SELECT public.admin_seal_matching_input($1,$2,$3,$4)',[cap.snapshot_id,s,actor,input])}
const eligible=cap=>cap.source.eligibility.filter(e=>e.eligible).map(e=>e.member_id)
const reason= (cap,id)=>cap.source.eligibility.find(e=>e.member_id===id).reasons
for(let i=0;i<16;i++)await db.query("INSERT INTO public.match_round_submissions(round_id,member_id,created_at) VALUES($1,$2,now()+($3::integer*interval '1 second'))",[round,members[i],i])
await db.query("INSERT INTO public.member_identity(member_id,full_name,secret_identity_note,hobby_tags) VALUES($1,'原姓名','不能进入快照',ARRAY['桌游'])",[members[0]])
await db.query("UPDATE public.match_round_submissions SET cancelled_at=now() WHERE member_id=$1",[members[2]])
await db.query("UPDATE public.members SET status='pending' WHERE id=$1",[members[3]])
await db.query("UPDATE public.members SET account_status='suspended' WHERE id=$1",[members[4]])
await db.query("UPDATE public.members SET membership_type='staff' WHERE id=$1",[members[5]])
await db.query("UPDATE public.members SET record_scope='historical' WHERE id=$1",[members[6]])
await db.query("UPDATE public.members SET account_status='closed',anonymized_at=now() WHERE id=$1",[members[7]])
await db.query("UPDATE public.members SET user_id=NULL,account_status='unbound' WHERE id=$1",[members[8]])
await db.query("INSERT INTO private.test_readiness VALUES($1,false),($2,false),($3,false),($4,false),($5,false),($6,false)",[members[9],members[10],members[11],members[12],members[13],members[14]])
await db.query("UPDATE public.match_round_submissions SET import_metadata=jsonb_build_object('source','current','normalized_name','合法当前','matched_member_id',member_id) WHERE member_id=$1",[members[10]])
await db.query("UPDATE public.match_round_submissions SET import_metadata=jsonb_build_object('source','temp','normalized_name','合法临时') WHERE member_id=$1",[members[11]])
await db.query("UPDATE public.members SET user_id=NULL,account_status='unbound',record_source='import',record_scope='historical',member_number=$2 WHERE id=$1",[members[11],`IMP-${round.slice(0,8)}-001`])
await db.query("UPDATE public.match_round_submissions SET import_metadata=jsonb_build_object('source','legacy-temp','normalized_name','合法历史') WHERE member_id=$1",[members[12]])
await db.query("UPDATE public.members SET user_id=NULL,account_status='unbound',record_source='import',record_scope='current',member_number=$2 WHERE id=$1",[members[12],`IMP-${round.slice(0,8)}-002`])
await db.query("UPDATE public.match_round_submissions SET import_metadata=jsonb_build_object('source','temp','normalized_name','伪造临时') WHERE member_id=$1",[members[13]])
await db.query("UPDATE public.match_round_submissions SET import_metadata=jsonb_build_object('source','current','normalized_name','错误绑定','matched_member_id',$2::text) WHERE member_id=$1",[members[14],members[0]])
// Existing valid assignment never removes anyone from the capture pool.
const prior=await scalar("INSERT INTO public.match_sessions(round_id,created_by,status,audit_reason) VALUES($1,$2,'draft','既有批次隔离') RETURNING id",[round,admin])
await db.exec('ALTER TABLE public.match_sessions DISABLE TRIGGER matching_publication_guard_session')
await db.query("UPDATE public.match_sessions SET status='confirmed' WHERE id=$1",[prior])
await db.exec('ALTER TABLE public.match_sessions ENABLE TRIGGER matching_publication_guard_session')
await db.exec('ALTER TABLE public.match_results DISABLE TRIGGER matching_publication_guard_result')
const priorResult=await scalar("INSERT INTO public.match_results(session_id,member_a_id,member_b_id,status) VALUES($1,$2,$3,'confirmed') RETURNING id",[prior,members[0],members[16]])
await db.exec('ALTER TABLE public.match_results ENABLE TRIGGER matching_publication_guard_result')
const publication=await scalar("INSERT INTO matching_publication.publications(session_id,round_id,version,round_name,reason) VALUES($1,$2,1,'既有匹配','隔离既有') RETURNING id",[prior,round])
await db.query('INSERT INTO matching_publication.active_assignments VALUES($1,$2,$3,$4)',[round,members[0],publication,priorResult])
await db.query("INSERT INTO public.pair_relationships VALUES($1,$2,'历史伙伴隐私','blacklist')",[members[1],members[17]])
await db.query('INSERT INTO public.mutual_reviews(reviewer_id,reviewee_id,overall_score) VALUES($1,$2,5)',[members[1],members[17]])
for(const r of ['anon','authenticated']){
 await role(r);await rejects('SELECT public.admin_capture_matching_input($1,$2,$3)',/permission denied/,[round,admin,'权限隔离测试'])
 await rejects('SELECT public.admin_read_matching_input($1,$2)',/permission denied/,[legacy,admin])
 await rejects('SELECT * FROM matching_run.snapshots',/permission denied/)
}
await role('authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[users[0]])
await rejects('SELECT public.admin_get_matching_input_metadata($1)',/ADMIN_REQUIRED/,[legacy])
await rejects('SELECT matching_run.metadata($1)',/ADMIN_REQUIRED/,[legacy])
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[adminUser])
check(await metadata(legacy),{legacy:true,status:'legacy'},'ordinary admin sees explicit legacy metadata')
await role('service_role');await rejects('SELECT public.admin_capture_matching_input($1,$2,$3)',/SERVER_ADMIN_REQUIRED/,[round,members[0],'错误管理员'])
const cap=await capture()
check(eligible(cap),[members[15],members[12],members[11],members[10],members[1],members[0]],'eligibility preserves the complete valid pool in the existing DESC order')
check(eligible(cap).includes(members[0]),true,'same-round active assignment remains eligible')
for(const [i,key] of [[2,'cancelled'],[3,'member_not_approved'],[4,'account_unavailable'],[5,'not_player'],[6,'not_current'],[7,'anonymized'],[8,'unbound'],[9,'profile_incomplete'],[13,'profile_incomplete'],[14,'profile_incomplete']])check(reason(cap,members[i]).includes(key),true,`eligibility ${key} ${i}`)
check(cap.source.eligibility.find(e=>e.member_id===members[10]).import_exempt,true,'valid current import retains readiness exception')
check(cap.source.submissions.find(s=>s.member_id===members[0]).member.member_identity.secret_identity_note,undefined,'profile snapshot excludes non-algorithm private columns')
check(cap.source.history_results.map(h=>h.id),[priorResult],'history captures confirmed session/results only')
const s=await createSession(cap)
check(await scalar('SELECT input_snapshot_required FROM public.match_sessions WHERE id=$1',[s]),true,'round algorithm automatically requires a snapshot')
await rejects('UPDATE public.match_sessions SET input_snapshot_required=false WHERE id=$1',/MARKER_IMMUTABLE/,[s])
await rejects("SELECT public.admin_finalize_matching_session($1,$2,'open',r.survey_start,r.survey_end,'未封存不能完成') FROM public.match_rounds r WHERE id=$2",/INPUT_NOT_SEALED/,[s,round])
await role('service_role');await rejects('SELECT public.admin_seal_matching_input($1,$2,$3,$4)',/COHORT_MISMATCH/,[cap.snapshot_id,s,admin,{...engine(cap),idMap:[]}])
await rejects('SELECT public.admin_seal_matching_input($1,$2,$3,$4)',/ENGINE_INPUT_INVALID/,[cap.snapshot_id,s,admin,{...engine(cap),config:{changed:true}}])
await rejects('SELECT public.admin_seal_matching_input($1,$2,$3,$4)',/SNAPSHOT_UNAVAILABLE/,[cap.snapshot_id,s,superAdmin,engine(cap)])
await rejects('SELECT public.admin_seal_matching_input($1,$2,$3,$4)',/COHORT_MISMATCH/,[cap.snapshot_id,s,admin,{...engine(cap),candidates:[...engine(cap).candidates].reverse(),idMap:[...engine(cap).idMap].reverse()}])
check((await seal(cap,s)).status,'sealed','exact immutable engine input sealed')
check(await scalar('SELECT public.admin_discard_matching_input($1,$2)',[cap.snapshot_id,admin]),false,'discard cannot erase an already sealed input')
await rejects('SELECT public.admin_seal_matching_input($1,$2,$3,$4)',/SNAPSHOT_UNAVAILABLE/,[cap.snapshot_id,s,admin,engine(cap)])
await role('authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[adminUser])
for(const id of eligible(cap))await db.query("INSERT INTO public.unmatched_diagnostics(session_id,member_id,reason,audit_reason) VALUES($1,$2,'overflow','完整批次诊断')",[s,id])
const windowBefore=await scalar('SELECT jsonb_build_array(status,survey_start,survey_end) FROM public.match_rounds WHERE id=$1',[round])
check((await scalar("SELECT public.admin_finalize_matching_session($1,$2,'open',r.survey_start,r.survey_end,'已封存完成检查') FROM public.match_rounds r WHERE id=$2",[s,round])).results_ready,true,'sealed complete input finalizes through existing atomic RPC')
check(await scalar('SELECT jsonb_build_array(status,survey_start,survey_end) FROM public.match_rounds WHERE id=$1',[round]),windowBefore,'finalize preserves ongoing collection status and dates exactly')
check((await scalar("SELECT public.admin_finalize_matching_session($1,$2,'open',r.survey_start,r.survey_end,'已封存重试完成') FROM public.match_rounds r WHERE id=$2",[s,round])).already_applied,true,'sealed finalize retry preserves existing semantics')
const meta=await metadata(s)
check(meta.eligible_count,6,'ordinary admin sees cohort size')
check('source' in meta,false,'metadata cannot reveal raw profile or survey answers')
check('engine_input' in meta,false,'metadata cannot reveal raw algorithm inputs')
await role();await db.query("UPDATE public.member_identity SET full_name='后来的姓名',hobby_tags=ARRAY['后来的爱好'] WHERE member_id=$1",[members[0]])
await db.query("UPDATE public.match_round_submissions SET availability=$2 WHERE member_id=$1",[members[0],{"2026-10-30":["晚上"]}])
await role('service_role')
const stored=await scalar('SELECT public.admin_read_matching_input($1,$2)',[s,admin])
check(stored.source,cap.source,'later answer/profile changes cannot alter captured sources')
check(stored.engine_input,engine(cap),'later answer/profile changes cannot alter sealed engine input')
const unsealed=await capture();await scalar('SELECT public.admin_discard_matching_input($1,$2)',[unsealed.snapshot_id,admin])
await role();check(await scalar('SELECT count(*)::int FROM matching_run.snapshots WHERE id=$1',[unsealed.snapshot_id]),0,'failed-run pending capture can be discarded')
check(await scalar('SELECT count(*)::int FROM matching_run.subjects WHERE snapshot_id=$1 AND member_id=$2',[cap.snapshot_id,members[17]]),1,'non-candidate historical partner tracked for erasure')
await db.query("UPDATE public.members SET anonymized_at=clock_timestamp(),account_status='closed' WHERE id=$1",[members[17]])
check(await scalar('SELECT source IS NULL AND engine_input IS NULL AND redacted_at IS NOT NULL FROM matching_run.snapshots WHERE id=$1',[cap.snapshot_id]),true,'historical partner erasure removes all nested private payload')
await role('service_role');check((await scalar('SELECT public.admin_read_matching_input($1,$2)',[s,admin])).source,null,'read after erasure contains no old source')
const pending=await capture();await role();await db.query("UPDATE public.members SET anonymized_at=clock_timestamp(),account_status='closed' WHERE id=$1",[members[1]])
const ps=await createSession(pending)
await role('service_role');await rejects('SELECT public.admin_seal_matching_input($1,$2,$3,$4)',/SNAPSHOT_UNAVAILABLE/,[pending.snapshot_id,ps,admin,engine(pending)])
await role();await db.query('DELETE FROM public.match_sessions WHERE id=$1',[s])
check(await scalar('SELECT count(*)::int FROM matching_run.snapshots WHERE session_id=$1',[s]),0,'draft compensation deletion removes associated snapshot')
check(await scalar("SELECT count(*)::int FROM public.community_notifications WHERE notification_type LIKE 'matching_%'"),0,'capture/seal never publishes results or sends notifications')
check(await scalar('SELECT status FROM public.match_rounds WHERE id=$1',[round]),'open','input capture leaves collection open')
check(await scalar("SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('admin_capture_matching_input','admin_seal_matching_input','admin_discard_matching_input','admin_read_matching_input','admin_get_matching_input_metadata') AND p.prosecdef"),0,'public functions remain invoker wrappers')
await role('authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[adminUser])
const manual=await scalar("INSERT INTO public.match_sessions(round_id,created_by,algorithm,audit_reason) VALUES($1,$2,'manual','人工原路径') RETURNING id",[round,admin])
check(await scalar('SELECT input_snapshot_required FROM public.match_sessions WHERE id=$1',[manual]),false,'unrelated manual path is not forced into a new input workflow')
await db.query("UPDATE public.match_sessions SET algorithm='max_coverage_split',input_snapshot_required=false WHERE id=$1",[manual])
check(await scalar('SELECT input_snapshot_required FROM public.match_sessions WHERE id=$1',[manual]),true,'manual-first algorithm update cannot bypass required input')
await rejects("SELECT public.admin_finalize_matching_session($1,$2,'open',r.survey_start,r.survey_end,'转换须保存输入') FROM public.match_rounds r WHERE id=$2",/INPUT_NOT_SEALED/,[manual,round])
const unattached=await scalar("INSERT INTO public.match_sessions(created_by,algorithm,audit_reason) VALUES($1,'max_coverage_split','未关联会话隔离') RETURNING id",[admin])
check(await scalar('SELECT input_snapshot_required FROM public.match_sessions WHERE id=$1',[unattached]),false,'unattached path retains old behavior before entering a round')
await db.query('UPDATE public.match_sessions SET round_id=$2 WHERE id=$1',[unattached,round])
check(await scalar('SELECT input_snapshot_required FROM public.match_sessions WHERE id=$1',[unattached]),true,'attaching a round to an algorithm row requires a snapshot')
await db.query("UPDATE public.match_sessions SET total_candidates=2,total_matched=2,total_unmatched=0,audit_reason='历史会话汇总' WHERE id=$1",[legacy])
await db.query("INSERT INTO public.match_results(session_id,member_a_id,member_b_id,audit_reason) VALUES($1,$2,$3,'历史会话结果')",[legacy,members[0],members[15]])
check(await scalar('SELECT input_snapshot_required FROM public.match_sessions WHERE id=$1',[legacy]),false,'legacy normal summary update does not acquire a fake input requirement')
check((await scalar("SELECT public.admin_finalize_matching_session($1,$2,'open',r.survey_start,r.survey_end,'旧会话兼容完成') FROM public.match_rounds r WHERE id=$2",[legacy,round])).results_ready,true,'legacy complete session retains original finalize behavior')
await role('service_role');await rejects('SELECT public.admin_read_matching_input($1,$2)',/SERVER_ADMIN_REQUIRED/,[manual,members[0]])
await rejects('INSERT INTO matching_run.snapshots(round_id,actor_admin_id,submitted_count,eligible_count,excluded_count,source_digest,reason) VALUES($1,$2,0,0,0,$3,$4)',/permission denied/,[round,admin,'forged','伪造原始输入'])
await role();
check(await scalar("SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='matching_run' AND c.relkind='r' AND c.relrowsecurity"),2,'all internal tables have RLS')
check(await scalar("SELECT has_function_privilege('authenticated','public.admin_seal_matching_input(uuid,uuid,uuid,jsonb)','EXECUTE')"),false,'browser administrator cannot forge engine input via seal')
check(await scalar("SELECT has_function_privilege('anon','public.admin_get_matching_input_metadata(uuid)','EXECUTE')"),false,'anonymous caller cannot inspect metadata')
const postflight=await scalar(read('supabase/audits/matching-run-input-postflight.sql'));
check(postflight.finalizer_has_input_guard,true,'read-only postflight confirms the completion guard');
check(postflight.source_reads_effective_assignments,false,'source SQL does not filter active assignments');

// Forward-only phase 2: retain the v1 seal contract and widen only its explicit
// engine-version allowlist. The same real publication functions handle a pool
// larger than the old six-person grouping limit, without schema duplication.
const v1Round=await scalar("INSERT INTO public.match_rounds(round_name) VALUES('旧引擎版本兼容隔离') RETURNING id")
for(const member of [members[0],members[15]])await db.query('INSERT INTO public.match_round_submissions(round_id,member_id) VALUES($1,$2)',[v1Round,member])
await role('service_role')
const oldVersionCapture=await capture(v1Round)
const oldVersionSession=await createSession(oldVersionCapture)
check((await seal(oldVersionCapture,oldVersionSession)).algorithm_version,'max_coverage_split:1','v1 engine input is sealed before the forward migration')
const oldVersionRead=await scalar('SELECT public.admin_read_matching_input($1,$2)',[oldVersionSession,admin])
await role()
const functionBefore=await scalar("SELECT jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl,'security_definer',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile,'args',p.proargnames,'return_type',p.prorettype) FROM pg_proc p WHERE p.oid='matching_run.seal(uuid,uuid,uuid,jsonb)'::regprocedure")
const unchangedFunctionsSql="SELECT COALESCE(jsonb_object_agg(p.oid::regprocedure::text,pg_get_functiondef(p.oid)),'{}'::jsonb) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('matching_run','matching_publication','public') AND p.oid<>'matching_run.seal(uuid,uuid,uuid,jsonb)'::regprocedure"
const unchangedFunctions=await scalar(unchangedFunctionsSql)
const businessTables=['members','match_rounds','match_round_submissions','match_sessions','match_results','unmatched_diagnostics','community_notifications','questionnaire_versions','questionnaire_responses']
const businessRows=async()=>Object.fromEntries(await Promise.all(businessTables.map(async name=>[name,await scalar(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM public.${name} t`)])))
const migrationBusinessBefore=await businessRows()
const migrationPath='supabase/migrations/20261023081549_matching_single_pool_algorithm_v2.sql'
await db.exec(read(migrationPath))
check(await businessRows(),migrationBusinessBefore,'v2 allowlist migration does not rewrite any existing business or questionnaire rows')
const functionAfter=await scalar("SELECT jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl,'security_definer',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile,'args',p.proargnames,'return_type',p.prorettype) FROM pg_proc p WHERE p.oid='matching_run.seal(uuid,uuid,uuid,jsonb)'::regprocedure")
const oldVersionCheck="p_engine_input->>'algorithm_version' IS DISTINCT FROM 'max_coverage_split:1'"
const newVersionCheck="(p_engine_input->>'algorithm_version' IS DISTINCT FROM 'max_coverage_split:1' AND p_engine_input->>'algorithm_version' IS DISTINCT FROM 'max_coverage_split:2')"
check(functionAfter,{...functionBefore,definition:functionBefore.definition.replace(oldVersionCheck,newVersionCheck)},'only the seal version condition changes; owner, ACL, config, signature and every other validation remain identical')
check(await scalar(unchangedFunctionsSql),unchangedFunctions,'all other source, privacy, publication and wrapper functions are byte-for-byte unchanged')
await assert.rejects(()=>db.exec(read(migrationPath)),/MATCH_RUN_SEAL_BASELINE_CHANGED/);checks++
await db.exec('ROLLBACK')
await role('service_role')
check(await scalar('SELECT public.admin_read_matching_input($1,$2)',[oldVersionSession,admin]),oldVersionRead,'already sealed v1 source and exact engine input remain readable and immutable')
const freshV1Capture=await capture(v1Round)
const freshV1Session=await createSession(freshV1Capture)
check((await seal(freshV1Capture,freshV1Session)).algorithm_version,'max_coverage_split:1','a fresh v1 input still seals after the v2 forward migration')
const invalidVersionCapture=await capture(v1Round)
const invalidVersionSession=await createSession(invalidVersionCapture)
await role('service_role')
for(const version of ['max_coverage_split:0','max_coverage_split:3','unknown',null,2]){
 await rejects('SELECT public.admin_seal_matching_input($1,$2,$3,$4)',/ENGINE_INPUT_INVALID/,[invalidVersionCapture.snapshot_id,invalidVersionSession,admin,{...engine(invalidVersionCapture),algorithm_version:version}])
}
const missingVersionInput=engine(invalidVersionCapture)
delete missingVersionInput.algorithm_version
await rejects('SELECT public.admin_seal_matching_input($1,$2,$3,$4)',/ENGINE_INPUT_INVALID/,[invalidVersionCapture.snapshot_id,invalidVersionSession,admin,missingVersionInput])
check((await seal(invalidVersionCapture,invalidVersionSession,{...engine(invalidVersionCapture),algorithm_version:'max_coverage_split:2'})).algorithm_version,'max_coverage_split:2','v2 input seals after failed missing/null/unknown versions without weakening validation')

await role()
const poolMembers=Array.from({length:13},(_,i)=>`40000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`)
const poolUsers=poolMembers.map((_,i)=>`50000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`)
const poolRound=await scalar("INSERT INTO public.match_rounds(round_name) VALUES('十三人单池发布隔离') RETURNING id")
for(let i=0;i<poolMembers.length;i++){
 await db.query('INSERT INTO public.members(id,user_id,member_number) VALUES($1,$2,$3)',[poolMembers[i],poolUsers[i],`POOL_${i+1}`])
 await db.query("INSERT INTO public.member_identity(member_id,full_name,gender,hobby_tags) VALUES($1,$2,'女',ARRAY['桌游'])",[poolMembers[i],`隔离池成员${i+1}`])
 await db.query("INSERT INTO public.match_round_submissions(round_id,member_id,game_type_pref,created_at) VALUES($1,$2,'多人',now()+($3::integer*interval '1 second'))",[poolRound,poolMembers[i],i])
}
const poolWindow=await scalar('SELECT jsonb_build_array(status,survey_start,survey_end) FROM public.match_rounds WHERE id=$1',[poolRound])
const createPoolSession=async()=>{
 await role('service_role')
 const cap=await capture(poolRound)
 const session=await createSession(cap)
 const input={...engine(cap),algorithm_version:'max_coverage_split:2'}
 await seal(cap,session,input)
 await role('authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[adminUser])
 await db.query("UPDATE public.match_sessions SET total_matched=13,total_unmatched=0,audit_reason='十三人单池汇总' WHERE id=$1",[session])
 const result=await scalar("INSERT INTO public.match_results(session_id,member_a_id,member_b_id,group_members,best_slot,audit_reason) VALUES($1,$2,NULL,$3,'2026-10-27_下午','十三人单池结果') RETURNING id",[session,poolMembers[0],poolMembers])
 const finalized=await scalar("SELECT public.admin_finalize_matching_session($1,$2,'open',r.survey_start,r.survey_end,'十三人单池完成') FROM public.match_rounds r WHERE id=$2",[session,poolRound])
 return {cap,session,result,finalized}
}
const pool=await createPoolSession()
check(pool.finalized.results_ready,true,'real finalize accepts one thirteen-member result with a sealed v2 input')
check(await scalar('SELECT count(*)::int FROM public.match_results WHERE session_id=$1',[pool.session]),1,'thirteen participants are persisted as exactly one multiplayer pool')
check(await scalar('SELECT cardinality(group_members) FROM public.match_results WHERE id=$1',[pool.result]),13,'stored result does not truncate the pool at six members')
check(await scalar('SELECT jsonb_build_array(member_b_id,best_slot) FROM public.match_results WHERE id=$1',[pool.result]),[null,'2026-10-27_下午'],'single-pool result preserves the actual engine member/slot storage shape')
check(await scalar('SELECT jsonb_build_array(total_candidates,total_matched,total_unmatched) FROM public.match_sessions WHERE id=$1',[pool.session]),[13,13,0],'finalized summary counts all thirteen participants')
check(await scalar('SELECT jsonb_build_array(status,survey_start,survey_end) FROM public.match_rounds WHERE id=$1',[poolRound]),poolWindow,'thirteen-person finalize preserves collection status and original window')
const poolPublication=await scalar("SELECT public.admin_publish_match_session($1,0,'十三人单池发布')",[pool.session])
check(poolPublication.publication_version,1,'thirteen-person pool publishes through the existing guarded API')
check((await scalar("SELECT public.admin_publish_match_session($1,0,'十三人单池发布重试')",[pool.session])).already_applied,true,'thirteen-person pool publication retry is idempotent')
await role()
check(await scalar('SELECT count(*)::int FROM matching_publication.active_assignments WHERE round_id=$1',[poolRound]),13,'all thirteen pool members receive unique effective assignments')
check(await scalar('SELECT count(DISTINCT member_id)::int FROM matching_publication.roster WHERE publication_id=$1',[poolPublication.publication_id]),13,'publication roster includes all thirteen members once')
check(await scalar("SELECT count(*)::int FROM public.community_notifications WHERE match_session_id=$1 AND notification_type='matching_published'",[pool.session]),13,'all thirteen members receive one publication notice despite the retry')
check(await scalar("SELECT count(DISTINCT recipient_member_id)::int FROM public.community_notifications WHERE match_session_id=$1 AND notification_type='matching_published'",[pool.session]),13,'publication notices include members beyond the sixth position')
await role('authenticated')
for(let i=0;i<poolMembers.length;i++){
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[poolUsers[i]])
 const outcomes=await scalar('SELECT public.get_my_matching_publications()')
 check(outcomes.find(outcome=>outcome.round_id===poolRound)?.result_id,pool.result,`pool member ${i+1} sees the station publication outcome`)
 check(await scalar('SELECT cardinality(group_members) FROM public.match_results WHERE id=$1',[pool.result]),13,`pool member ${i+1} can read the complete thirteen-member result under participant RLS`)
}
const competingPool=await createPoolSession()
check(eligible(competingPool.cap).length,13,'already assigned members remain in the next complete candidate pool')
await rejects("SELECT public.admin_publish_match_session($1,0,'冲突单池不得覆盖')",/CONFLICT/,[competingPool.session])
check(await scalar('SELECT count(*)::int FROM public.community_notifications WHERE match_session_id=$1',[competingPool.session]),0,'competing full-pool publication rolls back every notice')
check(await scalar('SELECT status FROM public.match_sessions WHERE id=$1',[competingPool.session]),'draft','unique-assignment publication conflict leaves the competing pool as a draft')
const poolWithdrawal=await scalar("SELECT public.admin_unpublish_match_session($1,1,'十三人单池撤回')",[pool.session])
check(poolWithdrawal.published,false,'existing withdrawal API withdraws the complete single pool')
check((await scalar("SELECT public.admin_unpublish_match_session($1,1,'十三人单池撤回重试')",[pool.session])).already_applied,true,'whole-pool withdrawal retry is idempotent')
await role()
check(await scalar('SELECT count(*)::int FROM matching_publication.active_assignments WHERE round_id=$1',[poolRound]),0,'whole-pool withdrawal releases every one of thirteen effective assignments')
check(await scalar("SELECT count(*)::int FROM public.community_notifications WHERE match_session_id=$1 AND notification_type='matching_withdrawn'",[pool.session]),13,'whole-pool withdrawal notifies all thirteen members exactly once')
check(await scalar('SELECT cardinality(group_members) FROM public.match_results WHERE id=$1',[pool.result]),13,'withdrawal retains the full thirteen-member draft result')
await role('authenticated')
for(let i=0;i<poolMembers.length;i++){
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[poolUsers[i]])
 check((await scalar('SELECT public.get_my_matching_publications()')).find(outcome=>outcome.round_id===poolRound)?.status,'withdrawn',`pool member ${i+1} sees the withdrawn outcome`)
 check(await scalar('SELECT count(*)::int FROM public.match_results WHERE id=$1',[pool.result]),0,`pool member ${i+1} no longer directly reads the withdrawn result`)
}
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[adminUser])
check((await scalar("SELECT public.admin_publish_match_session($1,0,'释放后发布新单池')",[competingPool.session])).published,true,'the waiting full-pool draft can publish after all old assignments are released')
await role()
check(await scalar('SELECT count(*)::int FROM matching_publication.active_assignments WHERE round_id=$1',[poolRound]),13,'replacement publication through the existing explicit workflow covers all thirteen again')
await role('authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[poolUsers[12]])
check((await scalar("SELECT public.request_my_match_cancellation($1,'第十三位成员申请整池取消',1)",[competingPool.result])).cancellation_status,'pending','a pool member beyond the sixth position can request cancellation through the real participant API')
const poolCancelToken=await scalar('SELECT cancellation_requested_at::text FROM public.match_results WHERE id=$1',[competingPool.result])
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[adminUser])
check((await scalar("SELECT public.admin_approve_matching_cancellation($1,1,$2,'批准十三人整池取消')",[competingPool.result,poolCancelToken])).already_applied,false,'the existing admin cancellation API approves the whole thirteen-person result')
check((await scalar("SELECT public.admin_approve_matching_cancellation($1,1,$2,'批准十三人整池取消重试')",[competingPool.result,poolCancelToken])).already_applied,true,'whole-pool cancellation approval retry is idempotent')
check(await scalar('SELECT jsonb_build_array(status,cancellation_status,cardinality(group_members)) FROM public.match_results WHERE id=$1',[competingPool.result]),['cancelled','approved',13],'cancellation preserves all thirteen members as one cancelled result')
check(await scalar('SELECT jsonb_build_array(total_candidates,total_matched,total_unmatched) FROM public.match_sessions WHERE id=$1',[competingPool.session]),[13,0,13],'whole-pool cancellation updates the summary for all thirteen members')
await role()
check(await scalar('SELECT count(*)::int FROM matching_publication.active_assignments WHERE round_id=$1',[poolRound]),0,'whole-pool cancellation releases all thirteen effective assignments')
check(await scalar("SELECT count(*)::int FROM public.community_notifications WHERE match_session_id=$1 AND notification_type='matching_cancelled'",[competingPool.session]),13,'whole-pool cancellation and approval retry notify all thirteen exactly once')
check(await scalar("SELECT count(DISTINCT recipient_member_id)::int FROM public.community_notifications WHERE match_session_id=$1 AND notification_type='matching_cancelled'",[competingPool.session]),13,'cancellation notices are delivered to every pool participant including positions beyond six')
await role('authenticated')
for(let i=0;i<poolMembers.length;i++){
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[poolUsers[i]])
 check((await scalar('SELECT public.get_my_matching_publications()')).find(outcome=>outcome.round_id===poolRound)?.status,'cancelled',`pool member ${i+1} sees the whole-pool cancelled outcome`)
 check(await scalar('SELECT cardinality(group_members) FROM public.match_results WHERE id=$1',[competingPool.result]),13,`pool member ${i+1} retains access to the complete cancelled publication history`)
}
await role()
check(await scalar('SELECT count(*)::int FROM matching_publication.write_context'),0,'all thirteen-person publication and withdrawal operations clear trusted contexts')
console.log(`Matching input snapshot audit: ${checks} checks passed; isolated PGlite only.`)
await db.close()
