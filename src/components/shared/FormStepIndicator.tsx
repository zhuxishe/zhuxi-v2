"use client"

import { cn } from "@/lib/utils"

interface FormStepIndicatorProps {
  steps: string[]
  currentStep: number
  className?: string
}

export function FormStepIndicator({
  steps,
  currentStep,
  className,
}: FormStepIndicatorProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-xs font-medium transition-colors",
                i < currentStep
                  ? "bg-primary text-primary-foreground"
                  : i === currentStep
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                    : "bg-muted text-muted-foreground"
              )}
            >
              {i + 1}
            </div>
            <span
              className={cn(
                "text-xs font-medium hidden sm:inline",
                i <= currentStep ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={cn(
                "h-px w-6 transition-colors",
                i < currentStep ? "bg-primary" : "bg-border"
              )}
            />
          )}
        </div>
      ))}
    </div>
  )
}
