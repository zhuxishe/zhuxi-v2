-- A current supplementary/personality response is an editor of the member's
-- current profile, not a second source that may overwrite later admin edits.
-- Refresh only its active built-in mappings under the existing member row lock.
-- Keep its version, custom/inactive answers, completion state and history intact.
CREATE OR REPLACE FUNCTION private.questionnaire_get(p_kind text,p_retake boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_member uuid;
  t public.questionnaire_templates%ROWTYPE;
  r public.questionnaire_responses%ROWTYPE;
  v_response uuid;
  v_version uuid;
  baseline jsonb;
  legacy jsonb;
  canonical_profile jsonb;
  current_template jsonb;
  merged jsonb;
  question jsonb;
  profile_value jsonb;
  answer_value jsonb;
BEGIN
  -- Admin section updates and questionnaire saves take this same member lock.
  v_member:=private.questionnaire_member(p_kind);
  IF p_retake AND p_kind<>'quiz' THEN
    RAISE EXCEPTION 'QUESTIONNAIRE_RETAKE_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT * INTO t FROM public.questionnaire_templates WHERE kind=p_kind;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT response_id INTO v_response FROM public.questionnaire_assignments
    WHERE member_id=v_member AND kind=p_kind;
  IF v_response IS NULL THEN
    SELECT template INTO baseline FROM public.questionnaire_versions WHERE id=t.baseline_version_id;
    legacy:=private.questionnaire_legacy(v_member,p_kind,baseline);
    v_version:=CASE WHEN (legacy->>'exists')::boolean THEN t.baseline_version_id ELSE t.published_version_id END;
    INSERT INTO public.questionnaire_responses(member_id,kind,version_id,answers,completed_at,legacy_imported,result_snapshot)
      VALUES(v_member,p_kind,v_version,CASE WHEN (legacy->>'exists')::boolean THEN legacy->'answers' ELSE '{}' END,
        CASE WHEN (legacy->>'completed')::boolean THEN now() END,(legacy->>'exists')::boolean,legacy->'result')
      RETURNING id INTO v_response;
    INSERT INTO public.questionnaire_assignments(member_id,kind,response_id)
      VALUES(v_member,p_kind,v_response);
  ELSIF p_kind IN ('supplementary','personality') THEN
    SELECT * INTO r FROM public.questionnaire_responses WHERE id=v_response FOR UPDATE;
    SELECT template INTO current_template FROM public.questionnaire_versions WHERE id=r.version_id;
    -- The initial import can identify unconfirmed true/3 defaults, but must
    -- never erase a value the member has explicitly answered in this version.
    legacy:=private.questionnaire_legacy(v_member,p_kind,current_template);
    IF p_kind='supplementary' THEN
      SELECT COALESCE((SELECT to_jsonb(i) FROM public.member_interests i WHERE i.member_id=v_member),'{}'::jsonb)
        ||COALESCE((SELECT to_jsonb(l) FROM public.member_language l WHERE l.member_id=v_member),'{}'::jsonb)
        INTO canonical_profile;
    ELSE
      SELECT to_jsonb(p) INTO canonical_profile FROM public.member_personality p WHERE p.member_id=v_member;
    END IF;
    merged:=r.answers;
    FOR question IN SELECT value FROM jsonb_array_elements(current_template->'questions')
      WHERE (value->>'active')::boolean AND value ? 'builtinField'
    LOOP
      answer_value:=merged->(question->>'id');
      IF (answer_value IS NOT NULL AND answer_value NOT IN ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb))
        OR (p_kind='supplementary' AND question->>'builtinField' IN ('accept_beginners','accept_cross_school')
          AND merged ? (question->>'id')) THEN
        -- false and a middle rating of 3 are real answers. A stored nullable
        -- boolean key also identifies a real NULL -> true correction, whereas
        -- a missing key must not be filled from a database DEFAULT true.
        profile_value:=COALESCE(canonical_profile->(question->>'builtinField'),'null'::jsonb);
      ELSE
        -- Confirmation is field-specific. Answering a different question must
        -- not turn this session's missing optional score/flag into an answer
        -- merely because its canonical column has a database DEFAULT.
        IF (p_kind='personality' AND question->>'builtinField' IN ('extroversion','initiative','emotional_stability')
            AND canonical_profile->(question->>'builtinField')='3'::jsonb)
          OR (p_kind='supplementary' AND question->>'builtinField' IN ('accept_beginners','accept_cross_school')
            AND canonical_profile->(question->>'builtinField')='true'::jsonb) THEN
          CONTINUE;
        END IF;
        profile_value:=COALESCE(legacy#>ARRAY['answers',question->>'id'],'null'::jsonb);
      END IF;
      -- An unanswered field stays unanswered. Empty form strings/arrays and SQL
      -- NULL are equivalent; a read must not invent an answer or revision.
      IF profile_value IN ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb)
        AND (answer_value IS NULL OR answer_value IN ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb)) THEN
        CONTINUE;
      END IF;
      IF profile_value IS DISTINCT FROM answer_value THEN
        merged:=jsonb_set(merged,ARRAY[question->>'id'],profile_value,true);
      END IF;
    END LOOP;
    IF merged IS DISTINCT FROM r.answers THEN
      UPDATE public.questionnaire_responses SET answers=merged,revision=revision+1,updated_at=now()
        WHERE id=v_response;
    END IF;
  END IF;
  IF p_retake THEN
    INSERT INTO public.questionnaire_responses(member_id,kind,version_id,revision)
      VALUES(v_member,p_kind,t.published_version_id,
        (SELECT revision+1 FROM public.questionnaire_responses WHERE id=v_response))
      RETURNING id INTO v_response;
    UPDATE public.questionnaire_assignments SET response_id=v_response
      WHERE member_id=v_member AND kind=p_kind;
  END IF;
  RETURN private.questionnaire_runtime(v_response);
END $$;

-- CREATE OR REPLACE retains the checked private entry point's existing ACL.
REVOKE ALL ON FUNCTION private.questionnaire_get(text,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION private.questionnaire_get(text,boolean) TO authenticated;
