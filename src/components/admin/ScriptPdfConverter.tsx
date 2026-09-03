"use client"

import Image from "next/image"
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react"
import { useCallback, useMemo, useRef, useState } from "react"
import {
  cleanupUncommittedPageImages,
  deleteAllScriptFiles,
  updatePageImages,
} from "@/app/admin/scripts/[id]/convert-actions"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"
import { createClient } from "@/lib/supabase/client"

const BUCKET = "scripts"
const MAX_SIZE_MB = 100
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

interface Props {
  scriptId: string
  existingPages: string[] | null
  existingPagePaths: string[] | null
  existingPdfStoragePath: string | null
  auditReason: string
  onConverted: (
    paths: string[],
    previewUrls: string[],
    protectedUpdatedAt: string | null,
    pdfStoragePath?: string | null,
  ) => void
}

export function ScriptPdfConverter({
  scriptId,
  existingPages,
  existingPagePaths,
  existingPdfStoragePath,
  auditReason,
  onConverted,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [converting, setConverting] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const paths = useMemo(() => existingPagePaths ?? [], [existingPagePaths])
  const previewUrls = existingPages ?? []
  const canMutate = adminAuditReasonIsValid(auditReason) && !converting

  const handleFile = useCallback(async (file: File) => {
    if (!adminAuditReasonIsValid(auditReason)) {
      setError("请先填写本次修改理由"); return
    }
    if (file.type !== "application/pdf") {
      setError("请上传 PDF 格式文件"); return
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError(`文件不能超过 ${MAX_SIZE_MB}MB`); return
    }
    setError(null)
    setConverting(true)
    setStatus("加载 PDF...")

    const uploadedPaths: string[] = []
    const uploadBatchId = crypto.randomUUID()
    try {
      await convertAndUpload(file, scriptId, uploadBatchId, setStatus, uploadedPaths)
      const result = await updatePageImages(scriptId, uploadedPaths, auditReason, paths, uploadBatchId)
      if ("error" in result && result.error) {
        const cleanupWarning = await safelyCleanupAmbiguousUpload(scriptId, uploadedPaths, auditReason)
        setError(cleanupWarning ? `${result.error}；${cleanupWarning}` : result.error)
        return
      }
      setStatus(`转换完成，共 ${uploadedPaths.length} 页`)
      if (result.warning) setError(result.warning)
      onConverted(
        result.paths ?? uploadedPaths,
        result.previewUrls ?? [],
        result.protectedUpdatedAt ?? null,
      )
    } catch (caught) {
      let cleanupWarning: string | null = null
      if (uploadedPaths.length > 0) {
        cleanupWarning = await safelyCleanupAmbiguousUpload(scriptId, uploadedPaths, auditReason)
      }
      console.error("[ScriptPdfConverter]", caught)
      setError(cleanupWarning ? `PDF 转换失败；${cleanupWarning}` : "PDF 转换失败，请重试")
    } finally {
      setConverting(false)
    }
  }, [auditReason, onConverted, paths, scriptId])

  async function persistOrder(nextPaths: string[]) {
    setConverting(true)
    setError(null)
    try {
      const result = await updatePageImages(scriptId, nextPaths, auditReason, paths)
      if ("error" in result && result.error) { setError(result.error); return }
      if (result.warning) setError(result.warning)
      onConverted(
        result.paths ?? nextPaths,
        result.previewUrls ?? [],
        result.protectedUpdatedAt ?? null,
      )
    } catch (caught) {
      console.error("[ScriptPdfConverter:persistOrder]", caught)
      setError("页面顺序保存失败，请重试")
    } finally {
      setConverting(false)
    }
  }

  function movePage(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= paths.length) return
    const next = [...paths]
    ;[next[index], next[target]] = [next[target], next[index]]
    void persistOrder(next)
  }

  async function removePage(index: number) {
    await persistOrder(paths.filter((_, itemIndex) => itemIndex !== index))
  }

  async function removeAll() {
    setConverting(true)
    setError(null)
    try {
      const result = await deleteAllScriptFiles(
        scriptId,
        auditReason,
        existingPdfStoragePath,
        paths,
      )
      if (result.error) { setError(result.error); return }
      if (result.warning) setError(result.warning)
      setStatus(null)
      setConfirmDeleteAll(false)
      onConverted([], [], result.protectedUpdatedAt ?? null, null)
    } catch (caught) {
      console.error("[ScriptPdfConverter:removeAll]", caught)
      setError("删除全部文件失败，请重试")
    } finally {
      setConverting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        } ${converting ? "pointer-events-none opacity-60" : ""}`}
        onClick={() => canMutate && inputRef.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          const file = event.dataTransfer.files[0]
          if (file && canMutate) void handleFile(file)
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleFile(file)
            event.currentTarget.value = ""
          }}
        />
        {status ? (
          <p className="text-sm font-medium text-primary">{status}</p>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-center">
            <span className="text-xs text-muted-foreground">
              {paths.length > 0 ? "上传新 PDF 并替换全部页面" : "点击或拖拽 PDF，转换后上传"}
            </span>
            <span className="text-xs text-muted-foreground/60">最大 {MAX_SIZE_MB}MB；修改理由填写后可操作</span>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {paths.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">已保存 {paths.length} 页，可调整顺序或逐页删除</span>
            {!confirmDeleteAll ? (
              <button type="button" disabled={!canMutate} onClick={() => setConfirmDeleteAll(true)} className="text-xs text-destructive disabled:opacity-40">
                删除全部文件
              </button>
            ) : (
              <span className="flex items-center gap-2 text-xs">
                <button type="button" disabled={!canMutate} onClick={() => void removeAll()} className="font-medium text-destructive">确认删除全部</button>
                <button type="button" onClick={() => setConfirmDeleteAll(false)} className="text-muted-foreground">取消</button>
              </span>
            )}
          </div>
          <ol className="grid gap-2 sm:grid-cols-2">
            {paths.map((path, index) => (
              <li key={path} className="flex items-center gap-3 rounded-lg border border-border bg-background p-2">
                {previewUrls[index] ? (
                  <Image src={previewUrls[index]} alt={`第 ${index + 1} 页`} width={56} height={76} unoptimized className="h-[76px] w-14 rounded object-cover" />
                ) : (
                  <div className="grid h-[76px] w-14 place-items-center rounded bg-muted text-[10px] text-muted-foreground">第 {index + 1} 页</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">第 {index + 1} 页</p>
                  <div className="mt-2 flex gap-1">
                    <PageButton label="上移" disabled={!canMutate || index === 0} onClick={() => movePage(index, -1)}><ArrowUp className="size-3" /></PageButton>
                    <PageButton label="下移" disabled={!canMutate || index === paths.length - 1} onClick={() => movePage(index, 1)}><ArrowDown className="size-3" /></PageButton>
                    <PageButton label="删除" disabled={!canMutate} onClick={() => void removePage(index)} destructive><Trash2 className="size-3" /></PageButton>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

function PageButton({
  label,
  disabled,
  onClick,
  destructive = false,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  destructive?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded border border-border p-1 disabled:opacity-30 ${destructive ? "text-destructive" : "text-muted-foreground"}`}
    >
      {children}
    </button>
  )
}

async function convertAndUpload(
  file: File,
  scriptId: string,
  batchId: string,
  onProgress: (message: string) => void,
  uploadedPaths: string[],
) {
  const { GlobalWorkerOptions, getDocument } = await import("pdfjs-dist")
  GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.6.205/pdf.worker.min.mjs"

  const buffer = await file.arrayBuffer()
  const pdf = await getDocument({ data: buffer }).promise
  if (pdf.numPages > 500) throw new Error("PDF exceeds 500 pages")
  const supabase = createClient()
  for (let index = 1; index <= pdf.numPages; index++) {
    onProgress(`转换并上传 ${index}/${pdf.numPages}...`)
    const page = await pdf.getPage(index)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement("canvas")
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvas, viewport }).promise
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Canvas encoding failed")), "image/webp", 0.75)
    })
    const padded = String(index).padStart(3, "0")
    const path = `pages/${scriptId}/${batchId}/page_${padded}.webp`
    // Record the attempted path before awaiting Storage. A network response
    // can be lost after the object committed; server-side cleanup will verify
    // current DB references before deleting this path.
    uploadedPaths.push(path)
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: "image/webp",
      upsert: false,
    })
    if (error) throw new Error(`上传第 ${index} 页失败: ${error.message}`)
  }
}

async function safelyCleanupAmbiguousUpload(
  scriptId: string,
  paths: string[],
  auditReason: string,
) {
  try {
    const result = await cleanupUncommittedPageImages(scriptId, paths, auditReason)
    return result.error ? `临时文件清理未完成：${result.error}` : null
  } catch (error) {
    console.error("[ScriptPdfConverter:cleanupAmbiguousUpload]", error)
    return "临时文件清理状态未知，请在回收站的文件清理任务中重试"
  }
}
