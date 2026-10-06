-- Read-only structural and campaign-integrity checks; never sends a notification.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
DO $audit$
DECLARE
  v_table regclass;
  v_function regprocedure;
  v_role text;
  v_type text;
  v_constraint text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'private.birthday_completion_campaign'::regclass,
    'private.birthday_completion_recipients'::regclass
  ] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = v_table)
       OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = v_table) THEN
      RAISE EXCEPTION 'BIRTHDAY_COMPLETION_PRIVATE_RLS: %', v_table;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF has_table_privilege(v_role, v_table, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'BIRTHDAY_COMPLETION_PRIVATE_ACCESS: % %', v_role, v_table;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH v_function IN ARRAY ARRAY[
    'public.get_my_birthday_completion()'::regprocedure,
    'public.complete_my_birth_date(text)'::regprocedure
  ] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF has_function_privilege(v_role, v_function, 'EXECUTE') IS DISTINCT FROM (v_role = 'authenticated') THEN
        RAISE EXCEPTION 'BIRTHDAY_COMPLETION_RPC_ACL: % %', v_role, v_function;
      END IF;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_function AND prosecdef
      AND 'search_path=""' = ANY(proconfig)) THEN
      RAISE EXCEPTION 'BIRTHDAY_COMPLETION_RPC_SECURITY: %', v_function;
    END IF;
  END LOOP;
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF has_function_privilege(v_role, 'private.birthday_completion_mark_read()', 'EXECUTE') THEN
      RAISE EXCEPTION 'BIRTHDAY_COMPLETION_TRIGGER_ACL: %', v_role;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.member_identity'::regclass
      AND tgname = 'birthday_completion_mark_read' AND tgenabled = 'O'
      AND tgfoid = 'private.birthday_completion_mark_read()'::regprocedure) THEN
    RAISE EXCEPTION 'BIRTHDAY_COMPLETION_TRIGGER_MISSING';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index
    WHERE indexrelid = 'public.community_notifications_birthday_completion_recipient_idx'::regclass
      AND indisunique AND indisvalid
      AND pg_get_expr(indpred, indrelid) = '(notification_type = ''birthday_completion''::text)') THEN
    RAISE EXCEPTION 'BIRTHDAY_COMPLETION_DEDUPLICATION_INDEX';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO v_constraint FROM pg_constraint
  WHERE conrelid = 'public.community_notifications'::regclass
    AND conname = 'community_notifications_notification_type_check';
  FOREACH v_type IN ARRAY ARRAY[
    'like', 'comment_like', 'comment', 'reply', 'announcement', 'report_resolved',
    'content_hidden', 'content_deleted', 'warning', 'mute', 'permanent_ban',
    'registration_submitted', 'matching_submitted', 'birthday_completion'
  ] LOOP
    IF v_constraint IS NULL OR position(quote_literal(v_type) IN v_constraint) = 0 THEN
      RAISE EXCEPTION 'BIRTHDAY_COMPLETION_NOTIFICATION_TYPE: %', v_type;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM private.birthday_completion_recipients recipient
    LEFT JOIN private.birthday_completion_campaign campaign ON campaign.singleton
    WHERE campaign.singleton IS NULL OR recipient.selected_at <> campaign.dispatched_at
  ) OR EXISTS (
    SELECT 1 FROM private.birthday_completion_campaign
    WHERE recipient_count < (SELECT count(*) FROM private.birthday_completion_recipients)
  ) THEN
    RAISE EXCEPTION 'BIRTHDAY_COMPLETION_FROZEN_COHORT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.community_notifications notification
    LEFT JOIN private.birthday_completion_recipients recipient ON recipient.member_id = notification.recipient_member_id
    LEFT JOIN public.member_identity identity ON identity.member_id = notification.recipient_member_id
    WHERE notification.notification_type = 'birthday_completion'
      AND (recipient.member_id IS NULL OR (identity.birth_date IS NOT NULL AND notification.read_at IS NULL))
  ) THEN
    RAISE EXCEPTION 'BIRTHDAY_COMPLETION_NOTIFICATION_CONSISTENCY';
  END IF;
END
$audit$;
SELECT 'PASS' AS result,
  (SELECT recipient_count FROM private.birthday_completion_campaign) AS dispatched_count,
  (SELECT count(*) FROM private.birthday_completion_recipients) AS retained_recipients,
  (SELECT count(*) FROM public.community_notifications WHERE notification_type = 'birthday_completion') AS retained_notifications,
  (SELECT count(*) FROM private.birthday_completion_recipients recipient
    JOIN public.member_identity identity ON identity.member_id = recipient.member_id
    WHERE identity.birth_date IS NOT NULL) AS completed_count;
COMMIT;
