import Link from "next/link"
import { ChevronRight } from "lucide-react"

interface Props {
  title: string
  compatibility: {
    label: string
    value: string
    hint: string
    href: string
  }
  growth: {
    label: string
    value: string
    hint: string
    href: string
  }
}

export function PlayerHomeStatus({ title, compatibility, growth }: Props) {
  return (
    <section aria-labelledby="player-home-status-title">
      <h2 id="player-home-status-title" className="text-base font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 grid grid-cols-2 divide-x divide-border border-b border-border pb-[15px]">
        <StatusCell {...compatibility} />
        <StatusCell {...growth} padded />
      </div>
    </section>
  )
}

function StatusCell({
  label,
  value,
  hint,
  href,
  padded = false,
}: Props["compatibility"] & { padded?: boolean }) {
  return (
    <Link
      href={href}
      className={`group block min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${padded ? "pl-5" : "pr-5"}`}
    >
      <span className="block text-xs text-muted-foreground">{label}</span>
      <strong className="mt-1.5 block truncate text-xl font-semibold leading-7 tracking-tight text-foreground">{value}</strong>
      <span className="flex min-w-0 items-center gap-1 text-xs font-medium text-primary">
        <span className="truncate">{hint}</span>
        <ChevronRight className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  )
}
