import { readFileSync } from "node:fs"
import path from "node:path"
import sharp from "sharp"
import { describe, expect, it } from "vitest"
import { normalizeCommunityImage } from "./normalize-image"

// Self-generated 800×600 quadrants encoded as HEIC with a 90° clockwise irot.
// Colors before rotation: red/green on top, blue/yellow on the bottom.
const input = readFileSync(path.resolve("src/lib/community/__fixtures__/rotated-quadrants.heic"))

describe("real HEIC normalization", () => {
  it("decodes HEIC, applies item rotation, preserves quadrant colors and strips metadata", async () => {
    const result = await normalizeCommunityImage(input, "photo")
    expect(result).toMatchObject({ width: 600, height: 800 })
    const metadata = await sharp(result.main).metadata()
    expect(metadata.exif).toBeUndefined()
    expect(metadata.orientation).toBeUndefined()
    const samples = [
      { left: 150, top: 200, rgb: [58, 118, 204] },
      { left: 450, top: 200, rgb: [227, 75, 65] },
      { left: 150, top: 600, rgb: [237, 188, 57] },
      { left: 450, top: 600, rgb: [59, 156, 112] },
    ]
    for (const { left, top, rgb } of samples) {
      const pixel = await sharp(result.main).extract({ left, top, width: 1, height: 1 }).raw().toBuffer()
      expect([...pixel].every((value, index) => Math.abs(value - rgb[index]) <= 10)).toBe(true)
    }
  })

  it("also accepts HEIC for a square avatar", async () => {
    const result = await normalizeCommunityImage(input, "avatar")
    expect(result).toMatchObject({ width: 512, height: 512 })
    expect(await sharp(result.main).metadata()).toMatchObject({ format: "webp", width: 512, height: 512 })
  })
})
