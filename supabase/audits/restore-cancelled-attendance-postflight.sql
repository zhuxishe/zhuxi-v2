-- Read-only structural checks; never restores real registrations as a probe.
BEGIN TRANSACTION READ ONLY;
DO $audit$
DECLARE definition text; function_name text;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'private.peer_roster_registration_restore_eligible(uuid,uuid)',
    'private.round_roster_restore_authorized(uuid,uuid,uuid)',
    'private.restore_round_roster_registration(uuid,uuid,text)'
  ] LOOP
    IF has_function_privilege('anon',function_name,'EXECUTE')
      OR has_function_privilege('authenticated',function_name,'EXECUTE')
      OR has_function_privilege('service_role',function_name,'EXECUTE')
      OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=function_name::regprocedure AND NOT prosecdef
        AND proconfig @> ARRAY['search_path=""']::text[]) THEN
      RAISE EXCEPTION 'ROSTER_RESTORE_HELPER_PRIVILEGES_INVALID';
    END IF;
  END LOOP;
  definition := pg_get_functiondef('private.peer_member_eligible(uuid,uuid)'::regprocedure);
  IF position('s.cancelled_at IS NOT NULL' IN definition)=0
    OR position('peer_roster_registration_restore_eligible' IN definition)>0 THEN
    RAISE EXCEPTION 'ROSTER_RESTORE_PLAYER_ELIGIBILITY_CHANGED';
  END IF;
  definition := pg_get_functiondef('public.admin_confirm_round_peer_review_roster(uuid,uuid[],integer,text)'::regprocedure);
  IF position('private.peer_lock_admin()' IN definition)=0
    OR position('PEER_VERSION_CONFLICT' IN definition)=0
    OR position('private.restore_round_roster_registration' IN definition)=0
    OR position('deleted_at IS NULL' IN definition)=0
    OR position('ORDER BY member_id FOR UPDATE' IN definition)=0 THEN
    RAISE EXCEPTION 'ROSTER_RESTORE_CONFIRM_GUARDS_INVALID';
  END IF;
  IF NOT has_function_privilege('authenticated','public.admin_confirm_round_peer_review_roster(uuid,uuid[],integer,text)','EXECUTE')
    OR has_function_privilege('anon','public.admin_confirm_round_peer_review_roster(uuid,uuid[],integer,text)','EXECUTE')
    OR has_function_privilege('service_role','public.admin_confirm_round_peer_review_roster(uuid,uuid[],integer,text)','EXECUTE') THEN
    RAISE EXCEPTION 'ROSTER_RESTORE_CONFIRM_PRIVILEGES_INVALID';
  END IF;
  definition := pg_get_functiondef('private.guard_registration_cancellation()'::regprocedure);
  IF position('private.round_roster_restore_authorized' IN definition)=0
    OR position('to_jsonb(NEW)' IN definition)=0
    OR position('REGISTRATION_STATE_CHANGED' IN definition)=0 THEN
    RAISE EXCEPTION 'ROSTER_RESTORE_STATE_GUARD_INVALID';
  END IF;
  definition := pg_get_functiondef('private.member_master_guard_round_submission_write()'::regprocedure);
  IF position('v_round.deleted_at IS NOT NULL' IN definition)=0
    OR position('v_roster_restore AND NEW.custom_answers IS NOT DISTINCT FROM OLD.custom_answers' IN definition)=0
    OR position('private.validate_round_custom_answers' IN definition)=0 THEN
    RAISE EXCEPTION 'ROSTER_RESTORE_ANSWERS_GUARD_INVALID';
  END IF;
  definition := pg_get_functiondef('public.admin_get_round_peer_reviews(uuid)'::regprocedure);
  IF position('can_restore' IN definition)=0
    OR position('private.peer_participant_eligible' IN definition)=0
    OR position('private.peer_member_eligible' IN definition)=0 THEN
    RAISE EXCEPTION 'ROSTER_RESTORE_ADMIN_CONTEXT_INVALID';
  END IF;
END;
$audit$;
SELECT count(*) AS cancelled_registrations_still_ineligible
FROM public.match_round_submissions s
JOIN public.match_rounds r ON r.id=s.round_id AND r.purpose='registration' AND r.deleted_at IS NULL
WHERE s.cancelled_at IS NOT NULL AND NOT private.peer_member_eligible(s.round_id,s.member_id);
COMMIT;
