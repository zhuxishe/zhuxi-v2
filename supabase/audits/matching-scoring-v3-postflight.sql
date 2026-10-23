-- Read-only Production postflight. Never runs matching, writes jobs, saves
-- questionnaires, imports participants or sends notifications.
WITH sources AS MATERIALIZED (
 SELECT r.id,matching_run.source_v3(r.id) AS source
 FROM public.match_rounds r
 WHERE r.deleted_at IS NULL AND r.purpose='matching' AND r.status IN('open','closed')
), policy AS (SELECT matching_run.published_scoring_policy() AS value),
new_functions AS (
 SELECT signature,to_regprocedure(signature) AS oid FROM (VALUES
  ('matching_run.public_config(jsonb)'),
  ('matching_run.supported_version(text,integer)'),
  ('matching_run.published_scoring_policy()'),
  ('matching_run.source_v3(uuid)'),
  ('matching_run.engine_matches_source(jsonb,jsonb)'),
  ('matching_run.capture_v3(uuid,uuid,text)'),
  ('matching_run.begin_run_v3(uuid,uuid,uuid,text,text)'),
  ('public.admin_begin_matching_run_v3(uuid,uuid,uuid,text,text)')
 ) required(signature)
)
SELECT jsonb_build_object(
 'status',CASE WHEN (SELECT count(*) FROM new_functions WHERE oid IS NOT NULL)=8
  AND NOT EXISTS(SELECT 1 FROM new_functions f WHERE has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('authenticated',f.oid,'EXECUTE'))
  AND NOT EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated')) roles(name) CROSS JOIN (VALUES('score_breakdown'),('total_score')) columns(name) WHERE has_column_privilege(roles.name,'public.match_results',columns.name,'SELECT'))
  AND has_function_privilege('service_role','public.admin_begin_matching_run_v3(uuid,uuid,uuid,text,text)','EXECUTE')
  AND NOT has_function_privilege('service_role','matching_run.source_v3(uuid)','EXECUTE')
  AND NOT EXISTS(SELECT 1 FROM public.match_sessions WHERE config#>'{scoringPolicy,activityFeedback}' IS NOT NULL)
  AND NOT EXISTS(SELECT 1 FROM sources WHERE source->>'algorithm_version' IS DISTINCT FROM 'max_coverage_split:3' OR source->'adapter_version' IS DISTINCT FROM '2'::jsonb OR source#>'{scoring_policy,dimensionWeights}' IS DISTINCT FROM (SELECT value->'dimensionWeights' FROM policy))
  THEN 'PASS' ELSE 'FAIL' END,
 'published_policy',(SELECT value FROM policy),
 'capturable_rounds',(SELECT count(*) FROM sources),
 'source_policy_checks',COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'round_id',id,
  'algorithm_version',source->>'algorithm_version','adapter_version',source->'adapter_version',
  'submission_count',jsonb_array_length(source->'submissions'),
  'eligible_count',(SELECT count(*) FROM jsonb_array_elements(source->'eligibility') e WHERE (e->>'eligible')::boolean),
  'feedback_count',jsonb_array_length(source#>'{scoring_policy,activityFeedback}'),
  'review_numeric_only',NOT EXISTS(SELECT 1 FROM jsonb_array_elements(source#>'{scoring_policy,activityFeedback}') review CROSS JOIN LATERAL jsonb_object_keys(review) key WHERE key NOT IN('id','round_id','reviewer_id','reviewee_id','score','version')),
  'published_weights_match',source#>'{scoring_policy,dimensionWeights}'=(SELECT value->'dimensionWeights' FROM policy)
 ) ORDER BY id) FROM sources),'[]'::jsonb),
 'public_configs_sanitized',NOT EXISTS(SELECT 1 FROM public.match_sessions WHERE config#>'{scoringPolicy,activityFeedback}' IS NOT NULL),
 'legacy_rpc_unchanged',position('matching_run.begin_run(' IN pg_get_functiondef('public.admin_begin_matching_run(uuid,uuid,uuid,text,text)'::regprocedure))>0,
 'jobs_by_version',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT algorithm_version,adapter_version,count(*) AS count FROM matching_run.jobs GROUP BY algorithm_version,adapter_version ORDER BY algorithm_version,adapter_version)t),'[]'::jsonb),
 'snapshot_count',(SELECT count(*) FROM matching_run.snapshots),
 'notification_count',(SELECT count(*) FROM public.community_notifications)
) AS verification;
