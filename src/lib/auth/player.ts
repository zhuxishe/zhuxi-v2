import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export interface PlayerInfo {
  memberId: string
  memberNumber: string | null
  name: string
  status: string
  hasIdentity: boolean
}

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

  const { data: member } = await supabase
    .from("members")
    .select("id, member_number, status, member_identity(full_name)")
    .eq("user_id", user.id)
    .single()

  if (!member) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const identity = (member as any).member_identity

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

  const { data: member } = await supabase
    .from("members")
    .select("id, member_number, status, member_identity(full_name)")
    .eq("user_id", user.id)
    .single()

  if (!member || member.status !== "approved") redirect("/app")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const identity = (member as any).member_identity

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
