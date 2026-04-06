"use client"

import { PERSONALITY_DIMENSIONS } from "@/lib/constants/personality"

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
  data: any
  onChange: (data: any) => void
}

export function MemberEditPersonality({ data, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {PERSONALITY_DIMENSIONS.map((dim) => {
          const val = data[dim.key]

          if (dim.type === "slider") {
            const score = typeof val === "number" ? val : 3
            return (
              <div key={dim.key} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{dim.label}</span>
                  <span className="font-medium">{score}/5</span>
                </div>
                <input
                  type="range" min={1} max={5} step={1} value={score}
                  onChange={(e) => onChange({ ...data, [dim.key]: Number(e.target.value) })}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{dim.sliderLabels?.[0]}</span>
                  <span>{dim.sliderLabels?.[1]}</span>
                </div>
              </div>
            )
          }

          if (dim.type === "multi" && dim.options) {
            const selected: string[] = Array.isArray(val) ? val : []
            function toggle(tag: string) {
              const next = selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]
              onChange({ ...data, [dim.key]: next })
            }
            return (
              <div key={dim.key}>
                <label className="text-xs text-muted-foreground mb-2 block">{dim.label}</label>
                <div className="flex flex-wrap gap-1.5">
                  {dim.options.map((o) => (
                    <button key={o} type="button" onClick={() => toggle(o)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                        selected.includes(o)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground border-border hover:bg-muted"
                      }`}
                    >{o}</button>
                  ))}
                </div>
              </div>
            )
          }

          if (dim.type === "single" && dim.options) {
            return (
              <div key={dim.key}>
                <label className="text-xs text-muted-foreground">{dim.label}</label>
                <select
                  value={val ?? ""}
                  onChange={(e) => onChange({ ...data, [dim.key]: e.target.value })}
                  className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">-</option>
                  {dim.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            )
          }

          return null
        })}
      </div>
    </div>
  )
}
