/** Canvas rendering for network ripple phase -- 1:1 Remotion B-Ripple-V2 port.
 * All timing in FRAME NUMBERS (30fps). */
import type { Point2D } from './animation-utils'
import { interpolate, spring, easeBezier } from './animation-utils'
import { UNIVERSITIES, CONNECTIONS } from './university-data'

const ZX_GREEN = '#4a7c59'
const ZX_GREEN_LIGHT = '#7db88f'
const WASEDA_IDX = 2
const UNI_START = 10
const UNI_GAP = 9

export interface NetworkState {
  screenPos: Point2D[]
  activateFrames: number[]
  lastFrame: number
}

export function initNetworkState(screenPos: Point2D[]): NetworkState {
  const origin = screenPos[WASEDA_IDX]
  const items = UNIVERSITIES.map((_, i) => ({
    idx: i, dist: Math.hypot(screenPos[i].x - origin.x, screenPos[i].y - origin.y),
  }))
  items.sort((a, b) => a.dist - b.dist)
  const activateFrames = new Array(UNIVERSITIES.length).fill(999)
  items.forEach((item, i) => { activateFrames[item.idx] = UNI_START + i * UNI_GAP })
  const lastFrame = UNI_START + (UNIVERSITIES.length - 1) * UNI_GAP
  return { screenPos, activateFrames, lastFrame }
}

export function drawNetwork(
  ctx: CanvasRenderingContext2D, ns: NetworkState,
  frame: number, w: number, h: number, networkOpacity: number,
): void {
  if (networkOpacity <= 0) return
  ctx.save()
  ctx.globalAlpha = networkOpacity
  const origin = ns.screenPos[WASEDA_IDX]
  const { lastFrame } = ns

  // Camera zoom: [0, LAST_FRAME] -> [1.8, 1.0] with bezier
  const zoom = 1.8 - 0.8 * easeBezier(interpolate(frame, [0, lastFrame], [0, 1]))
  // Camera blend: [60, LAST_FRAME] -> [0, 1]
  const blendT = interpolate(frame, [60, lastFrame], [0, 1])
  const focusX = origin.x * (1 - blendT) + (w / 2) * blendT
  const focusY = origin.y * (1 - blendT) + (h / 2) * blendT
  ctx.translate(focusX, focusY)
  ctx.scale(zoom, zoom)
  ctx.translate(-focusX, -focusY)

  // Ripple circles: waveFront = (frame - UNI_START) * 8
  const waveFront = Math.max(0, (frame - UNI_START) * 8)
  const maxR = Math.max(w, h) * 1.2
  for (let i = 0; i < 5; i++) {
    const r = waveFront - i * 150
    if (r <= 0 || r > maxR) continue
    ctx.beginPath()
    ctx.arc(origin.x, origin.y, r, 0, Math.PI * 2)
    ctx.strokeStyle = ZX_GREEN_LIGHT; ctx.lineWidth = 1.5
    ctx.globalAlpha = networkOpacity * interpolate(r, [0, maxR * 0.3, maxR], [0.4, 0.15, 0])
    ctx.stroke()
  }
  ctx.globalAlpha = networkOpacity

  drawArcs(ctx, ns, frame)
  drawDots(ctx, ns, frame)
  ctx.restore()
}

function drawArcs(ctx: CanvasRenderingContext2D, ns: NetworkState, frame: number) {
  for (const conn of CONNECTIONS) {
    const arcEnd = ns.activateFrames[conn.to]
    const arcProgress = interpolate(frame, [arcEnd - UNI_GAP, arcEnd], [0, 1])
    if (arcProgress <= 0) continue
    const p1 = ns.screenPos[conn.from], p2 = ns.screenPos[conn.to]
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2
    const cy = my - Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.3
    const len = quadLen(p1, { x: mx, y: cy }, p2)
    const vis = len * arcProgress, hid = len - vis
    const prevA = ctx.globalAlpha

    ctx.setLineDash([vis, hid]); ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.quadraticCurveTo(mx, cy, p2.x, p2.y)
    ctx.strokeStyle = ZX_GREEN_LIGHT; ctx.lineWidth = 3
    ctx.globalAlpha = prevA * 0.15; ctx.stroke()

    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.quadraticCurveTo(mx, cy, p2.x, p2.y)
    ctx.strokeStyle = ZX_GREEN; ctx.lineWidth = 1.2
    ctx.globalAlpha = prevA * 0.5; ctx.stroke()
    ctx.globalAlpha = prevA
  }
  ctx.setLineDash([])
}

function drawDots(ctx: CanvasRenderingContext2D, ns: NetworkState, frame: number) {
  for (let i = 0; i < UNIVERSITIES.length; i++) {
    const af = ns.activateFrames[i]
    if (frame < af) continue
    const sc = spring(Math.max(0, frame - af), { damping: 12, stiffness: 180 })
    const pos = ns.screenPos[i]
    const dotSize = interpolate(UNIVERSITIES[i].playerCount, [1, 27], [4, 14])
    const prevA = ctx.globalAlpha

    const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, dotSize * 2)
    grad.addColorStop(0, `${ZX_GREEN_LIGHT}50`); grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad; ctx.globalAlpha = prevA * sc
    ctx.fillRect(pos.x - dotSize * 2, pos.y - dotSize * 2, dotSize * 4, dotSize * 4)

    ctx.beginPath()
    ctx.arc(pos.x, pos.y, (dotSize / 2) * sc, 0, Math.PI * 2)
    ctx.fillStyle = ZX_GREEN; ctx.fill()
    ctx.globalAlpha = prevA
  }
}

function quadLen(p1: Point2D, cp: Point2D, p2: Point2D): number {
  let len = 0, prev = p1
  for (let j = 1; j <= 20; j++) {
    const t = j / 20
    const x = (1 - t) ** 2 * p1.x + 2 * (1 - t) * t * cp.x + t ** 2 * p2.x
    const y = (1 - t) ** 2 * p1.y + 2 * (1 - t) * t * cp.y + t ** 2 * p2.y
    len += Math.hypot(x - prev.x, y - prev.y)
    prev = { x, y }
  }
  return len
}
