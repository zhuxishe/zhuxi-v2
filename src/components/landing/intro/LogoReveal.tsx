"use client"

/**
 * DOM-based logo reveal — fill starts directly BELOW outline,
 * bounces up with real spring physics (3 visible bounces then settles).
 *
 * progress maps frame 310-400 to 0-1 (from parent).
 */
import { interpolate, spring } from './animation-utils'

const ZX_GOLD_LIGHT = '#f0d68a'
const ZX_TEXT = '#2d3a2e'
const ZX_TEXT_MUTED = '#6b7c6b'
const FONT_EN = "'Cormorant Garamond','Georgia',serif"
const FONT_CN = "'Noto Serif SC','Source Han Serif SC',serif"

/**
 * Smooth spring bounce: converts progress(0-1) to a spring value
 * that overshoots, bounces ~3 times, and settles at 1.0
 * Uses the spring() physics sim with low damping for visible bounces
 */
function springBounce(progress: number): number {
  // Map progress 0-1 to ~60 spring frames (gives 3 clear bounces)
  const f = progress * 60
  return spring(f, { damping: 8, stiffness: 120, mass: 0.6 })
}

function AnimatedChar({ ch, i, startP, progress, size, font, color, spacing }: {
  ch: string; i: number; startP: number; progress: number
  size: number; font: string; color: string; spacing: string
}) {
  const charFrame = Math.max(0, Math.floor((progress - startP) * 100) - i * 3)
  const sc = spring(charFrame, { damping: 12, stiffness: 200, mass: 0.5 })
  const ty = interpolate(sc, [0, 1], [30, 0])
  const op = interpolate(sc, [0, 0.3], [0, 1])
  return (
    <span style={{
      display: 'inline-block', fontSize: size, fontWeight: 700,
      fontFamily: font, color, letterSpacing: spacing,
      transform: `translateY(${ty}px) scale(${sc})`, opacity: op,
    }}>{ch === ' ' ? '\u00A0' : ch}</span>
  )
}

export function LogoReveal({ progress, centerX, centerY, logoSize }: {
  progress: number
  centerX: number
  centerY: number
  logoSize: number
}) {
  const outlineOp = interpolate(progress, [0.0, 0.20], [0, 1])
  const fillOp = interpolate(progress, [0.12, 0.25], [0, 1])

  // Fill starts directly below outline (+50px down), spring bounces up to 0
  const moveProgress = interpolate(progress, [0.18, 0.70], [0, 1])
  const bounceVal = springBounce(moveProgress)
  // bounceVal: 0 → overshoot past 1 → bounce back → settle at 1
  // fillY: starts at +50 (below), ends at 0 (aligned)
  const fillY = interpolate(bounceVal, [0, 1], [50, 0])
  // Slight rotation that settles
  const fillRot = interpolate(bounceVal, [0, 1], [6, 0])

  const glowOp = interpolate(progress, [0.75, 0.95], [0, 0.25])

  const titleEn = 'ZHUXISHE'
  const titleCn = '竹 / 溪 / 社'
  const halfLogo = logoSize / 2
  const textTop = centerY + halfLogo + 24

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
      {/* Glow */}
      <div className="absolute" style={{
        left: centerX - logoSize, top: centerY - logoSize * 0.75,
        width: logoSize * 2, height: logoSize * 1.5,
        borderRadius: '50%',
        background: `radial-gradient(ellipse,${ZX_GOLD_LIGHT}30 0%,transparent 60%)`,
        opacity: glowOp,
      }} />
      {/* Green fill — starts below outline, bounces up to align */}
      <div className="absolute" style={{
        left: centerX - halfLogo, top: centerY - halfLogo,
        width: logoSize, height: logoSize,
        transform: `translateY(${fillY}px) rotate(${fillRot}deg)`,
        opacity: fillOp,
      }}>
        <img src="/logo-fill.svg" alt="" width={logoSize} height={logoSize} />
      </div>
      {/* Black outline (stays fixed) */}
      <div className="absolute" style={{
        left: centerX - halfLogo, top: centerY - halfLogo,
        width: logoSize, height: logoSize, opacity: outlineOp,
      }}>
        <img src="/logo-outline.svg" alt="" width={logoSize} height={logoSize} />
      </div>
      {/* English title */}
      <div className="absolute flex justify-center" style={{
        left: 0, right: 0, top: textTop,
      }}>
        {titleEn.split('').map((c, i) => (
          <AnimatedChar key={i} ch={c} i={i} startP={0.55} progress={progress}
            size={52} font={FONT_EN} color={ZX_TEXT} spacing="0.25em" />
        ))}
      </div>
      {/* Chinese title */}
      <div className="absolute flex justify-center" style={{
        left: 0, right: 0, top: textTop + 64,
      }}>
        {titleCn.split('').map((c, i) => (
          <AnimatedChar key={i} ch={c} i={i} startP={0.70} progress={progress}
            size={28} font={FONT_CN} color={ZX_TEXT_MUTED} spacing="0.5em" />
        ))}
      </div>
    </div>
  )
}
