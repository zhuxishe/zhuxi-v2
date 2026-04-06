"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"

export async function addBlacklist(
  memberAId: string,
  memberBId: string,
  reason: string
) {
  await requireAdmin()
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("pair_relationships")
    .select("id")
    .or(
      `and(member_a_id.eq.${memberAId},member_b_id.eq.${memberBId}),` +
      `and(member_a_id.eq.${memberBId},member_b_id.eq.${memberAId})`
    )
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from("pair_relationships")
      .update({ status: "blacklist", notes: reason })
      .eq("id", existing.id)

    if (error) return { error: error.message }
  } else {
    const { error } = await supabase
      .from("pair_relationships")
      .insert({
        member_a_id: memberAId,
        member_b_id: memberBId,
        status: "blacklist",
        notes: reason,
      })

    if (error) return { error: error.message }
  }

  return { success: true }
}

export async function removeBlacklist(relationId: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from("pair_relationships")
    .update({ status: "normal" })
    .eq("id", relationId)

  if (error) return { error: error.message }
  return { success: true }
}
