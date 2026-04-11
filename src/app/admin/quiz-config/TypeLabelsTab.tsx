"use client"

import type { TypeLabelsConfig } from "@/types/quiz-config"

const KEYS = ["E", "A", "O", "C", "ES"] as const

interface Props {
  typeLabels: TypeLabelsConfig
  onChange: (labels: TypeLabelsConfig) => void
}

export function TypeLabelsTab({ typeLabels, onChange }: Props) {
  const update = (style: "formal" | "fun", role: "prefix" | "suffix", key: string, value: string) => {
    onChange({
      ...typeLabels,
      [style]: {
        ...typeLabels[style],
        [role]: { ...typeLabels[style][role], [key]: value },
      },
    })
  }

  // 生成预览示例
  const preview = (style: "formal" | "fun") => {
    const { prefix, suffix } = typeLabels[style]
    const examples = [
      ["E", "A"], ["O", "E"], ["C", "ES"], ["A", "O"],
    ]
    return examples.map(([p, s]) => `${prefix[p] ?? "?"}${suffix[s] ?? "?"}`).join("、")
  }

  return (
    <div className="space-y-6">
      {(["formal", "fun"] as const).map((style) => (
        <div key={style} className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{style === "formal" ? "正式命名" : "趣味命名"}</p>
            <span className="text-xs text-muted-foreground">
              预览：{preview(style)}
            </span>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left py-1 w-16">维度</th>
                <th className="text-left py-1">前缀（最高维度）</th>
                <th className="text-left py-1">后缀（次高维度）</th>
              </tr>
            </thead>
            <tbody>
              {KEYS.map((key) => (
                <tr key={key}>
                  <td className="py-1.5 font-medium">{key}</td>
                  <td className="py-1.5 pr-2">
                    <input
                      value={typeLabels[style].prefix[key] ?? ""}
                      onChange={(e) => update(style, "prefix", key, e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="py-1.5">
                    <input
                      value={typeLabels[style].suffix[key] ?? ""}
                      onChange={(e) => update(style, "suffix", key, e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <p className="text-xs text-muted-foreground">
        类型生成规则：取得分最高的维度作为前缀，次高维度作为后缀。N维度在生成类型时转换为ES（情绪稳定性=100-N）。
      </p>
    </div>
  )
}
