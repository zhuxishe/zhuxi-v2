"use client"

import { cn } from "@/lib/utils"

interface FilterOption {
  value: string
  label: string
}

interface FilterBarProps {
  options: FilterOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export function FilterBar({ options, value, onChange, className }: FilterBarProps) {
  return (
    <div className={cn("flex gap-2 overflow-x-auto pb-1 scrollbar-none", className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            value === opt.value
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
