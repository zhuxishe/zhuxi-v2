"use client"

import { useState } from "react"
import { CheckCheck, ChevronDown, ChevronUp, RefreshCw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { MatchingReviewGroup, MatchingReviewMember, SavedMatchingReview } from "@/lib/matching/session-review-types"
import { normalizeUnmatchedMemberMessages, normalizeUnmatchedMessage, resolveUnmatchedMessage } from "@/lib/matching/unmatched-message"

export interface MatchingPublicationReviewProps {
  review: SavedMatchingReview | null
  blocked: boolean
  blockedReason?: string
  loading: boolean
  error?: string
  onRefresh: () => void
  /** A stale read may be refreshed; unsaved edits and uncertain writes must be resolved first. */
  refreshDisabled?: boolean
}

const PAGE_SIZE = 20
const slotText = (slot: string | null) => slot?.replaceAll("_", " ") || "未指定"
const sameSlot = (left: string, right: string | null) => left.replaceAll(" ", "_") === right?.replaceAll(" ", "_")
const matchesMember = (member: MatchingReviewMember, query: string) => `${member.name} ${member.memberNumber ?? ""}`.toLocaleLowerCase().includes(query)

function OtherTimes({ group, canViewTimes }: { group: MatchingReviewGroup; canViewTimes: boolean }) {
  const [expanded, setExpanded] = useState(false)
  if (!canViewTimes || group.timeStatus === "hidden") return <span className="text-xs text-muted-foreground">需报名资料查看权限</span>
  if (group.timeStatus !== "ready") return <span className="text-xs text-amber-700">资料不足，待核对</span>
  const others = group.commonSlots.filter((slot) => !sameSlot(slot, group.recommendedSlot))
  const recommendationValid = !!group.recommendedSlot && group.commonSlots.some((slot) => sameSlot(slot, group.recommendedSlot))
  const visible = expanded ? others : others.slice(0, 2)
  return <div className="space-y-1.5 text-xs leading-relaxed">
    {visible.length ? <ul className="space-y-1">{visible.map((slot) => <li key={slot} className="whitespace-nowrap text-muted-foreground">{slotText(slot)}</li>)}</ul> : <span className="text-muted-foreground">{group.commonSlots.length ? "无其他共同时间" : "无共同时间，待核对"}</span>}
    {others.length > 2 && <button type="button" aria-expanded={expanded} aria-label={`${expanded ? "收起" : "展开"}${group.label}的其他共同时间`} onClick={() => setExpanded((value) => !value)} className="inline-flex min-h-8 items-center gap-1 rounded px-1 text-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary">
      {expanded ? <><ChevronUp className="size-3" />收起</> : <><ChevronDown className="size-3" />另有 {others.length - 2} 个，展开</>}
    </button>}
    {group.recommendedSlot && !recommendationValid && <p className="text-amber-700">推荐时间已不在当前共同时间中</p>}
  </div>
}

function PendingMembers({ label, members, query, warning }: { label: string; members: MatchingReviewMember[]; query: string; warning?: boolean }) {
  if (!members.length) return null
  const visible = members.filter((member) => matchesMember(member, query))
  if (query && !visible.length) return null
  return <details className="min-w-0 rounded-lg border border-border/70 bg-background px-3 py-2" open={members.length <= 10}>
    <summary className={cn("cursor-pointer text-xs font-medium", warning ? "text-amber-800" : "text-muted-foreground")}>{label} · {query ? `${visible.length} / ${members.length}` : members.length} 人</summary>
    <p className="mt-2 break-words text-sm leading-7">{visible.map((member) => member.name).join("、")}</p>
  </details>
}

/** Show each recipient's final copy without expanding the page into full cards. */
function UnmatchedMessagesReview({ review }: { review: SavedMatchingReview }) {
  const [query, setQuery] = useState("")
  const [limit, setLimit] = useState(PAGE_SIZE)
  const common = normalizeUnmatchedMessage(review.unmatchedMessage)
  const personal = normalizeUnmatchedMemberMessages(review.unmatchedMemberMessages)
  if (!common && !Object.keys(personal).length) return null
  const recipients = review.messageRecipients ?? [...review.waitingDuo, ...review.unmatched]
  const rows = recipients.map((member) => {
    const message = resolveUnmatchedMessage(common, personal, member.id)
    return { member, message, source: message ? Object.hasOwn(personal, member.id) ? "个人留言" : "统一留言" : "不显示留言" }
  })
  const needle = query.trim().toLocaleLowerCase()
  const filtered = rows.filter(({ member }) => matchesMember(member, needle))
  const visible = filtered.slice(0, limit)
  const shown = rows.filter(({ message }) => !!message).length
  return <div className="space-y-3 rounded-xl border border-primary/15 bg-primary/[0.035] p-4" aria-label="未匹配工作人员留言">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium text-primary">工作人员留言 · 逐人核对</p><p className="text-xs text-muted-foreground">{review.messageRecipients !== undefined ? "本次可接收" : "待核对接收范围"} · {recipients.length} 人{recipients.some((member) => review.waitingDuo.some((waiting) => waiting.id === member.id)) && "（含等待双人搭档人员）"}</p></div>
    <p className="text-xs leading-relaxed text-muted-foreground">个人留言优先；沿用统一留言的玩家显示统一内容。实际展示留言 · {shown} 人，不显示留言 · {rows.length - shown} 人。</p>
    {rows.length ? <>
      <div className="relative max-w-sm"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><input aria-label="搜索留言接收人" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE) }} placeholder="搜索姓名或会员编号" className="w-full rounded-lg border border-border bg-background py-2 pr-3 pl-8 text-xs" /></div>
      <div className="overflow-x-auto rounded-lg border border-border bg-background"><table className="w-full min-w-[480px] text-left text-xs"><caption className="sr-only">每位未匹配玩家最终会看到的工作人员留言</caption>
        <thead className="bg-muted/40 text-muted-foreground"><tr><th scope="col" className="w-36 px-3 py-2 font-medium">玩家</th><th scope="col" className="w-24 px-3 py-2 font-medium">内容来源</th><th scope="col" className="px-3 py-2 font-medium">玩家将看到的留言</th></tr></thead>
        <tbody className="divide-y divide-border">{visible.map(({ member, message, source }) => <tr key={member.id} data-message-member={member.id} className="align-top"><th scope="row" className="px-3 py-3 font-medium"><span className="block break-words">{member.name}</span>{member.memberNumber && <span className="mt-1 block font-normal text-muted-foreground">{member.memberNumber}</span>}</th><td className="px-3 py-3 text-muted-foreground">{source}</td><td className={cn("whitespace-pre-wrap break-words px-3 py-3 leading-6", !message && "text-muted-foreground")}>{message || "不显示工作人员留言区域"}</td></tr>)}
          {!visible.length && <tr><td colSpan={3} className="px-3 py-5 text-center text-muted-foreground">没有符合搜索的留言接收人。</td></tr>}
        </tbody>
      </table></div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><p>显示 {visible.length} / {filtered.length} 人</p>{visible.length < filtered.length && <Button type="button" size="sm" variant="outline" onClick={() => setLimit((value) => value + PAGE_SIZE)}>再显示 {Math.min(PAGE_SIZE, filtered.length - visible.length)} 位留言</Button>}</div>
    </> : <p className="text-xs text-muted-foreground">当前没有未匹配接收人，本次发布不会展示留言。</p>}
    {review.messageRecipients === undefined && <p className="text-[11px] leading-relaxed text-muted-foreground">接收范围尚待最终资格核验。</p>}
    <p className="text-[11px] leading-relaxed text-muted-foreground">留言与当前已保存方案一起发布；玩家只看到自己的最终留言。后台操作理由及未匹配诊断不会发送给玩家。</p>
  </div>
}

function ReviewContents({ review }: { review: SavedMatchingReview }) {
  const [filter, setFilter] = useState<"all" | "duo" | "multi">("all")
  const [query, setQuery] = useState("")
  const [limit, setLimit] = useState(PAGE_SIZE)
  const needle = query.trim().toLocaleLowerCase()
  const filtered = review.groups.filter((group) => (filter === "all" || group.kind === filter) && (!needle || group.members.some((member) => matchesMember(member, needle))))
  const rows = filtered.slice(0, limit)
  const { summary } = review
  const captured = review.capturedAt && Number.isFinite(Date.parse(review.capturedAt))
    ? new Date(review.capturedAt).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo", hour12: false }) : null
  return <>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-border/70 bg-primary/[0.035] px-4 py-3 text-sm sm:px-5" aria-label="已保存方案人数汇总">
      <span><strong className="tabular-nums">{summary.duoGroups}</strong> 对双人</span>
      <span><strong className="tabular-nums">{summary.multiGroups}</strong> 个多人组</span>
      <span><strong className="tabular-nums">{summary.matched}</strong> 人已匹配</span>
      <span className="text-muted-foreground">{summary.unmatched} 人未匹配</span>
      {(summary.waitingDuo > 0 || summary.waitingMulti > 0) && <span className="text-amber-800">{summary.waitingDuo + summary.waitingMulti} 人待安排</span>}
      <span className="ml-auto text-xs text-muted-foreground">共 {summary.total} 人</span>
    </div>
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-muted/40 p-1" role="group" aria-label="筛选核对分组类型">
          {([{ value: "all", label: "全部" }, { value: "duo", label: "双人" }, { value: "multi", label: "多人" }] as const).map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => { setFilter(item.value); setLimit(PAGE_SIZE) }} className={cn("min-h-9 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary", filter === item.value ? "bg-background text-primary shadow-xs" : "text-muted-foreground hover:text-foreground")}>{item.label}</button>)}
        </div>
        <div className="relative min-w-0 flex-1 sm:max-w-xs"><Search className="absolute left-3 top-3 size-3.5 text-muted-foreground" /><input aria-label="搜索已保存分组成员" placeholder="搜索姓名或会员编号" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE) }} className="w-full rounded-lg border border-input bg-background py-2.5 pr-3 pl-9 text-xs" /></div>
      </div>
      {review.issues.length > 0 && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900"><p className="font-medium">以下事项需要核对：</p><ul className="mt-1 list-disc space-y-1 pl-4">{review.issues.map((issue, index) => <li key={`${index}:${issue}`}>{issue}</li>)}</ul></div>}
      <div className="overflow-x-auto rounded-xl border border-border" tabIndex={0} role="region" aria-label="已保存匹配结果表，可横向滚动">
        <table className="w-full min-w-[700px] border-collapse text-left text-sm">
          <caption className="sr-only">当前已保存方案，每对或每组一行；时间均为日本时间。</caption>
          <thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th scope="col" className="w-28 px-3 py-3 font-medium">组别 / 人数</th><th scope="col" className="min-w-48 px-3 py-3 font-medium">匹配成员</th><th scope="col" className="w-44 px-3 py-3 font-medium">推荐时间</th><th scope="col" className="w-56 px-3 py-3 font-medium">其他共同时间</th></tr></thead>
          <tbody className="divide-y divide-border/70">
            {rows.map((group) => <tr key={group.resultId} data-review-result={group.resultId} className="align-top hover:bg-muted/15">
              <th scope="row" className="px-3 py-3.5 text-xs font-medium"><span className="block whitespace-nowrap text-primary">{group.label}</span><span className="mt-1 block font-normal text-muted-foreground">{group.members.length} 人{group.manuallyAdjusted && " · 人工调整"}</span></th>
              <td className="px-3 py-3.5 leading-7"><span className="break-words">{group.members.map((member) => member.name).join(group.kind === "duo" ? " ＆ " : "、")}</span></td>
              <td className="px-3 py-3.5 text-xs leading-relaxed font-medium"><span className="whitespace-nowrap">{slotText(group.recommendedSlot)}</span></td>
              <td className="px-3 py-3.5"><OtherTimes group={group} canViewTimes={review.canViewTimes} /></td>
            </tr>)}
            {!rows.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">{review.groups.length ? "没有符合筛选条件的分组。" : "当前已保存方案还没有有效配对或多人小组。"}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p aria-live="polite">显示 {rows.length} / {filtered.length} 组{filtered.length !== review.groups.length && ` · 全部 ${review.groups.length} 组`}</p>
        {rows.length < filtered.length && <Button type="button" size="sm" variant="outline" onClick={() => setLimit((value) => value + PAGE_SIZE)}>再显示 {Math.min(PAGE_SIZE, filtered.length - rows.length)} 组</Button>}
        <span className="sm:hidden">左右滑动查看完整表格</span>
      </div>
      {(review.waitingDuo.length > 0 || review.waitingMulti.length > 0 || review.unmatched.length > 0) && <div className="space-y-2 border-t border-border/70 pt-4" aria-label="未进入有效分组的人员">
        <p className="text-xs font-medium text-muted-foreground">待安排与未匹配人员</p>
        <div className="grid gap-2 lg:grid-cols-3">
          <PendingMembers label="待双人搭档" members={review.waitingDuo} query={needle} warning />
          <PendingMembers label="待多人分组" members={review.waitingMulti} query={needle} warning />
          <PendingMembers label="未匹配" members={review.unmatched} query={needle} />
        </div>
      </div>}
      <UnmatchedMessagesReview review={review} />
      <p className="text-[11px] leading-relaxed text-muted-foreground">时间均为日本时间。{captured ? `核对资料读取于 ${captured}。` : ""}如需更换人员，请回到上方三个池子调整并保存。</p>
    </div>
  </>
}

/** A read-only review of saved results. Never render stale rows as the current plan. */
export function MatchingPublicationReview({ review, blocked, blockedReason, loading, error, onRefresh, refreshDisabled }: MatchingPublicationReviewProps) {
  const unavailable = blocked || loading || !!error || !review
  return <section id="publication-review" aria-label="发布前结果确认" className="min-w-0 scroll-mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
    <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
      <div><h2 className="flex items-center gap-2 text-base font-semibold"><CheckCheck className="size-4 text-primary" />发布前结果确认</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">集中核对已保存的配对、小组和共同时间；每对或每组一行。</p></div>
      <div className="flex flex-wrap items-center gap-2">
        {!unavailable && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">{review.sessionStatus === "confirmed" ? `已发布${review.publicationVersion ? ` · 第 ${review.publicationVersion} 版` : ""}` : "已保存 · 尚未发布"}</span>}
        <Button type="button" size="sm" variant="outline" disabled={loading || (refreshDisabled ?? blocked)} onClick={onRefresh}><RefreshCw className={cn("size-3.5", loading && "animate-spin")} />{loading ? "核对中…" : "重新核对"}</Button>
      </div>
    </div>
    {blocked ? <p role="status" className="mx-4 mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 sm:mx-5 sm:mb-5">{blockedReason || "上方存在未保存调整，请先保存，再核对最终结果。"}</p>
      : loading ? <p role="status" className="px-5 pb-5 text-sm text-muted-foreground">正在读取已保存方案与当前共同时间…</p>
        : error || !review ? <p role="alert" className="mx-4 mb-4 rounded-lg bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground sm:mx-5 sm:mb-5">{error || "暂时无法读取已保存结果，请点击「重新核对」。"}</p>
          : <ReviewContents key={review.revisionToken} review={review} />}
  </section>
}
