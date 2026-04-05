"use client"

import { cn } from "@/lib/utils"

const SCORES = [1, 2, 3, 4, 5]

interface Props {
  value: number
  onChange: (value: number) => void
  lowLabel: string
  highLabel: string
}

export function PersonalitySlider({ value, onChange, lowLabel, highLabel }: Props) {
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        {SCORES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={cn(
              "flex-1 h-9 rounded-lg text-xs font-medium transition-colors",
              s <= value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground px-1">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  )
}
