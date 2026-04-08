-- 027: RLS 策略加固 — 补充 TO authenticated
-- 原始策略缺少 TO authenticated，匿名角色可能绕过检查

-- 1. match_rounds 策略补充 TO authenticated
DROP POLICY IF EXISTS player_read_open_rounds ON public.match_rounds;
CREATE POLICY player_read_open_rounds ON public.match_rounds
  FOR SELECT TO authenticated
  USING (status IN ('open', 'closed', 'matched'));

DROP POLICY IF EXISTS admin_all_rounds ON public.match_rounds;
CREATE POLICY admin_all_rounds ON public.match_rounds
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 2. match_round_submissions 策略补充 TO authenticated
DROP POLICY IF EXISTS admin_all_submissions ON public.match_round_submissions;
CREATE POLICY admin_all_submissions ON public.match_round_submissions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS player_own_submissions ON public.match_round_submissions;
CREATE POLICY player_own_submissions ON public.match_round_submissions
  FOR ALL TO authenticated
  USING (member_id IN (
    SELECT id FROM public.members WHERE user_id = auth.uid()
  ))
  WITH CHECK (member_id IN (
    SELECT id FROM public.members WHERE user_id = auth.uid()
  ));
