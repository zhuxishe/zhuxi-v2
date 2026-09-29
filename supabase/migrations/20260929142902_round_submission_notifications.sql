-- A self-service submission and its receipt commit together. Existing submissions
-- are not backfilled, and answer updates never generate another receipt.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

ALTER TABLE public.community_notifications
  ADD COLUMN round_id uuid REFERENCES public.match_rounds(id) ON DELETE SET NULL;

ALTER TABLE public.community_notifications
  DROP CONSTRAINT community_notifications_notification_type_check,
  ADD CONSTRAINT community_notifications_notification_type_check CHECK (
    notification_type IN (
      'like', 'comment', 'reply', 'announcement', 'report_resolved',
      'content_hidden', 'content_deleted', 'warning', 'mute', 'permanent_ban',
      'registration_submitted', 'matching_submitted'
    )
  );

CREATE UNIQUE INDEX community_notifications_round_receipt_idx
  ON public.community_notifications (recipient_member_id, round_id)
  WHERE round_id IS NOT NULL
    AND notification_type IN ('registration_submitted', 'matching_submitted');

CREATE OR REPLACE FUNCTION private.notify_round_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_round public.match_rounds%ROWTYPE;
  v_title_ja text;
BEGIN
  -- Only the authenticated member's own submission creates a personal receipt.
  -- Administrative imports and historical backfills must not send new notices.
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.members AS member
    WHERE member.id = NEW.member_id
      AND member.user_id = (SELECT auth.uid())
      AND member.status = 'approved'
      AND member.account_status = 'active'
      AND member.anonymized_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_round FROM public.match_rounds WHERE id = NEW.round_id;
  IF NOT FOUND OR v_round.purpose NOT IN ('registration', 'matching') THEN
    RETURN NEW;
  END IF;
  v_title_ja := COALESCE(NULLIF(btrim(v_round.content_config ->> 'titleJa'), ''), v_round.round_name);

  -- This is an account transaction receipt, independent of community interaction
  -- preferences or sanctions. The recipient comes exclusively from the saved row.
  INSERT INTO public.community_notifications (
    recipient_member_id, notification_type, round_id,
    title_zh, title_ja, body_zh, body_ja
  ) VALUES (
    NEW.member_id,
    CASE v_round.purpose WHEN 'registration' THEN 'registration_submitted' ELSE 'matching_submitted' END,
    NEW.round_id,
    CASE v_round.purpose WHEN 'registration' THEN '报名已提交' ELSE '匹配问卷已提交' END,
    CASE v_round.purpose WHEN 'registration' THEN '申込みを受け付けました' ELSE 'マッチングアンケートを受け付けました' END,
    CASE v_round.purpose
      WHEN 'registration' THEN '「' || v_round.round_name || '」的报名信息已保存，可在参与记录中查看。'
      ELSE '「' || v_round.round_name || '」的匹配问卷已保存，可在参与记录中查看。'
    END,
    CASE v_round.purpose
      WHEN 'registration' THEN '「' || v_title_ja || '」の申込内容を保存しました。参加履歴から確認できます。'
      ELSE '「' || v_title_ja || '」のアンケートを保存しました。参加履歴から確認できます。'
    END
  )
  ON CONFLICT (recipient_member_id, round_id)
    WHERE round_id IS NOT NULL
      AND notification_type IN ('registration_submitted', 'matching_submitted')
    DO NOTHING;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.notify_round_submission() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER notify_round_submission
  AFTER INSERT ON public.match_round_submissions
  FOR EACH ROW EXECUTE FUNCTION private.notify_round_submission();

COMMIT;
