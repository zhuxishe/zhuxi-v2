import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PreparedImportRow } from "./round-import-types"

const mocks = vi.hoisted(() => ({
  loadRoundImportContext: vi.fn(),
  supportsImportMetadataColumn: vi.fn(),
  resolveImportRows: vi.fn(),
}))

vi.mock("./round-import-context", () => ({
  loadRoundImportContext: mocks.loadRoundImportContext,
}))
vi.mock("./import-metadata-column", () => ({
  supportsImportMetadataColumn: mocks.supportsImportMetadataColumn,
}))
vi.mock("./round-import-resolver", () => ({
  resolveImportRows: mocks.resolveImportRows,
}))

import { importRoundWorkbook } from "./round-import-service"
import type { RoundImportAuditOptions, RoundImportAuditRequest } from "./round-import-service"

const preparedRow: PreparedImportRow = {
  rowNumber: 2,
  name: "Sensitive Person Name",
  normalizedName: "sensitivepersonname",
  gameTypePref: "双人",
  rawFirstChoice: "双人",
  rawSecondChoice: null,
  genderPref: "都可以",
  availability: { "2026-08-30": ["下午"] },
  scriptActivityPref: null,
  message: "Sensitive free text",
  importMetadata: {
    source: "temp",
    normalized_name: "sensitivepersonname",
    raw_first_choice: "双人",
    raw_second_choice: null,
    script_activity_pref: null,
    raw_notes: "Sensitive free text",
    warnings: [],
  },
  source: "temp",
  existingMemberId: null,
  legacyProfile: null,
  manualGender: "other",
}

function createImportDb() {
  const deleteCreated = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn((table: string) => {
    if (table === "members") {
      return {
        select: vi.fn((columns: string) => ({
          like: vi.fn().mockResolvedValue({
            data: columns === "*" ? [] : [],
            error: null,
          }),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: { id: "created-member-id" },
              error: null,
            }),
          })),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
          in: deleteCreated,
        })),
      }
    }
    if (table === "member_identity") {
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    }
    throw new Error(`Unexpected table in test: ${table}`)
  })

  return { db: { from }, deleteCreated }
}

function createReplacementDb(submissionInsertError: unknown = null) {
  const previousMember = {
    id: "previous-import-member",
    member_number: "IMP-round-id-001",
    record_source: "import",
  }
  const deletePreviousMember = vi.fn().mockResolvedValue({ error: null })
  const restorePreviousMember = vi.fn().mockResolvedValue({ error: null })
  const deleteSubmissions = vi.fn().mockResolvedValue({ error: null })
  const insertSubmissions = submissionInsertError
    ? vi.fn()
      .mockResolvedValueOnce({ error: submissionInsertError })
      .mockResolvedValue({ error: null })
    : vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn((table: string) => {
    if (table === "members") {
      return {
        select: vi.fn((columns: string) => ({
          like: vi.fn().mockResolvedValue({
            data: columns === "*" ? [previousMember] : [{ member_number: previousMember.member_number }],
            error: null,
          }),
        })),
        insert: restorePreviousMember,
        delete: vi.fn(() => ({ in: deletePreviousMember })),
      }
    }
    if (["member_identity", "member_interests", "member_dynamic_stats"].includes(table)) {
      return {
        select: vi.fn(() => ({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      }
    }
    if (table === "match_round_submissions") {
      return {
        delete: vi.fn(() => ({
          eq: deleteSubmissions,
        })),
        insert: insertSubmissions,
      }
    }
    throw new Error(`Unexpected table in test: ${table}`)
  })

  return {
    db: { from },
    deletePreviousMember,
    restorePreviousMember,
    deleteSubmissions,
    insertSubmissions,
  }
}

function validAudit(
  recordEvent: (request: RoundImportAuditRequest) => Promise<void>,
): RoundImportAuditOptions {
  return {
    reason: "根据本轮报名表重新导入成员",
    file: {
      sha256: "a".repeat(64),
      sizeBytes: 128,
      extension: "xlsx" as const,
    },
    recordEvent,
  }
}

describe("round Excel member import audit orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.supportsImportMetadataColumn.mockResolvedValue(true)
    mocks.resolveImportRows.mockReturnValue([preparedRow])
  })

  it("aborts on create-audit failure and audibly compensates the service-created member", async () => {
    const { db, deleteCreated } = createImportDb()
    mocks.loadRoundImportContext.mockResolvedValue({
      db,
      parsedRows: [preparedRow],
      currentMembers: [],
      legacyMembers: [],
      existingSubs: [],
    })
    const recordEvent = vi.fn<(request: RoundImportAuditRequest) => Promise<void>>()
      .mockRejectedValueOnce(new Error("audit unavailable"))
      .mockResolvedValue(undefined)

    await expect(importRoundWorkbook(
      "round-sensitive-id",
      Buffer.from("not-a-real-workbook"),
      validAudit(recordEvent),
      {},
      { "2": "other" },
    )).rejects.toThrow("audit unavailable")

    expect(deleteCreated).toHaveBeenCalledWith("id", ["created-member-id"])
    expect(recordEvent.mock.calls.map(([event]) => [
      event.operation,
      event.metadata.phase,
      event.metadata.write_stage,
      event.metadata.service_write_performed,
    ])).toEqual([
      ["create", "apply", "after_service_write", true],
      ["delete", "compensation", "before_service_write", false],
      ["delete", "compensation", "after_service_write", true],
    ])

    const serializedMetadata = JSON.stringify(recordEvent.mock.calls.map(([event]) => event.metadata))
    expect(serializedMetadata).toContain("round-sensitive-id")
    expect(serializedMetadata).toContain('"number":2')
    expect(serializedMetadata).toContain('"sha256"')
    expect(serializedMetadata).not.toContain("Sensitive Person Name")
    expect(serializedMetadata).not.toContain("Sensitive free text")
    expect(serializedMetadata).not.toContain(".xlsx")
  })

  it("rejects an invalid human reason before loading or mutating import data", async () => {
    await expect(importRoundWorkbook(
      "round-id",
      Buffer.alloc(0),
      { ...validAudit(vi.fn(async (_request: RoundImportAuditRequest) => undefined)), reason: "短因" },
    )).rejects.toThrow("导入原因需为 4-500 个字符")

    expect(mocks.loadRoundImportContext).not.toHaveBeenCalled()
  })

  it("records destructive replacement both before and after the service write", async () => {
    const { db, deletePreviousMember, restorePreviousMember } = createReplacementDb()
    const currentRow: PreparedImportRow = {
      ...preparedRow,
      source: "current",
      existingMemberId: "current-member-id",
      manualGender: null,
      importMetadata: { ...preparedRow.importMetadata, source: "current" },
    }
    mocks.loadRoundImportContext.mockResolvedValue({
      db,
      parsedRows: [currentRow],
      currentMembers: [],
      legacyMembers: [],
      existingSubs: [{
        id: "prior-submission-id",
        round_id: "round-id",
        member_id: "current-member-id",
        game_type_pref: "多人",
        gender_pref: "女",
        availability: { "2026-08-20": ["上午", "下午"] },
        message: "Prior sensitive free text",
        import_metadata: { raw_notes: "Prior private note" },
      }],
    })
    mocks.resolveImportRows.mockReturnValue([currentRow])
    const recordEvent = vi.fn(async (_request: RoundImportAuditRequest) => undefined)

    await expect(importRoundWorkbook(
      "round-id",
      Buffer.from("workbook"),
      validAudit(recordEvent),
    )).resolves.toMatchObject({ summary: { totalRows: 1, currentCount: 1 } })

    expect(deletePreviousMember).toHaveBeenCalledWith("id", ["previous-import-member"])
    expect(restorePreviousMember).not.toHaveBeenCalled()
    const relatedEvents = recordEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event.metadata.related_record?.entity === "match_round_submissions")
    expect(relatedEvents.map((event) => [
      event.memberId,
      event.operation,
      event.metadata.row.number,
      event.metadata.related_record?.snapshot_role,
      event.metadata.write_stage,
      event.metadata.service_write_performed,
    ])).toEqual([
      ["current-member-id", "submission_replace", 2, "before", "before_service_write", false],
      ["current-member-id", "submission_replace", 2, "after", "after_service_write", true],
    ])
    expect(relatedEvents[0].metadata.related_record).not.toHaveProperty("snapshot")
    expect(relatedEvents[1].metadata.related_record).not.toHaveProperty("snapshot")
    expect(relatedEvents[1].metadata.related_record?.changed_fields).toEqual([
      "game_type_pref",
      "gender_pref",
      "availability",
      "interest_tags",
      "social_style",
      "message",
    ])
    const serializedMetadata = JSON.stringify(relatedEvents.map((event) => event.metadata))
    expect(serializedMetadata).not.toContain("Prior sensitive free text")
    expect(serializedMetadata).not.toContain("Sensitive free text")
    expect(serializedMetadata).not.toContain("2026-08-20")
    expect(serializedMetadata).not.toContain("2026-08-30")
    expect(serializedMetadata).not.toContain("Prior private note")
    expect(serializedMetadata).not.toContain("prior-submission-id")
  })

  it("restores and attests the prior import member when a later submission write fails", async () => {
    const { db, restorePreviousMember } = createReplacementDb({ message: "submission insert failed" })
    const currentRow: PreparedImportRow = {
      ...preparedRow,
      source: "current",
      existingMemberId: "current-member-id",
      manualGender: null,
      importMetadata: { ...preparedRow.importMetadata, source: "current" },
    }
    mocks.loadRoundImportContext.mockResolvedValue({
      db,
      parsedRows: [currentRow],
      currentMembers: [],
      legacyMembers: [],
      existingSubs: [],
    })
    mocks.resolveImportRows.mockReturnValue([currentRow])
    const recordEvent = vi.fn(async (_request: RoundImportAuditRequest) => undefined)

    await expect(importRoundWorkbook(
      "round-id",
      Buffer.from("workbook"),
      validAudit(recordEvent),
    )).rejects.toThrow("submission insert failed")

    expect(restorePreviousMember).toHaveBeenCalledWith([
      expect.objectContaining({ id: "previous-import-member", record_source: "import" }),
    ])
    const memberEvents = recordEvent.mock.calls.map(([event]) => event)
    expect(memberEvents.filter((event) => !event.metadata.related_record).map((event) => [
      event.operation,
      event.metadata.phase,
      event.metadata.write_stage,
      event.metadata.service_write_performed,
    ])).toEqual([
      ["delete", "apply", "before_service_write", false],
      ["delete", "apply", "after_service_write", true],
      ["restore", "compensation", "after_compensation", true],
    ])
    expect(memberEvents.filter((event) => event.metadata.related_record).map((event) => [
      event.memberId,
      event.metadata.related_record?.snapshot_role,
      event.metadata.related_record?.changed_fields,
      event.metadata.related_record?.compensation_succeeded,
    ])).toEqual([
      [
        "current-member-id",
        "before",
        ["submission_presence", "game_type_pref", "gender_pref", "availability", "interest_tags", "social_style", "message"],
        undefined,
      ],
      ["current-member-id", "after_compensation_clear", [], true],
      ["current-member-id", "after_compensation", [], true],
    ])
  })

  it("clears newly inserted submissions before restoring the prior rows after an after-audit failure", async () => {
    const {
      db,
      deleteSubmissions,
      insertSubmissions,
    } = createReplacementDb()
    const currentRow: PreparedImportRow = {
      ...preparedRow,
      source: "current",
      existingMemberId: "current-member-id",
      manualGender: null,
      importMetadata: { ...preparedRow.importMetadata, source: "current" },
    }
    const priorSubmission = {
      id: "prior-submission-id",
      round_id: "round-id",
      member_id: "current-member-id",
      game_type_pref: "多人",
      gender_pref: "女",
      availability: { "2026-08-20": ["上午"] },
      message: "Prior sensitive free text",
      import_metadata: { raw_notes: "Prior private note" },
    }
    mocks.loadRoundImportContext.mockResolvedValue({
      db,
      parsedRows: [currentRow],
      currentMembers: [],
      legacyMembers: [],
      existingSubs: [priorSubmission],
    })
    mocks.resolveImportRows.mockReturnValue([currentRow])
    let rejectedAfterAudit = false
    const recordEvent = vi.fn(async (request: RoundImportAuditRequest) => {
      if (
        request.metadata.related_record?.snapshot_role === "after"
        && !rejectedAfterAudit
      ) {
        rejectedAfterAudit = true
        throw new Error("after audit unavailable")
      }
    })

    await expect(importRoundWorkbook(
      "round-id",
      Buffer.from("workbook"),
      validAudit(recordEvent),
    )).rejects.toThrow("after audit unavailable")

    expect(deleteSubmissions).toHaveBeenNthCalledWith(1, "round_id", "round-id")
    expect(deleteSubmissions).toHaveBeenNthCalledWith(2, "round_id", "round-id")
    expect(insertSubmissions).toHaveBeenCalledTimes(2)
    expect(insertSubmissions.mock.calls[1][0]).toEqual([priorSubmission])

    const relatedEvents = recordEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event.metadata.related_record)
    expect(relatedEvents.map((event) => [
      event.metadata.related_record?.snapshot_role,
      event.metadata.related_record?.compensation_step,
      event.metadata.related_record?.compensation_succeeded,
    ])).toEqual([
      ["before", undefined, undefined],
      ["after", undefined, undefined],
      ["after_compensation_clear", "clear_current", true],
      ["after_compensation", "restore_previous", true],
    ])
  })

  it("surfaces a compensation clear failure and does not attempt a conflicting restore", async () => {
    const { db, deleteSubmissions, insertSubmissions } = createReplacementDb()
    deleteSubmissions
      .mockReset()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "clear current submissions failed" } })
    const currentRow: PreparedImportRow = {
      ...preparedRow,
      source: "current",
      existingMemberId: "current-member-id",
      manualGender: null,
      importMetadata: { ...preparedRow.importMetadata, source: "current" },
    }
    mocks.loadRoundImportContext.mockResolvedValue({
      db,
      parsedRows: [currentRow],
      currentMembers: [],
      legacyMembers: [],
      existingSubs: [{
        round_id: "round-id",
        member_id: "current-member-id",
        game_type_pref: "多人",
      }],
    })
    mocks.resolveImportRows.mockReturnValue([currentRow])
    let rejectedAfterAudit = false
    const recordEvent = vi.fn(async (request: RoundImportAuditRequest) => {
      if (request.metadata.related_record?.snapshot_role === "after" && !rejectedAfterAudit) {
        rejectedAfterAudit = true
        throw new Error("after audit unavailable")
      }
    })

    await expect(importRoundWorkbook(
      "round-id",
      Buffer.from("workbook"),
      validAudit(recordEvent),
    )).rejects.toThrow("after audit unavailable；补偿失败：clear current submissions failed")

    expect(deleteSubmissions).toHaveBeenCalledTimes(2)
    expect(insertSubmissions).toHaveBeenCalledTimes(1)
    const compensationEvents = recordEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event.metadata.related_record?.compensation_step)
    expect(compensationEvents.map((event) => [
      event.metadata.related_record?.compensation_step,
      event.metadata.related_record?.compensation_succeeded,
    ])).toEqual([
      ["clear_current", false],
      ["restore_previous", false],
    ])
  })

  it("surfaces a prior-submission restore failure after clearing the new rows", async () => {
    const { db, deleteSubmissions, insertSubmissions } = createReplacementDb()
    insertSubmissions
      .mockReset()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "restore previous submissions failed" } })
    const currentRow: PreparedImportRow = {
      ...preparedRow,
      source: "current",
      existingMemberId: "current-member-id",
      manualGender: null,
      importMetadata: { ...preparedRow.importMetadata, source: "current" },
    }
    mocks.loadRoundImportContext.mockResolvedValue({
      db,
      parsedRows: [currentRow],
      currentMembers: [],
      legacyMembers: [],
      existingSubs: [{
        round_id: "round-id",
        member_id: "current-member-id",
        game_type_pref: "多人",
      }],
    })
    mocks.resolveImportRows.mockReturnValue([currentRow])
    let rejectedAfterAudit = false
    const recordEvent = vi.fn(async (request: RoundImportAuditRequest) => {
      if (request.metadata.related_record?.snapshot_role === "after" && !rejectedAfterAudit) {
        rejectedAfterAudit = true
        throw new Error("after audit unavailable")
      }
    })

    await expect(importRoundWorkbook(
      "round-id",
      Buffer.from("workbook"),
      validAudit(recordEvent),
    )).rejects.toThrow("after audit unavailable；补偿失败：restore previous submissions failed")

    expect(deleteSubmissions).toHaveBeenCalledTimes(2)
    expect(insertSubmissions).toHaveBeenCalledTimes(2)
    const compensationEvents = recordEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event.metadata.related_record?.compensation_step)
    expect(compensationEvents.map((event) => [
      event.metadata.related_record?.compensation_step,
      event.metadata.related_record?.compensation_succeeded,
    ])).toEqual([
      ["clear_current", true],
      ["restore_previous", false],
    ])
  })
})
