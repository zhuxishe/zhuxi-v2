"use client"

import type { TypeDescription } from "@/types/quiz-config"

// 20种类型组合
const ALL_TYPES = [
  "热情守护者", "热情探索者", "热情规划者", "热情安定者",
  "温暖行动派", "温暖探索者", "温暖规划者", "温暖安定者",
  "好奇行动派", "好奇守护者", "好奇规划者", "好奇安定者",
  "稳健行动派", "稳健守护者", "稳健探索者", "稳健安定者",
  "从容行动派", "从容守护者", "从容探索者", "从容规划者",
]

interface Props {
  typeDescriptions: Record<string, TypeDescription>
  onChange: (descs: Record<string, TypeDescription>) => void
}

export function TypeDescriptionsTab({ typeDescriptions, onChange }: Props) {
  const update = (typeName: string, field: keyof TypeDescription, value: string) => {
    const existing = typeDescriptions[typeName] ?? { description: "" }
    onChange({ ...typeDescriptions, [typeName]: { ...existing, [field]: value } })
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        每种类型的结果描述（80-150字幽默解读）和配图URL。配图留空则不显示。
      </p>
      {ALL_TYPES.map((typeName) => {
        const desc = typeDescriptions[typeName]
        return (
          <div key={typeName} className="rounded-lg border border-border bg-card p-4 space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">{typeName}</span>
              <input
                value={desc?.imageUrl ?? ""}
                onChange={(e) => update(typeName, "imageUrl", e.target.value)}
                placeholder="配图URL（可选）"
                className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs text-muted-foreground"
              />
            </div>
            <textarea
              value={desc?.description ?? ""}
              onChange={(e) => update(typeName, "description", e.target.value)}
              rows={3}
              placeholder="类型描述（80-150字幽默解读）"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <div className="text-right text-[10px] text-muted-foreground">
              {(desc?.description ?? "").length} 字
            </div>
          </div>
        )
      })}
    </div>
  )
}
