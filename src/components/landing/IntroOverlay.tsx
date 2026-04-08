"use client"

import { useEffect, useState, useCallback } from "react"

/**
 * 全平台统一 CSS 开场动画 — 不依赖视频，任何分辨率都清晰
 *
 * 时间线（~6s）：
 * 0.4s  Logo 轮廓淡入
 * 1.2s  Logo 填充弹跳滑入对齐
 * 2.2s  "竹溪社" 三字逐字弹出
 * 3.2s  副标题 + 水墨线展开
 * 4.8s  整体淡出
 */
export function IntroOverlay() {
  const [phase, setPhase] = useState(0)
  const [hidden, setHidden] = useState(false)

  const done = useCallback(() => {
    setPhase(5)
    setTimeout(() => setHidden(true), 600)
  }, [])

  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2200),
      setTimeout(() => setPhase(4), 3200),
      setTimeout(done, 4800),
    ]
    return () => t.forEach(clearTimeout)
  }, [done])

  if (hidden) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 sm:gap-8 px-8"
      style={{
        backgroundColor: "#f7f3eb",
        opacity: phase >= 5 ? 0 : 1,
        transition: "opacity 0.6s ease-out",
      }}
    >
      {/* 竹叶飘落 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(7)].map((_, i) => (
          <span
            key={i}
            className="absolute select-none"
            style={{
              color: `rgba(143,168,143,${0.06 + i * 0.01})`,
              fontSize: `${14 + i * 4}px`,
              left: `${8 + i * 13}%`,
              top: `-8%`,
              animation: `leaf-fall ${10 + i * 1.5}s linear infinite`,
              animationDelay: `${i * 0.6}s`,
            }}
          >
            🌿
          </span>
        ))}
      </div>

      {/* Logo 分层揭示 */}
      <div className="relative size-20 sm:size-28 md:size-36 z-10">
        {/* 轮廓（始终最上层） */}
        <img
          src="/logo-outline.png"
          alt=""
          className="absolute inset-0 w-full h-full object-contain z-20"
          style={{
            opacity: phase >= 1 ? 1 : 0,
            transform: phase >= 1 ? "scale(1)" : "scale(0.75)",
            transition: "all 0.8s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
        {/* 填充（弹跳滑入） */}
        <img
          src="/logo-fill.png"
          alt=""
          className="absolute inset-0 w-full h-full object-contain z-10"
          style={{
            opacity: phase >= 2 ? 1 : 0,
            transform: phase >= 2
              ? "translate(0,0) scale(1)"
              : "translate(10px,10px) scale(0.85)",
            transition: "all 0.9s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        />
      </div>

      {/* 竹溪社 逐字弹出 */}
      <div className="flex gap-2 sm:gap-4 md:gap-5 relative z-10">
        {"竹溪社".split("").map((c, i) => (
          <span
            key={c}
            className="text-3xl sm:text-5xl md:text-6xl font-bold"
            style={{
              fontFamily: '"Noto Serif JP","Hiragino Mincho ProN",Georgia,serif',
              letterSpacing: "0.1em",
              color: "#2d3a2e",
              opacity: phase >= 3 ? 1 : 0,
              transform: phase >= 3 ? "translateY(0) scale(1)" : "translateY(24px) scale(0.8)",
              transition: `all 0.55s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.15}s`,
            }}
          >
            {c}
          </span>
        ))}
      </div>

      {/* 副标题 */}
      <p
        className="text-[10px] sm:text-xs md:text-sm tracking-[0.3em] relative z-10 uppercase"
        style={{
          color: "#6b7c6b",
          opacity: phase >= 4 ? 1 : 0,
          transition: "opacity 0.6s ease-out",
        }}
      >
        zhuxishe
      </p>

      {/* 水墨线展开 */}
      <div
        className="h-px relative z-10"
        style={{
          width: phase >= 4 ? "5rem" : "0",
          background: "linear-gradient(90deg, transparent, #8fa88f50, transparent)",
          transition: "width 1s cubic-bezier(0.22,1,0.36,1) 0.2s",
        }}
      />

      {/* 跳过 */}
      <button
        onClick={done}
        className="absolute bottom-6 right-6 sm:bottom-8 sm:right-8 text-xs sm:text-sm text-[#6b7c6b]/40 hover:text-[#2d3a2e] active:text-[#2d3a2e] transition-colors z-20"
      >
        跳过 →
      </button>

      <style>{`
        @keyframes leaf-fall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(110vh) rotate(360deg); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
