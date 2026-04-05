import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

interface PlayerInfo {
  memberId: string
  memberNumber: string | null
  name: string
  status: string
}

/** Check if current user is an approved player. Redirects to /app/login if not. */
export async function requirePlayer(): Promise<PlayerInfo> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/app/login")

  const { data: member } = await supabase
    .from("members")
    .select("id, member_number, status, member_identity(full_name)")
    .eq("user_id", user.id)
    .single()

  if (!member) redirect("/app/login")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const identity = (member as any).member_identity

  return {
    memberId: member.id,
    memberNumber: member.member_number,
    name: identity?.full_name ?? "Player",
    status: member.status,
  }
}

/** Check if current user is a player without redirecting. */
export async function getPlayer(): Promise<PlayerInfo | null> {
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
  }
}
