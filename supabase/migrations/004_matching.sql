-- Phase 4: Matching system

-- Match sessions (batch metadata)
CREATE TABLE public.match_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_name text,
  algorithm text NOT NULL DEFAULT 'optimized',
  group_size int NOT NULL DEFAULT 2,
  config jsonb NOT NULL DEFAULT '{}',
  total_candidates int NOT NULL DEFAULT 0,
  total_matched int NOT NULL DEFAULT 0,
  total_unmatched int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Match results (each pair/group in a session)
CREATE TABLE public.match_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.match_sessions(id) ON DELETE CASCADE,
  member_a_id uuid NOT NULL REFERENCES public.members(id),
  member_b_id uuid REFERENCES public.members(id),
  group_members uuid[] DEFAULT '{}',
  total_score numeric NOT NULL DEFAULT 0,
  score_breakdown jsonb DEFAULT '[]',
  best_slot text,
  rank int,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Pair relationships (cumulative history)
CREATE TABLE public.pair_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_a_id uuid NOT NULL REFERENCES public.members(id),
  member_b_id uuid NOT NULL REFERENCES public.members(id),
  pair_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'normal' CHECK (status IN ('normal', 'blacklist', 'cooldown', 'reunion', 'avoid')),
  last_matched_at timestamptz,
  avg_score numeric,
  feedback_a jsonb,
  feedback_b jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(member_a_id, member_b_id)
);

CREATE TRIGGER pair_relationships_updated_at
  BEFORE UPDATE ON public.pair_relationships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.match_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pair_relationships ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "admin_all_sessions" ON public.match_sessions
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_all_results" ON public.match_results
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_all_relationships" ON public.pair_relationships
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Player: read own match results
CREATE POLICY "player_read_own_results" ON public.match_results
  FOR SELECT TO authenticated
  USING (
    member_a_id IN (SELECT id FROM public.members WHERE user_id = auth.uid())
    OR member_b_id IN (SELECT id FROM public.members WHERE user_id = auth.uid())
    OR (SELECT id FROM public.members WHERE user_id = auth.uid()) = ANY(group_members)
  );

-- Player: read sessions (for context)
CREATE POLICY "player_read_sessions" ON public.match_sessions
  FOR SELECT TO authenticated USING (true);

-- Indexes
CREATE INDEX idx_match_results_session ON public.match_results(session_id);
CREATE INDEX idx_match_results_member_a ON public.match_results(member_a_id);
CREATE INDEX idx_match_results_member_b ON public.match_results(member_b_id);
CREATE INDEX idx_pair_rel_members ON public.pair_relationships(member_a_id, member_b_id);
