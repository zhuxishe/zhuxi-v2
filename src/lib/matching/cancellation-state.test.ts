import { describe, expect, it } from "vitest"
import { isCurrentCancellationRequest } from "./cancellation-state"

const current = {
  status: "confirmed", publication_version: 2,
  cancellation_status: "pending", cancellation_publication_version: 2,
  session: { status: "confirmed", publication_version: 2 },
}

describe("actionable cancellation publication ownership", () => {
  it("accepts the current request and handles either joined-session shape", () => {
    expect(isCurrentCancellationRequest(current)).toBe(true)
    expect(isCurrentCancellationRequest({ ...current, session: [current.session] })).toBe(true)
  })

  it.each([
    { cancellation_publication_version: 1 },
    { cancellation_publication_version: null },
    { cancellation_publication_version: 0 },
    { publication_version: 0 },
    { status: "draft" },
    { status: "cancelled", cancellation_status: "approved" },
    { cancellation_status: "rejected" },
    { session: { status: "draft", publication_version: 2 } },
    { session: { status: "confirmed", publication_version: 3 } },
    { session: null },
    { session: [] },
  ])("does not expose an old/withdrawn request as pending: %j", (change) => {
    expect(isCurrentCancellationRequest({ ...current, ...change })).toBe(false)
  })
})
