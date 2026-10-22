import { createAdminClient } from "@/lib/supabase/admin"
import type { CommunityLocale, CommunityNotification, CommunityProfile } from "@/lib/community/types"
import { participationRecordHref } from "@/lib/matching/participation-display"

interface NotificationRow {
  id: string
  notification_type: string
  actor_profile_id: string | null
  post_id: string | null
  comment_id: string | null
  report_id: string | null
  announcement_id: string | null
  round_id: string | null
  match_result_id: string | null
  match_session_id: string | null
  publication_version: number | null
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

export const COMMUNITY_TRANSACTIONAL_NOTIFICATION_TYPES = [
  "registration_submitted",
  "matching_submitted",
] as const

export const COMMUNITY_MATCHING_PUBLICATION_NOTIFICATION_TYPES = [
  "matching_published", "matching_unmatched", "matching_withdrawn", "matching_cancelled",
] as const

export const COMMUNITY_RESTRICTED_NOTIFICATION_TYPES = [
  ...COMMUNITY_SECURITY_NOTIFICATION_TYPES,
  ...COMMUNITY_TRANSACTIONAL_NOTIFICATION_TYPES,
  ...COMMUNITY_MATCHING_PUBLICATION_NOTIFICATION_TYPES,
  "birthday_completion",
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
  const hasCommunityBan = Boolean(banResult.data)

  let query = db
    .from("community_notifications")
    .select("id, notification_type, actor_profile_id, post_id, comment_id, report_id, announcement_id, round_id, match_result_id, match_session_id, publication_version, title_zh, title_ja, body_zh, body_ja, group_count, read_at, created_at")
    .eq("recipient_member_id", memberId)
    .gt("expires_at", nowIso)
    .gt("group_count", 0)
    .order("created_at", { ascending: false })
    .limit(options.limit)
  let unreadQuery = db
    .from("community_notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_member_id", memberId)
    .is("read_at", null)
    .gt("expires_at", nowIso)
    .gt("group_count", 0)
  if (hasCommunityBan) {
    query = query.in("notification_type", [...COMMUNITY_RESTRICTED_NOTIFICATION_TYPES])
    unreadQuery = unreadQuery.in("notification_type", [...COMMUNITY_RESTRICTED_NOTIFICATION_TYPES])
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
  // Comment likes never reveal the actor, including in the notification bell.
  const profileIds = [...new Set(rows.flatMap((row) => row.notification_type !== "comment_like" && row.actor_profile_id ? [row.actor_profile_id] : []))]
  const postIds = [...new Set(rows.flatMap((row) => row.post_id ? [row.post_id] : []))]
  const commentIds = [...new Set(rows.flatMap((row) => row.comment_id ? [row.comment_id] : []))]
  const announcementIds = [...new Set(rows.flatMap((row) => row.announcement_id ? [row.announcement_id] : []))]
  const roundIds = [...new Set(rows.flatMap((row) => row.round_id ? [row.round_id] : []))]
  const matchingRows = rows.filter((row) => isMatchingPublicationNotification(row.notification_type))
  const matchingSessionIds = [...new Set(matchingRows.flatMap((row) => row.match_session_id ? [row.match_session_id] : []))]
  const matchingResultIds = [...new Set(matchingRows.flatMap((row) => row.match_result_id ? [row.match_result_id] : []))]
  const [profilesResult, postsResult, commentsResult, announcementsResult, submissionsResult, matchingSessionsResult, matchingResultsResult] = await Promise.all([
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
    roundIds.length
      ? db.from("match_round_submissions").select("round_id, cancelled_at, round:match_rounds!inner(id)").eq("member_id", memberId).in("round_id", roundIds).is("round.deleted_at", null)
      : Promise.resolve({ data: [], error: null }),
    matchingSessionIds.length
      ? db.from("match_sessions").select("id, status, publication_version").in("id", matchingSessionIds)
      : Promise.resolve({ data: [], error: null }),
    matchingResultIds.length
      ? db.from("match_results").select("id, session_id, status, publication_version, member_a_id, member_b_id, group_members").in("id", matchingResultIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  const relatedError = [profilesResult, postsResult, commentsResult, announcementsResult, submissionsResult, matchingSessionsResult, matchingResultsResult]
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
  const submittedRoundIds = new Set((submissionsResult.data ?? []).map((row: { round_id: string }) => row.round_id))
  const matchingSessions = new Map((matchingSessionsResult.data ?? []).map((row: MatchingNotificationSession) => [row.id, row]))
  const matchingResults = new Map((matchingResultsResult.data ?? []).map((row: MatchingNotificationResult) => [row.id, row]))

  const cancelledRoundIds = new Set((submissionsResult.data ?? [])
    .filter((row: { cancelled_at?: string | null }) => row.cancelled_at)
    .map((row: { round_id: string }) => row.round_id))

  return {
    unreadCount: unreadResult.count ?? 0,
    items: rows.map((row) => {
      const matchingTarget = isMatchingPublicationNotification(row.notification_type)
        ? resolveMatchingPublicationNotification(row, memberId, matchingSessions, matchingResults)
        : null
      const resolvedTarget = matchingTarget ?? resolveCommunityNotificationTarget({
        postId: row.post_id,
        commentId: row.comment_id,
        reportId: row.report_id,
        announcementId: row.announcement_id,
        roundId: row.round_id,
        notificationType: row.notification_type,
      }, posts, comments, announcements, submittedRoundIds)
      const target = hasCommunityBan && row.report_id
        ? { href: null, unavailable: false }
        : resolvedTarget
      const cancelled = row.notification_type === "registration_submitted" && row.round_id && cancelledRoundIds.has(row.round_id)
      const isCommentLike = row.notification_type === "comment_like"
      const matchingHint = matchingTarget?.state === "stale"
        ? (locale === "ja" ? "この公開版は撤回または更新されました。最新のマッチング状況を確認してください。" : "该发布版本已撤回或更新，请查看最新匹配状态。")
        : matchingTarget?.state === "cancelled"
          ? (locale === "ja" ? "このマッチングはキャンセルされました。最新の状況を確認してください。" : "这份匹配已取消，请查看最新状态。")
          : undefined
      return {
        id: row.id,
        type: row.notification_type,
        title: isCommentLike
          ? (locale === "ja" ? `${row.group_count}人があなたのコメントにいいねしました` : `有 ${row.group_count} 人赞了你的评论`)
          : (locale === "ja" ? row.title_ja : row.title_zh) || row.title_zh || row.title_ja || "",
        body: matchingHint ?? (isCommentLike ? "" : cancelled ? (locale === "ja" ? "この申込は取り消されました。記録を開くと詳細を確認できます。" : "这次报名已取消，点击查看保留的报名记录。") : (locale === "ja" ? row.body_ja : row.body_zh) || row.body_zh || row.body_ja || ""),
        href: target.href,
        unavailable: target.unavailable,
        ...(matchingHint ? { unavailableHint: matchingTarget?.state === "cancelled"
          ? (locale === "ja" ? "キャンセル済み" : "已取消")
          : (locale === "ja" ? "この公開版は無効です" : "该发布版本已失效") } : {}),
        actor: !isCommentLike && row.actor_profile_id ? profiles.get(row.actor_profile_id) ?? null : null,
        groupCount: row.group_count,
        readAt: row.read_at,
        createdAt: row.created_at,
      }
    }),
  }
}

interface MatchingNotificationSession { id: string; status: string; publication_version: number }
interface MatchingNotificationResult {
  id: string; session_id: string; status: string; publication_version: number
  member_a_id: string | null; member_b_id: string | null; group_members: string[] | null
}

function isMatchingPublicationNotification(type: string) {
  return COMMUNITY_MATCHING_PUBLICATION_NOTIFICATION_TYPES.some((item) => item === type)
}

export function resolveMatchingPublicationNotification(
  notice: Pick<NotificationRow, "notification_type" | "round_id" | "match_result_id" | "match_session_id" | "publication_version">,
  memberId: string,
  sessions: Map<string, MatchingNotificationSession>,
  results: Map<string, MatchingNotificationResult>,
): { href: string; unavailable: boolean; state?: "stale" | "cancelled" } {
  const fallback = "/app/matches#matching"
  if (notice.notification_type === "matching_withdrawn") return { href: fallback, unavailable: false }
  const session = notice.match_session_id ? sessions.get(notice.match_session_id) : null
  const current = session?.status === "confirmed" && notice.publication_version != null
    && notice.publication_version > 0 && session.publication_version === notice.publication_version
  if (!current) return { href: fallback, unavailable: true, state: "stale" }
  if (notice.notification_type === "matching_unmatched") return { href: fallback, unavailable: false }
  const result = notice.match_result_id ? results.get(notice.match_result_id) : null
  const owned = result && (result.member_a_id === memberId || result.member_b_id === memberId || result.group_members?.includes(memberId))
  if (!owned || result.session_id !== session.id || result.publication_version !== notice.publication_version) {
    return { href: fallback, unavailable: true, state: "stale" }
  }
  if (notice.notification_type === "matching_cancelled" && result.status === "cancelled") {
    return { href: `/app/matches/${result.id}`, unavailable: false }
  }
  if (result.status === "cancelled") return { href: fallback, unavailable: true, state: "cancelled" }
  return result.status === "confirmed" && notice.notification_type === "matching_published"
    ? { href: `/app/matches/${result.id}`, unavailable: false }
    : { href: fallback, unavailable: true, state: "stale" }
}

export function resolveCommunityNotificationTarget(
  target: {
    postId: string | null
    commentId: string | null
    reportId: string | null
    announcementId: string | null
    roundId?: string | null
    notificationType?: string
  },
  posts: Map<string, { id: string; post_type: string; status: string }>,
  comments: Map<string, { id: string; status: string }>,
  announcements: Map<string, { id: string; status: string; display_start_at: string | null; display_end_at: string | null }>,
  submittedRoundIds: Set<string> = new Set(),
): { href: string | null; unavailable: boolean } {
  if (target.notificationType === "birthday_completion") {
    return { href: "/app/profile/birthday", unavailable: false }
  }
  if (COMMUNITY_TRANSACTIONAL_NOTIFICATION_TYPES.some((type) => type === target.notificationType)) {
    return target.roundId && submittedRoundIds.has(target.roundId)
      ? { href: participationRecordHref(target.roundId), unavailable: false }
      : { href: null, unavailable: true }
  }
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
