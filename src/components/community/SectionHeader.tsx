import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface SectionHeaderProps {
  title: string
  action?: ReactNode
  className?: string
}

export function SectionHeader({ title, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex min-h-11 items-center justify-between gap-3", className)}>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {action ? (
        <div className="shrink-0 text-sm font-medium text-primary [&>*]:inline-flex [&>*]:min-h-11 [&>*]:min-w-11 [&>*]:items-center [&>*]:justify-end [&>*]:rounded-lg [&>*]:outline-none [&>*]:focus-visible:ring-2 [&>*]:focus-visible:ring-primary [&>*]:focus-visible:ring-offset-2">
          {action}
        </div>
      ) : null}
    </div>
  )
}
