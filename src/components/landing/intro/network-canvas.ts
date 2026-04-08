/** Canvas rendering for network ripple phase */

import type { Point2D } from './animation-utils'
import { interpolate, spring, easeBezier } from './animation-utils'
import {
  UNIVERSITIES, CONNECTIONS, buildScrollOrder,
  type Connection,
} from './university-data'

const ZX_GREEN = '#4a7c59'
const ZX_GREEN_LIGHT = '#7db88f'
const WASEDA_IDX = 2

interface NetworkState {
  screenPos: Point2D[]
  scrollOrder: ReturnType<typeof buildScrollOrder>
}

export function initNetworkState(w: number, h: number, screenPos: Point2D[]): NetworkState {
  return { screenPos, scrollOrder: buildScrollOrder(screenPos) }
}

function getActivateTime(ns: NetworkState, uniIdx: number): number {
  return ns.scrollOrder.find(s => s.idx === uniIdx)?.activateTime ?? 999
}

/** Draw one frame of the network animation onto ctx */
export function drawNetwork(
  ctx: CanvasRenderingContext2D,
  ns: NetworkState,
  t: number, // seconds since animation start
  w: number, h: number,
  networkOpacity: number,
): void {
  ctx.clearRect(0, 0, w, h)
  if (networkOpacity <= 0) return
  ctx.globalAlpha = networkOpacity

  const origin = ns.screenPos[WASEDA_IDX]

  // Camera: zoom out from 1.8 to 1.0 over 0-4s
  const zoomT = Math.min(1, Math.max(0, t / 4))
  const zoom = 1.8 - 0.8 * easeBezier(zoomT)
  const blendT = Math.min(1, Math.max(0, (t - 1) / 3))
  const focusX = origin.x * (1 - blendT) + (w / 2) * blendT
  const focusY = origin.y * (1 - blendT) + (h / 2) * blendT

  ctx.save()
  ctx.translate(focusX, focusY)
  ctx.scale(zoom, zoom)
  ctx.translate(-focusX, -focusY)

  // Ripple circles
  const waveFront = Math.max(0, (t - 0.3) * 280)
  const maxR = Math.max(w, h) * 1.2
  for (let i = 0; i < 5; i++) {
    const r = waveFront - i * 150
    if (r <= 0 || r > maxR) continue
    const op = interpolate(r, [0, maxR * 0.3, maxR], [0.4, 0.15, 0])
    ctx.beginPath()
    ctx.arc(origin.x, origin.y, r, 0, Math.PI * 2)
    ctx.strokeStyle = ZX_GREEN_LIGHT
    ctx.lineWidth = 1.5
    ctx.globalAlpha = networkOpacity * op
    ctx.stroke()
  }

  // Arcs
  ctx.globalAlpha = networkOpacity
  drawArcs(ctx, ns, t)

  // University dots
  drawDots(ctx, ns, t)

  ctx.restore()
  ctx.globalAlpha = 1
}

function drawArcs(ctx: CanvasRenderingContext2D, ns: NetworkState, t: number) {
  const gap = 3.5 / (ns.scrollOrder.length - 1)
  for (const conn of CONNECTIONS) {
    const af = getActivateTime(ns, conn.to)
    const arcProgress = interpolate(t, [af - gap, af], [0, 1])
    if (arcProgress <= 0) continue

    const p1 = ns.screenPos[conn.from], p2 = ns.screenPos[conn.to]
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2
    const d = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    const cy = my - d * 0.3
    const len = estimateQuadLen(p1, { x: mx, y: cy }, p2)
    const vis = len * arcProgress, hid = len - vis

    // Background arc
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.quadraticCurveTo(mx, cy, p2.x, p2.y)
    ctx.setLineDash([vis, hid])
    ctx.strokeStyle = ZX_GREEN_LIGHT
    ctx.lineWidth = 3; ctx.globalAlpha *= 0.15; ctx.lineCap = 'round'
    ctx.stroke()

    // Foreground arc
    ctx.globalAlpha /= 0.15 // restore
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.quadraticCurveTo(mx, cy, p2.x, p2.y)
    ctx.setLineDash([vis, hid])
    ctx.strokeStyle = ZX_GREEN; ctx.lineWidth = 1.2
    ctx.globalAlpha *= 0.5; ctx.stroke()
    ctx.globalAlpha /= 0.5
  }
  ctx.setLineDash([])
}

function drawDots(ctx: CanvasRenderingContext2D, ns: NetworkState, t: number) {
  for (const item of ns.scrollOrder) {
    if (t < item.activateTime) continue
    const elapsed = (t - item.activateTime) * 30 // convert to ~frames
    const sc = spring(Math.max(0, elapsed), { damping: 12, stiffness: 180 })
    const uni = UNIVERSITIES[item.idx]
    const pos = ns.screenPos[item.idx]
    const dotSize = interpolate(uni.playerCount, [1, 27], [4, 14])

    // Glow
    const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, dotSize * 2)
    grad.addColorStop(0, `${ZX_GREEN_LIGHT}50`)
    grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad
    ctx.globalAlpha *= sc
    ctx.fillRect(pos.x - dotSize * 2, pos.y - dotSize * 2, dotSize * 4, dotSize * 4)

    // Dot
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, (dotSize / 2) * sc, 0, Math.PI * 2)
    ctx.fillStyle = ZX_GREEN; ctx.fill()
    ctx.globalAlpha /= sc || 1
  }
}

function estimateQuadLen(p1: Point2D, cp: Point2D, p2: Point2D): number {
  let len = 0, prev = p1
  for (let j = 1; j <= 20; j++) {
    const t = j / 20
    const x = (1-t)**2*p1.x + 2*(1-t)*t*cp.x + t**2*p2.x
    const y = (1-t)**2*p1.y + 2*(1-t)*t*cp.y + t**2*p2.y
    len += Math.hypot(x - prev.x, y - prev.y)
    prev = { x, y }
  }
  return len
}
