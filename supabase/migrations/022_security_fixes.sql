-- 022: 安全修复 - 收紧 match_sessions RLS
-- 问题: player_read_sessions 使用 USING(true)，所有认证用户可读全部会话

DROP POLICY IF EXISTS "player_read_sessions" ON public.match_sessions;

CREATE POLICY "player_read_sessions" ON public.match_sessions
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR status IN ('published', 'closed')
  );
