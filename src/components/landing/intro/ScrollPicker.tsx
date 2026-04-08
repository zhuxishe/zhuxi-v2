"use client"

/**
 * Left-side university name scroll picker -- 1:1 Remotion ScrollPicker port.
 * SLOT_HEIGHT=58, VISIBLE_SLOTS=7, CENTER_SLOT=3.
 * rawProgress = interpolate(frame, [UNI_START, LAST_FRAME], [0, count-1]).
 * Font sizes: center=32, others=22. Picker width: 420, left: 50.
 */
import { interpolate } from './animation-utils'
import { UNIVERSITIES } from './university-data'

const ZX_GREEN = '#4a7c59'
const ZX_GREEN_LIGHT = '#7db88f'
const ZX_TEXT = '#2d3a2e'
const ZX_TEXT_MUTED = '#6b7c6b'
const FONT_CN = "'Noto Serif SC','Source Han Serif SC',serif"

const SLOT_HEIGHT = 58
const VISIBLE_SLOTS = 7
const CENTER_SLOT = 3

// Remotion exact constants
const UNI_START = 10
const UNI_GAP = 9

interface ScrollItem { idx: number; activateFrame: number }

export function ScrollPicker({ scrollOrder, frame }: {
  scrollOrder: ScrollItem[]
  frame: number
}) {
  if (scrollOrder.length === 0) return null

  const lastFrame = UNI_START + (scrollOrder.length - 1) * UNI_GAP
  const count = scrollOrder.length

  // rawProgress = interpolate(frame, [UNI_START, LAST_FRAME], [0, count-1])
  const rawProgress = interpolate(frame, [UNI_START, lastFrame], [0, count - 1])
  const offset = rawProgress * SLOT_HEIGHT
  const current = Math.round(rawProgress)
  const pickerH = VISIBLE_SLOTS * SLOT_HEIGHT

  return (
    <div className="absolute hidden md:block" style={{
      left: 50, top: '50%', transform: 'translateY(-50%)',
      height: pickerH, width: 420, overflow: 'hidden',
    }}>
      {/* Active indicator line */}
      <div className="absolute" style={{
        top: CENTER_SLOT * SLOT_HEIGHT + 6, left: 0, width: 3,
        height: SLOT_HEIGHT - 12, borderRadius: 2, backgroundColor: ZX_GREEN,
      }} />
      <div style={{
        transform: `translateY(${CENTER_SLOT * SLOT_HEIGHT - offset}px)`,
        willChange: 'transform',
      }}>
        {scrollOrder.map((item, i) => {
          const uni = UNIVERSITIES[item.idx]
          const px = Math.abs(i * SLOT_HEIGHT - offset)
          const norm = Math.min(px / (CENTER_SLOT * SLOT_HEIGHT), 1)
          const op = interpolate(norm, [0, 0.3, 1], [1, 0.5, 0.15])
          const sc = interpolate(norm, [0, 0.3, 1], [1, 0.88, 0.75])
          const isCtr = i === current
          return (
            <div key={item.idx} style={{
              height: SLOT_HEIGHT, display: 'flex', alignItems: 'center',
              gap: 8, padding: '0 12px', opacity: op,
              transform: `scale(${sc})`, transformOrigin: 'left center',
            }}>
              <div style={{
                width: isCtr ? 8 : 5, height: isCtr ? 8 : 5,
                borderRadius: '50%', flexShrink: 0,
                backgroundColor: isCtr ? ZX_GREEN : ZX_GREEN_LIGHT,
              }} />
              <span style={{
                fontSize: isCtr ? 32 : 22, fontFamily: FONT_CN,
                color: isCtr ? ZX_TEXT : ZX_TEXT_MUTED,
                fontWeight: isCtr ? 600 : 400, whiteSpace: 'nowrap',
              }}>{uni.nameJp}</span>
              {uni.playerCount > 1 && (
                <span style={{
                  fontSize: isCtr ? 20 : 14, color: ZX_GREEN,
                  backgroundColor: isCtr ? `${ZX_GREEN_LIGHT}30` : 'transparent',
                  borderRadius: 6, padding: '1px 6px',
                }}>{uni.playerCount}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
