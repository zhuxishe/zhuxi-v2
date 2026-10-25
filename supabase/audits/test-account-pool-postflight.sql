-- Read only. Safe before provisioning (zero registered accounts) and after it.
WITH checks AS (
 SELECT jsonb_build_object(
  'protected_columns',EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='members' AND column_name='is_test' AND is_nullable='NO')
    AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='match_rounds' AND column_name='is_test' AND is_nullable='NO'),
  'registry_rls',NOT EXISTS(SELECT 1 FROM pg_class WHERE oid IN('private.test_accounts'::regclass,'private.test_round_members'::regclass,'private.test_pool_write_context'::regclass) AND NOT relrowsecurity),
  'registry_closed_to_clients',NOT EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) roles(role_name)
    CROSS JOIN unnest(ARRAY['private.test_accounts','private.test_round_members','private.test_pool_write_context']) tables(table_name)
    WHERE has_table_privilege(role_name,table_name,'SELECT,INSERT,UPDATE,DELETE')),
  'controlled_rpc_server_only',NOT EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated']) roles(role_name)
    CROSS JOIN unnest(ARRAY['public.admin_provision_test_account(uuid,uuid,uuid,text,text,text,text)','public.admin_activate_test_account(uuid,uuid,text)','public.admin_configure_test_round(uuid,uuid,uuid[],text)']) functions(signature)
    WHERE has_function_privilege(role_name,signature,'EXECUTE')),
  'rpc_server_grants',has_function_privilege('service_role','public.admin_provision_test_account(uuid,uuid,uuid,text,text,text,text)','EXECUTE')
    AND has_function_privilege('service_role','public.admin_activate_test_account(uuid,uuid,text)','EXECUTE') AND has_function_privilege('service_role','public.admin_configure_test_round(uuid,uuid,uuid[],text)','EXECUTE'),
  'test_member_registry_consistent',NOT EXISTS(SELECT 1 FROM public.members m WHERE m.is_test AND NOT EXISTS(SELECT 1 FROM private.test_accounts a WHERE a.member_id=m.id
    AND (a.code=m.member_number OR (m.member_number IS NULL AND (m.account_status='closed' OR m.anonymized_at IS NOT NULL)))
    AND (a.user_id=m.user_id OR (m.user_id IS NULL AND (m.account_status='closed' OR m.anonymized_at IS NOT NULL))))),
  'no_unregistered_tst_number',NOT EXISTS(SELECT 1 FROM public.members WHERE member_number LIKE 'TST_%' AND NOT is_test),
  'test_round_exact_roster',NOT EXISTS(SELECT 1 FROM public.match_rounds r WHERE r.is_test AND r.deleted_at IS NULL AND
    ((SELECT count(*) FROM private.test_round_members a WHERE a.round_id=r.id)<>33 OR
     (SELECT count(*) FROM private.test_round_members a JOIN public.members m ON m.id=a.member_id WHERE a.round_id=r.id AND m.is_test)<>27)),
  'no_test_account_formal_submission',NOT EXISTS(SELECT 1 FROM public.match_round_submissions s JOIN public.members m ON m.id=s.member_id JOIN public.match_rounds r ON r.id=s.round_id WHERE m.is_test AND NOT r.is_test),
  'no_foreign_test_submission',NOT EXISTS(SELECT 1 FROM public.match_round_submissions s JOIN public.match_rounds r ON r.id=s.round_id WHERE r.is_test AND NOT EXISTS(SELECT 1 FROM private.test_round_members a WHERE a.round_id=r.id AND a.member_id=s.member_id)),
  'no_foreign_test_notice',NOT EXISTS(SELECT 1 FROM public.community_notifications n JOIN public.match_rounds r ON r.id=n.round_id WHERE r.is_test AND n.notification_type IN('matching_published','matching_unmatched','matching_withdrawn','matching_cancelled') AND NOT EXISTS(SELECT 1 FROM private.test_round_members a WHERE a.round_id=r.id AND a.member_id=n.recipient_member_id)),
  'identity_guard_enabled',EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.members'::regclass AND tgname='a_test_pool_member_identity' AND tgenabled='O'),
  'test_accounts_not_admins',NOT EXISTS(SELECT 1 FROM private.test_accounts t JOIN public.admin_users a ON a.user_id=t.user_id),
  'test_admin_guard_enabled',EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.admin_users'::regclass AND tgname='test_pool_admin_identity' AND tgenabled='O'),
  'submission_guard_enabled',EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.match_round_submissions'::regclass AND tgname='test_pool_submission_scope' AND tgenabled='O'),
  'final_publication_scope_check',position('test_pool_assert_session_scope' IN pg_get_functiondef('matching_publication.assert_complete(uuid)'::regprocedure))>0
    AND position('test_pool_assert_session_scope' IN pg_get_functiondef('matching_publication_preflight.capture(uuid,integer)'::regprocedure))>0,
  'matching_history_domain',position('test_round_same_domain' IN pg_get_functiondef('matching_run.source(uuid)'::regprocedure))>0
    AND position('test_review_same_domain' IN pg_get_functiondef('matching_run.source(uuid)'::regprocedure))>0,
  'activity_feedback_domain',position('test_round_same_domain' IN pg_get_functiondef('matching_run.source_v3(uuid)'::regprocedure))>0
    AND position('test_account_round_allowed' IN pg_get_functiondef('private.peer_member_eligible(uuid,uuid)'::regprocedure))>0,
  'community_test_write_guard',position('AND NOT m.is_test' IN pg_get_functiondef('private.community_can_interact()'::regprocedure))>0,
  'formal_stats_exclude_tests',position('NOT member.is_test' IN pg_get_functiondef('public.admin_member_dashboard_metrics()'::regprocedure))>0
    AND position('NOT member.is_test' IN pg_get_functiondef('public.admin_list_member_directory_filtered(integer,integer,text,text,text,text,text,text[],text,text)'::regprocedure))>0,
  'protected_context_empty',NOT EXISTS(SELECT 1 FROM private.test_pool_write_context)
 ) AS value
)
SELECT jsonb_build_object('status',CASE WHEN NOT EXISTS(SELECT 1 FROM jsonb_each(value) e WHERE e.value IS DISTINCT FROM 'true'::jsonb) THEN 'PASS' ELSE 'FAIL' END,
 'checks',value,'registered_accounts',(SELECT count(*) FROM private.test_accounts),'active_test_accounts',(SELECT count(*) FROM public.members WHERE is_test AND account_status='active' AND anonymized_at IS NULL),
 'test_rounds',(SELECT count(*) FROM public.match_rounds WHERE is_test AND deleted_at IS NULL)) AS verification FROM checks;
