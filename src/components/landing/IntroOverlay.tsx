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
 *
 * Performance: Canvas runs at full 30fps via rAF.
 * DOM components (ScrollPicker, LogoReveal) update at ~10fps via throttled domFrame state.
 * During morph-only phase (225-310), no DOM updates at all.
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

type Phase = "network" | "morph" | "logo" | "fade" | "done"

function getPhase(f: number): Phase {
  if (f >= 400) return "fade"
  if (f >= 310) return "logo"
  if (f >= 225) return "morph"
  return "network"
}

export function IntroOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const startRef = useRef(0)
  const frameRef = useRef(0)
  const sizeRef = useRef({ w: 1280, h: 720 })
  const scrollOrderRef = useRef<ReturnType<typeof buildScrollOrder>>([])

  const [hidden, setHidden] = useState(false)
  const [phase, setPhase] = useState<Phase>("network")
  const [domFrame, setDomFrame] = useState(0)
  const lastDomUpdateRef = useRef(0)

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
      sizeRef.current = { w: window.innerWidth, h: window.innerHeight }
      canvas.width = sizeRef.current.w * dpr
      canvas.height = sizeRef.current.h * dpr
      canvas.style.width = `${sizeRef.current.w}px`
      canvas.style.height = `${sizeRef.current.h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener("resize", resize)

    const { w, h } = sizeRef.current
    const logoCX = w / 2, logoCY = h * 0.38
    const screenPos = projectUniversities(w, h)
    const ns = initNetworkState(screenPos)
    const sourceParticles = computeNetworkParticles(screenPos, 15)
    const targets = generateLogoTargets(sourceParticles.length, logoCX, logoCY, LOGO_SIZE)
    const particles = initParticles(sourceParticles, targets)

    // Cache scrollOrder in ref once
    scrollOrderRef.current = buildScrollOrder(screenPos)

    startRef.current = performance.now()

    const tick = () => {
      const elapsed = (performance.now() - startRef.current) / 1000
      const f = Math.min(elapsed * FPS, TOTAL_FRAMES)
      frameRef.current = f

      // Phase transitions (conditional rendering)
      const newPhase = getPhase(f)
      setPhase((prev) => prev !== newPhase ? newPhase : prev)

      // Throttled DOM frame updates (~10fps) for ScrollPicker/LogoReveal animation
      // Only during phases that have DOM animation components
      const needsDom = newPhase === "network" || newPhase === "logo" || newPhase === "fade"
      if (needsDom && f - lastDomUpdateRef.current >= 3) {
        lastDomUpdateRef.current = f
        setDomFrame(f)
      }

      const { w: cw, h: ch } = sizeRef.current
      ctx.clearRect(0, 0, cw, ch)

      // Background opacity: frames 0-20
      const bgOp = interpolate(f, [0, 20], [0, 1])
      ctx.globalAlpha = bgOp

      // Grid / Network: visible frames 0-235, fade at 200-225
      if (f < 235) {
        const netOp = interpolate(f, [200, 225], [1, 0])
        drawNetwork(ctx, ns, f, cw, ch, netOp)
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

  const { w, h } = sizeRef.current
  const logoCX = w / 2
  const logoCY = h * 0.38
  const logoProgress = interpolate(domFrame, [310, 400], [0, 1])
  const fadeOp = domFrame >= 400 ? interpolate(domFrame, [400, 420], [1, 0]) : 1

  return (
    <div className="fixed inset-0 z-50" style={{
      backgroundColor: BG, opacity: fadeOp,
    }}>
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* ScrollPicker: visible during network phase */}
      {phase === "network" && (
        <ScrollPicker scrollOrder={scrollOrderRef.current} frame={domFrame} />
      )}

      {/* LogoReveal: DOM layer, starts at logo phase */}
      {(phase === "logo" || phase === "fade") && (
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
