-- 人格问卷配置表（单行 JSONB 配置）
-- 允许管理员在后台修改题目、分值、维度权重、命名系统等

CREATE TABLE personality_quiz_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questions jsonb NOT NULL,      -- [{id, dimension, text, options: [{text, score}]}]
  dimensions jsonb NOT NULL,     -- {E: {name, matchWeight, descriptions: {low,mid,high}}, ...}
  type_labels jsonb NOT NULL,    -- {formal: {prefix, suffix}, fun: {prefix, suffix}}
  type_descriptions jsonb NOT NULL DEFAULT '{}', -- {"热情守护者": {description, imageUrl?}, ...}
  scoring jsonb NOT NULL DEFAULT '{"minRaw":4.5,"maxRaw":18,"invertN":true}',
  updated_at timestamptz DEFAULT now(),
  updated_by text
);

-- 单行约束：只允许一条配置记录
CREATE UNIQUE INDEX personality_quiz_config_singleton ON personality_quiz_config ((true));

-- 自动更新 updated_at
CREATE TRIGGER set_updated_at_quiz_config
  BEFORE UPDATE ON personality_quiz_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE personality_quiz_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "认证用户可读问卷配置"
  ON personality_quiz_config FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "管理员可写问卷配置"
  ON personality_quiz_config FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );
