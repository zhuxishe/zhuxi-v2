-- Materialize valid fixed-event registrations into the private review roster.
-- Review windows, cancellation eligibility and explicit admin exclusions remain authoritative.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

ALTER TABLE private.round_peer_review_settings
  ADD COLUMN auto_include_registered boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION private.peer_settings_json(p_round_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT COALESCE((SELECT jsonb_build_object('enabled',s.enabled,'opens_at',s.opens_at,
    'closes_at',s.closes_at,'opened_at',private.peer_effective_opened_at(s),
    'roster_confirmed',s.roster_confirmed,'version',s.version,
    'auto_include_registered',r.purpose='registration' AND s.auto_include_registered,
    'auto_include_supported',r.purpose='registration')
    FROM private.round_peer_review_settings s JOIN public.match_rounds r ON r.id=s.round_id WHERE s.round_id=p_round_id),
    jsonb_build_object('enabled',false,'opens_at',NULL,'closes_at',NULL,'opened_at',NULL,'roster_confirmed',false,'version',0,
      'auto_include_registered',EXISTS(SELECT 1 FROM public.match_rounds WHERE id=p_round_id AND purpose='registration'),
      'auto_include_supported',EXISTS(SELECT 1 FROM public.match_rounds WHERE id=p_round_id AND purpose='registration')))
$function$;

-- Private invoker helper: only the authenticated admin RPC, the guarded
-- submission trigger, and this owner-run migration can reach it. Never changes
-- submissions, existing roster rows or invalidated reviews.
CREATE FUNCTION private.sync_registered_peer_review_roster(p_round_id uuid,p_member_id uuid,p_actor_admin_id uuid,p_reason text)
RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE v_added integer; v_setting private.round_peer_review_settings;
BEGIN
  PERFORM 1 FROM public.match_rounds WHERE id=p_round_id AND purpose='registration' AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT * INTO v_setting FROM private.round_peer_review_settings WHERE round_id=p_round_id FOR UPDATE;
  IF NOT FOUND THEN
    -- Serialize only first configuration with concurrent first signups. Either
    -- the settings save sees the committed signup, or this trigger sees the
    -- committed settings. Existing settings use their row lock alone.
    PERFORM pg_advisory_xact_lock(hashtextextended('peer-review-settings:'||p_round_id::text,0));
    SELECT * INTO v_setting FROM private.round_peer_review_settings WHERE round_id=p_round_id FOR UPDATE;
  END IF;
  -- Lock before checking the switch, including while it is false, so a signup
  -- racing an administrator's false -> true update cannot miss both syncs.
  IF v_setting.round_id IS NULL OR NOT v_setting.auto_include_registered THEN RETURN 0; END IF;

  -- Do not lock submission/member rows after settings. Concurrent cancellation
  -- remains safe because all player review reads/writes recheck live eligibility.
  -- DO NOTHING preserves an administrator's explicit included=false decision.
  WITH added AS (
    INSERT INTO private.round_peer_review_participants(round_id,member_id,included,source)
    SELECT p_round_id,s.member_id,true,'registered' FROM public.match_round_submissions s
    WHERE s.round_id=p_round_id AND s.cancelled_at IS NULL
      AND (p_member_id IS NULL OR s.member_id=p_member_id)
      AND private.peer_member_eligible(p_round_id,s.member_id)
    ORDER BY s.member_id
    ON CONFLICT(round_id,member_id) DO NOTHING
    RETURNING member_id
  ), logged AS (
    INSERT INTO private.round_peer_review_audit(round_id,action,subject_id,actor_admin_id,reason,after_values)
    SELECT p_round_id,'registration_auto_included',member_id,p_actor_admin_id,p_reason,
      jsonb_build_object('included',true,'source','registered','auto_include_registered',true) FROM added
    RETURNING id
  ) SELECT count(*)::integer INTO v_added FROM logged;

  IF v_added>0 THEN
    UPDATE private.round_peer_review_settings SET version=version+v_added,updated_at=clock_timestamp() WHERE round_id=p_round_id;
  END IF;
  RETURN v_added;
END;
$function$;
REVOKE ALL ON FUNCTION private.sync_registered_peer_review_roster(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.include_registered_peer_review_participant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_added integer;
BEGIN
  -- The existing BEFORE guards and RLS authorize the signup/rejoin. This AFTER
  -- trigger cannot create or restore a signup, or bypass their answer checks.
  -- The helper also serializes cancellations with a concurrent first settings
  -- save; its strict live-signup filter never adds a cancelled registration.
  v_added := private.sync_registered_peer_review_roster(NEW.round_id,NEW.member_id,NULL,'有效报名自动纳入互评名册');
  IF TG_OP='UPDATE' AND (OLD.cancelled_at IS NULL) IS DISTINCT FROM (NEW.cancelled_at IS NULL) AND v_added=0 THEN
    -- A previously included attendee changing eligibility must invalidate an
    -- administrator's old checkbox selection in either direction. Do not add
    -- duplicate inclusion audits or restore any historical invalid scores.
    UPDATE private.round_peer_review_settings s SET version=version+1,updated_at=clock_timestamp()
      WHERE s.round_id=NEW.round_id
        AND EXISTS (SELECT 1 FROM public.match_rounds r WHERE r.id=NEW.round_id AND r.purpose='registration' AND r.deleted_at IS NULL)
        AND EXISTS (SELECT 1 FROM private.round_peer_review_participants p WHERE p.round_id=NEW.round_id AND p.member_id=NEW.member_id AND p.included);
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.include_registered_peer_review_participant() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER include_registered_peer_review_participant
  AFTER INSERT OR UPDATE OF cancelled_at ON public.match_round_submissions
  FOR EACH ROW
  EXECUTE FUNCTION private.include_registered_peer_review_participant();

-- NULL auto means the legacy six-argument call: preserve the locked setting's
-- current choice instead of silently switching an administrator's opt-out on.
CREATE FUNCTION private.save_round_peer_review_settings(p_round_id uuid,p_enabled boolean,p_opens_at timestamptz,
  p_closes_at timestamptz,p_expected_version integer,p_reason text,p_auto_include_registered boolean)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE
  v_admin uuid:=private.peer_current_admin();
  v_before private.round_peer_review_settings;
  v_after private.round_peer_review_settings;
  v_purpose text;
  v_auto boolean;
BEGIN
  PERFORM private.peer_lock_admin();
  PERFORM private.peer_require_reason(p_reason);
  IF p_enabled IS NULL OR p_opens_at IS NULL OR p_closes_at IS NULL OR p_opens_at>=p_closes_at
    OR NOT isfinite(p_opens_at) OR NOT isfinite(p_closes_at) THEN RAISE EXCEPTION 'PEER_SETTINGS_INVALID' USING ERRCODE='22023'; END IF;
  -- Settings never edit the round. SHARE keeps deletion serialized while
  -- remaining compatible with signup guards' row -> round -> settings order.
  SELECT purpose INTO v_purpose FROM public.match_rounds WHERE id=p_round_id AND purpose<>'announcement' AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEER_ROUND_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_before FROM private.round_peer_review_settings WHERE round_id=p_round_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('peer-review-settings:'||p_round_id::text,0));
    SELECT * INTO v_before FROM private.round_peer_review_settings WHERE round_id=p_round_id FOR UPDATE;
  END IF;
  IF p_expected_version IS NULL OR COALESCE(v_before.version,0)<>p_expected_version THEN RAISE EXCEPTION 'PEER_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  v_auto := v_purpose='registration' AND COALESCE(p_auto_include_registered,v_before.auto_include_registered,true);
  IF p_enabled AND private.peer_effective_opened_at(v_before) IS NULL AND p_closes_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'PEER_SETTINGS_INVALID' USING ERRCODE='22023'; END IF;
  IF p_enabled AND NOT v_auto AND (v_before.round_id IS NULL OR NOT v_before.roster_confirmed OR
    (SELECT count(*) FROM private.round_peer_review_participants p WHERE p.round_id=p_round_id AND private.peer_participant_eligible(p_round_id,p.member_id))<2) THEN
    RAISE EXCEPTION 'PEER_ROSTER_REQUIRED' USING ERRCODE='55000'; END IF;
  IF v_before.round_id IS NULL THEN
    INSERT INTO private.round_peer_review_settings(round_id,enabled,opens_at,closes_at,opened_at,roster_confirmed,auto_include_registered)
      VALUES(p_round_id,p_enabled,p_opens_at,p_closes_at,
        CASE WHEN p_enabled AND clock_timestamp()>=p_opens_at THEN clock_timestamp() END,v_auto,v_auto)
      ON CONFLICT(round_id) DO NOTHING RETURNING * INTO v_after;
    IF NOT FOUND THEN RAISE EXCEPTION 'PEER_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  ELSE
    UPDATE private.round_peer_review_settings SET enabled=p_enabled,opens_at=p_opens_at,closes_at=p_closes_at,
      opened_at=COALESCE(private.peer_effective_opened_at(v_before),CASE WHEN p_enabled AND clock_timestamp()>=p_opens_at THEN clock_timestamp() END),
      roster_confirmed=CASE WHEN v_auto THEN true ELSE roster_confirmed END,auto_include_registered=v_auto,
      version=version+1,updated_at=clock_timestamp() WHERE round_id=p_round_id RETURNING * INTO v_after;
  END IF;
  IF v_auto THEN
    PERFORM private.sync_registered_peer_review_roster(p_round_id,NULL,v_admin,btrim(p_reason));
    SELECT * INTO v_after FROM private.round_peer_review_settings WHERE round_id=p_round_id;
  END IF;
  INSERT INTO private.round_peer_review_audit(round_id,action,actor_admin_id,reason,before_values,after_values)
    VALUES(p_round_id,'settings_changed',v_admin,btrim(p_reason),COALESCE(to_jsonb(v_before),'{}'::jsonb),to_jsonb(v_after));
  RETURN private.peer_settings_json(p_round_id);
END;
$function$;
REVOKE ALL ON FUNCTION private.save_round_peer_review_settings(uuid,boolean,timestamptz,timestamptz,integer,text,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.admin_save_round_peer_review_settings(p_round_id uuid,p_enabled boolean,p_opens_at timestamptz,
  p_closes_at timestamptz,p_expected_version integer,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $function$
  SELECT private.save_round_peer_review_settings(p_round_id,p_enabled,p_opens_at,p_closes_at,p_expected_version,p_reason,NULL)
$function$;

CREATE FUNCTION public.admin_save_round_peer_review_settings(p_round_id uuid,p_enabled boolean,p_opens_at timestamptz,
  p_closes_at timestamptz,p_expected_version integer,p_reason text,p_auto_include_registered boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF p_auto_include_registered IS NULL THEN RAISE EXCEPTION 'PEER_SETTINGS_INVALID' USING ERRCODE='22023'; END IF;
  RETURN private.save_round_peer_review_settings(p_round_id,p_enabled,p_opens_at,p_closes_at,p_expected_version,p_reason,p_auto_include_registered);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_save_round_peer_review_settings(uuid,boolean,timestamptz,timestamptz,integer,text),
  public.admin_save_round_peer_review_settings(uuid,boolean,timestamptz,timestamptz,integer,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_round_peer_review_settings(uuid,boolean,timestamptz,timestamptz,integer,text),
  public.admin_save_round_peer_review_settings(uuid,boolean,timestamptz,timestamptz,integer,text,boolean) TO authenticated;

-- Existing fixed events adopt the rule without changing their review switches
-- or time windows. Unconfigured events acquire it on their first settings save;
-- no review dates are invented. Matching rounds retain manual roster behavior.
UPDATE private.round_peer_review_settings s SET auto_include_registered=false
  FROM public.match_rounds r WHERE r.id=s.round_id AND r.purpose<>'registration';
DO $backfill$
DECLARE v_round uuid;
BEGIN
  FOR v_round IN SELECT r.id FROM public.match_rounds r JOIN private.round_peer_review_settings s ON s.round_id=r.id
    WHERE r.purpose='registration' AND r.deleted_at IS NULL ORDER BY r.id
  LOOP
    UPDATE private.round_peer_review_settings SET roster_confirmed=true,version=version+1,updated_at=clock_timestamp()
      WHERE round_id=v_round;
    PERFORM private.sync_registered_peer_review_roster(v_round,NULL,NULL,'现有活动的有效报名自动纳入互评名册');
  END LOOP;
END;
$backfill$;

NOTIFY pgrst, 'reload schema';
COMMIT;
