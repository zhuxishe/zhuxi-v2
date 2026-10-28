// Isolated PostgreSQL tests only. No network, credentials, live users or Production database.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFileSync,readdirSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
process.env.MATCHING_RUN_LIFECYCLE_SUITE='1'
const {auditContext:ctx}=await import('./matching-run-input-pglite.mjs')
const {db,scalar,role,read,superAdmin,superUser}=ctx
let checks=0
const check=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++}
const rejects=async(work,pattern,label)=>{await assert.rejects(work,pattern,label);checks++}
const extract=(source,name)=>{
 const pattern=new RegExp('CREATE (?:OR REPLACE )?FUNCTION '+name.replaceAll('.','\\.')+'\\('),m=pattern.exec(source);assert.ok(m,name)
 const sub=source.slice(m.index),d=/AS (\$[a-z_]*\$)/i.exec(sub);assert.ok(d,name)
 return sub.slice(0,sub.indexOf(d[1]+';',d.index+d[0].length)+d[1].length+1)
}
const table=(source,name)=>{const i=source.indexOf('CREATE TABLE '+name+' (');assert.ok(i>=0,name);return source.slice(i,source.indexOf('\n);',i)+3)}
await role()
await db.exec(`
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,deleted_at timestamptz,banned_until timestamptz,raw_app_meta_data jsonb DEFAULT '{}',last_sign_in_at timestamptz);
 ALTER TABLE public.members ADD COLUMN email text,ADD COLUMN profile_stage text DEFAULT 'complete',ADD COLUMN account_linked_at timestamptz,ADD COLUMN onboarding_step integer DEFAULT 4,ADD COLUMN last_profile_saved_at timestamptz,ADD COLUMN submitted_at timestamptz,ADD COLUMN created_at timestamptz DEFAULT now(),ADD COLUMN updated_at timestamptz DEFAULT now();
 ALTER TABLE public.admin_users ADD COLUMN name text;
 INSERT INTO auth.users(id,email) SELECT DISTINCT user_id,'fixture-'||user_id||'@example.invalid' FROM public.members WHERE user_id IS NOT NULL UNION SELECT user_id,'fixture-admin-'||user_id||'@example.invalid' FROM public.admin_users;
 CREATE TABLE private.member_profile_audit_log(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,member_id uuid,member_id_snapshot uuid,action_type text,section text,changed_fields text[],before_values jsonb,after_values jsonb,reason text,source text,actor_user_id uuid,actor_admin_id uuid,actor_name text,metadata jsonb);
 CREATE TABLE private.member_auth_tombstones(auth_user_id uuid);
 CREATE TABLE public.legacy_members(id uuid PRIMARY KEY,canonical_member_id uuid,full_name text,member_no text,school text,created_at timestamptz);
 ALTER TABLE public.members ADD CONSTRAINT members_current_member_number_format_check CHECK(true);
 ALTER TABLE public.match_rounds ADD COLUMN activity_start date DEFAULT '2026-10-25',ADD COLUMN activity_end date DEFAULT '2026-11-01',ADD COLUMN config_revision integer DEFAULT 0,ADD COLUMN content_config jsonb DEFAULT '{}';
 ALTER TABLE public.match_rounds ENABLE ROW LEVEL SECURITY;
 CREATE POLICY fixture_round_read ON public.match_rounds FOR SELECT USING(true);
 CREATE SCHEMA matching_adjustment;
 CREATE FUNCTION matching_adjustment.scoped_source(p_source jsonb,p_ids uuid[]) RETURNS jsonb LANGUAGE sql AS $$SELECT p_source$$;
 CREATE TABLE matching_adjustment.operations(session_id uuid,status text,lease_expires_at timestamptz);
 CREATE FUNCTION matching_adjustment.revision(p_session_id uuid) RETURNS text LANGUAGE sql AS $$SELECT 'fixture-revision'::text$$;
`)
// This parent fixture intentionally uses human-readable nonstandard numbers; make
// only these fake fixture rows valid before installing the real numbering CHECK.
await db.exec(`UPDATE public.members SET member_number='ZXS_'||lpad((10000+row_number)::text,5,'0') FROM (SELECT id,row_number() OVER(ORDER BY id) FROM public.members WHERE record_scope='current') x WHERE members.id=x.id`)
const numbering=read('supabase/migrations/20261006111856_member_number_allocation.sql')
await db.exec("CREATE SEQUENCE private.member_number_sequence AS bigint MINVALUE 1 START WITH 248")
for(const name of ['private.member_number_roster','private.member_number_canonical','private.member_number_max_issued','private.member_number_history_contains','private.member_number_next','private.member_number_validate','private.member_number_log','private.member_number_before_write','private.member_number_audit_change','private.member_number_on_identity_saved'])await db.exec(extract(numbering,name))
const normalizedNumbering=read('supabase/migrations/20261012134601_normalize_roster_names_and_reconcile_numbers.sql');
for(const name of ['private.member_number_released_manifest','private.member_number_is_released','private.member_number_next','private.member_number_name_key','private.member_number_validate','private.member_number_before_write','private.member_number_on_identity_saved'])await db.exec(extract(normalizedNumbering,name));
await db.exec(`CREATE TRIGGER member_number_before_write BEFORE INSERT OR UPDATE OF member_number,status,account_status,anonymized_at,record_scope,record_source ON public.members FOR EACH ROW EXECUTE FUNCTION private.member_number_before_write();
 CREATE TRIGGER member_number_audit_change AFTER INSERT OR UPDATE OF member_number,status,account_status,anonymized_at OR DELETE ON public.members FOR EACH ROW EXECUTE FUNCTION private.member_number_audit_change();
 CREATE TRIGGER member_number_on_identity_saved AFTER INSERT OR UPDATE OF full_name ON public.member_identity FOR EACH ROW EXECUTE FUNCTION private.member_number_on_identity_saved();`)
const master=read('supabase/migrations/20260829175645_user_member_master_v1.sql')
for(const name of ['private.member_master_is_admin','private.member_master_is_super_admin','public.admin_list_member_directory'])await db.exec(extract(master,name))
await db.exec(read('supabase/migrations/20261002151147_member_directory_filters.sql'))
await db.exec(read('supabase/migrations/20261006123243_admin_member_overview.sql'))
await db.exec(read('supabase/migrations/20261023112514_matching_run_lifecycle.sql'))
await db.exec(`ALTER TABLE public.questionnaire_versions ADD COLUMN kind text;CREATE TABLE public.questionnaire_templates(kind text PRIMARY KEY,published_version_id uuid REFERENCES public.questionnaire_versions(id)); CREATE TABLE public.interview_evaluations(id uuid PRIMARY KEY,attractiveness_score numeric);`)
const peers=read('supabase/migrations/20261002165912_round_peer_reviews.sql')
for(const name of ['private.round_peer_review_settings','private.round_peer_review_participants','private.round_peer_reviews','private.round_peer_reports'])await db.exec(table(peers,name))
await db.exec('GRANT SELECT ON public.members,public.interview_evaluations,public.match_results TO service_role');
await db.exec(read('supabase/migrations/20261023080507_protect_admin_assessment_score_columns.sql'));
for(const name of ['private.peer_current_player','private.peer_member_eligible','private.peer_participant_eligible','private.peer_effective_opened_at','private.peer_settings_json','private.peer_review_json','private.peer_report_json','public.player_list_round_peer_review_events','public.player_get_round_peer_reviews'])await db.exec(extract(peers,name));
const soft=read('supabase/migrations/20261010101614_matching_round_soft_delete.sql')
await db.exec(extract(soft,'private.peer_member_eligible'))
const listPatch=soft.slice(soft.indexOf("  definition := pg_get_functiondef('public.player_list_round_peer_review_events()"),soft.indexOf("  definition := pg_get_functiondef('public.admin_list_round_peer_review_events()"))
const getPatch=soft.slice(soft.indexOf("  definition := pg_get_functiondef('public.player_get_round_peer_reviews(uuid,text,integer,integer)"),soft.indexOf("  FOREACH function_name IN ARRAY ARRAY['public.admin_get_round_peer_reviews"))
await db.exec('DO $migration$ DECLARE definition text;original text;replacement text;BEGIN '+listPatch+getPatch+' END $migration$;')

await db.exec(read('supabase/migrations/20261023155710_matching_scoring_v3_snapshot.sql'))
await db.exec(read('supabase/migrations/20261023143833_matching_excel_atomic_import.sql'));
await db.exec(read('supabase/migrations/20261025041723_replace_legacy_test_import_pool.sql'))
await db.exec(read('supabase/migrations/20261024091455_matching_publication_final_preflight.sql'))
await db.exec(`ALTER TABLE public.member_dynamic_stats ADD COLUMN review_count integer DEFAULT 0,ADD COLUMN avg_review_score numeric,ADD COLUMN recent5_avg_score numeric,ADD COLUMN replay_willing_rate numeric,ADD COLUMN updated_at timestamptz;ALTER TABLE public.mutual_reviews ADD COLUMN would_play_again boolean,ADD COLUMN created_at timestamptz DEFAULT now();`)
await db.exec(extract(read('supabase/migrations/029_lock_function_search_paths.sql'),'public.update_review_stats'))
await db.exec('CREATE TRIGGER fixture_review_statistics AFTER INSERT ON public.mutual_reviews FOR EACH ROW EXECUTE FUNCTION public.update_review_stats()')
// These are offline public-post/profile fixtures only. Existing application RPCs,
// notification triggers and the current Auth/member predicate run unchanged.
const community=read('supabase/migrations/20260716165130_community_v1_schema.sql')
await db.exec(`CREATE TABLE public.community_sanctions(member_id uuid,sanction_type text,revoked_at timestamptz,starts_at timestamptz,ends_at timestamptz);
 CREATE TABLE private.community_profile_members(member_id uuid,profile_id uuid);
 CREATE TABLE private.community_post_authors(post_id uuid,member_id uuid);
 CREATE TABLE private.community_comment_authors(comment_id uuid,member_id uuid);
 CREATE TABLE public.community_blocks(blocker_member_id uuid,blocked_profile_id uuid);
 CREATE TABLE public.community_likes(post_id uuid,member_id uuid,UNIQUE(post_id,member_id));
 CREATE TABLE public.community_comment_likes(comment_id uuid,member_id uuid,UNIQUE(comment_id,member_id));
 ALTER TABLE public.community_posts ALTER COLUMN id SET DEFAULT gen_random_uuid(),ADD COLUMN post_type text,ADD COLUMN author_profile_id uuid,ADD COLUMN title text,ADD COLUMN body text,ADD COLUMN is_anonymous boolean DEFAULT false,ADD COLUMN status text DEFAULT 'published',ADD COLUMN like_count integer DEFAULT 0;
 ALTER TABLE public.community_comments ADD COLUMN post_id uuid,ADD COLUMN parent_comment_id uuid,ADD COLUMN author_profile_id uuid,ADD COLUMN body text,ADD COLUMN is_anonymous_author boolean DEFAULT false,ADD COLUMN status text DEFAULT 'published',ADD COLUMN like_count integer DEFAULT 0,ADD COLUMN like_version bigint DEFAULT 0;
 CREATE FUNCTION private.community_post_visible_to_current(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
 CREATE FUNCTION private.community_comment_visible_to_current(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;`)
await db.exec(table(community,'public.community_notification_preferences'))
await db.exec(extract(read('supabase/migrations/20260831234821_fix_member_readonly_authorization_lock.sql'),'private.community_approved_member_id'))
for(const name of ['private.community_current_profile_id','private.community_can_interact','private.community_member_for_profile','private.community_post_author_member','private.community_comment_author_member','private.community_is_post_author','private.community_interaction_is_blocked','private.community_notification_interaction_blocked','private.community_notification_enabled','private.community_insert_notification','private.community_notify_like','private.community_notify_comment','public.community_create_treehole','public.community_add_comment','public.community_toggle_post_like'])await db.exec(extract(community,name))
await db.exec(extract(read('supabase/migrations/20261002153140_community_comment_likes.sql'),'public.community_set_comment_like'))
await db.exec(`CREATE TRIGGER fixture_community_like_notify AFTER INSERT ON public.community_likes FOR EACH ROW EXECUTE FUNCTION private.community_notify_like();
 CREATE TRIGGER fixture_community_comment_notify AFTER INSERT ON public.community_comments FOR EACH ROW EXECUTE FUNCTION private.community_notify_comment();`)
const communityGateMetadataSql="SELECT jsonb_build_object('oid',oid,'acl',proacl::text,'definer',prosecdef,'search_path',proconfig::text,'owner',proowner) FROM pg_proc WHERE oid='private.community_can_interact()'::regprocedure"
const communityGateMetadata=await scalar(communityGateMetadataSql)

const unchangedSql=`SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(p.prosrc)) FROM pg_proc p WHERE p.oid IN('private.member_number_canonical(text)'::regprocedure,'private.member_number_max_issued()'::regprocedure,'private.member_number_next()'::regprocedure,'matching_publication.unpublish_session(uuid,integer,text)'::regprocedure,'matching_publication.request_cancellation(uuid,text,integer)'::regprocedure,'matching_run.complete_run(uuid,uuid,uuid,jsonb,uuid[])'::regprocedure,'matching_run.engine_matches_source(jsonb,jsonb)'::regprocedure,'public.community_create_treehole(text,text,boolean)'::regprocedure,'public.community_add_comment(uuid,text,uuid)'::regprocedure,'public.community_toggle_post_like(uuid)'::regprocedure,'public.community_set_comment_like(uuid,boolean)'::regprocedure)`
const unchanged=await scalar(unchangedSql)
const before=await scalar(`SELECT jsonb_build_object('members',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.members m),'rounds',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.match_rounds r),'notices',(SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM public.community_notifications n),'results',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.match_results r))`)
const root=fileURLToPath(new URL('../../',import.meta.url))
const migration='supabase/migrations/'+readdirSync(root+'/supabase/migrations').find(n=>n.endsWith('_test_account_pool_isolation.sql'))
await db.exec(read(migration))
const accessMetadataSql="SELECT jsonb_object_agg(proname,jsonb_build_object('oid',oid,'source',prosrc,'acl',proacl::text,'owner',proowner,'path',proconfig::text,'definer',prosecdef)) FROM pg_proc WHERE oid IN ('public.get_my_test_round_ids()'::regprocedure,'private.test_round_visible_to_current_user(uuid)'::regprocedure)"
const accessBefore=await scalar(accessMetadataSql)
const accessMigration='supabase/migrations/'+readdirSync(root+'/supabase/migrations').find(n=>n.endsWith('_isolate_test_pool_access_helpers.sql'))
await db.exec(read(accessMigration))
check(await scalar("SELECT jsonb_object_agg(proname,jsonb_build_object('oid',oid,'source',prosrc,'acl',proacl::text,'owner',proowner,'path',proconfig::text,'definer',prosecdef)) FROM pg_proc WHERE oid IN ('test_pool_access.get_my_test_round_ids()'::regprocedure,'test_pool_access.test_round_visible_to_current_user(uuid)'::regprocedure)"),accessBefore,'moving access implementations preserves exact OIDs, bodies, ACL, owner and search_path')
for(const signature of ['public.get_my_test_round_ids()','private.test_round_visible_to_current_user(uuid)'])check(await scalar('SELECT NOT prosecdef FROM pg_proc WHERE oid=$1::regprocedure',[signature]),true,`${signature} exposes only an invoker wrapper`)
check(await scalar("SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','private') AND p.proname IN('get_my_test_round_ids','test_round_visible_to_current_user') AND p.prosecdef"),0,'no exposed-schema definer remains for either test access name')
check(await scalar("SELECT count(*)::int FROM pg_policy WHERE polname IN('test_pool_round_visibility','test_pool_session_visibility','test_pool_result_visibility') AND pg_get_expr(polqual,polrelid) LIKE '%test_pool_access.test_round_visible_to_current_user%'"),3,'all existing RLS policy dependencies continue to reference the moved implementation OID')
for(const roleName of ['anon','authenticated','service_role'])check(await scalar("SELECT has_schema_privilege($1,'test_pool_access','CREATE')",[roleName]),false,`${roleName} cannot create helpers in the implementation schema`)

check(await scalar(unchangedSql),unchanged,'number canonical/high-water/allocator, algorithms, weights, cancellation and withdrawal remain unchanged')
check(await scalar(`SELECT jsonb_build_object('members',(SELECT jsonb_agg(to_jsonb(m)-'is_test' ORDER BY id) FROM public.members m),'rounds',(SELECT jsonb_agg(to_jsonb(r)-'is_test' ORDER BY id) FROM public.match_rounds r),'notices',(SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM public.community_notifications n),'results',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.match_results r))`),before,'schema migration preserves every existing business field and sends no notices')
const server=async()=>{await role('service_role');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[superUser])}
const player=async user=>{await role('authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);await db.query("SELECT set_config('request.jwt.claim.role','authenticated',false)")}
const provision=async item=>scalar("SELECT public.admin_provision_test_account($1,$2,$3,$4,$5,'isolated-fixture-batch','用户授权隔离测试账号')",[superAdmin,item.id,item.user,item.code,item.name])
const sequence=async()=>{await role();return scalar("SELECT jsonb_build_object('max',private.member_number_max_issued(),'last',last_value,'called',is_called) FROM private.member_number_sequence")}
const seqBefore=await sequence()
const accounts=[]
for(let i=1;i<=27;i++){
 const code='TST_'+String(i).padStart(3,'0'),id=randomUUID(),user=randomUUID(),name=`合成测试成员${i}`
 await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[user,`zhuxi-tst-${String(i).padStart(3,'0')}@example.invalid`])
 const item={id,user,code,name};await server();check((await provision(item)).already_applied,false,`${code} legitimately registered`)
 accounts.push(item)
 await role()
}
check(await sequence(),seqBefore,'all27 test provisions leave formal sequence AND audit-derived maximum unchanged')
await server();check((await provision(accounts[0])).already_applied,true,'same immutable identity/batch request is idempotent')
await rejects(()=>provision({...accounts[0],id:randomUUID()}),/IDENTITY_CONFLICT/,'duplicate code cannot bind another UUID')
const wrong={id:randomUUID(),user:randomUUID(),code:'TST_028',name:'非法编号'}
await rejects(()=>provision(wrong),/PAYLOAD_INVALID/,'the test pool is exactly001–027')
await player(accounts[0].user);await rejects(()=>provision(accounts[0]),/permission denied/,'player cannot provision another identity')
for(const tableName of ['test_accounts','test_round_members','test_pool_write_context'])await rejects(()=>db.query('SELECT * FROM private.'+tableName),/permission denied/,`private ${tableName} inaccessible to player`)
await role();await rejects(()=>db.query("INSERT INTO public.admin_users(id,user_id,role) VALUES($1,$2,'admin')",[randomUUID(),accounts[0].user]),/PLAYER_ONLY/,'registered test account cannot acquire administrator privileges');
await role();await rejects(()=>db.query("UPDATE public.members SET is_test=false WHERE id=$1",[accounts[0].id]),/IDENTITY_IMMUTABLE/,'even direct updates cannot erase test identity')
await rejects(()=>db.query("INSERT INTO public.members(id,user_id,member_number) VALUES($1,$2,'TST_027')",[randomUUID(),randomUUID()]),/REGISTRATION_REQUIRED/,'unregistered regular member cannot take test number')
await rejects(()=>db.query("UPDATE public.members SET member_number='ZXS_999' WHERE id=$1",[accounts[0].id]),/REGISTRATION_REQUIRED/,'registered test member cannot enter formal numbering')
await server();await rejects(()=>scalar("SELECT public.admin_activate_test_account($1,$2,'不允许跳过真实问卷')",[superAdmin,accounts[0].id]),/INTERVIEW_INCOMPLETE/,'activation requires actual completed interview evidence')
// Questionnaire outcomes here are fixture inputs; the migration never marks a
// response complete. The operations acceptance separately invokes real answer RPCs.
for(const item of accounts){
 await role();const response=randomUUID();const version=randomUUID()
 await db.query("INSERT INTO public.questionnaire_versions(id,version,kind,template) VALUES($1,1,'interview','{}')",[version])
 await db.query("INSERT INTO public.questionnaire_responses(id,member_id,kind,version_id,completed_at) VALUES($1,$2,'interview',$3,now())",[response,item.id,version])
 await db.query("INSERT INTO public.questionnaire_assignments VALUES($1,'interview',$2)",[item.id,response])
 await db.query("INSERT INTO public.member_identity(member_id,full_name,gender) VALUES($1,$2,'male')",[item.id,item.name])
 await db.query("UPDATE public.members SET profile_stage='submitted',submitted_at=now() WHERE id=$1",[item.id])
 await server();check((await scalar("SELECT public.admin_activate_test_account($1,$2,'测试表单完成后受控批准')",[superAdmin,item.id])).activated,true,`${item.code} activation`) }
await role()
const real=[]
for(const [num,name] of [['ZXS_000','竹溪社官方'],['ZXS_001','陈风'],['ZXS_006','吴悦桐'],['ZXS_016','田松源'],['ZXS_081','吴璠'],['ZXS_250','测试专用·']]){
 const id=randomUUID(),user=randomUUID();await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[user,'real-fixture-'+num+'@example.invalid']);await db.query('INSERT INTO public.members(id,user_id) VALUES($1,$2)',[id,user]);await db.query('INSERT INTO public.member_identity(member_id,full_name) VALUES($1,$2)',[id,name]);if(num==='ZXS_250')await db.query('UPDATE public.members SET member_number=$2 WHERE id=$1',[id,num]);real.push({id,user,num})
}
const formal=await scalar("INSERT INTO public.match_rounds(round_name) VALUES('正式轮次') RETURNING id")
const round=await scalar("INSERT INTO public.match_rounds(round_name) VALUES('测试轮次') RETURNING id")
const ids=[...accounts.map(a=>a.id),...real.map(a=>a.id)]
await rejects(()=>db.query('UPDATE public.match_rounds SET is_test=true WHERE id=$1',[round]),/CONFIGURATION_REQUIRED/,'round test domain cannot be toggled through direct writes')
const outsider=randomUUID(),outsiderUser=randomUUID();await role();await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[outsiderUser,'outside@example.invalid']);await db.query('INSERT INTO public.members(id,user_id) VALUES($1,$2)',[outsider,outsiderUser]);await db.query("INSERT INTO public.member_identity(member_id,full_name) VALUES($1,'李秋翰')",[outsider]);check(await scalar('SELECT member_number FROM public.members WHERE id=$1',[outsider]),'ZXS_083','historical receipt belongs to a real non-allowlisted ZXS083 fixture')
const oldReceipt=await scalar("INSERT INTO public.community_notifications(recipient_member_id,notification_type,round_id,title_zh,title_ja,body_zh,body_ja) VALUES($1,'matching_submitted',$2,'原报名回执','元の控え','原有信息','元の情報') RETURNING to_jsonb(community_notifications)",[outsider,round])
const realMemberBaseline=await scalar('SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.members m WHERE id=ANY($1)',[real.map(a=>a.id)])
await server();check((await scalar("SELECT public.admin_configure_test_round($1,$2,$3,'限定33名受控测试参与者')",[superAdmin,round,ids])).allowed_count,33,'controlled configuration creates exact33-person allowlist')

await role();check(await scalar('SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.members m WHERE id=ANY($1)',[real.map(a=>a.id)]),realMemberBaseline,'all six real members retain their entire member rows and never become test identities');check(await scalar('SELECT to_jsonb(n) FROM public.community_notifications n WHERE id=$1',[oldReceipt.id]),oldReceipt,'ZXS083 old signup receipt survives test-domain configuration unchanged');await rejects(()=>db.query("INSERT INTO public.community_notifications(recipient_member_id,notification_type,round_id,title_zh,title_ja) VALUES($1,'matching_submitted',$2,'新测试回执','新しいテスト控え')",[outsider,round]),/NOTIFICATION_NOT_ALLOWED/,'new matching receipt cannot be sent to old non-allowlisted ZXS083');
await player(outsiderUser);check(await scalar('SELECT public.get_my_test_round_ids()'),[],'ordinary user receives no allowed test round IDs');check(await scalar('SELECT private.test_round_visible_to_current_user($1)',[round]),false,'compatibility invoker predicate preserves ordinary-player rejection');check(await scalar('SELECT count(*)::integer FROM public.match_rounds WHERE id=$1',[round]),0,'ordinary player cannot discover test round through RLS')
await player(accounts[0].user);check(await scalar('SELECT public.get_my_test_round_ids()'),[round],'bound test player sees own allowlisted test round');check(await scalar('SELECT private.test_round_visible_to_current_user($1)',[round]),true,'compatibility invoker predicate preserves TST visibility');check(await scalar('SELECT count(*)::integer FROM public.match_rounds WHERE id=$1',[round]),1,'test player can read allowed test round')
await player(real[0].user);check(await scalar('SELECT public.get_my_test_round_ids()'),[round],'allowlisted real account sees same test round')
await role('anon');await db.exec("SELECT set_config('request.jwt.claim.sub','',false)");check(await scalar('SELECT private.test_round_visible_to_current_user($1)',[round]),false,'anonymous invoker predicate cannot reveal a test round');await rejects(()=>scalar('SELECT public.get_my_test_round_ids()'),/permission denied/,'anonymous role cannot call the public own-round RPC');

await role();await rejects(()=>db.query('INSERT INTO public.match_round_submissions(round_id,member_id) VALUES($1,$2)',[formal,accounts[0].id]),/MEMBER_NOT_ALLOWED/,'test account cannot join formal matching')
await rejects(()=>db.query('INSERT INTO public.match_round_submissions(round_id,member_id) VALUES($1,$2)',[round,outsider]),/MEMBER_NOT_ALLOWED/,'unlisted real account cannot join test matching even as privileged writer')
for(const id of ids)await db.query('INSERT INTO public.match_round_submissions(round_id,member_id) VALUES($1,$2)',[round,id])
for(const id of real.map(a=>a.id))await db.query('INSERT INTO public.match_round_submissions(round_id,member_id) VALUES($1,$2)',[formal,id])
check((await scalar('SELECT matching_run.source($1)',[round])).eligibility.every(e=>e.eligible),true,'full33-person allowed pool remains eligible under unchanged readiness inputs')
const dashboard=async()=>{await player(superUser);return scalar('SELECT public.admin_member_dashboard_metrics()')}
check((await dashboard()).male_count,0,'formal gender metrics exclude synthetic test identities')
await player(superUser);check((await scalar('SELECT public.admin_list_member_directory_filtered()')).items.some(i=>accounts.some(a=>a.id===i.member_id)),false,'formal filtered directory excludes test identities')
check((await scalar('SELECT public.admin_list_member_directory()')).items.some(i=>accounts.some(a=>a.id===i.member_id)),false,'legacy directory also excludes test identities')
await server();const preview=await scalar('SELECT matching_import.preview_state($1,$2)',[round,superAdmin]);check(Object.keys(preview.member_tokens).sort(),ids.slice().sort(),'test import preview permits only exact33 IDs');check(preview.legacy_tokens,{},'test import preview has no legacy identity candidates');check(preview.temporary_members,[],'test import preview cannot propose an offline temp')
const formalPreview=await scalar('SELECT matching_import.preview_state($1,$2)',[formal,superAdmin]);check(Object.keys(formalPreview.member_tokens).some(id=>accounts.some(a=>a.id===id)),false,'formal import preview excludes registered test accounts')
await role()
const createResult=async(target,a,b)=>{
 const session=await scalar("INSERT INTO public.match_sessions(round_id,algorithm,total_candidates,total_matched,audit_reason) VALUES($1,'manual',2,2,'测试域隔离方案') RETURNING id",[target])
 const result=await scalar("INSERT INTO public.match_results(session_id,member_a_id,member_b_id,audit_reason) VALUES($1,$2,$3,'测试域隔离结果') RETURNING id",[session,a,b])
 return {session,result}
}
const formalPair=await createResult(formal,real[0].id,real[1].id),testPair=await createResult(round,real[0].id,real[1].id)
await rejects(()=>createResult(formal,accounts[0].id,real[0].id),/MEMBER_NOT_ALLOWED/,'test member cannot be saved in formal result')
await rejects(()=>createResult(round,outsider,real[0].id),/MEMBER_NOT_ALLOWED/,'foreign real member cannot be saved in test result')
const confirmFixture=async pair=>{
 await db.query("INSERT INTO matching_publication.write_context VALUES(txid_current(),pg_backend_pid(),$1,'fixture')",[pair.session])
 await db.query("UPDATE public.match_results SET status='confirmed' WHERE id=$1",[pair.result]);await db.query("UPDATE public.match_sessions SET status='confirmed' WHERE id=$1",[pair.session]);await db.query('DELETE FROM matching_publication.write_context WHERE session_id=$1',[pair.session])
}
// Parent suite uses real publication write guards. Fixture-only context here
// marks historical sources so same-domain filtering can be tested independently.
await db.exec('BEGIN');await confirmFixture(formalPair);await confirmFixture(testPair);await db.exec('COMMIT')
check((await scalar('SELECT matching_run.source($1)',[formal])).history_results.map(r=>r.id),[formalPair.result],'formal history excludes test publication for same real pair')
check((await scalar('SELECT matching_run.source($1)',[round])).history_results.map(r=>r.id),[testPair.result],'test history excludes formal publication for same real pair')
// Disable only the parent publication review validation fixture trigger while
// installing old review-source rows; no tested production migration disables it.
await db.exec('ALTER TABLE public.mutual_reviews DISABLE TRIGGER matching_publication_guard_review')
await db.query('INSERT INTO public.mutual_reviews(match_result_id,reviewer_id,reviewee_id,overall_score,would_play_again) VALUES($1,$2,$3,1,false)',[testPair.result,real[0].id,real[1].id])
check(await scalar('SELECT count(*)::integer FROM public.member_dynamic_stats WHERE member_id=$1',[real[1].id]),0,'test legacy review never writes real member growth statistics')
await db.query('INSERT INTO public.mutual_reviews(match_result_id,reviewer_id,reviewee_id,overall_score,would_play_again) VALUES($1,$2,$3,5,true)',[formalPair.result,real[0].id,real[1].id])
check(await scalar('SELECT jsonb_build_array(review_count,avg_review_score,recent5_avg_score,replay_willing_rate) FROM public.member_dynamic_stats WHERE member_id=$1',[real[1].id]),[1,5,5,1],'formal legacy review aggregates exclude the earlier test review')
await db.exec('ALTER TABLE public.mutual_reviews ENABLE TRIGGER matching_publication_guard_review')
check((await scalar('SELECT matching_run.source($1)',[formal])).feedbacks.map(r=>r.overall_score),[5],'formal scoring feedback ignores test review')
check((await scalar('SELECT matching_run.source($1)',[round])).feedbacks.map(r=>r.overall_score),[1],'test scoring feedback stays in test domain')
check(await scalar('SELECT private.peer_member_eligible($1,$2)',[formal,accounts[0].id]),false,'test account cannot join a formal activity peer-review roster')
check(await scalar('SELECT private.peer_member_eligible($1,$2)',[round,outsider]),false,'non-allowlisted real account cannot join test activity peer-review roster')
await role()
check(await scalar(communityGateMetadataSql),communityGateMetadata,'community guard preserves original function OID, owner, ACL, definer and search_path')
for(const item of [real[0],real[1],accounts[0]]){
 const profile=randomUUID();await db.query('INSERT INTO public.community_profiles(id) VALUES($1)',[profile]);await db.query('INSERT INTO private.community_profile_members(member_id,profile_id) VALUES($1,$2)',[item.id,profile])
}
await player(real[1].user);const visiblePost=await scalar("SELECT public.community_create_treehole('正式成员原有写入','合成公开帖子')")
await player(real[0].user);check(await scalar('SELECT private.community_can_interact()'),true,'ordinary approved real member still may interact')
check((await scalar('SELECT to_jsonb(p) FROM public.community_toggle_post_like($1) p',[visiblePost])).liked,true,'real member can still like public post normally')
const visibleComment=await scalar("SELECT public.community_add_comment($1,'普通成员原有评论')",[visiblePost]);check(typeof visibleComment,'string','ordinary member can still comment normally')
await role();check(await scalar("SELECT count(*)::int FROM public.community_notifications WHERE recipient_member_id=$1 AND notification_type IN('like','comment')",[real[1].id]),2,'ordinary community like/comment notifications continue unchanged')
const communitySideEffectsSql="SELECT jsonb_build_array((SELECT count(*) FROM public.community_posts),(SELECT count(*) FROM public.community_comments),(SELECT count(*) FROM public.community_likes),(SELECT count(*) FROM public.community_comment_likes),(SELECT count(*) FROM public.community_notifications))"
const communityBefore=await scalar(communitySideEffectsSql)
await player(accounts[0].user);check(await scalar('SELECT private.community_can_interact()'),false,'registered TST remains unable to interact even with a community profile')
await rejects(()=>scalar("SELECT public.community_create_treehole('不应发布','测试隔离')"),/posting is currently unavailable/,'TST cannot create public post')
await rejects(()=>scalar("SELECT public.community_add_comment($1,'不应发送真实通知')",[visiblePost]),/Not allowed to comment/,'TST cannot comment on a real member post')
await rejects(()=>scalar('SELECT * FROM public.community_toggle_post_like($1)',[visiblePost]),/Not allowed to like/,'TST cannot like a real member post')
await rejects(()=>scalar('SELECT * FROM public.community_set_comment_like($1,true)',[visibleComment]),/COMMENT_LIKE_NOT_ALLOWED/,'TST cannot like a real member comment')
await role();check(await scalar(communitySideEffectsSql),communityBefore,'all four denied TST writes leave posts/comments/reactions and real-recipient notifications unchanged')

const quiz=randomUUID();await db.query("INSERT INTO public.questionnaire_versions(id,kind,version,template) VALUES($1,'quiz',1,$2)",[quiz,{quizConfig:{dimensions:Object.fromEntries(Object.entries({E:.3,A:.3,O:.15,C:.1,N:.15}).map(([k,matchWeight])=>[k,{matchWeight}]))}}]);await db.query("INSERT INTO public.questionnaire_templates VALUES('quiz',$1)",[quiz])
for(const target of [formal,round]){
 await db.query("INSERT INTO private.round_peer_review_settings(round_id,enabled,roster_confirmed,opens_at,closes_at) VALUES($1,false,true,now()-interval '1 day',now()+interval '1 day')",[target]);for(const id of real.map(a=>a.id))await db.query("INSERT INTO private.round_peer_review_participants(round_id,member_id,source) VALUES($1,$2,'manual')",[target,id])
 await db.query('INSERT INTO private.round_peer_reviews(round_id,reviewer_id,reviewee_id,score) VALUES($1,$2,$3,$4)',[target,real[0].id,real[1].id,target===formal?5:1])
}
check((await scalar('SELECT matching_run.source_v3($1)',[formal])).scoring_policy.activityFeedback.map(r=>Number(r.score)),[5],'new activity feedback uses formal domain only')
check((await scalar('SELECT matching_run.source_v3($1)',[round])).scoring_policy.activityFeedback.map(r=>Number(r.score)),[1],'test activity feedback uses test domain only')
// A real checked publication traverses the unchanged SQL publication transaction.
await db.query("INSERT INTO private.round_peer_review_participants(round_id,member_id,source) VALUES($1,$2,'manual')",[round,outsider])
await player(outsiderUser);check((await scalar('SELECT public.player_list_round_peer_review_events()')).events.some(e=>e.round_id===round),false,'old foreign activity roster cannot bypass test round discovery guard')
await rejects(()=>scalar('SELECT public.player_get_round_peer_reviews($1)',[round]),/NOT_ELIGIBLE/,'direct player activity detail cannot bypass allowlist')
await role()
const plan=await scalar("INSERT INTO public.match_sessions(round_id,created_by,algorithm,total_candidates,total_matched,total_unmatched,audit_reason) VALUES($1,$2,'manual',33,31,2,'33人测试发布验收') RETURNING id",[round,superAdmin])
for(let i=0;i<18;i+=2)await db.query("INSERT INTO public.match_results(session_id,member_a_id,member_b_id,total_score,best_slot,audit_reason) VALUES($1,$2,$3,71,'2026-10-27 下午','测试双人结果')",[plan,ids[i],ids[i+1]])
await db.query("INSERT INTO public.match_results(session_id,member_a_id,member_b_id,group_members,total_score,best_slot,audit_reason) VALUES($1,$2,$3,$4,62,'2026-10-27 下午','测试十三人单池')",[plan,ids[18],ids[19],ids.slice(18,31)])
for(const id of ids.slice(31))await db.query("INSERT INTO public.unmatched_diagnostics(session_id,member_id,reason) VALUES($1,$2,'constraint_conflict')",[plan,id])
await player(superUser);const window=await scalar('SELECT jsonb_build_array(survey_start::text,survey_end::text) FROM public.match_rounds WHERE id=$1',[round])
check((await scalar("SELECT public.admin_finalize_matching_session($1,$2,'open',$3,$4,'隔离验证33人方案就绪')",[plan,round,...window])).results_ready,true,'33-person scheme finalizes while collection remains open')
await server();const prepared=await scalar('SELECT public.admin_prepare_match_publication($1,$2,0)',[plan,superAdmin]);const proof=await scalar('SELECT public.admin_authorize_match_publication($1,$2,0,$3)',[plan,superAdmin,prepared.revision_token])
await player(superUser);const publication=await scalar("SELECT public.admin_publish_checked_match_session($1,0,'隔离发布33受控账号',$2)",[plan,proof.preflight_id])
check(publication.published,true,'real checked publication succeeds for all33 bound accounts')
await role();check(await scalar('SELECT count(*)::integer FROM public.community_notifications WHERE match_session_id=$1',[plan]),33,'33 recipients get exactly33 notifications')
check(await scalar("SELECT jsonb_build_array(count(*) FILTER(WHERE notification_type='matching_published'),count(*) FILTER(WHERE notification_type='matching_unmatched')) FROM public.community_notifications WHERE match_session_id=$1",[plan]),[31,2],'31 matched and2 unmatched notices preserve standard flow')
check(await scalar('SELECT count(*)::integer FROM public.community_notifications WHERE match_session_id=$1 AND NOT(recipient_member_id=ANY($2))',[plan,ids]),0,'no unrelated real user receives a test notice')
const noticeSql="INSERT INTO public.community_notifications(recipient_member_id,notification_type,round_id,match_publication_id,match_session_id,publication_version,title_zh,title_ja,body_zh,body_ja) VALUES($1,'matching_unmatched',$2,$3,$4,1,'测试','テスト','测试','テスト')"
await rejects(()=>db.query(noticeSql,[outsider,round,publication.publication_id,plan]),/NOTIFICATION_NOT_ALLOWED/,'notification guard denies a non-allowlisted real recipient')
await rejects(()=>db.query(noticeSql,[accounts[0].id,formal,publication.publication_id,plan]),/NOTIFICATION_NOT_ALLOWED/,'formal notification guard denies a test recipient')
await player(outsiderUser);check(await scalar('SELECT count(*)::integer FROM public.match_sessions WHERE id=$1',[plan]),0,'ordinary real player cannot discover published test session metadata')
await player(accounts[0].user);check((await scalar('SELECT public.get_my_matching_publications()')).some(o=>o.round_id===round),true,'bound test account receives its normal player outcome')
await player(superUser);check((await scalar("SELECT public.admin_unpublish_match_session($1,1,'测试验收结束撤回发布')",[plan])).published,false,'normal withdrawal remains available')
await role();check(await scalar('SELECT count(*)::integer FROM matching_publication.active_assignments WHERE round_id=$1',[round]),0,'withdrawal clears effective assignments normally')
// The protected identity remains a tombstone when the existing lifecycle clears
// its number/Auth binding. Auth deletion can then set the private registry FK NULL.
const retiring=accounts[26]
await db.query("UPDATE public.members SET account_status='closed',anonymized_at=now(),user_id=NULL,member_number=NULL WHERE id=$1",[retiring.id])
await db.query('DELETE FROM auth.users WHERE id=$1',[retiring.user])
check(await scalar('SELECT jsonb_build_array(is_test,member_number,user_id,account_status) FROM public.members WHERE id=$1',[retiring.id]),[true,null,null,'closed'],'anonymous test identity preserves is_test while permitting existing lifecycle erasure')
check(await scalar('SELECT user_id IS NULL FROM private.test_accounts WHERE member_id=$1',[retiring.id]),true,'deleted Auth account does not strand the private registry FK')
await server();await rejects(()=>provision({...retiring,id:randomUUID(),user:randomUUID()}),/AUTH_INVALID|IDENTITY_CONFLICT/,'retired code cannot silently rebind to a different identity')
await role()
for(const roleName of ['anon','authenticated'])for(const sig of ['admin_provision_test_account(uuid,uuid,uuid,text,text,text,text)','admin_activate_test_account(uuid,uuid,text)','admin_configure_test_round(uuid,uuid,uuid[],text)'])check(await scalar('SELECT has_function_privilege($1,$2,\'EXECUTE\')',[roleName,'public.'+sig]),false,`${roleName} cannot call controlled ${sig}`)
for(const name of ['test_accounts','test_round_members','test_pool_write_context'])check(await scalar('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass',['private.'+name]),true,`${name} defense-in-depth RLS enabled`)
check(await scalar('SELECT count(*)::integer FROM private.test_pool_write_context'),0,'controlled context always cleared')
const postflight=(await db.exec(read('supabase/audits/test-account-pool-postflight.sql'))).flatMap(r=>r.rows??[]).find(r=>r.verification)?.verification;check(postflight.status,'PASS','read-only postflight validates live schema and retained retired identity');
console.log(`Test account pool audit: ${checks} checks passed; isolated PGlite only. Real member questionnaire contents and matching scoring rules unchanged.`)
export const testPoolAuditContext={...ctx,accounts,real,formal,round,ids,outsider,outsiderUser,server,player};
if(!process.env.TEST_ROUND_FORMAL_ACCESS_SUITE)await db.close()
