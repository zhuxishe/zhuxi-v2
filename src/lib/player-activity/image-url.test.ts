import { describe, expect, it } from "vitest"
import { isSupportedPlayerImageUrl } from "./image-url"

describe("Player activity image URLs", () => {
  it("accepts local assets and configured image hosts", () => {
    expect(isSupportedPlayerImageUrl("/images/landing/activity.webp")).toBe(true)
    expect(isSupportedPlayerImageUrl("https://images.unsplash.com/photo-123?auto=format")).toBe(true)
    expect(isSupportedPlayerImageUrl("https://wjjhprflldvclulistcx.supabase.co/storage/v1/object/public/reviews/cover.webp")).toBe(true)
    expect(isSupportedPlayerImageUrl("https://api.zhuxishe.com/storage/v1/object/public/reviews/cover.webp")).toBe(true)
  })

  it("rejects hosts and paths that Next Image cannot render", () => {
    expect(isSupportedPlayerImageUrl("https://example.com/cover.webp")).toBe(false)
    expect(isSupportedPlayerImageUrl("https://api.zhuxishe.com/not-storage/cover.webp")).toBe(false)
    expect(isSupportedPlayerImageUrl("http://images.unsplash.com/photo-123")).toBe(false)
    expect(isSupportedPlayerImageUrl("//images.unsplash.com/photo-123")).toBe(false)
  })
})
