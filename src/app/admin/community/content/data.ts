import type {
  CommunityAdminContentFilters,
  CommunityAdminContentRow,
} from "@/components/admin/community/types"
import {
  decodeCommunityContentCursor,
  encodeCommunityContentCursor,
  jstEndExclusive,
  jstStart,
} from "@/lib/community/admin-content"
import { createAdminClient } from "@/lib/supabase/admin"

const PAGE_SIZE = 50

interface RpcContentRow {
  id: string
  target_type: "post" | "comment"
  content_type: CommunityAdminContentRow["contentType"]
  post_id: string
  parent_comment_id: string | null
  status: CommunityAdminContentRow["status"]
  is_anonymous: boolean
  author_profile_id: string | null
  author_nickname: string | null
  title: string | null
  body: string | null
  parent_post_type: "treehole" | "photo"
  parent_post_title: string | null
  image_count: number
  like_count: number | null
  comment_count: number | null
  pending_report_count: number
  total_report_count: number
  occurred_at: string
  edited_at: string | null
  source_rank: number
}

type CommunityRpcClient = {
  rpc<T>(name: string, args: Record<string, unknown>): PromiseLike<{
    data: T | null
    error: { code?: string; message: string } | null
  }>
}

function mapRow(
  row: RpcContentRow,
  images: CommunityAdminContentRow["images"] = [],
): CommunityAdminContentRow {
  return {
    id: row.id,
    targetType: row.target_type,
    contentType: row.content_type,
    postId: row.post_id,
    parentCommentId: row.parent_comment_id,
    status: row.status,
    isAnonymous: row.is_anonymous,
    authorProfileId: row.author_profile_id,
    authorNickname: row.author_nickname,
    title: row.title,
    body: row.body,
    parentPostType: row.parent_post_type,
    parentPostTitle: row.parent_post_title,
    imageCount: Number(row.image_count),
    images,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    pendingReportCount: Number(row.pending_report_count),
    totalReportCount: Number(row.total_report_count),
    occurredAt: row.occurred_at,
    editedAt: row.edited_at,
    sourceRank: row.source_rank,
  }
}

export async function fetchCommunityAdminContent(adminId: string, filters: CommunityAdminContentFilters) {
  const cursor = decodeCommunityContentCursor(filters.cursor)
  const db = createAdminClient()
  const client = db as unknown as CommunityRpcClient
  const { data, error } = await client.rpc<RpcContentRow[]>("community_admin_list_content", {
    p_content_type: filters.type ?? null,
    p_status: filters.status ?? null,
    p_is_anonymous: filters.anonymous ?? null,
    p_report_state: filters.reports ?? null,
    p_query: filters.query ?? null,
    p_from: jstStart(filters.from),
    p_to: jstEndExclusive(filters.to),
    p_before_at: cursor?.at ?? null,
    p_before_rank: cursor?.rank ?? null,
    p_before_id: cursor?.id ?? null,
    p_limit: PAGE_SIZE,
    p_admin_user_id: adminId,
  })

  if (error?.code === "PGRST202" || error?.message.includes("community_admin_list_content")) {
    return { rows: [], nextCursor: null, setupRequired: true }
  }
  if (error) throw new Error(error.message)

  const pageData = (data ?? []).slice(0, PAGE_SIZE)
  const photoPostIds = [...new Set(pageData
    .filter((row) => row.content_type === "photo")
    .map((row) => row.post_id))]
  const imagesByPost = new Map<string, CommunityAdminContentRow["images"]>()
  if (photoPostIds.length > 0) {
    const { data: images, error: imageError } = await db
      .from("community_post_images")
      .select("id, post_id, storage_path, thumbnail_path, sort_order")
      .in("post_id", photoPostIds)
      .order("sort_order")
    if (imageError) throw new Error(imageError.message)
    for (const image of images ?? []) {
      const current = imagesByPost.get(image.post_id) ?? []
      current.push({
        id: image.id,
        storagePath: image.storage_path,
        thumbnailPath: image.thumbnail_path,
        sortOrder: image.sort_order,
      })
      imagesByPost.set(image.post_id, current)
    }
  }

  const mapped = (data ?? []).map((row) => mapRow(row, imagesByPost.get(row.post_id)))
  const rows = mapped.slice(0, PAGE_SIZE)
  const last = rows.at(-1)
  const nextCursor = mapped.length > PAGE_SIZE && last
    ? encodeCommunityContentCursor({ at: last.occurredAt, rank: last.sourceRank, id: last.id })
    : null

  return { rows, nextCursor, setupRequired: false }
}
