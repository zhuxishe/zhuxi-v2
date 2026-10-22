-- Read-only catalog verification. Compare questionnaire/answer digests separately.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH functions(signature,definer) AS (VALUES
  ('private.save_my_matching_submission(uuid,uuid,timestamptz,integer,jsonb)',true),
  ('public.save_my_matching_submission(uuid,uuid,timestamptz,integer,jsonb)',false),
  ('private.admin_update_matching_submission(uuid,timestamptz,jsonb,text)',true),
  ('public.admin_update_matching_submission(uuid,timestamptz,jsonb,text)',false)
)
SELECT signature,
  p.oid IS NOT NULL AS exists,
  p.prosecdef IS NOT DISTINCT FROM f.definer AS expected_security,
  p.proconfig @> ARRAY['search_path=""'] AS empty_search_path,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_allowed,
  NOT has_function_privilege('anon',p.oid,'EXECUTE') AS anon_denied,
  NOT has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role_denied
FROM functions f LEFT JOIN pg_proc p ON p.oid=to_regprocedure(f.signature)
ORDER BY signature;

SELECT p.polname,p.polcmd,NOT p.polpermissive AS restrictive,
  ARRAY(SELECT rolname FROM pg_roles WHERE oid=ANY(p.polroles)) AS roles,
  pg_get_expr(p.polqual,p.polrelid) AS using_expression,
  pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression
FROM pg_policy p WHERE p.polrelid='public.match_round_submissions'::regclass
  AND p.polname='matching_submissions_require_compare_and_save';

SELECT t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition,
  p.prosecdef AS definer,p.proconfig,
  NOT has_function_privilege('anon',p.oid,'EXECUTE') AS anon_denied,
  NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_denied
FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
WHERE t.tgrelid='public.match_round_submissions'::regclass
  AND t.tgname='z_matching_submission_updated_at' AND NOT t.tgisinternal;
COMMIT;
