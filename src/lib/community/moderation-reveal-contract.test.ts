import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  resolve(process.cwd(), "src/app/admin/community/moderation/actions.ts"),
  "utf8",
)
const revealSection = source.slice(
  source.indexOf("export async function revealCommunityReportAuthor"),
  source.indexOf("export async function applyCommunitySanction"),
)

describe("anonymous community author reveal contract", () => {
  it("requires super_admin and preserves the authenticated session RPC context", () => {
    expect(revealSection).toContain('admin.role !== "super_admin"')
    expect(revealSection).toContain("await createServerClient()")
    expect(revealSection).not.toContain("createAdminClient()")
    expect(revealSection).not.toContain("p_admin_user_id")
  })

  it("binds every anonymous reveal to the pending report and audit reason", () => {
    expect(revealSection).toContain("p_report_id: reportId")
    expect(revealSection).toContain("p_reason: reason")
  })
})
