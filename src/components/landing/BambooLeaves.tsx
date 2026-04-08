"use client"

import { useEffect, useRef } from "react"

/**
 * 全页竹叶飘落 + 鼠标交互物理效果
 * Canvas fixed 在 viewport，叶子在可见区域内循环飘落。
 * 鼠标靠近时推开（带重力，不会飘上天），打转后继续落。
 */

interface Leaf {
  x: number; y: number
  vx: number; vy: number
  rotation: number; rotSpeed: number
  size: number; opacity: number
  wobblePhase: number; wobbleSpeed: number
}

const LEAF_COUNT = 18
const MOUSE_RADIUS = 120
const MOUSE_FORCE = 1.2        // 柔和推力（减半）
const GRAVITY = 0.06           // 速度减半
const FRICTION = 0.988
const COLORS = ["#4a7c59", "#7db88f", "#8fbc8f", "#5a9a6a"]

function createLeaf(w: number, h: number, fromTop = false): Leaf {
  return {
    x: Math.random() * w,
    y: fromTop ? -10 - Math.random() * 100 : Math.random() * h,
    vx: (Math.random() - 0.5) * 0.15,
    vy: 0.1 + Math.random() * 0.25,   // 初速也减半
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.008,
    size: 8 + Math.random() * 10,
    opacity: 0.12 + Math.random() * 0.18,
    wobblePhase: Math.random() * Math.PI * 2,
    wobbleSpeed: 0.004 + Math.random() * 0.008,
  }
}

function drawLeaf(ctx: CanvasRenderingContext2D, l: Leaf, color: string) {
  ctx.save()
  ctx.translate(l.x, l.y)
  ctx.rotate(l.rotation)
  ctx.globalAlpha = l.opacity
  ctx.fillStyle = color
  const s = l.size
  ctx.beginPath()
  ctx.moveTo(0, -s)
  ctx.bezierCurveTo(s * 0.6, -s * 0.6, s * 0.5, s * 0.3, 0, s)
  ctx.bezierCurveTo(-s * 0.5, s * 0.3, -s * 0.6, -s * 0.6, 0, -s)
  ctx.fill()
  ctx.strokeStyle = color
  ctx.globalAlpha = l.opacity * 0.4
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(0, -s * 0.7)
  ctx.lineTo(0, s * 0.7)
  ctx.stroke()
  ctx.restore()
}

export function BambooLeaves() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const leavesRef = useRef<Leaf[]>([])
  const rafRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let w = window.innerWidth, h = window.innerHeight

    const resize = () => {
      w = window.innerWidth; h = window.innerHeight
      const dpr = window.devicePixelRatio || 1
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    leavesRef.current = Array.from({ length: LEAF_COUNT }, () => createLeaf(w, h))

    // 鼠标用 clientX/clientY（viewport 坐标，和 fixed canvas 对齐）
    const onMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener("mousemove", onMouse)
    window.addEventListener("resize", resize)

    const tick = () => {
      ctx.clearRect(0, 0, w, h)
      const mx = mouseRef.current.x, my = mouseRef.current.y

      for (let i = 0; i < leavesRef.current.length; i++) {
        const l = leavesRef.current[i]

        // 重力 + 横向摇摆
        l.wobblePhase += l.wobbleSpeed
        l.vx += Math.sin(l.wobblePhase) * 0.012
        l.vy += GRAVITY * (l.size / 15)

        // 鼠标推力（主要向两侧推，向上力减弱）
        const dx = l.x - mx, dy = l.y - my
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < MOUSE_RADIUS && dist > 1) {
          const force = (1 - dist / MOUSE_RADIUS) * MOUSE_FORCE
          l.vx += (dx / dist) * force              // 水平方向正常推
          l.vy += (dy / dist) * force * 0.3         // 垂直方向只给30%的力
          l.vy += GRAVITY * 2                        // 额外重力补偿，防止上飘
          l.rotSpeed += (Math.random() - 0.5) * 0.06
        }

        l.vx *= FRICTION
        l.vy *= FRICTION
        l.rotSpeed *= 0.996
        l.x += l.vx
        l.y += l.vy
        l.rotation += l.rotSpeed

        // 落出 viewport 底部或两侧 → 从顶部重生
        if (l.y > h + 30 || l.x < -40 || l.x > w + 40) {
          leavesRef.current[i] = createLeaf(w, h, true)
        }

        drawLeaf(ctx, l, COLORS[i % COLORS.length])
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener("mousemove", onMouse)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 5 }}
    />
  )
}
