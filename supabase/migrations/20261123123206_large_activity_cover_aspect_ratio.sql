BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.past_event_reviews
  ADD COLUMN cover_aspect_ratio text NOT NULL DEFAULT '3:4'
  CONSTRAINT past_event_reviews_cover_aspect_ratio_check
    CHECK (cover_aspect_ratio IN ('3:4', '2:3', '9:16', '1:1', '4:3', '16:9'));

NOTIFY pgrst, 'reload schema';

COMMIT;
