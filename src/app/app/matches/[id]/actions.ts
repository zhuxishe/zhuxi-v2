"use server"

import { requirePlayer } from "@/lib/auth/player"
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

type PlayerMatchRpcClient = {
  rpc<T>(name: string, args: Record<string, unknown>): PromiseLike<{
    data: T | null
    error: { code?: string; message: string } | null
  }>
}

export async function requestCancellation(formData: FormData) {
  const matchId = formData.get("matchId") as string
  const reason = (formData.get("reason") as string)?.trim() ?? ""

  if (!matchId) return { error: "缺少匹配 ID" }
  if (Array.from(reason).length > 500) return { error: "取消理由不能超过 500 个字符" }

  await requirePlayer()
  const supabase = await createClient() as unknown as PlayerMatchRpcClient
  const { error } = await supabase.rpc<unknown>("request_my_match_cancellation", {
    p_result_id: matchId,
    p_reason: reason || null,
  })

  if (error) {
    console.error("[requestCancellation]", error)
    return { error: "saveFailed" }
  }

  revalidatePath(`/app/matches/${matchId}`)
  revalidatePath("/app/matches")
  return { success: true }
}
