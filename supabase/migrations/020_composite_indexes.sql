-- 020: 添加常用查询的复合索引
-- 提升 admin 成员列表、认证查询、匹配结果等查询性能

-- 成员列表过滤（status + membership_type 常一起出现在 WHERE）
CREATE INDEX IF NOT EXISTS idx_members_status_membership
  ON members (status, membership_type);

-- 认证回调中根据 user_id 查找成员
CREATE INDEX IF NOT EXISTS idx_members_user_id
  ON members (user_id) WHERE user_id IS NOT NULL;

-- 登录时根据 email 查找成员
CREATE INDEX IF NOT EXISTS idx_members_email
  ON members (email) WHERE email IS NOT NULL;

-- 匹配结果按 session 查询（admin 匹配详情页）
CREATE INDEX IF NOT EXISTS idx_match_results_session_id
  ON match_results (session_id);

-- 匹配提交按轮次查询
CREATE INDEX IF NOT EXISTS idx_submissions_round_id
  ON match_round_submissions (round_id);

-- 互评按 reviewer 查询
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_id
  ON mutual_reviews (reviewer_id);

-- 性格测试按成员查询
CREATE INDEX IF NOT EXISTS idx_quiz_results_member_id
  ON personality_quiz_results (member_id);
