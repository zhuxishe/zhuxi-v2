"use client"

import type { Dimension, DimensionConfig, ScoringConfig } from "@/types/quiz-config"

const DIMS: Dimension[] = ["E", "A", "O", "C", "N"]

interface Props {
  dimensions: Record<Dimension, DimensionConfig>
  scoring: ScoringConfig
  onChange: (dimensions: Record<Dimension, DimensionConfig>, scoring: ScoringConfig) => void
}

export function DimensionsTab({ dimensions, scoring, onChange }: Props) {
  const updateDim = (dim: Dimension, patch: Partial<DimensionConfig>) => {
    onChange({ ...dimensions, [dim]: { ...dimensions[dim], ...patch } }, scoring)
  }

  const updateDesc = (dim: Dimension, level: "low" | "mid" | "high", value: string) => {
    updateDim(dim, { descriptions: { ...dimensions[dim].descriptions, [level]: value } })
  }

  return (
    <div className="space-y-6">
      {/* 维度列表 */}
      {DIMS.map((dim) => {
        const d = dimensions[dim]
        return (
          <div key={dim} className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold w-6">{dim}</span>
              <input
                value={d.name}
                onChange={(e) => updateDim(dim, { name: e.target.value })}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm w-32"
                placeholder="维度名称"
              />
              <label className="text-xs text-muted-foreground ml-auto">匹配权重</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={d.matchWeight}
                onChange={(e) => updateDim(dim, { matchWeight: Number(e.target.value) })}
                className="w-20 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-center"
              />
            </div>
            {/* 解读文案 */}
            <div className="grid grid-cols-3 gap-2">
              {(["low", "mid", "high"] as const).map((level) => (
                <div key={level}>
                  <label className="text-xs text-muted-foreground">
                    {level === "low" ? "低分(0-33)" : level === "mid" ? "中分(34-66)" : "高分(67-100)"}
                  </label>
                  <textarea
                    value={d.descriptions[level]}
                    onChange={(e) => updateDesc(dim, level, e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* 计分设置 */}
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-semibold mb-3">计分公式参数</p>
        <div className="flex items-center gap-6">
          <div>
            <label className="text-xs text-muted-foreground">最低原始分</label>
            <input
              type="number"
              step="0.5"
              value={scoring.minRaw}
              onChange={(e) => onChange(dimensions, { ...scoring, minRaw: Number(e.target.value) })}
              className="mt-1 block w-20 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-center"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">最高原始分</label>
            <input
              type="number"
              step="0.5"
              value={scoring.maxRaw}
              onChange={(e) => onChange(dimensions, { ...scoring, maxRaw: Number(e.target.value) })}
              className="mt-1 block w-20 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-center"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={scoring.invertN}
              onChange={(e) => onChange(dimensions, { ...scoring, invertN: e.target.checked })}
              className="rounded border-input"
            />
            N→ES 反转
          </label>
          <span className="text-xs text-muted-foreground">
            公式: (原始分 - {scoring.minRaw}) / ({scoring.maxRaw} - {scoring.minRaw}) × 100
          </span>
        </div>
      </div>
    </div>
  )
}
