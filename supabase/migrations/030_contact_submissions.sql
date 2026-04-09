-- 030: 联系表单提交表
CREATE TABLE public.contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

-- 匿名用户可以插入（着陆页无需登录）
CREATE POLICY "anyone_can_submit" ON public.contact_submissions
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- 仅管理员可以查看
CREATE POLICY "admin_read" ON public.contact_submissions
  FOR SELECT TO authenticated
  USING (public.is_admin());
