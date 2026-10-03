-- Read-only release inventory. Run with a trusted database operator after
-- applying 20261003042356_peer_review_history_and_pending_report_edits.sql.
-- All ok values must be true.
-- Does not query player names, comments, report details, or any audit payload.
WITH expected(signature, player_api) AS (VALUES
  ('public.player_list_round_peer_review_events()', true),
  ('public.player_get_round_peer_reviews(uuid,text,integer,integer)', true),
  ('public.player_save_round_peer_review(uuid,uuid,numeric,text,integer)', true),
  ('public.player_save_round_peer_report(uuid,uuid,text,text,integer)', true),
  ('public.player_update_round_peer_report(uuid,uuid,text,text,integer,uuid)', true),
  ('public.player_submit_round_peer_feedback(uuid,uuid,numeric,text,integer,text,text,integer,uuid)', true),
  ('public.admin_list_round_peer_review_events()', false),
  ('public.admin_get_round_peer_reviews(uuid)', false),
  ('public.admin_save_round_peer_review_settings(uuid,boolean,timestamp with time zone,timestamp with time zone,integer,text)', false),
  ('public.admin_confirm_round_peer_review_roster(uuid,uuid[],integer,text)', false),
  ('public.admin_set_round_peer_review_participant(uuid,uuid,boolean,text)', false),
  ('public.admin_resolve_round_peer_report(uuid,text,text,integer,text)', false),
  ('public.admin_moderate_round_peer_review(uuid,boolean,integer,text)', false),
  ('public.admin_preflight_member_lifecycle(uuid)', false)
), actual AS (
  SELECT e.*,p.oid,p.prosecdef,p.proconfig
  FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
)
SELECT signature,player_api,
  COALESCE(oid IS NOT NULL AND prosecdef AND 'search_path=""'=ANY(proconfig)
    AND has_function_privilege('authenticated',oid,'EXECUTE')
    AND NOT has_function_privilege('anon',oid,'EXECUTE')
    AND NOT has_function_privilege('service_role',oid,'EXECUTE'),false) AS ok
FROM actual ORDER BY signature;

WITH expected(name) AS (VALUES
  ('private.round_peer_review_settings'),('private.round_peer_review_participants'),
  ('private.round_peer_reviews'),('private.round_peer_reports'),('private.round_peer_review_audit')
)
SELECT e.name,COALESCE(c.relrowsecurity
  AND NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE'),false) AS ok
FROM expected e LEFT JOIN pg_class c ON c.oid=to_regclass(e.name) ORDER BY e.name;

SELECT p.oid::regprocedure AS private_helper,
  NOT has_function_privilege('anon',p.oid,'EXECUTE')
    AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')
    AND 'search_path=""'=ANY(p.proconfig) AS ok
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='private' AND p.proname LIKE 'peer\_%' ESCAPE '\'
ORDER BY p.proname;

SELECT 'anonymization_trigger' AS check_name,EXISTS(
  SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.members'::regclass
    AND t.tgname='peer_scrub_anonymized_member' AND t.tgenabled='O'
    AND t.tgfoid='private.peer_scrub_anonymized_member()'::regprocedure
) AS ok
UNION ALL SELECT 'preserved_lifecycle_function',to_regprocedure('private.peer_review_prior_member_preflight(uuid)') IS NOT NULL
UNION ALL SELECT 'review_directed_pair_unique',EXISTS(
  SELECT 1 FROM pg_constraint WHERE conrelid='private.round_peer_reviews'::regclass
    AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (round_id, reviewer_id, reviewee_id)'
)
UNION ALL SELECT 'report_directed_pair_unique',EXISTS(
  SELECT 1 FROM pg_constraint WHERE conrelid='private.round_peer_reports'::regclass
    AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (round_id, reporter_id, reviewee_id)'
)
UNION ALL SELECT 'idempotency_unique',EXISTS(
  SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('private.round_peer_request_uidx') AND indisunique AND indisvalid
);
