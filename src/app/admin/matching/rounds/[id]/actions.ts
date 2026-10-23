"use server"

import { revalidatePath } from "next/cache"
import { startRoundMatching } from "@/lib/matching/round-run-service"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import type { Json } from "@/types/database.types"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"
import { getRoundPurpose, normalizeRoundConfig } from "@/lib/matching/round-config"
import { fetchMemberMatchingReadiness } from "@/lib/matching/readiness-server"

async function matchingProfileError(memberId: string) {
  try {
    const readiness = await fetchMemberMatchingReadiness(memberId)
    if (readiness.missing.length > 0) {
      const labels = { supplementary: "补充资料", personality: "性格自评", quiz: "性格测试" }
      return { error: `该成员尚未完成：${readiness.missing.map((key) => labels[key]).join("、")}。请成员完善资料后再报名或修改报名。` }
    }
    return null
  } catch (error) {
    console.error("[adminSubmission] profile readiness", error)
    return { error: "暂时无法检查成员资料完成状态，请重试。报名未新增或修改。" }
  }
}

type OperationalRpcClient = {
  rpc<T>(name: string, args: Record<string, unknown>): PromiseLike<{
    data: T | null
    error: { code?: string; message: string } | null
  }>
}

/** 基于完整轮次报名池运行；同一运行编号重试不会创建第二份方案。 */
export async function runRoundMatching(roundId: string, sessionName: string, rawReason: string, requestId: string) {
  return startRoundMatching(roundId, sessionName, rawReason, requestId)
}

// ── 问卷编辑 ──

interface SubmissionData {
  game_type_pref: string
  gender_pref: string
  availability: Record<string, string[]>
  interest_tags: string[]
  social_style: string | null
  message: string | null
}

interface SubmissionActionResult {
  success?: true
  error?: string
}

const SUBMISSION_GAME_TYPES = new Set(["双人", "多人", "都可以"])
const SUBMISSION_GENDER_PREFS = new Set(["男", "女", "都可以"])
const SUBMISSION_SLOTS = new Set(["上午", "下午", "晚上"])

function validateSubmissionData(data: SubmissionData) {
  if (!SUBMISSION_GAME_TYPES.has(data.game_type_pref)
    || !SUBMISSION_GENDER_PREFS.has(data.gender_pref)
    || !data.availability
    || typeof data.availability !== "object"
    || Array.isArray(data.availability)
    || Object.keys(data.availability).length > 100
    || Object.entries(data.availability).some(([date, slots]) =>
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Array.isArray(slots)
      || slots.length === 0
      || slots.length > 3
      || slots.some((slot) => !SUBMISSION_SLOTS.has(slot)))
    || !Array.isArray(data.interest_tags)
    || data.interest_tags.length > 50
    || data.interest_tags.some((tag) => typeof tag !== "string" || Array.from(tag).length > 100)
    || (data.social_style !== null && (typeof data.social_style !== "string" || Array.from(data.social_style).length > 100))
    || (data.message !== null && (typeof data.message !== "string" || Array.from(data.message).length > 2000))) {
    return "问卷数据格式或长度不正确"
  }
  return null
}

/** 更新已有问卷 */
export async function updateSubmission(
  submissionId: string, data: SubmissionData, rawReason: string, expectedUpdatedAt?: string | null,
): Promise<SubmissionActionResult> {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { error: "仅超级管理员可覆盖原始问卷" }
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const validationError = validateSubmissionData(data)
  if (validationError) return { error: validationError }
  const supabase = await createClient()

  // 检查关联轮次状态
  const { data: sub } = await supabase
    .from("match_round_submissions")
    .select("round_id, member_id")
    .eq("id", submissionId)
    .single()
  if (!sub) return { error: "问卷不存在" }

  const { data: round } = await supabase
    .from("match_rounds")
    .select("*")
    .eq("id", sub.round_id)
    .single()
  if (!round || round.deleted_at) return { error: "轮次不存在" }
  if (round.status === "matched") return { error: "该轮次已完成匹配，无法编辑" }
  if (getRoundPurpose(round?.purpose) !== "matching") return { error: "活动报名不使用匹配问卷编辑功能" }
  if (expectedUpdatedAt === undefined || (expectedUpdatedAt !== null && !Number.isFinite(Date.parse(expectedUpdatedAt)))) {
    return { error: "问卷版本信息缺失，请刷新后重新打开编辑。当前输入尚未保存。" }
  }
  const profileError = await matchingProfileError(sub.member_id)
  if (profileError) return profileError

  const { error } = await supabase.rpc("admin_update_matching_submission", {
    p_submission_id: submissionId,
    p_expected_updated_at: expectedUpdatedAt,
    p_reason: reasonResult.reason,
    p_answers: {
      game_type_pref: data.game_type_pref,
      gender_pref: data.gender_pref,
      availability: data.availability,
      interest_tags: data.interest_tags,
      social_style: data.social_style,
      message: data.message,
    },
  })

  if (error) {
    console.error("[updateSubmission]", error)
    if (error.message?.includes("MATCHING_SUBMISSION_CHANGED")) {
      return { error: "问卷已被其他页面或成员修改，请刷新后核对。当前输入已保留，尚未覆盖新答卷。" }
    }
    if (error.message?.includes("MATCHING_PROFILE_INCOMPLETE")) {
      return await matchingProfileError(sub.member_id) ?? { error: "成员资料完成状态已变化，请刷新后重试。报名未修改。" }
    }
    return { error: "更新失败" }
  }

  revalidatePath(`/admin/matching/rounds/${sub.round_id}`)
  return { success: true }
}

/** 新增问卷 */
export async function createSubmission(
  roundId: string, memberId: string, data: SubmissionData, rawReason: string,
): Promise<SubmissionActionResult> {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { error: "仅超级管理员可新增原始问卷" }
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const validationError = validateSubmissionData(data)
  if (validationError) return { error: validationError }
  const supabase = await createClient()

  // 检查轮次状态
  const { data: round } = await supabase
    .from("match_rounds")
    .select("*")
    .eq("id", roundId)
    .single()
  if (!round || round.deleted_at) return { error: "轮次不存在" }
  if (getRoundPurpose(round.purpose) !== "matching") return { error: "只有匹配轮次可以手动新增匹配问卷" }
  if (normalizeRoundConfig(round.content_config).questions.some((question) => question.required)) return { error: "本轮含必填补充问题，请成员自行填写问卷" }
  if (round.status === "matched") return { error: "该轮次已完成匹配，无法新增" }

  // 检查是否已提交
  const { data: existing } = await supabase
    .from("match_round_submissions")
    .select("id")
    .eq("round_id", roundId)
    .eq("member_id", memberId)
    .maybeSingle()
  if (existing) return { error: "该成员已提交过问卷" }
  const profileError = await matchingProfileError(memberId)
  if (profileError) return profileError

  const { error } = await supabase
    .from("match_round_submissions")
    .insert({
      round_id: roundId,
      member_id: memberId,
      game_type_pref: data.game_type_pref,
      gender_pref: data.gender_pref,
      availability: data.availability as unknown as Json,
      interest_tags: data.interest_tags,
      social_style: data.social_style,
      message: data.message,
      audit_reason: reasonResult.reason,
    })

  if (error) {
    console.error("[createSubmission]", error)
    if (error.code === "23505") return { error: "该成员已提交过问卷，请刷新后核对。当前输入尚未保存。" }
    if (error.message?.includes("MATCHING_PROFILE_INCOMPLETE")) {
      return await matchingProfileError(memberId) ?? { error: "成员资料完成状态已变化，请刷新后重试。报名未新增。" }
    }
    return { error: "新增失败" }
  }

  revalidatePath(`/admin/matching/rounds/${roundId}`)
  return { success: true }
}

/** 删除问卷 */
export async function deleteSubmission(submissionId: string, rawReason: string) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { error: "仅超级管理员可删除原始问卷" }
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const supabase = await createClient()

  // 查询关联轮次
  const { data: sub } = await supabase
    .from("match_round_submissions")
    .select("round_id")
    .eq("id", submissionId)
    .single()
  if (!sub) return { error: "问卷不存在" }

  const { data: round } = await supabase
    .from("match_rounds")
    .select("status, deleted_at")
    .eq("id", sub.round_id)
    .single()
  if (!round || round.deleted_at) return { error: "轮次不存在" }
  if (round.status === "matched") return { error: "该轮次已完成匹配，无法删除" }

  const rpc = supabase as unknown as OperationalRpcClient
  const { error } = await rpc.rpc<unknown>("admin_delete_operational_record", {
    p_entity: "match_round_submissions",
    p_id: submissionId,
    p_reason: reasonResult.reason,
  })

  if (error) {
    console.error("[deleteSubmission]", error)
    return { error: "删除失败" }
  }

  revalidatePath(`/admin/matching/rounds/${sub.round_id}`)
  return { success: true }
}
