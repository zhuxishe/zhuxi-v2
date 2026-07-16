"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import {
  requireCommunityAccess,
  requireCommunityNotificationAccess,
  requireCommunityWrite,
} from "@/lib/auth/community"
import { callCommunityRpc, communityErrorMessage } from "@/lib/community/rpc"
import {
  validateComment,
  validatePhotoPost,
  validateTreehole,
} from "@/lib/community/validation"
import type {
  CommunityActionState,
  UploadedCommunityImage,
} from "@/lib/community/types"

function value(formData: FormData, key: string) {
  const entry = formData.get(key)
  return typeof entry === "string" ? entry : ""
}

function parseImages(raw: string): UploadedCommunityImage[] | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const images = parsed.filter((item): item is UploadedCommunityImage => {
      if (!item || typeof item !== "object") return false
      const row = item as Record<string, unknown>
      return typeof row.storagePath === "string"
        && typeof row.thumbnailPath === "string"
        && typeof row.width === "number"
        && typeof row.height === "number"
        && typeof row.byteSize === "number"
        && typeof row.mimeType === "string"
    })
    return images.length === parsed.length ? images : null
  } catch {
    return null
  }
}

function revalidateCommunity(postId?: string) {
  revalidatePath("/app/community")
  revalidatePath("/app/profile/community")
  if (postId) {
    revalidatePath(`/app/community/treehole/${postId}`)
    revalidatePath(`/app/community/photos/${postId}`)
  }
}

export async function createTreeholeAction(
  _previous: CommunityActionState,
  formData: FormData,
): Promise<CommunityActionState> {
  const { context, error: accessError } = await requireCommunityWrite()
  if (accessError) return { error: accessError }
  if (!context.profile) return { error: "请先设置社区昵称和头像" }

  const title = value(formData, "title")
  const body = value(formData, "body")
  const invalid = validateTreehole(title, body)
  if (invalid) return invalid

  const { data, error } = await callCommunityRpc<string>("community_create_treehole", {
    p_title: title.trim() || null,
    p_body: body.trim(),
    p_is_anonymous: value(formData, "identity") === "anonymous",
  })
  if (error || !data) return { error: communityErrorMessage(error, "发布失败，请稍后重试") }

  revalidateCommunity(data)
  redirect(`/app/community/treehole/${data}`)
}

export async function createPhotoPostAction(
  _previous: CommunityActionState,
  formData: FormData,
): Promise<CommunityActionState> {
  const { context, error: accessError } = await requireCommunityWrite()
  if (accessError) return { error: accessError }
  if (!context.profile) return { error: "请先设置社区昵称和头像" }

  const body = value(formData, "body")
  const images = parseImages(value(formData, "images"))
  if (!images) return { error: "照片信息无效，请重新选择" }
  const invalid = validatePhotoPost(body, images)
  if (invalid) return { error: invalid }

  const { data, error } = await callCommunityRpc<string>("community_create_photo_post", {
    p_body: body.trim() || null,
    p_images: images.map((image, index) => ({
      storage_path: image.storagePath,
      thumbnail_path: image.thumbnailPath,
      sort_order: index,
      width: image.width,
      height: image.height,
      byte_size: image.byteSize,
      mime_type: image.mimeType,
    })),
  })
  if (error || !data) return { error: communityErrorMessage(error, "发布失败，请稍后重试") }

  revalidateCommunity(data)
  redirect(`/app/community/photos/${data}`)
}

export async function updateCommunityPostAction(
  postId: string,
  postType: "treehole" | "photo",
  _previous: CommunityActionState,
  formData: FormData,
): Promise<CommunityActionState> {
  await requireCommunityAccess()
  const title = value(formData, "title")
  const body = value(formData, "body")
  let images: UploadedCommunityImage[] | null = null

  if (postType === "treehole") {
    const invalid = validateTreehole(title, body)
    if (invalid) return invalid
  } else {
    images = parseImages(value(formData, "images"))
    if (!images) return { error: "照片信息无效，请重新选择" }
    const invalid = validatePhotoPost(body, images)
    if (invalid) return { error: invalid }
  }

  const { error } = await callCommunityRpc<null>("community_update_post", {
    p_post_id: postId,
    p_title: postType === "treehole" ? title.trim() || null : null,
    p_body: body.trim() || null,
    p_images: postType === "photo" ? images!.map((image, index) => ({
      storage_path: image.storagePath,
      thumbnail_path: image.thumbnailPath,
      sort_order: index,
      width: image.width,
      height: image.height,
      byte_size: image.byteSize,
      mime_type: image.mimeType,
    })) : null,
  })
  if (error) return { error: communityErrorMessage(error, "保存失败，请稍后重试") }
  revalidateCommunity(postId)
  redirect(`/app/community/${postType === "photo" ? "photos" : "treehole"}/${postId}`)
}

export async function toggleCommunityLikeAction(postId: string) {
  const { error: accessError } = await requireCommunityWrite()
  if (accessError) return { success: false, error: accessError }
  const { data, error } = await callCommunityRpc<Array<{ liked: boolean; like_count: number }>>(
    "community_toggle_post_like",
    { p_post_id: postId },
  )
  if (error) return { success: false, error: communityErrorMessage(error) }
  revalidateCommunity(postId)
  const result = Array.isArray(data) ? data[0] : data
  return { success: true, liked: result?.liked ?? false, likeCount: result?.like_count ?? 0 }
}

export async function addCommunityCommentAction(
  postId: string,
  parentCommentId: string | null,
  body: string,
) {
  const { context, error: accessError } = await requireCommunityWrite()
  if (accessError) return { success: false, error: accessError }
  if (!context.profile) return { success: false, error: "请先设置社区昵称和头像" }
  const invalid = validateComment(body)
  if (invalid) return { success: false, error: invalid }
  const { data, error } = await callCommunityRpc<string>("community_add_comment", {
    p_post_id: postId,
    p_body: body.trim(),
    p_parent_comment_id: parentCommentId,
  })
  if (error) return { success: false, error: communityErrorMessage(error, "评论失败，请稍后重试") }
  revalidateCommunity(postId)
  return { success: true, id: data }
}

export async function deleteCommunityPostAction(postId: string) {
  await requireCommunityAccess()
  const { error } = await callCommunityRpc<null>("community_delete_post", { p_post_id: postId })
  if (error) return { success: false, error: communityErrorMessage(error, "删除失败") }
  revalidateCommunity(postId)
  return { success: true }
}

export async function deleteCommunityCommentAction(commentId: string, postId: string) {
  await requireCommunityAccess()
  const { error } = await callCommunityRpc<null>("community_delete_comment", { p_comment_id: commentId })
  if (error) return { success: false, error: communityErrorMessage(error, "删除失败") }
  revalidateCommunity(postId)
  return { success: true }
}

export async function updateCommunityCommentAction(commentId: string, postId: string, body: string) {
  await requireCommunityAccess()
  const invalid = validateComment(body)
  if (invalid) return { success: false, error: invalid }
  const { error } = await callCommunityRpc<null>("community_update_comment", {
    p_comment_id: commentId,
    p_body: body.trim(),
  })
  if (error) return { success: false, error: communityErrorMessage(error, "保存失败") }
  revalidateCommunity(postId)
  return { success: true }
}

export async function reportCommunityContentAction(
  targetType: "post" | "comment" | "profile",
  targetId: string,
  reason: string,
  details: string,
) {
  await requireCommunityAccess()
  const allowed = new Set(["harassment", "privacy", "spam", "inappropriate", "other"])
  if (!allowed.has(reason)) return { success: false, error: "请选择举报原因" }
  if (details.length > 2000) return { success: false, error: "补充说明不能超过 2,000 个字符" }
  const { error } = await callCommunityRpc<string>("community_report_content", {
    p_target_type: targetType,
    p_target_id: targetId,
    p_reason: reason,
    p_details: details.trim() || null,
  })
  if (error) return { success: false, error: communityErrorMessage(error, "举报提交失败") }
  revalidateCommunity(targetType === "post" ? targetId : undefined)
  return { success: true }
}

export async function hideCommunityPostAction(postId: string) {
  await requireCommunityAccess()
  const { error } = await callCommunityRpc<null>("community_hide_post", { p_post_id: postId })
  if (error) return { success: false, error: communityErrorMessage(error, "隐藏失败") }
  revalidateCommunity(postId)
  return { success: true }
}

export async function unhideCommunityPostAction(postId: string) {
  await requireCommunityAccess()
  const { error } = await callCommunityRpc<null>("community_unhide_post", { p_post_id: postId })
  if (error) return { success: false, error: communityErrorMessage(error, "恢复失败") }
  revalidateCommunity(postId)
  return { success: true }
}

export async function blockCommunityProfileAction(profileId: string) {
  await requireCommunityAccess()
  const { error } = await callCommunityRpc<null>("community_block_profile", { p_profile_id: profileId })
  if (error) return { success: false, error: communityErrorMessage(error, "屏蔽失败") }
  revalidateCommunity()
  return { success: true }
}

export async function unblockCommunityProfileAction(profileId: string) {
  await requireCommunityAccess()
  const { error } = await callCommunityRpc<null>("community_unblock_profile", { p_profile_id: profileId })
  if (error) return { success: false, error: communityErrorMessage(error, "解除屏蔽失败") }
  revalidateCommunity()
  return { success: true }
}

export async function markCommunityNotificationReadAction(notificationId: string) {
  await requireCommunityNotificationAccess()
  const { error } = await callCommunityRpc<null>("community_mark_notification_read", {
    p_notification_id: notificationId,
  })
  if (error) return { success: false }
  revalidatePath("/app", "layout")
  return { success: true }
}

export async function markAllCommunityNotificationsReadAction() {
  await requireCommunityNotificationAccess()
  const { error } = await callCommunityRpc<number>("community_mark_all_notifications_read")
  if (error) return { success: false }
  revalidatePath("/app", "layout")
  return { success: true }
}
