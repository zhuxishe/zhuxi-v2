-- 面试评估直接存面试官名，避免嵌套 join
ALTER TABLE public.interview_evaluations ADD COLUMN IF NOT EXISTS interviewer_name text;

UPDATE interview_evaluations ie
SET interviewer_name = au.name
FROM admin_users au
WHERE au.id = ie.interviewer_id AND ie.interviewer_name IS NULL;
