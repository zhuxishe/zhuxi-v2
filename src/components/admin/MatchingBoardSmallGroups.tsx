import type { ReactNode } from "react"
import { Check, LockKeyhole, LockKeyholeOpen, RefreshCw, UsersRound, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { BoardMulti, BoardSmallGroupRecommendation, BoardSubmissionPreference } from "@/lib/matching/board-types"
import { getBoardTimeOptions, type BoardTimeOptions } from "@/lib/matching/board-time-options"

const formatSlot = (slot: string) => slot.replaceAll("_", " ")
const validSize = (size: number) => size >= 4 && size <= 6

export interface MatchingBoardSmallGroupsProps {
  groups: BoardMulti[]
  recommendations: BoardSmallGroupRecommendation[]
  prefs: Record<string, BoardSubmissionPreference>
  canViewTimes: boolean
  canRecommend: boolean
  editable: boolean
  poolLocked: boolean
  loading: boolean
  loaded: boolean
  recommendationError?: string
  waitingCount: number
  over: string | null
  visible: (ids: string[]) => boolean
  name: (id: string) => string
  chip: (id: string, instance: string, candidate?: boolean) => ReactNode
  onRefresh: () => void
  onConfirm: (group: BoardSmallGroupRecommendation) => void
  onRemoveMember: (key: string, id: string) => void
  locked: (group: BoardMulti) => boolean
  lockDisabled: boolean
  onLock: (group: BoardMulti, locked: boolean) => void
  isGroupSaved?: (group: BoardMulti) => boolean
}

function CommonTimes({ times }: { times: BoardTimeOptions }) {
  if (!times.complete) return <p className="mt-3 text-xs leading-relaxed text-amber-700">部分成员缺少有效可用时间，请先核对资料。</p>
  if (!times.commonSlots.length) return <p className="mt-3 text-xs leading-relaxed text-amber-700">当前成员没有全员共同时间，请调整成员后再确认或保存。</p>
  return <div className="mt-3 border-t border-border/60 pt-3">
    <p className="mb-2 text-[11px] text-muted-foreground">全员共同时间 · {times.commonSlots.length} 个</p>
    <div className="flex flex-wrap gap-1.5" aria-label="本组全部共同时间">
      {times.orderedSlots.map((option) => <span key={option.slot} className={cn("inline-flex flex-wrap items-center gap-x-1 rounded-md px-2 py-1 text-[11px] leading-relaxed", option.current ? "bg-primary/10 font-medium text-primary" : "bg-muted/60 text-muted-foreground")}>
        {option.current && <span>推荐安排</span>}{formatSlot(option.slot)}
      </span>)}
    </div>
    {!times.currentValid && <p className="mt-2 text-xs text-amber-700">原推荐时段已不适用，请重新推荐或调整成员。</p>}
  </div>
}

/** Suggestions do not assign people until the parent confirms them on the server. */
export function MatchingBoardSmallGroups(props: MatchingBoardSmallGroupsProps) {
  const { groups, recommendations, prefs, canViewTimes, canRecommend, editable, poolLocked, loading, loaded,
    recommendationError, waitingCount, over, visible, name, chip, onRefresh, onConfirm,
    onRemoveMember, locked, lockDisabled, onLock, isGroupSaved } = props
  const suggestedCount = new Set(recommendations.flatMap((group) => group.memberIds)).size
  const remainingCount = Math.max(0, waitingCount - suggestedCount)

  return <section aria-label="4–6人分组" className="@container border-t bg-sky-50/35 dark:bg-sky-950/10">
    <div className="space-y-2 px-4 pt-4 pb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><UsersRound className="size-4 text-sky-700" />4–6人分组</h3>
        {canViewTimes && canRecommend && <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!editable || poolLocked || loading || !waitingCount} onClick={onRefresh}>
          <RefreshCw className={cn("size-3", loading && "animate-spin")} />{loading ? "推荐中…" : "重新推荐"}
        </Button>}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">优先让更多人入组，再均衡人数。长按姓名可调整，逐组确认后统一保存。</p>
    </div>
    <div data-board-scroll className="max-h-[min(75vh,760px)] space-y-4 overflow-y-auto px-4 pb-4">
      {groups.length > 0 && <div className="space-y-2" aria-label="已确认的4–6人小组">
        <p className="text-xs font-medium text-muted-foreground">已确认小组 · {groups.length}</p>
        {groups.map((group, index) => {
          if (!visible(group.memberIds)) return null
          const sizeOk = validSize(group.memberIds.length)
          const saved = isGroupSaved ? isGroupSaved(group) : !!group.resultId
          const groupLocked = locked(group)
          return <div key={group.key} data-board-group-key={group.key} className={cn("rounded-xl border bg-background p-3 shadow-xs", over === `group:${group.key}` ? "border-primary ring-2 ring-primary/20" : !sizeOk ? "border-amber-300" : "border-primary/25")}>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div><p className="text-sm font-semibold">第 {index + 1} 组 <span className="ml-1 text-xs font-normal text-muted-foreground">{group.memberIds.length} 人</span></p><p className="mt-1 text-[11px] text-muted-foreground">已确认 · {saved ? "已保存" : "待保存"}{groupLocked && " · 已锁定"}</p></div>
              {group.resultId && <Button size="icon-sm" variant="ghost" disabled={lockDisabled} aria-label={`${groupLocked ? "解锁" : "锁定"}第 ${index + 1} 个4–6人小组`} aria-pressed={groupLocked} title="保存当前调整后可锁定或解锁小组" onClick={() => onLock(group, groupLocked)}>{groupLocked ? <LockKeyhole className="size-3.5" /> : <LockKeyholeOpen className="size-3.5 text-muted-foreground" />}</Button>}
            </div>
            <div className="flex flex-wrap gap-2">{group.memberIds.map((id) => <div key={id}>{chip(id, `group:${group.key}`)}</div>)}</div>
            {!sizeOk && <p className="mt-3 text-xs leading-relaxed text-amber-700">当前 {group.memberIds.length} 人，请调整为 4–6 人后保存，或移空解散此组。</p>}
            {canViewTimes && <CommonTimes times={getBoardTimeOptions(group.memberIds, prefs, group.bestSlot)} />}
          </div>
        })}
      </div>}
      {canViewTimes && canRecommend ? <div className="space-y-2" aria-label="4–6人分组建议">
        <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground"><p className="font-medium">待确认建议 · {recommendations.length} 组</p>{loaded && recommendations.length > 0 && <span>{suggestedCount} 人已推荐 · {remainingCount} 人待安排</span>}</div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">确认前，人员仍留在上方候选池；人工调整后不会自动重排。</p>
        {recommendationError && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">{recommendationError}</p>}
        {loading && <p role="status" className="py-2 text-xs text-muted-foreground">正在核对共同时间与匹配条件…</p>}
        {!loading && !recommendationError && recommendations.length === 0 && <p className="rounded-lg border border-dashed bg-background/60 p-4 text-center text-xs leading-relaxed text-muted-foreground">{!waitingCount ? "上方暂无待分组人员。" : !loaded ? "等待生成分组建议。" : "暂时无法组成符合条件的 4–6 人小组。剩余人员可继续在下方按时间分组。"}</p>}
        {recommendations.map((group, index) => {
          if (!visible(group.memberIds)) return null
          const times = getBoardTimeOptions(group.memberIds, prefs, group.bestSlot)
          const sizeOk = validSize(group.memberIds.length)
          const canConfirm = editable && !poolLocked && !loading && sizeOk && times.complete && times.currentValid
          return <div key={group.key} data-board-small-key={group.key} className={cn("rounded-xl border bg-background p-3", over === `small:${group.key}` ? "border-primary ring-2 ring-primary/20" : !sizeOk ? "border-amber-300" : "border-border")}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-sm font-medium">建议 {index + 1} <span className="ml-1 text-xs font-normal text-muted-foreground">{group.memberIds.length} 人</span></p><p className="mt-1 text-[11px] text-muted-foreground">待确认</p></div>
              <Button size="sm" variant="outline" className="h-8 text-xs" aria-label={`确认第 ${index + 1} 个4–6人建议组`} disabled={!canConfirm} onClick={() => onConfirm(group)}><Check className="size-3" />确认分组</Button>
            </div>
            <div className="flex flex-wrap gap-2">{group.memberIds.map((id) => <div key={id} className="flex items-center gap-0.5">
              {chip(id, `small:${group.key}`, true)}
              {editable && <button type="button" className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40" aria-label={`将 ${name(id)}移出建议 ${index + 1}`} title="移出本建议，仍保留在上方候选池" disabled={poolLocked || loading} onClick={() => onRemoveMember(group.key, id)}><X className="size-3" /></button>}
            </div>)}</div>
            {!sizeOk && <p className="mt-3 text-xs leading-relaxed text-amber-700">当前 {group.memberIds.length} 人，请调整为 4–6 人后确认。</p>}
            <CommonTimes times={times} />
          </div>
        })}
        {poolLocked && <p className="text-xs text-muted-foreground">多人池已锁定，请先解锁再调整推荐分组。</p>}
      </div> : !canViewTimes ? <p className="text-xs leading-relaxed text-muted-foreground">分组建议和共同时间需要查看报名资料的权限，已确认小组仍可查看。</p> : groups.length === 0 ? <p className="text-xs leading-relaxed text-muted-foreground">暂无已确认的 4–6 人小组。</p> : null}
    </div>
  </section>
}
