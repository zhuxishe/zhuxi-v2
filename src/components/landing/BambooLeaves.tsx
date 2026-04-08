"use client"

import { useEffect, useRef } from "react"

/**
 * 全页竹叶飘落 + 鼠标交互物理效果
 * 灵感：Google Antigravity — 粒子 + 鼠标斥力场
 *
 * 竹叶缓慢飘落，鼠标靠近时被推开并旋转加速。
 * 用 Canvas 渲染，覆盖着陆页全页，pointer-events: none 不阻碍交互。
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
const MOUSE_FORCE = 2.5
const GRAVITY = 0.12
const FRICTION = 0.985
const COLORS = ["#4a7c59", "#7db88f", "#8fbc8f", "#5a9a6a"]

function createLeaf(w: number, h: number, startTop = false): Leaf {
  return {
    x: Math.random() * w,
    y: startTop ? -20 - Math.random() * 200 : Math.random() * h,
    vx: (Math.random() - 0.5) * 0.3,
    vy: 0.2 + Math.random() * 0.5,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.01,
    size: 8 + Math.random() * 10,
    opacity: 0.15 + Math.random() * 0.2,
    wobblePhase: Math.random() * Math.PI * 2,
    wobbleSpeed: 0.005 + Math.random() * 0.01,
  }
}

function drawLeaf(ctx: CanvasRenderingContext2D, l: Leaf, color: string) {
  ctx.save()
  ctx.translate(l.x, l.y)
  ctx.rotate(l.rotation)
  ctx.globalAlpha = l.opacity
  ctx.fillStyle = color

  // 竹叶形状：两段贝塞尔曲线
  const s = l.size
  ctx.beginPath()
  ctx.moveTo(0, -s)
  ctx.bezierCurveTo(s * 0.6, -s * 0.6, s * 0.5, s * 0.3, 0, s)
  ctx.bezierCurveTo(-s * 0.5, s * 0.3, -s * 0.6, -s * 0.6, 0, -s)
  ctx.fill()

  // 叶脉
  ctx.strokeStyle = color
  ctx.globalAlpha = l.opacity * 0.5
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(0, -s * 0.8)
  ctx.lineTo(0, s * 0.8)
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

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const w = window.innerWidth
      const h = document.documentElement.scrollHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    // 初始化竹叶
    const w = window.innerWidth
    const h = document.documentElement.scrollHeight
    leavesRef.current = Array.from({ length: LEAF_COUNT }, () => createLeaf(w, h))

    const onMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY + window.scrollY }
    }
    const onScroll = () => resize()
    window.addEventListener("mousemove", onMouse)
    window.addEventListener("resize", resize)
    window.addEventListener("scroll", onScroll, { passive: true })

    const tick = () => {
      const cw = window.innerWidth
      const ch = document.documentElement.scrollHeight
      ctx.clearRect(0, 0, cw, ch)

      const mx = mouseRef.current.x
      const my = mouseRef.current.y

      for (let i = 0; i < leavesRef.current.length; i++) {
        const l = leavesRef.current[i]

        // 重力 + 横向摇摆
        l.wobblePhase += l.wobbleSpeed
        l.vx += Math.sin(l.wobblePhase) * 0.02
        l.vy += GRAVITY * (l.size / 15) // 大叶子落得快

        // 鼠标斥力
        const dx = l.x - mx, dy = l.y - my
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < MOUSE_RADIUS && dist > 1) {
          const force = (1 - dist / MOUSE_RADIUS) * MOUSE_FORCE
          l.vx += (dx / dist) * force
          l.vy += (dy / dist) * force
          l.rotSpeed += (Math.random() - 0.5) * 0.08 // 打转
        }

        // 摩擦
        l.vx *= FRICTION
        l.vy *= FRICTION
        l.rotSpeed *= 0.995

        // 更新位置
        l.x += l.vx
        l.y += l.vy
        l.rotation += l.rotSpeed

        // 重生：掉出底部或飘出两侧
        if (l.y > ch + 30 || l.x < -50 || l.x > cw + 50) {
          leavesRef.current[i] = createLeaf(cw, ch, true)
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
      window.removeEventListener("scroll", onScroll)
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
