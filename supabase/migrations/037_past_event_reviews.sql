-- 037: Past event reviews for public landing menu

CREATE TABLE IF NOT EXISTS public.past_event_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text NOT NULL,
  cover_url text NOT NULL,
  gallery_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_url text,
  event_date date,
  is_published boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS past_event_reviews_updated_at ON public.past_event_reviews;
CREATE TRIGGER past_event_reviews_updated_at
  BEFORE UPDATE ON public.past_event_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.past_event_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_read_published_reviews" ON public.past_event_reviews;
CREATE POLICY "anyone_read_published_reviews" ON public.past_event_reviews
  FOR SELECT USING (is_published = true);

DROP POLICY IF EXISTS "admin_all_reviews" ON public.past_event_reviews;
CREATE POLICY "admin_all_reviews" ON public.past_event_reviews
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_past_event_reviews_public_order
  ON public.past_event_reviews(is_published, sort_order, event_date DESC, created_at DESC);
