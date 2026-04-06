"use client"

const FACTOR_LABELS: Record<string, string> = {
  interest_overlap: "兴趣重合",
  social_complement: "社交互补",
  school_diversity: "学校多样",
  rapport: "合拍分",
  repeat_penalty: "重复惩罚",
  game_preference: "游戏偏好",
  experience_level: "经验等级",
}

interface Props {
  breakdown: Record<string, { raw: number; weighted: number; maxRaw: number }>
}

export function ScoreBreakdownChart({ breakdown }: Props) {
  const entries = Object.entries(breakdown)

  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">无分解数据</p>
  }

  return (
    <div className="space-y-2">
      {entries.map(([key, { raw, weighted, maxRaw }]) => {
        const pct = maxRaw > 0 ? Math.min((raw / maxRaw) * 100, 100) : 0
        const label = FACTOR_LABELS[key] ?? key

        return (
          <div key={key} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-16 shrink-0 text-right">
              {label}
            </span>
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs font-medium w-10 text-right tabular-nums">
              {weighted.toFixed(1)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
