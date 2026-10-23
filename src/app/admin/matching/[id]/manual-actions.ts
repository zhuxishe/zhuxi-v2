"use server"

import { inspectMatchingAdjustment, performMatchingAdjustment, recoverMatchingAdjustmentOperation, fetchMatchingAdjustmentRecords } from "@/lib/matching/adjustment-service"
import type { ScoreComponent } from "@/lib/matching/types"

export interface ConstraintItem {
  label: string
  status: "pass" | "fail" | "warn"
  details: string[]
}

async function inspectSelection(sessionId: string, memberIds: string[]) {
  const { inspection, revisionToken, canViewRaw } = await inspectMatchingAdjustment(sessionId, memberIds)
  const warnings = canViewRaw ? inspection.reasons : inspection.passed ? [] : ["存在不满足的匹配约束"]
  const constraints: ConstraintItem[] = [{
    label: "资格、类型、成员关系及整组共同时间",
    status: inspection.passed ? "pass" : "fail",
    details: inspection.passed ? ["所选完整成员池已通过服务端检查；确认时会再次核验"]
      : canViewRaw ? inspection.reasons : ["存在不满足的匹配约束，不能强制配对"],
  }]
  const row = inspection.rows[0]
  return {
    compatible: inspection.passed,
    warnings, constraints, bestSlot: inspection.bestSlot, revisionToken,
    score: row?.total_score ?? 0,
    breakdown: canViewRaw && Array.isArray(row?.score_breakdown) ? row.score_breakdown as ScoreComponent[] : [],
    scoreBreakdown: canViewRaw ? row?.score_breakdown ?? null : null,
  }
}

export async function checkPairCompatibility(sessionId: string, memberAId: string, memberBId: string) {
  return inspectSelection(sessionId, [memberAId, memberBId])
}

export async function checkGroupCompatibility(sessionId: string, memberIds: string[]) {
  return inspectSelection(sessionId, memberIds)
}

/** No force flag exists: preview and commit use the same hard constraints. */
export async function manualPair(sessionId: string, memberIds: string[], rawReason: string, operationId?: string, expectedRevision?: string) {
  return performMatchingAdjustment({ sessionId, kind: "manual", memberIds, rawReason, operationId, expectedRevision })
}

export async function recoverMatchingAdjustment(sessionId: string, operationId: string, rawReason: string) {
  return recoverMatchingAdjustmentOperation(sessionId, operationId, rawReason)
}

export async function fetchMatchingAdjustments(sessionId: string) {
  try { return { adjustments: await fetchMatchingAdjustmentRecords(sessionId) } }
  catch { return { adjustments: [], error: "暂时无法读取调整记录，请刷新后重试。" } }
}
