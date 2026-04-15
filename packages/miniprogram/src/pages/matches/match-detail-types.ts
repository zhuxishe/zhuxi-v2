export interface MatchDetail {
  id: string
  best_slot: string | null
  rank: number | null
  status: string | null
  created_at: string
  group_members: string[] | null
  session_id: string | null
  member_a_id: string
  member_b_id: string
  cancellation_status: string | null
  cancellation_reason: string | null
  cancellation_requested_at: string | null
}

export const CANCEL_STATUS: Record<string, string> = {
  pending: '审核中',
  approved: '已批准',
  rejected: '已拒绝',
}
