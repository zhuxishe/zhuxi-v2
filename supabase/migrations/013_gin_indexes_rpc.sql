-- 013: GIN indexes for array columns + trigger for atomic attractiveness sync

-- ── 1. GIN indexes on commonly queried array columns ──────────

-- member_identity: tags used in matching adapter + future search
CREATE INDEX IF NOT EXISTS idx_identity_hobby_tags
  ON public.member_identity USING gin(hobby_tags);

CREATE INDEX IF NOT EXISTS idx_identity_activity_type_tags
  ON public.member_identity USING gin(activity_type_tags);

CREATE INDEX IF NOT EXISTS idx_identity_personality_self_tags
  ON public.member_identity USING gin(personality_self_tags);

CREATE INDEX IF NOT EXISTS idx_identity_taboo_tags
  ON public.member_identity USING gin(taboo_tags);

-- member_interests: time slots used in matching filter
CREATE INDEX IF NOT EXISTS idx_interests_preferred_time_slots
  ON public.member_interests USING gin(preferred_time_slots);

-- activity_records: participant lookup uses @> containment
CREATE INDEX IF NOT EXISTS idx_activity_participant_ids
  ON public.activity_records USING gin(participant_ids);

-- mutual_reviews: tag filtering
CREATE INDEX IF NOT EXISTS idx_reviews_positive_tags
  ON public.mutual_reviews USING gin(positive_tags);

-- ── 2. Trigger: sync attractiveness_score from evals → members ──

-- When interview_evaluations is inserted or updated,
-- recalculate AVG(attractiveness_score) and update members table.
-- This replaces the dual-write in the application layer with
-- a single-source-of-truth + automatic sync in the same transaction.

CREATE OR REPLACE FUNCTION public.sync_attractiveness_score()
RETURNS trigger AS $$
DECLARE
  v_avg numeric;
BEGIN
  -- Calculate AVG attractiveness_score for this member
  SELECT ROUND(AVG(attractiveness_score)) INTO v_avg
  FROM public.interview_evaluations
  WHERE member_id = NEW.member_id
    AND attractiveness_score IS NOT NULL;

  -- Update members table with AVG score + latest interviewer info
  UPDATE public.members SET
    attractiveness_score = v_avg,
    interview_date = COALESCE(
      (SELECT MAX(created_at::date)
       FROM public.interview_evaluations
       WHERE member_id = NEW.member_id),
      CURRENT_DATE
    ),
    interviewer = NEW.interviewer_name
  WHERE id = NEW.member_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_eval_upsert_sync_score
  AFTER INSERT OR UPDATE ON public.interview_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.sync_attractiveness_score();

-- ── 3. Add replay_willing_rate to member_dynamic_stats if missing ──

ALTER TABLE public.member_dynamic_stats
  ADD COLUMN IF NOT EXISTS replay_willing_rate numeric DEFAULT 0;
