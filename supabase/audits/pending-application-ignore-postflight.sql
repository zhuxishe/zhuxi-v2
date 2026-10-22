-- Read-only schema, privilege and integrity checks; does not mutate applicants.
BEGIN TRANSACTION READ ONLY;
DO $audit$
DECLARE
  signature text;
  schema_name text;
  definition text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid='public.member_application_ignores'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'APPLICATION_IGNORE_RLS_MISSING';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.member_application_ignores'::regclass AND contype='p'
      AND conkey=ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid='public.member_application_ignores'::regclass AND attname='member_id')]::smallint[]
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.member_application_ignores'::regclass AND contype='f'
      AND confrelid='public.members'::regclass AND confdeltype='c'
  ) OR EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.member_application_ignores'::regclass AND contype='f'
      AND confrelid='public.admin_users'::regclass
  ) THEN
    RAISE EXCEPTION 'APPLICATION_IGNORE_SUBJECT_OR_ACTOR_REFERENCE_INVALID';
  END IF;
  IF has_table_privilege('anon','public.member_application_ignores','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_table_privilege('authenticated','public.member_application_ignores','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_table_privilege('service_role','public.member_application_ignores','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR NOT has_table_privilege('authenticated','public.member_application_ignores','SELECT')
    OR NOT has_table_privilege('service_role','public.member_application_ignores','SELECT') THEN
    RAISE EXCEPTION 'APPLICATION_IGNORE_TABLE_PRIVILEGES_INVALID';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policy WHERE polrelid='public.member_application_ignores'::regclass
      AND polcmd<>'r'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polrelid='public.member_application_ignores'::regclass
      AND polcmd='r'
      AND position('member_master_is_admin' IN pg_get_expr(polqual,polrelid))>0
      AND position('anonymized_at' IN pg_get_expr(polqual,polrelid))>0
  ) THEN
    RAISE EXCEPTION 'APPLICATION_IGNORE_READ_POLICY_INVALID';
  END IF;
  FOREACH signature IN ARRAY ARRAY[
    'admin_set_pending_application_ignored(uuid,boolean,text,timestamptz,timestamptz)',
    'admin_approve_pending_application(uuid,text,timestamptz)'
  ] LOOP
    FOREACH schema_name IN ARRAY ARRAY['public','private'] LOOP
      IF NOT has_function_privilege('authenticated',schema_name||'.'||signature,'EXECUTE')
        OR has_function_privilege('anon',schema_name||'.'||signature,'EXECUTE')
        OR has_function_privilege('service_role',schema_name||'.'||signature,'EXECUTE') THEN
        RAISE EXCEPTION 'APPLICATION_IGNORE_RPC_PRIVILEGES_INVALID: %.%',schema_name,signature;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid=(schema_name||'.'||signature)::regprocedure
          AND prosecdef=(schema_name='private')
          AND proconfig @> ARRAY['search_path=""']::text[]
      ) THEN
        RAISE EXCEPTION 'APPLICATION_IGNORE_RPC_SECURITY_INVALID: %.%',schema_name,signature;
      END IF;
    END LOOP;
  END LOOP;
  definition:=pg_get_functiondef('private.admin_set_pending_application_ignored(uuid,boolean,text,timestamptz,timestamptz)'::regprocedure);
  IF position('private.member_profile_audit_log' IN definition)=0
    OR position('related_record_change' IN definition)=0
    OR position('application_queue' IN definition)=0
    OR definition ~* '(UPDATE|INSERT INTO|DELETE FROM)[[:space:]]+public[.]members'
    OR definition ~* '(pg_notify|notifications|send_email)' THEN
    RAISE EXCEPTION 'APPLICATION_IGNORE_AUDIT_OR_MEMBER_WRITE_BOUNDARY_INVALID';
  END IF;
  definition:=pg_get_functiondef('private.admin_approve_pending_application(uuid,text,timestamptz)'::regprocedure);
  IF position('admin_update_member_section' IN definition)=0
    OR position('member_application_ignores' IN definition)=0 THEN
    RAISE EXCEPTION 'APPLICATION_IGNORE_APPROVAL_GUARD_MISSING';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='private.member_profile_audit_log'::regclass
      AND tgname='member_profile_audit_append_only' AND tgenabled='O'
  ) THEN
    RAISE EXCEPTION 'APPLICATION_IGNORE_HISTORY_APPEND_ONLY_GUARD_MISSING';
  END IF;
  FOREACH signature IN ARRAY ARRAY[
    'pending_application_lock_candidate(uuid)',
    'pending_application_erase_anonymized()'
  ] LOOP
    IF has_function_privilege('anon','private.'||signature,'EXECUTE')
      OR has_function_privilege('authenticated','private.'||signature,'EXECUTE')
      OR has_function_privilege('service_role','private.'||signature,'EXECUTE')
      OR NOT EXISTS (SELECT 1 FROM pg_proc
        WHERE oid=('private.'||signature)::regprocedure AND prosecdef
          AND proconfig @> ARRAY['search_path=""']::text[]) THEN
      RAISE EXCEPTION 'APPLICATION_IGNORE_INTERNAL_HELPER_SECURITY_INVALID: %',signature;
    END IF;
  END LOOP;
  definition:=pg_get_functiondef('private.pending_application_lock_candidate(uuid)'::regprocedure);
  IF position('FOR UPDATE' IN definition)=0 OR position('anonymized_at' IN definition)=0 THEN
    RAISE EXCEPTION 'APPLICATION_IGNORE_CANDIDATE_LOCK_OR_PRIVACY_GUARD_MISSING';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.members'::regclass AND tgname='pending_application_erase_anonymized'
      AND tgfoid='private.pending_application_erase_anonymized()'::regprocedure AND tgenabled='O') THEN
    RAISE EXCEPTION 'APPLICATION_IGNORE_PRIVACY_CLEANUP_MISSING';
  END IF;
END;
$audit$;
SELECT count(*) AS stored_ignore_states,
  count(*) FILTER (WHERE m.record_scope='current' AND m.account_status='active'
    AND m.status='pending' AND m.profile_stage IN ('submitted','complete')
    AND m.onboarding_step=4 AND m.anonymized_at IS NULL) AS currently_ignored_applicants
FROM public.member_application_ignores i JOIN public.members m ON m.id=i.member_id;
COMMIT;
