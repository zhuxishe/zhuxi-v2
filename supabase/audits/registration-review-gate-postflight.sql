-- Read-only post-deployment checks. Does not enumerate member identities,
-- exemption reasons, feedback, or invoke a write function.
BEGIN READ ONLY;
DO $historical_scope$
BEGIN
  IF (SELECT count(*) FROM public.match_rounds r JOIN private.round_review_requirements q ON q.round_id=r.id
    WHERE NOT r.is_test AND r.deleted_at IS NULL AND r.purpose='matching' AND q.required
      AND r.round_name='竹溪社11月匹配活动' AND r.activity_start=DATE '2026-11-04' AND r.activity_end=DATE '2026-11-17')<>1 THEN
    RAISE EXCEPTION 'REVIEW_GATE_HISTORICAL_ROUND_MUST_BE_VERIFIED';
  END IF;
END;
$historical_scope$;
SELECT r.purpose,q.required,q.publication_observed,count(*) AS round_count
FROM private.round_review_requirements q JOIN public.match_rounds r ON r.id=q.round_id
GROUP BY r.purpose,q.required,q.publication_observed ORDER BY 1,2,3;

SELECT r.id,r.round_name,r.purpose,r.activity_start,r.activity_end,q.required,
  registration_review_gate.ended_at(r.id) AS ended_at
FROM public.match_rounds r LEFT JOIN private.round_review_requirements q ON q.round_id=r.id
WHERE NOT r.is_test AND r.deleted_at IS NULL AND r.purpose='matching'
  AND r.round_name='竹溪社11月匹配活动' AND r.activity_start=DATE '2026-11-04' AND r.activity_end=DATE '2026-11-17';

SELECT p.oid::regprocedure AS function,p.prosecdef,p.proconfig,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS player_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='registration_review_gate'
  OR (n.nspname='public' AND p.proname IN ('player_get_registration_review_gate','admin_get_round_review_requirements','admin_set_round_review_exemption'))
ORDER BY n.nspname,p.proname;

SELECT c.oid::regclass AS relation,c.relrowsecurity,
  has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS player_table_access,
  has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS anonymous_table_access
FROM pg_class c WHERE c.oid IN ('private.round_review_requirements'::regclass,
  'private.round_review_exemptions'::regclass,'private.round_review_exemption_audit'::regclass);

SELECT tgname,pg_get_triggerdef(oid) AS definition FROM pg_trigger
WHERE NOT tgisinternal AND tgname IN ('registration_review_gate_track_publication','y_registration_review_requirement','registration_review_gate_scrub_member')
ORDER BY tgname;

SELECT p.proname,
  position('registration_review_gate.can_rate' IN p.prosrc)>0 AS has_review_window_override,
  position('late_review' IN p.prosrc)>0 AS exposes_late_review,
  position('review_required' IN p.prosrc)>0 AS exposes_requirement_scope
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('player_save_round_peer_review','player_list_round_peer_review_events','player_get_round_peer_reviews');
COMMIT;
