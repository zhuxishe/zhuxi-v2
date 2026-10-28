-- Read-only capability and privilege check; no member data is returned.
BEGIN READ ONLY;
SET LOCAL statement_timeout='20s';
WITH checks AS (
 SELECT
 (SELECT count(*)=2 AND bool_and(c.relrowsecurity AND NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE'))
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='test_pool_access'
   AND c.relname IN('round_formal_player_access','round_formal_player_access_audit')) private_tables_ok,
 (SELECT NOT prosecdef AND NOT has_function_privilege('anon',oid,'EXECUTE') AND NOT has_function_privilege('authenticated',oid,'EXECUTE')
  AND NOT has_function_privilege('service_role',oid,'EXECUTE') FROM pg_proc WHERE oid='test_pool_access.set_round_formal_player_access(uuid,boolean,text,uuid)'::regprocedure) owner_only_setter_ok,
 (SELECT NOT prosecdef AND has_function_privilege('authenticated',oid,'EXECUTE') AND NOT has_function_privilege('anon',oid,'EXECUTE')
  AND NOT has_function_privilege('service_role',oid,'EXECUTE') FROM pg_proc WHERE oid='public.get_my_test_round_ids()'::regprocedure) public_wrapper_unchanged,
 position('round_formal_player_access' in pg_get_functiondef('private.test_account_round_allowed(uuid,uuid)'::regprocedure))>0
  AND position('private.test_account_round_allowed' in pg_get_functiondef('test_pool_access.get_my_test_round_ids()'::regprocedure))>0 consistent_policy_ok,
 position('TEST_ROUND_DYNAMIC_AUDIENCE_ACTIVE' in pg_get_functiondef('public.admin_configure_test_round(uuid,uuid,uuid[],text)'::regprocedure))>0 legacy_guard_ok,
 position('matching_publication.roster' in pg_get_functiondef('test_pool_access.set_round_formal_player_access(uuid,boolean,text,uuid)'::regprocedure))>0
  AND position('unmatched_diagnostics' in pg_get_functiondef('test_pool_access.set_round_formal_player_access(uuid,boolean,text,uuid)'::regprocedure))>0 historical_participation_guard_ok,
 EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='test_pool_access.round_formal_player_access_audit'::regclass
  AND tgname='round_formal_player_access_audit_immutable' AND tgenabled='O')
  AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='test_pool_access.round_formal_player_access_audit'::regclass
   AND tgname='round_formal_player_access_audit_no_truncate' AND tgenabled='O') immutable_audit_ok,
 NOT EXISTS(SELECT 1 FROM test_pool_access.round_formal_player_access access JOIN public.match_rounds r ON r.id=access.round_id
  WHERE access.enabled AND (NOT r.is_test OR r.purpose<>'matching')) audience_domain_ok
)
SELECT jsonb_build_object('status',CASE WHEN private_tables_ok AND owner_only_setter_ok AND public_wrapper_unchanged AND consistent_policy_ok AND legacy_guard_ok AND historical_participation_guard_ok AND immutable_audit_ok AND audience_domain_ok THEN 'PASS' ELSE 'FAIL' END,
 'checks',to_jsonb(checks),'enabled_round_count',(SELECT count(*) FROM test_pool_access.round_formal_player_access WHERE enabled),
 'operator_audit_count',(SELECT count(*) FROM test_pool_access.round_formal_player_access_audit)) verification FROM checks;
ROLLBACK;
