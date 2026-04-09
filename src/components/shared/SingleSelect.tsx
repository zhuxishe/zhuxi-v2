"use client"

import { cn } from "@/lib/utils"

interface SingleSelectProps {
  options: string[]
  value: string
  onChange: (value: string) => void
  className?: string
  /** Optional value→display label mapping for i18n */
  labels?: Record<string, string>
}

export function SingleSelect({
  options,
  value,
  onChange,
  className,
  labels,
}: SingleSelectProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            "rounded-full px-3 py-1.5 text-sm font-medium transition-all",
            value === opt
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          {labels?.[opt] ?? opt}
        </button>
      ))}
    </div>
  )
}
