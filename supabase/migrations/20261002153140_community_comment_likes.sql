-- Comment reactions are separate from post reactions. Notifications keep one
-- row per recipient/comment, so repeated likes never reset its read/order state.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

ALTER TABLE public.community_comments
  ADD COLUMN like_count integer NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  ADD COLUMN like_version bigint NOT NULL DEFAULT 0 CHECK (like_version >= 0);

CREATE TABLE public.community_comment_likes (
  comment_id uuid NOT NULL REFERENCES public.community_comments(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, member_id)
);
CREATE INDEX community_comment_likes_member_idx
  ON public.community_comment_likes (member_id, comment_id);
ALTER TABLE public.community_comment_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_comment_likes_self_read
  ON public.community_comment_likes FOR SELECT TO authenticated
  USING (member_id = (SELECT private.community_approved_member_id()));
REVOKE ALL ON public.community_comment_likes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.community_comment_likes TO authenticated;
GRANT SELECT ON public.community_comment_likes TO service_role;

ALTER TABLE public.community_notifications
  DROP CONSTRAINT community_notifications_notification_type_check,
  ADD CONSTRAINT community_notifications_notification_type_check CHECK (
    notification_type IN (
      'like', 'comment_like', 'comment', 'reply', 'announcement', 'report_resolved',
      'content_hidden', 'content_deleted', 'warning', 'mute', 'permanent_ban',
      'registration_submitted', 'matching_submitted'
    )
  ),
  DROP CONSTRAINT community_notifications_group_count_check,
  ADD CONSTRAINT community_notifications_group_count_check CHECK (
    (notification_type = 'comment_like' AND group_count >= 0)
    OR (notification_type <> 'comment_like' AND group_count >= 1)
  );
CREATE UNIQUE INDEX community_notifications_comment_like_idx
  ON public.community_notifications (recipient_member_id, comment_id)
  WHERE notification_type = 'comment_like';

CREATE OR REPLACE FUNCTION private.community_notification_enabled(
  p_member_id uuid, p_notification_type text
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT CASE p_notification_type
    WHEN 'like' THEN COALESCE(pref.likes_enabled, true)
    WHEN 'comment_like' THEN COALESCE(pref.likes_enabled, true)
    WHEN 'comment' THEN COALESCE(pref.comments_enabled, true)
    WHEN 'reply' THEN COALESCE(pref.replies_enabled, true)
    WHEN 'announcement' THEN COALESCE(pref.announcements_enabled, true)
    ELSE true
  END
  FROM (SELECT 1) AS seed
  LEFT JOIN public.community_notification_preferences AS pref ON pref.member_id = p_member_id
$function$;

CREATE FUNCTION private.community_sync_comment_like_notification(p_comment_id uuid, p_notify boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_comment public.community_comments%ROWTYPE;
  v_recipient uuid;
  v_notification_count integer := 0;
BEGIN
  -- Callers hold the parent post lock before touching notifications. This
  -- helper must never lock/update comments: legacy comment writes lock the
  -- comment first, then the post through community_comments_refresh_count.
  SELECT * INTO v_comment FROM public.community_comments WHERE id = p_comment_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_recipient := private.community_comment_author_member(p_comment_id);
  IF v_recipient IS NULL THEN RETURN; END IF;
  IF v_comment.status = 'published'
     AND EXISTS (SELECT 1 FROM public.community_posts WHERE id = v_comment.post_id AND status = 'published')
     AND (v_comment.parent_comment_id IS NULL OR EXISTS (
       SELECT 1 FROM public.community_comments WHERE id = v_comment.parent_comment_id AND status IN ('published', 'deleted')
     )) THEN
    SELECT count(*)::integer INTO v_notification_count
    FROM public.community_comment_likes AS reaction
    WHERE reaction.comment_id = p_comment_id AND reaction.member_id <> v_recipient;
  END IF;

  -- Zero-count rows remain as read tombstones until normal 90-day cleanup.
  -- A cancel/re-like can change the number, never create another unread event.
  UPDATE public.community_notifications AS notification
  SET group_count = v_notification_count,
      actor_profile_id = NULL,
      read_at = CASE WHEN v_notification_count = 0 THEN COALESCE(notification.read_at, now()) ELSE notification.read_at END
  WHERE notification.notification_type = 'comment_like'
    AND notification.recipient_member_id = v_recipient AND notification.comment_id = p_comment_id;
  IF FOUND OR NOT p_notify OR v_notification_count = 0 THEN RETURN; END IF;

  IF NOT private.community_notification_enabled(v_recipient, 'comment_like')
     OR NOT EXISTS (SELECT 1 FROM public.members WHERE id = v_recipient AND account_status = 'active' AND anonymized_at IS NULL)
     OR EXISTS (
       SELECT 1 FROM public.community_sanctions
       WHERE member_id = v_recipient AND sanction_type = 'permanent_ban'
         AND revoked_at IS NULL AND starts_at <= now()
     ) THEN RETURN; END IF;
  INSERT INTO public.community_notifications (
    recipient_member_id, notification_type, post_id, comment_id, actor_profile_id,
    title_zh, title_ja, group_count
  ) VALUES (
    v_recipient, 'comment_like', v_comment.post_id, p_comment_id, NULL,
    '有人赞了你的评论', 'あなたのコメントにいいねがつきました', v_notification_count
  ) ON CONFLICT (recipient_member_id, comment_id) WHERE notification_type = 'comment_like'
    DO NOTHING;
END;
$function$;

CREATE FUNCTION private.community_sync_comment_likes(p_comment_id uuid, p_notify boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_comment public.community_comments%ROWTYPE;
  v_count integer;
BEGIN
  SELECT * INTO v_comment FROM public.community_comments WHERE id = p_comment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  -- Same comment -> post -> notification order as existing comment status
  -- changes; the post lock serializes moderation against a first-like notice.
  PERFORM 1 FROM public.community_posts WHERE id = v_comment.post_id FOR SHARE;
  SELECT count(*)::integer INTO v_count
  FROM public.community_comment_likes WHERE comment_id = p_comment_id;
  UPDATE public.community_comments SET like_count = v_count, like_version = like_version + 1
  WHERE id = p_comment_id AND like_count IS DISTINCT FROM v_count;
  PERFORM private.community_sync_comment_like_notification(p_comment_id, p_notify);
END;
$function$;

CREATE FUNCTION private.community_comment_likes_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_recipient uuid;
  v_notify boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_recipient := private.community_comment_author_member(NEW.comment_id);
    v_notify := v_recipient IS NOT NULL AND v_recipient <> NEW.member_id
      AND NOT private.community_notification_interaction_blocked(v_recipient, NEW.member_id);
    PERFORM private.community_sync_comment_likes(NEW.comment_id, v_notify);
    RETURN NEW;
  END IF;
  PERFORM private.community_sync_comment_likes(OLD.comment_id, false);
  RETURN OLD;
END;
$function$;
CREATE TRIGGER community_comment_likes_changed
  AFTER INSERT OR DELETE ON public.community_comment_likes
  FOR EACH ROW EXECUTE FUNCTION private.community_comment_likes_changed();

CREATE FUNCTION public.community_set_comment_like(p_comment_id uuid, p_liked boolean)
RETURNS TABLE (liked boolean, like_count integer, like_version bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_member_id uuid;
  v_comment public.community_comments%ROWTYPE;
  v_post public.community_posts%ROWTYPE;
BEGIN
  IF p_comment_id IS NULL OR p_liked IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'COMMENT_LIKE_INVALID';
  END IF;
  IF NOT private.community_can_interact() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'COMMENT_LIKE_NOT_ALLOWED';
  END IF;
  v_member_id := private.community_approved_member_id();
  SELECT * INTO v_comment FROM public.community_comments WHERE id = p_comment_id FOR UPDATE;
  -- Existing comment mutation paths lock comment before updating its post.
  SELECT * INTO v_post FROM public.community_posts WHERE id = v_comment.post_id FOR SHARE;
  IF v_comment.id IS NULL OR v_comment.status <> 'published' OR v_post.status <> 'published'
     OR NOT private.community_comment_visible_to_current(p_comment_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'COMMENT_LIKE_UNAVAILABLE';
  END IF;
  -- Never resolve private anonymous authors for success/failure block checks:
  -- that would let callers discover authors via their block relationships.
  IF (v_post.author_profile_id IS NOT NULL AND private.community_interaction_is_blocked(v_post.author_profile_id))
     OR (v_comment.author_profile_id IS NOT NULL AND private.community_interaction_is_blocked(v_comment.author_profile_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'COMMENT_LIKE_UNAVAILABLE';
  END IF;
  IF p_liked THEN
    INSERT INTO public.community_comment_likes (comment_id, member_id)
    VALUES (p_comment_id, v_member_id) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.community_comment_likes AS reaction
    WHERE reaction.comment_id = p_comment_id AND reaction.member_id = v_member_id;
  END IF;
  RETURN QUERY SELECT
    EXISTS (SELECT 1 FROM public.community_comment_likes AS reaction WHERE reaction.comment_id = p_comment_id AND reaction.member_id = v_member_id),
    comment.like_count, comment.like_version FROM public.community_comments AS comment WHERE comment.id = p_comment_id;
END;
$function$;

CREATE FUNCTION public.community_get_comment_like_states(p_comment_ids uuid[])
RETURNS TABLE (comment_id uuid, liked boolean, like_count integer, like_version bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_member_id uuid;
BEGIN
  IF COALESCE(cardinality(p_comment_ids), 0) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'COMMENT_LIKE_BATCH_TOO_LARGE';
  END IF;
  IF NOT private.community_can_read() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'COMMENT_LIKE_NOT_ALLOWED';
  END IF;
  v_member_id := private.community_approved_member_id();
  -- One statement snapshot keeps the count/version and own reaction aligned.
  RETURN QUERY SELECT comment.id,
    EXISTS (SELECT 1 FROM public.community_comment_likes AS reaction
      WHERE reaction.comment_id = comment.id AND reaction.member_id = v_member_id),
    comment.like_count, comment.like_version
  FROM public.community_comments AS comment
  WHERE comment.id = ANY(p_comment_ids) AND comment.status = 'published'
    AND private.community_comment_visible_to_current(comment.id);
END;
$function$;

-- Moderation/author deletion retains placeholder comments, but their notices
-- must not stay unread. Restoring a hidden comment never creates a new notice.
CREATE FUNCTION private.community_comment_like_content_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_reply_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM 1 FROM public.community_posts WHERE id = OLD.post_id FOR UPDATE;
    DELETE FROM public.community_notifications WHERE notification_type = 'comment_like' AND comment_id = OLD.id;
    RETURN OLD;
  END IF;
  PERFORM private.community_sync_comment_like_notification(NEW.id, false);
  FOR v_reply_id IN SELECT id FROM public.community_comments WHERE parent_comment_id = NEW.id ORDER BY id LOOP
    PERFORM private.community_sync_comment_like_notification(v_reply_id, false);
  END LOOP;
  RETURN NEW;
END;
$function$;
-- Trigger names order PostgreSQL row triggers: notify after the legacy
-- community_comments_refresh_count has locked/updated the post.
CREATE TRIGGER community_z_comment_like_content_changed
  AFTER UPDATE OF status ON public.community_comments FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION private.community_comment_like_content_changed();
CREATE TRIGGER community_comment_like_content_deleted
  BEFORE DELETE ON public.community_comments FOR EACH ROW
  EXECUTE FUNCTION private.community_comment_like_content_changed();

CREATE FUNCTION private.community_post_comment_likes_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_comment_id uuid;
BEGIN
  -- This trigger holds only post -> notification locks, never comment locks.
  FOR v_comment_id IN SELECT id FROM public.community_comments WHERE post_id = NEW.id ORDER BY id LOOP
    PERFORM private.community_sync_comment_like_notification(v_comment_id, false);
  END LOOP;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER community_post_comment_likes_changed
  AFTER UPDATE OF status ON public.community_posts FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION private.community_post_comment_likes_changed();

-- Anonymization keeps the members row, so FK cascade alone cannot erase votes.
CREATE FUNCTION private.community_erase_member_comment_likes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  PERFORM comment.id FROM public.community_comments AS comment
  JOIN public.community_comment_likes AS reaction ON reaction.comment_id = comment.id
  WHERE reaction.member_id = NEW.id ORDER BY comment.id FOR UPDATE OF comment;
  DELETE FROM public.community_comment_likes WHERE member_id = NEW.id;
  DELETE FROM public.community_notifications
  WHERE recipient_member_id = NEW.id AND notification_type = 'comment_like';
  RETURN NEW;
END;
$function$;
CREATE TRIGGER community_erase_member_comment_likes
  AFTER UPDATE OF anonymized_at ON public.members FOR EACH ROW
  WHEN (OLD.anonymized_at IS NULL AND NEW.anonymized_at IS NOT NULL)
  EXECUTE FUNCTION private.community_erase_member_comment_likes();

REVOKE ALL ON FUNCTION private.community_notification_enabled(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.community_sync_comment_likes(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.community_sync_comment_like_notification(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.community_comment_likes_changed() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.community_comment_like_content_changed() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.community_post_comment_likes_changed() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.community_erase_member_comment_likes() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.community_set_comment_like(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_set_comment_like(uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.community_get_comment_like_states(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_get_comment_like_states(uuid[]) TO authenticated;

COMMIT;
