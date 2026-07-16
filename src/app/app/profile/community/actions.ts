"use server"

import { revalidatePath } from "next/cache"
import { requireCommunityAccess } from "@/lib/auth/community"
import { callCommunityRpc, communityErrorMessage } from "@/lib/community/rpc"
import { isPresetAvatar, validateNickname } from "@/lib/community/validation"
import type { CommunityActionState } from "@/lib/community/types"

function value(formData: FormData, key: string) {
  const entry = formData.get(key)
  return typeof entry === "string" ? entry : ""
}

export async function saveCommunityProfileAction(
  _previous: CommunityActionState,
  formData: FormData,
): Promise<CommunityActionState> {
  await requireCommunityAccess()
  const nickname = value(formData, "nickname")
  const invalid = validateNickname(nickname)
  if (invalid) return { error: invalid, fieldErrors: { nickname: invalid } }

  const avatarKind = value(formData, "avatarKind")
  const avatarPath = value(formData, "avatarPath") || null
  const presetAvatar = value(formData, "presetAvatar") || null
  if (!new Set(["default", "preset", "upload"]).has(avatarKind)) {
    return { error: "请选择社区头像" }
  }
  if (avatarKind === "preset" && (!presetAvatar || !isPresetAvatar(presetAvatar))) {
    return { error: "请选择有效的预设头像" }
  }
  if (avatarKind === "upload" && !avatarPath) return { error: "请先上传头像" }

  const { error } = await callCommunityRpc("community_upsert_profile", {
    p_nickname: nickname.trim(),
    p_avatar_kind: avatarKind,
    p_avatar_path: avatarKind === "upload" ? avatarPath : null,
    p_preset_avatar: avatarKind === "preset" ? presetAvatar : null,
  })
  if (error) return { error: communityErrorMessage(error, "社区身份保存失败") }
  revalidatePath("/app", "layout")
  revalidatePath("/app/profile/community")
  revalidatePath("/app/community")
  return { success: true }
}

export async function saveCommunityNotificationPreferencesAction(
  _previous: CommunityActionState,
  formData: FormData,
): Promise<CommunityActionState> {
  await requireCommunityAccess()
  const { error } = await callCommunityRpc("community_update_notification_preferences", {
    p_likes_enabled: formData.get("likes") === "on",
    p_comments_enabled: formData.get("comments") === "on",
    p_replies_enabled: formData.get("replies") === "on",
    p_announcements_enabled: formData.get("announcements") === "on",
  })
  if (error) return { error: communityErrorMessage(error, "通知设置保存失败") }
  revalidatePath("/app/profile/community")
  return { success: true }
}
