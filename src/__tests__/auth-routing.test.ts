import { describe, it, expect } from "vitest"
import { resolvePlayerRoute, type PlayerRouteInput } from "@/lib/auth/routing"

function player(overrides: Partial<PlayerRouteInput> = {}): PlayerRouteInput {
  return {
    status: "pending",
    accountStatus: "active",
    membershipType: "player",
    profileStage: "submitted",
    onboardingStep: 4,
    hasIdentity: true,
    ...overrides,
  }
}

describe("resolvePlayerRoute", () => {
  it("null player → redirect to interview-form", () => {
    const result = resolvePlayerRoute(null)
    expect(result).toEqual({ action: "redirect", to: "/app/interview-form" })
  })

  it("pending + no identity → redirect to interview-form", () => {
    const result = resolvePlayerRoute(player({ hasIdentity: false }))
    expect(result).toEqual({ action: "redirect", to: "/app/interview-form" })
  })

  it("resumes an in-progress draft even after identity exists", () => {
    const result = resolvePlayerRoute(player({
      profileStage: "in_progress",
      onboardingStep: 2,
    }))
    expect(result).toEqual({ action: "redirect", to: "/app/interview-form" })
  })

  it("pending + has identity → render pending view", () => {
    const result = resolvePlayerRoute(player())
    expect(result).toEqual({ action: "render", view: "pending" })
  })

  it("rejected → render rejected view", () => {
    const result = resolvePlayerRoute(player({ status: "rejected" }))
    expect(result).toEqual({ action: "render", view: "rejected" })
  })

  it("approved → render home view", () => {
    const result = resolvePlayerRoute(player({
      status: "approved",
      profileStage: "complete",
    }))
    expect(result).toEqual({ action: "render", view: "home" })
  })

  it("approved non-player membership cannot enter Player routes", () => {
    const result = resolvePlayerRoute(player({
      status: "approved",
      profileStage: "complete",
      membershipType: "staff",
    }))
    expect(result).toEqual({ action: "redirect", to: "/app/inactive" })
  })

  it("approved without identity cannot fall through to home", () => {
    const result = resolvePlayerRoute(player({
      status: "approved",
      profileStage: "complete",
      hasIdentity: false,
    }))
    expect(result).toEqual({ action: "redirect", to: "/app/interview-form" })
  })

  it("legacy inactive status cannot fall through to home", () => {
    const result = resolvePlayerRoute(player({ status: "inactive" }))
    expect(result).toEqual({ action: "redirect", to: "/app/inactive" })
  })

  it.each(["suspended", "closed", "unbound", "unexpected"])("%s account cannot fall through to home", (accountStatus) => {
    const result = resolvePlayerRoute(player({
      status: "approved",
      accountStatus,
      profileStage: "complete",
    }))
    expect(result).toEqual({ action: "redirect", to: "/app/inactive" })
  })

  it("an unknown status fails closed", () => {
    const result = resolvePlayerRoute(player({ status: "unexpected" }))
    expect(result).toEqual({ action: "redirect", to: "/app/inactive" })
  })
})
