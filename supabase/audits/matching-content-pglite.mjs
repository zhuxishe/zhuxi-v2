// Isolated in-memory PostgreSQL checks. See docs/engineering/matching-content-release.md.
process.on('uncaughtException',e=>{console.error(e.message,e.where||'',e.internalQuery||'');process.exit(1)})
import { fileURLToPath } from 'node:url'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
import fs from 'node:fs'
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
console.log('Migration applied to PostgreSQL successfully')
await db.exec(`INSERT INTO public.members VALUES
('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','approved','active',NULL),
('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','approved','active',NULL),
('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003','pending','active',NULL),
('10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000004','approved','suspended',NULL),
('10000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000005','approved','active',NULL);
INSERT INTO public.admin_users(user_id,role) VALUES ('20000000-0000-0000-0000-000000000005','super_admin'),('20000000-0000-0000-0000-000000000006','admin');`)
const roundId=(n)=>`30000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const memberId=(n)=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const userId=(n)=>`20000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const day=(await db.query("select (current_date+1)::text as day")).rows[0].day
const config={version:1,questions:[{id:'diet',type:'single',required:true,label:{zh:'餐食',ja:''},options:[{id:'normal',label:{zh:'普通',ja:''}},{id:'veg',label:{zh:'素食',ja:''}}]}]}
async function newRound(n,purpose='matching',cfg={},status='open') {await db.query(`INSERT INTO public.match_rounds(id,round_name,survey_start,survey_end,activity_start,activity_end,status,purpose,content_config) VALUES($1,'test',now()-interval '1 day',now()+interval '1 day',current_date+1,current_date+2,$2,$3,$4)`,[roundId(n),status,purpose,JSON.stringify(cfg)])}
async function asRole(n,operation,role='authenticated') {await db.exec('BEGIN');try{await db.exec('SET LOCAL ROLE '+role);await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)",[n?userId(n):'',role]);const value=await operation();await db.exec('COMMIT');return value}catch(e){await db.exec('ROLLBACK');throw e}}
async function submit(n,member=1,answers={},revision=0,availability={[day]:['上午']},audit=null){return db.query(`INSERT INTO public.match_round_submissions(round_id,member_id,game_type_pref,gender_pref,availability,custom_answers,config_revision,audit_reason) VALUES($1,$2,'都可以','都可以',$3,$4,$5,$6) RETURNING id`,[roundId(n),memberId(member),JSON.stringify(availability),JSON.stringify(answers),revision,audit])}
let passed=0
async function ok(name,fn){await fn();passed++;console.log('PASS '+name)}
async function no(name,fn,match){try{await fn()}catch(e){if(match&&!e.message.includes(match))throw Error(name+': unexpected '+e.message);passed++;console.log('PASS '+name+' ('+e.message+')');return}throw Error('Expected rejection: '+name)}
await newRound(1)
await ok('legacy matching self submission rev0',()=>asRole(1,()=>submit(1)))
await no('wrong member id',()=>asRole(1,()=>submit(1,2)),'SUBMISSION_MEMBER_INVALID')
await no('unapproved member',()=>asRole(3,()=>submit(1,3)),'SUBMISSION_MEMBER_INVALID')
await no('suspended member',()=>asRole(4,()=>submit(1,4)),'SUBMISSION_MEMBER_INVALID')
await no('matching requires time',()=>asRole(2,()=>submit(1,2,{},0,{})),'TIME_REQUIRED')
await no('out of range date',()=>asRole(2,()=>submit(1,2,{},0,{'2020-01-01':['上午']})),'DATE_OUT_OF_RANGE')
await no('invalid slot',()=>asRole(2,()=>submit(1,2,{},0,{[day]:['午夜']})),'PAYLOAD_INVALID')
await no('answered round purpose locked',()=>db.query("update public.match_rounds set purpose='announcement' where id=$1",[roundId(1)]),'ROUND_STRUCTURE_LOCKED')
await no('answered round dates locked',()=>db.query('update public.match_rounds set activity_end=activity_end+1 where id=$1',[roundId(1)]),'ROUND_STRUCTURE_LOCKED')
await ok('copy text allowed after answers',()=>db.query(`update public.match_rounds set content_config='{"cardTitle":{"zh":"新标题","ja":""}}'::jsonb where id=$1`,[roundId(1)]))
await no('stale revision rejected',()=>asRole(2,()=>submit(1,2)),'ROUND_CONFIG_CHANGED')
await ok('fresh revision accepted',()=>asRole(2,()=>submit(1,2,{},1)))
await newRound(2,'matching',{},'closed')
await no('closed round denied',()=>asRole(1,()=>submit(2)),'ROUND_CLOSED')
await ok('service import closed round retains bypass',()=>asRole(null,()=>submit(2,1,{},0,{}),'service_role'))
await newRound(3,'matching',{},'closed')
await ok('super admin manual import closed',()=>asRole(5,()=>submit(3,1,{},0,{},'后台导入测试')))
await newRound(4,'matching',{},'closed')
await no('admin own self-service still denied closed',()=>asRole(5,()=>submit(4,5)),'ROUND_CLOSED')
await newRound(5,'matching',{},'closed')
await no('ordinary admin cannot import',()=>asRole(6,()=>submit(5,1,{},0,{},'后台导入测试')),'SUBMISSION_MEMBER_INVALID')
await newRound(6,'announcement')
await no('announcement cannot submit',()=>asRole(1,()=>submit(6)),'ROUND_SUBMISSION_NOT_ALLOWED')
const event= (await db.query("select (now()+interval '2 days')::text as start,(now()+interval '2 days 3 hours')::text as end")).rows[0]
const reg={...config,eventStart:new Date(event.start).toISOString(),eventEnd:new Date(event.end).toISOString(),location:{zh:'东京',ja:''}}
await newRound(7,'registration',reg)
await no('registration missing required answer',()=>asRole(1,()=>submit(7,1,{},0,{})),'ROUND_ANSWER_REQUIRED')
await no('registration invalid option',()=>asRole(1,()=>submit(7,1,{diet:'other'},0,{})),'ROUND_ANSWER_INVALID')
await no('registration unknown question',()=>asRole(1,()=>submit(7,1,{diet:'veg',extra:'test'},0,{})),'ROUND_ANSWER_UNKNOWN')
await ok('registration accepts no availability',()=>asRole(1,()=>submit(7,1,{diet:'veg'},0,{})))
await no('registration rejects hidden availability',()=>asRole(2,()=>submit(7,2,{diet:'veg'},0)),'ROUND_REGISTRATION_PAYLOAD_INVALID')
await no('required cannot change after answer',()=>db.query(`update public.match_rounds set content_config=jsonb_set(content_config,'{questions,0,required}','false'::jsonb) where id=$1`,[roundId(7)]),'ROUND_STRUCTURE_LOCKED')
await ok('question wording may change after answer',()=>db.query(`update public.match_rounds set content_config=jsonb_set(content_config,'{questions,0,label,zh}','"用餐选择"'::jsonb) where id=$1`,[roundId(7)]))
await no('option id cannot change',()=>db.query(`update public.match_rounds set content_config=jsonb_set(content_config,'{questions,0,options,0,id}','"new_id"'::jsonb) where id=$1`,[roundId(7)]),'ROUND_STRUCTURE_LOCKED')
await no('event time cannot change',()=>db.query(`update public.match_rounds set content_config=jsonb_set(content_config,'{eventEnd}',to_jsonb((now()+interval '4 days')::text)) where id=$1`,[roundId(7)]),'ROUND_STRUCTURE_LOCKED')
await no('registration cannot be matched',()=>db.query("update public.match_rounds set status='matched' where id=$1",[roundId(7)]),'ROUND_CONFIG_INVALID')
await newRound(8)
await db.query("update public.match_rounds set survey_start=now()-interval '2 days',survey_end=now()-interval '1 day' where id=$1",[roundId(8)])
await no('expired denied at DB',()=>asRole(1,()=>submit(8,1,{},1)),'ROUND_CLOSED')
await newRound(9)
await db.query("update public.match_rounds set survey_start=now()+interval '1 hour' where id=$1",[roundId(9)])
await no('not started denied at DB',()=>asRole(1,()=>submit(9,1,{},1)),'ROUND_CLOSED')
await no('anonymous cannot read new answers',()=>asRole(null,()=>db.exec('select * from public.match_round_submissions'),'anon'),'permission denied')
await ok('player sees own answers only',async()=>{const result=await asRole(1,()=>db.query('select distinct member_id from public.match_round_submissions'));if(result.rows.some(r=>r.member_id!==memberId(1)))throw Error('Privacy leak')})
await ok('guard functions have no API execute permissions',async()=>{const result=await db.query("select has_function_privilege('authenticated','private.guard_round_content_write()','EXECUTE') as allowed");if(result.rows[0].allowed)throw Error('Function exposed')})

await no('registration cannot generate match session',()=>db.query('insert into public.match_sessions(round_id) values($1)',[roundId(7)]),'ROUND_MATCHING_ONLY')
await ok('matching still generates session',()=>db.query('insert into public.match_sessions(round_id) values($1)',[roundId(2)]))
await ok('legacy standalone matching session accepted',()=>db.exec('insert into public.match_sessions default values'))
await newRound(10)
await db.query('insert into public.match_sessions(round_id) values($1)',[roundId(10)])
await no('in-flight matching session locks purpose',()=>db.query("update public.match_rounds set purpose='announcement' where id=$1",[roundId(10)]),'ROUND_STRUCTURE_LOCKED')
await no('submission identity cannot change',()=>asRole(1,()=>db.query('update public.match_round_submissions set member_id=$1,config_revision=1 where round_id=$2',[memberId(2),roundId(7)])),'SUBMISSION_MEMBER_INVALID')
await no('submission cannot move rounds',()=>asRole(1,()=>db.query('update public.match_round_submissions set round_id=$1,config_revision=0,availability=$2,custom_answers=$3 where round_id=$4',[roundId(10),JSON.stringify({[day]:['上午']}),'{}',roundId(7)])),'SYSTEM_FIELD_IMMUTABLE')
const multi={...reg,questions:[{id:'choice',type:'multi',required:true,label:{zh:'请选择',ja:''},options:[{id:'one',label:{zh:'一',ja:''}},{id:'two',label:{zh:'二',ja:''}}]}]}
await newRound(11,'registration',multi)
await no('multi cannot contain duplicate options',()=>asRole(1,()=>submit(11,1,{choice:['one','one']},0,{})),'ROUND_ANSWER_INVALID')
await no('multi empty rejected when required',()=>asRole(1,()=>submit(11,1,{choice:[]},0,{})),'ROUND_ANSWER_REQUIRED')
await ok('multi valid selection accepted',()=>asRole(1,()=>submit(11,1,{choice:['one','two']},0,{})))
const text={...reg,questions:[{id:'note',type:'text',required:true,label:{zh:'留言',ja:''},options:[]}]}
await newRound(12,'registration',text)
await no('required text whitespace rejected',()=>asRole(1,()=>submit(12,1,{note:'   '},0,{})),'ROUND_ANSWER_INVALID')
await no('oversized text rejected',()=>asRole(1,()=>submit(12,1,{note:'x'.repeat(2001)},0,{})),'ROUND_ANSWER_INVALID')
await ok('text valid accepted',()=>asRole(1,()=>submit(12,1,{note:'可参加'},0,{})))
await no('malformed fixed event interval rejected',()=>newRound(13,'registration',{...reg,eventEnd:reg.eventStart}),'ROUND_EVENT_TIME_INVALID')
await no('missing fixed event details rejected',()=>newRound(14,'registration',{}),'ROUND_EVENT_DETAILS_REQUIRED')
await no('deadline after event rejected',()=>newRound(15,'registration',{...reg,eventStart:new Date(Date.now()+3600000).toISOString(),eventEnd:new Date(Date.now()+7200000).toISOString()}),'ROUND_REGISTRATION_DEADLINE_INVALID')
await newRound(16)
await no('exact deadline is exclusive within transaction',()=>asRole(5,async()=>{await db.query('update public.match_rounds set survey_end=now() where id=$1',[roundId(16)]);await submit(16,5,{},1)}),'ROUND_CLOSED')

await ok('anonymization RPC patch keeps privileged gate and adds custom answer scrub',async()=>{const {rows}=await db.query("select pg_get_functiondef('public.admin_anonymize_member(uuid,text)'::regprocedure) as definition");if(!rows[0].definition.includes("custom_answers = '{}'::jsonb")||!rows[0].definition.includes('MEMBER_MASTER_SUPER_ADMIN_REQUIRED'))throw Error('privacy patch incomplete')})
await no('player cannot bypass required answers with privacy flag',()=>asRole(2,async()=>{await db.query("select set_config('app.round_anonymize_member',$1,true)",[memberId(2)]);await submit(12,2,{},0,{})}),'ROUND_ANSWER_REQUIRED')
await ok('privacy scrub clears answers without required-question failures',()=>asRole(5,async()=>{await db.query("select set_config('app.round_anonymize_member',$1,true),set_config('app.member_master_explicit_audit','on',true)",[memberId(1)]);await db.query("update public.match_round_submissions set game_type_pref='都可以',gender_pref='都可以',availability='{}',interest_tags='{}',social_style=NULL,message=NULL,import_metadata=NULL where member_id=$1",[memberId(1)]);const result=await db.query('select custom_answers from public.match_round_submissions where member_id=$1',[memberId(1)]);if(result.rows.some(row=>Object.keys(row.custom_answers).length))throw Error('answers retained')}))
console.log(`All ${passed} database checks passed`)


await db.close()
