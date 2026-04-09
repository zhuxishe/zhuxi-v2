-- 修复 admin_users 表的 RLS 策略
-- 问题：self_check_by_email 直接查询 auth.users，但 authenticated 角色无权访问 auth.users
-- 导致整个查询报 permission denied，admin 无法登录
--
-- 方案：创建 SECURITY DEFINER 辅助函数，由函数以 postgres 权限访问 auth.users

CREATE OR REPLACE FUNCTION public.my_email()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT email FROM auth.users WHERE id = auth.uid()
$$;

-- 重建使用 auth.users 的策略
DROP POLICY IF EXISTS "self_check_by_email" ON public.admin_users;
DROP POLICY IF EXISTS "self_bind_by_email" ON public.admin_users;

CREATE POLICY "self_check_by_email" ON public.admin_users
  FOR SELECT TO authenticated
  USING (email = public.my_email());

CREATE POLICY "self_bind_by_email" ON public.admin_users
  FOR UPDATE TO authenticated
  USING (email = public.my_email() AND user_id IS NULL)
  WITH CHECK (email = public.my_email() AND user_id = auth.uid());
