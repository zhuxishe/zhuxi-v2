-- Supabase/PostgREST upsert(..., { onConflict: "user_id" }) needs a
-- non-partial unique index that exactly matches ON CONFLICT(user_id).
-- PostgreSQL UNIQUE indexes still allow multiple NULL values, so imported
-- or legacy rows without an auth user remain unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_user_id_full
  ON public.members(user_id);
