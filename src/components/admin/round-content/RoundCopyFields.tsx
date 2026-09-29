"use client"

import type { RoundContentConfig, RoundPurpose } from "@/types"
import { RoundTextField } from "./RoundTextField"
import { roundCopyDefaults } from "./round-text-defaults"

interface Props {
  config: RoundContentConfig
  locale: "zh" | "ja"
  purpose: RoundPurpose
  roundName: string
  onChange: (config: RoundContentConfig) => void
}

export function RoundCopyFields({ config, locale, purpose, roundName, onChange }: Props) {
  const defaults = roundCopyDefaults({ contentConfig: config, purpose, roundName }, locale)
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
      <p className="text-xs text-muted-foreground">输入框显示当前生效的文案，可直接修改或恢复默认。介绍、地点、费用和注意事项没有通用默认值，两种语言均未填写时不显示。</p>
      {locale === "ja" && <RoundTextField label="日文名称" value={{ zh: "", ja: config.titleJa }} locale={locale} maxLength={120}
        fallbackText={roundName} fallbackSource="沿用轮次名称" onChange={(value) => onChange({ ...config, titleJa: value.ja })} />}
      {fields.map(([key, label, maxLength, multiline]) => {
        const fallback = key === "cardTitle" || key === "cardDescription" || key === "cardCta" ? defaults[key] : undefined
        return <RoundTextField key={key} label={label} value={config[key]} locale={locale} maxLength={maxLength} multiline={multiline}
          fallbackText={fallback?.text} fallbackSource={fallback?.source} onChange={(value) => onChange({ ...config, [key]: value })} />
      })}
    </section>
  )
}
