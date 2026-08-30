import { describe, expect, it } from "vitest"
import {
  buildMemberDirectoryUrl,
  canRestoreMemberAudit,
  formatMemberValue,
  hasRestorableMemberAuditSnapshot,
  memberAuditActionLabel,
  memberAuditSectionLabel,
  memberDisplayLabel,
  memberFieldLabel,
  memberLifecycleAvailability,
  MEMBER_360_TABS,
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
  it("uses concise Chinese labels without collapsing null and false", () => {
    expect(formatMemberValue(null)).toBe("未填写")
    expect(formatMemberValue(false)).toBe("否")
    expect(formatMemberValue(true)).toBe("是")
    expect(formatMemberValue([])).toBe("空列表")
  })

  it("translates known member values while preserving unknown technical values", () => {
    expect(memberDisplayLabel("active")).toBe("正常")
    expect(memberDisplayLabel("in_progress")).toBe("填写中")
    expect(memberDisplayLabel("super_admin")).toBe("超级管理员")
    expect(memberDisplayLabel("unknown_technical_value")).toBe("unknown_technical_value")
  })

  it("only translates enum fields and preserves free text exactly", () => {
    expect(formatMemberValue("active")).toBe("active")
    expect(formatMemberValue("active", "nickname")).toBe("active")
    expect(formatMemberValue(["admin", "open"], "interest_tags")).toBe("admin、open")
    expect(formatMemberValue("active", "account_status")).toBe("正常")
    expect(formatMemberValue("low", "risk_level")).toBe("低")
    expect(formatMemberValue("pending", "member_status")).toBe("待面试")
    expect(formatMemberValue("pending", "claim_status")).toBe("待审核")
    expect(formatMemberValue("confirmed_duplicate", "status")).toBe("已确认重复")
    expect(formatMemberValue("not_duplicate", "status")).toBe("已确认非重复")
    expect(formatMemberValue("merged", "status")).toBe("已合并")
  })

  it("uses Chinese field labels and preserves unknown database keys for diagnosis", () => {
    expect(memberFieldLabel("full_name")).toBe("姓名")
    expect(memberFieldLabel("account_status")).toBe("账号状态")
    expect(memberFieldLabel("member_status")).toBe("审批状态")
    expect(memberFieldLabel("unknown_database_key")).toBe("unknown_database_key")
  })

  it("translates known audit actions and sections", () => {
    expect(memberAuditActionLabel("profile_update")).toBe("更新个人资料")
    expect(memberAuditActionLabel("admin_restore")).toBe("恢复历史版本")
    expect(memberAuditActionLabel("unknown_audit_action")).toBe("unknown_audit_action")
    expect(memberAuditSectionLabel("identity")).toBe("基本与学业信息")
    expect(memberAuditSectionLabel("lifecycle")).toBe("账号生命周期")
    expect(memberAuditSectionLabel("unknown_audit_section")).toBe("unknown_audit_section")
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
  it("uses Chinese-first navigation labels", () => {
    expect(MEMBER_360_TABS.map((tab) => tab.label)).toEqual([
      "概览",
      "个人资料",
      "申请与核验",
      "活动与匹配",
      "社区与反馈",
      "变更审计",
    ])
  })

  it("falls back to overview for unknown tabs", () => {
    expect(normalizeMember360Tab("unknown")).toBe("overview")
    expect(normalizeMember360Tab("audit")).toBe("audit")
  })
})
