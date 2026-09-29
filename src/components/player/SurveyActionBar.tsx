"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"

interface Props {
  label: string
  disabled: boolean
  submitting: boolean
  onSubmit: () => Promise<void>
  error?: string | null
  notice?: string
  hint?: string
  children?: ReactNode
}

export function SurveyActionBar({ label, disabled, submitting, onSubmit, error, notice, hint, children }: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const [barHeight, setBarHeight] = useState(176)
  const feedback = error || notice || hint

  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const measure = () => setBarHeight(Math.ceil(bar.getBoundingClientRect().height))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [])

  return (
    <div style={{ height: barHeight }}>
      <div ref={barRef} className="player-app-action-bar fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-h-[max(8rem,calc(100dvh-12rem-env(safe-area-inset-bottom)))] w-full max-w-md overflow-y-auto overscroll-contain border-t border-border px-4 py-4 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-xs flex-col items-stretch gap-3">
          {feedback && (
            <p id="survey-submit-feedback" role={error ? "alert" : "status"}
              className={`text-center text-sm leading-relaxed [overflow-wrap:anywhere] ${error ? "text-destructive" : "text-muted-foreground"}`}>
              {feedback}
            </p>
          )}
          <Button type="button" onClick={onSubmit} disabled={disabled} aria-busy={submitting}
            aria-describedby={feedback ? "survey-submit-feedback" : undefined}
            className="h-auto min-h-13 w-full whitespace-normal rounded-2xl px-6 py-3 text-base font-semibold leading-relaxed shadow-soft [overflow-wrap:anywhere]">
            {label}
          </Button>
          {children}
        </div>
      </div>
    </div>
  )
}
