-- Cancellation preserves the member's answers and audit history.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

ALTER TABLE public.match_round_submissions ADD COLUMN cancelled_at timestamptz;

CREATE OR REPLACE FUNCTION private.guard_registration_cancellation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_round public.match_rounds%ROWTYPE;
  v_privileged boolean := COALESCE((SELECT auth.jwt()->>'role'), '') = 'service_role'
    OR (private.member_master_is_super_admin()
      AND COALESCE(current_setting('app.member_master_submission_self_service', true), '') <> 'on');
BEGIN
  -- Trigger privileges permit locking a readable round without granting players admin UPDATE rights.
  SELECT * INTO v_round FROM public.match_rounds WHERE id = NEW.round_id FOR SHARE;
  IF v_round.purpose = 'registration' AND NOT v_privileged AND (
    v_round.status <> 'open' OR clock_timestamp() < v_round.survey_start OR clock_timestamp() >= v_round.survey_end
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'REGISTRATION_CANCEL_UNAVAILABLE';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.cancelled_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REGISTRATION_STATE_CHANGED';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.cancelled_at IS NULL AND OLD.cancelled_at IS NULL THEN RETURN NEW; END IF;
  IF v_round.purpose IS DISTINCT FROM 'registration' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REGISTRATION_CANCEL_UNAVAILABLE';
  END IF;
  -- Privacy erasure and audited administrative maintenance keep the state unchanged.
  IF v_privileged AND NEW.cancelled_at IS NOT DISTINCT FROM OLD.cancelled_at THEN RETURN NEW; END IF;
  IF NEW.member_id IS DISTINCT FROM private.profile_current_approved_member_id() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'REGISTRATION_NOT_FOUND';
  END IF;
  IF OLD.cancelled_at IS NULL THEN
    IF current_setting('app.registration_transition', true) IS DISTINCT FROM OLD.id::text || ':cancel'
      OR (to_jsonb(NEW) - ARRAY['cancelled_at', 'config_revision', 'audit_reason'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['cancelled_at', 'config_revision', 'audit_reason']) THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'REGISTRATION_STATE_CHANGED';
    END IF;
    NEW.cancelled_at := now();
  ELSIF NEW.cancelled_at IS NOT NULL
    OR current_setting('app.registration_transition', true) IS DISTINCT FROM OLD.id::text || ':rejoin' THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'REGISTRATION_STATE_CHANGED';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.guard_registration_cancellation() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER member_master_guard_registration_cancellation
  BEFORE INSERT OR UPDATE ON public.match_round_submissions
  FOR EACH ROW EXECUTE FUNCTION private.guard_registration_cancellation();

-- Ordinary administrators may see lifecycle state without receiving private answers.
DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.admin_get_member_360(uuid)'::regprocedure);
  original text := $fragment$'updated_at', submission.updated_at,
            'redacted', true$fragment$;
BEGIN
  IF position(original IN definition) = 0 THEN RAISE EXCEPTION 'REGISTRATION_MEMBER_360_BASELINE_MISMATCH'; END IF;
  EXECUTE replace(definition, original, $fragment$'updated_at', submission.updated_at,
            'cancelled_at', submission.cancelled_at,
            'redacted', true$fragment$);
END;
$migration$;
COMMIT;
