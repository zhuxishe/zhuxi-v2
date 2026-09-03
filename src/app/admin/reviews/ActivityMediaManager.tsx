"use client"

import Image from "next/image"
import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp, ImagePlus, RefreshCw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"
import { rewriteStorageUrl } from "@/lib/storage-url"
import { createClient } from "@/lib/supabase/client"
import {
  discardPastEventReviewMediaUpload,
  finalizePastEventReviewMediaUpload,
  preparePastEventReviewMediaUpload,
  removePastEventReviewGalleryImage,
  updatePastEventReview,
} from "./actions"

interface Props {
  reviewId: string
  updatedAt: string
  coverUrl: string
  galleryUrls: string[]
  onCoverUrlChange: (url: string) => void
  onGalleryUrlsChange: (urls: string[]) => void
}

export function ActivityMediaManager({
  reviewId,
  updatedAt,
  coverUrl,
  galleryUrls,
  onCoverUrlChange,
  onGalleryUrlsChange,
}: Props) {
  const router = useRouter()
  const revisionRef = useRef(updatedAt)
  const coverInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [galleryFiles, setGalleryFiles] = useState<File[]>([])
  const [auditReason, setAuditReason] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const reasonValid = adminAuditReasonIsValid(auditReason)

  useEffect(() => {
    revisionRef.current = updatedAt
  }, [updatedAt])

  function adoptRevision(result: { updatedAt?: string }) {
    if (result.updatedAt) revisionRef.current = result.updatedAt
  }

  function uploadCover() {
    if (!coverFile || !reasonValid) return
    startTransition(async () => {
      setError(null)
      setMessage(null)
      try {
        const result = await uploadMedia("cover", coverFile)
        if (result.error) {
          setError(result.error)
          return
        }
        adoptRevision(result)
        setCoverFile(null)
        if (coverInput.current) coverInput.current.value = ""
        if (result.url) onCoverUrlChange(result.url)
        setMessage(result.warning ?? "封面已替换")
        router.refresh()
      } catch (caught) {
        console.error("[ActivityMediaManager:cover]", caught)
        setError("图片上传响应中断，请重试；系统不会覆盖原封面。")
      }
    })
  }

  function appendGallery() {
    if (galleryFiles.length === 0 || !reasonValid) return
    startTransition(async () => {
      setError(null)
      setMessage(null)
      const nextGallery = [...galleryUrls]
      try {
        for (const file of galleryFiles) {
          const result = await uploadMedia("gallery", file)
          if (result.error) {
            onGalleryUrlsChange(nextGallery)
            setError(`已上传部分图片；${result.error}`)
            router.refresh()
            return
          }
          adoptRevision(result)
          if (result.url && !nextGallery.includes(result.url)) nextGallery.push(result.url)
        }
        onGalleryUrlsChange(nextGallery)
        setGalleryFiles([])
        if (galleryInput.current) galleryInput.current.value = ""
        setMessage("活动图片已追加")
        router.refresh()
      } catch (caught) {
        console.error("[ActivityMediaManager:gallery]", caught)
        onGalleryUrlsChange(nextGallery)
        setError("图片上传响应中断，已成功的图片会保留；请刷新后重试其余图片。")
        router.refresh()
      }
    })
  }

  async function uploadMedia(
    kind: "cover" | "gallery",
    file: File,
  ): Promise<{ error?: string; url?: string; updatedAt?: string; warning?: string }> {
    const prepared = await preparePastEventReviewMediaUpload(
      reviewId,
      kind,
      { size: file.size, type: file.type },
      auditReason,
      revisionRef.current,
    )
    if (prepared.error || !prepared.path || !prepared.token || !prepared.preparedUpdatedAt) {
      return { error: prepared.error ?? "无法准备图片上传" }
    }
    try {
      const { error: uploadError } = await createClient().storage
        .from(prepared.bucket ?? "activity-media")
        .uploadToSignedUrl(prepared.path, prepared.token, file, {
          contentType: file.type,
          cacheControl: "31536000",
        })
      if (uploadError) {
        await discardPastEventReviewMediaUpload(reviewId, kind, prepared.path, auditReason)
        return { error: `图片上传失败: ${uploadError.message}` }
      }
    } catch (caught) {
      console.error("[ActivityMediaManager:directUpload]", caught)
      try {
        await discardPastEventReviewMediaUpload(reviewId, kind, prepared.path, auditReason)
      } catch { /* retry via cleanup outbox */ }
      return { error: "图片上传响应中断，请重试" }
    }
    try {
      return await finalizePastEventReviewMediaUpload(
        reviewId,
        kind,
        prepared.path,
        auditReason,
        prepared.preparedUpdatedAt,
      )
    } catch {
      return finalizePastEventReviewMediaUpload(
        reviewId,
        kind,
        prepared.path,
        auditReason,
        prepared.preparedUpdatedAt,
      )
    }
  }

  function removeGalleryImage(url: string) {
    if (!reasonValid) return
    startTransition(async () => {
      setError(null)
      setMessage(null)
      const result = await removePastEventReviewGalleryImage(
        reviewId,
        url,
        auditReason,
        revisionRef.current,
      )
      if (result.error) {
        setError(result.error)
        return
      }
      adoptRevision(result)
      onGalleryUrlsChange(galleryUrls.filter((item) => item !== url))
      setMessage(result.warning ?? "图片已移除")
      router.refresh()
    })
  }

  function moveGalleryImage(index: number, delta: -1 | 1) {
    const target = index + delta
    if (!reasonValid || target < 0 || target >= galleryUrls.length) return
    const nextGallery = [...galleryUrls]
    ;[nextGallery[index], nextGallery[target]] = [nextGallery[target], nextGallery[index]]
    startTransition(async () => {
      setError(null)
      setMessage(null)
      const result = await updatePastEventReview(
        reviewId,
        { gallery_urls: nextGallery },
        auditReason,
        revisionRef.current,
      )
      if (result.error) {
        setError(result.error)
        return
      }
      adoptRevision(result)
      onGalleryUrlsChange(nextGallery)
      setMessage("活动图片顺序已保存")
      router.refresh()
    })
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-background p-4">
      <div>
        <h4 className="text-sm font-semibold">托管图片</h4>
        <p className="mt-1 text-xs text-muted-foreground">支持 JPG、PNG、WebP，单张不超过 8MB。外部 URL 可继续在上方字段维护。</p>
      </div>

      <label className="grid gap-1 text-xs font-medium">
        本次媒体操作理由 *
        <input
          value={auditReason}
          onChange={(event) => setAuditReason(event.target.value)}
          minLength={4}
          maxLength={500}
          placeholder="必填，4–500 字；将写入后台审计"
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-medium">当前封面</p>
          <div className="relative aspect-video overflow-hidden rounded-lg border border-border bg-muted">
            <Image src={rewriteStorageUrl(coverUrl)} alt="当前活动封面" fill sizes="320px" className="object-cover" unoptimized />
          </div>
          <input
            ref={coverInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            disabled={pending}
            onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)}
            className="block w-full text-xs text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1"
          />
          <Button type="button" variant="outline" size="sm" onClick={uploadCover} disabled={pending || !coverFile || !reasonValid}>
            <RefreshCw className="size-4" />替换封面
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium">追加活动图片</p>
          <input
            ref={galleryInput}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            disabled={pending}
            onChange={(event) => setGalleryFiles(Array.from(event.target.files ?? []))}
            className="block w-full text-xs text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1"
          />
          <Button type="button" variant="outline" size="sm" onClick={appendGallery} disabled={pending || galleryFiles.length === 0 || !reasonValid}>
            <ImagePlus className="size-4" />追加 {galleryFiles.length || ""} 张图片
          </Button>
        </div>
      </div>

      {galleryUrls.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {galleryUrls.map((url, index) => (
            <div key={`${url}:${index}`} className="group relative aspect-video overflow-hidden rounded-lg border border-border bg-muted">
              <Image src={rewriteStorageUrl(url)} alt={`活动图片 ${index + 1}`} fill sizes="180px" className="object-cover" unoptimized />
              <button
                type="button"
                onClick={() => removeGalleryImage(url)}
                disabled={pending || !reasonValid}
                aria-label={`移除活动图片 ${index + 1}`}
                className="absolute right-1 top-1 grid size-8 place-items-center rounded-full bg-background/90 text-destructive shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="size-4" />
              </button>
              <div className="absolute bottom-1 right-1 flex gap-1">
                <button
                  type="button"
                  onClick={() => moveGalleryImage(index, -1)}
                  disabled={pending || !reasonValid || index === 0}
                  aria-label={`将活动图片 ${index + 1} 前移`}
                  className="grid size-8 place-items-center rounded-full bg-background/90 text-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowUp className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveGalleryImage(index, 1)}
                  disabled={pending || !reasonValid || index === galleryUrls.length - 1}
                  aria-label={`将活动图片 ${index + 1} 后移`}
                  className="grid size-8 place-items-center rounded-full bg-background/90 text-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowDown className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(message || error) && (
        <p role={error ? "alert" : "status"} className={`text-xs ${error ? "text-destructive" : "text-primary"}`}>
          {error ?? message}
        </p>
      )}
    </div>
  )
}
