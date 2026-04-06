-- 016: 剧本库增强 — 活动介绍 + 角色 + 游玩记录

-- scripts: 新增字段
ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS content_html text,           -- 活动介绍（HTML/Markdown）
  ADD COLUMN IF NOT EXISTS script_type text,             -- 类型：城市探索/推理/联谊/游戏/其他
  ADD COLUMN IF NOT EXISTS roles jsonb,                  -- 角色列表 [{ name, gender, description }]
  ADD COLUMN IF NOT EXISTS warnings text[] NOT NULL DEFAULT '{}',  -- 内容警告
  ADD COLUMN IF NOT EXISTS language text DEFAULT 'zh';   -- 语言

-- 游玩记录 + 权限控制
CREATE TABLE public.script_play_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id uuid NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  activity_id uuid REFERENCES public.activity_records(id),
  can_view_full boolean NOT NULL DEFAULT false,  -- 管理员授权后才能看完整内容
  played_at date,
  rating int CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (script_id, member_id)
);

-- RLS
ALTER TABLE public.script_play_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all" ON public.script_play_records
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "player_read_own" ON public.script_play_records
  FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()));

-- Indexes
CREATE INDEX idx_play_records_script ON public.script_play_records(script_id);
CREATE INDEX idx_play_records_member ON public.script_play_records(member_id);
CREATE INDEX IF NOT EXISTS idx_scripts_warnings ON public.scripts USING gin(warnings);
