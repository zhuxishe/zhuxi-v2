-- Archive legacy/import member shells without deleting historical references.
-- Historical records remain addressable by members.id for old matches and
-- provenance, but they cannot become login identities or active operators.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

SELECT pg_advisory_xact_lock(hashtextextended('archive_historical_member_records', 0));

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS record_scope text NOT NULL DEFAULT 'current';

COMMENT ON COLUMN public.members.record_scope IS
  'current = live user/member; historical = reference-only legacy/import shell';

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.members AS member
    WHERE member.record_source IN ('legacy', 'import')
      AND (
        member.user_id IS NOT NULL
        OR member.email IS NOT NULL
        OR member.line_user_id IS NOT NULL
        OR member.wechat_openid IS NOT NULL
        OR member.account_linked_at IS NOT NULL
        OR member.account_status <> 'unbound'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'MEMBER_MASTER_HISTORICAL_PREFLIGHT_FAILED';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION private.member_master_sync_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.record_source = 'app'
     AND NEW.member_number LIKE 'IMP-%' THEN
    NEW.record_source := 'import';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.record_scope = 'historical'
     AND (
       NEW.record_scope IS DISTINCT FROM OLD.record_scope
       OR NEW.record_source IS DISTINCT FROM OLD.record_source
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.line_user_id IS DISTINCT FROM OLD.line_user_id
       OR NEW.wechat_openid IS DISTINCT FROM OLD.wechat_openid
       OR NEW.account_linked_at IS DISTINCT FROM OLD.account_linked_at
       OR NEW.account_status IS DISTINCT FROM OLD.account_status
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'MEMBER_MASTER_HISTORICAL_IDENTITY_IMMUTABLE';
  END IF;

  NEW.record_scope := CASE
    WHEN NEW.record_source IN ('legacy', 'import') THEN 'historical'
    ELSE 'current'
  END;

  IF NEW.record_scope = 'historical' THEN
    IF NEW.user_id IS NOT NULL
       OR NEW.email IS NOT NULL
       OR NEW.line_user_id IS NOT NULL
       OR NEW.wechat_openid IS NOT NULL
       OR NEW.account_linked_at IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'MEMBER_MASTER_HISTORICAL_IDENTITY_FORBIDDEN';
    END IF;
    NEW.account_status := 'unbound';
  ELSIF NEW.user_id IS NULL
        AND NEW.account_status NOT IN ('closed', 'suspended') THEN
    NEW.account_status := 'unbound';
  ELSIF NEW.user_id IS NOT NULL AND NEW.account_status = 'unbound' THEN
    NEW.account_status := 'active';
  END IF;

  IF NEW.record_scope = 'current'
     AND NEW.user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.user_id IS DISTINCT FROM NEW.user_id) THEN
    NEW.account_linked_at := COALESCE(NEW.account_linked_at, now());
  END IF;

  IF NEW.status = 'approved' THEN
    NEW.profile_stage := 'complete';
    NEW.onboarding_step := 4;
    NEW.submitted_at := COALESCE(NEW.submitted_at, now());
  END IF;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION private.member_master_audit_member_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_changed text[];
  v_source text;
  v_admin_id uuid;
BEGIN
  IF COALESCE(current_setting('app.member_master_skip_member_audit', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  v_before := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE jsonb_build_object(
    'status', OLD.status,
    'member_number', OLD.member_number,
    'membership_type', OLD.membership_type,
    'user_id', OLD.user_id,
    'email', OLD.email,
    'line_user_id', OLD.line_user_id,
    'wechat_openid', OLD.wechat_openid,
    'account_status', OLD.account_status,
    'profile_stage', OLD.profile_stage,
    'record_source', OLD.record_source,
    'record_scope', OLD.record_scope,
    'onboarding_step', OLD.onboarding_step,
    'last_profile_saved_at', OLD.last_profile_saved_at,
    'submitted_at', OLD.submitted_at,
    'account_linked_at', OLD.account_linked_at,
    'anonymized_at', OLD.anonymized_at
  ) END;
  v_after := jsonb_build_object(
    'status', NEW.status,
    'member_number', NEW.member_number,
    'membership_type', NEW.membership_type,
    'user_id', NEW.user_id,
    'email', NEW.email,
    'line_user_id', NEW.line_user_id,
    'wechat_openid', NEW.wechat_openid,
    'account_status', NEW.account_status,
    'profile_stage', NEW.profile_stage,
    'record_source', NEW.record_source,
    'record_scope', NEW.record_scope,
    'onboarding_step', NEW.onboarding_step,
    'last_profile_saved_at', NEW.last_profile_saved_at,
    'submitted_at', NEW.submitted_at,
    'account_linked_at', NEW.account_linked_at,
    'anonymized_at', NEW.anonymized_at
  );
  v_changed := private.member_master_changed_fields(v_before, v_after);
  IF cardinality(v_changed) = 0 THEN
    RETURN NEW;
  END IF;

  v_source := COALESCE(
    NULLIF(current_setting('app.member_master_audit_source', true), ''),
    CASE WHEN TG_OP = 'INSERT' THEN NEW.record_source ELSE 'system' END
  );
  v_admin_id := private.member_master_current_admin_id();

  INSERT INTO private.member_profile_audit_log (
    member_id, member_id_snapshot, action_type, section, changed_fields,
    before_values, after_values, reason, source,
    actor_user_id, actor_admin_id, actor_name
  ) VALUES (
    NEW.id, NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN 'member_created' ELSE 'member_lifecycle_update' END,
    'member', v_changed, v_before, v_after,
    NULLIF(current_setting('app.member_master_audit_reason', true), ''),
    v_source, (SELECT auth.uid()), v_admin_id,
    (SELECT administrator.name FROM public.admin_users AS administrator WHERE administrator.id = v_admin_id)
  );
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION private.member_master_sync_member_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_current boolean := NEW.record_scope = 'current';
  v_source text := CASE
    WHEN current_setting('app.member_master_audit_source', true) IN ('migration', 'import', 'legacy')
      THEN current_setting('app.member_master_audit_source', true)
    WHEN NEW.record_source IN ('legacy', 'import') THEN NEW.record_source
    WHEN private.member_master_current_admin_id() IS NOT NULL THEN 'admin'
    ELSE 'app'
  END;
BEGIN
  PERFORM private.member_master_set_role(
    NEW.id, 'user', v_current, v_source, '根据成员记录范围同步'
  );
  PERFORM private.member_master_set_role(
    NEW.id, 'member', v_current AND NEW.status IN ('approved', 'inactive'),
    v_source, '根据成员审批状态和记录范围同步'
  );
  PERFORM private.member_master_set_role(
    NEW.id, 'staff', v_current AND NEW.membership_type = 'staff',
    v_source, '根据成员类型和记录范围同步'
  );
  PERFORM private.member_master_set_role(
    NEW.id, 'admin',
    v_current AND NEW.user_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.admin_users AS administrator
      WHERE administrator.user_id = NEW.user_id
    ),
    v_source, '根据管理员账号和记录范围同步'
  );
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION private.member_master_skip_historical_duplicate_candidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.members AS member
    WHERE member.id IN (NEW.left_member_id, NEW.right_member_id)
      AND member.record_scope = 'historical'
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS member_master_sync_lifecycle ON public.members;
CREATE TRIGGER member_master_sync_lifecycle
  BEFORE INSERT OR UPDATE OF status, member_number, user_id, email,
    line_user_id, wechat_openid, account_status, profile_stage,
    record_source, record_scope, onboarding_step, account_linked_at,
    anonymized_at
  ON public.members
  FOR EACH ROW EXECUTE FUNCTION private.member_master_sync_lifecycle();

DROP TRIGGER IF EXISTS member_master_audit_member_change ON public.members;
CREATE TRIGGER member_master_audit_member_change
  AFTER INSERT OR UPDATE OF status, member_number, membership_type, user_id,
    email, line_user_id, wechat_openid, account_status, profile_stage,
    record_source, record_scope, onboarding_step, last_profile_saved_at,
    submitted_at, account_linked_at, anonymized_at
  ON public.members
  FOR EACH ROW EXECUTE FUNCTION private.member_master_audit_member_change();

DROP TRIGGER IF EXISTS member_master_sync_member_roles ON public.members;
CREATE TRIGGER member_master_sync_member_roles
  AFTER INSERT OR UPDATE OF status, membership_type, user_id, record_scope
  ON public.members
  FOR EACH ROW EXECUTE FUNCTION private.member_master_sync_member_roles();

DROP TRIGGER IF EXISTS member_master_skip_historical_duplicate_candidate
  ON private.member_duplicate_candidates;
CREATE TRIGGER member_master_skip_historical_duplicate_candidate
  BEFORE INSERT ON private.member_duplicate_candidates
  FOR EACH ROW EXECUTE FUNCTION private.member_master_skip_historical_duplicate_candidate();

SELECT set_config('app.member_master_audit_source', 'migration', true);
SELECT set_config(
  'app.member_master_audit_reason',
  '将未绑定的历史记录与批量导入记录归档为旧记录，仅保留历史追溯',
  true
);
SELECT set_config('app.member_master_explicit_audit', 'on', true);

UPDATE public.members AS member
SET record_scope = 'historical'
WHERE member.record_source IN ('legacy', 'import')
  AND member.record_scope <> 'historical';

SELECT set_config('app.member_master_explicit_audit', 'off', true);

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.members'::regclass
      AND conname = 'members_record_scope_state_check'
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_record_scope_state_check CHECK (
        (
          record_scope = 'current'
          AND record_source IN ('app', 'line', 'admin')
        )
        OR (
          record_scope = 'historical'
          AND record_source IN ('legacy', 'import')
          AND user_id IS NULL
          AND email IS NULL
          AND line_user_id IS NULL
          AND wechat_openid IS NULL
          AND account_linked_at IS NULL
          AND account_status = 'unbound'
        )
      ) NOT VALID;
  END IF;
END
$constraint$;

ALTER TABLE public.members
  VALIDATE CONSTRAINT members_record_scope_state_check;

CREATE INDEX IF NOT EXISTS members_current_directory_idx
  ON public.members (account_status, status, created_at DESC, id)
  WHERE record_scope = 'current';

DO $postcondition$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.members AS member
    WHERE member.record_source IN ('legacy', 'import')
      AND member.record_scope <> 'historical'
  ) OR EXISTS (
    SELECT 1
    FROM private.member_role_assignments AS assignment
    JOIN public.members AS member ON member.id = assignment.member_id
    WHERE member.record_scope = 'historical'
      AND assignment.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'MEMBER_MASTER_HISTORICAL_ARCHIVE_INCOMPLETE';
  END IF;
END
$postcondition$;

REVOKE ALL ON FUNCTION private.member_master_skip_historical_duplicate_candidate()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
