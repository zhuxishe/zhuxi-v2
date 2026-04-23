"use client"

import { useEffect, useRef, useState } from "react"
import { interpolate } from "./intro/animation-utils"
import { projectUniversities, computeNetworkParticles, buildScrollOrder } from "./intro/university-data"
import { initNetworkState, drawNetwork } from "./intro/network-canvas"
import { initParticles, drawParticles, generateLogoTargets } from "./intro/particle-canvas"
import { LogoReveal } from "./intro/LogoReveal"
import { ScrollPicker } from "./intro/ScrollPicker"

const FPS = 30
const TOTAL_FRAMES = 420
const VIEW_W = 1280
const VIEW_H = 720
const LOGO_SIZE = 400
const BG = "#f7f3eb"

type Phase = "network" | "morph" | "logo" | "fade"

function getPhase(f: number): Phase {
  if (f >= 400) return "fade"
  if (f >= 310) return "logo"
  if (f >= 225) return "morph"
  return "network"
}

export function EmbeddedIntroFilm({ playToken, onFinish }: {
  playToken: number
  onFinish: () => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const startRef = useRef(0)
  const lastDomUpdateRef = useRef(0)
  const [scale, setScale] = useState(1)
  const [phase, setPhase] = useState<Phase>("network")
  const [domFrame, setDomFrame] = useState(0)
  const [scrollOrder] = useState(() => buildScrollOrder(projectUniversities(VIEW_W, VIEW_H)))

  useEffect(() => {
    const updateScale = () => {
      const rect = boxRef.current?.getBoundingClientRect()
      if (!rect) return
      setScale(Math.min(rect.width / VIEW_W, rect.height / VIEW_H))
    }
    updateScale()
    window.addEventListener("resize", updateScale)
    return () => window.removeEventListener("resize", updateScale)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    cancelAnimationFrame(rafRef.current)
    const dpr = window.devicePixelRatio || 1
    canvas.width = VIEW_W * dpr
    canvas.height = VIEW_H * dpr
    canvas.style.width = `${VIEW_W}px`
    canvas.style.height = `${VIEW_H}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, VIEW_W, VIEW_H)

    const logoCX = VIEW_W / 2
    const logoCY = VIEW_H * 0.38
    const screenPos = projectUniversities(VIEW_W, VIEW_H)
    const ns = initNetworkState(screenPos)
    const sourceParticles = computeNetworkParticles(screenPos, 15)
    const targets = generateLogoTargets(sourceParticles.length, logoCX, logoCY, LOGO_SIZE)
    const particles = initParticles(sourceParticles, targets)

    lastDomUpdateRef.current = 0
    startRef.current = performance.now()

    const tick = () => {
      const elapsed = (performance.now() - startRef.current) / 1000
      const f = Math.min(elapsed * FPS, TOTAL_FRAMES)
      const nextPhase = getPhase(f)
      setPhase((prev) => prev === nextPhase ? prev : nextPhase)

      const needsDom = nextPhase === "network" || nextPhase === "logo" || nextPhase === "fade"
      if (needsDom && f - lastDomUpdateRef.current >= 3) {
        lastDomUpdateRef.current = f
        setDomFrame(f)
      }

      ctx.clearRect(0, 0, VIEW_W, VIEW_H)
      ctx.globalAlpha = interpolate(f, [0, 20], [0, 1])

      if (f < 235) {
        drawNetwork(ctx, ns, f, VIEW_W, VIEW_H, interpolate(f, [200, 225], [1, 0]))
      }

      if (f >= 200 && f < 340) {
        ctx.save()
        ctx.globalAlpha = interpolate(f, [200, 210, 330, 340], [0, 1, 1, 0])
        drawParticles(ctx, particles, f - 200)
        ctx.restore()
      }

      ctx.globalAlpha = 1
      if (f < TOTAL_FRAMES) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        onFinish()
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [onFinish, playToken])

  const logoProgress = interpolate(domFrame, [310, 400], [0, 1])
  const fadeOp = domFrame >= 400 ? interpolate(domFrame, [400, 420], [1, 0]) : 1

  return (
    <div ref={boxRef} className="absolute inset-0 overflow-hidden bg-[#f7f3eb]">
      <div
        className="absolute left-1/2 top-1/2 overflow-hidden"
        style={{ width: VIEW_W, height: VIEW_H, opacity: fadeOp, transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        <canvas ref={canvasRef} className="absolute inset-0" />
        {phase === "network" && <ScrollPicker scrollOrder={scrollOrder} frame={domFrame} />}
        {(phase === "logo" || phase === "fade") && (
          <LogoReveal progress={logoProgress} centerX={VIEW_W / 2} centerY={VIEW_H * 0.38} logoSize={LOGO_SIZE} />
        )}
      </div>
    </div>
  )
}
