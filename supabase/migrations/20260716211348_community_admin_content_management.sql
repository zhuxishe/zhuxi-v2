-- Proactive community content monitoring and moderation.
-- Anonymous author mappings remain private: the listing function deliberately
-- exposes only the public profile attached to non-anonymous content.

ALTER TABLE public.community_moderation_actions
  ADD COLUMN IF NOT EXISTS reason_code text;

ALTER TABLE public.community_moderation_actions
  DROP CONSTRAINT IF EXISTS community_moderation_actions_reason_code_check;

ALTER TABLE public.community_moderation_actions
  ADD CONSTRAINT community_moderation_actions_reason_code_check
  CHECK (
    reason_code IS NULL
    OR reason_code IN (
      'privacy', 'harassment', 'spam', 'inappropriate', 'other',
      'reviewed_restore'
    )
  );

CREATE INDEX IF NOT EXISTS community_posts_admin_content_idx
  ON public.community_posts (status, published_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS community_comments_admin_content_idx
  ON public.community_comments (status, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.community_admin_list_content(
  p_content_type text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_is_anonymous boolean DEFAULT NULL,
  p_report_state text DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_before_at timestamptz DEFAULT NULL,
  p_before_rank integer DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_admin_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  target_type text,
  content_type text,
  post_id uuid,
  parent_comment_id uuid,
  status text,
  is_anonymous boolean,
  author_profile_id uuid,
  author_nickname text,
  title text,
  body text,
  parent_post_type text,
  parent_post_title text,
  image_count bigint,
  like_count integer,
  comment_count integer,
  pending_report_count bigint,
  total_report_count bigint,
  occurred_at timestamptz,
  edited_at timestamptz,
  source_rank integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_query text := NULLIF(btrim(p_query), '');
BEGIN
  v_admin_id := private.community_resolve_admin_id(p_admin_user_id);
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Administrator access is required';
  END IF;
  IF p_content_type IS NOT NULL
     AND p_content_type NOT IN ('treehole', 'photo', 'comment', 'reply') THEN
    RAISE EXCEPTION 'Invalid content type';
  END IF;
  IF p_status IS NOT NULL
     AND p_status NOT IN ('published', 'hidden', 'deleted') THEN
    RAISE EXCEPTION 'Invalid content status';
  END IF;
  IF p_report_state IS NOT NULL
     AND p_report_state NOT IN ('pending', 'any', 'none') THEN
    RAISE EXCEPTION 'Invalid report state';
  END IF;
  IF (p_before_at IS NULL) <> (p_before_rank IS NULL)
     OR (p_before_at IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'Incomplete content cursor';
  END IF;

  RETURN QUERY
  WITH unified AS (
    SELECT
      post.id,
      'post'::text AS target_type,
      post.post_type AS content_type,
      post.id AS post_id,
      NULL::uuid AS parent_comment_id,
      post.status,
      post.is_anonymous,
      CASE WHEN post.is_anonymous THEN NULL ELSE post.author_profile_id END AS author_profile_id,
      CASE WHEN post.is_anonymous THEN NULL ELSE profile.nickname END AS author_nickname,
      post.title,
      post.body,
      post.post_type AS parent_post_type,
      NULL::text AS parent_post_title,
      (
        SELECT count(*)
        FROM public.community_post_images AS image
        WHERE image.post_id = post.id
      ) AS image_count,
      post.like_count,
      post.comment_count,
      (
        SELECT count(*)
        FROM public.community_reports AS report
        WHERE report.reported_post_id = post.id
          AND report.status = 'pending'
      ) AS pending_report_count,
      (
        SELECT count(*)
        FROM public.community_reports AS report
        WHERE report.reported_post_id = post.id
      ) AS total_report_count,
      post.published_at AS occurred_at,
      post.edited_at,
      2 AS source_rank
    FROM public.community_posts AS post
    LEFT JOIN public.community_profiles AS profile
      ON profile.id = post.author_profile_id

    UNION ALL

    SELECT
      comment.id,
      'comment'::text AS target_type,
      CASE WHEN comment.parent_comment_id IS NULL THEN 'comment' ELSE 'reply' END AS content_type,
      comment.post_id,
      comment.parent_comment_id,
      comment.status,
      comment.is_anonymous_author AS is_anonymous,
      CASE WHEN comment.is_anonymous_author THEN NULL ELSE comment.author_profile_id END AS author_profile_id,
      CASE WHEN comment.is_anonymous_author THEN NULL ELSE profile.nickname END AS author_nickname,
      NULL::text AS title,
      comment.body,
      parent_post.post_type AS parent_post_type,
      parent_post.title AS parent_post_title,
      0::bigint AS image_count,
      NULL::integer AS like_count,
      NULL::integer AS comment_count,
      (
        SELECT count(*)
        FROM public.community_reports AS report
        WHERE report.reported_comment_id = comment.id
          AND report.status = 'pending'
      ) AS pending_report_count,
      (
        SELECT count(*)
        FROM public.community_reports AS report
        WHERE report.reported_comment_id = comment.id
      ) AS total_report_count,
      comment.created_at AS occurred_at,
      comment.edited_at,
      1 AS source_rank
    FROM public.community_comments AS comment
    JOIN public.community_posts AS parent_post ON parent_post.id = comment.post_id
    LEFT JOIN public.community_profiles AS profile
      ON profile.id = comment.author_profile_id
  )
  SELECT
    content.id,
    content.target_type,
    content.content_type,
    content.post_id,
    content.parent_comment_id,
    content.status,
    content.is_anonymous,
    content.author_profile_id,
    content.author_nickname,
    content.title,
    content.body,
    content.parent_post_type,
    content.parent_post_title,
    content.image_count,
    content.like_count,
    content.comment_count,
    content.pending_report_count,
    content.total_report_count,
    content.occurred_at,
    content.edited_at,
    content.source_rank
  FROM unified AS content
  WHERE (p_content_type IS NULL OR content.content_type = p_content_type)
    AND (p_status IS NULL OR content.status = p_status)
    AND (p_is_anonymous IS NULL OR content.is_anonymous = p_is_anonymous)
    AND (
      p_report_state IS NULL
      OR (p_report_state = 'pending' AND content.pending_report_count > 0)
      OR (p_report_state = 'any' AND content.total_report_count > 0)
      OR (p_report_state = 'none' AND content.total_report_count = 0)
    )
    AND (
      v_query IS NULL
      OR content.title ILIKE '%' || v_query || '%'
      OR content.body ILIKE '%' || v_query || '%'
      OR content.parent_post_title ILIKE '%' || v_query || '%'
      OR content.author_nickname ILIKE '%' || v_query || '%'
    )
    AND (p_from IS NULL OR content.occurred_at >= p_from)
    AND (p_to IS NULL OR content.occurred_at < p_to)
    AND (
      p_before_at IS NULL
      OR (content.occurred_at, content.source_rank, content.id)
         < (p_before_at, p_before_rank, p_before_id)
    )
  ORDER BY content.occurred_at DESC, content.source_rank DESC, content.id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100) + 1;
END;
$$;

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

REVOKE ALL ON FUNCTION public.community_admin_list_content(
  text, text, boolean, text, text, timestamptz, timestamptz,
  timestamptz, integer, uuid, integer, uuid
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.community_admin_moderate_content(
  text, uuid, text, text, text, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.community_admin_list_content(
  text, text, boolean, text, text, timestamptz, timestamptz,
  timestamptz, integer, uuid, integer, uuid
) TO service_role;

GRANT EXECUTE ON FUNCTION public.community_admin_moderate_content(
  text, uuid, text, text, text, uuid
) TO service_role;
