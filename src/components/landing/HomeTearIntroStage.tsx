"use client"

import { useEffect, useRef, useState } from "react"
import { interpolate } from "./intro/animation-utils"
import { projectUniversities, computeNetworkParticles, buildScrollOrder } from "./intro/university-data"
import { initNetworkState, drawNetwork } from "./intro/network-canvas"
import { initParticles, drawParticles, generateLogoTargets } from "./intro/particle-canvas"
import { LogoReveal } from "./intro/LogoReveal"
import { ScrollPicker } from "./intro/ScrollPicker"

const FPS = 30
const TOTAL_FRAMES = 400
const MOBILE_START_FRAME = 200

type Phase = "network" | "morph" | "logo"

function getPhase(frame: number): Phase {
  if (frame >= 310) return "logo"
  if (frame >= 225) return "morph"
  return "network"
}

function getLogoSize(width: number, height: number) {
  return Math.min(400, Math.max(220, Math.min(width, height) * 0.68))
}

export function HomeTearIntroStage({ playToken }: { playToken: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const startRef = useRef(0)
  const sizeRef = useRef({ w: 1280, h: 720 })
  const lastDomUpdateRef = useRef(0)
  const [viewport, setViewport] = useState({ w: 1280, h: 720 })
  const [phase, setPhase] = useState<Phase>("network")
  const [domFrame, setDomFrame] = useState(0)
  const [scrollOrder, setScrollOrder] = useState<ReturnType<typeof buildScrollOrder>>([])

  useEffect(() => {
    if (!playToken) return
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
    const logoSize = getLogoSize(w, h)
    const logoCX = w / 2
    const logoCY = h * 0.38
    const screenPos = projectUniversities(w, h)
    const ns = initNetworkState(screenPos)
    const sources = computeNetworkParticles(screenPos, 15)
    const targets = generateLogoTargets(sources.length, logoCX, logoCY, logoSize)
    const particles = initParticles(sources, targets)
    const mobile = w < 640 && h > w

    setScrollOrder(buildScrollOrder(screenPos))
    lastDomUpdateRef.current = 0
    startRef.current = performance.now() - (mobile ? (MOBILE_START_FRAME / FPS) * 1000 : 0)

    const tick = () => {
      const elapsed = (performance.now() - startRef.current) / 1000
      const frame = Math.min(elapsed * FPS, TOTAL_FRAMES)
      const nextPhase = getPhase(frame)
      setPhase((prev) => (prev === nextPhase ? prev : nextPhase))

      if ((nextPhase === "network" || nextPhase === "logo") && frame - lastDomUpdateRef.current >= 3) {
        lastDomUpdateRef.current = frame
        setDomFrame(frame)
      }

      const { w: cw, h: ch } = sizeRef.current
      ctx.clearRect(0, 0, cw, ch)
      ctx.globalAlpha = interpolate(frame, [0, 20], [0, 1])
      if (frame < 235) drawNetwork(ctx, ns, frame, cw, ch, interpolate(frame, [200, 225], [1, 0]))
      if (frame >= 200 && frame < 340) {
        ctx.save()
        ctx.globalAlpha = interpolate(frame, [200, 210, 330, 340], [0, 1, 1, 0])
        drawParticles(ctx, particles, frame - 200)
        ctx.restore()
      }
      ctx.globalAlpha = 1
      if (frame < TOTAL_FRAMES) rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener("resize", resize)
    }
  }, [playToken])

  const logoProgress = interpolate(domFrame, [310, 400], [0, 1])
  const logoSize = getLogoSize(viewport.w, viewport.h)
  const textScale = Math.min(1, viewport.w / 720)
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#f7f3eb]">
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
      {phase === "network" && <ScrollPicker scrollOrder={scrollOrder} frame={domFrame} />}
      {phase === "logo" && (
        <LogoReveal progress={logoProgress} centerX={viewport.w / 2} centerY={viewport.h * 0.38} logoSize={logoSize} textScale={textScale} />
      )}
    </div>
  )
}
