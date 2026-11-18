export const detailMemberId = "10000000-0000-4000-8000-000000000001"
export const detailReviewerIds = ["10000000-0000-4000-8000-000000000002", "10000000-0000-4000-8000-000000000003"]
export const detailRoundIds = ["20000000-0000-4000-8000-000000000001", "20000000-0000-4000-8000-000000000002", "20000000-0000-4000-8000-000000000003", "20000000-0000-4000-8000-000000000004"]

export function memberPeerScoreDetailFixture() {
  const names = ["春日活动", "周末交流", "多人活动", "尚未收到评价的活动"]
  return {
    member: { member_id: detailMemberId, full_name: "林青", nickname: "竹叶", member_number: "ZX001" },
    summary: { score: 3.8, reviewer_count: 2, activity_count: 3, review_count: 3, eligible_for_publication: true, latest_review_at: "2026-11-16T10:00:00Z", sample_status: "ready" },
    operational_score: { score: 4.9, status: "published", source: "manual", internal_note: "会员运营记录。", published_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-02T10:00:00Z", published_by_name: "管理员甲", updated_by_name: "管理员乙" },
    reviewer_summaries: [
      { reviewer_id: detailReviewerIds[0], reviewer_name: "张同学", reviewer_nickname: "小竹", score: 4.5, review_count: 2, activity_count: 2, latest_review_at: "2026-11-15T10:00:00Z" },
      { reviewer_id: detailReviewerIds[1], reviewer_name: "李同学", reviewer_nickname: null, score: 3, review_count: 1, activity_count: 1, latest_review_at: "2026-11-16T10:00:00Z" },
    ],
    activity_summaries: detailRoundIds.map((id, i) => ({ round_id: id, round_name: names[i], activity_start: "2026-11-01", activity_end: "2026-11-02", review_count: i < 3 ? 1 : 0,
      invalid_review_count: 0, reviewer_count: i < 3 ? 1 : 0, average_score: i < 3 ? [5, 4, 3][i] : null,
      registration_status: i === 3 ? "cancelled" : "active", in_review_roster: true, roster_included: true, roster_source: "registered" })),
    reviews: [5, 4, 3].map((score, i) => ({ review_id: `30000000-0000-4000-8000-00000000000${i + 1}`, round_id: detailRoundIds[i], round_name: names[i], activity_start: "2026-11-01", activity_end: "2026-11-02",
      reviewer_id: detailReviewerIds[i === 2 ? 1 : 0], reviewer_name: i === 2 ? "李同学" : "张同学", reviewer_nickname: i === 2 ? null : "小竹", score, comment: i === 0 ? "交流时很照顾新成员。" : "",
      valid: true, created_at: "2026-11-14T10:00:00Z", updated_at: "2026-11-16T10:00:00Z", latest_invalidation_reason: null as string | null, invalidated_at: null as string | null })),
    total: 3, page: 1, page_size: 20, validity: "valid", round_id: null as string | null, can_view_member_number: true,
  }
}
