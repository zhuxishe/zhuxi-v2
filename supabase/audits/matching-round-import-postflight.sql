-- Read-only production verification; never imports or edits an applicant.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $audit$
DECLARE v_table text; v_function record;
BEGIN
 FOREACH v_table IN ARRAY ARRAY['matching_import.receipts','matching_import.identities'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=v_table::regclass AND relrowsecurity) THEN RAISE EXCEPTION 'IMPORT_RLS_MISSING'; END IF;
  IF has_table_privilege('anon',v_table,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated',v_table,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('service_role',v_table,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'IMPORT_DIRECT_TABLE_ACCESS'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('admin_preview_round_import_state','admin_apply_round_import','admin_get_round_import','admin_list_round_imports','admin_cancel_round_import_request'))<>5 THEN RAISE EXCEPTION 'IMPORT_RPC_MISSING'; END IF;
 FOR v_function IN SELECT p.oid,p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('admin_preview_round_import_state','admin_apply_round_import','admin_get_round_import','admin_list_round_imports','admin_cancel_round_import_request') LOOP
  IF v_function.prosecdef OR has_function_privilege('anon',v_function.oid,'EXECUTE') OR has_function_privilege('authenticated',v_function.oid,'EXECUTE') OR NOT has_function_privilege('service_role',v_function.oid,'EXECUTE') THEN RAISE EXCEPTION 'IMPORT_RPC_ACL_INVALID'; END IF;
 END LOOP;
 IF has_schema_privilege('anon','matching_import','USAGE') OR has_schema_privilege('authenticated','matching_import','USAGE') THEN RAISE EXCEPTION 'IMPORT_PRIVATE_SCHEMA_EXPOSED'; END IF;
END;
$audit$;
SELECT jsonb_build_object('status','PASS','production_project','wjjhprflldvclulistcx','migration_latest',(SELECT max(version) FROM supabase_migrations.schema_migrations),'receipts',(SELECT count(*) FROM matching_import.receipts),'identities',(SELECT count(*) FROM matching_import.identities),'tables',(SELECT jsonb_agg(jsonb_build_object('table',relname,'rls',relrowsecurity)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='matching_import' AND c.relkind='r'),'rpc_count',5) AS verification;
ROLLBACK;
