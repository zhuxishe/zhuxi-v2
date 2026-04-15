import { describe, expect, it } from "vitest"
import { rewriteStorageUrl } from "@/lib/storage-url"

describe("rewriteStorageUrl", () => {
  it("rewrites Supabase storage urls to api.zhuxishe.com", () => {
    const url =
      "https://wjjhprflldvclulistcx.supabase.co/storage/v1/object/public/scripts/cover.jpg"

    expect(rewriteStorageUrl(url)).toBe(
      "https://api.zhuxishe.com/storage/v1/object/public/scripts/cover.jpg",
    )
  })

  it("rewrites other Supabase urls to api.zhuxishe.com", () => {
    const url =
      "https://wjjhprflldvclulistcx.supabase.co/functions/v1/download-script?id=1"

    expect(rewriteStorageUrl(url)).toBe(
      "https://api.zhuxishe.com/functions/v1/download-script?id=1",
    )
  })

  it("keeps non-Supabase urls unchanged", () => {
    const url = "https://example.com/files/cover.jpg"

    expect(rewriteStorageUrl(url)).toBe(url)
  })

  it("keeps empty values unchanged", () => {
    expect(rewriteStorageUrl(null)).toBeNull()
    expect(rewriteStorageUrl(undefined)).toBeUndefined()
    expect(rewriteStorageUrl("")).toBe("")
  })
})
