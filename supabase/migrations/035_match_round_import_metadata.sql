ALTER TABLE public.match_round_submissions
  ADD COLUMN IF NOT EXISTS import_metadata jsonb;
