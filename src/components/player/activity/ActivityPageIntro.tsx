import { ArrowLeft } from "lucide-react"
import Link from "next/link"

interface ActivityPageIntroProps {
  title: string
  description?: string
  backHref?: string
  backLabel?: string
}

export function ActivityPageIntro({
  title,
  description,
  backHref,
  backLabel,
}: ActivityPageIntroProps) {
  return (
    <header>
      {backHref && backLabel ? (
        <Link
          href={backHref}
          className="mb-3 inline-flex min-h-10 items-center gap-1.5 rounded-full pr-3 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {backLabel}
        </Link>
      ) : null}
      <h1 className="heading-display text-[2rem] font-semibold leading-tight tracking-tight">{title}</h1>
      {description ? (
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p>
      ) : null}
    </header>
  )
}
