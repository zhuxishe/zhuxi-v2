-- Matching registration requires a completed, valid profile on the member's bound versions.
-- Read-only readiness never starts a questionnaire, changes answers, or adopts a newer version.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

-- A server-side completion receipt for the legacy supplementary save RPC. It is
-- needed while versioned templates are not initialized and all questions are optional.
CREATE TABLE private.matching_legacy_supplementary_completions (
  member_id uuid PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.matching_legacy_supplementary_completions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.matching_legacy_supplementary_completions FROM PUBLIC, anon, authenticated, service_role;

DO $migration$
DECLARE definition text := pg_get_functiondef('public.save_my_supplementary(jsonb)'::regprocedure);
  original text := '  RETURN v_member_id;';
BEGIN
  IF position(original IN definition)=0 THEN RAISE EXCEPTION 'MATCHING_SUPPLEMENTARY_SAVE_BASELINE_MISMATCH'; END IF;
  EXECUTE replace(definition, original, $patch$
  INSERT INTO private.matching_legacy_supplementary_completions(member_id, completed_at)
    VALUES(v_member_id, now()) ON CONFLICT(member_id) DO UPDATE SET completed_at=EXCLUDED.completed_at;
  RETURN v_member_id;$patch$);
END;
$migration$;

-- Remove the receipt along with questionnaire snapshots during the existing anonymization flow.
DO $migration$
DECLARE definition text := pg_get_functiondef('private.questionnaire_erase_anonymized()'::regprocedure);
  original text := 'DELETE FROM public.questionnaire_responses WHERE member_id=NEW.id;';
BEGIN
  IF position(original IN definition)=0 THEN RAISE EXCEPTION 'MATCHING_QUESTIONNAIRE_ERASURE_BASELINE_MISMATCH'; END IF;
  EXECUTE replace(definition, original, original || ' DELETE FROM private.matching_legacy_supplementary_completions WHERE member_id=NEW.id;');
END;
$migration$;

CREATE FUNCTION private.matching_required_answers_valid(p_template jsonb, p_answers jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = '' AS $function$
DECLARE required_template jsonb; required_answers jsonb;
BEGIN
  IF p_template IS NULL OR jsonb_typeof(p_answers) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  -- Completion concerns active required questions. Optional/retired legacy answers remain intact.
  required_template := jsonb_set(p_template, '{questions}', COALESCE((
    SELECT jsonb_agg(q) FROM jsonb_array_elements(p_template->'questions') q
    WHERE (q->>'active')::boolean AND (q->>'required')::boolean
  ), '[]'::jsonb));
  SELECT COALESCE(jsonb_object_agg(a.key, a.value), '{}') INTO required_answers
  FROM jsonb_each(p_answers) a WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements(required_template->'questions') q WHERE q->>'id'=a.key
  );
  -- Do not grandfather an unknown required option just because it was saved historically.
  PERFORM private.questionnaire_validate_answers(required_template, required_answers, NULL, true, '{}');
  RETURN true;
EXCEPTION WHEN data_exception OR integrity_constraint_violation THEN RETURN false;
END;
$function$;

CREATE FUNCTION private.matching_legacy_answer_evidence(p_kind text, p_answers jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $function$
  SELECT EXISTS (
    SELECT 1 FROM jsonb_each(COALESCE(p_answers, '{}')) a
    WHERE a.value NOT IN ('null'::jsonb, '""'::jsonb, '[]'::jsonb, '{}'::jsonb)
      AND (jsonb_typeof(a.value)<>'string' OR btrim(a.value#>>'{}')<>'')
      AND NOT (p_kind='supplementary' AND a.key IN ('accept_beginners','accept_cross_school') AND a.value='true'::jsonb)
      AND NOT (p_kind='personality' AND a.key IN ('extroversion','initiative','emotional_stability') AND a.value='3'::jsonb)
  )
$function$;

-- Match questionnaire_get's canonical-profile refresh without changing a response,
-- revision, assignment or completion timestamp. Quiz history is immutable evidence.
CREATE FUNCTION private.matching_current_profile_answers(p_member_id uuid, p_kind text, p_template jsonb, p_answers jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE canonical_profile jsonb; legacy jsonb; merged jsonb := p_answers;
  question jsonb; profile_value jsonb; answer_value jsonb;
BEGIN
  IF p_kind NOT IN ('supplementary','personality') THEN RETURN p_answers; END IF;
  legacy := private.questionnaire_legacy(p_member_id, p_kind, p_template);
  IF p_kind='supplementary' THEN
    SELECT COALESCE((SELECT to_jsonb(i) FROM public.member_interests i WHERE i.member_id=p_member_id),'{}'::jsonb)
      || COALESCE((SELECT to_jsonb(l) FROM public.member_language l WHERE l.member_id=p_member_id),'{}'::jsonb)
      INTO canonical_profile;
  ELSE
    SELECT to_jsonb(p) INTO canonical_profile FROM public.member_personality p WHERE p.member_id=p_member_id;
  END IF;
  FOR question IN SELECT value FROM jsonb_array_elements(p_template->'questions')
    WHERE (value->>'active')::boolean AND value ? 'builtinField'
  LOOP
    answer_value := merged->(question->>'id');
    IF (answer_value IS NOT NULL AND answer_value NOT IN ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb))
      OR (p_kind='supplementary' AND question->>'builtinField' IN ('accept_beginners','accept_cross_school')
        AND merged ? (question->>'id')) THEN
      profile_value := COALESCE(canonical_profile->(question->>'builtinField'),'null'::jsonb);
    ELSE
      -- Do not treat an untouched database DEFAULT true/3 as a confirmed answer.
      IF (p_kind='personality' AND question->>'builtinField' IN ('extroversion','initiative','emotional_stability')
          AND canonical_profile->(question->>'builtinField')='3'::jsonb)
        OR (p_kind='supplementary' AND question->>'builtinField' IN ('accept_beginners','accept_cross_school')
          AND canonical_profile->(question->>'builtinField')='true'::jsonb) THEN CONTINUE; END IF;
      profile_value := COALESCE(legacy#>ARRAY['answers',question->>'id'],'null'::jsonb);
    END IF;
    IF profile_value IN ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb)
      AND (answer_value IS NULL OR answer_value IN ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb)) THEN CONTINUE; END IF;
    IF profile_value IS DISTINCT FROM answer_value THEN
      merged := jsonb_set(merged,ARRAY[question->>'id'],profile_value,true);
    END IF;
  END LOOP;
  RETURN merged;
END;
$function$;

CREATE FUNCTION private.matching_questionnaire_complete(p_member_id uuid, p_kind text)
RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE response record; baseline jsonb; legacy jsonb; assigned boolean; effective_answers jsonb;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.questionnaire_assignments WHERE member_id=p_member_id AND kind=p_kind) INTO assigned;
  -- Only the assigned response counts for editable profiles. A quiz retake may retain an
  -- earlier valid completed result, even while the newest session remains a draft.
  FOR response IN
    SELECT r.*, v.template FROM public.questionnaire_responses r
    JOIN public.questionnaire_versions v ON v.id=r.version_id AND v.kind=r.kind
    WHERE r.member_id=p_member_id AND r.kind=p_kind AND r.completed_at IS NOT NULL
      AND (p_kind='quiz' OR EXISTS(SELECT 1 FROM public.questionnaire_assignments a WHERE a.response_id=r.id))
    ORDER BY r.completed_at DESC
  LOOP
    effective_answers := private.matching_current_profile_answers(p_member_id, p_kind, response.template, response.answers);
    IF (NOT response.legacy_imported OR response.completed_at > response.created_at
        OR private.matching_legacy_answer_evidence(p_kind, response.answers)
        OR (p_kind='supplementary' AND EXISTS(SELECT 1 FROM private.matching_legacy_supplementary_completions WHERE member_id=p_member_id)))
      AND private.matching_required_answers_valid(response.template, effective_answers) THEN RETURN true; END IF;
  END LOOP;
  IF assigned THEN RETURN false; END IF;
  -- Legacy members may not have opened a versioned page yet. Use the trusted baseline
  -- (including the initialized legacy quiz configuration), never current published changes.
  SELECT COALESCE(v.template, private.questionnaire_trusted_baseline(p_kind)) INTO baseline
  FROM private.questionnaire_baseline_definitions b
  LEFT JOIN public.questionnaire_templates t ON t.kind=b.kind
  LEFT JOIN public.questionnaire_versions v ON v.id=t.baseline_version_id
  WHERE b.kind=p_kind;
  IF baseline IS NULL THEN RETURN false; END IF;
  legacy := private.questionnaire_legacy(p_member_id, p_kind, baseline);
  RETURN COALESCE((legacy->>'completed')::boolean, false)
    AND (private.matching_legacy_answer_evidence(p_kind, legacy->'answers')
      OR (p_kind='supplementary' AND EXISTS(SELECT 1 FROM private.matching_legacy_supplementary_completions WHERE member_id=p_member_id)))
    AND private.matching_required_answers_valid(baseline, legacy->'answers');
END;
$function$;

CREATE FUNCTION private.member_matching_readiness(p_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE result jsonb := '{}'; missing jsonb := '[]'; kind text; done boolean;
BEGIN
  FOREACH kind IN ARRAY ARRAY['supplementary','personality','quiz'] LOOP
    done := private.matching_questionnaire_complete(p_member_id, kind);
    result := result || jsonb_build_object(kind, done);
    IF NOT done THEN missing := missing || to_jsonb(kind); END IF;
  END LOOP;
  RETURN result || jsonb_build_object('missing', missing);
END;
$function$;

CREATE FUNCTION public.get_my_matching_readiness()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE member_id uuid;
BEGIN
  SELECT m.id INTO member_id FROM public.members m WHERE m.user_id=auth.uid()
    AND m.status='approved' AND m.account_status='active' AND m.membership_type='player'
    AND m.record_scope='current' AND m.anonymized_at IS NULL;
  IF member_id IS NULL THEN RAISE EXCEPTION 'MATCHING_PLAYER_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN private.member_matching_readiness(member_id);
END;
$function$;

CREATE FUNCTION public.get_member_matching_readiness(p_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT private.member_master_is_admin() THEN
    RAISE EXCEPTION 'MATCHING_ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.members WHERE id=p_member_id) THEN
    RAISE EXCEPTION 'MATCHING_MEMBER_NOT_FOUND' USING ERRCODE='22023';
  END IF;
  RETURN private.member_matching_readiness(p_member_id);
END;
$function$;

-- Distinguish an explicit empty completion from a historical row imported automatically.
-- No historical answer rows are rewritten. Prior completed_at > created_at remains evidence
-- of an explicit save before this migration; future saves record it unambiguously.
DO $migration$
DECLARE definition text := pg_get_functiondef('private.questionnaire_save(text,uuid,jsonb,smallint,boolean,integer)'::regprocedure);
  original text := 'completed_at=CASE WHEN p_complete THEN now() ELSE completed_at END,result_snapshot=';
BEGIN
  IF position(original IN definition)=0 THEN RAISE EXCEPTION 'MATCHING_QUESTIONNAIRE_SAVE_BASELINE_MISMATCH'; END IF;
  EXECUTE replace(definition, original, 'completed_at=CASE WHEN p_complete THEN now() ELSE completed_at END,legacy_imported=CASE WHEN p_complete THEN false ELSE legacy_imported END,result_snapshot=');
END;
$migration$;

CREATE FUNCTION private.guard_matching_profile_readiness()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE purpose text; readiness jsonb;
BEGIN
  -- Historical Excel import uses the server-only service-role client, including compensation.
  -- PostgreSQL checks SET ROLE privileges: neither answers/import_metadata nor custom GUCs
  -- nor a caller-controlled JWT claim can impersonate this database execution role.
  IF current_setting('role', true)='service_role' THEN RETURN NEW; END IF;
  SELECT r.purpose INTO purpose FROM public.match_rounds r WHERE r.id=NEW.round_id FOR SHARE;
  IF purpose IS DISTINCT FROM 'matching' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN
    -- Cancellation/maintenance with identical answers is allowed; restoring an active
    -- submission or changing its owner, round, or answer content must satisfy readiness.
    IF NEW.round_id IS NOT DISTINCT FROM OLD.round_id AND NEW.member_id IS NOT DISTINCT FROM OLD.member_id
      AND (to_jsonb(NEW) - ARRAY['cancelled_at','updated_at','config_revision','audit_reason'])
        IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['cancelled_at','updated_at','config_revision','audit_reason'])
      AND NOT (OLD.cancelled_at IS NOT NULL AND NEW.cancelled_at IS NULL) THEN RETURN NEW; END IF;
  END IF;
  -- The questionnaire writer locks this same row, keeping a registration check serialized
  -- with saves and account privacy changes. Closed/anonymized data scrubs remain possible.
  PERFORM 1 FROM public.members m WHERE m.id=NEW.member_id FOR UPDATE;
  IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.members m WHERE m.id=NEW.member_id
    AND (m.account_status='closed' OR m.anonymized_at IS NOT NULL)) THEN RETURN NEW; END IF;
  readiness := private.member_matching_readiness(NEW.member_id);
  IF jsonb_array_length(readiness->'missing')>0 THEN
    RAISE EXCEPTION 'MATCHING_PROFILE_INCOMPLETE' USING ERRCODE='23514', DETAIL=readiness::text;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER matching_profile_readiness_guard
  BEFORE INSERT OR UPDATE ON public.match_round_submissions
  FOR EACH ROW EXECUTE FUNCTION private.guard_matching_profile_readiness();

REVOKE ALL ON FUNCTION private.matching_required_answers_valid(jsonb,jsonb),
  private.matching_legacy_answer_evidence(text,jsonb), private.matching_questionnaire_complete(uuid,text),
  private.matching_current_profile_answers(uuid,text,jsonb,jsonb),
  private.member_matching_readiness(uuid), private.guard_matching_profile_readiness()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_matching_readiness(), public.get_member_matching_readiness(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_matching_readiness(), public.get_member_matching_readiness(uuid) TO authenticated;

-- Preserve every existing profile field and authorization; change only the three completion flags.
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
  v_readiness jsonb;
BEGIN
  v_member_id := private.profile_current_approved_member_id();
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Approved player access is required';
  END IF;

  v_readiness := private.member_matching_readiness(v_member_id);

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
    'supplementary_complete', (v_readiness->>'supplementary')::boolean,
    'personality_complete', (v_readiness->>'personality')::boolean,
    'quiz_complete', (v_readiness->>'quiz')::boolean
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

COMMIT;
