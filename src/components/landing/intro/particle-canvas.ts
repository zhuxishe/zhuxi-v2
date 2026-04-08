/** Canvas-based particle morph -- 1:1 Remotion ParticleMorph port.
 * Local frame = main frame - 200 (Sequence from=200, duration=140).
 * Scatter: frame 0-30. Morph: starts at local frame 50 + random delay (0-40).
 * Spring config: damping=15, stiffness=80, mass=0.8+random*0.4. */

import type { Point2D } from './animation-utils'
import { interpolate, spring, seededRandom } from './animation-utils'
import LOGO_OUTLINE from './logo-points.json'

const ZX_GREEN_LIGHT = '#a2d1a6'  // 全程统一 = SVG fill 颜色
const ZX_LOGO_FILL = '#a2d1a6'
const ZX_LEAF = '#a2d1a6'

export interface Particle {
  source: Point2D
  target: Point2D
  scatterAngle: number
  scatterDist: number
  wobbleSeedX: number
  wobbleSeedY: number
  morphDelay: number  // 0-40 random frames
  mass: number        // 0.8 + random * 0.4
  rotBase: number
  spinAmount: number
}

/** Sample N points from real logo outline */
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
  return Array.from({ length: count }, (_, i) => {
    const base = src[i % src.length]
    const jitter = i >= src.length ? (i * 0.1) % 1.5 : 0
    return { x: base.x + jitter, y: base.y + jitter }
  })
}

/** Convert normalized [0,100] coords to screen pixels.
 * Matches: positionLogoPoints(sampleLogoPoints(count), logoCenterX, logoCenterY, logoSize) */
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
export function initParticles(sources: Point2D[], targets: Point2D[]): Particle[] {
  const count = Math.min(sources.length, targets.length, 400)
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

/** Draw all particles. localFrame = mainFrame - 200 */
export function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  localFrame: number,
): void {
  for (const p of particles) {
    // Scatter: frame 0-30
    const scatterProg = interpolate(localFrame, [0, 30], [0, 1])
    const sx = p.source.x + Math.cos(p.scatterAngle) * p.scatterDist * scatterProg
    const sy = p.source.y + Math.sin(p.scatterAngle) * p.scatterDist * scatterProg

    // Wobble: ongoing
    const wobX = Math.sin(localFrame * 0.2 + p.wobbleSeedX) * 4
    const wobY = Math.cos(localFrame * 0.15 + p.wobbleSeedY) * 4

    // Morph: starts at local frame 50 + random delay (0-40)
    const morphFrame = Math.max(0, localFrame - 50 - p.morphDelay)
    const morphSpring = spring(morphFrame, {
      damping: 15, stiffness: 80, mass: p.mass,
    })

    const x = interpolate(morphSpring, [0, 1], [sx, p.target.x]) + wobX * (1 - morphSpring)
    const y = interpolate(morphSpring, [0, 1], [sy, p.target.y]) + wobY * (1 - morphSpring)

    const fadeIn = interpolate(localFrame, [0, 8], [0, 1])
    const size = interpolate(morphSpring, [0, 1], [5, 3])
    const color = morphSpring < 0.5 ? ZX_GREEN_LIGHT : ZX_LOGO_FILL
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
