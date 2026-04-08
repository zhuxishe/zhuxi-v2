"use client"

/**
 * DOM-based logo reveal layer (sharp at any resolution).
 * Layers bottom-to-top: glow -> green fill -> black outline -> text
 */
import { interpolate, spring } from './animation-utils'

const ZX_GOLD_LIGHT = '#f0d68a'
const ZX_TEXT = '#2d3a2e'
const ZX_TEXT_MUTED = '#6b7c6b'

const FONT_EN = "'Cormorant Garamond','Georgia',serif"
const FONT_CN = "'Noto Serif SC','Source Han Serif SC',serif"

/** Exact bounce curve from Remotion LogoRevealV2 */
function bounceInterp(moveT: number): number {
  return interpolate(
    moveT,
    [0, 0.35, 0.52, 0.68, 0.82, 0.92, 1.0],
    [0, 1.35, 0.85, 1.10, 0.96, 1.02, 1.0],
  )
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

export function LogoReveal({ progress, logoSize }: {
  progress: number  // 0..1
  logoSize: number
}) {
  // Phase mapping (same as Remotion LogoRevealV2)
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
  const responsiveSize = logoSize
  const textTop = responsiveSize / 2 + 24

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{ paddingBottom: '10%' }}>
      <div className="relative" style={{ width: responsiveSize, height: responsiveSize + 120 }}>
        {/* Glow */}
        <div className="absolute" style={{
          left: '50%', top: responsiveSize * 0.4,
          width: responsiveSize * 2, height: responsiveSize * 1.5,
          borderRadius: '50%',
          background: `radial-gradient(ellipse,${ZX_GOLD_LIGHT}30 0%,transparent 60%)`,
          transform: 'translate(-50%,-50%)', opacity: glowOp,
        }} />
        {/* Green fill (bounces) */}
        <div className="absolute" style={{
          left: '50%', top: responsiveSize / 2,
          transform: `translate(-50%,-50%) translate(${fillX}px,${fillY}px) rotate(${fillRot}deg)`,
          opacity: fillOp,
        }}>
          <img src="/logo-fill.png" alt="" width={responsiveSize} height={responsiveSize} />
        </div>
        {/* Black outline */}
        <div className="absolute" style={{
          left: '50%', top: responsiveSize / 2,
          transform: 'translate(-50%,-50%)', opacity: outlineOp,
        }}>
          <img src="/logo-outline.png" alt="" width={responsiveSize} height={responsiveSize} />
        </div>
        {/* English title */}
        <div className="absolute w-full flex justify-center"
          style={{ top: textTop + responsiveSize / 2 }}>
          {titleEn.split('').map((c, i) => (
            <AnimatedChar key={i} ch={c} i={i} startP={0.55} progress={progress}
              size={Math.max(24, responsiveSize * 0.13)} font={FONT_EN}
              color={ZX_TEXT} spacing="0.25em" />
          ))}
        </div>
        {/* Chinese title */}
        <div className="absolute w-full flex justify-center"
          style={{ top: textTop + responsiveSize / 2 + Math.max(36, responsiveSize * 0.15) }}>
          {titleCn.split('').map((c, i) => (
            <AnimatedChar key={i} ch={c} i={i} startP={0.70} progress={progress}
              size={Math.max(16, responsiveSize * 0.07)} font={FONT_CN}
              color={ZX_TEXT_MUTED} spacing="0.5em" />
          ))}
        </div>
      </div>
    </div>
  )
}
