"use client"

/**
 * Intro overlay -- 1:1 port of Remotion B-Ripple-V2.
 * 420 frames at 30fps = 14 seconds. All timing uses FRAME NUMBERS.
 *
 * Timeline (frames):
 *   0-235: Network (fade at 200-225)
 *   0-235: ScrollPicker
 *   200-340: ParticleMorph (Sequence from=200, duration=140)
 *   310-400: LogoReveal (progress = interpolate(frame,[310,400],[0,1]))
 *   400-420: Fade out whole overlay
 */
import { useEffect, useRef, useState, useCallback } from "react"
import { interpolate } from "./intro/animation-utils"
import { projectUniversities, computeNetworkParticles, buildScrollOrder } from "./intro/university-data"
import { initNetworkState, drawNetwork } from "./intro/network-canvas"
import { initParticles, drawParticles, generateLogoTargets } from "./intro/particle-canvas"
import { LogoReveal } from "./intro/LogoReveal"
import { ScrollPicker } from "./intro/ScrollPicker"

const FPS = 30
const TOTAL_FRAMES = 420
const BG = "#f7f3eb"
const LOGO_SIZE = 400

export function IntroOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const startRef = useRef(0)
  const [hidden, setHidden] = useState(false)
  const [frame, setFrame] = useState(0)

  const done = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    setHidden(true)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener("resize", resize)

    const w = window.innerWidth, h = window.innerHeight
    const logoCX = w / 2, logoCY = h * 0.38
    const screenPos = projectUniversities(w, h)
    const ns = initNetworkState(screenPos)
    const sourceParticles = computeNetworkParticles(screenPos, 15)
    const targets = generateLogoTargets(sourceParticles.length, logoCX, logoCY, LOGO_SIZE)
    const particles = initParticles(sourceParticles, targets)

    startRef.current = performance.now()

    const tick = () => {
      const elapsed = (performance.now() - startRef.current) / 1000
      const f = Math.min(elapsed * FPS, TOTAL_FRAMES)
      setFrame(f)

      ctx.clearRect(0, 0, w, h)

      // Background opacity: frames 0-20
      const bgOp = interpolate(f, [0, 20], [0, 1])
      ctx.globalAlpha = bgOp

      // Grid / Network: visible frames 0-235, fade at 200-225
      if (f < 235) {
        const netOp = interpolate(f, [200, 225], [1, 0])
        drawNetwork(ctx, ns, f, w, h, netOp)
      }

      // Particles: Sequence from=200 duration=140 (frames 200-340)
      if (f >= 200 && f < 340) {
        const localFrame = f - 200
        ctx.save()
        ctx.globalAlpha = interpolate(f, [200, 210, 330, 340], [0, 1, 1, 0])
        drawParticles(ctx, particles, localFrame)
        ctx.restore()
      }

      ctx.globalAlpha = 1

      if (f < TOTAL_FRAMES) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        done()
      }
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener("resize", resize)
    }
  }, [done])

  if (hidden) return null

  const w = typeof window !== "undefined" ? window.innerWidth : 1280
  const h = typeof window !== "undefined" ? window.innerHeight : 720
  const logoCX = w / 2
  const logoCY = h * 0.38
  const scrollOrder = typeof window !== "undefined" ? buildScrollOrder(projectUniversities(w, h)) : []

  const bgOp = interpolate(frame, [0, 20], [0, 1])
  const logoProgress = interpolate(frame, [310, 400], [0, 1])
  const fadeOp = interpolate(frame, [400, 420], [1, 0])

  return (
    <div className="fixed inset-0 z-50" style={{
      backgroundColor: BG, opacity: fadeOp * bgOp,
    }}>
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* ScrollPicker: visible during network phase */}
      {frame < 225 && <ScrollPicker scrollOrder={scrollOrder} frame={frame} />}

      {/* LogoReveal: DOM layer, starts at frame 310 */}
      {frame >= 300 && (
        <LogoReveal progress={logoProgress} centerX={logoCX} centerY={logoCY} logoSize={LOGO_SIZE} />
      )}

      {/* Skip button */}
      <button onClick={done}
        className="absolute bottom-6 right-6 sm:bottom-8 sm:right-8 text-xs sm:text-sm z-20
          text-[#6b7c6b]/40 hover:text-[#2d3a2e] active:text-[#2d3a2e] transition-colors">
        跳过 &rarr;
      </button>
    </div>
  )
}
