"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react"
import type { CommunityPostImage } from "@/lib/community/types"
import { communityMediaUrl } from "@/lib/community/media"

export function PhotoViewer({ images, authorLabel, locale }: { images: CommunityPostImage[]; authorLabel: string; locale: "zh" | "ja" }) {
  const ordered = [...images].sort((a, b) => a.sortOrder - b.sortOrder)
  const [active, setActive] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const stageRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<{ point: { x: number; y: number }; pan: { x: number; y: number } } | null>(null)
  const pinch = useRef<{
    distance: number
    zoom: number
    center: { x: number; y: number }
    pan: { x: number; y: number }
  } | null>(null)
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  const historyOpen = useRef(false)
  const label = (zh: string, ja: string) => locale === "ja" ? ja : zh

  function clampPan(next: { x: number; y: number }, nextZoom: number) {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect || nextZoom <= 1) return { x: 0, y: 0 }
    const maxX = rect.width * (nextZoom - 1) / 2
    const maxY = rect.height * (nextZoom - 1) / 2
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    }
  }

  function applyTransform(nextZoom: number, nextPan = panRef.current) {
    const clampedZoom = Math.max(1, Math.min(4, nextZoom))
    const clampedPan = clampPan(nextPan, clampedZoom)
    zoomRef.current = clampedZoom
    panRef.current = clampedPan
    setZoom(clampedZoom)
    setPan(clampedPan)
  }

  function resetTransform() {
    pointers.current.clear()
    drag.current = null
    pinch.current = null
    swipeStart.current = null
    applyTransform(1, { x: 0, y: 0 })
  }

  useEffect(() => {
    function pop() {
      if (historyOpen.current) {
        historyOpen.current = false
        setActive(null)
        pointers.current.clear()
        zoomRef.current = 1
        panRef.current = { x: 0, y: 0 }
        setZoom(1)
        setPan({ x: 0, y: 0 })
      }
    }
    window.addEventListener("popstate", pop)
    return () => window.removeEventListener("popstate", pop)
  }, [])

  useEffect(() => {
    if (active === null) return
    function resetKeyboardTransform() {
      pointers.current.clear()
      zoomRef.current = 1
      panRef.current = { x: 0, y: 0 }
      setZoom(1)
      setPan({ x: 0, y: 0 })
    }
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (historyOpen.current) window.history.back()
        else setActive(null)
      }
      if (event.key === "ArrowLeft") {
        setActive((current) => current === null ? null : (current - 1 + ordered.length) % ordered.length)
        resetKeyboardTransform()
      }
      if (event.key === "ArrowRight") {
        setActive((current) => current === null ? null : (current + 1) % ordered.length)
        resetKeyboardTransform()
      }
    }
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", keydown)
    return () => {
      document.body.style.overflow = ""
      window.removeEventListener("keydown", keydown)
    }
  }, [active, ordered.length])

  function open(index: number) {
    setActive(index)
    resetTransform()
    if (!historyOpen.current) {
      window.history.pushState({ communityPhotoViewer: true }, "")
      historyOpen.current = true
    }
  }

  function close() {
    if (historyOpen.current) window.history.back()
    else setActive(null)
  }

  function previous() {
    setActive((current) => current === null ? null : (current - 1 + ordered.length) % ordered.length)
    resetTransform()
  }

  function next() {
    setActive((current) => current === null ? null : (current + 1) % ordered.length)
    resetTransform()
  }

  function pointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = { x: event.clientX, y: event.clientY }
    pointers.current.set(event.pointerId, point)
    if (pointers.current.size === 1) {
      drag.current = { point, pan: panRef.current }
      swipeStart.current = point
      return
    }
    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()]
      pinch.current = {
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        zoom: zoomRef.current,
        center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
        pan: panRef.current,
      }
      drag.current = null
      swipeStart.current = null
    }
  }

  function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2 && pinch.current) {
      const [first, second] = [...pointers.current.values()]
      const distance = Math.hypot(second.x - first.x, second.y - first.y)
      const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
      const nextZoom = pinch.current.zoom * (distance / Math.max(1, pinch.current.distance))
      applyTransform(nextZoom, {
        x: pinch.current.pan.x + center.x - pinch.current.center.x,
        y: pinch.current.pan.y + center.y - pinch.current.center.y,
      })
      return
    }
    if (pointers.current.size === 1 && drag.current && zoomRef.current > 1) {
      applyTransform(zoomRef.current, {
        x: drag.current.pan.x + event.clientX - drag.current.point.x,
        y: drag.current.pan.y + event.clientY - drag.current.point.y,
      })
    }
  }

  function pointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = swipeStart.current
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 1) {
      const point = [...pointers.current.values()][0]
      drag.current = { point, pan: panRef.current }
    } else {
      drag.current = null
    }
    if (pointers.current.size === 0 && start && zoomRef.current === 1) {
      const deltaX = event.clientX - start.x
      const deltaY = event.clientY - start.y
      if (Math.abs(deltaX) > 55 && Math.abs(deltaX) > Math.abs(deltaY)) {
        deltaX > 0 ? previous() : next()
      }
    }
    swipeStart.current = null
  }

  return (
    <>
      <div className={`mt-3 grid gap-1 overflow-hidden rounded-2xl ${ordered.length === 1 ? "grid-cols-1" : ordered.length === 2 || ordered.length === 4 ? "grid-cols-2" : "grid-cols-3"}`}>
        {ordered.map((image, index) => (
          <button key={image.id} type="button" onClick={() => open(index)} className={`relative overflow-hidden bg-muted ${ordered.length === 1 ? "min-h-56" : "aspect-square"}`} aria-label={`${authorLabel} · ${label("照片", "写真")} ${index + 1}/${ordered.length}`}>
            <Image src={communityMediaUrl(image.thumbnailPath || image.storagePath, true)} alt="" fill unoptimized className="object-cover" sizes={ordered.length === 1 ? "384px" : "128px"} />
          </button>
        ))}
      </div>

      {active !== null && ordered[active] && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={label("照片大图", "写真ビューア")}>
          <div className="flex min-h-14 items-center justify-between px-2 pt-[env(safe-area-inset-top)]">
            <button type="button" onClick={close} aria-label={label("关闭", "閉じる")} className="grid size-11 place-items-center rounded-full bg-white/10"><X className="size-6" /></button>
            <span className="text-sm font-medium">{active + 1} / {ordered.length}</span>
            <div className="flex">
              <button type="button" onClick={() => applyTransform(zoomRef.current - 0.5)} aria-label={label("缩小", "縮小")} className="grid size-11 place-items-center"><ZoomOut className="size-5" /></button>
              <button type="button" onClick={() => applyTransform(zoomRef.current + 0.5)} aria-label={label("放大", "拡大")} className="grid size-11 place-items-center"><ZoomIn className="size-5" /></button>
            </div>
          </div>
          <div
            ref={stageRef}
            className="relative flex-1 touch-none overflow-hidden"
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
            onDoubleClick={() => applyTransform(zoomRef.current === 1 ? 2 : 1, { x: 0, y: 0 })}
          >
            <Image
              src={communityMediaUrl(ordered[active].storagePath)}
              alt={`${authorLabel} · ${label("照片", "写真")} ${active + 1}`}
              fill
              unoptimized
              priority
              draggable={false}
              className="select-none object-contain transition-transform duration-200 motion-reduce:transition-none"
              style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}
              sizes="100vw"
            />
            {ordered.length > 1 && (
              <>
                <button type="button" onClick={previous} aria-label={label("上一张", "前の写真")} className="absolute left-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/45"><ChevronLeft className="size-6" /></button>
                <button type="button" onClick={next} aria-label={label("下一张", "次の写真")} className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/45"><ChevronRight className="size-6" /></button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
