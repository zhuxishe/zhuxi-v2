-- Phase 5: Script library

CREATE TABLE public.scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  title_ja text,
  description text,
  author text,
  player_count_min int DEFAULT 4,
  player_count_max int DEFAULT 6,
  duration_minutes int DEFAULT 180,
  difficulty text DEFAULT 'intermediate' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  genre_tags text[] NOT NULL DEFAULT '{}',
  theme_tags text[] NOT NULL DEFAULT '{}',
  cover_url text,
  pdf_url text,
  is_published boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  play_count int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER scripts_updated_at
  BEFORE UPDATE ON public.scripts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "admin_all_scripts" ON public.scripts
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Player: read published scripts
CREATE POLICY "player_read_published" ON public.scripts
  FOR SELECT TO authenticated
  USING (is_published = true);

-- Public: read published scripts (for SEO)
CREATE POLICY "anon_read_published" ON public.scripts
  FOR SELECT TO anon
  USING (is_published = true);

-- Indexes
CREATE INDEX idx_scripts_published ON public.scripts(is_published) WHERE is_published = true;
CREATE INDEX idx_scripts_genre ON public.scripts USING gin(genre_tags);

-- NOTE: Supabase Storage bucket 'scripts' must be created manually via Dashboard:
-- 1. Go to Storage > New bucket
-- 2. Name: "scripts", Public: true
-- 3. Allowed MIME: application/pdf, image/*
-- 4. Max file size: 50MB
