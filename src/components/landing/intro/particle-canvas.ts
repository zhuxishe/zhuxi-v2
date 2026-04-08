/** Canvas-based particle morph system (scatter -> gather to logo shape) */

import type { Point2D } from './animation-utils'
import { interpolate, spring, seededRandom } from './animation-utils'

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

/** Pre-compute all particle state (called once) */
export function initParticles(
  sources: Point2D[],
  targets: Point2D[],
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

/** Draw all particles for the given local time (0 = start of particle phase) */
export function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  localT: number, // seconds since particle phase start
  w: number, h: number,
): void {
  // Map seconds to ~frames for spring math (original was 30fps)
  const frame = localT * 30

  for (const p of particles) {
    // Scatter phase (frame 0-30 -> 0-1s)
    const scatterProg = interpolate(frame, [0, 30], [0, 1])
    const sx = p.source.x + Math.cos(p.scatterAngle) * p.scatterDist * scatterProg
    const sy = p.source.y + Math.sin(p.scatterAngle) * p.scatterDist * scatterProg

    // Wobble
    const wobX = Math.sin(frame * 0.2 + p.wobbleSeedX) * 4
    const wobY = Math.cos(frame * 0.15 + p.wobbleSeedY) * 4

    // Morph phase (frame 50+ -> 1.67s+)
    const morphFrame = Math.max(0, frame - 50 - p.morphDelay)
    const morphSpring = spring(morphFrame, {
      damping: 15, stiffness: 80, mass: p.mass,
    })

    const x = interpolate(morphSpring, [0, 1], [sx, p.target.x]) +
      wobX * (1 - morphSpring)
    const y = interpolate(morphSpring, [0, 1], [sy, p.target.y]) +
      wobY * (1 - morphSpring)

    // Size + opacity
    const fadeIn = interpolate(frame, [0, 8], [0, 1])
    const size = interpolate(morphSpring, [0, 1], [5, 3])
    const color = morphSpring < 0.5 ? ZX_GREEN_LIGHT : ZX_GREEN
    const glowColor = morphSpring < 0.5 ? ZX_GREEN_LIGHT : ZX_LEAF
    const rotation = p.rotBase + interpolate(morphSpring, [0, 1], [0, p.spinAmount])

    // Draw leaf-shaped ellipse
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

/** Generate simple circular logo target positions (fallback if no outline data) */
export function generateLogoTargets(
  count: number,
  cx: number, cy: number, size: number,
): Point2D[] {
  const pts: Point2D[] = []
  const r = size / 2
  // Concentric rings
  const rings = 5
  let placed = 0
  for (let ring = 0; ring < rings && placed < count; ring++) {
    const ringR = (r * (ring + 1)) / rings
    const circum = 2 * Math.PI * ringR
    const n = Math.min(Math.ceil(circum / 8), count - placed)
    for (let j = 0; j < n && placed < count; j++) {
      const angle = (j / n) * Math.PI * 2 + ring * 0.3
      pts.push({ x: cx + Math.cos(angle) * ringR, y: cy + Math.sin(angle) * ringR })
      placed++
    }
  }
  // Fill remaining at center
  while (pts.length < count) pts.push({ x: cx, y: cy })
  return pts
}
