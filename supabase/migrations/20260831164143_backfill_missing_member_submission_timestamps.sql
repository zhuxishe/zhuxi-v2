-- Forward-only repair for historical completed/submitted profiles that predate
-- the canonical lifecycle timestamp invariant. Preserve an existing business
-- timestamp whenever possible and let the member audit trigger retain a
-- compact before/after record with a migration reason.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

SELECT set_config(
  'app.member_master_audit_source',
  'migration',
  true
);
SELECT set_config(
  'app.member_master_audit_reason',
  '补齐历史成员缺失的资料提交时间',
  true
);

UPDATE public.members
SET submitted_at = COALESCE(
  last_profile_saved_at,
  updated_at,
  created_at,
  statement_timestamp()
)
WHERE profile_stage IN ('submitted', 'complete')
  AND submitted_at IS NULL;

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.members
    WHERE profile_stage IN ('submitted', 'complete')
      AND submitted_at IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'MEMBER_MASTER_SUBMISSION_TIMESTAMP_BACKFILL_INCOMPLETE';
  END IF;
END
$do$;

COMMIT;
