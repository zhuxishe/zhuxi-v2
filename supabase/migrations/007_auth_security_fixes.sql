-- Phase 7: Auth security fixes
-- 1. Add line_user_id column to members
-- 2. Fix overly permissive RLS policies on members/member_identity
-- 3. Remove anon INSERT policies (login-first flow)
-- 4. Fix interview_evaluations RLS (admin-only)
-- 5. Fix admin_users RLS (admin-only)

-- ── 1. Add line_user_id ──────────────────────────────
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS line_user_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_members_line_user_id
  ON public.members(line_user_id) WHERE line_user_id IS NOT NULL;

-- ── 2. Drop overly permissive policies from 002 ─────
DROP POLICY IF EXISTS "admin_read_members" ON public.members;
DROP POLICY IF EXISTS "admin_update_members" ON public.members;
DROP POLICY IF EXISTS "admin_read_identity" ON public.member_identity;

-- ── 3. Drop anon INSERT policies from 001 ───────────
DROP POLICY IF EXISTS "allow_anon_insert_members" ON public.members;
DROP POLICY IF EXISTS "allow_anon_insert_identity" ON public.member_identity;

-- ── 3b. Drop redundant player_read_own from 003 (replaced by combined policy below) ─
DROP POLICY IF EXISTS "player_read_own" ON public.members;

-- ── 4. Drop ad-hoc authenticated INSERT (added during debugging) ─
DROP POLICY IF EXISTS "authenticated_insert_members" ON public.members;
DROP POLICY IF EXISTS "authenticated_insert_identity" ON public.member_identity;

-- ── 5. Recreate proper policies ──────────────────────

-- members: SELECT — admin sees all, player sees own row
CREATE POLICY "select_members_admin_or_self" ON public.members
  FOR SELECT TO authenticated
  USING (public.is_admin() OR user_id = auth.uid());

-- members: UPDATE — admin can update all, player cannot update members directly
CREATE POLICY "update_members_admin" ON public.members
  FOR UPDATE TO authenticated
  USING (public.is_admin());

-- members: INSERT — authenticated users can create their own record
CREATE POLICY "insert_members_self" ON public.members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- member_identity: SELECT — admin sees all, player sees own
CREATE POLICY "select_identity_admin_or_self" ON public.member_identity
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid())
  );

-- member_identity: INSERT — player inserts own
CREATE POLICY "insert_identity_self" ON public.member_identity
  FOR INSERT TO authenticated
  WITH CHECK (
    member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid())
  );

-- member_identity: UPDATE — admin or own
CREATE POLICY "update_identity_admin_or_self" ON public.member_identity
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid())
  );

-- ── 6. Fix interview_evaluations RLS (admin-only + player reads own) ─

DROP POLICY IF EXISTS "admin_insert_evaluations" ON public.interview_evaluations;
DROP POLICY IF EXISTS "admin_read_evaluations" ON public.interview_evaluations;
DROP POLICY IF EXISTS "admin_update_evaluations" ON public.interview_evaluations;

CREATE POLICY "select_evaluations_admin_or_self" ON public.interview_evaluations
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid())
  );

CREATE POLICY "insert_evaluations_admin" ON public.interview_evaluations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "update_evaluations_admin" ON public.interview_evaluations
  FOR UPDATE TO authenticated
  USING (public.is_admin());

-- ── 7. Fix admin_users RLS (admin-only) ──────────────

DROP POLICY IF EXISTS "admin_read_admin_users" ON public.admin_users;

CREATE POLICY "select_admin_users" ON public.admin_users
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "insert_admin_users" ON public.admin_users
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "update_admin_users" ON public.admin_users
  FOR UPDATE TO authenticated
  USING (public.is_admin());

CREATE POLICY "delete_admin_users" ON public.admin_users
  FOR DELETE TO authenticated
  USING (public.is_admin());
