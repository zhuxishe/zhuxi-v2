-- Read-only verification of the automatic fixed-event roster migration.
BEGIN TRANSACTION READ ONLY;
DO $audit$
DECLARE v_name text; v_definition text; v_signature text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='private'
    AND table_name='round_peer_review_settings' AND column_name='auto_include_registered'
    AND data_type='boolean' AND is_nullable='NO' AND column_default='true') THEN
    RAISE EXCEPTION 'AUTO_ROSTER_SETTING_INVALID';
  END IF;
  FOREACH v_name IN ARRAY ARRAY[
    'private.sync_registered_peer_review_roster(uuid,uuid,uuid,text)',
    'private.save_round_peer_review_settings(uuid,boolean,timestamp with time zone,timestamp with time zone,integer,text,boolean)',
    'private.include_registered_peer_review_participant()'
  ] LOOP
    IF has_function_privilege('anon',v_name,'EXECUTE')
      OR has_function_privilege('authenticated',v_name,'EXECUTE')
      OR has_function_privilege('service_role',v_name,'EXECUTE')
      OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=v_name::regprocedure
        AND proconfig @> ARRAY['search_path=""']::text[]
        AND prosecdef=(v_name='private.include_registered_peer_review_participant()')) THEN
      RAISE EXCEPTION 'AUTO_ROSTER_HELPER_PRIVILEGES_INVALID';
    END IF;
  END LOOP;
  FOREACH v_signature IN ARRAY ARRAY[
    'uuid,boolean,timestamp with time zone,timestamp with time zone,integer,text',
    'uuid,boolean,timestamp with time zone,timestamp with time zone,integer,text,boolean'
  ] LOOP
    v_name := 'public.admin_save_round_peer_review_settings('||v_signature||')';
    IF NOT has_function_privilege('authenticated',v_name,'EXECUTE')
      OR has_function_privilege('anon',v_name,'EXECUTE')
      OR has_function_privilege('service_role',v_name,'EXECUTE')
      OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=v_name::regprocedure
        AND prosecdef AND pronargdefaults=0 AND proconfig @> ARRAY['search_path=""']::text[]) THEN
      RAISE EXCEPTION 'AUTO_ROSTER_RPC_PRIVILEGES_INVALID';
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.match_round_submissions'::regclass
    AND tgname='include_registered_peer_review_participant' AND tgenabled='O'
    AND tgfoid='private.include_registered_peer_review_participant()'::regprocedure
    AND position('UPDATE OF cancelled_at' IN pg_get_triggerdef(oid))>0 AND tgqual IS NULL) THEN
    RAISE EXCEPTION 'AUTO_ROSTER_TRIGGER_INVALID';
  END IF;
  v_definition := pg_get_functiondef('private.include_registered_peer_review_participant()'::regprocedure);
  IF position('(OLD.cancelled_at IS NULL) IS DISTINCT FROM (NEW.cancelled_at IS NULL)' IN v_definition)=0
    OR position('AND v_added=0' IN v_definition)=0
    OR position('version=version+1' IN v_definition)=0
    OR position('p.included' IN v_definition)=0 THEN
    RAISE EXCEPTION 'AUTO_ROSTER_CANCELLATION_VERSION_INVALID';
  END IF;
  v_definition := pg_get_functiondef('private.sync_registered_peer_review_roster(uuid,uuid,uuid,text)'::regprocedure);
  IF position('purpose=''registration''' IN v_definition)=0
    OR position('deleted_at IS NULL FOR SHARE' IN v_definition)=0
    OR position('WHERE round_id=p_round_id FOR UPDATE' IN v_definition)=0
    OR position('NOT v_setting.auto_include_registered' IN v_definition)=0
    OR position('peer-review-settings:' IN v_definition)=0
    OR position('s.cancelled_at IS NULL' IN v_definition)=0
    OR position('private.peer_member_eligible' IN v_definition)=0
    OR position('ON CONFLICT(round_id,member_id) DO NOTHING' IN v_definition)=0
    OR position('version=version+v_added' IN v_definition)=0
    OR position('UPDATE public.match_round_submissions' IN v_definition)>0 THEN
    RAISE EXCEPTION 'AUTO_ROSTER_SYNC_GUARDS_INVALID';
  END IF;
  v_definition := pg_get_functiondef('private.save_round_peer_review_settings(uuid,boolean,timestamptz,timestamptz,integer,text,boolean)'::regprocedure);
  IF position('private.peer_current_admin()' IN v_definition)=0
    OR position('private.peer_lock_admin()' IN v_definition)=0
    OR position('PEER_VERSION_CONFLICT' IN v_definition)=0
    OR position('COALESCE(p_auto_include_registered,v_before.auto_include_registered,true)' IN v_definition)=0
    OR position('p_enabled AND NOT v_auto' IN v_definition)=0
    OR position('private.peer_effective_opened_at(v_before)' IN v_definition)=0 THEN
    RAISE EXCEPTION 'AUTO_ROSTER_SETTINGS_GUARDS_INVALID';
  END IF;
  v_definition := pg_get_functiondef('private.peer_member_eligible(uuid,uuid)'::regprocedure);
  IF position('s.cancelled_at IS NOT NULL' IN v_definition)=0
    OR position('auto_include_registered' IN v_definition)>0 THEN
    RAISE EXCEPTION 'AUTO_ROSTER_CANCELLATION_ELIGIBILITY_CHANGED';
  END IF;
  v_definition := pg_get_functiondef('public.admin_confirm_round_peer_review_roster(uuid,uuid[],integer,text)'::regprocedure);
  IF position('private.restore_round_roster_registration' IN v_definition)=0
    OR position('PEER_VERSION_CONFLICT' IN v_definition)=0 THEN
    RAISE EXCEPTION 'AUTO_ROSTER_MANUAL_RESTORE_CHANGED';
  END IF;
END;
$audit$;

-- Counts only; never expose member identities or perform a real signup as a test.
SELECT count(*) FILTER (WHERE r.purpose='registration' AND s.auto_include_registered) AS automatic_fixed_events,
  count(*) FILTER (WHERE r.purpose='registration' AND NOT s.auto_include_registered) AS manual_fixed_events,
  count(*) FILTER (WHERE r.purpose<>'registration' AND s.auto_include_registered) AS unsupported_automatic_settings
FROM private.round_peer_review_settings s JOIN public.match_rounds r ON r.id=s.round_id WHERE r.deleted_at IS NULL;
COMMIT;
