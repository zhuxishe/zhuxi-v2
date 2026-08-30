import { describe, expect, it } from "vitest"
import {
  buildMemberDirectoryRpcArgs,
  memberCenterErrorMessage,
  normalizeMemberAuditPageResponse,
  normalizeMemberDirectoryResponse,
  normalizeMember360Response,
} from "./member-center"

describe("memberCenterErrorMessage", () => {
  it("explains first-time identity creation requirements", () => {
    expect(memberCenterErrorMessage(new Error("MEMBER_MASTER_IDENTITY_REQUIRED_FIELDS_MISSING")))
      .toBe("首次建立基本信息时，请同时填写姓名、性别、年龄段、国籍和所在地")
    expect(memberCenterErrorMessage(new Error("MEMBER_MASTER_PAYLOAD_INVALID")))
      .toBe("资料格式无效，请检查字段内容后重试")
    expect(memberCenterErrorMessage(new Error("MEMBER_MASTER_RESTORE_NO_CHANGES")))
      .toBe("当前资料已与该历史版本一致，无需恢复")
    expect(memberCenterErrorMessage(new Error("MEMBER_MASTER_EVENT_NOT_RESTORABLE")))
      .toBe("该事件没有可恢复的历史版本")
  })
})

describe("normalizeMemberDirectoryResponse", () => {
  it("uses the database page metadata without slicing items in memory", () => {
    const result = normalizeMemberDirectoryResponse({
      page: 3,
      page_size: 2,
      total: 9,
      total_pages: 5,
      redacted_fields: ["member_number", "auth_email", "auth_providers"],
      items: [
        {
          member_id: "f049f125-e2c2-42ac-b0e7-096592c62d2b",
          full_name: "测试成员",
          status: "approved",
          auth_bound: true,
          has_legacy_record: true,
          legacy_record_count: 2,
          created_at: "2026-08-01T00:00:00Z",
          updated_at: "2026-08-02T00:00:00Z",
        },
      ],
    }, { page: 1, pageSize: 50 })

    expect(result.page).toBe(3)
    expect(result.pageSize).toBe(2)
    expect(result.total).toBe(9)
    expect(result.totalPages).toBe(5)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].authBound).toBe(true)
    expect(result.items[0].hasLegacyRecord).toBe(true)
    expect(result.items[0].legacyRecordCount).toBe(2)
    expect(result.redactedFields).toEqual(["member_number", "auth_email", "auth_providers"])
  })
})

describe("buildMemberDirectoryRpcArgs", () => {
  it("passes pagination and every filter to the database RPC", () => {
    expect(buildMemberDirectoryRpcArgs({
      page: 4,
      pageSize: 50,
      search: "  山田  ",
      status: "approved",
      accountStatus: "unbound",
      profileStage: "in_progress",
      recordSource: "line",
    })).toEqual({
      p_page: 4,
      p_page_size: 50,
      p_search: "山田",
      p_status: "approved",
      p_account_status: "unbound",
      p_profile_stage: "in_progress",
      p_record_source: "line",
    })
  })

  it("normalizes all-valued filters to null", () => {
    expect(buildMemberDirectoryRpcArgs({ page: 1, pageSize: 50, status: "all" }).p_status).toBeNull()
  })
})

describe("normalizeMember360Response", () => {
  it("keeps an absent account object separate from ordinary profile values", () => {
    const result = normalizeMember360Response({
      capabilities: { is_super_admin: false },
      member: {
        member_id: "f049f125-e2c2-42ac-b0e7-096592c62d2b",
        status: "pending",
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-02T00:00:00Z",
      },
      high_risk: null,
      interests: { accept_beginners: false, accept_cross_school: null },
      interview_evaluations: [],
      roles: [],
      legacy_records: [{ full_name: "旧档案姓名", claim_status: "unclaimed" }],
      audit: null,
    })

    expect(result.account).toBeNull()
    expect(result.audit).toBeNull()
    expect(result.interests?.accept_beginners).toBe(false)
    expect(result.interests?.accept_cross_school).toBeNull()
    expect(result.capabilities.redactedFields).toEqual([])
    expect(result.legacyRecords).toEqual([{ full_name: "旧档案姓名", claim_status: "unclaimed" }])
  })

  it("keeps permission redaction metadata separate from business nulls", () => {
    const result = normalizeMember360Response({
      capabilities: {
        is_super_admin: false,
        redacted_fields: ["account.member_number", "account.user_id", "quiz.answers"],
      },
      member: {
        member_id: "f049f125-e2c2-42ac-b0e7-096592c62d2b",
        status: "approved",
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-02T00:00:00Z",
      },
      account: { account_status: "active", auth_bound: true, member_number: null },
      quiz: { score_e: 10, answers: null },
      interview_evaluations: [],
      roles: [],
      audit: [],
    })

    expect(result.account?.accountStatus).toBe("active")
    expect(result.account?.memberNumber).toBeNull()
    expect(result.capabilities.redactedFields).toContain("account.member_number")
  })
})

describe("normalizeMemberAuditPageResponse", () => {
  it("keeps database pagination and redaction metadata for full-history traversal", () => {
    const result = normalizeMemberAuditPageResponse({
      member_id: "f049f125-e2c2-42ac-b0e7-096592c62d2b",
      page: 3,
      page_size: 100,
      total: 245,
      total_pages: 3,
      redacted_fields: ["audit.account_values"],
      items: [{ id: 1, section: "account", values_redacted: true }],
    }, {
      memberId: "f049f125-e2c2-42ac-b0e7-096592c62d2b",
      page: 1,
      pageSize: 100,
    })

    expect(result).toMatchObject({ page: 3, pageSize: 100, total: 245, totalPages: 3 })
    expect(result.items[0].values_redacted).toBe(true)
    expect(result.redactedFields).toEqual(["audit.account_values"])
  })
})
