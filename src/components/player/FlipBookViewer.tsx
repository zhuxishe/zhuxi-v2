"use client"

import Image from "next/image"
import { useState, useCallback, useRef } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useTranslations } from "next-intl"

interface Props {
  pages: string[]
  title?: string
}

export function FlipBookViewer({ pages, title }: Props) {
  const t = useTranslations("flipbook")
  const [current, setCurrent] = useState(0)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const total = pages.length

  const goTo = useCallback((page: number) => {
    const clamped = Math.max(0, Math.min(total - 1, page))
    if (clamped === current) return
    setCurrent(clamped)
    setDragOffset(0)
  }, [total, current])

  const prev = useCallback(() => goTo(current - 1), [current, goTo])
  const next = useCallback(() => goTo(current + 1), [current, goTo])

  function handleTouchStart(e: React.TouchEvent) {
    setTouchStartX(e.touches[0].clientX)
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX === null) return
    setDragOffset(e.touches[0].clientX - touchStartX)
  }
  function handleTouchEnd() {
    if (touchStartX === null) return
    if (dragOffset < -50) next()
    else if (dragOffset > 50) prev()
    else setDragOffset(0)
    setTouchStartX(null)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") prev()
    else if (e.key === "ArrowRight") next()
  }

  if (total === 0) {
    return <p className="text-sm text-muted-foreground text-center py-10">{t("noPages")}</p>
  }

  // 拖拽时实时偏移，松手后 snap 回位
  const isDragging = touchStartX !== null
  const translateX = isDragging ? dragOffset : 0

  return (
    <div
      ref={containerRef}
      className="relative select-none outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* 页面展示 — 横向滚动条，CSS scroll-snap 翻页 */}
      <div className="relative overflow-hidden rounded-xl bg-black/5 dark:bg-white/5">
        <div
          className="flex"
          style={{
            transform: `translateX(calc(-${current * 100}% + ${translateX * 0.4}px))`,
            transition: isDragging ? "none" : "transform 300ms cubic-bezier(0.25,0.1,0.25,1)",
          }}
        >
          {pages.map((url, i) => (
            <Image
              key={i}
              src={url}
              alt={t("pageAlt", { title: title ?? "", page: i + 1 })}
              width={900}
              height={1200}
              sizes="100vw"
              priority={i === 0}
              className="w-full h-auto shrink-0"
              loading={i === 0 ? "eager" : "lazy"}
            />
          ))}
        </div>

        {/* 左右半区点击 */}
        <button
          onClick={prev}
          className="absolute left-0 top-0 h-full w-1/3 opacity-0"
          aria-label={t("prevPage")}
          disabled={current === 0}
        />
        <button
          onClick={next}
          className="absolute right-0 top-0 h-full w-1/3 opacity-0"
          aria-label={t("nextPage")}
          disabled={current === total - 1}
        />
      </div>

      {/* 底部控制栏 */}
      <div className="flex items-center justify-between px-2 py-2">
        <button
          onClick={prev}
          disabled={current === 0}
          className="rounded-full p-2 text-muted-foreground hover:bg-muted disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="size-5" />
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {current + 1} / {total}
          </span>
          <div className="flex gap-1">
            {Array.from({ length: Math.min(total, 7) }, (_, i) => {
              const pageIdx = total <= 7 ? i : Math.round((i / 6) * (total - 1))
              return (
                <button
                  key={i}
                  onClick={() => goTo(pageIdx)}
                  className={`rounded-full transition-all ${
                    pageIdx === current
                      ? "size-2 bg-primary"
                      : "size-1.5 bg-muted-foreground/30"
                  }`}
                />
              )
            })}
          </div>
        </div>

        <button
          onClick={next}
          disabled={current === total - 1}
          className="rounded-full p-2 text-muted-foreground hover:bg-muted disabled:opacity-30 transition-colors"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
    </div>
  )
}
