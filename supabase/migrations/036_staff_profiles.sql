-- 036: Staff profiles for landing about section

CREATE TABLE IF NOT EXISTS public.staff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  school text NOT NULL,
  major text NOT NULL,
  intro text NOT NULL,
  avatar_url text,
  is_published boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS staff_profiles_updated_at ON public.staff_profiles;
CREATE TRIGGER staff_profiles_updated_at
  BEFORE UPDATE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_read_published_staff" ON public.staff_profiles;
CREATE POLICY "anyone_read_published_staff" ON public.staff_profiles
  FOR SELECT USING (is_published = true);

DROP POLICY IF EXISTS "admin_all_staff" ON public.staff_profiles;
CREATE POLICY "admin_all_staff" ON public.staff_profiles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_staff_profiles_published_order
  ON public.staff_profiles(is_published, sort_order, created_at);
