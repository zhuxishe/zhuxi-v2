import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ActivityReviewVersion, activityReviewVersionLabel } from "./ActivityReviewVersion"

describe("administrator-visible review policy versions", () => {
  it("does not silently label an existing unified activity as this release's new version", () => {
    expect(activityReviewVersionLabel()).toBe("旧版评价")
    expect(activityReviewVersionLabel("legacy", "legacy")).toBe("旧版评价")
    expect(activityReviewVersionLabel("unified")).toBe("既有单项互评")
    expect(activityReviewVersionLabel("unified", "unified_v1")).toBe("既有单项互评")
    expect(activityReviewVersionLabel("unified", "unified_v2")).toBe("新版统一互评")
  })
  it("renders a read-only version badge with no migration control", () => {
    const html = renderToStaticMarkup(createElement(ActivityReviewVersion, { reviewSystem: "unified", policyVersion: "unified_v2" }))
    expect(html).toContain("新版统一互评")
    expect(html).not.toMatch(/<button|<select|<input/)
  })
})
