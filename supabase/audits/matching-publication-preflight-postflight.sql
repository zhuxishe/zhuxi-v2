-- Read-only release proof. Does not capture inputs, issue proofs, publish or notify.
BEGIN READ ONLY;
SET LOCAL statement_timeout='20s';
WITH wrappers AS (
 SELECT p.oid,p.prosecdef,p.proconfig,
  CASE WHEN p.proname='admin_publish_checked_match_session' THEN 'authenticated' ELSE 'service_role' END expected_role
 FROM pg_proc p WHERE p.oid IN(
  'public.admin_prepare_match_publication(uuid,uuid,integer)'::regprocedure,
  'public.admin_authorize_match_publication(uuid,uuid,integer,text)'::regprocedure,
  'public.admin_publish_checked_match_session(uuid,integer,text,uuid)'::regprocedure)
), original_publish AS (
 SELECT prosrc, E'\n  PERFORM matching_publication_preflight.assert_context(p_session_id,p_expected_publication_version,v_admin);' AS guard
 FROM pg_proc WHERE oid='matching_publication.publish_session(uuid,integer,text)'::regprocedure
), checks AS (
 SELECT
  (SELECT count(*)=3 AND bool_and(NOT prosecdef
   AND has_function_privilege(expected_role,oid,'EXECUTE')
   AND NOT has_function_privilege('anon',oid,'EXECUTE')
   AND NOT has_function_privilege(CASE expected_role WHEN 'authenticated' THEN 'service_role' ELSE 'authenticated' END,oid,'EXECUTE')
   AND COALESCE(proconfig @> ARRAY['search_path=""'],false)) FROM wrappers) wrappers_ok,
  NOT has_schema_privilege('anon','matching_publication_preflight','USAGE')
   AND has_schema_privilege('authenticated','matching_publication_preflight','USAGE')
   AND has_schema_privilege('service_role','matching_publication_preflight','USAGE')
   AND NOT has_schema_privilege('anon','matching_publication_preflight','CREATE')
   AND NOT has_schema_privilege('authenticated','matching_publication_preflight','CREATE')
   AND NOT has_schema_privilege('service_role','matching_publication_preflight','CREATE') schema_ok,
  (SELECT count(*)=2 AND bool_and(c.relrowsecurity
   AND NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
   AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')
   AND NOT has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE')
   AND NOT EXISTS(SELECT 1 FROM pg_policy policy WHERE policy.polrelid=c.oid))
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='matching_publication_preflight' AND c.relkind='r') tables_ok,
  NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='matching_publication_preflight' AND (
   has_function_privilege('anon',p.oid,'EXECUTE')
   OR has_function_privilege('authenticated',p.oid,'EXECUTE') IS DISTINCT FROM (p.oid='matching_publication_preflight.publish_checked(uuid,integer,text,uuid)'::regprocedure)
   OR has_function_privilege('service_role',p.oid,'EXECUTE') IS DISTINCT FROM (p.oid IN('matching_publication_preflight.prepare(uuid,uuid,integer)'::regprocedure,'matching_publication_preflight.authorize(uuid,uuid,integer,text)'::regprocedure))
   OR NOT COALESCE(p.proconfig @> ARRAY['search_path=""'],false))) helpers_acl_ok,
  (SELECT (length(prosrc)-length(replace(prosrc,guard,'')))/length(guard)=1
   AND md5(replace(prosrc,guard,''))='597c3b9e12e0a62f40bf18bd658d67d2' FROM original_publish) original_publish_only_guard_ok,
  md5((SELECT prosrc FROM pg_proc WHERE oid='matching_publication.unpublish_session(uuid,integer,text)'::regprocedure))='4f526ed89167ae7001a95774dba3e84c'
   AND md5((SELECT prosrc FROM pg_proc WHERE oid='matching_publication.review_cancellation(uuid,integer,timestamptz,text,boolean)'::regprocedure))='8535772751a46209c152e88acaf3f305'
   AND md5((SELECT prosrc FROM pg_proc WHERE oid='matching_publication.request_cancellation(uuid,text,integer)'::regprocedure))='09d3ca83c382990c7cf34dd4986bffa2'
   AND md5((SELECT prosrc FROM pg_proc WHERE oid='matching_run.source_v3(uuid)'::regprocedure))='644b678b15db5217fc8bb58bdd329906'
   AND md5((SELECT prosrc FROM pg_proc WHERE oid='matching_publication.guard_result()'::regprocedure))='3275033363096308568233572dc21bd5'
   AND md5((SELECT prosrc FROM pg_proc WHERE oid='matching_run.erase_anonymized()'::regprocedure))='28a724d6309423925e9908de1c3f7436' original_functions_ok,
  position('matching_run.source(v_session.round_id)' IN (SELECT prosrc FROM pg_proc WHERE oid='matching_publication_preflight.capture(uuid,integer)'::regprocedure))>0
   AND position('matching_run.source_v3(' IN (SELECT prosrc FROM pg_proc WHERE oid='matching_publication_preflight.capture(uuid,integer)'::regprocedure))=0
   AND position('legacy_applies' IN (SELECT prosrc FROM pg_proc WHERE oid='matching_publication_preflight.hard_source(jsonb)'::regprocedure))>0 hard_only_input_ok,
  position('ORDER BY id FOR UPDATE NOWAIT' IN (SELECT prosrc FROM pg_proc WHERE oid='matching_publication_preflight.lock_subjects(uuid)'::regprocedure))>0
   AND position('matching_publication_preflight.lock_subjects(p_session_id)' IN (SELECT prosrc FROM pg_proc WHERE oid='matching_publication_preflight.authorize(uuid,uuid,integer,text)'::regprocedure))>0
   AND position('matching_publication_preflight.lock_subjects(p_session_id)' IN (SELECT prosrc FROM pg_proc WHERE oid='matching_publication_preflight.publish_checked(uuid,integer,text,uuid)'::regprocedure))>0 locks_ok,
  EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.members'::regclass
   AND t.tgname='matching_publication_preflight_member_erasure' AND NOT t.tgisinternal AND t.tgenabled IN('O','A')
   AND t.tgfoid='matching_publication_preflight.erase_anonymized()'::regprocedure
   AND t.tgtype & 2=0 AND t.tgtype & 16=16) privacy_trigger_ok,
  NOT EXISTS(SELECT 1 FROM matching_publication.active_assignments GROUP BY round_id,member_id HAVING count(*)>1) unique_active_assignments_ok,
  NOT EXISTS(SELECT 1 FROM matching_publication_preflight.write_context)
   AND NOT EXISTS(SELECT 1 FROM matching_publication.write_context) contexts_empty_ok
)
SELECT jsonb_build_object(
 'status',CASE WHEN wrappers_ok AND schema_ok AND tables_ok AND helpers_acl_ok AND original_publish_only_guard_ok AND original_functions_ok
  AND hard_only_input_ok AND locks_ok AND privacy_trigger_ok AND unique_active_assignments_ok AND contexts_empty_ok THEN 'PASS' ELSE 'FAIL' END,
 'checks',to_jsonb(checks),
 'proof_count',(SELECT count(*) FROM matching_publication_preflight.proofs),
 'proof_context_count',(SELECT count(*) FROM matching_publication_preflight.write_context),
 'publication_context_count',(SELECT count(*) FROM matching_publication.write_context),
 'duplicate_active_assignment_groups',(SELECT count(*) FROM (SELECT round_id,member_id FROM matching_publication.active_assignments GROUP BY round_id,member_id HAVING count(*)>1) duplicate),
 'result_count',(SELECT count(*) FROM public.match_results),
 'notification_count',(SELECT count(*) FROM public.community_notifications)) AS verification
FROM checks;
ROLLBACK;
