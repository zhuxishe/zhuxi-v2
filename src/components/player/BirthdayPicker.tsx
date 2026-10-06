"use client"

import { useId, useLayoutEffect, useRef, useState, type RefObject } from "react"
import { CalendarDays, ChevronDown } from "lucide-react"
import { useTranslations } from "next-intl"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { getTodayInTokyo, parseBirthDate } from "@/lib/member-master/birth-date"
import { cn } from "@/lib/utils"
import {
  birthdayDaysInMonth,
  clampBirthdaySelection,
  formatBirthdaySelection,
  initialBirthdaySelection,
  type BirthdaySelection,
} from "./BirthdayPicker.utils"

const ROW_HEIGHT = 44

function DateWheel({ label, min, max, value, onChange, scrollRef }: {
  label: string
  min: number
  max: number
  value: number
  onChange: (value: number) => void
  scrollRef: RefObject<HTMLDivElement | null>
}) {
  const id = useId()
  const scrollValue = useRef<number | null>(null)
  const previousMax = useRef(max)

  useLayoutEffect(() => {
    if (scrollRef.current && (scrollValue.current !== value || previousMax.current !== max)) {
      scrollRef.current.scrollTop = (value - min) * ROW_HEIGHT
    }
    scrollValue.current = null
    previousMax.current = max
  }, [min, max, value, scrollRef])

  function select(next: number) {
    const clamped = Math.max(min, Math.min(next, max))
    // Explicit clicks and keyboard navigation move immediately; touch scrolling
    // keeps its native inertia and CSS snap without an effect resetting it.
    if (scrollRef.current) scrollRef.current.scrollTop = (clamped - min) * ROW_HEIGHT
    onChange(clamped)
  }

  return (
    <div>
      <div id={`${id}-label`} className="mb-2 text-center text-xs font-medium text-muted-foreground">{label}</div>
      <div className="relative">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[88px] h-11 rounded-xl border-y border-primary/15 bg-primary/8" />
        <div
          ref={scrollRef}
          role="listbox"
          tabIndex={0}
          aria-labelledby={`${id}-label`}
          aria-activedescendant={`${id}-${value}`}
          aria-orientation="vertical"
          className="scrollbar-none relative h-[220px] snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-xl py-[88px] outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          onScroll={(event) => {
            const next = Math.max(min, Math.min(max, min + Math.round(event.currentTarget.scrollTop / ROW_HEIGHT)))
            if (next !== value) {
              scrollValue.current = next
              onChange(next)
            }
          }}
          onKeyDown={(event) => {
            const offsets: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 }
            if (event.key === "Home" || event.key === "End" || event.key in offsets) {
              event.preventDefault()
              select(event.key === "Home" ? min : event.key === "End" ? max : value + offsets[event.key])
            }
          }}
        >
          {Array.from({ length: max - min + 1 }, (_, index) => min + index).map((option) => (
            <div
              id={`${id}-${option}`}
              key={option}
              role="option"
              aria-selected={option === value}
              onClick={() => select(option)}
              className={cn(
                "flex h-11 cursor-pointer snap-center items-center justify-center text-lg tabular-nums select-none",
                option === value ? "font-semibold text-primary" : "text-muted-foreground",
              )}
            >
              {option}
            </div>
          ))}
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-16 rounded-t-xl bg-gradient-to-b from-card to-transparent" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 rounded-b-xl bg-gradient-to-t from-card to-transparent" />
      </div>
    </div>
  )
}

export function BirthdayPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useTranslations("interview")
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const yearRef = useRef<HTMLDivElement>(null)
  const monthRef = useRef<HTMLDivElement>(null)
  const dayRef = useRef<HTMLDivElement>(null)
  const [session, setSession] = useState<{ today: string; date: BirthdaySelection } | null>(null)
  const selected = parseBirthDate(value)

  function openPicker() {
    const today = getTodayInTokyo()
    setSession({ today, date: initialBirthdaySelection(value, today) })
  }

  function updateDate(patch: Partial<BirthdaySelection>) {
    setSession((current) => current && ({ ...current, date: clampBirthdaySelection({ ...current.date, ...patch }, current.today) }))
  }

  function confirmBirthday() {
    if (!session) return
    // Read the visible wheel positions too: a user can confirm while a native
    // scroll is still settling, before its last scroll event has reached React.
    const date = clampBirthdaySelection({
      year: yearRef.current ? 1900 + Math.round(yearRef.current.scrollTop / ROW_HEIGHT) : session.date.year,
      month: monthRef.current ? 1 + Math.round(monthRef.current.scrollTop / ROW_HEIGHT) : session.date.month,
      day: dayRef.current ? 1 + Math.round(dayRef.current.scrollTop / ROW_HEIGHT) : session.date.day,
    }, session.today)
    onChange(formatBirthdaySelection(date))
    setSession(null)
  }

  const current = session ? parseBirthDate(session.today)! : null
  const date = session?.date

  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-foreground">{t("birthDate")} *</label>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={session !== null}
        aria-describedby={`${id}-hint`}
        onClick={openPicker}
        className="mt-1 flex min-h-12 w-full items-center gap-3 rounded-xl border border-input bg-background px-3 py-2.5 text-left text-sm outline-none transition-colors hover:border-primary focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
      >
        <CalendarDays aria-hidden="true" className="size-5 shrink-0 text-primary" />
        <span className={cn("flex-1 tabular-nums", !selected && "text-muted-foreground")}>
          {selected ? t("birthDateValue", { ...selected }) : t("birthDatePlaceholder")}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </button>
      <p id={`${id}-hint`} className="mt-1.5 text-xs leading-5 text-muted-foreground">{t("birthDateHint")}</p>
      <Dialog open={session !== null} onOpenChange={(open) => { if (!open) setSession(null) }}>
        {session && current && date && (
          <DialogContent
            showCloseButton={false}
            finalFocus={triggerRef}
            className="player-app-theme bottom-0 top-auto max-h-[calc(100dvh-0.5rem)] w-full max-w-full translate-y-0 gap-5 overflow-y-auto rounded-b-none rounded-t-[28px] px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 sm:bottom-auto sm:top-1/2 sm:max-w-sm sm:-translate-y-1/2 sm:rounded-2xl sm:pb-5"
            style={{ backgroundColor: "var(--card)" }}
          >
            <div aria-hidden="true" className="mx-auto h-1 w-9 rounded-full bg-border sm:hidden" />
            <div>
              <DialogTitle className="text-lg font-semibold leading-6">{t("birthDatePickerTitle")}</DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-5">{t("birthDatePickerHint")}</DialogDescription>
            </div>
            <div className="rounded-xl bg-secondary px-4 py-3 text-center text-base font-semibold tracking-wide text-primary tabular-nums">
              {t("birthDateValue", { ...date })}
            </div>
            <div className="grid grid-cols-[1.25fr_1fr_1fr] gap-2">
              <DateWheel scrollRef={yearRef} label={t("birthYear")} min={1900} max={current.year} value={date.year} onChange={(year) => updateDate({ year })} />
              <DateWheel scrollRef={monthRef} label={t("birthMonth")} min={1} max={date.year === current.year ? current.month : 12} value={date.month} onChange={(month) => updateDate({ month })} />
              <DateWheel scrollRef={dayRef} label={t("birthDay")} min={1} max={date.year === current.year && date.month === current.month ? current.day : birthdayDaysInMonth(date.year, date.month)} value={date.day} onChange={(day) => updateDate({ day })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setSession(null)} className="min-h-11 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/40">{t("birthDateCancel")}</button>
              <button type="button" onClick={confirmBirthday} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2">{t("birthDateConfirm")}</button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
