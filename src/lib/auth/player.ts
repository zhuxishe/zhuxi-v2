import { createClient } from "@/lib/supabase/server"
import {
  ensureMyMemberRecord,
  getMemberMasterDiagnostic,
  resolveMemberRouteSnapshot,
} from "@/lib/member-master/rpc"
import { redirect } from "next/navigation"
import { cache } from "react"

export interface PlayerInfo {
  memberId: string
  memberNumber: string | null
  name: string
  status: string
  accountStatus: string
  profileStage: string
  onboardingStep: number
  lastProfileSavedAt: string | null
  submittedAt: string | null
  hasIdentity: boolean
}

/** Require auth. Redirects to /login if not logged in. */
export async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  return user
}

/**
 * Get the canonical player record for the logged-in user.
 *
 * Every authenticated read first runs the idempotent ensure RPC. Active rows
 * are then re-read by members.id; blocked rows route from the ensure lifecycle
 * because self-read RLS intentionally hides them from old JWTs. Email and
 * display name are never used for ownership or legacy-record linking.
 */
export const getPlayerInfo = cache(async (): Promise<PlayerInfo | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  try {
    const ensured = await ensureMyMemberRecord(supabase)
    const member = await resolveMemberRouteSnapshot(supabase, ensured)

    return {
      memberId: member.memberId,
      memberNumber: member.memberNumber,
      name: member.fullName ?? "Player",
      status: member.status,
      accountStatus: member.accountStatus,
      profileStage: member.profileStage,
      onboardingStep: member.onboardingStep,
      lastProfileSavedAt: member.lastProfileSavedAt,
      submittedAt: member.submittedAt,
      hasIdentity: member.hasIdentity,
    }
  } catch (error) {
    console.error("[getPlayerInfo] member master error:", getMemberMasterDiagnostic(error))
    throw new Error("データベースエラーが発生しました")
  }
})

/** Require auth plus an ensured canonical member row. */
export async function requireMemberRecord(): Promise<PlayerInfo> {
  const player = await getPlayerInfo()
  if (!player) redirect("/login")
  return player
}

/** Require approved player. Redirects to /login if not auth, /app if not approved. */
export async function requirePlayer(): Promise<PlayerInfo> {
  const player = await requireMemberRecord()
  if (player.accountStatus !== "active") redirect("/app/inactive")
  if (player.status === "inactive") redirect("/app/inactive")
  if (player.status !== "approved") redirect("/app")
  return player
}

/** Get player without redirect (for optional checks). */
export async function getPlayer(): Promise<PlayerInfo | null> {
  return getPlayerInfo()
}
