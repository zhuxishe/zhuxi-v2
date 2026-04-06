"use client"

import {
  COMMUNICATION_LANGUAGE_OPTIONS,
  JAPANESE_LEVEL_OPTIONS,
} from "@/lib/constants/supplementary"

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
  data: any
  onChange: (data: any) => void
}

export function MemberEditLanguage({ data, onChange }: Props) {
  const prefs: string[] = data.communication_language_pref ?? []

  function toggleLang(lang: string) {
    const next = prefs.includes(lang) ? prefs.filter((l) => l !== lang) : [...prefs, lang]
    onChange({ ...data, communication_language_pref: next })
  }

  return (
    <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
      <h3 className="text-sm font-semibold">语言偏好</h3>

      <div>
        <label className="text-xs text-muted-foreground mb-2 block">沟通语言</label>
        <div className="flex flex-wrap gap-2">
          {COMMUNICATION_LANGUAGE_OPTIONS.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => toggleLang(lang)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors border ${
                prefs.includes(lang)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:bg-muted"
              }`}
            >
              {lang}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">日语水平</label>
        <select
          value={data.japanese_level ?? ""}
          onChange={(e) => onChange({ ...data, japanese_level: e.target.value })}
          className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">-</option>
          {JAPANESE_LEVEL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    </div>
  )
}
