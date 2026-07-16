import { redirect } from "next/navigation"
import { requirePlayer, type PlayerInfo } from "@/lib/auth/player"
import { createAdminClient } from "@/lib/supabase/admin"
import type {
  CommunityContext,
  CommunityProfile,
  CommunityRestriction,
} from "@/lib/community/types"

interface ProfileMemberRow {
  profile_id: string
}

interface ProfileRow {
  id: string
  nickname: string
  avatar_kind: CommunityProfile["avatarKind"]
  avatar_path: string | null
  preset_avatar: string | null
  joined_at: string
}

interface SanctionRow {
  sanction_type: CommunityRestriction["type"]
  reason: string
  starts_at: string
  ends_at: string | null
  revoked_at: string | null
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

export async function getCommunityContext(player: PlayerInfo): Promise<CommunityContext> {
  const db = createAdminClient()
  const now = Date.now()

  const [mappingResult, sanctionsResult] = await Promise.all([
    db
      .schema("private")
      .from("community_profile_members")
      .select("profile_id")
      .eq("member_id", player.memberId)
      .maybeSingle<ProfileMemberRow>(),
    db
      .from("community_sanctions")
      .select("sanction_type, reason, starts_at, ends_at, revoked_at")
      .eq("member_id", player.memberId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
  ])

  if (mappingResult.error) {
    console.error("[community access] profile mapping lookup failed", mappingResult.error)
    throw new Error("Community access could not be verified")
  }
  if (sanctionsResult.error) {
    console.error("[community access] sanctions lookup failed", sanctionsResult.error)
    throw new Error("Community access could not be verified")
  }

  const mapping = mappingResult.data
  const sanctions = sanctionsResult.data

  let profile: CommunityProfile | null = null
  if (mapping?.profile_id) {
    const { data } = await db
      .from("community_profiles")
      .select("id, nickname, avatar_kind, avatar_path, preset_avatar, joined_at")
      .eq("id", mapping.profile_id)
      .maybeSingle<ProfileRow>()
    if (data) profile = mapProfile(data)
  }

  const active = ((sanctions ?? []) as SanctionRow[]).find((row) => {
    if (row.sanction_type === "permanent_ban") return true
    if (row.sanction_type !== "mute") return false
    return Boolean(row.ends_at && new Date(row.ends_at).getTime() > now)
  })

  const restriction = active
    ? {
        type: active.sanction_type,
        reason: active.reason,
        startsAt: active.starts_at,
        endsAt: active.ends_at,
      }
    : null

  return {
    memberId: player.memberId,
    profile,
    restriction,
    canWrite: !restriction || restriction.type === "warning",
  }
}

export async function requireCommunityAccess(): Promise<CommunityContext> {
  const player = await requirePlayer()
  const context = await getCommunityContext(player)
  if (context.restriction?.type === "permanent_ban") {
    redirect("/app?community=blocked")
  }
  return context
}

/**
 * Security and sanction notifications remain available after a permanent ban.
 * Content routes must continue to use requireCommunityAccess instead.
 */
export async function requireCommunityNotificationAccess(): Promise<CommunityContext> {
  const player = await requirePlayer()
  return getCommunityContext(player)
}

export async function requireCommunityWrite(): Promise<
  | { context: CommunityContext; error: null }
  | { context: CommunityContext; error: string }
> {
  const context = await requireCommunityAccess()
  if (!context.canWrite) {
    const until = context.restriction?.endsAt
      ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(context.restriction.endsAt))
      : "管理员解除限制前"
    return { context, error: `当前处于社区禁言状态，${until}无法发布或互动。` }
  }
  return { context, error: null }
}
