import { describe, expect, it } from "vitest"
import { managedActivityMediaPath } from "./media"

describe("managedActivityMediaPath", () => {
  it("extracts an activity-media public object path", () => {
    expect(
      managedActivityMediaPath(
        "https://wjjhprflldvclulistcx.supabase.co/storage/v1/object/public/activity-media/activities/11111111-1111-4111-8111-111111111111/cover/example.webp?version=2",
      ),
    ).toBe("activities/11111111-1111-4111-8111-111111111111/cover/example.webp")
  })

  it("accepts the canonical storage proxy host", () => {
    expect(
      managedActivityMediaPath(
        "https://api.zhuxishe.com/storage/v1/object/public/activity-media/activities/review/gallery/image.jpg",
      ),
    ).toBe("activities/review/gallery/image.jpg")
  })

  it.each([
    "https://images.unsplash.com/photo.jpg",
    "https://evil.example/storage/v1/object/public/activity-media/activities/review/cover/image.jpg",
    "https://api.zhuxishe.com/prefix/storage/v1/object/public/activity-media/activities/review/cover/image.jpg",
    "https://api.zhuxishe.com/storage/v1/object/sign/activity-media/activities/review/cover/image.jpg",
    "https://api.zhuxishe.com/storage/v1/object/public/activity-media/activities/review/cover/file%20name.jpg",
    "https://api.zhuxishe.com/storage/v1/object/public/activity-media/activities/review/cover/../image.jpg",
    "https://api.zhuxishe.com/storage/v1/object/public/activity-media\\activities/review/cover/image.jpg",
    "not-a-url",
    "",
  ])("rejects an unmanaged URL: %s", (url) => {
    expect(managedActivityMediaPath(url)).toBeNull()
  })
})
