-- Optional, one-time birthday completion for a frozen set of existing players.
-- Dispatch happens separately, after the completion page is deployed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';
SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration', 0));

CREATE TABLE private.birthday_completion_campaign (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  dispatched_at timestamptz NOT NULL DEFAULT now(),
  recipient_count integer NOT NULL DEFAULT 0 CHECK (recipient_count >= 0)
);
CREATE TABLE private.birthday_completion_recipients (
  member_id uuid PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  selected_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.birthday_completion_campaign ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.birthday_completion_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.birthday_completion_campaign,
  private.birthday_completion_recipients FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON TABLE private.birthday_completion_campaign IS
  'Permanent singleton dispatch marker. A retry must never recruit future signups or resend expired notifications.';
COMMENT ON TABLE private.birthday_completion_recipients IS
  'Frozen existing-player birthday completion cohort; independent of notification retention.';

ALTER TABLE public.community_notifications
  DROP CONSTRAINT community_notifications_notification_type_check,
  ADD CONSTRAINT community_notifications_notification_type_check CHECK (
    notification_type IN (
      'like', 'comment_like', 'comment', 'reply', 'announcement', 'report_resolved',
      'content_hidden', 'content_deleted', 'warning', 'mute', 'permanent_ban',
      'registration_submitted', 'matching_submitted', 'birthday_completion'
    )
  );
CREATE UNIQUE INDEX community_notifications_birthday_completion_recipient_idx
  ON public.community_notifications (recipient_member_id)
  WHERE notification_type = 'birthday_completion';

CREATE OR REPLACE FUNCTION public.get_my_birthday_completion()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_identity public.member_identity%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR COALESCE((SELECT auth.jwt()->>'is_anonymous'), 'false') = 'true' THEN
    RETURN jsonb_build_object('eligible', false, 'birth_date', NULL, 'age_range', NULL);
  END IF;
  SELECT identity.* INTO v_identity
  FROM public.members AS member
  JOIN private.birthday_completion_recipients AS recipient ON recipient.member_id = member.id
  JOIN public.member_identity AS identity ON identity.member_id = member.id
  WHERE member.user_id = (SELECT auth.uid())
    AND member.account_status = 'active' AND member.status = 'approved'
    AND member.record_scope = 'current' AND member.membership_type = 'player'
    AND member.anonymized_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible', false, 'birth_date', NULL, 'age_range', NULL);
  END IF;
  RETURN jsonb_build_object(
    'eligible', true,
    'birth_date', v_identity.birth_date,
    'age_range', COALESCE(private.member_age_range_for_birth_date(
      v_identity.birth_date, (now() AT TIME ZONE 'Asia/Tokyo')::date
    ), v_identity.age_range)
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.complete_my_birth_date(p_birth_date text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member public.members%ROWTYPE;
  v_identity public.member_identity%ROWTYPE;
  v_birth_date date;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR COALESCE((SELECT auth.jwt()->>'is_anonymous'), 'false') = 'true' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BIRTH_DATE_NOT_ELIGIBLE';
  END IF;
  -- Match the existing admin/onboarding lock order: member, then identity.
  SELECT * INTO v_member FROM public.members
  WHERE user_id = (SELECT auth.uid()) FOR UPDATE;
  IF NOT FOUND OR v_member.account_status <> 'active' OR v_member.status <> 'approved'
     OR v_member.record_scope <> 'current' OR v_member.membership_type <> 'player'
     OR v_member.anonymized_at IS NOT NULL
     OR NOT EXISTS (SELECT 1 FROM private.birthday_completion_recipients WHERE member_id = v_member.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BIRTH_DATE_NOT_ELIGIBLE';
  END IF;
  SELECT * INTO v_identity FROM public.member_identity
  WHERE member_id = v_member.id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BIRTH_DATE_NOT_ELIGIBLE';
  END IF;
  BEGIN
    v_birth_date := private.member_birth_date_from_payload(to_jsonb(p_birth_date));
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BIRTH_DATE_INVALID';
  END;
  IF v_birth_date IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BIRTH_DATE_INVALID';
  END IF;
  IF v_identity.birth_date IS NOT NULL THEN
    IF v_identity.birth_date <> v_birth_date THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BIRTH_DATE_ALREADY_SET';
    END IF;
    RETURN public.get_my_birthday_completion();
  END IF;

  v_before := to_jsonb(v_identity);
  -- The existing birth-date trigger calculates age_range and preserves its old value.
  -- No school, onboarding, approval, or profile-completeness state is changed.
  UPDATE public.member_identity SET birth_date = v_birth_date
  WHERE member_id = v_member.id RETURNING to_jsonb(member_identity) INTO v_after;
  INSERT INTO private.member_profile_audit_log (
    member_id, member_id_snapshot, action_type, section, changed_fields,
    before_values, after_values, source, actor_user_id, metadata
  ) VALUES (
    v_member.id, v_member.id, 'profile_update', 'identity',
    private.member_master_changed_fields(v_before, v_after),
    v_before, v_after, 'app', (SELECT auth.uid()),
    jsonb_build_object('flow', 'birthday_completion')
  );
  RETURN public.get_my_birthday_completion();
END
$function$;

-- Also settle the reminder when an administrator or another authorized flow fills it.
CREATE OR REPLACE FUNCTION private.birthday_completion_mark_read()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.community_notifications SET read_at = now()
  WHERE recipient_member_id = NEW.member_id
    AND notification_type = 'birthday_completion' AND read_at IS NULL;
  RETURN NEW;
END
$function$;
CREATE TRIGGER birthday_completion_mark_read
  AFTER INSERT OR UPDATE OF birth_date ON public.member_identity
  FOR EACH ROW WHEN (NEW.birth_date IS NOT NULL)
  EXECUTE FUNCTION private.birthday_completion_mark_read();

REVOKE ALL ON FUNCTION public.get_my_birthday_completion(),
  public.complete_my_birth_date(text), private.birthday_completion_mark_read()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_birthday_completion(),
  public.complete_my_birth_date(text) TO authenticated;
COMMIT;
