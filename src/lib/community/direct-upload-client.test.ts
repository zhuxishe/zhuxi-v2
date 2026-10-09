import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Upload } from "tus-js-client"
import { createDirectImageUpload } from "./direct-upload-client"

type TusOptions = ConstructorParameters<typeof Upload>[1]
const tus = vi.hoisted(() => ({
  instances: [] as { file: File; options: TusOptions; url: string; abort: ReturnType<typeof vi.fn> }[],
  autoSuccess: true,
}))

vi.mock("tus-js-client", () => ({
  Upload: class {
    url = "https://project.storage.supabase.co/storage/v1/upload/resumable/sign/resume-id"
    abort = vi.fn(async () => {})
    constructor(public file: File, public options: TusOptions) {
      tus.instances.push(this)
    }
    start() {
      this.options.onUploadUrlAvailable?.()
      if (tus.autoSuccess) queueMicrotask(() => this.options.onSuccess?.({} as never))
    }
  },
}))

const messages = { fallback: "上传失败", payloadTooLarge: "图片不能超过 20MB" }
const session = {
  uploadId: "session-id", bucket: "community-upload-staging", path: "member/photo/file",
  token: "limited-upload-token", endpoint: "https://project.storage.supabase.co/storage/v1/upload/resumable/sign",
}
const image = {
  storagePath: "member/photo.webp", thumbnailPath: "member/thumb.webp", width: 2400, height: 1800,
  byteSize: 128000, mimeType: "image/webp", previewUrl: "/api/community/media?photo",
}

function file(size = 8 * 1024 * 1024, name = "phone.HEIC", type = "") {
  return new File([new Uint8Array(size)], name, { type })
}

function requestBody(mock: ReturnType<typeof vi.fn>, index: number) {
  return JSON.parse(mock.mock.calls[index][1].body as string)
}

beforeEach(() => {
  tus.instances = []
  tus.autoSuccess = true
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("direct image upload", () => {
  it("sends only metadata to the app and an 8MB HEIC directly through signed 6MiB TUS chunks", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json(image))
    vi.stubGlobal("fetch", fetchMock)
    const photo = file()
    await expect(createDirectImageUpload(photo, "photo", messages).upload()).resolves.toEqual(image)
    expect(requestBody(fetchMock, 0)).toEqual({ action: "prepare", kind: "photo", size: photo.size, type: "image/heic", name: "phone.HEIC" })
    expect(requestBody(fetchMock, 1)).toEqual({ action: "complete", uploadId: session.uploadId })
    const transport = tus.instances[0]
    expect(transport.file).toBe(photo)
    expect(transport.options).toMatchObject({
      endpoint: session.endpoint, headers: { "x-signature": session.token }, chunkSize: 6 * 1024 * 1024,
      storeFingerprintForResuming: false,
      metadata: { bucketName: session.bucket, objectName: session.path, contentType: "image/heic" },
    })
    expect(transport.options.headers).not.toHaveProperty("x-upsert")
    expect(await transport.options.fingerprint?.(photo, transport.options)).toContain(session.uploadId)
  })

  it("accepts the 20MiB boundary and rejects larger files before preparing an upload", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json(image))
    vi.stubGlobal("fetch", fetchMock)
    await createDirectImageUpload(file(20 * 1024 * 1024), "profile-avatar", messages).upload()
    await expect(createDirectImageUpload(file(20 * 1024 * 1024 + 1), "photo", messages).upload()).rejects.toThrow(messages.payloadTooLarge)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(requestBody(fetchMock, 0).kind).toBe("profile-avatar")
  })

  it("preserves JPEG MIME when iOS retains an HEIC filename after exporting", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(session)).mockResolvedValueOnce(Response.json(image))
    vi.stubGlobal("fetch", fetchMock)
    await createDirectImageUpload(file(100, "IMG_001.HEIC", "image/jpeg"), "photo", messages).upload()
    expect(requestBody(fetchMock, 0).type).toBe("image/jpeg")
    expect(tus.instances[0].options.metadata?.contentType).toBe("image/jpeg")
  })

  it("starts all nine selected photos without a two-file queue", async () => {
    tus.autoSuccess = false
    let sequence = 0
    const fetchMock = vi.fn(async (_url, init) => JSON.parse(init.body).action === "prepare"
      ? Response.json({ ...session, uploadId: `session-${++sequence}`, path: `member/${sequence}` })
      : Response.json(image))
    vi.stubGlobal("fetch", fetchMock)
    const promises = Array.from({ length: 9 }, (_, index) => createDirectImageUpload(file(100, `${index}.jpg`, "image/jpeg"), "photo", messages).upload())
    await vi.waitFor(() => expect(tus.instances).toHaveLength(9))
    expect(fetchMock).toHaveBeenCalledTimes(9)
    for (const transport of tus.instances) transport.options.onSuccess?.({} as never)
    await expect(Promise.all(promises)).resolves.toHaveLength(9)
  })

  it("retries the same upload URL after a transfer fails, without a new reservation", async () => {
    tus.autoSuccess = false
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(session)).mockResolvedValueOnce(Response.json(image))
    vi.stubGlobal("fetch", fetchMock)
    const handle = createDirectImageUpload(file(100), "photo", messages)
    const first = handle.upload()
    const rejected = expect(first).rejects.toThrow(messages.fallback)
    await vi.waitFor(() => expect(tus.instances).toHaveLength(1))
    tus.instances[0].options.onError?.(new Error("offline"))
    await rejected
    tus.autoSuccess = true
    await handle.upload()
    expect(tus.instances[1].options.uploadUrl).toBe(tus.instances[0].url)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("retries completion after a lost response without uploading the photo again", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(session))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(Response.json(image))
    vi.stubGlobal("fetch", fetchMock)
    const handle = createDirectImageUpload(file(100), "photo", messages)
    await expect(handle.upload()).rejects.toThrow("offline")
    await expect(handle.upload()).resolves.toEqual(image)
    expect(tus.instances).toHaveLength(1)
    expect(requestBody(fetchMock, 2)).toEqual({ action: "complete", uploadId: session.uploadId })
  })

  it.each([400, 500])("prepares a fresh upload on one retry after processing cancelled it (%i)", async (status) => {
    const replacement = { ...session, uploadId: "new-session", path: "member/new-photo" }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json({ error: "处理失败", resetUpload: true }, { status }))
      .mockResolvedValueOnce(Response.json(replacement))
      .mockResolvedValueOnce(Response.json(image))
    vi.stubGlobal("fetch", fetchMock)
    const handle = createDirectImageUpload(file(100), "photo", messages)
    await expect(handle.upload()).rejects.toThrow("处理失败")
    await expect(handle.upload()).resolves.toEqual(image)
    expect(requestBody(fetchMock, 2).action).toBe("prepare")
    expect(requestBody(fetchMock, 3).uploadId).toBe("new-session")
    expect(tus.instances[1].options.uploadUrl).toBeUndefined()
  })

  it.each([404, 410])("recovers a stale session discovered during retry (%i) without a second click", async (status) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(session))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(Response.json({ error: "上传失效" }, { status }))
      .mockResolvedValueOnce(Response.json({ ...session, uploadId: "new-session" }))
      .mockResolvedValueOnce(Response.json(image))
    vi.stubGlobal("fetch", fetchMock)
    const handle = createDirectImageUpload(file(100), "photo", messages)
    await expect(handle.upload()).rejects.toThrow("offline")
    await expect(handle.upload()).resolves.toEqual(image)
    expect(tus.instances).toHaveLength(2)
    expect(requestBody(fetchMock, 3).action).toBe("prepare")
    expect(requestBody(fetchMock, 4).uploadId).toBe("new-session")
  })

  it("keeps the completed transfer after an uncertain server failure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json({ error: "暂时无法处理" }, { status: 500 }))
      .mockResolvedValueOnce(Response.json(image))
    vi.stubGlobal("fetch", fetchMock)
    const handle = createDirectImageUpload(file(100), "photo", messages)
    await expect(handle.upload()).rejects.toThrow("暂时无法处理")
    await expect(handle.upload()).resolves.toEqual(image)
    expect(tus.instances).toHaveLength(1)
    expect(requestBody(fetchMock, 2)).toEqual({ action: "complete", uploadId: session.uploadId })
  })

  it.each([401, 403, 404, 410])("refreshes a terminal TUS credential/URL failure (%i) on the next retry", async (status) => {
    tus.autoSuccess = false
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json({ ...session, uploadId: "new-session", token: "new-token" }))
      .mockResolvedValueOnce(Response.json(image))
    vi.stubGlobal("fetch", fetchMock)
    const handle = createDirectImageUpload(file(100), "photo", messages)
    const pending = handle.upload()
    const rejected = expect(pending).rejects.toThrow(messages.fallback)
    await vi.waitFor(() => expect(tus.instances).toHaveLength(1))
    tus.instances[0].options.onError?.({ originalResponse: { getStatus: () => status } } as never)
    await rejected
    tus.autoSuccess = true
    await expect(handle.upload()).resolves.toEqual(image)
    expect(requestBody(fetchMock, 1).action).toBe("prepare")
    expect(tus.instances[1].options.uploadUrl).toBeUndefined()
    expect(tus.instances[1].options.headers?.["x-signature"]).toBe("new-token")
  })

  it("waits for a processing response and then retrieves the existing result", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json({ retryAfterMs: 1000 }, { status: 202 }))
      .mockResolvedValueOnce(Response.json(image))
    vi.stubGlobal("fetch", fetchMock)
    const pending = createDirectImageUpload(file(100), "photo", messages).upload()
    await vi.advanceTimersByTimeAsync(1500)
    await expect(pending).resolves.toEqual(image)
    expect(tus.instances).toHaveLength(1)
  })

  it("keeps waiting beyond 90 seconds for a busy nine-photo batch without reuploading", async () => {
    vi.useFakeTimers()
    let completions = 0
    const fetchMock = vi.fn(async (_url, init) => {
      if (JSON.parse(init.body).action === "prepare") return Response.json(session)
      completions += 1
      return completions <= 100
        ? Response.json({ retryAfterMs: 1500 }, { status: 202 })
        : Response.json(image)
    })
    vi.stubGlobal("fetch", fetchMock)
    const pending = createDirectImageUpload(file(100), "photo", messages).upload()
    await vi.advanceTimersByTimeAsync(151000)
    await expect(pending).resolves.toEqual(image)
    expect(completions).toBe(101)
    expect(tus.instances).toHaveLength(1)
  })

  it("aborts removal, cleans up the reservation, and never completes a cancelled photo", async () => {
    tus.autoSuccess = false
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(session)).mockResolvedValue(Response.json({ ok: true }))
    vi.stubGlobal("fetch", fetchMock)
    const handle = createDirectImageUpload(file(100), "photo", messages)
    const pending = handle.upload()
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" })
    await vi.waitFor(() => expect(tus.instances).toHaveLength(1))
    handle.cancel()
    await rejected
    expect(tus.instances[0].abort).toHaveBeenCalledOnce()
    expect(requestBody(fetchMock, 1)).toEqual({ action: "cancel", uploadId: session.uploadId })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("deduplicates a double click and limits automatic retries to transient failures", async () => {
    tus.autoSuccess = false
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(session)).mockResolvedValueOnce(Response.json(image))
    vi.stubGlobal("fetch", fetchMock)
    const handle = createDirectImageUpload(file(100), "photo", messages)
    const first = handle.upload()
    expect(handle.upload()).toBe(first)
    await vi.waitFor(() => expect(tus.instances).toHaveLength(1))
    const options = tus.instances[0].options
    for (const status of [400, 401, 403, 404, 409, 413]) {
      expect(options.onShouldRetry?.({ originalResponse: { getStatus: () => status } } as never, 1, options)).toBe(false)
    }
    for (const status of [0, 408, 429, 500, 503]) {
      expect(options.onShouldRetry?.({ originalResponse: { getStatus: () => status } } as never, 1, options)).toBe(true)
    }
    options.onSuccess?.({} as never)
    await first
  })
})
