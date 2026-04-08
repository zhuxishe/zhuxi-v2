"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { IntroAnimationMobile } from "./IntroAnimationMobile"

/**
 * 开场动画入口 — 自动选择最佳模式
 *
 * 桌面/横屏: 播放 Remotion 渲染的完整视频（16:9 网络扩散+Logo）
 * 手机/竖屏: 原生 CSS 动画（Logo+文字弹出+竹叶飘落），零加载
 */
export function IntroOverlay() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hidden, setHidden] = useState(false)
  const [fading, setFading] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // 用宽度判断而非方向，平板横屏也走视频
    const mobile = window.innerWidth < 768
    setIsMobile(mobile)
    setReady(true)
  }, [])

  const handleDone = useCallback(() => {
    setFading(true)
    setTimeout(() => setHidden(true), 600)
  }, [])

  if (hidden || !ready) return null

  // 手机 → CSS 动画
  if (isMobile) {
    return <IntroAnimationMobile onDone={handleDone} />
  }

  // 桌面 → 视频
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
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
        className="w-full h-full object-contain"
        style={{ backgroundColor: "#f7f3eb" }}
      >
        <source src="/video/zhuxishe-intro-v2.webm" type="video/webm" />
        <source src="/video/zhuxishe-intro-v2.mp4" type="video/mp4" />
      </video>

      <button
        onClick={handleDone}
        className="absolute bottom-8 right-8 text-sm text-[#6b7c6b]/70 hover:text-[#2d3a2e] transition-colors z-10"
      >
        跳过 →
      </button>
    </div>
  )
}
