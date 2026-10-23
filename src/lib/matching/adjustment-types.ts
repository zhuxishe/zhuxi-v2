import type { MatchingEligibilityExclusion } from "./run-lifecycle"
import type { MatchingEngineInput } from "./run-input"

export type MatchingAdjustmentKind = "manual" | "pool" | "restore" | "split"
export type MatchingAdjustmentStatus = "running" | "failed" | "succeeded"

export interface MatchingAdjustmentSummary {
  submitted_count: number
  eligible_count: number
  excluded_count: number
  exclusion_summary: MatchingEligibilityExclusion[] | null
}

export interface MatchingAdjustmentRecord extends MatchingAdjustmentSummary {
  id: string
  session_id: string
  round_id: string
  kind: MatchingAdjustmentKind
  status: MatchingAdjustmentStatus
  attempt: number
  created_at: string
  updated_at: string
  captured_at: string | null
  has_existing_multi_pool: boolean
  error_code: string | null
  can_recover: boolean
  base_revision: string
  actor_admin_id: string
  result_id: string | null
  member_ids: string[]
}

/** Safe UI metadata only. The capture and staged input never leave server actions. */
export interface MatchingAdjustmentPreview extends MatchingAdjustmentSummary {
  base_revision: string
  has_existing_multi_pool: boolean
  available_members: { id: string; name: string }[]
  excluded_members: { id: string; reasons: string[] }[]
}

export interface MatchingAdjustmentReceipt {
  operation: MatchingAdjustmentRecord
  acquired?: boolean
  lease_token?: string
  capture?: unknown
  engine_input?: MatchingEngineInput | null
  selected_member_ids?: string[]
  has_existing_multi_pool?: boolean
  result_snapshot?: { best_slot?: string | null } | null
}

export interface MatchingAdjustmentResult {
  success?: true
  error?: string
  operationId?: string
  status?: MatchingAdjustmentStatus
  busy?: boolean
  matchCount?: number
}

export const MATCHING_ADJUSTMENT_ERRORS: Record<string, string> = {
  INPUT_INVALID: "本次原输入不可用或校验失败，不能继续恢复；请刷新核对后重新检查。",
  MEMBER_INELIGIBLE: "所选成员当前已不符合匹配资格，本次未保存；请刷新查看排除原因并重新检查。",
  MEMBER_OCCUPIED: "所选成员已在当前方案的其他有效结果中，本次未保存；请先处理冲突并重新检查。",
  CANDIDATES_INSUFFICIENT: "本次符合资格的成员不足2人；原结果和报名均保留。",
  CONSTRAINTS_FAILED: "所选成员未通过硬约束，不能强制配对；请重新检查并选择成员。",
  ORIGINAL_TIME_UNAVAILABLE: "原推荐时间已不再适用于所有成员，请重新配对；原结果未恢复。",
  ENGINE_FAILED: "本次计算未完成，可使用原操作编号恢复。",
  STAGE_FAILED: "本次输入保存结果待确认，请刷新操作记录后恢复。",
  SAVE_FAILED: "本次保存未完成，可使用原操作编号恢复。",
  ADJUSTMENT_CHANGED: "方案或当前资料已变化，本次未保存；请刷新并重新检查后新增操作。",
  PRIVACY_REDACTED: "本次输入已因隐私处理清除，不能继续恢复。",
  VERSION_UNSUPPORTED: "当前程序无法恢复本次调整版本，请刷新后重新检查。",
  UNKNOWN: "本次调整结果暂时无法确认，请保留原编号并刷新操作记录；请勿重复新增操作。",
}
