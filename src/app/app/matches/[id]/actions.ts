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
  const publicationVersion = Number(formData.get("publicationVersion"))

  if (!matchId) return { error: "缺少匹配 ID" }
  if (!Number.isSafeInteger(publicationVersion) || publicationVersion < 1) return { error: "publicationChanged" }
  if (Array.from(reason).length > 500) return { error: "取消理由不能超过 500 个字符" }

  await requirePlayer()
  const supabase = await createClient() as unknown as PlayerMatchRpcClient
  const { error } = await supabase.rpc<unknown>("request_my_match_cancellation", {
    p_result_id: matchId,
    p_reason: reason || null,
    p_expected_publication_version: publicationVersion,
  })

  if (error) {
    if (/MATCH_PUBLICATION_STALE|MATCH_NOT_PUBLISHED|MATCH_PUBLICATION_NOT_PUBLISHED/.test(error.message)) return { error: "publicationChanged" }
    console.error("[requestCancellation]", error)
    return { error: "saveFailed" }
  }

  revalidatePath(`/app/matches/${matchId}`)
  revalidatePath("/app/matches")
  return { success: true }
}
