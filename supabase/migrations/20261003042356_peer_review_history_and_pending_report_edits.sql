-- Add submitted-once activity reminders, private history target labels, and
-- auditable edits of pending reports. Existing submit/append RPCs keep their
-- signatures and behavior. No existing player feedback or settings are changed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

DO $dependencies$
BEGIN
  IF to_regprocedure('public.player_list_round_peer_review_events()') IS NULL
    OR to_regprocedure('public.player_get_round_peer_reviews(uuid,text,integer,integer)') IS NULL
    OR to_regprocedure('private.peer_report_json(private.round_peer_reports)') IS NULL
    OR to_regprocedure('private.peer_lock_pair(uuid,uuid,uuid)') IS NULL
    OR to_regclass('private.round_peer_request_uidx') IS NULL THEN
    RAISE EXCEPTION 'PEER_DEPENDENCIES_MISSING' USING ERRCODE='55000';
  END IF;
END;
$dependencies$;

CREATE OR REPLACE FUNCTION public.player_list_round_peer_review_events()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_player uuid := private.peer_current_player(); v_events jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'round_id',r.id,'round_name',r.round_name,'enabled',s.enabled,
    'opens_at',s.opens_at,'closes_at',s.closes_at,'opened_at',private.peer_effective_opened_at(s),
    'can_review',s.enabled AND s.roster_confirmed AND now()>=s.opens_at AND now()<s.closes_at AND private.peer_participant_eligible(r.id,v_player),
    'can_report',private.peer_effective_opened_at(s) IS NOT NULL AND private.peer_participant_eligible(r.id,v_player),
    'has_submitted_feedback',EXISTS(SELECT 1 FROM private.round_peer_reviews rv WHERE rv.round_id=r.id AND rv.reviewer_id=v_player)
      OR EXISTS(SELECT 1 FROM private.round_peer_reports rp WHERE rp.round_id=r.id AND rp.reporter_id=v_player),
    'reviewed_count',(SELECT count(*) FROM private.round_peer_reviews rv WHERE rv.round_id=r.id AND rv.reviewer_id=v_player),
    'participant_count',(SELECT count(*) FROM private.round_peer_review_participants pp WHERE pp.round_id=r.id AND pp.member_id<>v_player AND private.peer_participant_eligible(r.id,pp.member_id))
  ) ORDER BY s.opens_at DESC,r.id),'[]'::jsonb) INTO v_events
  FROM private.round_peer_review_settings s JOIN public.match_rounds r ON r.id=s.round_id
  JOIN private.round_peer_review_participants p ON p.round_id=r.id AND p.member_id=v_player;
  RETURN jsonb_build_object('events',v_events);
END;
$function$;

CREATE OR REPLACE FUNCTION public.player_get_round_peer_reviews(p_round_id uuid,p_search text DEFAULT '',p_page integer DEFAULT 1,p_page_size integer DEFAULT 24)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_player uuid := private.peer_current_player(); v_settings private.round_peer_review_settings; v_name text;
  v_total bigint; v_people jsonb; v_reviews jsonb; v_reports jsonb; v_history_targets jsonb; v_eligible boolean;
BEGIN
  IF p_page IS NULL OR p_page<1 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
    OR char_length(COALESCE(p_search,''))>100 THEN RAISE EXCEPTION 'PEER_PAGINATION_INVALID' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_settings FROM private.round_peer_review_settings WHERE round_id=p_round_id;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM private.round_peer_review_participants WHERE round_id=p_round_id AND member_id=v_player) THEN
    RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501'; END IF;
  SELECT round_name INTO v_name FROM public.match_rounds WHERE id=p_round_id;
  v_eligible := private.peer_participant_eligible(p_round_id,v_player);
  WITH people AS MATERIALIZED (
    SELECT p.member_id,COALESCE(NULLIF(btrim(i.full_name),''),'未填写姓名') full_name,NULLIF(btrim(i.nickname),'') nickname
    FROM private.round_peer_review_participants p LEFT JOIN public.member_identity i ON i.member_id=p.member_id
    WHERE p.round_id=p_round_id AND p.member_id<>v_player AND v_eligible
      AND private.peer_effective_opened_at(v_settings) IS NOT NULL
      AND private.peer_participant_eligible(p_round_id,p.member_id)
      AND (COALESCE(p_search,'')='' OR COALESCE(i.full_name,'') ILIKE '%'||btrim(p_search)||'%'
        OR COALESCE(i.nickname,'') ILIKE '%'||btrim(p_search)||'%')
  ) SELECT (SELECT count(*) FROM people),COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY page.full_name,page.member_id)
      FROM (SELECT * FROM people ORDER BY full_name,member_id LIMIT p_page_size OFFSET (p_page::bigint-1)*p_page_size) page),'[]'::jsonb)
    INTO v_total,v_people;
  SELECT COALESCE(jsonb_agg(private.peer_review_json(rv) ORDER BY rv.updated_at DESC),'[]'::jsonb) INTO v_reviews
    FROM private.round_peer_reviews rv WHERE rv.round_id=p_round_id AND rv.reviewer_id=v_player;
  SELECT COALESCE(jsonb_agg(private.peer_report_json(rp) ORDER BY rp.updated_at DESC),'[]'::jsonb) INTO v_reports
    FROM private.round_peer_reports rp WHERE rp.round_id=p_round_id AND rp.reporter_id=v_player;
  -- The target union is independent of the current search and page. Names
  -- retain exactly the same disclosure boundary as the eligible roster.
  WITH target_ids AS (
    SELECT rv.reviewee_id AS member_id FROM private.round_peer_reviews rv
      WHERE rv.round_id=p_round_id AND rv.reviewer_id=v_player
    UNION
    SELECT rp.reviewee_id FROM private.round_peer_reports rp
      WHERE rp.round_id=p_round_id AND rp.reporter_id=v_player
  ), targets AS (
    SELECT t.member_id,
      v_eligible AND private.peer_effective_opened_at(v_settings) IS NOT NULL
        AND private.peer_participant_eligible(p_round_id,t.member_id) AS visible
    FROM target_ids t
  ) SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'member_id',t.member_id,
    'full_name',CASE WHEN t.visible THEN COALESCE(NULLIF(btrim(i.full_name),''),'') ELSE '' END,
    'nickname',CASE WHEN t.visible THEN NULLIF(btrim(i.nickname),'') ELSE NULL END,
    'can_review',t.visible AND v_settings.enabled AND v_settings.roster_confirmed
      AND now()>=v_settings.opens_at AND now()<v_settings.closes_at AND COALESCE(rv.valid,true),
    'can_report',t.visible
  ) ORDER BY t.member_id),'[]'::jsonb) INTO v_history_targets
  FROM targets t LEFT JOIN public.member_identity i ON i.member_id=t.member_id
  LEFT JOIN private.round_peer_reviews rv
    ON rv.round_id=p_round_id AND rv.reviewer_id=v_player AND rv.reviewee_id=t.member_id;
  RETURN jsonb_build_object('round_id',p_round_id,'round_name',v_name,'settings',private.peer_settings_json(p_round_id),
    'can_review',v_eligible AND v_settings.enabled AND v_settings.roster_confirmed AND now()>=v_settings.opens_at AND now()<v_settings.closes_at,
    'can_report',v_eligible AND private.peer_effective_opened_at(v_settings) IS NOT NULL,
    'eligible',v_eligible,'participant_count',(SELECT count(*) FROM private.round_peer_review_participants p
      WHERE p.round_id=p_round_id AND p.member_id<>v_player AND v_eligible
        AND private.peer_effective_opened_at(v_settings) IS NOT NULL AND private.peer_participant_eligible(p_round_id,p.member_id)),
    'participants',v_people,'total',v_total,'page',p_page,'page_size',p_page_size,
    'reviewed_count',jsonb_array_length(v_reviews),'reviews',v_reviews,'reports',v_reports,'history_targets',v_history_targets);
END;
$function$;

CREATE FUNCTION public.player_update_round_peer_report(
  p_round_id uuid,p_reviewee_id uuid,p_category text,p_details text,p_expected_version integer,p_request_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_player uuid:=private.peer_current_player(); v_setting private.round_peer_review_settings;
  v_before private.round_peer_reports; v_after private.round_peer_reports;
  v_previous private.round_peer_review_audit; v_hash text;
BEGIN
  IF p_category IS NULL OR p_category NOT IN ('harassment','privacy','disruption','other')
    OR char_length(btrim(COALESCE(p_details,''))) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'PEER_REPORT_INVALID' USING ERRCODE='22023'; END IF;
  IF p_expected_version IS NULL OR p_expected_version<1 THEN
    RAISE EXCEPTION 'PEER_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  IF p_request_id IS NOT NULL THEN
    v_hash:=md5(jsonb_build_array('update_report',p_round_id,p_reviewee_id,p_category,p_details,p_expected_version)::text);
    -- Same namespace and lock order as the original atomic submit endpoint.
    PERFORM pg_advisory_xact_lock(hashtextextended('peer-feedback:'||v_player::text||':'||p_request_id::text,0));
    SELECT * INTO v_previous FROM private.round_peer_review_audit
      WHERE actor_member_id=v_player AND request_id=p_request_id;
    IF FOUND THEN
      IF v_previous.action IS DISTINCT FROM 'report_updated' OR v_previous.payload_hash IS DISTINCT FROM v_hash THEN
        RAISE EXCEPTION 'PEER_REQUEST_CONFLICT' USING ERRCODE='40001'; END IF;
      -- A retry returns the original receipt, including its original version,
      -- without reapplying the update after subsequent administrator actions.
      v_after:=jsonb_populate_record(NULL::private.round_peer_reports,v_previous.after_values);
      RETURN jsonb_build_object('review',NULL,'report',private.peer_report_json(v_after));
    END IF;
  END IF;
  PERFORM private.peer_lock_pair(p_round_id,v_player,p_reviewee_id);
  SELECT * INTO v_setting FROM private.round_peer_review_settings WHERE round_id=p_round_id FOR UPDATE;
  IF NOT FOUND OR private.peer_effective_opened_at(v_setting) IS NULL THEN
    RAISE EXCEPTION 'PEER_REPORT_UNAVAILABLE' USING ERRCODE='55000'; END IF;
  IF NOT private.peer_participant_eligible(p_round_id,v_player)
    OR NOT private.peer_participant_eligible(p_round_id,p_reviewee_id) THEN
    RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_before FROM private.round_peer_reports
    WHERE round_id=p_round_id AND reporter_id=v_player AND reviewee_id=p_reviewee_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEER_REPORT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_before.version<>p_expected_version THEN RAISE EXCEPTION 'PEER_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  IF v_before.status<>'pending' THEN RAISE EXCEPTION 'PEER_REPORT_NOT_EDITABLE' USING ERRCODE='55000'; END IF;
  UPDATE private.round_peer_reports SET category=p_category,details=btrim(p_details),
    version=version+1,updated_at=clock_timestamp() WHERE id=v_before.id RETURNING * INTO v_after;
  UPDATE private.round_peer_review_settings SET opened_at=COALESCE(opened_at,private.peer_effective_opened_at(v_setting))
    WHERE round_id=p_round_id;
  INSERT INTO private.round_peer_review_audit(round_id,action,subject_id,actor_member_id,before_values,after_values,request_id,payload_hash)
    VALUES(p_round_id,'report_updated',v_after.id,v_player,to_jsonb(v_before),to_jsonb(v_after),p_request_id,v_hash);
  RETURN jsonb_build_object('review',NULL,'report',private.peer_report_json(v_after));
END;
$function$;

REVOKE ALL ON FUNCTION public.player_list_round_peer_review_events(),
  public.player_get_round_peer_reviews(uuid,text,integer,integer),
  public.player_update_round_peer_report(uuid,uuid,text,text,integer,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.player_list_round_peer_review_events(),
  public.player_get_round_peer_reviews(uuid,text,integer,integer),
  public.player_update_round_peer_report(uuid,uuid,text,text,integer,uuid)
  TO authenticated;
-- Deliver only after commit so PostgREST sees the new RPC signature.
NOTIFY pgrst, 'reload schema';
COMMIT;
