"use client"

import {
  COMMUNICATION_LANGUAGE_OPTIONS,
  JAPANESE_LEVEL_OPTIONS,
} from "@/lib/constants/supplementary"
import type { MemberLanguageRow } from "@/types/member-detail"

type LanguageData = Partial<MemberLanguageRow>
interface Props { data: LanguageData; onChange: (data: LanguageData) => void }

export function MemberEditLanguage({ data, onChange }: Props) {
  const prefs: string[] = data.communication_language_pref ?? []
  function toggleLang(lang: string) {
    const next = prefs.includes(lang) ? prefs.filter((l) => l !== lang) : [...prefs, lang]
    onChange({ ...data, communication_language_pref: next })
  }

  return (
    <table className="w-full"><tbody>
      <tr className="border-b border-border/50">
        <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap w-24 align-top">沟通语言</td>
        <td className="py-2.5">
          <div className="flex flex-wrap gap-1.5">
            {COMMUNICATION_LANGUAGE_OPTIONS.map((lang) => (
              <button key={lang} type="button" onClick={() => toggleLang(lang)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors border ${
                  prefs.includes(lang)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border hover:bg-muted"
                }`}>{lang}</button>
            ))}
          </div>
        </td>
      </tr>
      <tr className="border-b border-border/50">
        <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap w-24">日语水平</td>
        <td className="py-2.5">
          <select value={data.japanese_level ?? ""}
            onChange={(e) => onChange({ ...data, japanese_level: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary">
            <option value="">-</option>
            {JAPANESE_LEVEL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </td>
      </tr>
    </tbody></table>
  )
}
