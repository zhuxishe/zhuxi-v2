-- Player App Community V1
--
-- Security model:
--   * Community data is available only to approved members.
--   * Public community profiles never expose the underlying member id.
--   * Anonymous post/comment ownership is stored only in the private schema.
--   * User writes go through narrowly scoped RPCs; tables remain read-mostly.
--   * Community media is stored in private buckets and protected by RLS.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- Community identity
-- ---------------------------------------------------------------------------

CREATE TABLE public.community_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname text NOT NULL,
  nickname_normalized text GENERATED ALWAYS AS (lower(btrim(nickname))) STORED,
  avatar_kind text NOT NULL DEFAULT 'default'
    CHECK (avatar_kind IN ('default', 'preset', 'upload')),
  avatar_path text,
  preset_avatar text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_profiles_nickname_length
    CHECK (char_length(btrim(nickname)) BETWEEN 2 AND 20),
  CONSTRAINT community_profiles_reserved_nickname
    CHECK (
      nickname_normalized NOT IN (
        'admin', 'administrator', 'staff',
        '官方', '管理员', '竹溪社官方',
        '管理者', '運営', '公式'
      )
    ),
  CONSTRAINT community_profiles_avatar_shape
    CHECK (
      (avatar_kind = 'default' AND avatar_path IS NULL AND preset_avatar IS NULL)
      OR (
        avatar_kind = 'preset'
        AND avatar_path IS NULL
        AND preset_avatar IN ('bamboo', 'stream', 'leaf')
      )
      OR (avatar_kind = 'upload' AND avatar_path IS NOT NULL AND preset_avatar IS NULL)
    )
);

CREATE UNIQUE INDEX community_profiles_nickname_normalized_uidx
  ON public.community_profiles (nickname_normalized);

CREATE TABLE private.community_profile_members (
  profile_id uuid PRIMARY KEY
    REFERENCES public.community_profiles(id) ON DELETE CASCADE,
  member_id uuid UNIQUE
    REFERENCES public.members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX community_profile_members_member_idx
  ON private.community_profile_members (member_id)
  WHERE member_id IS NOT NULL;

CREATE TABLE public.community_nickname_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id uuid NOT NULL
    REFERENCES public.community_profiles(id) ON DELETE CASCADE,
  old_nickname text NOT NULL,
  new_nickname text NOT NULL,
  changed_by_member_id uuid
    REFERENCES public.members(id) ON DELETE SET NULL,
  changed_by_admin_id uuid
    REFERENCES public.admin_users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX community_nickname_history_profile_changed_idx
  ON public.community_nickname_history (profile_id, changed_at DESC);

CREATE INDEX community_nickname_history_member_idx
  ON public.community_nickname_history (changed_by_member_id)
  WHERE changed_by_member_id IS NOT NULL;

CREATE INDEX community_nickname_history_admin_idx
  ON public.community_nickname_history (changed_by_admin_id)
  WHERE changed_by_admin_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Posts, images, comments and interactions
-- ---------------------------------------------------------------------------

CREATE TABLE public.community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_type text NOT NULL
    CHECK (post_type IN ('treehole', 'photo')),
  author_profile_id uuid
    REFERENCES public.community_profiles(id) ON DELETE RESTRICT,
  title text,
  body text,
  is_anonymous boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'hidden', 'deleted')),
  like_count integer NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  comment_count integer NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  published_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  hidden_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_posts_identity_shape
    CHECK (
      (post_type = 'treehole' AND is_anonymous AND author_profile_id IS NULL)
      OR (post_type = 'treehole' AND NOT is_anonymous AND author_profile_id IS NOT NULL)
      OR (post_type = 'photo' AND NOT is_anonymous AND author_profile_id IS NOT NULL)
    ),
  CONSTRAINT community_posts_content_shape
    CHECK (
      status <> 'published'
      OR (
        post_type = 'treehole'
        AND body IS NOT NULL
        AND char_length(btrim(body)) BETWEEN 1 AND 2000
        AND (title IS NULL OR char_length(btrim(title)) BETWEEN 1 AND 60)
      )
      OR (
        post_type = 'photo'
        AND title IS NULL
        AND (body IS NULL OR char_length(body) <= 500)
      )
    ),
  CONSTRAINT community_posts_status_timestamps
    CHECK (
      (status <> 'hidden' OR hidden_at IS NOT NULL)
      AND (status <> 'deleted' OR deleted_at IS NOT NULL)
    )
);

CREATE TABLE private.community_post_authors (
  post_id uuid PRIMARY KEY
    REFERENCES public.community_posts(id) ON DELETE CASCADE,
  member_id uuid
    REFERENCES public.members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX community_post_authors_member_idx
  ON private.community_post_authors (member_id)
  WHERE member_id IS NOT NULL;

CREATE INDEX community_posts_author_profile_idx
  ON public.community_posts (author_profile_id)
  WHERE author_profile_id IS NOT NULL;

CREATE TABLE public.community_post_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL
    REFERENCES public.community_posts(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  thumbnail_path text NOT NULL UNIQUE,
  sort_order smallint NOT NULL CHECK (sort_order BETWEEN 0 AND 8),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  byte_size bigint CHECK (byte_size IS NULL OR byte_size > 0),
  mime_type text NOT NULL
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_post_images_post_order_unique
    UNIQUE (post_id, sort_order)
);

CREATE INDEX community_post_images_post_idx
  ON public.community_post_images (post_id, sort_order);

CREATE TABLE public.community_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL
    REFERENCES public.community_posts(id) ON DELETE CASCADE,
  parent_comment_id uuid
    REFERENCES public.community_comments(id) ON DELETE RESTRICT,
  author_profile_id uuid
    REFERENCES public.community_profiles(id) ON DELETE RESTRICT,
  is_anonymous_author boolean NOT NULL DEFAULT false,
  body text,
  removal_source text
    CHECK (removal_source IN ('author', 'admin')),
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'hidden', 'deleted')),
  edited_at timestamptz,
  hidden_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_comments_identity_shape
    CHECK (
      (is_anonymous_author AND author_profile_id IS NULL)
      OR (NOT is_anonymous_author AND author_profile_id IS NOT NULL)
    ),
  CONSTRAINT community_comments_body_shape
    CHECK (
      (status = 'published' AND body IS NOT NULL AND char_length(btrim(body)) BETWEEN 1 AND 500)
      OR (status IN ('hidden', 'deleted'))
    ),
  CONSTRAINT community_comments_status_timestamps
    CHECK (
      (status <> 'hidden' OR hidden_at IS NOT NULL)
      AND (status <> 'deleted' OR deleted_at IS NOT NULL)
    ),
  CONSTRAINT community_comments_removal_source_shape
    CHECK (
      removal_source IS NULL
      OR status = 'deleted'
    )
);

CREATE TABLE private.community_comment_authors (
  comment_id uuid PRIMARY KEY
    REFERENCES public.community_comments(id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  member_id uuid
    REFERENCES public.members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX community_comment_authors_member_idx
  ON private.community_comment_authors (member_id)
  WHERE member_id IS NOT NULL;

CREATE INDEX community_comments_post_created_idx
  ON public.community_comments (post_id, created_at, id)
  WHERE status IN ('published', 'deleted');

CREATE INDEX community_comments_parent_created_idx
  ON public.community_comments (parent_comment_id, created_at, id)
  WHERE parent_comment_id IS NOT NULL;

CREATE INDEX community_comments_post_fk_idx
  ON public.community_comments (post_id);

CREATE INDEX community_comments_author_profile_idx
  ON public.community_comments (author_profile_id)
  WHERE author_profile_id IS NOT NULL;

CREATE TABLE public.community_likes (
  post_id uuid NOT NULL
    REFERENCES public.community_posts(id) ON DELETE CASCADE,
  member_id uuid NOT NULL
    REFERENCES public.members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, member_id)
);

CREATE INDEX community_likes_member_created_idx
  ON public.community_likes (member_id, created_at DESC, post_id);

CREATE TABLE public.community_blocks (
  blocker_member_id uuid NOT NULL
    REFERENCES public.members(id) ON DELETE CASCADE,
  blocked_profile_id uuid NOT NULL
    REFERENCES public.community_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_member_id, blocked_profile_id)
);

CREATE INDEX community_blocks_blocked_profile_idx
  ON public.community_blocks (blocked_profile_id, blocker_member_id);

CREATE TABLE public.community_user_hides (
  member_id uuid NOT NULL
    REFERENCES public.members(id) ON DELETE CASCADE,
  post_id uuid NOT NULL
    REFERENCES public.community_posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, post_id)
);

CREATE INDEX community_user_hides_post_idx
  ON public.community_user_hides (post_id, member_id);

CREATE TABLE public.community_sanctions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL
    REFERENCES public.members(id) ON DELETE CASCADE,
  sanction_type text NOT NULL
    CHECK (sanction_type IN ('warning', 'mute', 'permanent_ban')),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 2000),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  issued_by uuid
    REFERENCES public.admin_users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoked_by uuid
    REFERENCES public.admin_users(id) ON DELETE SET NULL,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_sanctions_time_shape
    CHECK (
      (sanction_type = 'mute' AND ends_at IS NOT NULL AND ends_at > starts_at)
      OR (sanction_type IN ('warning', 'permanent_ban') AND ends_at IS NULL)
    )
);

CREATE INDEX community_sanctions_active_member_idx
  ON public.community_sanctions (member_id, sanction_type, ends_at)
  WHERE revoked_at IS NULL;

CREATE INDEX community_sanctions_member_fk_idx
  ON public.community_sanctions (member_id);

CREATE INDEX community_sanctions_issued_by_idx
  ON public.community_sanctions (issued_by)
  WHERE issued_by IS NOT NULL;

CREATE INDEX community_sanctions_revoked_by_idx
  ON public.community_sanctions (revoked_by)
  WHERE revoked_by IS NOT NULL;

-- Feed indexes use the exact status predicate used by member queries.
CREATE INDEX community_posts_type_published_idx
  ON public.community_posts (post_type, published_at DESC, id DESC)
  WHERE status = 'published';

CREATE INDEX community_posts_discussion_idx
  ON public.community_posts (post_type, comment_count DESC, published_at DESC, id DESC)
  WHERE status = 'published';

CREATE INDEX community_posts_author_published_idx
  ON public.community_posts (author_profile_id, published_at DESC, id DESC)
  WHERE status = 'published' AND author_profile_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Official content
-- ---------------------------------------------------------------------------

CREATE TABLE public.community_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_zh text,
  summary_zh text,
  body_zh text,
  title_ja text,
  summary_ja text,
  body_ja text,
  publisher_name text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'offline')),
  is_pinned boolean NOT NULL DEFAULT false,
  display_start_at timestamptz,
  display_end_at timestamptz,
  published_at timestamptz,
  link_url text,
  link_text_zh text,
  link_text_ja text,
  notify_on_publish boolean NOT NULL DEFAULT true,
  notified_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid
    REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_announcements_zh_complete
    CHECK (num_nonnulls(title_zh, summary_zh, body_zh) IN (0, 3)),
  CONSTRAINT community_announcements_ja_complete
    CHECK (num_nonnulls(title_ja, summary_ja, body_ja) IN (0, 3)),
  CONSTRAINT community_announcements_has_locale
    CHECK (
      num_nonnulls(title_zh, summary_zh, body_zh) = 3
      OR num_nonnulls(title_ja, summary_ja, body_ja) = 3
    ),
  CONSTRAINT community_announcements_display_window
    CHECK (
      display_start_at IS NULL
      OR display_end_at IS NULL
      OR display_end_at > display_start_at
    ),
  CONSTRAINT community_announcements_publish_time
    CHECK (status <> 'published' OR published_at IS NOT NULL)
);

CREATE INDEX community_announcements_active_idx
  ON public.community_announcements (is_pinned DESC, sort_order, published_at DESC, id DESC)
  WHERE status = 'published';

CREATE INDEX community_announcements_created_by_idx
  ON public.community_announcements (created_by)
  WHERE created_by IS NOT NULL;

CREATE TABLE public.community_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_zh text,
  answer_zh text,
  question_ja text,
  answer_ja text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'offline')),
  is_featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  published_at timestamptz,
  created_by uuid
    REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_faqs_zh_complete
    CHECK (num_nonnulls(question_zh, answer_zh) IN (0, 2)),
  CONSTRAINT community_faqs_ja_complete
    CHECK (num_nonnulls(question_ja, answer_ja) IN (0, 2)),
  CONSTRAINT community_faqs_has_locale
    CHECK (
      num_nonnulls(question_zh, answer_zh) = 2
      OR num_nonnulls(question_ja, answer_ja) = 2
    ),
  CONSTRAINT community_faqs_publish_time
    CHECK (status <> 'published' OR published_at IS NOT NULL)
);

CREATE INDEX community_faqs_published_order_idx
  ON public.community_faqs (sort_order, published_at DESC, id DESC)
  WHERE status = 'published';

CREATE INDEX community_faqs_featured_idx
  ON public.community_faqs (sort_order, id)
  WHERE status = 'published' AND is_featured;

CREATE INDEX community_faqs_created_by_idx
  ON public.community_faqs (created_by)
  WHERE created_by IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Reports, moderation, notifications and retention
-- ---------------------------------------------------------------------------

CREATE TABLE public.community_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_member_id uuid NOT NULL
    REFERENCES public.members(id) ON DELETE CASCADE,
  target_type text NOT NULL
    CHECK (target_type IN ('post', 'comment', 'profile')),
  reported_post_id uuid
    REFERENCES public.community_posts(id) ON DELETE SET NULL,
  reported_comment_id uuid
    REFERENCES public.community_comments(id) ON DELETE SET NULL,
  reported_profile_id uuid
    REFERENCES public.community_profiles(id) ON DELETE SET NULL,
  reason text NOT NULL
    CHECK (reason IN ('harassment', 'privacy', 'spam', 'inappropriate', 'other')),
  details text CHECK (details IS NULL OR char_length(details) <= 2000),
  target_snapshot jsonb
    CHECK (target_snapshot IS NULL OR jsonb_typeof(target_snapshot) = 'object'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved', 'dismissed')),
  resolved_at timestamptz,
  resolved_by uuid
    REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_reports_single_target
    CHECK (
      num_nonnulls(reported_post_id, reported_comment_id, reported_profile_id) = 1
      AND (target_type <> 'post' OR reported_post_id IS NOT NULL)
      AND (target_type <> 'comment' OR reported_comment_id IS NOT NULL)
      AND (target_type <> 'profile' OR reported_profile_id IS NOT NULL)
    ),
  CONSTRAINT community_reports_resolution_shape
    CHECK (
      (status = 'pending' AND resolved_at IS NULL)
      OR (status IN ('resolved', 'dismissed') AND resolved_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX community_reports_pending_post_uidx
  ON public.community_reports (reporter_member_id, reported_post_id)
  WHERE status = 'pending' AND reported_post_id IS NOT NULL;

CREATE UNIQUE INDEX community_reports_pending_comment_uidx
  ON public.community_reports (reporter_member_id, reported_comment_id)
  WHERE status = 'pending' AND reported_comment_id IS NOT NULL;

CREATE UNIQUE INDEX community_reports_pending_profile_uidx
  ON public.community_reports (reporter_member_id, reported_profile_id)
  WHERE status = 'pending' AND reported_profile_id IS NOT NULL;

CREATE INDEX community_reports_queue_idx
  ON public.community_reports (status, created_at, id);

CREATE INDEX community_reports_reporter_idx
  ON public.community_reports (reporter_member_id, created_at DESC, id DESC);

CREATE INDEX community_reports_post_idx
  ON public.community_reports (reported_post_id, created_at DESC)
  WHERE reported_post_id IS NOT NULL;

CREATE INDEX community_reports_comment_idx
  ON public.community_reports (reported_comment_id, created_at DESC)
  WHERE reported_comment_id IS NOT NULL;

CREATE INDEX community_reports_profile_idx
  ON public.community_reports (reported_profile_id, created_at DESC)
  WHERE reported_profile_id IS NOT NULL;

CREATE INDEX community_reports_resolved_by_idx
  ON public.community_reports (resolved_by)
  WHERE resolved_by IS NOT NULL;

CREATE OR REPLACE FUNCTION private.community_preserve_report_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.target_snapshot IS DISTINCT FROM NEW.target_snapshot THEN
    IF NEW.target_snapshot IS NOT NULL
       OR OLD.target_snapshot IS NULL
       OR OLD.created_at > now() - interval '30 days' THEN
      RAISE EXCEPTION 'Report target snapshots are immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_reports_preserve_snapshot
  BEFORE UPDATE OF target_snapshot ON public.community_reports
  FOR EACH ROW EXECUTE FUNCTION private.community_preserve_report_snapshot();

CREATE TABLE public.community_moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid
    REFERENCES public.community_reports(id) ON DELETE SET NULL,
  action_type text NOT NULL
    CHECK (
      action_type IN (
        'author_edit', 'author_delete',
        'dismiss_report', 'resolve_report',
        'hide_content', 'delete_content', 'restore_content',
        'warn_member', 'mute_member', 'permanent_ban', 'revoke_sanction',
        'reveal_anonymous_author', 'reset_profile'
      )
    ),
  target_type text NOT NULL
    CHECK (target_type IN ('post', 'comment', 'profile', 'member', 'report')),
  target_post_id uuid
    REFERENCES public.community_posts(id) ON DELETE SET NULL,
  target_comment_id uuid
    REFERENCES public.community_comments(id) ON DELETE SET NULL,
  target_profile_id uuid
    REFERENCES public.community_profiles(id) ON DELETE SET NULL,
  target_member_id uuid
    REFERENCES public.members(id) ON DELETE SET NULL,
  actor_member_id uuid
    REFERENCES public.members(id) ON DELETE SET NULL,
  admin_user_id uuid
    REFERENCES public.admin_users(id) ON DELETE SET NULL,
  internal_note text,
  content_snapshot jsonb,
  payload_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_moderation_actions_actor
    CHECK (actor_member_id IS NOT NULL OR admin_user_id IS NOT NULL)
);

CREATE INDEX community_moderation_actions_report_idx
  ON public.community_moderation_actions (report_id, created_at DESC)
  WHERE report_id IS NOT NULL;

CREATE INDEX community_moderation_actions_target_member_idx
  ON public.community_moderation_actions (target_member_id, created_at DESC)
  WHERE target_member_id IS NOT NULL;

CREATE INDEX community_moderation_actions_payload_expiry_idx
  ON public.community_moderation_actions (payload_expires_at)
  WHERE content_snapshot IS NOT NULL AND payload_expires_at IS NOT NULL;

CREATE INDEX community_moderation_actions_post_idx
  ON public.community_moderation_actions (target_post_id, created_at DESC)
  WHERE target_post_id IS NOT NULL;

CREATE INDEX community_moderation_actions_comment_idx
  ON public.community_moderation_actions (target_comment_id, created_at DESC)
  WHERE target_comment_id IS NOT NULL;

CREATE INDEX community_moderation_actions_profile_idx
  ON public.community_moderation_actions (target_profile_id, created_at DESC)
  WHERE target_profile_id IS NOT NULL;

CREATE INDEX community_moderation_actions_actor_member_idx
  ON public.community_moderation_actions (actor_member_id, created_at DESC)
  WHERE actor_member_id IS NOT NULL;

CREATE INDEX community_moderation_actions_admin_idx
  ON public.community_moderation_actions (admin_user_id, created_at DESC)
  WHERE admin_user_id IS NOT NULL;

CREATE TABLE public.community_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_member_id uuid NOT NULL
    REFERENCES public.members(id) ON DELETE CASCADE,
  actor_profile_id uuid
    REFERENCES public.community_profiles(id) ON DELETE SET NULL,
  notification_type text NOT NULL
    CHECK (
      notification_type IN (
        'like', 'comment', 'reply', 'announcement', 'report_resolved',
        'content_hidden', 'content_deleted',
        'warning', 'mute', 'permanent_ban'
      )
    ),
  post_id uuid
    REFERENCES public.community_posts(id) ON DELETE SET NULL,
  comment_id uuid
    REFERENCES public.community_comments(id) ON DELETE SET NULL,
  report_id uuid
    REFERENCES public.community_reports(id) ON DELETE SET NULL,
  announcement_id uuid
    REFERENCES public.community_announcements(id) ON DELETE SET NULL,
  title_zh text,
  title_ja text,
  body_zh text,
  body_ja text,
  group_count integer NOT NULL DEFAULT 1 CHECK (group_count >= 1),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

CREATE INDEX community_notifications_recipient_created_idx
  ON public.community_notifications (recipient_member_id, created_at DESC, id DESC);

CREATE INDEX community_notifications_unread_idx
  ON public.community_notifications (recipient_member_id, created_at DESC, id DESC)
  WHERE read_at IS NULL;

CREATE INDEX community_notifications_expiry_idx
  ON public.community_notifications (expires_at);

CREATE INDEX community_notifications_actor_profile_idx
  ON public.community_notifications (actor_profile_id)
  WHERE actor_profile_id IS NOT NULL;

CREATE INDEX community_notifications_post_idx
  ON public.community_notifications (post_id)
  WHERE post_id IS NOT NULL;

CREATE INDEX community_notifications_comment_idx
  ON public.community_notifications (comment_id)
  WHERE comment_id IS NOT NULL;

CREATE INDEX community_notifications_report_idx
  ON public.community_notifications (report_id)
  WHERE report_id IS NOT NULL;

CREATE INDEX community_notifications_announcement_idx
  ON public.community_notifications (announcement_id)
  WHERE announcement_id IS NOT NULL;

CREATE TABLE public.community_notification_preferences (
  member_id uuid PRIMARY KEY
    REFERENCES public.members(id) ON DELETE CASCADE,
  likes_enabled boolean NOT NULL DEFAULT true,
  comments_enabled boolean NOT NULL DEFAULT true,
  replies_enabled boolean NOT NULL DEFAULT true,
  announcements_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Storage deletion must go through the Storage API. This queue records objects
-- that became unreferenced so an application/cron worker can remove them.
CREATE TABLE private.community_media_cleanup_queue (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket_id text NOT NULL
    CHECK (bucket_id IN ('community-avatars', 'community-media')),
  object_path text NOT NULL,
  reason text NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claim_token uuid,
  processed_at timestamptz,
  last_error text,
  UNIQUE (bucket_id, object_path),
  CONSTRAINT community_media_cleanup_claim_shape
    CHECK (
      (claimed_at IS NULL) = (claim_token IS NULL)
      AND (processed_at IS NULL OR claimed_at IS NULL)
    )
);

CREATE INDEX community_media_cleanup_pending_idx
  ON private.community_media_cleanup_queue (claimed_at, queued_at, id)
  WHERE processed_at IS NULL;

-- Only the trusted image-processing route can register these proofs. Member
-- publishing RPCs require a matching proof so direct Storage uploads cannot
-- bypass HEIC conversion, compression or EXIF removal.
CREATE TABLE private.community_processed_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL
    REFERENCES public.members(id) ON DELETE CASCADE,
  bucket_id text NOT NULL
    CHECK (bucket_id IN ('community-avatars', 'community-media')),
  storage_path text NOT NULL,
  thumbnail_path text NOT NULL,
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  mime_type text NOT NULL
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  registered_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  cleanup_claimed_at timestamptz,
  cleanup_claim_token uuid,
  UNIQUE (bucket_id, storage_path),
  UNIQUE (bucket_id, thumbnail_path),
  CONSTRAINT community_processed_uploads_avatar_shape
    CHECK (bucket_id <> 'community-avatars' OR storage_path = thumbnail_path),
  CONSTRAINT community_processed_uploads_claim_shape
    CHECK ((cleanup_claimed_at IS NULL) = (cleanup_claim_token IS NULL))
);

CREATE INDEX community_processed_uploads_member_idx
  ON private.community_processed_uploads (member_id, registered_at DESC);

CREATE INDEX community_processed_uploads_last_used_idx
  ON private.community_processed_uploads (last_used_at);

-- ---------------------------------------------------------------------------
-- Private authorization helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.community_approved_member_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.id
  FROM public.members AS m
  WHERE m.user_id = (SELECT auth.uid())
    AND m.status = 'approved'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.community_current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pm.profile_id
  FROM private.community_profile_members AS pm
  WHERE pm.member_id = private.community_approved_member_id()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.community_current_admin_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT au.id
  FROM public.admin_users AS au
  WHERE au.user_id = (SELECT auth.uid())
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.community_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.community_current_admin_id() IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION private.community_is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users AS au
    WHERE au.user_id = (SELECT auth.uid())
      AND au.role = 'super_admin'
  )
$$;

CREATE OR REPLACE FUNCTION private.community_resolve_admin_id(
  p_requested_admin_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_admin_id uuid;
BEGIN
  v_current_admin_id := private.community_current_admin_id();
  IF v_current_admin_id IS NOT NULL THEN
    RETURN v_current_admin_id;
  END IF;

  IF COALESCE((SELECT auth.jwt()->>'role'), '') = 'service_role'
     AND p_requested_admin_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.admin_users AS au
       WHERE au.id = p_requested_admin_id
     ) THEN
    RETURN p_requested_admin_id;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.community_can_read()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.members AS m
    WHERE m.id = private.community_approved_member_id()
      AND NOT EXISTS (
        SELECT 1
        FROM public.community_sanctions AS s
        WHERE s.member_id = m.id
          AND s.sanction_type = 'permanent_ban'
          AND s.revoked_at IS NULL
          AND s.starts_at <= now()
      )
  )
$$;

CREATE OR REPLACE FUNCTION private.community_can_interact()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.members AS m
    WHERE m.id = private.community_approved_member_id()
      AND NOT EXISTS (
        SELECT 1
        FROM public.community_sanctions AS s
        WHERE s.member_id = m.id
          AND s.revoked_at IS NULL
          AND s.starts_at <= now()
          AND (
            s.sanction_type = 'permanent_ban'
            OR (s.sanction_type = 'mute' AND s.ends_at > now())
          )
      )
  )
$$;

CREATE OR REPLACE FUNCTION private.community_is_post_author(p_post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM private.community_post_authors AS pa
    WHERE pa.post_id = p_post_id
      AND pa.member_id = private.community_approved_member_id()
  )
$$;

CREATE OR REPLACE FUNCTION private.community_is_comment_author(p_comment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM private.community_comment_authors AS ca
    WHERE ca.comment_id = p_comment_id
      AND ca.member_id = private.community_approved_member_id()
  )
$$;

CREATE OR REPLACE FUNCTION private.community_member_for_profile(p_profile_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pm.member_id
  FROM private.community_profile_members AS pm
  WHERE pm.profile_id = p_profile_id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.community_post_author_member(p_post_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pa.member_id
  FROM private.community_post_authors AS pa
  WHERE pa.post_id = p_post_id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.community_comment_author_member(p_comment_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ca.member_id
  FROM private.community_comment_authors AS ca
  WHERE ca.comment_id = p_comment_id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.community_profile_is_hidden_by_current(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.community_blocks AS b
    WHERE b.blocker_member_id = private.community_approved_member_id()
      AND b.blocked_profile_id = p_profile_id
  )
$$;

CREATE OR REPLACE FUNCTION private.community_interaction_is_blocked(p_other_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.community_blocks AS b
      WHERE b.blocker_member_id = private.community_approved_member_id()
        AND b.blocked_profile_id = p_other_profile_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.community_blocks AS b
      WHERE b.blocker_member_id = private.community_member_for_profile(p_other_profile_id)
        AND b.blocked_profile_id = private.community_current_profile_id()
    )
$$;

CREATE OR REPLACE FUNCTION private.community_notification_interaction_blocked(
  p_recipient_member_id uuid,
  p_actor_member_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_recipient_member_id IS NOT NULL
    AND p_actor_member_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.community_blocks AS b
        JOIN private.community_profile_members AS actor_profile
          ON actor_profile.profile_id = b.blocked_profile_id
        WHERE b.blocker_member_id = p_recipient_member_id
          AND actor_profile.member_id = p_actor_member_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.community_blocks AS b
        JOIN private.community_profile_members AS recipient_profile
          ON recipient_profile.profile_id = b.blocked_profile_id
        WHERE b.blocker_member_id = p_actor_member_id
          AND recipient_profile.member_id = p_recipient_member_id
      )
    )
$$;

CREATE OR REPLACE FUNCTION private.community_post_visible_to_current(p_post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    private.community_is_admin()
    OR (
      private.community_can_read()
      AND EXISTS (
        SELECT 1
        FROM public.community_posts AS p
        WHERE p.id = p_post_id
          AND p.status = 'published'
          AND NOT EXISTS (
            SELECT 1
            FROM public.community_user_hides AS h
            WHERE h.member_id = private.community_approved_member_id()
              AND h.post_id = p.id
          )
          AND (
            p.author_profile_id IS NULL
            OR NOT private.community_profile_is_hidden_by_current(p.author_profile_id)
          )
      )
    )
$$;

CREATE OR REPLACE FUNCTION private.community_comment_visible_to_current(p_comment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.community_comments AS c
    WHERE c.id = p_comment_id
      AND c.status IN ('published', 'deleted')
      AND private.community_post_visible_to_current(c.post_id)
      AND (
        c.author_profile_id IS NULL
        OR NOT private.community_profile_is_hidden_by_current(c.author_profile_id)
      )
      AND (
        c.parent_comment_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.community_comments AS parent
          WHERE parent.id = c.parent_comment_id
            AND parent.status IN ('published', 'deleted')
            AND (
              parent.author_profile_id IS NULL
              OR NOT private.community_profile_is_hidden_by_current(parent.author_profile_id)
            )
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION private.community_notification_enabled(
  p_member_id uuid,
  p_notification_type text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE p_notification_type
    WHEN 'like' THEN COALESCE(pref.likes_enabled, true)
    WHEN 'comment' THEN COALESCE(pref.comments_enabled, true)
    WHEN 'reply' THEN COALESCE(pref.replies_enabled, true)
    WHEN 'announcement' THEN COALESCE(pref.announcements_enabled, true)
    ELSE true
  END
  FROM (SELECT 1) AS seed
  LEFT JOIN public.community_notification_preferences AS pref
    ON pref.member_id = p_member_id
$$;

CREATE OR REPLACE FUNCTION private.community_storage_object_referenced(
  p_bucket_id text,
  p_object_path text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE p_bucket_id
    WHEN 'community-avatars' THEN EXISTS (
      SELECT 1
      FROM public.community_profiles AS cp
      WHERE cp.avatar_kind = 'upload'
        AND cp.avatar_path = p_object_path
    )
    WHEN 'community-media' THEN EXISTS (
      SELECT 1
      FROM public.community_post_images AS pi
      WHERE pi.storage_path = p_object_path
         OR pi.thumbnail_path = p_object_path
    )
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION private.community_storage_object_protected(
  p_bucket_id text,
  p_object_path text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    private.community_storage_object_referenced(p_bucket_id, p_object_path)
    OR EXISTS (
      SELECT 1
      FROM public.community_reports AS report
      WHERE report.target_snapshot IS NOT NULL
        AND report.created_at > now() - interval '30 days'
        AND (
          (
            p_bucket_id = 'community-avatars'
            AND report.target_snapshot #>> '{profile,avatar_path}' = p_object_path
          )
          OR (
            p_bucket_id = 'community-media'
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements(
                COALESCE(report.target_snapshot->'images', '[]'::jsonb)
              ) AS evidence_image(value)
              WHERE evidence_image.value->>'storage_path' = p_object_path
                 OR evidence_image.value->>'thumbnail_path' = p_object_path
            )
          )
        )
    )
$$;

CREATE OR REPLACE FUNCTION private.community_storage_object_has_processing_proof(
  p_bucket_id text,
  p_object_path text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM private.community_processed_uploads AS upload
    WHERE upload.bucket_id = p_bucket_id
      AND (
        upload.storage_path = p_object_path
        OR upload.thumbnail_path = p_object_path
      )
  )
$$;

CREATE OR REPLACE FUNCTION private.community_can_read_storage_object(
  p_bucket_id text,
  p_object_path text,
  p_owner_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    private.community_is_admin()
    OR (
      private.community_can_read()
      AND (
        p_owner_id = (SELECT auth.uid())::text
        OR (
          p_bucket_id = 'community-avatars'
          AND EXISTS (
            SELECT 1
            FROM public.community_profiles AS cp
            WHERE cp.avatar_kind = 'upload'
              AND cp.avatar_path = p_object_path
              AND NOT private.community_profile_is_hidden_by_current(cp.id)
          )
        )
        OR (
          p_bucket_id = 'community-media'
          AND EXISTS (
            SELECT 1
            FROM public.community_post_images AS pi
            WHERE (pi.storage_path = p_object_path OR pi.thumbnail_path = p_object_path)
              AND private.community_post_visible_to_current(pi.post_id)
          )
        )
      )
    )
$$;

-- ---------------------------------------------------------------------------
-- Validation, audit and aggregate triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.community_log_nickname_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.nickname IS DISTINCT FROM NEW.nickname THEN
    INSERT INTO public.community_nickname_history (
      profile_id,
      old_nickname,
      new_nickname,
      changed_by_member_id,
      changed_by_admin_id
    )
    VALUES (
      NEW.id,
      OLD.nickname,
      NEW.nickname,
      private.community_approved_member_id(),
      private.community_current_admin_id()
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_profiles_nickname_history
  AFTER UPDATE OF nickname ON public.community_profiles
  FOR EACH ROW EXECUTE FUNCTION private.community_log_nickname_change();

CREATE OR REPLACE FUNCTION private.community_queue_replaced_avatar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.avatar_kind = 'upload'
     AND OLD.avatar_path IS NOT NULL
     AND OLD.avatar_path IS DISTINCT FROM NEW.avatar_path THEN
    INSERT INTO private.community_media_cleanup_queue (bucket_id, object_path, reason)
    VALUES ('community-avatars', OLD.avatar_path, 'avatar_replaced')
    ON CONFLICT (bucket_id, object_path) DO UPDATE
      SET processed_at = NULL, last_error = NULL, queued_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_profiles_queue_avatar_cleanup
  AFTER UPDATE OF avatar_kind, avatar_path ON public.community_profiles
  FOR EACH ROW EXECUTE FUNCTION private.community_queue_replaced_avatar();

CREATE OR REPLACE FUNCTION private.community_cancel_avatar_cleanup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.avatar_kind = 'upload' AND NEW.avatar_path IS NOT NULL THEN
    DELETE FROM private.community_media_cleanup_queue
    WHERE bucket_id = 'community-avatars'
      AND object_path = NEW.avatar_path;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_profiles_cancel_avatar_cleanup_insert
  AFTER INSERT ON public.community_profiles
  FOR EACH ROW EXECUTE FUNCTION private.community_cancel_avatar_cleanup();

CREATE TRIGGER community_profiles_cancel_avatar_cleanup_update
  AFTER UPDATE OF avatar_kind, avatar_path ON public.community_profiles
  FOR EACH ROW EXECUTE FUNCTION private.community_cancel_avatar_cleanup();

CREATE OR REPLACE FUNCTION private.community_normalize_post_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'published' THEN
    NEW.hidden_at := NULL;
    NEW.deleted_at := NULL;
  ELSIF NEW.status = 'hidden' THEN
    NEW.hidden_at := COALESCE(NEW.hidden_at, now());
    NEW.deleted_at := NULL;
  ELSIF NEW.status = 'deleted' THEN
    NEW.deleted_at := COALESCE(NEW.deleted_at, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_posts_normalize_status
  BEFORE INSERT OR UPDATE OF status ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION private.community_normalize_post_status();

CREATE OR REPLACE FUNCTION private.community_validate_post_image()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post_type text;
  v_count integer;
BEGIN
  SELECT p.post_type
  INTO v_post_type
  FROM public.community_posts AS p
  WHERE p.id = NEW.post_id
  FOR UPDATE;

  IF v_post_type IS DISTINCT FROM 'photo' THEN
    RAISE EXCEPTION 'Images are allowed only on photo posts';
  END IF;

  SELECT count(*)
  INTO v_count
  FROM public.community_post_images AS pi
  WHERE pi.post_id = NEW.post_id
    AND (TG_OP = 'INSERT' OR pi.id <> NEW.id);

  IF v_count >= 9 THEN
    RAISE EXCEPTION 'A photo post can contain at most 9 images';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER community_post_images_validate
  BEFORE INSERT OR UPDATE OF post_id ON public.community_post_images
  FOR EACH ROW EXECUTE FUNCTION private.community_validate_post_image();

CREATE OR REPLACE FUNCTION private.community_queue_removed_image()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO private.community_media_cleanup_queue (bucket_id, object_path, reason)
  VALUES ('community-media', OLD.storage_path, 'post_image_removed')
  ON CONFLICT (bucket_id, object_path) DO UPDATE
    SET processed_at = NULL, last_error = NULL, queued_at = now();

  IF OLD.thumbnail_path <> OLD.storage_path THEN
    INSERT INTO private.community_media_cleanup_queue (bucket_id, object_path, reason)
    VALUES ('community-media', OLD.thumbnail_path, 'post_thumbnail_removed')
    ON CONFLICT (bucket_id, object_path) DO UPDATE
      SET processed_at = NULL, last_error = NULL, queued_at = now();
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER community_post_images_queue_cleanup
  AFTER DELETE ON public.community_post_images
  FOR EACH ROW EXECUTE FUNCTION private.community_queue_removed_image();

CREATE OR REPLACE FUNCTION private.community_cancel_referenced_image_cleanup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM private.community_media_cleanup_queue
  WHERE bucket_id = 'community-media'
    AND object_path IN (NEW.storage_path, NEW.thumbnail_path);
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_post_images_cancel_cleanup
  AFTER INSERT ON public.community_post_images
  FOR EACH ROW EXECUTE FUNCTION private.community_cancel_referenced_image_cleanup();

CREATE OR REPLACE FUNCTION private.community_normalize_comment_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'published' THEN
    NEW.hidden_at := NULL;
    NEW.deleted_at := NULL;
  ELSIF NEW.status = 'hidden' THEN
    NEW.hidden_at := COALESCE(NEW.hidden_at, now());
    NEW.deleted_at := NULL;
  ELSIF NEW.status = 'deleted' THEN
    NEW.deleted_at := COALESCE(NEW.deleted_at, now());
    NEW.body := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_comments_normalize_status
  BEFORE INSERT OR UPDATE OF status ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION private.community_normalize_comment_status();

CREATE OR REPLACE FUNCTION private.community_validate_comment_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_parent_post_id uuid;
  v_grandparent_id uuid;
BEGIN
  IF NEW.parent_comment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.post_id, c.parent_comment_id
  INTO v_parent_post_id, v_grandparent_id
  FROM public.community_comments AS c
  WHERE c.id = NEW.parent_comment_id
  FOR SHARE;

  IF v_parent_post_id IS NULL THEN
    RAISE EXCEPTION 'Parent comment does not exist';
  END IF;
  IF v_parent_post_id <> NEW.post_id THEN
    RAISE EXCEPTION 'Reply and parent comment must belong to the same post';
  END IF;
  IF v_grandparent_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only one reply level is supported';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER community_comments_validate_reply
  BEFORE INSERT OR UPDATE OF post_id, parent_comment_id ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION private.community_validate_comment_reply();

CREATE OR REPLACE FUNCTION private.community_refresh_post_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_post_id := OLD.post_id;
  ELSE
    v_post_id := NEW.post_id;
  END IF;

  UPDATE public.community_posts AS p
  SET
    like_count = (
      SELECT count(*)::integer
      FROM public.community_likes AS l
      WHERE l.post_id = v_post_id
    ),
    comment_count = (
      SELECT count(*)::integer
      FROM public.community_comments AS c
      WHERE c.post_id = v_post_id
        AND c.status IN ('published', 'deleted')
    ),
    updated_at = now()
  WHERE p.id = v_post_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_likes_refresh_count
  AFTER INSERT OR DELETE ON public.community_likes
  FOR EACH ROW EXECUTE FUNCTION private.community_refresh_post_counts();

CREATE TRIGGER community_comments_refresh_count
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION private.community_refresh_post_counts();

CREATE OR REPLACE FUNCTION private.community_prepare_announcement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_announcements_prepare_publish
  BEFORE INSERT OR UPDATE OF status ON public.community_announcements
  FOR EACH ROW EXECUTE FUNCTION private.community_prepare_announcement();

CREATE OR REPLACE FUNCTION private.community_enforce_pinned_announcement_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pinned_count integer;
BEGIN
  IF NEW.status = 'published' AND NEW.is_pinned THEN
    PERFORM pg_advisory_xact_lock(hashtext('community_pinned_announcement_limit'));

    SELECT count(*)
    INTO v_pinned_count
    FROM public.community_announcements AS a
    WHERE a.status = 'published'
      AND a.is_pinned
      AND a.id <> NEW.id;

    IF v_pinned_count >= 3 THEN
      RAISE EXCEPTION 'At most 3 published announcements can be pinned';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_announcements_pinned_limit
  BEFORE INSERT OR UPDATE OF status, is_pinned ON public.community_announcements
  FOR EACH ROW EXECUTE FUNCTION private.community_enforce_pinned_announcement_limit();

CREATE OR REPLACE FUNCTION private.community_prepare_faq()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_faqs_prepare_publish
  BEFORE INSERT OR UPDATE OF status ON public.community_faqs
  FOR EACH ROW EXECUTE FUNCTION private.community_prepare_faq();

CREATE OR REPLACE FUNCTION private.community_enforce_featured_faq_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_featured_count integer;
BEGIN
  IF NEW.status = 'published' AND NEW.is_featured THEN
    PERFORM pg_advisory_xact_lock(hashtext('community_featured_faq_limit'));

    SELECT count(*)
    INTO v_featured_count
    FROM public.community_faqs AS f
    WHERE f.status = 'published'
      AND f.is_featured
      AND f.id <> NEW.id;

    IF v_featured_count >= 2 THEN
      RAISE EXCEPTION 'At most 2 published FAQs can be featured';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_faqs_featured_limit
  BEFORE INSERT OR UPDATE OF status, is_featured ON public.community_faqs
  FOR EACH ROW EXECUTE FUNCTION private.community_enforce_featured_faq_limit();

-- Reuse the project's locked-down timestamp helper.
CREATE TRIGGER community_profiles_updated_at
  BEFORE UPDATE ON public.community_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER community_posts_updated_at
  BEFORE UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER community_comments_updated_at
  BEFORE UPDATE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER community_announcements_updated_at
  BEFORE UPDATE ON public.community_announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER community_faqs_updated_at
  BEFORE UPDATE ON public.community_faqs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER community_reports_updated_at
  BEFORE UPDATE ON public.community_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER community_notification_preferences_updated_at
  BEFORE UPDATE ON public.community_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------------------------------------------------------------------------
-- Notification triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.community_insert_notification(
  p_recipient_member_id uuid,
  p_actor_profile_id uuid,
  p_notification_type text,
  p_post_id uuid DEFAULT NULL,
  p_comment_id uuid DEFAULT NULL,
  p_report_id uuid DEFAULT NULL,
  p_announcement_id uuid DEFAULT NULL,
  p_title_zh text DEFAULT NULL,
  p_title_ja text DEFAULT NULL,
  p_body_zh text DEFAULT NULL,
  p_body_ja text DEFAULT NULL,
  p_actor_member_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_notification_id uuid;
BEGIN
  IF p_recipient_member_id IS NULL
     OR NOT private.community_notification_enabled(
       p_recipient_member_id,
       p_notification_type
     )
     OR private.community_notification_interaction_blocked(
       p_recipient_member_id,
       p_actor_member_id
     ) THEN
    RETURN NULL;
  END IF;

  IF p_notification_type IN ('like', 'comment', 'reply', 'announcement')
     AND EXISTS (
    SELECT 1
    FROM public.community_sanctions AS s
    WHERE s.member_id = p_recipient_member_id
      AND s.sanction_type = 'permanent_ban'
      AND s.revoked_at IS NULL
      AND s.starts_at <= now()
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.community_notifications (
    recipient_member_id,
    actor_profile_id,
    notification_type,
    post_id,
    comment_id,
    report_id,
    announcement_id,
    title_zh,
    title_ja,
    body_zh,
    body_ja
  )
  VALUES (
    p_recipient_member_id,
    p_actor_profile_id,
    p_notification_type,
    p_post_id,
    p_comment_id,
    p_report_id,
    p_announcement_id,
    p_title_zh,
    p_title_ja,
    p_body_zh,
    p_body_ja
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.community_notify_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_recipient_member_id uuid;
  v_actor_profile_id uuid;
  v_existing_id uuid;
BEGIN
  v_recipient_member_id := private.community_post_author_member(NEW.post_id);

  IF v_recipient_member_id IS NULL OR v_recipient_member_id = NEW.member_id THEN
    RETURN NEW;
  END IF;

  IF NOT private.community_notification_enabled(v_recipient_member_id, 'like') THEN
    RETURN NEW;
  END IF;
  IF private.community_notification_interaction_blocked(
    v_recipient_member_id,
    NEW.member_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT pm.profile_id
  INTO v_actor_profile_id
  FROM private.community_profile_members AS pm
  WHERE pm.member_id = NEW.member_id;

  SELECT n.id
  INTO v_existing_id
  FROM public.community_notifications AS n
  WHERE n.recipient_member_id = v_recipient_member_id
    AND n.notification_type = 'like'
    AND n.post_id = NEW.post_id
    AND n.created_at >= now() - interval '30 minutes'
  ORDER BY n.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.community_notifications
    SET
      actor_profile_id = v_actor_profile_id,
      group_count = group_count + 1,
      read_at = NULL,
      created_at = now(),
      expires_at = now() + interval '90 days'
    WHERE id = v_existing_id;
  ELSE
    PERFORM private.community_insert_notification(
      v_recipient_member_id,
      v_actor_profile_id,
      'like',
      NEW.post_id,
      NULL,
      NULL,
      NULL,
      '有人赞了你的内容',
      'あなたの投稿にいいねがつきました',
      NULL,
      NULL,
      NEW.member_id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER community_likes_notify
  AFTER INSERT ON public.community_likes
  FOR EACH ROW EXECUTE FUNCTION private.community_notify_like();

CREATE OR REPLACE FUNCTION private.community_notify_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_member_id uuid;
  v_actor_profile_id uuid;
  v_recipient_member_id uuid;
  v_notification_type text;
BEGIN
  IF NEW.status <> 'published' THEN
    RETURN NEW;
  END IF;

  v_actor_member_id := private.community_comment_author_member(NEW.id);

  SELECT pm.profile_id
  INTO v_actor_profile_id
  FROM private.community_profile_members AS pm
  WHERE pm.member_id = v_actor_member_id;

  IF NEW.is_anonymous_author THEN
    v_actor_profile_id := NULL;
  END IF;

  IF NEW.parent_comment_id IS NULL THEN
    v_recipient_member_id := private.community_post_author_member(NEW.post_id);
    v_notification_type := 'comment';
  ELSE
    v_recipient_member_id := private.community_comment_author_member(NEW.parent_comment_id);
    v_notification_type := 'reply';
  END IF;

  IF v_recipient_member_id IS NULL OR v_recipient_member_id = v_actor_member_id THEN
    RETURN NEW;
  END IF;

  PERFORM private.community_insert_notification(
    v_recipient_member_id,
    v_actor_profile_id,
    v_notification_type,
    NEW.post_id,
    NEW.id,
    NULL,
    NULL,
    CASE WHEN v_notification_type = 'reply'
      THEN '有人回复了你的评论'
      ELSE '有人评论了你的内容'
    END,
    CASE WHEN v_notification_type = 'reply'
      THEN 'コメントに返信がありました'
      ELSE '投稿にコメントがありました'
    END,
    NULL,
    NULL,
    v_actor_member_id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER community_comments_notify
  AFTER INSERT ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION private.community_notify_comment();

CREATE OR REPLACE FUNCTION private.community_send_announcement_notifications(
  p_announcement_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  INSERT INTO public.community_notifications (
    recipient_member_id,
    notification_type,
    announcement_id,
    title_zh,
    title_ja,
    body_zh,
    body_ja
  )
  SELECT
    m.id,
    'announcement',
    a.id,
    '新公告',
    '新しいお知らせ',
    a.title_zh,
    a.title_ja
  FROM public.community_announcements AS a
  CROSS JOIN public.members AS m
  LEFT JOIN public.community_notification_preferences AS pref
    ON pref.member_id = m.id
  WHERE a.id = p_announcement_id
    AND a.status = 'published'
    AND a.notify_on_publish
    AND (a.display_start_at IS NULL OR a.display_start_at <= now())
    AND (a.display_end_at IS NULL OR a.display_end_at > now())
    AND m.status = 'approved'
    AND COALESCE(pref.announcements_enabled, true)
    AND NOT EXISTS (
      SELECT 1
      FROM public.community_sanctions AS s
      WHERE s.member_id = m.id
        AND s.sanction_type = 'permanent_ban'
        AND s.revoked_at IS NULL
        AND s.starts_at <= now()
    );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  UPDATE public.community_announcements
  SET notified_at = now()
  WHERE id = p_announcement_id
    AND notified_at IS NULL;

  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION private.community_announcement_notify_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'published'
     AND NEW.notify_on_publish
     AND NEW.notified_at IS NULL
     AND (NEW.display_start_at IS NULL OR NEW.display_start_at <= now())
     AND (NEW.display_end_at IS NULL OR NEW.display_end_at > now()) THEN
    PERFORM private.community_send_announcement_notifications(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_announcements_notify
  AFTER INSERT OR UPDATE OF status, notify_on_publish, display_start_at, display_end_at, notified_at
  ON public.community_announcements
  FOR EACH ROW EXECUTE FUNCTION private.community_announcement_notify_trigger();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.community_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_nickname_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_post_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_user_hides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_sanctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_moderation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_notification_preferences ENABLE ROW LEVEL SECURITY;

ALTER TABLE private.community_profile_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.community_post_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.community_comment_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.community_media_cleanup_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.community_processed_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY community_profiles_member_read
  ON public.community_profiles
  FOR SELECT TO authenticated
  USING (
    (SELECT private.community_is_admin())
    OR (
      (SELECT private.community_can_read())
      AND NOT private.community_profile_is_hidden_by_current(id)
    )
  );

CREATE POLICY community_nickname_history_admin_read
  ON public.community_nickname_history
  FOR SELECT TO authenticated
  USING ((SELECT private.community_is_admin()));

CREATE POLICY community_posts_member_read
  ON public.community_posts
  FOR SELECT TO authenticated
  USING (private.community_post_visible_to_current(id));

CREATE POLICY community_post_images_member_read
  ON public.community_post_images
  FOR SELECT TO authenticated
  USING (private.community_post_visible_to_current(post_id));

CREATE POLICY community_comments_member_read
  ON public.community_comments
  FOR SELECT TO authenticated
  USING (private.community_comment_visible_to_current(id));

CREATE POLICY community_likes_self_or_admin_read
  ON public.community_likes
  FOR SELECT TO authenticated
  USING (
    (SELECT private.community_is_admin())
    OR member_id = (SELECT private.community_approved_member_id())
  );

CREATE POLICY community_blocks_self_or_admin_read
  ON public.community_blocks
  FOR SELECT TO authenticated
  USING (
    (SELECT private.community_is_admin())
    OR blocker_member_id = (SELECT private.community_approved_member_id())
  );

CREATE POLICY community_user_hides_self_or_admin_read
  ON public.community_user_hides
  FOR SELECT TO authenticated
  USING (
    (SELECT private.community_is_admin())
    OR member_id = (SELECT private.community_approved_member_id())
  );

CREATE POLICY community_sanctions_self_or_admin_read
  ON public.community_sanctions
  FOR SELECT TO authenticated
  USING (
    (SELECT private.community_is_admin())
    OR member_id = (SELECT private.community_approved_member_id())
  );

CREATE POLICY community_announcements_read
  ON public.community_announcements
  FOR SELECT TO authenticated
  USING (
    (SELECT private.community_is_admin())
    OR (
      (SELECT private.community_can_read())
      AND status = 'published'
      AND (display_start_at IS NULL OR display_start_at <= now())
      AND (display_end_at IS NULL OR display_end_at > now())
    )
  );

CREATE POLICY community_announcements_admin_insert
  ON public.community_announcements
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.community_is_admin()));
CREATE POLICY community_announcements_admin_update
  ON public.community_announcements
  FOR UPDATE TO authenticated
  USING ((SELECT private.community_is_admin()))
  WITH CHECK ((SELECT private.community_is_admin()));
CREATE POLICY community_announcements_admin_delete
  ON public.community_announcements
  FOR DELETE TO authenticated
  USING ((SELECT private.community_is_admin()));

CREATE POLICY community_faqs_read
  ON public.community_faqs
  FOR SELECT TO authenticated
  USING (
    (SELECT private.community_is_admin())
    OR ((SELECT private.community_can_read()) AND status = 'published')
  );

CREATE POLICY community_faqs_admin_insert
  ON public.community_faqs
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.community_is_admin()));
CREATE POLICY community_faqs_admin_update
  ON public.community_faqs
  FOR UPDATE TO authenticated
  USING ((SELECT private.community_is_admin()))
  WITH CHECK ((SELECT private.community_is_admin()));
CREATE POLICY community_faqs_admin_delete
  ON public.community_faqs
  FOR DELETE TO authenticated
  USING ((SELECT private.community_is_admin()));

CREATE POLICY community_reports_self_or_admin_read
  ON public.community_reports
  FOR SELECT TO authenticated
  USING (
    (SELECT private.community_is_admin())
    OR reporter_member_id = (SELECT private.community_approved_member_id())
  );

CREATE POLICY community_moderation_actions_admin_read
  ON public.community_moderation_actions
  FOR SELECT TO authenticated
  USING ((SELECT private.community_is_admin()));

CREATE POLICY community_notifications_self_or_admin_read
  ON public.community_notifications
  FOR SELECT TO authenticated
  USING (
    (SELECT private.community_is_admin())
    OR recipient_member_id = (SELECT private.community_approved_member_id())
  );

CREATE POLICY community_notification_preferences_self_or_admin_read
  ON public.community_notification_preferences
  FOR SELECT TO authenticated
  USING (
    (SELECT private.community_is_admin())
    OR member_id = (SELECT private.community_approved_member_id())
  );
CREATE POLICY community_notification_preferences_self_insert
  ON public.community_notification_preferences
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.community_can_read())
    AND member_id = (SELECT private.community_approved_member_id())
  );
CREATE POLICY community_notification_preferences_self_update
  ON public.community_notification_preferences
  FOR UPDATE TO authenticated
  USING (
    (SELECT private.community_can_read())
    AND member_id = (SELECT private.community_approved_member_id())
  )
  WITH CHECK (
    (SELECT private.community_can_read())
    AND member_id = (SELECT private.community_approved_member_id())
  );

-- Explicit Data API grants (required by Supabase's 2026 secure defaults).
REVOKE ALL ON TABLE
  public.community_profiles,
  public.community_nickname_history,
  public.community_posts,
  public.community_post_images,
  public.community_comments,
  public.community_likes,
  public.community_blocks,
  public.community_user_hides,
  public.community_sanctions,
  public.community_announcements,
  public.community_faqs,
  public.community_reports,
  public.community_moderation_actions,
  public.community_notifications,
  public.community_notification_preferences
FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.community_profiles,
  public.community_nickname_history,
  public.community_posts,
  public.community_post_images,
  public.community_comments,
  public.community_likes,
  public.community_blocks,
  public.community_user_hides,
  public.community_sanctions,
  public.community_announcements,
  public.community_faqs,
  public.community_moderation_actions,
  public.community_notifications,
  public.community_notification_preferences
TO authenticated;

-- Members can read the status of reports they submitted, but the immutable
-- evidence snapshot is restricted to the service-role administrator flow.
GRANT SELECT (
  id,
  reporter_member_id,
  target_type,
  reported_post_id,
  reported_comment_id,
  reported_profile_id,
  reason,
  details,
  status,
  resolved_at,
  resolved_by,
  created_at,
  updated_at
) ON TABLE public.community_reports
TO authenticated;

GRANT INSERT, UPDATE, DELETE ON TABLE
  public.community_announcements,
  public.community_faqs
TO authenticated;

GRANT INSERT, UPDATE ON TABLE public.community_notification_preferences
TO authenticated;

GRANT ALL ON TABLE
  public.community_profiles,
  public.community_nickname_history,
  public.community_posts,
  public.community_post_images,
  public.community_comments,
  public.community_likes,
  public.community_blocks,
  public.community_user_hides,
  public.community_sanctions,
  public.community_announcements,
  public.community_faqs,
  public.community_reports,
  public.community_moderation_actions,
  public.community_notifications,
  public.community_notification_preferences
TO service_role;

GRANT USAGE, SELECT ON SEQUENCE public.community_nickname_history_id_seq
TO service_role;

REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA private TO service_role;

-- Policies reference private helpers by stored OID. The schema stays outside
-- the Data API exposed schemas, while authenticated execution is explicit.
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.community_approved_member_id()
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.community_is_admin()
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.community_can_read()
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.community_can_interact()
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.community_profile_is_hidden_by_current(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.community_post_visible_to_current(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.community_comment_visible_to_current(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.community_storage_object_referenced(text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.community_storage_object_has_processing_proof(text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.community_can_read_storage_object(text, text, text)
  TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO service_role;

-- ---------------------------------------------------------------------------
-- Private Storage buckets and object policies
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES
  (
    'community-avatars',
    'community-avatars',
    false,
    5242880,
    ARRAY[
      'image/jpeg', 'image/png', 'image/webp'
    ]
  ),
  (
    'community-media',
    'community-media',
    false,
    15728640,
    ARRAY[
      'image/jpeg', 'image/png', 'image/webp'
    ]
  )
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS community_storage_read ON storage.objects;
CREATE POLICY community_storage_read
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('community-avatars', 'community-media')
    AND private.community_can_read_storage_object(bucket_id, name, owner_id)
  );

DROP POLICY IF EXISTS community_storage_insert ON storage.objects;
CREATE POLICY community_storage_insert
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('community-avatars', 'community-media')
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND (
      (bucket_id = 'community-avatars' AND (SELECT private.community_can_read()))
      OR (bucket_id = 'community-media' AND (SELECT private.community_can_interact()))
    )
  );

DROP POLICY IF EXISTS community_storage_update ON storage.objects;
CREATE POLICY community_storage_update
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('community-avatars', 'community-media')
    AND owner_id = (SELECT auth.uid())::text
    AND NOT private.community_storage_object_referenced(bucket_id, name)
    AND NOT private.community_storage_object_has_processing_proof(bucket_id, name)
  )
  WITH CHECK (
    bucket_id IN ('community-avatars', 'community-media')
    AND owner_id = (SELECT auth.uid())::text
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND NOT private.community_storage_object_referenced(bucket_id, name)
    AND NOT private.community_storage_object_has_processing_proof(bucket_id, name)
    AND (
      (bucket_id = 'community-avatars' AND (SELECT private.community_can_read()))
      OR (bucket_id = 'community-media' AND (SELECT private.community_can_interact()))
    )
  );

DROP POLICY IF EXISTS community_storage_delete ON storage.objects;
CREATE POLICY community_storage_delete
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('community-avatars', 'community-media')
    AND (
      (SELECT private.community_is_admin())
      OR (
        owner_id = (SELECT auth.uid())::text
        AND NOT private.community_storage_object_referenced(bucket_id, name)
        AND NOT private.community_storage_object_has_processing_proof(bucket_id, name)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Member write RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.community_register_processed_upload(
  p_member_id uuid,
  p_bucket_id text,
  p_storage_path text,
  p_thumbnail_path text,
  p_width integer,
  p_height integer,
  p_byte_size bigint,
  p_mime_type text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_upload_id uuid;
BEGIN
  IF COALESCE((SELECT auth.jwt()->>'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role access is required';
  END IF;
  IF p_bucket_id NOT IN ('community-avatars', 'community-media')
     OR p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp')
     OR p_width <= 0
     OR p_height <= 0
     OR p_byte_size <= 0
     OR (p_bucket_id = 'community-avatars' AND p_byte_size > 5242880)
     OR (p_bucket_id = 'community-media' AND p_byte_size > 15728640) THEN
    RAISE EXCEPTION 'Invalid processed upload metadata';
  END IF;

  SELECT m.user_id
  INTO v_user_id
  FROM public.members AS m
  WHERE m.id = p_member_id
    AND m.status = 'approved';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Approved member not found';
  END IF;
  IF p_storage_path IS NULL
     OR p_thumbnail_path IS NULL
     OR split_part(p_storage_path, '/', 1) <> v_user_id::text
     OR split_part(p_thumbnail_path, '/', 1) <> v_user_id::text THEN
    RAISE EXCEPTION 'Processed upload paths do not belong to the member';
  END IF;
  IF p_bucket_id = 'community-avatars'
     AND p_storage_path <> p_thumbnail_path THEN
    RAISE EXCEPTION 'Avatar storage and thumbnail paths must match';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects AS o
    WHERE o.bucket_id = p_bucket_id
      AND o.name = p_storage_path
  ) OR NOT EXISTS (
    SELECT 1
    FROM storage.objects AS o
    WHERE o.bucket_id = p_bucket_id
      AND o.name = p_thumbnail_path
  ) THEN
    RAISE EXCEPTION 'Processed Storage objects do not exist';
  END IF;

  INSERT INTO private.community_processed_uploads AS existing (
    member_id,
    bucket_id,
    storage_path,
    thumbnail_path,
    width,
    height,
    byte_size,
    mime_type
  )
  VALUES (
    p_member_id,
    p_bucket_id,
    p_storage_path,
    p_thumbnail_path,
    p_width,
    p_height,
    p_byte_size,
    p_mime_type
  )
  ON CONFLICT (bucket_id, storage_path) DO UPDATE SET
    member_id = EXCLUDED.member_id,
    thumbnail_path = EXCLUDED.thumbnail_path,
    width = EXCLUDED.width,
    height = EXCLUDED.height,
    byte_size = EXCLUDED.byte_size,
    mime_type = EXCLUDED.mime_type,
    registered_at = now(),
    last_used_at = now()
  WHERE existing.cleanup_claimed_at IS NULL
  RETURNING id INTO v_upload_id;

  IF v_upload_id IS NULL THEN
    RAISE EXCEPTION 'Processed upload is already claimed for cleanup';
  END IF;

  RETURN v_upload_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.community_insert_post_images(
  p_post_id uuid,
  p_images jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_image jsonb;
  v_ordinality bigint;
  v_storage_path text;
  v_thumbnail_path text;
  v_member_id uuid;
  v_upload private.community_processed_uploads;
BEGIN
  IF p_images IS NULL
     OR jsonb_typeof(p_images) <> 'array'
     OR jsonb_array_length(p_images) NOT BETWEEN 1 AND 9 THEN
    RAISE EXCEPTION 'Photo posts require between 1 and 9 images';
  END IF;

  FOR v_image, v_ordinality IN
    SELECT value, ordinality
    FROM jsonb_array_elements(p_images) WITH ORDINALITY
  LOOP
    v_storage_path := NULLIF(v_image->>'storage_path', '');
    v_thumbnail_path := NULLIF(v_image->>'thumbnail_path', '');
    v_member_id := private.community_approved_member_id();

    IF v_storage_path IS NULL OR v_thumbnail_path IS NULL THEN
      RAISE EXCEPTION 'Each image requires storage_path and thumbnail_path';
    END IF;

    IF split_part(v_storage_path, '/', 1) <> (SELECT auth.uid())::text
       OR split_part(v_thumbnail_path, '/', 1) <> (SELECT auth.uid())::text THEN
      RAISE EXCEPTION 'Image paths must belong to the current user';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM storage.objects AS o
      WHERE o.bucket_id = 'community-media'
        AND o.name = v_storage_path
    ) OR NOT EXISTS (
      SELECT 1
      FROM storage.objects AS o
      WHERE o.bucket_id = 'community-media'
        AND o.name = v_thumbnail_path
    ) THEN
      RAISE EXCEPTION 'Image objects must be uploaded before publishing';
    END IF;

    SELECT * INTO v_upload
    FROM private.community_processed_uploads AS upload
    WHERE upload.member_id = v_member_id
      AND upload.bucket_id = 'community-media'
      AND upload.storage_path = v_storage_path
      AND upload.thumbnail_path = v_thumbnail_path
      AND upload.cleanup_claimed_at IS NULL
    FOR UPDATE;

    IF v_upload.id IS NULL THEN
      RAISE EXCEPTION 'Image processing proof is missing';
    END IF;

    INSERT INTO public.community_post_images (
      post_id,
      storage_path,
      thumbnail_path,
      sort_order,
      width,
      height,
      byte_size,
      mime_type
    )
    VALUES (
      p_post_id,
      v_storage_path,
      v_thumbnail_path,
      (v_ordinality - 1)::smallint,
      v_upload.width,
      v_upload.height,
      v_upload.byte_size,
      v_upload.mime_type
    );

    UPDATE private.community_processed_uploads
    SET last_used_at = now()
    WHERE id = v_upload.id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_upsert_profile(
  p_nickname text,
  p_avatar_kind text DEFAULT 'default',
  p_avatar_path text DEFAULT NULL,
  p_preset_avatar text DEFAULT NULL
)
RETURNS public.community_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id uuid;
  v_profile_id uuid;
  v_avatar_upload_id uuid;
  v_profile public.community_profiles;
BEGIN
  v_member_id := private.community_approved_member_id();
  IF v_member_id IS NULL OR NOT private.community_can_read() THEN
    RAISE EXCEPTION 'Approved community membership is required';
  END IF;

  IF p_nickname IS NULL
     OR char_length(btrim(p_nickname)) NOT BETWEEN 2 AND 20 THEN
    RAISE EXCEPTION 'Nickname must contain 2 to 20 characters';
  END IF;

  IF p_avatar_kind NOT IN ('default', 'preset', 'upload') THEN
    RAISE EXCEPTION 'Invalid avatar kind';
  END IF;
  IF p_avatar_kind = 'preset'
     AND p_preset_avatar NOT IN ('bamboo', 'stream', 'leaf') THEN
    RAISE EXCEPTION 'Invalid preset avatar';
  END IF;
  IF p_avatar_kind = 'upload' THEN
    IF p_avatar_path IS NULL
       OR split_part(p_avatar_path, '/', 1) <> (SELECT auth.uid())::text
       OR NOT EXISTS (
         SELECT 1
         FROM storage.objects AS o
         WHERE o.bucket_id = 'community-avatars'
           AND o.name = p_avatar_path
       ) THEN
      RAISE EXCEPTION 'Avatar must be uploaded to the current user path first';
    END IF;

    SELECT upload.id
    INTO v_avatar_upload_id
    FROM private.community_processed_uploads AS upload
    WHERE upload.member_id = v_member_id
      AND upload.bucket_id = 'community-avatars'
      AND upload.storage_path = p_avatar_path
      AND upload.thumbnail_path = p_avatar_path
      AND upload.cleanup_claimed_at IS NULL
    FOR UPDATE;

    IF v_avatar_upload_id IS NULL THEN
      RAISE EXCEPTION 'Avatar processing proof is missing';
    END IF;
  END IF;

  -- A missing mapping row cannot be row-locked. Serialize first-profile
  -- creation per member to avoid duplicate orphan profiles under concurrency.
  PERFORM pg_advisory_xact_lock(hashtext(v_member_id::text));

  SELECT pm.profile_id
  INTO v_profile_id
  FROM private.community_profile_members AS pm
  WHERE pm.member_id = v_member_id
  FOR UPDATE;

  IF v_profile_id IS NULL THEN
    INSERT INTO public.community_profiles (
      nickname,
      avatar_kind,
      avatar_path,
      preset_avatar
    )
    VALUES (
      btrim(p_nickname),
      p_avatar_kind,
      CASE WHEN p_avatar_kind = 'upload' THEN p_avatar_path ELSE NULL END,
      CASE WHEN p_avatar_kind = 'preset' THEN p_preset_avatar ELSE NULL END
    )
    RETURNING * INTO v_profile;

    INSERT INTO private.community_profile_members (profile_id, member_id)
    VALUES (v_profile.id, v_member_id);
  ELSE
    UPDATE public.community_profiles
    SET
      nickname = btrim(p_nickname),
      avatar_kind = p_avatar_kind,
      avatar_path = CASE WHEN p_avatar_kind = 'upload' THEN p_avatar_path ELSE NULL END,
      preset_avatar = CASE WHEN p_avatar_kind = 'preset' THEN p_preset_avatar ELSE NULL END
    WHERE id = v_profile_id
    RETURNING * INTO v_profile;
  END IF;

  IF v_avatar_upload_id IS NOT NULL THEN
    UPDATE private.community_processed_uploads
    SET last_used_at = now()
    WHERE id = v_avatar_upload_id;
  END IF;

  RETURN v_profile;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'This community nickname is already in use';
END;
$$;

CREATE OR REPLACE FUNCTION public.community_create_treehole(
  p_title text,
  p_body text,
  p_is_anonymous boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id uuid;
  v_profile_id uuid;
  v_post_id uuid;
BEGIN
  IF NOT private.community_can_interact() THEN
    RAISE EXCEPTION 'Community posting is currently unavailable';
  END IF;

  v_member_id := private.community_approved_member_id();
  v_profile_id := private.community_current_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Set a community nickname before posting';
  END IF;

  INSERT INTO public.community_posts (
    post_type,
    author_profile_id,
    title,
    body,
    is_anonymous,
    status
  )
  VALUES (
    'treehole',
    CASE WHEN p_is_anonymous THEN NULL ELSE v_profile_id END,
    NULLIF(btrim(p_title), ''),
    p_body,
    p_is_anonymous,
    'published'
  )
  RETURNING id INTO v_post_id;

  INSERT INTO private.community_post_authors (post_id, member_id)
  VALUES (v_post_id, v_member_id);

  RETURN v_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_create_photo_post(
  p_body text,
  p_images jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id uuid;
  v_profile_id uuid;
  v_post_id uuid;
BEGIN
  IF NOT private.community_can_interact() THEN
    RAISE EXCEPTION 'Community posting is currently unavailable';
  END IF;

  v_member_id := private.community_approved_member_id();
  v_profile_id := private.community_current_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Set a community nickname before posting';
  END IF;

  INSERT INTO public.community_posts (
    post_type,
    author_profile_id,
    title,
    body,
    is_anonymous,
    status
  )
  VALUES (
    'photo',
    v_profile_id,
    NULL,
    NULLIF(p_body, ''),
    false,
    'published'
  )
  RETURNING id INTO v_post_id;

  INSERT INTO private.community_post_authors (post_id, member_id)
  VALUES (v_post_id, v_member_id);

  PERFORM private.community_insert_post_images(v_post_id, p_images);
  RETURN v_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_update_post(
  p_post_id uuid,
  p_title text,
  p_body text,
  p_images jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id uuid;
  v_post public.community_posts;
  v_snapshot jsonb;
BEGIN
  IF NOT private.community_can_read()
     OR NOT private.community_is_post_author(p_post_id) THEN
    RAISE EXCEPTION 'Not allowed to edit this post';
  END IF;

  v_member_id := private.community_approved_member_id();
  SELECT * INTO v_post
  FROM public.community_posts
  WHERE id = p_post_id
  FOR UPDATE;

  IF v_post.id IS NULL OR v_post.status <> 'published' THEN
    RAISE EXCEPTION 'Only published posts can be edited';
  END IF;

  SELECT to_jsonb(v_post) || jsonb_build_object(
    'images', COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(pi) ORDER BY pi.sort_order)
        FROM public.community_post_images AS pi
        WHERE pi.post_id = p_post_id
      ),
      '[]'::jsonb
    )
  ) INTO v_snapshot;

  INSERT INTO public.community_moderation_actions (
    action_type,
    target_type,
    target_post_id,
    actor_member_id,
    content_snapshot,
    payload_expires_at
  )
  VALUES (
    'author_edit', 'post', p_post_id, v_member_id,
    v_snapshot, now() + interval '30 days'
  );

  IF v_post.post_type = 'treehole' THEN
    IF p_images IS NOT NULL THEN
      RAISE EXCEPTION 'Treehole posts cannot contain images';
    END IF;
    UPDATE public.community_posts
    SET
      title = NULLIF(btrim(p_title), ''),
      body = p_body,
      edited_at = now()
    WHERE id = p_post_id;
  ELSE
    UPDATE public.community_posts
    SET
      body = NULLIF(p_body, ''),
      edited_at = now()
    WHERE id = p_post_id;

    IF p_images IS NOT NULL THEN
      DELETE FROM public.community_post_images
      WHERE post_id = p_post_id;
      PERFORM private.community_insert_post_images(p_post_id, p_images);
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_delete_post(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id uuid;
  v_post public.community_posts;
  v_snapshot jsonb;
BEGIN
  IF NOT private.community_can_read()
     OR NOT private.community_is_post_author(p_post_id) THEN
    RAISE EXCEPTION 'Not allowed to delete this post';
  END IF;

  v_member_id := private.community_approved_member_id();
  SELECT * INTO v_post
  FROM public.community_posts
  WHERE id = p_post_id
  FOR UPDATE;

  IF v_post.id IS NULL OR v_post.status = 'deleted' THEN
    RETURN;
  END IF;

  SELECT to_jsonb(v_post) || jsonb_build_object(
    'images', COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(pi) ORDER BY pi.sort_order)
        FROM public.community_post_images AS pi
        WHERE pi.post_id = p_post_id
      ),
      '[]'::jsonb
    )
  ) INTO v_snapshot;

  INSERT INTO public.community_moderation_actions (
    action_type,
    target_type,
    target_post_id,
    actor_member_id,
    content_snapshot,
    payload_expires_at
  )
  VALUES (
    'author_delete', 'post', p_post_id, v_member_id,
    v_snapshot, now() + interval '30 days'
  );

  UPDATE public.community_posts
  SET status = 'deleted', deleted_at = now()
  WHERE id = p_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_add_comment(
  p_post_id uuid,
  p_body text,
  p_parent_comment_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id uuid;
  v_profile_id uuid;
  v_post public.community_posts;
  v_parent public.community_comments;
  v_comment_id uuid := gen_random_uuid();
  v_is_anonymous_author boolean;
BEGIN
  IF NOT private.community_can_interact()
     OR NOT private.community_post_visible_to_current(p_post_id) THEN
    RAISE EXCEPTION 'Not allowed to comment on this post';
  END IF;

  v_member_id := private.community_approved_member_id();
  v_profile_id := private.community_current_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Set a community nickname before commenting';
  END IF;

  SELECT * INTO v_post
  FROM public.community_posts
  WHERE id = p_post_id
  FOR SHARE;

  IF v_post.status <> 'published' THEN
    RAISE EXCEPTION 'This post is not open for comments';
  END IF;
  -- Never resolve an anonymous post owner merely to decide whether this
  -- write succeeds: success/failure would become an author-identity oracle.
  -- Public posts still enforce the member block below via author_profile_id;
  -- notifications are independently suppressed for blocked relationships.
  IF v_post.author_profile_id IS NOT NULL
     AND private.community_interaction_is_blocked(v_post.author_profile_id) THEN
    RAISE EXCEPTION 'Interaction is unavailable between these members';
  END IF;

  IF p_parent_comment_id IS NOT NULL THEN
    SELECT * INTO v_parent
    FROM public.community_comments
    WHERE id = p_parent_comment_id
      AND post_id = p_post_id
      AND parent_comment_id IS NULL
      AND status = 'published'
    FOR SHARE;

    IF v_parent.id IS NULL THEN
      RAISE EXCEPTION 'Reply target is unavailable';
    END IF;
    -- The same privacy rule applies to an anonymous-owner comment. Public
    -- parent comments still enforce blocks through author_profile_id.
    IF v_parent.author_profile_id IS NOT NULL
       AND private.community_interaction_is_blocked(v_parent.author_profile_id) THEN
      RAISE EXCEPTION 'Interaction is unavailable between these members';
    END IF;
  END IF;

  v_is_anonymous_author := v_post.is_anonymous
    AND private.community_is_post_author(p_post_id);

  -- Insert the private owner mapping first. Its FK is deferred so the
  -- AFTER INSERT notification trigger can resolve the actor safely.
  INSERT INTO private.community_comment_authors (comment_id, member_id)
  VALUES (v_comment_id, v_member_id);

  INSERT INTO public.community_comments (
    id,
    post_id,
    parent_comment_id,
    author_profile_id,
    is_anonymous_author,
    body,
    status
  )
  VALUES (
    v_comment_id,
    p_post_id,
    p_parent_comment_id,
    CASE WHEN v_is_anonymous_author THEN NULL ELSE v_profile_id END,
    v_is_anonymous_author,
    p_body,
    'published'
  );

  RETURN v_comment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_update_comment(
  p_comment_id uuid,
  p_body text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id uuid;
  v_comment public.community_comments;
BEGIN
  IF NOT private.community_can_read()
     OR NOT private.community_is_comment_author(p_comment_id) THEN
    RAISE EXCEPTION 'Not allowed to edit this comment';
  END IF;

  v_member_id := private.community_approved_member_id();
  SELECT * INTO v_comment
  FROM public.community_comments
  WHERE id = p_comment_id
  FOR UPDATE;

  IF v_comment.id IS NULL OR v_comment.status <> 'published' THEN
    RAISE EXCEPTION 'Only published comments can be edited';
  END IF;

  INSERT INTO public.community_moderation_actions (
    action_type,
    target_type,
    target_comment_id,
    actor_member_id,
    content_snapshot,
    payload_expires_at
  )
  VALUES (
    'author_edit', 'comment', p_comment_id, v_member_id,
    to_jsonb(v_comment), now() + interval '30 days'
  );

  UPDATE public.community_comments
  SET body = p_body, edited_at = now()
  WHERE id = p_comment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_delete_comment(p_comment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id uuid;
  v_comment public.community_comments;
BEGIN
  IF NOT private.community_can_read()
     OR NOT private.community_is_comment_author(p_comment_id) THEN
    RAISE EXCEPTION 'Not allowed to delete this comment';
  END IF;

  v_member_id := private.community_approved_member_id();
  SELECT * INTO v_comment
  FROM public.community_comments
  WHERE id = p_comment_id
  FOR UPDATE;

  IF v_comment.id IS NULL OR v_comment.status = 'deleted' THEN
    RETURN;
  END IF;

  INSERT INTO public.community_moderation_actions (
    action_type,
    target_type,
    target_comment_id,
    actor_member_id,
    content_snapshot,
    payload_expires_at
  )
  VALUES (
    'author_delete', 'comment', p_comment_id, v_member_id,
    to_jsonb(v_comment), now() + interval '30 days'
  );

  UPDATE public.community_comments
  SET
    status = 'deleted',
    deleted_at = now(),
    removal_source = 'author'
  WHERE id = p_comment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_toggle_post_like(p_post_id uuid)
RETURNS TABLE (liked boolean, like_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id uuid;
  v_author_profile_id uuid;
BEGIN
  IF NOT private.community_can_interact()
     OR NOT private.community_post_visible_to_current(p_post_id) THEN
    RAISE EXCEPTION 'Not allowed to like this post';
  END IF;

  v_member_id := private.community_approved_member_id();

  SELECT p.author_profile_id
  INTO v_author_profile_id
  FROM public.community_posts AS p
  WHERE p.id = p_post_id
    AND p.status = 'published'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post is unavailable';
  END IF;
  IF v_author_profile_id IS NOT NULL
     AND private.community_interaction_is_blocked(v_author_profile_id) THEN
    RAISE EXCEPTION 'Interaction is unavailable between these members';
  END IF;

  DELETE FROM public.community_likes AS l
  WHERE l.post_id = p_post_id
    AND l.member_id = v_member_id;

  IF FOUND THEN
    liked := false;
  ELSE
    INSERT INTO public.community_likes (post_id, member_id)
    VALUES (p_post_id, v_member_id);
    liked := true;
  END IF;

  SELECT p.like_count INTO like_count
  FROM public.community_posts AS p
  WHERE p.id = p_post_id;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_report_content(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_details text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id uuid;
  v_report_id uuid;
  v_snapshot jsonb;
  v_post public.community_posts;
  v_comment public.community_comments;
  v_profile public.community_profiles;
BEGIN
  IF NOT private.community_can_read() THEN
    RAISE EXCEPTION 'Community access is required';
  END IF;
  IF p_target_type NOT IN ('post', 'comment', 'profile') THEN
    RAISE EXCEPTION 'Invalid report target';
  END IF;
  IF p_reason NOT IN ('harassment', 'privacy', 'spam', 'inappropriate', 'other') THEN
    RAISE EXCEPTION 'Invalid report reason';
  END IF;
  IF p_details IS NOT NULL AND char_length(p_details) > 2000 THEN
    RAISE EXCEPTION 'Report details are too long';
  END IF;

  v_member_id := private.community_approved_member_id();

  IF p_target_type = 'post' THEN
    SELECT * INTO v_post
    FROM public.community_posts AS p
    WHERE p.id = p_target_id
      AND private.community_post_visible_to_current(p.id)
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Post is unavailable';
    END IF;

    v_snapshot := jsonb_build_object(
      'schema_version', 1,
      'captured_at', now(),
      'target_type', 'post',
      'post', to_jsonb(v_post),
      'images', COALESCE(
        (
          SELECT jsonb_agg(to_jsonb(pi) ORDER BY pi.sort_order, pi.id)
          FROM public.community_post_images AS pi
          WHERE pi.post_id = v_post.id
        ),
        '[]'::jsonb
      )
    );

    INSERT INTO public.community_reports (
      reporter_member_id, target_type, reported_post_id, reason, details,
      target_snapshot
    ) VALUES (
      v_member_id, 'post', p_target_id, p_reason, NULLIF(btrim(p_details), ''),
      v_snapshot
    ) RETURNING id INTO v_report_id;
  ELSIF p_target_type = 'comment' THEN
    SELECT * INTO v_comment
    FROM public.community_comments AS c
    WHERE c.id = p_target_id
      AND private.community_comment_visible_to_current(c.id)
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Comment is unavailable';
    END IF;

    v_snapshot := jsonb_build_object(
      'schema_version', 1,
      'captured_at', now(),
      'target_type', 'comment',
      'comment', to_jsonb(v_comment)
    );

    INSERT INTO public.community_reports (
      reporter_member_id, target_type, reported_comment_id, reason, details,
      target_snapshot
    ) VALUES (
      v_member_id, 'comment', p_target_id, p_reason, NULLIF(btrim(p_details), ''),
      v_snapshot
    ) RETURNING id INTO v_report_id;
  ELSE
    SELECT * INTO v_profile
    FROM public.community_profiles AS cp
    WHERE cp.id = p_target_id
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profile is unavailable';
    END IF;

    v_snapshot := jsonb_build_object(
      'schema_version', 1,
      'captured_at', now(),
      'target_type', 'profile',
      'profile', to_jsonb(v_profile)
    );

    INSERT INTO public.community_reports (
      reporter_member_id, target_type, reported_profile_id, reason, details,
      target_snapshot
    ) VALUES (
      v_member_id, 'profile', p_target_id, p_reason, NULLIF(btrim(p_details), ''),
      v_snapshot
    ) RETURNING id INTO v_report_id;
  END IF;

  RETURN v_report_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'This content already has a pending report from you';
END;
$$;

CREATE OR REPLACE FUNCTION public.community_hide_post(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.community_can_read()
     OR NOT private.community_post_visible_to_current(p_post_id) THEN
    RAISE EXCEPTION 'Post is unavailable';
  END IF;
  IF private.community_is_post_author(p_post_id) THEN
    RAISE EXCEPTION 'Authors cannot hide their own post';
  END IF;

  INSERT INTO public.community_user_hides (member_id, post_id)
  VALUES (private.community_approved_member_id(), p_post_id)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_unhide_post(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.community_can_read() THEN
    RAISE EXCEPTION 'Community access is required';
  END IF;

  DELETE FROM public.community_user_hides
  WHERE member_id = private.community_approved_member_id()
    AND post_id = p_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_block_profile(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id uuid;
BEGIN
  IF NOT private.community_can_read() THEN
    RAISE EXCEPTION 'Community access is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.community_profiles WHERE id = p_profile_id
  ) THEN
    RAISE EXCEPTION 'Profile is unavailable';
  END IF;

  v_member_id := private.community_approved_member_id();
  IF private.community_member_for_profile(p_profile_id) = v_member_id THEN
    RAISE EXCEPTION 'A member cannot block their own profile';
  END IF;

  INSERT INTO public.community_blocks (blocker_member_id, blocked_profile_id)
  VALUES (v_member_id, p_profile_id)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_unblock_profile(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.community_can_read() THEN
    RAISE EXCEPTION 'Community access is required';
  END IF;

  DELETE FROM public.community_blocks
  WHERE blocker_member_id = private.community_approved_member_id()
    AND blocked_profile_id = p_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_mark_notification_read(
  p_notification_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF private.community_approved_member_id() IS NULL THEN
    RAISE EXCEPTION 'Approved membership is required';
  END IF;

  UPDATE public.community_notifications
  SET read_at = COALESCE(read_at, now())
  WHERE id = p_notification_id
    AND recipient_member_id = private.community_approved_member_id();
END;
$$;

CREATE OR REPLACE FUNCTION public.community_mark_all_notifications_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF private.community_approved_member_id() IS NULL THEN
    RAISE EXCEPTION 'Approved membership is required';
  END IF;

  UPDATE public.community_notifications
  SET read_at = now()
  WHERE recipient_member_id = private.community_approved_member_id()
    AND read_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_update_notification_preferences(
  p_likes_enabled boolean,
  p_comments_enabled boolean,
  p_replies_enabled boolean,
  p_announcements_enabled boolean
)
RETURNS public.community_notification_preferences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id uuid;
  v_preferences public.community_notification_preferences;
BEGIN
  IF NOT private.community_can_read() THEN
    RAISE EXCEPTION 'Community access is required';
  END IF;

  v_member_id := private.community_approved_member_id();
  INSERT INTO public.community_notification_preferences (
    member_id,
    likes_enabled,
    comments_enabled,
    replies_enabled,
    announcements_enabled
  )
  VALUES (
    v_member_id,
    p_likes_enabled,
    p_comments_enabled,
    p_replies_enabled,
    p_announcements_enabled
  )
  ON CONFLICT (member_id) DO UPDATE SET
    likes_enabled = EXCLUDED.likes_enabled,
    comments_enabled = EXCLUDED.comments_enabled,
    replies_enabled = EXCLUDED.replies_enabled,
    announcements_enabled = EXCLUDED.announcements_enabled
  RETURNING * INTO v_preferences;

  RETURN v_preferences;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_dispatch_scheduled_announcements()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_announcement record;
  v_notification_count integer := 0;
BEGIN
  IF NOT private.community_is_admin()
     AND COALESCE((SELECT auth.jwt()->>'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Administrator access is required';
  END IF;

  FOR v_announcement IN
    SELECT a.id
    FROM public.community_announcements AS a
    WHERE a.status = 'published'
      AND a.notify_on_publish
      AND a.notified_at IS NULL
      AND (a.display_start_at IS NULL OR a.display_start_at <= now())
      AND (a.display_end_at IS NULL OR a.display_end_at > now())
    ORDER BY a.published_at, a.id
    FOR UPDATE SKIP LOCKED
  LOOP
    v_notification_count := v_notification_count
      + private.community_send_announcement_notifications(v_announcement.id);
  END LOOP;

  RETURN v_notification_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Administrator RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.community_admin_list_members(
  p_limit integer DEFAULT 50,
  p_after_joined_at timestamptz DEFAULT NULL,
  p_after_profile_id uuid DEFAULT NULL
)
RETURNS TABLE (
  profile_id uuid,
  nickname text,
  avatar_kind text,
  avatar_path text,
  preset_avatar text,
  joined_at timestamptz,
  member_id uuid,
  member_number text,
  member_status text,
  active_sanction_type text,
  active_sanction_ends_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.community_is_admin()
     AND COALESCE((SELECT auth.jwt()->>'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Administrator access is required';
  END IF;

  RETURN QUERY
  SELECT
    cp.id,
    cp.nickname,
    cp.avatar_kind,
    cp.avatar_path,
    cp.preset_avatar,
    cp.joined_at,
    m.id,
    m.member_number,
    m.status,
    active_sanction.sanction_type,
    active_sanction.ends_at
  FROM public.community_profiles AS cp
  JOIN private.community_profile_members AS pm ON pm.profile_id = cp.id
  LEFT JOIN public.members AS m ON m.id = pm.member_id
  LEFT JOIN LATERAL (
    SELECT s.sanction_type, s.ends_at
    FROM public.community_sanctions AS s
    WHERE s.member_id = m.id
      AND s.revoked_at IS NULL
      AND s.starts_at <= now()
      AND (
        s.sanction_type = 'permanent_ban'
        OR (s.sanction_type = 'mute' AND s.ends_at > now())
      )
    ORDER BY
      CASE s.sanction_type WHEN 'permanent_ban' THEN 0 ELSE 1 END,
      s.created_at DESC
    LIMIT 1
  ) AS active_sanction ON true
  WHERE (
    p_after_joined_at IS NULL
    OR (cp.joined_at, cp.id) < (p_after_joined_at, p_after_profile_id)
  )
  ORDER BY cp.joined_at DESC, cp.id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
END;
$$;

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
        SELECT jsonb_agg(to_jsonb(h) ORDER BY h.changed_at DESC)
        FROM public.community_nickname_history AS h
        WHERE h.profile_id = cp.id
      ),
      '[]'::jsonb
    ),
    'sanctions', COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC)
        FROM public.community_sanctions AS s
        WHERE s.member_id = m.id
      ),
      '[]'::jsonb
    ),
    'stats', jsonb_build_object(
      'treeholes', (
        SELECT count(*)
        FROM private.community_post_authors AS pa
        JOIN public.community_posts AS p ON p.id = pa.post_id
        WHERE pa.member_id = m.id AND p.post_type = 'treehole'
      ),
      'photo_posts', (
        SELECT count(*)
        FROM private.community_post_authors AS pa
        JOIN public.community_posts AS p ON p.id = pa.post_id
        WHERE pa.member_id = m.id AND p.post_type = 'photo'
      ),
      'comments', (
        SELECT count(*)
        FROM private.community_comment_authors AS ca
        WHERE ca.member_id = m.id
      ),
      'pending_reports', (
        SELECT count(*)
        FROM public.community_reports AS r
        LEFT JOIN private.community_post_authors AS pa
          ON pa.post_id = r.reported_post_id
        LEFT JOIN private.community_comment_authors AS ca
          ON ca.comment_id = r.reported_comment_id
        WHERE r.status = 'pending'
          AND (
            pa.member_id = m.id
            OR ca.member_id = m.id
            OR r.reported_profile_id = cp.id
          )
      )
    )
  )
  INTO v_result
  FROM public.community_profiles AS cp
  JOIN private.community_profile_members AS pm ON pm.profile_id = cp.id
  LEFT JOIN public.members AS m ON m.id = pm.member_id
  WHERE cp.id = p_profile_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Community profile not found';
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_reveal_post_author(
  p_post_id uuid,
  p_reason text,
  p_admin_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  member_id uuid,
  profile_id uuid,
  nickname text,
  member_number text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := private.community_resolve_admin_id(p_admin_user_id);
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Administrator access is required';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'An audit reason is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.community_reports AS report
    WHERE report.reported_post_id = p_post_id
      AND report.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'A pending moderation report is required to reveal this author';
  END IF;

  INSERT INTO public.community_moderation_actions (
    action_type,
    target_type,
    target_post_id,
    admin_user_id,
    internal_note
  )
  VALUES (
    'reveal_anonymous_author', 'post', p_post_id, v_admin_id, btrim(p_reason)
  );

  RETURN QUERY
  SELECT
    m.id,
    pm.profile_id,
    cp.nickname,
    m.member_number
  FROM private.community_post_authors AS pa
  LEFT JOIN public.members AS m ON m.id = pa.member_id
  LEFT JOIN private.community_profile_members AS pm ON pm.member_id = m.id
  LEFT JOIN public.community_profiles AS cp ON cp.id = pm.profile_id
  WHERE pa.post_id = p_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_reveal_comment_author(
  p_comment_id uuid,
  p_reason text,
  p_admin_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  member_id uuid,
  profile_id uuid,
  nickname text,
  member_number text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := private.community_resolve_admin_id(p_admin_user_id);
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Administrator access is required';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'An audit reason is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.community_reports AS report
    WHERE report.reported_comment_id = p_comment_id
      AND report.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'A pending moderation report is required to reveal this author';
  END IF;

  INSERT INTO public.community_moderation_actions (
    action_type,
    target_type,
    target_comment_id,
    admin_user_id,
    internal_note
  )
  VALUES (
    'reveal_anonymous_author', 'comment', p_comment_id, v_admin_id, btrim(p_reason)
  );

  RETURN QUERY
  SELECT
    m.id,
    pm.profile_id,
    cp.nickname,
    m.member_number
  FROM private.community_comment_authors AS ca
  LEFT JOIN public.members AS m ON m.id = ca.member_id
  LEFT JOIN private.community_profile_members AS pm ON pm.member_id = m.id
  LEFT JOIN public.community_profiles AS cp ON cp.id = pm.profile_id
  WHERE ca.comment_id = p_comment_id;
END;
$$;

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
  IF p_report_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.community_reports AS r
       WHERE r.id = p_report_id
         AND r.target_type = p_target_type
         AND (
           (p_target_type = 'post' AND r.reported_post_id = p_target_id)
           OR (p_target_type = 'comment' AND r.reported_comment_id = p_target_id)
         )
     ) THEN
    RAISE EXCEPTION 'Report does not match the moderation target';
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
    SELECT p.status, to_jsonb(p)
    INTO v_current_status, v_snapshot
    FROM public.community_posts AS p
    WHERE p.id = p_target_id
    FOR UPDATE;

    IF v_current_status IS NULL THEN
      RAISE EXCEPTION 'Post not found';
    END IF;
    IF v_current_status = 'deleted' AND p_status <> 'deleted' THEN
      RAISE EXCEPTION 'Deleted posts cannot be restored';
    END IF;

    v_target_member_id := private.community_post_author_member(p_target_id);
    UPDATE public.community_posts
    SET status = p_status
    WHERE id = p_target_id;

    INSERT INTO public.community_moderation_actions (
      report_id, action_type, target_type, target_post_id,
      target_member_id, admin_user_id, internal_note,
      content_snapshot, payload_expires_at
    )
    VALUES (
      p_report_id, v_action_type, 'post', p_target_id,
      v_target_member_id, v_admin_id, btrim(p_reason),
      v_snapshot, now() + interval '30 days'
    );
  ELSE
    SELECT c.status, to_jsonb(c)
    INTO v_current_status, v_snapshot
    FROM public.community_comments AS c
    WHERE c.id = p_target_id
    FOR UPDATE;

    IF v_current_status IS NULL THEN
      RAISE EXCEPTION 'Comment not found';
    END IF;
    IF v_current_status = 'deleted' AND p_status <> 'deleted' THEN
      RAISE EXCEPTION 'Deleted comments cannot be restored';
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
    )
    VALUES (
      p_report_id, v_action_type, 'comment', p_target_id,
      v_target_member_id, v_admin_id, btrim(p_reason),
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
      p_report_id,
      NULL,
      CASE WHEN p_status = 'hidden' THEN '你的内容已被隐藏' ELSE '你的内容已被删除' END,
      CASE WHEN p_status = 'hidden' THEN '投稿が非表示になりました' ELSE '投稿が削除されました' END,
      btrim(p_reason),
      btrim(p_reason)
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_resolve_report(
  p_report_id uuid,
  p_resolution_status text,
  p_internal_note text,
  p_admin_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_reporter_member_id uuid;
BEGIN
  v_admin_id := private.community_resolve_admin_id(p_admin_user_id);
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Administrator access is required';
  END IF;
  IF p_resolution_status NOT IN ('resolved', 'dismissed') THEN
    RAISE EXCEPTION 'Resolution must be resolved or dismissed';
  END IF;
  IF p_internal_note IS NULL OR char_length(btrim(p_internal_note)) = 0 THEN
    RAISE EXCEPTION 'An internal note is required';
  END IF;

  UPDATE public.community_reports
  SET
    status = p_resolution_status,
    resolved_at = now(),
    resolved_by = v_admin_id
  WHERE id = p_report_id
    AND status = 'pending'
  RETURNING reporter_member_id INTO v_reporter_member_id;

  IF v_reporter_member_id IS NULL THEN
    RAISE EXCEPTION 'Pending report not found';
  END IF;

  INSERT INTO public.community_moderation_actions (
    report_id,
    action_type,
    target_type,
    admin_user_id,
    internal_note
  )
  VALUES (
    p_report_id,
    CASE WHEN p_resolution_status = 'dismissed' THEN 'dismiss_report' ELSE 'resolve_report' END,
    'report',
    v_admin_id,
    btrim(p_internal_note)
  );

  PERFORM private.community_insert_notification(
    v_reporter_member_id,
    NULL,
    'report_resolved',
    NULL,
    NULL,
    p_report_id,
    NULL,
    '你的举报已处理',
    '通報の確認が完了しました',
    NULL,
    NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.community_apply_sanction(
  p_member_id uuid,
  p_sanction_type text,
  p_reason text,
  p_duration_days integer DEFAULT NULL,
  p_admin_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_sanction_id uuid;
  v_ends_at timestamptz;
  v_notification_type text;
BEGIN
  v_admin_id := private.community_resolve_admin_id(p_admin_user_id);
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Administrator access is required';
  END IF;
  IF p_sanction_type NOT IN ('warning', 'mute', 'permanent_ban') THEN
    RAISE EXCEPTION 'Invalid sanction type';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A sanction reason is required';
  END IF;
  IF p_sanction_type = 'permanent_ban'
     AND NOT EXISTS (
       SELECT 1
       FROM public.admin_users AS au
       WHERE au.id = v_admin_id
         AND au.role = 'super_admin'
     ) THEN
    RAISE EXCEPTION 'Only super administrators can permanently ban members';
  END IF;
  IF p_sanction_type = 'mute' THEN
    IF p_duration_days NOT IN (1, 7, 30) THEN
      RAISE EXCEPTION 'Mute duration must be 1, 7, or 30 days';
    END IF;
    v_ends_at := now() + make_interval(days => p_duration_days);
  ELSIF p_duration_days IS NOT NULL THEN
    RAISE EXCEPTION 'Duration is valid only for temporary mutes';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.members AS m WHERE m.id = p_member_id
  ) THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  INSERT INTO public.community_sanctions (
    member_id,
    sanction_type,
    reason,
    ends_at,
    issued_by
  )
  VALUES (
    p_member_id,
    p_sanction_type,
    btrim(p_reason),
    v_ends_at,
    v_admin_id
  )
  RETURNING id INTO v_sanction_id;

  INSERT INTO public.community_moderation_actions (
    action_type,
    target_type,
    target_member_id,
    admin_user_id,
    internal_note
  )
  VALUES (
    CASE p_sanction_type
      WHEN 'warning' THEN 'warn_member'
      WHEN 'mute' THEN 'mute_member'
      ELSE 'permanent_ban'
    END,
    'member',
    p_member_id,
    v_admin_id,
    btrim(p_reason)
  );

  v_notification_type := CASE p_sanction_type
    WHEN 'warning' THEN 'warning'
    WHEN 'mute' THEN 'mute'
    ELSE 'permanent_ban'
  END;

  PERFORM private.community_insert_notification(
    p_member_id,
    NULL,
    v_notification_type,
    NULL,
    NULL,
    NULL,
    NULL,
    CASE p_sanction_type
      WHEN 'warning' THEN '社区警告'
      WHEN 'mute' THEN '社区功能已被暂时限制'
      ELSE '社区访问已被永久限制'
    END,
    CASE p_sanction_type
      WHEN 'warning' THEN 'コミュニティからの警告'
      WHEN 'mute' THEN 'コミュニティ機能が一時的に制限されました'
      ELSE 'コミュニティへのアクセスが永久に制限されました'
    END,
    btrim(p_reason),
    btrim(p_reason)
  );

  RETURN v_sanction_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_revoke_sanction(
  p_sanction_id uuid,
  p_reason text,
  p_admin_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_sanction public.community_sanctions;
BEGIN
  v_admin_id := private.community_resolve_admin_id(p_admin_user_id);
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Administrator access is required';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A revoke reason is required';
  END IF;

  SELECT * INTO v_sanction
  FROM public.community_sanctions
  WHERE id = p_sanction_id
  FOR UPDATE;

  IF v_sanction.id IS NULL OR v_sanction.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Active sanction not found';
  END IF;
  IF v_sanction.sanction_type = 'permanent_ban'
     AND NOT EXISTS (
       SELECT 1
       FROM public.admin_users AS au
       WHERE au.id = v_admin_id
         AND au.role = 'super_admin'
     ) THEN
    RAISE EXCEPTION 'Only super administrators can revoke permanent bans';
  END IF;

  UPDATE public.community_sanctions
  SET
    revoked_at = now(),
    revoked_by = v_admin_id,
    revoke_reason = btrim(p_reason)
  WHERE id = p_sanction_id;

  INSERT INTO public.community_moderation_actions (
    action_type,
    target_type,
    target_member_id,
    admin_user_id,
    internal_note
  )
  VALUES (
    'revoke_sanction', 'member', v_sanction.member_id,
    v_admin_id, btrim(p_reason)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.community_admin_reset_profile_avatar(
  p_profile_id uuid,
  p_reason text,
  p_admin_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_member_id uuid;
  v_profile public.community_profiles;
BEGIN
  v_admin_id := private.community_resolve_admin_id(p_admin_user_id);
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Administrator access is required';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'An internal reason is required';
  END IF;

  SELECT * INTO v_profile
  FROM public.community_profiles
  WHERE id = p_profile_id
  FOR UPDATE;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Community profile not found';
  END IF;

  v_member_id := private.community_member_for_profile(p_profile_id);

  UPDATE public.community_profiles
  SET
    avatar_kind = 'default',
    avatar_path = NULL,
    preset_avatar = NULL
  WHERE id = p_profile_id;

  INSERT INTO public.community_moderation_actions (
    action_type,
    target_type,
    target_profile_id,
    target_member_id,
    admin_user_id,
    internal_note,
    content_snapshot,
    payload_expires_at
  )
  VALUES (
    'reset_profile',
    'profile',
    p_profile_id,
    v_member_id,
    v_admin_id,
    btrim(p_reason),
    to_jsonb(v_profile),
    now() + interval '30 days'
  );

  PERFORM private.community_insert_notification(
    v_member_id,
    NULL,
    'content_hidden',
    NULL,
    NULL,
    NULL,
    NULL,
    '你的社区头像已被重置',
    'コミュニティのアイコンがリセットされました',
    btrim(p_reason),
    btrim(p_reason)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.community_get_access_state()
RETURNS TABLE (
  member_id uuid,
  profile_id uuid,
  can_read boolean,
  can_interact boolean,
  active_sanction_type text,
  active_sanction_ends_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    private.community_approved_member_id(),
    private.community_current_profile_id(),
    private.community_can_read(),
    private.community_can_interact(),
    s.sanction_type,
    s.ends_at
  FROM (SELECT 1) AS seed
  LEFT JOIN LATERAL (
    SELECT cs.sanction_type, cs.ends_at
    FROM public.community_sanctions AS cs
    WHERE cs.member_id = private.community_approved_member_id()
      AND cs.revoked_at IS NULL
      AND cs.starts_at <= now()
      AND (
        cs.sanction_type = 'permanent_ban'
        OR (cs.sanction_type = 'mute' AND cs.ends_at > now())
      )
    ORDER BY
      CASE cs.sanction_type WHEN 'permanent_ban' THEN 0 ELSE 1 END,
      cs.created_at DESC
    LIMIT 1
  ) AS s ON true;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_purge_expired_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_images_queued integer := 0;
  v_posts_scrubbed integer := 0;
  v_comments_scrubbed integer := 0;
  v_audit_payloads_scrubbed integer := 0;
  v_report_snapshots_scrubbed integer := 0;
  v_notifications_deleted integer := 0;
  v_cleanup_rows_deleted integer := 0;
  v_orphan_uploads_queued integer := 0;
BEGIN
  IF NOT private.community_is_super_admin()
     AND COALESCE((SELECT auth.jwt()->>'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Super administrator or service role access is required';
  END IF;

  UPDATE public.community_reports
  SET target_snapshot = NULL
  WHERE target_snapshot IS NOT NULL
    AND created_at <= now() - interval '30 days';
  GET DIAGNOSTICS v_report_snapshots_scrubbed = ROW_COUNT;

  INSERT INTO private.community_media_cleanup_queue (
    bucket_id,
    object_path,
    reason
  )
  SELECT candidate.bucket_id, candidate.object_path, 'abandoned_processed_upload'
  FROM (
    SELECT upload.bucket_id, upload.storage_path AS object_path
    FROM private.community_processed_uploads AS upload
    WHERE upload.last_used_at <= now() - interval '24 hours'
      AND (
        upload.cleanup_claimed_at IS NULL
        OR upload.cleanup_claimed_at <= now() - interval '15 minutes'
      )
      AND NOT private.community_storage_object_protected(
        upload.bucket_id,
        upload.storage_path
      )
      AND NOT private.community_storage_object_protected(
        upload.bucket_id,
        upload.thumbnail_path
      )
    UNION
    SELECT upload.bucket_id, upload.thumbnail_path AS object_path
    FROM private.community_processed_uploads AS upload
    WHERE upload.last_used_at <= now() - interval '24 hours'
      AND (
        upload.cleanup_claimed_at IS NULL
        OR upload.cleanup_claimed_at <= now() - interval '15 minutes'
      )
      AND NOT private.community_storage_object_protected(
        upload.bucket_id,
        upload.storage_path
      )
      AND NOT private.community_storage_object_protected(
        upload.bucket_id,
        upload.thumbnail_path
      )
  ) AS candidate
  ON CONFLICT (bucket_id, object_path) DO UPDATE SET
    processed_at = NULL,
    last_error = NULL,
    queued_at = now();
  GET DIAGNOSTICS v_orphan_uploads_queued = ROW_COUNT;

  DELETE FROM private.community_processed_uploads AS upload
  WHERE upload.last_used_at <= now() - interval '24 hours'
    AND (
      upload.cleanup_claimed_at IS NULL
      OR upload.cleanup_claimed_at <= now() - interval '15 minutes'
    )
    AND NOT private.community_storage_object_protected(
      upload.bucket_id,
      upload.storage_path
    )
    AND NOT private.community_storage_object_protected(
      upload.bucket_id,
      upload.thumbnail_path
    );

  DELETE FROM public.community_post_images AS pi
  USING public.community_posts AS p
  WHERE pi.post_id = p.id
    AND p.status IN ('hidden', 'deleted')
    AND COALESCE(p.deleted_at, p.hidden_at) <= now() - interval '30 days';
  GET DIAGNOSTICS v_images_queued = ROW_COUNT;

  UPDATE public.community_posts
  SET
    status = 'deleted',
    title = NULL,
    body = NULL,
    deleted_at = COALESCE(deleted_at, now())
  WHERE status IN ('hidden', 'deleted')
    AND COALESCE(deleted_at, hidden_at) <= now() - interval '30 days'
    AND (title IS NOT NULL OR body IS NOT NULL OR status <> 'deleted');
  GET DIAGNOSTICS v_posts_scrubbed = ROW_COUNT;

  UPDATE public.community_comments
  SET
    status = 'deleted',
    body = NULL,
    deleted_at = COALESCE(deleted_at, now()),
    removal_source = COALESCE(removal_source, 'admin')
  WHERE status IN ('hidden', 'deleted')
    AND COALESCE(deleted_at, hidden_at) <= now() - interval '30 days'
    AND (body IS NOT NULL OR status <> 'deleted');
  GET DIAGNOSTICS v_comments_scrubbed = ROW_COUNT;

  UPDATE public.community_moderation_actions
  SET content_snapshot = NULL
  WHERE content_snapshot IS NOT NULL
    AND payload_expires_at IS NOT NULL
    AND payload_expires_at <= now();
  GET DIAGNOSTICS v_audit_payloads_scrubbed = ROW_COUNT;

  DELETE FROM public.community_notifications
  WHERE expires_at <= now();
  GET DIAGNOSTICS v_notifications_deleted = ROW_COUNT;

  DELETE FROM private.community_media_cleanup_queue
  WHERE processed_at IS NOT NULL
    AND processed_at <= now() - interval '30 days';
  GET DIAGNOSTICS v_cleanup_rows_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'images_queued', v_images_queued,
    'posts_scrubbed', v_posts_scrubbed,
    'comments_scrubbed', v_comments_scrubbed,
    'audit_payloads_scrubbed', v_audit_payloads_scrubbed,
    'report_snapshots_scrubbed', v_report_snapshots_scrubbed,
    'notifications_deleted', v_notifications_deleted,
    'orphan_uploads_queued', v_orphan_uploads_queued,
    'cleanup_rows_deleted', v_cleanup_rows_deleted
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.community_admin_claim_media_cleanup(
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  cleanup_id bigint,
  bucket_id text,
  object_path text,
  reason text,
  queued_at timestamptz,
  cleanup_claim_token uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_queue private.community_media_cleanup_queue;
  v_upload private.community_processed_uploads;
  v_has_upload boolean;
  v_claim_token uuid;
BEGIN
  IF NOT private.community_is_admin()
     AND COALESCE((SELECT auth.jwt()->>'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Administrator access is required';
  END IF;

  FOR v_queue IN
    SELECT q.*
    FROM private.community_media_cleanup_queue AS q
    WHERE q.processed_at IS NULL
      AND (
        q.claimed_at IS NULL
        OR q.claimed_at <= now() - interval '15 minutes'
      )
      AND NOT private.community_storage_object_protected(
        q.bucket_id,
        q.object_path
      )
    ORDER BY q.queued_at, q.id
    LIMIT LEAST(GREATEST(p_limit, 1), 500)
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT upload.*
    INTO v_upload
    FROM private.community_processed_uploads AS upload
    WHERE upload.bucket_id = v_queue.bucket_id
      AND (
        upload.storage_path = v_queue.object_path
        OR upload.thumbnail_path = v_queue.object_path
      )
    ORDER BY upload.registered_at, upload.id
    LIMIT 1
    FOR UPDATE;
    v_has_upload := FOUND;

    IF v_has_upload
       AND v_upload.cleanup_claimed_at IS NOT NULL
       AND v_upload.cleanup_claimed_at > now() - interval '15 minutes' THEN
      CONTINUE;
    END IF;

    -- Locking the proof serializes this claim against publish/edit RPCs.
    -- Recheck after that lock so a publication that won the race is never
    -- handed to the Storage deletion worker.
    IF private.community_storage_object_protected(
      v_queue.bucket_id,
      v_queue.object_path
    ) THEN
      IF v_has_upload
         AND v_upload.cleanup_claimed_at IS NOT NULL
         AND v_upload.cleanup_claimed_at <= now() - interval '15 minutes' THEN
        UPDATE private.community_processed_uploads
        SET cleanup_claimed_at = NULL, cleanup_claim_token = NULL
        WHERE id = v_upload.id;
      END IF;
      CONTINUE;
    END IF;

    v_claim_token := gen_random_uuid();

    IF v_has_upload THEN
      UPDATE private.community_processed_uploads
      SET
        cleanup_claimed_at = now(),
        cleanup_claim_token = v_claim_token
      WHERE id = v_upload.id;
    END IF;

    UPDATE private.community_media_cleanup_queue
    SET
      claimed_at = now(),
      claim_token = v_claim_token,
      last_error = NULL
    WHERE id = v_queue.id;

    cleanup_id := v_queue.id;
    bucket_id := v_queue.bucket_id;
    object_path := v_queue.object_path;
    reason := v_queue.reason;
    queued_at := v_queue.queued_at;
    cleanup_claim_token := v_claim_token;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_admin_complete_media_cleanup(
  p_cleanup_id bigint,
  p_claim_token uuid,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_queue private.community_media_cleanup_queue;
BEGIN
  IF NOT private.community_is_admin()
     AND COALESCE((SELECT auth.jwt()->>'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Administrator access is required';
  END IF;

  SELECT * INTO v_queue
  FROM private.community_media_cleanup_queue AS q
  WHERE q.id = p_cleanup_id
    AND q.processed_at IS NULL
    AND q.claim_token = p_claim_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Media cleanup claim is missing or expired';
  END IF;

  IF p_error IS NULL THEN
    UPDATE private.community_media_cleanup_queue
    SET
      processed_at = now(),
      claimed_at = NULL,
      claim_token = NULL,
      last_error = NULL
    WHERE id = p_cleanup_id;

    DELETE FROM private.community_processed_uploads AS upload
    WHERE upload.cleanup_claim_token = p_claim_token
      AND upload.bucket_id = v_queue.bucket_id
      AND (
        upload.storage_path = v_queue.object_path
        OR upload.thumbnail_path = v_queue.object_path
      );
  ELSE
    UPDATE private.community_processed_uploads AS upload
    SET cleanup_claimed_at = NULL, cleanup_claim_token = NULL
    WHERE upload.cleanup_claim_token = p_claim_token
      AND upload.bucket_id = v_queue.bucket_id
      AND (
        upload.storage_path = v_queue.object_path
        OR upload.thumbnail_path = v_queue.object_path
      );

    UPDATE private.community_media_cleanup_queue
    SET
      claimed_at = NULL,
      claim_token = NULL,
      last_error = p_error
    WHERE id = p_cleanup_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_service_media_evidence_exists(
  p_bucket_id text,
  p_object_path text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE((SELECT auth.jwt()->>'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role access is required';
  END IF;
  RETURN private.community_storage_object_protected(p_bucket_id, p_object_path);
END;
$$;

-- Add notification rows to Supabase Realtime when the publication exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'community_notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.community_notifications';
  END IF;
END;
$$;

-- Revoke the Postgres default only for this migration's public RPC surface;
-- do not alter privileges of pre-existing application functions.
DO $$
DECLARE
  v_function record;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure::text AS signature
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'community\_%' ESCAPE '\'
  LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION '
      || v_function.signature
      || ' FROM PUBLIC, anon';
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_register_processed_upload(uuid, text, text, text, integer, integer, bigint, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.community_upsert_profile(text, text, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_create_treehole(text, text, boolean)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_create_photo_post(text, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_update_post(uuid, text, text, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_delete_post(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_add_comment(uuid, text, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_update_comment(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_delete_comment(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_toggle_post_like(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_report_content(text, uuid, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_hide_post(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_unhide_post(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_block_profile(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_unblock_profile(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_mark_notification_read(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_mark_all_notifications_read()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_update_notification_preferences(boolean, boolean, boolean, boolean)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_get_access_state()
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.community_dispatch_scheduled_announcements()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_admin_list_members(integer, timestamptz, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_admin_get_member(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_reveal_post_author(uuid, text, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_reveal_comment_author(uuid, text, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_set_content_status(text, uuid, text, text, uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_resolve_report(uuid, text, text, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_apply_sanction(uuid, text, text, integer, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_revoke_sanction(uuid, text, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_admin_reset_profile_avatar(uuid, text, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_purge_expired_data()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_admin_claim_media_cleanup(integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_admin_complete_media_cleanup(bigint, uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_service_media_evidence_exists(text, text)
  TO service_role;

-- Only boolean helpers referenced directly by RLS are callable by members.
-- Identity-resolution, notification insertion and cleanup helpers stay private.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.community_approved_member_id()
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.community_is_admin()
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.community_can_read()
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.community_can_interact()
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.community_profile_is_hidden_by_current(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.community_post_visible_to_current(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.community_comment_visible_to_current(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.community_storage_object_referenced(text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.community_storage_object_has_processing_proof(text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.community_can_read_storage_object(text, text, text)
  TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO service_role;
