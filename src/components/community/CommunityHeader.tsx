import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface CommunityHeaderProps {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function CommunityHeader({
  title,
  description,
  action,
  className,
}: CommunityHeaderProps) {
  return (
    <header className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="heading-display text-2xl text-foreground">{title}</h1>
        {description ? (
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className="shrink-0 [&>*]:min-h-11 [&>*]:min-w-11">{action}</div>
      ) : null}
    </header>
  )
}
