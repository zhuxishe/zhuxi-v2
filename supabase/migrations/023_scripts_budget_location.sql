-- 023: scripts 表添加 budget 和 location 字段
-- 用于剧本卡片展示预算和地点信息

ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS budget text,
  ADD COLUMN IF NOT EXISTS location text;

COMMENT ON COLUMN public.scripts.budget IS '预算范围，如 ¥2000-3000/人';
COMMENT ON COLUMN public.scripts.location IS '游玩地点，如 池袋/新宿';
