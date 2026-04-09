-- 029: 锁定剩余5个函数的 search_path 防止劫持
-- Supabase advisor 建议: function_search_path_mutable

-- 1. update_updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- 2. update_attendance_stats
CREATE OR REPLACE FUNCTION public.update_attendance_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  mid uuid;
BEGIN
  FOREACH mid IN ARRAY NEW.late_member_ids
  LOOP
    INSERT INTO public.member_dynamic_stats (member_id, late_count)
      VALUES (mid, 1)
    ON CONFLICT (member_id) DO UPDATE SET
      late_count = public.member_dynamic_stats.late_count + 1,
      updated_at = now();
  END LOOP;
  FOREACH mid IN ARRAY NEW.no_show_member_ids
  LOOP
    INSERT INTO public.member_dynamic_stats (member_id, no_show_count)
      VALUES (mid, 1)
    ON CONFLICT (member_id) DO UPDATE SET
      no_show_count = public.member_dynamic_stats.no_show_count + 1,
      updated_at = now();
  END LOOP;
  FOREACH mid IN ARRAY NEW.participant_ids
  LOOP
    INSERT INTO public.member_dynamic_stats (member_id, activity_count, last_activity_at)
      VALUES (mid, 1, NEW.activity_date)
    ON CONFLICT (member_id) DO UPDATE SET
      activity_count = public.member_dynamic_stats.activity_count + 1,
      last_activity_at = GREATEST(public.member_dynamic_stats.last_activity_at, NEW.activity_date),
      updated_at = now();
  END LOOP;
  RETURN NEW;
END;
$function$;

-- 3. update_review_stats
CREATE OR REPLACE FUNCTION public.update_review_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.member_dynamic_stats (member_id) VALUES (NEW.reviewee_id)
  ON CONFLICT (member_id) DO NOTHING;
  UPDATE public.member_dynamic_stats SET
    review_count = review_count + 1,
    avg_review_score = (
      SELECT AVG(overall_score) FROM public.mutual_reviews WHERE reviewee_id = NEW.reviewee_id
    ),
    recent5_avg_score = (
      SELECT AVG(overall_score) FROM (
        SELECT overall_score FROM public.mutual_reviews
        WHERE reviewee_id = NEW.reviewee_id
        ORDER BY created_at DESC LIMIT 5
      ) sub
    ),
    replay_willing_rate = (
      SELECT AVG(CASE WHEN would_play_again THEN 1.0 ELSE 0.0 END)
      FROM public.mutual_reviews WHERE reviewee_id = NEW.reviewee_id
    ),
    updated_at = now()
  WHERE member_id = NEW.reviewee_id;
  RETURN NEW;
END;
$function$;

-- 4. sync_attractiveness_score
CREATE OR REPLACE FUNCTION public.sync_attractiveness_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_avg numeric;
BEGIN
  SELECT ROUND(AVG(attractiveness_score)) INTO v_avg
  FROM public.interview_evaluations
  WHERE member_id = NEW.member_id
    AND attractiveness_score IS NOT NULL;

  UPDATE public.members SET
    attractiveness_score = v_avg,
    interview_date = COALESCE(
      (SELECT MAX(created_at::date)
       FROM public.interview_evaluations
       WHERE member_id = NEW.member_id),
      CURRENT_DATE
    ),
    interviewer = NEW.interviewer_name
  WHERE id = NEW.member_id;

  RETURN NEW;
END;
$function$;

-- 5. update_submission_updated_at
CREATE OR REPLACE FUNCTION public.update_submission_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
