-- Read-only verification of audited deletion and the protected trash list.
BEGIN TRANSACTION READ ONLY;
DO $audit$
DECLARE definition text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='private.match_round_deletion_audit'::regclass AND relrowsecurity)
    OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='private.match_round_deletion_audit'::regclass
      AND tgname='guard_match_round_deletion_audit' AND tgenabled='O') THEN
    RAISE EXCEPTION 'ROUND_DELETE_AUDIT_PROTECTION_MISSING';
  END IF;
  IF has_table_privilege('anon','private.match_round_deletion_audit','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated','private.match_round_deletion_audit','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('service_role','private.match_round_deletion_audit','SELECT,INSERT,UPDATE,DELETE')
    OR has_function_privilege('anon','private.perform_match_round_deletion(uuid,text,integer)','EXECUTE')
    OR has_function_privilege('authenticated','private.perform_match_round_deletion(uuid,text,integer)','EXECUTE')
    OR has_function_privilege('service_role','private.perform_match_round_deletion(uuid,text,integer)','EXECUTE')
    OR has_function_privilege('authenticated','private.guard_match_round_deletion_audit()','EXECUTE') THEN
    RAISE EXCEPTION 'ROUND_DELETE_AUDIT_PRIVILEGES_INVALID';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.admin_delete_match_round(uuid,text,integer,text,text)'::regprocedure
    AND NOT prosecdef AND proconfig @> ARRAY['search_path=""']::text[])
    OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='private.admin_delete_match_round(uuid,text,integer,text,text)'::regprocedure
      AND prosecdef AND proconfig @> ARRAY['search_path=""']::text[])
    OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.admin_list_deleted_match_rounds(integer,integer)'::regprocedure
      AND NOT prosecdef AND proconfig @> ARRAY['search_path=""']::text[])
    OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='private.admin_list_deleted_match_rounds(integer,integer)'::regprocedure
      AND prosecdef AND proconfig @> ARRAY['search_path=""']::text[]) THEN
    RAISE EXCEPTION 'ROUND_DELETE_AUDIT_RPC_SECURITY_INVALID';
  END IF;
  IF NOT has_function_privilege('authenticated','public.admin_delete_match_round(uuid,text,integer,text,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','private.admin_delete_match_round(uuid,text,integer,text,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.admin_list_deleted_match_rounds(integer,integer)','EXECUTE')
    OR NOT has_function_privilege('authenticated','private.admin_list_deleted_match_rounds(integer,integer)','EXECUTE')
    OR has_function_privilege('anon','public.admin_delete_match_round(uuid,text,integer,text,text)','EXECUTE')
    OR has_function_privilege('service_role','public.admin_delete_match_round(uuid,text,integer,text,text)','EXECUTE')
    OR has_function_privilege('anon','private.admin_delete_match_round(uuid,text,integer,text,text)','EXECUTE')
    OR has_function_privilege('service_role','private.admin_delete_match_round(uuid,text,integer,text,text)','EXECUTE')
    OR has_function_privilege('anon','public.admin_list_deleted_match_rounds(integer,integer)','EXECUTE')
    OR has_function_privilege('service_role','public.admin_list_deleted_match_rounds(integer,integer)','EXECUTE')
    OR has_function_privilege('anon','private.admin_list_deleted_match_rounds(integer,integer)','EXECUTE')
    OR has_function_privilege('service_role','private.admin_list_deleted_match_rounds(integer,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'ROUND_DELETE_AUDIT_API_ACL_INVALID';
  END IF;
  definition:=pg_get_functiondef('public.admin_delete_match_round(uuid,text,integer)'::regprocedure);
  IF position('ROUND_DELETE_AUDIT_REQUIRED' IN definition)=0 THEN
    RAISE EXCEPTION 'ROUND_DELETE_OLD_PUBLIC_API_NOT_BLOCKED';
  END IF;
  definition:=pg_get_functiondef('private.admin_delete_match_round(uuid,text,integer)'::regprocedure);
  IF position('ROUND_DELETE_AUDIT_REQUIRED' IN definition)=0 THEN
    RAISE EXCEPTION 'ROUND_DELETE_OLD_PRIVATE_API_NOT_BLOCKED';
  END IF;
  IF EXISTS (SELECT 1 FROM private.match_round_deletion_audit a JOIN public.match_rounds r ON r.id=a.round_id
    WHERE r.deleted_at IS NULL OR r.status<>'closed' OR a.deleted_at IS DISTINCT FROM r.deleted_at
      OR a.round_name IS DISTINCT FROM r.round_name OR a.purpose IS DISTINCT FROM r.purpose
      OR a.activity_start IS DISTINCT FROM r.activity_start OR a.activity_end IS DISTINCT FROM r.activity_end
      OR a.survey_end IS DISTINCT FROM r.survey_end) THEN
    RAISE EXCEPTION 'ROUND_DELETE_AUDIT_SNAPSHOT_INVALID';
  END IF;
END;
$audit$;
SELECT count(*) FILTER(WHERE r.deleted_at IS NULL) AS live_rounds,
  count(*) FILTER(WHERE r.deleted_at IS NOT NULL AND a.round_id IS NULL) AS legacy_removed_rounds,
  count(*) FILTER(WHERE a.round_id IS NOT NULL) AS audited_removed_rounds
FROM public.match_rounds r LEFT JOIN private.match_round_deletion_audit a ON a.round_id=r.id;
COMMIT;
