-- Authorized one-time send. Run as the database owner only after the frontend
-- understands birthday_completion and /app/profile/birthday is deployed.
-- Permanent campaign state makes this entire script safe to retry, including
-- after the normal 90-day notification cleanup has deleted the notices.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';
SELECT pg_advisory_xact_lock(hashtextextended('birthday-completion-dispatch', 0));

DO $dispatch$
BEGIN
  INSERT INTO private.birthday_completion_campaign(singleton) VALUES (true)
  ON CONFLICT (singleton) DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO private.birthday_completion_recipients(member_id)
  SELECT member.id
  FROM public.members AS member
  JOIN public.member_identity AS identity ON identity.member_id = member.id
  WHERE member.account_status = 'active' AND member.status = 'approved'
    AND member.record_scope = 'current' AND member.membership_type = 'player'
    AND member.user_id IS NOT NULL AND member.anonymized_at IS NULL
    AND identity.birth_date IS NULL
  ORDER BY member.id
  FOR UPDATE OF member, identity;

  INSERT INTO public.community_notifications (
    recipient_member_id, notification_type, title_zh, title_ja, body_zh, body_ja
  )
  SELECT member_id, 'birthday_completion', '补充生日信息', '生年月日をご登録ください',
    '点击补充生日，我们会自动更新你的年龄段。不会影响当前账号的正常使用。',
    'タップして生年月日を登録すると、年齢区分が自動で更新されます。現在のアカウントは引き続きご利用いただけます。'
  FROM private.birthday_completion_recipients;

  UPDATE private.birthday_completion_campaign
  SET recipient_count = (SELECT count(*) FROM private.birthday_completion_recipients)
  WHERE singleton;
END
$dispatch$;

SELECT dispatched_at, recipient_count,
  (SELECT count(*) FROM public.community_notifications WHERE notification_type = 'birthday_completion') AS retained_notifications
FROM private.birthday_completion_campaign;
COMMIT;
