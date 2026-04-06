"use client"

import { useRef, useState, useCallback } from "react"

const MAX_SIZE_MB = 50
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

interface Props {
  pdfUrl: string | null
  onUpload: (file: File) => void
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ScriptPdfUpload({ pdfUrl, onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = useCallback(
    (file: File) => {
      setError(null)
      if (file.type !== "application/pdf") {
        setError("请上传 PDF 格式的文件")
        return
      }
      if (file.size > MAX_SIZE_BYTES) {
        setError(`文件大小不能超过 ${MAX_SIZE_MB}MB`)
        return
      }
      setFileName(file.name)
      setFileSize(file.size)
      onUpload(file)
    },
    [onUpload]
  )

  const hasFile = fileName || pdfUrl

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-colors cursor-pointer ${
        dragging
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50"
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) handleFile(file)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />

      {hasFile ? (
        <div className="flex items-center gap-3">
          <svg
            className="h-8 w-8 text-red-500 shrink-0"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zm-2.5 9.5a1 1 0 011-1h1a1 1 0 010 2h-1a1 1 0 01-1-1z" />
          </svg>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {fileName ?? "已上传 PDF"}
            </p>
            {fileSize && (
              <p className="text-xs text-muted-foreground">
                {formatSize(fileSize)}
              </p>
            )}
            <p className="text-xs text-primary mt-0.5">点击更换文件</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-center">
          <svg
            className="h-8 w-8 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
          <span className="text-xs text-muted-foreground">
            点击或拖拽上传 PDF
          </span>
          <span className="text-xs text-muted-foreground/60">
            最大 {MAX_SIZE_MB}MB
          </span>
        </div>
      )}

      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
    </div>
  )
}
