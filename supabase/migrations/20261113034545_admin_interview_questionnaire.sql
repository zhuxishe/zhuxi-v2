-- Read-only, member-scoped interview answers for both administrator roles.
CREATE FUNCTION private.admin_read_interview_questionnaire(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  member_row public.members%ROWTYPE;
  response_row public.questionnaire_responses%ROWTYPE;
  version_row public.questionnaire_versions%ROWTYPE;
  baseline jsonb;
  legacy jsonb;
BEGIN
  IF NOT COALESCE(private.member_master_is_admin(), false) THEN
    RAISE EXCEPTION 'MEMBER_MASTER_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO member_row FROM public.members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEMBER_MASTER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF member_row.anonymized_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  SELECT r.* INTO response_row
  FROM public.questionnaire_assignments a
  JOIN public.questionnaire_responses r
    ON r.id = a.response_id AND r.member_id = a.member_id AND r.kind = a.kind
  WHERE a.member_id = p_member_id AND a.kind = 'interview';

  IF FOUND THEN
    IF response_row.completed_at IS NULL THEN
      RETURN jsonb_build_object('status', 'draft');
    END IF;
    SELECT * INTO STRICT version_row FROM public.questionnaire_versions
    WHERE id = response_row.version_id AND kind = 'interview';
    RETURN jsonb_build_object(
      'status', CASE WHEN response_row.legacy_imported THEN 'legacy' ELSE 'submitted' END,
      'template', version_row.template,
      'answers', response_row.answers,
      'version', version_row.version,
      'submittedAt', CASE WHEN response_row.legacy_imported THEN member_row.submitted_at ELSE response_row.completed_at END
    );
  END IF;

  -- Old members may never have opened the versioned form. Reconstruct only
  -- known legacy fields without creating an assignment or response on read.
  baseline := private.questionnaire_trusted_baseline('interview');
  legacy := private.questionnaire_legacy(p_member_id, 'interview', baseline);
  IF NOT COALESCE((legacy->>'exists')::boolean, false) THEN
    RETURN jsonb_build_object('status', 'missing');
  END IF;
  IF NOT COALESCE((legacy->>'completed')::boolean, false) THEN
    RETURN jsonb_build_object('status', 'draft');
  END IF;
  RETURN jsonb_build_object(
    'status', 'legacy', 'template', baseline, 'answers', legacy->'answers',
    'version', NULL, 'submittedAt', member_row.submitted_at
  );
END;
$$;

CREATE FUNCTION public.admin_get_interview_questionnaire(p_member_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_read_interview_questionnaire(p_member_id) $$;

REVOKE ALL ON FUNCTION private.admin_read_interview_questionnaire(uuid),
  public.admin_get_interview_questionnaire(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.admin_read_interview_questionnaire(uuid),
  public.admin_get_interview_questionnaire(uuid) TO authenticated;
