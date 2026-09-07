-- Optional school information must not make a submitted identity incomplete.
-- Preserve the existing authorization, response shape, and function ACL.
-- New registrations have not consented to either preference until they answer.
-- Existing answers are preserved.
ALTER TABLE public.member_interests
  ALTER COLUMN accept_beginners SET DEFAULT NULL,
  ALTER COLUMN accept_cross_school SET DEFAULT NULL;
ALTER TABLE public.member_personality
  ALTER COLUMN extroversion SET DEFAULT NULL,
  ALTER COLUMN initiative SET DEFAULT NULL,
  ALTER COLUMN emotional_stability SET DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.get_my_profile_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id uuid;
  v_result jsonb;
BEGIN
  v_member_id := private.profile_current_approved_member_id();
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Approved player access is required';
  END IF;

  SELECT jsonb_build_object(
    'member_id', member.id,
    'member_number', member.member_number,
    'status', member.status,
    'email', member.email,
    'line_user_id', member.line_user_id,
    'full_name', identity.full_name,
    'gender', identity.gender,
    'nickname', identity.nickname,
    'school_name', identity.school_name,
    'department', identity.department,
    'personal_avatar_path', identity.personal_avatar_path,
    'level', COALESCE(metrics.member_level, 1),
    'compatibility_score', CASE
      WHEN metrics.compatibility_status = 'published' THEN metrics.compatibility_score
      ELSE NULL
    END,
    'compatibility_status', COALESCE(metrics.compatibility_status, 'pending'),
    'activity_count', COALESCE(stats.activity_count, 0),
    'last_activity_at', stats.last_activity_at,
    'community_profile_id', community.id,
    'community_avatar_kind', community.avatar_kind,
    'community_avatar_path', CASE
      WHEN community.avatar_kind = 'personal' THEN identity.personal_avatar_path
      ELSE community.avatar_path
    END,
    'community_preset_avatar', community.preset_avatar,
    'identity_complete', (
      identity.id IS NOT NULL
      AND NULLIF(btrim(identity.full_name), '') IS NOT NULL
      AND identity.gender IN ('male', 'female', 'other')
    ),
    'supplementary_complete', (
      EXISTS (
        SELECT 1
        FROM public.member_language AS language
        WHERE language.member_id = member.id
          AND cardinality(language.communication_language_pref) > 0
      )
      AND EXISTS (
        SELECT 1
        FROM public.member_interests AS interests
        WHERE interests.member_id = member.id
          AND NULLIF(btrim(interests.activity_frequency), '') IS NOT NULL
          AND interests.accept_beginners IS NOT NULL
          AND interests.accept_cross_school IS NOT NULL
      )
    ),
    'personality_complete', EXISTS (
      SELECT 1
      FROM public.member_personality AS personality
      WHERE personality.member_id = member.id
        AND personality.extroversion IS NOT NULL
        AND personality.initiative IS NOT NULL
        AND personality.emotional_stability IS NOT NULL
        AND personality.warmup_speed IS NOT NULL
        AND cardinality(personality.expression_style_tags) > 0
        AND cardinality(personality.group_role_tags) > 0
        AND personality.planning_style IS NOT NULL
        AND personality.coop_compete_tendency IS NOT NULL
        AND personality.boundary_strength IS NOT NULL
        AND personality.reply_speed IS NOT NULL
    ),
    'quiz_complete', EXISTS (
      SELECT 1
      FROM public.personality_quiz_results AS quiz
      WHERE quiz.member_id = member.id
        AND quiz.score_e IS NOT NULL
    )
  )
  INTO v_result
  FROM public.members AS member
  LEFT JOIN public.member_identity AS identity
    ON identity.member_id = member.id
  LEFT JOIN private.member_profile_metrics AS metrics
    ON metrics.member_id = member.id
  LEFT JOIN public.member_dynamic_stats AS stats
    ON stats.member_id = member.id
  LEFT JOIN private.community_profile_members AS mapping
    ON mapping.member_id = member.id
  LEFT JOIN public.community_profiles AS community
    ON community.id = mapping.profile_id
  WHERE member.id = v_member_id;

  RETURN v_result;
END;
$$;

-- Save both supplementary sections atomically under the canonical authenticated member.
CREATE OR REPLACE FUNCTION public.save_my_supplementary(p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid;
  v_key text;
  v_value jsonb;
  v_allowed text[];
  v_keys constant text[] := ARRAY[
    'activity_area', 'nearest_station', 'graduation_year',
    'communication_language_pref', 'japanese_level',
    'game_type_pref', 'scenario_mode_pref', 'scenario_theme_tags',
    'ideal_group_size', 'script_preference', 'non_script_preference',
    'activity_frequency', 'preferred_time_slots', 'budget_range', 'travel_radius',
    'social_goal_primary', 'social_goal_secondary', 'accept_beginners', 'accept_cross_school'
  ];
  v_language public.member_language%ROWTYPE;
  v_interests public.member_interests%ROWTYPE;
BEGIN
  v_member_id := private.profile_current_approved_member_id();
  IF v_member_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.members
    WHERE id = v_member_id AND membership_type = 'player' AND record_scope = 'current'
  ) THEN
    RAISE EXCEPTION 'Player access is required' USING ERRCODE = '42501';
  END IF;

  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' OR pg_column_size(p_data) > 16384 THEN
    RAISE EXCEPTION 'Invalid supplementary payload' USING ERRCODE = '22023';
  END IF;
  IF NOT (p_data ?& v_keys) OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_data) AS field(key) WHERE NOT (field.key = ANY(v_keys))
  ) THEN
    RAISE EXCEPTION 'Invalid supplementary fields' USING ERRCODE = '22023';
  END IF;

  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_data) LOOP
    v_allowed := CASE v_key
      WHEN 'activity_area' THEN ARRAY['新宿/渋谷', '池袋', '上野/秋葉原', '品川/目黒', '六本木/赤坂', '横浜', '千葉', 'さいたま', '其他']
      WHEN 'japanese_level' THEN ARRAY['N1', 'N2', 'N3', 'N4', 'N5', '无证书但能日常交流', '不会日语']
      WHEN 'game_type_pref' THEN ARRAY['双人本优先', '多人本优先', '都可以', '看活动而定']
      WHEN 'ideal_group_size' THEN ARRAY['2人', '3-4人', '4-5人', '6-7人', '8-10人', '10人以上', '都可以']
      WHEN 'activity_frequency' THEN ARRAY['每周1次以上', '每周1次', '每两周1次', '每月1次', '不固定']
      WHEN 'budget_range' THEN ARRAY['~2000円', '2000~4000円', '4000~6000円', '6000円以上', '无所谓']
      WHEN 'travel_radius' THEN ARRAY['30分钟以内', '1小时以内', '1~2小时', '都可以']
      WHEN 'social_goal_primary' THEN ARRAY['认识新朋友', '找固定玩伴', '练习日语', '体验文化', '打发时间', '拓展社交圈', '找双人搭子', '找剧本杀搭子', '找旅行搭子']
      WHEN 'social_goal_secondary' THEN ARRAY['认识新朋友', '找固定玩伴', '练习日语', '体验文化', '打发时间', '拓展社交圈', '找双人搭子', '找剧本杀搭子', '找旅行搭子']
      WHEN 'communication_language_pref' THEN ARRAY['中文', '日语', '英语']
      WHEN 'scenario_mode_pref' THEN ARRAY['推理本', '情感本', '恐怖本', '欢乐本', '机制本', '阵营本', '沉浸本']
      WHEN 'scenario_theme_tags' THEN ARRAY['情感', '推理', '机制', '恐怖', '欢乐', '沉浸', '硬核', '新手友好']
      WHEN 'script_preference' THEN ARRAY['新本', '经典本', '城限本', '独家本', '都可以']
      WHEN 'non_script_preference' THEN ARRAY['桌游', '聚餐', 'KTV', '运动', '旅行', '展览', '读书会', '其他']
      WHEN 'preferred_time_slots' THEN ARRAY['工作日白天', '工作日晚间', '周五晚', '周六白天', '周六晚', '周日白天', '周日晚', '节假日', '临时约也可']
      ELSE NULL
    END;

    IF v_key IN ('communication_language_pref', 'scenario_mode_pref', 'scenario_theme_tags',
      'script_preference', 'non_script_preference', 'preferred_time_slots') THEN
      IF jsonb_typeof(v_value) <> 'array' THEN
        RAISE EXCEPTION 'Invalid supplementary selection: %', v_key USING ERRCODE = '22023';
      END IF;
      IF jsonb_array_length(v_value) > cardinality(v_allowed) OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_value) AS entry(value)
        WHERE jsonb_typeof(entry.value) <> 'string' OR NOT ((entry.value #>> '{}') = ANY(v_allowed))
      ) OR (SELECT count(*) <> count(DISTINCT entry.value)
        FROM jsonb_array_elements(v_value) AS entry(value)) THEN
        RAISE EXCEPTION 'Invalid supplementary selection: %', v_key USING ERRCODE = '22023';
      END IF;
    ELSIF v_key IN ('accept_beginners', 'accept_cross_school') THEN
      IF jsonb_typeof(v_value) NOT IN ('boolean', 'null') THEN
        RAISE EXCEPTION 'Invalid supplementary preference: %', v_key USING ERRCODE = '22023';
      END IF;
    ELSIF v_key = 'graduation_year' THEN
      IF jsonb_typeof(v_value) <> 'null' THEN
        IF jsonb_typeof(v_value) <> 'number' THEN
          RAISE EXCEPTION 'Invalid graduation year' USING ERRCODE = '22023';
        END IF;
        IF (v_value #>> '{}')::numeric <> trunc((v_value #>> '{}')::numeric)
          OR (v_value #>> '{}')::numeric NOT BETWEEN 1900 AND 2100 THEN
          RAISE EXCEPTION 'Invalid graduation year' USING ERRCODE = '22023';
        END IF;
      END IF;
    ELSIF v_key = 'nearest_station' THEN
      IF jsonb_typeof(v_value) <> 'string' OR char_length(btrim(v_value #>> '{}')) > 100 THEN
        RAISE EXCEPTION 'Invalid nearest station' USING ERRCODE = '22023';
      END IF;
    ELSE
      IF jsonb_typeof(v_value) <> 'string'
        OR ((v_value #>> '{}') <> '' AND NOT ((v_value #>> '{}') = ANY(v_allowed))) THEN
        RAISE EXCEPTION 'Invalid supplementary option: %', v_key USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  SELECT * INTO v_language FROM jsonb_populate_record(NULL::public.member_language, p_data);
  SELECT * INTO v_interests FROM jsonb_populate_record(NULL::public.member_interests, p_data);

  INSERT INTO public.member_language (member_id, communication_language_pref, japanese_level)
  VALUES (v_member_id, v_language.communication_language_pref, NULLIF(v_language.japanese_level, ''))
  ON CONFLICT (member_id) DO UPDATE SET
    communication_language_pref = EXCLUDED.communication_language_pref,
    japanese_level = EXCLUDED.japanese_level;

  INSERT INTO public.member_interests (
    member_id, activity_area, nearest_station, graduation_year, game_type_pref,
    scenario_mode_pref, scenario_theme_tags, ideal_group_size, script_preference,
    non_script_preference, activity_frequency, preferred_time_slots, budget_range,
    travel_radius, social_goal_primary, social_goal_secondary, accept_beginners, accept_cross_school
  ) VALUES (
    v_member_id, NULLIF(v_interests.activity_area, ''), NULLIF(btrim(v_interests.nearest_station), ''),
    v_interests.graduation_year, NULLIF(v_interests.game_type_pref, ''),
    v_interests.scenario_mode_pref, v_interests.scenario_theme_tags, NULLIF(v_interests.ideal_group_size, ''),
    v_interests.script_preference, v_interests.non_script_preference, NULLIF(v_interests.activity_frequency, ''),
    v_interests.preferred_time_slots, NULLIF(v_interests.budget_range, ''), NULLIF(v_interests.travel_radius, ''),
    NULLIF(v_interests.social_goal_primary, ''), NULLIF(v_interests.social_goal_secondary, ''),
    v_interests.accept_beginners, v_interests.accept_cross_school
  )
  ON CONFLICT (member_id) DO UPDATE SET
    activity_area = EXCLUDED.activity_area,
    nearest_station = EXCLUDED.nearest_station,
    graduation_year = EXCLUDED.graduation_year,
    game_type_pref = EXCLUDED.game_type_pref,
    scenario_mode_pref = EXCLUDED.scenario_mode_pref,
    scenario_theme_tags = EXCLUDED.scenario_theme_tags,
    ideal_group_size = EXCLUDED.ideal_group_size,
    script_preference = EXCLUDED.script_preference,
    non_script_preference = EXCLUDED.non_script_preference,
    activity_frequency = EXCLUDED.activity_frequency,
    preferred_time_slots = EXCLUDED.preferred_time_slots,
    budget_range = EXCLUDED.budget_range,
    travel_radius = EXCLUDED.travel_radius,
    social_goal_primary = EXCLUDED.social_goal_primary,
    social_goal_secondary = EXCLUDED.social_goal_secondary,
    accept_beginners = EXCLUDED.accept_beginners,
    accept_cross_school = EXCLUDED.accept_cross_school;

  RETURN v_member_id;
END
$function$;

REVOKE ALL ON FUNCTION public.save_my_supplementary(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_my_supplementary(jsonb) TO authenticated;

-- A prematurely approved registration cannot be completed by the player because
-- onboarding writes lock at approval. Enforce the submission gate for current
-- online registrations, including the Admin advanced-edit route.
CREATE OR REPLACE FUNCTION private.player_profile_require_submission_before_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved'
     AND OLD.record_scope = 'current' AND OLD.record_source IN ('app', 'line')
     AND OLD.profile_stage <> 'complete' THEN
    IF OLD.profile_stage <> 'submitted' OR OLD.onboarding_step <> 4 OR NOT EXISTS (
      SELECT 1 FROM public.member_identity AS identity
      WHERE identity.member_id = OLD.id
        AND NULLIF(btrim(identity.full_name), '') IS NOT NULL
        AND identity.gender IN ('male', 'female', 'other')
        AND NULLIF(btrim(identity.age_range), '') IS NOT NULL
        AND NULLIF(btrim(identity.nationality), '') IS NOT NULL
        AND NULLIF(btrim(identity.current_city), '') IS NOT NULL
        AND COALESCE(cardinality(identity.hobby_tags), 0) > 0
        AND COALESCE(cardinality(identity.activity_type_tags), 0) > 0
        AND COALESCE(cardinality(identity.personality_self_tags), 0) > 0
    ) THEN
      RAISE EXCEPTION 'MEMBER_PROFILE_SUBMISSION_REQUIRED' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION private.player_profile_require_submission_before_approval()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER player_profile_require_submission_before_approval
BEFORE UPDATE OF status ON public.members
FOR EACH ROW EXECUTE FUNCTION private.player_profile_require_submission_before_approval();
