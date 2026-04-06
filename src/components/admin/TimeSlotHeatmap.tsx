"use client"

import { useMemo } from "react"
import { Clock } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  candidates: Array<{ preferred_time_slots: string[] }>
}

function heatColor(count: number): string {
  if (count === 0) return "bg-muted text-muted-foreground"
  if (count <= 2) return "bg-green-100 text-green-800"
  if (count <= 5) return "bg-green-300 text-green-900"
  return "bg-green-500 text-white"
}

export function TimeSlotHeatmap({ candidates }: Props) {
  const slotCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of candidates) {
      if (!c.preferred_time_slots) continue
      for (const slot of c.preferred_time_slots) {
        counts.set(slot, (counts.get(slot) ?? 0) + 1)
      }
    }
    // Sort by count descending
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
  }, [candidates])

  if (slotCounts.length === 0) {
    return <p className="text-xs text-muted-foreground">无时间段数据</p>
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="size-3.5" />
        <span>时间段可用人数</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {slotCounts.map(([slot, count]) => (
          <div
            key={slot}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium",
              "transition-colors",
              heatColor(count)
            )}
          >
            <span>{slot}</span>
            <span className="font-bold tabular-nums">{count}</span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1">
        <span className="flex items-center gap-1">
          <span className="inline-block size-2.5 rounded bg-muted" /> 0
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2.5 rounded bg-green-100" /> 1-2
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2.5 rounded bg-green-300" /> 3-5
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2.5 rounded bg-green-500" /> 6+
        </span>
      </div>
    </div>
  )
}
