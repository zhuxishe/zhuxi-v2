-- 025: testimonials table for landing page
CREATE TABLE public.testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  school text,
  quote text NOT NULL,
  is_published boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_read_published" ON public.testimonials
  FOR SELECT USING (is_published = true);

CREATE POLICY "admin_all" ON public.testimonials
  FOR ALL TO authenticated USING (public.is_admin());
