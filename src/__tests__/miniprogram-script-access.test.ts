import { describe, expect, it } from "vitest"
import { resolveMiniScriptAccessView } from "../../packages/miniprogram/src/lib/script-access"

describe("resolveMiniScriptAccessView", () => {
  it("shows page viewer when full access and page images exist", () => {
    expect(resolveMiniScriptAccessView(true, ["a.jpg"], "doc.pdf")).toEqual({
      view: "pages",
      pages: ["a.jpg"],
      pdfUrl: "doc.pdf",
    })
  })

  it("falls back to pdf when full access but no page images", () => {
    expect(resolveMiniScriptAccessView(true, [], "doc.pdf")).toEqual({
      view: "pdf",
      pages: [],
      pdfUrl: "doc.pdf",
    })
  })

  it("shows restricted when no full access", () => {
    expect(resolveMiniScriptAccessView(false, ["a.jpg"], "doc.pdf")).toEqual({
      view: "restricted",
      pages: ["a.jpg"],
      pdfUrl: "doc.pdf",
    })
  })
})
