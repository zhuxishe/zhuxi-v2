"use client"

/**
 * Intro overlay — pure browser animation ported from Remotion B-Ripple-V2.
 * Canvas for network + particles, DOM for logo reveal. ~9s total.
 *
 * Timeline: Network 0-4s | Particles 4-6s | Logo 6-8s | Fade 8-9s
 */
import { useEffect, useRef, useState, useCallback } from "react"
import { interpolate } from "./intro/animation-utils"
import { projectUniversities, computeNetworkParticles, buildScrollOrder } from "./intro/university-data"
import { initNetworkState, drawNetwork } from "./intro/network-canvas"
import { initParticles, drawParticles, generateLogoTargets } from "./intro/particle-canvas"
import { LogoReveal } from "./intro/LogoReveal"
import { ScrollPicker } from "./intro/ScrollPicker"

const BG = "#f7f3eb"
const PAPER_GRAD = `radial-gradient(ellipse at 30% 20%,#ede8dd80 0%,transparent 50%),
  radial-gradient(ellipse at 70% 60%,#ede8dd60 0%,transparent 40%)`

export function IntroOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const startRef = useRef(0)
  const [hidden, setHidden] = useState(false)
  const [time, setTime] = useState(0) // for DOM components

  const done = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    setTime(99) // trigger fade
    setTimeout(() => setHidden(true), 700)
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
    const screenPos = projectUniversities(w, h)
    const ns = initNetworkState(w, h, screenPos)
    const sourceParticles = computeNetworkParticles(screenPos, 12)
    const logoSize = Math.min(w, h) * 0.28
    const logoCX = w / 2, logoCY = h * 0.38
    const targets = generateLogoTargets(sourceParticles.length, logoCX, logoCY, logoSize)
    const particles = initParticles(sourceParticles, targets)

    startRef.current = performance.now()

    const tick = () => {
      const t = (performance.now() - startRef.current) / 1000
      setTime(t)
      const netOp = interpolate(t, [4.0, 4.8], [1, 0])
      drawNetwork(ctx, ns, Math.min(t, 4.5), w, h, netOp)

      // Particle phase: 4s-6s
      if (t >= 3.5 && t < 7) {
        const localT = (t - 3.5) * 1.3 // speed up slightly
        ctx.save()
        ctx.globalAlpha = interpolate(t, [3.5, 4, 6.5, 7], [0, 1, 1, 0])
        drawParticles(ctx, particles, localT, w, h)
        ctx.restore()
      }

      if (t < 9) {
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

  const scrollOrder = typeof window !== "undefined" ? buildScrollOrder(
    projectUniversities(window.innerWidth, window.innerHeight)
  ) : []
  const logoSize = typeof window !== "undefined"
    ? Math.min(window.innerWidth, window.innerHeight) * 0.28 : 200
  const logoProgress = interpolate(time, [6, 8], [0, 1])
  const fadeOp = time >= 8 ? interpolate(time, [8, 9], [1, 0]) : 1

  return (
    <div className="fixed inset-0 z-50" style={{
      backgroundColor: BG, backgroundImage: PAPER_GRAD,
      opacity: fadeOp, transition: time >= 99 ? "opacity 0.6s ease-out" : undefined,
    }}>
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Scroll picker (desktop) — network phase */}
      {time < 5 && <ScrollPicker scrollOrder={scrollOrder} t={time} />}

      {/* Logo reveal — DOM layer */}
      {time >= 5.5 && <LogoReveal progress={logoProgress} logoSize={logoSize} />}

      {/* Skip button */}
      <button onClick={done}
        className="absolute bottom-6 right-6 sm:bottom-8 sm:right-8 text-xs sm:text-sm z-20
          text-[#6b7c6b]/40 hover:text-[#2d3a2e] active:text-[#2d3a2e] transition-colors">
        跳过 &rarr;
      </button>
    </div>
  )
}
