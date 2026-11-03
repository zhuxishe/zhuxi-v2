import { describe, expect, it } from "vitest"
import { buildSavedMatchingReview, matchingReviewPublicationSignature, savedMatchingReviewWorkbookData, type SavedReviewCapture } from "./session-review"
import type { BoardSourceRow } from "./board-types"

const slot = "2026-11-07_下午"
const availability = { "2026-11-07": ["下午", "晚上"], "2026-11-08": ["上午"] }
function row(id: string, ids: string[], rank: number): BoardSourceRow {
  return { id, status: "draft", member_a_id: ids[0], member_b_id: ids.length === 2 ? ids[1] : null,
    group_members: ids.length > 2 ? ids : null, best_slot: slot, rank, total_score: 70, score_breakdown: { private: "PRIVATE-SCORE" }, game_type: ids.length === 2 ? "双人" : "多人" }
}
function fixture(): SavedReviewCapture {
  const ids = Array.from({ length: 9 }, (_, index) => String(index + 1))
  return { base_revision: "saved-revision", session_status: "draft", cohort_member_ids: ids,
    capture: { captured_at: "2026-11-02T02:00:00Z", source: { submissions: ids.map((id) => ({ member_id: id,
      availability, game_type_pref: "都可以", gender_pref: "都可以", message: `notes-${id}`,
      member: { id, member_number: `ZXS_${id}`, member_identity: { full_name: `Current ${id}`, nickname: `Nick ${id}`, private: "PRIVATE-PROFILE" } },
      import_metadata: { source: "legacy", normalized_name: id, raw_notes: `import-${id}`, legacy_profile: { full_name: "PRIVATE-OLD-NAME" } },
    })), blacklist: ["PRIVATE-BLACKLIST"] } },
    results: [row("multi", ["3", "4", "5", "6"], 1), row("duo", ["1", "2"], 2), { ...row("cancelled", ["7", "8"], 3), status: "cancelled" }],
    layout: { multiMode: "grouped", waitingDuoIds: ["7"], brokenPairs: [], waitingMultiIds: ["8"], multiPoolSlot: slot, smallGroupMemberIds: [["6", "5", "4", "3"]] } }
}
const sources = (data: SavedReviewCapture) => (data.capture as { source: { submissions: Array<Record<string, any>> } }).source.submissions

describe("saved publication review projection", () => {
  it("uses saved assignments, labels every group, and separates waiting from unmatched people", () => {
    const review = buildSavedMatchingReview("session", fixture(), true)
    expect(review.groups.map((group) => [group.label, group.members.length])).toEqual([["双人 01", 2], ["多人 01", 4]])
    expect(review.groups[1].groupKind).toBe("small")
    expect(review.summary).toEqual({ total: 9, duoGroups: 1, multiGroups: 1, matched: 6, waitingDuo: 1, waitingMulti: 1, unmatched: 1 })
    expect(review.waitingDuo[0].id).toBe("7"); expect(review.waitingMulti[0].id).toBe("8"); expect(review.unmatched[0].id).toBe("9")
    expect(review.issues).toContain("仍有多人候选尚未分组，请完成安排或移至未匹配池后再发布。")
    expect(JSON.stringify(review)).not.toContain("PRIVATE")
    expect(JSON.stringify(review)).not.toContain("notes-")
  })
  it("keeps an unsplit legacy pool as one saved group, never infers 4–6 recommendations", () => {
    const data = fixture(); data.layout = null; data.results = [row("pool", data.cohort_member_ids, 1)]
    const review = buildSavedMatchingReview("session", data, true)
    expect(review.groups).toHaveLength(1)
    expect(review.groups[0].members).toHaveLength(9)
    expect(review.groups[0].groupKind).toBeUndefined()
    expect(review.summary.waitingMulti).toBe(0)
  })
  it.each([3, 7])("accepts an explicitly saved human-adjusted %s-person small group", (size) => {
    const data = fixture(), ids = data.cohort_member_ids.slice(0, size)
    data.results = [row("manual", ids, 1)]
    data.layout = { waitingDuoIds: [], brokenPairs: [], multiMode: "grouped", smallGroupMemberIds: [ids], manualSmallGroupMemberIds: [[...ids].reverse()] }
    const review = buildSavedMatchingReview("session", data, true)
    expect(review.groups[0]).toMatchObject({ groupKind: "small", manuallyAdjusted: true })
    expect(review.issues).toEqual([])
    data.layout.manualSmallGroupMemberIds = [ids.slice(1)]
    expect(buildSavedMatchingReview("session", data, true).issues).toContain("有4–6人小组的人数不符合要求，请调整并保存。")
    data.layout.manualSmallGroupMemberIds = [ids.map(() => ids[0])]
    expect(buildSavedMatchingReview("session", data, true).issues).toContain("有4–6人小组的人数不符合要求，请调整并保存。")
  })
  it("projects only the explicit public message, never internal member or audit text", () => {
    const data = fixture()
    data.layout!.unmatchedMessage = "  后续将继续协调。\n请留意通知。  "
    const review = buildSavedMatchingReview("session", data, true)
    expect(review.unmatchedMessage).toBe("后续将继续协调。\n请留意通知。")
    expect(buildSavedMatchingReview("session", fixture(), true).unmatchedMessage).toBeNull()
    expect(JSON.stringify(review)).not.toContain("notes-")
  })
  it("uses the database's exact public-message recipients instead of all unassigned players", () => {
    const data = fixture()
    data.layout!.unmatchedMessage = "后续继续协调"
    data.unmatched_message_recipient_ids = ["9"]
    const review = buildSavedMatchingReview("session", data, true)
    expect(review.messageRecipients).toEqual([{ id: "9", name: "Current 9", memberNumber: "ZXS_9" }])
    expect(review.waitingDuo[0].id).toBe("7")
    data.unmatched_message_recipient_ids = []
    expect(buildSavedMatchingReview("session", data, true).messageRecipients).toEqual([])
  })
  it.each([{ ids: ["1"] }, { ids: ["8"] }, { ids: ["outside"] }, { ids: ["9", "9"] }])("rejects invalid message recipients $ids", ({ ids }) => {
    const data = fixture(); data.unmatched_message_recipient_ids = ids
    expect(() => buildSavedMatchingReview("session", data, true)).toThrow("接收名单")
  })
  it("does not confuse new result version zero with a withdrawn session's expected publication version", () => {
    const data = fixture()
    data.results = data.results.map((result) => ({ ...result, publication_version: 0 }))
    expect(buildSavedMatchingReview("session", data, true).publicationVersion).toBeNull()
    data.session_status = "confirmed"
    data.results = data.results.map((result) => ({ ...result, publication_version: 2 }))
    expect(buildSavedMatchingReview("session", data, true).publicationVersion).toBe(2)
  })
  it("reads only the whole-group current intersection and preserves the saved recommendation", () => {
    const data = fixture(); sources(data)[0].availability = { "2026-11-07": ["晚上"] }
    const review = buildSavedMatchingReview("session", data, true)
    expect(review.groups[0]).toMatchObject({ recommendedSlot: slot, commonSlots: ["2026-11-07_晚上"], timeStatus: "ready" })
    expect(review.issues).toContain("部分分组的推荐时间已不在全员共同时间内，请调整并保存。")
    expect(review.groups[1].commonSlots).toEqual([slot, "2026-11-07_晚上", "2026-11-08_上午"])
  })
  it.each(["missing", "cancelled", "ambiguous", "malformed"])("marks %s current answers unavailable instead of pretending no common time", (mode) => {
    const data = fixture(), rows = sources(data)
    if (mode === "missing") rows.splice(0, 1)
    if (mode === "cancelled") rows[0].cancelled_at = "2026-11-01T00:00:00Z"
    if (mode === "ambiguous") rows.push(structuredClone(rows[0]))
    if (mode === "malformed") rows[0].availability = { bad: ["not-a-period"] }
    const review = buildSavedMatchingReview("session", data, true)
    expect(review.groups[0]).toMatchObject({ commonSlots: [], timeStatus: "unavailable" })
  })
  it("ordinary admins get membership and saved recommendation without raw/common availability", () => {
    const review = buildSavedMatchingReview("session", fixture(), false)
    expect(review.canViewTimes).toBe(false)
    expect(review.groups[0]).toMatchObject({ recommendedSlot: slot, commonSlots: [], timeStatus: "hidden" })
    expect(JSON.stringify(review)).not.toContain("2026-11-08")
    expect(JSON.stringify(review)).not.toContain("PRIVATE")
  })
  it("reports duplicates and incomplete saved groups without silently hiding them", () => {
    const data = fixture(); data.results.push(row("dup", ["1", "3"], 4))
    const review = buildSavedMatchingReview("session", data, true)
    expect(review.groups).toHaveLength(3)
    expect(review.issues).toContain("已保存结果包含不完整或重复的分组成员，请核对后再发布。")
  })
  it("does not reconstruct erased identity, answer or note from residual source fields", () => {
    const data = fixture(); sources(data)[0].member.anonymized_at = "2026-11-01T00:00:00Z"
    const review = buildSavedMatchingReview("session", data, true), workbook = savedMatchingReviewWorkbookData(data, review)
    expect(review.groups[0].members[0]).toEqual({ id: "1", name: "已注销成员", memberNumber: null })
    expect(review.groups[0].timeStatus).toBe("unavailable")
    expect(workbook.submissions.find((person) => person.member_id === "1")).toEqual({ member_id: "1" })
    expect(JSON.stringify(workbook)).not.toContain("notes-1")
    expect(JSON.stringify(workbook)).not.toContain("import-1")
  })
  it("builds workbook names and current answers from the same capture and excludes other cohort data", () => {
    const data = fixture(); sources(data).push({ ...sources(data)[0], member_id: "outside", message: "OUTSIDE" })
    const review = buildSavedMatchingReview("session", data, true), workbook = savedMatchingReviewWorkbookData(data, review)
    expect(workbook.members).toHaveLength(9)
    expect(workbook.members[0].member_identity.full_name).toBe("Current 1")
    expect(workbook.results).toHaveLength(2)
    expect(workbook.submissions[0].availability).toEqual(availability)
    expect(JSON.stringify(workbook)).not.toContain("PRIVATE-OLD-NAME")
    expect(JSON.stringify(workbook)).not.toContain("OUTSIDE")
  })
  it("projects only current personal gender into export data, not partner preference or historical import fields", () => {
    const data = fixture()
    sources(data)[0].member.member_identity.gender = "male"
    sources(data)[0].gender_pref = "女"
    sources(data)[0].import_metadata.legacy_profile.gender = "女"
    sources(data)[1].member.member_identity.gender = "female"
    sources(data)[2].member.member_identity.gender = "other"
    sources(data)[3].member.member_identity.gender = "UNKNOWN_PRIVATE_VALUE"
    const review = buildSavedMatchingReview("session", data, true)
    const exported = savedMatchingReviewWorkbookData(data, review)
    const genderOf = (id: string) => exported.members.find((member) => member.id === id)!.member_identity.gender
    expect(["1", "2", "3", "4", "5"].map(genderOf)).toEqual(["male", "female", "other", null, null])
    expect(review.groups.flatMap((group) => group.members).every((member) => !("gender" in member))).toBe(true)
    expect(JSON.stringify(exported.members)).not.toContain("UNKNOWN_PRIVATE_VALUE")
    expect(exported.diagnostics).toEqual([])
  })
  it("accepts single-record relation arrays but does not guess missing or ambiguous personal gender", () => {
    const data = fixture()
    sources(data)[0].member = [{ member_identity: [{ full_name: "Current array member", gender: "female" }] }]
    sources(data)[1].member = null
    sources(data)[2].member = { member_identity: [{ gender: "male" }, { gender: "female" }] }
    sources(data)[3].member.member_identity.gender = "male"
    sources(data).push({ ...sources(data)[3], member: { member_identity: { gender: "female" } } })
    const exported = savedMatchingReviewWorkbookData(data, buildSavedMatchingReview("session", data, true))
    const genderOf = (id: string) => exported.members.find((member) => member.id === id)!.member_identity.gender
    expect(["1", "2", "3", "4"].map(genderOf)).toEqual(["female", null, null, null])
  })
  it("does not recover personal gender for an erased member from residual source or import data", () => {
    const data = fixture()
    sources(data)[0].member.anonymized_at = "2026-11-03T00:00:00Z"
    sources(data)[0].member.member_identity.gender = "female"
    sources(data)[0].import_metadata.legacy_profile.gender = "女"
    const exported = savedMatchingReviewWorkbookData(data, buildSavedMatchingReview("session", data, true))
    expect(exported.members.find((member) => member.id === "1")).toMatchObject({
      anonymized_at: "2026-11-03T00:00:00Z", member_identity: { gender: null, full_name: "已注销成员" },
    })
    expect(exported.submissions.find((row) => row.member_id === "1")).toEqual({ member_id: "1" })
  })
  it("fails closed when the capture is missing its current source", () => {
    const data = fixture(); data.capture = { source: {} }
    expect(() => buildSavedMatchingReview("session", data, true)).toThrow("无法完整读取")
  })
})

describe("review signature binds the published fields", () => {
  it("binds the public message while retaining the legacy signature for an empty message", () => {
    const data = fixture(), before = matchingReviewPublicationSignature("session", data.results, data.capture)
    expect(matchingReviewPublicationSignature("session", data.results, data.capture, " \n ")).toBe(before)
    const note = matchingReviewPublicationSignature("session", data.results, data.capture, "后续联系")
    expect(note).not.toBe(before)
    expect(matchingReviewPublicationSignature("session", data.results, data.capture, " 后续联系 ")).toBe(note)
    expect(matchingReviewPublicationSignature("session", data.results, data.capture, "新的安排")).not.toBe(note)
    data.layout!.unmatchedMessage = "后续联系"
    expect(buildSavedMatchingReview("session", data, true).publicationSignature).toBe(note)
  })
  it("binds the exact sorted recipient plan when a message is present", () => {
    const data = fixture()
    const sign = (message: string, ids?: string[]) => matchingReviewPublicationSignature("session", data.results, data.capture, message, ids)
    const before = sign("后续联系", ["7", "9"])
    expect(sign("后续联系", ["9", "7"])).toBe(before)
    expect(sign("后续联系", ["9"])).not.toBe(before)
    expect(sign("后续联系", [])).not.toBe(before)
    expect(sign("", ["7", "9"])).toBe(sign(""))
    expect(() => sign("后续联系", ["9", "9"])).toThrow("接收名单")
    data.layout!.unmatchedMessage = "后续联系"; data.unmatched_message_recipient_ids = ["9", "7"]
    expect(buildSavedMatchingReview("session", data, true).publicationSignature).toBe(before)
  })
  it("is stable across source/result ordering, legacy slot separators, display and score metadata", () => {
    const data = fixture(), first = matchingReviewPublicationSignature("session", data.results, data.capture)
    data.results.reverse(); data.results[1].best_slot = "2026-11-07 下午"
    sources(data).reverse(); sources(data)[0].member.member_identity.full_name = "Renamed"
    sources(data).forEach((person) => { person.availability = { "2026-11-08": ["上午"], "2026-11-07": ["晚上", "下午"] } })
    expect(matchingReviewPublicationSignature("session", data.results, data.capture)).toBe(first)
  })
  it.each(["membership", "recommendation", "current time", "result id", "session"])("rejects changed %s", (change) => {
    const data = fixture(), first = matchingReviewPublicationSignature("session", data.results, data.capture)
    if (change === "membership") data.results[1].member_b_id = "7"
    if (change === "recommendation") data.results[1].best_slot = "2026-11-07_晚上"
    if (change === "current time") sources(data)[0].availability = { "2026-11-07": ["下午"] }
    if (change === "result id") data.results[1].id = "replacement"
    expect(matchingReviewPublicationSignature(change === "session" ? "another" : "session", data.results, data.capture)).not.toBe(first)
  })
})
