import { createAdminClient } from "@/lib/supabase/admin"
import { fetchCommunityMemberProfileMetrics } from "@/lib/profile/queries"
import { fetchCommunityPosts } from "./posts"
import type { CommunityPost, CommunityProfile } from "@/lib/community/types"
import type { CommunityMemberProfileMetrics } from "@/lib/profile/types"

interface ProfileRow {
  id: string
  nickname: string
  avatar_kind: CommunityProfile["avatarKind"]
  avatar_path: string | null
  preset_avatar: string | null
  joined_at: string
}

export async function fetchCommunityPublicProfile(options: {
  profileId: string
  viewerMemberId: string
}): Promise<{
  profile: CommunityProfile
  metrics: CommunityMemberProfileMetrics
  treeholes: CommunityPost[]
  photos: CommunityPost[]
} | null> {
  const db = createAdminClient()
  const blockedResult = await db
    .from("community_blocks")
    .select("blocked_profile_id", { count: "exact", head: true })
    .eq("blocker_member_id", options.viewerMemberId)
    .eq("blocked_profile_id", options.profileId)
  if (blockedResult.error) {
    throw new Error("Failed to verify blocked community profile")
  }
  if (blockedResult.count) return null
  const { data, error } = await db
    .from("community_profiles")
    .select("id, nickname, avatar_kind, avatar_path, preset_avatar, joined_at")
    .eq("id", options.profileId)
    .maybeSingle<ProfileRow>()
  if (error) throw new Error(`Failed to load community profile: ${error.message}`)
  if (!data) return null

  const profile: CommunityProfile = {
    id: data.id,
    nickname: data.nickname,
    avatarKind: data.avatar_kind,
    avatarPath: data.avatar_path,
    presetAvatar: data.preset_avatar,
    joinedAt: data.joined_at,
  }
  const [metrics, treeholes, photos] = await Promise.all([
    fetchCommunityMemberProfileMetrics(data.id),
    fetchCommunityPosts({
      memberId: options.viewerMemberId,
      postType: "treehole",
      limit: 20,
      authorProfileId: data.id,
    }),
    fetchCommunityPosts({
      memberId: options.viewerMemberId,
      postType: "photo",
      limit: 20,
      authorProfileId: data.id,
    }),
  ])
  if (!metrics) return null
  return { profile, metrics, treeholes, photos }
}
