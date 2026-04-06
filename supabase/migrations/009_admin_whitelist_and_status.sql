-- 009: 管理员白名单 + 成员审批
-- admin_users.user_id 改为可空（NULL = 已邀请未登录）
ALTER TABLE admin_users ALTER COLUMN user_id DROP NOT NULL;

-- 清理旧的非唯一索引，替换为部分唯一约束
DROP INDEX IF EXISTS idx_admin_users_user_id;

CREATE UNIQUE INDEX idx_admin_users_user_id_unique
  ON admin_users(user_id) WHERE user_id IS NOT NULL;

-- RLS: 允许已认证用户通过邮箱查看自己的 admin_users 行
-- 白名单用户首次登录时需要读取自己的记录以完成 user_id 绑定
CREATE POLICY "self_check_by_email" ON public.admin_users
  FOR SELECT TO authenticated
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- RLS: 允许白名单用户首次登录时自行绑定 user_id
-- 条件：邮箱匹配 + 当前 user_id 为空（只能绑定未激活的条目）
CREATE POLICY "self_bind_by_email" ON public.admin_users
  FOR UPDATE TO authenticated
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    AND user_id IS NULL
  )
  WITH CHECK (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );
