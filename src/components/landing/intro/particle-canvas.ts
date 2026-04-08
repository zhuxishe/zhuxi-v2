/** Canvas-based particle morph system — ported 1:1 from Remotion ParticleMorph */

import type { Point2D } from './animation-utils'
import { interpolate, spring, seededRandom } from './animation-utils'
import LOGO_OUTLINE from './logo-points.json'

const ZX_GREEN = '#4a7c59'
const ZX_GREEN_LIGHT = '#7db88f'
const ZX_LEAF = '#8fbc8f'

export interface Particle {
  source: Point2D
  target: Point2D
  scatterAngle: number
  scatterDist: number
  wobbleSeedX: number
  wobbleSeedY: number
  morphDelay: number
  mass: number
  rotBase: number
  spinAmount: number
}

/** Sample N points from real logo outline (from bamboo-paths.ts logic) */
function sampleLogoPoints(count: number): Point2D[] {
  const src = LOGO_OUTLINE as Point2D[]
  if (src.length === 0) return Array.from({ length: count }, () => ({ x: 50, y: 50 }))
  if (count <= src.length) {
    const step = src.length / count
    return Array.from({ length: count }, (_, i) => {
      const idx = Math.floor(i * step) % src.length
      return { x: src[idx].x, y: src[idx].y }
    })
  }
  // count > source: cycle with jitter
  return Array.from({ length: count }, (_, i) => {
    const base = src[i % src.length]
    const jitter = i >= src.length ? (i * 0.1) % 1.5 : 0
    return { x: base.x + jitter, y: base.y + jitter }
  })
}

/** Convert normalized [0,100] coords to screen pixels (from bamboo-paths.ts) */
export function generateLogoTargets(
  count: number, cx: number, cy: number, size: number,
): Point2D[] {
  const normalized = sampleLogoPoints(count)
  return normalized.map((p) => ({
    x: cx + ((p.x - 50) / 100) * size,
    y: cy + ((p.y - 50) / 100) * size,
  }))
}

/** Pre-compute all particle state (called once) */
export function initParticles(
  sources: Point2D[], targets: Point2D[],
): Particle[] {
  const count = Math.min(sources.length, targets.length, 300)
  return Array.from({ length: count }, (_, i) => ({
    source: sources[i],
    target: targets[i],
    scatterAngle: seededRandom(`angle-${i}`) * Math.PI * 2,
    scatterDist: 30 + seededRandom(`dist-${i}`) * 80,
    wobbleSeedX: seededRandom(`wx-${i}`) * Math.PI * 2,
    wobbleSeedY: seededRandom(`wy-${i}`) * Math.PI * 2,
    morphDelay: Math.floor(seededRandom(`delay-${i}`) * 40),
    mass: 0.8 + seededRandom(`mass-${i}`) * 0.4,
    rotBase: seededRandom(`rot-${i}`) * 360,
    spinAmount: seededRandom(`spin-${i}`) * 180,
  }))
}

/** Draw all particles for the given local time (seconds since particle phase) */
export function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  localT: number,
): void {
  const frame = localT * 30 // map to Remotion's 30fps frame count

  for (const p of particles) {
    const scatterProg = interpolate(frame, [0, 30], [0, 1])
    const sx = p.source.x + Math.cos(p.scatterAngle) * p.scatterDist * scatterProg
    const sy = p.source.y + Math.sin(p.scatterAngle) * p.scatterDist * scatterProg

    const wobX = Math.sin(frame * 0.2 + p.wobbleSeedX) * 4
    const wobY = Math.cos(frame * 0.15 + p.wobbleSeedY) * 4

    const morphFrame = Math.max(0, frame - 50 - p.morphDelay)
    const morphSpring = spring(morphFrame, {
      damping: 15, stiffness: 80, mass: p.mass,
    })

    const x = interpolate(morphSpring, [0, 1], [sx, p.target.x]) + wobX * (1 - morphSpring)
    const y = interpolate(morphSpring, [0, 1], [sy, p.target.y]) + wobY * (1 - morphSpring)

    const fadeIn = interpolate(frame, [0, 8], [0, 1])
    const size = interpolate(morphSpring, [0, 1], [5, 3])
    const color = morphSpring < 0.5 ? ZX_GREEN_LIGHT : ZX_GREEN
    const glowColor = morphSpring < 0.5 ? ZX_GREEN_LIGHT : ZX_LEAF
    const rotation = p.rotBase + interpolate(morphSpring, [0, 1], [0, p.spinAmount])

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.globalAlpha = fadeIn
    ctx.beginPath()
    ctx.ellipse(0, 0, size / 2, size * 1.1, 0, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.shadowColor = glowColor + '60'
    ctx.shadowBlur = size * 2
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.restore()
  }
}
