import { COMMUNITY_AVATAR_BUCKET, COMMUNITY_MEDIA_BUCKET } from "./constants"
import type { CommunityProfile } from "./types"

export function communityMediaUrl(
  path: string,
  thumbnail = false,
  audience: "member" | "admin" = "member",
) {
  const params = new URLSearchParams({ bucket: COMMUNITY_MEDIA_BUCKET, path })
  if (thumbnail) params.set("thumbnail", "1")
  if (audience === "admin") params.set("audience", "admin")
  return `/api/community/media?${params.toString()}`
}

export function communityAvatarUrl(profile: CommunityProfile | null, audience: "member" | "admin" = "member"): string | null {
  if (!profile || profile.avatarKind !== "upload") return null
  if (!profile.avatarPath) return null
  const params = new URLSearchParams({ bucket: COMMUNITY_AVATAR_BUCKET, path: profile.avatarPath })
  if (audience === "admin") params.set("audience", "admin")
  return `/api/community/media?${params.toString()}`
}
