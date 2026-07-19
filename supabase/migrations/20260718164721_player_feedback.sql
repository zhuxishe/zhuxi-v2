-- Authenticated Player feedback with an admin-only processing workflow.

CREATE TABLE public.player_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  member_name_snapshot text NOT NULL
    CHECK (char_length(btrim(member_name_snapshot)) BETWEEN 1 AND 200),
  client_submission_id uuid NOT NULL,
  category text NOT NULL
    CHECK (category IN ('product', 'activity', 'matching', 'community', 'other')),
  content text NOT NULL
    CHECK (char_length(btrim(content)) BETWEEN 10 AND 500),
  page_path text NOT NULL DEFAULT '/app'
    CHECK (char_length(page_path) BETWEEN 1 AND 500
      AND (page_path = '/app' OR page_path LIKE '/app/%')),
  locale text NOT NULL DEFAULT 'zh'
    CHECK (locale IN ('zh', 'ja')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed')),
  admin_note text
    CHECK (admin_note IS NULL OR char_length(admin_note) <= 2000),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_feedback_member_submission_unique
    UNIQUE (member_id, client_submission_id),
  CONSTRAINT player_feedback_completion_consistency
    CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

CREATE INDEX idx_player_feedback_status_created_at
  ON public.player_feedback(status, created_at DESC);
CREATE INDEX idx_player_feedback_member_created_at
  ON public.player_feedback(member_id, created_at DESC);

CREATE TRIGGER player_feedback_updated_at
  BEFORE UPDATE ON public.player_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_player_feedback_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.member_id::text, 0));
  IF EXISTS (
    SELECT 1
    FROM public.player_feedback
    WHERE member_id = NEW.member_id
      AND client_submission_id = NEW.client_submission_id
  ) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.player_feedback
    WHERE member_id = NEW.member_id
      AND created_at > now() - interval '10 seconds'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'player_feedback_rate_limited';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER player_feedback_rate_limit
  BEFORE INSERT ON public.player_feedback
  FOR EACH ROW EXECUTE FUNCTION public.enforce_player_feedback_rate_limit();

ALTER TABLE public.player_feedback ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies are intentional. Player submissions and all
-- reads/updates go through authenticated Server Actions using service_role.
REVOKE ALL ON TABLE public.player_feedback FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.player_feedback TO service_role;
REVOKE ALL ON FUNCTION public.enforce_player_feedback_rate_limit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_player_feedback_rate_limit() TO service_role;

COMMENT ON TABLE public.player_feedback IS
  'Real-name Player feedback; accessible only through server-side workflows.';
