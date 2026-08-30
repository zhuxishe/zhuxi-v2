"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchPairRelations } from "@/lib/queries/pair-relations-build"
import { buildRoundCandidates } from "@/lib/matching/build-round-candidates"
import { runFullMatching } from "@/lib/matching/run-matching"
import { DEFAULT_CONFIG } from "@/lib/matching/config"
import { canUpdateRoundStatus } from "@/components/admin/round-detail-rules"
import type { MatchingConfig } from "@/lib/matching/types"
import type { Json } from "@/types/database.types"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"

type OperationalRpcClient = {
  rpc<T>(name: string, args: Record<string, unknown>): PromiseLike<{
    data: T | null
    error: { code?: string; message: string } | null
  }>
}

function roundStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "草稿",
    open: "问卷进行中",
    closed: "已截止",
    matched: "已匹配",
  }
  return labels[status] ?? `未知状态（${status}）`
}

/** 更新轮次状态 */
export async function updateRoundStatus(roundId: string, status: string) {
  await requireAdmin()

  const VALID_STATUSES = ['draft', 'open', 'closed', 'matched']
  if (!VALID_STATUSES.includes(status)) {
    return { error: "轮次状态无效" }
  }

  const supabase = await createClient()
  const { data: round, error: roundError } = await supabase
    .from("match_rounds")
    .select("status")
    .eq("id", roundId)
    .single()

  if (roundError || !round) return { error: "轮次不存在" }
  if (!canUpdateRoundStatus(round.status, status)) {
    return { error: `当前轮次状态为「${roundStatusLabel(round.status)}」，不允许切换到「${roundStatusLabel(status)}」` }
  }

  const { error } = await supabase
    .from("match_rounds")
    .update({ status })
    .eq("id", roundId)

  if (error) {
    console.error("[updateRoundStatus]", error)
    return { error: "操作失败" }
  }
  revalidatePath(`/admin/matching/rounds/${roundId}`)
  revalidatePath("/admin/matching")
  return { success: true }
}

/** 基于轮次问卷运行匹配 */
export async function runRoundMatching(roundId: string, sessionName: string, rawReason: string) {
  const admin = await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const supabase = await createClient()

  // 0. 前置状态校验：只有 closed 状态的轮次才能执行匹配
  const { data: round, error: roundErr } = await supabase
    .from("match_rounds")
    .select("status")
    .eq("id", roundId)
    .single()

  if (roundErr || !round) return { error: "轮次不存在" }
  if (round.status !== "closed") {
    return { error: `当前轮次状态为「${roundStatusLabel(round.status)}」，只有「已截止」状态才能执行匹配` }
  }

  // 1. 获取问卷提交（含用户资料）
  const { submissions, candidates } = await buildRoundCandidates(roundId)
  if (submissions.length < 2) {
    return { error: "至少需要 2 人提交问卷才能匹配" }
  }

  // 2. 获取成员 ID
  const memberIds = submissions.map((s) => s.member_id)

  // 3. 构建配对历史关系（黑名单、互评、配对次数，使用 member UUID 作为 key）
  const pairRelations = await fetchPairRelations(memberIds)

  // 4. 三阶段分流匹配（双人池 → 多人池 → 回流兜底）
  // idMap: submissionId(=member_id) → member_id，用于结果写入
  const config: MatchingConfig = { ...DEFAULT_CONFIG }
  const idMap = new Map<string, string>()
  for (const sub of submissions) idMap.set(sub.member_id, sub.member_id)

  const result = runFullMatching(candidates, config, idMap, pairRelations)

  // 5. 保存 match_session
  const { data: session, error: sErr } = await supabase
    .from("match_sessions")
    .insert({
      session_name: sessionName || `${new Date().toLocaleDateString("zh-CN")} 匹配`,
      round_id: roundId,
      algorithm: "max_coverage_split",
      config: config as unknown as import("@/types/database.types").Json,
      total_candidates: result.totalCandidates,
      total_matched: result.totalMatched,
      total_unmatched: result.totalUnmatched,
      created_by: admin.id,
      audit_reason: reasonResult.reason,
    })
    .select("id")
    .single()

  if (sErr) {
    console.error("[runRoundMatching:session]", sErr)
    return { error: "操作失败" }
  }

  // 6. 保存 match_results
  const rows = result.rows.map((r) => ({
    session_id: session.id,
    member_a_id: r.member_a_id,
    member_b_id: r.member_b_id,
    group_members: r.group_members,
    total_score: r.total_score,
    score_breakdown: r.score_breakdown as import("@/types/database.types").Json,
    rank: r.rank,
    best_slot: r.best_slot,
    audit_reason: reasonResult.reason,
  }))

  if (rows.length > 0) {
    const { error: rErr } = await supabase.from("match_results").insert(rows)
    if (rErr) {
      // 补偿：删除孤立的 session，避免脏数据
      const rpc = supabase as unknown as OperationalRpcClient
      const { error: compensationError } = await rpc.rpc<unknown>("admin_delete_operational_record", {
        p_entity: "match_sessions",
        p_id: session.id,
        p_reason: `匹配写入失败补偿：${reasonResult.reason}`.slice(0, 500),
      })
      console.error("[runRoundMatching:results]", rErr)
      if (compensationError) {
        console.error("[runRoundMatching:compensation]", compensationError)
        return { error: "匹配结果写入失败，且会话补偿删除失败，请立即人工检查" }
      }
      return { error: "匹配结果写入失败，会话已补偿删除" }
    }
  }

  // 7. 保存未匹配诊断
  if (result.unmatchedIds.length > 0) {
    const diagRows = result.unmatchedIds.map((subId) => ({
      session_id: session.id,
      member_id: idMap.get(subId) ?? subId,
      reason: "unmatched_after_all_stages",
      details: { stage: "overflow" } as import("@/types/database.types").Json,
      audit_reason: reasonResult.reason,
    }))
    const { error: diagnosticError } = await supabase
      .from("unmatched_diagnostics")
      .insert(diagRows)
    if (diagnosticError) {
      const rpc = supabase as unknown as OperationalRpcClient
      const { error: compensationError } = await rpc.rpc<unknown>(
        "admin_delete_operational_record",
        {
          p_entity: "match_sessions",
          p_id: session.id,
          p_reason: `诊断写入失败补偿：${reasonResult.reason}`.slice(0, 500),
        },
      )
      console.error("[runRoundMatching:diagnostics]", diagnosticError)
      if (compensationError) {
        console.error("[runRoundMatching:diagnosticsCompensation]", compensationError)
        return { error: "未匹配诊断写入失败，且会话补偿删除失败，请立即人工检查" }
      }
      return { error: "未匹配诊断写入失败，会话已补偿删除" }
    }
  }

  // 8. 更新轮次状态为 matched
  const { error: roundStatusError } = await supabase
    .from("match_rounds")
    .update({ status: "matched" })
    .eq("id", roundId)
  if (roundStatusError) {
    const rpc = supabase as unknown as OperationalRpcClient
    const { error: compensationError } = await rpc.rpc<unknown>(
      "admin_delete_operational_record",
      {
        p_entity: "match_sessions",
        p_id: session.id,
        p_reason: `轮次状态写入失败补偿：${reasonResult.reason}`.slice(0, 500),
      },
    )
    console.error("[runRoundMatching:roundStatus]", roundStatusError)
    if (compensationError) {
      console.error("[runRoundMatching:roundStatusCompensation]", compensationError)
      return { error: "轮次状态更新失败，且会话补偿删除失败，请立即人工检查" }
    }
    return { error: "轮次状态更新失败，会话已补偿删除" }
  }

  revalidatePath(`/admin/matching/rounds/${roundId}`)
  revalidatePath("/admin/matching")
  return { success: true, sessionId: session.id }
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
export async function updateSubmission(submissionId: string, data: SubmissionData, rawReason: string) {
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
    .select("round_id")
    .eq("id", submissionId)
    .single()
  if (!sub) return { error: "问卷不存在" }

  const { data: round } = await supabase
    .from("match_rounds")
    .select("status")
    .eq("id", sub.round_id)
    .single()
  if (round?.status === "matched") return { error: "该轮次已完成匹配，无法编辑" }

  const { error } = await supabase
    .from("match_round_submissions")
    .update({
      game_type_pref: data.game_type_pref,
      gender_pref: data.gender_pref,
      availability: data.availability as unknown as Json,
      interest_tags: data.interest_tags,
      social_style: data.social_style,
      message: data.message,
      audit_reason: reasonResult.reason,
    })
    .eq("id", submissionId)

  if (error) {
    console.error("[updateSubmission]", error)
    return { error: "更新失败" }
  }

  revalidatePath(`/admin/matching/rounds/${sub.round_id}`)
  return { success: true }
}

/** 新增问卷 */
export async function createSubmission(
  roundId: string, memberId: string, data: SubmissionData, rawReason: string,
) {
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
    .select("status")
    .eq("id", roundId)
    .single()
  if (!round) return { error: "轮次不存在" }
  if (round.status === "matched") return { error: "该轮次已完成匹配，无法新增" }

  // 检查是否已提交
  const { data: existing } = await supabase
    .from("match_round_submissions")
    .select("id")
    .eq("round_id", roundId)
    .eq("member_id", memberId)
    .maybeSingle()
  if (existing) return { error: "该成员已提交过问卷" }

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
    .select("status")
    .eq("id", sub.round_id)
    .single()
  if (round?.status === "matched") return { error: "该轮次已完成匹配，无法删除" }

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
