-- Per-activity, self-authored review requirements. No registrations or scores
-- are rewritten. Existing activity scope is snapshotted once; reopening an old
-- activity never opts it in. This migration is intended for reviewed deployment.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

DO $dependencies$
BEGIN
  IF to_regprocedure('public.player_save_round_peer_review(uuid,uuid,numeric,text,integer)') IS NULL
    OR to_regprocedure('private.round_roster_signup_authorized(uuid,uuid)') IS NULL
    OR to_regprocedure('private.round_roster_restore_authorized(uuid,uuid,uuid)') IS NULL
    OR to_regprocedure('private.test_account_round_allowed(uuid,uuid)') IS NULL
    OR to_regprocedure('matching_publication.member_ids(uuid,uuid,uuid[])') IS NULL THEN
    RAISE EXCEPTION 'REVIEW_GATE_DEPENDENCIES_MISSING';
  END IF;
  IF (SELECT count(*) FROM public.match_rounds WHERE NOT is_test AND deleted_at IS NULL AND purpose='matching'
    AND round_name='竹溪社11月匹配活动' AND activity_start=DATE '2026-11-04' AND activity_end=DATE '2026-11-17')>1 THEN
    RAISE EXCEPTION 'REVIEW_GATE_HISTORICAL_ROUND_AMBIGUOUS';
  END IF;
END;
$dependencies$;

CREATE SCHEMA registration_review_gate AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA registration_review_gate FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA registration_review_gate TO authenticated;

CREATE TABLE private.round_review_requirements (
  round_id uuid PRIMARY KEY REFERENCES public.match_rounds(id),
  required boolean NOT NULL,
  publication_observed boolean NOT NULL DEFAULT true,
  enrolled_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE private.round_review_exemptions (
  round_id uuid NOT NULL REFERENCES public.match_rounds(id),
  member_id uuid NOT NULL REFERENCES public.members(id),
  exempt boolean NOT NULL,
  version integer NOT NULL CHECK (version>0),
  reason text,
  updated_by uuid NOT NULL REFERENCES public.admin_users(id),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(round_id,member_id)
);
CREATE TABLE private.round_review_exemption_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  round_id uuid NOT NULL REFERENCES public.match_rounds(id),
  member_id uuid NOT NULL REFERENCES public.members(id),
  actor_admin_id uuid NOT NULL REFERENCES public.admin_users(id),
  exempt boolean NOT NULL,
  version integer NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX round_review_exemption_member_idx ON private.round_review_exemptions(member_id);
CREATE INDEX round_review_exemption_audit_member_idx ON private.round_review_exemption_audit(member_id);
ALTER TABLE private.round_review_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.round_review_exemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.round_review_exemption_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.round_review_requirements,private.round_review_exemptions,private.round_review_exemption_audit FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE private.round_review_exemption_audit_id_seq FROM PUBLIC,anon,authenticated,service_role;

-- Match the agreed historical activity by identity attributes, never by a
-- broad date cutoff or name alone. Test rounds cannot become formal obligations.
INSERT INTO private.round_review_requirements(round_id,required,publication_observed)
SELECT id,NOT is_test AND deleted_at IS NULL AND purpose='matching'
  AND round_name='竹溪社11月匹配活动' AND activity_start=DATE '2026-11-04' AND activity_end=DATE '2026-11-17',
  status<>'draft' OR EXISTS(SELECT 1 FROM public.match_round_submissions s WHERE s.round_id=r.id)
    OR EXISTS(SELECT 1 FROM public.match_sessions s WHERE s.round_id=r.id)
    OR EXISTS(SELECT 1 FROM private.round_peer_review_participants p WHERE p.round_id=r.id)
    OR EXISTS(SELECT 1 FROM private.round_peer_reviews rv WHERE rv.round_id=r.id)
    OR EXISTS(SELECT 1 FROM private.round_peer_reports rp WHERE rp.round_id=r.id)
FROM public.match_rounds r;

-- A never-used existing draft is still awaiting its first publication. A draft
-- with historical submissions, matching sessions, participant roster records or
-- actual feedback remains in the historical scope, including after a status
-- reset. Review settings alone (even already enabled) are not publication proof.

CREATE FUNCTION registration_review_gate.track_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO private.round_review_requirements(round_id,required,publication_observed)
    VALUES(NEW.id,NEW.status='open' AND NEW.purpose IN ('matching','registration') AND NOT NEW.is_test,
      NEW.status<>'draft');
  ELSE
    UPDATE private.round_review_requirements SET
      required=NEW.purpose IN ('matching','registration') AND NOT NEW.is_test,
      publication_observed=true,enrolled_at=clock_timestamp()
    WHERE round_id=NEW.id AND NOT publication_observed AND NEW.status='open' AND NEW.deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER registration_review_gate_track_publication AFTER INSERT OR UPDATE OF status ON public.match_rounds
FOR EACH ROW EXECUTE FUNCTION registration_review_gate.track_publication();

CREATE FUNCTION registration_review_gate.ended_at(p_round_id uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
  SELECT CASE WHEN r.purpose='matching' THEN (r.activity_end+1)::timestamp AT TIME ZONE 'Asia/Tokyo'
    WHEN r.purpose='registration' THEN NULLIF(r.content_config->>'eventEnd','')::timestamptz END
  FROM public.match_rounds r WHERE r.id=p_round_id
$function$;

CREATE FUNCTION registration_review_gate.completed(p_round_id uuid,p_member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
  SELECT CASE r.purpose WHEN 'matching' THEN EXISTS(
    SELECT 1 FROM public.mutual_reviews rv JOIN public.match_results mr ON mr.id=rv.match_result_id
    JOIN public.match_sessions ms ON ms.id=mr.session_id
    WHERE ms.round_id=r.id AND rv.reviewer_id=p_member_id AND rv.reviewee_id<>p_member_id)
  WHEN 'registration' THEN EXISTS(SELECT 1 FROM private.round_peer_reviews rv
    WHERE rv.round_id=r.id AND rv.reviewer_id=p_member_id AND rv.reviewee_id<>p_member_id)
  ELSE false END FROM public.match_rounds r WHERE r.id=p_round_id
$function$;

CREATE FUNCTION registration_review_gate.requirement(p_round_id uuid,p_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_round public.match_rounds%ROWTYPE; v_setting private.round_peer_review_settings%ROWTYPE;
  v_end timestamptz; v_result uuid; v_state text; v_href text;
BEGIN
  SELECT * INTO v_round FROM public.match_rounds WHERE id=p_round_id;
  v_end:=registration_review_gate.ended_at(p_round_id);
  IF NOT FOUND OR v_round.deleted_at IS NOT NULL OR v_round.is_test
    OR NOT EXISTS(SELECT 1 FROM private.round_review_requirements WHERE round_id=p_round_id AND required)
    OR NOT private.test_account_round_allowed(p_round_id,p_member_id) THEN v_state:='unavailable';
  ELSIF registration_review_gate.completed(p_round_id,p_member_id) THEN v_state:='completed';
  ELSIF EXISTS(SELECT 1 FROM private.round_review_exemptions WHERE round_id=p_round_id AND member_id=p_member_id AND exempt) THEN v_state:='exempt';
  ELSIF NOT EXISTS(SELECT 1 FROM public.match_round_submissions s
      WHERE s.round_id=p_round_id AND s.member_id=p_member_id AND s.cancelled_at IS NULL) THEN v_state:='no_target';
  ELSIF v_end IS NULL THEN v_state:='unavailable';
  ELSIF clock_timestamp()<v_end THEN v_state:='not_ended';
  ELSIF v_round.purpose='matching' THEN
    -- Only the currently published result supplies a real, reachable target.
    SELECT mr.id INTO v_result FROM public.match_results mr JOIN public.match_sessions ms ON ms.id=mr.session_id
    JOIN matching_publication.active_assignments a ON a.round_id=p_round_id AND a.member_id=p_member_id AND a.result_id=mr.id
    JOIN matching_publication.publications pub ON pub.id=a.publication_id AND pub.round_id=p_round_id
      AND pub.session_id=ms.id AND pub.version=ms.publication_version AND pub.withdrawn_at IS NULL
    JOIN matching_publication.roster roster ON roster.publication_id=pub.id AND roster.member_id=p_member_id
      AND roster.result_id=mr.id AND roster.outcome='matched'
    WHERE ms.round_id=p_round_id AND ms.status='confirmed' AND mr.status='confirmed'
      AND ms.publication_version>0 AND mr.publication_version=ms.publication_version
      AND p_member_id=ANY(matching_publication.member_ids(mr.member_a_id,mr.member_b_id,mr.group_members))
      AND EXISTS(SELECT 1 FROM unnest(matching_publication.member_ids(mr.member_a_id,mr.member_b_id,mr.group_members)) AS target(id)
        JOIN public.members m ON m.id=target.id WHERE m.id<>p_member_id AND m.account_status='active'
          AND m.status='approved' AND m.membership_type='player' AND m.anonymized_at IS NULL AND m.user_id IS NOT NULL)
    ORDER BY mr.id LIMIT 1;
    IF v_result IS NOT NULL THEN v_state:='pending';v_href:='/app/reviews/new/'||v_result::text;
    ELSIF EXISTS(SELECT 1 FROM public.match_sessions ms JOIN matching_publication.publications pub ON pub.session_id=ms.id
      AND pub.version=ms.publication_version AND pub.withdrawn_at IS NULL
      JOIN matching_publication.roster roster ON roster.publication_id=pub.id AND roster.member_id=p_member_id
      WHERE ms.round_id=p_round_id AND ms.status='confirmed' AND ms.publication_version>0)
      THEN v_state:='no_target';
    ELSE v_state:='unavailable'; END IF;
  ELSE
    v_href:='/app/matches/rounds/'||p_round_id::text||'/reviews';
    SELECT * INTO v_setting FROM private.round_peer_review_settings WHERE round_id=p_round_id;
    IF NOT FOUND OR NOT v_setting.enabled OR NOT v_setting.roster_confirmed OR clock_timestamp()<v_setting.opens_at THEN v_state:='unavailable';
    ELSIF NOT private.peer_participant_eligible(p_round_id,p_member_id) OR NOT EXISTS(
      SELECT 1 FROM private.round_peer_review_participants p WHERE p.round_id=p_round_id AND p.member_id<>p_member_id
        AND private.peer_participant_eligible(p_round_id,p.member_id)) THEN v_state:='no_target';
    ELSE v_state:='pending'; END IF;
  END IF;
  RETURN jsonb_build_object('state',v_state,'ended_at',v_end,'review_href',v_href);
END;
$function$;

CREATE FUNCTION registration_review_gate.blockers(p_member_id uuid,p_target_round_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $function$
  SELECT jsonb_build_object('blockers',COALESCE(jsonb_agg(jsonb_build_object(
    'round_id',r.id,'round_name',r.round_name,'purpose',r.purpose,'ended_at',d.value->'ended_at','review_href',d.value->>'review_href'
  ) ORDER BY d.value->>'ended_at',r.id),'[]'::jsonb))
  FROM private.round_review_requirements q JOIN public.match_rounds r ON r.id=q.round_id
  JOIN public.match_round_submissions s ON s.round_id=r.id AND s.member_id=p_member_id AND s.cancelled_at IS NULL
  CROSS JOIN LATERAL (SELECT registration_review_gate.requirement(r.id,p_member_id) AS value) d
  WHERE q.required AND r.id<>p_target_round_id AND d.value->>'state'='pending'
$function$;

CREATE FUNCTION registration_review_gate.player_get(p_round_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_member uuid:=private.peer_current_player();
BEGIN
  IF NOT private.test_account_round_allowed(p_round_id,v_member) OR NOT EXISTS(
    SELECT 1 FROM public.match_rounds WHERE id=p_round_id AND deleted_at IS NULL AND purpose IN ('matching','registration'))
    THEN RAISE EXCEPTION 'PEER_ROUND_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF EXISTS(SELECT 1 FROM public.match_round_submissions WHERE round_id=p_round_id AND member_id=v_member AND cancelled_at IS NULL)
    THEN RETURN jsonb_build_object('blockers','[]'::jsonb); END IF;
  RETURN registration_review_gate.blockers(v_member,p_round_id);
END;
$function$;
CREATE FUNCTION public.player_get_registration_review_gate(p_round_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $function$
  SELECT registration_review_gate.player_get(p_round_id)
$function$;

CREATE FUNCTION registration_review_gate.guard_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_gate jsonb; v_privileged boolean;
BEGIN
  IF NEW.cancelled_at IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.cancelled_at IS NULL THEN RETURN NEW; END IF;
  -- Reuse existing, live-identity-based administrative authorization. No new
  -- caller-controlled bypass flag is introduced. Player-mode admins remain gated.
  v_privileged:=COALESCE(auth.jwt()->>'role','')='service_role'
    OR (private.member_master_is_super_admin() AND COALESCE(current_setting('app.member_master_submission_self_service',true),'')<>'on')
    OR (TG_OP='INSERT' AND private.round_roster_signup_authorized(NEW.round_id,NEW.member_id));
  IF TG_OP='UPDATE' THEN v_privileged:=v_privileged OR private.round_roster_restore_authorized(NEW.round_id,NEW.member_id,OLD.id); END IF;
  IF COALESCE(v_privileged,false) THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR private.profile_current_approved_member_id() IS DISTINCT FROM NEW.member_id
    THEN RAISE EXCEPTION 'MEMBER_MASTER_SUBMISSION_MEMBER_INVALID' USING ERRCODE='42501'; END IF;
  v_gate:=registration_review_gate.blockers(NEW.member_id,NEW.round_id);
  IF jsonb_array_length(v_gate->'blockers')>0 THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='REGISTRATION_REVIEW_REQUIRED',DETAIL=v_gate::text;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER y_registration_review_requirement BEFORE INSERT OR UPDATE OF cancelled_at ON public.match_round_submissions
FOR EACH ROW EXECUTE FUNCTION registration_review_gate.guard_submission();

CREATE FUNCTION registration_review_gate.can_rate(p_round_id uuid,p_member_id uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $function$
  SELECT COALESCE((SELECT s.enabled AND s.roster_confirmed AND clock_timestamp()>=s.opens_at
    AND private.peer_participant_eligible(p_round_id,p_member_id)
    AND (clock_timestamp()<s.closes_at OR (
      EXISTS(SELECT 1 FROM public.match_rounds r WHERE r.id=p_round_id AND r.purpose='registration')
      AND registration_review_gate.requirement(p_round_id,p_member_id)->>'state'='pending'))
    FROM private.round_peer_review_settings s WHERE s.round_id=p_round_id),false)
$function$;

-- Change only the window predicate; preserve all existing eligibility, version,
-- report atomicity and retry semantics. Fail if the expected source has drifted.
DO $migration$
DECLARE definition text; original text;
BEGIN
  definition:=pg_get_functiondef('public.player_save_round_peer_review(uuid,uuid,numeric,text,integer)'::regprocedure);
  original:=$fragment$IF NOT FOUND OR NOT v_setting.enabled OR NOT v_setting.roster_confirmed
    OR clock_timestamp()<v_setting.opens_at OR clock_timestamp()>=v_setting.closes_at THEN$fragment$;
  IF position(original IN definition)=0 THEN RAISE EXCEPTION 'REVIEW_GATE_SAVE_BASELINE_CHANGED'; END IF;
  EXECUTE replace(definition,original,'IF NOT registration_review_gate.can_rate(p_round_id,v_player) THEN');
  definition:=pg_get_functiondef('public.player_list_round_peer_review_events()'::regprocedure);
  original:='s.enabled AND s.roster_confirmed AND now()>=s.opens_at AND now()<s.closes_at AND private.peer_participant_eligible(r.id,v_player)';
  IF position(original IN definition)=0 THEN RAISE EXCEPTION 'REVIEW_GATE_LIST_BASELINE_CHANGED'; END IF;
  definition:=replace(definition,original,'registration_review_gate.can_rate(r.id,v_player)');
  definition:=replace(definition,'''can_review'',registration_review_gate.can_rate(r.id,v_player)',
    '''review_required'',r.purpose=''registration'' AND EXISTS(SELECT 1 FROM private.round_review_requirements q WHERE q.round_id=r.id AND q.required),''late_review'',now()>=s.closes_at AND registration_review_gate.can_rate(r.id,v_player),''can_review'',registration_review_gate.can_rate(r.id,v_player)');
  EXECUTE definition;
  definition:=pg_get_functiondef('public.player_get_round_peer_reviews(uuid,text,integer,integer)'::regprocedure);
  original:='v_eligible AND v_settings.enabled AND v_settings.roster_confirmed AND now()>=v_settings.opens_at AND now()<v_settings.closes_at';
  IF position(original IN definition)=0 THEN RAISE EXCEPTION 'REVIEW_GATE_GET_BASELINE_CHANGED'; END IF;
  definition:=replace(definition,original,'v_eligible AND registration_review_gate.can_rate(p_round_id,v_player)');
  original:=$fragment$t.visible AND v_settings.enabled AND v_settings.roster_confirmed
      AND now()>=v_settings.opens_at AND now()<v_settings.closes_at AND COALESCE(rv.valid,true)$fragment$;
  IF position(original IN definition)=0 THEN RAISE EXCEPTION 'REVIEW_GATE_HISTORY_BASELINE_CHANGED'; END IF;
  definition:=replace(definition,original,'t.visible AND registration_review_gate.can_rate(p_round_id,v_player) AND COALESCE(rv.valid,true)');
  definition:=replace(definition,'''can_review'',v_eligible AND registration_review_gate.can_rate(p_round_id,v_player)',
    '''review_required'',EXISTS(SELECT 1 FROM private.round_review_requirements q JOIN public.match_rounds round_scope ON round_scope.id=q.round_id WHERE q.round_id=p_round_id AND q.required AND round_scope.purpose=''registration''),''late_review'',now()>=v_settings.closes_at AND registration_review_gate.can_rate(p_round_id,v_player),''can_review'',v_eligible AND registration_review_gate.can_rate(p_round_id,v_player)');
  EXECUTE definition;
END;
$migration$;

CREATE FUNCTION registration_review_gate.admin_get(p_round_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_admin uuid:=private.peer_current_admin(); v_required boolean; v_people jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.match_rounds WHERE id=p_round_id AND deleted_at IS NULL AND NOT is_test AND purpose IN ('matching','registration'))
    THEN RAISE EXCEPTION 'PEER_ROUND_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT required INTO v_required FROM private.round_review_requirements WHERE round_id=p_round_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('member_id',m.id,'full_name',COALESCE(i.full_name,''),'nickname',i.nickname,
    'state',registration_review_gate.requirement(p_round_id,m.id)->>'state','exempt',COALESCE(e.exempt,false),
    'exemption_version',COALESCE(e.version,0),'exemption_reason',e.reason) ORDER BY i.full_name,m.id),'[]'::jsonb) INTO v_people
  FROM public.match_round_submissions s JOIN public.members m ON m.id=s.member_id
  LEFT JOIN public.member_identity i ON i.member_id=m.id
  LEFT JOIN private.round_review_exemptions e ON e.round_id=p_round_id AND e.member_id=m.id
  WHERE s.round_id=p_round_id AND m.anonymized_at IS NULL AND NOT m.is_test;
  RETURN jsonb_build_object('required',COALESCE(v_required,false),'ended_at',registration_review_gate.ended_at(p_round_id),'participants',v_people);
END;
$function$;
CREATE FUNCTION public.admin_get_round_review_requirements(p_round_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $function$
  SELECT registration_review_gate.admin_get(p_round_id)
$function$;

CREATE FUNCTION registration_review_gate.admin_set(p_round_id uuid,p_member_id uuid,p_exempt boolean,p_reason text,p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_admin uuid:=private.peer_current_admin(); v_before private.round_review_exemptions; v_after private.round_review_exemptions;
BEGIN
  PERFORM private.peer_lock_admin();
  PERFORM private.peer_require_reason(p_reason);
  IF p_exempt IS NULL OR p_expected_version IS NULL OR p_expected_version<0 THEN RAISE EXCEPTION 'PEER_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  PERFORM 1 FROM public.members WHERE id=p_member_id AND anonymized_at IS NULL AND NOT is_test FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.match_rounds r JOIN private.round_review_requirements q ON q.round_id=r.id
    WHERE r.id=p_round_id AND q.required AND r.deleted_at IS NULL AND NOT r.is_test FOR SHARE OF r;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEER_ROUND_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.match_round_submissions WHERE round_id=p_round_id AND member_id=p_member_id)
    THEN RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_before FROM private.round_review_exemptions WHERE round_id=p_round_id AND member_id=p_member_id FOR UPDATE;
  IF COALESCE(v_before.version,0)<>p_expected_version THEN RAISE EXCEPTION 'PEER_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  INSERT INTO private.round_review_exemptions(round_id,member_id,exempt,version,reason,updated_by)
  VALUES(p_round_id,p_member_id,p_exempt,1,btrim(p_reason),v_admin)
  ON CONFLICT(round_id,member_id) DO UPDATE SET exempt=EXCLUDED.exempt,version=private.round_review_exemptions.version+1,
    reason=EXCLUDED.reason,updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp() RETURNING * INTO v_after;
  INSERT INTO private.round_review_exemption_audit(round_id,member_id,actor_admin_id,exempt,version,reason)
    VALUES(p_round_id,p_member_id,v_admin,p_exempt,v_after.version,btrim(p_reason));
  RETURN jsonb_build_object('exempt',v_after.exempt,'exemption_version',v_after.version,'exemption_reason',v_after.reason);
END;
$function$;
CREATE FUNCTION public.admin_set_round_review_exemption(p_round_id uuid,p_member_id uuid,p_exempt boolean,p_reason text,p_expected_version integer)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$
  SELECT registration_review_gate.admin_set(p_round_id,p_member_id,p_exempt,p_reason,p_expected_version)
$function$;

CREATE FUNCTION registration_review_gate.scrub_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
  IF OLD.anonymized_at IS NULL AND NEW.anonymized_at IS NOT NULL THEN
    UPDATE private.round_review_exemptions SET reason=NULL,exempt=true,version=version+1,updated_at=clock_timestamp() WHERE member_id=NEW.id;
    UPDATE private.round_review_exemption_audit SET reason=NULL WHERE member_id=NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER registration_review_gate_scrub_member AFTER UPDATE OF anonymized_at ON public.members
FOR EACH ROW EXECUTE FUNCTION registration_review_gate.scrub_member();

-- Keep the existing lifecycle authorization/decision tree and append the two
-- new member relations, so the preflight agrees with their restrictive FKs.
DO $lifecycle$
DECLARE definition text; original text;
BEGIN
  definition:=pg_get_functiondef('public.admin_preflight_member_lifecycle(uuid)'::regprocedure);
  original:=$fragment$'round_peer_participations',(SELECT count(*) FROM private.round_peer_review_participants WHERE member_id=p_member_id),$fragment$;
  IF position(original IN definition)=0 THEN RAISE EXCEPTION 'REVIEW_GATE_LIFECYCLE_BASELINE_CHANGED'; END IF;
  EXECUTE replace(definition,original,$fragment$'round_review_exemptions',(SELECT count(*) FROM private.round_review_exemptions WHERE member_id=p_member_id),
    'round_review_exemption_decisions',(SELECT count(*) FROM private.round_review_exemption_audit WHERE member_id=p_member_id),
    'round_peer_participations',(SELECT count(*) FROM private.round_peer_review_participants WHERE member_id=p_member_id),$fragment$);
END;
$lifecycle$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA registration_review_gate FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION registration_review_gate.player_get(uuid),registration_review_gate.admin_get(uuid),
  registration_review_gate.admin_set(uuid,uuid,boolean,text,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.player_get_registration_review_gate(uuid),public.admin_get_round_review_requirements(uuid),
  public.admin_set_round_review_exemption(uuid,uuid,boolean,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.player_get_registration_review_gate(uuid),public.admin_get_round_review_requirements(uuid),
  public.admin_set_round_review_exemption(uuid,uuid,boolean,text,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
