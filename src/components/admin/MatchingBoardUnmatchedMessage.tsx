"use client"

import { useState } from "react"
import { MessageSquareText, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { resolveUnmatchedMessage } from "@/lib/matching/unmatched-message"

export interface UnmatchedMessageMember { id: string; name: string; memberNumber?: string | null }

interface Props {
  value: string
  editable: boolean
  recipients: number
  waitingDuo: number
  members?: UnmatchedMessageMember[]
  memberMessages?: Record<string, string | null>
  onChange: (value: string) => void
  onMemberMessagesChange?: (value: Record<string, string | null>) => void
  onBlur: () => void
}

const PAGE_SIZE = 10

export function MatchingBoardUnmatchedMessage({ value, editable, recipients, waitingDuo, members = [], memberMessages = {}, onChange, onMemberMessagesChange, onBlur }: Props) {
  const [query, setQuery] = useState("")
  const [limit, setLimit] = useState(PAGE_SIZE)
  const count = Array.from(value.trim()).length
  const needle = query.trim().toLocaleLowerCase()
  const filtered = members.filter((member) => `${member.name} ${member.memberNumber ?? ""}`.toLocaleLowerCase().includes(needle))
  const activeIds = new Set(members.map((member) => member.id))
  const retained = Object.keys(memberMessages).filter((id) => !activeIds.has(id)).length
  const changeMode = (id: string, mode: string) => {
    if (!editable || !onMemberMessagesChange) return
    const next = { ...memberMessages }
    if (mode === "common") delete next[id]
    else next[id] = mode === "none" ? null : typeof memberMessages[id] === "string" ? memberMessages[id] : ""
    onBlur(); onMemberMessagesChange(next); onBlur()
  }
  return <div className="mt-5 space-y-2 border-t border-border/70 pt-4">
    <label htmlFor="board-unmatched-message" className="flex items-center gap-2 text-sm font-medium"><MessageSquareText className="size-4 text-muted-foreground" />统一留言 <span className="text-xs font-normal text-muted-foreground">选填 · 玩家可见</span></label>
    <p id="board-unmatched-message-help" className="text-xs leading-relaxed text-muted-foreground">未设置个人留言的未匹配玩家默认使用这段文字。个人留言会替代统一留言；两者均为空则不显示留言区域。输入或保存不会发送通知。</p>
    <textarea id="board-unmatched-message" value={value} disabled={!editable} onChange={(event) => onChange(event.target.value)} onBlur={onBlur}
      aria-describedby="board-unmatched-message-help board-unmatched-message-count" aria-invalid={count > 300 || undefined}
      placeholder="例如：本轮暂未找到合适安排，工作人员会继续协调，有新的安排将通过站内通知联系你。"
      rows={4} className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed disabled:cursor-not-allowed disabled:opacity-70" />
    <div className="flex flex-wrap justify-between gap-1 text-[11px] leading-relaxed text-muted-foreground"><p>当前待核对：{recipients} 人{waitingDuo > 0 && `（含 ${waitingDuo} 人等待双人搭档）`}；发布前以下方接收名单为准。</p><p id="board-unmatched-message-count" className={count > 300 ? "text-red-700" : undefined}>{count} / 300 字</p></div>
    {count > 300 && <p role="alert" className="text-xs text-red-700">工作人员留言最多300字，请缩短后再保存。</p>}
    {onMemberMessagesChange && <div className="space-y-3 border-t border-border/70 pt-4" aria-label="未匹配个人留言编辑">
      <div><p className="text-sm font-medium">个人留言</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">可逐人说明不同情况，也可选择不显示留言。只有最终未匹配且符合接收条件的玩家，才会在发布后看到自己的内容。</p></div>
      {members.length > PAGE_SIZE && <label className="relative block"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><input aria-label="搜索个人留言成员" placeholder="搜索姓名或会员编号" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE) }} className="w-full rounded-lg border border-border bg-background py-2 pr-3 pl-8 text-sm" /></label>}
      <div className="space-y-2">
        {filtered.slice(0, limit).map((member) => {
          const hasPersonal = Object.hasOwn(memberMessages, member.id)
          const personal = memberMessages[member.id]
          const mode = !hasPersonal ? "common" : personal === null ? "none" : "personal"
          const personalCount = typeof personal === "string" ? Array.from(personal.trim()).length : 0
          const invalid = count > 300 || personalCount > 300
          const effective = invalid ? null : resolveUnmatchedMessage(value, memberMessages, member.id)
          const source = mode === "none" ? "不显示留言" : mode === "personal" && typeof personal === "string" && personal.trim() ? "个人留言" : "统一留言"
          return <div key={member.id} className="space-y-2 rounded-xl border border-border bg-background p-3" data-member-message-id={member.id}>
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-medium">{member.name}</p>{member.memberNumber && <p className="mt-0.5 text-[11px] text-muted-foreground">{member.memberNumber}</p>}</div>
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">留言方式<select aria-label={`给 ${member.name}的留言方式`} value={mode} disabled={!editable} onBlur={onBlur} onChange={(event) => changeMode(member.id, event.target.value)} className="max-w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-60"><option value="common">沿用统一留言</option><option value="personal">单独留言</option><option value="none">不显示留言</option></select></label>
            </div>
            {mode === "personal" && <><textarea aria-label={`给 ${member.name}的个人留言`} value={typeof personal === "string" ? personal : ""} disabled={!editable} onBlur={onBlur} onChange={(event) => { if (editable) onMemberMessagesChange({ ...memberMessages, [member.id]: event.target.value }) }} aria-invalid={personalCount > 300 || undefined} placeholder="仅此玩家可见；留空时沿用统一留言" rows={3} className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed disabled:opacity-70" /><p className={`text-right text-[11px] ${personalCount > 300 ? "text-red-700" : "text-muted-foreground"}`}>{personalCount} / 300 字</p>{personalCount > 300 && <p role="alert" className="text-xs text-red-700">{member.name}的个人留言最多300字，请缩短后再保存。</p>}</>}
            <div className="rounded-lg bg-muted/30 px-3 py-2 text-xs leading-relaxed" aria-label={`${member.name}最终留言预览`}><p className="font-medium text-muted-foreground">发布后内容 · {source}</p><p className="mt-1 whitespace-pre-wrap break-words">{invalid ? "请缩短超出300字的留言后再核对。" : effective || "不显示工作人员留言区域"}</p></div>
          </div>
        })}
        {!filtered.length && <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">{members.length ? "没有符合搜索的人员。" : "当前没有未匹配或等待双人搭档的人员。"}</p>}
      </div>
      {members.length > PAGE_SIZE && <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><p>显示 {Math.min(limit, filtered.length)} / {filtered.length} 人</p>{limit < filtered.length && <Button type="button" size="sm" variant="outline" onClick={() => setLimit((current) => current + PAGE_SIZE)}>再显示10人</Button>}</div>}
      {retained > 0 && <p className="text-[11px] leading-relaxed text-muted-foreground">另有 {retained} 位已安排成员保留个人设置，移回未匹配后可继续编辑；本次不会向已匹配成员展示留言。</p>}
    </div>}
  </div>
}
