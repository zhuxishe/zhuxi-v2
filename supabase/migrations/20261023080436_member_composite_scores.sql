-- Shared administrator-only scores. NULL means unrated; 3 is only a UI default.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

-- Drain legacy evaluation/member writes before copying A and replacing its
-- writer. Otherwise an old in-flight save could split the initial mirror.
LOCK TABLE public.interview_evaluations, public.members IN ACCESS EXCLUSIVE MODE;

-- This schema is not exposed by PostgREST; public wrappers remain invokers.
CREATE SCHEMA member_assessment AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA member_assessment FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA member_assessment TO authenticated;

CREATE TABLE private.member_composite_scores (
  member_id uuid PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  attractiveness_score smallint CHECK (attractiveness_score BETWEEN 1 AND 5),
  sexual_value_score smallint CHECK (sexual_value_score BETWEEN 1 AND 5),
  economic_value_score smallint CHECK (economic_value_score BETWEEN 1 AND 5),
  emotional_value_score smallint CHECK (emotional_value_score BETWEEN 1 AND 5),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_admin_id uuid,
  source text NOT NULL CHECK (source IN ('existing_score', 'admin', 'sheet_import')),
  reason text NOT NULL,
  import_batch text
);
ALTER TABLE private.member_composite_scores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.member_composite_scores FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE private.member_composite_score_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_admin_id uuid,
  source text NOT NULL,
  reason text NOT NULL,
  import_batch text,
  before_values jsonb,
  after_values jsonb
);
CREATE INDEX member_composite_score_audit_member_idx
  ON private.member_composite_score_audit(member_id, recorded_at DESC);
ALTER TABLE private.member_composite_score_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.member_composite_score_audit FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE private.member_composite_score_audit_id_seq FROM PUBLIC, anon, authenticated, service_role;

-- Preserve the existing rounded member-level A, without inventing B/C/D or
-- evaluations. Closed/anonymized records are deliberately excluded.
INSERT INTO private.member_composite_scores(member_id, attractiveness_score, source, reason)
SELECT id, attractiveness_score, 'existing_score', '保留现有成员汇总评分'
FROM public.members
WHERE attractiveness_score IS NOT NULL AND account_status <> 'closed' AND anonymized_at IS NULL;

CREATE FUNCTION private.member_composite_score_values(p_row private.member_composite_scores)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $function$
  SELECT jsonb_build_object(
    'member_id', p_row.member_id, 'attractiveness_score', p_row.attractiveness_score,
    'sexual_value_score', p_row.sexual_value_score, 'economic_value_score', p_row.economic_value_score,
    'emotional_value_score', p_row.emotional_value_score, 'updated_at', p_row.updated_at)
$function$;
REVOKE ALL ON FUNCTION private.member_composite_score_values(private.member_composite_scores)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.member_composite_score_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_member public.members%ROWTYPE;
BEGIN
  SELECT * INTO v_member FROM public.members WHERE id = NEW.member_id FOR UPDATE;
  IF NOT FOUND OR v_member.account_status = 'closed' OR v_member.anonymized_at IS NOT NULL THEN
    RAISE EXCEPTION 'COMPOSITE_SCORE_MEMBER_UNAVAILABLE' USING ERRCODE = 'PT409';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.member_id IS DISTINCT FROM OLD.member_id THEN
    RAISE EXCEPTION 'COMPOSITE_SCORE_MEMBER_IMMUTABLE' USING ERRCODE = '22023';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.member_composite_score_before_write() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER member_composite_score_before_write BEFORE INSERT OR UPDATE
  ON private.member_composite_scores FOR EACH ROW EXECUTE FUNCTION private.member_composite_score_before_write();

CREATE FUNCTION private.member_composite_score_after_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  -- Existing matching readers continue to use this protected A-only mirror.
  -- This never updates interview_date/interviewer or creates an evaluation.
  UPDATE public.members SET attractiveness_score = NEW.attractiveness_score
    WHERE id = NEW.member_id AND attractiveness_score IS DISTINCT FROM NEW.attractiveness_score;
  INSERT INTO private.member_composite_score_audit(
    member_id, actor_admin_id, source, reason, import_batch, before_values, after_values
  ) VALUES (
    NEW.member_id, NEW.actor_admin_id, NEW.source, NEW.reason, NEW.import_batch,
    CASE WHEN TG_OP = 'UPDATE' THEN private.member_composite_score_values(OLD) ELSE NULL END,
    private.member_composite_score_values(NEW)
  );
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.member_composite_score_after_write() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER member_composite_score_after_write AFTER INSERT OR UPDATE
  ON private.member_composite_scores FOR EACH ROW EXECUTE FUNCTION private.member_composite_score_after_write();

CREATE FUNCTION member_assessment.admin_get_member_composite_scores(p_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_row private.member_composite_scores%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT private.member_master_is_admin() THEN
    RAISE EXCEPTION 'MEMBER_MASTER_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id = p_member_id
    AND account_status <> 'closed' AND anonymized_at IS NULL) THEN
    RAISE EXCEPTION 'COMPOSITE_SCORE_MEMBER_UNAVAILABLE' USING ERRCODE = 'PT409';
  END IF;
  SELECT * INTO v_row FROM private.member_composite_scores WHERE member_id = p_member_id;
  IF NOT FOUND THEN
    v_row.member_id := p_member_id;
    -- Support later administrator-created/imported members with a legacy A.
    SELECT attractiveness_score INTO v_row.attractiveness_score FROM public.members WHERE id = p_member_id;
  END IF;
  RETURN private.member_composite_score_values(v_row);
END;
$function$;
REVOKE ALL ON FUNCTION member_assessment.admin_get_member_composite_scores(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION member_assessment.admin_get_member_composite_scores(uuid) TO authenticated;
CREATE FUNCTION public.admin_get_member_composite_scores(p_member_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT member_assessment.admin_get_member_composite_scores(p_member_id)
$function$;
REVOKE ALL ON FUNCTION public.admin_get_member_composite_scores(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_member_composite_scores(uuid) TO authenticated;

CREATE FUNCTION member_assessment.admin_update_member_composite_scores(
  p_member_id uuid, p_scores jsonb, p_reason text, p_expected_updated_at timestamptz
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_admin_id uuid;
  v_row private.member_composite_scores%ROWTYPE;
  v_key text;
  v_trim_chars constant text := E' \t\n\r\f\v' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  v_reason text := btrim(COALESCE(p_reason, ''), v_trim_chars);
  v_keys constant text[] := ARRAY['attractiveness_score','sexual_value_score','economic_value_score','emotional_value_score'];
BEGIN
  PERFORM private.peer_lock_admin();
  v_admin_id := private.member_master_current_admin_id();
  IF v_admin_id IS NULL OR (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'MEMBER_MASTER_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_reason) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION 'COMPOSITE_SCORE_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_scores IS NULL OR jsonb_typeof(p_scores) <> 'object'
    OR NOT p_scores ?& v_keys OR (p_scores - v_keys) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'COMPOSITE_SCORE_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  FOREACH v_key IN ARRAY v_keys LOOP
    IF jsonb_typeof(p_scores->v_key) IS DISTINCT FROM 'number'
      OR (p_scores->>v_key)::numeric NOT BETWEEN 1 AND 5
      OR (p_scores->>v_key)::numeric <> trunc((p_scores->>v_key)::numeric) THEN
      RAISE EXCEPTION 'COMPOSITE_SCORE_PAYLOAD_INVALID' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- Serialize first saves as well as updates and coordinate with anonymization.
  PERFORM 1 FROM public.members WHERE id = p_member_id
    AND account_status <> 'closed' AND anonymized_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMPOSITE_SCORE_MEMBER_UNAVAILABLE' USING ERRCODE = 'PT409';
  END IF;
  SELECT * INTO v_row FROM private.member_composite_scores WHERE member_id = p_member_id FOR UPDATE;
  IF v_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'COMPOSITE_SCORE_VERSION_CONFLICT' USING ERRCODE = 'PT409';
  END IF;
  IF v_row.member_id IS NOT NULL AND
    (private.member_composite_score_values(v_row) - ARRAY['member_id','updated_at']) = p_scores THEN
    RETURN private.member_composite_score_values(v_row);
  END IF;
  INSERT INTO private.member_composite_scores AS scores (
    member_id, attractiveness_score, sexual_value_score, economic_value_score,
    emotional_value_score, actor_admin_id, source, reason
  ) VALUES (p_member_id, (p_scores->>'attractiveness_score')::numeric::smallint,
    (p_scores->>'sexual_value_score')::numeric::smallint, (p_scores->>'economic_value_score')::numeric::smallint,
    (p_scores->>'emotional_value_score')::numeric::smallint, v_admin_id, 'admin', v_reason)
  ON CONFLICT (member_id) DO UPDATE SET
    attractiveness_score = EXCLUDED.attractiveness_score, sexual_value_score = EXCLUDED.sexual_value_score,
    economic_value_score = EXCLUDED.economic_value_score, emotional_value_score = EXCLUDED.emotional_value_score,
    actor_admin_id = EXCLUDED.actor_admin_id, source = EXCLUDED.source, reason = EXCLUDED.reason, import_batch = NULL
  RETURNING * INTO v_row;
  RETURN private.member_composite_score_values(v_row);
END;
$function$;
REVOKE ALL ON FUNCTION member_assessment.admin_update_member_composite_scores(uuid,jsonb,text,timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION member_assessment.admin_update_member_composite_scores(uuid,jsonb,text,timestamptz) TO authenticated;
CREATE FUNCTION public.admin_update_member_composite_scores(
  p_member_id uuid, p_scores jsonb, p_reason text, p_expected_updated_at timestamptz
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  SELECT member_assessment.admin_update_member_composite_scores(p_member_id,p_scores,p_reason,p_expected_updated_at)
$function$;
REVOKE ALL ON FUNCTION public.admin_update_member_composite_scores(uuid,jsonb,text,timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_member_composite_scores(uuid,jsonb,text,timestamptz) TO authenticated;

-- Historical interviewer scores remain intact; subsequent evaluation edits may
-- still maintain their interview metadata, but must not overwrite shared A.
CREATE OR REPLACE FUNCTION public.sync_attractiveness_score()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  UPDATE public.members SET
    interview_date = COALESCE((SELECT MAX(created_at::date) FROM public.interview_evaluations
      WHERE member_id = NEW.member_id), CURRENT_DATE),
    interviewer = NEW.interviewer_name
  WHERE id = NEW.member_id;
  RETURN NEW;
END;
$function$;

-- Preserve the latest existing section implementation, including unrelated
-- fixes, while preventing obsolete forms/restores from changing shared A.
ALTER FUNCTION private.member_master_apply_admin_section(uuid,text,jsonb,uuid,boolean)
  RENAME TO member_master_apply_admin_section_before_composite;
CREATE FUNCTION private.member_master_apply_admin_section(
  p_member_id uuid, p_section text, p_payload jsonb, p_admin_id uuid, p_is_restore boolean DEFAULT false
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_existing smallint;
BEGIN
  IF p_section IN ('application','interview_evaluation') AND p_payload ? 'attractiveness_score' THEN
    IF p_section = 'application' THEN
      SELECT attractiveness_score INTO v_existing FROM public.members WHERE id = p_member_id;
    ELSE
      SELECT attractiveness_score INTO v_existing FROM public.interview_evaluations
        WHERE member_id = p_member_id AND interviewer_id = p_admin_id;
    END IF;
    IF p_payload->'attractiveness_score' IS DISTINCT FROM COALESCE(to_jsonb(v_existing), 'null'::jsonb) THEN
      RAISE EXCEPTION 'COMPOSITE_SCORE_USE_SHARED_EDITOR' USING ERRCODE = '22023';
    END IF;
    p_payload := p_payload - 'attractiveness_score';
  END IF;
  PERFORM private.member_master_apply_admin_section_before_composite(p_member_id,p_section,p_payload,p_admin_id,p_is_restore);
END;
$function$;
REVOKE ALL ON FUNCTION private.member_master_apply_admin_section(uuid,text,jsonb,uuid,boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_master_apply_admin_section_before_composite(uuid,text,jsonb,uuid,boolean)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.member_composite_score_erase_mirror()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  NEW.attractiveness_score := NULL;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.member_composite_score_erase_mirror() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER member_composite_score_erase_mirror BEFORE UPDATE OF anonymized_at ON public.members
  FOR EACH ROW WHEN (OLD.anonymized_at IS NULL AND NEW.anonymized_at IS NOT NULL)
  EXECUTE FUNCTION private.member_composite_score_erase_mirror();

CREATE FUNCTION private.member_composite_score_erasure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF NEW.anonymized_at IS NOT NULL THEN
    DELETE FROM private.member_composite_scores WHERE member_id = NEW.id;
    DELETE FROM private.member_composite_score_audit WHERE member_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.member_composite_score_erasure() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER member_composite_score_erasure AFTER UPDATE OF anonymized_at ON public.members
  FOR EACH ROW WHEN (OLD.anonymized_at IS NULL AND NEW.anonymized_at IS NOT NULL)
  EXECUTE FUNCTION private.member_composite_score_erasure();

NOTIFY pgrst, 'reload schema';
COMMIT;
