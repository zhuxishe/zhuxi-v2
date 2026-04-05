"use client"

import { cn } from "@/lib/utils"

interface MultiTagSelectProps {
  options: string[]
  value: string[]
  onChange: (value: string[]) => void
  max?: number
  className?: string
}

export function MultiTagSelect({
  options,
  value,
  onChange,
  max,
  className,
}: MultiTagSelectProps) {
  function toggle(tag: string) {
    if (value.includes(tag)) {
      onChange(value.filter((v) => v !== tag))
    } else if (!max || value.length < max) {
      onChange([...value, tag])
    }
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((tag) => {
        const selected = value.includes(tag)
        return (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-all tag-interactive",
              selected
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {tag}
          </button>
        )
      })}
    </div>
  )
}
