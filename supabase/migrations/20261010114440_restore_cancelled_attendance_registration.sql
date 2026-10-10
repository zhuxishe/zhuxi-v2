-- Explicit administrator attendance confirmation may restore a cancelled
-- fixed-event registration. Player cancellation and review eligibility stay strict.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

CREATE FUNCTION private.peer_roster_registration_restore_eligible(p_round_id uuid,p_member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE id=private.member_master_current_admin_id() AND role IN ('admin','super_admin'))
    AND NOT EXISTS (SELECT 1 FROM public.members WHERE user_id=(SELECT auth.uid())
      AND (account_status IS DISTINCT FROM 'active' OR anonymized_at IS NOT NULL))
    AND EXISTS (SELECT 1 FROM public.match_rounds WHERE id=p_round_id AND purpose='registration' AND deleted_at IS NULL)
    AND EXISTS (SELECT 1 FROM public.members WHERE id=p_member_id AND account_status='active'
      AND status='approved' AND membership_type='player' AND anonymized_at IS NULL AND user_id IS NOT NULL)
    AND EXISTS (SELECT 1 FROM public.match_round_submissions WHERE round_id=p_round_id AND member_id=p_member_id AND cancelled_at IS NOT NULL)
$function$;
REVOKE ALL ON FUNCTION private.peer_roster_registration_restore_eligible(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.round_roster_restore_authorized(p_round_id uuid,p_member_id uuid,p_submission_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT current_setting('app.round_roster_restore',true) = p_submission_id::text
    AND private.peer_roster_registration_restore_eligible(p_round_id,p_member_id)
    AND EXISTS (SELECT 1 FROM public.match_round_submissions WHERE id=p_submission_id AND round_id=p_round_id AND member_id=p_member_id)
    AND EXISTS (SELECT 1 FROM private.round_peer_review_participants WHERE round_id=p_round_id AND member_id=p_member_id AND included)
$function$;
REVOKE ALL ON FUNCTION private.round_roster_restore_authorized(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.restore_round_roster_registration(p_round_id uuid,p_member_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE
  v_submission public.match_round_submissions%ROWTYPE;
  v_previous_restore text := COALESCE(current_setting('app.round_roster_restore',true),'');
  v_previous_self_service text := COALESCE(current_setting('app.member_master_submission_self_service',true),'');
  v_previous_reason text := COALESCE(current_setting('app.member_master_audit_reason',true),'');
BEGIN
  SELECT * INTO v_submission FROM public.match_round_submissions
    WHERE round_id=p_round_id AND member_id=p_member_id FOR UPDATE;
  IF NOT FOUND OR v_submission.cancelled_at IS NULL THEN RETURN; END IF;
  PERFORM private.peer_require_reason(p_reason);
  PERFORM set_config('app.round_roster_restore',v_submission.id::text,true);
  IF NOT COALESCE(private.round_roster_restore_authorized(p_round_id,p_member_id,v_submission.id),false) THEN
    RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.member_master_submission_self_service','off',true);
  PERFORM set_config('app.member_master_audit_reason',btrim(p_reason),true);
  -- Keep the original registration and its answers; do not reinsert it or
  -- resend its receipt. Existing operational triggers retain the audit trail.
  UPDATE public.match_round_submissions SET cancelled_at=NULL,
    config_revision=(SELECT config_revision FROM public.match_rounds WHERE id=p_round_id),
    audit_reason=btrim(p_reason)
    WHERE id=v_submission.id;
  INSERT INTO private.round_peer_review_audit(round_id,action,subject_id,actor_admin_id,reason,before_values,after_values)
    VALUES(p_round_id,'registration_restored',p_member_id,private.member_master_current_admin_id(),btrim(p_reason),
      jsonb_build_object('cancelled_at',v_submission.cancelled_at),jsonb_build_object('cancelled_at',NULL));
  PERFORM set_config('app.round_roster_restore',v_previous_restore,true);
  PERFORM set_config('app.member_master_submission_self_service',v_previous_self_service,true);
  PERFORM set_config('app.member_master_audit_reason',v_previous_reason,true);
END;
$function$;
REVOKE ALL ON FUNCTION private.restore_round_roster_registration(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

-- Narrow baseline-checked edits retain lifecycle, soft-delete, version and
-- ordinary self-service guards installed by the preceding migrations.
DO $migration$
DECLARE definition text; original text; replacement text;
BEGIN
  definition := pg_get_functiondef('private.guard_registration_cancellation()'::regprocedure);
  original := $fragment$  -- Trigger privileges permit locking a readable round without granting players admin UPDATE rights.$fragment$;
  replacement := $fragment$  IF TG_OP = 'UPDATE' AND COALESCE(private.round_roster_restore_authorized(OLD.round_id,OLD.member_id,OLD.id),false) THEN
    IF OLD.cancelled_at IS NULL OR NEW.cancelled_at IS NOT NULL
      OR (to_jsonb(NEW) - ARRAY['cancelled_at','config_revision','audit_reason'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['cancelled_at','config_revision','audit_reason']) THEN
      RAISE EXCEPTION 'REGISTRATION_STATE_CHANGED' USING ERRCODE='40001';
    END IF;
    RETURN NEW;
  END IF;
  -- Trigger privileges permit locking a readable round without granting players admin UPDATE rights.$fragment$;
  IF position(original IN definition)=0 OR position('private.round_roster_signup_authorized' IN definition)=0 THEN
    RAISE EXCEPTION 'ROSTER_RESTORE_CANCELLATION_BASELINE_MISMATCH';
  END IF;
  EXECUTE replace(definition,original,replacement);

  definition := pg_get_functiondef('private.member_master_guard_round_submission_write()'::regprocedure);
  original := $fragment$  v_roster_signup boolean := TG_OP = 'INSERT' AND private.round_roster_signup_authorized(NEW.round_id,NEW.member_id);$fragment$;
  replacement := $fragment$  v_roster_signup boolean := TG_OP = 'INSERT' AND private.round_roster_signup_authorized(NEW.round_id,NEW.member_id);
  v_roster_restore boolean := CASE WHEN TG_OP = 'UPDATE' THEN private.round_roster_restore_authorized(OLD.round_id,OLD.member_id,OLD.id) ELSE false END;$fragment$;
  IF position(original IN definition)=0 OR position('v_round.deleted_at IS NOT NULL' IN definition)=0 THEN
    RAISE EXCEPTION 'ROSTER_RESTORE_SUBMISSION_BASELINE_MISMATCH';
  END IF;
  definition := replace(definition,original,replacement);
  original := $fragment$  v_is_privileged := v_is_privileged OR COALESCE(v_roster_signup,false);$fragment$;
  replacement := $fragment$  v_is_privileged := v_is_privileged OR COALESCE(v_roster_signup,false) OR COALESCE(v_roster_restore,false);$fragment$;
  IF position(original IN definition)=0 THEN RAISE EXCEPTION 'ROSTER_RESTORE_SUBMISSION_BASELINE_MISMATCH'; END IF;
  definition := replace(definition,original,replacement);
  original := $fragment$  ELSIF TG_OP = 'UPDATE' AND v_round.purpose = 'registration'
    AND OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL$fragment$;
  replacement := $fragment$  ELSIF v_roster_restore AND NEW.custom_answers IS NOT DISTINCT FROM OLD.custom_answers THEN
    -- Restoring attendance must not invent or require answers from a player.
    -- The cancellation guard checks that only the cancellation state changes.
    NULL;
  ELSIF TG_OP = 'UPDATE' AND v_round.purpose = 'registration'
    AND OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL$fragment$;
  IF position(original IN definition)=0 THEN RAISE EXCEPTION 'ROSTER_RESTORE_ANSWERS_BASELINE_MISMATCH'; END IF;
  EXECUTE replace(definition,original,replacement);

  definition := pg_get_functiondef('public.admin_confirm_round_peer_review_roster(uuid,uuid[],integer,text)'::regprocedure);
  original := $fragment$  PERFORM 1 FROM public.match_round_submissions WHERE round_id=p_round_id AND member_id=ANY(p_member_ids) ORDER BY member_id FOR SHARE;$fragment$;
  replacement := $fragment$  -- Lock existing registrations for possible restoration before taking the
  -- settings lock, so review/cancellation transactions cannot invert that order.
  PERFORM 1 FROM public.match_round_submissions WHERE round_id=p_round_id AND member_id=ANY(p_member_ids) ORDER BY member_id FOR UPDATE;$fragment$;
  IF position(original IN definition)=0 THEN RAISE EXCEPTION 'ROSTER_RESTORE_LOCK_BASELINE_MISMATCH'; END IF;
  definition := replace(definition,original,replacement);
  original := $fragment$  IF EXISTS(SELECT 1 FROM unnest(p_member_ids) x WHERE NOT private.peer_member_eligible(p_round_id,x)) THEN$fragment$;
  replacement := $fragment$  IF EXISTS(SELECT 1 FROM unnest(p_member_ids) x WHERE NOT private.peer_member_eligible(p_round_id,x)
    AND NOT private.peer_roster_registration_restore_eligible(p_round_id,x)) THEN$fragment$;
  IF position(original IN definition)=0 THEN RAISE EXCEPTION 'ROSTER_RESTORE_ELIGIBILITY_BASELINE_MISMATCH'; END IF;
  definition := replace(definition,original,replacement);
  original := $fragment$      PERFORM private.insert_round_roster_registration(p_round_id,v_member,p_reason,true);$fragment$;
  replacement := $fragment$      PERFORM private.restore_round_roster_registration(p_round_id,v_member,p_reason);
      PERFORM private.insert_round_roster_registration(p_round_id,v_member,p_reason,true);$fragment$;
  IF position(original IN definition)=0 THEN RAISE EXCEPTION 'ROSTER_RESTORE_CONFIRM_BASELINE_MISMATCH'; END IF;
  EXECUTE replace(definition,original,replacement);

  -- This extra flag belongs only to the authenticated administrator view.
  -- Do not change player eligibility or add cancelled users to the candidate
  -- list: a first-time supplement still uses the existing member search.
  definition := pg_get_functiondef('public.admin_get_round_peer_reviews(uuid)'::regprocedure);
  original := $fragment$'eligible',private.peer_participant_eligible(p_round_id,p.member_id))$fragment$;
  replacement := $fragment$'eligible',private.peer_participant_eligible(p_round_id,p.member_id),
    'can_restore',private.peer_roster_registration_restore_eligible(p_round_id,p.member_id))$fragment$;
  IF position(original IN definition)=0 THEN RAISE EXCEPTION 'ROSTER_RESTORE_PARTICIPANTS_BASELINE_MISMATCH'; END IF;
  definition := replace(definition,original,replacement);
  original := $fragment$'eligible',private.peer_member_eligible(p_round_id,c.member_id))$fragment$;
  replacement := $fragment$'eligible',private.peer_member_eligible(p_round_id,c.member_id),
    'can_restore',private.peer_roster_registration_restore_eligible(p_round_id,c.member_id))$fragment$;
  IF position(original IN definition)=0 THEN RAISE EXCEPTION 'ROSTER_RESTORE_CANDIDATES_BASELINE_MISMATCH'; END IF;
  EXECUTE replace(definition,original,replacement);
END;
$migration$;

NOTIFY pgrst, 'reload schema';
COMMIT;
