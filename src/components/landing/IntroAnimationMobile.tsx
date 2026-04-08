"use client"

import { useEffect, useState } from "react"

/**
 * 手机竖屏专用 CSS 动画开场（含 Logo 分层揭示）
 *
 * 时间线（共 ~6s）：
 * 0.0s  和纸背景 + 竹叶飘落
 * 0.4s  Logo 轮廓（黑线）淡入
 * 1.2s  Logo 填充（绿色）从偏移位置弹跳滑入对齐
 * 2.2s  "竹溪社" 三字逐字弹出
 * 3.2s  副标题 + 水墨线
 * 4.8s  整体淡出
 */
export function IntroAnimationMobile({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),   // 轮廓
      setTimeout(() => setPhase(2), 1200),  // 填充弹跳
      setTimeout(() => setPhase(3), 2200),  // 文字
      setTimeout(() => setPhase(4), 3200),  // 副标题
      setTimeout(() => setPhase(5), 4800),  // 淡出
      setTimeout(onDone, 5400),
    ]
    return () => timers.forEach(clearTimeout)
  }, [onDone])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 px-8"
      style={{
        backgroundColor: "#f7f3eb",
        opacity: phase >= 5 ? 0 : 1,
        transition: "opacity 0.6s ease-out",
      }}
    >
      {/* 竹叶飘落 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(5)].map((_, i) => (
          <span
            key={i}
            className="absolute text-[#8fa88f]/12 select-none"
            style={{
              fontSize: `${16 + i * 5}px`,
              left: `${10 + i * 18}%`,
              top: `-8%`,
              animation: `leaf-fall ${9 + i * 2}s linear infinite`,
              animationDelay: `${i * 0.8}s`,
            }}
          >
            🌿
          </span>
        ))}
      </div>

      {/* Logo 分层揭示 — 和 Remotion 视频同款效果 */}
      <div className="relative size-24 z-10">
        {/* 层1: 轮廓（始终在上层） */}
        <img
          src="/logo-outline.png"
          alt=""
          className="absolute inset-0 w-full h-full object-contain z-20"
          style={{
            opacity: phase >= 1 ? 1 : 0,
            transform: phase >= 1 ? "scale(1)" : "scale(0.8)",
            transition: "all 0.7s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
        {/* 层2: 绿色填充（从偏移弹跳到对齐） */}
        <img
          src="/logo-fill.png"
          alt=""
          className="absolute inset-0 w-full h-full object-contain z-10"
          style={{
            opacity: phase >= 2 ? 1 : 0,
            transform: phase >= 2
              ? "translate(0, 0) scale(1)"
              : "translate(8px, 8px) scale(0.9)",
            transition: "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        />
      </div>

      {/* 竹溪社 逐字弹出 */}
      <div className="flex gap-3 relative z-10">
        {"竹溪社".split("").map((char, i) => (
          <span
            key={char}
            className="text-4xl font-bold tracking-widest"
            style={{
              fontFamily: '"Noto Serif JP", "Hiragino Mincho ProN", Georgia, serif',
              color: "#2d3a2e",
              opacity: phase >= 3 ? 1 : 0,
              transform: phase >= 3 ? "translateY(0) scale(1)" : "translateY(20px) scale(0.8)",
              transition: `all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 0.15}s`,
            }}
          >
            {char}
          </span>
        ))}
      </div>

      {/* 副标题 */}
      <p
        className="text-[11px] tracking-[0.25em] relative z-10 uppercase"
        style={{
          color: "#6b7c6b",
          opacity: phase >= 4 ? 1 : 0,
          transition: "opacity 0.6s ease-out",
        }}
      >
        zhuxishe
      </p>

      {/* 水墨线 */}
      <div
        className="h-px relative z-10"
        style={{
          width: phase >= 4 ? "4rem" : "0",
          background: "linear-gradient(90deg, transparent, #8fa88f50, transparent)",
          transition: "width 1s cubic-bezier(0.22, 1, 0.36, 1) 0.2s",
        }}
      />

      {/* 跳过 */}
      <button
        onClick={onDone}
        className="absolute bottom-8 right-6 text-xs text-[#6b7c6b]/40 active:text-[#2d3a2e] z-20"
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
