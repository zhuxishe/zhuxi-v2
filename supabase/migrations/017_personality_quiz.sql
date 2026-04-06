-- 017: ZSP-15 性格测试结果表

CREATE TABLE public.personality_quiz_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE UNIQUE,
  answers jsonb NOT NULL,               -- 15题答案 [{question_id, choice}]
  score_e int NOT NULL DEFAULT 0,       -- 社交能量 0-100
  score_a int NOT NULL DEFAULT 0,       -- 社交温度 0-100
  score_o int NOT NULL DEFAULT 0,       -- 探索倾向 0-100
  score_c int NOT NULL DEFAULT 0,       -- 行动节奏 0-100
  score_n int NOT NULL DEFAULT 0,       -- 情绪锚点 0-100 (高=敏感)
  personality_type text,                 -- 如 "热情守护者"
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER personality_quiz_updated_at
  BEFORE UPDATE ON public.personality_quiz_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.personality_quiz_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player_read_write_own" ON public.personality_quiz_results
  FOR ALL TO authenticated
  USING (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()))
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()));

CREATE POLICY "admin_all" ON public.personality_quiz_results
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Index
CREATE INDEX idx_quiz_member ON public.personality_quiz_results(member_id);
