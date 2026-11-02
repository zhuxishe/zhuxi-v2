import { requireAdmin } from "@/lib/auth/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import { validateUuids } from "@/lib/sanitize"
import { buildSavedMatchingReview, savedMatchingReviewWorkbookData, type SavedReviewCapture } from "./session-review"

export class MatchingReviewStaleError extends Error {
  constructor(message = "方案或报名资料已变化，请重新读取发布前结果确认后再导出。") { super(message) }
}

async function readCapture(sessionId: string, actorId: string, expectedRevision?: string): Promise<SavedReviewCapture> {
  validateUuids([sessionId])
  if (expectedRevision !== undefined && (!expectedRevision || expectedRevision.length > 1000)) throw new MatchingReviewStaleError("缺少有效的核对版本，请重新读取后再导出。")
  const db = createAdminClient() as unknown as { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: SavedReviewCapture | null; error: unknown }> }
  const { data, error } = await db.rpc("admin_get_matching_board", { p_session_id: sessionId, p_actor_admin_id: actorId })
  if (error || !data || typeof data.base_revision !== "string" || !Array.isArray(data.results) || !Array.isArray(data.cohort_member_ids)) throw new Error("暂时无法读取已保存的匹配结果，请稍后重试。")
  if (expectedRevision !== undefined && data.base_revision !== expectedRevision) throw new MatchingReviewStaleError("方案或报名资料已变化，请重新读取发布前结果确认后再导出。")
  return data
}

/** Returns only the safe review DTO; ordinary admins never receive raw answers or common slots. */
export async function fetchSavedMatchingReview(sessionId: string) {
  const admin = await requireAdmin()
  const data = await readCapture(sessionId, admin.id)
  return buildSavedMatchingReview(sessionId, data, admin.role === "super_admin")
}

/** Internal export loader. Never return workbookData from a Server Action. */
export async function readSavedMatchingReview(sessionId: string, expectedRevision?: string) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") throw new Error("仅超级管理员可导出原始匹配数据")
  const data = await readCapture(sessionId, admin.id, expectedRevision)
  const review = buildSavedMatchingReview(sessionId, data, true)
  return { review, workbookData: savedMatchingReviewWorkbookData(data, review) }
}
