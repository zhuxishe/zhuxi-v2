"use client"

import { PERSONALITY_DIMENSIONS } from "@/lib/constants/personality"
import type { MemberPersonalityRow } from "@/types/member-detail"

type PersonalityData = Partial<MemberPersonalityRow>
interface Props { data: PersonalityData; onChange: (data: PersonalityData) => void }

export function MemberEditPersonality({ data, onChange }: Props) {
  return (
    <table className="w-full"><tbody>
      {PERSONALITY_DIMENSIONS.map((dim) => {
        const val = data[dim.key]

        if (dim.type === "slider") {
          const score = typeof val === "number" ? val : 3
          return (
            <tr key={dim.key} className="border-b border-border/50">
              <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap w-24">{dim.label}</td>
              <td className="py-2.5">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-muted-foreground shrink-0">{dim.sliderLabels?.[0]}</span>
                  <input type="range" min={1} max={5} step={1} value={score}
                    onChange={(e) => onChange({ ...data, [dim.key]: Number(e.target.value) })}
                    className="flex-1 accent-primary" />
                  <span className="text-[10px] text-muted-foreground shrink-0">{dim.sliderLabels?.[1]}</span>
                  <span className="text-xs font-medium w-4 text-right">{score}</span>
                </div>
              </td>
            </tr>
          )
        }

        if (dim.type === "multi" && dim.options) {
          const selected: string[] = Array.isArray(val) ? val : []
          function toggle(tag: string) {
            const next = selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]
            onChange({ ...data, [dim.key]: next })
          }
          return (
            <tr key={dim.key} className="border-b border-border/50">
              <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap w-24 align-top">{dim.label}</td>
              <td className="py-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {dim.options.map((o) => (
                    <button key={o} type="button" onClick={() => toggle(o)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors border ${
                        selected.includes(o) ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground border-border hover:bg-muted"
                      }`}>{o}</button>
                  ))}
                </div>
              </td>
            </tr>
          )
        }

        if (dim.type === "single" && dim.options) {
          return (
            <tr key={dim.key} className="border-b border-border/50">
              <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap w-24">{dim.label}</td>
              <td className="py-2.5">
                <select value={val ?? ""}
                  onChange={(e) => onChange({ ...data, [dim.key]: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary">
                  <option value="">-</option>
                  {dim.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </td>
            </tr>
          )
        }
        return null
      })}
    </tbody></table>
  )
}
