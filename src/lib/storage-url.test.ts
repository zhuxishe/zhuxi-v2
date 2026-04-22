import { describe, expect, it, vi } from "vitest"
import { rewriteStorageUrl } from "@/lib/storage-url"

describe("rewriteStorageUrl", () => {
  it("keeps Supabase urls unchanged when no proxy origin is configured", () => {
    const url =
      "https://wjjhprflldvclulistcx.supabase.co/storage/v1/object/public/scripts/cover.jpg"

    expect(rewriteStorageUrl(url)).toBe(url)
  })

  it("rewrites Supabase urls when a proxy origin is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_STORAGE_PROXY_ORIGIN", "https://cdn.zhuxishe.com")
    vi.resetModules()
    const { rewriteStorageUrl: rewriteWithProxy } = await import("@/lib/storage-url")
    const url = "https://wjjhprflldvclulistcx.supabase.co/storage/v1/object/public/scripts/cover.jpg"

    expect(rewriteWithProxy(url)).toBe("https://cdn.zhuxishe.com/storage/v1/object/public/scripts/cover.jpg")
    vi.unstubAllEnvs()
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
