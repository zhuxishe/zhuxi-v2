import { PERSONALITY_DIMENSIONS } from "@/lib/constants/personality"
import { TagBadge } from "@/components/shared/TagBadge"

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props { data: any }

export function MemberPersonalitySection({ data }: Props) {
  if (!data) {
    return (
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <h3 className="text-sm font-semibold text-foreground mb-2">性格评价</h3>
        <p className="text-sm text-muted-foreground">未填写</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">性格评价</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {PERSONALITY_DIMENSIONS.map((dim) => {
          const val = data[dim.key]
          if (val == null) return null

          if (dim.type === "slider") {
            const score = typeof val === "number" ? val : 50
            return (
              <div key={dim.key} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{dim.label}</span>
                  <span className="font-medium">{score}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${score}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{dim.sliderLabels?.[0]}</span>
                  <span>{dim.sliderLabels?.[1]}</span>
                </div>
              </div>
            )
          }

          if (dim.type === "multi" && Array.isArray(val)) {
            return (
              <div key={dim.key}>
                <span className="text-xs text-muted-foreground mr-2">{dim.label}:</span>
                {val.map((t: string) => (
                  <TagBadge key={t} label={t} variant="info" className="mr-1 mb-1" />
                ))}
              </div>
            )
          }

          return (
            <div key={dim.key}>
              <dt className="text-xs text-muted-foreground">{dim.label}</dt>
              <dd className="text-sm font-medium">{val}</dd>
            </div>
          )
        })}
      </div>
    </div>
  )
}
