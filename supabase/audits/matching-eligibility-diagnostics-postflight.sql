-- Read-only production proof; no batch capture, publication or notification.
BEGIN READ ONLY;
SET LOCAL statement_timeout='20s';
SELECT jsonb_build_object(
 'status',CASE WHEN
  md5((SELECT prosrc FROM pg_proc WHERE oid='matching_run.complete_run(uuid,uuid,uuid,jsonb,uuid[])'::regprocedure))='98b3fe8e5d8f0ce03aef74b088d7d2d0'
  AND position('counts_available' IN pg_get_functiondef('matching_run.job_metadata(uuid,uuid)'::regprocedure))>0
  AND position('MATCH_RUN_DIAGNOSTICS_COHORT_MISMATCH' IN pg_get_functiondef('matching_run.complete_run_v2(uuid,uuid,uuid,jsonb,uuid[],jsonb)'::regprocedure))>0
  AND NOT EXISTS(SELECT 1 FROM (VALUES
   ('public.admin_get_matching_eligibility_summary(uuid,uuid)'),
   ('public.admin_complete_matching_run_v2(uuid,uuid,uuid,jsonb,uuid[],jsonb)'),
   ('matching_run.preflight_eligibility(uuid,uuid)'),
   ('matching_run.complete_run_v2(uuid,uuid,uuid,jsonb,uuid[],jsonb)')
  ) target(signature) WHERE has_function_privilege('anon',target.signature,'EXECUTE')
    OR has_function_privilege('authenticated',target.signature,'EXECUTE')
    OR NOT has_function_privilege('service_role',target.signature,'EXECUTE'))
  AND NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid IN(
   'public.admin_get_matching_eligibility_summary(uuid,uuid)'::regprocedure,
   'public.admin_complete_matching_run_v2(uuid,uuid,uuid,jsonb,uuid[],jsonb)'::regprocedure) AND prosecdef)
 THEN 'PASS' ELSE 'FAIL' END,
 'job_count',(SELECT count(*) FROM matching_run.jobs),
 'snapshot_count',(SELECT count(*) FROM matching_run.snapshots),
 'notification_count',(SELECT count(*) FROM public.community_notifications)
) AS verification;
ROLLBACK;
