-- Historical empty or whitespace-only choices are unanswered self-assessment fields.
-- Preserve the summary response, authorization helper and existing function ACL.
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
        AND NULLIF(btrim(personality.warmup_speed), '') IS NOT NULL
        AND cardinality(personality.expression_style_tags) > 0
        AND cardinality(personality.group_role_tags) > 0
        AND NULLIF(btrim(personality.planning_style), '') IS NOT NULL
        AND NULLIF(btrim(personality.coop_compete_tendency), '') IS NOT NULL
        AND NULLIF(btrim(personality.boundary_strength), '') IS NOT NULL
        AND NULLIF(btrim(personality.reply_speed), '') IS NOT NULL
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
