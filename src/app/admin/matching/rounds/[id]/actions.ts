"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchPairRelations } from "@/lib/queries/pair-relations-build"
import { buildRoundCandidates } from "@/lib/matching/build-round-candidates"
import { runFullMatching } from "@/lib/matching/run-matching"
import { DEFAULT_CONFIG } from "@/lib/matching/config"
import type { MatchingConfig } from "@/lib/matching/types"
import type { Json } from "@/types/database.types"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"
import { getRoundPurpose, normalizeRoundConfig } from "@/lib/matching/round-config"
import { fetchMemberMatchingReadiness } from "@/lib/matching/readiness-server"
import { canRunRoundMatching } from "@/components/admin/round-detail-rules"
import { getSurveyWindowState } from "@/lib/matching/survey-window"

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

function roundStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "草稿",
    open: "问卷进行中",
    closed: "已截止",
    matched: "已匹配",
  }
  return labels[status] ?? `未知状态（${status}）`
}

/** 基于轮次问卷运行匹配 */
export async function runRoundMatching(roundId: string, sessionName: string, rawReason: string) {
  const admin = await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const supabase = await createClient()

  // 0. 已开放收集（含到期但未手动截止）或已截止的轮次可以执行匹配。
  const { data: round, error: roundErr } = await supabase
    .from("match_rounds")
    .select("*")
    .eq("id", roundId)
    .single()

  if (roundErr || !round || round.deleted_at) return { error: "轮次不存在" }
  if (getRoundPurpose(round.purpose) !== "matching") return { error: "只有收集时间后匹配的轮次可以运行匹配" }
  const windowState = getSurveyWindowState(round)
  if (!canRunRoundMatching(round.status, windowState)) {
    if (windowState === "scheduled") return { error: "问卷尚未到开放收集时间，暂不能执行匹配" }
    if (windowState === "invalid") return { error: "问卷收集时间配置无效，暂不能执行匹配" }
    return { error: `当前轮次状态为「${roundStatusLabel(round.status)}」，只有已开放收集或已截止的轮次才能执行匹配` }
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

  // 8. 原子核对收集状态并标记结果已生成完成，避免管理员发布中途写入的会话。
  // 收集中的轮次继续保持 open；已截止轮次沿用 matched，截止时间均不改变。
  const finalizer = supabase as unknown as OperationalRpcClient
  const { data: completed, error: roundStatusError } = await finalizer.rpc<{ results_ready: boolean }>(
    "admin_finalize_matching_session",
    {
      p_session_id: session.id,
      p_round_id: roundId,
      p_expected_status: round.status,
      p_survey_start: round.survey_start,
      p_survey_end: round.survey_end,
      p_reason: reasonResult.reason,
    },
  )
  if (roundStatusError || !completed?.results_ready) {
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
    return { error: "轮次状态已变更或更新失败，本次匹配已撤回，请刷新后重试" }
  }

  revalidatePath(`/admin/matching/rounds/${roundId}`)
  revalidatePath("/admin/matching")
  revalidatePath("/app")
  revalidatePath("/app/matching/survey")
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
