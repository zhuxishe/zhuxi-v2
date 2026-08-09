"use client"

import Image from "next/image"
import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, GripVertical, ImagePlus, RotateCcw, Trash2, UserRound } from "lucide-react"
import { createPhotoPostAction, updateCommunityPostAction } from "@/app/app/community/actions"
import { ComposerHeader } from "./ComposerHeader"
import {
  imageSizeError,
  isImageFileTooLarge,
  readUploadResponse,
} from "@/lib/community/upload"
import type {
  CommunityActionState,
  CommunityPost,
  CommunityProfile,
  UploadedCommunityImage,
} from "@/lib/community/types"

const INITIAL_STATE: CommunityActionState = {}

interface UploadItem {
  id: string
  file?: File
  preview: string
  status: "uploading" | "ready" | "error"
  result?: UploadedCommunityImage
  error?: string
}

interface PhotoComposerProps {
  profile: CommunityProfile
  locale: "zh" | "ja"
  post?: CommunityPost
}

export function PhotoComposer({ profile, locale, post }: PhotoComposerProps) {
  const router = useRouter()
  const inputId = useId()
  const serverAction = post
    ? updateCommunityPostAction.bind(null, post.id, "photo" as const)
    : createPhotoPostAction
  const [state, action, pending] = useActionState(serverAction, INITIAL_STATE)
  const [body, setBody] = useState(post?.body ?? "")
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [items, setItems] = useState<UploadItem[]>(() => post?.images.map((image) => ({
    id: image.id,
    preview: `/api/community/media?${new URLSearchParams({ bucket: "community-media", path: image.thumbnailPath || image.storagePath })}`,
    status: "ready" as const,
    result: {
      storagePath: image.storagePath,
      thumbnailPath: image.thumbnailPath,
      width: image.width ?? 0,
      height: image.height ?? 0,
      byteSize: image.byteSize ?? 1,
      mimeType: "image/webp" as const,
    },
  })) ?? [])
  const itemsRef = useRef<UploadItem[]>([])
  const uploading = items.some((item) => item.status === "uploading")
  const allReady = items.length > 0 && items.every((item) => item.status === "ready")
  const serialized = useMemo(
    () => JSON.stringify(items.flatMap((item) => item.result ? [item.result] : [])),
    [items],
  )
  const initialSerialized = useMemo(() => JSON.stringify(post?.images.map((image) => ({
    storagePath: image.storagePath,
    thumbnailPath: image.thumbnailPath,
    width: image.width ?? 0,
    height: image.height ?? 0,
    byteSize: image.byteSize ?? 1,
    mimeType: "image/webp",
  })) ?? []), [post])
  const dirty = body !== (post?.body ?? "")
    || serialized !== initialSerialized
    || items.some((item) => !item.result)

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => () => {
    for (const item of itemsRef.current) URL.revokeObjectURL(item.preview)
  }, [])

  async function upload(item: UploadItem) {
    if (!item.file) return
    const sizeError = imageSizeError(locale)
    if (isImageFileTooLarge(item.file)) {
      setItems((current) => current.map((row) => row.id === item.id ? {
        ...row,
        status: "error",
        error: sizeError,
      } : row))
      return
    }
    setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: "uploading", error: undefined } : row))
    const data = new FormData()
    data.set("kind", "photo")
    data.set("file", item.file)
    try {
      const response = await fetch("/api/community/uploads", { method: "POST", body: data })
      const fallback = locale === "ja" ? "アップロードに失敗しました" : "上传失败"
      const result = await readUploadResponse<UploadedCommunityImage>(response, {
        fallback,
        payloadTooLarge: sizeError,
      })
      if (!response.ok) throw new Error(result.error || fallback)
      setItems((current) => current.map((row) => {
        if (row.id !== item.id) return row
        if (row.preview.startsWith("blob:")) URL.revokeObjectURL(row.preview)
        return {
          ...row,
          preview: result.previewUrl || row.preview,
          status: "ready",
          result,
          error: undefined,
        }
      }))
    } catch (error) {
      setItems((current) => current.map((row) => row.id === item.id ? {
        ...row,
        status: "error",
        error: error instanceof Error ? error.message : (locale === "ja" ? "アップロードに失敗しました" : "上传失败"),
      } : row))
    }
  }

  function addFiles(files: FileList | null) {
    if (!files) return
    const available = Math.max(0, 9 - items.length)
    const selected = Array.from(files).slice(0, available)
    const accepted = selected.filter((file) => !isImageFileTooLarge(file))
    setSelectionError(accepted.length === selected.length ? null : imageSizeError(locale))
    const next = accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      status: "uploading" as const,
    }))
    setItems((current) => [...current, ...next])
    for (const item of next) void upload(item)
  }

  function removeItem(id: string) {
    setItems((current) => {
      const item = current.find((row) => row.id === id)
      if (item) URL.revokeObjectURL(item.preview)
      return current.filter((row) => row.id !== id)
    })
  }

  function moveItem(sourceId: string, targetId: string) {
    setItems((current) => {
      const source = current.findIndex((item) => item.id === sourceId)
      const target = current.findIndex((item) => item.id === targetId)
      if (source < 0 || target < 0 || source === target) return current
      const copy = [...current]
      const [moved] = copy.splice(source, 1)
      copy.splice(target, 0, moved)
      return copy
    })
  }

  function moveBy(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    moveItem(items[index].id, items[target].id)
  }

  function goBack() {
    if (!dirty || window.confirm(locale === "ja" ? "編集中の内容を破棄しますか？" : "放弃未发布的内容？")) {
      router.back()
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <ComposerHeader
        title={post ? (locale === "ja" ? "写真投稿を編集" : "编辑照片动态") : (locale === "ja" ? "写真を投稿" : "发布照片")}
        submitLabel={post ? (locale === "ja" ? "保存" : "保存") : (locale === "ja" ? "投稿" : "发布")}
        formId="photo-composer"
        pending={pending || uploading}
        disabled={!allReady}
        onBack={goBack}
      />
      <form id="photo-composer" action={action} className="space-y-5 px-4 py-5">
        <input type="hidden" name="images" value={serialized} />
        <div className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-soft">
          <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary"><UserRound className="size-5" /></span>
          <div>
            <p className="text-xs text-muted-foreground">{locale === "ja" ? "投稿者" : "发布身份"}</p>
            <p className="font-semibold">{profile.nickname}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <textarea
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={500}
            rows={4}
            placeholder={locale === "ja" ? "ひとこと（任意）……" : "写点什么（选填）……"}
            className="w-full resize-none bg-transparent text-[15px] leading-6 outline-none placeholder:text-muted-foreground"
          />
          <p className="text-right text-xs text-muted-foreground">{body.length} / 500</p>
        </div>

        <section aria-labelledby="photo-select-title" className="rounded-2xl bg-card p-4 shadow-soft">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="photo-select-title" className="font-semibold">{locale === "ja" ? "写真" : "照片"}</h2>
            <span className="text-xs text-muted-foreground">{items.length} / 9</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {items.map((item, index) => (
              <div
                key={item.id}
                draggable
                onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => moveItem(event.dataTransfer.getData("text/plain"), item.id)}
                className="relative aspect-square overflow-hidden rounded-xl bg-muted"
              >
                <Image src={item.preview} alt={locale === "ja" ? `写真 ${index + 1}` : `第 ${index + 1} 张照片`} fill unoptimized className="object-cover" sizes="30vw" />
                <span className="absolute left-1 top-1 grid size-7 place-items-center rounded-full bg-black/55 text-white"><GripVertical className="size-4" /></span>
                <button type="button" aria-label={locale === "ja" ? "写真を削除" : "移除照片"} onClick={() => removeItem(item.id)} className="absolute right-1 top-1 grid size-11 place-items-center rounded-full bg-black/60 text-white">
                  <Trash2 className="size-4" />
                </button>
                {items.length > 1 && item.status === "ready" && (
                  <span className="absolute bottom-1 left-1/2 flex -translate-x-1/2 overflow-hidden rounded-full bg-black/60 text-white">
                    <button type="button" disabled={index === 0} onClick={() => moveBy(index, -1)} aria-label={locale === "ja" ? "前へ移動" : "向前移动"} className="grid size-11 place-items-center disabled:opacity-30"><ChevronLeft className="size-4" /></button>
                    <button type="button" disabled={index === items.length - 1} onClick={() => moveBy(index, 1)} aria-label={locale === "ja" ? "後ろへ移動" : "向后移动"} className="grid size-11 place-items-center disabled:opacity-30"><ChevronRight className="size-4" /></button>
                  </span>
                )}
                {item.status !== "ready" && (
                  <div className="absolute inset-0 grid place-items-center bg-black/55 px-2 text-center text-xs text-white">
                    {item.status === "uploading" ? (locale === "ja" ? "処理中…" : "处理中…") : (
                      <button type="button" onClick={() => void upload(item)} className="flex min-h-10 flex-col items-center justify-center gap-1">
                        <RotateCcw className="size-4" />
                        {locale === "ja" ? "再試行" : "重试"}
                      </button>
                    )}
                  </div>
                )}
                {item.status === "error" && item.error ? (
                  <span className="sr-only" role="alert">{item.error}</span>
                ) : null}
              </div>
            ))}
            {items.length < 9 && (
              <label htmlFor={inputId} className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 text-xs font-medium text-primary">
                <ImagePlus className="size-6" />
                {locale === "ja" ? "追加" : "添加照片"}
              </label>
            )}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {locale === "ja" ? "写真は1枚4MB以下。JPG・PNG・WebP・HEICに対応しています。" : "单张照片不超过 4MB，支持 JPG、PNG、WebP 和 HEIC。"}
          </p>
          {selectionError ? <p className="mt-2 text-xs text-destructive" role="alert">{selectionError}</p> : null}
          {items.some((item) => item.status === "error") ? (
            <ul className="mt-3 space-y-1 text-xs text-destructive" role="alert">
              {items.map((item, index) => item.status === "error" ? (
                <li key={item.id}>{locale === "ja" ? `写真 ${index + 1}` : `第 ${index + 1} 张照片`}：{item.error || (locale === "ja" ? "アップロードに失敗しました" : "上传失败")}</li>
              ) : null)}
            </ul>
          ) : null}
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
            multiple
            className="sr-only"
            onChange={(event) => {
              addFiles(event.target.files)
              event.target.value = ""
            }}
          />
        </section>

        {state.error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>}
      </form>
    </div>
  )
}
