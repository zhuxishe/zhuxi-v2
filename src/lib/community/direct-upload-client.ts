import type { Upload } from "tus-js-client"
import type { UploadedCommunityImage } from "./types"
import { isImageFileTooLarge, readUploadResponse } from "./upload"

type UploadKind = "photo" | "avatar" | "profile-avatar"
type Messages = { fallback: string; payloadTooLarge: string }
type PreparedUpload = {
  uploadId: string
  bucket: string
  path: string
  token: string
  endpoint: string
}

const API = "/api/community/uploads/direct"
let tusModule: Promise<typeof import("tus-js-client")> | undefined
class UploadSessionResetError extends Error {}

function abortError() {
  return new DOMException("Upload cancelled", "AbortError")
}

function uploadType(file: File) {
  // iOS can export JPEG bytes while retaining the source photo's HEIC filename.
  if (["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(file.type)) return file.type
  const extension = file.name.split(".").pop()?.toLowerCase()
  if (extension === "heic" || extension === "heif") return `image/${extension}`
  return file.type || ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" }[extension ?? ""] ?? "application/octet-stream")
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(abortError())
    const cancel = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel)
      resolve()
    }, ms)
    signal.addEventListener("abort", cancel, { once: true })
  })
}

/** One selected file owns one session, so retry resumes it without mixing users or photos. */
export function createDirectImageUpload(file: File, kind: UploadKind, messages: Messages) {
  const controller = new AbortController()
  let prepared: PreparedUpload | undefined
  let uploadUrl: string | undefined
  let transferred = false
  let result: UploadedCommunityImage | undefined
  let active: Promise<UploadedCommunityImage> | undefined
  let cancelled = false

  function resetSession() {
    prepared = undefined
    uploadUrl = undefined
    transferred = false
  }

  async function request<T extends object>(body: object) {
    const response = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const payload = await readUploadResponse<T & { resetUpload?: boolean }>(response, messages)
    if (!response.ok) {
      // Only discard a transfer when the server confirms its reservation is unusable.
      if (payload.resetUpload || response.status === 404 || response.status === 410) {
        resetSession()
        throw new UploadSessionResetError(payload.error || messages.fallback)
      }
      throw new Error(payload.error || messages.fallback)
    }
    return { response, payload }
  }

  async function transfer(session: PreparedUpload) {
    const { Upload: TusUpload } = await (tusModule ??= import("tus-js-client").catch((error) => {
      tusModule = undefined
      throw error
    }))
    if (controller.signal.aborted) throw abortError()
    await new Promise<void>((resolve, reject) => {
      let upload: Upload
      const finish = (error?: Error) => {
        controller.signal.removeEventListener("abort", abort)
        if (error) reject(error)
        else resolve()
      }
      const abort = () => {
        void upload.abort().catch(() => undefined)
        finish(abortError())
      }
      upload = new TusUpload(file, {
        endpoint: session.endpoint,
        uploadUrl,
        headers: { "x-signature": session.token },
        chunkSize: 6 * 1024 * 1024,
        uploadDataDuringCreation: true,
        retryDelays: [0, 1500, 3000, 6000],
        onShouldRetry: (error) => {
          const status = error.originalResponse?.getStatus() ?? 0
          return status === 0 || status === 408 || status === 429 || status >= 500
        },
        // Resume only within this file's reservation; never persist signed URLs on shared devices.
        storeFingerprintForResuming: false,
        fingerprint: async () => `community:${kind}:${session.uploadId}`,
        metadata: {
          bucketName: session.bucket,
          objectName: session.path,
          contentType: uploadType(file),
          cacheControl: "3600",
        },
        onUploadUrlAvailable: () => { uploadUrl = upload.url ?? undefined },
        onError: (error) => {
          const status = (error as { originalResponse?: { getStatus(): number } }).originalResponse?.getStatus() ?? 0
          if ([401, 403, 404, 410].includes(status)) {
            resetSession()
            finish(new UploadSessionResetError(messages.fallback))
          } else {
            finish(new Error(messages.fallback))
          }
        },
        onSuccess: () => finish(),
      })
      controller.signal.addEventListener("abort", abort, { once: true })
      upload.start()
    })
    transferred = true
  }

  async function run() {
    if (cancelled) throw abortError()
    if (result) return result
    if (isImageFileTooLarge(file)) throw new Error(messages.payloadTooLarge)
    if (!prepared) {
      prepared = (await request<PreparedUpload>({
        action: "prepare", kind, size: file.size, type: uploadType(file), name: file.name,
      })).payload
      if (!prepared.uploadId || !prepared.bucket || !prepared.path || !prepared.token || !prepared.endpoint) {
        prepared = undefined
        throw new Error(messages.fallback)
      }
    }
    if (!transferred) await transfer(prepared)
    // Nine large photos can wait while each server instance protects decoder memory.
    // Preserve the uploaded file while waiting, including after a lost response.
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const { response, payload } = await request<UploadedCommunityImage & { retryAfterMs?: number }>({
        action: "complete", uploadId: prepared.uploadId,
      })
      if (response.status === 202) {
        await wait(Math.min(5000, Math.max(1000, payload.retryAfterMs ?? 2000)), controller.signal)
        continue
      }
      if (!payload.storagePath || !payload.previewUrl) throw new Error(messages.fallback)
      result = payload
      return result
    }
    throw new Error(messages.fallback)
  }

  return {
    upload() {
      if (!active) {
        const resuming = Boolean(prepared)
        active = run().catch((error) => {
          // A retry may discover that the previous request cancelled or expired.
          // Refresh it once within that same click, without repeating invalid files automatically.
          if (resuming && error instanceof UploadSessionResetError && !cancelled) return run()
          throw error
        }).finally(() => { active = undefined })
      }
      return active
    },
    cancel() {
      cancelled = true
      controller.abort()
      if (prepared && !result) {
        void fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cancel", uploadId: prepared.uploadId }),
          keepalive: true,
        }).catch(() => undefined)
      }
    },
  }
}

export type DirectImageUpload = ReturnType<typeof createDirectImageUpload>
