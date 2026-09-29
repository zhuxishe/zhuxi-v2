"use client"

import type { RoundContentConfig } from "@/types"
import { RoundTextField } from "./RoundTextField"

interface Props {
  config: RoundContentConfig
  locale: "zh" | "ja"
  onChange: (config: RoundContentConfig) => void
}

export function RoundCopyFields({ config, locale, onChange }: Props) {
  const fields = [
    ["cardTitle", "首页卡片标题", 120, false],
    ["cardDescription", "首页卡片说明", 500, true],
    ["cardCta", "首页按钮文字", 40, false],
    ["introduction", "活动／本期介绍", 5000, true],
    ["location", "地点", 500, false],
    ["fee", "费用", 300, false],
    ["notice", "注意事项", 3000, true],
  ] as const
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <h2 className="font-semibold">首页文案与活动详情</h2>
      <p className="text-xs text-muted-foreground">留空的卡片文案沿用默认内容；介绍、地点、费用和注意事项留空则不显示。</p>
      {locale === "ja" && <label className="block text-sm font-medium">日文名称
        <input value={config.titleJa} onChange={(event) => onChange({ ...config, titleJa: event.target.value })} maxLength={120} placeholder="留空时使用轮次名称" className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" />
      </label>}
      {fields.map(([key, label, maxLength, multiline]) => <RoundTextField key={key} label={label} value={config[key]} locale={locale} maxLength={maxLength} multiline={multiline} onChange={(value) => onChange({ ...config, [key]: value })} />)}
    </section>
  )
}
