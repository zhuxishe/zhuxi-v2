import { randomBytes } from "node:crypto"
import sharp from "sharp"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  COMMUNITY_MAX_IMAGE_BYTES,
  COMMUNITY_MAX_PROCESSED_IMAGE_BYTES,
} from "./constants"
import { normalizeCommunityImage } from "./normalize-image"

const heic = vi.hoisted(() => ({ all: vi.fn() }))
vi.mock("heic-decode", () => ({ default: heic }))

afterEach(() => vi.clearAllMocks())

async function jpeg(width = 320, height = 240) {
  return sharp({ create: { width, height, channels: 3, background: "#336699" } }).jpeg().toBuffer()
}

function syntheticHeic(width: number, height: number) {
  function box(type: string, payload: Buffer) {
    const header = Buffer.alloc(8)
    header.writeUInt32BE(payload.length + 8)
    header.write(type, 4)
    return Buffer.concat([header, payload])
  }
  const dimensions = Buffer.alloc(12)
  dimensions.writeUInt32BE(width, 4)
  dimensions.writeUInt32BE(height, 8)
  return Buffer.concat([
    box("ftyp", Buffer.concat([Buffer.from("heic"), Buffer.alloc(4), Buffer.from("mif1heic")])),
    box("meta", Buffer.concat([Buffer.alloc(4), box("iprp", box("ipco", box("ispe", dimensions)))])),
  ])
}

describe("community image normalization", () => {
  it("normalizes an actual 48 MP JPEG to the existing photo and thumbnail sizes", async () => {
    const result = await normalizeCommunityImage(await jpeg(8064, 6048), "photo")
    expect(result).toMatchObject({ width: 2400, height: 1800 })
    expect(result.main.byteLength).toBeLessThanOrEqual(COMMUNITY_MAX_PROCESSED_IMAGE_BYTES)
    expect(await sharp(result.main).metadata()).toMatchObject({ format: "webp", width: 2400, height: 1800 })
    expect(await sharp(result.thumbnail).metadata()).toMatchObject({ format: "webp", width: 720, height: 720 })
  }, 15000)

  it("rejects an actual image above 60 MP before full decoding", async () => {
    await expect(normalizeCommunityImage(await jpeg(10001, 6000), "photo")).rejects.toThrow("照片像素过大")
  }, 15000)

  it("accepts a 20 MiB source and rejects a source one byte larger", async () => {
    const input = Buffer.alloc(COMMUNITY_MAX_IMAGE_BYTES)
    ;(await jpeg()).copy(input)
    await expect(normalizeCommunityImage(input, "photo")).resolves.toMatchObject({ width: 320, height: 240 })
    await expect(normalizeCommunityImage(Buffer.alloc(COMMUNITY_MAX_IMAGE_BYTES + 1), "avatar")).rejects.toThrow("20MB")
  })

  it("auto-orients photos and removes source EXIF metadata", async () => {
    const input = await sharp(await jpeg(400, 200)).withMetadata({ orientation: 6 }).withExifMerge({
      IFD0: { Artist: "Private uploader" },
    }).jpeg().toBuffer()
    const result = await normalizeCommunityImage(input, "photo")
    const metadata = await sharp(result.main).metadata()
    expect(result).toMatchObject({ width: 200, height: 400 })
    expect(metadata.exif).toBeUndefined()
    expect(metadata.orientation).toBeUndefined()
  })

  it("keeps avatar output square and removes metadata", async () => {
    const result = await normalizeCommunityImage(await jpeg(400, 200), "avatar")
    expect(result).toMatchObject({ width: 512, height: 512 })
    expect(result.thumbnail).toBe(result.main)
    expect(await sharp(result.main).metadata()).toMatchObject({ format: "webp", width: 512, height: 512 })
  })

  it("reduces a large transparent PNG until its processed result fits the storage limit", async () => {
    const input = await sharp(randomBytes(2000 * 2000 * 4), {
      raw: { width: 2000, height: 2000, channels: 4 },
    }).png().toBuffer()
    expect(input.byteLength).toBeLessThan(COMMUNITY_MAX_IMAGE_BYTES)
    const result = await normalizeCommunityImage(input, "photo")
    expect(result).toMatchObject({ width: 1440, height: 1440 })
    expect(result.main.byteLength).toBeLessThanOrEqual(COMMUNITY_MAX_PROCESSED_IMAGE_BYTES)
  }, 15000)

  it("rejects corrupt signature-only images, unsupported formats, and empty files", async () => {
    await expect(normalizeCommunityImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "photo")).rejects.toThrow()
    await expect(normalizeCommunityImage(Buffer.from("<svg></svg>"), "avatar")).rejects.toThrow("仅支持")
    await expect(normalizeCommunityImage(Buffer.alloc(0), "photo")).rejects.toThrow("请选择")
  })

  it("checks decoder dimensions before allocating HEIC pixels and always disposes handles", async () => {
    const decode = vi.fn()
    const dispose = vi.fn()
    heic.all.mockResolvedValue(Object.assign([{ width: 10001, height: 6000, decode }], { dispose }))
    await expect(normalizeCommunityImage(syntheticHeic(100, 100), "photo")).rejects.toThrow("照片像素过大")
    expect(decode).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it("converts decoded HEIC RGBA directly without a full-size intermediate JPEG", async () => {
    const dispose = vi.fn()
    const data = new Uint8ClampedArray(400 * 200 * 4).fill(255)
    const decode = vi.fn().mockResolvedValue({ width: 400, height: 200, data })
    heic.all.mockResolvedValue(Object.assign([{ width: 400, height: 200, decode }], { dispose }))
    const result = await normalizeCommunityImage(syntheticHeic(400, 200), "photo")
    expect(result).toMatchObject({ width: 400, height: 200 })
    expect(dispose).toHaveBeenCalledOnce()
  })

  it("frees HEIC handles even when pixel decoding fails", async () => {
    const dispose = vi.fn()
    const decode = vi.fn().mockRejectedValue(new Error("damaged image payload"))
    heic.all.mockResolvedValue(Object.assign([{ width: 400, height: 200, decode }], { dispose }))
    await expect(normalizeCommunityImage(syntheticHeic(400, 200), "avatar")).rejects.toThrow("damaged image")
    expect(dispose).toHaveBeenCalledOnce()
  })

  it("processes one HEIC at a time while ordinary photos remain independent", async () => {
    const decoded = { width: 40, height: 20, data: new Uint8ClampedArray(40 * 20 * 4).fill(255) }
    let release: (value: typeof decoded) => void = () => {}
    const pendingPixels = new Promise<typeof decoded>((resolve) => { release = resolve })
    heic.all
      .mockResolvedValueOnce(Object.assign([{ width: 40, height: 20, decode: () => pendingPixels }], { dispose: vi.fn() }))
      .mockResolvedValueOnce(Object.assign([{ width: 40, height: 20, decode: () => Promise.resolve(decoded) }], { dispose: vi.fn() }))
    const first = normalizeCommunityImage(syntheticHeic(40, 20), "photo")
    const second = normalizeCommunityImage(syntheticHeic(40, 20), "avatar")
    await vi.waitFor(() => expect(heic.all).toHaveBeenCalledOnce())
    await expect(normalizeCommunityImage(await jpeg(), "photo")).resolves.toMatchObject({ width: 320, height: 240 })
    expect(heic.all).toHaveBeenCalledOnce()
    release(decoded)
    await expect(first).resolves.toMatchObject({ width: 40, height: 20 })
    await expect(second).resolves.toMatchObject({ width: 512, height: 512 })
    expect(heic.all).toHaveBeenCalledTimes(2)
  })

  it("continues the HEIC queue after a failed image", async () => {
    const decoded = { width: 40, height: 20, data: new Uint8ClampedArray(40 * 20 * 4).fill(255) }
    heic.all
      .mockRejectedValueOnce(new Error("damaged file"))
      .mockResolvedValueOnce(Object.assign([{ width: 40, height: 20, decode: () => Promise.resolve(decoded) }], { dispose: vi.fn() }))
    const first = normalizeCommunityImage(syntheticHeic(40, 20), "photo")
    const second = normalizeCommunityImage(syntheticHeic(40, 20), "photo")
    await expect(first).rejects.toThrow("damaged file")
    await expect(second).resolves.toMatchObject({ width: 40, height: 20 })
  })
})
