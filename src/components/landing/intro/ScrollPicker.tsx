"use client"

/** Left-side university name scroll picker (desktop only) */
import { interpolate } from './animation-utils'
import { UNIVERSITIES, type University } from './university-data'

const ZX_GREEN = '#4a7c59'
const ZX_GREEN_LIGHT = '#7db88f'
const ZX_TEXT = '#2d3a2e'
const ZX_TEXT_MUTED = '#6b7c6b'
const FONT_CN = "'Noto Serif SC','Source Han Serif SC',serif"

const SLOT_H = 44
const VISIBLE = 7
const CENTER = 3

interface ScrollItem { idx: number; activateTime: number }

export function ScrollPicker({ scrollOrder, t }: {
  scrollOrder: ScrollItem[]
  t: number // seconds
}) {
  if (scrollOrder.length === 0) return null

  const endTime = scrollOrder[scrollOrder.length - 1].activateTime
  const startTime = scrollOrder[0].activateTime
  const rawProg = interpolate(t, [startTime, endTime], [0, scrollOrder.length - 1])
  const offset = rawProg * SLOT_H
  const current = Math.round(rawProg)
  const pickerH = VISIBLE * SLOT_H

  return (
    <div className="absolute hidden md:block" style={{
      left: 32, top: '50%', transform: 'translateY(-50%)',
      height: pickerH, width: 280, overflow: 'hidden',
    }}>
      {/* Indicator line */}
      <div className="absolute" style={{
        top: CENTER * SLOT_H + 6, left: 0, width: 3,
        height: SLOT_H - 12, borderRadius: 2, backgroundColor: ZX_GREEN,
      }} />
      <div style={{
        transform: `translateY(${CENTER * SLOT_H - offset}px)`,
        willChange: 'transform',
      }}>
        {scrollOrder.map((item, i) => {
          const uni = UNIVERSITIES[item.idx]
          const px = Math.abs(i * SLOT_H - offset)
          const norm = Math.min(px / (CENTER * SLOT_H), 1)
          const op = interpolate(norm, [0, 0.3, 1], [1, 0.5, 0.15])
          const sc = interpolate(norm, [0, 0.3, 1], [1, 0.88, 0.75])
          const isCtr = i === current
          return (
            <div key={item.idx} style={{
              height: SLOT_H, display: 'flex', alignItems: 'center',
              gap: 8, padding: '0 12px', opacity: op,
              transform: `scale(${sc})`, transformOrigin: 'left center',
            }}>
              <div style={{
                width: isCtr ? 8 : 5, height: isCtr ? 8 : 5,
                borderRadius: '50%', flexShrink: 0,
                backgroundColor: isCtr ? ZX_GREEN : ZX_GREEN_LIGHT,
              }} />
              <span style={{
                fontSize: isCtr ? 22 : 16, fontFamily: FONT_CN,
                color: isCtr ? ZX_TEXT : ZX_TEXT_MUTED,
                fontWeight: isCtr ? 600 : 400, whiteSpace: 'nowrap',
              }}>{uni.nameJp}</span>
              {uni.playerCount > 1 && (
                <span style={{
                  fontSize: isCtr ? 16 : 12, color: ZX_GREEN,
                  backgroundColor: isCtr ? `${ZX_GREEN_LIGHT}30` : 'transparent',
                  borderRadius: 6, padding: '1px 4px',
                }}>{uni.playerCount}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
