-- Supabase default privileges grant service_role all table privileges and
-- grant function execution to API roles. Narrow the feedback workflow to the
-- permissions intended by the original migration.

REVOKE ALL ON TABLE public.player_feedback
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.player_feedback TO service_role;

REVOKE ALL ON FUNCTION public.enforce_player_feedback_rate_limit()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_player_feedback_rate_limit()
  TO service_role;
