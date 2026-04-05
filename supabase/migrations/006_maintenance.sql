-- Phase 6: Post-join maintenance

-- Member verification
CREATE TABLE public.member_verification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE UNIQUE,
  student_id_verified boolean NOT NULL DEFAULT false,
  photo_verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  verified_by uuid REFERENCES public.admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Member dynamic stats (system-aggregated)
CREATE TABLE public.member_dynamic_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE UNIQUE,
  activity_count int NOT NULL DEFAULT 0,
  review_count int NOT NULL DEFAULT 0,
  avg_review_score numeric DEFAULT 0,
  late_count int NOT NULL DEFAULT 0,
  no_show_count int NOT NULL DEFAULT 0,
  complaint_count int NOT NULL DEFAULT 0,
  last_activity_at timestamptz,
  reliability_score numeric NOT NULL DEFAULT 5.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Activity records
CREATE TABLE public.activity_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  activity_date date NOT NULL,
  location text,
  activity_type text,
  participant_ids uuid[] NOT NULL DEFAULT '{}',
  participant_count int NOT NULL DEFAULT 0,
  script_id uuid REFERENCES public.scripts(id),
  duration_minutes int,
  notes text,
  created_by uuid REFERENCES public.admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Mutual reviews (player-to-player after activity)
CREATE TABLE public.mutual_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id uuid NOT NULL REFERENCES public.members(id),
  reviewee_id uuid NOT NULL REFERENCES public.members(id),
  activity_id uuid REFERENCES public.activity_records(id),
  overall_score int NOT NULL CHECK (overall_score BETWEEN 1 AND 5),
  punctuality_score int NOT NULL CHECK (punctuality_score BETWEEN 1 AND 5),
  communication_score int NOT NULL CHECK (communication_score BETWEEN 1 AND 5),
  teamwork_score int NOT NULL CHECK (teamwork_score BETWEEN 1 AND 5),
  fun_score int NOT NULL CHECK (fun_score BETWEEN 1 AND 5),
  would_play_again boolean NOT NULL DEFAULT true,
  positive_tags text[] NOT NULL DEFAULT '{}',
  negative_tags text[] NOT NULL DEFAULT '{}',
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Admin notes on members
CREATE TABLE public.member_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_by uuid REFERENCES public.admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Triggers
CREATE TRIGGER member_verification_updated_at
  BEFORE UPDATE ON public.member_verification
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER member_dynamic_stats_updated_at
  BEFORE UPDATE ON public.member_dynamic_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Auto-update stats on new review
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
    updated_at = now()
  WHERE member_id = NEW.reviewee_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_review_insert
  AFTER INSERT ON public.mutual_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_review_stats();

-- RLS
ALTER TABLE public.member_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_dynamic_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mutual_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_notes ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "admin_all" ON public.member_verification FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_all" ON public.member_dynamic_stats FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_all" ON public.activity_records FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_all" ON public.mutual_reviews FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_all" ON public.member_notes FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Player: read own stats
CREATE POLICY "player_read_own_stats" ON public.member_dynamic_stats
  FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()));

-- Player: read activity records they participated in
CREATE POLICY "player_read_own_activities" ON public.activity_records
  FOR SELECT TO authenticated
  USING ((SELECT id FROM public.members WHERE user_id = auth.uid()) = ANY(participant_ids));

-- Player: write reviews + read own reviews
CREATE POLICY "player_write_review" ON public.mutual_reviews
  FOR INSERT TO authenticated
  WITH CHECK (reviewer_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "player_read_own_reviews" ON public.mutual_reviews
  FOR SELECT TO authenticated
  USING (
    reviewer_id IN (SELECT id FROM public.members WHERE user_id = auth.uid())
    OR reviewee_id IN (SELECT id FROM public.members WHERE user_id = auth.uid())
  );

-- Indexes
CREATE INDEX idx_verification_member ON public.member_verification(member_id);
CREATE INDEX idx_dynamic_stats_member ON public.member_dynamic_stats(member_id);
CREATE INDEX idx_activity_date ON public.activity_records(activity_date DESC);
CREATE INDEX idx_reviews_reviewee ON public.mutual_reviews(reviewee_id);
CREATE INDEX idx_reviews_activity ON public.mutual_reviews(activity_id);
CREATE INDEX idx_member_notes_member ON public.member_notes(member_id);
