-- Content Management V2 audits changes caused by foreign-key cascades.  When
-- an administrator is deleted, player_activity_settings.updated_by is cleared
-- by ON DELETE SET NULL in the same transaction.  Supply the already-validated
-- human reason to that trigger without weakening the original delete RPC.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration', 0));

-- Fail closed if the installed member-master or Content V2 contract differs
-- from the exact compatibility boundary this forward migration was written
-- for.  In particular, do not replace a drifted privileged RPC.
DO $preflight$
DECLARE
  v_rpc regprocedure := to_regprocedure(
    'public.admin_delete_admin_user(uuid,text)'
  );
  v_definition text;
BEGIN
  IF to_regclass('public.admin_users') IS NULL
     OR to_regclass('public.player_activity_settings') IS NULL
     OR to_regclass('private.admin_user_audit_log') IS NULL
     OR to_regprocedure('private.member_master_current_admin_id()') IS NULL
     OR to_regprocedure('private.member_master_is_super_admin()') IS NULL
     OR to_regprocedure(
       'private.content_management_v2_audit_change()'
     ) IS NULL
     OR v_rpc IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ADMIN_DELETE_CONTENT_V2_PREFLIGHT_DEPENDENCY_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_info
    JOIN pg_attribute AS column_info
      ON column_info.attrelid = constraint_info.conrelid
      AND column_info.attnum = ANY(constraint_info.conkey)
    WHERE constraint_info.contype = 'f'
      AND constraint_info.conrelid =
        'public.player_activity_settings'::regclass
      AND constraint_info.confrelid = 'public.admin_users'::regclass
      AND constraint_info.confdeltype = 'n'
      AND cardinality(constraint_info.conkey) = 1
      AND column_info.attname = 'updated_by'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ADMIN_DELETE_CONTENT_V2_PREFLIGHT_FK_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_info
    JOIN pg_proc AS trigger_function
      ON trigger_function.oid = trigger_info.tgfoid
    JOIN pg_namespace AS function_schema
      ON function_schema.oid = trigger_function.pronamespace
    WHERE trigger_info.tgrelid =
        'public.player_activity_settings'::regclass
      AND trigger_info.tgname = 'content_v2_10_audit_change'
      AND NOT trigger_info.tgisinternal
      AND trigger_info.tgenabled IN ('O', 'A')
      -- ROW(1) + BEFORE(2) + INSERT(4) + DELETE(8) + UPDATE(16).
      AND trigger_info.tgtype = 31
      AND function_schema.nspname = 'private'
      AND trigger_function.proname = 'content_management_v2_audit_change'
      AND trigger_function.pronargs = 0
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ADMIN_DELETE_CONTENT_V2_PREFLIGHT_TRIGGER_INVALID';
  END IF;

  SELECT pg_get_functiondef(v_rpc)
  INTO v_definition;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc AS function_info
    WHERE function_info.oid = v_rpc
      AND function_info.prokind = 'f'
      AND function_info.prorettype = 'jsonb'::regtype
      AND function_info.provolatile = 'v'
      AND function_info.prosecdef
  )
  OR v_definition NOT ILIKE '%SET search_path TO ''''%'
  OR v_definition NOT LIKE '%private.member_master_current_admin_id()%'
  OR v_definition NOT LIKE '%private.member_master_is_super_admin()%'
  OR v_definition NOT LIKE '%MEMBER_MASTER_SUPER_ADMIN_REQUIRED%'
  OR v_definition NOT LIKE '%MEMBER_MASTER_ADMIN_USER_PAYLOAD_INVALID%'
  OR v_definition NOT LIKE '%MEMBER_MASTER_REASON_INVALID%'
  OR v_definition NOT LIKE '%pg_advisory_xact_lock%'
  OR v_definition NOT LIKE '%FOR UPDATE%'
  OR v_definition NOT LIKE '%MEMBER_MASTER_ADMIN_USER_NOT_FOUND%'
  OR v_definition NOT LIKE '%MEMBER_MASTER_ADMIN_SELF_DELETE_BLOCKED%'
  OR v_definition NOT LIKE '%MEMBER_MASTER_LAST_SUPER_ADMIN_REQUIRED%'
  OR v_definition NOT LIKE '%INSERT INTO private.admin_user_audit_log%'
  OR v_definition NOT LIKE '%DELETE FROM public.admin_users%'
  OR v_definition NOT LIKE '%''admin_user_deleted''%'
  OR v_definition NOT LIKE '%''audit_event_id'', v_audit_id%'
  OR v_definition NOT LIKE '%''deleted'', true%' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ADMIN_DELETE_CONTENT_V2_PREFLIGHT_RPC_INVALID';
  END IF;

  IF NOT has_function_privilege(
       'authenticated', v_rpc, 'EXECUTE'
     )
     OR has_function_privilege('anon', v_rpc, 'EXECUTE')
     OR has_function_privilege('service_role', v_rpc, 'EXECUTE') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ADMIN_DELETE_CONTENT_V2_PREFLIGHT_ACL_INVALID';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.admin_delete_admin_user(
  p_admin_user_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := private.member_master_current_admin_id();
  v_actor_name text;
  v_before public.admin_users%ROWTYPE;
  v_audit_id bigint;
BEGIN
  IF v_actor_id IS NULL OR NOT private.member_master_is_super_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_SUPER_ADMIN_REQUIRED';
  END IF;
  IF p_admin_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_ADMIN_USER_PAYLOAD_INVALID';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL
     OR char_length(btrim(p_reason)) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_REASON_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('member-master:admin-users', 0));
  SELECT administrator.* INTO v_before
  FROM public.admin_users AS administrator
  WHERE administrator.id = p_admin_user_id
  FOR UPDATE;
  IF v_before.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_ADMIN_USER_NOT_FOUND';
  END IF;
  IF p_admin_user_id = v_actor_id THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MEMBER_MASTER_ADMIN_SELF_DELETE_BLOCKED';
  END IF;
  IF v_before.role = 'super_admin'
     AND NOT EXISTS (
       SELECT 1 FROM public.admin_users AS other_admin
       WHERE other_admin.role = 'super_admin'
         AND other_admin.id <> p_admin_user_id
         AND other_admin.user_id IS NOT NULL
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MEMBER_MASTER_LAST_SUPER_ADMIN_REQUIRED';
  END IF;

  SELECT administrator.name INTO v_actor_name
  FROM public.admin_users AS administrator WHERE administrator.id = v_actor_id;
  INSERT INTO private.admin_user_audit_log (
    admin_user_id_snapshot, action_type, changed_fields,
    before_values, after_values, reason,
    actor_admin_id_snapshot, actor_user_id_snapshot,
    actor_name_snapshot, actor_role_snapshot
  ) VALUES (
    p_admin_user_id, 'admin_user_deleted', ARRAY['record_exists']::text[],
    to_jsonb(v_before) || jsonb_build_object('record_exists', true),
    jsonb_build_object('record_exists', false),
    btrim(p_reason), v_actor_id, (SELECT auth.uid()),
    v_actor_name, 'super_admin'
  ) RETURNING id INTO v_audit_id;

  -- The FK's SET NULL update is audited by Content V2.  This value is scoped
  -- to the current transaction and is set only after all delete validations.
  PERFORM set_config('app.content_v2_audit_reason', btrim(p_reason), true);

  DELETE FROM public.admin_users AS administrator
  WHERE administrator.id = p_admin_user_id;

  RETURN jsonb_build_object(
    'admin_user_id', p_admin_user_id,
    'audit_event_id', v_audit_id,
    'deleted', true
  );
END
$function$;

-- CREATE OR REPLACE preserves function ACL, but restate the intended boundary
-- so a future default-privilege change cannot widen this public-schema RPC.
REVOKE ALL ON FUNCTION public.admin_delete_admin_user(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_admin_user(uuid, text)
  TO authenticated;

DO $postflight$
DECLARE
  v_rpc regprocedure := to_regprocedure(
    'public.admin_delete_admin_user(uuid,text)'
  );
  v_definition text;
  v_reason_guard_position integer;
  v_audit_position integer;
  v_set_reason_position integer;
  v_delete_position integer;
  v_set_reason_marker constant text :=
    'PERFORM set_config(''app.content_v2_audit_reason'', btrim(p_reason), true)';
  v_set_reason_count integer;
BEGIN
  IF v_rpc IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ADMIN_DELETE_CONTENT_V2_POSTFLIGHT_RPC_MISSING';
  END IF;

  SELECT pg_get_functiondef(v_rpc)
  INTO v_definition;

  v_reason_guard_position := strpos(
    v_definition,
    'IF NULLIF(btrim(p_reason), '''') IS NULL'
  );
  v_audit_position := strpos(
    v_definition,
    'INSERT INTO private.admin_user_audit_log'
  );
  v_set_reason_position := strpos(v_definition, v_set_reason_marker);
  v_delete_position := strpos(
    v_definition,
    'DELETE FROM public.admin_users'
  );
  v_set_reason_count := (
    char_length(v_definition)
    - char_length(replace(v_definition, v_set_reason_marker, ''))
  ) / char_length(v_set_reason_marker);

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc AS function_info
    WHERE function_info.oid = v_rpc
      AND function_info.prokind = 'f'
      AND function_info.prorettype = 'jsonb'::regtype
      AND function_info.provolatile = 'v'
      AND function_info.prosecdef
  )
  OR v_definition NOT ILIKE '%SET search_path TO ''''%'
  OR v_definition NOT LIKE '%private.member_master_current_admin_id()%'
  OR v_definition NOT LIKE '%private.member_master_is_super_admin()%'
  OR v_definition NOT LIKE '%MEMBER_MASTER_SUPER_ADMIN_REQUIRED%'
  OR v_definition NOT LIKE '%MEMBER_MASTER_ADMIN_USER_PAYLOAD_INVALID%'
  OR v_definition NOT LIKE '%MEMBER_MASTER_REASON_INVALID%'
  OR v_definition NOT LIKE '%pg_advisory_xact_lock%'
  OR v_definition NOT LIKE '%FOR UPDATE%'
  OR v_definition NOT LIKE '%MEMBER_MASTER_ADMIN_USER_NOT_FOUND%'
  OR v_definition NOT LIKE '%MEMBER_MASTER_ADMIN_SELF_DELETE_BLOCKED%'
  OR v_definition NOT LIKE '%MEMBER_MASTER_LAST_SUPER_ADMIN_REQUIRED%'
  OR v_definition NOT LIKE '%''admin_user_deleted''%'
  OR v_definition NOT LIKE '%''audit_event_id'', v_audit_id%'
  OR v_definition NOT LIKE '%''deleted'', true%'
  OR v_reason_guard_position = 0
  OR v_audit_position = 0
  OR v_set_reason_position = 0
  OR v_delete_position = 0
  OR v_set_reason_count <> 1
  OR NOT (
    v_reason_guard_position < v_audit_position
    AND v_audit_position < v_set_reason_position
    AND v_set_reason_position < v_delete_position
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ADMIN_DELETE_CONTENT_V2_POSTFLIGHT_RPC_INVALID';
  END IF;

  IF NOT has_function_privilege(
       'authenticated', v_rpc, 'EXECUTE'
     )
     OR has_function_privilege('anon', v_rpc, 'EXECUTE')
     OR has_function_privilege('service_role', v_rpc, 'EXECUTE') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ADMIN_DELETE_CONTENT_V2_POSTFLIGHT_ACL_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_info
    JOIN pg_proc AS trigger_function
      ON trigger_function.oid = trigger_info.tgfoid
    JOIN pg_namespace AS function_schema
      ON function_schema.oid = trigger_function.pronamespace
    WHERE trigger_info.tgrelid =
        'public.player_activity_settings'::regclass
      AND trigger_info.tgname = 'content_v2_10_audit_change'
      AND NOT trigger_info.tgisinternal
      AND trigger_info.tgenabled IN ('O', 'A')
      AND trigger_info.tgtype = 31
      AND function_schema.nspname = 'private'
      AND trigger_function.proname = 'content_management_v2_audit_change'
      AND trigger_function.pronargs = 0
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ADMIN_DELETE_CONTENT_V2_POSTFLIGHT_TRIGGER_INVALID';
  END IF;
END
$postflight$;

COMMIT;
