export type MatchingRunStatus = "running" | "succeeded" | "failed" | "abandoned"

export interface MatchingEligibilityExclusion {
  reason: string
  count: number
}

export interface MatchingEligibilitySummary {
  round_id: string
  checked_at: string
  submitted_count: number
  eligible_count: number
  excluded_count: number
  exclusion_summary: MatchingEligibilityExclusion[]
}

const ELIGIBILITY_REASON_LABELS: Record<string, string> = {
  cancelled: "已取消报名",
  member_not_approved: "审核未通过",
  anonymized: "已匿名化",
  not_player: "非玩家身份",
  account_unavailable: "账号不可用",
  not_current: "非当前成员",
  unbound: "未绑定账号",
  profile_incomplete: "必需资料不完整",
}

export function matchingEligibilityReasonLabel(reason: string): string {
  return ELIGIBILITY_REASON_LABELS[reason] ?? "其他资格问题"
}

export interface MatchingRunRecord {
  id: string
  round_id: string
  batch_number: number
  status: MatchingRunStatus
  attempt: number
  session_id: string | null
  session_name: string
  created_at: string
  updated_at: string
  lease_expires_at: string | null
  error_code: string | null
  can_recover: boolean
  session_status: string | null
  results_ready: boolean | null
  publication_version: number | null
  can_abandon?: boolean
  lease_expired?: boolean
  error_message?: string | null
  session_deleted?: boolean
  algorithm_version?: string
  adapter_version?: number
  captured_at?: string | null
  submitted_count?: number | null
  eligible_count?: number | null
  excluded_count?: number | null
  exclusion_summary?: MatchingEligibilityExclusion[] | null
  counts_available?: boolean
}

export const MATCHING_RUN_ERROR_MESSAGES: Record<string, string> = {
  INPUT_CAPTURE_FAILED: "本批未能保存原始输入，请作废后新增一次运行；原报名保留。",
  INPUT_INVALID: "本批输入校验失败，请核对后恢复或作废。",
  CANDIDATES_INSUFFICIENT: "本批符合资格的成员不足2人；原报名保留。",
  ENGINE_FAILED: "本批计算未完成，可使用原输入恢复。",
  STAGE_FAILED: "输入保存结果待确认，请查询本批状态后重试。",
  SAVE_FAILED: "本批保存未完成，可使用原输入恢复。",
  ROUND_CHANGED: "轮次状态或收集时间已变化，请核对后处理本批。",
  PRIVACY_REDACTED: "本批输入已因隐私处理清除，无法恢复，请作废后新增运行。",
  VERSION_UNSUPPORTED: "当前程序无法恢复本批算法版本，请作废后新增运行。",
  UNKNOWN: "本批结果尚待确认，请查询状态后重试。",
}
