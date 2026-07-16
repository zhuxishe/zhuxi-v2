import type { LucideIcon } from "lucide-react"

interface CommunityMetricCardProps {
  icon: LucideIcon
  label: string
  value: number
  tone?: "default" | "warning" | "danger"
}

const TONES = {
  default: "bg-primary/10 text-primary",
  warning: "bg-orange-100 text-orange-700",
  danger: "bg-destructive/10 text-destructive",
} as const

export function CommunityMetricCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: CommunityMetricCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{value}</p>
        </div>
        <div className={`grid size-11 place-items-center rounded-xl ${TONES[tone]}`}>
          <Icon className="size-5" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
