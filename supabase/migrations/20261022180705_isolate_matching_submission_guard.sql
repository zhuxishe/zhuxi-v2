-- Production exposes the legacy private schema through PostgREST. Isolate only
-- the three matching compare-and-save implementation functions added above;
-- keep their OIDs, grants, bodies and trigger binding unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

CREATE SCHEMA matching_submission_guard AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA matching_submission_guard FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA matching_submission_guard TO authenticated;

ALTER FUNCTION private.matching_submission_updated_at()
  SET SCHEMA matching_submission_guard;
ALTER FUNCTION private.save_my_matching_submission(uuid,uuid,timestamptz,integer,jsonb)
  SET SCHEMA matching_submission_guard;
ALTER FUNCTION private.admin_update_matching_submission(uuid,timestamptz,jsonb,text)
  SET SCHEMA matching_submission_guard;

-- Preserve the existing public API, invocation security and execute grants.
CREATE OR REPLACE FUNCTION public.save_my_matching_submission(
  p_round_id uuid, p_submission_id uuid DEFAULT NULL, p_expected_updated_at timestamptz DEFAULT NULL,
  p_config_revision integer DEFAULT NULL, p_answers jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  SELECT matching_submission_guard.save_my_matching_submission(p_round_id,p_submission_id,p_expected_updated_at,p_config_revision,p_answers)
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_matching_submission(
  p_submission_id uuid, p_expected_updated_at timestamptz, p_answers jsonb, p_reason text
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  SELECT matching_submission_guard.admin_update_matching_submission(p_submission_id,p_expected_updated_at,p_answers,p_reason)
$function$;
COMMIT;
