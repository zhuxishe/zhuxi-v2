// Isolated matching compare-and-save PostgreSQL checks; never contacts a live database.
// Loads real answer validation/RLS/audit/readiness triggers and RPC migrations.
// Profile-completion outcomes are fixtures; their full implementation is separately
// covered by matching-profile-readiness-pglite.mjs.
process.on('uncaughtException',e=>{console.error(e.message,e.where||'',e.internalQuery||'');process.exit(1)})
import { fileURLToPath } from 'node:url'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
import fs from 'node:fs'
import assert from 'node:assert/strict'
const root=fileURLToPath(new URL('../../', import.meta.url))
const read=(file)=>fs.readFileSync(root+file,'utf8')
const master=read('supabase/migrations/20260829175645_user_member_master_v1.sql')
const extract=(source,name)=>{const start=source.indexOf('CREATE OR REPLACE FUNCTION '+name);const end=source.indexOf('$function$;',start);if(start<0||end<0)throw Error(name);return source.slice(start,end+12)}
const db= new PGlite()
await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('role',current_setting('request.jwt.claim.role',true))$$;
CREATE TABLE public.admin_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,role text);
CREATE TABLE public.members(id uuid PRIMARY KEY, user_id uuid,status text,account_status text,anonymized_at timestamptz);
CREATE TABLE public.match_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE FUNCTION public.update_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at=now(); RETURN NEW; END$$;`)
await db.exec(read('supabase/migrations/026_security_hardening.sql'))
await db.exec(read('supabase/migrations/018_matching_rounds.sql'))
await db.exec(read('supabase/migrations/035_match_round_import_metadata.sql'))
await db.exec(`ALTER TABLE public.match_round_submissions ADD COLUMN audit_reason text;`)
for(const name of ['private.member_master_is_admin()','private.member_master_is_super_admin()','private.member_master_current_admin_id()','private.member_master_lock_non_anonymized_subjects(']) await db.exec(extract(master,name))
await db.exec(extract(read('supabase/migrations/20260831234821_fix_member_readonly_authorization_lock.sql'),'private.profile_current_approved_member_id()'))
await db.exec(extract(read('supabase/migrations/20260830174115_fix_operational_audit_trigger_record_scope.sql'),'private.member_master_capture_operational_audit_reason()'))
await db.exec(extract(master,'private.member_master_guard_round_submission_write()'))
await db.exec(extract(master,'private.member_master_guard_anonymized_dependent_write()'))
await db.exec(master.slice(master.indexOf('DROP POLICY IF EXISTS player_read_open_rounds ON public.match_rounds;'),master.indexOf('CREATE OR REPLACE FUNCTION private.member_master_guard_round_submission_write()')))
await db.exec(`DROP POLICY admin_all_submissions ON public.match_round_submissions;
CREATE POLICY member_master_round_submissions_admin_audited_write ON public.match_round_submissions FOR ALL TO authenticated USING (private.member_master_is_super_admin()) WITH CHECK (private.member_master_is_super_admin());
CREATE TRIGGER member_master_capture_audit_reason BEFORE INSERT OR UPDATE OR DELETE ON public.match_round_submissions FOR EACH ROW EXECUTE FUNCTION private.member_master_capture_operational_audit_reason();
CREATE TRIGGER member_master_guard_anonymized_write BEFORE INSERT OR UPDATE ON public.match_round_submissions FOR EACH ROW EXECUTE FUNCTION private.member_master_guard_anonymized_dependent_write();
CREATE TRIGGER member_master_guard_round_submission_write BEFORE INSERT OR UPDATE ON public.match_round_submissions FOR EACH ROW EXECUTE FUNCTION private.member_master_guard_round_submission_write();
GRANT USAGE ON SCHEMA public,auth,private TO authenticated,service_role;
GRANT SELECT ON public.members,public.admin_users TO authenticated;
GRANT ALL ON public.match_rounds,public.match_round_submissions,public.match_sessions TO authenticated,service_role;
REVOKE DELETE ON public.match_round_submissions FROM authenticated;`)
await db.exec(extract(master,'public.admin_anonymize_member('))
await db.exec(read('supabase/migrations/20260929120921_matching_content_editor.sql'))

await db.exec(`ALTER TABLE public.match_rounds ADD COLUMN deleted_at timestamptz;
ALTER TABLE public.match_round_submissions ADD COLUMN cancelled_at timestamptz;
CREATE TABLE private.cas_readiness(member_id uuid PRIMARY KEY,missing jsonb NOT NULL DEFAULT '[]');
CREATE FUNCTION private.member_matching_readiness(p_member_id uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('missing',COALESCE((SELECT missing FROM private.cas_readiness WHERE member_id=p_member_id),'["supplementary"]'::jsonb))$$;
CREATE TABLE public.community_profiles(id uuid PRIMARY KEY);
CREATE TABLE public.community_posts(id uuid PRIMARY KEY);
CREATE TABLE public.community_comments(id uuid PRIMARY KEY);
CREATE TABLE public.community_reports(id uuid PRIMARY KEY);
CREATE TABLE public.community_announcements(id uuid PRIMARY KEY);`)
// Apply the deployed soft-deletion fragment of the real write guard. Other
// functions in that migration concern peer-review tables, absent in this fixture.
const deletion = read('supabase/migrations/20261010101614_matching_round_soft_delete.sql')
const guardPatch = deletion.slice(deletion.indexOf("  definition := pg_get_functiondef('private.member_master_guard_round_submission_write()"), deletion.indexOf("  definition := pg_get_functiondef('private.guard_match_session_round_purpose()"))
await db.exec('DO $migration$ DECLARE definition text; original text; replacement text; BEGIN '+guardPatch+' END $migration$;')
const readiness = read('supabase/migrations/20261022162627_matching_profile_readiness.sql')
const readinessStart = readiness.indexOf('CREATE FUNCTION private.guard_matching_profile_readiness()')
await db.exec(readiness.slice(readinessStart,readiness.indexOf('REVOKE ALL ON FUNCTION',readinessStart)))
const cancellation = read('supabase/migrations/20260929153531_registration_cancellation.sql')
await db.exec(cancellation.slice(cancellation.indexOf('CREATE OR REPLACE FUNCTION private.guard_registration_cancellation()'),cancellation.indexOf('-- Ordinary administrators')))
await db.exec(read('supabase/migrations/20260929153645_registration_operation.sql'))
const community = read('supabase/migrations/20260716165130_community_v1_schema.sql')
const notificationStart = community.indexOf('CREATE TABLE public.community_notifications (')
await db.exec(community.slice(notificationStart,community.indexOf('CREATE INDEX community_notifications_recipient_created_idx',notificationStart)))
await db.exec(read('supabase/migrations/20260929142902_round_submission_notifications.sql'))
const migration=read('supabase/migrations/20261022175617_matching_survey_submission_concurrency.sql')
await db.exec(`INSERT INTO public.members VALUES('10000000-0000-0000-0000-000000000099',NULL,'approved','active',NULL);
INSERT INTO public.match_rounds(id,round_name,survey_start,survey_end,activity_start,activity_end,status,purpose,content_config)
VALUES('30000000-0000-0000-0000-000000000099','historical untouched',now()-interval '2 days',now()-interval '1 day',current_date+1,current_date+14,'closed','matching','{}');
BEGIN;SET LOCAL ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',true);
INSERT INTO public.match_round_submissions(round_id,member_id,game_type_pref,gender_pref,availability,message,custom_answers,updated_at)
VALUES('30000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000099','多人','都可以','{}','historical unchanged','{}',NULL);COMMIT;`)
const before = (await db.query("SELECT md5(COALESCE(jsonb_agg(to_jsonb(s))::text,'')) digest FROM public.match_round_submissions s")).rows[0].digest
await db.exec(migration)
assert.equal((await db.query("SELECT md5(COALESCE(jsonb_agg(to_jsonb(s))::text,'')) digest FROM public.match_round_submissions s")).rows[0].digest,before)
const roundId=n=>`30000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const memberId=n=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const userId=n=>`20000000-0000-0000-0000-${String(n).padStart(12,'0')}`
await db.exec(`INSERT INTO public.members VALUES
('${memberId(1)}','${userId(1)}','approved','active',NULL),
('${memberId(2)}','${userId(2)}','approved','active',NULL),
('${memberId(3)}','${userId(3)}','pending','active',NULL),
('${memberId(4)}','${userId(4)}','approved','suspended',NULL),
('${memberId(5)}','${userId(5)}','approved','active',NULL);
INSERT INTO public.admin_users(user_id,role) VALUES ('${userId(5)}','super_admin'),('${userId(6)}','admin');
INSERT INTO private.cas_readiness SELECT id,'[]'::jsonb FROM public.members;`)
const day=(await db.query("select (current_date+1)::text AS day")).rows[0].day
async function newRound(n,{status='open',purpose='matching',config={}}={}) {
 await db.query(`INSERT INTO public.match_rounds(id,round_name,survey_start,survey_end,activity_start,activity_end,status,purpose,content_config)
 VALUES($1,'isolated matching',now()-interval '1 day',now()+interval '1 day',current_date+1,current_date+14,$2,$3,$4)`,[roundId(n),status,purpose,JSON.stringify(config)])
}
async function asRole(n,fn,role='authenticated') {
 await db.exec('BEGIN')
 try { await db.exec('SET LOCAL ROLE '+role); await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)",[n?userId(n):'',role]);const result=await fn();await db.exec('COMMIT');return result }
 catch(error){await db.exec('ROLLBACK');throw error}
}
function answers(message='saved',extra={}) { return {game_type_pref:'都可以',gender_pref:'都可以',availability:{[day]:['下午']},interest_tags:['tag'],social_style:null,message,custom_answers:{},...extra} }
async function save(n,{id=null,stamp=null,revision=0,payload=answers()}={}) {
 return (await db.query(`select public.save_my_matching_submission($1,$2,$3,$4,$5) result`,[roundId(n),id,stamp,revision,JSON.stringify(payload)])).rows[0].result
}
async function updateAdmin(id,stamp,payload=answers('admin correction'),reason='根据成员要求更正报名') {
 return (await db.query('select public.admin_update_matching_submission($1,$2,$3,$4) result',[id,stamp,JSON.stringify(payload),reason])).rows[0].result
}
async function stored(id){return (await db.query('select id,updated_at::text stamp,message,custom_answers from public.match_round_submissions where id=$1',[id])).rows[0]}
let passed=1
console.log('PASS migration leaves existing historical answers and NULL timestamp untouched')
async function ok(name,fn){await fn();passed++;console.log('PASS '+name)}
async function no(name,fn,match){await assert.rejects(fn,error=>error.message.includes(match),name);passed++;console.log('PASS '+name)}
await newRound(1)
let saved=await asRole(1,()=>save(1))
await ok('first create is persisted with one receipt',async()=>{assert.equal((await stored(saved.id)).message,'saved');assert.equal((await db.query('select count(*)::int n from public.community_notifications where round_id=$1',[roundId(1)])).rows[0].n,1)})
await no('stale blank tab cannot upsert over an existing answer',()=>asRole(1,()=>save(1)),'MATCHING_SUBMISSION_CHANGED')
await ok('fresh player update succeeds',async()=>{saved=await asRole(1,()=>save(1,{id:saved.id,stamp:saved.updated_at,payload:answers('player edit')}));assert.equal((await stored(saved.id)).message,'player edit')})
const oldPlayer={...saved}
await ok('administrator atomic update preserves custom answers',async()=>{saved=await asRole(5,()=>updateAdmin(saved.id,saved.updated_at));assert.equal((await stored(saved.id)).message,'admin correction')})
await no('old player page cannot overwrite admin correction',()=>asRole(1,()=>save(1,{id:oldPlayer.id,stamp:oldPlayer.updated_at,payload:answers('stale player')})),'MATCHING_SUBMISSION_CHANGED')
const oldAdmin={...saved}
await ok('fresh player can update after refreshing admin correction',async()=>{saved=await asRole(1,()=>save(1,{id:saved.id,stamp:saved.updated_at,payload:answers('new player')}))})
await no('old admin dialog cannot overwrite a newer player answer',()=>asRole(5,()=>updateAdmin(oldAdmin.id,oldAdmin.updated_at)),'MATCHING_SUBMISSION_CHANGED')
await no('two admins cannot overwrite with the same old token',()=>asRole(5,()=>updateAdmin(oldPlayer.id,oldPlayer.updated_at)),'MATCHING_SUBMISSION_CHANGED')
await no('other member cannot target this answer',()=>asRole(2,()=>save(1,{id:saved.id,stamp:saved.updated_at})),'MATCHING_SUBMISSION_CHANGED')
await no('ordinary admin cannot call admin save',()=>asRole(6,()=>updateAdmin(saved.id,saved.updated_at)),'SUPER_ADMIN_REQUIRED')
await no('player cannot call admin save',()=>asRole(1,()=>updateAdmin(saved.id,saved.updated_at)),'SUPER_ADMIN_REQUIRED')
await no('admin reason still mandatory',()=>asRole(5,()=>updateAdmin(saved.id,saved.updated_at,answers(),'x')),'REASON_REQUIRED')
await ok('direct REST-style player update changes no matching row',async()=>{const result=await asRole(1,()=>db.query("update public.match_round_submissions set message='bypass' where id=$1 returning id",[saved.id]));assert.equal(result.rows.length,0);assert.equal((await stored(saved.id)).message,'new player')})
await ok('direct REST-style super-admin update also cannot skip compare',async()=>{const result=await asRole(5,()=>db.query("update public.match_round_submissions set message='admin bypass',audit_reason='测试绕过写入原因' where id=$1 returning id",[saved.id]));assert.equal(result.rows.length,0)})
await no('direct REST-style upsert cannot overwrite even with custom flags',()=>asRole(1,async()=>{
 await db.query("select set_config('app.member_master_explicit_audit','on',true),set_config('app.member_master_submission_self_service','on',true)")
 await db.query(`INSERT INTO public.match_round_submissions(round_id,member_id,game_type_pref,gender_pref,availability,custom_answers,config_revision)
 VALUES($1,$2,'都可以','都可以',$3,'{}',0) ON CONFLICT(round_id,member_id) DO UPDATE SET message='bypass'`,[roundId(1),memberId(1),JSON.stringify({[day]:['上午']})])
}),'row-level security')
await ok('success, conflict and answer updates never duplicate the receipt',async()=>{assert.equal((await db.query('select count(*)::int n from public.community_notifications where round_id=$1',[roundId(1)])).rows[0].n,1)})
await no('wrong config revision rejected by RPC',()=>asRole(1,()=>save(1,{id:saved.id,stamp:saved.updated_at,revision:1})),'ROUND_CONFIG_CHANGED')
await db.query("update private.cas_readiness set missing=$2 where member_id=$1",[memberId(1),JSON.stringify(['quiz'])])
await no('profile readiness still checked inside player RPC',()=>asRole(1,()=>save(1,{id:saved.id,stamp:saved.updated_at,payload:answers('invalid profile edit')})),'MATCHING_PROFILE_INCOMPLETE')
await no('profile readiness still checked inside admin RPC',()=>asRole(5,()=>updateAdmin(saved.id,saved.updated_at)),'MATCHING_PROFILE_INCOMPLETE')
await ok('readiness rejection rolls answer and version back',async()=>{const row=await stored(saved.id);assert.equal(row.message,'new player');assert.equal(Date.parse(row.stamp),Date.parse(saved.updated_at))})
await db.query("update private.cas_readiness set missing='[]' where member_id=$1",[memberId(1)])
await no('invalid optional payload rolls back',()=>asRole(1,()=>save(1,{id:saved.id,stamp:saved.updated_at,payload:answers('bad',{availability:{[day]:['午夜']}})})),'PAYLOAD_INVALID')
await newRound(2,{status:'closed'})
await no('closed matching round denied',()=>asRole(1,()=>save(2)),'ROUND_CLOSED')
await newRound(3)
await db.query("update public.match_rounds set survey_end=now()-interval '1 microsecond' where id=$1",[roundId(3)])
await no('deadline enforced by DB even while status stays open',()=>asRole(1,()=>save(3,{revision:1})),'ROUND_CLOSED')
await newRound(4)
await db.query("update public.match_rounds set survey_start=now()+interval '1 hour' where id=$1",[roundId(4)])
await no('not-started matching round denied',()=>asRole(1,()=>save(4,{revision:1})),'ROUND_CLOSED')
await newRound(5)
await no('suspended member cannot write through definer',()=>asRole(4,()=>save(5)),'SUBMISSION_MEMBER_INVALID')
await no('unapproved member cannot write through definer',()=>asRole(3,()=>save(5)),'SUBMISSION_MEMBER_INVALID')
await no('anon has no RPC execute grant',()=>asRole(null,()=>save(5),'anon'),'permission denied')
await no('service import role has no user RPC grant',()=>asRole(null,()=>save(5),'service_role'),'permission denied')
await no('authenticated role without user id fails authorization',()=>asRole(null,()=>save(5)),'SUBMISSION_MEMBER_INVALID')
await ok('service-role historical import remains allowed',()=>asRole(null,()=>db.query(`INSERT INTO public.match_round_submissions(round_id,member_id,game_type_pref,gender_pref,availability,custom_answers) VALUES($1,$2,'都可以','都可以','{}','{}')`,[roundId(2),memberId(1)]),'service_role'))
await ok('service-role historical update remains allowed without another receipt',()=>asRole(null,()=>db.query("update public.match_round_submissions set message='import correction' where round_id=$1",[roundId(2)]),'service_role'))
await ok('same-transaction matching updates get distinct strictly increasing tokens',()=>asRole(1,async()=>{const first=await save(1,{id:saved.id,stamp:saved.updated_at});const second=await save(1,{id:first.id,stamp:first.updated_at});assert.notEqual(first.updated_at,second.updated_at);await assert.rejects(()=>save(1,{id:first.id,stamp:first.updated_at}),e=>e.message.includes('MATCHING_SUBMISSION_CHANGED'))}).catch(async error=>{throw error}))
// Previous group deliberately catches the obsolete token in a savepoint-free
// transaction; inspect the transaction rollback: neither intermediate edit survived.
await ok('failed transaction rolls both answer writes back',async()=>{assert.equal((await stored(saved.id)).message,'new player')})
const event=(await db.query("select now()+interval '2 days' start,now()+interval '2 days 3 hours' finish")).rows[0]
const reg={eventStart:new Date(event.start).toISOString(),eventEnd:new Date(event.finish).toISOString(),location:{zh:'东京',ja:''},questions:[]}
await newRound(6,{purpose:'registration',config:reg})
let registration=await asRole(1,async()=>(await db.query("select public.manage_my_registration($1,'create',NULL,0,'{}') result",[roundId(6)])).rows[0].result)
await ok('registration create RPC remains unchanged',async()=>{assert.ok(registration.id)})
await ok('registration update RPC remains usable',async()=>{registration=await asRole(1,async()=>(await db.query("select public.manage_my_registration($1,'update',$2,0,'{}') result",[roundId(6),registration.updated_at])).rows[0].result)})
await ok('registration cancel and rejoin remain usable',async()=>{registration=await asRole(1,async()=>(await db.query("select public.manage_my_registration($1,'cancel',$2,0,'{}') result",[roundId(6),registration.updated_at])).rows[0].result);assert.ok(registration.cancelled_at);registration=await asRole(1,async()=>(await db.query("select public.manage_my_registration($1,'rejoin',$2,0,'{}') result",[roundId(6),registration.updated_at])).rows[0].result);assert.equal(registration.cancelled_at,null)})
await no('matching RPC cannot edit a fixed registration',()=>asRole(1,()=>save(6)),'SUBMISSION_NOT_ALLOWED')
await no('matching admin RPC cannot edit a fixed registration',()=>asRole(5,()=>updateAdmin(registration.id,registration.updated_at)),'SUBMISSION_NOT_ALLOWED')
await newRound(7)
let nullStamp
await asRole(null,async()=>{nullStamp=(await db.query(`INSERT INTO public.match_round_submissions(round_id,member_id,game_type_pref,gender_pref,availability,custom_answers,updated_at)
 VALUES($1,$2,'都可以','都可以',$3,'{}',NULL) RETURNING id`,[roundId(7),memberId(1),JSON.stringify({[day]:['下午']})])).rows[0]},'service_role')
await ok('historical NULL token can be updated only with its exact saved id',async()=>{const next=await asRole(1,()=>save(7,{id:nullStamp.id,stamp:null}));assert.ok(next.updated_at)})
await no('old NULL token cannot overwrite the new timestamp',()=>asRole(1,()=>save(7,{id:nullStamp.id,stamp:null})),'MATCHING_SUBMISSION_CHANGED')
await newRound(8)
let future
await asRole(null,async()=>{future=(await db.query(`INSERT INTO public.match_round_submissions(round_id,member_id,game_type_pref,gender_pref,availability,custom_answers,updated_at)
 VALUES($1,$2,'都可以','都可以',$3,'{}',now()+interval '2 days') RETURNING id,updated_at::text stamp`,[roundId(8),memberId(1),JSON.stringify({[day]:['下午']})])).rows[0]},'service_role')
await ok('future historical timestamp still advances by at least one microsecond',async()=>{const next=await asRole(1,()=>save(8,{id:future.id,stamp:future.stamp}));assert.equal((await db.query('select $1::timestamptz>$2::timestamptz advanced',[next.updated_at,future.stamp])).rows[0].advanced,true)})
await no('super-admin player UI still respects a closed collection window',()=>asRole(5,()=>save(2)),'ROUND_CLOSED')
await newRound(9,{config:{questions:[{id:'choice',type:'multi',required:true,label:{zh:'请选择',ja:''},options:[{id:'a',label:{zh:'甲',ja:''}},{id:'b',label:{zh:'乙',ja:''}}]}]}})
let custom=await asRole(1,()=>save(9,{payload:answers('custom',{custom_answers:{choice:['a','b']}})}))
await ok('admin CAS preserves required custom and multiple-choice answers',async()=>{custom=await asRole(5,()=>updateAdmin(custom.id,custom.updated_at));assert.deepEqual((await stored(custom.id)).custom_answers,{choice:['a','b']})})
await no('player CAS still enforces required custom answers',()=>asRole(1,()=>save(9,{id:custom.id,stamp:custom.updated_at})),'ROUND_ANSWER_REQUIRED')
await newRound(10)
const parallelBase=await asRole(1,()=>save(10))
await ok('two requests sharing one exact token yield one success and one conflict',async()=>{
 const quote=value=>"'"+String(value).replaceAll("'","''")+"'"
 const request=label=>`BEGIN;SET LOCAL ROLE authenticated;
 SELECT set_config('request.jwt.claim.sub',${quote(userId(1))},true),set_config('request.jwt.claim.role','authenticated',true);
 SELECT public.save_my_matching_submission(${quote(roundId(10))},${quote(parallelBase.id)},${quote(parallelBase.updated_at)},0,${quote(JSON.stringify(answers(label)))}::jsonb);COMMIT;`
 // PGlite serializes requests on one backend. Concurrent promises verify the
 // winner/stale-request contract, not lock scheduling across two server sessions.
 const result=await Promise.allSettled([db.exec(request('request A')),db.exec(request('request B'))])
 await db.exec('ROLLBACK')
 assert.equal(result.filter(item=>item.status==='fulfilled').length,1)
 const rejected=result.find(item=>item.status==='rejected')
 assert.ok(rejected.reason.message.includes('MATCHING_SUBMISSION_CHANGED'))
 assert.ok(['request A','request B'].includes((await stored(parallelBase.id)).message))
})
// Exercise the owner-definer write path used by the existing privacy RPC without
// replacing or pretending to run its full many-table anonymization workflow.
await db.exec(`CREATE FUNCTION private.cas_privacy_scrub(p_member uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF auth.uid() IS NULL OR NOT private.member_master_is_super_admin() THEN RAISE EXCEPTION 'MEMBER_MASTER_SUPER_ADMIN_REQUIRED';END IF;
 PERFORM set_config('app.round_anonymize_member',p_member::text,true);
 PERFORM set_config('app.member_master_explicit_audit','on',true);
 UPDATE public.match_round_submissions SET game_type_pref='都可以',gender_pref='都可以',availability='{}',interest_tags='{}',social_style=NULL,message=NULL,import_metadata=NULL,custom_answers='{}' WHERE member_id=p_member;
END$$;
REVOKE ALL ON FUNCTION private.cas_privacy_scrub(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION private.cas_privacy_scrub(uuid) TO authenticated;`)
await db.query("update public.members set account_status='closed' where id=$1",[memberId(1)])
await ok('owner-definer privacy scrub still passes real answer/audit/readiness guards and restrictive RLS',async()=>{
 await asRole(5,()=>db.query('select private.cas_privacy_scrub($1)',[memberId(1)]))
 const rows=(await db.query('select message,availability,custom_answers from public.match_round_submissions where member_id=$1',[memberId(1)])).rows
 assert.ok(rows.every(row=>row.message===null && Object.keys(row.availability).length===0 && Object.keys(row.custom_answers).length===0))
})
await ok('read-only postflight confirms function ACL/security, restrictive policy and timestamp trigger',async()=>{
 const checks=await db.exec(read('supabase/audits/matching-survey-concurrency-postflight.sql'))
 const functions=checks.find(result=>result.rows[0]?.signature)?.rows
 assert.equal(functions.length,4)
 assert.ok(functions.every(row=>row.exists&&row.expected_security&&row.empty_search_path&&row.authenticated_allowed&&row.anon_denied&&row.service_role_denied))
 assert.ok(checks.some(result=>result.rows[0]?.restrictive===true))
 assert.ok(checks.some(result=>result.rows[0]?.tgname==='z_matching_submission_updated_at'))
})
console.log(`All ${passed} matching concurrency database checks passed`)
await db.close()
