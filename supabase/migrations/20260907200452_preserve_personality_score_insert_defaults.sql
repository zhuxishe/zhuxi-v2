-- The legacy score columns are NOT NULL and are also inserted by Admin paths.
-- Preserve their storage contract; the Player UI recognizes an unanswered
-- placeholder by the absence of self-assessment answers, without rewriting
-- existing scores or mistaking an explicitly answered midpoint for missing data.
ALTER TABLE public.member_personality
  ALTER COLUMN extroversion SET DEFAULT 3,
  ALTER COLUMN initiative SET DEFAULT 3,
  ALTER COLUMN emotional_stability SET DEFAULT 3;
