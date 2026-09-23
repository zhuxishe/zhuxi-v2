import { Award, Check, ChevronDown, Gift, Leaf, ShieldCheck, Sparkles, Sprout } from "lucide-react"
import type zh from "@/messages/zh.json"
import type { MemberLevel } from "@/lib/profile/types"

export type PlayerLevelGuideCopy = typeof zh.playerStats.levelGuide

const LEVELS = [1, 2, 3] as const
const LEVEL_ICONS = { 1: Sprout, 2: Leaf, 3: Award }

export function PlayerLevelGuide({ level, copy }: { level: MemberLevel; copy: PlayerLevelGuideCopy }) {
  const CurrentIcon = LEVEL_ICONS[level]

  return (
    <div className="space-y-5">
      <section className="player-profile-hero relative overflow-hidden rounded-[22px] p-5" aria-labelledby="current-level-title">
        <Leaf className="pointer-events-none absolute -right-5 -top-6 size-40 -rotate-12 text-white/5" strokeWidth={1} aria-hidden="true" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-white/80">{copy.currentLevel}</p>
            <h2 id="current-level-title" className="mt-2 text-xl font-semibold tracking-tight text-white min-[360px]:text-2xl">{copy.tiers[level].name}</h2>
            <p className="mt-2 text-xs leading-5 text-white/80">{copy.levelNote}</p>
          </div>
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/10 min-[360px]:size-16">
            <CurrentIcon className="size-6 text-white min-[360px]:size-8" strokeWidth={1.5} aria-hidden="true" />
          </span>
        </div>
        <p className="relative mt-4 flex items-start gap-2 border-t border-white/20 pt-3 text-xs leading-5 text-white/90">
          <Gift className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {copy.badgeNote}
        </p>
      </section>

      <section aria-labelledby="level-benefits-title">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="level-benefits-title" className="text-base font-semibold tracking-tight">{copy.benefitsTitle}</h2>
          <span className="text-xs text-muted-foreground">{copy.thresholdLabel}</span>
        </div>
        <ol className="space-y-2.5">
          {LEVELS.map((tier) => {
            const item = copy.tiers[tier]
            const Icon = LEVEL_ICONS[tier]
            const current = tier === level
            return (
              <li key={tier} aria-current={current ? "true" : undefined} className={`rounded-2xl border p-4 ${current ? "border-primary/40 bg-secondary" : "border-border bg-card"}`}>
                <div className="flex items-start gap-3">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${current ? "bg-primary text-primary-foreground" : "bg-secondary text-primary"}`}>
                    <Icon className="size-5" strokeWidth={1.7} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="text-sm font-semibold">{item.name}</h3>
                      {current ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          <Check className="size-3" aria-hidden="true" />{copy.currentBadge}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs font-medium tabular-nums text-primary">{item.points}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.benefits}</p>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
        <p className="mt-3 px-1 text-xs leading-5 text-muted-foreground">{copy.sharedBenefits}</p>
        <p className="mt-1 px-1 text-xs leading-5 text-muted-foreground">{copy.teammateNote}</p>
      </section>

      <section className="overflow-hidden rounded-[22px] border border-border bg-card" aria-labelledby="earn-points-title">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3.5">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          <h2 id="earn-points-title" className="text-sm font-semibold">{copy.earnTitle}</h2>
        </div>
        <dl className="divide-y divide-border/70 px-4">
          {copy.earning.map((item) => (
            <div key={item.title} className="flex items-start justify-between gap-4 py-3">
              <dt className="min-w-0">
                <span className="block text-sm">{item.title}</span>
                {item.note ? <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{item.note}</span> : null}
              </dt>
              <dd className="shrink-0 rounded-lg bg-secondary px-2 py-1 text-xs font-semibold tabular-nums text-primary">{item.points}</dd>
            </div>
          ))}
        </dl>
      </section>

      <details className="group overflow-hidden rounded-2xl border border-border bg-card">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
          <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="flex-1 text-sm font-semibold">{copy.rulesTitle}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <div className="border-t border-border px-4 pb-4">
          <p className="pt-3 text-xs leading-5 text-muted-foreground">{copy.rulesIntro}</p>
          <dl className="mt-1 divide-y divide-border/70">
            {copy.penalties.map((item) => (
              <div key={item.title} className="py-3">
                <dt className="flex items-start justify-between gap-3 text-sm font-medium">
                  {item.title}
                  <span className="shrink-0 text-xs font-semibold tabular-nums">{item.points}</span>
                </dt>
                <dd className="mt-1 text-xs leading-5 text-muted-foreground">{item.note}</dd>
              </div>
            ))}
          </dl>
          <p className="rounded-xl bg-muted px-3 py-2.5 text-xs leading-5 text-muted-foreground">{copy.downgradeNote}</p>
        </div>
      </details>
      <p className="px-1 text-[11px] leading-5 text-muted-foreground">{copy.sourceNote}</p>
    </div>
  )
}
