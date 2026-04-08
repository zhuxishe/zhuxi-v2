"use client"

import { useRef, useState, useEffect } from "react"

export function IntroOverlay() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hidden, setHidden] = useState(false)
  const [fading, setFading] = useState(false)
  const [isPortrait, setIsPortrait] = useState(false)

  useEffect(() => {
    const check = () => setIsPortrait(window.innerHeight > window.innerWidth)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  if (hidden) return null

  const handleDone = () => {
    setFading(true)
    setTimeout(() => setHidden(true), 600)
  }

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
        style={{ backgroundColor: "#f7f3eb" }}
        className={`${
          isPortrait
            ? "h-full w-auto min-w-full object-cover"
            : "w-full h-full object-contain"
        }`}
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
