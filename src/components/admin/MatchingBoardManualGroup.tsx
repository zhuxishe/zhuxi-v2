"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { getBoardTimeOptions } from "@/lib/matching/board-time-options"
import type { BoardSubmissionPreference } from "@/lib/matching/board-types"
import { cn } from "@/lib/utils"

export interface ManualGroupMember { id: string; name: string; source: "multi" | "unmatched"; gender?: string; disabledReason?: string }
interface Props {
  groupKind: "small" | "time"
  members: ManualGroupMember[]
  prefs: Record<string, BoardSubmissionPreference>
  disabled: boolean
  error?: string
  onClose: () => void
  onConfirm: (slot: string, ids: string[]) => void
}

/** Selection has no board side effects until the server validates the whole group. */
export function MatchingBoardManualGroup({ groupKind, members, prefs, disabled, error, onClose, onConfirm }: Props) {
  const [selected, setSelected] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [chosenSlot, setChosenSlot] = useState("")
  const allowed = useMemo(() => new Set(members.filter((member) => !member.disabledReason).map((member) => member.id)), [members])
  const ids = selected.filter((id) => allowed.has(id))
  const times = getBoardTimeOptions(ids, prefs, null)
  const slot = times.commonSlots.includes(chosenSlot) ? chosenSlot : times.commonSlots[0] ?? ""
  const canConfirm = !disabled && ids.length >= 3 && times.complete && !!slot
  const outsideRecommended = groupKind === "small" && ids.length >= 3 && (ids.length < 4 || ids.length > 6)
  const visibleMembers = members.filter((member) => member.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <Dialog open onOpenChange={(open) => { if (!open && !disabled) onClose() }}>
    <DialogContent className="max-h-[min(88vh,900px)] overflow-y-auto sm:max-w-xl" showCloseButton={!disabled}>
      <DialogTitle>手动新增{groupKind === "small" ? "4–6人小组" : "时间分组"}</DialogTitle>
      <DialogDescription>先选成员，再选全组共同时间。确认后加入编辑草稿，点击「保存调整」后生效。</DialogDescription>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">选择成员 <span className="font-normal text-muted-foreground">已选 {ids.length} 人</span></p><span className="text-xs text-muted-foreground">多人候选池与未匹配池</span></div>
        <div className="relative"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><input aria-label="搜索手动分组成员" value={query} onChange={(event) => setQuery(event.target.value)} disabled={disabled} placeholder="搜索姓名" className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm" /></div>
        <div className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-border p-2" aria-label="可选的手动分组成员">
          {visibleMembers.map((member) => <label key={member.id} className={cn("flex items-center gap-2 rounded-md px-2 py-2 text-sm", member.disabledReason ? "text-muted-foreground opacity-60" : "cursor-pointer hover:bg-muted/60")}>
            <input type="checkbox" aria-label={`手动分组选择 ${member.name}`} checked={ids.includes(member.id)} disabled={disabled || !!member.disabledReason} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, member.id])] : current.filter((id) => id !== member.id))} className="size-3.5 accent-primary" />
            <span className={cn("rounded-md px-2 py-1", member.gender === "female" ? "bg-pink-50" : member.gender === "male" ? "bg-sky-50" : "bg-slate-100")}>{member.name}</span>
            <span className="ml-auto text-[11px] text-muted-foreground">{member.disabledReason || (member.source === "multi" ? "多人候选" : "未匹配")}</span>
          </label>)}
          {!visibleMembers.length && <p className="p-4 text-center text-xs text-muted-foreground">{members.length ? "没有符合搜索的成员。" : "暂无可选成员。已有搭档或小组的成员，请先移出原分组。"}</p>}
        </div>
        {outsideRecommended && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">当前 {ids.length} 人，超出系统推荐的4–6人范围；人工分组可以确认，共同时间和匹配条件仍需满足。</p>}
        <div className="space-y-2 rounded-lg border border-border bg-muted/15 p-3">
          <p className="text-sm font-medium">选择推荐安排 <span className="font-normal text-muted-foreground">日本时间</span></p>
          {ids.length < 3 ? <p className="text-xs text-muted-foreground">请选择至少3名成员，再查看共同时间。</p>
            : !times.complete ? <p className="text-xs text-amber-700">部分成员缺少有效可用时间，请先核对报名资料。</p>
              : !times.commonSlots.length ? <p role="status" className="text-xs text-amber-700">这些成员没有全员共同时间，请调整成员。</p>
                : <><select aria-label="手动分组推荐时间" value={slot} disabled={disabled} onChange={(event) => setChosenSlot(event.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">{times.commonSlots.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select><p className="text-xs leading-relaxed text-muted-foreground">共 {times.commonSlots.length} 个全员共同时间，以上选项已全部列出。</p></>}
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-800">{error}</p>}
      </div>
      <DialogFooter><Button variant="outline" disabled={disabled} onClick={onClose}>取消</Button><Button disabled={!canConfirm} onClick={() => onConfirm(slot, ids)}>{disabled ? "正在核验…" : "确认新小组"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
