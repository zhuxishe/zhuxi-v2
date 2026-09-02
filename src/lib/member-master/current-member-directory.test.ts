import { describe, expect, it } from "vitest"
import { normalizeCurrentMemberDirectoryFilters } from "./current-member-directory"

describe("current member directory filters", () => {
  it("defaults to active current accounts", () => {
    expect(normalizeCurrentMemberDirectoryFilters({})).toEqual({
      status: "all",
      accountStatus: "active",
      profileStage: "all",
      recordSource: "all",
    })
  })

  it("keeps supported current lifecycle filters", () => {
    expect(normalizeCurrentMemberDirectoryFilters({
      status: "inactive",
      accountStatus: "suspended",
      profileStage: "complete",
      source: "admin",
    })).toEqual({
      status: "inactive",
      accountStatus: "suspended",
      profileStage: "complete",
      recordSource: "admin",
    })
  })

  it.each([
    { accountStatus: "unbound" },
    { source: "legacy" },
    { source: "import" },
  ])("rejects historical directory input: %o", (input) => {
    const filters = normalizeCurrentMemberDirectoryFilters(input)
    expect(filters.accountStatus).toBe("active")
    expect(filters.recordSource).toBe("all")
  })
})
