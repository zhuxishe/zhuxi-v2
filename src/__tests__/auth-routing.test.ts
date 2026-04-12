import { describe, it, expect } from "vitest"
import { resolvePlayerRoute } from "@/lib/auth/routing"

describe("resolvePlayerRoute", () => {
  it("null player → redirect to interview-form", () => {
    const result = resolvePlayerRoute(null)
    expect(result).toEqual({ action: "redirect", to: "/app/interview-form" })
  })

  it("pending + no identity → redirect to interview-form", () => {
    const result = resolvePlayerRoute({ status: "pending", hasIdentity: false })
    expect(result).toEqual({ action: "redirect", to: "/app/interview-form" })
  })

  it("pending + has identity → render pending view", () => {
    const result = resolvePlayerRoute({ status: "pending", hasIdentity: true })
    expect(result).toEqual({ action: "render", view: "pending" })
  })

  it("rejected → render rejected view", () => {
    const result = resolvePlayerRoute({ status: "rejected", hasIdentity: true })
    expect(result).toEqual({ action: "render", view: "rejected" })
  })

  it("approved → render home view", () => {
    const result = resolvePlayerRoute({ status: "approved", hasIdentity: true })
    expect(result).toEqual({ action: "render", view: "home" })
  })

  it("approved without identity (edge case) → render home", () => {
    const result = resolvePlayerRoute({ status: "approved", hasIdentity: false })
    expect(result).toEqual({ action: "render", view: "home" })
  })

  it("inactive → render home (fallback)", () => {
    const result = resolvePlayerRoute({ status: "inactive", hasIdentity: true })
    expect(result).toEqual({ action: "render", view: "home" })
  })
})
