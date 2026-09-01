-- Player and community read RPCs are intentionally STABLE. PostgREST runs
-- those functions in read-only transactions, where SELECT ... FOR KEY SHARE
-- is rejected with SQLSTATE 25006. Keep the anonymization race closed with a
-- shared advisory transaction lock on the same auth-user key that
-- ensure_my_member_record and admin_anonymize_member acquire exclusively.
-- Advisory locks are valid in read-only transactions, and the second lookup
-- happens only after the lock has been acquired.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

CREATE OR REPLACE FUNCTION private.profile_current_approved_member_id()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_member_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock_shared(
    hashtextextended('member:' || v_user_id::text, 0)
  );

  SELECT member.id INTO v_member_id
  FROM public.members AS member
  WHERE member.user_id = v_user_id
    AND member.status = 'approved'
    AND member.account_status = 'active'
    AND member.anonymized_at IS NULL
  LIMIT 1;

  RETURN v_member_id;
END
$function$;

CREATE OR REPLACE FUNCTION private.community_approved_member_id()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_member_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock_shared(
    hashtextextended('member:' || v_user_id::text, 0)
  );

  SELECT member.id INTO v_member_id
  FROM public.members AS member
  WHERE member.user_id = v_user_id
    AND member.status = 'approved'
    AND member.account_status = 'active'
    AND member.anonymized_at IS NULL
  LIMIT 1;

  RETURN v_member_id;
END
$function$;

COMMIT;
