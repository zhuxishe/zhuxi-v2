-- 019: 剧本页面图片（PDF转WebP用于翻页书展示）
ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS page_images text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS page_count int DEFAULT 0;
