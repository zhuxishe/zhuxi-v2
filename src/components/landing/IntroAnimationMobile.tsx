"use client"

import { useEffect, useState } from "react"

/**
 * 手机竖屏专用 CSS 动画开场 — 无视频依赖，零加载
 *
 * 时间线（共 ~5s）：
 * 0.0s  和纸背景 + 竹叶粒子缓慢飘落
 * 0.5s  Logo 从透明淡入 + 轻微缩放
 * 1.8s  "竹溪社" 三字逐字弹出
 * 2.8s  副标题淡入
 * 4.0s  整体开始淡出
 * 4.6s  完全隐藏
 */
export function IntroAnimationMobile({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState(0) // 0=初始 1=logo 2=文字 3=副标题 4=淡出

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1600),
      setTimeout(() => setPhase(3), 2600),
      setTimeout(() => setPhase(4), 4000),
      setTimeout(onDone, 4600),
    ]
    return () => timers.forEach(clearTimeout)
  }, [onDone])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-8"
      style={{
        backgroundColor: "#f7f3eb",
        opacity: phase >= 4 ? 0 : 1,
        transition: "opacity 0.6s ease-out",
      }}
    >
      {/* 浮动竹叶装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <span
            key={i}
            className="absolute text-[#8fa88f]/15 select-none"
            style={{
              fontSize: `${18 + i * 4}px`,
              left: `${12 + i * 14}%`,
              top: `-${10 + i * 5}%`,
              animation: `leaf-fall ${8 + i * 2}s linear infinite`,
              animationDelay: `${i * 0.7}s`,
            }}
          >
            🌿
          </span>
        ))}
      </div>

      {/* Logo */}
      <img
        src="/logo.png"
        alt=""
        className="size-20 relative z-10"
        style={{
          opacity: phase >= 1 ? 1 : 0,
          transform: phase >= 1 ? "scale(1)" : "scale(0.7)",
          transition: "all 0.8s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />

      {/* 竹溪社 逐字弹出 */}
      <div className="flex gap-3 relative z-10">
        {"竹溪社".split("").map((char, i) => (
          <span
            key={char}
            className="text-4xl font-bold tracking-widest"
            style={{
              fontFamily: '"Noto Serif JP", "Hiragino Mincho ProN", Georgia, serif',
              color: "#2d3a2e",
              opacity: phase >= 2 ? 1 : 0,
              transform: phase >= 2 ? "translateY(0)" : "translateY(16px)",
              transition: `all 0.5s cubic-bezier(0.22, 1, 0.36, 1) ${i * 0.12}s`,
            }}
          >
            {char}
          </span>
        ))}
      </div>

      {/* 副标题 */}
      <p
        className="text-sm tracking-[0.2em] relative z-10"
        style={{
          color: "#6b7c6b",
          opacity: phase >= 3 ? 1 : 0,
          transform: phase >= 3 ? "translateY(0)" : "translateY(8px)",
          transition: "all 0.6s ease-out",
        }}
      >
        ZHUXISHE
      </p>

      {/* 水墨线 */}
      <div
        className="h-px w-16 relative z-10"
        style={{
          background: "linear-gradient(90deg, transparent, #8fa88f40, transparent)",
          opacity: phase >= 3 ? 1 : 0,
          transform: phase >= 3 ? "scaleX(1)" : "scaleX(0)",
          transition: "all 0.8s ease-out 0.2s",
        }}
      />

      {/* 跳过 */}
      <button
        onClick={onDone}
        className="absolute bottom-8 right-6 text-xs text-[#6b7c6b]/50 hover:text-[#2d3a2e] transition-colors z-20"
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
