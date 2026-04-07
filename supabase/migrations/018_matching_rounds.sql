-- 018: 匹配轮次 + 玩家调查问卷
-- 每轮活动独立收集偏好，不再从个人资料读取

-- ========================================
-- 1. match_rounds — 匹配轮次（管理员发起）
-- ========================================
CREATE TABLE match_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_name text NOT NULL,
  survey_start timestamptz NOT NULL,
  survey_end timestamptz NOT NULL,
  activity_start date NOT NULL,
  activity_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'closed', 'matched')),
  created_by uuid REFERENCES admin_users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE match_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_rounds" ON match_rounds
  FOR ALL USING (is_admin());

CREATE POLICY "player_read_open_rounds" ON match_rounds
  FOR SELECT USING (status IN ('open', 'closed', 'matched'));

-- ========================================
-- 2. match_round_submissions — 玩家调查问卷
-- ========================================
CREATE TABLE match_round_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES match_rounds(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  game_type_pref text NOT NULL
    CHECK (game_type_pref IN ('双人', '多人', '都可以')),
  gender_pref text NOT NULL
    CHECK (gender_pref IN ('男', '女', '都可以')),
  availability jsonb NOT NULL DEFAULT '{}',
  interest_tags text[] DEFAULT '{}',
  social_style text,
  message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (round_id, member_id)
);

ALTER TABLE match_round_submissions ENABLE ROW LEVEL SECURITY;

-- 管理员可以看所有
CREATE POLICY "admin_all_submissions" ON match_round_submissions
  FOR ALL USING (is_admin());

-- 玩家只能管理自己的
CREATE POLICY "player_own_submissions" ON match_round_submissions
  FOR ALL USING (
    member_id IN (
      SELECT id FROM members WHERE user_id = auth.uid()
    )
  );

-- ========================================
-- 3. match_sessions 新增 round_id
-- ========================================
ALTER TABLE match_sessions
  ADD COLUMN IF NOT EXISTS round_id uuid REFERENCES match_rounds(id);

-- ========================================
-- 4. 索引
-- ========================================
CREATE INDEX idx_round_submissions_round ON match_round_submissions(round_id);
CREATE INDEX idx_round_submissions_member ON match_round_submissions(member_id);
CREATE INDEX idx_match_sessions_round ON match_sessions(round_id);
CREATE INDEX idx_match_rounds_status ON match_rounds(status);

-- ========================================
-- 5. updated_at 自动触发器
-- ========================================
CREATE OR REPLACE FUNCTION update_submission_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_submission_updated_at
  BEFORE UPDATE ON match_round_submissions
  FOR EACH ROW EXECUTE FUNCTION update_submission_updated_at();
