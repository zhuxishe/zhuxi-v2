-- Administrator-only score directory and inspectable original single-score
-- reviews. No score, publication flag, review, report or matching run is written.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='2min';

DO $dependencies$
BEGIN
 IF to_regprocedure('unified_peer_review.member_peer_score(uuid)') IS NULL
   OR to_regprocedure('private.peer_current_admin()') IS NULL
   OR to_regprocedure('private.member_master_is_super_admin()') IS NULL THEN
   RAISE EXCEPTION 'PEER_DIRECTORY_DEPENDENCIES_MISSING';
 END IF;
END;
$dependencies$;

-- The existing receiver index remains useful for aggregates. This index serves
-- the separately paged review history; only audit records, never reports, are
-- consulted for the most recent explicit invalidation reason.
CREATE INDEX round_peer_reviews_member_history_idx
 ON private.round_peer_reviews(reviewee_id,valid,created_at DESC,id);
CREATE INDEX round_peer_review_audit_invalidation_idx
 ON private.round_peer_review_audit(subject_id,id DESC)
 WHERE action IN('review_moderated','review_invalidated_roster') AND after_values->>'valid'='false';

-- Shared score universe. Ordinary departure/cancellation remains absent from
-- these filters exactly as in the first released personal-score calculation.
-- Invoker helpers are not exposed or granted to any application role.
CREATE FUNCTION unified_peer_review.score_review_rows(p_member_ids uuid[] DEFAULT NULL,p_validity text DEFAULT 'valid')
RETURNS SETOF private.round_peer_reviews LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT review.* FROM private.round_peer_reviews review
 JOIN public.match_rounds round ON round.id=review.round_id AND round.deleted_at IS NULL AND NOT round.is_test
 JOIN public.members reviewer ON reviewer.id=review.reviewer_id AND reviewer.anonymized_at IS NULL AND NOT reviewer.is_test
 JOIN public.members reviewee ON reviewee.id=review.reviewee_id AND reviewee.anonymized_at IS NULL AND NOT reviewee.is_test
 WHERE (p_member_ids IS NULL OR review.reviewee_id=ANY(p_member_ids))
   AND (p_validity='all' OR (p_validity='valid' AND review.valid) OR (p_validity='invalid' AND NOT review.valid))
$function$;

CREATE FUNCTION unified_peer_review.score_summary(p_member_ids uuid[] DEFAULT NULL)
RETURNS TABLE(member_id uuid,score numeric,reviewer_count bigint,activity_count bigint,review_count bigint,
 eligible_for_publication boolean,latest_review_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 WITH reviews AS MATERIALIZED (SELECT * FROM unified_peer_review.score_review_rows(p_member_ids,'valid')),
 people AS (
   SELECT reviewee_id,reviewer_id,avg(score) AS reviewer_score FROM reviews GROUP BY reviewee_id,reviewer_id
 ), scores AS (
   SELECT reviewee_id,round(avg(reviewer_score),1) AS score,count(*) AS reviewer_count FROM people GROUP BY reviewee_id
 ), counts AS (
   SELECT reviewee_id,count(DISTINCT round_id) AS activity_count,count(*) AS review_count,max(created_at) AS latest_review_at
   FROM reviews GROUP BY reviewee_id
 ) SELECT scores.reviewee_id,scores.score,scores.reviewer_count,counts.activity_count,counts.review_count,
   scores.reviewer_count>=2 AND counts.activity_count>=3,counts.latest_review_at
 FROM scores JOIN counts USING(reviewee_id)
$function$;

-- Keep the existing RPC's exact response shape, authorization and source order.
-- Both it and the new list now obtain the final number from the shared summary.
CREATE OR REPLACE FUNCTION unified_peer_review.member_peer_score(p_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_result jsonb;
BEGIN
 PERFORM private.peer_current_admin();
 IF NOT EXISTS(SELECT 1 FROM public.members WHERE id=p_member_id AND anonymized_at IS NULL) THEN
   RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501';
 END IF;
 WITH reviews AS MATERIALIZED (
   SELECT review.*,round.round_name,COALESCE(NULLIF(btrim(identity.full_name),''),'未填写姓名') AS reviewer_name
   FROM unified_peer_review.score_review_rows(ARRAY[p_member_id],'valid') review
   JOIN public.match_rounds round ON round.id=review.round_id
   LEFT JOIN public.member_identity identity ON identity.member_id=review.reviewer_id
 ), people AS (
   SELECT reviewer_id,max(reviewer_name) AS reviewer_name,avg(score) AS score,
     count(*) AS review_count,count(DISTINCT round_id) AS activity_count,
     jsonb_agg(jsonb_build_object('review_id',id,'round_id',round_id,'round_name',round_name,
       'score',score,'updated_at',updated_at) ORDER BY created_at DESC,id) AS reviews
   FROM reviews GROUP BY reviewer_id
 ) SELECT jsonb_build_object('member_id',p_member_id,'score',summary.score,
   'reviewer_count',COALESCE(summary.reviewer_count,0),'activity_count',COALESCE(summary.activity_count,0),
   'review_count',COALESCE(summary.review_count,0),'eligible_for_publication',COALESCE(summary.eligible_for_publication,false),
   'sources',COALESCE((SELECT jsonb_agg(to_jsonb(people) ORDER BY reviewer_id) FROM people),'[]'::jsonb))
 INTO v_result FROM (SELECT 1) seed LEFT JOIN unified_peer_review.score_summary(ARRAY[p_member_id]) summary ON true;
 RETURN v_result;
END;
$function$;

CREATE FUNCTION unified_peer_review.list_member_scores(p_search text DEFAULT '',p_page integer DEFAULT 1,
 p_page_size integer DEFAULT 30,p_sort text DEFAULT 'latest_review_at',p_direction text DEFAULT 'desc',p_sample_status text DEFAULT 'all')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_search text:=lower(btrim(COALESCE(p_search,''))); v_can_number boolean; v_result jsonb;
BEGIN
 PERFORM private.peer_current_admin();
 v_can_number:=private.member_master_is_super_admin();
 IF p_page IS NULL OR p_page<1 OR p_page>1000000 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION 'PEER_DIRECTORY_PAGINATION_INVALID' USING ERRCODE='22023';
 END IF;
 IF char_length(v_search)>100 OR p_sort IS NULL OR p_sort NOT IN('score','reviewer_count','latest_review_at')
   OR p_direction IS NULL OR p_direction NOT IN('asc','desc') OR p_sample_status IS NULL
   OR p_sample_status NOT IN('all','ready','accumulating','unrated') THEN
   RAISE EXCEPTION 'PEER_DIRECTORY_FILTER_INVALID' USING ERRCODE='22023';
 END IF;
 WITH members AS MATERIALIZED (
   SELECT m.id AS member_id,CASE WHEN v_can_number THEN m.member_number END AS member_number,
     COALESCE(NULLIF(btrim(i.full_name),''),'未填写姓名') AS full_name,NULLIF(btrim(i.nickname),'') AS nickname
   FROM public.members m LEFT JOIN public.member_identity i ON i.member_id=m.id
   WHERE m.status='approved' AND m.account_status='active' AND m.membership_type='player' AND m.record_scope='current'
     AND m.anonymized_at IS NULL AND NOT m.is_test
     AND (v_search='' OR strpos(lower(COALESCE(i.full_name,'')),v_search)>0
       OR strpos(lower(COALESCE(i.nickname,'')),v_search)>0
       OR (v_can_number AND strpos(lower(COALESCE(m.member_number,'')),v_search)>0))
 ), summary AS MATERIALIZED (
   SELECT * FROM unified_peer_review.score_summary(ARRAY(SELECT member_id FROM members))
 ), scored AS MATERIALIZED (
   SELECT m.*,s.score,COALESCE(s.reviewer_count,0) AS reviewer_count,COALESCE(s.activity_count,0) AS activity_count,
     COALESCE(s.review_count,0) AS review_count,s.latest_review_at,
     CASE WHEN s.score IS NULL THEN 'unrated' WHEN s.eligible_for_publication THEN 'ready' ELSE 'accumulating' END AS sample_status
   FROM members m LEFT JOIN summary s USING(member_id)
 ), filtered AS MATERIALIZED (
   SELECT * FROM scored WHERE p_sample_status='all' OR sample_status=p_sample_status
 ), ordered AS (
   SELECT filtered.*,row_number() OVER(ORDER BY (score IS NULL),
     CASE WHEN p_sort='score' AND p_direction='desc' THEN score END DESC NULLS LAST,
     CASE WHEN p_sort='score' AND p_direction='asc' THEN score END ASC NULLS LAST,
     CASE WHEN p_sort='reviewer_count' AND p_direction='desc' THEN reviewer_count END DESC,
     CASE WHEN p_sort='reviewer_count' AND p_direction='asc' THEN reviewer_count END ASC,
     CASE WHEN p_sort='latest_review_at' AND p_direction='desc' THEN latest_review_at END DESC NULLS LAST,
     CASE WHEN p_sort='latest_review_at' AND p_direction='asc' THEN latest_review_at END ASC NULLS LAST,
     full_name,member_id) AS ordinal FROM filtered
 ), page_rows AS (
   SELECT * FROM ordered ORDER BY ordinal LIMIT p_page_size OFFSET (p_page::bigint-1)*p_page_size
 ) SELECT jsonb_build_object('members',COALESCE((SELECT jsonb_agg(to_jsonb(p)-'ordinal' ORDER BY ordinal) FROM page_rows p),'[]'::jsonb),
   'total',(SELECT count(*) FROM filtered),'page',p_page,'page_size',p_page_size,'sort',p_sort,'direction',p_direction,
   'sample_status',p_sample_status,'can_view_member_number',v_can_number) INTO v_result;
 RETURN v_result;
END;
$function$;
CREATE FUNCTION public.admin_list_member_peer_scores(p_search text DEFAULT '',p_page integer DEFAULT 1,
 p_page_size integer DEFAULT 30,p_sort text DEFAULT 'latest_review_at',p_direction text DEFAULT 'desc',p_sample_status text DEFAULT 'all')
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT unified_peer_review.list_member_scores(p_search,p_page,p_page_size,p_sort,p_direction,p_sample_status)
$function$;

CREATE FUNCTION unified_peer_review.member_score_detail(p_member_id uuid,p_validity text DEFAULT 'valid',
 p_page integer DEFAULT 1,p_page_size integer DEFAULT 20,p_round_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_member jsonb; v_summary jsonb; v_operational jsonb; v_reviews jsonb; v_total bigint; v_can_number boolean;
 v_reviewers jsonb; v_activities jsonb;
BEGIN
 PERFORM private.peer_current_admin();
 v_can_number:=private.member_master_is_super_admin();
 IF p_page IS NULL OR p_page<1 OR p_page>1000000 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION 'PEER_DIRECTORY_PAGINATION_INVALID' USING ERRCODE='22023';
 END IF;
 IF p_validity IS NULL OR p_validity NOT IN('valid','invalid','all') THEN
   RAISE EXCEPTION 'PEER_DIRECTORY_FILTER_INVALID' USING ERRCODE='22023';
 END IF;
 SELECT jsonb_build_object('member_id',m.id,'member_number',CASE WHEN v_can_number THEN m.member_number END,
   'full_name',COALESCE(NULLIF(btrim(i.full_name),''),'未填写姓名'),'nickname',NULLIF(btrim(i.nickname),''))
 INTO v_member FROM public.members m LEFT JOIN public.member_identity i ON i.member_id=m.id
 WHERE m.id=p_member_id AND m.status='approved' AND m.account_status='active' AND m.membership_type='player'
   AND m.record_scope='current' AND m.anonymized_at IS NULL AND NOT m.is_test;
 IF v_member IS NULL THEN RAISE EXCEPTION 'PEER_DIRECTORY_MEMBER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT jsonb_build_object('score',s.score,'reviewer_count',COALESCE(s.reviewer_count,0),
   'activity_count',COALESCE(s.activity_count,0),'review_count',COALESCE(s.review_count,0),
   'eligible_for_publication',COALESCE(s.eligible_for_publication,false),'latest_review_at',s.latest_review_at,
   'sample_status',CASE WHEN s.score IS NULL THEN 'unrated' WHEN s.eligible_for_publication THEN 'ready' ELSE 'accumulating' END)
 INTO v_summary FROM (SELECT 1) seed LEFT JOIN unified_peer_review.score_summary(ARRAY[p_member_id]) s ON true;
 SELECT jsonb_build_object('score',metrics.compatibility_score,'status',metrics.compatibility_status,'source',metrics.score_source,
   'internal_note',metrics.internal_note,'published_at',metrics.published_at,'updated_at',metrics.updated_at,
   'published_by_name',NULLIF(btrim(publisher.name),''),'updated_by_name',NULLIF(btrim(editor.name),''))
 INTO v_operational FROM private.member_profile_metrics metrics
 LEFT JOIN public.admin_users publisher ON publisher.id=metrics.published_by
 LEFT JOIN public.admin_users editor ON editor.id=metrics.updated_by
 WHERE metrics.member_id=p_member_id;
 -- Both grouping summaries are full-history views, independent of the page,
 -- validity selector and activity filter. They cannot be inferred from one page.
 WITH valid_reviews AS MATERIALIZED (
   SELECT * FROM unified_peer_review.score_review_rows(ARRAY[p_member_id],'valid')
 ), people AS (
   SELECT reviewer_id,avg(score) AS score,count(*) AS review_count,count(DISTINCT round_id) AS activity_count,
     max(created_at) AS latest_review_at FROM valid_reviews GROUP BY reviewer_id
 ) SELECT COALESCE(jsonb_agg(jsonb_build_object('reviewer_id',p.reviewer_id,
   'reviewer_name',COALESCE(NULLIF(btrim(i.full_name),''),'未填写姓名'),'reviewer_nickname',NULLIF(btrim(i.nickname),''),
   'score',p.score,'review_count',p.review_count,'activity_count',p.activity_count,'latest_review_at',p.latest_review_at)
   ORDER BY p.latest_review_at DESC,p.reviewer_id),'[]'::jsonb)
 INTO v_reviewers FROM people p LEFT JOIN public.member_identity i ON i.member_id=p.reviewer_id;
 -- An activity association is not a check-in: show both registration and
 -- roster states explicitly, including cancellations and excluded roster rows.
 WITH records AS MATERIALIZED (
   SELECT * FROM unified_peer_review.score_review_rows(ARRAY[p_member_id],'all')
 ), related AS (
   SELECT round_id FROM public.match_round_submissions WHERE member_id=p_member_id
   UNION SELECT round_id FROM private.round_peer_review_participants WHERE member_id=p_member_id
   UNION SELECT round_id FROM records
 ), activities AS (
   SELECT round_id,count(*) FILTER(WHERE valid) AS review_count,count(*) FILTER(WHERE NOT valid) AS invalid_review_count,
     count(DISTINCT reviewer_id) FILTER(WHERE valid) AS reviewer_count,avg(score) FILTER(WHERE valid) AS average_score
   FROM records GROUP BY round_id
 ) SELECT COALESCE(jsonb_agg(jsonb_build_object('round_id',r.id,'round_name',r.round_name,
   'activity_start',r.activity_start,'activity_end',r.activity_end,'review_count',COALESCE(a.review_count,0),
   'invalid_review_count',COALESCE(a.invalid_review_count,0),'reviewer_count',COALESCE(a.reviewer_count,0),'average_score',a.average_score,
   'registration_status',CASE WHEN signup.member_id IS NULL THEN 'none' WHEN signup.cancelled_at IS NOT NULL THEN 'cancelled' ELSE 'active' END,
   'in_review_roster',roster.member_id IS NOT NULL,'roster_included',roster.included,'roster_source',roster.source)
   ORDER BY r.activity_start DESC,r.id),'[]'::jsonb)
 INTO v_activities FROM related JOIN public.match_rounds r ON r.id=related.round_id
 LEFT JOIN activities a ON a.round_id=r.id
 LEFT JOIN public.match_round_submissions signup ON signup.round_id=r.id AND signup.member_id=p_member_id
 LEFT JOIN private.round_peer_review_participants roster ON roster.round_id=r.id AND roster.member_id=p_member_id
 WHERE r.deleted_at IS NULL AND NOT r.is_test AND r.purpose IN('matching','registration');
 WITH reviews AS MATERIALIZED (
   SELECT * FROM unified_peer_review.score_review_rows(ARRAY[p_member_id],p_validity) WHERE p_round_id IS NULL OR round_id=p_round_id
 ), page_rows AS (
   SELECT * FROM reviews ORDER BY created_at DESC,id LIMIT p_page_size OFFSET (p_page::bigint-1)*p_page_size
 ), details AS (
   SELECT r.id AS review_id,r.round_id,round.round_name,round.activity_start,round.activity_end,
     r.reviewer_id,COALESCE(NULLIF(btrim(i.full_name),''),'未填写姓名') AS reviewer_name,
     NULLIF(btrim(i.nickname),'') AS reviewer_nickname,r.score,r.comment,r.valid,r.created_at,r.updated_at,
     invalidation.reason AS latest_invalidation_reason,invalidation.created_at AS invalidated_at
   FROM page_rows r JOIN public.match_rounds round ON round.id=r.round_id
   LEFT JOIN public.member_identity i ON i.member_id=r.reviewer_id
   LEFT JOIN LATERAL (
     SELECT a.reason,a.created_at FROM private.round_peer_review_audit a
     WHERE NOT r.valid AND a.subject_id=r.id AND a.action IN('review_moderated','review_invalidated_roster')
       AND a.after_values->>'valid'='false'
     ORDER BY a.id DESC LIMIT 1
   ) invalidation ON true
 ) SELECT (SELECT count(*) FROM reviews),COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC,d.review_id) FROM details d),'[]'::jsonb)
 INTO v_total,v_reviews;
 RETURN jsonb_build_object('member',v_member,'summary',v_summary,'operational_score',v_operational,
   'reviews',v_reviews,'total',v_total,'page',p_page,'page_size',p_page_size,'validity',p_validity,'round_id',p_round_id,
   'reviewer_summaries',v_reviewers,'activity_summaries',v_activities,'can_view_member_number',v_can_number);
END;
$function$;
CREATE FUNCTION public.admin_get_member_peer_score_detail(p_member_id uuid,p_validity text DEFAULT 'valid',
 p_page integer DEFAULT 1,p_page_size integer DEFAULT 20,p_round_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT unified_peer_review.member_score_detail(p_member_id,p_validity,p_page,p_page_size,p_round_id)
$function$;

REVOKE ALL ON FUNCTION unified_peer_review.score_review_rows(uuid[],text),unified_peer_review.score_summary(uuid[]),
 unified_peer_review.list_member_scores(text,integer,integer,text,text,text),unified_peer_review.member_score_detail(uuid,text,integer,integer,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION unified_peer_review.list_member_scores(text,integer,integer,text,text,text),
 unified_peer_review.member_score_detail(uuid,text,integer,integer,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_list_member_peer_scores(text,integer,integer,text,text,text),
 public.admin_get_member_peer_score_detail(uuid,text,integer,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_member_peer_scores(text,integer,integer,text,text,text),
 public.admin_get_member_peer_score_detail(uuid,text,integer,integer,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
