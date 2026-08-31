-- Forward-only normalization for environments where legacy_members retained
-- a historical service_role DELETE grant before the member-master release.
-- The raw legacy source is append/update only and has no hard-delete RPC.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

REVOKE ALL ON TABLE public.legacy_members FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.legacy_members TO service_role;

DO $do$
BEGIN
  IF NOT has_table_privilege(
    'service_role', 'public.legacy_members', 'SELECT'
  ) OR NOT has_table_privilege(
    'service_role', 'public.legacy_members', 'INSERT'
  ) OR NOT has_table_privilege(
    'service_role', 'public.legacy_members', 'UPDATE'
  ) OR has_table_privilege(
    'service_role', 'public.legacy_members', 'DELETE'
  ) OR has_table_privilege(
    'service_role', 'public.legacy_members', 'TRUNCATE'
  ) OR has_table_privilege(
    'service_role', 'public.legacy_members', 'REFERENCES'
  ) OR has_table_privilege(
    'service_role', 'public.legacy_members', 'TRIGGER'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'MEMBER_MASTER_LEGACY_SERVICE_ROLE_ACL_INVALID';
  END IF;
END
$do$;

COMMIT;
