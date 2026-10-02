-- Round-scoped, private peer feedback collection. No writes to legacy reviews,
-- matching inputs, dynamic metrics, or the published compatibility score.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

-- Fail closed on incomplete target environments before altering the preserved
-- lifecycle function. This migration is forward-only and is never replayed.
DO $dependencies$
DECLARE v_missing text;
BEGIN
  WITH required(schema_name, table_name, column_name) AS (VALUES
    ('public','members','id'),('public','members','user_id'),
    ('public','members','account_status'),('public','members','status'),
    ('public','members','membership_type'),('public','members','anonymized_at'),
    ('public','admin_users','id'),('public','admin_users','user_id'),('public','admin_users','role'),
    ('public','member_identity','member_id'),('public','member_identity','full_name'),('public','member_identity','nickname'),
    ('public','match_rounds','id'),('public','match_rounds','round_name'),
    ('public','match_rounds','purpose'),('public','match_rounds','activity_start'),
    ('public','match_round_submissions','round_id'),('public','match_round_submissions','member_id'),
    ('public','match_round_submissions','cancelled_at')
  ) SELECT string_agg(r.schema_name||'.'||r.table_name||'.'||r.column_name,', ')
    INTO v_missing FROM required r WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c WHERE c.table_schema=r.schema_name
        AND c.table_name=r.table_name AND c.column_name=r.column_name);
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'PEER_DEPENDENCIES_MISSING: %',v_missing USING ERRCODE='55000'; END IF;
  IF to_regprocedure('private.member_master_current_admin_id()') IS NULL
    OR to_regprocedure('public.admin_preflight_member_lifecycle(uuid)') IS NULL
    OR to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'PEER_DEPENDENCIES_MISSING' USING ERRCODE='55000';
  END IF;
END;
$dependencies$;

CREATE TABLE private.round_peer_review_settings (
  round_id uuid PRIMARY KEY REFERENCES public.match_rounds(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT false,
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  opened_at timestamptz,
  roster_confirmed boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (opens_at < closes_at),
  CHECK (NOT enabled OR roster_confirmed)
);
CREATE TABLE private.round_peer_review_participants (
  round_id uuid NOT NULL REFERENCES private.round_peer_review_settings(round_id) ON DELETE RESTRICT,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  included boolean NOT NULL DEFAULT true,
  source text NOT NULL CHECK (source IN ('registered', 'manual')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, member_id)
);
CREATE INDEX round_peer_participants_member_idx ON private.round_peer_review_participants(member_id, round_id);
CREATE TABLE private.round_peer_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES private.round_peer_review_settings(round_id) ON DELETE RESTRICT,
  reviewer_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  reviewee_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  score numeric NOT NULL CHECK (score BETWEEN 1 AND 5 AND score * 2 = trunc(score * 2)),
  comment text NOT NULL DEFAULT '' CHECK (char_length(comment) <= 500),
  valid boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, reviewer_id, reviewee_id),
  CHECK (reviewer_id <> reviewee_id)
);
CREATE INDEX round_peer_reviews_receiver_idx ON private.round_peer_reviews(reviewee_id, round_id);
CREATE TABLE private.round_peer_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES private.round_peer_review_settings(round_id) ON DELETE RESTRICT,
  reporter_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  reviewee_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN ('harassment', 'privacy', 'disruption', 'other')),
  -- NULL only after a member lifecycle erasure; normal writes require 10-2000.
  details text CHECK (details IS NULL OR char_length(details) BETWEEN 10 AND 2000),
  supplements jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(supplements) = 'array'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  internal_note text CHECK (internal_note IS NULL OR char_length(internal_note) <= 2000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, reporter_id, reviewee_id),
  CHECK (reporter_id <> reviewee_id)
);
CREATE INDEX round_peer_reports_receiver_idx ON private.round_peer_reports(reviewee_id, round_id);
CREATE INDEX round_peer_reports_queue_idx ON private.round_peer_reports(round_id, status, created_at);
CREATE TABLE private.round_peer_review_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  round_id uuid NOT NULL REFERENCES private.round_peer_review_settings(round_id) ON DELETE RESTRICT,
  action text NOT NULL,
  subject_id uuid,
  actor_member_id uuid REFERENCES public.members(id) ON DELETE RESTRICT,
  -- Immutable administrator ID snapshot: removing a role must remain possible.
  actor_admin_id uuid,
  reason text,
  before_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id uuid,
  payload_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX round_peer_audit_round_idx ON private.round_peer_review_audit(round_id, id);
CREATE INDEX round_peer_audit_actor_idx ON private.round_peer_review_audit(actor_member_id);
CREATE UNIQUE INDEX round_peer_request_uidx ON private.round_peer_review_audit(actor_member_id, request_id) WHERE request_id IS NOT NULL;

-- These relations are deliberately not directly readable, including by the
-- target of a review/report. Only the narrowly shaped RPCs below expose data.
ALTER TABLE private.round_peer_review_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.round_peer_review_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.round_peer_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.round_peer_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.round_peer_review_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.round_peer_review_settings, private.round_peer_review_participants,
  private.round_peer_reviews, private.round_peer_reports, private.round_peer_review_audit
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE private.round_peer_review_audit_id_seq FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.peer_current_player()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.members
  WHERE user_id = (SELECT auth.uid()) AND account_status = 'active'
    AND status = 'approved' AND membership_type = 'player' AND anonymized_at IS NULL;
  IF v_id IS NULL THEN RAISE EXCEPTION 'PEER_AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;
  RETURN v_id;
END;
$function$;
CREATE FUNCTION private.peer_current_admin()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_id uuid;
BEGIN
  v_id := private.member_master_current_admin_id();
  IF v_id IS NULL OR (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.admin_users WHERE id = v_id AND role IN ('admin','super_admin')
  ) OR EXISTS (SELECT 1 FROM public.members WHERE user_id = (SELECT auth.uid())
    AND (account_status IS DISTINCT FROM 'active' OR anonymized_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'PEER_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN v_id;
END;
$function$;
-- Read RPCs stay usable in READ ONLY transactions. Only mutation entrypoints
-- take these locks and then repeat the live administrator authorization.
CREATE FUNCTION private.peer_lock_admin()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  PERFORM 1 FROM public.members WHERE user_id = (SELECT auth.uid()) ORDER BY id FOR SHARE;
  PERFORM 1 FROM public.admin_users WHERE user_id = (SELECT auth.uid()) FOR SHARE;
  PERFORM private.peer_current_admin();
END;
$function$;
CREATE FUNCTION private.peer_require_reason(p_reason text)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF char_length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION 'PEER_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;
END;
$function$;
CREATE FUNCTION private.peer_member_eligible(p_round_id uuid, p_member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT EXISTS (SELECT 1 FROM public.members m WHERE m.id = p_member_id
    AND m.account_status = 'active' AND m.status = 'approved'
    AND m.membership_type = 'player' AND m.anonymized_at IS NULL AND m.user_id IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM public.match_round_submissions s
    WHERE s.round_id = p_round_id AND s.member_id = p_member_id AND s.cancelled_at IS NOT NULL)
$function$;
CREATE FUNCTION private.peer_participant_eligible(p_round_id uuid, p_member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT private.peer_member_eligible(p_round_id,p_member_id) AND EXISTS (
    SELECT 1 FROM private.round_peer_review_participants p
    WHERE p.round_id=p_round_id AND p.member_id=p_member_id AND p.included)
$function$;
CREATE FUNCTION private.peer_effective_opened_at(p_setting private.round_peer_review_settings)
RETURNS timestamptz LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT COALESCE(p_setting.opened_at,
    CASE WHEN p_setting.enabled AND now() >= p_setting.opens_at THEN p_setting.opens_at END)
$function$;
CREATE FUNCTION private.peer_settings_json(p_round_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT COALESCE((SELECT jsonb_build_object('enabled',s.enabled,'opens_at',s.opens_at,
    'closes_at',s.closes_at,'opened_at',private.peer_effective_opened_at(s),
    'roster_confirmed',s.roster_confirmed,'version',s.version)
    FROM private.round_peer_review_settings s WHERE s.round_id=p_round_id),
    jsonb_build_object('enabled',false,'opens_at',NULL,'closes_at',NULL,'opened_at',NULL,'roster_confirmed',false,'version',0))
$function$;
CREATE FUNCTION private.peer_review_json(p_review private.round_peer_reviews)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $function$
  SELECT jsonb_build_object('id',p_review.id,'reviewee_id',p_review.reviewee_id,'score',p_review.score,
    'comment',p_review.comment,'valid',p_review.valid,'version',p_review.version,'created_at',p_review.created_at,'updated_at',p_review.updated_at)
$function$;
CREATE FUNCTION private.peer_report_json(p_report private.round_peer_reports)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $function$
  SELECT jsonb_build_object('id',p_report.id,'reviewee_id',p_report.reviewee_id,'category',p_report.category,
    'details',p_report.details,'supplements',p_report.supplements,'status',p_report.status,
    'version',p_report.version,'created_at',p_report.created_at,'updated_at',p_report.updated_at)
$function$;
CREATE FUNCTION private.peer_lock_pair(p_round_id uuid,p_actor uuid,p_target uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF p_actor IS NULL OR p_target IS NULL OR p_actor=p_target THEN
    RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.members WHERE id IN (p_actor,p_target) ORDER BY id FOR SHARE;
  -- Registration cancellation takes a row lock as well, preventing a
  -- concurrent cancellation from committing between qualification and insert.
  PERFORM 1 FROM public.match_round_submissions
    WHERE round_id=p_round_id AND member_id IN (p_actor,p_target) ORDER BY member_id FOR SHARE;
  IF NOT private.peer_participant_eligible(p_round_id,p_actor)
    OR NOT private.peer_participant_eligible(p_round_id,p_target) THEN
    RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501';
  END IF;
END;
$function$;

CREATE FUNCTION public.player_list_round_peer_review_events()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_player uuid := private.peer_current_player(); v_events jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'round_id',r.id,'round_name',r.round_name,'enabled',s.enabled,
    'opens_at',s.opens_at,'closes_at',s.closes_at,'opened_at',private.peer_effective_opened_at(s),
    'can_review',s.enabled AND s.roster_confirmed AND now()>=s.opens_at AND now()<s.closes_at AND private.peer_participant_eligible(r.id,v_player),
    'can_report',private.peer_effective_opened_at(s) IS NOT NULL AND private.peer_participant_eligible(r.id,v_player),
    'reviewed_count',(SELECT count(*) FROM private.round_peer_reviews rv WHERE rv.round_id=r.id AND rv.reviewer_id=v_player),
    'participant_count',(SELECT count(*) FROM private.round_peer_review_participants pp WHERE pp.round_id=r.id AND pp.member_id<>v_player AND private.peer_participant_eligible(r.id,pp.member_id))
  ) ORDER BY s.opens_at DESC,r.id),'[]'::jsonb) INTO v_events
  FROM private.round_peer_review_settings s JOIN public.match_rounds r ON r.id=s.round_id
  JOIN private.round_peer_review_participants p ON p.round_id=r.id AND p.member_id=v_player;
  RETURN jsonb_build_object('events',v_events);
END;
$function$;
CREATE FUNCTION public.player_get_round_peer_reviews(p_round_id uuid,p_search text DEFAULT '',p_page integer DEFAULT 1,p_page_size integer DEFAULT 24)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_player uuid := private.peer_current_player(); v_settings private.round_peer_review_settings; v_name text;
  v_total bigint; v_people jsonb; v_reviews jsonb; v_reports jsonb; v_eligible boolean;
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
  RETURN jsonb_build_object('round_id',p_round_id,'round_name',v_name,'settings',private.peer_settings_json(p_round_id),
    'can_review',v_eligible AND v_settings.enabled AND v_settings.roster_confirmed AND now()>=v_settings.opens_at AND now()<v_settings.closes_at,
    'can_report',v_eligible AND private.peer_effective_opened_at(v_settings) IS NOT NULL,
    'eligible',v_eligible,'participant_count',(SELECT count(*) FROM private.round_peer_review_participants p
      WHERE p.round_id=p_round_id AND p.member_id<>v_player AND v_eligible
        AND private.peer_effective_opened_at(v_settings) IS NOT NULL AND private.peer_participant_eligible(p_round_id,p.member_id)),
    'participants',v_people,'total',v_total,'page',p_page,'page_size',p_page_size,
    'reviewed_count',jsonb_array_length(v_reviews),'reviews',v_reviews,'reports',v_reports);
END;
$function$;
CREATE FUNCTION public.player_save_round_peer_review(p_round_id uuid,p_reviewee_id uuid,p_score numeric,p_comment text,p_expected_version integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_player uuid := private.peer_current_player(); v_setting private.round_peer_review_settings;
  v_before private.round_peer_reviews; v_after private.round_peer_reviews;
BEGIN
  IF p_score IS NULL OR NOT (p_score BETWEEN 1 AND 5) OR p_score*2<>trunc(p_score*2) THEN
    RAISE EXCEPTION 'PEER_SCORE_INVALID' USING ERRCODE='22023'; END IF;
  IF char_length(COALESCE(p_comment,''))>500 THEN RAISE EXCEPTION 'PEER_COMMENT_INVALID' USING ERRCODE='22023'; END IF;
  IF p_expected_version IS NULL OR p_expected_version<0 THEN RAISE EXCEPTION 'PEER_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  PERFORM private.peer_lock_pair(p_round_id,v_player,p_reviewee_id);
  SELECT * INTO v_setting FROM private.round_peer_review_settings WHERE round_id=p_round_id FOR UPDATE;
  IF NOT FOUND OR NOT v_setting.enabled OR NOT v_setting.roster_confirmed
    OR clock_timestamp()<v_setting.opens_at OR clock_timestamp()>=v_setting.closes_at THEN
    RAISE EXCEPTION 'PEER_WINDOW_CLOSED' USING ERRCODE='55000'; END IF;
  -- Recheck roster after waiting for a concurrent administrator's roster edit.
  IF NOT private.peer_participant_eligible(p_round_id,v_player) OR NOT private.peer_participant_eligible(p_round_id,p_reviewee_id) THEN
    RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_before FROM private.round_peer_reviews
    WHERE round_id=p_round_id AND reviewer_id=v_player AND reviewee_id=p_reviewee_id FOR UPDATE;
  IF COALESCE(v_before.version,0)<>p_expected_version THEN RAISE EXCEPTION 'PEER_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  IF v_before.id IS NOT NULL AND NOT v_before.valid THEN RAISE EXCEPTION 'PEER_REVIEW_INVALIDATED' USING ERRCODE='55000'; END IF;
  IF v_before.id IS NULL THEN
    INSERT INTO private.round_peer_reviews(round_id,reviewer_id,reviewee_id,score,comment)
    VALUES(p_round_id,v_player,p_reviewee_id,p_score,btrim(COALESCE(p_comment,''))) RETURNING * INTO v_after;
  ELSE
    UPDATE private.round_peer_reviews SET score=p_score,comment=btrim(COALESCE(p_comment,'')),version=version+1,updated_at=clock_timestamp()
    WHERE id=v_before.id RETURNING * INTO v_after;
  END IF;
  UPDATE private.round_peer_review_settings SET opened_at=COALESCE(opened_at,opens_at) WHERE round_id=p_round_id;
  INSERT INTO private.round_peer_review_audit(round_id,action,subject_id,actor_member_id,before_values,after_values)
    VALUES(p_round_id,CASE WHEN v_before.id IS NULL THEN 'review_created' ELSE 'review_revised' END,v_after.id,v_player,
      COALESCE(to_jsonb(v_before),'{}'::jsonb),to_jsonb(v_after));
  RETURN private.peer_review_json(v_after);
END;
$function$;
CREATE FUNCTION public.player_save_round_peer_report(p_round_id uuid,p_reviewee_id uuid,p_category text,p_details text,p_expected_version integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_player uuid := private.peer_current_player(); v_setting private.round_peer_review_settings;
  v_before private.round_peer_reports; v_after private.round_peer_reports;
BEGIN
  IF p_category IS NULL OR p_category NOT IN ('harassment','privacy','disruption','other')
    OR char_length(btrim(COALESCE(p_details,''))) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'PEER_REPORT_INVALID' USING ERRCODE='22023'; END IF;
  IF p_expected_version IS NULL OR p_expected_version<0 THEN RAISE EXCEPTION 'PEER_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  PERFORM private.peer_lock_pair(p_round_id,v_player,p_reviewee_id);
  SELECT * INTO v_setting FROM private.round_peer_review_settings WHERE round_id=p_round_id FOR UPDATE;
  IF NOT FOUND OR private.peer_effective_opened_at(v_setting) IS NULL THEN
    RAISE EXCEPTION 'PEER_REPORT_UNAVAILABLE' USING ERRCODE='55000'; END IF;
  IF NOT private.peer_participant_eligible(p_round_id,v_player) OR NOT private.peer_participant_eligible(p_round_id,p_reviewee_id) THEN
    RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_before FROM private.round_peer_reports
    WHERE round_id=p_round_id AND reporter_id=v_player AND reviewee_id=p_reviewee_id FOR UPDATE;
  IF COALESCE(v_before.version,0)<>p_expected_version THEN RAISE EXCEPTION 'PEER_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  IF v_before.id IS NULL THEN
    INSERT INTO private.round_peer_reports(round_id,reporter_id,reviewee_id,category,details)
      VALUES(p_round_id,v_player,p_reviewee_id,p_category,btrim(p_details)) RETURNING * INTO v_after;
  ELSE
    IF jsonb_array_length(v_before.supplements)>=50 THEN RAISE EXCEPTION 'PEER_REPORT_INVALID' USING ERRCODE='22023'; END IF;
    UPDATE private.round_peer_reports SET supplements=supplements||jsonb_build_array(jsonb_build_object('detail',btrim(p_details),'created_at',clock_timestamp())),
      status='pending',version=version+1,updated_at=clock_timestamp() WHERE id=v_before.id RETURNING * INTO v_after;
  END IF;
  UPDATE private.round_peer_review_settings SET opened_at=COALESCE(opened_at,private.peer_effective_opened_at(v_setting)) WHERE round_id=p_round_id;
  INSERT INTO private.round_peer_review_audit(round_id,action,subject_id,actor_member_id,before_values,after_values)
    VALUES(p_round_id,CASE WHEN v_before.id IS NULL THEN 'report_created' ELSE 'report_supplemented' END,v_after.id,v_player,
      COALESCE(to_jsonb(v_before),'{}'::jsonb),to_jsonb(v_after));
  RETURN private.peer_report_json(v_after);
END;
$function$;
CREATE FUNCTION public.player_submit_round_peer_feedback(p_round_id uuid,p_reviewee_id uuid,p_score numeric,
  p_comment text DEFAULT '',p_review_version integer DEFAULT 0,p_report_category text DEFAULT NULL,
  p_report_details text DEFAULT NULL,p_report_version integer DEFAULT 0,p_request_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_player uuid:=private.peer_current_player(); v_review jsonb; v_report jsonb; v_result jsonb;
  v_hash text; v_previous private.round_peer_review_audit;
BEGIN
  IF p_score IS NULL AND p_report_category IS NULL THEN RAISE EXCEPTION 'PEER_SCORE_INVALID' USING ERRCODE='22023'; END IF;
  IF (p_report_category IS NULL) <> (p_report_details IS NULL) THEN RAISE EXCEPTION 'PEER_REPORT_INVALID' USING ERRCODE='22023'; END IF;
  IF p_score IS NULL AND NULLIF(btrim(p_comment),'') IS NOT NULL THEN RAISE EXCEPTION 'PEER_COMMENT_INVALID' USING ERRCODE='22023'; END IF;
  IF p_request_id IS NOT NULL THEN
    v_hash:=md5(jsonb_build_array(p_round_id,p_reviewee_id,p_score,p_comment,p_review_version,p_report_category,p_report_details,p_report_version)::text);
    PERFORM pg_advisory_xact_lock(hashtextextended('peer-feedback:'||v_player::text||':'||p_request_id::text,0));
    SELECT * INTO v_previous FROM private.round_peer_review_audit WHERE actor_member_id=v_player AND request_id=p_request_id;
    IF FOUND THEN
      IF v_previous.payload_hash IS DISTINCT FROM v_hash THEN RAISE EXCEPTION 'PEER_REQUEST_CONFLICT' USING ERRCODE='40001'; END IF;
      RETURN v_previous.after_values;
    END IF;
  END IF;
  IF p_score IS NOT NULL THEN
    v_review:=public.player_save_round_peer_review(p_round_id,p_reviewee_id,p_score,p_comment,p_review_version);
  END IF;
  IF p_report_category IS NOT NULL THEN
    v_report:=public.player_save_round_peer_report(p_round_id,p_reviewee_id,p_report_category,p_report_details,p_report_version);
  END IF;
  v_result:=jsonb_build_object('review',v_review,'report',v_report);
  IF p_request_id IS NOT NULL THEN
    INSERT INTO private.round_peer_review_audit(round_id,action,subject_id,actor_member_id,after_values,request_id,payload_hash)
      VALUES(p_round_id,'feedback_submitted',p_reviewee_id,v_player,v_result,p_request_id,v_hash);
  END IF;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.admin_list_round_peer_review_events()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_events jsonb;
BEGIN
  PERFORM private.peer_current_admin();
  SELECT COALESCE(jsonb_agg(jsonb_build_object('round_id',r.id,'round_name',r.round_name,'purpose',r.purpose,
    'settings',private.peer_settings_json(r.id),
    'participant_count',(SELECT count(*) FROM private.round_peer_review_participants p WHERE p.round_id=r.id AND p.included),
    'review_count',(SELECT count(*) FROM private.round_peer_reviews rv WHERE rv.round_id=r.id),
    'pending_report_count',(SELECT count(*) FROM private.round_peer_reports rp WHERE rp.round_id=r.id AND rp.status IN ('pending','reviewing'))
  ) ORDER BY r.activity_start DESC,r.id),'[]'::jsonb) INTO v_events FROM public.match_rounds r WHERE r.purpose<>'announcement';
  RETURN jsonb_build_object('events',v_events);
END;
$function$;
CREATE FUNCTION public.admin_get_round_peer_reviews(p_round_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_name text; v_people jsonb; v_candidates jsonb; v_reviews jsonb; v_reports jsonb; v_audit jsonb;
BEGIN
  PERFORM private.peer_current_admin();
  SELECT round_name INTO v_name FROM public.match_rounds WHERE id=p_round_id AND purpose<>'announcement';
  IF NOT FOUND THEN RAISE EXCEPTION 'PEER_ROUND_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('member_id',p.member_id,'full_name',COALESCE(NULLIF(btrim(i.full_name),''),'未填写姓名'),
    'nickname',NULLIF(btrim(i.nickname),''),'source',p.source,'included',p.included,
    'eligible',private.peer_participant_eligible(p_round_id,p.member_id)) ORDER BY i.full_name,p.member_id),'[]'::jsonb) INTO v_people
  FROM private.round_peer_review_participants p LEFT JOIN public.member_identity i ON i.member_id=p.member_id WHERE p.round_id=p_round_id;
  WITH candidate_ids AS (
    SELECT member_id FROM public.match_round_submissions WHERE round_id=p_round_id AND cancelled_at IS NULL
    UNION SELECT member_id FROM private.round_peer_review_participants WHERE round_id=p_round_id
  ) SELECT COALESCE(jsonb_agg(jsonb_build_object('member_id',c.member_id,'full_name',COALESCE(NULLIF(btrim(i.full_name),''),'未填写姓名'),
    'nickname',NULLIF(btrim(i.nickname),''),'registered',EXISTS(SELECT 1 FROM public.match_round_submissions s WHERE s.round_id=p_round_id AND s.member_id=c.member_id AND s.cancelled_at IS NULL),
    'eligible',private.peer_member_eligible(p_round_id,c.member_id)) ORDER BY i.full_name,c.member_id),'[]'::jsonb) INTO v_candidates
  FROM candidate_ids c LEFT JOIN public.member_identity i ON i.member_id=c.member_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(rv) ORDER BY rv.updated_at DESC),'[]'::jsonb) INTO v_reviews FROM private.round_peer_reviews rv WHERE round_id=p_round_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(rp) ORDER BY rp.updated_at DESC),'[]'::jsonb) INTO v_reports FROM private.round_peer_reports rp WHERE round_id=p_round_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(a)-ARRAY['request_id','payload_hash'] ORDER BY a.id DESC),'[]'::jsonb) INTO v_audit
    FROM private.round_peer_review_audit a WHERE round_id=p_round_id;
  RETURN jsonb_build_object('round_id',p_round_id,'round_name',v_name,'settings',private.peer_settings_json(p_round_id),
    'participants',v_people,'candidates',v_candidates,'reviews',v_reviews,'reports',v_reports,'audit',v_audit);
END;
$function$;
CREATE FUNCTION public.admin_save_round_peer_review_settings(p_round_id uuid,p_enabled boolean,p_opens_at timestamptz,
  p_closes_at timestamptz,p_expected_version integer,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_admin uuid:=private.peer_current_admin(); v_before private.round_peer_review_settings; v_after private.round_peer_review_settings;
BEGIN
  PERFORM private.peer_lock_admin();
  PERFORM private.peer_require_reason(p_reason);
  IF p_enabled IS NULL OR p_opens_at IS NULL OR p_closes_at IS NULL OR p_opens_at>=p_closes_at
    OR NOT isfinite(p_opens_at) OR NOT isfinite(p_closes_at) THEN RAISE EXCEPTION 'PEER_SETTINGS_INVALID' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.match_rounds WHERE id=p_round_id AND purpose<>'announcement' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEER_ROUND_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_before FROM private.round_peer_review_settings WHERE round_id=p_round_id FOR UPDATE;
  IF p_expected_version IS NULL OR COALESCE(v_before.version,0)<>p_expected_version THEN RAISE EXCEPTION 'PEER_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  IF p_enabled AND private.peer_effective_opened_at(v_before) IS NULL AND p_closes_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'PEER_SETTINGS_INVALID' USING ERRCODE='22023'; END IF;
  IF p_enabled AND (v_before.round_id IS NULL OR NOT v_before.roster_confirmed OR
    (SELECT count(*) FROM private.round_peer_review_participants p WHERE p.round_id=p_round_id AND private.peer_participant_eligible(p_round_id,p.member_id))<2) THEN
    RAISE EXCEPTION 'PEER_ROSTER_REQUIRED' USING ERRCODE='55000'; END IF;
  IF v_before.round_id IS NULL THEN
    INSERT INTO private.round_peer_review_settings(round_id,enabled,opens_at,closes_at)
      VALUES(p_round_id,false,p_opens_at,p_closes_at) RETURNING * INTO v_after;
  ELSE
    UPDATE private.round_peer_review_settings SET enabled=p_enabled,opens_at=p_opens_at,closes_at=p_closes_at,
      opened_at=COALESCE(private.peer_effective_opened_at(v_before),CASE WHEN p_enabled AND clock_timestamp()>=p_opens_at THEN clock_timestamp() END),
      version=version+1,updated_at=clock_timestamp() WHERE round_id=p_round_id RETURNING * INTO v_after;
  END IF;
  INSERT INTO private.round_peer_review_audit(round_id,action,actor_admin_id,reason,before_values,after_values)
    VALUES(p_round_id,'settings_changed',v_admin,btrim(p_reason),COALESCE(to_jsonb(v_before),'{}'::jsonb),to_jsonb(v_after));
  RETURN private.peer_settings_json(p_round_id);
END;
$function$;
CREATE FUNCTION public.admin_confirm_round_peer_review_roster(p_round_id uuid,p_member_ids uuid[],p_expected_version integer,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_admin uuid:=private.peer_current_admin(); v_setting private.round_peer_review_settings;
  v_before jsonb; v_after jsonb; v_review record;
BEGIN
  PERFORM private.peer_lock_admin();
  PERFORM private.peer_require_reason(p_reason);
  IF p_member_ids IS NULL OR cardinality(p_member_ids)<2 OR cardinality(p_member_ids)>2000
    OR array_position(p_member_ids,NULL) IS NOT NULL OR cardinality(p_member_ids)<>(SELECT count(DISTINCT x) FROM unnest(p_member_ids) x) THEN
    RAISE EXCEPTION 'PEER_ROSTER_REQUIRED' USING ERRCODE='22023'; END IF;
  -- Include currently confirmed members being removed, so lifecycle erasure
  -- cannot finish its audit scrub before this roster revision is recorded.
  PERFORM 1 FROM public.members m WHERE m.id=ANY(p_member_ids) OR EXISTS (
    SELECT 1 FROM private.round_peer_review_participants p
    WHERE p.round_id=p_round_id AND p.member_id=m.id AND p.included
  ) ORDER BY m.id FOR SHARE;
  PERFORM 1 FROM public.match_round_submissions WHERE round_id=p_round_id AND member_id=ANY(p_member_ids) ORDER BY member_id FOR SHARE;
  IF EXISTS(SELECT 1 FROM unnest(p_member_ids) x WHERE NOT private.peer_member_eligible(p_round_id,x)) THEN
    RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_setting FROM private.round_peer_review_settings WHERE round_id=p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEER_ROUND_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF p_expected_version IS NULL OR v_setting.version<>p_expected_version THEN RAISE EXCEPTION 'PEER_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.member_id),'[]'::jsonb) INTO v_before FROM private.round_peer_review_participants p WHERE round_id=p_round_id;
  UPDATE private.round_peer_review_participants SET included=false,updated_at=clock_timestamp() WHERE round_id=p_round_id AND NOT(member_id=ANY(p_member_ids));
  INSERT INTO private.round_peer_review_participants(round_id,member_id,included,source)
  SELECT p_round_id,x,true,CASE WHEN EXISTS(SELECT 1 FROM public.match_round_submissions s WHERE s.round_id=p_round_id AND s.member_id=x AND s.cancelled_at IS NULL) THEN 'registered' ELSE 'manual' END
    FROM unnest(p_member_ids) x
  ON CONFLICT(round_id,member_id) DO UPDATE SET included=true,source=EXCLUDED.source,updated_at=clock_timestamp();
  -- Removal keeps every original record but explicitly invalidates its score.
  FOR v_review IN SELECT * FROM private.round_peer_reviews WHERE round_id=p_round_id AND valid
    AND (NOT(reviewer_id=ANY(p_member_ids)) OR NOT(reviewee_id=ANY(p_member_ids))) FOR UPDATE
  LOOP
    UPDATE private.round_peer_reviews SET valid=false,version=version+1,updated_at=clock_timestamp() WHERE id=v_review.id;
    INSERT INTO private.round_peer_review_audit(round_id,action,subject_id,actor_admin_id,reason,before_values,after_values)
      VALUES(p_round_id,'review_invalidated_roster',v_review.id,v_admin,btrim(p_reason),to_jsonb(v_review),jsonb_build_object('valid',false,'version',v_review.version+1));
  END LOOP;
  UPDATE private.round_peer_review_settings SET roster_confirmed=true,version=version+1,updated_at=clock_timestamp(),
    opened_at=private.peer_effective_opened_at(v_setting) WHERE round_id=p_round_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.member_id),'[]'::jsonb) INTO v_after FROM private.round_peer_review_participants p WHERE round_id=p_round_id;
  INSERT INTO private.round_peer_review_audit(round_id,action,actor_admin_id,reason,before_values,after_values)
    VALUES(p_round_id,'roster_confirmed',v_admin,btrim(p_reason),jsonb_build_object('participants',v_before),jsonb_build_object('participants',v_after));
  RETURN private.peer_settings_json(p_round_id);
END;
$function$;
CREATE FUNCTION public.admin_set_round_peer_review_participant(p_round_id uuid,p_member_id uuid,p_included boolean,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_admin uuid:=private.peer_current_admin(); v_setting private.round_peer_review_settings;
  v_before private.round_peer_review_participants; v_after private.round_peer_review_participants; v_review record;
BEGIN
  PERFORM private.peer_lock_admin();
  PERFORM private.peer_require_reason(p_reason);
  IF p_included IS NULL THEN RAISE EXCEPTION 'PEER_ROSTER_REQUIRED' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.members WHERE id=p_member_id FOR SHARE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.members WHERE id=p_member_id AND anonymized_at IS NOT NULL) THEN
    RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.match_round_submissions WHERE round_id=p_round_id AND member_id=p_member_id FOR SHARE;
  IF p_included AND NOT private.peer_member_eligible(p_round_id,p_member_id) THEN RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_setting FROM private.round_peer_review_settings WHERE round_id=p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEER_ROUND_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_before FROM private.round_peer_review_participants WHERE round_id=p_round_id AND member_id=p_member_id;
  INSERT INTO private.round_peer_review_participants(round_id,member_id,included,source)
    VALUES(p_round_id,p_member_id,p_included,CASE WHEN EXISTS(SELECT 1 FROM public.match_round_submissions WHERE round_id=p_round_id AND member_id=p_member_id AND cancelled_at IS NULL) THEN 'registered' ELSE 'manual' END)
    ON CONFLICT(round_id,member_id) DO UPDATE SET included=EXCLUDED.included,source=EXCLUDED.source,updated_at=clock_timestamp() RETURNING * INTO v_after;
  UPDATE private.round_peer_review_settings SET enabled=false,roster_confirmed=false,version=version+1,updated_at=clock_timestamp(),
    opened_at=private.peer_effective_opened_at(v_setting) WHERE round_id=p_round_id;
  IF NOT p_included THEN
    FOR v_review IN SELECT * FROM private.round_peer_reviews WHERE round_id=p_round_id AND valid AND p_member_id IN (reviewer_id,reviewee_id) FOR UPDATE
    LOOP
      UPDATE private.round_peer_reviews SET valid=false,version=version+1,updated_at=clock_timestamp() WHERE id=v_review.id;
      INSERT INTO private.round_peer_review_audit(round_id,action,subject_id,actor_admin_id,reason,before_values,after_values)
        VALUES(p_round_id,'review_invalidated_roster',v_review.id,v_admin,btrim(p_reason),to_jsonb(v_review),jsonb_build_object('valid',false,'version',v_review.version+1));
    END LOOP;
  END IF;
  INSERT INTO private.round_peer_review_audit(round_id,action,subject_id,actor_admin_id,reason,before_values,after_values)
    VALUES(p_round_id,'participant_changed',p_member_id,v_admin,btrim(p_reason),COALESCE(to_jsonb(v_before),'{}'::jsonb),to_jsonb(v_after));
  RETURN jsonb_build_object('member_id',p_member_id,'included',p_included);
END;
$function$;
CREATE FUNCTION public.admin_resolve_round_peer_report(p_report_id uuid,p_status text,p_internal_note text,p_expected_version integer,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_admin uuid:=private.peer_current_admin(); v_before private.round_peer_reports; v_after private.round_peer_reports;
BEGIN
  PERFORM private.peer_lock_admin();
  PERFORM private.peer_require_reason(p_reason);
  IF p_status IS NULL OR p_status NOT IN ('pending','reviewing','resolved','dismissed')
    OR char_length(btrim(COALESCE(p_internal_note,''))) NOT BETWEEN 4 AND 2000 THEN
    RAISE EXCEPTION 'PEER_REPORT_INVALID' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_before FROM private.round_peer_reports WHERE id=p_report_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEER_REPORT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  PERFORM 1 FROM public.members WHERE id IN (v_before.reporter_id,v_before.reviewee_id) ORDER BY id FOR SHARE;
  IF EXISTS(SELECT 1 FROM public.members WHERE id IN (v_before.reporter_id,v_before.reviewee_id) AND anonymized_at IS NOT NULL) THEN
    RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM private.round_peer_review_settings WHERE round_id=v_before.round_id FOR UPDATE;
  SELECT * INTO v_before FROM private.round_peer_reports WHERE id=p_report_id FOR UPDATE;
  IF p_expected_version IS NULL OR v_before.version<>p_expected_version THEN RAISE EXCEPTION 'PEER_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  UPDATE private.round_peer_reports SET status=p_status,internal_note=btrim(p_internal_note),version=version+1,updated_at=clock_timestamp()
    WHERE id=p_report_id RETURNING * INTO v_after;
  INSERT INTO private.round_peer_review_audit(round_id,action,subject_id,actor_admin_id,reason,before_values,after_values)
    VALUES(v_after.round_id,'report_moderated',p_report_id,v_admin,btrim(p_reason),to_jsonb(v_before),to_jsonb(v_after));
  RETURN to_jsonb(v_after);
END;
$function$;
CREATE FUNCTION public.admin_moderate_round_peer_review(p_review_id uuid,p_valid boolean,p_expected_version integer,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_admin uuid:=private.peer_current_admin(); v_before private.round_peer_reviews; v_after private.round_peer_reviews;
BEGIN
  PERFORM private.peer_lock_admin();
  PERFORM private.peer_require_reason(p_reason);
  IF p_valid IS NULL THEN RAISE EXCEPTION 'PEER_REVIEW_INVALIDATED' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_before FROM private.round_peer_reviews WHERE id=p_review_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEER_REVIEW_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  PERFORM 1 FROM public.members WHERE id IN (v_before.reviewer_id,v_before.reviewee_id) ORDER BY id FOR SHARE;
  IF EXISTS(SELECT 1 FROM public.members WHERE id IN (v_before.reviewer_id,v_before.reviewee_id) AND anonymized_at IS NOT NULL) THEN
    RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM private.round_peer_review_settings WHERE round_id=v_before.round_id FOR UPDATE;
  SELECT * INTO v_before FROM private.round_peer_reviews WHERE id=p_review_id FOR UPDATE;
  IF p_expected_version IS NULL OR v_before.version<>p_expected_version THEN RAISE EXCEPTION 'PEER_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  IF p_valid AND (NOT private.peer_participant_eligible(v_before.round_id,v_before.reviewer_id)
    OR NOT private.peer_participant_eligible(v_before.round_id,v_before.reviewee_id)) THEN RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501'; END IF;
  UPDATE private.round_peer_reviews SET valid=p_valid,version=version+1,updated_at=clock_timestamp() WHERE id=p_review_id RETURNING * INTO v_after;
  INSERT INTO private.round_peer_review_audit(round_id,action,subject_id,actor_admin_id,reason,before_values,after_values)
    VALUES(v_after.round_id,'review_moderated',p_review_id,v_admin,btrim(p_reason),to_jsonb(v_before),to_jsonb(v_after));
  RETURN to_jsonb(v_after);
END;
$function$;

-- Preserve the prior lifecycle implementation instead of copying/replacing
-- its large decision tree. The wrapper appends these new business relations.
ALTER FUNCTION public.admin_preflight_member_lifecycle(uuid) SET SCHEMA private;
ALTER FUNCTION private.admin_preflight_member_lifecycle(uuid) RENAME TO peer_review_prior_member_preflight;
REVOKE ALL ON FUNCTION private.peer_review_prior_member_preflight(uuid) FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.admin_preflight_member_lifecycle(p_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_result jsonb; v_counts jsonb; v_has_data boolean;
BEGIN
  v_result:=private.peer_review_prior_member_preflight(p_member_id);
  v_counts:=jsonb_build_object(
    'round_peer_participations',(SELECT count(*) FROM private.round_peer_review_participants WHERE member_id=p_member_id),
    'round_peer_reviews_written',(SELECT count(*) FROM private.round_peer_reviews WHERE reviewer_id=p_member_id),
    'round_peer_reviews_received',(SELECT count(*) FROM private.round_peer_reviews WHERE reviewee_id=p_member_id),
    'round_peer_reports_written',(SELECT count(*) FROM private.round_peer_reports WHERE reporter_id=p_member_id),
    'round_peer_reports_received',(SELECT count(*) FROM private.round_peer_reports WHERE reviewee_id=p_member_id),
    'round_peer_audit_events',(SELECT count(*) FROM private.round_peer_review_audit WHERE actor_member_id=p_member_id));
  SELECT EXISTS(SELECT 1 FROM jsonb_each_text(v_counts) x WHERE x.value::bigint>0) INTO v_has_data;
  RETURN v_result||jsonb_build_object('counts',COALESCE(v_result->'counts','{}'::jsonb)||v_counts,
    'can_hard_delete',COALESCE((v_result->>'can_hard_delete')::boolean,false) AND NOT v_has_data);
END;
$function$;
CREATE FUNCTION private.peer_scrub_anonymized_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF NEW.anonymized_at IS NULL OR OLD.anonymized_at IS NOT NULL THEN RETURN NEW; END IF;
  UPDATE private.round_peer_reviews SET comment='',valid=false,version=version+1,updated_at=clock_timestamp()
    WHERE NEW.id IN (reviewer_id,reviewee_id);
  UPDATE private.round_peer_reports SET details=NULL,supplements='[]'::jsonb,internal_note=NULL,version=version+1,updated_at=clock_timestamp()
    WHERE NEW.id IN (reporter_id,reviewee_id);
  -- Revision payloads and idempotent responses also contain free text.
  UPDATE private.round_peer_review_audit SET reason=NULL,before_values='{}'::jsonb,after_values='{}'::jsonb,payload_hash=NULL
    WHERE actor_member_id=NEW.id OR subject_id=NEW.id
      OR subject_id IN (SELECT id FROM private.round_peer_reviews WHERE NEW.id IN (reviewer_id,reviewee_id))
      OR subject_id IN (SELECT id FROM private.round_peer_reports WHERE NEW.id IN (reporter_id,reviewee_id))
      OR (round_id IN (SELECT round_id FROM private.round_peer_review_participants WHERE member_id=NEW.id)
          AND action IN ('roster_confirmed','settings_changed'));
  UPDATE private.round_peer_review_participants SET included=false,updated_at=clock_timestamp() WHERE member_id=NEW.id;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER peer_scrub_anonymized_member AFTER UPDATE OF anonymized_at ON public.members
  FOR EACH ROW EXECUTE FUNCTION private.peer_scrub_anonymized_member();

-- Explicit allowlist; helpers are inaccessible from API roles.
DO $permissions$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname='private' AND (p.proname LIKE 'peer\_%' ESCAPE '\'))
       OR (n.nspname='public' AND (p.proname LIKE 'player\_%round_peer\_%' ESCAPE '\'
         OR p.proname LIKE 'admin\_%round_peer\_%' ESCAPE '\'))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',f.signature);
    IF split_part(f.signature::text,'.',1)<>'private' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
    END IF;
  END LOOP;
END;
$permissions$;
REVOKE ALL ON FUNCTION public.admin_preflight_member_lifecycle(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_preflight_member_lifecycle(uuid) TO authenticated;
COMMIT;
