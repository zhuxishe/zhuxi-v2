"use client"

import { useRef, useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { validateSafeImageFile } from "@/lib/file-validation"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"
import {
  discardPastEventReviewMediaUpload,
  finalizePastEventReviewMediaUpload,
  prepareNewPastEventReviewCoverUpload,
  type ReviewPublication,
} from "./actions"
import { LargeActivityFields, reviewInputFromFormData } from "./LargeActivityFields"
import { MAX_ACTIVITY_IMAGE_BYTES } from "./media"
import { uploadActivityImage } from "./upload"

const REVIEW_CREATION_REQUEST_KEY = "zhuxishe:admin:new-review-request-id"

interface UploadedCover {
  reviewId: string
  path: string
  updatedAt: string
  publication: ReviewPublication
  reason: string
}

export function ReviewForm({ coverAspectRatioReady }: { coverAspectRatioReady: boolean }) {
  const creationRequestId = useRef<string | null>(null)
  const uploadedCover = useRef<UploadedCover | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [auditReason, setAuditReason] = useState("")
  const [hasDraft, setHasDraft] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return
    const formData = new FormData(e.currentTarget)
    setLoading(true)
    setError(null)
    try {
      if (!uploadedCover.current) {
        const upload = await uploadCover(formData)
        if ("error" in upload) return setError(upload.error)
        uploadedCover.current = upload.cover
      }
      const { reviewId, path, updatedAt, publication, reason } = uploadedCover.current
      const result = await finalizePastEventReviewMediaUpload(
        reviewId, "cover", path, reason, updatedAt, publication,
      )
      if (result.error) {
        if (!result.retryable) uploadedCover.current = null
        setConfirming(Boolean(result.retryable))
        return setError(result.error)
      }
      closeForm()
    } catch (caught) {
      console.error("[ReviewForm]", caught)
      setConfirming(Boolean(uploadedCover.current))
      setError("网络响应中断。请再次点击保存，系统会使用同一请求编号继续。")
    } finally {
      setLoading(false)
    }
  }

  async function uploadCover(formData: FormData): Promise<{ cover: UploadedCover } | { error: string }> {
    const file = formData.get("cover_file")
    if (!(file instanceof File) || file.size === 0) return { error: "请选择封面图片" }
    if (file.size > MAX_ACTIVITY_IMAGE_BYTES) return { error: "封面图片不能超过 8 MB" }
    const validation = await validateSafeImageFile(file)
    if (!validation.valid) return { error: validation.error ?? "图片文件内容无效" }

    const input = reviewInputFromFormData(formData)
    const requestId = creationRequestId.current ??= persistedCreationRequestId()
    const prepared = await prepareNewPastEventReviewCoverUpload(
      { ...input, request_id: requestId },
      { size: file.size, type: file.type },
      auditReason,
    )
    const { reviewId, path, token, preparedUpdatedAt } = prepared
    if (reviewId) setHasDraft(true)
    if (prepared.error || !reviewId || !path || !token || !preparedUpdatedAt) {
      return { error: prepared.error ?? "无法准备封面上传" }
    }

    try {
      const { error: uploadError } = await uploadActivityImage(path, token, file)
      if (!uploadError) {
        return {
          cover: {
            reviewId, path, updatedAt: preparedUpdatedAt, reason: auditReason,
            publication: {
              status: input.status ?? "draft",
              is_published: input.is_published ?? false,
              is_player_visible: input.is_player_visible ?? false,
            },
          },
        }
      }
      console.error("[ReviewForm:upload]", uploadError)
    } catch (caught) {
      console.error("[ReviewForm:upload]", caught)
    }
    const cleanup = await discardPastEventReviewMediaUpload(reviewId, "cover", path, auditReason)
    return { error: cleanup.error ? `封面上传失败，请重试。\n${cleanup.error}` : "封面上传失败，请重试" }
  }

  function persistedCreationRequestId() {
    const next = crypto.randomUUID()
    try {
      const existing = sessionStorage.getItem(REVIEW_CREATION_REQUEST_KEY)
      if (existing) return existing
      sessionStorage.setItem(REVIEW_CREATION_REQUEST_KEY, next)
    } catch {
      // The in-memory request id remains effective when browser storage is disabled.
    }
    return next
  }

  function closeForm() {
    try { sessionStorage.removeItem(REVIEW_CREATION_REQUEST_KEY) } catch { /* storage unavailable */ }
    creationRequestId.current = null
    uploadedCover.current = null
    setOpen(false)
    setAuditReason("")
    setError(null)
    setHasDraft(false)
    setConfirming(false)
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus className="size-4 mr-1" /> 添加大型活动
      </Button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-5">
      <fieldset disabled={loading || confirming} className="space-y-5">
        <LargeActivityFields showCoverAspectRatio={coverAspectRatioReady} />
        <label className="grid gap-1 text-xs font-medium">
          <span>本次创建理由 *</span>
          <input
            value={auditReason}
            onChange={(event) => setAuditReason(event.target.value)}
            minLength={4}
            maxLength={500}
            required
            placeholder="必填，4–500 字；将写入后台审计"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {error && hasDraft && !confirming && (
        <p className="text-sm text-muted-foreground">活动已存为草稿。可重试上传，或返回列表继续编辑。</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={loading || !adminAuditReasonIsValid(auditReason)}>{loading ? "保存中..." : "保存"}</Button>
        <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={closeForm}>{hasDraft ? "返回列表" : "取消"}</Button>
      </div>
    </form>
  )
}
