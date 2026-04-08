/** Pure-browser animation helpers — no Remotion dependency */

export interface Point2D { x: number; y: number }

// ---- Interpolation (clamp-only) ----

export function interpolate(
  value: number,
  inputRange: number[],
  outputRange: number[],
): number {
  const clamped = Math.max(inputRange[0], Math.min(value, inputRange[inputRange.length - 1]))
  for (let i = 0; i < inputRange.length - 1; i++) {
    if (clamped >= inputRange[i] && clamped <= inputRange[i + 1]) {
      const t = (clamped - inputRange[i]) / (inputRange[i + 1] - inputRange[i])
      return outputRange[i] + t * (outputRange[i + 1] - outputRange[i])
    }
  }
  return outputRange[outputRange.length - 1]
}

// ---- Spring physics (simple damped harmonic oscillator) ----

export function spring(
  frame: number,
  config: { damping: number; stiffness: number; mass?: number },
): number {
  const { damping, stiffness, mass = 1 } = config
  const fps = 30
  let pos = 0, vel = 0
  const dt = 1 / fps
  for (let i = 0; i < frame; i++) {
    const force = -stiffness * (pos - 1) - damping * vel
    vel += (force / mass) * dt
    pos += vel * dt
  }
  return Math.max(0, Math.min(pos, 2))
}

// ---- Seeded random (splitmix32) ----

export function seededRandom(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0
  }
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b)
  h = (h ^ (h >>> 16)) >>> 0
  return (h & 0x7fffffff) / 0x7fffffff
}

// ---- Easing ----

export function easeBezier(t: number): number {
  // cubic-bezier(0.25, 0.1, 0.25, 1.0) approximation
  return t < 0.5
    ? 2 * t * t
    : -1 + (4 - 2 * t) * t
}
