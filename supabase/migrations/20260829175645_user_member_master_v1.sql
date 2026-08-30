-- User/member master V1.
--
-- Additive goals:
--   * keep members.status as the application/approval state;
--   * make every auth.users row own exactly one canonical members row;
--   * make onboarding writes narrow, validated and transactional;
--   * provide an immutable, member-preserving audit trail;
--   * expose admin reads and writes only through narrow RPCs;
--   * harden the legacy/direct-write paths without revealing anonymous authors.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('user_member_master_v1', 0));

CREATE SCHEMA IF NOT EXISTS private;

-- ---------------------------------------------------------------------------
-- Canonical member lifecycle columns
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.members
  ADD COLUMN IF NOT EXISTS account_status text,
  ADD COLUMN IF NOT EXISTS profile_stage text,
  ADD COLUMN IF NOT EXISTS record_source text,
  ADD COLUMN IF NOT EXISTS onboarding_step smallint,
  ADD COLUMN IF NOT EXISTS last_profile_saved_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_linked_at timestamptz,
  ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;

UPDATE public.members AS member
SET
  account_status = COALESCE(
    member.account_status,
    CASE
      WHEN member.user_id IS NULL THEN 'unbound'
      WHEN member.status = 'inactive' THEN 'suspended'
      ELSE 'active'
    END
  ),
  profile_stage = COALESCE(
    member.profile_stage,
    CASE
      WHEN member.status IN ('approved', 'inactive') THEN 'complete'
      WHEN EXISTS (
        SELECT 1 FROM public.member_identity AS identity
        WHERE identity.member_id = member.id
      ) THEN 'submitted'
      ELSE 'not_started'
    END
  ),
  record_source = COALESCE(
    member.record_source,
    CASE
      WHEN member.line_user_id IS NOT NULL THEN 'line'
      WHEN member.user_id IS NOT NULL THEN 'app'
      WHEN member.member_number LIKE 'IMP-%' THEN 'import'
      ELSE 'legacy'
    END
  ),
  onboarding_step = COALESCE(
    member.onboarding_step,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.member_identity AS identity
        WHERE identity.member_id = member.id
      ) THEN 4
      ELSE 0
    END
  ),
  last_profile_saved_at = COALESCE(
    member.last_profile_saved_at,
    (
      SELECT identity.updated_at
      FROM public.member_identity AS identity
      WHERE identity.member_id = member.id
    )
  ),
  submitted_at = COALESCE(
    member.submitted_at,
    CASE
      WHEN member.status IN ('pending', 'approved', 'rejected', 'inactive')
       AND EXISTS (
         SELECT 1 FROM public.member_identity AS identity
         WHERE identity.member_id = member.id
       )
      THEN member.updated_at
      ELSE NULL
    END
  ),
  account_linked_at = COALESCE(
    member.account_linked_at,
    CASE WHEN member.user_id IS NOT NULL THEN member.created_at ELSE NULL END
  );

ALTER TABLE public.members
  ALTER COLUMN account_status SET DEFAULT 'unbound',
  ALTER COLUMN account_status SET NOT NULL,
  ALTER COLUMN profile_stage SET DEFAULT 'not_started',
  ALTER COLUMN profile_stage SET NOT NULL,
  ALTER COLUMN record_source SET DEFAULT 'app',
  ALTER COLUMN record_source SET NOT NULL,
  ALTER COLUMN onboarding_step SET DEFAULT 0,
  ALTER COLUMN onboarding_step SET NOT NULL;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.members'::regclass
      AND conname = 'members_account_status_check'
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_account_status_check
      CHECK (account_status IN ('unbound', 'active', 'suspended', 'closed'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.members'::regclass
      AND conname = 'members_profile_stage_check'
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_profile_stage_check
      CHECK (profile_stage IN ('not_started', 'in_progress', 'submitted', 'complete'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.members'::regclass
      AND conname = 'members_record_source_check'
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_record_source_check
      CHECK (record_source IN ('app', 'line', 'legacy', 'import', 'admin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.members'::regclass
      AND conname = 'members_onboarding_step_check'
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_onboarding_step_check
      CHECK (onboarding_step BETWEEN 0 AND 4);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.members'::regclass
      AND conname = 'members_anonymized_state_check'
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_anonymized_state_check
      CHECK (anonymized_at IS NULL OR account_status = 'closed');
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- Atomic administrator section updates and restore support
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.member_master_section_snapshot(
  p_member_id uuid,
  p_section text,
  p_admin_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  CASE p_section
    WHEN 'identity' THEN
      SELECT to_jsonb(identity) - ARRAY['id', 'member_id', 'created_at', 'updated_at']
      INTO v_result
      FROM public.member_identity AS identity
      WHERE identity.member_id = p_member_id;
    WHEN 'language' THEN
      SELECT to_jsonb(language) - ARRAY['id', 'member_id', 'created_at', 'updated_at']
      INTO v_result
      FROM public.member_language AS language
      WHERE language.member_id = p_member_id;
    WHEN 'interests' THEN
      SELECT to_jsonb(interests) - ARRAY['id', 'member_id', 'created_at', 'updated_at']
      INTO v_result
      FROM public.member_interests AS interests
      WHERE interests.member_id = p_member_id;
    WHEN 'personality' THEN
      SELECT to_jsonb(personality) - ARRAY['id', 'member_id', 'created_at', 'updated_at']
      INTO v_result
      FROM public.member_personality AS personality
      WHERE personality.member_id = p_member_id;
    WHEN 'boundaries' THEN
      SELECT to_jsonb(boundaries) - ARRAY['id', 'member_id', 'created_at', 'updated_at']
      INTO v_result
      FROM public.member_boundaries AS boundaries
      WHERE boundaries.member_id = p_member_id;
    WHEN 'quiz' THEN
      SELECT to_jsonb(quiz) - ARRAY['id', 'member_id', 'created_at', 'updated_at']
      INTO v_result
      FROM public.personality_quiz_results AS quiz
      WHERE quiz.member_id = p_member_id;
    WHEN 'application' THEN
      SELECT jsonb_build_object(
        'status', member.status,
        'interview_date', member.interview_date,
        'interviewer', member.interviewer,
        'attractiveness_score', member.attractiveness_score,
        'profile_stage', member.profile_stage,
        'onboarding_step', member.onboarding_step,
        'submitted_at', member.submitted_at
      )
      INTO v_result
      FROM public.members AS member
      WHERE member.id = p_member_id;
    WHEN 'workflow' THEN
      SELECT jsonb_build_object(
        'profile_stage', member.profile_stage,
        'onboarding_step', member.onboarding_step
      )
      INTO v_result
      FROM public.members AS member
      WHERE member.id = p_member_id;
    WHEN 'verification' THEN
      SELECT jsonb_build_object(
        'student_id_verified', verification.student_id_verified,
        'photo_verified', verification.photo_verified
      )
      INTO v_result
      FROM public.member_verification AS verification
      WHERE verification.member_id = p_member_id;
    WHEN 'interview_evaluation' THEN
      SELECT to_jsonb(evaluation) - ARRAY['id', 'member_id', 'created_at', 'updated_at']
      INTO v_result
      FROM public.interview_evaluations AS evaluation
      WHERE evaluation.member_id = p_member_id
        AND evaluation.interviewer_id = p_admin_id;
    WHEN 'account' THEN
      SELECT jsonb_build_object(
        'member_number', member.member_number,
        'membership_type', member.membership_type,
        'user_id', member.user_id,
        'email', member.email,
        'line_user_id', member.line_user_id,
        'wechat_openid', member.wechat_openid,
        'record_source', member.record_source,
        'account_status', member.account_status,
        'account_linked_at', member.account_linked_at
      )
      INTO v_result
      FROM public.members AS member
      WHERE member.id = p_member_id;
    WHEN 'roles' THEN
      SELECT jsonb_build_object(
        'roles', COALESCE(
          jsonb_agg(assignment.role_key ORDER BY assignment.role_key)
            FILTER (WHERE assignment.role_key IS NOT NULL),
          '[]'::jsonb
        )
      )
      INTO v_result
      FROM private.member_role_assignments AS assignment
      WHERE assignment.member_id = p_member_id
        AND assignment.revoked_at IS NULL
        AND assignment.role_key IN ('volunteer', 'community_moderator', 'operations');
    ELSE
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'MEMBER_MASTER_SECTION_INVALID';
  END CASE;
  RETURN COALESCE(v_result, '{}'::jsonb);
END
$function$;

CREATE OR REPLACE FUNCTION private.member_master_apply_admin_section(
  p_member_id uuid,
  p_section text,
  p_payload jsonb,
  p_admin_id uuid,
  p_is_restore boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_identity public.member_identity%ROWTYPE;
  v_language public.member_language%ROWTYPE;
  v_interests public.member_interests%ROWTYPE;
  v_personality public.member_personality%ROWTYPE;
  v_boundaries public.member_boundaries%ROWTYPE;
  v_quiz public.personality_quiz_results%ROWTYPE;
  v_verification public.member_verification%ROWTYPE;
  v_evaluation public.interview_evaluations%ROWTYPE;
  v_admin_name text;
  v_key text;
  v_array text[];
  v_user_id uuid;
  v_email text;
  v_role text;
  v_profile_stage text;
  v_onboarding_step smallint;
  v_required_scores text[] := ARRAY[
    'communication', 'articulation', 'enthusiasm', 'sincerity',
    'social_comfort', 'humor', 'emotional_stability', 'boundary_respect',
    'team_orientation', 'interest_alignment', 'japanese_ability',
    'time_commitment', 'leadership_potential', 'openness',
    'responsibility', 'first_impression', 'overall_recommendation'
  ];
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR octet_length(p_payload::text) > 100000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;

  CASE p_section
    WHEN 'identity' THEN
      PERFORM private.member_master_validate_payload_keys(
        p_payload,
        ARRAY[
          'full_name', 'nickname', 'gender', 'age_range', 'nationality',
          'current_city', 'school_name', 'department', 'degree_level',
          'course_language', 'enrollment_year', 'height_weight', 'phone',
          'sns_accounts', 'hobby_tags', 'activity_type_tags',
          'personality_self_tags', 'taboo_tags', 'personal_avatar_path'
        ]
      );
      SELECT * INTO v_identity
      FROM public.member_identity AS identity
      WHERE identity.member_id = p_member_id
      FOR UPDATE;
      IF v_identity.id IS NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'MEMBER_MASTER_IDENTITY_REQUIRED';
      END IF;
      FOREACH v_key IN ARRAY ARRAY[
        'full_name', 'nickname', 'gender', 'age_range', 'nationality',
        'current_city', 'school_name', 'department', 'degree_level',
        'course_language', 'height_weight', 'phone', 'personal_avatar_path'
      ] LOOP
        IF p_payload ? v_key AND p_payload->v_key <> 'null'::jsonb
           AND (
             jsonb_typeof(p_payload->v_key) <> 'string'
             OR char_length(p_payload->>v_key) > 500
           ) THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
        END IF;
      END LOOP;
      IF p_payload ? 'sns_accounts'
         AND p_payload->'sns_accounts' <> 'null'::jsonb
         AND jsonb_typeof(p_payload->'sns_accounts') <> 'object' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
      END IF;
      IF p_payload ? 'enrollment_year'
         AND p_payload->'enrollment_year' <> 'null'::jsonb
         AND (
           jsonb_typeof(p_payload->'enrollment_year') <> 'number'
           OR (p_payload->>'enrollment_year') !~ '^[0-9]{4}$'
           OR (p_payload->>'enrollment_year')::integer NOT BETWEEN 1900 AND 2100
         ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
      END IF;
      IF p_payload ? 'gender'
         AND COALESCE(p_payload->>'gender', '') NOT IN ('male', 'female', 'other') THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
      END IF;
      FOREACH v_key IN ARRAY ARRAY[
        'hobby_tags', 'activity_type_tags', 'personality_self_tags', 'taboo_tags'
      ] LOOP
        IF p_payload ? v_key THEN
          v_array := private.member_master_jsonb_text_array(p_payload, v_key, false, 50, 100);
          p_payload := jsonb_set(p_payload, ARRAY[v_key], to_jsonb(COALESCE(v_array, ARRAY[]::text[])));
        END IF;
      END LOOP;
      v_identity := jsonb_populate_record(v_identity, p_payload);
      v_identity.nickname := NULLIF(private.profile_normalize_nickname(v_identity.nickname), '');
      UPDATE public.member_identity SET
        full_name = v_identity.full_name,
        nickname = v_identity.nickname,
        gender = v_identity.gender,
        age_range = v_identity.age_range,
        nationality = v_identity.nationality,
        current_city = v_identity.current_city,
        school_name = v_identity.school_name,
        department = v_identity.department,
        degree_level = v_identity.degree_level,
        course_language = v_identity.course_language,
        enrollment_year = v_identity.enrollment_year,
        height_weight = v_identity.height_weight,
        phone = v_identity.phone,
        sns_accounts = v_identity.sns_accounts,
        hobby_tags = v_identity.hobby_tags,
        activity_type_tags = v_identity.activity_type_tags,
        personality_self_tags = v_identity.personality_self_tags,
        taboo_tags = v_identity.taboo_tags,
        personal_avatar_path = v_identity.personal_avatar_path
      WHERE member_id = p_member_id;

    WHEN 'language' THEN
      PERFORM private.member_master_validate_payload_keys(
        p_payload, ARRAY['communication_language_pref', 'japanese_level']
      );
      INSERT INTO public.member_language (member_id) VALUES (p_member_id)
      ON CONFLICT (member_id) DO NOTHING;
      SELECT * INTO v_language FROM public.member_language
      WHERE member_id = p_member_id FOR UPDATE;
      IF p_payload ? 'communication_language_pref' THEN
        v_array := private.member_master_jsonb_text_array(
          p_payload, 'communication_language_pref', false, 20, 100
        );
        p_payload := jsonb_set(
          p_payload, '{communication_language_pref}',
          to_jsonb(COALESCE(v_array, ARRAY[]::text[]))
        );
      END IF;
      IF p_payload ? 'japanese_level'
         AND p_payload->'japanese_level' <> 'null'::jsonb
         AND (
           jsonb_typeof(p_payload->'japanese_level') <> 'string'
           OR char_length(p_payload->>'japanese_level') > 100
         ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
      END IF;
      v_language := jsonb_populate_record(v_language, p_payload);
      UPDATE public.member_language SET
        communication_language_pref = v_language.communication_language_pref,
        japanese_level = v_language.japanese_level
      WHERE member_id = p_member_id;

    WHEN 'interests' THEN
      PERFORM private.member_master_validate_payload_keys(
        p_payload,
        ARRAY[
          'activity_area', 'nearest_station', 'graduation_year',
          'scenario_mode_pref', 'ideal_group_size', 'script_preference',
          'non_script_preference', 'activity_frequency', 'preferred_time_slots',
          'budget_range', 'travel_radius', 'social_goal_primary',
          'social_goal_secondary', 'accept_beginners', 'accept_cross_school',
          'scenario_theme_tags', 'game_type_pref'
        ]
      );
      INSERT INTO public.member_interests (member_id) VALUES (p_member_id)
      ON CONFLICT (member_id) DO NOTHING;
      SELECT * INTO v_interests FROM public.member_interests
      WHERE member_id = p_member_id FOR UPDATE;
      FOREACH v_key IN ARRAY ARRAY[
        'scenario_mode_pref', 'script_preference', 'non_script_preference',
        'preferred_time_slots', 'scenario_theme_tags'
      ] LOOP
        IF p_payload ? v_key THEN
          v_array := private.member_master_jsonb_text_array(p_payload, v_key, false, 50, 100);
          p_payload := jsonb_set(p_payload, ARRAY[v_key], to_jsonb(COALESCE(v_array, ARRAY[]::text[])));
        END IF;
      END LOOP;
      FOREACH v_key IN ARRAY ARRAY[
        'activity_area', 'nearest_station', 'ideal_group_size',
        'activity_frequency', 'budget_range', 'travel_radius',
        'social_goal_primary', 'social_goal_secondary', 'game_type_pref'
      ] LOOP
        IF p_payload ? v_key AND p_payload->v_key <> 'null'::jsonb
           AND (
             jsonb_typeof(p_payload->v_key) <> 'string'
             OR char_length(p_payload->>v_key) > 200
           ) THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
        END IF;
      END LOOP;
      v_interests := jsonb_populate_record(v_interests, p_payload);
      UPDATE public.member_interests SET
        activity_area = v_interests.activity_area,
        nearest_station = v_interests.nearest_station,
        graduation_year = v_interests.graduation_year,
        scenario_mode_pref = v_interests.scenario_mode_pref,
        ideal_group_size = v_interests.ideal_group_size,
        script_preference = v_interests.script_preference,
        non_script_preference = v_interests.non_script_preference,
        activity_frequency = v_interests.activity_frequency,
        preferred_time_slots = v_interests.preferred_time_slots,
        budget_range = v_interests.budget_range,
        travel_radius = v_interests.travel_radius,
        social_goal_primary = v_interests.social_goal_primary,
        social_goal_secondary = v_interests.social_goal_secondary,
        accept_beginners = v_interests.accept_beginners,
        accept_cross_school = v_interests.accept_cross_school,
        scenario_theme_tags = v_interests.scenario_theme_tags,
        game_type_pref = v_interests.game_type_pref
      WHERE member_id = p_member_id;

    WHEN 'personality' THEN
      PERFORM private.member_master_validate_payload_keys(
        p_payload,
        ARRAY[
          'extroversion', 'initiative', 'expression_style_tags',
          'group_role_tags', 'warmup_speed', 'planning_style',
          'coop_compete_tendency', 'emotional_stability',
          'boundary_strength', 'reply_speed'
        ]
      );
      INSERT INTO public.member_personality (member_id) VALUES (p_member_id)
      ON CONFLICT (member_id) DO NOTHING;
      SELECT * INTO v_personality FROM public.member_personality
      WHERE member_id = p_member_id FOR UPDATE;
      FOREACH v_key IN ARRAY ARRAY['expression_style_tags', 'group_role_tags'] LOOP
        IF p_payload ? v_key THEN
          v_array := private.member_master_jsonb_text_array(p_payload, v_key, false, 30, 100);
          p_payload := jsonb_set(p_payload, ARRAY[v_key], to_jsonb(COALESCE(v_array, ARRAY[]::text[])));
        END IF;
      END LOOP;
      v_personality := jsonb_populate_record(v_personality, p_payload);
      UPDATE public.member_personality SET
        extroversion = v_personality.extroversion,
        initiative = v_personality.initiative,
        expression_style_tags = v_personality.expression_style_tags,
        group_role_tags = v_personality.group_role_tags,
        warmup_speed = v_personality.warmup_speed,
        planning_style = v_personality.planning_style,
        coop_compete_tendency = v_personality.coop_compete_tendency,
        emotional_stability = v_personality.emotional_stability,
        boundary_strength = v_personality.boundary_strength,
        reply_speed = v_personality.reply_speed
      WHERE member_id = p_member_id;

    WHEN 'boundaries' THEN
      PERFORM private.member_master_validate_payload_keys(
        p_payload,
        ARRAY[
          'taboo_tags', 'deal_breakers', 'preferred_age_range',
          'preferred_gender_mix', 'boundary_notes'
        ]
      );
      INSERT INTO public.member_boundaries (member_id) VALUES (p_member_id)
      ON CONFLICT (member_id) DO NOTHING;
      SELECT * INTO v_boundaries FROM public.member_boundaries
      WHERE member_id = p_member_id FOR UPDATE;
      FOREACH v_key IN ARRAY ARRAY['taboo_tags', 'deal_breakers'] LOOP
        IF p_payload ? v_key THEN
          v_array := private.member_master_jsonb_text_array(p_payload, v_key, false, 50, 200);
          p_payload := jsonb_set(p_payload, ARRAY[v_key], to_jsonb(COALESCE(v_array, ARRAY[]::text[])));
        END IF;
      END LOOP;
      v_boundaries := jsonb_populate_record(v_boundaries, p_payload);
      UPDATE public.member_boundaries SET
        taboo_tags = v_boundaries.taboo_tags,
        deal_breakers = v_boundaries.deal_breakers,
        preferred_age_range = v_boundaries.preferred_age_range,
        preferred_gender_mix = v_boundaries.preferred_gender_mix,
        boundary_notes = v_boundaries.boundary_notes
      WHERE member_id = p_member_id;

    WHEN 'quiz' THEN
      PERFORM private.member_master_validate_payload_keys(
        p_payload,
        ARRAY[
          'answers', 'score_e', 'score_a', 'score_o', 'score_c', 'score_n',
          'personality_type', 'completed_at'
        ]
      );
      SELECT * INTO v_quiz
      FROM public.personality_quiz_results AS quiz
      WHERE quiz.member_id = p_member_id
      FOR UPDATE;
      IF v_quiz.id IS NULL
         AND NOT (p_payload ?& ARRAY[
           'answers', 'score_e', 'score_a', 'score_o', 'score_c', 'score_n'
         ]) THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'MEMBER_MASTER_REQUIRED_FIELDS_MISSING';
      END IF;
      IF p_payload ? 'answers'
         AND (
           jsonb_typeof(p_payload->'answers') <> 'array'
           OR jsonb_array_length(p_payload->'answers') > 100
         ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
      END IF;
      FOREACH v_key IN ARRAY ARRAY['score_e', 'score_a', 'score_o', 'score_c', 'score_n'] LOOP
        IF p_payload ? v_key
           AND (
             jsonb_typeof(p_payload->v_key) <> 'number'
             OR (p_payload->>v_key) !~ '^[0-9]{1,3}$'
             OR (p_payload->>v_key)::integer NOT BETWEEN 0 AND 100
           ) THEN
          RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
        END IF;
      END LOOP;
      IF p_payload ? 'personality_type'
         AND p_payload->'personality_type' <> 'null'::jsonb
         AND (
           jsonb_typeof(p_payload->'personality_type') <> 'string'
           OR char_length(p_payload->>'personality_type') > 100
         ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
      END IF;
      IF p_payload ? 'completed_at'
         AND p_payload->'completed_at' = 'null'::jsonb THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
      END IF;
      IF v_quiz.id IS NULL THEN
        v_quiz.id := gen_random_uuid();
        v_quiz.member_id := p_member_id;
        v_quiz.answers := '[]'::jsonb;
        v_quiz.completed_at := now();
      END IF;
      v_quiz := jsonb_populate_record(v_quiz, p_payload);
      INSERT INTO public.personality_quiz_results (
        id, member_id, answers, score_e, score_a, score_o, score_c, score_n,
        personality_type, completed_at
      ) VALUES (
        v_quiz.id, p_member_id, v_quiz.answers,
        v_quiz.score_e, v_quiz.score_a, v_quiz.score_o,
        v_quiz.score_c, v_quiz.score_n,
        v_quiz.personality_type, v_quiz.completed_at
      )
      ON CONFLICT (member_id) DO UPDATE SET
        answers = EXCLUDED.answers,
        score_e = EXCLUDED.score_e,
        score_a = EXCLUDED.score_a,
        score_o = EXCLUDED.score_o,
        score_c = EXCLUDED.score_c,
        score_n = EXCLUDED.score_n,
        personality_type = EXCLUDED.personality_type,
        completed_at = EXCLUDED.completed_at;

    WHEN 'application' THEN
      PERFORM private.member_master_validate_payload_keys(
        p_payload,
        ARRAY['status', 'interview_date', 'interviewer', 'attractiveness_score']
          || CASE WHEN p_is_restore THEN ARRAY[
            'profile_stage', 'onboarding_step', 'submitted_at'
          ] ELSE ARRAY[]::text[] END
      );
      IF p_payload ? 'status'
         AND COALESCE(p_payload->>'status', '') NOT IN (
           'pending', 'approved', 'rejected', 'inactive'
         ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
      END IF;
      IF p_payload ? 'interview_date'
         AND p_payload->'interview_date' <> 'null'::jsonb
         AND (
           jsonb_typeof(p_payload->'interview_date') <> 'string'
           OR (p_payload->>'interview_date') !~ '^\d{4}-\d{2}-\d{2}$'
         ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
      END IF;
      IF p_payload ? 'interviewer'
         AND p_payload->'interviewer' <> 'null'::jsonb
         AND (
           jsonb_typeof(p_payload->'interviewer') <> 'string'
           OR char_length(p_payload->>'interviewer') > 500
         ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
      END IF;
      IF p_payload ? 'attractiveness_score'
         AND p_payload->'attractiveness_score' <> 'null'::jsonb
         AND (
           jsonb_typeof(p_payload->'attractiveness_score') <> 'number'
           OR (p_payload->>'attractiveness_score') !~ '^[1-5]$'
         ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
      END IF;
      UPDATE public.members AS member SET
        status = CASE WHEN p_payload ? 'status' THEN p_payload->>'status' ELSE member.status END,
        interview_date = CASE WHEN p_payload ? 'interview_date' THEN (p_payload->>'interview_date')::date ELSE member.interview_date END,
        interviewer = CASE WHEN p_payload ? 'interviewer' THEN NULLIF(btrim(p_payload->>'interviewer'), '') ELSE member.interviewer END,
        attractiveness_score = CASE
          WHEN p_payload ? 'attractiveness_score'
            THEN (p_payload->>'attractiveness_score')::integer
          ELSE member.attractiveness_score
        END,
        profile_stage = CASE
          WHEN p_is_restore AND p_payload ? 'profile_stage'
            THEN p_payload->>'profile_stage'
          ELSE member.profile_stage
        END,
        onboarding_step = CASE
          WHEN p_is_restore AND p_payload ? 'onboarding_step'
            THEN (p_payload->>'onboarding_step')::smallint
          ELSE member.onboarding_step
        END,
        submitted_at = CASE
          WHEN p_is_restore AND p_payload ? 'submitted_at'
            THEN (p_payload->>'submitted_at')::timestamptz
          ELSE member.submitted_at
        END,
        updated_at = now()
      WHERE member.id = p_member_id;

    WHEN 'workflow' THEN
      PERFORM private.member_master_validate_payload_keys(
        p_payload, ARRAY['profile_stage', 'onboarding_step']
      );
      IF p_payload ? 'profile_stage'
         AND COALESCE(p_payload->>'profile_stage', '') NOT IN (
           'not_started', 'in_progress', 'submitted', 'complete'
         ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
      END IF;
      IF p_payload ? 'onboarding_step'
         AND (
           jsonb_typeof(p_payload->'onboarding_step') <> 'number'
           OR (p_payload->>'onboarding_step') !~ '^[0-4]$'
         ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
      END IF;
      SELECT
        CASE WHEN p_payload ? 'profile_stage' THEN p_payload->>'profile_stage'
          ELSE member.profile_stage END,
        CASE WHEN p_payload ? 'onboarding_step'
          THEN (p_payload->>'onboarding_step')::smallint
          ELSE member.onboarding_step END
      INTO v_profile_stage, v_onboarding_step
      FROM public.members AS member
      WHERE member.id = p_member_id;
      IF (v_profile_stage = 'not_started' AND v_onboarding_step <> 0)
         OR (v_profile_stage = 'in_progress' AND v_onboarding_step NOT BETWEEN 0 AND 3)
         OR (v_profile_stage IN ('submitted', 'complete') AND v_onboarding_step <> 4) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MEMBER_MASTER_WORKFLOW_STATE_INVALID';
      END IF;
      UPDATE public.members AS member SET
        profile_stage = CASE
          WHEN p_payload ? 'profile_stage' THEN p_payload->>'profile_stage'
          ELSE member.profile_stage
        END,
        onboarding_step = CASE
          WHEN p_payload ? 'onboarding_step'
            THEN (p_payload->>'onboarding_step')::smallint
          ELSE member.onboarding_step
        END,
        updated_at = now()
      WHERE member.id = p_member_id;

    WHEN 'verification' THEN
      PERFORM private.member_master_validate_payload_keys(
        p_payload, ARRAY['student_id_verified', 'photo_verified']
      );
      INSERT INTO public.member_verification (member_id)
      VALUES (p_member_id)
      ON CONFLICT (member_id) DO NOTHING;
      SELECT * INTO v_verification FROM public.member_verification
      WHERE member_id = p_member_id FOR UPDATE;
      v_verification := jsonb_populate_record(v_verification, p_payload);
      UPDATE public.member_verification SET
        student_id_verified = v_verification.student_id_verified,
        photo_verified = v_verification.photo_verified,
        verified_at = CASE
          WHEN v_verification.student_id_verified OR v_verification.photo_verified THEN now()
          ELSE NULL
        END,
        verified_by = CASE
          WHEN v_verification.student_id_verified OR v_verification.photo_verified THEN p_admin_id
          ELSE NULL
        END
      WHERE member_id = p_member_id;

    WHEN 'interview_evaluation' THEN
      PERFORM private.member_master_validate_payload_keys(
        p_payload,
        v_required_scores || ARRAY[
          'risk_level', 'risk_notes', 'interviewer_notes',
          'attractiveness_score', 'interviewer_id'
        ]
      );
      IF NOT p_is_restore AND p_payload ? 'interviewer_id' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
      END IF;
      IF p_is_restore AND p_payload ? 'interviewer_id' THEN
        p_admin_id := (p_payload->>'interviewer_id')::uuid;
      END IF;
      SELECT administrator.name INTO v_admin_name
      FROM public.admin_users AS administrator
      WHERE administrator.id = p_admin_id;
      IF v_admin_name IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'MEMBER_MASTER_ADMIN_NOT_FOUND';
      END IF;
      SELECT * INTO v_evaluation
      FROM public.interview_evaluations AS evaluation
      WHERE evaluation.member_id = p_member_id
        AND evaluation.interviewer_id = p_admin_id
      FOR UPDATE;
      IF v_evaluation.id IS NULL AND NOT (p_payload ?& v_required_scores) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MEMBER_MASTER_REQUIRED_FIELDS_MISSING';
      END IF;
      IF v_evaluation.id IS NULL THEN
        v_evaluation.id := gen_random_uuid();
        v_evaluation.member_id := p_member_id;
        v_evaluation.interviewer_id := p_admin_id;
        v_evaluation.risk_level := 'low';
      END IF;
      FOREACH v_key IN ARRAY v_required_scores LOOP
        IF p_payload ? v_key
           AND (
             jsonb_typeof(p_payload->v_key) <> 'number'
             OR (p_payload->>v_key)::integer NOT BETWEEN 1 AND 5
           ) THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
        END IF;
      END LOOP;
      v_evaluation := jsonb_populate_record(v_evaluation, p_payload - 'interviewer_id');
      v_evaluation.interviewer_id := p_admin_id;
      v_evaluation.interviewer_name := v_admin_name;
      INSERT INTO public.interview_evaluations (
        id, member_id, interviewer_id, interviewer_name,
        communication, articulation, enthusiasm, sincerity, social_comfort,
        humor, emotional_stability, boundary_respect, team_orientation,
        interest_alignment, japanese_ability, time_commitment,
        leadership_potential, openness, responsibility, first_impression,
        overall_recommendation, risk_level, risk_notes, interviewer_notes,
        attractiveness_score
      ) VALUES (
        v_evaluation.id, p_member_id, p_admin_id, v_admin_name,
        v_evaluation.communication, v_evaluation.articulation,
        v_evaluation.enthusiasm, v_evaluation.sincerity,
        v_evaluation.social_comfort, v_evaluation.humor,
        v_evaluation.emotional_stability, v_evaluation.boundary_respect,
        v_evaluation.team_orientation, v_evaluation.interest_alignment,
        v_evaluation.japanese_ability, v_evaluation.time_commitment,
        v_evaluation.leadership_potential, v_evaluation.openness,
        v_evaluation.responsibility, v_evaluation.first_impression,
        v_evaluation.overall_recommendation, v_evaluation.risk_level,
        v_evaluation.risk_notes, v_evaluation.interviewer_notes,
        v_evaluation.attractiveness_score
      )
      ON CONFLICT (member_id, interviewer_id) DO UPDATE SET
        interviewer_name = EXCLUDED.interviewer_name,
        communication = EXCLUDED.communication,
        articulation = EXCLUDED.articulation,
        enthusiasm = EXCLUDED.enthusiasm,
        sincerity = EXCLUDED.sincerity,
        social_comfort = EXCLUDED.social_comfort,
        humor = EXCLUDED.humor,
        emotional_stability = EXCLUDED.emotional_stability,
        boundary_respect = EXCLUDED.boundary_respect,
        team_orientation = EXCLUDED.team_orientation,
        interest_alignment = EXCLUDED.interest_alignment,
        japanese_ability = EXCLUDED.japanese_ability,
        time_commitment = EXCLUDED.time_commitment,
        leadership_potential = EXCLUDED.leadership_potential,
        openness = EXCLUDED.openness,
        responsibility = EXCLUDED.responsibility,
        first_impression = EXCLUDED.first_impression,
        overall_recommendation = EXCLUDED.overall_recommendation,
        risk_level = EXCLUDED.risk_level,
        risk_notes = EXCLUDED.risk_notes,
        interviewer_notes = EXCLUDED.interviewer_notes,
        attractiveness_score = EXCLUDED.attractiveness_score;

    WHEN 'account' THEN
      PERFORM private.member_master_validate_payload_keys(
        p_payload,
        ARRAY[
          'member_number', 'membership_type', 'user_id', 'email',
          'line_user_id', 'wechat_openid', 'record_source'
        ] || CASE WHEN p_is_restore THEN ARRAY[
          'account_status', 'account_linked_at'
        ] ELSE ARRAY[]::text[] END
      );
      IF p_payload ? 'user_id' AND p_payload->'user_id' <> 'null'::jsonb THEN
        v_user_id := (p_payload->>'user_id')::uuid;
        IF EXISTS (
          SELECT 1 FROM private.member_auth_tombstones AS tombstone
          WHERE tombstone.auth_user_id = v_user_id
        ) THEN
          RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'MEMBER_MASTER_AUTH_TOMBSTONED';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM auth.users AS auth_user WHERE auth_user.id = v_user_id)
           OR EXISTS (
             SELECT 1 FROM public.members AS other_member
             WHERE other_member.user_id = v_user_id AND other_member.id <> p_member_id
           ) THEN
          RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'MEMBER_MASTER_AUTH_LINK_CONFLICT';
        END IF;
      ELSE
        v_user_id := NULL;
      END IF;
      IF p_payload ? 'email' AND p_payload->'email' <> 'null'::jsonb THEN
        v_email := lower(NULLIF(btrim(p_payload->>'email'), ''));
        IF v_email IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.members AS other_member
          WHERE other_member.id <> p_member_id
            AND other_member.email IS NOT NULL
            AND lower(btrim(other_member.email)) = v_email
        ) THEN
          RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'MEMBER_MASTER_EMAIL_CONFLICT';
        END IF;
      ELSE
        v_email := NULL;
      END IF;
      UPDATE public.members AS member SET
        member_number = CASE WHEN p_payload ? 'member_number' THEN NULLIF(btrim(p_payload->>'member_number'), '') ELSE member.member_number END,
        membership_type = CASE WHEN p_payload ? 'membership_type' THEN p_payload->>'membership_type' ELSE member.membership_type END,
        user_id = CASE WHEN p_payload ? 'user_id' THEN v_user_id ELSE member.user_id END,
        email = CASE WHEN p_payload ? 'email' THEN v_email ELSE member.email END,
        line_user_id = CASE WHEN p_payload ? 'line_user_id' THEN NULLIF(btrim(p_payload->>'line_user_id'), '') ELSE member.line_user_id END,
        wechat_openid = CASE WHEN p_payload ? 'wechat_openid' THEN NULLIF(btrim(p_payload->>'wechat_openid'), '') ELSE member.wechat_openid END,
        record_source = CASE WHEN p_payload ? 'record_source' THEN p_payload->>'record_source' ELSE member.record_source END,
        account_status = CASE
          WHEN p_is_restore AND p_payload ? 'account_status'
            THEN p_payload->>'account_status'
          ELSE member.account_status
        END,
        account_linked_at = CASE
          WHEN p_is_restore AND p_payload ? 'account_linked_at'
            THEN (p_payload->>'account_linked_at')::timestamptz
          WHEN p_payload ? 'user_id' AND v_user_id IS NOT NULL
            AND member.user_id IS DISTINCT FROM v_user_id THEN now()
          ELSE member.account_linked_at
        END,
        updated_at = now()
      WHERE member.id = p_member_id;

    WHEN 'roles' THEN
      PERFORM private.member_master_validate_payload_keys(p_payload, ARRAY['roles']);
      v_array := private.member_master_jsonb_text_array(p_payload, 'roles', true, 3, 64);
      IF EXISTS (
        SELECT 1 FROM unnest(v_array) AS requested(role_key)
        WHERE requested.role_key NOT IN ('volunteer', 'community_moderator', 'operations')
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
      END IF;
      FOREACH v_role IN ARRAY ARRAY['volunteer', 'community_moderator', 'operations'] LOOP
        PERFORM private.member_master_set_role(
          p_member_id, v_role, v_role = ANY(v_array), 'admin', 'Administrator role section update'
        );
      END LOOP;

    ELSE
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'MEMBER_MASTER_SECTION_INVALID';
  END CASE;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_member_section(
  p_member_id uuid,
  p_section text,
  p_payload jsonb,
  p_reason text,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_id uuid := private.member_master_current_admin_id();
  v_is_super boolean := private.member_master_is_super_admin();
  v_admin_name text;
  v_member_updated_at timestamptz;
  v_member_anonymized_at timestamptz;
  v_before jsonb;
  v_after jsonb;
  v_changed text[];
  v_event_id bigint;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_ADMIN_REQUIRED';
  END IF;
  IF p_section IN ('account', 'roles', 'quiz', 'workflow') AND NOT v_is_super THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_SUPER_ADMIN_REQUIRED';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_REASON_REQUIRED';
  END IF;

  SELECT member.updated_at, member.anonymized_at
  INTO v_member_updated_at, v_member_anonymized_at
  FROM public.members AS member
  WHERE member.id = p_member_id
  FOR UPDATE;
  IF v_member_updated_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_NOT_FOUND';
  END IF;
  IF v_member_anonymized_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MEMBER_MASTER_ANONYMIZED_RECORD_LOCKED';
  END IF;
  IF p_expected_updated_at IS NOT NULL
     AND v_member_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'MEMBER_MASTER_VERSION_CONFLICT';
  END IF;

  v_before := private.member_master_section_snapshot(p_member_id, p_section, v_admin_id);
  SELECT administrator.name INTO v_admin_name
  FROM public.admin_users AS administrator WHERE administrator.id = v_admin_id;

  PERFORM set_config('app.member_master_explicit_audit', 'on', true);
  PERFORM set_config('app.member_master_skip_member_audit', 'on', true);
  PERFORM private.member_master_apply_admin_section(
    p_member_id, p_section, p_payload, v_admin_id, false
  );
  UPDATE public.members SET updated_at = now() WHERE id = p_member_id
  RETURNING updated_at INTO v_member_updated_at;
  v_after := private.member_master_section_snapshot(p_member_id, p_section, v_admin_id);
  v_changed := private.member_master_changed_fields(v_before, v_after);

  IF cardinality(v_changed) > 0 THEN
    INSERT INTO private.member_profile_audit_log (
      member_id, member_id_snapshot, action_type, section, changed_fields,
      before_values, after_values, reason, source,
      actor_user_id, actor_admin_id, actor_name
    ) VALUES (
      p_member_id, p_member_id, 'admin_section_update', p_section, v_changed,
      v_before, v_after, btrim(p_reason), 'admin',
      (SELECT auth.uid()), v_admin_id, v_admin_name
    ) RETURNING id INTO v_event_id;
  END IF;

  RETURN jsonb_build_object(
    'member_id', p_member_id,
    'section', p_section,
    'updated_at', v_member_updated_at,
    'changed_fields', v_changed,
    'event_id', v_event_id,
    'data', v_after
  );
END
$function$;

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
     ) THEN
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
  UPDATE public.members SET updated_at = now()
  WHERE id = v_source_event.member_id_snapshot
  RETURNING updated_at INTO v_updated_at;
  v_after := private.member_master_section_snapshot(
    v_source_event.member_id_snapshot, v_source_event.section,
    COALESCE(v_target_admin_id, v_admin_id)
  );
  v_changed := private.member_master_changed_fields(v_before, v_after);

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

-- ---------------------------------------------------------------------------
-- Narrow authenticated onboarding RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_my_member_record()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_auth_email text;
  v_safe_email text;
  v_member public.members%ROWTYPE;
  v_created boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '28000',
      MESSAGE = 'MEMBER_MASTER_AUTH_REQUIRED';
  END IF;

  -- A banned account can retain an already-issued JWT. If anonymization has
  -- unlinked its member row, this durable tombstone prevents recreation and
  -- still returns enough lifecycle state for the inactive/closed route.
  IF EXISTS (
    SELECT 1 FROM private.member_auth_tombstones AS tombstone
    WHERE tombstone.auth_user_id = v_user_id
  ) THEN
    RETURN (
      SELECT jsonb_build_object(
        'member_id', tombstone.member_id_snapshot,
        'created', false,
        'status', tombstone.status,
        'account_status', tombstone.account_status,
        'profile_stage', tombstone.profile_stage,
        'record_source', tombstone.record_source,
        'onboarding_step', tombstone.onboarding_step,
        'last_profile_saved_at', tombstone.last_profile_saved_at,
        'submitted_at', tombstone.submitted_at,
        'anonymized_at', tombstone.anonymized_at
      )
      FROM private.member_auth_tombstones AS tombstone
      WHERE tombstone.auth_user_id = v_user_id
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('member:' || v_user_id::text, 0));

  -- Anonymization takes the same lock before unlinking the Auth account. A
  -- second tombstone read after acquiring it closes the old-JWT race where an
  -- erasure could commit between the first read and canonical-row lookup.
  IF EXISTS (
    SELECT 1 FROM private.member_auth_tombstones AS tombstone
    WHERE tombstone.auth_user_id = v_user_id
  ) THEN
    RETURN (
      SELECT jsonb_build_object(
        'member_id', tombstone.member_id_snapshot,
        'created', false,
        'status', tombstone.status,
        'account_status', tombstone.account_status,
        'profile_stage', tombstone.profile_stage,
        'record_source', tombstone.record_source,
        'onboarding_step', tombstone.onboarding_step,
        'last_profile_saved_at', tombstone.last_profile_saved_at,
        'submitted_at', tombstone.submitted_at,
        'anonymized_at', tombstone.anonymized_at
      )
      FROM private.member_auth_tombstones AS tombstone
      WHERE tombstone.auth_user_id = v_user_id
    );
  END IF;

  SELECT * INTO v_member
  FROM public.members AS member
  WHERE member.user_id = v_user_id
  FOR UPDATE;

  IF v_member.id IS NULL THEN
    -- Recheck after the member-row lock boundary. A concurrent privacy erase
    -- may have committed its tombstone and unlinked user_id while this call
    -- waited on FOR UPDATE; using only the optimistic check above could then
    -- recreate a second active canonical row from the old JWT.
    IF EXISTS (
      SELECT 1 FROM private.member_auth_tombstones AS tombstone
      WHERE tombstone.auth_user_id = v_user_id
    ) THEN
      RETURN (
        SELECT jsonb_build_object(
          'member_id', tombstone.member_id_snapshot,
          'created', false,
          'status', tombstone.status,
          'account_status', tombstone.account_status,
          'profile_stage', tombstone.profile_stage,
          'record_source', tombstone.record_source,
          'onboarding_step', tombstone.onboarding_step,
          'last_profile_saved_at', tombstone.last_profile_saved_at,
          'submitted_at', tombstone.submitted_at,
          'anonymized_at', tombstone.anonymized_at
        )
        FROM private.member_auth_tombstones AS tombstone
        WHERE tombstone.auth_user_id = v_user_id
      );
    END IF;

    SELECT lower(btrim(auth_user.email))
    INTO v_auth_email
    FROM auth.users AS auth_user
    WHERE auth_user.id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '28000',
        MESSAGE = 'MEMBER_MASTER_AUTH_REQUIRED';
    END IF;

    v_safe_email := CASE
      WHEN v_auth_email IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.members AS email_owner
         WHERE email_owner.email IS NOT NULL
           AND lower(btrim(email_owner.email)) = v_auth_email
       )
      THEN v_auth_email
      ELSE NULL
    END;

    BEGIN
      INSERT INTO public.members (
        user_id, email, status, account_status, profile_stage, record_source,
        onboarding_step, account_linked_at
      ) VALUES (
        v_user_id, v_safe_email, 'pending', 'active', 'not_started', 'app',
        0, now()
      )
      RETURNING * INTO v_member;
      v_created := true;
    EXCEPTION
      WHEN unique_violation THEN
        -- A concurrent email claim must never bind or merge another row. Retry
        -- with no duplicated business email; the Auth email remains available
        -- to administrators through the secure directory RPC.
        INSERT INTO public.members (
          user_id, email, status, account_status, profile_stage, record_source,
          onboarding_step, account_linked_at
        ) VALUES (
          v_user_id, NULL, 'pending', 'active', 'not_started', 'app',
          0, now()
        )
        ON CONFLICT DO NOTHING
        RETURNING * INTO v_member;

        IF v_member.id IS NULL THEN
          SELECT * INTO v_member
          FROM public.members AS member
          WHERE member.user_id = v_user_id
          FOR UPDATE;
        ELSE
          v_created := true;
        END IF;
    END;

    IF v_auth_email IS NOT NULL THEN
      INSERT INTO private.member_duplicate_candidates (
        left_member_id, right_member_id,
        left_member_id_snapshot, right_member_id_snapshot,
        match_fields, evidence, candidate_source
      )
      SELECT
        LEAST(v_member.id, duplicate.id),
        GREATEST(v_member.id, duplicate.id),
        LEAST(v_member.id, duplicate.id),
        GREATEST(v_member.id, duplicate.id),
        ARRAY['email']::text[],
        jsonb_build_object(
          'normalized_email', v_auth_email,
          'auth_user_id', v_user_id,
          'automatic_merge_performed', false
        ),
        'auth_email'
      FROM public.members AS duplicate
      WHERE duplicate.id <> v_member.id
        AND duplicate.email IS NOT NULL
        AND lower(btrim(duplicate.email)) = v_auth_email
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'member_id', v_member.id,
    'created', v_created,
    'status', v_member.status,
    'account_status', v_member.account_status,
    'profile_stage', v_member.profile_stage,
    'record_source', v_member.record_source,
    'onboarding_step', v_member.onboarding_step,
    'last_profile_saved_at', v_member.last_profile_saved_at,
    'submitted_at', v_member.submitted_at
  );
END
$function$;

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
        'full_name', 'nickname', 'gender', 'age_range', 'nationality',
        'current_city'
      ]
    );
    IF NOT (p_payload ?& ARRAY['full_name', 'gender', 'age_range', 'nationality', 'current_city'])
       OR jsonb_typeof(p_payload->'full_name') <> 'string'
       OR jsonb_typeof(p_payload->'gender') <> 'string'
       OR jsonb_typeof(p_payload->'age_range') <> 'string'
       OR jsonb_typeof(p_payload->'nationality') <> 'string'
       OR jsonb_typeof(p_payload->'current_city') <> 'string'
       OR char_length(btrim(p_payload->>'full_name')) NOT BETWEEN 1 AND 100
       OR (p_payload->>'gender') NOT IN ('male', 'female', 'other')
       OR char_length(btrim(p_payload->>'age_range')) NOT BETWEEN 1 AND 40
       OR char_length(btrim(p_payload->>'nationality')) NOT BETWEEN 1 AND 100
       OR char_length(btrim(p_payload->>'current_city')) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'MEMBER_MASTER_REQUIRED_FIELDS_MISSING';
    END IF;

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
      member_id, full_name, nickname, gender, age_range, nationality, current_city
    ) VALUES (
      v_member_id,
      btrim(p_payload->>'full_name'),
      v_nickname,
      p_payload->>'gender',
      btrim(p_payload->>'age_range'),
      btrim(p_payload->>'nationality'),
      btrim(p_payload->>'current_city')
    )
    ON CONFLICT (member_id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      nickname = EXCLUDED.nickname,
      gender = EXCLUDED.gender,
      age_range = EXCLUDED.age_range,
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

REVOKE ALL ON FUNCTION public.ensure_my_member_record()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_my_onboarding_step(smallint, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_my_onboarding()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_my_member_record() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_my_onboarding_step(smallint, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_my_onboarding() TO authenticated;

CREATE INDEX IF NOT EXISTS members_directory_state_created_idx
  ON public.members (account_status, profile_stage, created_at DESC, id);
CREATE INDEX IF NOT EXISTS members_record_source_created_idx
  ON public.members (record_source, created_at DESC, id);
CREATE INDEX IF NOT EXISTS members_submitted_at_idx
  ON public.members (submitted_at DESC, id)
  WHERE submitted_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Permanent append-only audit log
-- ---------------------------------------------------------------------------

ALTER TABLE private.member_profile_audit_log
  ADD COLUMN IF NOT EXISTS member_id_snapshot uuid,
  ADD COLUMN IF NOT EXISTS section text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS restored_from_event_id bigint,
  ADD COLUMN IF NOT EXISTS request_id uuid,
  ADD COLUMN IF NOT EXISTS event_schema_version smallint,
  ADD COLUMN IF NOT EXISTS metadata jsonb,
  ADD COLUMN IF NOT EXISTS actor_role_snapshot text;

UPDATE private.member_profile_audit_log
SET
  member_id_snapshot = COALESCE(member_id_snapshot, member_id),
  source = COALESCE(source, 'legacy_profile'),
  event_schema_version = COALESCE(event_schema_version, 1),
  metadata = COALESCE(metadata, '{}'::jsonb),
  actor_role_snapshot = COALESCE(
    actor_role_snapshot,
    (
      SELECT administrator.role
      FROM public.admin_users AS administrator
      WHERE administrator.id = private.member_profile_audit_log.actor_admin_id
    ),
    CASE
      WHEN actor_user_id IS NOT NULL THEN 'authenticated'
      ELSE 'system'
    END
  );

ALTER TABLE private.member_profile_audit_log
  ALTER COLUMN member_id SET NOT NULL,
  ALTER COLUMN member_id_snapshot SET NOT NULL,
  ALTER COLUMN source SET DEFAULT 'legacy_profile',
  ALTER COLUMN source SET NOT NULL,
  ALTER COLUMN event_schema_version SET DEFAULT 1,
  ALTER COLUMN event_schema_version SET NOT NULL,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN metadata SET NOT NULL,
  ALTER COLUMN actor_role_snapshot SET DEFAULT 'system',
  ALTER COLUMN actor_role_snapshot SET NOT NULL;

DO $do$
DECLARE
  constraint_row record;
BEGIN
  -- Audit rows are physically immutable. ON DELETE SET NULL/CASCADE foreign
  -- keys would internally UPDATE/DELETE an audit row and conflict with that
  -- guarantee, so external-subject FKs are intentionally removed. UUID
  -- snapshots remain durable identifiers even after a subject is removed.
  FOR constraint_row IN
    SELECT DISTINCT constraint_info.conname
    FROM pg_constraint AS constraint_info
    WHERE constraint_info.conrelid = 'private.member_profile_audit_log'::regclass
      AND constraint_info.contype = 'f'
      AND constraint_info.confrelid IN (
        'public.members'::regclass,
        'public.admin_users'::regclass,
        'auth.users'::regclass
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE private.member_profile_audit_log DROP CONSTRAINT %I',
      constraint_row.conname
    );
  END LOOP;

  -- The old migration allowed only three action types. Drop only checks that
  -- reference action_type, then install the backwards-compatible superset.
  FOR constraint_row IN
    SELECT constraint_info.conname
    FROM pg_constraint AS constraint_info
    WHERE constraint_info.conrelid = 'private.member_profile_audit_log'::regclass
      AND constraint_info.contype = 'c'
      AND pg_get_constraintdef(constraint_info.oid) ILIKE '%action_type%'
  LOOP
    EXECUTE format(
      'ALTER TABLE private.member_profile_audit_log DROP CONSTRAINT %I',
      constraint_row.conname
    );
  END LOOP;

  ALTER TABLE private.member_profile_audit_log
    ADD CONSTRAINT member_profile_audit_log_action_type_check
    CHECK (
      action_type IN (
        'profile_update', 'metrics_update', 'activity_recalculate',
        'member_created', 'member_lifecycle_update',
        'onboarding_step_saved', 'onboarding_submitted',
        'admin_section_update', 'admin_restore',
        'account_status_change', 'member_anonymized',
        'role_assignment_update', 'duplicate_resolution',
        'service_identity_link', 'member_hard_deleted',
        'auth_delete_completed', 'related_record_change',
        'anonymous_author_revealed', 'member_import_event',
        'round_submission_import_snapshot'
      )
    );

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'private.member_profile_audit_log'::regclass
      AND conname = 'member_profile_audit_log_source_check'
  ) THEN
    ALTER TABLE private.member_profile_audit_log
      ADD CONSTRAINT member_profile_audit_log_source_check
      CHECK (source IN (
        'legacy_profile', 'app', 'onboarding', 'admin', 'restore', 'system',
        'migration', 'line', 'line_self_service', 'import', 'legacy'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'private.member_profile_audit_log'::regclass
      AND conname = 'member_profile_audit_log_restored_from_event_id_fkey'
  ) THEN
    ALTER TABLE private.member_profile_audit_log
      ADD CONSTRAINT member_profile_audit_log_restored_from_event_id_fkey
      FOREIGN KEY (restored_from_event_id)
      REFERENCES private.member_profile_audit_log(id) ON DELETE RESTRICT;
  END IF;
END
$do$;

CREATE INDEX IF NOT EXISTS member_profile_audit_snapshot_created_idx
  ON private.member_profile_audit_log (member_id_snapshot, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS member_profile_audit_restored_from_idx
  ON private.member_profile_audit_log (restored_from_event_id)
  WHERE restored_from_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.member_master_prepare_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  NEW.member_id_snapshot := COALESCE(NEW.member_id_snapshot, NEW.member_id);
  IF NEW.member_id_snapshot IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23502',
      MESSAGE = 'MEMBER_MASTER_AUDIT_MEMBER_REQUIRED';
  END IF;
  NEW.source := COALESCE(NULLIF(NEW.source, ''), 'system');
  NEW.event_schema_version := COALESCE(NEW.event_schema_version, 1);
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.actor_role_snapshot := CASE
    WHEN NEW.actor_admin_id IS NOT NULL THEN COALESCE(
      (
        SELECT administrator.role
        FROM public.admin_users AS administrator
        WHERE administrator.id = NEW.actor_admin_id
      ),
      'admin'
    )
    WHEN COALESCE((SELECT auth.jwt()->>'role'), '') = 'service_role'
      THEN 'service_role'
    WHEN NEW.actor_user_id IS NOT NULL THEN 'authenticated'
    ELSE COALESCE(NULLIF(NEW.actor_role_snapshot, ''), 'system')
  END;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION private.member_master_reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'MEMBER_MASTER_AUDIT_APPEND_ONLY';
END
$function$;

-- Preserve the historical direct-write audit trigger, but let the new atomic
-- onboarding/admin RPCs suppress that narrower duplicate event. Direct legacy
-- writes still receive the original profile_update audit coverage.
CREATE OR REPLACE FUNCTION private.profile_log_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fields text[] := ARRAY[]::text[];
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF COALESCE(current_setting('app.member_master_explicit_audit', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF OLD.full_name IS DISTINCT FROM NEW.full_name THEN v_fields := array_append(v_fields, 'full_name'); END IF;
  IF OLD.gender IS DISTINCT FROM NEW.gender THEN v_fields := array_append(v_fields, 'gender'); END IF;
  IF OLD.nickname IS DISTINCT FROM NEW.nickname THEN v_fields := array_append(v_fields, 'nickname'); END IF;
  IF OLD.school_name IS DISTINCT FROM NEW.school_name THEN v_fields := array_append(v_fields, 'school_name'); END IF;
  IF OLD.department IS DISTINCT FROM NEW.department THEN v_fields := array_append(v_fields, 'department'); END IF;
  IF OLD.personal_avatar_path IS DISTINCT FROM NEW.personal_avatar_path THEN v_fields := array_append(v_fields, 'personal_avatar_path'); END IF;
  IF cardinality(v_fields) = 0 THEN
    RETURN NEW;
  END IF;

  v_before := jsonb_build_object(
    'full_name', OLD.full_name, 'gender', OLD.gender, 'nickname', OLD.nickname,
    'school_name', OLD.school_name, 'department', OLD.department,
    'personal_avatar_path', OLD.personal_avatar_path
  );
  v_after := jsonb_build_object(
    'full_name', NEW.full_name, 'gender', NEW.gender, 'nickname', NEW.nickname,
    'school_name', NEW.school_name, 'department', NEW.department,
    'personal_avatar_path', NEW.personal_avatar_path
  );

  INSERT INTO private.member_profile_audit_log (
    member_id, member_id_snapshot, action_type, section, changed_fields,
    before_values, after_values, source,
    actor_user_id, actor_admin_id, actor_name
  ) VALUES (
    NEW.member_id, NEW.member_id, 'profile_update', 'identity', v_fields,
    v_before, v_after, 'legacy_profile', (SELECT auth.uid()),
    private.profile_current_admin_id(),
    (
      SELECT administrator.name FROM public.admin_users AS administrator
      WHERE administrator.id = private.profile_current_admin_id()
    )
  );
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS member_profile_audit_prepare
  ON private.member_profile_audit_log;
CREATE TRIGGER member_profile_audit_prepare
  BEFORE INSERT ON private.member_profile_audit_log
  FOR EACH ROW EXECUTE FUNCTION private.member_master_prepare_audit_event();

DROP TRIGGER IF EXISTS member_profile_audit_append_only
  ON private.member_profile_audit_log;
CREATE TRIGGER member_profile_audit_append_only
  BEFORE UPDATE OR DELETE ON private.member_profile_audit_log
  FOR EACH ROW EXECUTE FUNCTION private.member_master_reject_audit_mutation();

ALTER TABLE private.member_profile_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.member_profile_audit_log
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE private.member_profile_audit_log TO service_role;
REVOKE ALL ON SEQUENCE private.member_profile_audit_log_id_seq
  FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE private.member_profile_audit_log_id_seq
  TO service_role;

-- ---------------------------------------------------------------------------
-- Roles, duplicate candidates and optional staff link
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS private.member_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  role_key text NOT NULL CHECK (role_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  reason text,
  source text NOT NULL DEFAULT 'admin'
    CHECK (source IN ('migration', 'app', 'admin', 'import', 'legacy')),
  CHECK (revoked_at IS NULL OR revoked_at >= assigned_at),
  CHECK (revoked_by IS NULL OR revoked_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS member_role_assignments_active_uidx
  ON private.member_role_assignments (member_id, role_key)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS member_role_assignments_member_history_idx
  ON private.member_role_assignments (member_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS member_role_assignments_assigned_by_idx
  ON private.member_role_assignments (assigned_by)
  WHERE assigned_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS member_role_assignments_revoked_by_idx
  ON private.member_role_assignments (revoked_by)
  WHERE revoked_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS private.member_duplicate_candidates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  left_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  right_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  left_member_id_snapshot uuid NOT NULL,
  right_member_id_snapshot uuid NOT NULL,
  match_fields text[] NOT NULL DEFAULT '{}',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed_duplicate', 'not_duplicate', 'merged')),
  candidate_source text NOT NULL DEFAULT 'system'
    CHECK (candidate_source IN (
      'auth_email', 'member_email', 'phone_name', 'legacy_member_number',
      'legacy_name_school', 'legacy_claim', 'admin', 'import', 'system'
    )),
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  resolved_by_snapshot uuid,
  resolution_reason text,
  CHECK (left_member_id_snapshot <> right_member_id_snapshot),
  CHECK (
    (status = 'pending' AND resolved_at IS NULL
      AND resolved_by IS NULL AND resolved_by_snapshot IS NULL)
    OR
    (status <> 'pending' AND resolved_at IS NOT NULL
      AND resolved_by_snapshot IS NOT NULL
      AND NULLIF(btrim(resolution_reason), '') IS NOT NULL)
  )
);

-- Durable Auth tombstones prevent an already-issued JWT from recreating a new
-- active member master after the safe ban -> anonymize/unlink -> Auth delete
-- workflow has removed members.user_id. No foreign keys are intentional: the
-- tombstone must outlive both Auth and member-row deletion.
CREATE TABLE IF NOT EXISTS private.member_auth_tombstones (
  auth_user_id uuid PRIMARY KEY,
  member_id_snapshot uuid NOT NULL,
  status text NOT NULL,
  account_status text NOT NULL DEFAULT 'closed'
    CHECK (account_status = 'closed'),
  profile_stage text NOT NULL,
  record_source text NOT NULL,
  onboarding_step smallint NOT NULL CHECK (onboarding_step BETWEEN 0 AND 4),
  last_profile_saved_at timestamptz,
  submitted_at timestamptz,
  anonymized_at timestamptz NOT NULL,
  created_by_snapshot uuid,
  auth_delete_completed_at timestamptz,
  auth_delete_completed_by_snapshot uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS member_auth_tombstones_member_snapshot_idx
  ON private.member_auth_tombstones (member_id_snapshot);

-- Shared operational notes cannot be attributed safely to one participant.
-- Privacy erasure removes the text, while this PII-free marker tells operators
-- which business record may need a new, non-personal replacement note.
CREATE TABLE IF NOT EXISTS private.member_privacy_review_queue (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_id_snapshot uuid NOT NULL,
  entity_table text NOT NULL CHECK (entity_table = 'activity_records'),
  entity_id uuid NOT NULL,
  field_names text[] NOT NULL CHECK (
    cardinality(field_names) > 0
    AND field_names <@ ARRAY['notes']::text[]
  ),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved', 'waived')),
  queued_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by_snapshot uuid,
  resolution_note text,
  CHECK (
    (status = 'pending' AND resolved_at IS NULL
      AND resolved_by_snapshot IS NULL AND resolution_note IS NULL)
    OR
    (status <> 'pending' AND resolved_at IS NOT NULL
      AND resolved_by_snapshot IS NOT NULL
      AND char_length(btrim(resolution_note)) BETWEEN 4 AND 1000)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS member_privacy_review_queue_pending_uidx
  ON private.member_privacy_review_queue (
    member_id_snapshot, entity_table, entity_id
  )
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS member_privacy_review_queue_status_idx
  ON private.member_privacy_review_queue (status, queued_at, id);

ALTER TABLE public.legacy_members
  ADD COLUMN IF NOT EXISTS canonical_member_id uuid;
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.legacy_members'::regclass
      AND conname = 'legacy_members_canonical_member_id_fkey'
  ) THEN
    ALTER TABLE public.legacy_members
      ADD CONSTRAINT legacy_members_canonical_member_id_fkey
      FOREIGN KEY (canonical_member_id)
      REFERENCES public.members(id) ON DELETE RESTRICT;
  END IF;
END
$do$;
CREATE INDEX IF NOT EXISTS legacy_members_canonical_member_idx
  ON public.legacy_members (canonical_member_id)
  WHERE canonical_member_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS member_duplicate_candidates_pair_uidx
  ON private.member_duplicate_candidates (
    LEAST(left_member_id_snapshot, right_member_id_snapshot),
    GREATEST(left_member_id_snapshot, right_member_id_snapshot)
  )
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS member_duplicate_candidates_left_idx
  ON private.member_duplicate_candidates (left_member_id)
  WHERE left_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS member_duplicate_candidates_right_idx
  ON private.member_duplicate_candidates (right_member_id)
  WHERE right_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS member_duplicate_candidates_queue_idx
  ON private.member_duplicate_candidates (status, detected_at, id);
CREATE INDEX IF NOT EXISTS member_duplicate_candidates_resolved_by_idx
  ON private.member_duplicate_candidates (resolved_by)
  WHERE resolved_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS member_duplicate_candidates_resolved_by_snapshot_idx
  ON private.member_duplicate_candidates (resolved_by_snapshot)
  WHERE resolved_by_snapshot IS NOT NULL;

ALTER TABLE private.member_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.member_duplicate_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.member_auth_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.member_privacy_review_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE
  private.member_role_assignments,
  private.member_duplicate_candidates,
  private.member_auth_tombstones,
  private.member_privacy_review_queue
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE
  private.member_role_assignments,
  private.member_duplicate_candidates,
  private.member_privacy_review_queue
TO service_role;
REVOKE ALL ON SEQUENCE private.member_duplicate_candidates_id_seq
  FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE private.member_duplicate_candidates_id_seq
  TO service_role;
REVOKE ALL ON SEQUENCE private.member_privacy_review_queue_id_seq
  FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE private.member_privacy_review_queue_id_seq
  TO service_role;

-- Staff cards use their own public bucket. Anonymization queues the old
-- managed object for deletion through the existing maintenance worker, so the
-- durable queue must accept that bucket as well as the two community buckets.
ALTER TABLE private.community_media_cleanup_queue
  DROP CONSTRAINT IF EXISTS community_media_cleanup_queue_bucket_id_check;
ALTER TABLE private.community_media_cleanup_queue
  ADD CONSTRAINT community_media_cleanup_queue_bucket_id_check
  CHECK (bucket_id IN (
    'community-avatars', 'community-media', 'staff-avatars'
  ));

DO $do$
BEGIN
  IF to_regclass('public.staff_profiles') IS NOT NULL THEN
    ALTER TABLE public.staff_profiles
      ADD COLUMN IF NOT EXISTS member_id uuid;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.staff_profiles'::regclass
        AND conname = 'staff_profiles_member_id_fkey'
    ) THEN
      ALTER TABLE public.staff_profiles
        ADD CONSTRAINT staff_profiles_member_id_fkey
        FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE SET NULL;
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS staff_profiles_member_id_uidx
      ON public.staff_profiles (member_id)
      WHERE member_id IS NOT NULL;
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- Internal helpers and lifecycle/audit triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.member_master_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users AS administrator
    WHERE administrator.user_id = (SELECT auth.uid())
  )
$function$;

CREATE OR REPLACE FUNCTION private.member_master_is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users AS administrator
    WHERE administrator.user_id = (SELECT auth.uid())
      AND administrator.role = 'super_admin'
  )
$function$;

CREATE OR REPLACE FUNCTION private.member_master_current_admin_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT administrator.id
  FROM public.admin_users AS administrator
  WHERE administrator.user_id = (SELECT auth.uid())
  LIMIT 1
$function$;

-- Acquire canonical rows in deterministic UUID order before any dependent
-- write. FOR KEY SHARE conflicts with anonymization's FOR UPDATE, so a writer
-- that started from an old snapshot waits for erasure to commit and then sees
-- anonymized_at instead of reintroducing PII after the scrub pass.
CREATE OR REPLACE FUNCTION private.member_master_lock_non_anonymized_subjects(
  p_member_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid;
  v_anonymized_at timestamptz;
BEGIN
  FOR v_member_id IN
    SELECT DISTINCT subject.member_id
    FROM unnest(COALESCE(p_member_ids, ARRAY[]::uuid[])) AS subject(member_id)
    WHERE subject.member_id IS NOT NULL
    ORDER BY subject.member_id
  LOOP
    SELECT member.anonymized_at INTO v_anonymized_at
    FROM public.members AS member
    WHERE member.id = v_member_id
    FOR KEY SHARE;
    IF FOUND AND v_anonymized_at IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'MEMBER_MASTER_ANONYMIZED_RECORD_LOCKED';
    END IF;
  END LOOP;
END
$function$;

CREATE OR REPLACE FUNCTION private.member_master_changed_fields(
  p_before jsonb,
  p_after jsonb
)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT COALESCE(array_agg(keys.key ORDER BY keys.key), ARRAY[]::text[])
  FROM (
    SELECT jsonb_object_keys(COALESCE(p_before, '{}'::jsonb)) AS key
    UNION
    SELECT jsonb_object_keys(COALESCE(p_after, '{}'::jsonb)) AS key
  ) AS keys
  WHERE COALESCE(p_before, '{}'::jsonb)->keys.key
        IS DISTINCT FROM
        COALESCE(p_after, '{}'::jsonb)->keys.key
$function$;

CREATE OR REPLACE FUNCTION private.member_master_validate_payload_keys(
  p_payload jsonb,
  p_allowed_keys text[]
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_payload) AS supplied(key)
    WHERE NOT (supplied.key = ANY(p_allowed_keys))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION private.member_master_jsonb_text_array(
  p_payload jsonb,
  p_key text,
  p_required boolean DEFAULT false,
  p_max_items integer DEFAULT 50,
  p_max_item_length integer DEFAULT 100
)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_result text[];
BEGIN
  IF NOT (p_payload ? p_key) OR p_payload->p_key = 'null'::jsonb THEN
    IF p_required THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'MEMBER_MASTER_REQUIRED_FIELDS_MISSING';
    END IF;
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_payload->p_key) <> 'array' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_payload->p_key) AS element(value)
    WHERE jsonb_typeof(element.value) <> 'string'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;
  SELECT COALESCE(array_agg(btrim(item.value) ORDER BY item.ordinality), ARRAY[]::text[])
  INTO v_result
  FROM jsonb_array_elements_text(p_payload->p_key) WITH ORDINALITY AS item(value, ordinality);

  IF cardinality(v_result) > p_max_items
     OR EXISTS (
       SELECT 1 FROM unnest(v_result) AS element(value)
       WHERE char_length(element.value) NOT BETWEEN 1 AND p_max_item_length
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;
  RETURN v_result;
EXCEPTION
  WHEN invalid_parameter_value THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
END
$function$;

CREATE OR REPLACE FUNCTION private.member_master_sync_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- record_source is creation provenance. Adding/removing a LINE identity is
  -- an account link, not a rewrite of how the canonical master was created.
  IF NEW.record_source = 'app'
     AND NEW.member_number LIKE 'IMP-%' THEN
    NEW.record_source := 'import';
  END IF;

  IF NEW.user_id IS NULL AND NEW.account_status NOT IN ('closed', 'suspended') THEN
    NEW.account_status := 'unbound';
  ELSIF NEW.user_id IS NOT NULL AND NEW.account_status = 'unbound' THEN
    NEW.account_status := 'active';
  END IF;

  IF NEW.user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.user_id IS DISTINCT FROM NEW.user_id) THEN
    NEW.account_linked_at := COALESCE(NEW.account_linked_at, now());
  END IF;

  IF NEW.status = 'approved' THEN
    NEW.profile_stage := 'complete';
    NEW.onboarding_step := 4;
    NEW.submitted_at := COALESCE(NEW.submitted_at, now());
  END IF;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION private.member_master_audit_member_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_changed text[];
  v_source text;
  v_admin_id uuid;
BEGIN
  IF COALESCE(current_setting('app.member_master_skip_member_audit', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  v_before := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE jsonb_build_object(
    'status', OLD.status,
    'member_number', OLD.member_number,
    'membership_type', OLD.membership_type,
    'user_id', OLD.user_id,
    'email', OLD.email,
    'line_user_id', OLD.line_user_id,
    'wechat_openid', OLD.wechat_openid,
    'account_status', OLD.account_status,
    'profile_stage', OLD.profile_stage,
    'record_source', OLD.record_source,
    'onboarding_step', OLD.onboarding_step,
    'last_profile_saved_at', OLD.last_profile_saved_at,
    'submitted_at', OLD.submitted_at,
    'account_linked_at', OLD.account_linked_at,
    'anonymized_at', OLD.anonymized_at
  ) END;
  v_after := jsonb_build_object(
    'status', NEW.status,
    'member_number', NEW.member_number,
    'membership_type', NEW.membership_type,
    'user_id', NEW.user_id,
    'email', NEW.email,
    'line_user_id', NEW.line_user_id,
    'wechat_openid', NEW.wechat_openid,
    'account_status', NEW.account_status,
    'profile_stage', NEW.profile_stage,
    'record_source', NEW.record_source,
    'onboarding_step', NEW.onboarding_step,
    'last_profile_saved_at', NEW.last_profile_saved_at,
    'submitted_at', NEW.submitted_at,
    'account_linked_at', NEW.account_linked_at,
    'anonymized_at', NEW.anonymized_at
  );
  v_changed := private.member_master_changed_fields(v_before, v_after);
  IF cardinality(v_changed) = 0 THEN
    RETURN NEW;
  END IF;

  v_source := COALESCE(
    NULLIF(current_setting('app.member_master_audit_source', true), ''),
    CASE WHEN TG_OP = 'INSERT' THEN NEW.record_source ELSE 'system' END
  );
  v_admin_id := private.member_master_current_admin_id();

  INSERT INTO private.member_profile_audit_log (
    member_id, member_id_snapshot, action_type, section, changed_fields,
    before_values, after_values, reason, source,
    actor_user_id, actor_admin_id, actor_name
  ) VALUES (
    NEW.id, NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN 'member_created' ELSE 'member_lifecycle_update' END,
    'member', v_changed, v_before, v_after,
    NULLIF(current_setting('app.member_master_audit_reason', true), ''),
    v_source, (SELECT auth.uid()), v_admin_id,
    (SELECT administrator.name FROM public.admin_users AS administrator WHERE administrator.id = v_admin_id)
  );
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION private.member_master_set_role(
  p_member_id uuid,
  p_role_key text,
  p_active boolean,
  p_source text DEFAULT 'admin',
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_assignment_id uuid;
  v_admin_id uuid := private.member_master_current_admin_id();
  v_emit_audit boolean := COALESCE(
    current_setting('app.member_master_explicit_audit', true), ''
  ) <> 'on';
  v_audit_source text := CASE
    WHEN p_source = 'migration' THEN 'migration'
    WHEN p_source = 'import' THEN 'import'
    WHEN p_source = 'app' THEN 'app'
    WHEN p_source = 'legacy' THEN 'legacy'
    ELSE 'admin'
  END;
BEGIN
  SELECT assignment.id INTO v_assignment_id
  FROM private.member_role_assignments AS assignment
  WHERE assignment.member_id = p_member_id
    AND assignment.role_key = p_role_key
    AND assignment.revoked_at IS NULL
  FOR UPDATE;

  IF p_active AND v_assignment_id IS NULL THEN
    INSERT INTO private.member_role_assignments (
      member_id, role_key, assigned_by, reason, source
    ) VALUES (
      p_member_id, p_role_key, v_admin_id, p_reason,
      CASE
        WHEN p_source IN ('migration', 'app', 'admin', 'import', 'legacy') THEN p_source
        ELSE 'admin'
      END
    );

    IF v_emit_audit THEN
      INSERT INTO private.member_profile_audit_log (
        member_id, member_id_snapshot, action_type, section, changed_fields,
        before_values, after_values, reason, source,
        actor_user_id, actor_admin_id, actor_name
      ) VALUES (
        p_member_id, p_member_id, 'role_assignment_update', 'roles',
        ARRAY[p_role_key]::text[],
        jsonb_build_object('role_key', p_role_key, 'active', false),
        jsonb_build_object('role_key', p_role_key, 'active', true),
        p_reason, v_audit_source, (SELECT auth.uid()), v_admin_id,
        (SELECT administrator.name FROM public.admin_users AS administrator WHERE administrator.id = v_admin_id)
      );
    END IF;
  ELSIF NOT p_active AND v_assignment_id IS NOT NULL THEN
    UPDATE private.member_role_assignments
    SET
      revoked_at = now(),
      revoked_by = v_admin_id,
      reason = COALESCE(p_reason, reason)
    WHERE id = v_assignment_id;

    IF v_emit_audit THEN
      INSERT INTO private.member_profile_audit_log (
        member_id, member_id_snapshot, action_type, section, changed_fields,
        before_values, after_values, reason, source,
        actor_user_id, actor_admin_id, actor_name
      ) VALUES (
        p_member_id, p_member_id, 'role_assignment_update', 'roles',
        ARRAY[p_role_key]::text[],
        jsonb_build_object('role_key', p_role_key, 'active', true),
        jsonb_build_object('role_key', p_role_key, 'active', false),
        p_reason, v_audit_source, (SELECT auth.uid()), v_admin_id,
        (SELECT administrator.name FROM public.admin_users AS administrator WHERE administrator.id = v_admin_id)
      );
    END IF;
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION private.member_master_sync_member_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_source text := CASE
    WHEN current_setting('app.member_master_audit_source', true) IN ('migration', 'import', 'legacy')
      THEN current_setting('app.member_master_audit_source', true)
    WHEN NEW.record_source = 'legacy' THEN 'legacy'
    WHEN private.member_master_current_admin_id() IS NOT NULL THEN 'admin'
    ELSE 'app'
  END;
BEGIN
  PERFORM private.member_master_set_role(
    NEW.id, 'user', true, v_source, 'Canonical user master role'
  );
  PERFORM private.member_master_set_role(
    NEW.id, 'member', NEW.status IN ('approved', 'inactive'), v_source,
    'Synchronized from members.status'
  );
  PERFORM private.member_master_set_role(
    NEW.id, 'staff', NEW.membership_type = 'staff', v_source,
    'Synchronized from members.membership_type'
  );
  PERFORM private.member_master_set_role(
    NEW.id, 'admin',
    NEW.user_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.admin_users AS administrator
      WHERE administrator.user_id = NEW.user_id
    ),
    v_source,
    'Synchronized from admin_users'
  );
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION private.member_master_sync_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.user_id IS NOT NULL
     AND (TG_OP = 'DELETE' OR OLD.user_id IS DISTINCT FROM NEW.user_id) THEN
    SELECT member.id INTO v_member_id
    FROM public.members AS member
    WHERE member.user_id = OLD.user_id;
    IF v_member_id IS NOT NULL THEN
      PERFORM private.member_master_set_role(
        v_member_id, 'admin', false, 'admin', 'Administrator link removed'
      );
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.user_id IS NOT NULL THEN
    SELECT member.id INTO v_member_id
    FROM public.members AS member
    WHERE member.user_id = NEW.user_id;
    IF v_member_id IS NOT NULL THEN
      PERFORM private.member_master_set_role(
        v_member_id, 'admin', true, 'admin', 'Administrator link established'
      );
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS member_master_sync_lifecycle ON public.members;
CREATE TRIGGER member_master_sync_lifecycle
  BEFORE INSERT OR UPDATE OF status, member_number, user_id, line_user_id,
    account_status, profile_stage, record_source, onboarding_step,
    account_linked_at, anonymized_at
  ON public.members
  FOR EACH ROW EXECUTE FUNCTION private.member_master_sync_lifecycle();

DROP TRIGGER IF EXISTS member_master_audit_member_change ON public.members;
CREATE TRIGGER member_master_audit_member_change
  AFTER INSERT OR UPDATE OF status, member_number, membership_type, user_id,
    email, line_user_id, wechat_openid, account_status, profile_stage,
    record_source, onboarding_step, last_profile_saved_at, submitted_at,
    account_linked_at, anonymized_at
  ON public.members
  FOR EACH ROW EXECUTE FUNCTION private.member_master_audit_member_change();

DROP TRIGGER IF EXISTS member_master_sync_member_roles ON public.members;
CREATE TRIGGER member_master_sync_member_roles
  AFTER INSERT OR UPDATE OF status, membership_type, user_id
  ON public.members
  FOR EACH ROW EXECUTE FUNCTION private.member_master_sync_member_roles();

DROP TRIGGER IF EXISTS member_master_sync_admin_role ON public.admin_users;
CREATE TRIGGER member_master_sync_admin_role
  AFTER INSERT OR UPDATE OF user_id OR DELETE
  ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION private.member_master_sync_admin_role();

CREATE OR REPLACE FUNCTION private.member_master_ensure_legacy_canonical()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_old_canonical_id uuid;
  v_number_owner_id uuid;
  v_admin_id uuid := private.member_master_current_admin_id();
  v_actor_name text;
  v_audit_source text;
  v_subject_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_canonical_id := OLD.canonical_member_id;
  END IF;
  SELECT administrator.name INTO v_actor_name
  FROM public.admin_users AS administrator
  WHERE administrator.id = v_admin_id;
  v_audit_source := CASE
    WHEN current_setting('app.member_master_audit_source', true) IN (
      'migration', 'import', 'admin', 'legacy'
    ) THEN current_setting('app.member_master_audit_source', true)
    WHEN v_admin_id IS NOT NULL THEN 'admin'
    ELSE 'legacy'
  END;

  IF NEW.claimed_by IS NOT NULL AND v_old_canonical_id IS NULL THEN
    -- claimed_by keeps its historical claim meaning. canonical_member_id is a
    -- separate hub pointer. Pre-existing claimed rows and rows initially
    -- inserted as already claimed may point at that approved member.
    NEW.canonical_member_id := NEW.claimed_by;
  ELSIF v_old_canonical_id IS NOT NULL THEN
    -- A later claim must never silently repoint/merge the canonical hub and
    -- orphan the accountless shell. Keep the original pointer and queue the
    -- claim as evidence for explicit human resolution below.
    NEW.canonical_member_id := v_old_canonical_id;
  ELSIF NEW.canonical_member_id IS NULL THEN
    SELECT member.id INTO v_number_owner_id
    FROM public.members AS member
    WHERE member.member_number = NEW.member_no
    LIMIT 1;

    INSERT INTO public.members (
      member_number, status, account_status, profile_stage,
      record_source, onboarding_step
    ) VALUES (
      CASE WHEN v_number_owner_id IS NULL THEN NEW.member_no ELSE NULL END,
      'pending', 'unbound', 'not_started', 'legacy', 0
    )
    RETURNING id INTO NEW.canonical_member_id;
  END IF;

  IF v_old_canonical_id IS NOT NULL
     AND NEW.claimed_by IS NOT NULL
     AND v_old_canonical_id IS DISTINCT FROM NEW.claimed_by THEN
    INSERT INTO private.member_duplicate_candidates (
      left_member_id, right_member_id,
      left_member_id_snapshot, right_member_id_snapshot,
      match_fields, evidence, candidate_source
    ) VALUES (
      LEAST(v_old_canonical_id, NEW.claimed_by),
      GREATEST(v_old_canonical_id, NEW.claimed_by),
      LEAST(v_old_canonical_id, NEW.claimed_by),
      GREATEST(v_old_canonical_id, NEW.claimed_by),
      ARRAY['legacy_claim']::text[],
      jsonb_build_object(
        'legacy_record_id', NEW.id,
        'claim_status', NEW.claim_status,
        'automatic_merge_performed', false
      ),
      'legacy_claim'
    ) ON CONFLICT DO NOTHING;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.claimed_by IS DISTINCT FROM NEW.claimed_by THEN
    FOR v_subject_id IN
      SELECT DISTINCT linked.member_id
      FROM unnest(array_remove(
        ARRAY[v_old_canonical_id, OLD.claimed_by, NEW.claimed_by], NULL
      )) AS linked(member_id)
    LOOP
      INSERT INTO private.member_profile_audit_log (
        member_id, member_id_snapshot, action_type, section, changed_fields,
        before_values, after_values, reason, source,
        actor_user_id, actor_admin_id, actor_name, metadata
      ) VALUES (
        v_subject_id, v_subject_id, 'related_record_change',
        'related_legacy_members', ARRAY['claimed_by']::text[],
        jsonb_build_object('claimed_by', OLD.claimed_by),
        jsonb_build_object('claimed_by', NEW.claimed_by),
        'Legacy claim changed; canonical mapping preserved', v_audit_source,
        (SELECT auth.uid()), v_admin_id, v_actor_name,
        jsonb_build_object(
          'table', 'public.legacy_members',
          'legacy_record_id', NEW.id,
          'canonical_member_id', NEW.canonical_member_id,
          'duplicate_candidate_only',
            NEW.claimed_by IS NOT NULL
            AND NEW.claimed_by IS DISTINCT FROM NEW.canonical_member_id,
          'automatic_merge_performed', false
        )
      );
    END LOOP;
  END IF;

  SELECT member.id INTO v_number_owner_id
  FROM public.members AS member
  WHERE member.member_number = NEW.member_no
    AND member.id <> NEW.canonical_member_id
  LIMIT 1;
  IF v_number_owner_id IS NOT NULL THEN
    INSERT INTO private.member_duplicate_candidates (
      left_member_id, right_member_id,
      left_member_id_snapshot, right_member_id_snapshot,
      match_fields, evidence, candidate_source
    ) VALUES (
      LEAST(v_number_owner_id, NEW.canonical_member_id),
      GREATEST(v_number_owner_id, NEW.canonical_member_id),
      LEAST(v_number_owner_id, NEW.canonical_member_id),
      GREATEST(v_number_owner_id, NEW.canonical_member_id),
      ARRAY['member_number']::text[],
      jsonb_build_object(
        'legacy_record_id', NEW.id,
        'legacy_member_no', NEW.member_no,
        'automatic_merge_performed', false
      ),
      'legacy_member_number'
    ) ON CONFLICT DO NOTHING;
  END IF;

  IF NULLIF(btrim(NEW.full_name), '') IS NOT NULL
     AND NULLIF(btrim(NEW.school), '') IS NOT NULL THEN
    INSERT INTO private.member_duplicate_candidates (
      left_member_id, right_member_id,
      left_member_id_snapshot, right_member_id_snapshot,
      match_fields, evidence, candidate_source
    )
    SELECT
      LEAST(NEW.canonical_member_id, identity.member_id),
      GREATEST(NEW.canonical_member_id, identity.member_id),
      LEAST(NEW.canonical_member_id, identity.member_id),
      GREATEST(NEW.canonical_member_id, identity.member_id),
      ARRAY['full_name', 'school']::text[],
      jsonb_build_object(
        'legacy_record_id', NEW.id,
        'normalized_name', lower(btrim(NEW.full_name)),
        'normalized_school', lower(btrim(NEW.school)),
        'automatic_merge_performed', false
      ),
      'legacy_name_school'
    FROM public.member_identity AS identity
    WHERE identity.member_id <> NEW.canonical_member_id
      AND lower(btrim(identity.full_name)) = lower(btrim(NEW.full_name))
      AND identity.school_name IS NOT NULL
      AND lower(btrim(identity.school_name)) = lower(btrim(NEW.school))
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_old_canonical_id IS DISTINCT FROM NEW.canonical_member_id THEN
    FOR v_subject_id IN
      SELECT DISTINCT linked.member_id
      FROM unnest(array_remove(
        ARRAY[v_old_canonical_id, NEW.canonical_member_id], NULL
      )) AS linked(member_id)
    LOOP
      INSERT INTO private.member_profile_audit_log (
        member_id, member_id_snapshot, action_type, section, changed_fields,
        before_values, after_values, reason, source,
        actor_user_id, actor_admin_id, actor_name, metadata
      ) VALUES (
        v_subject_id, v_subject_id, 'related_record_change',
        'related_legacy_members', ARRAY['canonical_member_id']::text[],
        jsonb_build_object('canonical_member_id', v_old_canonical_id),
        jsonb_build_object('canonical_member_id', NEW.canonical_member_id),
        'Legacy record canonical mapping', v_audit_source,
        (SELECT auth.uid()), v_admin_id, v_actor_name,
        jsonb_build_object(
          'table', 'public.legacy_members',
          'legacy_record_id', NEW.id,
          'claim_status', NEW.claim_status,
          'automatic_merge_performed', false
        )
      );
    END LOOP;
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS member_master_ensure_legacy_canonical
  ON public.legacy_members;
CREATE TRIGGER member_master_ensure_legacy_canonical
  BEFORE INSERT OR UPDATE OF claimed_by, canonical_member_id
  ON public.legacy_members
  FOR EACH ROW EXECUTE FUNCTION private.member_master_ensure_legacy_canonical();

-- ---------------------------------------------------------------------------
-- Make every existing Auth account canonical without auto-merging legacy rows
-- ---------------------------------------------------------------------------

SELECT set_config('app.member_master_audit_source', 'migration', true);
SELECT set_config('app.member_master_audit_reason', 'Canonical auth-user backfill', true);

UPDATE public.legacy_members AS legacy
SET canonical_member_id = legacy.claimed_by
WHERE legacy.claimed_by IS NOT NULL
  AND legacy.canonical_member_id IS DISTINCT FROM legacy.claimed_by;

-- Assign a new accountless shell to every still-unmapped legacy row. The
-- no-op-looking SET intentionally invokes the trigger, which creates exactly
-- one canonical record under the transaction/advisory migration lock.
UPDATE public.legacy_members
SET canonical_member_id = NULL
WHERE canonical_member_id IS NULL;

ALTER TABLE public.legacy_members
  ALTER COLUMN canonical_member_id SET NOT NULL;

INSERT INTO public.members (
  user_id, email, status, account_status, profile_stage, record_source,
  onboarding_step, account_linked_at
)
SELECT
  auth_user.id,
  CASE
    WHEN auth_user.email IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.members AS email_owner
       WHERE email_owner.email IS NOT NULL
         AND lower(btrim(email_owner.email)) = lower(btrim(auth_user.email))
     )
    THEN lower(btrim(auth_user.email))
    ELSE NULL
  END,
  'pending', 'active', 'not_started', 'app', 0, now()
FROM auth.users AS auth_user
WHERE NOT EXISTS (
  SELECT 1 FROM public.members AS existing_member
  WHERE existing_member.user_id = auth_user.id
)
ON CONFLICT DO NOTHING;

-- Existing linked rows may safely receive their Auth email only when no other
-- member owns the normalized value. Conflicts remain explicit candidates.
UPDATE public.members AS member
SET email = lower(btrim(auth_user.email))
FROM auth.users AS auth_user
WHERE member.user_id = auth_user.id
  AND member.email IS NULL
  AND auth_user.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.members AS email_owner
    WHERE email_owner.id <> member.id
      AND email_owner.email IS NOT NULL
      AND lower(btrim(email_owner.email)) = lower(btrim(auth_user.email))
  );

INSERT INTO private.member_duplicate_candidates (
  left_member_id, right_member_id,
  left_member_id_snapshot, right_member_id_snapshot,
  match_fields, evidence, candidate_source
)
SELECT
  LEAST(canonical.id, possible_duplicate.id),
  GREATEST(canonical.id, possible_duplicate.id),
  LEAST(canonical.id, possible_duplicate.id),
  GREATEST(canonical.id, possible_duplicate.id),
  ARRAY['email']::text[],
  jsonb_build_object(
    'normalized_email', lower(btrim(auth_user.email)),
    'auth_user_id', auth_user.id,
    'automatic_merge_performed', false
  ),
  'auth_email'
FROM auth.users AS auth_user
JOIN public.members AS canonical ON canonical.user_id = auth_user.id
JOIN public.members AS possible_duplicate
  ON possible_duplicate.id <> canonical.id
 AND possible_duplicate.email IS NOT NULL
 AND auth_user.email IS NOT NULL
 AND lower(btrim(possible_duplicate.email)) = lower(btrim(auth_user.email))
ON CONFLICT DO NOTHING;

-- Idempotent role backfill after the Auth canonicalization so newly created
-- masters also receive all roles implied by current business state.
DO $do$
DECLARE
  member_row record;
BEGIN
  FOR member_row IN
    SELECT member.id, member.status, member.membership_type, member.user_id
    FROM public.members AS member
  LOOP
    PERFORM private.member_master_set_role(
      member_row.id, 'user', true, 'migration', 'Canonical role backfill'
    );
    PERFORM private.member_master_set_role(
      member_row.id, 'member', member_row.status IN ('approved', 'inactive'),
      'migration', 'Membership role backfill'
    );
    PERFORM private.member_master_set_role(
      member_row.id, 'staff', member_row.membership_type = 'staff',
      'migration', 'Staff role backfill'
    );
    PERFORM private.member_master_set_role(
      member_row.id, 'admin',
      member_row.user_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.admin_users AS administrator
        WHERE administrator.user_id = member_row.user_id
      ),
      'migration', 'Administrator role backfill'
    );
  END LOOP;
END
$do$;

-- Also queue pre-existing case-insensitive member-email duplicates. Exact
-- duplicates were already prevented by the historical unique index.
INSERT INTO private.member_duplicate_candidates (
  left_member_id, right_member_id,
  left_member_id_snapshot, right_member_id_snapshot,
  match_fields, evidence, candidate_source
)
SELECT
  first_member.id, second_member.id,
  first_member.id, second_member.id,
  ARRAY['email']::text[],
  jsonb_build_object(
    'normalized_email', lower(btrim(first_member.email)),
    'automatic_merge_performed', false
  ),
  'member_email'
FROM public.members AS first_member
JOIN public.members AS second_member
  ON first_member.id < second_member.id
 AND first_member.email IS NOT NULL
 AND second_member.email IS NOT NULL
 AND lower(btrim(first_member.email)) = lower(btrim(second_member.email))
ON CONFLICT DO NOTHING;

-- A conservative secondary candidate signal: the same non-empty normalized
-- phone plus full name. It is never used for automatic linking or merging.
INSERT INTO private.member_duplicate_candidates (
  left_member_id, right_member_id,
  left_member_id_snapshot, right_member_id_snapshot,
  match_fields, evidence, candidate_source
)
SELECT
  first_identity.member_id, second_identity.member_id,
  first_identity.member_id, second_identity.member_id,
  ARRAY['phone', 'full_name']::text[],
  jsonb_build_object(
    'normalized_phone', regexp_replace(first_identity.phone, '[^0-9+]', '', 'g'),
    'normalized_name', lower(btrim(first_identity.full_name)),
    'automatic_merge_performed', false
  ),
  'phone_name'
FROM public.member_identity AS first_identity
JOIN public.member_identity AS second_identity
  ON first_identity.member_id < second_identity.member_id
 AND first_identity.phone IS NOT NULL
 AND second_identity.phone IS NOT NULL
 AND regexp_replace(first_identity.phone, '[^0-9+]', '', 'g') <> ''
 AND regexp_replace(first_identity.phone, '[^0-9+]', '', 'g')
     = regexp_replace(second_identity.phone, '[^0-9+]', '', 'g')
 AND lower(btrim(first_identity.full_name)) = lower(btrim(second_identity.full_name))
ON CONFLICT DO NOTHING;

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM auth.users AS auth_user
    WHERE NOT EXISTS (
      SELECT 1 FROM public.members AS member
      WHERE member.user_id = auth_user.id
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'MEMBER_MASTER_AUTH_BACKFILL_INCOMPLETE';
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- Database-paginated administrator directory and complete non-anonymous 360
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_list_member_directory(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_account_status text DEFAULT NULL,
  p_profile_stage text DEFAULT NULL,
  p_record_source text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_search text := NULLIF(btrim(p_search), '');
  v_can_read_high_risk boolean := private.member_master_is_super_admin()
    OR COALESCE((SELECT auth.jwt()->>'role'), '') = 'service_role';
  v_total bigint;
  v_items jsonb;
BEGIN
  IF NOT private.member_master_is_admin()
     AND COALESCE((SELECT auth.jwt()->>'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'MEMBER_MASTER_ADMIN_REQUIRED';
  END IF;
  IF p_page IS NULL OR p_page < 1
     OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'MEMBER_MASTER_PAGINATION_INVALID';
  END IF;
  IF p_status IS NOT NULL
     AND p_status NOT IN ('pending', 'approved', 'rejected', 'inactive') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_FILTER_INVALID';
  END IF;
  IF p_account_status IS NOT NULL
     AND p_account_status NOT IN ('unbound', 'active', 'suspended', 'closed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_FILTER_INVALID';
  END IF;
  IF p_profile_stage IS NOT NULL
     AND p_profile_stage NOT IN ('not_started', 'in_progress', 'submitted', 'complete') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_FILTER_INVALID';
  END IF;
  IF p_record_source IS NOT NULL
     AND p_record_source NOT IN ('app', 'line', 'legacy', 'import', 'admin') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_FILTER_INVALID';
  END IF;

  WITH filtered AS MATERIALIZED (
    SELECT
      member.id AS member_id,
      COALESCE(NULLIF(btrim(identity.full_name), ''), legacy_rollup.full_name) AS full_name,
      identity.nickname,
      member.email,
      CASE WHEN v_can_read_high_risk THEN auth_user.email ELSE NULL END AS auth_email,
      CASE WHEN v_can_read_high_risk THEN
        CASE
          WHEN jsonb_typeof(auth_user.raw_app_meta_data->'providers') = 'array'
            THEN auth_user.raw_app_meta_data->'providers'
          WHEN NULLIF(auth_user.raw_app_meta_data->>'provider', '') IS NOT NULL
            THEN jsonb_build_array(auth_user.raw_app_meta_data->>'provider')
          ELSE '[]'::jsonb
        END
      ELSE '[]'::jsonb END AS auth_providers,
      COALESCE(NULLIF(btrim(identity.school_name), ''), legacy_rollup.school) AS school_name,
      member.status,
      member.profile_stage,
      member.record_source,
      member.onboarding_step,
      member.last_profile_saved_at,
      member.submitted_at,
      member.created_at,
      member.updated_at,
      CASE WHEN v_can_read_high_risk THEN member.member_number ELSE NULL END AS member_number,
      member.account_status,
      member.user_id IS NOT NULL AS auth_bound,
      legacy_rollup.record_count > 0 AS has_legacy_record,
      legacy_rollup.record_count AS legacy_record_count
    FROM public.members AS member
    LEFT JOIN public.member_identity AS identity ON identity.member_id = member.id
    LEFT JOIN auth.users AS auth_user ON auth_user.id = member.user_id
    LEFT JOIN LATERAL (
      SELECT
        count(*)::integer AS record_count,
        (
          array_agg(NULLIF(btrim(legacy.full_name), '') ORDER BY legacy.created_at, legacy.id)
          FILTER (WHERE NULLIF(btrim(legacy.full_name), '') IS NOT NULL)
        )[1] AS full_name,
        (
          array_agg(NULLIF(btrim(legacy.school), '') ORDER BY legacy.created_at, legacy.id)
          FILTER (WHERE NULLIF(btrim(legacy.school), '') IS NOT NULL)
        )[1] AS school
      FROM public.legacy_members AS legacy
      WHERE legacy.canonical_member_id = member.id
    ) AS legacy_rollup ON true
    WHERE (p_status IS NULL OR member.status = p_status)
      AND (p_account_status IS NULL OR member.account_status = p_account_status)
      AND (p_profile_stage IS NULL OR member.profile_stage = p_profile_stage)
      AND (p_record_source IS NULL OR member.record_source = p_record_source)
      AND (
        v_search IS NULL
        OR member.id::text ILIKE '%' || v_search || '%'
        OR COALESCE(identity.full_name, '') ILIKE '%' || v_search || '%'
        OR COALESCE(identity.nickname, '') ILIKE '%' || v_search || '%'
        OR COALESCE(member.email, '') ILIKE '%' || v_search || '%'
        OR EXISTS (
          SELECT 1
          FROM public.legacy_members AS legacy_search
          WHERE legacy_search.canonical_member_id = member.id
            AND (
              COALESCE(legacy_search.full_name, '') ILIKE '%' || v_search || '%'
              OR COALESCE(legacy_search.school, '') ILIKE '%' || v_search || '%'
              OR (
                v_can_read_high_risk
                AND COALESCE(legacy_search.member_no, '') ILIKE '%' || v_search || '%'
              )
            )
        )
        OR (
          v_can_read_high_risk
          AND (
            COALESCE(member.member_number, '') ILIKE '%' || v_search || '%'
            OR COALESCE(auth_user.email, '') ILIKE '%' || v_search || '%'
          )
        )
      )
  ), page_rows AS (
    SELECT *
    FROM filtered
    ORDER BY created_at DESC, member_id DESC
    OFFSET (p_page - 1) * p_page_size
    LIMIT p_page_size
  )
  SELECT
    (SELECT count(*) FROM filtered),
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(page_row) ORDER BY page_row.created_at DESC, page_row.member_id DESC)
        FROM page_rows AS page_row
      ),
      '[]'::jsonb
    )
  INTO v_total, v_items;

  RETURN jsonb_build_object(
    'page', p_page,
    'page_size', p_page_size,
    'total', v_total,
    'total_pages', CASE
      WHEN v_total = 0 THEN 0
      ELSE ceil(v_total::numeric / p_page_size)::integer
    END,
    'items', v_items,
    'redacted_fields', CASE
      WHEN v_can_read_high_risk THEN '[]'::jsonb
      ELSE jsonb_build_array('member_number', 'auth_email', 'auth_providers')
    END
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_member_360(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member public.members%ROWTYPE;
  v_auth_user auth.users%ROWTYPE;
  v_is_super boolean := private.member_master_is_super_admin();
  v_is_service boolean := COALESCE((SELECT auth.jwt()->>'role'), '') = 'service_role';
  v_result jsonb;
BEGIN
  IF NOT private.member_master_is_admin() AND NOT v_is_service THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'MEMBER_MASTER_ADMIN_REQUIRED';
  END IF;

  SELECT * INTO v_member
  FROM public.members AS member
  WHERE member.id = p_member_id;
  IF v_member.id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'MEMBER_MASTER_NOT_FOUND';
  END IF;
  IF v_member.user_id IS NOT NULL THEN
    SELECT * INTO v_auth_user
    FROM auth.users AS auth_user
    WHERE auth_user.id = v_member.user_id;
  END IF;

  SELECT jsonb_build_object(
    'capabilities', jsonb_build_object(
      'is_super_admin', v_is_super OR v_is_service,
      'redacted_fields', CASE
        WHEN (v_is_super OR v_is_service) AND v_member.anonymized_at IS NOT NULL
          THEN jsonb_build_array(
            'audit.before_values', 'audit.after_values', 'audit.metadata',
            'audit.actor_user_id'
          )
        WHEN v_is_super OR v_is_service THEN '[]'::jsonb
        ELSE jsonb_build_array(
          'account.member_number', 'account.user_id', 'account.auth_email',
          'account.auth_providers', 'account.auth_created_at',
          'account.auth_last_sign_in_at', 'account.line_user_id',
          'account.wechat_openid', 'quiz.answers',
          'legacy_records.member_no', 'legacy_records.internal_ids',
          'staff_profiles.member_id', 'match_round_submissions.raw_payload',
          'roles.assigned_by', 'roles.revoked_by',
          'audit.account_values', 'audit.roles.actor_ids',
          'audit.roles.metadata', 'duplicate_candidates'
        )
      END
    ),
    'member', jsonb_build_object(
      'member_id', v_member.id,
      'email', v_member.email,
      'status', v_member.status,
      'profile_stage', v_member.profile_stage,
      'record_source', v_member.record_source,
      'onboarding_step', v_member.onboarding_step,
      'last_profile_saved_at', v_member.last_profile_saved_at,
      'submitted_at', v_member.submitted_at,
      'created_at', v_member.created_at,
      'updated_at', v_member.updated_at,
      'membership_type', v_member.membership_type,
      'interview_date', v_member.interview_date,
      'interviewer', v_member.interviewer,
      'attractiveness_score', v_member.attractiveness_score
    ),
    'account', jsonb_build_object(
      'account_status', v_member.account_status,
      'auth_bound', v_member.user_id IS NOT NULL,
      'account_linked_at', v_member.account_linked_at,
      'anonymized_at', v_member.anonymized_at,
      'record_source', v_member.record_source
    ) || CASE WHEN v_is_super OR v_is_service THEN jsonb_build_object(
      'member_number', v_member.member_number,
      'user_id', v_member.user_id,
      'auth_email', v_auth_user.email,
      'auth_providers', CASE
        WHEN jsonb_typeof(v_auth_user.raw_app_meta_data->'providers') = 'array'
          THEN v_auth_user.raw_app_meta_data->'providers'
        WHEN NULLIF(v_auth_user.raw_app_meta_data->>'provider', '') IS NOT NULL
          THEN jsonb_build_array(v_auth_user.raw_app_meta_data->>'provider')
        ELSE '[]'::jsonb
      END,
      'auth_created_at', v_auth_user.created_at,
      'auth_last_sign_in_at', v_auth_user.last_sign_in_at,
      'line_user_id', v_member.line_user_id,
      'wechat_openid', v_member.wechat_openid
    ) ELSE '{}'::jsonb END,
    'legacy_records', COALESCE(
      (
        SELECT jsonb_agg(
          CASE WHEN v_is_super OR v_is_service THEN to_jsonb(legacy)
          ELSE jsonb_build_object(
            'full_name', legacy.full_name,
            'gender', legacy.gender,
            'school', legacy.school,
            'department', legacy.department,
            'interest_tags', legacy.interest_tags,
            'social_tags', legacy.social_tags,
            'game_mode', legacy.game_mode,
            'compatibility_score', legacy.compatibility_score,
            'session_count', legacy.session_count,
            'match_history', legacy.match_history,
            'claim_status', legacy.claim_status,
            'claimed_at', legacy.claimed_at,
            'reviewed_at', legacy.reviewed_at,
            'created_at', legacy.created_at
          ) END
          ORDER BY legacy.created_at, legacy.id
        )
        FROM public.legacy_members AS legacy
        WHERE legacy.canonical_member_id = p_member_id
      ),
      '[]'::jsonb
    ),
    'identity', (
      SELECT to_jsonb(identity)
      FROM public.member_identity AS identity
      WHERE identity.member_id = p_member_id
    ),
    'language', (
      SELECT to_jsonb(language)
      FROM public.member_language AS language
      WHERE language.member_id = p_member_id
    ),
    'interests', (
      SELECT to_jsonb(interests)
      FROM public.member_interests AS interests
      WHERE interests.member_id = p_member_id
    ),
    'personality', (
      SELECT to_jsonb(personality)
      FROM public.member_personality AS personality
      WHERE personality.member_id = p_member_id
    ),
    'boundaries', (
      SELECT to_jsonb(boundaries)
      FROM public.member_boundaries AS boundaries
      WHERE boundaries.member_id = p_member_id
    ),
    'verification', (
      SELECT to_jsonb(verification)
      FROM public.member_verification AS verification
      WHERE verification.member_id = p_member_id
    ),
    'quiz', (
      SELECT CASE
        WHEN v_is_super OR v_is_service THEN to_jsonb(quiz)
        ELSE to_jsonb(quiz) - ARRAY['answers', 'member_id']
      END
      FROM public.personality_quiz_results AS quiz
      WHERE quiz.member_id = p_member_id
      ORDER BY quiz.completed_at DESC
      LIMIT 1
    ),
    'dynamic_stats', (
      SELECT to_jsonb(statistics) - 'audit_reason'
      FROM public.member_dynamic_stats AS statistics
      WHERE statistics.member_id = p_member_id
    ),
    'profile_metrics', (
      SELECT to_jsonb(metrics)
      FROM private.member_profile_metrics AS metrics
      WHERE metrics.member_id = p_member_id
    ),
    'interview_evaluations', COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(evaluation) ORDER BY evaluation.created_at DESC, evaluation.id)
        FROM public.interview_evaluations AS evaluation
        WHERE evaluation.member_id = p_member_id
      ),
      '[]'::jsonb
    ),
    'staff_profiles', COALESCE(
      (
        SELECT jsonb_agg(
          CASE WHEN v_is_super OR v_is_service THEN to_jsonb(staff) - 'audit_reason'
          ELSE to_jsonb(staff) - ARRAY['member_id', 'audit_reason'] END
          ORDER BY staff.created_at, staff.id
        )
        FROM public.staff_profiles AS staff
        WHERE staff.member_id = p_member_id
      ),
      '[]'::jsonb
    ),
    'match_round_submissions', COALESCE(
      (
        SELECT jsonb_agg(
          CASE WHEN v_is_super OR v_is_service
            THEN to_jsonb(submission) - 'audit_reason'
          ELSE jsonb_build_object(
            'id', submission.id,
            'round_id', submission.round_id,
            'created_at', submission.created_at,
            'updated_at', submission.updated_at,
            'redacted', true
          ) END
          ORDER BY submission.created_at DESC, submission.id DESC
        )
        FROM public.match_round_submissions AS submission
        WHERE submission.member_id = p_member_id
      ),
      '[]'::jsonb
    ),
    'script_play_records', COALESCE(
      (
        SELECT jsonb_agg(
          to_jsonb(play_record) - ARRAY['member_id', 'audit_reason']
          ORDER BY play_record.created_at DESC, play_record.id DESC
        )
        FROM public.script_play_records AS play_record
        WHERE play_record.member_id = p_member_id
      ),
      '[]'::jsonb
    ),
    'unmatched_diagnostics', COALESCE(
      (
        SELECT jsonb_agg(
          to_jsonb(diagnostic) - ARRAY['member_id', 'audit_reason']
          ORDER BY diagnostic.created_at DESC, diagnostic.id DESC
        )
        FROM public.unmatched_diagnostics AS diagnostic
        WHERE diagnostic.member_id = p_member_id
      ),
      '[]'::jsonb
    ),
    'roles', CASE WHEN v_is_super OR v_is_service THEN COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(assignment) ORDER BY assignment.assigned_at DESC, assignment.id)
        FROM private.member_role_assignments AS assignment
        WHERE assignment.member_id = p_member_id
      ),
      '[]'::jsonb
    ) ELSE COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'role_key', assignment.role_key,
            'active', assignment.revoked_at IS NULL,
            'assigned_at', assignment.assigned_at,
            'revoked_at', assignment.revoked_at,
            'source', assignment.source,
            'reason', assignment.reason
          )
          ORDER BY assignment.assigned_at DESC, assignment.id
        )
        FROM private.member_role_assignments AS assignment
        WHERE assignment.member_id = p_member_id
      ),
      '[]'::jsonb
    ) END,
    'community', (
      SELECT jsonb_build_object(
        'profile_id', profile.id,
        'nickname', profile.nickname,
        'avatar_kind', profile.avatar_kind,
        'avatar_path', profile.avatar_path,
        'preset_avatar', profile.preset_avatar,
        'joined_at', profile.joined_at,
        'preferences', (
          SELECT to_jsonb(preference) - 'member_id'
          FROM public.community_notification_preferences AS preference
          WHERE preference.member_id = p_member_id
        ),
        'non_anonymous_post_count', (
          SELECT count(*)
          FROM public.community_posts AS post
          WHERE post.author_profile_id = profile.id
            AND NOT post.is_anonymous
        ),
        'non_anonymous_comment_count', (
          SELECT count(*)
          FROM public.community_comments AS comment
          WHERE comment.author_profile_id = profile.id
            AND NOT comment.is_anonymous_author
        )
      )
      FROM private.community_profile_members AS profile_member
      JOIN public.community_profiles AS profile
        ON profile.id = profile_member.profile_id
      WHERE profile_member.member_id = p_member_id
    ),
    'feedback', jsonb_build_object(
      'total', (
        SELECT count(*) FROM public.player_feedback AS feedback
        WHERE feedback.member_id = p_member_id
      ),
      'pending', (
        SELECT count(*) FROM public.player_feedback AS feedback
        WHERE feedback.member_id = p_member_id AND feedback.status = 'pending'
      ),
      'latest', COALESCE(
        (
          SELECT jsonb_agg(
            to_jsonb(latest_feedback) - 'audit_reason'
            ORDER BY latest_feedback.created_at DESC, latest_feedback.id DESC
          )
          FROM (
            SELECT feedback.*
            FROM public.player_feedback AS feedback
            WHERE feedback.member_id = p_member_id
            ORDER BY feedback.created_at DESC, feedback.id DESC
            LIMIT 100
          ) AS latest_feedback
        ),
        '[]'::jsonb
      )
    ),
    'matching', jsonb_build_object(
      'match_count', (
        SELECT count(*) FROM public.match_results AS match
        WHERE match.member_a_id = p_member_id
           OR match.member_b_id = p_member_id
           OR p_member_id = ANY(COALESCE(match.group_members, ARRAY[]::uuid[]))
      ),
      'reviews_written', (
        SELECT count(*) FROM public.mutual_reviews AS review
        WHERE review.reviewer_id = p_member_id
      ),
      'reviews_received', (
        SELECT count(*) FROM public.mutual_reviews AS review
        WHERE review.reviewee_id = p_member_id
      ),
      'latest_matches', COALESCE(
        (
          SELECT jsonb_agg(
            to_jsonb(latest_match) - 'audit_reason'
            ORDER BY latest_match.created_at DESC, latest_match.id DESC
          )
          FROM (
            SELECT match.*
            FROM public.match_results AS match
            WHERE match.member_a_id = p_member_id
               OR match.member_b_id = p_member_id
               OR p_member_id = ANY(COALESCE(match.group_members, ARRAY[]::uuid[]))
            ORDER BY match.created_at DESC, match.id DESC
            LIMIT 100
          ) AS latest_match
        ),
        '[]'::jsonb
      ),
      'latest_reviews', COALESCE(
        (
          SELECT jsonb_agg(
            to_jsonb(latest_review) - 'audit_reason'
            ORDER BY latest_review.created_at DESC, latest_review.id DESC
          )
          FROM (
            SELECT review.*
            FROM public.mutual_reviews AS review
            WHERE review.reviewer_id = p_member_id OR review.reviewee_id = p_member_id
            ORDER BY review.created_at DESC, review.id DESC
            LIMIT 100
          ) AS latest_review
        ),
        '[]'::jsonb
      )
    ),
    'audit', COALESCE(
      (
        SELECT jsonb_agg(
          (
            CASE
              WHEN v_member.anonymized_at IS NOT NULL
                THEN to_jsonb(event)
                  - ARRAY['before_values', 'after_values', 'metadata', 'actor_user_id']
                  || jsonb_build_object('values_redacted', true, 'anonymized_subject', true)
              WHEN (v_is_super OR v_is_service) THEN to_jsonb(event)
              WHEN event.section = 'roles'
                THEN to_jsonb(event)
                  - ARRAY['metadata', 'actor_user_id', 'actor_admin_id']
              WHEN event.section NOT IN (
                'member', 'account', 'quiz', 'lifecycle', 'import',
                'related_legacy_members', 'related_match_round_submissions'
              )
                THEN to_jsonb(event) - 'actor_user_id'
              ELSE to_jsonb(event)
                - ARRAY['before_values', 'after_values', 'metadata', 'actor_user_id']
                || jsonb_build_object('values_redacted', true)
            END
          ) || jsonb_build_object(
            'event_id', event.id,
            'restorable',
              (v_is_super OR v_is_service)
              AND v_member.anonymized_at IS NULL
              AND event.action_type IN ('admin_section_update', 'admin_restore')
              AND event.section IN (
                'identity', 'language', 'interests', 'personality', 'boundaries',
                'quiz', 'application', 'verification', 'interview_evaluation',
                'roles', 'workflow'
              )
          )
          ORDER BY event.created_at DESC, event.id DESC
        )
        FROM (
          SELECT audit.*
          FROM private.member_profile_audit_log AS audit
          WHERE audit.member_id_snapshot = p_member_id
            AND (
              (v_is_super OR v_is_service)
              OR audit.section <> 'anonymous_reveal'
            )
          ORDER BY audit.created_at DESC, audit.id DESC
          LIMIT 200
        ) AS event
      ),
      '[]'::jsonb
    ),
    'audit_total', (
      SELECT count(*)
      FROM private.member_profile_audit_log AS audit
      WHERE audit.member_id_snapshot = p_member_id
        AND (
          (v_is_super OR v_is_service)
          OR audit.section <> 'anonymous_reveal'
        )
    ),
    'audit_page', jsonb_build_object(
      'page', 1,
      'page_size', 200,
      'total', (
        SELECT count(*)
        FROM private.member_profile_audit_log AS audit
        WHERE audit.member_id_snapshot = p_member_id
          AND (
            (v_is_super OR v_is_service)
            OR audit.section <> 'anonymous_reveal'
          )
      ),
      'has_more', (
        SELECT count(*) > 200
        FROM private.member_profile_audit_log AS audit
        WHERE audit.member_id_snapshot = p_member_id
          AND (
            (v_is_super OR v_is_service)
            OR audit.section <> 'anonymous_reveal'
          )
      )
    ),
    'duplicate_candidates', CASE WHEN v_is_super OR v_is_service THEN COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(candidate) ORDER BY candidate.detected_at DESC, candidate.id DESC)
        FROM private.member_duplicate_candidates AS candidate
        WHERE candidate.left_member_id_snapshot = p_member_id
           OR candidate.right_member_id_snapshot = p_member_id
      ),
      '[]'::jsonb
    ) ELSE '[]'::jsonb END
  ) INTO v_result;

  RETURN v_result;
END
$function$;

-- ---------------------------------------------------------------------------
-- Super-administrator lifecycle operations and dependency impact preflight
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_preflight_member_lifecycle(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member public.members%ROWTYPE;
  v_has_admin_link boolean;
  v_counts jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_can_hard_delete boolean := false;
  v_auth_user_id_snapshot uuid;
  v_auth_delete_completed_at timestamptz;
  v_staff_profiles_count bigint := 0;
BEGIN
  IF NOT private.member_master_is_super_admin() THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'MEMBER_MASTER_SUPER_ADMIN_REQUIRED';
  END IF;
  SELECT * INTO v_member
  FROM public.members AS member
  WHERE member.id = p_member_id;
  IF v_member.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_NOT_FOUND';
  END IF;

  SELECT tombstone.auth_user_id, tombstone.auth_delete_completed_at
  INTO v_auth_user_id_snapshot, v_auth_delete_completed_at
  FROM private.member_auth_tombstones AS tombstone
  WHERE tombstone.member_id_snapshot = p_member_id
  ORDER BY tombstone.created_at DESC
  LIMIT 1;
  v_auth_user_id_snapshot := COALESCE(v_member.user_id, v_auth_user_id_snapshot);

  v_has_admin_link := v_auth_user_id_snapshot IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.admin_users AS administrator
    WHERE administrator.user_id = v_auth_user_id_snapshot
  );
  IF v_has_admin_link THEN
    v_blockers := v_blockers || jsonb_build_array(
      jsonb_build_object(
        'code', 'LINKED_ADMIN_ACCOUNT',
        'message', 'Administrator account must be reviewed before anonymization'
      )
    );
  END IF;

  IF to_regclass('public.staff_profiles') IS NOT NULL THEN
    EXECUTE
      'SELECT count(*) FROM public.staff_profiles WHERE member_id = $1'
      INTO v_staff_profiles_count
      USING p_member_id;
  END IF;

  v_counts := jsonb_build_object(
    'identity', (SELECT count(*) FROM public.member_identity WHERE member_id = p_member_id),
    'language', (SELECT count(*) FROM public.member_language WHERE member_id = p_member_id),
    'interests', (SELECT count(*) FROM public.member_interests WHERE member_id = p_member_id),
    'personality', (SELECT count(*) FROM public.member_personality WHERE member_id = p_member_id),
    'boundaries', (SELECT count(*) FROM public.member_boundaries WHERE member_id = p_member_id),
    'quiz', (SELECT count(*) FROM public.personality_quiz_results WHERE member_id = p_member_id),
    'verification', (SELECT count(*) FROM public.member_verification WHERE member_id = p_member_id),
    'interview_evaluations', (SELECT count(*) FROM public.interview_evaluations WHERE member_id = p_member_id),
    'dynamic_stats', (SELECT count(*) FROM public.member_dynamic_stats WHERE member_id = p_member_id),
    'member_notes', (SELECT count(*) FROM public.member_notes WHERE member_id = p_member_id),
    'feedback', (SELECT count(*) FROM public.player_feedback WHERE member_id = p_member_id),
    'match_round_submissions', (
      SELECT count(*) FROM public.match_round_submissions WHERE member_id = p_member_id
    ),
    'script_play_records', (
      SELECT count(*) FROM public.script_play_records WHERE member_id = p_member_id
    ),
    'unmatched_diagnostics', (
      SELECT count(*) FROM public.unmatched_diagnostics WHERE member_id = p_member_id
    ),
    'reviews_written', (SELECT count(*) FROM public.mutual_reviews WHERE reviewer_id = p_member_id),
    'reviews_received', (SELECT count(*) FROM public.mutual_reviews WHERE reviewee_id = p_member_id),
    'matches', (
      SELECT count(*) FROM public.match_results AS match
      WHERE match.member_a_id = p_member_id
         OR match.member_b_id = p_member_id
         OR p_member_id = ANY(COALESCE(match.group_members, ARRAY[]::uuid[]))
    ),
    'activities', (
      SELECT count(*) FROM public.activity_records AS activity
      WHERE p_member_id = ANY(COALESCE(activity.participant_ids, ARRAY[]::uuid[]))
    ),
    'community_profiles', (
      SELECT count(*) FROM private.community_profile_members WHERE member_id = p_member_id
    ),
    'community_non_anonymous_posts', (
      SELECT count(*)
      FROM public.community_posts AS post
      JOIN private.community_profile_members AS profile_member
        ON profile_member.profile_id = post.author_profile_id
      WHERE profile_member.member_id = p_member_id AND NOT post.is_anonymous
    ),
    'community_non_anonymous_comments', (
      SELECT count(*)
      FROM public.community_comments AS comment
      JOIN private.community_profile_members AS profile_member
        ON profile_member.profile_id = comment.author_profile_id
      WHERE profile_member.member_id = p_member_id AND NOT comment.is_anonymous_author
    ),
    'community_anonymous_posts', (
      SELECT count(*)
      FROM private.community_post_authors AS author
      JOIN public.community_posts AS post ON post.id = author.post_id
      WHERE author.member_id = p_member_id AND post.is_anonymous
    ),
    'community_anonymous_comments', (
      SELECT count(*)
      FROM private.community_comment_authors AS author
      JOIN public.community_comments AS comment ON comment.id = author.comment_id
      WHERE author.member_id = p_member_id AND comment.is_anonymous_author
    ),
    'role_assignments', (
      SELECT count(*) FROM private.member_role_assignments WHERE member_id = p_member_id
    ),
    'duplicate_candidates', (
      SELECT count(*) FROM private.member_duplicate_candidates
      WHERE left_member_id_snapshot = p_member_id OR right_member_id_snapshot = p_member_id
    ),
    'legacy_records', (
      SELECT count(*) FROM public.legacy_members
      WHERE canonical_member_id = p_member_id
    ),
    'audit_events', (
      SELECT count(*) FROM private.member_profile_audit_log
      WHERE member_id_snapshot = p_member_id
    ),
    'staff_profiles', v_staff_profiles_count
  );

  -- There is deliberately no partial merge/delete shortcut. Hard delete is
  -- possible only for an explicitly admin-sourced, entirely blank, unbound
  -- test shell. Rebuildable metrics/roles and immutable audit do not block it.
  v_can_hard_delete :=
    v_member.record_source = 'admin'
    AND v_member.account_status = 'unbound'
    AND v_member.user_id IS NULL
    AND v_member.member_number IS NULL
    AND v_member.email IS NULL
    AND v_member.line_user_id IS NULL
    AND v_member.wechat_openid IS NULL
    AND v_member.status = 'pending'
    AND (v_counts->>'identity')::bigint = 0
    AND (v_counts->>'language')::bigint = 0
    AND (v_counts->>'interests')::bigint = 0
    AND (v_counts->>'personality')::bigint = 0
    AND (v_counts->>'boundaries')::bigint = 0
    AND (v_counts->>'quiz')::bigint = 0
    AND (v_counts->>'verification')::bigint = 0
    AND (v_counts->>'interview_evaluations')::bigint = 0
    AND (v_counts->>'dynamic_stats')::bigint = 0
    AND (v_counts->>'member_notes')::bigint = 0
    AND (v_counts->>'feedback')::bigint = 0
    AND (v_counts->>'match_round_submissions')::bigint = 0
    AND (v_counts->>'script_play_records')::bigint = 0
    AND (v_counts->>'unmatched_diagnostics')::bigint = 0
    AND (v_counts->>'reviews_written')::bigint = 0
    AND (v_counts->>'reviews_received')::bigint = 0
    AND (v_counts->>'matches')::bigint = 0
    AND (v_counts->>'activities')::bigint = 0
    AND (v_counts->>'community_profiles')::bigint = 0
    AND (v_counts->>'community_anonymous_posts')::bigint = 0
    AND (v_counts->>'community_anonymous_comments')::bigint = 0
    AND (v_counts->>'duplicate_candidates')::bigint = 0
    AND (v_counts->>'legacy_records')::bigint = 0
    AND (v_counts->>'staff_profiles')::bigint = 0;

  RETURN jsonb_build_object(
    'member_id', p_member_id,
    'account_status', v_member.account_status,
    'anonymized_at', v_member.anonymized_at,
    'auth_bound', v_member.user_id IS NOT NULL,
    'auth_user_id_snapshot', v_auth_user_id_snapshot,
    'auth_delete_completed_at', v_auth_delete_completed_at,
    'auth_operation_required',
      v_auth_user_id_snapshot IS NOT NULL AND v_auth_delete_completed_at IS NULL,
    'database_rpc_changes_auth_user', false,
    'can_suspend', v_member.account_status = 'active',
    'can_reactivate', v_member.account_status = 'suspended',
    'can_close', v_member.account_status <> 'closed',
    'can_anonymize', v_member.anonymized_at IS NULL AND NOT v_has_admin_link,
    'can_hard_delete', v_can_hard_delete,
    'hard_delete_scope', 'admin_sourced_blank_unbound_test_shell_only',
    'counts', v_counts,
    'blockers', v_blockers
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_member_account_status(
  p_member_id uuid,
  p_account_status text,
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
  v_member public.members%ROWTYPE;
  v_event_id bigint;
  v_updated_at timestamptz;
BEGIN
  IF v_admin_id IS NULL OR NOT private.member_master_is_super_admin() THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'MEMBER_MASTER_SUPER_ADMIN_REQUIRED';
  END IF;
  IF p_account_status IS NULL
     OR p_account_status NOT IN ('active', 'suspended', 'closed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_ACCOUNT_STATUS_INVALID';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_REASON_REQUIRED';
  END IF;

  SELECT * INTO v_member
  FROM public.members AS member
  WHERE member.id = p_member_id
  FOR UPDATE;
  IF v_member.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_NOT_FOUND';
  END IF;
  IF v_member.account_status = 'closed'
     AND p_account_status <> 'closed' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MEMBER_MASTER_CLOSED_IS_TERMINAL';
  END IF;
  IF p_account_status = 'active' AND v_member.user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MEMBER_MASTER_AUTH_LINK_REQUIRED';
  END IF;

  SELECT administrator.name INTO v_admin_name
  FROM public.admin_users AS administrator
  WHERE administrator.id = v_admin_id;

  IF v_member.account_status IS DISTINCT FROM p_account_status THEN
    PERFORM set_config('app.member_master_skip_member_audit', 'on', true);
    UPDATE public.members
    SET account_status = p_account_status, updated_at = now()
    WHERE id = p_member_id
    RETURNING updated_at INTO v_updated_at;

    INSERT INTO private.member_profile_audit_log (
      member_id, member_id_snapshot, action_type, section, changed_fields,
      before_values, after_values, reason, source,
      actor_user_id, actor_admin_id, actor_name
    ) VALUES (
      p_member_id, p_member_id, 'account_status_change', 'lifecycle',
      ARRAY['account_status']::text[],
      jsonb_build_object('account_status', v_member.account_status),
      jsonb_build_object('account_status', p_account_status),
      btrim(p_reason), 'admin', (SELECT auth.uid()), v_admin_id, v_admin_name
    ) RETURNING id INTO v_event_id;
  ELSE
    v_updated_at := v_member.updated_at;
  END IF;

  RETURN jsonb_build_object(
    'member_id', p_member_id,
    'user_id', v_member.user_id,
    'section', 'lifecycle',
    'updated_at', v_updated_at,
    'changed_fields', CASE
      WHEN v_event_id IS NULL THEN ARRAY[]::text[]
      ELSE ARRAY['account_status']::text[]
    END,
    'event_id', v_event_id,
    'data', jsonb_build_object(
      'account_status', p_account_status,
      'anonymized_at', v_member.anonymized_at,
      'user_id', v_member.user_id
    )
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_anonymize_member(
  p_member_id uuid,
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
  v_member public.members%ROWTYPE;
  v_lock_user_id uuid;
  v_anonymized_at timestamptz := now();
  v_anonymous_label text := '匿名-' || substring(replace(p_member_id::text, '-', '') FROM 1 FOR 12);
  v_event_id bigint;
  v_updated_at timestamptz;
  v_shared_activity_notes_queued integer := 0;
BEGIN
  IF v_admin_id IS NULL OR NOT private.member_master_is_super_admin() THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'MEMBER_MASTER_SUPER_ADMIN_REQUIRED';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_REASON_REQUIRED';
  END IF;
  SELECT member.user_id INTO v_lock_user_id
  FROM public.members AS member
  WHERE member.id = p_member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_NOT_FOUND';
  END IF;
  IF v_lock_user_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('member:' || v_lock_user_id::text, 0)
    );
  END IF;

  SELECT * INTO v_member
  FROM public.members AS member
  WHERE member.id = p_member_id
  FOR UPDATE;
  IF v_member.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_NOT_FOUND';
  END IF;
  IF v_member.anonymized_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MEMBER_MASTER_ALREADY_ANONYMIZED';
  END IF;
  IF v_member.user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.admin_users AS administrator
    WHERE administrator.user_id = v_member.user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MEMBER_MASTER_LINKED_ADMIN_BLOCKS_ANONYMIZE';
  END IF;

  SELECT administrator.name INTO v_admin_name
  FROM public.admin_users AS administrator
  WHERE administrator.id = v_admin_id;
  PERFORM set_config('app.member_master_explicit_audit', 'on', true);
  PERFORM set_config('app.member_master_skip_member_audit', 'on', true);

  IF v_member.user_id IS NOT NULL THEN
    INSERT INTO private.member_auth_tombstones (
      auth_user_id, member_id_snapshot, status, account_status,
      profile_stage, record_source, onboarding_step,
      last_profile_saved_at, submitted_at, anonymized_at,
      created_by_snapshot
    ) VALUES (
      v_member.user_id, p_member_id, v_member.status, 'closed',
      v_member.profile_stage, v_member.record_source, v_member.onboarding_step,
      v_member.last_profile_saved_at, v_member.submitted_at, v_anonymized_at,
      v_admin_id
    )
    ON CONFLICT (auth_user_id) DO UPDATE SET
      member_id_snapshot = EXCLUDED.member_id_snapshot,
      status = EXCLUDED.status,
      account_status = 'closed',
      profile_stage = EXCLUDED.profile_stage,
      record_source = EXCLUDED.record_source,
      onboarding_step = EXCLUDED.onboarding_step,
      last_profile_saved_at = EXCLUDED.last_profile_saved_at,
      submitted_at = EXCLUDED.submitted_at,
      anonymized_at = EXCLUDED.anonymized_at,
      created_by_snapshot = EXCLUDED.created_by_snapshot;
  END IF;

  -- Queue the old private-profile avatar before the identity row is scrubbed.
  -- This belongs only to the explicit anonymization workflow; ordinary
  -- section edits must never enqueue an active avatar for deletion.
  INSERT INTO private.community_media_cleanup_queue (
    bucket_id, object_path, reason
  )
  SELECT 'community-avatars', identity.personal_avatar_path, 'member_anonymized'
  FROM public.member_identity AS identity
  WHERE identity.member_id = p_member_id
    AND identity.personal_avatar_path IS NOT NULL
  ON CONFLICT (bucket_id, object_path) DO UPDATE SET
    reason = EXCLUDED.reason,
    processed_at = NULL,
    last_error = NULL,
    queued_at = now();

  -- Legacy source rows remain linked to the canonical tombstone for
  -- provenance, but every person-identifying field is scrubbed in place.
  UPDATE public.legacy_members AS legacy SET
    member_no = 'ANON-L-' || replace(legacy.id::text, '-', ''),
    full_name = v_anonymous_label,
    gender = NULL,
    school = NULL,
    department = NULL,
    interest_tags = ARRAY[]::text[],
    social_tags = ARRAY[]::text[],
    game_mode = NULL,
    compatibility_score = NULL,
    session_count = 0,
    match_history = '[]'::jsonb
  WHERE legacy.canonical_member_id = p_member_id;

  -- A linked public staff card must not remain published after erasure. The
  -- table is optional in older installations, so keep the mutation dynamic.
  IF to_regclass('public.staff_profiles') IS NOT NULL THEN
    EXECUTE
      'INSERT INTO private.community_media_cleanup_queue (
         bucket_id, object_path, reason
       )
       SELECT
         ''staff-avatars'',
         split_part(
           split_part(
             staff.avatar_url,
             ''/storage/v1/object/public/staff-avatars/'',
             2
           ),
           ''?'', 1
         ),
         ''member_anonymized''
       FROM public.staff_profiles AS staff
       WHERE staff.member_id = $1
         AND staff.avatar_url LIKE
           ''%/storage/v1/object/public/staff-avatars/%''
         AND NULLIF(split_part(
           split_part(
             staff.avatar_url,
             ''/storage/v1/object/public/staff-avatars/'',
             2
           ),
           ''?'', 1
         ), '''') IS NOT NULL
       ON CONFLICT (bucket_id, object_path) DO UPDATE SET
         reason = EXCLUDED.reason,
         processed_at = NULL,
         last_error = NULL,
         queued_at = now()'
    USING p_member_id;
    EXECUTE
      'UPDATE public.staff_profiles
       SET name = $2, school = ''anonymized'', major = ''anonymized'',
           intro = ''anonymized'', avatar_url = NULL, is_published = false
       WHERE member_id = $1'
    USING p_member_id, v_anonymous_label;
  END IF;

  UPDATE public.match_round_submissions SET
    game_type_pref = '都可以',
    gender_pref = '都可以',
    availability = '{}'::jsonb,
    interest_tags = ARRAY[]::text[],
    social_style = NULL,
    message = NULL,
    import_metadata = NULL
  WHERE member_id = p_member_id;

  UPDATE public.script_play_records SET
    can_view_full = false,
    comment = NULL
  WHERE member_id = p_member_id;

  UPDATE public.unmatched_diagnostics SET
    details = '{}'::jsonb
  WHERE member_id = p_member_id;

  UPDATE public.member_identity
  SET
    full_name = v_anonymous_label,
    nickname = v_anonymous_label,
    gender = 'other',
    age_range = 'anonymized',
    nationality = 'anonymized',
    current_city = 'anonymized',
    school_name = NULL,
    department = NULL,
    degree_level = NULL,
    course_language = NULL,
    enrollment_year = NULL,
    hobby_tags = ARRAY[]::text[],
    activity_type_tags = ARRAY[]::text[],
    personality_self_tags = ARRAY[]::text[],
    taboo_tags = ARRAY[]::text[],
    height_weight = NULL,
    phone = NULL,
    sns_accounts = NULL,
    personal_avatar_path = NULL
  WHERE member_id = p_member_id;

  INSERT INTO private.community_media_cleanup_queue (
    bucket_id, object_path, reason
  )
  SELECT 'community-avatars', profile.avatar_path, 'member_anonymized'
  FROM public.community_profiles AS profile
  JOIN private.community_profile_members AS profile_member
    ON profile_member.profile_id = profile.id
  WHERE profile_member.member_id = p_member_id
    AND profile.avatar_path IS NOT NULL
  ON CONFLICT (bucket_id, object_path) DO UPDATE SET
    reason = EXCLUDED.reason,
    processed_at = NULL,
    last_error = NULL,
    queued_at = now();

  UPDATE public.community_profiles AS profile
  SET
    nickname = v_anonymous_label,
    avatar_kind = 'default',
    avatar_path = NULL,
    preset_avatar = NULL
  FROM private.community_profile_members AS profile_member
  WHERE profile_member.profile_id = profile.id
    AND profile_member.member_id = p_member_id
    AND (
      profile.nickname IS DISTINCT FROM v_anonymous_label
      OR profile.avatar_kind <> 'default'
      OR profile.avatar_path IS NOT NULL
      OR profile.preset_avatar IS NOT NULL
    );

  UPDATE public.community_nickname_history AS history
  SET
    old_nickname = v_anonymous_label,
    new_nickname = v_anonymous_label,
    changed_by_member_id = NULL
  FROM private.community_profile_members AS profile_member
  WHERE profile_member.profile_id = history.profile_id
    AND profile_member.member_id = p_member_id;

  UPDATE public.member_language SET
    communication_language_pref = ARRAY[]::text[], japanese_level = NULL
  WHERE member_id = p_member_id;
  UPDATE public.member_interests SET
    activity_area = NULL,
    nearest_station = NULL,
    graduation_year = NULL,
    scenario_mode_pref = ARRAY[]::text[],
    ideal_group_size = NULL,
    script_preference = ARRAY[]::text[],
    non_script_preference = ARRAY[]::text[],
    activity_frequency = NULL,
    preferred_time_slots = ARRAY[]::text[],
    budget_range = NULL,
    travel_radius = NULL,
    social_goal_primary = NULL,
    social_goal_secondary = NULL,
    accept_beginners = true,
    accept_cross_school = true,
    scenario_theme_tags = ARRAY[]::text[],
    game_type_pref = NULL
  WHERE member_id = p_member_id;
  UPDATE public.member_personality SET
    extroversion = 3,
    initiative = 3,
    expression_style_tags = ARRAY[]::text[],
    group_role_tags = ARRAY[]::text[],
    warmup_speed = NULL,
    planning_style = NULL,
    coop_compete_tendency = NULL,
    emotional_stability = 3,
    boundary_strength = NULL,
    reply_speed = NULL
  WHERE member_id = p_member_id;
  UPDATE public.member_boundaries SET
    taboo_tags = ARRAY[]::text[],
    deal_breakers = ARRAY[]::text[],
    preferred_age_range = NULL,
    preferred_gender_mix = NULL,
    boundary_notes = NULL
  WHERE member_id = p_member_id;
  UPDATE public.personality_quiz_results SET
    answers = '[]'::jsonb,
    score_e = 0,
    score_a = 0,
    score_o = 0,
    score_c = 0,
    score_n = 0,
    personality_type = NULL,
    completed_at = v_anonymized_at
  WHERE member_id = p_member_id;
  UPDATE public.member_verification SET
    student_id_verified = false,
    photo_verified = false,
    verified_at = NULL,
    verified_by = NULL
  WHERE member_id = p_member_id;
  UPDATE public.interview_evaluations SET
    risk_notes = NULL,
    interviewer_notes = NULL
  WHERE member_id = p_member_id;
  UPDATE public.member_notes SET note = '[anonymized]'
  WHERE member_id = p_member_id;
  UPDATE public.player_feedback SET
    member_name_snapshot = v_anonymous_label,
    content = '[anonymized]',
    admin_note = NULL
  WHERE member_id = p_member_id;
  UPDATE public.mutual_reviews SET comment = NULL
  WHERE reviewer_id = p_member_id OR reviewee_id = p_member_id;
  UPDATE private.member_profile_metrics SET internal_note = 'anonymized'
  WHERE member_id = p_member_id;

  -- Cancellation text is authored by a participant and cannot survive privacy
  -- erasure. Clear the submitter identifier and text for every match involving
  -- the subject; workflow status/timestamps remain useful non-PII history.
  UPDATE public.match_results AS match SET
    cancellation_requested_by = NULL,
    cancellation_reason = NULL
  WHERE (
      match.member_a_id = p_member_id
      OR match.member_b_id = p_member_id
      OR p_member_id = ANY(COALESCE(match.group_members, ARRAY[]::uuid[]))
    )
    AND (
      match.cancellation_requested_by IS NOT NULL
      OR match.cancellation_reason IS NOT NULL
    );

  -- feedback_a/feedback_b belong to their corresponding member side. The
  -- shared notes field cannot be split reliably, so remove it in full.
  UPDATE public.pair_relationships AS relationship SET
    feedback_a = CASE
      WHEN relationship.member_a_id = p_member_id THEN NULL
      ELSE relationship.feedback_a
    END,
    feedback_b = CASE
      WHEN relationship.member_b_id = p_member_id THEN NULL
      ELSE relationship.feedback_b
    END,
    notes = NULL
  WHERE relationship.member_a_id = p_member_id
     OR relationship.member_b_id = p_member_id;

  -- Activity notes are shared across participants. Record a PII-free review
  -- marker before removing the text so operators can reconstruct a neutral
  -- business note later without retaining the erased content anywhere.
  INSERT INTO private.member_privacy_review_queue (
    member_id_snapshot, entity_table, entity_id, field_names, reason
  )
  SELECT
    p_member_id, 'activity_records', activity.id, ARRAY['notes']::text[],
    'member_anonymized_shared_note_removed'
  FROM public.activity_records AS activity
  WHERE (
      p_member_id = ANY(COALESCE(activity.participant_ids, ARRAY[]::uuid[]))
      OR p_member_id = ANY(COALESCE(activity.late_member_ids, ARRAY[]::uuid[]))
      OR p_member_id = ANY(COALESCE(activity.no_show_member_ids, ARRAY[]::uuid[]))
    )
    AND NULLIF(btrim(activity.notes), '') IS NOT NULL
  ON CONFLICT (member_id_snapshot, entity_table, entity_id)
    WHERE status = 'pending'
  DO UPDATE SET
    field_names = EXCLUDED.field_names,
    reason = EXCLUDED.reason,
    queued_at = now();
  GET DIAGNOSTICS v_shared_activity_notes_queued = ROW_COUNT;

  UPDATE public.activity_records AS activity SET notes = NULL
  WHERE (
      p_member_id = ANY(COALESCE(activity.participant_ids, ARRAY[]::uuid[]))
      OR p_member_id = ANY(COALESCE(activity.late_member_ids, ARRAY[]::uuid[]))
      OR p_member_id = ANY(COALESCE(activity.no_show_member_ids, ARRAY[]::uuid[]))
    )
    AND activity.notes IS NOT NULL;

  INSERT INTO private.community_media_cleanup_queue (
    bucket_id, object_path, reason
  )
  SELECT 'community-media', media.object_path, 'member_anonymized'
  FROM (
    SELECT unnest(ARRAY[image.storage_path, image.thumbnail_path]) AS object_path
    FROM public.community_post_images AS image
    JOIN public.community_posts AS post ON post.id = image.post_id
    LEFT JOIN private.community_profile_members AS profile_member
      ON profile_member.profile_id = post.author_profile_id
    LEFT JOIN private.community_post_authors AS private_author
      ON private_author.post_id = post.id
    WHERE profile_member.member_id = p_member_id
       OR private_author.member_id = p_member_id
  ) AS media
  WHERE media.object_path IS NOT NULL
  ON CONFLICT (bucket_id, object_path) DO UPDATE SET
    reason = EXCLUDED.reason,
    processed_at = NULL,
    last_error = NULL,
    queued_at = now();

  DELETE FROM public.community_post_images AS image
  USING public.community_posts AS post
  LEFT JOIN private.community_profile_members AS profile_member
    ON profile_member.profile_id = post.author_profile_id
  LEFT JOIN private.community_post_authors AS private_author
    ON private_author.post_id = post.id
  WHERE image.post_id = post.id
    AND (
      profile_member.member_id = p_member_id
      OR private_author.member_id = p_member_id
    );

  UPDATE public.community_posts AS post SET
    title = NULL,
    body = NULL,
    status = 'deleted',
    deleted_at = COALESCE(post.deleted_at, v_anonymized_at),
    updated_at = v_anonymized_at
  FROM private.community_profile_members AS profile_member
  WHERE profile_member.profile_id = post.author_profile_id
    AND profile_member.member_id = p_member_id;
  UPDATE public.community_posts AS post SET
    title = NULL,
    body = NULL,
    status = 'deleted',
    deleted_at = COALESCE(post.deleted_at, v_anonymized_at),
    updated_at = v_anonymized_at
  FROM private.community_post_authors AS private_author
  WHERE private_author.post_id = post.id
    AND private_author.member_id = p_member_id;

  UPDATE public.community_comments AS comment SET
    body = NULL,
    status = 'deleted',
    removal_source = 'admin',
    deleted_at = COALESCE(comment.deleted_at, v_anonymized_at),
    updated_at = v_anonymized_at
  FROM private.community_profile_members AS profile_member
  WHERE profile_member.profile_id = comment.author_profile_id
    AND profile_member.member_id = p_member_id;
  UPDATE public.community_comments AS comment SET
    body = NULL,
    status = 'deleted',
    removal_source = 'admin',
    deleted_at = COALESCE(comment.deleted_at, v_anonymized_at),
    updated_at = v_anonymized_at
  FROM private.community_comment_authors AS private_author
  WHERE private_author.comment_id = comment.id
    AND private_author.member_id = p_member_id;

  -- Once the content has been privacy-deleted, sever the private anonymous
  -- author map as well. Permanent reveal audit events (when any exist) retain
  -- only immutable moderation snapshots and are never exposed to ordinary
  -- administrator member-history queries.
  UPDATE private.community_post_authors
  SET member_id = NULL
  WHERE member_id = p_member_id;
  UPDATE private.community_comment_authors
  SET member_id = NULL
  WHERE member_id = p_member_id;

  UPDATE public.members
  SET
    member_number = NULL,
    email = NULL,
    line_user_id = NULL,
    wechat_openid = NULL,
    user_id = NULL,
    account_status = 'closed',
    anonymized_at = v_anonymized_at,
    updated_at = v_anonymized_at
  WHERE id = p_member_id
  RETURNING updated_at INTO v_updated_at;

  INSERT INTO private.member_profile_audit_log (
    member_id, member_id_snapshot, action_type, section, changed_fields,
    before_values, after_values, reason, source,
    actor_user_id, actor_admin_id, actor_name, metadata
  ) VALUES (
    p_member_id, p_member_id, 'member_anonymized', 'lifecycle',
    ARRAY[
      'member_number', 'email', 'line_user_id', 'wechat_openid',
      'account_status', 'anonymized_at', 'profile_data', 'legacy_records',
      'staff_profile', 'match_round_submissions', 'script_play_records',
      'unmatched_diagnostics', 'operational_free_text'
    ]::text[],
    jsonb_build_object(
      'account_status', v_member.account_status,
      'anonymized_at', v_member.anonymized_at,
      'profile_data_present', true
    ),
    jsonb_build_object(
      'account_status', 'closed',
      'anonymized_at', v_anonymized_at,
      'profile_data_anonymized', true
    ),
    btrim(p_reason), 'admin', (SELECT auth.uid()), v_admin_id, v_admin_name,
    jsonb_build_object(
      'auth_user_mutated', false,
      'auth_user_id_snapshot', v_member.user_id,
      'auth_delete_required', v_member.user_id IS NOT NULL,
      'auth_delete_completed', false,
      'shared_activity_notes_queued', v_shared_activity_notes_queued
    )
  ) RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'member_id', p_member_id,
    'user_id', v_member.user_id,
    'section', 'lifecycle',
    'updated_at', v_updated_at,
    'changed_fields', ARRAY[
      'member_number', 'email', 'line_user_id', 'wechat_openid',
      'account_status', 'anonymized_at', 'profile_data',
      'operational_free_text'
    ]::text[],
    'event_id', v_event_id,
    'data', jsonb_build_object(
      'account_status', 'closed',
      'anonymized_at', v_anonymized_at,
      'user_id', NULL,
      'auth_user_id_snapshot', v_member.user_id,
      'auth_delete_required', v_member.user_id IS NOT NULL,
      'auth_delete_completed', false,
      'partial_until_auth_delete', v_member.user_id IS NOT NULL
    )
  );
END
$function$;

-- Service-only bridge for verified LINE self-claim/unlink callbacks. It never
-- accepts a member id from the browser and never infers identity by email.
CREATE OR REPLACE FUNCTION public.service_set_member_line_identity(
  p_user_id uuid,
  p_line_user_id text,
  p_operation text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member public.members%ROWTYPE;
  v_line_user_id text := NULLIF(btrim(p_line_user_id), '');
  v_lock_line_user_id text;
  v_before_state jsonb;
  v_after_state jsonb;
  v_changed_fields text[];
  v_event_id bigint;
  v_updated_at timestamptz;
BEGIN
  IF COALESCE((SELECT auth.jwt()->>'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_SERVICE_ROLE_REQUIRED';
  END IF;
  IF p_user_id IS NULL OR p_operation NOT IN ('bind', 'unbind') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_LINE_IDENTITY_OPERATION_INVALID';
  END IF;
  IF (p_operation = 'bind' AND v_line_user_id IS NULL)
     OR (
       v_line_user_id IS NOT NULL
       AND (
         char_length(v_line_user_id) NOT BETWEEN 1 AND 255
         OR v_line_user_id !~ '^[A-Za-z0-9_-]+$'
       )
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_LINE_IDENTITY_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('member:' || p_user_id::text, 0));
  SELECT * INTO v_member
  FROM public.members AS member
  WHERE member.user_id = p_user_id
  FOR UPDATE;
  IF v_member.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_NOT_FOUND';
  END IF;
  IF v_member.account_status = 'closed' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MEMBER_MASTER_ACCOUNT_BLOCKED';
  END IF;

  -- Serialize all RPC bind/unbind operations for the same LINE subject. The
  -- member lock is always acquired first, which gives callers one stable lock
  -- order and prevents two different users from both passing the conflict
  -- check before the unique index is reached.
  v_lock_line_user_id := CASE
    WHEN p_operation = 'bind' THEN v_line_user_id
    ELSE COALESCE(v_member.line_user_id, v_line_user_id)
  END;
  IF v_lock_line_user_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('line:' || v_lock_line_user_id, 0)
    );
  END IF;

  IF p_operation = 'bind'
     AND v_member.line_user_id IS NOT NULL
     AND v_member.line_user_id IS DISTINCT FROM v_line_user_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MEMBER_MASTER_LINE_IDENTITY_ALREADY_BOUND';
  END IF;
  IF p_operation = 'bind' AND EXISTS (
    SELECT 1 FROM public.members AS other_member
    WHERE other_member.id <> v_member.id
      AND other_member.line_user_id = v_line_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'MEMBER_MASTER_LINE_IDENTITY_CONFLICT';
  END IF;
  IF p_operation = 'unbind'
     AND v_line_user_id IS NOT NULL
     AND v_member.line_user_id IS DISTINCT FROM v_line_user_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MEMBER_MASTER_LINE_IDENTITY_MISMATCH';
  END IF;

  v_before_state := jsonb_build_object(
    'line_user_id', v_member.line_user_id,
    'record_source', v_member.record_source
  );
  PERFORM set_config('app.member_master_skip_member_audit', 'on', true);
  UPDATE public.members
  SET
    line_user_id = CASE WHEN p_operation = 'bind' THEN v_line_user_id ELSE NULL END,
    updated_at = now()
  WHERE id = v_member.id;

  SELECT jsonb_build_object(
    'line_user_id', member.line_user_id,
    'record_source', member.record_source
  ), member.updated_at INTO v_after_state, v_updated_at
  FROM public.members AS member
  WHERE member.id = v_member.id;
  v_changed_fields := private.member_master_changed_fields(v_before_state, v_after_state);

  INSERT INTO private.member_profile_audit_log (
    member_id, member_id_snapshot, action_type, section, changed_fields,
    before_values, after_values, reason, source, actor_user_id, metadata
  ) VALUES (
    v_member.id, v_member.id, 'service_identity_link', 'account', v_changed_fields,
    jsonb_build_object(
      'line_identity_bound', (v_before_state->>'line_user_id') IS NOT NULL,
      'record_source', v_before_state->>'record_source'
    ),
    jsonb_build_object(
      'line_identity_bound', (v_after_state->>'line_user_id') IS NOT NULL,
      'record_source', v_after_state->>'record_source'
    ),
    CASE WHEN p_operation = 'bind' THEN 'LINE_SELF_BIND' ELSE 'LINE_SELF_UNBIND' END,
    'line_self_service', p_user_id,
    jsonb_build_object(
      'operation', p_operation,
      'auth_user_id', p_user_id,
      'verified_self_claim', true,
      'changed', cardinality(v_changed_fields) > 0
    )
  ) RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'member_id', v_member.id,
    'user_id', p_user_id,
    'line_user_id', v_after_state->>'line_user_id',
    'operation', p_operation,
    'changed', cardinality(v_changed_fields) > 0,
    'audit_event_id', v_event_id,
    'updated_at', v_updated_at
  );
END
$function$;

-- ---------------------------------------------------------------------------
-- Direct-write/RLS hardening: member masters and admin writes are RPC-only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.profile_current_approved_member_id()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid;
BEGIN
  SELECT member.id INTO v_member_id
  FROM public.members AS member
  WHERE member.user_id = (SELECT auth.uid())
    AND member.status = 'approved'
    AND member.account_status = 'active'
  LIMIT 1
  FOR KEY SHARE;
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
  v_member_id uuid;
BEGIN
  SELECT member.id INTO v_member_id
  FROM public.members AS member
  WHERE member.user_id = (SELECT auth.uid())
    AND member.status = 'approved'
    AND member.account_status = 'active'
  LIMIT 1
  FOR KEY SHARE;
  RETURN v_member_id;
END
$function$;

-- Player cancellation is a narrow self-service mutation. A broad UPDATE RLS
-- policy on match_results would let a player tamper with scores/status, so the
-- RPC derives the active member from auth.uid(), validates participation and
-- writes only the cancellation-request fields.
CREATE OR REPLACE FUNCTION public.request_my_match_cancellation(
  p_result_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid := private.profile_current_approved_member_id();
  v_result public.match_results%ROWTYPE;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_updated_at timestamptz := now();
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'MEMBER_MASTER_ACTIVE_MEMBER_REQUIRED';
  END IF;
  IF p_result_id IS NULL OR char_length(COALESCE(v_reason, '')) > 500 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;

  SELECT result.* INTO v_result
  FROM public.match_results AS result
  WHERE result.id = p_result_id
  FOR UPDATE;
  IF v_result.id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'MEMBER_MASTER_MATCH_NOT_FOUND';
  END IF;
  IF v_member_id IS DISTINCT FROM v_result.member_a_id
     AND v_member_id IS DISTINCT FROM v_result.member_b_id
     AND NOT (
       v_member_id = ANY(COALESCE(v_result.group_members, ARRAY[]::uuid[]))
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'MEMBER_MASTER_MATCH_PARTICIPANT_REQUIRED';
  END IF;
  IF v_result.status = 'cancelled' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'MEMBER_MASTER_MATCH_ALREADY_CANCELLED';
  END IF;
  IF v_result.cancellation_status = 'pending' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'MEMBER_MASTER_CANCELLATION_ALREADY_PENDING';
  END IF;

  PERFORM set_config(
    'app.member_master_audit_reason',
    COALESCE(v_reason, 'Player cancellation request'),
    true
  );
  UPDATE public.match_results AS result SET
    cancellation_requested_by = v_member_id,
    cancellation_reason = v_reason,
    cancellation_requested_at = v_updated_at,
    cancellation_status = 'pending'
  WHERE result.id = p_result_id;

  RETURN jsonb_build_object(
    'match_result_id', p_result_id,
    'member_id', v_member_id,
    'cancellation_status', 'pending',
    'cancellation_requested_at', v_updated_at
  );
END
$function$;

DROP POLICY IF EXISTS "insert_members_self" ON public.members;
DROP POLICY IF EXISTS "update_members_admin" ON public.members;
DROP POLICY IF EXISTS "authenticated_insert_members" ON public.members;
DROP POLICY IF EXISTS "allow_anon_insert_members" ON public.members;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.members
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.members TO service_role;

DROP POLICY IF EXISTS "insert_identity_self" ON public.member_identity;
DROP POLICY IF EXISTS "update_identity_admin_or_self" ON public.member_identity;
DROP POLICY IF EXISTS "authenticated_insert_identity" ON public.member_identity;
DROP POLICY IF EXISTS "allow_anon_insert_identity" ON public.member_identity;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.member_identity
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.member_identity TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.member_identity TO service_role;

-- Supplementary sections retain reviewed player self-service while removing
-- the historical admin direct-write branch. Administrator changes use the
-- audited admin_update_member_section RPC.
DROP POLICY IF EXISTS "insert_own" ON public.member_language;
DROP POLICY IF EXISTS "update_own_or_admin" ON public.member_language;
CREATE POLICY member_master_language_insert_own_active
  ON public.member_language FOR INSERT TO authenticated
  WITH CHECK (
    member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  );
CREATE POLICY member_master_language_update_own_active
  ON public.member_language FOR UPDATE TO authenticated
  USING (
    member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  )
  WITH CHECK (
    member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  );

DROP POLICY IF EXISTS "insert_own" ON public.member_interests;
DROP POLICY IF EXISTS "update_own_or_admin" ON public.member_interests;
CREATE POLICY member_master_interests_insert_own_active
  ON public.member_interests FOR INSERT TO authenticated
  WITH CHECK (
    member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  );
CREATE POLICY member_master_interests_update_own_active
  ON public.member_interests FOR UPDATE TO authenticated
  USING (
    member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  )
  WITH CHECK (
    member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  );

DROP POLICY IF EXISTS "insert_own" ON public.member_personality;
DROP POLICY IF EXISTS "update_own_or_admin" ON public.member_personality;
CREATE POLICY member_master_personality_insert_own_active
  ON public.member_personality FOR INSERT TO authenticated
  WITH CHECK (
    member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  );
CREATE POLICY member_master_personality_update_own_active
  ON public.member_personality FOR UPDATE TO authenticated
  USING (
    member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  )
  WITH CHECK (
    member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  );

DROP POLICY IF EXISTS "insert_own" ON public.member_boundaries;
DROP POLICY IF EXISTS "update_own_or_admin" ON public.member_boundaries;
CREATE POLICY member_master_boundaries_insert_own_active
  ON public.member_boundaries FOR INSERT TO authenticated
  WITH CHECK (
    member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  );
CREATE POLICY member_master_boundaries_update_own_active
  ON public.member_boundaries FOR UPDATE TO authenticated
  USING (
    member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  )
  WITH CHECK (
    member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  );

REVOKE ALL ON TABLE
  public.member_language,
  public.member_interests,
  public.member_personality,
  public.member_boundaries
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE
  public.member_language,
  public.member_interests,
  public.member_personality,
  public.member_boundaries
TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.member_language,
  public.member_interests,
  public.member_personality,
  public.member_boundaries
TO service_role;

DROP POLICY IF EXISTS "player_read_write_own" ON public.personality_quiz_results;
DROP POLICY IF EXISTS "admin_all" ON public.personality_quiz_results;
CREATE POLICY member_master_quiz_read_own_or_admin
  ON public.personality_quiz_results FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
    )
  );
CREATE POLICY member_master_quiz_insert_own_active
  ON public.personality_quiz_results FOR INSERT TO authenticated
  WITH CHECK (
    member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  );
CREATE POLICY member_master_quiz_update_own_active
  ON public.personality_quiz_results FOR UPDATE TO authenticated
  USING (
    member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  )
  WITH CHECK (
    member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  );
REVOKE ALL ON TABLE public.personality_quiz_results
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.personality_quiz_results TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.personality_quiz_results TO service_role;

DROP POLICY IF EXISTS "admin_all" ON public.member_verification;
CREATE POLICY member_master_verification_read_own_or_admin
  ON public.member_verification FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
    )
  );
REVOKE INSERT, UPDATE, DELETE ON TABLE public.member_verification
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.member_verification TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.member_verification TO service_role;

DROP POLICY IF EXISTS "insert_evaluations_admin" ON public.interview_evaluations;
DROP POLICY IF EXISTS "update_evaluations_admin" ON public.interview_evaluations;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.interview_evaluations
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.interview_evaluations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.interview_evaluations TO service_role;

-- Admin whitelist self-binding is retained, but only the nullable user_id may
-- change during that one self-bind. Every other write requires super_admin.
CREATE OR REPLACE FUNCTION private.member_master_guard_admin_user_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_is_service boolean := COALESCE((SELECT auth.jwt()->>'role'), '') = 'service_role';
BEGIN
  IF v_is_service OR private.member_master_is_super_admin() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.user_id IS NULL
     AND OLD.email = public.my_email()
     AND NEW.user_id = (SELECT auth.uid())
     AND (to_jsonb(NEW) - 'user_id') = (to_jsonb(OLD) - 'user_id') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = '42501',
    MESSAGE = 'MEMBER_MASTER_SUPER_ADMIN_REQUIRED';
END
$function$;

DROP TRIGGER IF EXISTS member_master_guard_admin_user_mutation ON public.admin_users;
CREATE TRIGGER member_master_guard_admin_user_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION private.member_master_guard_admin_user_mutation();

CREATE OR REPLACE FUNCTION private.member_master_guard_anonymized_member_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.anonymized_at IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'MEMBER_MASTER_ANONYMIZED_RECORD_LOCKED';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS member_master_guard_anonymized_mutation ON public.members;
CREATE TRIGGER member_master_guard_anonymized_mutation
  BEFORE UPDATE OR DELETE ON public.members
  FOR EACH ROW EXECUTE FUNCTION private.member_master_guard_anonymized_member_mutation();

CREATE OR REPLACE FUNCTION private.member_master_guard_anonymized_dependent_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_ids uuid[];
BEGIN
  IF TG_TABLE_NAME = 'legacy_members' THEN
    v_member_ids := CASE
      WHEN TG_OP = 'INSERT' THEN ARRAY[NEW.canonical_member_id]
      ELSE ARRAY[OLD.canonical_member_id, NEW.canonical_member_id]
    END;
  ELSE
    v_member_ids := CASE
      WHEN TG_OP = 'INSERT' THEN ARRAY[NEW.member_id]
      ELSE ARRAY[OLD.member_id, NEW.member_id]
    END;
  END IF;
  PERFORM private.member_master_lock_non_anonymized_subjects(v_member_ids);
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS member_master_guard_anonymized_write
  ON private.member_profile_metrics;
CREATE TRIGGER member_master_guard_anonymized_write
  BEFORE INSERT OR UPDATE ON private.member_profile_metrics
  FOR EACH ROW EXECUTE FUNCTION private.member_master_guard_anonymized_dependent_write();
DROP TRIGGER IF EXISTS member_master_guard_anonymized_write
  ON public.interview_evaluations;
CREATE TRIGGER member_master_guard_anonymized_write
  BEFORE INSERT OR UPDATE ON public.interview_evaluations
  FOR EACH ROW EXECUTE FUNCTION private.member_master_guard_anonymized_dependent_write();
DROP TRIGGER IF EXISTS member_master_guard_anonymized_write
  ON public.member_notes;
CREATE TRIGGER member_master_guard_anonymized_write
  BEFORE INSERT OR UPDATE ON public.member_notes
  FOR EACH ROW EXECUTE FUNCTION private.member_master_guard_anonymized_dependent_write();
DROP TRIGGER IF EXISTS member_master_guard_anonymized_write
  ON public.player_feedback;
CREATE TRIGGER member_master_guard_anonymized_write
  BEFORE INSERT OR UPDATE ON public.player_feedback
  FOR EACH ROW EXECUTE FUNCTION private.member_master_guard_anonymized_dependent_write();
DROP TRIGGER IF EXISTS member_master_guard_anonymized_write
  ON public.match_round_submissions;
CREATE TRIGGER member_master_guard_anonymized_write
  BEFORE INSERT OR UPDATE ON public.match_round_submissions
  FOR EACH ROW EXECUTE FUNCTION private.member_master_guard_anonymized_dependent_write();
DROP TRIGGER IF EXISTS member_master_guard_anonymized_write
  ON public.member_identity;
CREATE TRIGGER member_master_guard_anonymized_write
  BEFORE INSERT OR UPDATE ON public.member_identity
  FOR EACH ROW EXECUTE FUNCTION private.member_master_guard_anonymized_dependent_write();
DROP TRIGGER IF EXISTS member_master_guard_anonymized_write
  ON public.member_language;
CREATE TRIGGER member_master_guard_anonymized_write
  BEFORE INSERT OR UPDATE ON public.member_language
  FOR EACH ROW EXECUTE FUNCTION private.member_master_guard_anonymized_dependent_write();
DROP TRIGGER IF EXISTS member_master_guard_anonymized_write
  ON public.member_interests;
CREATE TRIGGER member_master_guard_anonymized_write
  BEFORE INSERT OR UPDATE ON public.member_interests
  FOR EACH ROW EXECUTE FUNCTION private.member_master_guard_anonymized_dependent_write();
DROP TRIGGER IF EXISTS member_master_guard_anonymized_write
  ON public.member_personality;
CREATE TRIGGER member_master_guard_anonymized_write
  BEFORE INSERT OR UPDATE ON public.member_personality
  FOR EACH ROW EXECUTE FUNCTION private.member_master_guard_anonymized_dependent_write();
DROP TRIGGER IF EXISTS member_master_guard_anonymized_write
  ON public.member_boundaries;
CREATE TRIGGER member_master_guard_anonymized_write
  BEFORE INSERT OR UPDATE ON public.member_boundaries
  FOR EACH ROW EXECUTE FUNCTION private.member_master_guard_anonymized_dependent_write();
DROP TRIGGER IF EXISTS member_master_guard_anonymized_write
  ON public.personality_quiz_results;
CREATE TRIGGER member_master_guard_anonymized_write
  BEFORE INSERT OR UPDATE ON public.personality_quiz_results
  FOR EACH ROW EXECUTE FUNCTION private.member_master_guard_anonymized_dependent_write();
DROP TRIGGER IF EXISTS member_master_guard_anonymized_write
  ON public.member_verification;
CREATE TRIGGER member_master_guard_anonymized_write
  BEFORE INSERT OR UPDATE ON public.member_verification
  FOR EACH ROW EXECUTE FUNCTION private.member_master_guard_anonymized_dependent_write();
DROP TRIGGER IF EXISTS member_master_guard_anonymized_write
  ON public.legacy_members;
CREATE TRIGGER member_master_guard_anonymized_write
  BEFORE INSERT OR UPDATE ON public.legacy_members
  FOR EACH ROW EXECUTE FUNCTION private.member_master_guard_anonymized_dependent_write();
DO $do$
BEGIN
  IF to_regclass('public.staff_profiles') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS member_master_guard_anonymized_write
      ON public.staff_profiles;
    CREATE TRIGGER member_master_guard_anonymized_write
      BEFORE INSERT OR UPDATE ON public.staff_profiles
      FOR EACH ROW EXECUTE FUNCTION private.member_master_guard_anonymized_dependent_write();
  END IF;
END
$do$;

DROP POLICY IF EXISTS "insert_admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "update_admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "delete_admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "select_admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "self_check_by_email" ON public.admin_users;
DROP POLICY IF EXISTS "user_read_self" ON public.admin_users;
DROP POLICY IF EXISTS "self_bind_by_email" ON public.admin_users;
DROP POLICY IF EXISTS member_master_admin_users_super_insert ON public.admin_users;
DROP POLICY IF EXISTS member_master_admin_users_super_update ON public.admin_users;
DROP POLICY IF EXISTS member_master_admin_users_super_delete ON public.admin_users;
DROP POLICY IF EXISTS member_master_admin_users_super_select ON public.admin_users;
DROP POLICY IF EXISTS member_master_admin_users_self_or_super_select ON public.admin_users;
CREATE POLICY member_master_admin_users_self_or_super_select
  ON public.admin_users FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT private.member_master_is_super_admin())
  );
CREATE POLICY member_master_admin_users_super_insert
  ON public.admin_users FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.member_master_is_super_admin()));
CREATE POLICY member_master_admin_users_super_update
  ON public.admin_users FOR UPDATE TO authenticated
  USING ((SELECT private.member_master_is_super_admin()))
  WITH CHECK ((SELECT private.member_master_is_super_admin()));
CREATE POLICY member_master_admin_users_super_delete
  ON public.admin_users FOR DELETE TO authenticated
  USING ((SELECT private.member_master_is_super_admin()));
REVOKE ALL ON TABLE public.admin_users FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_users TO service_role;

-- The raw legacy import/claim table is no longer a directory visible to every
-- authenticated account. Super administrators read the base table but mutate
-- it only through the reason-bearing RPC defined below. Service jobs retain a
-- fully audited system path through the operational triggers.
DROP POLICY IF EXISTS "admin_all_legacy_members" ON public.legacy_members;
DROP POLICY IF EXISTS "authenticated_read_legacy_members" ON public.legacy_members;
DROP POLICY IF EXISTS member_master_legacy_members_admin_read ON public.legacy_members;
DROP POLICY IF EXISTS member_master_legacy_members_super_insert ON public.legacy_members;
DROP POLICY IF EXISTS member_master_legacy_members_super_update ON public.legacy_members;
DROP POLICY IF EXISTS member_master_legacy_members_super_delete ON public.legacy_members;
CREATE POLICY member_master_legacy_members_super_read
  ON public.legacy_members FOR SELECT TO authenticated
  USING ((SELECT private.member_master_is_super_admin()));
REVOKE ALL ON TABLE public.legacy_members FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.legacy_members TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.legacy_members TO service_role;

-- A player review must refer to a real published/locked matching relation in
-- which both reviewer and reviewee participated. This closes the old
-- reviewer_id-only spoofing policy.
DROP POLICY IF EXISTS "player_write_review" ON public.mutual_reviews;
CREATE POLICY member_master_player_write_related_review
  ON public.mutual_reviews FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id <> reviewee_id
    AND match_result_id IS NOT NULL
    AND reviewer_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.status = 'approved'
        AND member.account_status = 'active'
    )
    AND EXISTS (
      SELECT 1
      FROM public.match_results AS match
      WHERE match.id = match_result_id
        AND match.status IN ('confirmed', 'locked')
        AND (
          reviewer_id = match.member_a_id
          OR reviewer_id = match.member_b_id
          OR reviewer_id = ANY(COALESCE(match.group_members, ARRAY[]::uuid[]))
        )
        AND (
          reviewee_id = match.member_a_id
          OR reviewee_id = match.member_b_id
          OR reviewee_id = ANY(COALESCE(match.group_members, ARRAY[]::uuid[]))
        )
    )
  );
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON public.mutual_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_match_result ON public.mutual_reviews(match_result_id)
  WHERE match_result_id IS NOT NULL;

DROP POLICY IF EXISTS approved_members_read_player_activity_reviews
  ON public.past_event_reviews;
CREATE POLICY approved_members_read_player_activity_reviews
  ON public.past_event_reviews FOR SELECT TO authenticated
  USING (
    status IN ('published', 'cancelled')
    AND EXISTS (
      SELECT 1 FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.status = 'approved'
        AND member.account_status = 'active'
    )
  );

DROP POLICY IF EXISTS approved_members_or_admin_read_player_activity_settings
  ON public.player_activity_settings;
CREATE POLICY approved_members_or_admin_read_player_activity_settings
  ON public.player_activity_settings FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.status = 'approved'
        AND member.account_status = 'active'
    )
  );

-- Suspended/closed accounts can still call ensure_my_member_record to obtain
-- lifecycle routing state, but an already-issued JWT cannot read Player data.
DROP POLICY IF EXISTS "select_members_admin_or_self" ON public.members;
DROP POLICY IF EXISTS "player_read_own" ON public.members;
CREATE POLICY member_master_members_admin_or_active_self_read
  ON public.members FOR SELECT TO authenticated
  USING (
    (SELECT private.member_master_is_super_admin())
    OR (user_id = (SELECT auth.uid()) AND account_status = 'active')
  );

DROP POLICY IF EXISTS "select_identity_admin_or_self" ON public.member_identity;
CREATE POLICY member_master_identity_admin_or_active_self_read
  ON public.member_identity FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  );

DROP POLICY IF EXISTS "select_own_or_admin" ON public.member_language;
CREATE POLICY member_master_language_admin_or_active_self_read
  ON public.member_language FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  );
DROP POLICY IF EXISTS "select_own_or_admin" ON public.member_interests;
CREATE POLICY member_master_interests_admin_or_active_self_read
  ON public.member_interests FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  );
DROP POLICY IF EXISTS "select_own_or_admin" ON public.member_personality;
CREATE POLICY member_master_personality_admin_or_active_self_read
  ON public.member_personality FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  );
DROP POLICY IF EXISTS "select_own_or_admin" ON public.member_boundaries;
CREATE POLICY member_master_boundaries_admin_or_active_self_read
  ON public.member_boundaries FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  );

DROP POLICY IF EXISTS member_master_quiz_read_own_or_admin
  ON public.personality_quiz_results;
CREATE POLICY member_master_quiz_read_own_or_admin
  ON public.personality_quiz_results FOR SELECT TO authenticated
  USING (
    (SELECT private.member_master_is_super_admin())
    OR member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  );

DROP POLICY IF EXISTS member_master_verification_read_own_or_admin
  ON public.member_verification;
CREATE POLICY member_master_verification_read_own_or_admin
  ON public.member_verification FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  );

DROP POLICY IF EXISTS "select_evaluations_admin_or_self" ON public.interview_evaluations;
CREATE POLICY member_master_evaluations_admin_or_active_self_read
  ON public.interview_evaluations FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  );

DROP POLICY IF EXISTS "player_read_own_stats" ON public.member_dynamic_stats;
CREATE POLICY member_master_dynamic_stats_active_self_read
  ON public.member_dynamic_stats FOR SELECT TO authenticated
  USING (
    member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
    )
  );

DROP POLICY IF EXISTS "player_read_own_activities" ON public.activity_records;
CREATE POLICY member_master_activity_records_active_self_read
  ON public.activity_records FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
        AND member.id = ANY(COALESCE(participant_ids, ARRAY[]::uuid[]))
    )
  );

DROP POLICY IF EXISTS "player_read_own_reviews" ON public.mutual_reviews;
CREATE POLICY member_master_mutual_reviews_active_self_read
  ON public.mutual_reviews FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
        AND member.id IN (reviewer_id, reviewee_id)
    )
  );

DROP POLICY IF EXISTS "player_read_own_results" ON public.match_results;
CREATE POLICY member_master_match_results_active_self_read
  ON public.match_results FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.account_status = 'active'
        AND (
          member.id = member_a_id
          OR member.id = member_b_id
          OR member.id = ANY(COALESCE(group_members, ARRAY[]::uuid[]))
        )
    )
  );

DROP POLICY IF EXISTS "player_read_sessions" ON public.match_sessions;
CREATE POLICY member_master_match_sessions_active_member_read
  ON public.match_sessions FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.status = 'approved'
        AND member.account_status = 'active'
    )
  );

DROP POLICY IF EXISTS player_read_open_rounds ON public.match_rounds;
CREATE POLICY player_read_open_rounds
  ON public.match_rounds FOR SELECT TO authenticated
  USING (
    status IN ('open', 'closed', 'matched')
    AND EXISTS (
      SELECT 1 FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.status = 'approved'
        AND member.account_status = 'active'
    )
  );

DROP POLICY IF EXISTS player_own_submissions ON public.match_round_submissions;
DROP POLICY IF EXISTS member_master_round_submissions_active_self_read
  ON public.match_round_submissions;
DROP POLICY IF EXISTS member_master_round_submissions_active_self_insert
  ON public.match_round_submissions;
DROP POLICY IF EXISTS member_master_round_submissions_active_self_update
  ON public.match_round_submissions;
CREATE POLICY member_master_round_submissions_active_self_read
  ON public.match_round_submissions FOR SELECT TO authenticated
  USING (
    member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.status = 'approved'
        AND member.account_status = 'active'
    )
  );
CREATE POLICY member_master_round_submissions_active_self_insert
  ON public.match_round_submissions FOR INSERT TO authenticated
  WITH CHECK (
    member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.status = 'approved'
        AND member.account_status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM public.match_rounds AS round
      WHERE round.id = round_id
        AND round.status = 'open'
        AND now() BETWEEN round.survey_start AND round.survey_end
    )
  );
CREATE POLICY member_master_round_submissions_active_self_update
  ON public.match_round_submissions FOR UPDATE TO authenticated
  USING (
    member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.status = 'approved'
        AND member.account_status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM public.match_rounds AS round
      WHERE round.id = round_id
        AND round.status = 'open'
        AND now() BETWEEN round.survey_start AND round.survey_end
    )
  )
  WITH CHECK (
    member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.status = 'approved'
        AND member.account_status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM public.match_rounds AS round
      WHERE round.id = round_id
        AND round.status = 'open'
        AND now() BETWEEN round.survey_start AND round.survey_end
    )
  );

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
  v_current_member_id uuid;
  v_date_entry record;
BEGIN
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
    IF NOT EXISTS (SELECT 1 FROM jsonb_object_keys(NEW.availability)) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_SUBMISSION_TIME_REQUIRED';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.match_rounds AS round
      WHERE round.id = NEW.round_id
        AND round.status = 'open'
        AND now() BETWEEN round.survey_start AND round.survey_end
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

DROP TRIGGER IF EXISTS member_master_guard_round_submission_write
  ON public.match_round_submissions;
CREATE TRIGGER member_master_guard_round_submission_write
  BEFORE INSERT OR UPDATE ON public.match_round_submissions
  FOR EACH ROW EXECUTE FUNCTION private.member_master_guard_round_submission_write();

-- Legacy operational admin policies are replaced with explicitly named,
-- audited policies. Every mutation is captured against each affected
-- canonical member; rows without a canonical subject are retained in a
-- separate permanent operational log instead of silently consuming reason.
ALTER TABLE public.member_dynamic_stats ADD COLUMN IF NOT EXISTS audit_reason text;
ALTER TABLE public.member_notes ADD COLUMN IF NOT EXISTS audit_reason text;
ALTER TABLE public.mutual_reviews ADD COLUMN IF NOT EXISTS audit_reason text;
ALTER TABLE public.activity_records ADD COLUMN IF NOT EXISTS audit_reason text;
ALTER TABLE public.match_results ADD COLUMN IF NOT EXISTS audit_reason text;
ALTER TABLE public.pair_relationships ADD COLUMN IF NOT EXISTS audit_reason text;
ALTER TABLE public.match_sessions ADD COLUMN IF NOT EXISTS audit_reason text;
ALTER TABLE public.match_round_submissions ADD COLUMN IF NOT EXISTS audit_reason text;
ALTER TABLE public.player_feedback ADD COLUMN IF NOT EXISTS audit_reason text;
ALTER TABLE public.script_play_records ADD COLUMN IF NOT EXISTS audit_reason text;
ALTER TABLE public.staff_profiles ADD COLUMN IF NOT EXISTS audit_reason text;
ALTER TABLE public.unmatched_diagnostics ADD COLUMN IF NOT EXISTS audit_reason text;
ALTER TABLE public.legacy_members ADD COLUMN IF NOT EXISTS audit_reason text;

CREATE TABLE IF NOT EXISTS private.subjectless_operational_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_schema text NOT NULL CHECK (table_schema = 'public'),
  table_name text NOT NULL CHECK (char_length(table_name) BETWEEN 1 AND 100),
  record_id_snapshot text NOT NULL
    CHECK (char_length(record_id_snapshot) BETWEEN 1 AND 500),
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  changed_fields text[] NOT NULL CHECK (cardinality(changed_fields) > 0),
  before_values jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(before_values) = 'object'),
  after_values jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(after_values) = 'object'),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 4 AND 500),
  source text NOT NULL CHECK (char_length(source) BETWEEN 1 AND 100),
  actor_user_id_snapshot uuid,
  actor_admin_id_snapshot uuid,
  actor_name_snapshot text,
  actor_role_snapshot text NOT NULL
    CHECK (char_length(actor_role_snapshot) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subjectless_operational_audit_record_idx
  ON private.subjectless_operational_audit_log (
    table_schema, table_name, record_id_snapshot, created_at DESC, id DESC
  );
CREATE INDEX IF NOT EXISTS subjectless_operational_audit_created_idx
  ON private.subjectless_operational_audit_log (created_at DESC, id DESC);

DROP TRIGGER IF EXISTS member_master_reject_audit_mutation
  ON private.subjectless_operational_audit_log;
CREATE TRIGGER member_master_reject_audit_mutation
  BEFORE UPDATE OR DELETE ON private.subjectless_operational_audit_log
  FOR EACH ROW EXECUTE FUNCTION private.member_master_reject_audit_mutation();

ALTER TABLE private.subjectless_operational_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS member_master_subjectless_audit_service_read
  ON private.subjectless_operational_audit_log;
CREATE POLICY member_master_subjectless_audit_service_read
  ON private.subjectless_operational_audit_log FOR SELECT TO service_role
  USING (true);
REVOKE ALL ON TABLE private.subjectless_operational_audit_log
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE private.subjectless_operational_audit_log TO service_role;
REVOKE ALL ON SEQUENCE private.subjectless_operational_audit_log_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.member_master_capture_operational_audit_reason()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_is_admin boolean := private.member_master_current_admin_id() IS NOT NULL;
  v_is_service boolean := COALESCE((SELECT auth.jwt()->>'role'), '') = 'service_role';
  v_reason text;
  v_row_reason text;
  v_subjects uuid[] := ARRAY[]::uuid[];
  v_record_id uuid;
BEGIN
  -- Resolve both OLD and NEW subjects before every write and acquire the same
  -- canonical-row lock that anonymization conflicts with. This closes the
  -- old-JWT race where a write passed an MVCC check, waited behind the scrub,
  -- and then reintroduced free text after anonymization committed.
  IF TG_TABLE_NAME IN (
    'member_dynamic_stats', 'member_notes', 'match_round_submissions',
    'player_feedback', 'script_play_records', 'staff_profiles',
    'unmatched_diagnostics'
  ) THEN
    IF TG_OP = 'INSERT' THEN
      v_subjects := ARRAY[NEW.member_id];
    ELSIF TG_OP = 'DELETE' THEN
      v_subjects := ARRAY[OLD.member_id];
    ELSE
      v_subjects := array_remove(ARRAY[OLD.member_id, NEW.member_id], NULL);
    END IF;
  ELSIF TG_TABLE_NAME = 'legacy_members' THEN
    IF TG_OP = 'INSERT' THEN
      v_subjects := ARRAY[NEW.canonical_member_id];
    ELSIF TG_OP = 'DELETE' THEN
      v_subjects := ARRAY[OLD.canonical_member_id];
    ELSE
      v_subjects := array_remove(
        ARRAY[OLD.canonical_member_id, NEW.canonical_member_id], NULL
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'mutual_reviews' THEN
    IF TG_OP = 'INSERT' THEN
      v_subjects := ARRAY[NEW.reviewer_id, NEW.reviewee_id];
    ELSIF TG_OP = 'DELETE' THEN
      v_subjects := ARRAY[OLD.reviewer_id, OLD.reviewee_id];
    ELSE
      v_subjects := array_remove(
        ARRAY[
          OLD.reviewer_id, OLD.reviewee_id,
          NEW.reviewer_id, NEW.reviewee_id
        ],
        NULL
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'activity_records' THEN
    IF TG_OP = 'INSERT' THEN
      v_subjects := COALESCE(NEW.participant_ids, ARRAY[]::uuid[])
        || COALESCE(NEW.late_member_ids, ARRAY[]::uuid[])
        || COALESCE(NEW.no_show_member_ids, ARRAY[]::uuid[]);
    ELSIF TG_OP = 'DELETE' THEN
      v_subjects := COALESCE(OLD.participant_ids, ARRAY[]::uuid[])
        || COALESCE(OLD.late_member_ids, ARRAY[]::uuid[])
        || COALESCE(OLD.no_show_member_ids, ARRAY[]::uuid[]);
    ELSE
      v_subjects := COALESCE(OLD.participant_ids, ARRAY[]::uuid[])
        || COALESCE(OLD.late_member_ids, ARRAY[]::uuid[])
        || COALESCE(OLD.no_show_member_ids, ARRAY[]::uuid[])
        || COALESCE(NEW.participant_ids, ARRAY[]::uuid[])
        || COALESCE(NEW.late_member_ids, ARRAY[]::uuid[])
        || COALESCE(NEW.no_show_member_ids, ARRAY[]::uuid[]);
    END IF;
  ELSIF TG_TABLE_NAME = 'match_results' THEN
    IF TG_OP = 'INSERT' THEN
      v_subjects := array_remove(
        ARRAY[NEW.member_a_id, NEW.member_b_id]
          || COALESCE(NEW.group_members, ARRAY[]::uuid[]),
        NULL
      );
    ELSIF TG_OP = 'DELETE' THEN
      v_subjects := array_remove(
        ARRAY[OLD.member_a_id, OLD.member_b_id]
          || COALESCE(OLD.group_members, ARRAY[]::uuid[]),
        NULL
      );
    ELSE
      v_subjects := array_remove(
        ARRAY[OLD.member_a_id, OLD.member_b_id, NEW.member_a_id, NEW.member_b_id]
          || COALESCE(OLD.group_members, ARRAY[]::uuid[])
          || COALESCE(NEW.group_members, ARRAY[]::uuid[]),
        NULL
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'pair_relationships' THEN
    IF TG_OP = 'INSERT' THEN
      v_subjects := ARRAY[NEW.member_a_id, NEW.member_b_id];
    ELSIF TG_OP = 'DELETE' THEN
      v_subjects := ARRAY[OLD.member_a_id, OLD.member_b_id];
    ELSE
      v_subjects := array_remove(
        ARRAY[OLD.member_a_id, OLD.member_b_id, NEW.member_a_id, NEW.member_b_id],
        NULL
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'match_sessions' THEN
    v_record_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
    SELECT COALESCE(array_agg(DISTINCT participant.member_id), ARRAY[]::uuid[])
    INTO v_subjects
    FROM public.match_results AS match
    CROSS JOIN LATERAL unnest(
      array_remove(
        ARRAY[match.member_a_id, match.member_b_id]
          || COALESCE(match.group_members, ARRAY[]::uuid[]),
        NULL
      )
    ) AS participant(member_id)
    WHERE match.session_id = v_record_id;
  END IF;

  PERFORM private.member_master_lock_non_anonymized_subjects(v_subjects);

  IF COALESCE(current_setting('app.member_master_explicit_audit', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    NEW.audit_reason := NULL;
    RETURN NEW;
  END IF;

  v_row_reason := CASE
    WHEN TG_OP = 'DELETE' THEN NULLIF(btrim(OLD.audit_reason), '')
    ELSE NULLIF(btrim(NEW.audit_reason), '')
  END;
  IF TG_TABLE_NAME = 'match_round_submissions'
     AND TG_OP IN ('INSERT', 'UPDATE')
     AND NOT v_is_service
     AND (SELECT auth.uid()) IS NOT NULL
     AND v_row_reason IS NULL
     AND NULLIF(btrim(current_setting('app.member_master_audit_reason', true)), '') IS NULL
     AND NEW.member_id = private.profile_current_approved_member_id() THEN
    -- One account may legitimately have both admin and player roles. An
    -- unreasoned write to its own active submission is a player self-service
    -- operation, not an administrator override; the later guard still enforces
    -- the open survey window and immutable technical columns.
    v_is_admin := false;
    v_reason := 'Player round submission self-service';
    PERFORM set_config('app.member_master_submission_self_service', 'on', true);
    PERFORM set_config('app.member_master_audit_reason', v_reason, true);
  END IF;
  IF v_is_admin THEN
    v_reason := COALESCE(
      v_row_reason,
      NULLIF(btrim(current_setting('app.member_master_audit_reason', true)), '')
    );
    IF v_reason IS NULL OR char_length(v_reason) NOT BETWEEN 4 AND 500 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'MEMBER_MASTER_OPERATION_REASON_REQUIRED';
    END IF;
    PERFORM set_config('app.member_master_audit_reason', v_reason, true);
    IF TG_TABLE_NAME = 'activity_records' THEN
      PERFORM set_config('app.member_master_activity_write', 'on', true);
    END IF;
  ELSIF v_is_service THEN
    v_reason := COALESCE(
      v_row_reason,
      NULLIF(btrim(current_setting('app.member_master_audit_reason', true)), ''),
      'Service ' || TG_OP || ' on ' || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
    );
    IF char_length(v_reason) NOT BETWEEN 4 AND 500 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'MEMBER_MASTER_OPERATION_REASON_INVALID';
    END IF;
    PERFORM set_config('app.member_master_audit_reason', v_reason, true);
    IF TG_TABLE_NAME = 'activity_records' THEN
      PERFORM set_config('app.member_master_activity_write', 'on', true);
    END IF;
  END IF;
  -- The reason is transaction-local evidence, not mutable business data.
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.audit_reason := NULL;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS member_master_capture_audit_reason ON public.member_dynamic_stats;
CREATE TRIGGER member_master_capture_audit_reason
  BEFORE INSERT OR UPDATE OR DELETE ON public.member_dynamic_stats
  FOR EACH ROW EXECUTE FUNCTION private.member_master_capture_operational_audit_reason();
DROP TRIGGER IF EXISTS member_master_capture_audit_reason ON public.member_notes;
CREATE TRIGGER member_master_capture_audit_reason
  BEFORE INSERT OR UPDATE OR DELETE ON public.member_notes
  FOR EACH ROW EXECUTE FUNCTION private.member_master_capture_operational_audit_reason();
DROP TRIGGER IF EXISTS member_master_capture_audit_reason ON public.mutual_reviews;
CREATE TRIGGER member_master_capture_audit_reason
  BEFORE INSERT OR UPDATE OR DELETE ON public.mutual_reviews
  FOR EACH ROW EXECUTE FUNCTION private.member_master_capture_operational_audit_reason();
DROP TRIGGER IF EXISTS member_master_capture_audit_reason ON public.activity_records;
CREATE TRIGGER member_master_capture_audit_reason
  BEFORE INSERT OR UPDATE OR DELETE ON public.activity_records
  FOR EACH ROW EXECUTE FUNCTION private.member_master_capture_operational_audit_reason();
DROP TRIGGER IF EXISTS member_master_capture_audit_reason ON public.match_results;
CREATE TRIGGER member_master_capture_audit_reason
  BEFORE INSERT OR UPDATE OR DELETE ON public.match_results
  FOR EACH ROW EXECUTE FUNCTION private.member_master_capture_operational_audit_reason();
DROP TRIGGER IF EXISTS member_master_capture_audit_reason ON public.pair_relationships;
CREATE TRIGGER member_master_capture_audit_reason
  BEFORE INSERT OR UPDATE OR DELETE ON public.pair_relationships
  FOR EACH ROW EXECUTE FUNCTION private.member_master_capture_operational_audit_reason();
DROP TRIGGER IF EXISTS member_master_capture_audit_reason ON public.match_sessions;
CREATE TRIGGER member_master_capture_audit_reason
  BEFORE INSERT OR UPDATE OR DELETE ON public.match_sessions
  FOR EACH ROW EXECUTE FUNCTION private.member_master_capture_operational_audit_reason();
DROP TRIGGER IF EXISTS member_master_capture_audit_reason ON public.match_round_submissions;
CREATE TRIGGER member_master_capture_audit_reason
  BEFORE INSERT OR UPDATE OR DELETE ON public.match_round_submissions
  FOR EACH ROW EXECUTE FUNCTION private.member_master_capture_operational_audit_reason();
DROP TRIGGER IF EXISTS member_master_capture_audit_reason ON public.player_feedback;
CREATE TRIGGER member_master_capture_audit_reason
  BEFORE INSERT OR UPDATE OR DELETE ON public.player_feedback
  FOR EACH ROW EXECUTE FUNCTION private.member_master_capture_operational_audit_reason();
DROP TRIGGER IF EXISTS member_master_capture_audit_reason ON public.script_play_records;
CREATE TRIGGER member_master_capture_audit_reason
  BEFORE INSERT OR UPDATE OR DELETE ON public.script_play_records
  FOR EACH ROW EXECUTE FUNCTION private.member_master_capture_operational_audit_reason();
DROP TRIGGER IF EXISTS member_master_capture_audit_reason ON public.staff_profiles;
CREATE TRIGGER member_master_capture_audit_reason
  BEFORE INSERT OR UPDATE OR DELETE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION private.member_master_capture_operational_audit_reason();
DROP TRIGGER IF EXISTS member_master_capture_audit_reason ON public.unmatched_diagnostics;
CREATE TRIGGER member_master_capture_audit_reason
  BEFORE INSERT OR UPDATE OR DELETE ON public.unmatched_diagnostics
  FOR EACH ROW EXECUTE FUNCTION private.member_master_capture_operational_audit_reason();
DROP TRIGGER IF EXISTS member_master_capture_audit_reason ON public.legacy_members;
CREATE TRIGGER member_master_capture_audit_reason
  BEFORE INSERT OR UPDATE OR DELETE ON public.legacy_members
  FOR EACH ROW EXECUTE FUNCTION private.member_master_capture_operational_audit_reason();

CREATE OR REPLACE FUNCTION private.member_master_audit_related_record_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_before jsonb := (
    CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END
  ) - 'audit_reason';
  v_after jsonb := (
    CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END
  ) - 'audit_reason';
  v_before_compact jsonb;
  v_after_compact jsonb;
  v_changed_fields text[];
  v_before_business jsonb;
  v_after_business jsonb;
  v_business_changed_fields text[];
  v_subjects uuid[] := ARRAY[]::uuid[];
  v_subject_id uuid;
  v_record_id uuid;
  v_record_id_snapshot text;
  v_admin_id uuid := private.member_master_current_admin_id();
  v_actor_name text;
  v_actor_role text;
  v_requested_reason text := NULLIF(
    btrim(current_setting('app.member_master_audit_reason', true)), ''
  );
  v_source text := CASE
    WHEN COALESCE(
      current_setting('app.member_master_submission_self_service', true), ''
    ) = 'on' THEN 'app'
    WHEN private.member_master_current_admin_id() IS NOT NULL THEN 'admin'
    WHEN (SELECT auth.uid()) IS NOT NULL THEN 'app'
    ELSE 'system'
  END;
BEGIN
  IF COALESCE(current_setting('app.member_master_explicit_audit', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'member_dynamic_stats'
     AND COALESCE(current_setting('app.member_master_activity_write', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF COALESCE((SELECT auth.jwt()->>'role'), '') = 'service_role'
     AND v_requested_reason IS NULL THEN
    v_requested_reason :=
      'Service ' || TG_OP || ' on ' || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
  END IF;
  IF v_admin_id IS NOT NULL AND (
       v_requested_reason IS NULL
       OR char_length(v_requested_reason) NOT BETWEEN 4 AND 500
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'MEMBER_MASTER_OPERATION_REASON_REQUIRED';
  END IF;

  IF TG_TABLE_NAME IN (
    'member_dynamic_stats', 'member_notes', 'match_round_submissions',
    'player_feedback', 'script_play_records', 'staff_profiles',
    'unmatched_diagnostics'
  ) THEN
    IF TG_OP = 'INSERT' THEN
      v_subjects := ARRAY[NEW.member_id];
    ELSIF TG_OP = 'DELETE' THEN
      v_subjects := ARRAY[OLD.member_id];
    ELSE
      v_subjects := array_remove(ARRAY[OLD.member_id, NEW.member_id], NULL);
    END IF;
  ELSIF TG_TABLE_NAME = 'legacy_members' THEN
    IF TG_OP = 'INSERT' THEN
      v_subjects := ARRAY[NEW.canonical_member_id];
    ELSIF TG_OP = 'DELETE' THEN
      v_subjects := ARRAY[OLD.canonical_member_id];
    ELSE
      v_subjects := array_remove(
        ARRAY[OLD.canonical_member_id, NEW.canonical_member_id], NULL
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'mutual_reviews' THEN
    IF TG_OP = 'INSERT' THEN
      v_subjects := ARRAY[NEW.reviewer_id, NEW.reviewee_id];
    ELSIF TG_OP = 'DELETE' THEN
      v_subjects := ARRAY[OLD.reviewer_id, OLD.reviewee_id];
    ELSE
      v_subjects := array_remove(
        ARRAY[
          OLD.reviewer_id, OLD.reviewee_id,
          NEW.reviewer_id, NEW.reviewee_id
        ],
        NULL
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'activity_records' THEN
    IF TG_OP = 'INSERT' THEN
      v_subjects := COALESCE(NEW.participant_ids, ARRAY[]::uuid[])
        || COALESCE(NEW.late_member_ids, ARRAY[]::uuid[])
        || COALESCE(NEW.no_show_member_ids, ARRAY[]::uuid[]);
    ELSIF TG_OP = 'DELETE' THEN
      v_subjects := COALESCE(OLD.participant_ids, ARRAY[]::uuid[])
        || COALESCE(OLD.late_member_ids, ARRAY[]::uuid[])
        || COALESCE(OLD.no_show_member_ids, ARRAY[]::uuid[]);
    ELSE
      v_subjects := COALESCE(OLD.participant_ids, ARRAY[]::uuid[])
        || COALESCE(OLD.late_member_ids, ARRAY[]::uuid[])
        || COALESCE(OLD.no_show_member_ids, ARRAY[]::uuid[])
        || COALESCE(NEW.participant_ids, ARRAY[]::uuid[])
        || COALESCE(NEW.late_member_ids, ARRAY[]::uuid[])
        || COALESCE(NEW.no_show_member_ids, ARRAY[]::uuid[]);
    END IF;
  ELSIF TG_TABLE_NAME = 'match_results' THEN
    IF TG_OP = 'INSERT' THEN
      v_subjects := array_remove(
        ARRAY[NEW.member_a_id, NEW.member_b_id] || COALESCE(NEW.group_members, ARRAY[]::uuid[]),
        NULL
      );
    ELSIF TG_OP = 'DELETE' THEN
      v_subjects := array_remove(
        ARRAY[OLD.member_a_id, OLD.member_b_id] || COALESCE(OLD.group_members, ARRAY[]::uuid[]),
        NULL
      );
    ELSE
      v_subjects := array_remove(
        ARRAY[OLD.member_a_id, OLD.member_b_id, NEW.member_a_id, NEW.member_b_id]
          || COALESCE(OLD.group_members, ARRAY[]::uuid[])
          || COALESCE(NEW.group_members, ARRAY[]::uuid[]),
        NULL
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'pair_relationships' THEN
    IF TG_OP = 'INSERT' THEN
      v_subjects := ARRAY[NEW.member_a_id, NEW.member_b_id];
    ELSIF TG_OP = 'DELETE' THEN
      v_subjects := ARRAY[OLD.member_a_id, OLD.member_b_id];
    ELSE
      v_subjects := array_remove(
        ARRAY[OLD.member_a_id, OLD.member_b_id, NEW.member_a_id, NEW.member_b_id],
        NULL
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'match_sessions' THEN
    v_record_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
    SELECT COALESCE(array_agg(DISTINCT participant.member_id), ARRAY[]::uuid[])
    INTO v_subjects
    FROM public.match_results AS match
    CROSS JOIN LATERAL unnest(
      array_remove(
        ARRAY[match.member_a_id, match.member_b_id]
          || COALESCE(match.group_members, ARRAY[]::uuid[]),
        NULL
      )
    ) AS participant(member_id)
    WHERE match.session_id = v_record_id;
  END IF;

  PERFORM private.member_master_lock_non_anonymized_subjects(v_subjects);

  IF NOT EXISTS (
    SELECT 1
    FROM unnest(COALESCE(v_subjects, ARRAY[]::uuid[])) AS subject(member_id)
    WHERE subject.member_id IS NOT NULL
  ) THEN
    -- Keep only actual business values. The durable record locator is stored
    -- separately; canonical/FK identifiers, actor identifiers, import
    -- metadata, reason transport, and technical create/update timestamps must
    -- never be duplicated into the snapshot payload.
    SELECT COALESCE(jsonb_object_agg(field.key, field.value), '{}'::jsonb)
    INTO v_before_business
    FROM jsonb_each(v_before) AS field(key, value)
    WHERE field.key NOT IN (
      'id', 'audit_reason', 'created_at', 'updated_at', 'import_metadata',
      'group_members'
    )
      AND field.key !~ '(_id|_ids|_by)$';
    SELECT COALESCE(jsonb_object_agg(field.key, field.value), '{}'::jsonb)
    INTO v_after_business
    FROM jsonb_each(v_after) AS field(key, value)
    WHERE field.key NOT IN (
      'id', 'audit_reason', 'created_at', 'updated_at', 'import_metadata',
      'group_members'
    )
      AND field.key !~ '(_id|_ids|_by)$';

    v_business_changed_fields := private.member_master_changed_fields(
      v_before_business, v_after_business
    );
    IF cardinality(v_business_changed_fields) = 0 THEN
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END IF;
    SELECT COALESCE(
      jsonb_object_agg(changed.key, v_before_business->changed.key),
      '{}'::jsonb
    ) INTO v_before_compact
    FROM unnest(v_business_changed_fields) AS changed(key)
    WHERE v_before_business ? changed.key;
    SELECT COALESCE(
      jsonb_object_agg(changed.key, v_after_business->changed.key),
      '{}'::jsonb
    ) INTO v_after_compact
    FROM unnest(v_business_changed_fields) AS changed(key)
    WHERE v_after_business ? changed.key;

    v_requested_reason := COALESCE(
      v_requested_reason,
      CASE
        WHEN (SELECT auth.uid()) IS NOT NULL
          THEN 'Authenticated ' || TG_OP || ' on '
            || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
        ELSE 'System ' || TG_OP || ' on '
          || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
      END
    );
    IF char_length(v_requested_reason) NOT BETWEEN 4 AND 500 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'MEMBER_MASTER_OPERATION_REASON_INVALID';
    END IF;
    v_record_id_snapshot := COALESCE(
      v_after->>'id', v_before->>'id',
      v_after->>'member_id', v_before->>'member_id',
      v_after->>'session_id', v_before->>'session_id',
      TG_TABLE_NAME || ':' || TG_OP
    );
    IF v_admin_id IS NOT NULL THEN
      SELECT administrator.name, administrator.role
      INTO v_actor_name, v_actor_role
      FROM public.admin_users AS administrator
      WHERE administrator.id = v_admin_id;
      v_actor_role := COALESCE(v_actor_role, 'admin');
    ELSIF COALESCE((SELECT auth.jwt()->>'role'), '') = 'service_role' THEN
      v_actor_role := 'service_role';
    ELSIF (SELECT auth.uid()) IS NOT NULL THEN
      v_actor_role := 'authenticated';
    ELSE
      v_actor_role := 'system';
    END IF;

    INSERT INTO private.subjectless_operational_audit_log (
      table_schema, table_name, record_id_snapshot, operation,
      changed_fields, before_values, after_values, reason, source,
      actor_user_id_snapshot, actor_admin_id_snapshot,
      actor_name_snapshot, actor_role_snapshot
    ) VALUES (
      TG_TABLE_SCHEMA, TG_TABLE_NAME, v_record_id_snapshot, TG_OP,
      v_business_changed_fields, v_before_compact, v_after_compact,
      v_requested_reason, v_source,
      (SELECT auth.uid()), v_admin_id, v_actor_name, v_actor_role
    );

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  v_changed_fields := private.member_master_changed_fields(v_before, v_after);
  IF cardinality(v_changed_fields) = 0 THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  SELECT COALESCE(jsonb_object_agg(changed.key, v_before->changed.key), '{}'::jsonb)
  INTO v_before_compact
  FROM unnest(v_changed_fields) AS changed(key)
  WHERE v_before ? changed.key;
  SELECT COALESCE(jsonb_object_agg(changed.key, v_after->changed.key), '{}'::jsonb)
  INTO v_after_compact
  FROM unnest(v_changed_fields) AS changed(key)
  WHERE v_after ? changed.key;

  FOR v_subject_id IN
    SELECT DISTINCT subject.member_id
    FROM unnest(COALESCE(v_subjects, ARRAY[]::uuid[])) AS subject(member_id)
    WHERE subject.member_id IS NOT NULL
  LOOP
    INSERT INTO private.member_profile_audit_log (
      member_id, member_id_snapshot, action_type, section, changed_fields,
      before_values, after_values, reason, source,
      actor_user_id, actor_admin_id, actor_name, metadata
    ) VALUES (
      v_subject_id, v_subject_id, 'related_record_change',
      'related_' || TG_TABLE_NAME,
      v_changed_fields, v_before_compact, v_after_compact,
      v_requested_reason,
      v_source, (SELECT auth.uid()), v_admin_id,
      (SELECT administrator.name FROM public.admin_users AS administrator WHERE administrator.id = v_admin_id),
      jsonb_build_object(
        'table', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
        'operation', TG_OP,
        'record_id', COALESCE(v_after->'id', v_before->'id')
      )
    );
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS member_master_audit_related_change ON public.member_dynamic_stats;
CREATE TRIGGER member_master_audit_related_change
  AFTER INSERT OR UPDATE OR DELETE ON public.member_dynamic_stats
  FOR EACH ROW EXECUTE FUNCTION private.member_master_audit_related_record_change();
DROP TRIGGER IF EXISTS member_master_audit_related_change ON public.member_notes;
CREATE TRIGGER member_master_audit_related_change
  AFTER INSERT OR UPDATE OR DELETE ON public.member_notes
  FOR EACH ROW EXECUTE FUNCTION private.member_master_audit_related_record_change();
DROP TRIGGER IF EXISTS member_master_audit_related_change ON public.mutual_reviews;
CREATE TRIGGER member_master_audit_related_change
  AFTER INSERT OR UPDATE OR DELETE ON public.mutual_reviews
  FOR EACH ROW EXECUTE FUNCTION private.member_master_audit_related_record_change();
DROP TRIGGER IF EXISTS member_master_audit_related_change ON public.activity_records;
CREATE TRIGGER member_master_audit_related_change
  AFTER INSERT OR UPDATE OR DELETE ON public.activity_records
  FOR EACH ROW EXECUTE FUNCTION private.member_master_audit_related_record_change();
DROP TRIGGER IF EXISTS member_master_audit_related_change ON public.match_results;
CREATE TRIGGER member_master_audit_related_change
  AFTER INSERT OR UPDATE OR DELETE ON public.match_results
  FOR EACH ROW EXECUTE FUNCTION private.member_master_audit_related_record_change();
DROP TRIGGER IF EXISTS member_master_audit_related_change ON public.pair_relationships;
CREATE TRIGGER member_master_audit_related_change
  AFTER INSERT OR UPDATE OR DELETE ON public.pair_relationships
  FOR EACH ROW EXECUTE FUNCTION private.member_master_audit_related_record_change();
DROP TRIGGER IF EXISTS member_master_audit_related_change ON public.match_sessions;
CREATE TRIGGER member_master_audit_related_change
  AFTER INSERT OR UPDATE OR DELETE ON public.match_sessions
  FOR EACH ROW EXECUTE FUNCTION private.member_master_audit_related_record_change();
DROP TRIGGER IF EXISTS member_master_audit_related_change ON public.match_round_submissions;
CREATE TRIGGER member_master_audit_related_change
  AFTER INSERT OR UPDATE OR DELETE ON public.match_round_submissions
  FOR EACH ROW EXECUTE FUNCTION private.member_master_audit_related_record_change();
DROP TRIGGER IF EXISTS member_master_audit_related_change ON public.player_feedback;
CREATE TRIGGER member_master_audit_related_change
  AFTER INSERT OR UPDATE OR DELETE ON public.player_feedback
  FOR EACH ROW EXECUTE FUNCTION private.member_master_audit_related_record_change();
DROP TRIGGER IF EXISTS member_master_audit_related_change ON public.script_play_records;
CREATE TRIGGER member_master_audit_related_change
  AFTER INSERT OR UPDATE OR DELETE ON public.script_play_records
  FOR EACH ROW EXECUTE FUNCTION private.member_master_audit_related_record_change();
DROP TRIGGER IF EXISTS member_master_audit_related_change ON public.staff_profiles;
CREATE TRIGGER member_master_audit_related_change
  AFTER INSERT OR UPDATE OR DELETE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION private.member_master_audit_related_record_change();
DROP TRIGGER IF EXISTS member_master_audit_related_change ON public.unmatched_diagnostics;
CREATE TRIGGER member_master_audit_related_change
  AFTER INSERT OR UPDATE OR DELETE ON public.unmatched_diagnostics
  FOR EACH ROW EXECUTE FUNCTION private.member_master_audit_related_record_change();
DROP TRIGGER IF EXISTS member_master_audit_related_change ON public.legacy_members;
CREATE TRIGGER member_master_audit_related_change
  AFTER INSERT OR UPDATE OR DELETE ON public.legacy_members
  FOR EACH ROW EXECUTE FUNCTION private.member_master_audit_related_record_change();

DROP POLICY IF EXISTS "admin_all" ON public.member_dynamic_stats;
CREATE POLICY member_master_dynamic_stats_admin_audited_write
  ON public.member_dynamic_stats FOR ALL TO authenticated
  USING ((SELECT private.member_master_is_super_admin()))
  WITH CHECK ((SELECT private.member_master_is_super_admin()));
DROP POLICY IF EXISTS "admin_all" ON public.member_notes;
CREATE POLICY member_master_member_notes_admin_audited_write
  ON public.member_notes FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "admin_all" ON public.mutual_reviews;
CREATE POLICY member_master_mutual_reviews_admin_audited_write
  ON public.mutual_reviews FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "admin_all" ON public.activity_records;
CREATE POLICY member_master_activity_records_admin_audited_write
  ON public.activity_records FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "admin_all_sessions" ON public.match_sessions;
CREATE POLICY member_master_match_sessions_admin_audited_write
  ON public.match_sessions FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "admin_all_results" ON public.match_results;
CREATE POLICY member_master_match_results_admin_audited_write
  ON public.match_results FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "admin_all_relationships" ON public.pair_relationships;
CREATE POLICY member_master_pair_relationships_admin_audited_write
  ON public.pair_relationships FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "admin_all_submissions" ON public.match_round_submissions;
DROP POLICY IF EXISTS member_master_round_submissions_admin_audited_write
  ON public.match_round_submissions;
CREATE POLICY member_master_round_submissions_admin_audited_write
  ON public.match_round_submissions FOR ALL TO authenticated
  USING ((SELECT private.member_master_is_super_admin()))
  WITH CHECK ((SELECT private.member_master_is_super_admin()));
DROP POLICY IF EXISTS "admin_all" ON public.script_play_records;
DROP POLICY IF EXISTS "player_read_own" ON public.script_play_records;
DROP POLICY IF EXISTS member_master_script_play_records_admin_audited_write
  ON public.script_play_records;
DROP POLICY IF EXISTS member_master_script_play_records_active_self_read
  ON public.script_play_records;
CREATE POLICY member_master_script_play_records_admin_audited_write
  ON public.script_play_records FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY member_master_script_play_records_active_self_read
  ON public.script_play_records FOR SELECT TO authenticated
  USING (
    member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.status = 'approved'
        AND member.account_status = 'active'
    )
  );
DROP POLICY IF EXISTS "admin_all_staff" ON public.staff_profiles;
DROP POLICY IF EXISTS member_master_staff_profiles_admin_audited_write
  ON public.staff_profiles;
CREATE POLICY member_master_staff_profiles_admin_audited_write
  ON public.staff_profiles FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "anyone_read_published_staff" ON public.staff_profiles;
REVOKE ALL ON TABLE public.staff_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_profiles TO service_role;
GRANT SELECT (
  id, name, school, major, intro, avatar_url,
  is_published, sort_order, created_at, updated_at
) ON TABLE public.staff_profiles TO authenticated;
GRANT INSERT (
  name, school, major, intro, avatar_url, is_published, sort_order, audit_reason
) ON TABLE public.staff_profiles TO authenticated;
GRANT UPDATE (
  name, school, major, intro, avatar_url, is_published, sort_order, audit_reason
) ON TABLE public.staff_profiles TO authenticated;
CREATE OR REPLACE VIEW public.published_staff_profiles
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  staff.id,
  staff.name,
  staff.school,
  staff.major,
  staff.intro,
  staff.avatar_url
FROM public.staff_profiles AS staff
WHERE staff.is_published = true
ORDER BY staff.sort_order, staff.created_at;
REVOKE ALL ON TABLE public.published_staff_profiles FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.published_staff_profiles TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "admin_all" ON public.unmatched_diagnostics;
DROP POLICY IF EXISTS member_master_unmatched_diagnostics_admin_audited_write
  ON public.unmatched_diagnostics;
CREATE POLICY member_master_unmatched_diagnostics_admin_audited_write
  ON public.unmatched_diagnostics FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

CREATE TABLE IF NOT EXISTS private.admin_user_audit_log (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  admin_user_id_snapshot uuid NOT NULL,
  action_type text NOT NULL
    CHECK (action_type IN ('admin_whitelist_created', 'admin_role_updated', 'admin_user_deleted')),
  changed_fields text[] NOT NULL DEFAULT ARRAY[]::text[],
  before_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 4 AND 500),
  source text NOT NULL DEFAULT 'admin' CHECK (source = 'admin'),
  actor_admin_id_snapshot uuid NOT NULL,
  actor_user_id_snapshot uuid NOT NULL,
  actor_name_snapshot text,
  actor_role_snapshot text NOT NULL CHECK (actor_role_snapshot = 'super_admin'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_user_audit_log_subject_created_idx
  ON private.admin_user_audit_log (admin_user_id_snapshot, created_at DESC, id DESC);
ALTER TABLE private.admin_user_audit_log ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS member_master_reject_audit_mutation
  ON private.admin_user_audit_log;
CREATE TRIGGER member_master_reject_audit_mutation
  BEFORE UPDATE OR DELETE ON private.admin_user_audit_log
  FOR EACH ROW EXECUTE FUNCTION private.member_master_reject_audit_mutation();
REVOKE ALL ON TABLE private.admin_user_audit_log
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE private.admin_user_audit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE private.admin_user_audit_log_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.admin_create_admin_whitelist(
  p_email text,
  p_role text,
  p_reason text,
  p_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := private.member_master_current_admin_id();
  v_actor_name text;
  v_email text := lower(btrim(p_email));
  v_name text;
  v_created public.admin_users%ROWTYPE;
  v_audit_id bigint;
BEGIN
  IF v_actor_id IS NULL OR NOT private.member_master_is_super_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_SUPER_ADMIN_REQUIRED';
  END IF;
  v_name := COALESCE(NULLIF(btrim(p_name), ''), split_part(v_email, '@', 1));
  IF char_length(v_email) NOT BETWEEN 3 AND 320
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     OR char_length(v_name) NOT BETWEEN 1 AND 200
     OR COALESCE(p_role, '') NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_ADMIN_USER_PAYLOAD_INVALID';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL
     OR char_length(btrim(p_reason)) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_REASON_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('member-master:admin-users', 0));
  SELECT administrator.name INTO v_actor_name
  FROM public.admin_users AS administrator WHERE administrator.id = v_actor_id;
  INSERT INTO public.admin_users (user_id, email, name, role)
  VALUES (NULL, v_email, v_name, p_role)
  RETURNING * INTO v_created;

  INSERT INTO private.admin_user_audit_log (
    admin_user_id_snapshot, action_type, changed_fields,
    before_values, after_values, reason,
    actor_admin_id_snapshot, actor_user_id_snapshot,
    actor_name_snapshot, actor_role_snapshot
  ) VALUES (
    v_created.id, 'admin_whitelist_created', ARRAY['record_exists']::text[],
    jsonb_build_object('record_exists', false),
    (to_jsonb(v_created) - 'user_id') || jsonb_build_object('record_exists', true),
    btrim(p_reason), v_actor_id, (SELECT auth.uid()),
    v_actor_name, 'super_admin'
  ) RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'admin_user', to_jsonb(v_created),
    'audit_event_id', v_audit_id,
    'created', true
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_admin_user_role(
  p_admin_user_id uuid,
  p_role text,
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
  v_after public.admin_users%ROWTYPE;
  v_audit_id bigint;
BEGIN
  IF v_actor_id IS NULL OR NOT private.member_master_is_super_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_SUPER_ADMIN_REQUIRED';
  END IF;
  IF p_admin_user_id IS NULL OR COALESCE(p_role, '') NOT IN ('admin', 'super_admin') THEN
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
  IF p_admin_user_id = v_actor_id AND p_role <> 'super_admin' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MEMBER_MASTER_ADMIN_SELF_DOWNGRADE_BLOCKED';
  END IF;
  IF v_before.role = 'super_admin' AND p_role <> 'super_admin'
     AND NOT EXISTS (
       SELECT 1 FROM public.admin_users AS other_admin
       WHERE other_admin.role = 'super_admin'
         AND other_admin.id <> p_admin_user_id
         AND other_admin.user_id IS NOT NULL
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MEMBER_MASTER_LAST_SUPER_ADMIN_REQUIRED';
  END IF;

  UPDATE public.admin_users AS administrator SET role = p_role
  WHERE administrator.id = p_admin_user_id
  RETURNING administrator.* INTO v_after;
  SELECT administrator.name INTO v_actor_name
  FROM public.admin_users AS administrator WHERE administrator.id = v_actor_id;
  INSERT INTO private.admin_user_audit_log (
    admin_user_id_snapshot, action_type, changed_fields,
    before_values, after_values, reason,
    actor_admin_id_snapshot, actor_user_id_snapshot,
    actor_name_snapshot, actor_role_snapshot
  ) VALUES (
    p_admin_user_id, 'admin_role_updated', ARRAY['role']::text[],
    jsonb_build_object('role', v_before.role),
    jsonb_build_object('role', v_after.role),
    btrim(p_reason), v_actor_id, (SELECT auth.uid()),
    v_actor_name, 'super_admin'
  ) RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'admin_user', to_jsonb(v_after),
    'audit_event_id', v_audit_id,
    'updated', true
  );
END
$function$;

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
  DELETE FROM public.admin_users AS administrator
  WHERE administrator.id = p_admin_user_id;

  RETURN jsonb_build_object(
    'admin_user_id', p_admin_user_id,
    'audit_event_id', v_audit_id,
    'deleted', true
  );
END
$function$;

-- Activity maintenance remains available to both administrator roles, but the
-- supported UI path is a narrow transaction that validates the entire patch
-- and supplies the human reason consumed by the related-record audit trigger.
CREATE OR REPLACE FUNCTION public.admin_upsert_activity_record(
  p_id uuid,
  p_payload jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_id uuid := private.member_master_current_admin_id();
  v_activity public.activity_records%ROWTYPE;
  v_activity_id uuid;
  v_created boolean := p_id IS NULL;
  v_text_ids text[];
  v_participant_ids uuid[] := ARRAY[]::uuid[];
  v_late_member_ids uuid[] := ARRAY[]::uuid[];
  v_no_show_member_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_ADMIN_REQUIRED';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL
     OR char_length(btrim(p_reason)) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_REASON_INVALID';
  END IF;
  PERFORM private.member_master_validate_payload_keys(
    p_payload,
    ARRAY[
      'title', 'activity_date', 'location', 'activity_type',
      'duration_minutes', 'notes', 'participant_ids',
      'late_member_ids', 'no_show_member_ids', 'script_id'
    ]
  );
  IF p_payload = '{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;

  IF p_id IS NULL THEN
    IF NOT (p_payload ?& ARRAY['title', 'activity_date']) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'MEMBER_MASTER_REQUIRED_FIELDS_MISSING';
    END IF;
    v_activity_id := gen_random_uuid();
    v_activity.id := v_activity_id;
    v_activity.participant_ids := ARRAY[]::uuid[];
    v_activity.late_member_ids := ARRAY[]::uuid[];
    v_activity.no_show_member_ids := ARRAY[]::uuid[];
  ELSE
    SELECT activity.* INTO v_activity
    FROM public.activity_records AS activity
    WHERE activity.id = p_id
    FOR UPDATE;
    IF v_activity.id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_ACTIVITY_NOT_FOUND';
    END IF;
    v_activity_id := v_activity.id;
  END IF;

  IF p_payload ? 'title' THEN
    IF jsonb_typeof(p_payload->'title') IS DISTINCT FROM 'string'
       OR char_length(btrim(p_payload->>'title')) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
    END IF;
    v_activity.title := btrim(p_payload->>'title');
  END IF;
  IF p_payload ? 'activity_date' THEN
    IF jsonb_typeof(p_payload->'activity_date') IS DISTINCT FROM 'string'
       OR (p_payload->>'activity_date') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
    END IF;
    v_activity.activity_date := (p_payload->>'activity_date')::date;
  END IF;

  IF p_payload ? 'location' THEN
    IF p_payload->'location' <> 'null'::jsonb
       AND jsonb_typeof(p_payload->'location') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
    END IF;
    v_activity.location := NULLIF(btrim(p_payload->>'location'), '');
    IF char_length(v_activity.location) > 200 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
    END IF;
  END IF;
  IF p_payload ? 'activity_type' THEN
    IF p_payload->'activity_type' <> 'null'::jsonb
       AND jsonb_typeof(p_payload->'activity_type') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
    END IF;
    v_activity.activity_type := NULLIF(btrim(p_payload->>'activity_type'), '');
    IF char_length(v_activity.activity_type) > 100 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
    END IF;
  END IF;
  IF p_payload ? 'notes' THEN
    IF p_payload->'notes' <> 'null'::jsonb
       AND jsonb_typeof(p_payload->'notes') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
    END IF;
    v_activity.notes := NULLIF(btrim(p_payload->>'notes'), '');
    IF char_length(v_activity.notes) > 2000 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
    END IF;
  END IF;
  IF p_payload ? 'duration_minutes' THEN
    IF p_payload->'duration_minutes' = 'null'::jsonb THEN
      v_activity.duration_minutes := NULL;
    ELSIF jsonb_typeof(p_payload->'duration_minutes') IS DISTINCT FROM 'number'
       OR (p_payload->>'duration_minutes') !~ '^\d{1,4}$'
       OR (p_payload->>'duration_minutes')::integer NOT BETWEEN 0 AND 1440 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
    ELSE
      v_activity.duration_minutes := (p_payload->>'duration_minutes')::integer;
    END IF;
  END IF;
  IF p_payload ? 'script_id' THEN
    IF p_payload->'script_id' = 'null'::jsonb THEN
      v_activity.script_id := NULL;
    ELSIF jsonb_typeof(p_payload->'script_id') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
    ELSE
      v_activity.script_id := (p_payload->>'script_id')::uuid;
    END IF;
  END IF;

  v_participant_ids := COALESCE(v_activity.participant_ids, ARRAY[]::uuid[]);
  v_late_member_ids := COALESCE(v_activity.late_member_ids, ARRAY[]::uuid[]);
  v_no_show_member_ids := COALESCE(v_activity.no_show_member_ids, ARRAY[]::uuid[]);
  IF p_payload ? 'participant_ids' THEN
    v_text_ids := private.member_master_jsonb_text_array(
      p_payload, 'participant_ids', true, 500, 64
    );
    SELECT COALESCE(
      array_agg(item.value::uuid ORDER BY item.ordinality), ARRAY[]::uuid[]
    ) INTO v_participant_ids
    FROM unnest(v_text_ids) WITH ORDINALITY AS item(value, ordinality);
  END IF;
  IF p_payload ? 'late_member_ids' THEN
    v_text_ids := private.member_master_jsonb_text_array(
      p_payload, 'late_member_ids', true, 500, 64
    );
    SELECT COALESCE(
      array_agg(item.value::uuid ORDER BY item.ordinality), ARRAY[]::uuid[]
    ) INTO v_late_member_ids
    FROM unnest(v_text_ids) WITH ORDINALITY AS item(value, ordinality);
  END IF;
  IF p_payload ? 'no_show_member_ids' THEN
    v_text_ids := private.member_master_jsonb_text_array(
      p_payload, 'no_show_member_ids', true, 500, 64
    );
    SELECT COALESCE(
      array_agg(item.value::uuid ORDER BY item.ordinality), ARRAY[]::uuid[]
    ) INTO v_no_show_member_ids
    FROM unnest(v_text_ids) WITH ORDINALITY AS item(value, ordinality);
  END IF;

  IF cardinality(v_participant_ids) <> (
       SELECT count(DISTINCT candidate.member_id)
       FROM unnest(v_participant_ids) AS candidate(member_id)
     )
     OR cardinality(v_late_member_ids) <> (
       SELECT count(DISTINCT candidate.member_id)
       FROM unnest(v_late_member_ids) AS candidate(member_id)
     )
     OR cardinality(v_no_show_member_ids) <> (
       SELECT count(DISTINCT candidate.member_id)
       FROM unnest(v_no_show_member_ids) AS candidate(member_id)
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_late_member_ids) AS late(member_id)
    WHERE NOT (late.member_id = ANY(v_participant_ids))
  ) OR EXISTS (
    SELECT 1 FROM unnest(v_no_show_member_ids) AS absent(member_id)
    WHERE NOT (absent.member_id = ANY(v_participant_ids))
  ) OR EXISTS (
    SELECT 1 FROM unnest(v_late_member_ids) AS late(member_id)
    WHERE late.member_id = ANY(v_no_show_member_ids)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_ACTIVITY_ATTENDANCE_INVALID';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(v_participant_ids) AS participant(member_id)
    LEFT JOIN public.members AS member ON member.id = participant.member_id
    WHERE member.id IS NULL OR member.anonymized_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'MEMBER_MASTER_ACTIVITY_MEMBER_INVALID';
  END IF;
  IF v_activity.script_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.scripts AS script WHERE script.id = v_activity.script_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'MEMBER_MASTER_ACTIVITY_SCRIPT_INVALID';
  END IF;

  v_activity.participant_ids := v_participant_ids;
  v_activity.late_member_ids := v_late_member_ids;
  v_activity.no_show_member_ids := v_no_show_member_ids;
  v_activity.participant_count := cardinality(v_participant_ids);
  PERFORM set_config('app.member_master_audit_reason', btrim(p_reason), true);

  IF v_created THEN
    INSERT INTO public.activity_records (
      id, title, activity_date, location, activity_type,
      participant_ids, participant_count, script_id, duration_minutes,
      notes, created_by, late_member_ids, no_show_member_ids
    ) VALUES (
      v_activity_id, v_activity.title, v_activity.activity_date,
      v_activity.location, v_activity.activity_type,
      v_activity.participant_ids, v_activity.participant_count,
      v_activity.script_id, v_activity.duration_minutes,
      v_activity.notes, v_admin_id,
      v_activity.late_member_ids, v_activity.no_show_member_ids
    ) RETURNING * INTO v_activity;
  ELSE
    UPDATE public.activity_records AS activity SET
      title = v_activity.title,
      activity_date = v_activity.activity_date,
      location = v_activity.location,
      activity_type = v_activity.activity_type,
      participant_ids = v_activity.participant_ids,
      participant_count = v_activity.participant_count,
      script_id = v_activity.script_id,
      duration_minutes = v_activity.duration_minutes,
      notes = v_activity.notes,
      late_member_ids = v_activity.late_member_ids,
      no_show_member_ids = v_activity.no_show_member_ids
    WHERE activity.id = v_activity_id
    RETURNING * INTO v_activity;
  END IF;

  RETURN jsonb_build_object(
    'activity_id', v_activity.id,
    'created', v_created,
    'record', to_jsonb(v_activity),
    'reason', btrim(p_reason)
  );
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range
    OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_activity_record(
  p_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_id uuid := private.member_master_current_admin_id();
  v_activity public.activity_records%ROWTYPE;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_ADMIN_REQUIRED';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL
     OR char_length(btrim(p_reason)) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_REASON_INVALID';
  END IF;
  SELECT activity.* INTO v_activity
  FROM public.activity_records AS activity
  WHERE activity.id = p_id
  FOR UPDATE;
  IF v_activity.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_ACTIVITY_NOT_FOUND';
  END IF;

  PERFORM set_config('app.member_master_audit_reason', btrim(p_reason), true);
  DELETE FROM public.activity_records AS activity WHERE activity.id = p_id;
  RETURN jsonb_build_object(
    'activity_id', p_id,
    'deleted', true,
    'record', to_jsonb(v_activity),
    'reason', btrim(p_reason)
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_operational_record(
  p_entity text,
  p_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_id uuid := private.member_master_current_admin_id();
  v_deleted_count integer := 0;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_ADMIN_REQUIRED';
  END IF;
  IF p_id IS NULL OR COALESCE(p_entity, '') NOT IN (
    'member_dynamic_stats', 'member_notes', 'mutual_reviews',
    'match_results', 'pair_relationships', 'match_sessions',
    'match_round_submissions', 'script_play_records', 'staff_profiles',
    'unmatched_diagnostics'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_OPERATION_INVALID';
  END IF;
  IF p_entity IN ('member_dynamic_stats', 'match_round_submissions')
     AND NOT private.member_master_is_super_admin() THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'MEMBER_MASTER_SUPER_ADMIN_REQUIRED';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL
     OR char_length(btrim(p_reason)) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_REASON_INVALID';
  END IF;
  PERFORM set_config('app.member_master_audit_reason', btrim(p_reason), true);

  CASE p_entity
    WHEN 'member_dynamic_stats' THEN
      DELETE FROM public.member_dynamic_stats WHERE id = p_id;
    WHEN 'member_notes' THEN
      DELETE FROM public.member_notes WHERE id = p_id;
    WHEN 'mutual_reviews' THEN
      DELETE FROM public.mutual_reviews WHERE id = p_id;
    WHEN 'match_results' THEN
      DELETE FROM public.match_results WHERE id = p_id;
    WHEN 'pair_relationships' THEN
      DELETE FROM public.pair_relationships WHERE id = p_id;
    WHEN 'match_sessions' THEN
      DELETE FROM public.match_sessions WHERE id = p_id;
    WHEN 'match_round_submissions' THEN
      DELETE FROM public.match_round_submissions WHERE id = p_id;
    WHEN 'script_play_records' THEN
      DELETE FROM public.script_play_records WHERE id = p_id;
    WHEN 'staff_profiles' THEN
      DELETE FROM public.staff_profiles WHERE id = p_id;
    WHEN 'unmatched_diagnostics' THEN
      DELETE FROM public.unmatched_diagnostics WHERE id = p_id;
  END CASE;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_OPERATION_RECORD_NOT_FOUND';
  END IF;

  RETURN jsonb_build_object(
    'entity', p_entity,
    'record_id', p_id,
    'deleted', true,
    'reason', btrim(p_reason)
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_player_feedback(
  p_feedback_id uuid,
  p_status text,
  p_admin_note text,
  p_reason text,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_id uuid := private.member_master_current_admin_id();
  v_feedback public.player_feedback%ROWTYPE;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_ADMIN_REQUIRED';
  END IF;
  IF p_feedback_id IS NULL OR p_expected_updated_at IS NULL
     OR COALESCE(p_status, '') NOT IN ('pending', 'in_progress', 'completed')
     OR (p_admin_note IS NOT NULL AND char_length(p_admin_note) > 2000) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL
     OR char_length(btrim(p_reason)) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_REASON_INVALID';
  END IF;

  UPDATE public.player_feedback AS feedback SET
    status = p_status,
    admin_note = NULLIF(btrim(p_admin_note), ''),
    completed_at = CASE
      WHEN p_status = 'completed' THEN COALESCE(feedback.completed_at, now())
      ELSE NULL
    END,
    audit_reason = btrim(p_reason)
  WHERE feedback.id = p_feedback_id
    AND feedback.updated_at = p_expected_updated_at
  RETURNING feedback.* INTO v_feedback;
  IF v_feedback.id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.player_feedback AS feedback
      WHERE feedback.id = p_feedback_id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'MEMBER_MASTER_FEEDBACK_CONCURRENT_MODIFICATION';
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_FEEDBACK_NOT_FOUND';
  END IF;

  RETURN jsonb_build_object(
    'feedback_id', v_feedback.id,
    'member_id', v_feedback.member_id,
    'status', v_feedback.status,
    'completed_at', v_feedback.completed_at,
    'updated_at', v_feedback.updated_at,
    'record', to_jsonb(v_feedback) - 'audit_reason'
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_clear_unmatched_diagnostics(
  p_session_id uuid,
  p_member_ids uuid[],
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_id uuid := private.member_master_current_admin_id();
  v_deleted_count integer := 0;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_ADMIN_REQUIRED';
  END IF;
  IF p_session_id IS NULL
     OR p_member_ids IS NULL
     OR cardinality(p_member_ids) NOT BETWEEN 1 AND 500
     OR array_position(p_member_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL
     OR char_length(btrim(p_reason)) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_REASON_INVALID';
  END IF;

  -- audit_reason is deliberately transaction-local: the BEFORE DELETE guard
  -- consumes this value and the AFTER trigger creates one compact delete event
  -- per affected member without a redundant preparatory UPDATE event.
  PERFORM set_config('app.member_master_audit_reason', btrim(p_reason), true);
  DELETE FROM public.unmatched_diagnostics AS diagnostic
  WHERE diagnostic.session_id = p_session_id
    AND diagnostic.member_id = ANY(p_member_ids);
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'requested_member_count', (
      SELECT count(DISTINCT member_id)
      FROM unnest(p_member_ids) AS requested(member_id)
    ),
    'deleted_count', v_deleted_count,
    'reason', btrim(p_reason)
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_member_note(
  p_note_id uuid,
  p_member_id uuid,
  p_note text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_id uuid := private.member_master_current_admin_id();
  v_note public.member_notes%ROWTYPE;
  v_created boolean := p_note_id IS NULL;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_ADMIN_REQUIRED';
  END IF;
  IF p_member_id IS NULL
     OR NULLIF(btrim(p_note), '') IS NULL
     OR char_length(p_note) > 5000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL
     OR char_length(btrim(p_reason)) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_REASON_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.members AS member
    WHERE member.id = p_member_id AND member.anonymized_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_NOT_FOUND';
  END IF;

  IF p_note_id IS NULL THEN
    INSERT INTO public.member_notes (
      member_id, note, created_by, audit_reason
    ) VALUES (
      p_member_id, btrim(p_note), v_admin_id, btrim(p_reason)
    )
    RETURNING * INTO v_note;
  ELSE
    SELECT note.* INTO v_note
    FROM public.member_notes AS note
    WHERE note.id = p_note_id
    FOR UPDATE;
    IF v_note.id IS NULL OR v_note.member_id IS DISTINCT FROM p_member_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_NOTE_NOT_FOUND';
    END IF;
    UPDATE public.member_notes AS note SET
      note = btrim(p_note),
      audit_reason = btrim(p_reason)
    WHERE note.id = p_note_id
    RETURNING * INTO v_note;
  END IF;

  RETURN jsonb_build_object(
    'member_id', p_member_id,
    'note_id', v_note.id,
    'created', v_created,
    'record', to_jsonb(v_note) - 'audit_reason'
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_override_member_dynamic_stats(
  p_member_id uuid,
  p_payload jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_id uuid := private.member_master_current_admin_id();
  v_stats public.member_dynamic_stats%ROWTYPE;
BEGIN
  IF v_admin_id IS NULL OR NOT private.member_master_is_super_admin() THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'MEMBER_MASTER_SUPER_ADMIN_REQUIRED';
  END IF;
  IF p_member_id IS NULL OR p_payload IS NULL
     OR jsonb_typeof(p_payload) <> 'object' OR p_payload = '{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL
     OR char_length(btrim(p_reason)) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_REASON_INVALID';
  END IF;
  PERFORM private.member_master_validate_payload_keys(
    p_payload,
    ARRAY[
      'activity_count', 'review_count', 'avg_review_score', 'late_count',
      'no_show_count', 'complaint_count', 'last_activity_at',
      'reliability_score', 'replay_willing_rate', 'recent5_avg_score'
    ]
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.members AS member
    WHERE member.id = p_member_id AND member.anonymized_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_NOT_FOUND';
  END IF;

  SELECT stats.* INTO v_stats
  FROM public.member_dynamic_stats AS stats
  WHERE stats.member_id = p_member_id
  FOR UPDATE;
  IF v_stats.id IS NULL THEN
    v_stats.member_id := p_member_id;
    v_stats.activity_count := 0;
    v_stats.review_count := 0;
    v_stats.avg_review_score := NULL;
    v_stats.late_count := 0;
    v_stats.no_show_count := 0;
    v_stats.complaint_count := 0;
    v_stats.last_activity_at := NULL;
    v_stats.reliability_score := 5;
    v_stats.replay_willing_rate := NULL;
    v_stats.recent5_avg_score := NULL;
  END IF;
  v_stats := jsonb_populate_record(v_stats, p_payload);

  IF v_stats.activity_count IS NULL
     OR v_stats.review_count IS NULL
     OR v_stats.late_count IS NULL
     OR v_stats.no_show_count IS NULL
     OR v_stats.complaint_count IS NULL
     OR v_stats.reliability_score IS NULL
     OR v_stats.activity_count < 0 OR v_stats.activity_count > 1000000
     OR v_stats.review_count < 0 OR v_stats.review_count > 1000000
     OR v_stats.late_count < 0 OR v_stats.late_count > 1000000
     OR v_stats.no_show_count < 0 OR v_stats.no_show_count > 1000000
     OR v_stats.complaint_count < 0 OR v_stats.complaint_count > 1000000
     OR (v_stats.avg_review_score IS NOT NULL
         AND v_stats.avg_review_score NOT BETWEEN 0 AND 5)
     OR (v_stats.recent5_avg_score IS NOT NULL
         AND v_stats.recent5_avg_score NOT BETWEEN 0 AND 5)
     OR v_stats.reliability_score NOT BETWEEN 0 AND 5
     OR (v_stats.replay_willing_rate IS NOT NULL
         AND v_stats.replay_willing_rate NOT BETWEEN 0 AND 1) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;

  INSERT INTO public.member_dynamic_stats (
    member_id, activity_count, review_count, avg_review_score,
    late_count, no_show_count, complaint_count, last_activity_at,
    reliability_score, replay_willing_rate, recent5_avg_score, audit_reason
  ) VALUES (
    p_member_id, v_stats.activity_count, v_stats.review_count,
    v_stats.avg_review_score, v_stats.late_count, v_stats.no_show_count,
    v_stats.complaint_count, v_stats.last_activity_at,
    v_stats.reliability_score, v_stats.replay_willing_rate,
    v_stats.recent5_avg_score, btrim(p_reason)
  )
  ON CONFLICT (member_id) DO UPDATE SET
    activity_count = EXCLUDED.activity_count,
    review_count = EXCLUDED.review_count,
    avg_review_score = EXCLUDED.avg_review_score,
    late_count = EXCLUDED.late_count,
    no_show_count = EXCLUDED.no_show_count,
    complaint_count = EXCLUDED.complaint_count,
    last_activity_at = EXCLUDED.last_activity_at,
    reliability_score = EXCLUDED.reliability_score,
    replay_willing_rate = EXCLUDED.replay_willing_rate,
    recent5_avg_score = EXCLUDED.recent5_avg_score,
    audit_reason = EXCLUDED.audit_reason
  RETURNING * INTO v_stats;

  RETURN jsonb_build_object(
    'member_id', p_member_id,
    'record', to_jsonb(v_stats) - 'audit_reason'
  );
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range
    OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_legacy_member(
  p_legacy_id uuid,
  p_payload jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_id uuid := private.member_master_current_admin_id();
  v_legacy public.legacy_members%ROWTYPE;
  v_created boolean := p_legacy_id IS NULL;
BEGIN
  IF v_admin_id IS NULL OR NOT private.member_master_is_super_admin() THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'MEMBER_MASTER_SUPER_ADMIN_REQUIRED';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR p_payload = '{}'::jsonb OR octet_length(p_payload::text) > 65536 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL
     OR char_length(btrim(p_reason)) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_REASON_INVALID';
  END IF;
  PERFORM private.member_master_validate_payload_keys(
    p_payload,
    ARRAY[
      'member_no', 'full_name', 'gender', 'school', 'department',
      'interest_tags', 'social_tags', 'game_mode', 'compatibility_score',
      'session_count', 'match_history', 'claim_status'
    ]
  );
  IF v_created AND NOT (p_payload ?& ARRAY['member_no', 'full_name']) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'MEMBER_MASTER_REQUIRED_FIELDS_MISSING';
  END IF;
  IF p_payload ? 'member_no' AND (
       jsonb_typeof(p_payload->'member_no') <> 'string'
       OR char_length(btrim(p_payload->>'member_no')) NOT BETWEEN 1 AND 100
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;
  IF p_payload ? 'full_name' AND (
       jsonb_typeof(p_payload->'full_name') <> 'string'
       OR char_length(btrim(p_payload->>'full_name')) NOT BETWEEN 1 AND 500
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY['gender', 'school', 'department', 'game_mode']) AS field(key)
    WHERE p_payload ? field.key
      AND p_payload->field.key <> 'null'::jsonb
      AND (
        jsonb_typeof(p_payload->field.key) <> 'string'
        OR char_length(p_payload->>field.key) > 500
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;
  IF p_payload ? 'compatibility_score'
     AND p_payload->'compatibility_score' <> 'null'::jsonb
     AND (
       jsonb_typeof(p_payload->'compatibility_score') <> 'number'
       OR (p_payload->>'compatibility_score')::numeric NOT BETWEEN 0 AND 5
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;
  IF p_payload ? 'session_count'
     AND p_payload->'session_count' <> 'null'::jsonb
     AND (
       jsonb_typeof(p_payload->'session_count') <> 'number'
       OR (p_payload->>'session_count') !~ '^[0-9]+$'
       OR (p_payload->>'session_count')::integer > 1000000
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;
  IF p_payload ? 'match_history'
     AND p_payload->'match_history' <> 'null'::jsonb
     AND (
       jsonb_typeof(p_payload->'match_history') <> 'array'
       OR jsonb_array_length(p_payload->'match_history') > 1000
       OR octet_length((p_payload->'match_history')::text) > 65536
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;
  IF p_payload ? 'claim_status'
     AND COALESCE(p_payload->>'claim_status', '') NOT IN (
       'unclaimed', 'pending', 'approved', 'rejected'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;
  IF v_created THEN
    v_legacy.id := gen_random_uuid();
    v_legacy.interest_tags := ARRAY[]::text[];
    v_legacy.social_tags := ARRAY[]::text[];
    v_legacy.session_count := 0;
    v_legacy.match_history := '[]'::jsonb;
    v_legacy.claim_status := 'unclaimed';
    v_legacy.created_at := now();
  ELSE
    SELECT legacy.* INTO v_legacy
    FROM public.legacy_members AS legacy
    WHERE legacy.id = p_legacy_id
    FOR UPDATE;
    IF v_legacy.id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_LEGACY_NOT_FOUND';
    END IF;
  END IF;

  IF p_payload ? 'member_no' THEN
    v_legacy.member_no := btrim(p_payload->>'member_no');
  END IF;
  IF p_payload ? 'full_name' THEN
    v_legacy.full_name := btrim(p_payload->>'full_name');
  END IF;
  IF p_payload ? 'gender' THEN
    v_legacy.gender := NULLIF(btrim(p_payload->>'gender'), '');
  END IF;
  IF p_payload ? 'school' THEN
    v_legacy.school := NULLIF(btrim(p_payload->>'school'), '');
  END IF;
  IF p_payload ? 'department' THEN
    v_legacy.department := NULLIF(btrim(p_payload->>'department'), '');
  END IF;
  IF p_payload ? 'interest_tags' THEN
    v_legacy.interest_tags := private.member_master_jsonb_text_array(
      p_payload, 'interest_tags', false, 100, 200
    );
  END IF;
  IF p_payload ? 'social_tags' THEN
    v_legacy.social_tags := private.member_master_jsonb_text_array(
      p_payload, 'social_tags', false, 100, 200
    );
  END IF;
  IF p_payload ? 'game_mode' THEN
    v_legacy.game_mode := NULLIF(btrim(p_payload->>'game_mode'), '');
  END IF;
  IF p_payload ? 'compatibility_score' THEN
    v_legacy.compatibility_score := (p_payload->>'compatibility_score')::numeric;
  END IF;
  IF p_payload ? 'session_count' THEN
    v_legacy.session_count := (p_payload->>'session_count')::integer;
  END IF;
  IF p_payload ? 'match_history' THEN
    v_legacy.match_history := CASE
      WHEN p_payload->'match_history' = 'null'::jsonb THEN NULL
      ELSE p_payload->'match_history'
    END;
  END IF;
  IF p_payload ? 'claim_status' THEN
    v_legacy.claim_status := p_payload->>'claim_status';
    IF v_legacy.claim_status IN ('approved', 'rejected') THEN
      IF v_legacy.claim_status = 'approved' AND v_legacy.claimed_by IS NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'MEMBER_MASTER_LEGACY_CLAIM_LINK_REQUIRED';
      END IF;
      v_legacy.reviewed_by := v_admin_id;
      v_legacy.reviewed_at := now();
    ELSE
      v_legacy.reviewed_by := NULL;
      v_legacy.reviewed_at := NULL;
    END IF;
  END IF;

  PERFORM set_config('app.member_master_audit_reason', btrim(p_reason), true);
  PERFORM set_config('app.member_master_audit_source', 'admin', true);
  IF v_created THEN
    INSERT INTO public.legacy_members (
      id, member_no, full_name, gender, school, department,
      interest_tags, social_tags, game_mode, compatibility_score,
      session_count, match_history, claim_status, claimed_by, claimed_at,
      reviewed_by, reviewed_at, created_at, audit_reason
    ) VALUES (
      v_legacy.id, v_legacy.member_no, v_legacy.full_name,
      v_legacy.gender, v_legacy.school, v_legacy.department,
      v_legacy.interest_tags, v_legacy.social_tags, v_legacy.game_mode,
      v_legacy.compatibility_score, v_legacy.session_count,
      v_legacy.match_history, v_legacy.claim_status, v_legacy.claimed_by,
      v_legacy.claimed_at, v_legacy.reviewed_by, v_legacy.reviewed_at,
      v_legacy.created_at, btrim(p_reason)
    ) RETURNING * INTO v_legacy;
  ELSE
    UPDATE public.legacy_members AS legacy SET
      member_no = v_legacy.member_no,
      full_name = v_legacy.full_name,
      gender = v_legacy.gender,
      school = v_legacy.school,
      department = v_legacy.department,
      interest_tags = v_legacy.interest_tags,
      social_tags = v_legacy.social_tags,
      game_mode = v_legacy.game_mode,
      compatibility_score = v_legacy.compatibility_score,
      session_count = v_legacy.session_count,
      match_history = v_legacy.match_history,
      claim_status = v_legacy.claim_status,
      claimed_by = v_legacy.claimed_by,
      claimed_at = v_legacy.claimed_at,
      reviewed_by = v_legacy.reviewed_by,
      reviewed_at = v_legacy.reviewed_at,
      created_at = v_legacy.created_at,
      audit_reason = btrim(p_reason)
    WHERE legacy.id = p_legacy_id
    RETURNING legacy.* INTO v_legacy;
  END IF;

  RETURN jsonb_build_object(
    'legacy_id', v_legacy.id,
    'canonical_member_id', v_legacy.canonical_member_id,
    'created', v_created,
    'record', to_jsonb(v_legacy) - 'audit_reason'
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'MEMBER_MASTER_LEGACY_MEMBER_NUMBER_CONFLICT';
  WHEN invalid_text_representation OR numeric_value_out_of_range
    OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
END
$function$;

-- The current round-import implementation performs its bulk row work through
-- the server-only database client. This authenticated super-admin attestation
-- records each create/delete/restore against the durable member snapshot until
-- that importer is fully moved into a single database transaction.
CREATE OR REPLACE FUNCTION public.admin_record_member_import_event(
  p_member_id uuid,
  p_operation text,
  p_reason text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_id uuid := private.member_master_current_admin_id();
  v_admin_name text;
  v_member public.members%ROWTYPE;
  v_event_id bigint;
  v_related jsonb;
  v_round_id uuid;
  v_snapshot_role text;
  v_snapshot jsonb;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_safe_metadata jsonb;
  v_action_type text := 'member_import_event';
  v_section text := 'import';
  v_changed_fields text[] := ARRAY['import_operation']::text[];
  v_requested_changed_fields text[];
BEGIN
  IF v_admin_id IS NULL OR NOT private.member_master_is_super_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_SUPER_ADMIN_REQUIRED';
  END IF;
  IF p_member_id IS NULL
     OR COALESCE(p_operation, '') NOT IN (
       'create', 'delete', 'restore', 'submission_replace'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_IMPORT_OPERATION_INVALID';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL
     OR char_length(btrim(p_reason)) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_REASON_INVALID';
  END IF;
  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object'
     OR octet_length(p_metadata::text) > 32768 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;

  PERFORM private.member_master_validate_payload_keys(
    p_metadata,
    ARRAY[
      'event_scope', 'round', 'file', 'row', 'phase', 'write_stage',
      'service_write_performed', 'atomic_with_service_write', 'related_record'
    ]::text[]
  );
  IF p_metadata->>'event_scope' IS DISTINCT FROM 'round_excel_member_import'
     OR COALESCE(jsonb_typeof(p_metadata->'round'), '') <> 'object'
     OR lower(COALESCE(p_metadata#>>'{round,id}', '')) !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(jsonb_typeof(p_metadata->'file'), '') <> 'object'
     OR lower(COALESCE(p_metadata#>>'{file,sha256}', '')) !~ '^[0-9a-f]{64}$'
     OR COALESCE(p_metadata#>>'{file,size_bytes}', '') !~ '^[0-9]{1,12}$'
     OR p_metadata#>>'{file,extension}' IS DISTINCT FROM 'xlsx'
     OR COALESCE(jsonb_typeof(p_metadata->'row'), '') <> 'object'
     OR (
       p_metadata#>'{row,number}' IS NOT NULL
       AND p_metadata#>'{row,number}' <> 'null'::jsonb
       AND COALESCE(p_metadata#>>'{row,number}', '') !~ '^[1-9][0-9]{0,6}$'
     )
     OR COALESCE(p_metadata->>'phase', '') NOT IN ('apply', 'compensation')
     OR COALESCE(p_metadata->>'write_stage', '') NOT IN (
       'before_service_write', 'after_service_write', 'after_compensation'
     )
     OR COALESCE(jsonb_typeof(p_metadata->'service_write_performed'), '') <> 'boolean'
     OR p_metadata->'atomic_with_service_write' IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_IMPORT_METADATA_INVALID';
  END IF;
  v_round_id := (p_metadata#>>'{round,id}')::uuid;

  v_safe_metadata := jsonb_strip_nulls(jsonb_build_object(
    'event_scope', 'round_excel_member_import',
    'round_id', v_round_id,
    'file_sha256', lower(p_metadata#>>'{file,sha256}'),
    'file_size_bytes', (p_metadata#>>'{file,size_bytes}')::bigint,
    'file_extension', 'xlsx',
    'row_number', CASE
      WHEN p_metadata#>'{row,number}' IS NULL
        OR p_metadata#>'{row,number}' = 'null'::jsonb THEN NULL
      ELSE (p_metadata#>>'{row,number}')::integer
    END,
    'phase', p_metadata->>'phase',
    'write_stage', p_metadata->>'write_stage',
    'service_write_performed', (p_metadata->>'service_write_performed')::boolean,
    'atomic_with_service_write', false
  ));

  SELECT member.* INTO v_member
  FROM public.members AS member
  WHERE member.id = p_member_id;

  IF p_operation = 'submission_replace' THEN
    v_related := p_metadata->'related_record';
    IF jsonb_typeof(v_related) <> 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_IMPORT_METADATA_INVALID';
    END IF;
    PERFORM private.member_master_validate_payload_keys(
      v_related,
      ARRAY[
        'entity', 'operation', 'snapshot_role', 'snapshot',
        'changed_fields', 'compensation_step', 'compensation_succeeded'
      ]::text[]
    );
    v_snapshot_role := v_related->>'snapshot_role';
    v_requested_changed_fields := private.member_master_jsonb_text_array(
      v_related, 'changed_fields', true, 8, 40
    );
    IF v_related->>'entity' IS DISTINCT FROM 'match_round_submissions'
       OR v_related->>'operation' IS DISTINCT FROM 'round_replace'
       OR COALESCE(v_snapshot_role, '') NOT IN (
         'before', 'after', 'after_compensation_clear', 'after_compensation'
       )
       OR (
         v_related ? 'compensation_step'
         AND COALESCE(v_related->>'compensation_step', '') NOT IN (
           'clear_current', 'restore_previous'
         )
       )
       OR (
         v_related ? 'compensation_succeeded'
         AND v_related->'compensation_succeeded' NOT IN ('true'::jsonb, 'false'::jsonb)
       )
       OR NOT v_requested_changed_fields <@ ARRAY[
         'submission_presence', 'game_type_pref', 'gender_pref', 'availability',
         'interest_tags', 'social_style', 'message', 'import_metadata'
       ]::text[] THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_IMPORT_METADATA_INVALID';
    END IF;

    IF v_member.id IS NOT NULL THEN
      PERFORM private.member_master_lock_non_anonymized_subjects(ARRAY[p_member_id]);
    ELSIF v_snapshot_role = 'before' OR NOT EXISTS (
      SELECT 1
      FROM private.member_profile_audit_log AS prior
      WHERE prior.member_id_snapshot = p_member_id
        AND prior.action_type = 'round_submission_import_snapshot'
        AND prior.metadata->>'round_id' = v_round_id::text
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_IMPORT_MEMBER_NOT_FOUND';
    END IF;

    SELECT jsonb_build_object(
      'game_type_pref', submission.game_type_pref,
      'gender_pref', submission.gender_pref,
      'availability', submission.availability,
      'interest_tags', to_jsonb(submission.interest_tags),
      'social_style', submission.social_style,
      'message', submission.message
    ) INTO v_snapshot
    FROM public.match_round_submissions AS submission
    WHERE submission.member_id = p_member_id
      AND submission.round_id = v_round_id
    LIMIT 1;
    IF v_snapshot IS NOT NULL AND octet_length(v_snapshot::text) > 32768 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_IMPORT_SNAPSHOT_TOO_LARGE';
    END IF;

    IF v_snapshot_role = 'before' THEN
      v_before := jsonb_build_object('submission', v_snapshot);
    ELSE
      v_after := jsonb_build_object('submission', v_snapshot);
    END IF;
    v_action_type := 'round_submission_import_snapshot';
    v_section := 'related_match_round_submissions';
    v_changed_fields := array_remove(v_requested_changed_fields, 'import_metadata');
    v_safe_metadata := v_safe_metadata || jsonb_build_object(
      'related_record', jsonb_strip_nulls(jsonb_build_object(
        'entity', 'match_round_submissions',
        'operation', 'round_replace',
        'snapshot_role', v_snapshot_role,
        'compensation_step', v_related->>'compensation_step',
        'compensation_succeeded', CASE
          WHEN v_related ? 'compensation_succeeded'
            THEN (v_related->>'compensation_succeeded')::boolean
          ELSE NULL
        END
      ))
    );
  ELSE
    IF v_member.id IS NOT NULL AND v_member.record_source <> 'import' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MEMBER_MASTER_IMPORT_MEMBER_INVALID';
    END IF;
    IF p_operation IN ('create', 'restore') AND v_member.id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MEMBER_MASTER_IMPORT_MEMBER_INVALID';
    END IF;
    IF p_operation = 'delete'
       AND v_member.id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM private.member_profile_audit_log AS prior
         WHERE prior.member_id_snapshot = p_member_id
           AND prior.source = 'import'
       ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_IMPORT_MEMBER_NOT_FOUND';
    END IF;
    IF v_member.id IS NOT NULL THEN
      PERFORM private.member_master_lock_non_anonymized_subjects(ARRAY[p_member_id]);
    END IF;
    v_before := jsonb_build_object('member_present', v_member.id IS NOT NULL);
    v_after := jsonb_build_object(
      'operation', p_operation,
      'member_present', v_member.id IS NOT NULL,
      'record_source', v_member.record_source,
      'account_status', v_member.account_status
    );
  END IF;

  SELECT administrator.name INTO v_admin_name
  FROM public.admin_users AS administrator
  WHERE administrator.id = v_admin_id;
  INSERT INTO private.member_profile_audit_log (
    member_id, member_id_snapshot, action_type, section, changed_fields,
    before_values, after_values, reason, source,
    actor_user_id, actor_admin_id, actor_name, actor_role_snapshot, metadata
  ) VALUES (
    p_member_id, p_member_id, v_action_type, v_section,
    v_changed_fields, v_before, v_after,
    btrim(p_reason), 'import', (SELECT auth.uid()), v_admin_id, v_admin_name,
    'super_admin',
    v_safe_metadata || jsonb_build_object(
      'operation', p_operation,
      'member_present_at_audit', v_member.id IS NOT NULL,
      'import_write_atomic_with_audit', false
    )
  ) RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'member_id', p_member_id,
    'operation', p_operation,
    'audit_event_id', v_event_id,
    'recorded', true,
    'atomic_with_import_write', false,
    'section', v_section,
    'round_id', CASE WHEN p_operation = 'submission_replace' THEN v_round_id ELSE NULL END,
    'snapshot_role', v_snapshot_role,
    'snapshot_present', v_snapshot IS NOT NULL
  );
END
$function$;

-- Preserve the legacy application contract while removing its broad audit
-- payload and 1,000-character/default-reason bypass. Only the five editable
-- business fields are snapshotted, and only keys that actually changed are
-- retained in the permanent audit event.
CREATE OR REPLACE FUNCTION public.admin_update_member_profile_metrics(
  p_member_id uuid,
  p_level smallint,
  p_compatibility_score numeric,
  p_compatibility_status text,
  p_internal_note text,
  p_score_source text,
  p_audit_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_id uuid := private.member_master_current_admin_id();
  v_admin_name text;
  v_before private.member_profile_metrics%ROWTYPE;
  v_after private.member_profile_metrics%ROWTYPE;
  v_changed_fields text[] := ARRAY[]::text[];
  v_before_state jsonb;
  v_after_state jsonb;
  v_before_compact jsonb := '{}'::jsonb;
  v_after_compact jsonb := '{}'::jsonb;
  v_changed_field text;
  v_snapshot_key text;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_ADMIN_REQUIRED';
  END IF;
  IF p_member_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;
  IF p_level IS NULL OR p_level NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_METRICS_LEVEL_INVALID';
  END IF;
  IF p_compatibility_score IS NULL
     OR p_compatibility_score < 1.0
     OR p_compatibility_score > 5.0
     OR round(p_compatibility_score, 1) <> p_compatibility_score THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_METRICS_SCORE_INVALID';
  END IF;
  IF p_compatibility_status IS NULL
     OR p_compatibility_status NOT IN ('pending', 'published') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_METRICS_STATUS_INVALID';
  END IF;
  IF p_score_source IS NULL OR p_score_source NOT IN ('initial', 'manual') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_METRICS_SOURCE_INVALID';
  END IF;
  IF NULLIF(btrim(p_internal_note), '') IS NULL
     OR char_length(btrim(p_internal_note)) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_METRICS_NOTE_INVALID';
  END IF;
  IF NULLIF(btrim(p_audit_reason), '') IS NULL
     OR char_length(btrim(p_audit_reason)) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_REASON_INVALID';
  END IF;

  PERFORM private.member_master_lock_non_anonymized_subjects(ARRAY[p_member_id]);
  IF NOT EXISTS (
    SELECT 1 FROM public.members AS member
    WHERE member.id = p_member_id AND member.anonymized_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_NOT_FOUND';
  END IF;

  INSERT INTO private.member_profile_metrics (member_id)
  VALUES (p_member_id)
  ON CONFLICT (member_id) DO NOTHING;

  SELECT * INTO v_before
  FROM private.member_profile_metrics AS metrics
  WHERE metrics.member_id = p_member_id
  FOR UPDATE;

  IF v_before.member_level IS DISTINCT FROM p_level THEN
    v_changed_fields := array_append(v_changed_fields, 'level');
  END IF;
  IF v_before.compatibility_score IS DISTINCT FROM p_compatibility_score THEN
    v_changed_fields := array_append(v_changed_fields, 'compatibility_score');
  END IF;
  IF v_before.compatibility_status IS DISTINCT FROM p_compatibility_status THEN
    v_changed_fields := array_append(v_changed_fields, 'compatibility_status');
  END IF;
  IF v_before.internal_note IS DISTINCT FROM btrim(p_internal_note) THEN
    v_changed_fields := array_append(v_changed_fields, 'internal_note');
  END IF;
  IF v_before.score_source IS DISTINCT FROM p_score_source THEN
    v_changed_fields := array_append(v_changed_fields, 'score_source');
  END IF;

  IF cardinality(v_changed_fields) = 0 THEN
    RETURN private.profile_admin_metrics_payload(p_member_id);
  END IF;

  UPDATE private.member_profile_metrics AS metrics
  SET
    member_level = p_level,
    compatibility_score = p_compatibility_score,
    compatibility_status = p_compatibility_status,
    internal_note = btrim(p_internal_note),
    score_source = p_score_source,
    published_at = CASE
      WHEN p_compatibility_status = 'published' THEN now()
      ELSE NULL
    END,
    published_by = CASE
      WHEN p_compatibility_status = 'published' THEN v_admin_id
      ELSE NULL
    END,
    updated_at = now(),
    updated_by = v_admin_id
  WHERE metrics.member_id = p_member_id
  RETURNING * INTO v_after;

  v_before_state := jsonb_build_object(
    'member_level', v_before.member_level,
    'compatibility_score', v_before.compatibility_score,
    'compatibility_status', v_before.compatibility_status,
    'internal_note', v_before.internal_note,
    'score_source', v_before.score_source
  );
  v_after_state := jsonb_build_object(
    'member_level', v_after.member_level,
    'compatibility_score', v_after.compatibility_score,
    'compatibility_status', v_after.compatibility_status,
    'internal_note', v_after.internal_note,
    'score_source', v_after.score_source
  );
  FOREACH v_changed_field IN ARRAY v_changed_fields LOOP
    v_snapshot_key := CASE
      WHEN v_changed_field = 'level' THEN 'member_level'
      ELSE v_changed_field
    END;
    v_before_compact := v_before_compact || jsonb_build_object(
      v_snapshot_key, v_before_state->v_snapshot_key
    );
    v_after_compact := v_after_compact || jsonb_build_object(
      v_snapshot_key, v_after_state->v_snapshot_key
    );
  END LOOP;

  SELECT administrator.name INTO v_admin_name
  FROM public.admin_users AS administrator
  WHERE administrator.id = v_admin_id;
  INSERT INTO private.member_profile_audit_log (
    member_id, member_id_snapshot, action_type, section, changed_fields,
    before_values, after_values, reason, source,
    actor_user_id, actor_admin_id, actor_name, metadata
  ) VALUES (
    p_member_id, p_member_id, 'metrics_update', 'metrics', v_changed_fields,
    v_before_compact, v_after_compact, btrim(p_audit_reason), 'admin',
    (SELECT auth.uid()), v_admin_id, v_admin_name,
    jsonb_build_object('compact_snapshot', true)
  );

  RETURN private.profile_admin_metrics_payload(p_member_id);
END
$function$;

-- PostgreSQL does not allow CREATE OR REPLACE FUNCTION to remove argument
-- defaults from an existing signature. The legacy profile RPC supplied
-- defaults for both arguments, while the controlled admin mutation requires
-- an explicit member and human reason. Drop the old signature transactionally
-- before recreating it with the stricter contract below.
DROP FUNCTION IF EXISTS public.admin_recalculate_member_activity_stats(uuid, text);

CREATE OR REPLACE FUNCTION public.admin_recalculate_member_activity_stats(
  p_member_id uuid,
  p_audit_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_id uuid := private.member_master_current_admin_id();
  v_admin_name text;
  v_before jsonb;
  v_after jsonb;
  v_event_id bigint;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_ADMIN_REQUIRED';
  END IF;
  IF p_member_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;
  IF NULLIF(btrim(p_audit_reason), '') IS NULL
     OR char_length(btrim(p_audit_reason)) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_REASON_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.members AS member
    WHERE member.id = p_member_id AND member.anonymized_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_NOT_FOUND';
  END IF;

  SELECT to_jsonb(stats) - 'audit_reason' INTO v_before
  FROM public.member_dynamic_stats AS stats
  WHERE stats.member_id = p_member_id;
  PERFORM set_config('app.member_master_explicit_audit', 'on', true);
  PERFORM set_config('app.member_master_audit_reason', btrim(p_audit_reason), true);
  PERFORM private.recalculate_member_activity_stats(p_member_id);
  SELECT to_jsonb(stats) - 'audit_reason' INTO v_after
  FROM public.member_dynamic_stats AS stats
  WHERE stats.member_id = p_member_id;

  SELECT administrator.name INTO v_admin_name
  FROM public.admin_users AS administrator
  WHERE administrator.id = v_admin_id;
  INSERT INTO private.member_profile_audit_log (
    member_id, member_id_snapshot, action_type, section, changed_fields,
    before_values, after_values, reason, source,
    actor_user_id, actor_admin_id, actor_name
  ) VALUES (
    p_member_id, p_member_id, 'activity_recalculate', 'dynamic_stats',
    private.member_master_changed_fields(
      COALESCE(v_before, '{}'::jsonb), COALESCE(v_after, '{}'::jsonb)
    ),
    COALESCE(v_before, '{}'::jsonb), COALESCE(v_after, '{}'::jsonb),
    btrim(p_audit_reason), 'admin', (SELECT auth.uid()), v_admin_id, v_admin_name
  ) RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'member_id', p_member_id,
    'recalculated_members', 1,
    'audit_event_id', v_event_id,
    'data', COALESCE(v_after, '{}'::jsonb)
  );
END
$function$;

-- ---------------------------------------------------------------------------
-- Anonymous community boundary: non-anonymous stats and super-only reveal
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.community_admin_list_members(
  p_limit integer DEFAULT 50,
  p_after_joined_at timestamptz DEFAULT NULL,
  p_after_profile_id uuid DEFAULT NULL
)
RETURNS TABLE (
  profile_id uuid,
  nickname text,
  avatar_kind text,
  avatar_path text,
  preset_avatar text,
  joined_at timestamptz,
  member_id uuid,
  member_number text,
  member_status text,
  active_sanction_type text,
  active_sanction_ends_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_is_service boolean := COALESCE((SELECT auth.jwt()->>'role'), '') = 'service_role';
  v_can_read_high_risk boolean := private.member_master_is_super_admin() OR v_is_service;
BEGIN
  IF NOT private.member_master_is_admin() AND NOT v_is_service THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_ADMIN_REQUIRED';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAGINATION_INVALID';
  END IF;
  IF (p_after_joined_at IS NULL) <> (p_after_profile_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAGINATION_INVALID';
  END IF;

  RETURN QUERY
  SELECT
    profile.id,
    profile.nickname,
    profile.avatar_kind,
    profile.avatar_path,
    profile.preset_avatar,
    profile.joined_at,
    member.id,
    CASE WHEN v_can_read_high_risk THEN member.member_number ELSE NULL END,
    member.status,
    active_sanction.sanction_type,
    active_sanction.ends_at
  FROM public.community_profiles AS profile
  JOIN private.community_profile_members AS profile_member
    ON profile_member.profile_id = profile.id
  LEFT JOIN public.members AS member ON member.id = profile_member.member_id
  LEFT JOIN LATERAL (
    SELECT sanction.sanction_type, sanction.ends_at
    FROM public.community_sanctions AS sanction
    WHERE sanction.member_id = member.id
      AND sanction.revoked_at IS NULL
      AND sanction.starts_at <= now()
      AND (
        sanction.sanction_type = 'permanent_ban'
        OR (sanction.sanction_type = 'mute' AND sanction.ends_at > now())
      )
    ORDER BY
      CASE sanction.sanction_type WHEN 'permanent_ban' THEN 0 ELSE 1 END,
      sanction.created_at DESC
    LIMIT 1
  ) AS active_sanction ON true
  WHERE p_after_joined_at IS NULL
     OR (profile.joined_at, profile.id) < (p_after_joined_at, p_after_profile_id)
  ORDER BY profile.joined_at DESC, profile.id DESC
  LIMIT p_limit;
END
$function$;

CREATE OR REPLACE FUNCTION public.community_admin_get_member(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT private.member_master_is_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_ADMIN_REQUIRED';
  END IF;

  SELECT jsonb_build_object(
    'profile', to_jsonb(profile),
    'member', jsonb_build_object(
      'id', member.id,
      'member_number', CASE
        WHEN private.member_master_is_super_admin() THEN member.member_number
        ELSE NULL
      END,
      'status', member.status,
      'account_status', member.account_status,
      'created_at', member.created_at
    ),
    'nickname_history', COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(history) ORDER BY history.changed_at DESC)
        FROM public.community_nickname_history AS history
        WHERE history.profile_id = profile.id
      ),
      '[]'::jsonb
    ),
    'sanctions', COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(sanction) ORDER BY sanction.created_at DESC)
        FROM public.community_sanctions AS sanction
        WHERE sanction.member_id = member.id
      ),
      '[]'::jsonb
    ),
    'preferences', (
      SELECT to_jsonb(preference) - 'member_id'
      FROM public.community_notification_preferences AS preference
      WHERE preference.member_id = member.id
    ),
    'stats', jsonb_build_object(
      'treeholes', (
        SELECT count(*)
        FROM public.community_posts AS post
        WHERE post.author_profile_id = profile.id
          AND post.post_type = 'treehole'
          AND NOT post.is_anonymous
      ),
      'photo_posts', (
        SELECT count(*)
        FROM public.community_posts AS post
        WHERE post.author_profile_id = profile.id
          AND post.post_type = 'photo'
          AND NOT post.is_anonymous
      ),
      'comments', (
        SELECT count(*)
        FROM public.community_comments AS comment
        WHERE comment.author_profile_id = profile.id
          AND NOT comment.is_anonymous_author
      ),
      'pending_reports', (
        SELECT count(*)
        FROM public.community_reports AS report
        LEFT JOIN public.community_posts AS reported_post
          ON reported_post.id = report.reported_post_id
        LEFT JOIN public.community_comments AS reported_comment
          ON reported_comment.id = report.reported_comment_id
        WHERE report.status IN ('pending', 'in_review')
          AND (
            (
              reported_post.author_profile_id = profile.id
              AND NOT reported_post.is_anonymous
            )
            OR (
              reported_comment.author_profile_id = profile.id
              AND NOT reported_comment.is_anonymous_author
            )
            OR report.reported_profile_id = profile.id
          )
      )
    )
  ) INTO v_result
  FROM public.community_profiles AS profile
  JOIN private.community_profile_members AS profile_member
    ON profile_member.profile_id = profile.id
  LEFT JOIN public.members AS member ON member.id = profile_member.member_id
  WHERE profile.id = p_profile_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'COMMUNITY_PROFILE_NOT_FOUND';
  END IF;
  RETURN v_result;
END
$function$;

DROP FUNCTION IF EXISTS public.community_reveal_post_author(uuid, text, uuid);
CREATE FUNCTION public.community_reveal_post_author(
  p_post_id uuid,
  p_reason text,
  p_report_id uuid
)
RETURNS TABLE (
  member_id uuid,
  profile_id uuid,
  nickname text,
  member_number text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_id uuid := private.member_master_current_admin_id();
  v_admin_name text;
  v_subject_member_id uuid;
  v_event_id bigint;
BEGIN
  IF v_admin_id IS NULL OR NOT private.member_master_is_super_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_SUPER_ADMIN_REQUIRED';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_REASON_REQUIRED';
  END IF;
  PERFORM 1 FROM public.community_reports AS report
    WHERE report.id = p_report_id
      AND report.reported_post_id = p_post_id
      AND report.status IN ('pending', 'in_review')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMUNITY_PENDING_REPORT_REQUIRED';
  END IF;
  PERFORM 1 FROM public.community_posts AS post
  WHERE post.id = p_post_id AND post.is_anonymous
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMUNITY_TARGET_IS_NOT_ANONYMOUS';
  END IF;
  SELECT author.member_id INTO v_subject_member_id
  FROM private.community_post_authors AS author
  WHERE author.post_id = p_post_id
    AND author.member_id IS NOT NULL
  FOR SHARE;
  IF v_subject_member_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'COMMUNITY_ANONYMOUS_AUTHOR_NOT_FOUND';
  END IF;
  SELECT administrator.name INTO v_admin_name
  FROM public.admin_users AS administrator
  WHERE administrator.id = v_admin_id;

  INSERT INTO public.community_moderation_actions (
    report_id, action_type, target_type, target_post_id,
    admin_user_id, internal_note
  ) VALUES (
    p_report_id, 'reveal_anonymous_author', 'post', p_post_id,
    v_admin_id, btrim(p_reason)
  );

  INSERT INTO private.member_profile_audit_log (
    member_id, member_id_snapshot, action_type, section, changed_fields,
    before_values, after_values, reason, source,
    actor_user_id, actor_admin_id, actor_name, actor_role_snapshot, metadata
  ) VALUES (
    v_subject_member_id, v_subject_member_id,
    'anonymous_author_revealed', 'anonymous_reveal',
    ARRAY['anonymous_author_mapping']::text[],
    jsonb_build_object('revealed', false),
    jsonb_build_object('revealed', true),
    btrim(p_reason), 'admin', (SELECT auth.uid()), v_admin_id, v_admin_name,
    'super_admin',
    jsonb_build_object(
      'report_id', p_report_id,
      'target_type', 'post',
      'target_id', p_post_id
    )
  ) RETURNING id INTO v_event_id;

  RETURN QUERY
  SELECT
    member.id,
    profile_member.profile_id,
    profile.nickname,
    member.member_number
  FROM private.community_post_authors AS author
  LEFT JOIN public.members AS member ON member.id = author.member_id
  LEFT JOIN private.community_profile_members AS profile_member
    ON profile_member.member_id = member.id
  LEFT JOIN public.community_profiles AS profile
    ON profile.id = profile_member.profile_id
  WHERE author.post_id = p_post_id;
END
$function$;

DROP FUNCTION IF EXISTS public.community_reveal_comment_author(uuid, text, uuid);
CREATE FUNCTION public.community_reveal_comment_author(
  p_comment_id uuid,
  p_reason text,
  p_report_id uuid
)
RETURNS TABLE (
  member_id uuid,
  profile_id uuid,
  nickname text,
  member_number text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_id uuid := private.member_master_current_admin_id();
  v_admin_name text;
  v_subject_member_id uuid;
  v_event_id bigint;
BEGIN
  IF v_admin_id IS NULL OR NOT private.member_master_is_super_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_SUPER_ADMIN_REQUIRED';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_REASON_REQUIRED';
  END IF;
  PERFORM 1 FROM public.community_reports AS report
    WHERE report.id = p_report_id
      AND report.reported_comment_id = p_comment_id
      AND report.status IN ('pending', 'in_review')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMUNITY_PENDING_REPORT_REQUIRED';
  END IF;
  PERFORM 1 FROM public.community_comments AS comment
  WHERE comment.id = p_comment_id AND comment.is_anonymous_author
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMUNITY_TARGET_IS_NOT_ANONYMOUS';
  END IF;
  SELECT author.member_id INTO v_subject_member_id
  FROM private.community_comment_authors AS author
  WHERE author.comment_id = p_comment_id
    AND author.member_id IS NOT NULL
  FOR SHARE;
  IF v_subject_member_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'COMMUNITY_ANONYMOUS_AUTHOR_NOT_FOUND';
  END IF;
  SELECT administrator.name INTO v_admin_name
  FROM public.admin_users AS administrator
  WHERE administrator.id = v_admin_id;

  INSERT INTO public.community_moderation_actions (
    report_id, action_type, target_type, target_comment_id,
    admin_user_id, internal_note
  ) VALUES (
    p_report_id, 'reveal_anonymous_author', 'comment', p_comment_id,
    v_admin_id, btrim(p_reason)
  );

  INSERT INTO private.member_profile_audit_log (
    member_id, member_id_snapshot, action_type, section, changed_fields,
    before_values, after_values, reason, source,
    actor_user_id, actor_admin_id, actor_name, actor_role_snapshot, metadata
  ) VALUES (
    v_subject_member_id, v_subject_member_id,
    'anonymous_author_revealed', 'anonymous_reveal',
    ARRAY['anonymous_author_mapping']::text[],
    jsonb_build_object('revealed', false),
    jsonb_build_object('revealed', true),
    btrim(p_reason), 'admin', (SELECT auth.uid()), v_admin_id, v_admin_name,
    'super_admin',
    jsonb_build_object(
      'report_id', p_report_id,
      'target_type', 'comment',
      'target_id', p_comment_id
    )
  ) RETURNING id INTO v_event_id;

  RETURN QUERY
  SELECT
    member.id,
    profile_member.profile_id,
    profile.nickname,
    member.member_number
  FROM private.community_comment_authors AS author
  LEFT JOIN public.members AS member ON member.id = author.member_id
  LEFT JOIN private.community_profile_members AS profile_member
    ON profile_member.member_id = member.id
  LEFT JOIN public.community_profiles AS profile
    ON profile.id = profile_member.profile_id
  WHERE author.comment_id = p_comment_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_member_audit(
  p_member_id uuid,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_can_read_high_risk boolean := private.member_master_is_super_admin();
  v_subject_anonymized boolean := false;
  v_total bigint;
  v_items jsonb;
BEGIN
  IF NOT private.member_master_is_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_ADMIN_REQUIRED';
  END IF;
  IF p_page IS NULL OR p_page < 1
     OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAGINATION_INVALID';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.members AS member WHERE member.id = p_member_id)
     AND NOT EXISTS (
       SELECT 1 FROM private.member_profile_audit_log AS audit
       WHERE audit.member_id_snapshot = p_member_id
     ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_NOT_FOUND';
  END IF;
  SELECT member.anonymized_at IS NOT NULL INTO v_subject_anonymized
  FROM public.members AS member
  WHERE member.id = p_member_id;
  v_subject_anonymized := COALESCE(v_subject_anonymized, false);

  SELECT count(*) INTO v_total
  FROM private.member_profile_audit_log AS audit
  WHERE audit.member_id_snapshot = p_member_id
    AND (v_can_read_high_risk OR audit.section <> 'anonymous_reveal');

  SELECT COALESCE(
    jsonb_agg(page_event.payload ORDER BY page_event.created_at DESC, page_event.id DESC),
    '[]'::jsonb
  ) INTO v_items
  FROM (
    SELECT
      audit.id,
      audit.created_at,
      (
        CASE
          WHEN v_subject_anonymized THEN to_jsonb(audit)
            - ARRAY['before_values', 'after_values', 'metadata', 'actor_user_id']
            || jsonb_build_object('values_redacted', true, 'anonymized_subject', true)
          WHEN v_can_read_high_risk THEN to_jsonb(audit)
          WHEN audit.section = 'roles' THEN to_jsonb(audit)
            - ARRAY['metadata', 'actor_user_id', 'actor_admin_id']
          WHEN audit.section NOT IN (
            'member', 'account', 'quiz', 'lifecycle', 'import',
            'related_legacy_members', 'related_match_round_submissions'
          )
            THEN to_jsonb(audit) - 'actor_user_id'
          ELSE to_jsonb(audit)
            - ARRAY['before_values', 'after_values', 'metadata', 'actor_user_id']
            || jsonb_build_object('values_redacted', true)
        END
      ) || jsonb_build_object(
        'event_id', audit.id,
        'restorable', v_can_read_high_risk
          AND EXISTS (
            SELECT 1 FROM public.members AS member
            WHERE member.id = p_member_id AND member.anonymized_at IS NULL
          )
          AND audit.action_type IN ('admin_section_update', 'admin_restore')
          AND audit.section IN (
            'identity', 'language', 'interests', 'personality', 'boundaries',
            'quiz', 'application', 'verification', 'interview_evaluation',
            'roles', 'workflow'
          )
      ) AS payload
    FROM private.member_profile_audit_log AS audit
    WHERE audit.member_id_snapshot = p_member_id
      AND (v_can_read_high_risk OR audit.section <> 'anonymous_reveal')
    ORDER BY audit.created_at DESC, audit.id DESC
    OFFSET (p_page - 1) * p_page_size
    LIMIT p_page_size
  ) AS page_event;

  RETURN jsonb_build_object(
    'member_id', p_member_id,
    'page', p_page,
    'page_size', p_page_size,
    'total', v_total,
    'total_pages', CASE
      WHEN v_total = 0 THEN 0
      ELSE ceil(v_total::numeric / p_page_size)::integer
    END,
    'items', v_items,
    'redacted_fields', CASE
      WHEN v_subject_anonymized THEN jsonb_build_array(
        'all.before_values', 'all.after_values', 'all.metadata', 'actor_user_id'
      )
      WHEN v_can_read_high_risk THEN '[]'::jsonb
      ELSE jsonb_build_array(
        'actor_user_id', 'member/account/quiz/lifecycle.before_values',
        'member/account/quiz/lifecycle.after_values',
        'member/account/quiz/lifecycle.metadata',
        'roles.actor_user_id', 'roles.actor_admin_id', 'roles.metadata'
      )
    END
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_resolve_member_duplicate_candidate(
  p_candidate_id bigint,
  p_resolution text,
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
  v_candidate private.member_duplicate_candidates%ROWTYPE;
  v_event_ids bigint[] := ARRAY[]::bigint[];
  v_event_id bigint;
  v_subject_id uuid;
BEGIN
  IF v_admin_id IS NULL OR NOT private.member_master_is_super_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_SUPER_ADMIN_REQUIRED';
  END IF;
  IF p_resolution NOT IN ('confirmed_duplicate', 'not_duplicate') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_DUPLICATE_RESOLUTION_INVALID';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_REASON_REQUIRED';
  END IF;

  SELECT * INTO v_candidate
  FROM private.member_duplicate_candidates AS candidate
  WHERE candidate.id = p_candidate_id
  FOR UPDATE;
  IF v_candidate.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_DUPLICATE_CANDIDATE_NOT_FOUND';
  END IF;
  IF v_candidate.status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MEMBER_MASTER_DUPLICATE_ALREADY_RESOLVED';
  END IF;
  SELECT administrator.name INTO v_admin_name
  FROM public.admin_users AS administrator
  WHERE administrator.id = v_admin_id;

  UPDATE private.member_duplicate_candidates
  SET
    status = p_resolution,
    resolved_at = now(),
    resolved_by = v_admin_id,
    resolved_by_snapshot = v_admin_id,
    resolution_reason = btrim(p_reason)
  WHERE id = p_candidate_id;

  FOREACH v_subject_id IN ARRAY ARRAY[
    v_candidate.left_member_id_snapshot,
    v_candidate.right_member_id_snapshot
  ] LOOP
    INSERT INTO private.member_profile_audit_log (
      member_id, member_id_snapshot, action_type, section, changed_fields,
      before_values, after_values, reason, source,
      actor_user_id, actor_admin_id, actor_name, metadata
    ) VALUES (
      v_subject_id, v_subject_id, 'duplicate_resolution', 'duplicates',
      ARRAY['status']::text[],
      jsonb_build_object('candidate_id', p_candidate_id, 'status', 'pending'),
      jsonb_build_object('candidate_id', p_candidate_id, 'status', p_resolution),
      btrim(p_reason), 'admin', (SELECT auth.uid()), v_admin_id, v_admin_name,
      jsonb_build_object(
        'left_member_id_snapshot', v_candidate.left_member_id_snapshot,
        'right_member_id_snapshot', v_candidate.right_member_id_snapshot,
        'automatic_merge_performed', false
      )
    ) RETURNING id INTO v_event_id;
    v_event_ids := array_append(v_event_ids, v_event_id);
  END LOOP;

  RETURN jsonb_build_object(
    'candidate_id', p_candidate_id,
    'status', p_resolution,
    'resolved_at', now(),
    'resolved_by_snapshot', v_admin_id,
    'audit_event_ids', v_event_ids,
    'automatic_merge_performed', false
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_hard_delete_blank_member(
  p_member_id uuid,
  p_confirm_member_id uuid,
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
  v_member public.members%ROWTYPE;
  v_event_id bigint;
BEGIN
  IF v_admin_id IS NULL OR NOT private.member_master_is_super_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_SUPER_ADMIN_REQUIRED';
  END IF;
  IF p_member_id IS NULL OR p_confirm_member_id IS DISTINCT FROM p_member_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_DELETE_CONFIRMATION_MISMATCH';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_REASON_REQUIRED';
  END IF;

  SELECT * INTO v_member
  FROM public.members AS member
  WHERE member.id = p_member_id
  FOR UPDATE;
  IF v_member.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_NOT_FOUND';
  END IF;

  IF v_member.record_source <> 'admin'
     OR v_member.account_status <> 'unbound'
     OR v_member.user_id IS NOT NULL
     OR v_member.member_number IS NOT NULL
     OR v_member.email IS NOT NULL
     OR v_member.line_user_id IS NOT NULL
     OR v_member.wechat_openid IS NOT NULL
     OR v_member.status <> 'pending'
     OR EXISTS (SELECT 1 FROM public.member_identity WHERE member_id = p_member_id)
     OR EXISTS (SELECT 1 FROM public.member_language WHERE member_id = p_member_id)
     OR EXISTS (SELECT 1 FROM public.member_interests WHERE member_id = p_member_id)
     OR EXISTS (SELECT 1 FROM public.member_personality WHERE member_id = p_member_id)
     OR EXISTS (SELECT 1 FROM public.member_boundaries WHERE member_id = p_member_id)
     OR EXISTS (SELECT 1 FROM public.personality_quiz_results WHERE member_id = p_member_id)
     OR EXISTS (SELECT 1 FROM public.member_verification WHERE member_id = p_member_id)
     OR EXISTS (SELECT 1 FROM public.interview_evaluations WHERE member_id = p_member_id)
     OR EXISTS (SELECT 1 FROM public.member_dynamic_stats WHERE member_id = p_member_id)
     OR EXISTS (SELECT 1 FROM public.member_notes WHERE member_id = p_member_id)
     OR EXISTS (SELECT 1 FROM public.player_feedback WHERE member_id = p_member_id)
     OR EXISTS (SELECT 1 FROM public.match_round_submissions WHERE member_id = p_member_id)
     OR EXISTS (SELECT 1 FROM public.script_play_records WHERE member_id = p_member_id)
     OR EXISTS (SELECT 1 FROM public.unmatched_diagnostics WHERE member_id = p_member_id)
     OR EXISTS (SELECT 1 FROM public.legacy_members WHERE canonical_member_id = p_member_id)
     OR EXISTS (SELECT 1 FROM public.mutual_reviews WHERE reviewer_id = p_member_id OR reviewee_id = p_member_id)
     OR EXISTS (
       SELECT 1 FROM public.match_results AS match
       WHERE match.member_a_id = p_member_id
          OR match.member_b_id = p_member_id
          OR p_member_id = ANY(COALESCE(match.group_members, ARRAY[]::uuid[]))
     )
     OR EXISTS (
       SELECT 1 FROM public.activity_records AS activity
       WHERE p_member_id = ANY(COALESCE(activity.participant_ids, ARRAY[]::uuid[]))
     )
     OR EXISTS (SELECT 1 FROM private.community_profile_members WHERE member_id = p_member_id)
     OR EXISTS (SELECT 1 FROM private.community_post_authors WHERE member_id = p_member_id)
     OR EXISTS (SELECT 1 FROM private.community_comment_authors WHERE member_id = p_member_id)
     OR EXISTS (
       SELECT 1 FROM private.member_duplicate_candidates
       WHERE left_member_id_snapshot = p_member_id OR right_member_id_snapshot = p_member_id
     )
     OR EXISTS (SELECT 1 FROM public.staff_profiles WHERE member_id = p_member_id) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MEMBER_MASTER_HARD_DELETE_BLOCKED';
  END IF;

  SELECT administrator.name INTO v_admin_name
  FROM public.admin_users AS administrator
  WHERE administrator.id = v_admin_id;
  INSERT INTO private.member_profile_audit_log (
    member_id, member_id_snapshot, action_type, section, changed_fields,
    before_values, after_values, reason, source,
    actor_user_id, actor_admin_id, actor_name, metadata
  ) VALUES (
    p_member_id, p_member_id, 'member_hard_deleted', 'lifecycle',
    ARRAY['record_exists']::text[],
    jsonb_build_object(
      'record_exists', true,
      'record_source', v_member.record_source,
      'account_status', v_member.account_status
    ),
    jsonb_build_object('record_exists', false),
    btrim(p_reason), 'admin', (SELECT auth.uid()), v_admin_id, v_admin_name,
    jsonb_build_object(
      'delete_scope', 'admin_sourced_blank_unbound_test_shell_only',
      'confirmed_member_id', p_confirm_member_id
    )
  ) RETURNING id INTO v_event_id;

  DELETE FROM public.members WHERE id = p_member_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'member_id', p_member_id,
      'deleted', true,
      'audit_event_id', v_event_id,
      'audit_subject_snapshot_retained', true
    );
  END IF;
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MEMBER_MASTER_HARD_DELETE_FAILED';
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_complete_member_auth_delete(
  p_member_id uuid,
  p_auth_user_id uuid,
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
  v_tombstone private.member_auth_tombstones%ROWTYPE;
  v_event_id bigint;
  v_completed_at timestamptz;
BEGIN
  IF v_admin_id IS NULL OR NOT private.member_master_is_super_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_SUPER_ADMIN_REQUIRED';
  END IF;
  IF p_member_id IS NULL OR p_auth_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_PAYLOAD_INVALID';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_REASON_REQUIRED';
  END IF;

  SELECT * INTO v_tombstone
  FROM private.member_auth_tombstones AS tombstone
  WHERE tombstone.auth_user_id = p_auth_user_id
    AND tombstone.member_id_snapshot = p_member_id
  FOR UPDATE;
  IF v_tombstone.auth_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_AUTH_TOMBSTONE_NOT_FOUND';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users AS auth_user WHERE auth_user.id = p_auth_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MEMBER_MASTER_AUTH_USER_STILL_EXISTS';
  END IF;

  IF v_tombstone.auth_delete_completed_at IS NULL THEN
    UPDATE private.member_auth_tombstones
    SET
      auth_delete_completed_at = now(),
      auth_delete_completed_by_snapshot = v_admin_id
    WHERE auth_user_id = p_auth_user_id
    RETURNING auth_delete_completed_at INTO v_completed_at;

    SELECT administrator.name INTO v_admin_name
    FROM public.admin_users AS administrator
    WHERE administrator.id = v_admin_id;
    INSERT INTO private.member_profile_audit_log (
      member_id, member_id_snapshot, action_type, section, changed_fields,
      before_values, after_values, reason, source,
      actor_user_id, actor_admin_id, actor_name, metadata
    ) VALUES (
      p_member_id, p_member_id, 'auth_delete_completed', 'lifecycle',
      ARRAY['auth_delete_completed_at']::text[],
      jsonb_build_object('auth_delete_completed', false),
      jsonb_build_object('auth_delete_completed', true),
      btrim(p_reason), 'admin', (SELECT auth.uid()), v_admin_id, v_admin_name,
      jsonb_build_object('auth_user_id_snapshot', p_auth_user_id)
    ) RETURNING id INTO v_event_id;
  ELSE
    v_completed_at := v_tombstone.auth_delete_completed_at;
  END IF;

  RETURN jsonb_build_object(
    'member_id', p_member_id,
    'auth_user_id_snapshot', p_auth_user_id,
    'auth_delete_completed', true,
    'auth_delete_completed_at', v_completed_at,
    'audit_event_id', v_event_id,
    'idempotent', v_tombstone.auth_delete_completed_at IS NOT NULL
  );
END
$function$;

-- ---------------------------------------------------------------------------
-- Explicit function ACLs (Postgres grants EXECUTE to PUBLIC by default)
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION private.member_master_section_snapshot(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_apply_admin_section(uuid, text, jsonb, uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_prepare_audit_event()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_reject_audit_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.profile_log_identity_change()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_is_admin()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_is_super_admin()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_current_admin_id()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_lock_non_anonymized_subjects(uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_changed_fields(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_validate_payload_keys(jsonb, text[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_jsonb_text_array(jsonb, text, boolean, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_sync_lifecycle()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_audit_member_change()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_set_role(uuid, text, boolean, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_sync_member_roles()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_sync_admin_role()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.profile_current_approved_member_id()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.community_approved_member_id()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_guard_admin_user_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_guard_anonymized_member_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_guard_anonymized_dependent_write()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_audit_related_record_change()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_capture_operational_audit_reason()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_guard_round_submission_write()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_ensure_legacy_canonical()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.recalculate_member_activity_stats(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT USAGE ON SCHEMA private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.member_master_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.member_master_is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.community_approved_member_id() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_update_member_section(uuid, text, jsonb, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_restore_member_event(bigint, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ensure_my_member_record()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_my_onboarding_step(smallint, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_my_onboarding()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.request_my_match_cancellation(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_list_member_directory(integer, integer, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_get_member_360(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_preflight_member_lifecycle(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_set_member_account_status(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_anonymize_member(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_set_member_line_identity(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.community_admin_get_member(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.community_reveal_post_author(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.community_reveal_comment_author(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_list_member_audit(uuid, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_resolve_member_duplicate_candidate(bigint, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_hard_delete_blank_member(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_complete_member_auth_delete(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_upsert_activity_record(uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_delete_activity_record(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_delete_operational_record(text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_update_player_feedback(uuid, text, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_clear_unmatched_diagnostics(uuid, uuid[], text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_create_admin_whitelist(text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_update_admin_user_role(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_delete_admin_user(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_upsert_member_note(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_override_member_dynamic_stats(uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_upsert_legacy_member(uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_record_member_import_event(uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_update_member_profile_metrics(uuid, smallint, numeric, text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_recalculate_member_activity_stats(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_update_member_number(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.community_admin_list_members(integer, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_get_member_profile_audit(uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_get_member_profile_metrics(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.ensure_my_member_record() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_my_onboarding_step(smallint, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_my_onboarding() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_my_match_cancellation(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_member_section(uuid, text, jsonb, text, timestamptz)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_restore_member_event(bigint, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_member_directory(integer, integer, text, text, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_member_360(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_preflight_member_lifecycle(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_member_account_status(uuid, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_anonymize_member(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_admin_get_member(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_reveal_post_author(uuid, text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_reveal_comment_author(uuid, text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_member_audit(uuid, integer, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_member_duplicate_candidate(bigint, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_hard_delete_blank_member(uuid, uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_complete_member_auth_delete(uuid, uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_activity_record(uuid, jsonb, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_activity_record(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_operational_record(text, uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_player_feedback(uuid, text, text, text, timestamptz)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clear_unmatched_diagnostics(uuid, uuid[], text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_admin_whitelist(text, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_admin_user_role(uuid, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_admin_user(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_member_note(uuid, uuid, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_override_member_dynamic_stats(uuid, jsonb, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_legacy_member(uuid, jsonb, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_member_import_event(uuid, text, text, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_member_profile_metrics(uuid, smallint, numeric, text, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recalculate_member_activity_stats(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_admin_list_members(integer, timestamptz, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.service_set_member_line_identity(uuid, text, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Migration-time invariants and rollback-on-failure postflight
-- ---------------------------------------------------------------------------

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users AS auth_user
    WHERE NOT EXISTS (
      SELECT 1 FROM public.members AS member WHERE member.user_id = auth_user.id
    )
      AND NOT EXISTS (
        SELECT 1 FROM private.member_auth_tombstones AS tombstone
        WHERE tombstone.auth_user_id = auth_user.id
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MEMBER_MASTER_AUTH_BACKFILL_INCOMPLETE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.members AS member
    WHERE member.account_status IS NULL
       OR member.profile_stage IS NULL
       OR member.record_source IS NULL
       OR member.onboarding_step IS NULL
       OR member.onboarding_step NOT BETWEEN 0 AND 4
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MEMBER_MASTER_LIFECYCLE_BACKFILL_INCOMPLETE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_info
    WHERE constraint_info.conrelid = 'private.member_profile_audit_log'::regclass
      AND constraint_info.contype = 'f'
      AND constraint_info.confrelid IN (
        'public.members'::regclass,
        'public.admin_users'::regclass,
        'auth.users'::regclass
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MEMBER_MASTER_AUDIT_EXTERNAL_FK_REMAINS';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger AS trigger_info
    WHERE trigger_info.tgrelid = 'private.member_profile_audit_log'::regclass
      AND trigger_info.tgname = 'member_profile_audit_append_only'
      AND NOT trigger_info.tgisinternal
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MEMBER_MASTER_AUDIT_APPEND_ONLY_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger AS trigger_info
    WHERE trigger_info.tgrelid =
      'private.subjectless_operational_audit_log'::regclass
      AND trigger_info.tgname = 'member_master_reject_audit_mutation'
      AND NOT trigger_info.tgisinternal
  ) OR EXISTS (
    SELECT 1 FROM pg_constraint AS constraint_info
    WHERE constraint_info.conrelid =
      'private.subjectless_operational_audit_log'::regclass
      AND constraint_info.contype = 'f'
  ) OR has_table_privilege(
    'anon', 'private.subjectless_operational_audit_log', 'SELECT'
  ) OR has_table_privilege(
    'authenticated', 'private.subjectless_operational_audit_log', 'SELECT'
  ) OR has_table_privilege(
    'authenticated', 'private.subjectless_operational_audit_log', 'INSERT'
  ) OR has_table_privilege(
    'service_role', 'private.subjectless_operational_audit_log', 'INSERT'
  ) OR NOT has_table_privilege(
    'service_role', 'private.subjectless_operational_audit_log', 'SELECT'
  ) OR NOT has_schema_privilege(
    'service_role', 'private', 'USAGE'
  ) OR EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'table_schema', 'table_name', 'record_id_snapshot', 'operation',
      'changed_fields', 'before_values', 'after_values', 'reason', 'source',
      'actor_role_snapshot', 'created_at'
    ]) AS required(column_name)
    LEFT JOIN information_schema.columns AS column_info
      ON column_info.table_schema = 'private'
     AND column_info.table_name = 'subjectless_operational_audit_log'
     AND column_info.column_name = required.column_name
    WHERE column_info.column_name IS NULL OR column_info.is_nullable <> 'NO'
  ) OR pg_get_functiondef(
    'private.member_master_audit_related_record_change()'::regprocedure
  ) NOT ILIKE '%subjectless_operational_audit_log%'
    OR pg_get_functiondef(
      'private.member_master_audit_related_record_change()'::regprocedure
    ) NOT ILIKE '%v_business_changed_fields%'
    OR pg_get_functiondef(
      'private.member_master_audit_related_record_change()'::regprocedure
    ) NOT ILIKE '%field.key !~ ''(_id|_ids|_by)$''%' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'MEMBER_MASTER_SUBJECTLESS_AUDIT_INVALID';
  END IF;

  IF has_table_privilege('authenticated', 'public.members', 'INSERT')
     OR has_table_privilege('authenticated', 'public.members', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.members', 'DELETE')
     OR has_table_privilege('authenticated', 'public.member_identity', 'INSERT')
     OR has_table_privilege('authenticated', 'public.member_identity', 'UPDATE') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_DIRECT_WRITE_ACL_REMAINS';
  END IF;

  IF has_table_privilege('authenticated', 'public.admin_users', 'INSERT')
     OR has_table_privilege('authenticated', 'public.admin_users', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.admin_users', 'DELETE') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_ADMIN_USER_DIRECT_WRITE_ACL_REMAINS';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger AS trigger_info
    WHERE trigger_info.tgrelid = 'private.admin_user_audit_log'::regclass
      AND trigger_info.tgname = 'member_master_reject_audit_mutation'
      AND NOT trigger_info.tgisinternal
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MEMBER_MASTER_ADMIN_AUDIT_APPEND_ONLY_MISSING';
  END IF;

  IF has_table_privilege('anon', 'public.staff_profiles', 'SELECT')
     OR has_table_privilege('authenticated', 'public.staff_profiles', 'SELECT')
     OR has_column_privilege('anon', 'public.staff_profiles', 'member_id', 'SELECT')
     OR has_column_privilege('authenticated', 'public.staff_profiles', 'member_id', 'SELECT')
     OR has_column_privilege('anon', 'public.staff_profiles', 'audit_reason', 'SELECT')
     OR has_column_privilege('authenticated', 'public.staff_profiles', 'audit_reason', 'SELECT')
     OR NOT has_table_privilege('anon', 'public.published_staff_profiles', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.published_staff_profiles', 'SELECT') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_STAFF_PUBLIC_PROJECTION_ACL_INVALID';
  END IF;

  IF has_function_privilege('anon', 'public.ensure_my_member_record()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.request_my_match_cancellation(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_get_member_360(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.service_set_member_line_identity(uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_get_member_profile_audit(uuid,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_get_member_profile_metrics(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.community_reveal_post_author(uuid,text,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_upsert_activity_record(uuid,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_delete_operational_record(text,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_update_player_feedback(uuid,text,text,text,timestamptz)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_clear_unmatched_diagnostics(uuid,uuid[],text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_create_admin_whitelist(text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_update_admin_user_role(uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_delete_admin_user(uuid,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.admin_create_admin_whitelist(text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.admin_update_admin_user_role(uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.admin_delete_admin_user(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_upsert_member_note(uuid,uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_override_member_dynamic_stats(uuid,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_upsert_legacy_member(uuid,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.admin_upsert_legacy_member(uuid,jsonb,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.admin_upsert_legacy_member(uuid,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.admin_record_member_import_event(uuid,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_update_member_profile_metrics(uuid,smallint,numeric,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.admin_update_member_profile_metrics(uuid,smallint,numeric,text,text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.admin_update_member_profile_metrics(uuid,smallint,numeric,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_update_member_number(uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.admin_update_member_number(uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.community_admin_list_members(integer,timestamptz,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_get_member_profile_metrics(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.admin_get_member_profile_metrics(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'private.member_master_lock_non_anonymized_subjects(uuid[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'private.member_master_lock_non_anonymized_subjects(uuid[])', 'EXECUTE')
     OR has_function_privilege('service_role', 'private.member_master_lock_non_anonymized_subjects(uuid[])', 'EXECUTE')
     OR has_function_privilege('anon', 'private.member_master_guard_round_submission_write()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'private.member_master_guard_round_submission_write()', 'EXECUTE')
     OR has_function_privilege('service_role', 'private.member_master_guard_round_submission_write()', 'EXECUTE') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_FUNCTION_ACL_INVALID';
  END IF;

  IF pg_get_functiondef(
       'public.admin_update_member_profile_metrics(uuid,smallint,numeric,text,text,text,text)'::regprocedure
     ) NOT ILIKE '%NOT BETWEEN 4 AND 500%'
     OR pg_get_functiondef(
       'public.admin_update_member_profile_metrics(uuid,smallint,numeric,text,text,text,text)'::regprocedure
     ) NOT ILIKE '%v_before_compact%'
     OR pg_get_functiondef(
       'public.admin_update_member_profile_metrics(uuid,smallint,numeric,text,text,text,text)'::regprocedure
     ) ILIKE '%to_jsonb(v_before)%' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'MEMBER_MASTER_METRICS_MUTATION_CONTRACT_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc AS procedure_info
    WHERE procedure_info.oid =
      'public.admin_recalculate_member_activity_stats(uuid,text)'::regprocedure
      AND procedure_info.pronargdefaults <> 0
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'MEMBER_MASTER_ACTIVITY_RECALCULATE_DEFAULT_REASON_REMAINS';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint AS constraint_info
    WHERE constraint_info.conrelid =
      'private.community_media_cleanup_queue'::regclass
      AND constraint_info.conname =
        'community_media_cleanup_queue_bucket_id_check'
      AND pg_get_constraintdef(constraint_info.oid) ILIKE '%staff-avatars%'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'MEMBER_MASTER_STAFF_AVATAR_CLEANUP_BUCKET_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1 FROM private.member_duplicate_candidates AS candidate
    WHERE (
      candidate.status = 'pending'
      AND (
        candidate.resolved_at IS NOT NULL
        OR candidate.resolved_by_snapshot IS NOT NULL
      )
    ) OR (
      candidate.status <> 'pending'
      AND (
        candidate.resolved_at IS NULL
        OR candidate.resolved_by_snapshot IS NULL
        OR NULLIF(btrim(candidate.resolution_reason), '') IS NULL
      )
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MEMBER_MASTER_DUPLICATE_RESOLUTION_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.legacy_members AS legacy
    WHERE legacy.canonical_member_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.members AS member
         WHERE member.id = legacy.canonical_member_id
       )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MEMBER_MASTER_LEGACY_CANONICAL_INCOMPLETE';
  END IF;

  -- A shell created for a legacy source row may never become an unreferenced
  -- orphan through a later claim. Such claims are duplicate candidates only.
  IF EXISTS (
    SELECT 1
    FROM public.members AS member
    WHERE member.record_source = 'legacy'
      AND NOT EXISTS (
        SELECT 1 FROM public.legacy_members AS legacy
        WHERE legacy.canonical_member_id = member.id
      )
      AND EXISTS (
        SELECT 1
        FROM private.member_profile_audit_log AS audit
        WHERE audit.section = 'related_legacy_members'
          AND audit.after_values->>'canonical_member_id' = member.id::text
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MEMBER_MASTER_LEGACY_CANONICAL_ORPHAN';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies AS policy
    WHERE policy.schemaname = 'public'
      AND (
        (policy.tablename = 'members' AND policy.policyname IN (
          'insert_members_self', 'update_members_admin', 'player_read_own'
        ))
        OR (policy.tablename = 'legacy_members' AND policy.policyname IN (
          'admin_all_legacy_members', 'authenticated_read_legacy_members',
          'member_master_legacy_members_admin_read',
          'member_master_legacy_members_super_insert',
          'member_master_legacy_members_super_update',
          'member_master_legacy_members_super_delete'
        ))
        OR (policy.tablename = 'admin_users' AND policy.policyname IN (
          'select_admin_users', 'insert_admin_users',
          'update_admin_users', 'delete_admin_users'
        ))
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_LEGACY_POLICY_REMAINS';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'admin_users'
      AND policy_info.policyname = 'member_master_admin_users_self_or_super_select'
      AND policy_info.cmd = 'SELECT'
      AND policy_info.roles && ARRAY['authenticated']::name[]
      AND policy_info.qual ILIKE '%user_id%'
      AND policy_info.qual ILIKE '%auth.uid%'
      AND policy_info.qual ILIKE '%member_master_is_super_admin%'
  ) OR EXISTS (
    SELECT 1 FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'admin_users'
      AND policy_info.cmd = 'SELECT'
      AND policy_info.roles && ARRAY['public', 'authenticated']::name[]
      AND policy_info.policyname <> 'member_master_admin_users_self_or_super_select'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_ADMIN_LOGIN_POLICY_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'legacy_members'
      AND policy_info.policyname = 'member_master_legacy_members_super_read'
      AND policy_info.cmd = 'SELECT'
      AND policy_info.qual ILIKE '%member_master_is_super_admin%'
  ) OR EXISTS (
    SELECT 1 FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'legacy_members'
      AND policy_info.cmd = 'SELECT'
      AND policy_info.roles && ARRAY['public', 'authenticated']::name[]
      AND policy_info.policyname <> 'member_master_legacy_members_super_read'
  ) OR EXISTS (
    SELECT 1 FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'legacy_members'
      AND policy_info.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND policy_info.roles && ARRAY['public', 'authenticated']::name[]
  ) OR has_table_privilege('authenticated', 'public.legacy_members', 'INSERT')
    OR has_table_privilege('authenticated', 'public.legacy_members', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.legacy_members', 'DELETE')
    OR NOT has_table_privilege('service_role', 'public.legacy_members', 'INSERT')
    OR NOT has_table_privilege('service_role', 'public.legacy_members', 'UPDATE')
    OR has_table_privilege('service_role', 'public.legacy_members', 'DELETE')
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_LEGACY_MUTATION_BOUNDARY_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'public.member_dynamic_stats'::regclass,
      'public.member_notes'::regclass,
      'public.mutual_reviews'::regclass,
      'public.activity_records'::regclass,
      'public.match_results'::regclass,
      'public.pair_relationships'::regclass,
      'public.match_sessions'::regclass,
      'public.match_round_submissions'::regclass,
      'public.player_feedback'::regclass,
      'public.script_play_records'::regclass,
      'public.staff_profiles'::regclass,
      'public.unmatched_diagnostics'::regclass,
      'public.legacy_members'::regclass
    ]) AS operational(table_oid)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_attribute AS attribute_info
      WHERE attribute_info.attrelid = operational.table_oid
        AND attribute_info.attname = 'audit_reason'
        AND NOT attribute_info.attisdropped
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_trigger AS trigger_info
      WHERE trigger_info.tgrelid = operational.table_oid
        AND trigger_info.tgname = 'member_master_capture_audit_reason'
        AND NOT trigger_info.tgisinternal
        AND pg_get_triggerdef(trigger_info.oid) ILIKE '%DELETE%'
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_trigger AS trigger_info
      WHERE trigger_info.tgrelid = operational.table_oid
        AND trigger_info.tgname = 'member_master_audit_related_change'
        AND NOT trigger_info.tgisinternal
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MEMBER_MASTER_OPERATION_REASON_GUARD_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'public.member_identity'::regclass,
      'public.member_language'::regclass,
      'public.member_interests'::regclass,
      'public.member_personality'::regclass,
      'public.member_boundaries'::regclass,
      'public.personality_quiz_results'::regclass,
      'public.member_verification'::regclass,
      'public.legacy_members'::regclass
    ]) AS dependent(table_oid)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_trigger AS trigger_info
      WHERE trigger_info.tgrelid = dependent.table_oid
        AND trigger_info.tgname = 'member_master_guard_anonymized_write'
        AND NOT trigger_info.tgisinternal
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MEMBER_MASTER_ANONYMIZATION_WRITE_LOCK_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'member_dynamic_stats'
      AND policy_info.policyname = 'member_master_dynamic_stats_admin_audited_write'
      AND policy_info.qual ILIKE '%member_master_is_super_admin%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'match_round_submissions'
      AND policy_info.policyname = 'member_master_round_submissions_admin_audited_write'
      AND policy_info.qual ILIKE '%member_master_is_super_admin%'
  ) OR EXISTS (
    SELECT 1 FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'match_round_submissions'
      AND policy_info.policyname = 'admin_all_submissions'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_SUPER_ONLY_OPERATION_POLICY_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'match_round_submissions'
      AND policy_info.policyname = 'member_master_round_submissions_active_self_read'
      AND policy_info.cmd = 'SELECT'
      AND policy_info.qual ILIKE '%account_status%active%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'match_round_submissions'
      AND policy_info.policyname = 'member_master_round_submissions_active_self_insert'
      AND policy_info.cmd = 'INSERT'
      AND policy_info.with_check ILIKE '%status%open%'
      AND policy_info.with_check ILIKE '%survey_start%'
      AND policy_info.with_check ILIKE '%survey_end%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'match_round_submissions'
      AND policy_info.policyname = 'member_master_round_submissions_active_self_update'
      AND policy_info.cmd = 'UPDATE'
      AND policy_info.qual ILIKE '%status%open%'
      AND policy_info.with_check ILIKE '%survey_end%'
  ) OR EXISTS (
    SELECT 1 FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'match_round_submissions'
      AND policy_info.policyname IN (
        'player_own_submissions',
        'member_master_round_submissions_active_self_delete'
      )
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger AS trigger_info
    WHERE trigger_info.tgrelid = 'public.match_round_submissions'::regclass
      AND trigger_info.tgname = 'member_master_guard_round_submission_write'
      AND NOT trigger_info.tgisinternal
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_SUBMISSION_SELF_WRITE_POLICY_INVALID';
  END IF;

  -- Ordinary administrators must not bypass the redacted RPCs with a direct
  -- PostgREST SELECT. The only authenticated table paths are active self-read
  -- (plus super-admin for the two high-risk tables).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'members'
      AND policy_info.policyname = 'member_master_members_admin_or_active_self_read'
      AND policy_info.cmd = 'SELECT'
      AND policy_info.roles && ARRAY['authenticated']::name[]
      AND policy_info.qual ILIKE '%member_master_is_super_admin%'
      AND policy_info.qual ILIKE '%account_status%active%'
  ) OR EXISTS (
    SELECT 1 FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'members'
      AND policy_info.cmd = 'SELECT'
      AND policy_info.roles && ARRAY['public', 'authenticated']::name[]
      AND policy_info.policyname <> 'member_master_members_admin_or_active_self_read'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_DIRECT_READ_POLICY_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'personality_quiz_results'
      AND policy_info.policyname = 'member_master_quiz_read_own_or_admin'
      AND policy_info.cmd = 'SELECT'
      AND policy_info.roles && ARRAY['authenticated']::name[]
      AND policy_info.qual ILIKE '%member_master_is_super_admin%'
      AND policy_info.qual ILIKE '%account_status%active%'
  ) OR EXISTS (
    SELECT 1 FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'personality_quiz_results'
      AND policy_info.cmd = 'SELECT'
      AND policy_info.roles && ARRAY['public', 'authenticated']::name[]
      AND policy_info.policyname <> 'member_master_quiz_read_own_or_admin'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_QUIZ_READ_POLICY_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.members AS member
    WHERE member.anonymized_at IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.script_play_records AS play_record
          WHERE play_record.member_id = member.id AND play_record.comment IS NOT NULL
        )
        OR EXISTS (
          SELECT 1 FROM public.unmatched_diagnostics AS diagnostic
          WHERE diagnostic.member_id = member.id
            AND COALESCE(diagnostic.details, '{}'::jsonb) <> '{}'::jsonb
        )
        OR EXISTS (
          SELECT 1 FROM public.match_results AS match
          WHERE (
            match.member_a_id = member.id OR match.member_b_id = member.id
            OR member.id = ANY(COALESCE(match.group_members, ARRAY[]::uuid[]))
          ) AND (
            match.cancellation_requested_by IS NOT NULL
            OR match.cancellation_reason IS NOT NULL
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.pair_relationships AS relationship
          WHERE (
            relationship.member_a_id = member.id
            AND (relationship.feedback_a IS NOT NULL OR relationship.notes IS NOT NULL)
          ) OR (
            relationship.member_b_id = member.id
            AND (relationship.feedback_b IS NOT NULL OR relationship.notes IS NOT NULL)
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.activity_records AS activity
          WHERE (
            member.id = ANY(COALESCE(activity.participant_ids, ARRAY[]::uuid[]))
            OR member.id = ANY(COALESCE(activity.late_member_ids, ARRAY[]::uuid[]))
            OR member.id = ANY(COALESCE(activity.no_show_member_ids, ARRAY[]::uuid[]))
          ) AND activity.notes IS NOT NULL
        )
        OR EXISTS (
          SELECT 1 FROM public.staff_profiles AS staff
          WHERE staff.member_id = member.id
            AND (staff.is_published OR staff.avatar_url IS NOT NULL)
        )
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MEMBER_MASTER_ANONYMIZATION_RESIDUAL_PII';
  END IF;
END
$do$;

COMMIT;
