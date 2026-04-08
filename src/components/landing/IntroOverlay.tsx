"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { IntroAnimationMobile } from "./IntroAnimationMobile"

/**
 * 开场动画入口 — 自动选择最佳模式
 *
 * 桌面 (≥768px): 播放视频，object-cover 全屏填满
 * 手机 (<768px):  CSS 动画（Logo 分层揭示 + 文字弹出）
 */
export function IntroOverlay() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hidden, setHidden] = useState(false)
  const [fading, setFading] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setIsMobile(window.innerWidth < 768)
    setReady(true)
  }, [])

  const handleDone = useCallback(() => {
    setFading(true)
    setTimeout(() => setHidden(true), 600)
  }, [])

  if (hidden || !ready) return null

  if (isMobile) {
    return <IntroAnimationMobile onDone={handleDone} />
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      style={{
        backgroundColor: "#f7f3eb",
        opacity: fading ? 0 : 1,
        transition: "opacity 0.6s ease-out",
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        onEnded={handleDone}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ backgroundColor: "#f7f3eb" }}
      >
        <source src="/video/zhuxishe-intro-v2.webm" type="video/webm" />
        <source src="/video/zhuxishe-intro-v2.mp4" type="video/mp4" />
      </video>

      <button
        onClick={handleDone}
        className="absolute bottom-6 right-6 text-sm text-[#6b7c6b]/60 hover:text-[#2d3a2e] transition-colors z-10"
      >
        跳过 →
      </button>
    </div>
  )
}
