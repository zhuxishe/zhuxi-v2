"use client"

import type { RoundText } from "@/types"

interface Props {
  label: string
  value: RoundText
  locale: "zh" | "ja"
  onChange: (value: RoundText) => void
  multiline?: boolean
  maxLength?: number
  disabled?: boolean
}

export function RoundTextField({ label, value, locale, onChange, multiline, maxLength = 200, disabled }: Props) {
  const props = {
    value: value[locale],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, [locale]: event.target.value }),
    maxLength,
    disabled,
    placeholder: locale === "ja" ? "留空时使用中文或默认内容" : "留空时使用默认内容",
    className: "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60",
  }
  return <label className="block text-sm font-medium">{label}{multiline ? <textarea {...props} rows={3} /> : <input {...props} />}</label>
}
