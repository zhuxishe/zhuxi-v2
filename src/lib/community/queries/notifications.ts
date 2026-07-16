import { createAdminClient } from "@/lib/supabase/admin"
import type { CommunityLocale, CommunityNotification, CommunityProfile } from "@/lib/community/types"

interface NotificationRow {
  id: string
  notification_type: string
  actor_profile_id: string | null
  post_id: string | null
  comment_id: string | null
  report_id: string | null
  announcement_id: string | null
  title_zh: string | null
  title_ja: string | null
  body_zh: string | null
  body_ja: string | null
  group_count: number
  read_at: string | null
  created_at: string
}

interface ProfileRow {
  id: string
  nickname: string
  avatar_kind: CommunityProfile["avatarKind"]
  avatar_path: string | null
  preset_avatar: string | null
  joined_at: string
}

export const COMMUNITY_SECURITY_NOTIFICATION_TYPES = [
  "report_resolved",
  "content_hidden",
  "content_deleted",
  "warning",
  "mute",
  "permanent_ban",
] as const

export async function fetchCommunityNotifications(
  memberId: string,
  locale: CommunityLocale,
  options: { limit: number; unreadOnly?: boolean },
): Promise<{ items: CommunityNotification[]; unreadCount: number }> {
  const db = createAdminClient()
  const nowIso = new Date().toISOString()
  const banResult = await db
    .from("community_sanctions")
    .select("id")
    .eq("member_id", memberId)
    .eq("sanction_type", "permanent_ban")
    .is("revoked_at", null)
    .lte("starts_at", nowIso)
    .limit(1)
    .maybeSingle<{ id: string }>()
  if (banResult.error) {
    throw new Error(`Failed to verify community notification access: ${banResult.error.message}`)
  }
  const securityOnly = Boolean(banResult.data)

  let query = db
    .from("community_notifications")
    .select("id, notification_type, actor_profile_id, post_id, comment_id, report_id, announcement_id, title_zh, title_ja, body_zh, body_ja, group_count, read_at, created_at")
    .eq("recipient_member_id", memberId)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(options.limit)
  let unreadQuery = db
    .from("community_notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_member_id", memberId)
    .is("read_at", null)
    .gt("expires_at", nowIso)
  if (securityOnly) {
    query = query.in("notification_type", [...COMMUNITY_SECURITY_NOTIFICATION_TYPES])
    unreadQuery = unreadQuery.in("notification_type", [...COMMUNITY_SECURITY_NOTIFICATION_TYPES])
  }
  if (options.unreadOnly) query = query.is("read_at", null)

  const [notificationsResult, unreadResult] = await Promise.all([
    query,
    unreadQuery,
  ])
  if (notificationsResult.error || unreadResult.error) {
    const message = notificationsResult.error?.message ?? unreadResult.error?.message ?? "unknown error"
    throw new Error(`Failed to load notifications: ${message}`)
  }

  const rows = (notificationsResult.data ?? []) as NotificationRow[]
  const profileIds = [...new Set(rows.flatMap((row) => row.actor_profile_id ? [row.actor_profile_id] : []))]
  const postIds = [...new Set(rows.flatMap((row) => row.post_id ? [row.post_id] : []))]
  const commentIds = [...new Set(rows.flatMap((row) => row.comment_id ? [row.comment_id] : []))]
  const announcementIds = [...new Set(rows.flatMap((row) => row.announcement_id ? [row.announcement_id] : []))]
  const [profilesResult, postsResult, commentsResult, announcementsResult] = await Promise.all([
    profileIds.length
      ? db.from("community_profiles").select("id, nickname, avatar_kind, avatar_path, preset_avatar, joined_at").in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
    postIds.length
      ? db.from("community_posts").select("id, post_type, status").in("id", postIds)
      : Promise.resolve({ data: [], error: null }),
    commentIds.length
      ? db.from("community_comments").select("id, status").in("id", commentIds)
      : Promise.resolve({ data: [], error: null }),
    announcementIds.length
      ? db.from("community_announcements").select("id, status, display_start_at, display_end_at").in("id", announcementIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  const relatedError = [profilesResult, postsResult, commentsResult, announcementsResult]
    .find((result) => result.error)?.error
  if (relatedError) {
    throw new Error(`Failed to verify community notification targets: ${relatedError.message}`)
  }
  const profiles = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((row) => [row.id, {
    id: row.id,
    nickname: row.nickname,
    avatarKind: row.avatar_kind,
    avatarPath: row.avatar_path,
    presetAvatar: row.preset_avatar,
    joinedAt: row.joined_at,
  }]))
  const posts = new Map((postsResult.data ?? []).map((row: { id: string; post_type: string; status: string }) => [row.id, row]))
  const comments = new Map((commentsResult.data ?? []).map((row: { id: string; status: string }) => [row.id, row]))
  const announcements = new Map((announcementsResult.data ?? []).map((row: { id: string; status: string; display_start_at: string | null; display_end_at: string | null }) => [row.id, row]))

  return {
    unreadCount: unreadResult.count ?? 0,
    items: rows.map((row) => {
      const resolvedTarget = resolveCommunityNotificationTarget({
        postId: row.post_id,
        commentId: row.comment_id,
        reportId: row.report_id,
        announcementId: row.announcement_id,
      }, posts, comments, announcements)
      const target = securityOnly && row.report_id
        ? { href: null, unavailable: false }
        : resolvedTarget
      return {
        id: row.id,
        type: row.notification_type,
        title: (locale === "ja" ? row.title_ja : row.title_zh) || row.title_zh || row.title_ja || "",
        body: (locale === "ja" ? row.body_ja : row.body_zh) || row.body_zh || row.body_ja || "",
        href: target.href,
        unavailable: target.unavailable,
        actor: row.actor_profile_id ? profiles.get(row.actor_profile_id) ?? null : null,
        groupCount: row.group_count,
        readAt: row.read_at,
        createdAt: row.created_at,
      }
    }),
  }
}

export function resolveCommunityNotificationTarget(
  target: {
    postId: string | null
    commentId: string | null
    reportId: string | null
    announcementId: string | null
  },
  posts: Map<string, { id: string; post_type: string; status: string }>,
  comments: Map<string, { id: string; status: string }>,
  announcements: Map<string, { id: string; status: string; display_start_at: string | null; display_end_at: string | null }>,
): { href: string | null; unavailable: boolean } {
  if (target.commentId) {
    const comment = comments.get(target.commentId)
    if (!comment || comment.status !== "published") return { href: null, unavailable: true }
  }
  if (target.postId) {
    const post = posts.get(target.postId)
    if (!post || post.status !== "published") return { href: null, unavailable: true }
    const baseHref = post.post_type === "photo"
      ? `/app/community/photos/${target.postId}`
      : `/app/community/treehole/${target.postId}`
    return {
      href: target.commentId
        ? `${baseHref}?comment=${target.commentId}#comment-${target.commentId}`
        : baseHref,
      unavailable: false,
    }
  }
  if (target.commentId) return { href: null, unavailable: true }
  if (target.announcementId) {
    const announcement = announcements.get(target.announcementId)
    const now = Date.now()
    const active = announcement
      && announcement.status === "published"
      && (!announcement.display_start_at || new Date(announcement.display_start_at).getTime() <= now)
      && (!announcement.display_end_at || new Date(announcement.display_end_at).getTime() > now)
    return active
      ? { href: `/app/community?tab=announcements&announcement=${target.announcementId}`, unavailable: false }
      : { href: null, unavailable: true }
  }
  if (target.reportId) return { href: "/app/profile/community#community-reports", unavailable: false }
  return { href: null, unavailable: false }
}
