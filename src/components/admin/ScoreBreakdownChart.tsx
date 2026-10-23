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
  activity_feedback: "活动互评",
  history_adjustment: "旧历史调整",
}

interface ScoreItem {
  factor: string
  label?: string
  rawScore: number
  weightedScore: number
  weight: number
}

interface Props {
  // Historical object/array rows and versioned multi-pool summaries coexist.
  breakdown: unknown
}

export function ScoreBreakdownChart({ breakdown }: Props) {
  const items: { key: string; label: string; raw: number; weighted: number; maxWeight: number }[] = []
  const object = breakdown && typeof breakdown === "object" && !Array.isArray(breakdown) ? breakdown as Record<string, unknown> : null
  const pool = object?.kind === "multi_pool" && object.version === "weighted_feedback:1" ? object : null
  const factors = pool ? pool.factors : breakdown

  if (Array.isArray(factors)) {
    for (const value of factors) {
      if (!value || typeof value !== "object") continue
      const item = value as ScoreItem
      if (typeof item.factor !== "string" || ![item.rawScore, item.weightedScore, item.weight].every(Number.isFinite)) continue
      if (item.weight === 0 && !(item.factor === "history_adjustment" && item.weightedScore !== 0)) continue
      items.push({
        key: item.factor,
        label: FACTOR_LABELS[item.factor] ?? item.label ?? `未识别的评分因素（${item.factor}）`,
        raw: item.rawScore,
        weighted: item.weightedScore,
        maxWeight: item.weight,
      })
    }
  } else if (object && !pool) {
    for (const [key, value] of Object.entries(object)) {
      if (!value || typeof value !== "object") continue
      const val = value as { raw: number; weighted: number; maxRaw: number }
      if (![val.raw, val.weighted, val.maxRaw].every(Number.isFinite)) continue
      items.push({
        key,
        label: FACTOR_LABELS[key] ?? `未识别的评分因素（${key}）`,
        raw: val.raw,
        weighted: val.weighted,
        maxWeight: val.maxRaw,
      })
    }
  }

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">无分解数据</p>
  }

  const currentPolicy = Boolean(pool) || items.some((item) => item.key === "activity_feedback")
  const base = items.filter((item) => item.key !== "history_adjustment").reduce((sum, item) => sum + item.weighted, 0)
  const history = items.find((item) => item.key === "history_adjustment")?.weighted ?? 0
  const minimumMemberAverage = pool && typeof pool.minimumMemberAverage === "number" && Number.isFinite(pool.minimumMemberAverage) ? pool.minimumMemberAverage : null
  const pairCount = pool && typeof pool.pairCount === "number" ? pool.pairCount : null
  const feedbackPairCount = pool && typeof pool.feedbackPairCount === "number" ? pool.feedbackPairCount : null

  return (
    <div className="space-y-2">
      {currentPolicy && <p className="text-xs text-muted-foreground">基础分 {base.toFixed(1)} / 100{pool ? "（整池两两平均）" : ` · 旧历史调整 ${history >= 0 ? "+" : ""}${history.toFixed(1)} · 最终 ${(base + history).toFixed(1)}`}</p>}
      {pool && <p className="text-xs text-muted-foreground">{pairCount !== null ? `${pairCount} 对成员关系` : "成员关系平均"}{feedbackPairCount !== null ? `，其中 ${feedbackPairCount} 对有活动互评` : ""}{minimumMemberAverage !== null ? `；最低成员平均分 ${minimumMemberAverage.toFixed(1)}` : ""}。多人池保持原规则，不额外加减重逢或普通重复分。</p>}
      {items.map(({ key, label, raw, weighted, maxWeight }) => {
        const pct = Math.max(0, Math.min(raw * 100, 100))
        return (
          <div key={key} className="flex items-center gap-2" title={key === "history_adjustment" ? "旧重逢及普通重复规则的额外调整，不计入100分基础权重" : `该项权重 ${maxWeight} 分`}>
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
              {key === "history_adjustment" && weighted > 0 ? "+" : ""}{weighted.toFixed(1)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
