-- 015: 匹配系统增强 — 状态管理 + 未匹配诊断

-- match_results: 添加状态和锁定
ALTER TABLE public.match_results
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'cancelled', 'locked')),
  ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES public.admin_users(id),
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

-- match_sessions: 添加状态
ALTER TABLE public.match_sessions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'published'));

-- 未匹配诊断表
CREATE TABLE public.unmatched_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.match_sessions(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  reason text NOT NULL,  -- 'no_common_time' | 'constraint_conflict' | 'insufficient_candidates' | 'low_score'
  details jsonb,         -- 具体冲突信息
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.unmatched_diagnostics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all" ON public.unmatched_diagnostics
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Indexes
CREATE INDEX idx_unmatched_session ON public.unmatched_diagnostics(session_id);
CREATE INDEX idx_match_results_status ON public.match_results(status);
