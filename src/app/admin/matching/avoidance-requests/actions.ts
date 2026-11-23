"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"
import { normalizeAdminPeerNoMatchRequest, type PeerNoMatchAdminRpcClient } from "@/lib/queries/admin-peer-no-match-requests"
import { validateResolvePeerNoMatchRequest } from "@/lib/peer-no-match/admin-validation"
import type { ResolvePeerNoMatchRequestInput, ResolvePeerNoMatchRequestResult } from "@/lib/peer-no-match/admin-types"

export async function resolvePeerNoMatchRequestAction(input: ResolvePeerNoMatchRequestInput): Promise<ResolvePeerNoMatchRequestResult> {
  await requireAdmin()
  const validationError = validateResolvePeerNoMatchRequest(input)
  if (validationError) return { error: validationError }
  const client = await createClient() as unknown as PeerNoMatchAdminRpcClient
  const { data, error } = await client.rpc("admin_resolve_peer_no_match_request", {
    p_request_id: input.requestId, p_status: input.status,
    p_internal_note: input.internalNote.trim(), p_expected_version: input.expectedVersion, p_reason: input.reason.trim(),
  })
  if (error) {
    if (/PEER_NO_MATCH_NOT_PENDING|VERSION_CONFLICT/.test(error.message)) return { error: "申请已由其他工作人员更新，请刷新核对处理记录。当前输入已保留。" }
    if (error.message.includes("PEER_NOT_ELIGIBLE")) return { error: "相关成员状态已变化，当前申请无法处理，请刷新列表核对。" }
    if (error.message.includes("PEER_NO_MATCH_NOT_FOUND")) return { error: "未找到这条申请，请刷新列表核对。" }
    if (/ADMIN_REQUIRED|AUTH_REQUIRED/.test(error.message) || error.code === "42501") return { error: "当前账号无权处理这条申请，请重新登录后核对权限。" }
    if (["PGRST202", "42883"].includes(error.code ?? "") && error.message.includes("admin_resolve_peer_no_match_request")) return { error: "申请处理功能尚未配置，请稍后再试。" }
    console.error("[resolvePeerNoMatchRequestAction]", error.message)
    return { error: "处理记录保存失败，请刷新核对后重试。" }
  }
  let updated
  try {
    updated = normalizeAdminPeerNoMatchRequest(data)
    if (updated.id !== input.requestId || updated.status !== input.status || updated.version <= input.expectedVersion
      || updated.internalNote !== input.internalNote.trim() || updated.processingReason !== input.reason.trim()) throw new Error("Unexpected resolution receipt")
  } catch {
    return { error: "无法核对保存结果，请刷新查看处理记录后再试。" }
  }
  revalidatePath("/admin/matching/avoidance-requests")
  revalidatePath(`/app/matches/rounds/${updated.roundId}/reviews`)
  return { success: true }
}
