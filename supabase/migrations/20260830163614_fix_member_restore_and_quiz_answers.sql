-- Keep member audit restoration truthful and keep quiz answers in their
-- canonical JSON-array shape. This is a forward migration because the first
-- identity bootstrap migration has already been exercised in Preview.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration', 0));

-- Older Player submissions stored JSON.stringify(answers) in a jsonb column,
-- leaving a JSON string whose contents were an array. Convert only values that
-- can be parsed safely and are actually arrays; preserve any unknown malformed
-- legacy value for manual review instead of discarding it.
DO $do$
DECLARE
  v_row record;
  v_parsed jsonb;
BEGIN
  FOR v_row IN
    SELECT quiz.id, quiz.answers
    FROM public.personality_quiz_results AS quiz
    WHERE jsonb_typeof(quiz.answers) = 'string'
  LOOP
    v_parsed := NULL;
    BEGIN
      v_parsed := (v_row.answers #>> '{}')::jsonb;
    EXCEPTION
      WHEN invalid_text_representation THEN
        CONTINUE;
    END;

    IF jsonb_typeof(v_parsed) = 'array' THEN
      UPDATE public.personality_quiz_results
      SET answers = v_parsed
      WHERE id = v_row.id;
    END IF;
  END LOOP;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.personality_quiz_results'::regclass
      AND conname = 'personality_quiz_results_answers_array_check'
  ) THEN
    ALTER TABLE public.personality_quiz_results
      ADD CONSTRAINT personality_quiz_results_answers_array_check
      CHECK (jsonb_typeof(answers) = 'array') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.personality_quiz_results AS quiz
    WHERE jsonb_typeof(quiz.answers) <> 'array'
  ) THEN
    ALTER TABLE public.personality_quiz_results
      VALIDATE CONSTRAINT personality_quiz_results_answers_array_check;
  END IF;
END
$do$;

CREATE OR REPLACE FUNCTION public.admin_restore_member_event(
  p_event_id bigint,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_id uuid := private.member_master_current_admin_id();
  v_admin_name text;
  v_source_event private.member_profile_audit_log%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
  v_changed text[];
  v_new_event_id bigint;
  v_updated_at timestamptz;
  v_target_admin_id uuid;
  v_member_anonymized_at timestamptz;
BEGIN
  IF v_admin_id IS NULL OR NOT private.member_master_is_super_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_SUPER_ADMIN_REQUIRED';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_REASON_REQUIRED';
  END IF;
  SELECT * INTO v_source_event
  FROM private.member_profile_audit_log AS audit
  WHERE audit.id = p_event_id
  FOR SHARE;
  IF v_source_event.id IS NULL
     OR v_source_event.action_type NOT IN ('admin_section_update', 'admin_restore')
     OR v_source_event.section NOT IN (
       'identity', 'language', 'interests', 'personality', 'boundaries', 'quiz',
       'application', 'verification', 'interview_evaluation', 'roles', 'workflow'
     )
     OR v_source_event.before_values = '{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_EVENT_NOT_RESTORABLE';
  END IF;
  SELECT member.anonymized_at INTO v_member_anonymized_at
  FROM public.members AS member
  WHERE member.id = v_source_event.member_id_snapshot
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_NOT_FOUND';
  END IF;
  IF v_member_anonymized_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MEMBER_MASTER_ANONYMIZED_RESTORE_BLOCKED';
  END IF;

  v_target_admin_id := CASE
    WHEN v_source_event.section = 'interview_evaluation'
      THEN NULLIF(v_source_event.before_values->>'interviewer_id', '')::uuid
    ELSE v_admin_id
  END;
  v_before := private.member_master_section_snapshot(
    v_source_event.member_id_snapshot, v_source_event.section,
    COALESCE(v_target_admin_id, v_admin_id)
  );
  SELECT administrator.name INTO v_admin_name
  FROM public.admin_users AS administrator WHERE administrator.id = v_admin_id;

  PERFORM set_config('app.member_master_explicit_audit', 'on', true);
  PERFORM set_config('app.member_master_skip_member_audit', 'on', true);
  PERFORM private.member_master_apply_admin_section(
    v_source_event.member_id_snapshot,
    v_source_event.section,
    v_source_event.before_values,
    COALESCE(v_target_admin_id, v_admin_id),
    true
  );
  v_after := private.member_master_section_snapshot(
    v_source_event.member_id_snapshot, v_source_event.section,
    COALESCE(v_target_admin_id, v_admin_id)
  );
  v_changed := private.member_master_changed_fields(v_before, v_after);
  IF COALESCE(cardinality(v_changed), 0) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_RESTORE_NO_CHANGES';
  END IF;

  UPDATE public.members SET updated_at = now()
  WHERE id = v_source_event.member_id_snapshot
  RETURNING updated_at INTO v_updated_at;

  INSERT INTO private.member_profile_audit_log (
    member_id, member_id_snapshot, action_type, section, changed_fields,
    before_values, after_values, reason, source, restored_from_event_id,
    actor_user_id, actor_admin_id, actor_name
  ) VALUES (
    v_source_event.member_id_snapshot, v_source_event.member_id_snapshot,
    'admin_restore', v_source_event.section, v_changed,
    v_before, v_after, btrim(p_reason), 'restore', p_event_id,
    (SELECT auth.uid()), v_admin_id, v_admin_name
  ) RETURNING id INTO v_new_event_id;

  RETURN jsonb_build_object(
    'member_id', v_source_event.member_id_snapshot,
    'section', v_source_event.section,
    'updated_at', v_updated_at,
    'changed_fields', v_changed,
    'event_id', v_new_event_id,
    'restored_from_event_id', p_event_id,
    'data', v_after
  );
END
$function$;

COMMIT;
