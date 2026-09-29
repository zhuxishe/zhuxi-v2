-- Explicit operations and optimistic version checks keep stale forms from undoing cancellation.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

CREATE OR REPLACE FUNCTION public.manage_my_registration(
  p_round_id uuid, p_operation text, p_expected_updated_at timestamptz DEFAULT NULL,
  p_config_revision integer DEFAULT NULL, p_custom_answers jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_member_id uuid;
  v_round public.match_rounds%ROWTYPE;
  v_submission public.match_round_submissions%ROWTYPE;
  v_exists boolean;
  v_previous_self_service text := COALESCE(current_setting('app.member_master_submission_self_service', true), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'REGISTRATION_NOT_FOUND';
  END IF;
  IF p_operation IS NULL OR p_operation NOT IN ('create', 'update', 'rejoin', 'cancel') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REGISTRATION_OPERATION_INVALID';
  END IF;
  -- Lock identity before own submission; the write guards lock and recheck the round.
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('member:' || v_user_id::text, 0));
  SELECT id INTO v_member_id FROM public.members
    WHERE user_id = v_user_id AND status = 'approved' AND account_status = 'active' AND anonymized_at IS NULL;
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'REGISTRATION_NOT_FOUND';
  END IF;
  SELECT * INTO v_round FROM public.match_rounds WHERE id = p_round_id;
  IF NOT FOUND OR v_round.purpose <> 'registration' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REGISTRATION_CANCEL_UNAVAILABLE';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('registration:' || p_round_id::text || ':' || v_member_id::text, 0));
  SELECT * INTO v_submission FROM public.match_round_submissions
    WHERE round_id = p_round_id AND member_id = v_member_id FOR UPDATE;
  v_exists := FOUND;
  IF v_round.status <> 'open' OR clock_timestamp() < v_round.survey_start OR clock_timestamp() >= v_round.survey_end THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'REGISTRATION_CANCEL_UNAVAILABLE';
  END IF;
  IF p_operation = 'create' THEN
    IF v_exists THEN RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'REGISTRATION_STATE_CHANGED'; END IF;
  ELSE
    IF NOT v_exists THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REGISTRATION_NOT_FOUND'; END IF;
    IF p_operation = 'cancel' AND v_submission.cancelled_at IS NOT NULL THEN
      RETURN jsonb_build_object('id', v_submission.id, 'cancelled_at', v_submission.cancelled_at);
    END IF;
    IF p_expected_updated_at IS DISTINCT FROM v_submission.updated_at
      OR (p_operation = 'update' AND v_submission.cancelled_at IS NOT NULL)
      OR (p_operation = 'rejoin' AND v_submission.cancelled_at IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'REGISTRATION_STATE_CHANGED';
    END IF;
  END IF;
  IF p_operation <> 'cancel' AND p_config_revision IS DISTINCT FROM v_round.config_revision THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'ROUND_CONFIG_CHANGED';
  END IF;
  -- Even an administrator using their own player account follows the player window.
  PERFORM set_config('app.member_master_submission_self_service', 'on', true);
  IF p_operation = 'create' THEN
    INSERT INTO public.match_round_submissions
      (round_id, member_id, game_type_pref, gender_pref, availability, custom_answers, config_revision)
    VALUES (p_round_id, v_member_id, '都可以', '都可以', '{}'::jsonb, p_custom_answers, v_round.config_revision)
    RETURNING * INTO v_submission;
  ELSE
    PERFORM set_config('app.registration_transition', v_submission.id::text || ':' || p_operation, true);
    UPDATE public.match_round_submissions SET
      cancelled_at = CASE WHEN p_operation = 'cancel' THEN now() ELSE NULL END,
      custom_answers = CASE WHEN p_operation = 'cancel' THEN custom_answers ELSE p_custom_answers END,
      config_revision = v_round.config_revision
    WHERE id = v_submission.id RETURNING * INTO v_submission;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'REGISTRATION_STATE_CHANGED'; END IF;
    PERFORM set_config('app.registration_transition', '', true);
  END IF;
  PERFORM set_config('app.member_master_submission_self_service', v_previous_self_service, true);
  RETURN jsonb_build_object('id', v_submission.id, 'updated_at', v_submission.updated_at, 'cancelled_at', v_submission.cancelled_at);
END;
$function$;
REVOKE ALL ON FUNCTION public.manage_my_registration(uuid,text,timestamptz,integer,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manage_my_registration(uuid,text,timestamptz,integer,jsonb) TO authenticated;
COMMIT;
