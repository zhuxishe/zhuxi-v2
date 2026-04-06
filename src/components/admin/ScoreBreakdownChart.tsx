"use client"

const FACTOR_LABELS: Record<string, string> = {
  interest_overlap: "兴趣重合",
  social_complement: "社交互补",
  school_diversity: "学校多样",
  compatibility_score: "合拍分",
  repeat_penalty: "重复配对",
  gameMode_match: "游戏偏好",
  level_proximity: "经验等级",
  personality_compatibility: "人格兼容",
}

interface ScoreItem {
  factor: string
  label?: string
  rawScore: number
  weightedScore: number
  weight: number
}

interface Props {
  // Accept both array (from scorer) and object (legacy) formats
  breakdown: ScoreItem[] | Record<string, { raw: number; weighted: number; maxRaw: number }>
}

export function ScoreBreakdownChart({ breakdown }: Props) {
  // Normalize to array format
  const items: { key: string; label: string; raw: number; weighted: number; maxWeight: number }[] = []

  if (Array.isArray(breakdown)) {
    for (const item of breakdown) {
      if (item.weight === 0) continue // Skip zero-weight factors
      items.push({
        key: item.factor,
        label: FACTOR_LABELS[item.factor] ?? item.label ?? item.factor,
        raw: item.rawScore,
        weighted: item.weightedScore,
        maxWeight: item.weight,
      })
    }
  } else {
    for (const [key, val] of Object.entries(breakdown)) {
      items.push({
        key,
        label: FACTOR_LABELS[key] ?? key,
        raw: val.raw,
        weighted: val.weighted,
        maxWeight: val.maxRaw,
      })
    }
  }

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">无分解数据</p>
  }

  return (
    <div className="space-y-2">
      {items.map(({ key, label, raw, weighted, maxWeight }) => {
        const pct = Math.min(raw * 100, 100)
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
