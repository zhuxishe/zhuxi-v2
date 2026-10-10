"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"

export async function deleteRound(roundId: string, confirmation: string, expectedRevision: number, executorName: string, reason: string, displayedAccount: string) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { error: "仅超级管理员可以删除活动或轮次" }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roundId)
    || typeof confirmation !== "string" || !confirmation.trim() || confirmation.length > 160
    || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return { error: "请确认活动名称，或刷新页面后重试" }
  }
  if (typeof executorName !== "string" || [...executorName.trim()].length < 1 || [...executorName.trim()].length > 80) {
    return { error: "请填写本次执行人的姓名（1–80 个字符）" }
  }
  if (typeof reason !== "string" || [...reason.trim()].length < 2 || [...reason.trim()].length > 500) {
    return { error: "请填写删除原因（2–500 个字符）" }
  }
  const db = await createClient()
  const { data: { user }, error: authError } = await db.auth.getUser()
  if (authError || !user?.email || typeof displayedAccount !== "string"
    || user.email.toLowerCase() !== displayedAccount.trim().toLowerCase()) {
    return { error: "当前登录账号已变化或无法确认，请刷新页面后重新核对管理员账号" }
  }
  const { data, error } = await db.rpc("admin_delete_match_round", {
    p_round_id: roundId, p_confirm_name: confirmation, p_expected_revision: expectedRevision,
    p_operator_name: executorName.trim(), p_reason: reason.trim(),
  })
  if (error) {
    const message = error.message
    if (message.includes("ROUND_DELETE_FORBIDDEN")) return { error: "仅超级管理员可以删除活动或轮次" }
    if (message.includes("ROUND_DELETE_CONFIRMATION")) return { error: "输入的名称不一致，请输入完整的活动名称" }
    if (message.includes("ROUND_DELETE_CHANGED")) return { error: "活动已被其他管理员修改，请刷新后再确认删除" }
    if (message.includes("ROUND_DELETE_HAS_MATCHES")) return { error: "该轮次已有匹配记录，无法删除；可保留历史记录" }
    if (message.includes("ROUND_DELETE_HAS_FEEDBACK")) return { error: "该活动已有评分或举报，无法删除；请关闭报名或互评，保留历史记录" }
    if (message.includes("ROUND_DELETE_AUDIT_REQUIRED")) return { error: "请刷新页面，填写执行人姓名和删除原因后再操作" }
    if (message.includes("ROUND_DELETE_OPERATOR_INVALID")) return { error: "请填写本次执行人的姓名（1–80 个字符）" }
    if (message.includes("ROUND_DELETE_REASON_INVALID")) return { error: "请填写删除原因（2–500 个字符）" }
    if (message.includes("ROUND_NOT_FOUND")) return { error: "活动不存在，请返回匹配管理" }
    if (["PGRST202", "42883"].includes(error.code ?? "")) return { error: "删除功能尚未完成数据库升级，请稍后重试" }
    console.error("[deleteRound]", error)
    return { error: "删除失败，请稍后重试" }
  }
  if (data !== true) return { error: "未能确认删除结果，请刷新后重试" }
  for (const path of ["/admin/matching", `/admin/matching/rounds/${roundId}`, `/admin/matching/rounds/${roundId}/edit`, "/admin/activity-reviews", "/app", "/app/matching", "/app/matching/survey", "/app/matches", "/app/notifications"]) {
    revalidatePath(path)
  }
  return { success: true }
}
