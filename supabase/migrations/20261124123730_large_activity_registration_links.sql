BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.past_event_reviews
  ADD COLUMN registration_round_id uuid,
  ADD CONSTRAINT past_event_reviews_registration_round_id_key UNIQUE (registration_round_id),
  ADD CONSTRAINT past_event_reviews_registration_round_id_fkey
    FOREIGN KEY (registration_round_id) REFERENCES public.match_rounds(id) ON DELETE RESTRICT;

-- Existing rounds are soft-deleted. Keep a saved link until an admin explicitly
-- removes it, so an older manual URL cannot reappear when a round is withdrawn.
CREATE FUNCTION private.check_large_activity_registration_round()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.registration_round_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.registration_round_id IS NOT DISTINCT FROM OLD.registration_round_id THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM public.match_rounds AS round
  WHERE round.id = NEW.registration_round_id
    AND round.deleted_at IS NULL
    AND NOT round.is_test
    AND round.purpose IN ('registration', 'matching')
    AND round.status IN ('open', 'closed', 'matched')
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTIVITY_REGISTRATION_ROUND_UNAVAILABLE' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.check_large_activity_registration_round() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER content_v2_04_check_registration_round
  BEFORE INSERT OR UPDATE OF registration_round_id ON public.past_event_reviews
  FOR EACH ROW EXECUTE FUNCTION private.check_large_activity_registration_round();

-- The normal content management RLS and audit triggers still apply. Editing
-- from the round may move its link between two active activities in one write.
CREATE FUNCTION public.admin_set_large_activity_registration_link(
  p_activity_id uuid,
  p_round_id uuid,
  p_counterpart_id uuid,
  p_expected_counterpart_id uuid
)
RETURNS TABLE (activity_ids uuid[], round_ids uuid[])
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_previous_activity_id uuid;
  v_previous_round_id uuid;
  v_candidate_round_id uuid;
  v_previous_archived_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'ACTIVITY_REGISTRATION_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF (p_activity_id IS NULL) = (p_round_id IS NULL) THEN
    RAISE EXCEPTION 'ACTIVITY_REGISTRATION_TARGET_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Both admin entry points write the same link. Serialize rebindings so these
  -- short transactions cannot lock two activity rows in opposite order.
  PERFORM pg_advisory_xact_lock(hashtextextended('large_activity_registration_link', 0));

  IF p_activity_id IS NOT NULL THEN
    SELECT activity.registration_round_id INTO v_previous_round_id
    FROM public.past_event_reviews AS activity
    WHERE activity.id = p_activity_id AND activity.archived_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ACTIVITY_REGISTRATION_ACTIVITY_UNAVAILABLE' USING ERRCODE = '22023';
    END IF;
    IF v_previous_round_id IS DISTINCT FROM p_counterpart_id THEN
      IF v_previous_round_id IS DISTINCT FROM p_expected_counterpart_id THEN
        RAISE EXCEPTION 'ACTIVITY_REGISTRATION_LINK_CHANGED' USING ERRCODE = '22023';
      END IF;
      UPDATE public.past_event_reviews
      SET registration_round_id = p_counterpart_id,
          audit_reason = CASE WHEN p_counterpart_id IS NULL
            THEN format('解除活动报名轮次 %s', v_previous_round_id)
            ELSE format('关联活动报名轮次 %s', p_counterpart_id)
          END
      WHERE id = p_activity_id;
    END IF;

    RETURN QUERY SELECT ARRAY[p_activity_id], array_remove(ARRAY[v_previous_round_id, p_counterpart_id], NULL);
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.match_rounds WHERE id = p_round_id AND NOT is_test) THEN
    RAISE EXCEPTION 'ACTIVITY_REGISTRATION_ROUND_UNAVAILABLE' USING ERRCODE = '22023';
  END IF;

  SELECT activity.id, activity.archived_at INTO v_previous_activity_id, v_previous_archived_at
  FROM public.past_event_reviews AS activity
  WHERE activity.registration_round_id = p_round_id
  FOR UPDATE;

  IF v_previous_activity_id IS DISTINCT FROM p_counterpart_id THEN
    IF v_previous_activity_id IS DISTINCT FROM p_expected_counterpart_id THEN
      RAISE EXCEPTION 'ACTIVITY_REGISTRATION_LINK_CHANGED' USING ERRCODE = '22023';
    END IF;
    IF v_previous_archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'ACTIVITY_REGISTRATION_ARCHIVED_ACTIVITY' USING ERRCODE = '22023';
    END IF;
    IF p_counterpart_id IS NOT NULL THEN
      SELECT activity.registration_round_id INTO v_candidate_round_id
      FROM public.past_event_reviews AS activity
      WHERE activity.id = p_counterpart_id AND activity.archived_at IS NULL
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'ACTIVITY_REGISTRATION_ACTIVITY_UNAVAILABLE' USING ERRCODE = '22023';
      END IF;
      IF v_candidate_round_id IS NOT NULL THEN
        RAISE EXCEPTION 'ACTIVITY_REGISTRATION_ALREADY_LINKED' USING ERRCODE = '22023';
      END IF;
    END IF;

    IF v_previous_activity_id IS NOT NULL THEN
      UPDATE public.past_event_reviews
      SET registration_round_id = NULL, audit_reason = format('解除活动报名轮次 %s', p_round_id)
      WHERE id = v_previous_activity_id;
    END IF;
    IF p_counterpart_id IS NOT NULL THEN
      UPDATE public.past_event_reviews
      SET registration_round_id = p_round_id, audit_reason = format('关联活动报名轮次 %s', p_round_id)
      WHERE id = p_counterpart_id;
    END IF;
  END IF;

  RETURN QUERY SELECT array_remove(ARRAY[v_previous_activity_id, p_counterpart_id], NULL), ARRAY[p_round_id];
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_large_activity_registration_link(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_large_activity_registration_link(uuid, uuid, uuid, uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
