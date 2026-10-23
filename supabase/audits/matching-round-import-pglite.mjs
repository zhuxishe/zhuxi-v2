// Isolated append/update import regression audit. No network or live data.
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
process.env.MATCHING_RUN_LIFECYCLE_SUITE='1'
const {auditContext:ctx}=await import('./matching-run-input-pglite.mjs')
const {db,scalar,role,read,superAdmin,superUser,admin}=ctx
let checks=0
const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++}
const rejects=async(sql,pattern,args=[])=>{await assert.rejects(()=>db.query(sql,args),pattern);checks++}
const digest=value=>createHash('sha256').update(value).digest('hex')
const server=async()=>{
 await role('service_role')
 // createAdminClient sends a service JWT without forwarding the admin cookie.
 // The real initiating admin is validated independently by p_actor_admin_id.
 await db.query("SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false)")
}
const auth=async(user=superUser)=>{
 await role('authenticated')
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[user])
}
await role()
await db.exec(`
ALTER TABLE public.members ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.members ADD COLUMN profile_stage text DEFAULT 'complete',ADD COLUMN onboarding_step integer DEFAULT 0;
ALTER TABLE public.members ADD CONSTRAINT import_audit_original_attractiveness_range CHECK(attractiveness_score IS NULL OR attractiveness_score BETWEEN 1 AND 5);
CREATE UNIQUE INDEX import_audit_member_number_unique ON public.members(member_number);
ALTER TABLE public.admin_users ADD COLUMN name text DEFAULT '隔离管理员';
ALTER TABLE public.member_identity ADD COLUMN age_range text,ADD COLUMN nationality text,ADD COLUMN department text;
ALTER TABLE public.match_rounds ADD COLUMN activity_start date DEFAULT '2026-10-27',ADD COLUMN activity_end date DEFAULT '2026-10-28',ADD COLUMN content_config jsonb DEFAULT '{}',ADD COLUMN config_revision integer DEFAULT 1;
ALTER TABLE public.match_round_submissions ADD COLUMN custom_answers jsonb DEFAULT '{}',ADD COLUMN config_revision integer DEFAULT 1,ADD COLUMN audit_reason text;
CREATE UNIQUE INDEX import_audit_round_member_unique ON public.match_round_submissions(round_id,member_id);
CREATE TRIGGER import_audit_submission_updated_at BEFORE UPDATE ON public.match_round_submissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TABLE private.member_profile_audit_log(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id uuid NOT NULL,member_id_snapshot uuid NOT NULL,
 action_type text NOT NULL,section text,changed_fields text[] NOT NULL DEFAULT '{}',
 before_values jsonb NOT NULL DEFAULT '{}',after_values jsonb NOT NULL DEFAULT '{}',
 reason text,source text NOT NULL DEFAULT 'legacy_profile',actor_user_id uuid,
 actor_admin_id uuid,actor_name text,actor_role_snapshot text NOT NULL DEFAULT 'system',
 request_id uuid,metadata jsonb NOT NULL DEFAULT '{}',event_schema_version smallint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.legacy_members(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),canonical_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
 full_name text NOT NULL,gender text,school text,department text,interest_tags text[] DEFAULT '{}',social_tags text[] DEFAULT '{}',
 game_mode text,compatibility_score integer,session_count integer,match_history jsonb DEFAULT '[]',updated_at timestamptz DEFAULT now()
);
`)
const memberMaster=read('supabase/migrations/20260829175645_user_member_master_v1.sql')
const helperStart=memberMaster.indexOf('CREATE OR REPLACE FUNCTION private.member_master_is_super_admin()')
await db.exec(memberMaster.slice(helperStart,memberMaster.indexOf('$function$;',helperStart)+12))
// Exercise the deployed matching-answer guard, including its later exact
// fragments. Attendance-only roster authorization is outside this matching
// fixture and is explicitly false; no matching validation is stubbed.
function extractFunction(source,name){
 let start=source.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`)
 if(start<0)start=source.indexOf(`CREATE FUNCTION ${name}(`)
 assert.ok(start>=0,name)
 return source.slice(start,source.indexOf('$function$;',start)+12)
}
const contentMigration=read('supabase/migrations/20260929120921_matching_content_editor.sql')
await db.exec(extractFunction(contentMigration,'private.validate_round_custom_answers'))
let submissionGuard=extractFunction(contentMigration,'private.member_master_guard_round_submission_write')
for(const path of [
 'supabase/migrations/20261010101614_matching_round_soft_delete.sql',
 'supabase/migrations/20261010104319_flexible_registration_and_roster_signup.sql',
 'supabase/migrations/20261010114440_restore_cancelled_attendance_registration.sql',
]){
 const source=read(path),start=source.indexOf("definition := pg_get_functiondef('private.member_master_guard_round_submission_write()'::regprocedure);")
 const next=source.indexOf("definition := pg_get_functiondef('",start+1)
 const fragment=source.slice(start,next<0?source.length:next)
 for(const pair of fragment.matchAll(/original := \$fragment\$([\s\S]*?)\$fragment\$;\s*replacement := \$fragment\$([\s\S]*?)\$fragment\$;/g)){
  assert.ok(submissionGuard.includes(pair[1]),`existing guard fragment: ${path}`)
  submissionGuard=submissionGuard.replace(pair[1],pair[2])
 }
}
await db.exec(`CREATE FUNCTION private.round_roster_signup_authorized(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION private.round_roster_restore_authorized(uuid,uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;`)
await db.exec(submissionGuard)
await db.exec('CREATE TRIGGER member_master_guard_round_submission_write BEFORE INSERT OR UPDATE ON public.match_round_submissions FOR EACH ROW EXECUTE FUNCTION private.member_master_guard_round_submission_write()')
let cancellationGuard=extractFunction(read('supabase/migrations/20260929153531_registration_cancellation.sql'),'private.guard_registration_cancellation')
for(const path of [
 'supabase/migrations/20261010104319_flexible_registration_and_roster_signup.sql',
 'supabase/migrations/20261010114440_restore_cancelled_attendance_registration.sql',
]){
 const source=read(path),start=source.indexOf("definition := pg_get_functiondef('private.guard_registration_cancellation()'::regprocedure);")
 const next=source.indexOf("definition := pg_get_functiondef('",start+1)
 const fragment=source.slice(start,next<0?source.length:next)
 for(const pair of fragment.matchAll(/original := \$fragment\$([\s\S]*?)\$fragment\$;\s*replacement := \$fragment\$([\s\S]*?)\$fragment\$;/g)){
  assert.ok(cancellationGuard.includes(pair[1]),`existing cancellation guard fragment: ${path}`)
  cancellationGuard=cancellationGuard.replace(pair[1],pair[2])
 }
}
await db.exec(cancellationGuard)
await db.exec('CREATE TRIGGER member_master_guard_registration_cancellation BEFORE INSERT OR UPDATE ON public.match_round_submissions FOR EACH ROW EXECUTE FUNCTION private.guard_registration_cancellation()')
let notificationGuard=extractFunction(read('supabase/migrations/20260929142902_round_submission_notifications.sql'),'private.notify_round_submission')
const rosterMigration=read('supabase/migrations/20261010104319_flexible_registration_and_roster_signup.sql')
const notificationStart=rosterMigration.indexOf("definition := pg_get_functiondef('private.notify_round_submission()'::regprocedure);")
for(const pair of rosterMigration.slice(notificationStart,rosterMigration.indexOf('END;',notificationStart)).matchAll(/original := \$fragment\$([\s\S]*?)\$fragment\$;\s*replacement := \$fragment\$([\s\S]*?)\$fragment\$;/g)){
 assert.ok(notificationGuard.includes(pair[1]),'existing notification guard fragment')
 notificationGuard=notificationGuard.replace(pair[1],pair[2])
}
await db.exec(notificationGuard)
await db.exec('CREATE TRIGGER notify_round_submission AFTER INSERT ON public.match_round_submissions FOR EACH ROW EXECUTE FUNCTION private.notify_round_submission()')
await db.exec(extractFunction(read('supabase/migrations/20261022175617_matching_survey_submission_concurrency.sql'),'private.matching_submission_updated_at'))
await db.exec('CREATE TRIGGER z_matching_submission_updated_at BEFORE UPDATE ON public.match_round_submissions FOR EACH ROW EXECUTE FUNCTION private.matching_submission_updated_at()')
await db.exec(read('supabase/migrations/20261023112514_matching_run_lifecycle.sql'))
const businessTables=['members','member_identity','member_interests','member_dynamic_stats','legacy_members','match_rounds','match_round_submissions','match_sessions','match_results','unmatched_diagnostics','community_notifications','questionnaire_versions','questionnaire_responses']
const business=async()=>Object.fromEntries(await Promise.all(businessTables.map(async name=>[name,await scalar(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM public.${name} t`)])))
const definitions=async()=>scalar("SELECT jsonb_object_agg(p.oid::regprocedure::text,pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('matching_run','matching_publication','public')")
const before=await business(),functionsBefore=await definitions()
await db.exec(read('supabase/migrations/20261023143833_matching_excel_atomic_import.sql'))
check(await business(),before,'import migration leaves existing questionnaires, responses, people, submissions and matching plans unchanged')
const functionsAfter=await definitions()
for(const [name,definition] of Object.entries(functionsBefore))check(functionsAfter[name],definition,`existing algorithm, questionnaire and publication function stays unchanged: ${name}`)
const applyDefinition=await scalar("SELECT pg_get_functiondef('matching_import.apply_request(uuid,uuid,uuid,text,text,text,text,jsonb)'::regprocedure)")
check(applyDefinition.includes("pg_advisory_xact_lock(hashtextextended('matching-run-job:'||p_round_id::text,0))"),true,'import uses the actual capture/completion per-round transaction lock')
check(applyDefinition.indexOf('FROM public.members WHERE id=ANY(v_member_ids) ORDER BY id FOR UPDATE')<applyDefinition.indexOf('FROM public.match_rounds WHERE id=p_round_id FOR SHARE'),true,'member locks precede the round lock, matching existing player/privacy writers')
check(/DELETE\s+FROM\s+(public\.)?(members|match_round_submissions)\b/i.test(applyDefinition),false,'atomic import contains no person/answer replacement deletes')

const preview=async round=>scalar('SELECT public.admin_preview_round_import_state($1,$2)',[round,superAdmin])
const get=async(id,round,actor=superAdmin)=>scalar('SELECT public.admin_get_round_import($1,$2,$3)',[id,round,actor])
const list=async round=>scalar('SELECT public.admin_list_round_imports($1,$2)',[round,superAdmin])
const apply=async({round,rows,state,id=randomUUID(),hash=digest(JSON.stringify(rows)),file=digest('isolated workbook'),reason='隔离追加更新导入测试',actor=superAdmin})=>({id,result:await scalar('SELECT public.admin_apply_round_import($1,$2,$3,$4,$5,$6,$7,$8)',[id,round,actor,hash,file,reason,state.round_token,rows])})
const currentMembers=Array.from({length:4},()=>randomUUID())
const legacyCanonical=randomUUID(),legacySource=randomUUID()
await role()
for(let i=0;i<currentMembers.length;i++){
 await db.query('INSERT INTO public.members(id,user_id,member_number) VALUES($1,$2,$3)',[currentMembers[i],randomUUID(),`IMPORT_AUDIT_${i+1}`])
 await db.query("INSERT INTO public.member_identity(member_id,full_name,gender) VALUES($1,$2,'other')",[currentMembers[i],`隔离成员${i+1}`])
}
await db.query("INSERT INTO public.members(id,member_number,record_scope,record_source,account_status) VALUES($1,'LEGACY_IMPORT_AUDIT','historical','legacy','unbound')",[legacyCanonical])
await db.query("INSERT INTO public.legacy_members(id,canonical_member_id,full_name,gender,game_mode,compatibility_score,session_count) VALUES($1,$2,'隔离历史成员','女','多人',4,3)",[legacySource,legacyCanonical])
const newRound=async()=>{
 await role()
 const round=await scalar("INSERT INTO public.match_rounds(round_name) VALUES('隔离Excel追加更新') RETURNING id")
 await server()
 return round
}
const memberRow=(state,member=currentMembers[0],changes={})=>{
 const previous=state.submissions.find(row=>row.member_id===member)
 return {row_number:2,source:'current',identity_key:null,existing_member_id:member,expected_member_token:state.member_tokens[member],expected_submission:previous?{id:previous.id,updated_at:previous.updated_at}:null,answers:{game_type_pref:'双人',gender_pref:'都可以',availability:{'2026-10-27':['下午']},message:null,import_metadata:{source:'current',normalized_name:'隔离成员',matched_member_id:member,raw_first_choice:'双人',raw_second_choice:null,script_activity_pref:null,raw_notes:null,warnings:[]}},temp_profile:null,...changes}
}

// Cases below exercise the real SQL contract after fixture creation.
const round=await newRound()
const state=await preview(round)
check(typeof state.round_token,'string','preview returns an opaque round revision')
check(typeof state.member_tokens[currentMembers[0]],'string','preview returns the selected member revision')
check(state.submissions,[],'empty round preview has no submissions')
const row=memberRow(state)
const request=randomUUID(),requestHash=digest('initial confirmed import')
const first=await apply({round,state,rows:[row],id:request,hash:requestHash})
check(first.result.status,'succeeded','a valid import commits one receipt')
check(first.result.id,request,'caller operation ID is the stable receipt ID')
check(first.result.summary.insertedCount,1,'first current member submission is appended')
const afterFirst=await preview(round)
const stored=afterFirst.submissions.find(s=>s.member_id===currentMembers[0])
check(stored.game_type_pref,'双人','confirmed answers are stored')
check(stored.member_id,currentMembers[0],'formal member UUID is retained')
await role()
const dataAfterFirst=await business(),auditAfterFirst=await scalar('SELECT count(*)::int FROM private.member_profile_audit_log')
await server()
const repeated=await apply({round,state,rows:[row],id:request,hash:requestHash})
check(repeated.result,first.result,'same operation retry returns the exact durable receipt')
await role()
check(await business(),dataAfterFirst,'receipt replay cannot rewrite submissions or people')
check(await scalar('SELECT count(*)::int FROM private.member_profile_audit_log'),auditAfterFirst,'receipt replay cannot duplicate subject audit events')
await server()
check(await get(request,round),first.result,'receipt can be recovered after a lost success response')
check((await list(round)).some(receipt=>receipt.id===request),true,'import history lists the committed operation')
await rejects('SELECT public.admin_apply_round_import($1,$2,$3,$4,$5,$6,$7,$8)',/REQUEST_REUSED/,[request,round,superAdmin,digest('tampered plan'),digest('isolated workbook'),'隔离篡改请求测试',state.round_token,[row]])
await rejects('SELECT public.admin_apply_round_import($1,$2,$3,$4,$5,$6,$7,$8)',/REQUEST_REUSED|ROUND|UNAVAILABLE/,[request,await newRound(),superAdmin,requestHash,digest('isolated workbook'),'隔离错轮次测试',state.round_token,[row]])

// Append must never erase a participant missing from this workbook. An update
// keeps the original record ID, dates, supplementary answers and cancellation.
await role()
await db.query("UPDATE public.match_rounds SET content_config=$2 WHERE id=$1",[round,{questions:[{id:'original_question',type:'text',required:false,options:[]}]}])
await db.query("UPDATE public.match_round_submissions SET interest_tags=ARRAY['原兴趣'],social_style='原社交方式',custom_answers=$3,message='原线上留言',created_at='2026-09-01T00:00:00Z' WHERE round_id=$1 AND member_id=$2",[round,currentMembers[0],{original_question:'原答案'}])
await db.query("INSERT INTO public.match_round_submissions(round_id,member_id,message) VALUES($1,$2,'本次Excel不含此人')",[round,currentMembers[1]])
const preservedBefore=await scalar('SELECT to_jsonb(s) FROM public.match_round_submissions s WHERE round_id=$1 AND member_id=$2',[round,currentMembers[0]])
const absentBefore=await scalar('SELECT to_jsonb(s) FROM public.match_round_submissions s WHERE round_id=$1 AND member_id=$2',[round,currentMembers[1]])
await server()
const updateState=await preview(round)
const update=memberRow(updateState)
update.answers.message='管理员明确选择Excel留言'
const updated=await apply({round,state:updateState,rows:[update]})
check(updated.result.status,'succeeded','an explicitly reviewed existing submission can update')
check(updated.result.summary.updatedCount,1,'update receipt distinguishes existing and appended rows')
await role()
const preservedAfter=await scalar('SELECT to_jsonb(s) FROM public.match_round_submissions s WHERE round_id=$1 AND member_id=$2',[round,currentMembers[0]])
for(const field of ['id','created_at','cancelled_at','interest_tags','social_style','custom_answers'])check(preservedAfter[field],preservedBefore[field],`append/update preserves untouched existing ${field}`)
check(await scalar('SELECT to_jsonb(s) FROM public.match_round_submissions s WHERE round_id=$1 AND member_id=$2',[round,currentMembers[1]]),absentBefore,'participant absent from the workbook is untouched')
check(await scalar('SELECT status FROM public.match_rounds WHERE id=$1',[round]),'open','import keeps collection open')

// A new operation with the same file is valid; truly unchanged rows retain
// updated_at and do not acquire a redundant per-subject audit entry.
await server()
const noopState=await preview(round),noop=memberRow(noopState)
noop.answers={game_type_pref:preservedAfter.game_type_pref,gender_pref:preservedAfter.gender_pref,availability:preservedAfter.availability,message:preservedAfter.message,import_metadata:preservedAfter.import_metadata}
await role()
const noOpAuditBefore=await scalar('SELECT count(*)::int FROM private.member_profile_audit_log')
await server()
const noOp=await apply({round,state:noopState,rows:[noop]})
check(noOp.result.status,'succeeded','same workbook under a new operation is not file-hash banned')
check(noOp.result.summary.unchangedCount,1,'an equal row is recorded as unchanged')
await role()
check(await scalar('SELECT updated_at::text FROM public.match_round_submissions WHERE id=$1',[preservedAfter.id]),await scalar('SELECT ($1::timestamptz)::text',[preservedAfter.updated_at]),'unchanged input retains submission updated_at')
check(await scalar('SELECT count(*)::int FROM private.member_profile_audit_log'),noOpAuditBefore,'unchanged input adds no subject mutation audit')

// A preview cannot silently overwrite an online answer written afterwards.
await server()
const conflictState=await preview(round),conflictRow=memberRow(conflictState)
await role()
await db.query("UPDATE public.match_round_submissions SET message='预览后线上新答案' WHERE round_id=$1 AND member_id=$2",[round,currentMembers[0]])
const conflictBusiness=await business()
await server()
const conflicted=await apply({round,state:conflictState,rows:[conflictRow]})
check(conflicted.result.status,'failed','concurrent online edit rejects the entire stale import')
check(conflicted.result.error_code,'IMPORT_SUBMISSION_CHANGED','receipt explains stale submission revision')
await role()
check(await business(),conflictBusiness,'concurrent answer conflict changes no business rows')
await server()
check(await get(conflicted.id,round),conflicted.result,'failed operation has a durable recoverable receipt')
check((await apply({round,state:conflictState,rows:[conflictRow],id:conflicted.id})).result,conflicted.result,'failed request retry cannot later overwrite fresh answers')

const tempRow=(state,label='隔离临时成员',source='temp')=>({
 row_number:2,source,identity_key:digest(`round-local:${label}`),existing_member_id:null,expected_member_token:null,expected_submission:null,
 expected_legacy:source==='legacy-temp'?{id:legacySource,token:state.legacy_tokens?.[legacySource]}:null,
 answers:{game_type_pref:'都可以',gender_pref:'都可以',availability:{'2026-10-27':['下午']},message:'隔离临时留言',import_metadata:{source,normalized_name:label,raw_first_choice:'双人',raw_second_choice:'多人',script_activity_pref:null,raw_notes:'隔离临时留言',warnings:[]}},
 temp_profile:{full_name:label,gender:'other',school:null,department:null,interest_tags:[],social_tags:[],game_mode:source==='legacy-temp'?'多人':null,compatibility_score:source==='legacy-temp'?4:null,session_count:source==='legacy-temp'?3:null},
})
const tempRound=await newRound(),tempState=await preview(tempRound),temp=tempRow(tempState)
for(const expected of [null,{id:legacySource,token:'forged-legacy-preview'}]){
 const r=await newRound(),s=await preview(r),legacy=tempRow(s,'缺少或篡改历史版本','legacy-temp')
 legacy.expected_legacy=expected
 await role();const legacyBefore=await business();await server()
 const rejected=await apply({round:r,state:s,rows:[legacy]})
 check(rejected.result.error_code,'IMPORT_LEGACY_CHANGED','a missing or forged legacy source revision is rejected')
 await role();check(await business(),legacyBefore,'missing or forged legacy preview token writes no copied identity or answer')
}
await server()
const tempImport=await apply({round:tempRound,state:tempState,rows:[temp]})
check(tempImport.result.status,'succeeded','a temporary participant can be imported for offline trial matching')
const tempAfter=await preview(tempRound),tempMap=tempAfter.identities.find(entry=>entry.identity_key===temp.identity_key)
check(typeof tempMap?.member_id,'string','successful import persists a round-local temporary identity')
const tempId=tempMap.member_id,tempSubmission=tempAfter.submissions.find(s=>s.member_id===tempId)
await role()
check(await scalar('SELECT jsonb_build_array(user_id,account_status,record_source) FROM public.members WHERE id=$1',[tempId]),[null,'unbound','import'],'temporary import does not pretend to bind an account')
const tempProfileBefore=await scalar('SELECT to_jsonb(i) FROM public.member_identity i WHERE member_id=$1',[tempId])
await server()
const tempUpdate={...temp,existing_member_id:tempId,expected_member_token:tempAfter.member_tokens[tempId],expected_submission:{id:tempSubmission.id,updated_at:tempSubmission.updated_at},answers:{...temp.answers,message:'同一临时成员明确更新后的留言'},temp_profile:null}
const tempUpdated=await apply({round:tempRound,state:tempAfter,rows:[tempUpdate]})
check(tempUpdated.result.status,'succeeded','same-round stable temporary identity supports an update')
await role()
check(await scalar('SELECT member_id FROM public.match_round_submissions WHERE round_id=$1',[tempRound]),tempId,'temporary update retains the member UUID')
check(await scalar('SELECT id FROM public.match_round_submissions WHERE round_id=$1',[tempRound]),tempSubmission.id,'temporary update retains the submission UUID')
check(await scalar('SELECT to_jsonb(i) FROM public.member_identity i WHERE member_id=$1',[tempId]),tempProfileBefore,'temporary update does not rewrite the original profile')

// A copied legacy profile has its own preview revision and canonical privacy
// subject. The source can change independently of the target round or person.
for(const change of ['edit','anonymize','close','delete legacy','delete canonical','relink canonical']){
 await role()
 const canonical=randomUUID(),legacy=randomUUID()
 await db.query("INSERT INTO public.members(id,member_number,record_scope,record_source,account_status) VALUES($1,$2,'historical','legacy','unbound')",[canonical,`LEGACY_PRIVACY_${legacy}`])
 await db.query("INSERT INTO public.legacy_members(id,canonical_member_id,full_name,gender,compatibility_score) VALUES($1,$2,'应随源身份撤销的敏感姓名','女',4)",[legacy,canonical])
 const r=await newRound(),s=await preview(r),legacyRow=tempRow(s,`历史快照变化-${change}`,'legacy-temp')
 check(typeof s.legacy_tokens?.[legacy],'string',`legacy preview captures a server revision before ${change}`)
 legacyRow.expected_legacy={id:legacy,token:s.legacy_tokens[legacy]}
 legacyRow.temp_profile.full_name='应随源身份撤销的敏感姓名'
 await role()
 if(change==='edit')await db.query("UPDATE public.legacy_members SET full_name='源历史资料已更新' WHERE id=$1",[legacy])
 if(change==='anonymize')await db.query("UPDATE public.members SET anonymized_at=clock_timestamp(),account_status='closed' WHERE id=$1",[canonical])
 if(change==='close')await db.query("UPDATE public.members SET account_status='closed' WHERE id=$1",[canonical])
 if(change==='delete legacy')await db.query('DELETE FROM public.legacy_members WHERE id=$1',[legacy])
 if(change==='delete canonical')await db.query('DELETE FROM public.members WHERE id=$1',[canonical])
 if(change==='relink canonical')await db.query('UPDATE public.legacy_members SET canonical_member_id=$2 WHERE id=$1',[legacy,currentMembers[2]])
 const privacyBefore=await business()
 await server()
 const result=await apply({round:r,state:s,rows:[legacyRow]})
 check(result.result.status,'failed',`legacy ${change} after preview rejects the entire import`)
 check(result.result.error_code,'IMPORT_LEGACY_CHANGED',`legacy ${change} has an explicit safe source-version error`)
 await role()
 check(await business(),privacyBefore,`legacy ${change} cannot recreate the old sensitive name in a temporary person`)
 check(await scalar('SELECT count(*)::int FROM matching_import.identities WHERE round_id=$1',[r]),0,`legacy ${change} creates no stable identity mapping`)
}

// Updating answers after a batch captured input cannot change the batch or
// delete foreign-key subjects, diagnostics, draft results or old member IDs.
await auth()
const manualSession=await scalar("INSERT INTO public.match_sessions(round_id,created_by,algorithm,audit_reason) VALUES($1,$2,'manual','隔离旧方案保留') RETURNING id",[tempRound,superAdmin])
await db.query("INSERT INTO public.match_results(session_id,member_a_id,member_b_id,audit_reason) VALUES($1,$2,$3,'隔离旧结果保留')",[manualSession,tempId,currentMembers[1]])
await db.query("INSERT INTO public.unmatched_diagnostics(session_id,member_id,reason,audit_reason) VALUES($1,$2,'time_conflict','隔离旧未匹配原因')",[manualSession,tempId])
await server()
const run=await scalar("SELECT public.admin_begin_matching_run($1,$2,$3,'导入前冻结批次','隔离冻结输入保留测试')",[tempRound,randomUUID(),superAdmin])
await role()
const frozenBefore=await scalar('SELECT to_jsonb(s) FROM matching_run.snapshots s WHERE id=$1',[run.capture.snapshot_id])
const subjectsBefore=await scalar('SELECT jsonb_agg(to_jsonb(s) ORDER BY member_id) FROM matching_run.subjects s WHERE snapshot_id=$1',[run.capture.snapshot_id])
const oldResultsBefore=await scalar('SELECT jsonb_agg(to_jsonb(r)) FROM public.match_results r WHERE session_id=$1',[manualSession])
const oldDiagnosticsBefore=await scalar('SELECT jsonb_agg(to_jsonb(d)) FROM public.unmatched_diagnostics d WHERE session_id=$1',[manualSession])
await server()
const whileRunningState=await preview(tempRound),whileRunningSub=whileRunningState.submissions.find(s=>s.member_id===tempId)
const whileRunningRow={...temp,existing_member_id:tempId,expected_member_token:whileRunningState.member_tokens[tempId],expected_submission:{id:whileRunningSub.id,updated_at:whileRunningSub.updated_at},answers:{...temp.answers,message:'运行过程中追加更新的新答案'},temp_profile:null}
const whileRunning=await apply({round:tempRound,state:whileRunningState,rows:[whileRunningRow]})
check(whileRunning.result.status,'succeeded','collection/import can continue while a frozen algorithm job exists')
check([...whileRunning.result.summary.affectedBatchIds].sort(),[run.run.id,manualSession].sort(),'receipt identifies all existing batch/run locators whose input is older')
await role()
check(await scalar('SELECT to_jsonb(s) FROM matching_run.snapshots s WHERE id=$1',[run.capture.snapshot_id]),frozenBefore,'later import never changes a frozen source snapshot')
check(await scalar('SELECT jsonb_agg(to_jsonb(s) ORDER BY member_id) FROM matching_run.subjects s WHERE snapshot_id=$1',[run.capture.snapshot_id]),subjectsBefore,'temporary member update keeps the snapshot privacy subject index')
check(await scalar('SELECT jsonb_agg(to_jsonb(r)) FROM public.match_results r WHERE session_id=$1',[manualSession]),oldResultsBefore,'temporary update keeps old draft matching results')
check(await scalar('SELECT jsonb_agg(to_jsonb(d)) FROM public.unmatched_diagnostics d WHERE session_id=$1',[manualSession]),oldDiagnosticsBefore,'temporary update keeps old unmatched diagnostics')
await server()
const equalState=await preview(tempRound),equalSub=equalState.submissions.find(s=>s.member_id===tempId)
const equalRow={...whileRunningRow,expected_member_token:equalState.member_tokens[tempId],expected_submission:{id:equalSub.id,updated_at:equalSub.updated_at}}
check((await apply({round:tempRound,state:equalState,rows:[equalRow]})).result.summary.affectedBatchIds,[],'no-op import does not mark unchanged old input as affected')

// Unknown response recovery reserves an unused request ID. A delayed old
// request then receives the tombstone rather than applying after a new import.
const cancelRound=await newRound(),cancelState=await preview(cancelRound),cancelId=randomUUID()
const cancelled=await scalar('SELECT public.admin_cancel_round_import_request($1,$2,$3,$4)',[cancelId,cancelRound,superAdmin,'隔离终止未知导入编号'])
check(cancelled.error_code,'IMPORT_REQUEST_CANCELLED','unused operation ID can be safely terminated')
await role();const afterCancel=await business();await server()
check((await apply({round:cancelRound,state:cancelState,rows:[memberRow(cancelState)],id:cancelId})).result,cancelled,'late request receives the same tombstone without importing')
await role();check(await business(),afterCancel,'terminated operation cannot write later');await server()
check(await scalar('SELECT public.admin_cancel_round_import_request($1,$2,$3,$4)',[request,round,superAdmin,'隔离已成功编号查询']),first.result,'terminating an already successful operation returns success without undoing it')
check(await get(randomUUID(),cancelRound),null,'an unknown operation has no invented success/failure receipt')

// Matching rounds have no normal registration-cancellation entry point. If an
// old/artificial non-null state exists, the real unchanged cancellation guard
// rejects an answer UPDATE even if cancelled_at itself is kept; do not revive
// or rewrite it in order to make the import pass.
const abnormalRound=await newRound(),abnormalInitial=await preview(abnormalRound)
check((await apply({round:abnormalRound,state:abnormalInitial,rows:[memberRow(abnormalInitial,currentMembers[3])]})).result.status,'succeeded','prepare ordinary matching answer before abnormal cancellation fixture')
await role()
await db.exec('ALTER TABLE public.match_round_submissions DISABLE TRIGGER member_master_guard_registration_cancellation')
await db.query('UPDATE public.match_round_submissions SET cancelled_at=clock_timestamp() WHERE round_id=$1',[abnormalRound])
await db.exec('ALTER TABLE public.match_round_submissions ENABLE TRIGGER member_master_guard_registration_cancellation')
const abnormalBefore=await business()
await server()
const abnormalState=await preview(abnormalRound),abnormalRow=memberRow(abnormalState,currentMembers[3])
abnormalRow.answers.message='不得自动恢复此异常状态'
const abnormal=await apply({round:abnormalRound,state:abnormalState,rows:[abnormalRow]})
check(abnormal.result.status,'failed','real cancellation guard rejects updates to an abnormal cancelled matching answer')
await role();check(await business(),abnormalBefore,'abnormal matching cancellation and answers remain unchanged after rollback')

const scoreRound=await newRound(),scoreState=await preview(scoreRound),zeroScore=tempRow(scoreState,'保留原零分','legacy-temp')
zeroScore.temp_profile.compatibility_score=0
await role();const scoreBefore=await business();await server()
check((await apply({round:scoreRound,state:scoreState,rows:[zeroScore]})).result.status,'failed','unchanged member-master score range rejects a zero-score legacy profile')
await role();check(await business(),scoreBefore,'legacy score validation failure cannot adjust the score or leave a partial identity')

// Identities are scoped to the round even when the source name/key repeats.
const anotherRound=await newRound(),anotherState=await preview(anotherRound)
const another=await apply({round:anotherRound,state:anotherState,rows:[temp]})
check(another.result.status,'succeeded','the same source may be separately imported into another round')
const anotherId=(await preview(anotherRound)).identities.find(entry=>entry.identity_key===temp.identity_key).member_id
check(anotherId===tempId,false,'temporary identities never merge automatically across rounds')

// One bad or repeated row rolls back even an earlier otherwise valid row.
const allOrNothingRound=await newRound(),allOrNothingState=await preview(allOrNothingRound)
await role()
const invalidBefore=await business()
await server()
const invalid=await apply({round:allOrNothingRound,state:allOrNothingState,rows:[tempRow(allOrNothingState,'有效但应回滚'),{...memberRow(allOrNothingState,currentMembers[2]),row_number:3,answers:{...memberRow(allOrNothingState,currentMembers[2]).answers,availability:{}}}]})
check(invalid.result.status,'failed','one invalid required answer fails the entire import')
await role()
check(await business(),invalidBefore,'invalid later row rolls back earlier new temporary members and answers')
await server()
const duplicate=await apply({round:allOrNothingRound,state:allOrNothingState,rows:[temp,{...temp,row_number:3}]})
check(duplicate.result.status,'failed','duplicate stable temporary identity is rejected')
await role()
check(await business(),invalidBefore,'duplicate identity writes no temporary members or submissions')

// Eligibility/privacy changes after preview cannot reuse an obsolete identity.
for(const [label,mutation] of [
 ['newly bound',"user_id=gen_random_uuid(),account_status='active'"],
 ['anonymized',"account_status='closed',anonymized_at=clock_timestamp()"],
 ['suspended',"account_status='suspended'"],
 ['not approved',"status='rejected'"],
]){
 const r=await newRound(),s=await preview(r),t=tempRow(s,`身份变化-${label}`)
 check((await apply({round:r,state:s,rows:[t]})).result.status,'succeeded',`prepare ${label} temporary identity`)
 const fresh=await preview(r),id=fresh.identities.find(entry=>entry.identity_key===t.identity_key).member_id,sub=fresh.submissions.find(entry=>entry.member_id===id)
 const updateTemp={...t,existing_member_id:id,expected_member_token:fresh.member_tokens[id],expected_submission:{id:sub.id,updated_at:sub.updated_at},temp_profile:null}
 await role()
 await db.query(`UPDATE public.members SET ${mutation} WHERE id=$1`,[id])
 const changedBefore=await business()
 await server()
 const denied=await apply({round:r,state:fresh,rows:[updateTemp]})
 check(denied.result.status,'failed',`${label} identity cannot be reused through stale preview`)
 await role()
 check(await business(),changedBefore,`${label} identity failure cannot alter business data`)
}

// Fault every meaningful write stage. SQL transaction rollback replaces the old
// application-side delete/restore compensation, including audit-write failure.
for(const [schema,table,operation,condition] of [
 ['public','members','INSERT','true'],
 ['public','member_identity','INSERT','true'],
 ['public','member_interests','INSERT','true'],
 ['public','member_dynamic_stats','INSERT','true'],
 ['public','match_round_submissions','INSERT','true'],
 ['private','member_profile_audit_log','INSERT','true'],
 ['matching_import','identities','INSERT','true'],
 ['matching_import','receipts','UPDATE',"NEW.status='succeeded'"],
]){
 const r=await newRound(),s=await preview(r),t=tempRow(s,`故障隔离-${schema}-${table}`,'legacy-temp')
 await role()
 const faultBefore=await business()
 await db.exec(`CREATE FUNCTION public.import_injected_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'IMPORT_INJECTED_${table}'; END IF; RETURN NEW; END $$; CREATE TRIGGER import_injected_failure BEFORE ${operation} ON ${schema}.${table} FOR EACH ROW EXECUTE FUNCTION public.import_injected_failure();`)
 await server()
 const failed=await apply({round:r,state:s,rows:[t]})
 check(failed.result.status,'failed',`${table} failure returns a durable failed receipt`)
 check(failed.result.error_code,'IMPORT_WRITE_FAILED',`${table} internal error is safely classified`)
 check(JSON.stringify(failed.result).includes('IMPORT_INJECTED'),false,`${table} internal error text is not exposed`)
 await role()
 check(await business(),faultBefore,`${table} failure rolls back every business write`)
 check(await scalar('SELECT count(*)::int FROM matching_import.identities WHERE round_id=$1',[r]),0,`${table} failure rolls back stable identity allocation`)
 await db.exec(`DROP TRIGGER import_injected_failure ON ${schema}.${table}; DROP FUNCTION public.import_injected_failure();`)
 await server()
 check(await get(failed.id,r),failed.result,`${table} failed receipt remains queryable after the transient fault ends`)
}

// Round configuration changes are checked at final commit, not only preview.
for(const [label,mutation,expected] of [
 ['matched',"status='matched'",'IMPORT_ROUND_UNAVAILABLE'],
 ['deleted',"deleted_at=clock_timestamp()",'IMPORT_ROUND_UNAVAILABLE'],
 ['required custom question',"content_config='{\"questions\":[{\"id\":\"required-question\",\"required\":true}]}'::jsonb",'IMPORT_PREVIEW_STALE'],
 ['activity date edit',"activity_end='2026-10-29'",'IMPORT_PREVIEW_STALE'],
]){
 const r=await newRound(),s=await preview(r)
 await role();await db.query(`UPDATE public.match_rounds SET ${mutation} WHERE id=$1`,[r])
 const preserved=await business()
 await server()
 const stopped=await apply({round:r,state:s,rows:[memberRow(s,currentMembers[3])]})
 check(stopped.result.status,'failed',`${label} round change blocks stale import`)
 check(stopped.result.error_code,expected,`${label} round change is explained`)
 await role();check(await business(),preserved,`${label} failure changes no business rows`)
 if(label==='required custom question'){
  await server();const configured=await preview(r)
  check((await apply({round:r,state:configured,rows:[memberRow(configured,currentMembers[3])]})).result.error_code,'IMPORT_REQUIRED_QUESTIONS','required custom questions remain a server-side import prohibition even under a fresh preview')
 }
}

// The unchanged deployed write guard still validates actual calendar slots,
// optional custom answers and configuration revision on every changed row.
for(const availability of [
 {'2026-10-27':['凌晨']},
 {'2026-10-27':['下午','下午']},
 {'2026-11-01':['下午']},
 {'2026-10-99':['下午']},
]){
 const r=await newRound(),s=await preview(r),invalidRow=memberRow(s,currentMembers[3])
 invalidRow.answers.availability=availability
 await role();const rowsBefore=await business();await server()
 check((await apply({round:r,state:s,rows:[invalidRow]})).result.status,'failed','real existing submission guard rejects invalid time/date input')
 await role();check(await business(),rowsBefore,'real time/date guard failure rolls back the entire import')
}
const optionalRound=await newRound()
await role()
await db.query('UPDATE public.match_rounds SET content_config=$2,config_revision=7 WHERE id=$1',[optionalRound,{questions:[{id:'optional_old',type:'text',required:false,options:[]}]}])
await db.query('INSERT INTO public.match_round_submissions(round_id,member_id,custom_answers,config_revision) VALUES($1,$2,$3,0)',[optionalRound,currentMembers[3],{optional_old:'保留原可选答案'}])
await server()
const optionalState=await preview(optionalRound),optional=memberRow(optionalState,currentMembers[3])
check(optionalState.submissions[0].config_revision,7,'existing privileged write guard applies the current configuration revision')
const optionalResult=await apply({round:optionalRound,state:optionalState,rows:[optional]})
check(optionalResult.result.status,'succeeded','compatible optional custom answers survive an update')
await role()
check(await scalar('SELECT custom_answers FROM public.match_round_submissions WHERE round_id=$1',[optionalRound]),{optional_old:'保留原可选答案'},'import does not erase optional original answers')
// Construct an old retained answer against a later incompatible template; the
// existing deployed validator must stop the update rather than clear it.
await db.query('UPDATE public.match_rounds SET content_config=$2,config_revision=8 WHERE id=$1',[optionalRound,{questions:[]}])
await server()
const incompatible=await preview(optionalRound)
await role();const incompatibleBefore=await business();await server()
const incompatibleRow=memberRow(incompatible,currentMembers[3]);incompatibleRow.answers.message='需要触发真实写入的新留言'
check((await apply({round:optionalRound,state:incompatible,rows:[incompatibleRow]})).result.status,'failed','incompatible historical optional answer rejects the entire import')
await role();check(await business(),incompatibleBefore,'incompatible old optional answer is not cleared or repaired automatically')

// Browser/anonymous credentials cannot submit a forged signed-plan replacement.
for(const accountRole of ['anon','authenticated']){
 await role(accountRole)
 await rejects('SELECT public.admin_preview_round_import_state($1,$2)',/permission denied/,[round,superAdmin])
 await rejects('SELECT public.admin_apply_round_import($1,$2,$3,$4,$5,$6,$7,$8)',/permission denied/,[randomUUID(),round,superAdmin,digest('ACL'),digest('file'),'隔离权限边界测试',state.round_token,[row]])
 await rejects('SELECT * FROM matching_import.identities',/permission denied/)
 await rejects('SELECT * FROM matching_import.receipts',/permission denied/)
 await rejects('SELECT public.admin_cancel_round_import_request($1,$2,$3,$4)',/permission denied/,[randomUUID(),round,superAdmin,'隔离浏览器墓碑权限'])
}
await server(admin)
await rejects('SELECT public.admin_preview_round_import_state($1,$2)',/SERVER_SUPER_ADMIN_REQUIRED/,[round,admin])
await rejects('SELECT public.admin_apply_round_import($1,$2,$3,$4,$5,$6,$7,$8)',/SERVER_SUPER_ADMIN_REQUIRED/,[randomUUID(),round,admin,digest('ACL'),digest('file'),'隔离普通管理员权限',state.round_token,[row]])
await role()
check(await scalar('SELECT count(*)::int FROM public.community_notifications'),before.community_notifications.length,'Excel import never sends station notifications')
check(await scalar("SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='matching_import' AND c.relkind='r' AND NOT c.relrowsecurity"),0,'every new import table has row level security')
console.log(`Matching Excel append/update audit: ${checks} checks passed; isolated PGlite only.`)
await db.close()
