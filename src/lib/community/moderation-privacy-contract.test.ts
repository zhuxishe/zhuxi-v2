import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const dataSource = readFileSync(
  join(process.cwd(), "src/app/admin/community/data.ts"),
  "utf8",
)
const moderationPageSource = readFileSync(
  join(process.cwd(), "src/app/admin/community/moderation/page.tsx"),
  "utf8",
)
const moderationQueueSource = readFileSync(
  join(process.cwd(), "src/components/admin/community/ModerationQueue.tsx"),
  "utf8",
)
const moderationDetailSource = readFileSync(
  join(process.cwd(), "src/components/admin/community/ModerationReportDetail.tsx"),
  "utf8",
)

function sourceBetween(startMarker: string, endMarker: string) {
  const start = dataSource.indexOf(startMarker)
  expect(start, `missing source marker: ${startMarker}`).toBeGreaterThanOrEqual(0)
  const end = dataSource.indexOf(endMarker, start)
  expect(end, `missing source marker: ${endMarker}`).toBeGreaterThan(start)
  return dataSource.slice(start, end)
}

describe("community moderation privacy contract", () => {
  it("does not expose an anonymous-author member-number filter", () => {
    const reportFilters = sourceBetween(
      "export interface CommunityReportFilters",
      "export async function fetchCommunityReports",
    )

    expect(reportFilters).not.toContain("targetMemberNumber")
    expect(moderationPageSource).not.toContain("raw.author")
    expect(moderationPageSource).not.toContain("targetMemberNumber")
    expect(moderationQueueSource).not.toContain('name="author"')
    expect(moderationQueueSource).not.toContain("内容作者会员编号")
  })

  it("keeps report lookup away from private author mappings", () => {
    const reportLookup = sourceBetween(
      "export async function fetchCommunityReports",
      "export async function fetchCommunityReportDetail",
    )

    expect(reportLookup).not.toContain('.schema("private")')
    expect(reportLookup).not.toContain("community_post_authors")
    expect(reportLookup).not.toContain("community_comment_authors")
    expect(reportLookup).not.toContain("community_profile_members")
    expect(reportLookup).not.toContain("targetMemberNumber")

    expect(reportLookup).toContain("reporterMemberNumber")
    expect(reportLookup).toContain('query.eq("reporter_member_id", reporter.id)')
  })

  it("only claims an audit record for anonymous content author reveals", () => {
    expect(moderationDetailSource).toMatch(
      /report\.target_type === "profile"\s*\? "关联会员已读取"\s*: "作者身份已读取；匿名作者查看行为已写入审计记录"/,
    )
  })
})
