import { describe, expect, it } from "vitest"
import { managedContentImageUrlIsCanonical } from "./content-media-url"

describe("managedContentImageUrlIsCanonical", () => {
  it("leaves genuine external HTTPS images unrestricted", () => {
    expect(managedContentImageUrlIsCanonical("https://images.example.net/photo.webp"))
      .toBeNull()
  })

  it.each([
    "https://wjjhprflldvclulistcx.supabase.co/storage/v1/object/public/scripts-covers/covers/11111111-1111-4111-8111-111111111111/cover.webp",
    "https://api.zhuxishe.com/storage/v1/object/public/activity-media/activities/11111111-1111-4111-8111-111111111111/gallery/photo.jpg?version=2",
  ])("accepts a canonical managed public URL: %s", (url) => {
    expect(managedContentImageUrlIsCanonical(url)).toBe(true)
  })

  it.each([
    "https://api.zhuxishe.com/storage/v1/render/image/public/activity-media/activities/11111111-1111-4111-8111-111111111111/photo.jpg",
    "https://api.zhuxishe.com/storage/v1/object/sign/scripts-covers/covers/11111111-1111-4111-8111-111111111111/cover.webp",
    "https://api.zhuxishe.com/storage/v1/object/authenticated/scripts-covers/covers/11111111-1111-4111-8111-111111111111/cover.webp",
    "https://api.zhuxishe.com/storage/v1/object/public/scripts/pages/11111111-1111-4111-8111-111111111111/page_001.webp",
    "https://api.zhuxishe.com/storage/v1/object/sign/scripts/pdfs/11111111-1111-4111-8111-111111111111/original.pdf?token=secret",
    "https://api.zhuxishe.com/storage/v1/object/authenticated/scripts/pages/11111111-1111-4111-8111-111111111111/page_001.webp",
    "https://api.zhuxishe.com/storage/v1/object/public/activity-media/activities/11111111-1111-4111-8111-111111111111/file%20name.webp",
    "https://api.zhuxishe.com/storage/v1/object/public/activity-media/activities/11111111-1111-4111-8111-111111111111/%41.webp",
    "https://api.zhuxishe.com/storage/v1/object/public/activity-media/activities/11111111-1111-4111-8111-111111111111/./photo.webp",
    "https://api.zhuxishe.com/storage/v1/object/public/activity-media/activities/11111111-1111-4111-8111-111111111111/old/../photo.webp",
    "https://api.zhuxishe.com/storage/v1/object/public/activity-media\\activities/11111111-1111-4111-8111-111111111111/photo.webp",
    "https://user:password@api.zhuxishe.com/storage/v1/object/public/activity-media/activities/11111111-1111-4111-8111-111111111111/photo.jpg",
    "http://api.zhuxishe.com/storage/v1/object/public/activity-media/activities/11111111-1111-4111-8111-111111111111/photo.jpg",
  ])("rejects an ambiguous managed URL: %s", (url) => {
    expect(managedContentImageUrlIsCanonical(url)).toBe(false)
  })

  it("does not reinterpret unrelated buckets on the same host", () => {
    expect(managedContentImageUrlIsCanonical(
      "https://api.zhuxishe.com/storage/v1/object/public/avatars/member/photo.webp",
    )).toBeNull()
  })
})
