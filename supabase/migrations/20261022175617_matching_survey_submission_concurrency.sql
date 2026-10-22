-- Matching answer writes compare the exact loaded record/version in PostgreSQL.
-- No questionnaire definitions, member answers or historical records are rewritten.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

-- PostgREST table UPDATE/upsert cannot bypass the compare-and-save RPC. Existing
-- registration writes, server-only imports and owner-run privacy RPCs retain access.
CREATE POLICY matching_submissions_require_compare_and_save
  ON public.match_round_submissions AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.match_rounds r WHERE r.id=round_id AND r.purpose<>'matching'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.match_rounds r WHERE r.id=round_id AND r.purpose<>'matching'));

-- now() is fixed within a transaction. Ensure two matching saves cannot share a
-- token, including historical NULL timestamps and a previously future timestamp.
CREATE FUNCTION private.matching_submission_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF EXISTS(SELECT 1 FROM public.match_rounds r WHERE r.id=NEW.round_id AND r.purpose='matching') THEN
    NEW.updated_at := greatest(clock_timestamp(), OLD.updated_at + interval '1 microsecond');
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.matching_submission_updated_at() FROM PUBLIC,anon,authenticated,service_role;
-- BEFORE triggers run alphabetically; retain the existing guards and old timestamp
-- trigger, then replace only the matching timestamp with a strictly newer token.
CREATE TRIGGER z_matching_submission_updated_at BEFORE UPDATE ON public.match_round_submissions
  FOR EACH ROW EXECUTE FUNCTION private.matching_submission_updated_at();

CREATE FUNCTION private.save_my_matching_submission(
  p_round_id uuid, p_submission_id uuid, p_expected_updated_at timestamptz,
  p_config_revision integer, p_answers jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_member_id uuid;
  v_round public.match_rounds%ROWTYPE;
  v_submission public.match_round_submissions%ROWTYPE;
  v_exists boolean;
  v_previous_self_service text := COALESCE(current_setting('app.member_master_submission_self_service',true),'');
BEGIN
  v_member_id := private.profile_current_approved_member_id();
  IF auth.uid() IS NULL OR v_member_id IS NULL THEN
    RAISE EXCEPTION 'MEMBER_MASTER_SUBMISSION_MEMBER_INVALID' USING ERRCODE='42501';
  END IF;
  -- Lock canonical identity before the answer, as the audit/privacy guards do.
  PERFORM 1 FROM public.members WHERE id=v_member_id AND anonymized_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_MASTER_SUBMISSION_MEMBER_INVALID' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('matching-submission:'||p_round_id::text||':'||v_member_id::text,0));
  SELECT * INTO v_submission FROM public.match_round_submissions
    WHERE round_id=p_round_id AND member_id=v_member_id FOR UPDATE;
  v_exists := FOUND;
  SELECT * INTO v_round FROM public.match_rounds WHERE id=p_round_id FOR SHARE;
  IF NOT FOUND OR v_round.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'ROUND_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_round.purpose<>'matching' THEN RAISE EXCEPTION 'ROUND_SUBMISSION_NOT_ALLOWED' USING ERRCODE='22023'; END IF;
  IF v_round.status<>'open' OR clock_timestamp()<v_round.survey_start OR clock_timestamp()>=v_round.survey_end THEN
    RAISE EXCEPTION 'MEMBER_MASTER_SUBMISSION_ROUND_CLOSED' USING ERRCODE='55000';
  END IF;
  IF p_config_revision IS DISTINCT FROM v_round.config_revision THEN
    RAISE EXCEPTION 'ROUND_CONFIG_CHANGED' USING ERRCODE='40001';
  END IF;
  IF (p_submission_id IS NULL AND (v_exists OR p_expected_updated_at IS NOT NULL))
    OR (p_submission_id IS NOT NULL AND (NOT v_exists OR v_submission.id IS DISTINCT FROM p_submission_id
      OR v_submission.updated_at IS DISTINCT FROM p_expected_updated_at)) THEN
    RAISE EXCEPTION 'MATCHING_SUBMISSION_CHANGED' USING ERRCODE='40001';
  END IF;
  IF jsonb_typeof(p_answers) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'MEMBER_MASTER_SUBMISSION_PAYLOAD_INVALID' USING ERRCODE='22023';
  END IF;
  -- The existing answer/window/config/readiness/audit guards execute for both
  -- branches. An admin using the player UI receives the same player protections.
  PERFORM set_config('app.member_master_submission_self_service','on',true);
  IF NOT v_exists THEN
    INSERT INTO public.match_round_submissions
      (round_id,member_id,game_type_pref,gender_pref,availability,interest_tags,social_style,message,custom_answers,config_revision)
    VALUES(p_round_id,v_member_id,p_answers->>'game_type_pref',p_answers->>'gender_pref',p_answers->'availability',
      ARRAY(SELECT jsonb_array_elements_text(p_answers->'interest_tags')),p_answers->>'social_style',p_answers->>'message',
      COALESCE(p_answers->'custom_answers','{}'::jsonb),p_config_revision)
    RETURNING * INTO v_submission;
  ELSE
    UPDATE public.match_round_submissions SET
      game_type_pref=p_answers->>'game_type_pref',gender_pref=p_answers->>'gender_pref',availability=p_answers->'availability',
      interest_tags=ARRAY(SELECT jsonb_array_elements_text(p_answers->'interest_tags')),
      social_style=p_answers->>'social_style',message=p_answers->>'message',
      custom_answers=COALESCE(p_answers->'custom_answers','{}'::jsonb),config_revision=p_config_revision
    WHERE id=v_submission.id RETURNING * INTO v_submission;
  END IF;
  PERFORM set_config('app.member_master_submission_self_service',v_previous_self_service,true);
  RETURN jsonb_build_object('id',v_submission.id,'updated_at',v_submission.updated_at);
END;
$function$;

CREATE FUNCTION public.save_my_matching_submission(
  p_round_id uuid, p_submission_id uuid DEFAULT NULL, p_expected_updated_at timestamptz DEFAULT NULL,
  p_config_revision integer DEFAULT NULL, p_answers jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  SELECT private.save_my_matching_submission(p_round_id,p_submission_id,p_expected_updated_at,p_config_revision,p_answers)
$function$;

CREATE FUNCTION private.admin_update_matching_submission(
  p_submission_id uuid, p_expected_updated_at timestamptz, p_answers jsonb, p_reason text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_submission public.match_round_submissions%ROWTYPE;
  v_round public.match_rounds%ROWTYPE;
  v_member_id uuid;
  v_round_id uuid;
  v_member_user_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT private.member_master_is_super_admin() THEN
    RAISE EXCEPTION 'MEMBER_MASTER_SUPER_ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION 'MEMBER_MASTER_OPERATION_REASON_REQUIRED' USING ERRCODE='22023';
  END IF;
  SELECT member_id,round_id INTO v_member_id,v_round_id FROM public.match_round_submissions WHERE id=p_submission_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MATCHING_SUBMISSION_CHANGED' USING ERRCODE='40001'; END IF;
  SELECT user_id INTO v_member_user_id FROM public.members WHERE id=v_member_id;
  IF v_member_user_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock_shared(hashtextextended('member:'||v_member_user_id::text,0));
  END IF;
  PERFORM 1 FROM public.members WHERE id=v_member_id AND anonymized_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_MASTER_ANONYMIZED_RECORD_LOCKED' USING ERRCODE='55000'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('matching-submission:'||v_round_id::text||':'||v_member_id::text,0));
  SELECT * INTO v_submission FROM public.match_round_submissions WHERE id=p_submission_id FOR UPDATE;
  IF NOT FOUND OR v_submission.member_id IS DISTINCT FROM v_member_id OR v_submission.round_id IS DISTINCT FROM v_round_id
    OR v_submission.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'MATCHING_SUBMISSION_CHANGED' USING ERRCODE='40001';
  END IF;
  SELECT * INTO v_round FROM public.match_rounds WHERE id=v_round_id FOR SHARE;
  IF NOT FOUND OR v_round.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'ROUND_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_round.purpose<>'matching' THEN RAISE EXCEPTION 'ROUND_SUBMISSION_NOT_ALLOWED' USING ERRCODE='22023'; END IF;
  IF v_round.status='matched' THEN RAISE EXCEPTION 'ROUND_ALREADY_MATCHED' USING ERRCODE='55000'; END IF;
  IF jsonb_typeof(p_answers) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'MEMBER_MASTER_SUBMISSION_PAYLOAD_INVALID' USING ERRCODE='22023';
  END IF;
  -- The admin editor still changes only its existing fields. Custom answers,
  -- ownership, import metadata, completion and all question definitions stay intact.
  UPDATE public.match_round_submissions SET
    game_type_pref=p_answers->>'game_type_pref',gender_pref=p_answers->>'gender_pref',availability=p_answers->'availability',
    interest_tags=ARRAY(SELECT jsonb_array_elements_text(p_answers->'interest_tags')),
    social_style=p_answers->>'social_style',message=p_answers->>'message',audit_reason=btrim(p_reason)
  WHERE id=p_submission_id RETURNING * INTO v_submission;
  RETURN jsonb_build_object('id',v_submission.id,'updated_at',v_submission.updated_at);
END;
$function$;

CREATE FUNCTION public.admin_update_matching_submission(
  p_submission_id uuid, p_expected_updated_at timestamptz, p_answers jsonb, p_reason text
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  SELECT private.admin_update_matching_submission(p_submission_id,p_expected_updated_at,p_answers,p_reason)
$function$;

REVOKE ALL ON FUNCTION private.save_my_matching_submission(uuid,uuid,timestamptz,integer,jsonb),
  public.save_my_matching_submission(uuid,uuid,timestamptz,integer,jsonb),
  private.admin_update_matching_submission(uuid,timestamptz,jsonb,text),
  public.admin_update_matching_submission(uuid,timestamptz,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.save_my_matching_submission(uuid,uuid,timestamptz,integer,jsonb),
  public.save_my_matching_submission(uuid,uuid,timestamptz,integer,jsonb),
  private.admin_update_matching_submission(uuid,timestamptz,jsonb,text),
  public.admin_update_matching_submission(uuid,timestamptz,jsonb,text) TO authenticated;
COMMIT;
