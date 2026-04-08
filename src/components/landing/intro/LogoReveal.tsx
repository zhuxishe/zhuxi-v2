"use client"

/**
 * DOM-based logo reveal -- 1:1 Remotion LogoRevealV2 port.
 * Positioned at SAME centerX, centerY as particle targets.
 * logoSize=400 FIXED.
 *
 * progress maps frame 310-400 to 0-1 (from parent).
 */
import { interpolate, spring } from './animation-utils'

const ZX_GOLD_LIGHT = '#f0d68a'
const ZX_TEXT = '#2d3a2e'
const ZX_TEXT_MUTED = '#6b7c6b'
const FONT_EN = "'Cormorant Garamond','Georgia',serif"
const FONT_CN = "'Noto Serif SC','Source Han Serif SC',serif"

/** Exact 7-point bounce curve from Remotion LogoRevealV2 */
function bounceInterp(moveT: number): number {
  return interpolate(moveT,
    [0, 0.35, 0.52, 0.68, 0.82, 0.92, 1.0],
    [0, 1.35, 0.85, 1.10, 0.96, 1.02, 1.0],
  )
}

function AnimatedChar({ ch, i, startP, progress, size, font, color, spacing }: {
  ch: string; i: number; startP: number; progress: number
  size: number; font: string; color: string; spacing: string
}) {
  // charDelay = i * 3 (in Remotion frame units mapped to progress scale)
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
  progress: number  // 0..1 mapped from frames 310-400
  centerX: number   // w / 2
  centerY: number   // h * 0.38
  logoSize: number  // 400 fixed
}) {
  // Exact Remotion LogoRevealV2 timing
  const outlineOp = interpolate(progress, [0.0, 0.20], [0, 1])
  const fillOp = interpolate(progress, [0.15, 0.30], [0, 1])
  const moveT = interpolate(progress, [0.20, 0.58], [0, 1])
  const bounce = bounceInterp(moveT)
  const fillX = interpolate(bounce, [0, 1], [-19.86, 0])
  const fillY = interpolate(bounce, [0, 1], [-10.97, 0])
  const fillRot = interpolate(bounce, [0, 1], [-8, 0])
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
      {/* Green fill (bounces from offset to center) */}
      <div className="absolute" style={{
        left: centerX - halfLogo, top: centerY - halfLogo,
        width: logoSize, height: logoSize,
        transform: `translate(${fillX}px,${fillY}px) rotate(${fillRot}deg)`,
        opacity: fillOp,
      }}>
        <img src="/logo-fill.png" alt="" width={logoSize} height={logoSize} />
      </div>
      {/* Black outline (stays fixed at center) */}
      <div className="absolute" style={{
        left: centerX - halfLogo, top: centerY - halfLogo,
        width: logoSize, height: logoSize, opacity: outlineOp,
      }}>
        <img src="/logo-outline.png" alt="" width={logoSize} height={logoSize} />
      </div>
      {/* English: fontSize=52, letterSpacing="0.25em", startProgress=0.55 */}
      <div className="absolute flex justify-center" style={{
        left: 0, right: 0, top: textTop,
      }}>
        {titleEn.split('').map((c, i) => (
          <AnimatedChar key={i} ch={c} i={i} startP={0.55} progress={progress}
            size={52} font={FONT_EN} color={ZX_TEXT} spacing="0.25em" />
        ))}
      </div>
      {/* Chinese: fontSize=28, letterSpacing="0.5em", startProgress=0.70 */}
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
