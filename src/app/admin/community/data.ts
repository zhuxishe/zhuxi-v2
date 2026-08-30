import { createAdminClient } from "@/lib/supabase/admin"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import type {
  CommunityAdminMember,
  CommunityAnnouncement,
  CommunityFaq,
  CommunityMemberDetail,
  CommunityOverviewMetrics,
  CommunityReport,
  CommunityReportDetail,
  CommunitySanction,
} from "@/components/admin/community/types"

type RpcResult<T> = PromiseLike<{ data: T | null; error: { code?: string; message: string } | null }>
type CommunityRpcClient = {
  rpc<T>(name: string, args?: Record<string, unknown>): RpcResult<T>
}

async function communityRpcClient() {
  return await createServerClient() as unknown as CommunityRpcClient
}

interface QueryError {
  code?: string
  message?: string
}

export function isCommunitySchemaMissing(error: QueryError | null | undefined) {
  if (!error) return false
  return error.code === "PGRST205" || error.code === "42P01" || Boolean(error.message?.includes("community_"))
}

function startOfTodayInTokyo(now = new Date()) {
  const offset = 9 * 60 * 60 * 1000
  const tokyo = new Date(now.getTime() + offset)
  tokyo.setUTCHours(0, 0, 0, 0)
  return new Date(tokyo.getTime() - offset).toISOString()
}

export async function fetchCommunityOverview(): Promise<{
  metrics: CommunityOverviewMetrics
  recentReports: CommunityReport[]
  setupRequired: boolean
}> {
  const supabase = createAdminClient()
  const now = new Date().toISOString()
  const today = startOfTodayInTokyo()

  const [
    reportsResult,
    treeholesResult,
    photosResult,
    hiddenPostsResult,
    hiddenCommentsResult,
    mutesResult,
  ] = await Promise.all([
    supabase.from("community_reports").select("*", { count: "exact" }).eq("status", "pending").order("created_at", { ascending: true }).limit(5),
    supabase.from("community_posts").select("id", { count: "exact", head: true }).eq("post_type", "treehole").gte("published_at", today),
    supabase.from("community_posts").select("id", { count: "exact", head: true }).eq("post_type", "photo").gte("published_at", today),
    supabase.from("community_posts").select("id", { count: "exact", head: true }).eq("status", "hidden"),
    supabase.from("community_comments").select("id", { count: "exact", head: true }).eq("status", "hidden"),
    supabase
      .from("community_sanctions")
      .select("member_id", { count: "exact", head: true })
      .eq("sanction_type", "mute")
      .is("revoked_at", null)
      .gt("ends_at", now),
  ])

  const allResults = [
    reportsResult,
    treeholesResult,
    photosResult,
    hiddenPostsResult,
    hiddenCommentsResult,
    mutesResult,
  ]
  const setupRequired = allResults.some((result) => isCommunitySchemaMissing(result.error))
  const unexpected = allResults.find((result) => result.error && !isCommunitySchemaMissing(result.error))?.error
  if (unexpected) throw unexpected

  const recentReports = setupRequired
    ? []
    : await hydrateCommunityReports((reportsResult.data ?? []) as RawCommunityReport[])

  return {
    setupRequired,
    metrics: {
      pendingReports: reportsResult.count ?? 0,
      todayTreeholes: treeholesResult.count ?? 0,
      todayPhotos: photosResult.count ?? 0,
      hiddenContent: (hiddenPostsResult.count ?? 0) + (hiddenCommentsResult.count ?? 0),
      activeMutes: mutesResult.count ?? 0,
    },
    recentReports,
  }
}

export async function fetchCommunityAnnouncements(): Promise<{
  announcements: CommunityAnnouncement[]
  setupRequired: boolean
}> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("community_announcements")
    .select("*")
    .order("is_pinned", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("published_at", { ascending: false, nullsFirst: false })

  if (isCommunitySchemaMissing(error)) return { announcements: [], setupRequired: true }
  if (error) throw error
  return { announcements: (data ?? []) as CommunityAnnouncement[], setupRequired: false }
}

export async function fetchCommunityFaqs(): Promise<{
  faqs: CommunityFaq[]
  setupRequired: boolean
}> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("community_faqs")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })

  if (isCommunitySchemaMissing(error)) return { faqs: [], setupRequired: true }
  if (error) throw error
  return { faqs: (data ?? []) as CommunityFaq[], setupRequired: false }
}

interface RawCommunityReport {
  id: string
  reporter_member_id: string
  target_type: "post" | "comment" | "profile"
  reported_post_id: string | null
  reported_comment_id: string | null
  reported_profile_id: string | null
  reason: CommunityReport["reason"]
  details: string | null
  target_snapshot: unknown
  status: CommunityReport["status"]
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
  updated_at: string
}

type JsonObject = Record<string, unknown>

function asJsonObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null
}

function snapshotImages(value: unknown): CommunityReport["target_images"] | null {
  if (!Array.isArray(value)) return null
  const images: CommunityReport["target_images"] = []
  for (const item of value) {
    const image = asJsonObject(item)
    if (!image) continue
    const storagePath = asString(image.storage_path)
    const thumbnailPath = asString(image.thumbnail_path)
    if (!storagePath || !thumbnailPath) continue
    images.push({
      id: asString(image.id) ?? `${storagePath}:${images.length}`,
      storage_path: storagePath,
      thumbnail_path: thumbnailPath,
      sort_order: typeof image.sort_order === "number" ? image.sort_order : images.length,
    })
  }
  return images
}

function snapshotProfile(value: unknown): CommunityReport["target_profile"] {
  const profile = asJsonObject(value)
  if (!profile) return null
  const id = asString(profile.id)
  const nickname = asString(profile.nickname)
  const avatarKind = asString(profile.avatar_kind)
  const joinedAt = asString(profile.joined_at)
  if (!id || !nickname || !joinedAt || !["default", "preset", "upload", "personal"].includes(avatarKind ?? "")) {
    return null
  }
  return {
    id,
    nickname,
    avatarKind: avatarKind as "default" | "preset" | "upload" | "personal",
    avatarPath: asString(profile.avatar_path),
    presetAvatar: asString(profile.preset_avatar),
    joinedAt,
  }
}

async function hydrateCommunityReports(rows: RawCommunityReport[]): Promise<CommunityReport[]> {
  if (rows.length === 0) return []
  const admin = await requireAdmin()
  const supabase = createAdminClient()
  const memberIds = [...new Set(rows.map((row) => row.reporter_member_id))]
  const postIds = rows.flatMap((row) => (row.reported_post_id ? [row.reported_post_id] : []))
  const commentIds = rows.flatMap((row) => (row.reported_comment_id ? [row.reported_comment_id] : []))
  const profileIds = rows.flatMap((row) => (row.reported_profile_id ? [row.reported_profile_id] : []))

  const [
    membersResult,
    postsResult,
    commentsResult,
    profilesResult,
    imagesResult,
    postReportsResult,
    commentReportsResult,
    profileReportsResult,
  ] = await Promise.all([
    admin.role === "super_admin"
      ? supabase.from("members").select("id, member_number").in("id", memberIds)
      : Promise.resolve({ data: [], error: null }),
    postIds.length > 0
      ? supabase.from("community_posts").select("id, title, body, status, is_anonymous").in("id", postIds)
      : Promise.resolve({ data: [], error: null }),
    commentIds.length > 0
      ? supabase.from("community_comments").select("id, body, status, is_anonymous_author").in("id", commentIds)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length > 0
      ? supabase.from("community_profiles").select("id, nickname, avatar_kind, avatar_path, preset_avatar, joined_at").in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
    postIds.length > 0
      ? supabase.from("community_post_images").select("id, post_id, storage_path, thumbnail_path, sort_order").in("post_id", postIds).order("sort_order")
      : Promise.resolve({ data: [], error: null }),
    postIds.length > 0
      ? supabase.from("community_reports").select("reported_post_id").in("reported_post_id", postIds)
      : Promise.resolve({ data: [], error: null }),
    commentIds.length > 0
      ? supabase.from("community_reports").select("reported_comment_id").in("reported_comment_id", commentIds)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length > 0
      ? supabase.from("community_reports").select("reported_profile_id").in("reported_profile_id", profileIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const unexpected = [
    membersResult,
    postsResult,
    commentsResult,
    profilesResult,
    imagesResult,
    postReportsResult,
    commentReportsResult,
    profileReportsResult,
  ].find((result) => result.error)?.error
  if (unexpected) throw unexpected

  const members = new Map((membersResult.data ?? []).map((row: { id: string; member_number: string | null }) => [row.id, row]))
  const posts = new Map((postsResult.data ?? []).map((row: { id: string }) => [row.id, row]))
  const comments = new Map((commentsResult.data ?? []).map((row: { id: string }) => [row.id, row]))
  const profiles = new Map((profilesResult.data ?? []).map((row: { id: string }) => [row.id, row]))
  const imagesByPost = new Map<string, CommunityReport["target_images"]>()
  for (const image of (imagesResult.data ?? []) as Array<{ id: string; post_id: string; storage_path: string; thumbnail_path: string; sort_order: number }>) {
    const images = imagesByPost.get(image.post_id) ?? []
    images.push({
      id: image.id,
      storage_path: image.storage_path,
      thumbnail_path: image.thumbnail_path,
      sort_order: image.sort_order,
    })
    imagesByPost.set(image.post_id, images)
  }
  const postReportCounts = countTargetReports(postReportsResult.data ?? [], "reported_post_id")
  const commentReportCounts = countTargetReports(commentReportsResult.data ?? [], "reported_comment_id")
  const profileReportCounts = countTargetReports(profileReportsResult.data ?? [], "reported_profile_id")

  return rows.map((row) => {
    const post = row.reported_post_id ? posts.get(row.reported_post_id) as { title: string | null; body: string | null; status: string; is_anonymous: boolean } | undefined : undefined
    const comment = row.reported_comment_id ? comments.get(row.reported_comment_id) as { body: string | null; status: string; is_anonymous_author: boolean } | undefined : undefined
    const profile = row.reported_profile_id ? profiles.get(row.reported_profile_id) as {
      id: string
      nickname: string
      avatar_kind: "default" | "preset" | "upload" | "personal"
      avatar_path: string | null
      preset_avatar: string | null
      joined_at: string
    } | undefined : undefined
    const snapshot = asJsonObject(row.target_snapshot)
    const snapshotMatchesTarget = asString(snapshot?.target_type) === row.target_type
    const capturedAt = snapshotMatchesTarget ? asString(snapshot?.captured_at) : null
    const snapshotPost = snapshotMatchesTarget && row.target_type === "post"
      ? asJsonObject(snapshot?.post)
      : null
    const snapshotComment = snapshotMatchesTarget && row.target_type === "comment"
      ? asJsonObject(snapshot?.comment)
      : null
    const reportSnapshotProfile = snapshotMatchesTarget && row.target_type === "profile"
      ? snapshotProfile(snapshot?.profile)
      : null
    const reportSnapshotImages = snapshotPost ? snapshotImages(snapshot?.images) : null
    const targetUsesSnapshot = Boolean(snapshotPost || snapshotComment || reportSnapshotProfile)
    const snapshotTitle = asString(snapshotPost?.title)
    const snapshotBody = asString(snapshotPost?.body) ?? asString(snapshotComment?.body)
    const snapshotStatus = asString(snapshotPost?.status) ?? asString(snapshotComment?.status)
    const snapshotAnonymous = snapshotPost
      ? snapshotPost.is_anonymous === true
      : snapshotComment?.is_anonymous_author === true
    return {
      ...row,
      reporter_number: members.get(row.reporter_member_id)?.member_number ?? null,
      target_title: targetUsesSnapshot
        ? snapshotTitle || (snapshotPost ? "树洞／照片动态" : snapshotComment ? "评论／回复" : reportSnapshotProfile?.nickname || "社区身份")
        : post?.title || (post ? "树洞／照片动态" : comment ? "评论／回复" : profile?.nickname || "社区身份"),
      target_excerpt: targetUsesSnapshot ? snapshotBody : post?.body ?? comment?.body ?? null,
      target_status: post?.status ?? comment?.status ?? null,
      target_snapshot_status: targetUsesSnapshot ? snapshotStatus : null,
      target_snapshot_captured_at: targetUsesSnapshot ? capturedAt : null,
      target_uses_snapshot: targetUsesSnapshot,
      target_is_anonymous: targetUsesSnapshot
        ? snapshotAnonymous
        : post?.is_anonymous ?? comment?.is_anonymous_author ?? false,
      target_report_count: row.reported_post_id
        ? postReportCounts.get(row.reported_post_id) ?? 1
        : row.reported_comment_id
          ? commentReportCounts.get(row.reported_comment_id) ?? 1
          : row.reported_profile_id
            ? profileReportCounts.get(row.reported_profile_id) ?? 1
            : 1,
      target_images: reportSnapshotImages ?? (row.reported_post_id ? imagesByPost.get(row.reported_post_id) ?? [] : []),
      target_profile: reportSnapshotProfile ?? (profile ? {
        id: profile.id,
        nickname: profile.nickname,
        avatarKind: profile.avatar_kind,
        avatarPath: profile.avatar_path,
        presetAvatar: profile.preset_avatar,
        joinedAt: profile.joined_at,
      } : null),
    }
  })
}

function countTargetReports(rows: unknown[], key: string) {
  const counts = new Map<string, number>()
  for (const row of rows as Array<Record<string, string | null>>) {
    const id = row[key]
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}

export interface CommunityReportFilters {
  status?: CommunityReport["status"]
  reason?: CommunityReport["reason"]
  targetType?: CommunityReport["target_type"]
  contentType?: "treehole" | "photo" | "comment" | "reply" | "profile"
  reporterMemberNumber?: string
  from?: string
  to?: string
}

export async function fetchCommunityReports(filters: CommunityReportFilters = {}): Promise<{
  reports: CommunityReport[]
  setupRequired: boolean
}> {
  const admin = await requireAdmin()
  const supabase = createAdminClient()
  let query = supabase.from("community_reports").select("*").order("created_at", { ascending: false }).limit(100)
  if (filters.status) query = query.eq("status", filters.status)
  if (filters.reason) query = query.eq("reason", filters.reason)
  if (filters.targetType) query = query.eq("target_type", filters.targetType)
  if (filters.contentType === "profile") {
    query = query.eq("target_type", "profile")
  } else if (filters.contentType === "treehole" || filters.contentType === "photo") {
    const { data: posts, error: postsError } = await supabase
      .from("community_posts")
      .select("id")
      .eq("post_type", filters.contentType)
    if (postsError) throw postsError
    const ids = (posts ?? []).map((row: { id: string }) => row.id)
    if (!ids.length) return { reports: [], setupRequired: false }
    query = query.eq("target_type", "post").in("reported_post_id", ids)
  } else if (filters.contentType === "comment" || filters.contentType === "reply") {
    let commentsQuery = supabase.from("community_comments").select("id")
    commentsQuery = filters.contentType === "comment"
      ? commentsQuery.is("parent_comment_id", null)
      : commentsQuery.not("parent_comment_id", "is", null)
    const { data: comments, error: commentsError } = await commentsQuery
    if (commentsError) throw commentsError
    const ids = (comments ?? []).map((row: { id: string }) => row.id)
    if (!ids.length) return { reports: [], setupRequired: false }
    query = query.eq("target_type", "comment").in("reported_comment_id", ids)
  }
  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00+09:00`)
  if (filters.to) query = query.lt("created_at", `${filters.to}T23:59:59.999+09:00`)
  if (filters.reporterMemberNumber) {
    if (admin.role !== "super_admin") {
      return { reports: [], setupRequired: false }
    }
    const { data: reporter, error: reporterError } = await supabase
      .from("members")
      .select("id")
      .eq("member_number", filters.reporterMemberNumber.trim())
      .maybeSingle()
    if (reporterError) throw reporterError
    if (!reporter) return { reports: [], setupRequired: false }
    query = query.eq("reporter_member_id", reporter.id)
  }
  const { data, error } = await query
  if (isCommunitySchemaMissing(error)) return { reports: [], setupRequired: true }
  if (error) throw error
  return {
    reports: await hydrateCommunityReports((data ?? []) as RawCommunityReport[]),
    setupRequired: false,
  }
}

export async function fetchCommunityReportDetail(id: string): Promise<{
  report: CommunityReportDetail | null
  setupRequired: boolean
}> {
  const supabase = createAdminClient()
  const [{ data, error }, actionsResult] = await Promise.all([
    supabase.from("community_reports").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("community_moderation_actions")
      .select("id, action_type, internal_note, admin_user_id, created_at")
      .eq("report_id", id)
      .order("created_at", { ascending: false }),
  ])
  if (isCommunitySchemaMissing(error) || isCommunitySchemaMissing(actionsResult.error)) {
    return { report: null, setupRequired: true }
  }
  if (error) throw error
  if (actionsResult.error) throw actionsResult.error
  if (!data) return { report: null, setupRequired: false }
  const [report] = await hydrateCommunityReports([data as RawCommunityReport])
  return {
    setupRequired: false,
    report: {
      ...report,
      actions: (actionsResult.data ?? []) as CommunityReportDetail["actions"],
    },
  }
}

export async function fetchCommunityAdminMembers({
  afterJoinedAt,
  afterProfileId,
  limit = 500,
}: {
  afterJoinedAt?: string
  afterProfileId?: string
  limit?: number
} = {}): Promise<{
  members: CommunityAdminMember[]
  setupRequired: boolean
}> {
  const admin = await requireAdmin()
  const rpc = await communityRpcClient()
  const members: CommunityAdminMember[] = []
  let cursorJoinedAt = afterJoinedAt ?? null
  let cursorProfileId = afterProfileId ?? null

  while (members.length < limit) {
    const pageSize = Math.min(100, limit - members.length)
    const { data, error } = await rpc.rpc<CommunityAdminMember[]>("community_admin_list_members", {
      p_limit: pageSize,
      p_after_joined_at: cursorJoinedAt,
      p_after_profile_id: cursorProfileId,
    })
    if (isCommunitySchemaMissing(error)) return { members: [], setupRequired: true }
    if (error) throw error
    const page = (data ?? []).map((member) => admin.role === "super_admin"
      ? member
      : { ...member, member_number: null })
    members.push(...page)
    if (page.length < pageSize) break
    const last = page.at(-1)
    if (!last) break
    cursorJoinedAt = last.joined_at
    cursorProfileId = last.profile_id
  }

  return { members, setupRequired: false }
}

interface CommunityMemberRpcPayload {
  profile: {
    id: string
    nickname: string
    avatar_kind: CommunityAdminMember["avatar_kind"]
    avatar_path: string | null
    preset_avatar: string | null
    joined_at: string
  }
  member: {
    id: string | null
    member_number: string | null
    status: string
  }
  nickname_history: CommunityMemberDetail["nickname_history"]
  sanctions: Array<Omit<CommunitySanction, "is_active">>
  stats: CommunityMemberDetail["stats"]
}

export async function fetchCommunityAdminMember(profileId: string): Promise<{
  member: CommunityMemberDetail | null
  setupRequired: boolean
}> {
  const admin = await requireAdmin()
  const rpc = await communityRpcClient()
  const { data, error } = await rpc.rpc<CommunityMemberRpcPayload>("community_admin_get_member", {
    p_profile_id: profileId,
  })
  if (isCommunitySchemaMissing(error)) return { member: null, setupRequired: true }
  if (error?.message.includes("not found")) return { member: null, setupRequired: false }
  if (error) throw error
  if (!data) return { member: null, setupRequired: false }

  const now = Date.now()
  const sanctions: CommunitySanction[] = data.sanctions.map((sanction) => ({
    ...sanction,
    is_active:
      !sanction.revoked_at &&
      (sanction.sanction_type !== "mute" ||
        Boolean(sanction.ends_at) && new Date(sanction.ends_at as string).getTime() > now),
  }))
  const activeSanction = sanctions.find((sanction) => {
    if (sanction.revoked_at) return false
    if (sanction.sanction_type === "permanent_ban") return true
    return sanction.sanction_type === "mute" && Boolean(sanction.ends_at) && new Date(sanction.ends_at as string).getTime() > now
  })

  return {
    setupRequired: false,
    member: {
      profile_id: data.profile.id,
      nickname: data.profile.nickname,
      avatar_kind: data.profile.avatar_kind,
      avatar_path: data.profile.avatar_path,
      preset_avatar: data.profile.preset_avatar,
      joined_at: data.profile.joined_at,
      member_id: data.member.id,
      member_number: admin.role === "super_admin" ? data.member.member_number : null,
      member_status: data.member.status,
      active_sanction_type: activeSanction?.sanction_type ?? null,
      active_sanction_ends_at: activeSanction?.ends_at ?? null,
      nickname_history: data.nickname_history,
      sanctions,
      stats: data.stats,
    },
  }
}
