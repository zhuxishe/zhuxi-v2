import { describe, expect, it } from "vitest"
import { approvalRetryIds, mergeApprovalResults } from "./approval-results"

describe("approval results across partial failures and retries", () => {
  it("retries only failed applicants and retains earlier successful results", () => {
    const first = mergeApprovalResults(["a", "b", "c"], [], [
      { id: "a", success: true }, { id: "b", success: false, error: "资料已变更" }, { id: "c", success: true },
    ])
    expect(approvalRetryIds(["a", "b", "c"], first)).toEqual(["b"])
    const second = mergeApprovalResults(["a", "b", "c"], first, [{ id: "b", success: true }])
    expect(second.every((result) => result.success)).toBe(true)
    expect(approvalRetryIds(["a", "b", "c"], second)).toEqual([])
  })

  it("never treats a missing response as success or a reason to repeat a successful approval", () => {
    const next = mergeApprovalResults(["a", "b"], [{ id: "a", success: true }], [])
    expect(next[0]).toEqual({ id: "a", success: true })
    expect(next[1].success).toBe(false)
    expect(next[1].error).toContain("未收到处理结果")
    expect(approvalRetryIds(["a", "b"], next)).toEqual(["b"])
  })

  it("ignores results for applicants outside the displayed confirmation", () => {
    expect(mergeApprovalResults(["a"], [], [{ id: "a", success: true }, { id: "other", success: true }]))
      .toEqual([{ id: "a", success: true }])
  })
})
