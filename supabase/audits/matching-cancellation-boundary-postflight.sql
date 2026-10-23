-- Read-only checks. Never creates requests, publishes results or sends notices.
BEGIN READ ONLY;
SET LOCAL statement_timeout='20s';
SELECT jsonb_build_object(
 'status',CASE WHEN
   EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.match_results'::regclass AND attname='cancellation_publication_version' AND NOT attisdropped)
   AND has_column_privilege('authenticated','public.match_results','cancellation_publication_version','SELECT')
   AND NOT has_column_privilege('anon','public.match_results','cancellation_publication_version','SELECT')
   AND NOT EXISTS(SELECT 1 FROM (VALUES('total_score'),('score_breakdown')) protected(name)
     WHERE has_column_privilege('authenticated','public.match_results',protected.name,'SELECT'))
   AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.match_results'::regclass
     AND tgname='member_master_audit_related_change' AND tgenabled IN('O','A') AND NOT tgisinternal)
   AND position('cancellation_publication_version IS DISTINCT FROM p_expected_publication_version' IN pg_get_functiondef('matching_publication.review_cancellation(uuid,integer,timestamptz,text,boolean)'::regprocedure))>0
   AND position('cancellation_publication_version=NULL' IN pg_get_functiondef('matching_publication.unpublish_session(uuid,integer,text)'::regprocedure))>0
   AND NOT EXISTS(SELECT 1 FROM public.match_results result JOIN public.match_sessions session ON session.id=result.session_id
     WHERE result.cancellation_publication_version IS NOT NULL AND
       (result.cancellation_publication_version IS DISTINCT FROM result.publication_version
        OR result.cancellation_publication_version IS DISTINCT FROM session.publication_version
        OR session.status<>'confirmed'))
   AND NOT EXISTS(SELECT 1 FROM (VALUES
     ('matching_publication.unpublish_session(uuid,integer,text)'),
     ('matching_publication.review_cancellation(uuid,integer,timestamptz,text,boolean)'),
     ('matching_publication.request_cancellation(uuid,text,integer)')
   ) helpers(signature) WHERE has_function_privilege('anon',helpers.signature,'EXECUTE')
     OR has_function_privilege('service_role',helpers.signature,'EXECUTE'))
   AND NOT has_function_privilege('authenticated','matching_publication.guard_result()','EXECUTE')
 THEN 'PASS' ELSE 'FAIL' END,
 'versioned_request_count',(SELECT count(*) FROM public.match_results WHERE cancellation_publication_version IS NOT NULL),
 'pending_current_request_count',(SELECT count(*) FROM public.match_results result JOIN public.match_sessions session ON session.id=result.session_id
   WHERE result.cancellation_status='pending' AND result.status='confirmed' AND session.status='confirmed'
     AND result.cancellation_publication_version=result.publication_version AND result.publication_version=session.publication_version),
 'trusted_context_count',(SELECT count(*) FROM matching_publication.write_context),
 'notification_count',(SELECT count(*) FROM public.community_notifications)
) AS verification;
ROLLBACK;
