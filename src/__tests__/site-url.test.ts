import { describe, expect, it } from "vitest"
import { buildPublicUrl } from "@/lib/site-url"

describe("buildPublicUrl", () => {
  it("uses zhuxishe.jp as the production fallback", () => {
    expect(buildPublicUrl("/login/callback")).toBe("https://zhuxishe.jp/login/callback")
  })
})
