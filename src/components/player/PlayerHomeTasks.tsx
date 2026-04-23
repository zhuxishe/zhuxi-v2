import Link from "next/link"
import { CheckCircle2, Circle, Clock, LineChart, type LucideIcon } from "lucide-react"
import type { ProfileCompleteness } from "@/lib/queries/profile"
import { cn } from "@/lib/utils"

interface Round {
  round_name: string
  survey_end: string
}

interface Props {
  openRound: Round | null
  hasSubmitted: boolean
  completeness: ProfileCompleteness
  labels: {
    title: string
    survey: string
    surveyDone: string
    surveyOpen: string
    daysLeft: string
    profile: string
    profileHint: string
    activities: string
    activitiesHint: string
  }
}

export function PlayerHomeTasks({ openRound, hasSubmitted, completeness, labels }: Props) {
  const daysLeft = openRound ? getDaysLeft(openRound.survey_end) : null

  return (
    <section className="rounded-xl bg-card p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{labels.title}</h2>
        <span className="rounded-full bg-gold-light px-2.5 py-1 text-xs font-semibold text-ink">
          {completeness.percentage}%
        </span>
      </div>
      <div className="space-y-2">
        {openRound && (
          <TaskItem
            href="/app/matching/survey"
            done={hasSubmitted}
            icon={Clock}
            title={openRound.round_name || labels.survey}
            desc={hasSubmitted ? labels.surveyDone : buildRoundHint(labels, daysLeft)}
            accent="sakura"
          />
        )}
        <TaskItem
          href="/app/profile/supplementary"
          done={completeness.supplementary}
          icon={LineChart}
          title={labels.profile}
          desc={labels.profileHint}
          accent="primary"
        />
        <TaskItem
          href="/app/scripts"
          done={false}
          icon={Circle}
          title={labels.activities}
          desc={labels.activitiesHint}
          accent="sky"
        />
      </div>
    </section>
  )
}

function TaskItem({
  href,
  done,
  icon: Icon,
  title,
  desc,
  accent,
}: {
  href: string
  done: boolean
  icon: LucideIcon
  title: string
  desc: string
  accent: "primary" | "sakura" | "sky"
}) {
  return (
    <Link href={href} className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 rounded-lg border border-border bg-background/60 p-3">
      <span className={cn(
        "grid size-9 place-items-center rounded-lg",
        accent === "primary" && "bg-primary/10 text-primary",
        accent === "sakura" && "bg-sakura-light text-sakura",
        accent === "sky" && "bg-sky-light text-sky"
      )}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{desc}</span>
      </span>
      {done ? <CheckCircle2 className="size-4 text-primary" /> : <Circle className="size-4 text-muted-foreground" />}
    </Link>
  )
}

function buildRoundHint(labels: Props["labels"], daysLeft: number | null) {
  if (daysLeft === null) return labels.surveyOpen
  return `${labels.surveyOpen} · ${labels.daysLeft.replace("{days}", String(daysLeft))}`
}

function getDaysLeft(value: string) {
  const deadline = new Date(value).getTime()
  if (Number.isNaN(deadline)) return null
  const diff = deadline - Date.now()
  return Math.max(0, Math.ceil(diff / 86400000))
}
