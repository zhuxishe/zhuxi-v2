"use server"

import { requirePlayer } from "@/lib/auth/player"
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function requestCancellation(formData: FormData) {
  const matchId = formData.get("matchId") as string
  const reason = (formData.get("reason") as string)?.trim() ?? ""

  if (!matchId) return { error: "缺少匹配 ID" }

  const player = await requirePlayer()
  const supabase = await createClient()

  // Verify the player is a participant
  const { data: match } = await supabase
    .from("match_results")
    .select("id, member_a_id, member_b_id, status, cancellation_status")
    .eq("id", matchId)
    .single()

  if (!match) return { error: "匹配记录不存在" }

  const isParticipant =
    match.member_a_id === player.memberId ||
    match.member_b_id === player.memberId

  if (!isParticipant) return { error: "你不是该匹配的参与者" }
  if (match.status === "cancelled") return { error: "该匹配已取消" }
  if (match.cancellation_status === "pending") return { error: "已有待审核的取消申请" }

  const { error } = await supabase
    .from("match_results")
    .update({
      cancellation_requested_by: player.memberId,
      cancellation_reason: reason || null,
      cancellation_requested_at: new Date().toISOString(),
      cancellation_status: "pending",
    })
    .eq("id", matchId)

  if (error) return { error: error.message }

  revalidatePath(`/app/matches/${matchId}`)
  revalidatePath("/app/matches")
  return { success: true }
}
