"use client"

import Image from "next/image"
import { useRef, useState, useCallback } from "react"

interface Props {
  coverUrl: string | null
  onUpload: (file: File) => void
}

export function ScriptCoverUpload({ coverUrl, onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return
      const reader = new FileReader()
      reader.onload = (e) => setPreview(e.target?.result as string)
      reader.readAsDataURL(file)
      onUpload(file)
    },
    [onUpload]
  )

  const displayUrl = preview ?? coverUrl

  return (
    <div
      className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors cursor-pointer aspect-[3/4] max-w-[200px] ${
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
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />

      {displayUrl ? (
        <Image
          src={displayUrl}
          alt="封面预览"
          fill
          unoptimized
          sizes="200px"
          className="rounded-xl object-cover"
        />
      ) : (
        <div className="flex flex-col items-center gap-2 p-4 text-center">
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
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z"
            />
          </svg>
          <span className="text-xs text-muted-foreground">
            点击或拖拽上传封面
          </span>
          <span className="text-xs text-muted-foreground/60">
            推荐 3:4 比例
          </span>
        </div>
      )}

      {displayUrl && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
          <span className="text-xs text-white font-medium">点击更换</span>
        </div>
      )}
    </div>
  )
}
