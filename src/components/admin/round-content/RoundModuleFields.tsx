"use client"

import type { RoundContentConfig } from "@/types"
import { RoundTextField } from "./RoundTextField"
import { roundLabelDefaults } from "./round-text-defaults"

interface Props {
  config: RoundContentConfig
  locale: "zh" | "ja"
  locked: boolean
  onChange: (config: RoundContentConfig) => void
}

export function RoundModuleFields({ config, locale, locked, onChange }: Props) {
  const defaults = roundLabelDefaults("matching", locale)
  const modules = [["interests", "兴趣题材"], ["social", "社交风格"], ["message", "工作人员留言"]] as const
  const labels = [["gameType", "游戏类型标题"], ["genderPref", "搭档性别标题"], ["availability", "可用时间标题"], ["interestTags", "兴趣题材标题"], ["socialStyle", "社交风格标题"], ["message", "留言标题"], ["submit", "提交按钮文字"]] as const
  return <section className="space-y-4 rounded-xl border bg-card p-5">
    <h2 className="font-semibold">匹配问卷模块</h2>
    <p className="text-xs text-muted-foreground">可用时间与核心匹配偏好始终保留。标题可以自定义，选项含义沿用现有匹配规则。</p>
    <fieldset disabled={locked} className="flex flex-wrap gap-4 disabled:opacity-60">
      {modules.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.modules[key]} onChange={(event) => onChange({ ...config, modules: { ...config.modules, [key]: event.target.checked } })} />{label}</label>)}
    </fieldset>
    {labels.map(([key, label]) => <RoundTextField key={key} label={label} value={config.labels[key] ?? { zh: "", ja: "" }} locale={locale}
      fallbackText={defaults[key]} onChange={(value) => onChange({ ...config, labels: { ...config.labels, [key]: value } })} />)}
  </section>
}
