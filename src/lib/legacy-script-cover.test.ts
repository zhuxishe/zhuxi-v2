import { describe, expect, it } from "vitest"
import {
  legacyCoverDestinationPath,
  legacyProtectedPagePathIsValid,
  legacyScriptCoverSourcePath,
} from "./legacy-script-cover"

const scriptId = "11111111-1111-4111-8111-111111111111"
const sourcePath = `pages/${scriptId}/page_001.png`

describe("legacy script cover paths", () => {
  it("accepts only the first protected image for the matching script", () => {
    expect(legacyProtectedPagePathIsValid(sourcePath, scriptId)).toBe(true)
    expect(legacyProtectedPagePathIsValid(`pages/${scriptId}/page_002.png`, scriptId)).toBe(false)
    expect(legacyProtectedPagePathIsValid("pages/22222222-2222-4222-8222-222222222222/page_001.png", scriptId)).toBe(false)
  })

  it("parses an allow-listed public scripts URL without query credentials", () => {
    const url = `https://wjjhprflldvclulistcx.supabase.co/storage/v1/object/public/scripts/${sourcePath}`
    expect(legacyScriptCoverSourcePath(url, scriptId)).toBe(sourcePath)
    expect(legacyScriptCoverSourcePath(`${url}?token=secret`, scriptId)).toBeNull()
    expect(legacyScriptCoverSourcePath(url.replace("wjjhprflldvclulistcx.supabase.co", "evil.example"), scriptId)).toBeNull()
  })

  it("builds a stable script-bound UUID destination", () => {
    const candidate = {
      id: scriptId,
      title: "测试",
      expectedCoverUrl: null,
      sourcePath,
      updatedAt: "2026-09-03T00:00:00.000Z",
    }
    const first = legacyCoverDestinationPath(candidate, "png")
    expect(first).toBe(legacyCoverDestinationPath(candidate, "png"))
    expect(first).toMatch(new RegExp(`^covers/${scriptId}/[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.png$`))
    expect(legacyCoverDestinationPath(candidate, "webp")).not.toBe(first)
  })
})
