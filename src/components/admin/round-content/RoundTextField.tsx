"use client"

import { useId, useState } from "react"
import type { RoundText } from "@/types"
import { resolveRoundEditorText } from "./round-text-defaults"

interface Props {
  label: string
  value: RoundText
  locale: "zh" | "ja"
  onChange: (value: RoundText) => void
  multiline?: boolean
  maxLength?: number
  disabled?: boolean
  fallbackText?: string
  fallbackSource?: string
  inheritOtherLocale?: boolean
  placeholder?: string
}

export function RoundTextField({ label, value, locale, onChange, multiline, maxLength = 200, disabled,
  fallbackText = "", fallbackSource = "系统默认", inheritOtherLocale = true, placeholder }: Props) {
  const id = useId()
  const [editing, setEditing] = useState<{ locale: "zh" | "ja"; text: string } | null>(null)
  const resolved = resolveRoundEditorText(value, locale, fallbackText, fallbackSource, inheritOtherLocale)
  const inherited = resolveRoundEditorText({ ...value, [locale]: "" }, locale, fallbackText, fallbackSource, inheritOtherLocale)
  const resetLabel = fallbackText ? "恢复默认" : inherited.source
  const props = {
    id,
    value: editing?.locale === locale ? editing.text : resolved.text,
    onFocus: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => setEditing({ locale, text: event.target.value }),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setEditing({ locale, text: event.target.value })
      onChange({ ...value, [locale]: event.target.value })
    },
    onBlur: () => setEditing(null),
    maxLength,
    disabled,
    placeholder: placeholder ?? `请输入${label}${locale === "ja" ? "（日文）" : ""}`,
    "aria-describedby": resolved.source ? `${id}-source` : undefined,
    className: "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60",
  }
  return <div className="space-y-1">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {inherited.text && <button type="button" disabled={disabled || !value[locale].trim()} aria-label={`${label}：${resetLabel}`}
        className="rounded px-2 py-1 text-xs text-primary hover:bg-muted disabled:opacity-40"
        onClick={() => { setEditing(null); onChange({ ...value, [locale]: "" }) }}>{resetLabel}</button>}
    </div>
    {multiline ? <textarea {...props} rows={3} /> : <input {...props} />}
    {resolved.source && <p id={`${id}-source`} className="text-xs text-muted-foreground">{resolved.source}</p>}
  </div>
}
