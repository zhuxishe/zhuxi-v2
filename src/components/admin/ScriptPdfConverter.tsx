"use client"

import Image from "next/image"
import { useRef, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { updatePageImages } from "@/app/admin/scripts/[id]/convert-actions"

const BUCKET = "scripts"
const MAX_SIZE_MB = 100
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

interface Props {
  scriptId: string
  existingPages: string[] | null
  onConverted: (urls: string[]) => void
}

export function ScriptPdfConverter({ scriptId, existingPages, onConverted }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [converting, setConverting] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const hasPages = existingPages && existingPages.length > 0

  const handleFile = useCallback(async (file: File) => {
    if (file.type !== "application/pdf") {
      setError("请上传 PDF 格式文件"); return
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError(`文件不能超过 ${MAX_SIZE_MB}MB`); return
    }
    setError(null)
    setConverting(true)
    setStatus("加载 PDF...")

    try {
      const urls = await convertAndUpload(file, scriptId, setStatus)
      setPreview(urls[0])
      const res = await updatePageImages(scriptId, urls, urls.length)
      if (res.error) { setError(res.error); setConverting(false); return }
      setStatus(`转换完成，共 ${urls.length} 页`)
      onConverted(urls)
    } catch (e) {
      setError(e instanceof Error ? e.message : "转换失败")
    } finally {
      setConverting(false)
    }
  }, [scriptId, onConverted])

  return (
    <div className="space-y-3">
      <div
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-colors cursor-pointer ${
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        } ${converting ? "pointer-events-none opacity-60" : ""}`}
        onClick={() => !converting && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragging(false)
          const f = e.dataTransfer.files[0]
          if (f && !converting) handleFile(f)
        }}
      >
        <input ref={inputRef} type="file" accept=".pdf" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        {status ? (
          <p className="text-sm text-primary font-medium">{status}</p>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-center">
            <span className="text-xs text-muted-foreground">
              {hasPages ? "点击重新转换 PDF" : "点击或拖拽上传 PDF 并转换为图片"}
            </span>
            <span className="text-xs text-muted-foreground/60">最大 {MAX_SIZE_MB}MB</span>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {(preview || hasPages) && (
        <div className="flex items-center gap-3">
          <Image
            src={preview ?? existingPages![0]}
            alt="第一页预览"
            width={80}
            height={112}
            className="w-20 h-28 object-cover rounded border border-border"
          />
          <span className="text-xs text-muted-foreground">
            {existingPages?.length ?? 0} 页已转换
          </span>
        </div>
      )}
    </div>
  )
}

async function convertAndUpload(
  file: File,
  scriptId: string,
  onProgress: (msg: string) => void
): Promise<string[]> {
  const { GlobalWorkerOptions, getDocument } = await import("pdfjs-dist")
  GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.6.205/pdf.worker.min.mjs"

  const buf = await file.arrayBuffer()
  const pdf = await getDocument({ data: buf }).promise
  const total = pdf.numPages
  const supabase = createClient()
  const urls: string[] = []

  for (let i = 1; i <= total; i++) {
    onProgress(`转换中 ${i}/${total}...`)
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement("canvas")
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvas, viewport }).promise

    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/webp", 0.75)
    )
    const padded = String(i).padStart(3, "0")
    const path = `pages/${scriptId}/page_${padded}.webp`

    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: "image/webp", upsert: true,
    })
    if (error) throw new Error(`上传第 ${i} 页失败: ${error.message}`)

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    urls.push(data.publicUrl)
  }

  return urls
}
