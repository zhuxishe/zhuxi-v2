import { ChevronRight } from "lucide-react"
import Link from "next/link"

interface ActivitySectionHeaderProps {
  title: string
  href?: string
  actionLabel?: string
}

export function ActivitySectionHeader({ title, href, actionLabel }: ActivitySectionHeaderProps) {
  return (
    <div className="mb-2 flex min-h-8 items-center justify-between gap-3">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      {href && actionLabel ? (
        <Link
          href={href}
          className="inline-flex min-h-10 shrink-0 items-center gap-0.5 rounded-full pl-3 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {actionLabel}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  )
}
