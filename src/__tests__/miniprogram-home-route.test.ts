import { describe, expect, it } from "vitest"
import { resolveMiniHomeRoute } from "../../packages/miniprogram/src/lib/home-route"

describe("resolveMiniHomeRoute", () => {
  it("no member record redirects to interview", () => {
    expect(resolveMiniHomeRoute(null)).toEqual({
      action: "redirect",
      to: "/pages/interview/index",
    })
  })

  it("pending without identity redirects to interview", () => {
    expect(resolveMiniHomeRoute({ status: "pending", hasIdentity: false })).toEqual({
      action: "redirect",
      to: "/pages/interview/index",
    })
  })

  it("pending with identity shows pending view", () => {
    expect(resolveMiniHomeRoute({ status: "pending", hasIdentity: true })).toEqual({
      action: "render",
      view: "pending",
    })
  })

  it("rejected shows rejected view", () => {
    expect(resolveMiniHomeRoute({ status: "rejected", hasIdentity: true })).toEqual({
      action: "render",
      view: "rejected",
    })
  })

  it("approved shows home view", () => {
    expect(resolveMiniHomeRoute({ status: "approved", hasIdentity: true })).toEqual({
      action: "render",
      view: "home",
    })
  })
})
