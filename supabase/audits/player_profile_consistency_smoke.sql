-- Run after all three profile-consistency migrations in the isolated Preview project.
-- Every fixture, approval, answer, and forced-failure trigger rolls back.
BEGIN;
SELECT set_config('audit.profile_user', gen_random_uuid()::text, true);
INSERT INTO auth.users (id, email, aud, role, email_confirmed_at, raw_app_meta_data)
VALUES (current_setting('audit.profile_user')::uuid,
  'profile-rollback-' || current_setting('audit.profile_user') || '@example.invalid',
  'authenticated', 'authenticated', now(), '{"provider":"email","providers":["email"]}');
SELECT set_config('request.jwt.claim.sub', current_setting('audit.profile_user'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_first jsonb; v_second jsonb;
BEGIN
  v_first := public.ensure_my_member_record();
  v_second := public.ensure_my_member_record();
  IF v_first->>'member_id' IS DISTINCT FROM v_second->>'member_id' THEN
    RAISE EXCEPTION 'Repeated entry created another member';
  END IF;
  PERFORM set_config('audit.profile_member', v_first->>'member_id', true);
  PERFORM public.save_my_onboarding_step(1::smallint,
    '{"full_name":"Profile rollback verification","nickname":null,"gender":"other","age_range":"23-25","nationality":"测试","current_city":"东京"}');
END $test$;
RESET ROLE;
DO $test$
BEGIN
  BEGIN
    UPDATE public.members SET status = 'approved', membership_type = 'player'
    WHERE id = current_setting('audit.profile_member')::uuid;
    RAISE EXCEPTION 'Draft was incorrectly approved';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'MEMBER_PROFILE_SUBMISSION_REQUIRED' THEN RAISE; END IF;
  END;
END $test$;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_submitted jsonb;
BEGIN
  PERFORM public.save_my_onboarding_step(2::smallint,
    '{"school_name":null,"department":null,"degree_level":null,"course_language":null,"enrollment_year":null}');
  PERFORM public.save_my_onboarding_step(3::smallint,
    '{"hobby_tags":["桌游"],"activity_type_tags":["桌游"]}');
  PERFORM public.save_my_onboarding_step(4::smallint,
    '{"personality_self_tags":["慢热"],"taboo_tags":[]}');
  v_submitted := public.submit_my_onboarding();
  IF v_submitted->>'profile_stage' <> 'submitted' THEN RAISE EXCEPTION 'Submission lost'; END IF;
  IF (SELECT count(*) FROM public.member_identity WHERE member_id = current_setting('audit.profile_member')::uuid) <> 1 THEN
    RAISE EXCEPTION 'Identity is not readable by its pending owner';
  END IF;
  BEGIN
    PERFORM public.save_my_supplementary('{}');
    RAISE EXCEPTION 'Pending member wrote approved-only supplementary data';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $test$;
RESET ROLE;
UPDATE public.members SET status = 'approved', membership_type = 'player'
WHERE id = current_setting('audit.profile_member')::uuid;
SELECT set_config('audit.profile_payload', '{"activity_area":"新宿/渋谷","nearest_station":"测试駅","graduation_year":2027,"communication_language_pref":["中文","日语"],"japanese_level":"N2","game_type_pref":"都可以","scenario_mode_pref":["推理本"],"scenario_theme_tags":["新手友好"],"ideal_group_size":"3-4人","script_preference":["经典本"],"non_script_preference":["桌游"],"activity_frequency":"每月1次","preferred_time_slots":["周六白天"],"budget_range":"2000~4000円","travel_radius":"1小时以内","social_goal_primary":"认识新朋友","social_goal_secondary":"练习日语","accept_beginners":false,"accept_cross_school":true}', true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_id uuid; v_summary jsonb;
BEGIN
  v_id := public.save_my_supplementary(current_setting('audit.profile_payload')::jsonb);
  IF v_id <> current_setting('audit.profile_member')::uuid THEN RAISE EXCEPTION 'Incorrect owner'; END IF;
  v_summary := public.get_my_profile_summary();
  IF NOT (v_summary->>'identity_complete')::boolean THEN RAISE EXCEPTION 'Optional school blocks completion'; END IF;
  IF NOT (v_summary->>'supplementary_complete')::boolean THEN RAISE EXCEPTION 'Supplementary not complete'; END IF;
  IF (v_summary->>'personality_complete')::boolean THEN RAISE EXCEPTION 'Unanswered assessment looks completed'; END IF;
  IF (SELECT accept_beginners FROM public.member_interests WHERE member_id = v_id) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Explicit false was lost';
  END IF;
  IF (SELECT communication_language_pref FROM public.member_language WHERE member_id = v_id) IS DISTINCT FROM ARRAY['中文','日语'] THEN
    RAISE EXCEPTION 'Language answers were lost';
  END IF;
  IF (SELECT hobby_tags FROM public.member_identity WHERE member_id = v_id) IS DISTINCT FROM ARRAY['桌游'] THEN
    RAISE EXCEPTION 'Supplementary overwrote registration';
  END IF;
  BEGIN
    PERFORM public.save_my_supplementary(current_setting('audit.profile_payload')::jsonb || '{"member_id":"00000000-0000-0000-0000-000000000000"}');
    RAISE EXCEPTION 'Client-selected owner accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $test$;
RESET ROLE;

-- A historical empty string is not an answer, even when the other nine are filled.
SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  v_member_id uuid := current_setting('audit.profile_member')::uuid;
  v_field text;
  v_blank text;
  v_answer text;
  v_summary jsonb;
BEGIN
  INSERT INTO public.member_personality (
    member_id, extroversion, initiative, emotional_stability,
    expression_style_tags, group_role_tags, warmup_speed,
    planning_style, coop_compete_tendency, boundary_strength, reply_speed
  ) VALUES (
    v_member_id, 3, 4, 4, ARRAY['幽默'], ARRAY['组织者'], '快速熟络',
    '计划型', '偏合作', '适中', '当天'
  )
  ON CONFLICT (member_id) DO UPDATE SET
    extroversion = EXCLUDED.extroversion,
    initiative = EXCLUDED.initiative,
    emotional_stability = EXCLUDED.emotional_stability,
    expression_style_tags = EXCLUDED.expression_style_tags,
    group_role_tags = EXCLUDED.group_role_tags,
    warmup_speed = EXCLUDED.warmup_speed,
    planning_style = EXCLUDED.planning_style,
    coop_compete_tendency = EXCLUDED.coop_compete_tendency,
    boundary_strength = EXCLUDED.boundary_strength,
    reply_speed = EXCLUDED.reply_speed;

  v_summary := public.get_my_profile_summary();
  IF (v_summary->>'personality_complete')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Complete self-assessment was not recognized';
  END IF;

  FOREACH v_field IN ARRAY ARRAY[
    'warmup_speed', 'planning_style', 'coop_compete_tendency', 'boundary_strength', 'reply_speed'
  ] LOOP
    SELECT to_jsonb(personality)->>v_field INTO v_answer
    FROM public.member_personality AS personality WHERE member_id = v_member_id;
    FOREACH v_blank IN ARRAY ARRAY['', '   '] LOOP
      EXECUTE format('UPDATE public.member_personality SET %I = $1 WHERE member_id = $2', v_field)
        USING v_blank, v_member_id;
      v_summary := public.get_my_profile_summary();
      IF (v_summary->>'personality_complete')::boolean IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'Blank historical self-assessment answer counted as complete: %', v_field;
      END IF;
    END LOOP;
    EXECUTE format('UPDATE public.member_personality SET %I = $1 WHERE member_id = $2', v_field)
      USING v_answer, v_member_id;
  END LOOP;

  v_summary := public.get_my_profile_summary();
  IF (v_summary->>'personality_complete')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Restoring the historical answer did not restore completeness';
  END IF;
END $test$;
RESET ROLE;

-- Force the SECOND table write to fail after the language upsert.
CREATE FUNCTION pg_temp.fail_profile_interest_probe() RETURNS trigger LANGUAGE plpgsql AS $probe$
BEGIN
  IF NEW.member_id::text = current_setting('audit.profile_member', true)
     AND NEW.nearest_station = 'ROLLBACK_PROBE' THEN
    RAISE EXCEPTION 'PROFILE_ATOMICITY_PROBE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $probe$;
CREATE TRIGGER profile_atomicity_probe BEFORE INSERT OR UPDATE ON public.member_interests
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_profile_interest_probe();
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  BEGIN
    PERFORM public.save_my_supplementary(current_setting('audit.profile_payload')::jsonb
      || '{"communication_language_pref":["英语"],"nearest_station":"ROLLBACK_PROBE"}');
    RAISE EXCEPTION 'Failure probe did not execute';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PROFILE_ATOMICITY_PROBE' THEN RAISE; END IF;
  END;
  IF (SELECT communication_language_pref FROM public.member_language
      WHERE member_id = current_setting('audit.profile_member')::uuid) IS DISTINCT FROM ARRAY['中文','日语'] THEN
    RAISE EXCEPTION 'Language update survived failed interests update';
  END IF;
END $test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM public.member_identity WHERE member_id = current_setting('audit.profile_member')::uuid) THEN
    RAISE EXCEPTION 'Another user can read the fixture identity';
  END IF;
  BEGIN
    PERFORM public.save_my_supplementary(current_setting('audit.profile_payload')::jsonb);
    RAISE EXCEPTION 'An unbound user can write';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $test$;
RESET ROLE;
DO $test$
BEGIN
  IF has_function_privilege('anon', 'public.save_my_supplementary(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous RPC privilege';
  END IF;
  IF has_function_privilege('authenticated', 'private.player_profile_require_submission_before_approval()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Approval trigger executable directly';
  END IF;
END $test$;
SELECT 'PASS: identity, draft/submit, approval gate, exact ownership, school optional, values, historical blank answers, atomic rollback and ACL/RLS' AS result;
ROLLBACK;
