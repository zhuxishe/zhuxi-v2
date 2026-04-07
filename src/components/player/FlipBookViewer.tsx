"use client"

import { useState, useCallback, useRef } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface Props {
  pages: string[]       // WebP image URLs
  title?: string
}

export function FlipBookViewer({ pages, title }: Props) {
  const [current, setCurrent] = useState(0)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const total = pages.length

  const goTo = useCallback((page: number) => {
    setCurrent(Math.max(0, Math.min(total - 1, page)))
    setDragOffset(0)
  }, [total])

  const prev = useCallback(() => goTo(current - 1), [current, goTo])
  const next = useCallback(() => goTo(current + 1), [current, goTo])

  // 触摸滑动
  function handleTouchStart(e: React.TouchEvent) {
    setTouchStartX(e.touches[0].clientX)
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX === null) return
    const diff = e.touches[0].clientX - touchStartX
    setDragOffset(diff)
  }

  function handleTouchEnd() {
    if (touchStartX === null) return
    const threshold = 50
    if (dragOffset < -threshold) next()
    else if (dragOffset > threshold) prev()
    setTouchStartX(null)
    setDragOffset(0)
  }

  // 键盘
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") prev()
    else if (e.key === "ArrowRight") next()
  }

  if (total === 0) {
    return <p className="text-sm text-muted-foreground text-center py-10">暂无页面</p>
  }

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
      {/* 页面展示 */}
      <div className="relative overflow-hidden rounded-xl bg-black/5 dark:bg-white/5">
        <div
          className="transition-transform duration-300 ease-out"
          style={{
            transform: `translateX(${dragOffset * 0.3}px)`,
          }}
        >
          <img
            src={pages[current]}
            alt={`${title ?? "页面"} - 第${current + 1}页`}
            className="w-full h-auto"
            draggable={false}
          />
        </div>

        {/* 左右半区点击 */}
        <button
          onClick={prev}
          className="absolute left-0 top-0 h-full w-1/3 opacity-0"
          aria-label="上一页"
          disabled={current === 0}
        />
        <button
          onClick={next}
          className="absolute right-0 top-0 h-full w-1/3 opacity-0"
          aria-label="下一页"
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
          {/* 页面指示器（最多显示 7 个点） */}
          <div className="flex gap-1">
            {Array.from({ length: Math.min(total, 7) }, (_, i) => {
              const pageIdx = total <= 7
                ? i
                : Math.round((i / 6) * (total - 1))
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
