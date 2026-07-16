import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface CommunityEmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function CommunityEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: CommunityEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-[20px] bg-card px-6 py-10 text-center shadow-soft",
        className,
      )}
    >
      <span className="grid size-14 place-items-center rounded-full bg-secondary text-primary">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-foreground">{title}</h2>
      {description ? (
        <p className="mt-1.5 max-w-xs text-sm leading-6 text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4 [&>*]:min-h-11 [&>*]:min-w-11">{action}</div> : null}
    </div>
  )
}
