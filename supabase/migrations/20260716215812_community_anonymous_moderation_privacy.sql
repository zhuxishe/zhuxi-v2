-- Keep anonymous author mappings private during proactive moderation.
-- The service-role function may resolve the recipient transiently in order to
-- notify the author, but it never persists that member id in a public table.

DROP POLICY IF EXISTS community_moderation_actions_admin_read
  ON public.community_moderation_actions;

DROP POLICY IF EXISTS community_notifications_self_or_admin_read
  ON public.community_notifications;

DROP POLICY IF EXISTS community_notifications_self_read
  ON public.community_notifications;

CREATE POLICY community_notifications_self_read
  ON public.community_notifications
  FOR SELECT TO authenticated
  USING (
    recipient_member_id = (SELECT private.community_approved_member_id())
  );

-- Remove identity mappings from every content-status action, including older
-- report-linked hide/delete actions. Dedicated reveal audit actions use a
-- different action_type and remain intact.
UPDATE public.community_moderation_actions AS action
SET target_member_id = NULL
WHERE action.action_type IN ('hide_content', 'delete_content', 'restore_content')
  AND action.target_member_id IS NOT NULL
  AND (
    EXISTS (
      SELECT 1
      FROM public.community_posts AS post
      WHERE post.id = action.target_post_id
        AND post.is_anonymous
    )
    OR EXISTS (
      SELECT 1
      FROM public.community_comments AS comment
      WHERE comment.id = action.target_comment_id
        AND comment.is_anonymous_author
    )
  );

CREATE OR REPLACE FUNCTION public.community_admin_moderate_content(
  p_target_type text,
  p_target_id uuid,
  p_status text,
  p_reason_code text,
  p_internal_note text DEFAULT NULL,
  p_admin_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_target_member_id uuid;
  v_action_type text;
  v_notification_type text;
  v_snapshot jsonb;
  v_current_status text;
  v_is_anonymous boolean;
  v_reason_zh text;
  v_reason_ja text;
  v_note text := NULLIF(btrim(p_internal_note), '');
BEGIN
  v_admin_id := private.community_resolve_admin_id(p_admin_user_id);
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Administrator access is required';
  END IF;
  IF p_target_type NOT IN ('post', 'comment')
     OR p_status NOT IN ('published', 'hidden', 'deleted') THEN
    RAISE EXCEPTION 'Invalid moderation target or status';
  END IF;
  IF p_reason_code NOT IN (
       'privacy', 'harassment', 'spam', 'inappropriate', 'other',
       'reviewed_restore'
     ) THEN
    RAISE EXCEPTION 'Invalid moderation reason';
  END IF;
  IF p_status = 'published' AND p_reason_code <> 'reviewed_restore' THEN
    RAISE EXCEPTION 'Restore requires the reviewed_restore reason';
  END IF;
  IF p_status <> 'published' AND p_reason_code = 'reviewed_restore' THEN
    RAISE EXCEPTION 'reviewed_restore is valid only for restore';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 2000 THEN
    RAISE EXCEPTION 'Internal note is too long';
  END IF;

  v_action_type := CASE p_status
    WHEN 'published' THEN 'restore_content'
    WHEN 'hidden' THEN 'hide_content'
    ELSE 'delete_content'
  END;
  v_notification_type := CASE p_status
    WHEN 'hidden' THEN 'content_hidden'
    WHEN 'deleted' THEN 'content_deleted'
    ELSE NULL
  END;
  v_reason_zh := CASE p_reason_code
    WHEN 'privacy' THEN '可能涉及个人隐私'
    WHEN 'harassment' THEN '可能包含骚扰或攻击性内容'
    WHEN 'spam' THEN '重复、广告或无关内容'
    WHEN 'inappropriate' THEN '内容不适合社区展示'
    WHEN 'other' THEN '其他违反社区规范的情况'
    ELSE '管理员复核后恢复展示'
  END;
  v_reason_ja := CASE p_reason_code
    WHEN 'privacy' THEN '個人情報を含む可能性があります'
    WHEN 'harassment' THEN '嫌がらせや攻撃的な内容を含む可能性があります'
    WHEN 'spam' THEN '重複、広告、または無関係な内容です'
    WHEN 'inappropriate' THEN 'コミュニティでの表示に適さない内容です'
    WHEN 'other' THEN 'その他のコミュニティ規範に関する理由です'
    ELSE '管理者の確認後に表示を再開しました'
  END;

  IF p_target_type = 'post' THEN
    SELECT
      post.status,
      post.is_anonymous,
      to_jsonb(post) || jsonb_build_object(
        'images', COALESCE(
          (
            SELECT jsonb_agg(to_jsonb(image) ORDER BY image.sort_order)
            FROM public.community_post_images AS image
            WHERE image.post_id = post.id
          ),
          '[]'::jsonb
        )
      )
    INTO v_current_status, v_is_anonymous, v_snapshot
    FROM public.community_posts AS post
    WHERE post.id = p_target_id
    FOR UPDATE;

    IF v_current_status IS NULL THEN
      RAISE EXCEPTION 'Post not found';
    END IF;
    IF v_current_status = p_status THEN
      RAISE EXCEPTION 'Content already has requested status';
    END IF;
    IF v_current_status = 'deleted' THEN
      RAISE EXCEPTION 'Deleted posts cannot be changed';
    END IF;
    IF p_status = 'published' AND v_current_status <> 'hidden' THEN
      RAISE EXCEPTION 'Only hidden posts can be restored';
    END IF;

    v_target_member_id := private.community_post_author_member(p_target_id);
    UPDATE public.community_posts SET status = p_status WHERE id = p_target_id;

    INSERT INTO public.community_moderation_actions (
      action_type, target_type, target_post_id, target_member_id,
      admin_user_id, reason_code, internal_note,
      content_snapshot, payload_expires_at
    ) VALUES (
      v_action_type, 'post', p_target_id,
      CASE WHEN v_is_anonymous THEN NULL ELSE v_target_member_id END,
      v_admin_id, p_reason_code, v_note,
      v_snapshot, now() + interval '30 days'
    );
  ELSE
    SELECT comment.status, comment.is_anonymous_author, to_jsonb(comment)
    INTO v_current_status, v_is_anonymous, v_snapshot
    FROM public.community_comments AS comment
    WHERE comment.id = p_target_id
    FOR UPDATE;

    IF v_current_status IS NULL THEN
      RAISE EXCEPTION 'Comment not found';
    END IF;
    IF v_current_status = p_status THEN
      RAISE EXCEPTION 'Content already has requested status';
    END IF;
    IF v_current_status = 'deleted' THEN
      RAISE EXCEPTION 'Deleted comments cannot be changed';
    END IF;
    IF p_status = 'published' AND v_current_status <> 'hidden' THEN
      RAISE EXCEPTION 'Only hidden comments can be restored';
    END IF;

    v_target_member_id := private.community_comment_author_member(p_target_id);
    UPDATE public.community_comments
    SET
      status = p_status,
      removal_source = CASE WHEN p_status = 'deleted' THEN 'admin' ELSE NULL END
    WHERE id = p_target_id;

    INSERT INTO public.community_moderation_actions (
      action_type, target_type, target_comment_id, target_member_id,
      admin_user_id, reason_code, internal_note,
      content_snapshot, payload_expires_at
    ) VALUES (
      v_action_type, 'comment', p_target_id,
      CASE WHEN v_is_anonymous THEN NULL ELSE v_target_member_id END,
      v_admin_id, p_reason_code, v_note,
      v_snapshot, now() + interval '30 days'
    );
  END IF;

  IF v_notification_type IS NOT NULL THEN
    PERFORM private.community_insert_notification(
      v_target_member_id,
      NULL,
      v_notification_type,
      CASE WHEN p_target_type = 'post' THEN p_target_id ELSE NULL END,
      CASE WHEN p_target_type = 'comment' THEN p_target_id ELSE NULL END,
      NULL,
      NULL,
      CASE WHEN p_status = 'hidden' THEN '你的内容已被隐藏' ELSE '你的内容已被删除' END,
      CASE WHEN p_status = 'hidden' THEN '投稿が非表示になりました' ELSE '投稿が削除されました' END,
      '处理原因：' || v_reason_zh,
      '対応理由：' || v_reason_ja
    );
  END IF;
END;
$$;

-- The older report-linked moderation function must follow the same rule: a
-- hide/delete action may notify an anonymous author, but must not persist that
-- author's member id. Identity revelation remains gated by the dedicated
-- pending-report reveal RPC and its reasoned audit entry.
CREATE OR REPLACE FUNCTION public.community_set_content_status(
  p_target_type text,
  p_target_id uuid,
  p_status text,
  p_reason text,
  p_report_id uuid DEFAULT NULL,
  p_admin_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_target_member_id uuid;
  v_action_type text;
  v_notification_type text;
  v_snapshot jsonb;
  v_current_status text;
  v_is_anonymous boolean;
BEGIN
  v_admin_id := private.community_resolve_admin_id(p_admin_user_id);
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Administrator access is required';
  END IF;
  IF p_target_type NOT IN ('post', 'comment')
     OR p_status NOT IN ('published', 'hidden', 'deleted') THEN
    RAISE EXCEPTION 'Invalid moderation target or status';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'An internal reason is required';
  END IF;
  IF p_report_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.community_reports AS report
       WHERE report.id = p_report_id
         AND report.status = 'pending'
         AND report.target_type = p_target_type
         AND (
           (p_target_type = 'post' AND report.reported_post_id = p_target_id)
           OR (p_target_type = 'comment' AND report.reported_comment_id = p_target_id)
         )
     ) THEN
    RAISE EXCEPTION 'A matching pending report is required';
  END IF;

  v_action_type := CASE p_status
    WHEN 'published' THEN 'restore_content'
    WHEN 'hidden' THEN 'hide_content'
    ELSE 'delete_content'
  END;
  v_notification_type := CASE p_status
    WHEN 'hidden' THEN 'content_hidden'
    WHEN 'deleted' THEN 'content_deleted'
    ELSE NULL
  END;

  IF p_target_type = 'post' THEN
    SELECT post.status, post.is_anonymous, to_jsonb(post)
    INTO v_current_status, v_is_anonymous, v_snapshot
    FROM public.community_posts AS post
    WHERE post.id = p_target_id
    FOR UPDATE;

    IF v_current_status IS NULL THEN
      RAISE EXCEPTION 'Post not found';
    END IF;
    IF v_current_status = p_status THEN
      RAISE EXCEPTION 'Content already has requested status';
    END IF;
    IF v_current_status = 'deleted' THEN
      RAISE EXCEPTION 'Deleted posts cannot be changed';
    END IF;
    IF p_status = 'published' AND v_current_status <> 'hidden' THEN
      RAISE EXCEPTION 'Only hidden posts can be restored';
    END IF;

    v_target_member_id := private.community_post_author_member(p_target_id);
    UPDATE public.community_posts SET status = p_status WHERE id = p_target_id;

    INSERT INTO public.community_moderation_actions (
      report_id, action_type, target_type, target_post_id,
      target_member_id, admin_user_id, internal_note,
      content_snapshot, payload_expires_at
    ) VALUES (
      p_report_id, v_action_type, 'post', p_target_id,
      CASE WHEN v_is_anonymous THEN NULL ELSE v_target_member_id END,
      v_admin_id, btrim(p_reason), v_snapshot, now() + interval '30 days'
    );
  ELSE
    SELECT comment.status, comment.is_anonymous_author, to_jsonb(comment)
    INTO v_current_status, v_is_anonymous, v_snapshot
    FROM public.community_comments AS comment
    WHERE comment.id = p_target_id
    FOR UPDATE;

    IF v_current_status IS NULL THEN
      RAISE EXCEPTION 'Comment not found';
    END IF;
    IF v_current_status = p_status THEN
      RAISE EXCEPTION 'Content already has requested status';
    END IF;
    IF v_current_status = 'deleted' THEN
      RAISE EXCEPTION 'Deleted comments cannot be changed';
    END IF;
    IF p_status = 'published' AND v_current_status <> 'hidden' THEN
      RAISE EXCEPTION 'Only hidden comments can be restored';
    END IF;

    v_target_member_id := private.community_comment_author_member(p_target_id);
    UPDATE public.community_comments
    SET
      status = p_status,
      removal_source = CASE WHEN p_status = 'deleted' THEN 'admin' ELSE NULL END
    WHERE id = p_target_id;

    INSERT INTO public.community_moderation_actions (
      report_id, action_type, target_type, target_comment_id,
      target_member_id, admin_user_id, internal_note,
      content_snapshot, payload_expires_at
    ) VALUES (
      p_report_id, v_action_type, 'comment', p_target_id,
      CASE WHEN v_is_anonymous THEN NULL ELSE v_target_member_id END,
      v_admin_id, btrim(p_reason), v_snapshot, now() + interval '30 days'
    );
  END IF;

  IF v_notification_type IS NOT NULL THEN
    PERFORM private.community_insert_notification(
      v_target_member_id,
      NULL,
      v_notification_type,
      CASE WHEN p_target_type = 'post' THEN p_target_id ELSE NULL END,
      CASE WHEN p_target_type = 'comment' THEN p_target_id ELSE NULL END,
      p_report_id,
      NULL,
      CASE WHEN p_status = 'hidden' THEN '你的内容已被隐藏' ELSE '你的内容已被删除' END,
      CASE WHEN p_status = 'hidden' THEN '投稿が非表示になりました' ELSE '投稿が削除されました' END,
      '管理员已根据社区规范处理该内容。如有疑问，请联系工作人员。',
      'コミュニティ規約に基づき管理者が対応しました。ご不明な点はスタッフにお問い合わせください。'
    );
  END IF;
END;
$$;

-- Member detail may summarize only content that already exposes the member's
-- public community identity. Counting anonymous posts, anonymous-owner
-- comments, or reports against those targets would create a statistical
-- identity oracle outside the audited reveal workflow.
CREATE OR REPLACE FUNCTION public.community_admin_get_member(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT private.community_is_admin()
     AND COALESCE((SELECT auth.jwt()->>'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Administrator access is required';
  END IF;

  SELECT jsonb_build_object(
    'profile', to_jsonb(cp),
    'member', jsonb_build_object(
      'id', m.id,
      'member_number', m.member_number,
      'status', m.status,
      'created_at', m.created_at
    ),
    'nickname_history', COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(history) ORDER BY history.changed_at DESC)
        FROM public.community_nickname_history AS history
        WHERE history.profile_id = cp.id
      ),
      '[]'::jsonb
    ),
    'sanctions', COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(sanction) ORDER BY sanction.created_at DESC)
        FROM public.community_sanctions AS sanction
        WHERE sanction.member_id = m.id
      ),
      '[]'::jsonb
    ),
    'stats', jsonb_build_object(
      'treeholes', (
        SELECT count(*)
        FROM private.community_post_authors AS author
        JOIN public.community_posts AS post ON post.id = author.post_id
        WHERE author.member_id = m.id
          AND post.post_type = 'treehole'
          AND NOT post.is_anonymous
      ),
      'photo_posts', (
        SELECT count(*)
        FROM private.community_post_authors AS author
        JOIN public.community_posts AS post ON post.id = author.post_id
        WHERE author.member_id = m.id
          AND post.post_type = 'photo'
          AND NOT post.is_anonymous
      ),
      'comments', (
        SELECT count(*)
        FROM private.community_comment_authors AS author
        JOIN public.community_comments AS comment ON comment.id = author.comment_id
        WHERE author.member_id = m.id
          AND NOT comment.is_anonymous_author
      ),
      'pending_reports', (
        SELECT count(*)
        FROM public.community_reports AS report
        LEFT JOIN private.community_post_authors AS post_author
          ON post_author.post_id = report.reported_post_id
        LEFT JOIN public.community_posts AS reported_post
          ON reported_post.id = report.reported_post_id
        LEFT JOIN private.community_comment_authors AS comment_author
          ON comment_author.comment_id = report.reported_comment_id
        LEFT JOIN public.community_comments AS reported_comment
          ON reported_comment.id = report.reported_comment_id
        WHERE report.status = 'pending'
          AND (
            (
              post_author.member_id = m.id
              AND NOT reported_post.is_anonymous
            )
            OR (
              comment_author.member_id = m.id
              AND NOT reported_comment.is_anonymous_author
            )
            OR report.reported_profile_id = cp.id
          )
      )
    )
  )
  INTO v_result
  FROM public.community_profiles AS cp
  JOIN private.community_profile_members AS profile_member
    ON profile_member.profile_id = cp.id
  LEFT JOIN public.members AS m ON m.id = profile_member.member_id
  WHERE cp.id = p_profile_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Community profile not found';
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.community_admin_moderate_content(
  text, uuid, text, text, text, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.community_admin_moderate_content(
  text, uuid, text, text, text, uuid
) TO service_role;
