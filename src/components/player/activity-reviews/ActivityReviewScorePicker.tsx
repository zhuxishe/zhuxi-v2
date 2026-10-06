"use client"

import { useId } from "react"
import type { CSSProperties } from "react"
import type { ActivityReviewCopy } from "@/lib/activity-reviews/copy"
import styles from "./ActivityReviewScorePicker.module.css"

export const ACTIVITY_REVIEW_SCORES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const

export function ActivityReviewScorePicker({ value, onChange, disabled = false, copy }: {
  value: number | null; onChange: (value: number) => void; disabled?: boolean; copy: ActivityReviewCopy
}) {
  const id = useId()
  const selected = value !== null
  // Native range inputs require a position even before a score is chosen.
  // Keep that visual placeholder separate from the nullable submitted value.
  const position = value ?? 3
  const selectScore = (next: number) => {
    if (disabled || !Number.isFinite(next) || next < 1 || next > 5 || !Number.isInteger(next * 2)) return
    if (next !== value) onChange(next)
  }

  return <fieldset disabled={disabled} className="min-w-0 space-y-3">
    <legend id={`${id}-label`} className="text-sm font-semibold">{copy.score}</legend>
    <p id={`${id}-hint`} className="text-xs leading-5 text-muted-foreground">{copy.scoreHint}</p>
    <div className={`rounded-2xl border border-border bg-background px-4 pb-4 pt-3 ${disabled ? "opacity-60" : ""}`}>
      <div className="flex min-h-10 items-center justify-center">
        <output htmlFor={`${id}-score`} aria-live="off" className={`rounded-full px-4 py-1.5 font-semibold tabular-nums ${selected ? "bg-primary/10 text-lg text-primary" : "bg-muted text-xs text-muted-foreground"}`}>
          {selected ? copy.scoreLabel(value) : copy.noScore}
        </output>
      </div>
      <div className={styles.control} style={{ "--score-progress": `${selected ? (position - 1) * 25 : 0}%` } as CSSProperties}>
        <div aria-hidden="true" className={styles.track} />
        <input
          id={`${id}-score`}
          className={styles.range}
          type="range"
          min={1}
          max={5}
          step={0.5}
          value={position}
          disabled={disabled}
          data-unselected={!selected}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-hint`}
          aria-valuetext={selected ? copy.scoreLabel(value) : copy.noScore}
          onChange={(event) => selectScore(event.currentTarget.valueAsNumber)}
          // Clicking the placeholder itself does not emit a native change event.
          onPointerUp={(event) => { if (!selected) selectScore(event.currentTarget.valueAsNumber) }}
          onKeyDown={(event) => {
            if (!selected && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault()
              selectScore(position)
            }
          }}
        />
      </div>
      <div aria-hidden="true" className="relative mx-3.5 h-5 text-[11px] tabular-nums">
        {ACTIVITY_REVIEW_SCORES.map((score) => <span key={score} style={{ left: `${(score - 1) * 25}%` }} className={`absolute -translate-x-1/2 ${value === score ? "font-semibold text-primary" : "text-muted-foreground"}`}>
          {score.toFixed(1)}
        </span>)}
      </div>
      <div className="mt-2 flex justify-between gap-3 text-[11px] leading-5 text-muted-foreground"><span>{copy.scoreLow}</span><span>{copy.scoreHigh}</span></div>
    </div>
  </fieldset>
}
