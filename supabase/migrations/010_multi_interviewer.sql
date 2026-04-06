-- 支持多面试官：(member_id, interviewer_id) 联合 UNIQUE
ALTER TABLE public.interview_evaluations
  DROP CONSTRAINT IF EXISTS interview_evaluations_member_id_unique;

CREATE UNIQUE INDEX idx_eval_member_interviewer
  ON public.interview_evaluations(member_id, interviewer_id);

UPDATE public.interview_evaluations
SET interviewer_id = (SELECT id FROM public.admin_users LIMIT 1)
WHERE interviewer_id IS NULL;

ALTER TABLE public.interview_evaluations
  ALTER COLUMN interviewer_id SET NOT NULL;
