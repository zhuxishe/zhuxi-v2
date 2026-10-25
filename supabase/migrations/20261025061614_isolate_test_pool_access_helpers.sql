-- Production exposes public and private through PostgREST. Keep only narrow
-- SECURITY INVOKER entry points there; preserve the two existing implementation
-- OIDs so their RLS dependencies, owner, ACL and safe search_path remain intact.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='2min';
DO $baseline$
BEGIN
 IF NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.get_my_test_round_ids()'::regprocedure)
  OR NOT (SELECT prosecdef FROM pg_proc WHERE oid='private.test_round_visible_to_current_user(uuid)'::regprocedure)
 THEN RAISE EXCEPTION 'TEST_POOL_ACCESS_HELPER_BASELINE_CHANGED'; END IF;
END;
$baseline$;
CREATE SCHEMA test_pool_access AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA test_pool_access FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA test_pool_access TO anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA test_pool_access REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER FUNCTION public.get_my_test_round_ids() SET SCHEMA test_pool_access;
ALTER FUNCTION private.test_round_visible_to_current_user(uuid) SET SCHEMA test_pool_access;

CREATE FUNCTION public.get_my_test_round_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT test_pool_access.get_my_test_round_ids()
$function$;
REVOKE ALL ON FUNCTION public.get_my_test_round_ids() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_test_round_ids() TO authenticated;

CREATE FUNCTION private.test_round_visible_to_current_user(p_round_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT test_pool_access.test_round_visible_to_current_user(p_round_id)
$function$;
REVOKE ALL ON FUNCTION private.test_round_visible_to_current_user(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.test_round_visible_to_current_user(uuid) TO anon,authenticated;
COMMENT ON SCHEMA test_pool_access IS
 'Non-API implementation schema for the test-round access predicates; public/private RPC entry points are SECURITY INVOKER.';
NOTIFY pgrst,'reload schema';
COMMIT;
