import type { ComponentProps } from "react"
import { ChevronDown, Users } from "lucide-react"
import { PlayerMatchResultCard } from "./PlayerMatchResultCard"

interface Props {
  matches: Record<string, unknown>[]
  history: Record<string, unknown>[]
  memberId: string
  nameMap: Map<string, string>
  reviewedIds: Set<string>
  dateFmt: string
  labels: ComponentProps<typeof PlayerMatchResultCard>["labels"]
  copy: { title: string; description: string; empty: string; historyTitle: string }
}

export function PlayerMatchesSection({ matches, history, copy, ...cardProps }: Props) {
  const hasResults = matches.length > 0 || history.length > 0
  return <section id="matching" className="scroll-mt-24 space-y-3" aria-labelledby="player-matches-title">
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card/60 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/8 text-primary"><Users className="size-5" aria-hidden="true" /></span>
      <div>
        <h2 id="player-matches-title" className="text-base font-semibold tracking-tight">{copy.title}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{hasResults ? copy.description : copy.empty}</p>
      </div>
    </div>
    {matches.map((match) => <PlayerMatchResultCard key={String(match.id)} match={match} {...cardProps} />)}
    {history.length > 0 && <details className="group rounded-2xl border border-border bg-card/40">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3 text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
        <span className="flex-1">{copy.historyTitle}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 tabular-nums">{history.length}</span>
        <ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <div className="space-y-3 px-3 pb-3">{history.map((match) => <PlayerMatchResultCard key={String(match.id)} match={match} variant="history" {...cardProps} />)}</div>
    </details>}
  </section>
}
