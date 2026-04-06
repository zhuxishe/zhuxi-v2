ALTER TABLE public.interview_evaluations
  ADD COLUMN IF NOT EXISTS attractiveness_score int CHECK (attractiveness_score BETWEEN 1 AND 5);
