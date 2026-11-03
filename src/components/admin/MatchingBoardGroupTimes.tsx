import type { BoardSubmissionPreference } from "@/lib/matching/board-types"
import { getBoardTimeOptions } from "@/lib/matching/board-time-options"
import { cn } from "@/lib/utils"

interface Props {
  memberIds: string[]
  prefs: Record<string, BoardSubmissionPreference>
  bestSlot: string | null
  label: string
  editable?: boolean
  onChange?: (slot: string) => void
}

/** Always derive alternatives from current members, never from a stale suggestion. */
export function MatchingBoardGroupTimes({ memberIds, prefs, bestSlot, label, editable, onChange }: Props) {
  const times = getBoardTimeOptions(memberIds, prefs, bestSlot)
  if (!times.complete) return <p className="mt-3 text-xs leading-relaxed text-amber-700">部分成员缺少有效可用时间，请先核对资料。</p>
  if (!times.commonSlots.length) return <p className="mt-3 text-xs leading-relaxed text-amber-700">当前成员没有全员共同时间，请调整成员后再确认或保存。</p>
  return <div className="mt-3 border-t border-border/60 pt-3">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <p className="text-[11px] text-muted-foreground">全员共同时间 · {times.commonSlots.length} 个</p>
      {onChange && <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">推荐安排
        <select aria-label={`修改${label}的推荐时间`} value={times.currentValid ? bestSlot ?? "" : ""} disabled={!editable} onChange={(event) => { if (event.target.value) onChange(event.target.value) }} className="max-w-full rounded-md border border-border bg-background px-2 py-1 text-xs">
          {!times.currentValid && <option value="">选择共同时间</option>}
          {times.commonSlots.map((slot) => <option key={slot} value={slot}>{slot.replaceAll("_", " ")}</option>)}
        </select>
      </label>}
    </div>
    <div className="flex flex-wrap gap-1.5" aria-label="本组全部共同时间">
      {times.orderedSlots.map((option) => <span key={option.slot} className={cn("inline-flex flex-wrap items-center gap-x-1 rounded-md px-2 py-1 text-[11px] leading-relaxed", option.current ? "bg-primary/10 font-medium text-primary" : "bg-muted/60 text-muted-foreground")}>
        {option.current && <span>推荐安排</span>}{option.slot.replaceAll("_", " ")}
      </span>)}
    </div>
    {!times.currentValid && <p className="mt-2 text-xs text-amber-700">原推荐时段已不适用，请重新选择共同时间或调整成员。</p>}
  </div>
}
