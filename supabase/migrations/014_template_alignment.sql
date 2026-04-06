-- 014: 对齐 Excel 模板字段

-- member_interests: 新增缺失字段
ALTER TABLE public.member_interests
  ADD COLUMN IF NOT EXISTS game_type_pref text,         -- 玩本类型（单选：双人本/多人本/都可以/看活动而定）
  ADD COLUMN IF NOT EXISTS scenario_theme_tags text[] NOT NULL DEFAULT '{}';  -- 剧本主题标签（多选）
  -- 注意: scenario_theme_tags 在 TypeScript 类型中已存在但数据库中缺失

-- member_identity: 补充缺失字段
ALTER TABLE public.member_identity
  ADD COLUMN IF NOT EXISTS phone text,                  -- 联系电话（可选）
  ADD COLUMN IF NOT EXISTS sns_accounts jsonb;           -- SNS 账号 {"line": "...", "instagram": "..."}

-- GIN index on new array column
CREATE INDEX IF NOT EXISTS idx_interests_scenario_theme
  ON public.member_interests USING gin(scenario_theme_tags);
