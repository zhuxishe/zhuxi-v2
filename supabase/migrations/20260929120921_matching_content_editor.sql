-- Configure matching, fixed-time registration and notices inside matching management.
-- Existing rounds and answers retain their original matching behavior.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';
ALTER TABLE public.match_rounds
  ADD COLUMN purpose text NOT NULL DEFAULT 'matching'
    CHECK (purpose IN ('matching', 'registration', 'announcement')),
  ADD COLUMN content_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN config_revision integer NOT NULL DEFAULT 0 CHECK (config_revision >= 0);
ALTER TABLE public.match_round_submissions
  ADD COLUMN custom_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN config_revision integer NOT NULL DEFAULT 0 CHECK (config_revision >= 0);

-- Display wording can change; stored answer identities and interpretation cannot.
CREATE OR REPLACE FUNCTION private.round_answer_structure(p_config jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $function$
  SELECT jsonb_build_object(
    'modules', jsonb_build_object(
      'interests', COALESCE(p_config #> '{modules,interests}', 'true'::jsonb),
      'social', COALESCE(p_config #> '{modules,social}', 'true'::jsonb),
      'message', COALESCE(p_config #> '{modules,message}', 'true'::jsonb)),
    'eventStart', COALESCE(p_config ->> 'eventStart', ''),
    'eventEnd', COALESCE(p_config ->> 'eventEnd', ''),
    'questions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', question.value->'id', 'type', question.value->'type',
        'required', COALESCE(question.value->'required', 'false'::jsonb),
        'options', COALESCE((SELECT jsonb_agg(option.value->'id' ORDER BY option.ordinality)
          FROM jsonb_array_elements(COALESCE(question.value->'options','[]'::jsonb))
            WITH ORDINALITY AS option(value, ordinality)), '[]'::jsonb)) ORDER BY question.ordinality)
      FROM jsonb_array_elements(COALESCE(p_config->'questions','[]'::jsonb))
        WITH ORDINALITY AS question(value, ordinality)), '[]'::jsonb));
$function$;

CREATE OR REPLACE FUNCTION private.validate_round_custom_answers(p_config jsonb, p_answers jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE q jsonb; answer jsonb; option_ids jsonb; answer_key text;
BEGIN
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' OR octet_length(p_answers::text) > 50000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_ANSWERS_INVALID';
  END IF;
  FOR answer_key IN SELECT jsonb_object_keys(p_answers) LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_config->'questions','[]'::jsonb)) AS configured_question(value) WHERE configured_question.value->>'id' = answer_key) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_ANSWER_UNKNOWN';
    END IF;
  END LOOP;
  FOR q IN SELECT value FROM jsonb_array_elements(COALESCE(p_config->'questions','[]'::jsonb)) LOOP
    answer := p_answers -> (q->>'id');
    IF answer IS NULL OR answer = 'null'::jsonb OR answer = '""'::jsonb OR answer = '[]'::jsonb THEN
      IF COALESCE((q->>'required')::boolean, false) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_ANSWER_REQUIRED';
      END IF;
      CONTINUE;
    END IF;
    SELECT COALESCE(jsonb_agg(value->>'id'),'[]'::jsonb) INTO option_ids FROM jsonb_array_elements(COALESCE(q->'options','[]'::jsonb));
    IF q->>'type' = 'text' THEN
      IF jsonb_typeof(answer) <> 'string' OR char_length(answer #>> '{}') > 2000
        OR (COALESCE((q->>'required')::boolean, false) AND btrim(answer #>> '{}') = '') THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_ANSWER_INVALID';
      END IF;
    ELSIF q->>'type' = 'single' THEN
      IF jsonb_typeof(answer) <> 'string' OR NOT option_ids ? (answer #>> '{}') THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_ANSWER_INVALID';
      END IF;
    ELSIF q->>'type' = 'multi' THEN
      IF jsonb_typeof(answer) <> 'array' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_ANSWER_INVALID';
      END IF;
      IF jsonb_array_length(answer) > 20 OR jsonb_array_length(answer) <> (SELECT count(DISTINCT value) FROM jsonb_array_elements(answer))
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(answer) a WHERE jsonb_typeof(a) <> 'string' OR NOT option_ids ? (a #>> '{}')) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_ANSWER_INVALID';
      END IF;
    ELSE
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_QUESTION_INVALID';
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION private.guard_round_content_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE q jsonb; event_start timestamptz; event_end timestamptz; changed_structure boolean;
BEGIN
  IF NEW.survey_end <= NEW.survey_start OR NEW.activity_end < NEW.activity_start
    OR jsonb_typeof(NEW.content_config) <> 'object' OR octet_length(NEW.content_config::text) > 100000
    OR jsonb_typeof(COALESCE(NEW.content_config->'questions','[]'::jsonb)) <> 'array'
    OR (NEW.purpose <> 'matching' AND NEW.status = 'matched') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_CONFIG_INVALID';
  END IF;
  IF jsonb_array_length(COALESCE(NEW.content_config->'questions','[]'::jsonb)) > 20 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_CONFIG_INVALID';
  END IF;
  FOR q IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.content_config->'questions','[]'::jsonb)) LOOP
    IF COALESCE(q->>'id','') !~ '^[a-zA-Z0-9_-]{1,64}$'
      OR q->>'id' IN ('__proto__', 'prototype', 'constructor')
      OR COALESCE(q->>'type','') NOT IN ('single','multi','text')
      OR jsonb_typeof(q->'required') IS DISTINCT FROM 'boolean'
      OR COALESCE(btrim(q #>> '{label,zh}'),'') = ''
      OR jsonb_typeof(q->'options') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_CONFIG_INVALID';
    END IF;
    IF (q->>'type' = 'text' AND jsonb_array_length(q->'options') <> 0)
      OR (q->>'type' <> 'text' AND jsonb_array_length(q->'options') NOT BETWEEN 2 AND 20)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(q->'options') o
        WHERE COALESCE(o->>'id','') !~ '^[a-zA-Z0-9_-]{1,64}$' OR o->>'id' IN ('__proto__', 'prototype', 'constructor') OR COALESCE(btrim(o #>> '{label,zh}'),'') = '')
      OR jsonb_array_length(q->'options') <> (SELECT count(DISTINCT o->>'id') FROM jsonb_array_elements(q->'options') o) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_CONFIG_INVALID';
    END IF;
  END LOOP;
  IF jsonb_array_length(COALESCE(NEW.content_config->'questions','[]'::jsonb)) <>
    (SELECT count(DISTINCT configured_question.value->>'id') FROM jsonb_array_elements(COALESCE(NEW.content_config->'questions','[]'::jsonb)) AS configured_question(value)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_CONFIG_INVALID';
  END IF;
  event_start := NULLIF(NEW.content_config->>'eventStart','')::timestamptz;
  event_end := NULLIF(NEW.content_config->>'eventEnd','')::timestamptz;
  IF (event_start IS NULL) <> (event_end IS NULL) OR event_end <= event_start THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_EVENT_TIME_INVALID';
  END IF;
  IF NEW.purpose = 'registration' AND event_start IS NOT NULL AND NEW.survey_end > event_start THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_REGISTRATION_DEADLINE_INVALID';
  END IF;
  IF NEW.purpose = 'registration' AND NEW.status = 'open'
    AND (event_start IS NULL OR event_start <= now() OR COALESCE(btrim(NEW.content_config #>> '{location,zh}'),'') = '') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_EVENT_DETAILS_REQUIRED';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    changed_structure := NEW.purpose IS DISTINCT FROM OLD.purpose
      OR NEW.activity_start IS DISTINCT FROM OLD.activity_start OR NEW.activity_end IS DISTINCT FROM OLD.activity_end
      OR private.round_answer_structure(NEW.content_config) IS DISTINCT FROM private.round_answer_structure(OLD.content_config);
    IF changed_structure AND (OLD.status = 'matched'
      OR EXISTS (SELECT 1 FROM public.match_round_submissions WHERE round_id = OLD.id)
      OR EXISTS (SELECT 1 FROM public.match_sessions WHERE round_id = OLD.id)) THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ROUND_STRUCTURE_LOCKED';
    END IF;
    IF NEW.content_config IS DISTINCT FROM OLD.content_config OR NEW.purpose IS DISTINCT FROM OLD.purpose
      OR NEW.round_name IS DISTINCT FROM OLD.round_name OR NEW.activity_start IS DISTINCT FROM OLD.activity_start
      OR NEW.activity_end IS DISTINCT FROM OLD.activity_end OR NEW.survey_start IS DISTINCT FROM OLD.survey_start
      OR NEW.survey_end IS DISTINCT FROM OLD.survey_end THEN
      NEW.config_revision := OLD.config_revision + 1;
    ELSE NEW.config_revision := OLD.config_revision;
    END IF;
  ELSE NEW.config_revision := 0;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER guard_round_content_write BEFORE INSERT OR UPDATE ON public.match_rounds
  FOR EACH ROW EXECUTE FUNCTION private.guard_round_content_write();

CREATE OR REPLACE FUNCTION private.guard_match_session_round_purpose()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE round_purpose text;
BEGIN
  IF NEW.round_id IS NULL THEN RETURN NEW; END IF;
  SELECT purpose INTO round_purpose FROM public.match_rounds WHERE id = NEW.round_id FOR SHARE;
  IF round_purpose IS DISTINCT FROM 'matching' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_MATCHING_ONLY';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER guard_match_session_round_purpose BEFORE INSERT OR UPDATE OF round_id ON public.match_sessions
  FOR EACH ROW EXECUTE FUNCTION private.guard_match_session_round_purpose();

CREATE OR REPLACE FUNCTION private.member_master_guard_round_submission_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_is_privileged boolean :=
    COALESCE((SELECT auth.jwt()->>'role'), '') = 'service_role'
    OR (
      private.member_master_is_super_admin()
      AND COALESCE(
        current_setting('app.member_master_submission_self_service', true), ''
      ) <> 'on'
    );
  v_round public.match_rounds%ROWTYPE;
  v_current_member_id uuid;
  v_date_entry record;
BEGIN
  SELECT * INTO v_round FROM public.match_rounds WHERE id = NEW.round_id FOR SHARE;
  IF NOT FOUND OR v_round.purpose = 'announcement' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_SUBMISSION_NOT_ALLOWED';
  END IF;
  IF NOT v_is_privileged AND NEW.config_revision IS DISTINCT FROM v_round.config_revision THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'ROUND_CONFIG_CHANGED';
  END IF;
  IF TG_OP = 'UPDATE' AND v_is_privileged
    AND current_setting('app.round_anonymize_member', true) = NEW.member_id::text THEN
    NEW.custom_answers := '{}'::jsonb;
  ELSE
    PERFORM private.validate_round_custom_answers(v_round.content_config, NEW.custom_answers);
  END IF;
  NEW.config_revision := v_round.config_revision;
  IF v_round.purpose = 'registration' AND (
    NEW.availability <> '{}'::jsonb OR NEW.game_type_pref <> '都可以'
    OR NEW.gender_pref <> '都可以' OR cardinality(NEW.interest_tags) > 0
    OR NEW.social_style IS NOT NULL OR NEW.message IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_REGISTRATION_PAYLOAD_INVALID';
  END IF;
  IF NEW.availability IS NULL OR jsonb_typeof(NEW.availability) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_SUBMISSION_PAYLOAD_INVALID';
  END IF;
  IF NEW.game_type_pref NOT IN ('双人', '多人', '都可以')
     OR NEW.gender_pref NOT IN ('男', '女', '都可以')
     OR (SELECT count(*) FROM jsonb_object_keys(NEW.availability)) > 100
     OR NEW.interest_tags IS NULL
     OR cardinality(NEW.interest_tags) > 50
     OR EXISTS (
       SELECT 1 FROM unnest(NEW.interest_tags) AS tag(value)
       WHERE tag.value IS NULL OR char_length(tag.value) > 100
     )
     OR (NEW.social_style IS NOT NULL AND char_length(NEW.social_style) > 100)
     OR (NEW.message IS NOT NULL AND char_length(NEW.message) > 2000) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_SUBMISSION_PAYLOAD_INVALID';
  END IF;

  FOR v_date_entry IN SELECT entry.key, entry.value FROM jsonb_each(NEW.availability) AS entry
  LOOP
    IF v_date_entry.key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       OR jsonb_typeof(v_date_entry.value) <> 'array'
       OR jsonb_array_length(v_date_entry.value) NOT BETWEEN 1 AND 3
       OR jsonb_array_length(v_date_entry.value) <> (
         SELECT count(DISTINCT slot.value)
         FROM jsonb_array_elements(v_date_entry.value) AS slot(value)
       )
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(v_date_entry.value) AS slot(value)
         WHERE jsonb_typeof(slot.value) <> 'string'
            OR slot.value #>> '{}' NOT IN ('上午', '下午', '晚上')
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_SUBMISSION_PAYLOAD_INVALID';
    END IF;
    BEGIN
      PERFORM v_date_entry.key::date;
    EXCEPTION
      WHEN invalid_datetime_format OR datetime_field_overflow THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_SUBMISSION_PAYLOAD_INVALID';
    END;
    IF NOT EXISTS (
      SELECT 1 FROM public.match_rounds AS round
      WHERE round.id = NEW.round_id
        AND v_date_entry.key::date BETWEEN round.activity_start AND round.activity_end
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_SUBMISSION_DATE_OUT_OF_RANGE';
    END IF;
  END LOOP;

  IF NOT v_is_privileged THEN
    v_current_member_id := private.profile_current_approved_member_id();
    IF v_current_member_id IS NULL OR NEW.member_id IS DISTINCT FROM v_current_member_id THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_SUBMISSION_MEMBER_INVALID';
    END IF;
    IF v_round.purpose = 'matching' AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(NEW.availability)) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_SUBMISSION_TIME_REQUIRED';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.match_rounds AS round
      WHERE round.id = NEW.round_id
        AND round.status = 'open'
        AND now() >= round.survey_start AND now() < round.survey_end
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MEMBER_MASTER_SUBMISSION_ROUND_CLOSED';
    END IF;

    IF TG_OP = 'INSERT' THEN
      NEW.id := gen_random_uuid();
      NEW.created_at := now();
      NEW.updated_at := now();
      NEW.import_metadata := NULL;
      NEW.audit_reason := NULL;
    ELSIF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.member_id IS DISTINCT FROM OLD.member_id
       OR NEW.round_id IS DISTINCT FROM OLD.round_id
       OR NEW.import_metadata IS DISTINCT FROM OLD.import_metadata
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_SUBMISSION_SYSTEM_FIELD_IMMUTABLE';
    END IF;
  END IF;

  RETURN NEW;
END
$function$;

-- Extend the existing privacy workflow without replacing its other safeguards.
-- This exact fragment check deliberately fails on an incompatible database baseline.
DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.admin_anonymize_member(uuid,text)'::regprocedure);
  original_fragment text := $fragment$  UPDATE public.match_round_submissions SET
    game_type_pref = '都可以',
    gender_pref = '都可以',
    availability = '{}'::jsonb,
    interest_tags = ARRAY[]::text[],
    social_style = NULL,
    message = NULL,
    import_metadata = NULL
  WHERE member_id = p_member_id;$fragment$;
  replacement_fragment text := $fragment$  PERFORM set_config('app.round_anonymize_member', p_member_id::text, true);
  UPDATE public.match_round_submissions SET
    game_type_pref = '都可以',
    gender_pref = '都可以',
    availability = '{}'::jsonb,
    interest_tags = ARRAY[]::text[],
    social_style = NULL,
    message = NULL,
    import_metadata = NULL,
    custom_answers = '{}'::jsonb
  WHERE member_id = p_member_id;
  PERFORM set_config('app.round_anonymize_member', '', true);$fragment$;
BEGIN
  IF position(original_fragment IN definition) = 0 THEN
    RAISE EXCEPTION 'ROUND_ANONYMIZE_BASELINE_MISMATCH';
  END IF;
  EXECUTE replace(definition, original_fragment, replacement_fragment);
END;
$migration$;

-- Keep current membership/self-service boundaries; make the deadline exclusive.
ALTER POLICY member_master_round_submissions_active_self_insert ON public.match_round_submissions
WITH CHECK (
  member_id IN (SELECT id FROM public.members WHERE user_id = (SELECT auth.uid()) AND status = 'approved' AND account_status = 'active')
  AND EXISTS (SELECT 1 FROM public.match_rounds r WHERE r.id = round_id AND r.status = 'open'
    AND r.purpose <> 'announcement' AND now() >= r.survey_start AND now() < r.survey_end)
);
ALTER POLICY member_master_round_submissions_active_self_update ON public.match_round_submissions
USING (
  member_id IN (SELECT id FROM public.members WHERE user_id = (SELECT auth.uid()) AND status = 'approved' AND account_status = 'active')
  AND EXISTS (SELECT 1 FROM public.match_rounds r WHERE r.id = round_id AND r.status = 'open'
    AND r.purpose <> 'announcement' AND now() >= r.survey_start AND now() < r.survey_end)
)
WITH CHECK (
  member_id IN (SELECT id FROM public.members WHERE user_id = (SELECT auth.uid()) AND status = 'approved' AND account_status = 'active')
  AND EXISTS (SELECT 1 FROM public.match_rounds r WHERE r.id = round_id AND r.status = 'open'
    AND r.purpose <> 'announcement' AND now() >= r.survey_start AND now() < r.survey_end)
);
REVOKE ALL ON FUNCTION private.round_answer_structure(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.validate_round_custom_answers(jsonb,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.guard_round_content_write() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.guard_match_session_round_purpose() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_guard_round_submission_write() FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
