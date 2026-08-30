import { describe, expect, it } from "vitest"
import {
  buildMemberDirectoryUrl,
  canRestoreMemberAudit,
  formatMemberValue,
  hasRestorableMemberAuditSnapshot,
  memberLifecycleAvailability,
  normalizeMember360Tab,
  parseMemberDirectoryPage,
} from "./member-center-utils"

describe("member directory filters", () => {
  it("resets page when a filter changes", () => {
    expect(buildMemberDirectoryUrl("page=4&status=approved", "profileStage", "in_progress"))
      .toBe("/admin/members?status=approved&profileStage=in_progress")
  })

  it("removes all-valued filters and resets page", () => {
    expect(buildMemberDirectoryUrl("page=2&status=approved", "status", "all"))
      .toBe("/admin/members")
  })

  it("retains filters while paging", () => {
    expect(buildMemberDirectoryUrl("status=pending", "page", "3"))
      .toBe("/admin/members?status=pending&page=3")
  })

  it("supports canonical source and account filters", () => {
    expect(buildMemberDirectoryUrl("source=line&page=7", "accountStatus", "unbound"))
      .toBe("/admin/members?source=line&accountStatus=unbound")
    expect(buildMemberDirectoryUrl("accountStatus=active", "source", "import"))
      .toBe("/admin/members?accountStatus=active&source=import")
  })
})

describe("member directory pagination", () => {
  it("normalizes invalid and negative page values", () => {
    expect(parseMemberDirectoryPage(undefined)).toBe(1)
    expect(parseMemberDirectoryPage("not-a-number")).toBe(1)
    expect(parseMemberDirectoryPage("-4")).toBe(1)
    expect(parseMemberDirectoryPage("3")).toBe(3)
  })
})

describe("member value formatting", () => {
  it("does not collapse null and false", () => {
    expect(formatMemberValue(null)).toBe("未填写（null）")
    expect(formatMemberValue(false)).toBe("否（false）")
    expect(formatMemberValue(true)).toBe("是（true）")
  })
})

describe("member audit permissions", () => {
  it("requires both the super_admin role and RPC capability", () => {
    expect(canRestoreMemberAudit("admin", true)).toBe(false)
    expect(canRestoreMemberAudit("super_admin", false)).toBe(false)
    expect(canRestoreMemberAudit("super_admin", true)).toBe(true)
  })

  it("does not offer restore when the event has no previous row snapshot", () => {
    expect(hasRestorableMemberAuditSnapshot({})).toBe(false)
    expect(hasRestorableMemberAuditSnapshot(null)).toBe(false)
    expect(hasRestorableMemberAuditSnapshot({ full_name: "旧姓名" })).toBe(true)
  })
})

describe("member lifecycle permissions", () => {
  it("treats closed as terminal and only reactivates suspended accounts", () => {
    expect(memberLifecycleAvailability("suspended", null)).toMatchObject({ canSuspend: false, canReactivate: true, canClose: true })
    expect(memberLifecycleAvailability("closed", "2026-08-30T00:00:00Z")).toEqual({
      canSuspend: false,
      canReactivate: false,
      canClose: false,
      canAnonymize: false,
    })
  })
})

describe("member 360 tabs", () => {
  it("falls back to overview for unknown tabs", () => {
    expect(normalizeMember360Tab("unknown")).toBe("overview")
    expect(normalizeMember360Tab("audit")).toBe("audit")
  })
})
