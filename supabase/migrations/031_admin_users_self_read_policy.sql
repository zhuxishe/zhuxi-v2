-- 允许已认证用户查询自己是否在 admin_users 表中（解决登录时的鸡生蛋问题）
-- 只能看到自己的记录，不会泄露其他管理员信息
CREATE POLICY "user_read_self" ON public.admin_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
