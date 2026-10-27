import type { ReactNode } from "react"
import { CalendarDays, Check, LockKeyhole, LockKeyholeOpen, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { BoardMulti } from "@/lib/matching/board-types"
import type { BoardGroupTimeCandidates } from "@/lib/matching/board-group-time-options"

const formatSlot = (slot: string | null) => slot?.replaceAll("_", " ") ?? "待选择时间"

interface Props {
  groups: BoardMulti[]
  candidates: BoardGroupTimeCandidates
  canViewTimes: boolean
  editable: boolean
  poolLocked: boolean
  over: string | null
  excluded: Record<string, string[]>
  visible: (ids: string[]) => boolean
  name: (id: string) => string
  chip: (id: string, instance: string, candidate?: boolean) => ReactNode
  onToggle: (slot: string, id: string, included: boolean) => void
  onConfirm: (slot: string, ids: string[]) => void
  locked: (group: BoardMulti) => boolean
  lockDisabled: boolean
  onLock: (group: BoardMulti, locked: boolean) => void
}

/** Candidate cards can repeat a person; only confirmed groups are assignments. */
export function MatchingBoardGroups(props: Props) {
  const { groups, candidates, canViewTimes, editable, poolLocked, over, excluded, visible, name, chip, onToggle, onConfirm, locked, lockDisabled, onLock } = props
  return <div className="@container border-t bg-muted/15">
    <div className="space-y-1 px-4 pt-4 pb-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="size-4 text-sky-700" />按时间分组</h3>
      <p className="text-xs leading-relaxed text-muted-foreground">每组至少 3 人。确认后，成员移出上方人员池与其他候选时段；长按姓名可调整小组。</p>
    </div>
    <div data-board-scroll className="max-h-[min(75vh,760px)] space-y-4 overflow-y-auto px-4 pb-4">
      {groups.length > 0 && <div className="space-y-2" aria-label="已确认的多人小组">
        <p className="text-xs font-medium text-muted-foreground">已确认小组 · {groups.length}</p>
        {groups.map((group, index) => visible(group.memberIds) && <div key={group.key} data-board-group-key={group.key} className={cn("rounded-xl border bg-background p-3 shadow-xs @lg:grid @lg:grid-cols-[8.5rem_minmax(0,1fr)] @lg:gap-3", over === `group:${group.key}` ? "border-primary ring-2 ring-primary/20" : "border-primary/20")}>
          <div className="mb-3 flex items-start justify-between gap-2 @lg:mb-0 @lg:flex-col @lg:justify-start">
            <div><p className="flex items-center gap-1.5 text-sm font-semibold"><span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[11px] text-primary">{index + 1}</span>{formatSlot(group.bestSlot)}</p><p className={cn("mt-1 text-xs", group.memberIds.length < 3 ? "text-amber-700" : "text-muted-foreground")}>{group.memberIds.length} 人{group.memberIds.length < 3 ? " · 请补足 3 人后保存" : group.resultId ? " · 已保存" : " · 待保存"}{locked(group) && " · 已锁定"}</p></div>
            {group.resultId && <Button size="icon-sm" variant="ghost" disabled={lockDisabled} aria-label={`${locked(group) ? "解锁" : "锁定"}第 ${index + 1} 个多人小组`} aria-pressed={locked(group)} title="保存当前调整后可锁定或解锁小组，无需填写理由" onClick={() => onLock(group, locked(group))}>{locked(group) ? <LockKeyhole className="size-3.5" /> : <LockKeyholeOpen className="size-3.5 text-muted-foreground" />}</Button>}
          </div>
          <div className="flex flex-wrap gap-2">{group.memberIds.map((id) => chip(id, `group:${group.key}`))}</div>
        </div>)}
      </div>}
      {canViewTimes ? <div className="space-y-2" aria-label="候选共同时间段">
        <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-muted-foreground">候选时段 · 最多 5 个</p><span className="text-[11px] text-muted-foreground">按可参加人数排序</span></div>
        {!candidates.complete ? <p className="rounded-lg border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">部分待分组成员缺少有效可用时间，请先核对资料。</p>
          : candidates.candidates.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-center text-xs leading-relaxed text-muted-foreground">暂无至少 3 人共同可用的候选时段。</p>
            : candidates.candidates.map((option) => {
              const selected = option.memberIds.filter((id) => !(excluded[option.slot] ?? []).includes(id))
              return visible(option.memberIds) && <div key={option.slot} data-board-time-slot={option.slot} className={cn("rounded-xl border bg-background p-3 @lg:grid @lg:grid-cols-[8.5rem_minmax(0,1fr)] @lg:gap-3", over === `time:${option.slot}` && "border-primary ring-2 ring-primary/20")}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 @lg:mb-0 @lg:flex-col @lg:items-start @lg:justify-start">
                  <div><p className="text-sm font-medium"><span className="mr-2 text-xs text-muted-foreground">{option.rank.toString().padStart(2, "0")}</span>{formatSlot(option.slot)}</p><p className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1 whitespace-nowrap"><Users className="size-3" />{option.count} 人可参加</span>{editable && <span className="whitespace-nowrap">· 已选 {selected.length} 人</span>}</p></div>
                  {editable && <Button size="sm" variant="outline" className="h-8 text-xs" aria-label={`确认 ${formatSlot(option.slot)}分组`} disabled={poolLocked || selected.length < 3} onClick={() => onConfirm(option.slot, selected)}><Check className="size-3" />确认分组</Button>}
                </div>
                <div className="flex flex-wrap gap-2">{option.memberIds.map((id) => <div key={id} className={cn("flex items-center gap-1", !selected.includes(id) && "opacity-50")}>
                  {editable && <input data-candidate-member={id} type="checkbox" aria-label={`将 ${name(id)}加入${formatSlot(option.slot)}小组`} checked={selected.includes(id)} disabled={poolLocked} onChange={(event) => onToggle(option.slot, id, event.target.checked)} className="size-3.5 shrink-0 accent-primary" />}
                  {chip(id, `candidate:${option.slot}`, true)}
                </div>)}</div>
              </div>
            })}
        {poolLocked && <p className="text-xs text-muted-foreground">多人池已锁定，请先解锁再分组。</p>}
      </div> : <p className="text-xs leading-relaxed text-muted-foreground">候选时段需要查看报名资料的权限，已有小组仍可查看。</p>}
    </div>
  </div>
}
