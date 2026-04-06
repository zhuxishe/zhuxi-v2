-- Phase 8: Field completeness — align DB with Excel template requirements

-- ── 1. members: add membership_type ──────────────────
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS membership_type text NOT NULL DEFAULT 'player'
    CHECK (membership_type IN ('player', 'staff'));

-- ── 2. member_identity: add height_weight ────────────
ALTER TABLE public.member_identity
  ADD COLUMN IF NOT EXISTS height_weight text;

-- ── 3. member_interests: add scenario_theme_tags + fix social_goal_secondary ─
ALTER TABLE public.member_interests
  ADD COLUMN IF NOT EXISTS scenario_theme_tags text[] NOT NULL DEFAULT '{}';

-- social_goal_secondary: keep as text (single select, matches existing code)

-- ── 4. member_dynamic_stats: add replay_willing_rate + recent5 ─
ALTER TABLE public.member_dynamic_stats
  ADD COLUMN IF NOT EXISTS replay_willing_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recent5_avg_score numeric DEFAULT 0;

-- ── 5. activity_records: add late/no_show tracking ───
ALTER TABLE public.activity_records
  ADD COLUMN IF NOT EXISTS late_member_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS no_show_member_ids uuid[] NOT NULL DEFAULT '{}';

-- ── 6. Trigger: update late/no_show counts from activity_records ─
CREATE OR REPLACE FUNCTION public.update_attendance_stats()
RETURNS trigger AS $$
DECLARE
  mid uuid;
BEGIN
  -- Update late counts for newly marked members
  FOREACH mid IN ARRAY NEW.late_member_ids
  LOOP
    INSERT INTO public.member_dynamic_stats (member_id, late_count)
      VALUES (mid, 1)
    ON CONFLICT (member_id) DO UPDATE SET
      late_count = member_dynamic_stats.late_count + 1,
      updated_at = now();
  END LOOP;

  -- Update no-show counts
  FOREACH mid IN ARRAY NEW.no_show_member_ids
  LOOP
    INSERT INTO public.member_dynamic_stats (member_id, no_show_count)
      VALUES (mid, 1)
    ON CONFLICT (member_id) DO UPDATE SET
      no_show_count = member_dynamic_stats.no_show_count + 1,
      updated_at = now();
  END LOOP;

  -- Update activity_count and last_activity_at for all participants
  FOREACH mid IN ARRAY NEW.participant_ids
  LOOP
    INSERT INTO public.member_dynamic_stats (member_id, activity_count, last_activity_at)
      VALUES (mid, 1, NEW.activity_date)
    ON CONFLICT (member_id) DO UPDATE SET
      activity_count = member_dynamic_stats.activity_count + 1,
      last_activity_at = GREATEST(member_dynamic_stats.last_activity_at, NEW.activity_date),
      updated_at = now();
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_activity_insert
  AFTER INSERT ON public.activity_records
  FOR EACH ROW EXECUTE FUNCTION public.update_attendance_stats();

-- ── 7. Enhanced review stats trigger (replay_willing_rate + recent5) ─
CREATE OR REPLACE FUNCTION public.update_review_stats()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.member_dynamic_stats (member_id) VALUES (NEW.reviewee_id)
  ON CONFLICT (member_id) DO NOTHING;

  UPDATE public.member_dynamic_stats SET
    review_count = review_count + 1,
    avg_review_score = (
      SELECT AVG(overall_score) FROM public.mutual_reviews WHERE reviewee_id = NEW.reviewee_id
    ),
    recent5_avg_score = (
      SELECT AVG(overall_score) FROM (
        SELECT overall_score FROM public.mutual_reviews
        WHERE reviewee_id = NEW.reviewee_id
        ORDER BY created_at DESC LIMIT 5
      ) sub
    ),
    replay_willing_rate = (
      SELECT AVG(CASE WHEN would_play_again THEN 1.0 ELSE 0.0 END)
      FROM public.mutual_reviews WHERE reviewee_id = NEW.reviewee_id
    ),
    updated_at = now()
  WHERE member_id = NEW.reviewee_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
