"use client"

import { useCallback } from "react"
import { useTranslations } from "next-intl"

/** DB keys — never change */
const SLOTS = ["上午", "下午", "晚上"] as const
const SLOT_I18N_KEYS = ["morning", "afternoon", "evening"] as const
const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const

interface Props {
  /** 活动日期范围的起始日 */
  startDate: string
  /** 活动日期范围的结束日 */
  endDate: string
  /** 当前选中的可用时段 {"2026-04-06": ["上午","下午"], ...} */
  value: Record<string, string[]>
  onChange: (v: Record<string, string[]>) => void
}

export function TimeGridSelector({ startDate, endDate, value, onChange }: Props) {
  const t = useTranslations("timeGrid")
  // 生成日期列表
  const dates: string[] = []
  const start = new Date(startDate)
  const end = new Date(endDate)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split("T")[0])
  }

  const toggleSlot = useCallback((date: string, slot: string) => {
    const current = value[date] ?? []
    const next = current.includes(slot)
      ? current.filter((s) => s !== slot)
      : [...current, slot]
    const updated = { ...value }
    if (next.length > 0) {
      updated[date] = next
    } else {
      delete updated[date]
    }
    onChange(updated)
  }, [value, onChange])

  const toggleAllDay = useCallback((date: string) => {
    const current = value[date] ?? []
    const allSelected = SLOTS.every((s) => current.includes(s))
    const updated = { ...value }
    if (allSelected) {
      delete updated[date]
    } else {
      updated[date] = [...SLOTS]
    }
    onChange(updated)
  }, [value, onChange])

  // 统计
  const totalSlots = Object.values(value).reduce((sum, s) => sum + s.length, 0)
  const totalDays = Object.keys(value).length

  return (
    <div className="space-y-3">
      {/* 表头 */}
      <div className="grid grid-cols-[1fr_repeat(3,44px)_44px] gap-1 text-[10px] font-medium text-muted-foreground px-1">
        <span>{t("date")}</span>
        {SLOT_I18N_KEYS.map((key) => <span key={key} className="text-center">{t(key)}</span>)}
        <span className="text-center">{t("allDay")}</span>
      </div>

      {/* 日期行 */}
      <div className="space-y-1">
        {dates.map((date) => {
          const d = new Date(date)
          const dayOfWeek = d.getDay()
          const weekday = t(`weekdays.${WEEKDAY_KEYS[dayOfWeek]}`)
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
          const selected = value[date] ?? []
          const allSelected = SLOTS.every((s) => selected.includes(s))

          return (
            <div
              key={date}
              className={`grid grid-cols-[1fr_repeat(3,44px)_44px] gap-1 items-center rounded-lg px-1 py-1.5 ${
                isWeekend ? "bg-sakura-muted" : ""
              }`}
            >
              {/* 日期标签 */}
              <span className={`text-xs ${isWeekend ? "font-semibold" : ""}`}>
                {date.slice(5)} <span className="text-muted-foreground">({weekday})</span>
              </span>

              {/* 时段按钮 */}
              {SLOTS.map((slot) => {
                const active = selected.includes(slot)
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => toggleSlot(date, slot)}
                    className={`h-8 rounded-md text-[10px] font-medium transition-all ${
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {active ? "✓" : ""}
                  </button>
                )
              })}

              {/* 全天按钮 */}
              <button
                type="button"
                onClick={() => toggleAllDay(date)}
                className={`h-8 rounded-md text-[10px] font-medium transition-all ${
                  allSelected
                    ? "bg-primary/80 text-primary-foreground"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {t("allDay")}
              </button>
            </div>
          )
        })}
      </div>

      {/* 统计 */}
      <p className="text-xs text-muted-foreground text-center">
        {t.rich("stats", {
          slots: totalSlots,
          days: totalDays,
          b: (chunks) => <span className="font-semibold text-gold">{chunks}</span>,
        })}
      </p>
    </div>
  )
}
