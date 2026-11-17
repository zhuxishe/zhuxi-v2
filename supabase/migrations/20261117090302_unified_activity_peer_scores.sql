-- Activity-versioned peer reviews. Existing rounds retain their original paths,
-- including late reviews. No legacy ratings, profile scores or run snapshots move.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='2min';

CREATE SCHEMA unified_peer_review AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA unified_peer_review FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA unified_peer_review TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA unified_peer_review REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE private.round_review_versions (
  round_id uuid PRIMARY KEY REFERENCES public.match_rounds(id),
  review_system text NOT NULL CHECK(review_system IN('legacy','unified_v1')),
  automatic_window boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.round_review_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.round_review_versions FROM PUBLIC,anon,authenticated,service_role;
-- No date/name heuristic: every existing round, including an unused draft, stays old.
INSERT INTO private.round_review_versions(round_id,review_system)
SELECT id,'legacy' FROM public.match_rounds;

CREATE FUNCTION unified_peer_review.is_unified(p_round_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
  SELECT EXISTS(SELECT 1 FROM private.round_review_versions WHERE round_id=p_round_id AND review_system='unified_v1')
$function$;

-- One authoritative current publication check for routing and every write.
CREATE FUNCTION unified_peer_review.current_match(p_round_id uuid,p_member_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
  SELECT result.id FROM matching_publication.active_assignments assignment
  JOIN matching_publication.publications publication ON publication.id=assignment.publication_id
    AND publication.round_id=assignment.round_id AND publication.withdrawn_at IS NULL
  JOIN public.match_results result ON result.id=assignment.result_id
  JOIN public.match_sessions session ON session.id=result.session_id
    AND session.id=publication.session_id AND session.round_id=assignment.round_id
    AND session.status='confirmed' AND session.publication_version>0
    AND session.publication_version=publication.version
  JOIN matching_publication.roster roster ON roster.publication_id=publication.id
    AND roster.member_id=assignment.member_id AND roster.result_id=result.id AND roster.outcome='matched'
  JOIN public.match_rounds round ON round.id=assignment.round_id AND round.deleted_at IS NULL
  WHERE assignment.round_id=p_round_id AND assignment.member_id=p_member_id
    AND result.status='confirmed' AND result.publication_version=session.publication_version
    AND p_member_id=ANY(matching_publication.member_ids(result.member_a_id,result.member_b_id,result.group_members))
    AND private.peer_member_eligible(p_round_id,p_member_id)
    AND private.test_account_round_allowed(p_round_id,p_member_id)
  LIMIT 1
$function$;

CREATE FUNCTION unified_peer_review.live_participant(p_round_id uuid,p_member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
  SELECT EXISTS(SELECT 1 FROM public.match_rounds r WHERE r.id=p_round_id AND r.deleted_at IS NULL
    AND r.status<>'draft' AND private.peer_member_eligible(p_round_id,p_member_id)
    AND private.test_account_round_allowed(p_round_id,p_member_id)
    AND EXISTS(SELECT 1 FROM public.members WHERE id=p_member_id AND record_scope='current')
    AND CASE r.purpose WHEN 'matching' THEN unified_peer_review.current_match(p_round_id,p_member_id) IS NOT NULL OR (
      EXISTS(SELECT 1 FROM private.round_peer_review_participants p WHERE p.round_id=p_round_id AND p.member_id=p_member_id AND p.included AND p.source='manual')
      AND EXISTS(SELECT 1 FROM matching_publication.publications pub JOIN public.match_sessions session
        ON session.id=pub.session_id AND session.status='confirmed' AND session.publication_version=pub.version
        WHERE pub.round_id=p_round_id AND pub.withdrawn_at IS NULL))
      WHEN 'registration' THEN EXISTS(SELECT 1 FROM public.match_round_submissions s
        WHERE s.round_id=p_round_id AND s.member_id=p_member_id AND s.cancelled_at IS NULL)
      ELSE false END)
$function$;

-- Explicit attendance additions can owe a review without a fabricated matching
-- questionnaire submission. Live eligibility and ended/window checks remain in
-- requirement(); this helper identifies only the trusted attendance source.
CREATE FUNCTION unified_peer_review.manual_participant(p_round_id uuid,p_member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT unified_peer_review.is_unified(p_round_id) AND EXISTS(
   SELECT 1 FROM private.round_peer_review_participants p JOIN public.match_rounds r ON r.id=p.round_id
   WHERE p.round_id=p_round_id AND p.member_id=p_member_id AND p.included AND p.source='manual' AND r.purpose='matching')
$function$;

CREATE OR REPLACE FUNCTION private.peer_participant_eligible(p_round_id uuid,p_member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
  SELECT private.peer_member_eligible(p_round_id,p_member_id) AND EXISTS(
    SELECT 1 FROM private.round_peer_review_participants p
    WHERE p.round_id=p_round_id AND p.member_id=p_member_id AND p.included)
  AND (NOT unified_peer_review.is_unified(p_round_id) OR unified_peer_review.live_participant(p_round_id,p_member_id))
$function$;

CREATE FUNCTION unified_peer_review.initialize_round(p_round_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE r public.match_rounds; v_open timestamptz; v_close timestamptz;
BEGIN
  IF NOT unified_peer_review.is_unified(p_round_id) THEN RETURN; END IF;
  SELECT * INTO r FROM public.match_rounds WHERE id=p_round_id AND deleted_at IS NULL AND purpose IN('matching','registration');
  IF NOT FOUND THEN RETURN; END IF;
  v_open:=CASE WHEN r.purpose='matching' THEN r.survey_start ELSE NULLIF(r.content_config->>'eventStart','')::timestamptz END;
  v_close:=registration_review_gate.ended_at(p_round_id)+interval '7 days';
  IF v_open IS NULL OR v_close IS NULL OR NOT isfinite(v_open) OR NOT isfinite(v_close) OR v_open>=v_close THEN RETURN; END IF;
  INSERT INTO private.round_peer_review_settings(round_id,enabled,opens_at,closes_at,roster_confirmed,auto_include_registered)
  VALUES(p_round_id,true,v_open,v_close,true,r.purpose='registration') ON CONFLICT(round_id) DO NOTHING;
  -- Only untouched default dates follow later activity-date edits. A deliberate
  -- administrator settings save switches automatic_window off.
  UPDATE private.round_peer_review_settings s SET opens_at=v_open,closes_at=v_close,
    version=version+1,updated_at=clock_timestamp()
  WHERE s.round_id=p_round_id AND EXISTS(SELECT 1 FROM private.round_review_versions v
    WHERE v.round_id=p_round_id AND v.automatic_window)
    AND (s.opens_at IS DISTINCT FROM v_open OR s.closes_at IS DISTINCT FROM v_close);
  IF r.purpose='registration' THEN
    PERFORM private.sync_registered_peer_review_roster(p_round_id,NULL,NULL,'新版活动有效报名自动纳入评价名册');
  END IF;
END;
$function$;
CREATE FUNCTION unified_peer_review.track_round()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO private.round_review_versions(round_id,review_system,automatic_window) VALUES(NEW.id,'unified_v1',true);
  END IF;
  PERFORM unified_peer_review.initialize_round(NEW.id);
  RETURN NEW;
END;
$function$;
CREATE TRIGGER z_unified_review_round AFTER INSERT OR UPDATE OF purpose,survey_start,activity_end,content_config ON public.match_rounds
FOR EACH ROW EXECUTE FUNCTION unified_peer_review.track_round();

-- Publication inserts assignments before finally confirming the session. Store
-- the roster then, but live_participant prevents access until publication commits.
CREATE FUNCTION unified_peer_review.track_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
  IF unified_peer_review.is_unified(NEW.round_id) THEN
    PERFORM unified_peer_review.initialize_round(NEW.round_id);
    IF NOT EXISTS(SELECT 1 FROM private.round_peer_review_settings WHERE round_id=NEW.round_id) THEN
      RAISE EXCEPTION 'PEER_SETTINGS_REQUIRED' USING ERRCODE='55000';
    END IF;
    INSERT INTO private.round_peer_review_participants(round_id,member_id,included,source)
      VALUES(NEW.round_id,NEW.member_id,true,'registered') ON CONFLICT(round_id,member_id) DO NOTHING;
    -- DO NOTHING is intentional: republishing never undoes an admin removal.
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER unified_review_assignment AFTER INSERT OR UPDATE OF result_id,publication_id ON matching_publication.active_assignments
FOR EACH ROW EXECUTE FUNCTION unified_peer_review.track_assignment();

CREATE FUNCTION unified_peer_review.guard_legacy_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
  IF EXISTS(SELECT 1 FROM public.match_results result JOIN public.match_sessions session ON session.id=result.session_id
    WHERE result.id=NEW.match_result_id AND unified_peer_review.is_unified(session.round_id)) THEN
    RAISE EXCEPTION 'PEER_UNIFIED_REVIEW_REQUIRED' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER a_unified_review_legacy_guard BEFORE INSERT OR UPDATE ON public.mutual_reviews
FOR EACH ROW EXECUTE FUNCTION unified_peer_review.guard_legacy_write();

-- Keep the original completion semantics: once submitted, later moderation
-- never recreates a registration debt. Only the new matching source changes.
CREATE OR REPLACE FUNCTION registration_review_gate.completed(p_round_id uuid,p_member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
  SELECT CASE WHEN unified_peer_review.is_unified(r.id) OR r.purpose='registration' THEN EXISTS(
    SELECT 1 FROM private.round_peer_reviews rv WHERE rv.round_id=r.id AND rv.reviewer_id=p_member_id AND rv.reviewee_id<>p_member_id)
  WHEN r.purpose='matching' THEN EXISTS(
    SELECT 1 FROM public.mutual_reviews rv JOIN public.match_results mr ON mr.id=rv.match_result_id
    JOIN public.match_sessions ms ON ms.id=mr.session_id
    WHERE ms.round_id=r.id AND rv.reviewer_id=p_member_id AND rv.reviewee_id<>p_member_id)
  ELSE false END FROM public.match_rounds r WHERE r.id=p_round_id
$function$;

-- Patch exact, narrowly scoped predicates. A changed baseline aborts rather
-- than silently dropping the accumulated cancellation/test-scope protections.
DO $patch$
DECLARE d text; needle text;
BEGIN
  d:=pg_get_functiondef('registration_review_gate.requirement(uuid,uuid)'::regprocedure);
  needle:=$needle$ELSIF v_round.purpose='matching' THEN$needle$;
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_GATE_BASELINE_CHANGED'; END IF;
  d:=replace(d,needle,'ELSIF v_round.purpose=''matching'' AND NOT unified_peer_review.is_unified(p_round_id) THEN');
  needle:=$needle$WHERE s.round_id=p_round_id AND s.member_id=p_member_id AND s.cancelled_at IS NULL) THEN v_state:='no_target';$needle$;
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_GATE_ATTENDANCE_BASELINE_CHANGED'; END IF;
  EXECUTE replace(d,needle,$replace$WHERE s.round_id=p_round_id AND s.member_id=p_member_id AND s.cancelled_at IS NULL)
    AND NOT unified_peer_review.manual_participant(p_round_id,p_member_id) THEN v_state:='no_target';$replace$);
  d:=pg_get_functiondef('registration_review_gate.blockers(uuid,uuid)'::regprocedure);
  needle:='  JOIN public.match_round_submissions s ON s.round_id=r.id AND s.member_id=p_member_id AND s.cancelled_at IS NULL';
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_BLOCKERS_ATTENDANCE_BASELINE_CHANGED'; END IF;
  d:=replace(d,needle,'');
  needle:='  WHERE q.required AND r.id<>p_target_round_id';
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_BLOCKERS_FILTER_BASELINE_CHANGED'; END IF;
  EXECUTE replace(d,needle,$replace$  WHERE (EXISTS(SELECT 1 FROM public.match_round_submissions s WHERE s.round_id=r.id AND s.member_id=p_member_id AND s.cancelled_at IS NULL)
    OR unified_peer_review.manual_participant(r.id,p_member_id)) AND q.required AND r.id<>p_target_round_id$replace$);
  d:=pg_get_functiondef('registration_review_gate.admin_get(uuid)'::regprocedure);
  needle:='FROM public.match_round_submissions s JOIN public.members m ON m.id=s.member_id';
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_ADMIN_GATE_BASELINE_CHANGED'; END IF;
  EXECUTE replace(d,needle,$replace$FROM (SELECT round_id,member_id FROM public.match_round_submissions WHERE round_id=p_round_id
    UNION SELECT round_id,member_id FROM private.round_peer_review_participants p
      WHERE p.round_id=p_round_id AND unified_peer_review.manual_participant(p.round_id,p.member_id)) s
    JOIN public.members m ON m.id=s.member_id$replace$);
  d:=pg_get_functiondef('registration_review_gate.admin_set(uuid,uuid,boolean,text,integer)'::regprocedure);
  needle:='IF NOT EXISTS(SELECT 1 FROM public.match_round_submissions WHERE round_id=p_round_id AND member_id=p_member_id)';
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_EXEMPTION_ATTENDANCE_BASELINE_CHANGED'; END IF;
  EXECUTE replace(d,needle,needle||' AND NOT unified_peer_review.manual_participant(p_round_id,p_member_id)');
  d:=pg_get_functiondef('registration_review_gate.can_rate(uuid,uuid)'::regprocedure);
  needle:=$needle$EXISTS(SELECT 1 FROM public.match_rounds r WHERE r.id=p_round_id AND r.purpose='registration')$needle$;
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_LATE_BASELINE_CHANGED'; END IF;
  EXECUTE replace(d,needle,'(unified_peer_review.is_unified(p_round_id) OR '||needle||')');
  d:=pg_get_functiondef('private.peer_lock_pair(uuid,uuid,uuid)'::regprocedure);
  needle:=$needle$  PERFORM 1 FROM public.members WHERE id IN (p_actor,p_target) ORDER BY id FOR SHARE;$needle$;
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_PAIR_LOCK_BASELINE_CHANGED'; END IF;
  EXECUTE replace(d,needle,$replace$  IF unified_peer_review.is_unified(p_round_id) AND EXISTS(SELECT 1 FROM public.match_rounds WHERE id=p_round_id AND purpose='matching') THEN
    -- Publication/withdrawal locks the round first. Serialize before member
    -- locks so a successful review cannot race a withdrawn/reassigned result.
    PERFORM 1 FROM public.match_rounds WHERE id=p_round_id FOR SHARE;
  END IF;
$replace$||needle);
  d:=pg_get_functiondef('public.player_save_round_peer_review(uuid,uuid,numeric,text,integer)'::regprocedure);
  needle:=$needle$  SELECT * INTO v_before FROM private.round_peer_reviews$needle$;
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_SAVE_BASELINE_CHANGED'; END IF;
  EXECUTE replace(d,needle,$replace$  IF unified_peer_review.is_unified(p_round_id) AND p_score=1 AND NOT EXISTS(
    SELECT 1 FROM private.round_peer_reports WHERE round_id=p_round_id AND reporter_id=v_player AND reviewee_id=p_reviewee_id
  ) THEN RAISE EXCEPTION 'PEER_ONE_STAR_REPORT_REQUIRED' USING ERRCODE='22023'; END IF;
$replace$||needle);
  d:=pg_get_functiondef('public.player_submit_round_peer_feedback(uuid,uuid,numeric,text,integer,text,text,integer,uuid)'::regprocedure);
  needle:=$needle$  IF p_score IS NOT NULL THEN
    v_review:=public.player_save_round_peer_review(p_round_id,p_reviewee_id,p_score,p_comment,p_review_version);
  END IF;
  IF p_report_category IS NOT NULL THEN
    v_report:=public.player_save_round_peer_report(p_round_id,p_reviewee_id,p_report_category,p_report_details,p_report_version);
  END IF;$needle$;
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_ATOMIC_BASELINE_CHANGED'; END IF;
  EXECUTE replace(d,needle,$replace$  IF unified_peer_review.is_unified(p_round_id) THEN
    IF p_report_category IS NOT NULL THEN
      v_report:=public.player_save_round_peer_report(p_round_id,p_reviewee_id,p_report_category,p_report_details,p_report_version);
    END IF;
    IF p_score IS NOT NULL THEN
      v_review:=public.player_save_round_peer_review(p_round_id,p_reviewee_id,p_score,p_comment,p_review_version);
    END IF;
  ELSE
$replace$||needle||E'\n  END IF;');
END;
$patch$;

-- Preserve the old settings JSON exactly, appending only an explicit version.
ALTER FUNCTION private.peer_settings_json(uuid) SET SCHEMA unified_peer_review;
ALTER FUNCTION unified_peer_review.peer_settings_json(uuid) RENAME TO legacy_settings_json;
REVOKE ALL ON FUNCTION unified_peer_review.legacy_settings_json(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.peer_settings_json(p_round_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
  SELECT unified_peer_review.legacy_settings_json(p_round_id)||jsonb_build_object(
    'review_system',CASE WHEN unified_peer_review.is_unified(p_round_id) THEN 'unified' ELSE 'legacy' END)
$function$;
REVOKE ALL ON FUNCTION private.peer_settings_json(uuid) FROM PUBLIC,anon,authenticated,service_role;

DO $patch$
DECLARE d text; needle text;
BEGIN
  d:=pg_get_functiondef('public.player_get_round_peer_reviews(uuid,text,integer,integer)'::regprocedure);
  needle:=$needle$RETURN jsonb_build_object('round_id',p_round_id,$needle$;
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_CONTEXT_BASELINE_CHANGED'; END IF;
  d:=replace(d,needle,'RETURN jsonb_build_object(''review_system'',CASE WHEN unified_peer_review.is_unified(p_round_id) THEN ''unified'' ELSE ''legacy'' END,''round_id'',p_round_id,');
  -- New matching events share the same required/late-completion display.
  needle:=$needle$AND round_scope.purpose='registration'$needle$;
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_CONTEXT_REQUIRED_BASELINE_CHANGED'; END IF;
  EXECUTE replace(d,needle,'AND (round_scope.purpose=''registration'' OR unified_peer_review.is_unified(p_round_id))');
  d:=pg_get_functiondef('public.player_list_round_peer_review_events()'::regprocedure);
  needle:=$needle$'round_id',r.id,'round_name',r.round_name$needle$;
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_EVENTS_BASELINE_CHANGED'; END IF;
  d:=replace(d,needle,'''review_system'',CASE WHEN unified_peer_review.is_unified(r.id) THEN ''unified'' ELSE ''legacy'' END,'||needle);
  needle:=$needle$r.purpose='registration' AND EXISTS$needle$;
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_EVENTS_REQUIRED_BASELINE_CHANGED'; END IF;
  EXECUTE replace(d,needle,'(r.purpose=''registration'' OR unified_peer_review.is_unified(r.id)) AND EXISTS');

  d:=pg_get_functiondef('private.save_round_peer_review_settings(uuid,boolean,timestamptz,timestamptz,integer,text,boolean)'::regprocedure);
  needle:=$needle$IF p_enabled AND NOT v_auto AND ($needle$;
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_SETTINGS_BASELINE_CHANGED'; END IF;
  d:=replace(d,needle,'IF p_enabled AND NOT unified_peer_review.is_unified(p_round_id) AND NOT v_auto AND (');
  needle:='roster_confirmed=CASE WHEN v_auto THEN true ELSE roster_confirmed END';
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_SETTINGS_ROSTER_BASELINE_CHANGED'; END IF;
  d:=replace(d,needle,'roster_confirmed=CASE WHEN v_auto OR unified_peer_review.is_unified(p_round_id) THEN true ELSE roster_confirmed END');
  needle:='CASE WHEN p_enabled AND clock_timestamp()>=p_opens_at THEN clock_timestamp() END,v_auto,v_auto)';
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_INITIAL_SETTINGS_BASELINE_CHANGED'; END IF;
  d:=replace(d,needle,'CASE WHEN p_enabled AND clock_timestamp()>=p_opens_at THEN clock_timestamp() END,(v_auto OR unified_peer_review.is_unified(p_round_id)),v_auto)');
  needle:='  RETURN private.peer_settings_json(p_round_id);';
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_SETTINGS_RETURN_BASELINE_CHANGED'; END IF;
  d:=replace(d,needle,'  UPDATE private.round_review_versions SET automatic_window=false WHERE round_id=p_round_id AND review_system=''unified_v1'';'||E'\n'||needle);
  EXECUTE d;

  d:=pg_get_functiondef('public.admin_confirm_round_peer_review_roster(uuid,uuid[],integer,text)'::regprocedure);
  needle:='cardinality(p_member_ids)<2';
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_ROSTER_BASELINE_CHANGED'; END IF;
  d:=replace(d,needle,'(cardinality(p_member_ids)<2 AND NOT unified_peer_review.is_unified(p_round_id))');
  needle:='  SELECT * INTO v_setting FROM private.round_peer_review_settings WHERE round_id=p_round_id FOR UPDATE;';
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_ROSTER_LOCK_BASELINE_CHANGED'; END IF;
  needle:=$needle$SELECT p_round_id,x,true,CASE WHEN EXISTS$needle$;
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_MANUAL_ROSTER_BASELINE_CHANGED'; END IF;
  d:=replace(d,needle,$replace$SELECT p_round_id,x,true,CASE WHEN unified_peer_review.is_unified(p_round_id) AND v_round.purpose='matching'
    AND unified_peer_review.current_match(p_round_id,x) IS NULL THEN 'manual' WHEN EXISTS$replace$);
  needle:='ON CONFLICT(round_id,member_id) DO UPDATE SET included=true,updated_at=clock_timestamp();';
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_MANUAL_UPSERT_BASELINE_CHANGED'; END IF;
  d:=replace(d,needle,$replace$ON CONFLICT(round_id,member_id) DO UPDATE SET included=true,
    source=CASE WHEN unified_peer_review.is_unified(p_round_id) AND NOT round_peer_review_participants.included
      THEN EXCLUDED.source ELSE round_peer_review_participants.source END,updated_at=clock_timestamp();$replace$);
  needle:='      PERFORM private.restore_round_roster_registration(p_round_id,v_member,p_reason);';
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_RESTORE_BASELINE_CHANGED'; END IF;
  d:=replace(d,needle,$replace$      IF NOT unified_peer_review.is_unified(p_round_id) OR NOT EXISTS(
        SELECT 1 FROM jsonb_array_elements(v_before) prior WHERE prior->>'member_id'=v_member::text AND (prior->>'included')::boolean
      ) THEN
        PERFORM private.restore_round_roster_registration(p_round_id,v_member,p_reason);
      END IF;$replace$);
  EXECUTE d;
  d:=pg_get_functiondef('public.admin_set_round_peer_review_participant(uuid,uuid,boolean,text)'::regprocedure);
  needle:='  SELECT * INTO v_setting FROM private.round_peer_review_settings WHERE round_id=p_round_id FOR UPDATE;';
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_PARTICIPANT_BASELINE_CHANGED'; END IF;
  needle:=$needle$VALUES(p_round_id,p_member_id,p_included,CASE WHEN EXISTS$needle$;
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_MANUAL_PARTICIPANT_BASELINE_CHANGED'; END IF;
  d:=replace(d,needle,$replace$VALUES(p_round_id,p_member_id,p_included,CASE WHEN unified_peer_review.is_unified(p_round_id)
    AND EXISTS(SELECT 1 FROM public.match_rounds WHERE id=p_round_id AND purpose='matching')
    AND unified_peer_review.current_match(p_round_id,p_member_id) IS NULL THEN 'manual' WHEN EXISTS$replace$);
  needle:='SET enabled=false,roster_confirmed=false,version=version+1';
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'UNIFIED_PARTICIPANT_SETTINGS_BASELINE_CHANGED'; END IF;
  EXECUTE replace(d,needle,'SET enabled=CASE WHEN unified_peer_review.is_unified(p_round_id) THEN enabled ELSE false END,roster_confirmed=unified_peer_review.is_unified(p_round_id),version=version+1');
END;
$patch$;

CREATE FUNCTION unified_peer_review.match_review_route(p_match_result_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_player uuid:=private.peer_current_player(); v_round uuid; v_result public.match_results; v_session public.match_sessions;
BEGIN
  SELECT * INTO v_result FROM public.match_results WHERE id=p_match_result_id;
  SELECT * INTO v_session FROM public.match_sessions WHERE id=v_result.session_id;
  v_round:=v_session.round_id;
  IF unified_peer_review.is_unified(v_round) THEN
    IF unified_peer_review.current_match(v_round,v_player) IS DISTINCT FROM p_match_result_id THEN
      RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501';
    END IF;
  ELSE
    -- Preserve old fetchMatchDetail visibility, including round-less sessions
    -- and historical cancelled results. No new live-roster/signup requirement.
    IF v_result.id IS NULL OR v_session.status IS DISTINCT FROM 'confirmed'
      OR COALESCE(v_result.publication_version,0)<=0
      OR NOT(v_result.status='cancelled' OR (v_result.status='confirmed' AND v_result.publication_version=v_session.publication_version))
      OR NOT v_player=ANY(matching_publication.member_ids(v_result.member_a_id,v_result.member_b_id,v_result.group_members))
      OR (v_round IS NOT NULL AND NOT private.test_account_round_allowed(v_round,v_player)) THEN
      RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN jsonb_build_object('review_system',CASE WHEN unified_peer_review.is_unified(v_round) THEN 'unified' ELSE 'legacy' END,
    'round_id',v_round,'reviewed',CASE WHEN unified_peer_review.is_unified(v_round) THEN
      EXISTS(SELECT 1 FROM private.round_peer_reviews WHERE round_id=v_round AND reviewer_id=v_player)
      ELSE EXISTS(SELECT 1 FROM public.mutual_reviews WHERE match_result_id=p_match_result_id AND reviewer_id=v_player) END);
END;
$function$;
CREATE FUNCTION public.player_get_match_review_route(p_match_result_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT unified_peer_review.match_review_route(p_match_result_id)
$function$;
CREATE FUNCTION unified_peer_review.reviewed_match_ids()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_player uuid:=private.peer_current_player(); v_ids jsonb;
BEGIN
 SELECT COALESCE(jsonb_agg(a.result_id ORDER BY a.result_id),'[]'::jsonb) INTO v_ids
 FROM matching_publication.active_assignments a
 WHERE a.member_id=v_player AND unified_peer_review.is_unified(a.round_id)
   AND unified_peer_review.current_match(a.round_id,v_player)=a.result_id
   AND EXISTS(SELECT 1 FROM private.round_peer_reviews WHERE round_id=a.round_id AND reviewer_id=v_player);
 RETURN jsonb_build_object('match_ids',v_ids);
END;
$function$;
CREATE FUNCTION public.player_list_unified_reviewed_match_ids()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT unified_peer_review.reviewed_match_ids()
$function$;

-- This aggregate deliberately does not use live_participant. Leaving a club or
-- cancelling a later registration cannot erase valid historical experience.
-- Existing single-score events qualify; legacy five-dimension reviews never do.
CREATE FUNCTION unified_peer_review.member_peer_score(p_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_result jsonb;
BEGIN
 PERFORM private.peer_current_admin();
 IF NOT EXISTS(SELECT 1 FROM public.members WHERE id=p_member_id AND anonymized_at IS NULL) THEN
   RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501';
 END IF;
 WITH valid_reviews AS MATERIALIZED (
   SELECT review.*,round.round_name,COALESCE(NULLIF(btrim(identity.full_name),''),'未填写姓名') AS reviewer_name
   FROM private.round_peer_reviews review
   JOIN public.match_rounds round ON round.id=review.round_id AND round.deleted_at IS NULL AND NOT round.is_test
   JOIN public.members reviewer ON reviewer.id=review.reviewer_id AND reviewer.anonymized_at IS NULL AND NOT reviewer.is_test
   JOIN public.members reviewee ON reviewee.id=review.reviewee_id AND reviewee.anonymized_at IS NULL AND NOT reviewee.is_test
   LEFT JOIN public.member_identity identity ON identity.member_id=review.reviewer_id
   WHERE review.reviewee_id=p_member_id AND review.valid
 ), people AS (
   SELECT reviewer_id,max(reviewer_name) AS reviewer_name,avg(score) AS score,
     count(*) AS review_count,count(DISTINCT round_id) AS activity_count,
     jsonb_agg(jsonb_build_object('review_id',id,'round_id',round_id,'round_name',round_name,
       'score',score,'updated_at',updated_at) ORDER BY created_at DESC,id) AS reviews
   FROM valid_reviews GROUP BY reviewer_id
 ) SELECT jsonb_build_object('member_id',p_member_id,'score',round(avg(score),1),
   'reviewer_count',count(*),'activity_count',(SELECT count(DISTINCT round_id) FROM valid_reviews),
   'review_count',(SELECT count(*) FROM valid_reviews),
   'eligible_for_publication',count(*)>=2 AND (SELECT count(DISTINCT round_id) FROM valid_reviews)>=3,
   'sources',COALESCE(jsonb_agg(to_jsonb(people) ORDER BY reviewer_id),'[]'::jsonb)) INTO v_result FROM people;
 RETURN v_result;
END;
$function$;
CREATE FUNCTION public.admin_get_member_peer_score(p_member_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT unified_peer_review.member_peer_score(p_member_id)
$function$;

CREATE FUNCTION unified_peer_review.restore_registration(p_round_id uuid,p_member_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 PERFORM private.peer_lock_admin();
 PERFORM private.peer_require_reason(p_reason);
 IF NOT unified_peer_review.is_unified(p_round_id) OR NOT EXISTS(
   SELECT 1 FROM public.match_rounds WHERE id=p_round_id AND purpose='registration' AND deleted_at IS NULL
 ) OR NOT EXISTS(SELECT 1 FROM private.round_peer_review_participants
   WHERE round_id=p_round_id AND member_id=p_member_id AND included) THEN
   RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.members WHERE id=p_member_id FOR SHARE;
 PERFORM 1 FROM public.match_round_submissions WHERE round_id=p_round_id AND member_id=p_member_id FOR UPDATE;
 PERFORM 1 FROM public.match_rounds WHERE id=p_round_id FOR SHARE;
 PERFORM private.restore_round_roster_registration(p_round_id,p_member_id,p_reason);
 RETURN jsonb_build_object('member_id',p_member_id,'restored',true);
END;
$function$;
CREATE FUNCTION public.admin_restore_unified_review_registration(p_round_id uuid,p_member_id uuid,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$
 SELECT unified_peer_review.restore_registration(p_round_id,p_member_id,p_reason)
$function$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA unified_peer_review FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION unified_peer_review.match_review_route(uuid),unified_peer_review.reviewed_match_ids(),
 unified_peer_review.member_peer_score(uuid),unified_peer_review.restore_registration(uuid,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.player_get_match_review_route(uuid),public.player_list_unified_reviewed_match_ids(),
 public.admin_get_member_peer_score(uuid),public.admin_restore_unified_review_registration(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.player_get_match_review_route(uuid),public.player_list_unified_reviewed_match_ids(),
 public.admin_get_member_peer_score(uuid),public.admin_restore_unified_review_registration(uuid,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
