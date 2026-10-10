-- Read-only verification after flexible registration and attendance reconciliation.
BEGIN TRANSACTION READ ONLY;
DO $audit$
DECLARE definition text; function_name text;
BEGIN
  definition := pg_get_functiondef('private.guard_round_content_write()'::regprocedure);
  IF position('event_start <= now()' IN definition)>0
    OR position('ROUND_REGISTRATION_DEADLINE_INVALID' IN definition)>0
    OR position('ROUND_STRUCTURE_LOCKED' IN definition)=0
    OR position($fragment$NEW.purpose <> 'registration'$fragment$ IN definition)=0 THEN
    RAISE EXCEPTION 'FLEXIBLE_REGISTRATION_CONTENT_GUARD_INVALID';
  END IF;
  definition := pg_get_functiondef('public.admin_confirm_round_peer_review_roster(uuid,uuid[],integer,text)'::regprocedure);
  IF position('private.peer_lock_admin()' IN definition)=0
    OR position('private.insert_round_roster_registration' IN definition)=0
    OR position('deleted_at IS NULL' IN definition)=0
    OR position('SET enabled=false' IN definition)>0 THEN
    RAISE EXCEPTION 'FLEXIBLE_REGISTRATION_ROSTER_GUARD_INVALID';
  END IF;
  IF NOT has_function_privilege('authenticated','public.admin_confirm_round_peer_review_roster(uuid,uuid[],integer,text)','EXECUTE')
    OR has_function_privilege('anon','public.admin_confirm_round_peer_review_roster(uuid,uuid[],integer,text)','EXECUTE')
    OR has_function_privilege('service_role','public.admin_confirm_round_peer_review_roster(uuid,uuid[],integer,text)','EXECUTE') THEN
    RAISE EXCEPTION 'FLEXIBLE_REGISTRATION_ROSTER_GRANTS_INVALID';
  END IF;
  FOREACH function_name IN ARRAY ARRAY['private.round_roster_signup_authorized(uuid,uuid)',
    'private.insert_round_roster_registration(uuid,uuid,text,boolean)'] LOOP
    IF has_function_privilege('anon',function_name,'EXECUTE')
      OR has_function_privilege('authenticated',function_name,'EXECUTE')
      OR has_function_privilege('service_role',function_name,'EXECUTE')
      OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=function_name::regprocedure AND NOT prosecdef
        AND proconfig @> ARRAY['search_path=""']::text[]) THEN
      RAISE EXCEPTION 'FLEXIBLE_REGISTRATION_HELPER_GRANTS_INVALID';
    END IF;
  END LOOP;
  IF position('v_round.deleted_at IS NOT NULL' IN pg_get_functiondef('private.member_master_guard_round_submission_write()'::regprocedure))=0
    OR position('v_roster_signup' IN pg_get_functiondef('private.member_master_guard_round_submission_write()'::regprocedure))=0
    OR position('app.round_roster_signup_notify' IN pg_get_functiondef('private.notify_round_submission()'::regprocedure))=0 THEN
    RAISE EXCEPTION 'FLEXIBLE_REGISTRATION_SUBMISSION_GUARDS_INVALID';
  END IF;
  IF EXISTS (
    SELECT 1 FROM private.round_peer_review_participants p
    JOIN private.round_peer_review_settings s ON s.round_id=p.round_id AND s.roster_confirmed
    JOIN public.match_rounds r ON r.id=p.round_id AND r.purpose='registration' AND r.deleted_at IS NULL
    WHERE p.included AND p.source='manual' AND private.peer_member_eligible(p.round_id,p.member_id)
      AND NOT EXISTS (SELECT 1 FROM public.match_round_submissions sub WHERE sub.round_id=p.round_id AND sub.member_id=p.member_id)
  ) THEN RAISE EXCEPTION 'FLEXIBLE_REGISTRATION_BACKFILL_INCOMPLETE'; END IF;
END;
$audit$;
SELECT count(*) AS confirmed_manual_registrations
  FROM private.round_peer_review_participants p
  JOIN private.round_peer_review_settings s ON s.round_id=p.round_id AND s.roster_confirmed
  JOIN public.match_rounds r ON r.id=p.round_id AND r.purpose='registration' AND r.deleted_at IS NULL
  JOIN public.match_round_submissions sub ON sub.round_id=p.round_id AND sub.member_id=p.member_id AND sub.cancelled_at IS NULL
  WHERE p.included AND p.source='manual';
COMMIT;
