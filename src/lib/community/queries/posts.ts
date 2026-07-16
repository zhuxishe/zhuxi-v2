import { createAdminClient } from "@/lib/supabase/admin"
import type {
  CommunityComment,
  CommunityContentStatus,
  CommunityPost,
  CommunityPostImage,
  CommunityPostType,
  CommunityProfile,
} from "@/lib/community/types"

interface PostRow {
  id: string
  post_type: CommunityPostType
  author_profile_id: string | null
  title: string | null
  body: string | null
  is_anonymous: boolean
  status: CommunityContentStatus
  like_count: number
  comment_count: number
  published_at: string
  edited_at: string | null
}

interface ProfileRow {
  id: string
  nickname: string
  avatar_kind: CommunityProfile["avatarKind"]
  avatar_path: string | null
  preset_avatar: string | null
  joined_at: string
}

interface ImageRow {
  id: string
  post_id: string
  storage_path: string
  thumbnail_path: string
  sort_order: number
  width: number | null
  height: number | null
  byte_size: number | null
  mime_type: string
}

interface CommentRow {
  id: string
  post_id: string
  parent_comment_id: string | null
  author_profile_id: string | null
  is_anonymous_author: boolean
  body: string | null
  status: CommunityContentStatus
  removal_source: "author" | "admin" | null
  edited_at: string | null
  created_at: string
}

interface AuthorMapRow {
  post_id?: string
  comment_id?: string
  member_id: string | null
}

function mapProfile(row: ProfileRow): CommunityProfile {
  return {
    id: row.id,
    nickname: row.nickname,
    avatarKind: row.avatar_kind,
    avatarPath: row.avatar_path,
    presetAvatar: row.preset_avatar,
    joinedAt: row.joined_at,
  }
}

function mapImage(row: ImageRow): CommunityPostImage {
  return {
    id: row.id,
    storagePath: row.storage_path,
    thumbnailPath: row.thumbnail_path,
    sortOrder: row.sort_order,
    width: row.width,
    height: row.height,
    byteSize: row.byte_size,
    mimeType: row.mime_type,
  }
}

export async function fetchCommunityPosts(options: {
  memberId: string
  postType: CommunityPostType
  limit: number
  sort?: "latest" | "discussed"
  authorProfileId?: string
}): Promise<CommunityPost[]> {
  const db = createAdminClient()
  const fetchLimit = Math.max(options.limit * 4, 30)
  let query = db
    .from("community_posts")
    .select("id, post_type, author_profile_id, title, body, is_anonymous, status, like_count, comment_count, published_at, edited_at")
    .eq("status", "published")
    .eq("post_type", options.postType)

  if (options.authorProfileId) query = query.eq("author_profile_id", options.authorProfileId)
  if (options.sort === "discussed") {
    query = query.order("comment_count", { ascending: false }).order("published_at", { ascending: false })
  } else {
    query = query.order("published_at", { ascending: false })
  }

  const [postsResult, hiddenResult, blockedResult] = await Promise.all([
    query.limit(fetchLimit),
    db.from("community_user_hides").select("post_id").eq("member_id", options.memberId),
    db.from("community_blocks").select("blocked_profile_id").eq("blocker_member_id", options.memberId),
  ])
  if (postsResult.error) throw new Error(`Failed to load community posts: ${postsResult.error.message}`)
  if (hiddenResult.error || blockedResult.error) {
    throw new Error("Failed to verify community visibility filters")
  }

  const hiddenIds = new Set((hiddenResult.data ?? []).map((row: { post_id: string }) => row.post_id))
  const blockedProfiles = new Set((blockedResult.data ?? []).map((row: { blocked_profile_id: string }) => row.blocked_profile_id))
  const visibleRows = ((postsResult.data ?? []) as PostRow[])
    .filter((row) => !hiddenIds.has(row.id))
    .filter((row) => row.is_anonymous || !row.author_profile_id || !blockedProfiles.has(row.author_profile_id))
    .slice(0, options.limit)

  return hydratePosts(visibleRows, options.memberId)
}

async function hydratePosts(rows: PostRow[], memberId: string): Promise<CommunityPost[]> {
  if (rows.length === 0) return []
  const db = createAdminClient()
  const postIds = rows.map((row) => row.id)
  const profileIds = rows.flatMap((row) => row.author_profile_id ? [row.author_profile_id] : [])

  const [imagesResult, commentsResult, authorsResult, likesResult, reportsResult, blocksResult] = await Promise.all([
    db.from("community_post_images").select("id, post_id, storage_path, thumbnail_path, sort_order, width, height, byte_size, mime_type").in("post_id", postIds).order("sort_order"),
    db.from("community_comments").select("id, post_id, parent_comment_id, author_profile_id, is_anonymous_author, body, status, removal_source, edited_at, created_at").in("post_id", postIds).eq("status", "published").is("parent_comment_id", null).order("created_at", { ascending: false }).limit(postIds.length * 6),
    db.schema("private").from("community_post_authors").select("post_id, member_id").in("post_id", postIds),
    db.from("community_likes").select("post_id").eq("member_id", memberId).in("post_id", postIds),
    db.from("community_reports").select("reported_post_id").eq("reporter_member_id", memberId).eq("status", "pending").in("reported_post_id", postIds),
    db.from("community_blocks").select("blocked_profile_id").eq("blocker_member_id", memberId),
  ])

  if (blocksResult.error) {
    throw new Error("Failed to verify blocked community profiles")
  }

  const blockedProfiles = new Set((blocksResult.data ?? []).map((row: { blocked_profile_id: string }) => row.blocked_profile_id))
  const commentRows = ((commentsResult.data ?? []) as CommentRow[]).filter(
    (row) => row.is_anonymous_author || !row.author_profile_id || !blockedProfiles.has(row.author_profile_id),
  )
  for (const row of commentRows) if (row.author_profile_id) profileIds.push(row.author_profile_id)
  const uniqueProfileIds = [...new Set(profileIds)]
  const profilesResult = uniqueProfileIds.length
    ? await db.from("community_profiles").select("id, nickname, avatar_kind, avatar_path, preset_avatar, joined_at").in("id", uniqueProfileIds)
    : { data: [] }
  const profiles = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((row) => [row.id, mapProfile(row)]))

  const imagesByPost = new Map<string, CommunityPostImage[]>()
  for (const image of (imagesResult.data ?? []) as ImageRow[]) {
    const list = imagesByPost.get(image.post_id) ?? []
    list.push(mapImage(image))
    imagesByPost.set(image.post_id, list)
  }

  const commentsByPost = new Map<string, CommunityComment[]>()
  for (const comment of commentRows) {
    const list = commentsByPost.get(comment.post_id) ?? []
    if (list.length < 2) {
      list.push({
        id: comment.id,
        postId: comment.post_id,
        parentCommentId: null,
        author: comment.is_anonymous_author ? null : profiles.get(comment.author_profile_id ?? "") ?? null,
        isAnonymousAuthor: comment.is_anonymous_author,
        body: comment.body,
        status: comment.status,
        removalSource: comment.removal_source,
        editedAt: comment.edited_at,
        createdAt: comment.created_at,
      })
    }
    commentsByPost.set(comment.post_id, list)
  }
  for (const list of commentsByPost.values()) list.reverse()

  const mine = new Set(((authorsResult.data ?? []) as AuthorMapRow[]).filter((row) => row.member_id === memberId).map((row) => row.post_id!))
  const liked = new Set((likesResult.data ?? []).map((row: { post_id: string }) => row.post_id))
  const reported = new Set((reportsResult.data ?? []).flatMap((row: { reported_post_id: string | null }) => row.reported_post_id ? [row.reported_post_id] : []))

  return rows.map((row) => ({
    id: row.id,
    postType: row.post_type,
    author: row.is_anonymous ? null : profiles.get(row.author_profile_id ?? "") ?? null,
    title: row.title,
    body: row.body,
    isAnonymous: row.is_anonymous,
    status: row.status,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    publishedAt: row.published_at,
    editedAt: row.edited_at,
    images: imagesByPost.get(row.id) ?? [],
    commentsPreview: commentsByPost.get(row.id) ?? [],
    likedByMe: liked.has(row.id),
    isMine: mine.has(row.id),
    isReported: reported.has(row.id),
  }))
}

export async function fetchCommunityPostsByIds(
  postIds: string[],
  memberId: string,
  respectViewerFilters = true,
): Promise<CommunityPost[]> {
  if (postIds.length === 0) return []
  const db = createAdminClient()
  const { data, error } = await db
    .from("community_posts")
    .select("id, post_type, author_profile_id, title, body, is_anonymous, status, like_count, comment_count, published_at, edited_at")
    .in("id", postIds)
    .eq("status", "published")
  if (error) throw new Error(`Failed to load community posts: ${error.message}`)
  const order = new Map(postIds.map((id, index) => [id, index]))
  let rows = (data ?? []) as PostRow[]
  if (respectViewerFilters) {
    const [hiddenResult, blockedResult] = await Promise.all([
      db.from("community_user_hides").select("post_id").eq("member_id", memberId).in("post_id", postIds),
      db.from("community_blocks").select("blocked_profile_id").eq("blocker_member_id", memberId),
    ])
    if (hiddenResult.error || blockedResult.error) {
      throw new Error("Failed to verify community visibility filters")
    }
    const hiddenIds = new Set((hiddenResult.data ?? []).map((row: { post_id: string }) => row.post_id))
    const blockedProfileIds = new Set((blockedResult.data ?? []).map((row: { blocked_profile_id: string }) => row.blocked_profile_id))
    rows = rows
      .filter((row) => !hiddenIds.has(row.id))
      .filter((row) => row.is_anonymous || !row.author_profile_id || !blockedProfileIds.has(row.author_profile_id))
  }
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  return hydratePosts(rows, memberId)
}

export async function fetchCommunityPostDetail(
  postId: string,
  memberId: string,
  commentLimit: number,
  targetCommentId?: string,
): Promise<{ post: CommunityPost; comments: CommunityComment[]; hasMoreComments: boolean } | null> {
  const db = createAdminClient()
  const { data: post } = await db
    .from("community_posts")
    .select("id, post_type, author_profile_id, title, body, is_anonymous, status, like_count, comment_count, published_at, edited_at")
    .eq("id", postId)
    .eq("status", "published")
    .maybeSingle<PostRow>()
  if (!post) return null

  const [hiddenResult, blockedResult] = await Promise.all([
    db.from("community_user_hides").select("post_id", { count: "exact", head: true }).eq("member_id", memberId).eq("post_id", postId),
    post.is_anonymous || !post.author_profile_id
      ? Promise.resolve({ count: 0, error: null })
      : db.from("community_blocks").select("blocked_profile_id", { count: "exact", head: true }).eq("blocker_member_id", memberId).eq("blocked_profile_id", post.author_profile_id),
  ])
  if (hiddenResult.error || blockedResult.error) {
    throw new Error("Failed to verify community post visibility")
  }
  if (hiddenResult.count || blockedResult.count) return null

  const [hydrated] = await hydratePosts([post], memberId)
  const { data: topLevelRows, error } = await db
    .from("community_comments")
    .select("id, post_id, parent_comment_id, author_profile_id, is_anonymous_author, body, status, removal_source, edited_at, created_at")
    .eq("post_id", postId)
    .in("status", ["published", "deleted", "hidden"])
    .is("parent_comment_id", null)
    .order("created_at", { ascending: true })
    .limit(commentLimit + 1)
  if (error) throw new Error(`Failed to load comments: ${error.message}`)

  const selectedTopLevel = ((topLevelRows ?? []) as CommentRow[]).slice(0, commentLimit)
  if (targetCommentId) {
    const targetResult = await db
      .from("community_comments")
      .select("id, post_id, parent_comment_id, author_profile_id, is_anonymous_author, body, status, removal_source, edited_at, created_at")
      .eq("id", targetCommentId)
      .eq("post_id", postId)
      .in("status", ["published", "deleted", "hidden"])
      .maybeSingle<CommentRow>()
    if (targetResult.error) throw new Error(`Failed to locate notification comment: ${targetResult.error.message}`)
    const target = targetResult.data
    const rootId = target?.parent_comment_id ?? target?.id
    if (rootId && !selectedTopLevel.some((row) => row.id === rootId)) {
      if (target && !target.parent_comment_id) {
        selectedTopLevel.push(target)
      } else {
        const rootResult = await db
          .from("community_comments")
          .select("id, post_id, parent_comment_id, author_profile_id, is_anonymous_author, body, status, removal_source, edited_at, created_at")
          .eq("id", rootId)
          .eq("post_id", postId)
          .is("parent_comment_id", null)
          .in("status", ["published", "deleted", "hidden"])
          .maybeSingle<CommentRow>()
        if (rootResult.error) throw new Error(`Failed to locate notification comment thread: ${rootResult.error.message}`)
        if (rootResult.data) selectedTopLevel.push(rootResult.data)
      }
    }
  }
  const topLevelIds = selectedTopLevel.map((row) => row.id)
  const repliesResult = topLevelIds.length
    ? await db
        .from("community_comments")
        .select("id, post_id, parent_comment_id, author_profile_id, is_anonymous_author, body, status, removal_source, edited_at, created_at")
        .in("parent_comment_id", topLevelIds)
        .in("status", ["published", "deleted", "hidden"])
        .order("created_at", { ascending: true })
    : { data: [], error: null }
  if (repliesResult.error) throw new Error(`Failed to load comment replies: ${repliesResult.error.message}`)

  const comments = await hydrateComments(
    [...selectedTopLevel, ...((repliesResult.data ?? []) as CommentRow[])],
    memberId,
    selectedTopLevel.length,
  )
  return {
    post: hydrated,
    comments,
    hasMoreComments: (topLevelRows?.length ?? 0) > commentLimit,
  }
}

async function hydrateComments(rows: CommentRow[], memberId: string, topLevelLimit: number) {
  const db = createAdminClient()
  const profileIds = [...new Set(rows.flatMap((row) => row.author_profile_id ? [row.author_profile_id] : []))]
  const commentIds = rows.map((row) => row.id)
  const [profilesResult, authorsResult, blocksResult] = await Promise.all([
    profileIds.length
      ? db.from("community_profiles").select("id, nickname, avatar_kind, avatar_path, preset_avatar, joined_at").in("id", profileIds)
      : Promise.resolve({ data: [] }),
    commentIds.length
      ? db.schema("private").from("community_comment_authors").select("comment_id, member_id").in("comment_id", commentIds)
      : Promise.resolve({ data: [] }),
    db.from("community_blocks").select("blocked_profile_id").eq("blocker_member_id", memberId),
  ])
  if (blocksResult.error) {
    throw new Error("Failed to verify blocked community profiles")
  }
  const profiles = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((row) => [row.id, mapProfile(row)]))
  const mine = new Set(((authorsResult.data ?? []) as AuthorMapRow[]).filter((row) => row.member_id === memberId).map((row) => row.comment_id!))
  const blockedProfiles = new Set((blocksResult.data ?? []).map((row: { blocked_profile_id: string }) => row.blocked_profile_id))
  const mapped = new Map<string, CommunityComment>()
  const visibleRows = rows.filter((row) => row.is_anonymous_author || !row.author_profile_id || !blockedProfiles.has(row.author_profile_id))
  for (const row of visibleRows) {
    mapped.set(row.id, {
      id: row.id,
      postId: row.post_id,
      parentCommentId: row.parent_comment_id,
      author: row.is_anonymous_author ? null : profiles.get(row.author_profile_id ?? "") ?? null,
      isAnonymousAuthor: row.is_anonymous_author,
      body: row.status === "published" ? row.body : null,
      status: row.status,
      removalSource: row.removal_source,
      editedAt: row.edited_at,
      createdAt: row.created_at,
      isMine: mine.has(row.id),
      replies: [],
    })
  }

  const topLevel: CommunityComment[] = []
  for (const row of visibleRows) {
    const item = mapped.get(row.id)!
    if (row.parent_comment_id) mapped.get(row.parent_comment_id)?.replies?.push(item)
    else if (topLevel.length < topLevelLimit) topLevel.push(item)
  }
  return topLevel
}
