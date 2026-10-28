-- Read-only capability/ACL checks. No identities, answers or activity records.
BEGIN READ ONLY;
SET LOCAL statement_timeout='20s';
WITH checks AS (
 SELECT
 (SELECT relrowsecurity AND NOT has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('service_role',oid,'SELECT,INSERT,UPDATE,DELETE') FROM pg_class
  WHERE oid='test_pool_access.audience_admin_operations'::regclass) audit_private,
 (SELECT count(*)=3 AND bool_and(NOT p.prosecdef AND has_function_privilege('authenticated',p.oid,'EXECUTE')
  AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE'))
  FROM pg_proc p WHERE p.oid IN('public.admin_get_round_audience(uuid)'::regprocedure,
   'public.admin_save_round_audience(uuid,boolean,uuid[],text,uuid,text)'::regprocedure,
   'public.admin_get_round_audience_operation(uuid)'::regprocedure)) wrappers_invoker,
 (SELECT count(*)=3 AND bool_and(p.prosecdef AND p.proconfig=ARRAY['search_path=""']
  AND has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
  AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')) FROM pg_proc p
  WHERE p.oid IN('test_pool_access.admin_get_round_audience(uuid)'::regprocedure,
   'test_pool_access.admin_save_round_audience(uuid,boolean,uuid[],text,uuid,text)'::regprocedure,
   'test_pool_access.audience_admin_receipt(uuid,boolean)'::regprocedure)) implementations_protected,
 (SELECT bool_and(NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
  AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')) FROM pg_proc p WHERE p.oid IN(
  'test_pool_access.audience_admin_actor(boolean)'::regprocedure,'test_pool_access.audience_member_eligible(uuid)'::regprocedure,
  'test_pool_access.audience_participant_ids(uuid)'::regprocedure,'test_pool_access.audience_admin_revision(uuid,integer)'::regprocedure)) internal_helpers_private,
 position('audience_admin_actor(true)' in pg_get_functiondef('test_pool_access.admin_save_round_audience(uuid,boolean,uuid[],text,uuid,text)'::regprocedure))>0
  AND position('FOR SHARE NOWAIT' in pg_get_functiondef('test_pool_access.admin_save_round_audience(uuid,boolean,uuid[],text,uuid,text)'::regprocedure))>0 mutation_actor_rechecked,
 position('audience_admin_actor(false)' in pg_get_functiondef('test_pool_access.audience_admin_receipt(uuid,boolean)'::regprocedure))>0
  AND position('receipt.actor_admin_id<>actor' in pg_get_functiondef('test_pool_access.audience_admin_receipt(uuid,boolean)'::regprocedure))>0 own_receipt_recovery,
 (SELECT count(*)=2 FROM pg_trigger WHERE tgrelid='test_pool_access.audience_admin_operations'::regclass
  AND tgname IN('audience_admin_operations_immutable','audience_admin_operations_no_truncate') AND tgenabled='O') audit_immutable,
 (SELECT md5(prosrc)='bd1b3586c25b4dfff963d876a012d184' FROM pg_proc WHERE oid='test_pool_access.set_round_formal_player_access(uuid,boolean,text,uuid)'::regprocedure)
  AND (SELECT md5(prosrc)='cbb492872628b3a0c751e01e1222eb0e' FROM pg_proc WHERE oid='private.test_account_round_allowed(uuid,uuid)'::regprocedure)
  AND (SELECT md5(prosrc)='455988a263b4f2f7091031f775a25610' FROM pg_proc WHERE oid='test_pool_access.get_my_test_round_ids()'::regprocedure) previous_access_policy_unchanged
)
SELECT jsonb_build_object('status',CASE WHEN audit_private AND wrappers_invoker AND implementations_protected AND internal_helpers_private AND mutation_actor_rechecked AND own_receipt_recovery AND audit_immutable AND previous_access_policy_unchanged THEN 'PASS' ELSE 'FAIL' END,'checks',to_jsonb(checks),'admin_audience_operation_count',(SELECT count(*) FROM test_pool_access.audience_admin_operations)) verification FROM checks;
ROLLBACK;
