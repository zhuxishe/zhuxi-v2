-- Capture exact birthdays for new onboarding while retaining historical age bands.
-- No existing identity rows are rewritten and no legacy profile is made incomplete.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';
SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration', 0));

ALTER TABLE public.member_identity
  ADD COLUMN birth_date date,
  ADD COLUMN legacy_age_range text;
COMMENT ON COLUMN public.member_identity.birth_date IS
  'Calendar birthday; nullable for historical records. Required when saving new onboarding.';
COMMENT ON COLUMN public.member_identity.legacy_age_range IS
  'Original age_range captured once when an existing identity first receives a birthday.';

CREATE OR REPLACE FUNCTION private.member_birth_date_from_payload(p_value jsonb)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $function$
DECLARE
  v_date date;
BEGIN
  IF p_value IS NULL OR p_value = 'null'::jsonb THEN RETURN NULL; END IF;
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'string'
     OR (p_value #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_BIRTH_DATE_INVALID';
  END IF;
  BEGIN
    v_date := (p_value #>> '{}')::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_BIRTH_DATE_INVALID';
  END;
  IF v_date < DATE '1900-01-01' OR v_date > (now() AT TIME ZONE 'Asia/Tokyo')::date THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_BIRTH_DATE_INVALID';
  END IF;
  RETURN v_date;
END
$function$;

-- Pure calendar calculation: leap-day birthdays advance on March 1 in non-leap years.
CREATE OR REPLACE FUNCTION private.member_age_range_for_birth_date(p_birth_date date, p_today date)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN years < 18 THEN '18以下'
    WHEN years <= 20 THEN '18-20'
    WHEN years <= 23 THEN '21-23'
    WHEN years <= 26 THEN '24-26'
    WHEN years <= 29 THEN '27-29'
    ELSE '30+'
  END
  FROM (SELECT extract(year FROM age(p_today, p_birth_date))::integer AS years) AS calendar_age;
$function$;

-- Existing table grants/RLS and the existing privileged RPCs still control writes.
-- All writers derive the compatibility field, including older administrator clients.
CREATE OR REPLACE FUNCTION private.member_identity_sync_birth_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.birth_date IS NOT NULL THEN
    PERFORM private.member_birth_date_from_payload(to_jsonb(NEW.birth_date));
    IF TG_OP = 'UPDATE' AND OLD.birth_date IS NULL AND NEW.legacy_age_range IS NULL THEN
      NEW.legacy_age_range := OLD.age_range;
    END IF;
    NEW.age_range := private.member_age_range_for_birth_date(
      NEW.birth_date, (now() AT TIME ZONE 'Asia/Tokyo')::date
    );
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER member_identity_sync_birth_date
  BEFORE INSERT OR UPDATE OF birth_date, age_range ON public.member_identity
  FOR EACH ROW EXECUTE FUNCTION private.member_identity_sync_birth_date();

CREATE OR REPLACE FUNCTION public.save_my_onboarding_step(
  p_step smallint,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid;
  v_member public.members%ROWTYPE;
  v_identity public.member_identity%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
  v_changed text[];
  v_now timestamptz := now();
  v_text_array text[];
  v_nickname text;
  v_enrollment_year integer;
  v_birth_date date;
BEGIN
  v_member_id := (public.ensure_my_member_record()->>'member_id')::uuid;

  IF p_step IS NULL OR p_step NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'MEMBER_MASTER_STEP_INVALID';
  END IF;

  SELECT * INTO v_member
  FROM public.members AS member
  WHERE member.id = v_member_id
  FOR UPDATE;

  IF v_member.account_status <> 'active' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MEMBER_MASTER_ACCOUNT_BLOCKED';
  END IF;
  IF v_member.status = 'approved' OR v_member.profile_stage = 'complete' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MEMBER_MASTER_ONBOARDING_LOCKED';
  END IF;
  IF p_step > v_member.onboarding_step + 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'MEMBER_MASTER_STEP_OUT_OF_ORDER';
  END IF;

  SELECT * INTO v_identity
  FROM public.member_identity AS identity
  WHERE identity.member_id = v_member_id
  FOR UPDATE;
  v_before := COALESCE(to_jsonb(v_identity), '{}'::jsonb);
  PERFORM set_config('app.member_master_explicit_audit', 'on', true);

  IF p_step = 1 THEN
    PERFORM private.member_master_validate_payload_keys(
      p_payload,
      ARRAY[
        'full_name', 'nickname', 'gender', 'birth_date', 'age_range', 'nationality',
        'current_city'
      ]
    );
    IF NOT (p_payload ?& ARRAY['full_name', 'gender', 'birth_date', 'nationality', 'current_city'])
       OR jsonb_typeof(p_payload->'full_name') <> 'string'
       OR jsonb_typeof(p_payload->'gender') <> 'string'
       OR p_payload->'birth_date' = 'null'::jsonb
       OR jsonb_typeof(p_payload->'nationality') <> 'string'
       OR jsonb_typeof(p_payload->'current_city') <> 'string'
       OR char_length(btrim(p_payload->>'full_name')) NOT BETWEEN 1 AND 100
       OR (p_payload->>'gender') NOT IN ('male', 'female', 'other')
       OR char_length(btrim(p_payload->>'nationality')) NOT BETWEEN 1 AND 100
       OR char_length(btrim(p_payload->>'current_city')) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'MEMBER_MASTER_REQUIRED_FIELDS_MISSING';
    END IF;

    v_birth_date := private.member_birth_date_from_payload(p_payload->'birth_date');

    IF p_payload ? 'nickname' AND p_payload->'nickname' <> 'null'::jsonb THEN
      IF jsonb_typeof(p_payload->'nickname') <> 'string' THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
      END IF;
      v_nickname := NULLIF(private.profile_normalize_nickname(p_payload->>'nickname'), '');
      IF v_nickname IS NOT NULL
         AND (
           char_length(v_nickname) NOT BETWEEN 2 AND 20
           OR lower(v_nickname) IN (
             'admin', 'administrator', 'staff',
             '官方', '管理员', '竹溪社官方', '管理者', '運営', '公式'
           )
         ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
      END IF;
      IF v_nickname IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.member_identity AS other_identity
        WHERE other_identity.member_id <> v_member_id
          AND lower(private.profile_normalize_nickname(other_identity.nickname)) = lower(v_nickname)
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '23505',
          MESSAGE = 'MEMBER_MASTER_NICKNAME_CONFLICT';
      END IF;
    ELSE
      v_nickname := NULL;
    END IF;

    INSERT INTO public.member_identity (
      member_id, full_name, nickname, gender, age_range, birth_date, nationality, current_city
    ) VALUES (
      v_member_id,
      btrim(p_payload->>'full_name'),
      v_nickname,
      p_payload->>'gender',
      private.member_age_range_for_birth_date(v_birth_date, (v_now AT TIME ZONE 'Asia/Tokyo')::date),
      v_birth_date,
      btrim(p_payload->>'nationality'),
      btrim(p_payload->>'current_city')
    )
    ON CONFLICT (member_id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      nickname = EXCLUDED.nickname,
      gender = EXCLUDED.gender,
      age_range = EXCLUDED.age_range,
      birth_date = EXCLUDED.birth_date,
      nationality = EXCLUDED.nationality,
      current_city = EXCLUDED.current_city;

  ELSIF p_step = 2 THEN
    PERFORM private.member_master_validate_payload_keys(
      p_payload,
      ARRAY[
        'school_name', 'department', 'degree_level', 'course_language',
        'enrollment_year'
      ]
    );
    IF v_identity.id IS NULL OR v_member.onboarding_step < 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'MEMBER_MASTER_STEP_OUT_OF_ORDER';
    END IF;
    IF jsonb_typeof(p_payload->'school_name') IS DISTINCT FROM 'string'
       OR NULLIF(btrim(p_payload->>'school_name'), '') IS NULL
       OR jsonb_typeof(p_payload->'degree_level') IS DISTINCT FROM 'string'
       OR COALESCE(p_payload->>'degree_level', '') NOT IN (
         '学部生', '修士', '博士', '交换留学', '语言学校', '研究生/预科', '其他'
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MEMBER_MASTER_REQUIRED_FIELDS_MISSING';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM unnest(ARRAY['school_name', 'department', 'degree_level', 'course_language']) AS field(key)
      WHERE p_payload ? field.key
        AND p_payload->field.key <> 'null'::jsonb
        AND (
          jsonb_typeof(p_payload->field.key) <> 'string'
          OR char_length(p_payload->>field.key) > 120
        )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
    END IF;
    IF p_payload ? 'enrollment_year' AND p_payload->'enrollment_year' <> 'null'::jsonb THEN
      IF jsonb_typeof(p_payload->'enrollment_year') <> 'number'
         OR (p_payload->>'enrollment_year') !~ '^[0-9]{4}$' THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
      END IF;
      v_enrollment_year := (p_payload->>'enrollment_year')::integer;
      IF v_enrollment_year NOT BETWEEN 1900 AND 2100 THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
      END IF;
    ELSE
      v_enrollment_year := NULL;
    END IF;

    UPDATE public.member_identity
    SET
      school_name = CASE WHEN p_payload ? 'school_name' THEN NULLIF(btrim(p_payload->>'school_name'), '') ELSE school_name END,
      department = CASE WHEN p_payload ? 'department' THEN NULLIF(btrim(p_payload->>'department'), '') ELSE department END,
      degree_level = CASE WHEN p_payload ? 'degree_level' THEN NULLIF(btrim(p_payload->>'degree_level'), '') ELSE degree_level END,
      course_language = CASE WHEN p_payload ? 'course_language' THEN NULLIF(btrim(p_payload->>'course_language'), '') ELSE course_language END,
      enrollment_year = CASE WHEN p_payload ? 'enrollment_year' THEN v_enrollment_year ELSE enrollment_year END
    WHERE member_id = v_member_id;

  ELSIF p_step = 3 THEN
    PERFORM private.member_master_validate_payload_keys(
      p_payload,
      ARRAY['hobby_tags', 'activity_type_tags']
    );
    IF v_identity.id IS NULL OR v_member.onboarding_step < 2 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'MEMBER_MASTER_STEP_OUT_OF_ORDER';
    END IF;
    v_text_array := private.member_master_jsonb_text_array(
      p_payload, 'hobby_tags', true, 8, 100
    );
    IF cardinality(v_text_array) = 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'MEMBER_MASTER_REQUIRED_FIELDS_MISSING';
    END IF;
    UPDATE public.member_identity SET hobby_tags = v_text_array
    WHERE member_id = v_member_id;

    v_text_array := private.member_master_jsonb_text_array(
      p_payload, 'activity_type_tags', true, 5, 100
    );
    IF cardinality(v_text_array) = 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'MEMBER_MASTER_REQUIRED_FIELDS_MISSING';
    END IF;
    UPDATE public.member_identity SET activity_type_tags = v_text_array
    WHERE member_id = v_member_id;

  ELSE
    PERFORM private.member_master_validate_payload_keys(
      p_payload,
      ARRAY['personality_self_tags', 'taboo_tags']
    );
    IF v_identity.id IS NULL OR v_member.onboarding_step < 3 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'MEMBER_MASTER_STEP_OUT_OF_ORDER';
    END IF;
    v_text_array := private.member_master_jsonb_text_array(
      p_payload, 'personality_self_tags', true, 5, 100
    );
    IF cardinality(v_text_array) = 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'MEMBER_MASTER_REQUIRED_FIELDS_MISSING';
    END IF;
    UPDATE public.member_identity SET personality_self_tags = v_text_array
    WHERE member_id = v_member_id;

    v_text_array := private.member_master_jsonb_text_array(
      p_payload, 'taboo_tags', false, 50, 100
    );
    IF p_payload ? 'taboo_tags' THEN
      UPDATE public.member_identity SET taboo_tags = COALESCE(v_text_array, ARRAY[]::text[])
      WHERE member_id = v_member_id;
    END IF;
  END IF;

  SELECT to_jsonb(identity) INTO v_after
  FROM public.member_identity AS identity
  WHERE identity.member_id = v_member_id;

  PERFORM set_config('app.member_master_skip_member_audit', 'on', true);
  UPDATE public.members
  SET
    profile_stage = 'in_progress',
    onboarding_step = GREATEST(onboarding_step, p_step),
    last_profile_saved_at = v_now,
    updated_at = v_now
  WHERE id = v_member_id
  RETURNING * INTO v_member;

  v_changed := private.member_master_changed_fields(v_before, v_after);
  INSERT INTO private.member_profile_audit_log (
    member_id, member_id_snapshot, action_type, section, changed_fields,
    before_values, after_values, source, actor_user_id
  ) VALUES (
    v_member_id, v_member_id, 'onboarding_step_saved',
    'onboarding_step_' || p_step::text, v_changed,
    v_before, v_after, 'onboarding', (SELECT auth.uid())
  );

  RETURN jsonb_build_object(
    'member_id', v_member.id,
    'saved_step', p_step,
    'status', v_member.status,
    'account_status', v_member.account_status,
    'profile_stage', v_member.profile_stage,
    'onboarding_step', v_member.onboarding_step,
    'last_profile_saved_at', v_member.last_profile_saved_at,
    'submitted_at', v_member.submitted_at
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'MEMBER_MASTER_NICKNAME_CONFLICT';
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
END
$function$;


CREATE OR REPLACE FUNCTION public.submit_my_onboarding()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid;
  v_member public.members%ROWTYPE;
  v_identity public.member_identity%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
  v_now timestamptz := now();
BEGIN
  v_member_id := (public.ensure_my_member_record()->>'member_id')::uuid;
  SELECT * INTO v_member
  FROM public.members AS member
  WHERE member.id = v_member_id
  FOR UPDATE;

  IF v_member.account_status <> 'active' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MEMBER_MASTER_ACCOUNT_BLOCKED';
  END IF;
  IF v_member.status = 'approved' OR v_member.profile_stage = 'complete' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MEMBER_MASTER_ONBOARDING_LOCKED';
  END IF;

  -- Idempotent double-submit after a committed first request.
  IF v_member.status = 'pending' AND v_member.profile_stage = 'submitted' THEN
    RETURN jsonb_build_object(
      'member_id', v_member.id,
      'status', v_member.status,
      'account_status', v_member.account_status,
      'profile_stage', v_member.profile_stage,
      'onboarding_step', v_member.onboarding_step,
      'last_profile_saved_at', v_member.last_profile_saved_at,
      'submitted_at', v_member.submitted_at
    );
  END IF;

  SELECT * INTO v_identity
  FROM public.member_identity AS identity
  WHERE identity.member_id = v_member_id
  FOR UPDATE;

  IF v_member.onboarding_step < 4
     OR v_identity.id IS NULL
     OR NULLIF(btrim(v_identity.full_name), '') IS NULL
     OR v_identity.gender NOT IN ('male', 'female', 'other')
     OR NULLIF(btrim(v_identity.age_range), '') IS NULL
     OR v_identity.birth_date IS NULL
     OR NULLIF(btrim(v_identity.school_name), '') IS NULL
     OR COALESCE(v_identity.degree_level, '') NOT IN (
       '学部生', '修士', '博士', '交换留学', '语言学校', '研究生/预科', '其他'
     )
     OR NULLIF(btrim(v_identity.nationality), '') IS NULL
     OR NULLIF(btrim(v_identity.current_city), '') IS NULL
     OR cardinality(v_identity.hobby_tags) = 0
     OR cardinality(v_identity.activity_type_tags) = 0
     OR cardinality(v_identity.personality_self_tags) = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'MEMBER_MASTER_REQUIRED_FIELDS_MISSING';
  END IF;

  v_before := jsonb_build_object(
    'status', v_member.status,
    'profile_stage', v_member.profile_stage,
    'onboarding_step', v_member.onboarding_step,
    'submitted_at', v_member.submitted_at
  );
  PERFORM set_config('app.member_master_skip_member_audit', 'on', true);
  UPDATE public.members
  SET
    status = 'pending',
    profile_stage = 'submitted',
    onboarding_step = 4,
    submitted_at = v_now,
    last_profile_saved_at = COALESCE(last_profile_saved_at, v_now),
    updated_at = v_now
  WHERE id = v_member_id
  RETURNING * INTO v_member;
  v_after := jsonb_build_object(
    'status', v_member.status,
    'profile_stage', v_member.profile_stage,
    'onboarding_step', v_member.onboarding_step,
    'submitted_at', v_member.submitted_at
  );

  INSERT INTO private.member_profile_audit_log (
    member_id, member_id_snapshot, action_type, section, changed_fields,
    before_values, after_values, source, actor_user_id
  ) VALUES (
    v_member_id, v_member_id, 'onboarding_submitted', 'application',
    private.member_master_changed_fields(v_before, v_after),
    v_before, v_after, 'onboarding', (SELECT auth.uid())
  );

  RETURN jsonb_build_object(
    'member_id', v_member.id,
    'status', v_member.status,
    'account_status', v_member.account_status,
    'profile_stage', v_member.profile_stage,
    'onboarding_step', v_member.onboarding_step,
    'last_profile_saved_at', v_member.last_profile_saved_at,
    'submitted_at', v_member.submitted_at
  );
END
$function$;


-- Fail closed if a deployed function has an incompatible baseline.
DO $migration$
DECLARE
  definition text := pg_get_functiondef('private.member_master_apply_admin_section(uuid,text,jsonb,uuid,boolean)'::regprocedure);
  original_fragment text;
  replacement_fragment text;
BEGIN
  original_fragment := $fragment$          'full_name', 'nickname', 'gender', 'age_range', 'nationality',$fragment$;
  replacement_fragment := $fragment$          'full_name', 'nickname', 'gender', 'age_range', 'birth_date', 'nationality',$fragment$;
  IF position(original_fragment IN definition) = 0 THEN
    RAISE EXCEPTION 'BIRTH_DATE_BASELINE_MISMATCH: private.member_master_apply_admin_section fragment 1';
  END IF;
  definition := replace(definition, original_fragment, replacement_fragment);
  original_fragment := $fragment$          'personality_self_tags', 'taboo_tags', 'personal_avatar_path'
        ]$fragment$;
  replacement_fragment := $fragment$          'personality_self_tags', 'taboo_tags', 'personal_avatar_path'
        ] || CASE WHEN p_is_restore THEN ARRAY['legacy_age_range'] ELSE ARRAY[]::text[] END$fragment$;
  IF position(original_fragment IN definition) = 0 THEN
    RAISE EXCEPTION 'BIRTH_DATE_BASELINE_MISMATCH: private.member_master_apply_admin_section fragment 2';
  END IF;
  definition := replace(definition, original_fragment, replacement_fragment);
  original_fragment := $fragment$      v_identity := jsonb_populate_record(v_identity, p_payload);
      v_identity.nickname$fragment$;
  replacement_fragment := $fragment$      IF p_payload ? 'birth_date' THEN
        PERFORM private.member_birth_date_from_payload(p_payload->'birth_date');
      END IF;
      IF p_is_restore AND p_payload ? 'legacy_age_range'
         AND p_payload->'legacy_age_range' <> 'null'::jsonb
         AND jsonb_typeof(p_payload->'legacy_age_range') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
      END IF;
      v_identity := jsonb_populate_record(v_identity, p_payload);
      v_identity.nickname$fragment$;
  IF position(original_fragment IN definition) = 0 THEN
    RAISE EXCEPTION 'BIRTH_DATE_BASELINE_MISMATCH: private.member_master_apply_admin_section fragment 3';
  END IF;
  definition := replace(definition, original_fragment, replacement_fragment);
  original_fragment := $fragment$        age_range = v_identity.age_range,$fragment$;
  replacement_fragment := $fragment$        age_range = v_identity.age_range,
        birth_date = v_identity.birth_date,
        legacy_age_range = v_identity.legacy_age_range,$fragment$;
  IF position(original_fragment IN definition) = 0 THEN
    RAISE EXCEPTION 'BIRTH_DATE_BASELINE_MISMATCH: private.member_master_apply_admin_section fragment 4';
  END IF;
  definition := replace(definition, original_fragment, replacement_fragment);
  EXECUTE definition;
END;
$migration$;

DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.admin_update_member_section(uuid,text,jsonb,text,timestamp with time zone)'::regprocedure);
  original_fragment text;
  replacement_fragment text;
BEGIN
  original_fragment := $fragment$  IF p_section = 'identity'
     AND NOT EXISTS ($fragment$;
  replacement_fragment := $fragment$  IF p_section = 'identity' AND p_payload ? 'birth_date'
     AND p_payload->'birth_date' <> 'null'::jsonb THEN
    p_payload := jsonb_set(p_payload, '{age_range}', to_jsonb(
      private.member_age_range_for_birth_date(
        private.member_birth_date_from_payload(p_payload->'birth_date'),
        (now() AT TIME ZONE 'Asia/Tokyo')::date
      )
    ));
  END IF;

  IF p_section = 'identity'
     AND NOT EXISTS ($fragment$;
  IF position(original_fragment IN definition) = 0 THEN
    RAISE EXCEPTION 'BIRTH_DATE_BASELINE_MISMATCH: public.admin_update_member_section fragment 1';
  END IF;
  definition := replace(definition, original_fragment, replacement_fragment);
  original_fragment := $fragment$      member_id, full_name, gender, age_range, nationality, current_city$fragment$;
  replacement_fragment := $fragment$      member_id, full_name, gender, age_range, birth_date, nationality, current_city$fragment$;
  IF position(original_fragment IN definition) = 0 THEN
    RAISE EXCEPTION 'BIRTH_DATE_BASELINE_MISMATCH: public.admin_update_member_section fragment 2';
  END IF;
  definition := replace(definition, original_fragment, replacement_fragment);
  original_fragment := $fragment$      p_payload->>'age_range',$fragment$;
  replacement_fragment := $fragment$      p_payload->>'age_range',
      private.member_birth_date_from_payload(p_payload->'birth_date'),$fragment$;
  IF position(original_fragment IN definition) = 0 THEN
    RAISE EXCEPTION 'BIRTH_DATE_BASELINE_MISMATCH: public.admin_update_member_section fragment 3';
  END IF;
  definition := replace(definition, original_fragment, replacement_fragment);
  EXECUTE definition;
END;
$migration$;

DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.admin_anonymize_member(uuid,text)'::regprocedure);
  original_fragment text;
  replacement_fragment text;
BEGIN
  original_fragment := $fragment$    age_range = 'anonymized',$fragment$;
  replacement_fragment := $fragment$    age_range = 'anonymized',
    birth_date = NULL,
    legacy_age_range = NULL,$fragment$;
  IF position(original_fragment IN definition) = 0 THEN
    RAISE EXCEPTION 'BIRTH_DATE_BASELINE_MISMATCH: public.admin_anonymize_member fragment 1';
  END IF;
  definition := replace(definition, original_fragment, replacement_fragment);
  EXECUTE definition;
END;
$migration$;

REVOKE ALL ON FUNCTION private.member_birth_date_from_payload(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_age_range_for_birth_date(date,date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_identity_sync_birth_date() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_my_onboarding_step(smallint,jsonb) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.submit_my_onboarding() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_my_onboarding_step(smallint,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_my_onboarding() TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
