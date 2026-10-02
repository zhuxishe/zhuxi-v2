"use client"

import { useId } from "react"
import type { ActivityReviewCopy } from "@/lib/activity-reviews/copy"

export const ACTIVITY_REVIEW_SCORES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const

export function ActivityReviewScorePicker({ value, onChange, disabled = false, copy }: {
  value: number | null; onChange: (value: number) => void; disabled?: boolean; copy: ActivityReviewCopy
}) {
  const id = useId()
  return <fieldset disabled={disabled} className="min-w-0 space-y-3">
    <legend className="text-sm font-semibold">{copy.score}</legend>
    <p id={`${id}-hint`} className="text-xs leading-5 text-muted-foreground">{copy.scoreHint}</p>
    <div className="grid grid-cols-3 gap-2" aria-describedby={`${id}-hint`}>
      {ACTIVITY_REVIEW_SCORES.map((score) => <label key={score} className="relative">
        <input className="peer sr-only" type="radio" name={`${id}-score`} value={score} checked={value === score} onChange={() => onChange(score)} aria-label={copy.scoreLabel(score)} />
        <span className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-border bg-background text-sm font-semibold tabular-nums transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-disabled:cursor-default peer-disabled:opacity-60">{score.toFixed(1)}</span>
      </label>)}
    </div>
    <div className="flex justify-between gap-3 text-[11px] leading-5 text-muted-foreground"><span>{copy.scoreLow}</span><span>{copy.scoreHigh}</span></div>
  </fieldset>
}
