"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useLocale } from "next-intl"
import { interpolate } from "@/components/landing/intro/animation-utils"
import { projectUniversities, computeNetworkParticles } from "@/components/landing/intro/university-data"
import { initParticles, drawParticles, generateLogoTargets } from "@/components/landing/intro/particle-canvas"
import { LogoReveal } from "@/components/landing/intro/LogoReveal"

const FPS = 30
const START_FRAME = 270
const END_FRAME = 420
const BG = "#f7f3eb"
const LOGO_SIZE = 300
const SEEN_KEY = "zhuxi:app-launch-splash-seen"

function shouldSkipSplash() {
  if (typeof window === "undefined") return true
  if (window.sessionStorage.getItem(SEEN_KEY) === "1") return true
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
}

function rememberSplashSeen() {
  try {
    window.sessionStorage.setItem(SEEN_KEY, "1")
  } catch {
    // sessionStorage can be blocked in strict privacy modes.
  }
}

export function AppLaunchSplash() {
  const locale = useLocale()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const startRef = useRef(0)
  const sizeRef = useRef({ w: 390, h: 844 })
  const [visible, setVisible] = useState(false)
  const [frame, setFrame] = useState(START_FRAME)
  const [viewport, setViewport] = useState({ w: 390, h: 844 })

  const close = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    rememberSplashSeen()
    setVisible(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(!shouldSkipSplash()), 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!visible) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const next = { w: window.innerWidth, h: window.innerHeight }
      sizeRef.current = next
      setViewport(next)
      canvas.width = next.w * dpr
      canvas.height = next.h * dpr
      canvas.style.width = `${next.w}px`
      canvas.style.height = `${next.h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener("resize", resize)

    const { w, h } = sizeRef.current
    const logoCX = w / 2
    const logoCY = h * 0.36
    const screenPos = projectUniversities(w, h)
    const sources = computeNetworkParticles(screenPos, 15)
    const targets = generateLogoTargets(sources.length, logoCX, logoCY, LOGO_SIZE)
    const particles = initParticles(sources, targets)
    startRef.current = performance.now()

    const tick = () => {
      const elapsed = (performance.now() - startRef.current) / 1000
      const current = Math.min(START_FRAME + elapsed * FPS, END_FRAME)
      setFrame(current)

      const { w: cw, h: ch } = sizeRef.current
      ctx.clearRect(0, 0, cw, ch)
      if (current < 340) {
        ctx.save()
        ctx.globalAlpha = interpolate(current, [START_FRAME, 340], [1, 0])
        drawParticles(ctx, particles, current - 200)
        ctx.restore()
      }

      if (current < END_FRAME) rafRef.current = requestAnimationFrame(tick)
      else close()
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener("resize", resize)
    }
  }, [close, visible])

  if (!visible) return null

  const fadeOpacity = interpolate(frame, [400, END_FRAME], [1, 0])
  const logoProgress = interpolate(frame, [310, 400], [0, 1])

  return (
    <div className="fixed inset-0 z-[90] isolate" style={{ backgroundColor: BG, opacity: fadeOpacity }}>
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
      <LogoReveal progress={logoProgress} centerX={viewport.w / 2} centerY={viewport.h * 0.36} logoSize={LOGO_SIZE} />
      <button
        type="button"
        onClick={close}
        className="absolute bottom-6 right-5 rounded-full bg-[#f7f3eb]/90 px-3 py-1.5 text-xs text-[#6b7c6b]/55 shadow-sm transition hover:text-[#2d3a2e]"
      >
        {locale === "ja" ? "スキップ" : "跳过"} &rarr;
      </button>
    </div>
  )
}
