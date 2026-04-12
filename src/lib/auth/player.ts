import { createClient } from "@/lib/supabase/server"
import { getSingleRelation } from "@/lib/supabase/relations"
import { redirect } from "next/navigation"

export interface PlayerInfo {
  memberId: string
  memberNumber: string | null
  name: string
  status: string
  hasIdentity: boolean
}

type MemberIdentityRow = { full_name: string | null }

/** Require auth. Redirects to /login if not logged in. */
export async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  return user
}

/** Get player info for logged-in user. Returns null if no member record. */
export async function getPlayerInfo(): Promise<PlayerInfo | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: member, error: memberErr } = await supabase
    .from("members")
    .select("id, member_number, status, member_identity(full_name)")
    .eq("user_id", user.id)
    .maybeSingle()

  if (memberErr) console.error("[getPlayerInfo]", memberErr)
  if (!member) return null

  const identity = getSingleRelation(
    member.member_identity as MemberIdentityRow | MemberIdentityRow[] | null
  )

  return {
    memberId: member.id,
    memberNumber: member.member_number,
    name: identity?.full_name ?? "Player",
    status: member.status,
    hasIdentity: !!identity,
  }
}

/** Require approved player. Redirects to /login if not auth, /app if not approved. */
export async function requirePlayer(): Promise<PlayerInfo> {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data: member, error: memberErr } = await supabase
    .from("members")
    .select("id, member_number, status, member_identity(full_name)")
    .eq("user_id", user.id)
    .maybeSingle()

  if (memberErr) console.error("[requirePlayer]", memberErr)
  if (!member || member.status !== "approved") redirect("/app")

  const identity = getSingleRelation(
    member.member_identity as MemberIdentityRow | MemberIdentityRow[] | null
  )

  return {
    memberId: member.id,
    memberNumber: member.member_number,
    name: identity?.full_name ?? "Player",
    status: member.status,
    hasIdentity: !!identity,
  }
}

/** Get player without redirect (for optional checks). */
export async function getPlayer(): Promise<PlayerInfo | null> {
  return getPlayerInfo()
}
