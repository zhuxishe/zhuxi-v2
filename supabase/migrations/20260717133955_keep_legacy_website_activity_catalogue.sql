-- The Player Activity catalogue shares rows with the legacy public website,
-- but Production still renders the established static catalogue. Keep the
-- migrated seed rows out of that legacy query until website publication is
-- explicitly enabled by an administrator.
UPDATE public.past_event_reviews
SET is_published = false
WHERE source_key IN (
  'red-packet-luck-battle',
  'cat-mouse-game',
  'moonlit-wolf-feast',
  'fuji-q-adventure',
  'komatsuzawa-farm',
  'shinjuku-gyoen-color-picnic',
  'spring-2026-welcome-party',
  'kpop-party',
  'bbq-gathering',
  'team-games',
  'autumn-trip',
  'shibuya-party',
  'boardgame-party',
  'disney-trip',
  'zhuxi-founded'
);
