export const noMatchRequestFixture = {
  id: "40000000-0000-4000-8000-000000000001",
  round_id: "30000000-0000-4000-8000-000000000001",
  round_name: "周末交流活动",
  requester_id: "10000000-0000-4000-8000-000000000001",
  requester_name: "申请人甲",
  target_member_id: "10000000-0000-4000-8000-000000000002",
  target_name: "成员乙",
  reason: "互动方式不合适，希望以后分开安排",
  status: "pending",
  version: 1,
  created_at: "2026-11-23T06:00:00Z",
  updated_at: "2026-11-23T06:00:00Z",
  processed_at: null,
  processed_by_name: null,
  internal_note: null,
  processing_reason: null,
}

export const resolvedNoMatchRequestFixture = {
  ...noMatchRequestFixture, status: "resolved", version: 2, updated_at: "2026-11-23T07:00:00Z",
  processed_at: "2026-11-23T07:00:00Z", processed_by_name: "工作人员丙", internal_note: "已人工确认后续活动安排",
  processing_reason: "核对申请后记录处理结果",
}
