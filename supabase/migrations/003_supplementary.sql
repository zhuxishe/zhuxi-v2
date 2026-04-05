-- Phase 3: Player supplementary data + personality self-assessment

-- Add auth link columns to members (for magic link login)
ALTER TABLE public.members
  ADD COLUMN user_id uuid REFERENCES auth.users(id),
  ADD COLUMN email text;

CREATE UNIQUE INDEX idx_members_user_id ON public.members(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_members_email ON public.members(email) WHERE email IS NOT NULL;

-- Helper: check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ── member_language (1:1) ──────────────────────────

CREATE TABLE public.member_language (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE UNIQUE,
  communication_language_pref text[] NOT NULL DEFAULT '{}',
  japanese_level text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER member_language_updated_at
  BEFORE UPDATE ON public.member_language
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── member_interests (1:1) ─────────────────────────

CREATE TABLE public.member_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE UNIQUE,
  -- Location
  activity_area text,
  nearest_station text,
  graduation_year int,
  -- Activity preferences
  scenario_mode_pref text[] NOT NULL DEFAULT '{}',
  ideal_group_size text,
  script_preference text[] NOT NULL DEFAULT '{}',
  non_script_preference text[] NOT NULL DEFAULT '{}',
  activity_frequency text,
  preferred_time_slots text[] NOT NULL DEFAULT '{}',
  budget_range text,
  travel_radius text,
  -- Social goals
  social_goal_primary text,
  social_goal_secondary text,
  accept_beginners boolean DEFAULT true,
  accept_cross_school boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER member_interests_updated_at
  BEFORE UPDATE ON public.member_interests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── member_personality (1:1) ───────────────────────

CREATE TABLE public.member_personality (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE UNIQUE,
  extroversion int NOT NULL DEFAULT 3 CHECK (extroversion BETWEEN 1 AND 5),
  initiative int NOT NULL DEFAULT 3 CHECK (initiative BETWEEN 1 AND 5),
  expression_style_tags text[] NOT NULL DEFAULT '{}',
  group_role_tags text[] NOT NULL DEFAULT '{}',
  warmup_speed text,
  planning_style text,
  coop_compete_tendency text,
  emotional_stability int NOT NULL DEFAULT 3 CHECK (emotional_stability BETWEEN 1 AND 5),
  boundary_strength text,
  reply_speed text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER member_personality_updated_at
  BEFORE UPDATE ON public.member_personality
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── member_boundaries (1:1) ────────────────────────

CREATE TABLE public.member_boundaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE UNIQUE,
  taboo_tags text[] NOT NULL DEFAULT '{}',
  deal_breakers text[] NOT NULL DEFAULT '{}',
  preferred_age_range text,
  preferred_gender_mix text,
  boundary_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER member_boundaries_updated_at
  BEFORE UPDATE ON public.member_boundaries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── RLS ────────────────────────────────────────────

ALTER TABLE public.member_language ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_personality ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_boundaries ENABLE ROW LEVEL SECURITY;

-- Player: read/write own data. Admin: read/write all.
-- Pattern: own data check OR is_admin()

CREATE POLICY "select_own_or_admin" ON public.member_language
  FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()) OR public.is_admin());
CREATE POLICY "insert_own" ON public.member_language
  FOR INSERT TO authenticated
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "update_own_or_admin" ON public.member_language
  FOR UPDATE TO authenticated
  USING (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()) OR public.is_admin());

CREATE POLICY "select_own_or_admin" ON public.member_interests
  FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()) OR public.is_admin());
CREATE POLICY "insert_own" ON public.member_interests
  FOR INSERT TO authenticated
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "update_own_or_admin" ON public.member_interests
  FOR UPDATE TO authenticated
  USING (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()) OR public.is_admin());

CREATE POLICY "select_own_or_admin" ON public.member_personality
  FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()) OR public.is_admin());
CREATE POLICY "insert_own" ON public.member_personality
  FOR INSERT TO authenticated
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "update_own_or_admin" ON public.member_personality
  FOR UPDATE TO authenticated
  USING (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()) OR public.is_admin());

CREATE POLICY "select_own_or_admin" ON public.member_boundaries
  FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()) OR public.is_admin());
CREATE POLICY "insert_own" ON public.member_boundaries
  FOR INSERT TO authenticated
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "update_own_or_admin" ON public.member_boundaries
  FOR UPDATE TO authenticated
  USING (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()) OR public.is_admin());

-- Player can read own member row (supplement existing admin policy)
CREATE POLICY "player_read_own" ON public.members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Indexes
CREATE INDEX idx_member_language_mid ON public.member_language(member_id);
CREATE INDEX idx_member_interests_mid ON public.member_interests(member_id);
CREATE INDEX idx_member_personality_mid ON public.member_personality(member_id);
CREATE INDEX idx_member_boundaries_mid ON public.member_boundaries(member_id);
