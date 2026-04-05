"use client"

import { cn } from "@/lib/utils"

interface Props {
  label: string
  description: string
  value: number
  onChange: (value: number) => void
}

const SCORES = [1, 2, 3, 4, 5]

export function ScoreSlider({ label, description, value, onChange }: Props) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-28 shrink-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex gap-1.5">
        {SCORES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={cn(
              "size-8 rounded-lg text-xs font-medium transition-colors",
              s <= value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {s}
          </button>
        ))}
      </div>
      <span className="text-sm font-bold text-primary w-6 text-center">{value}</span>
    </div>
  )
}
