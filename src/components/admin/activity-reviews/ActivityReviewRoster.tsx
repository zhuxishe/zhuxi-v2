"use client"

import { useMemo, useState } from "react"
import { Search, Users, UserPlus } from "lucide-react"
import type { AdminActivityReviewContext, AdminActivityReviewsData, ActivityReviewActionResult, ConfirmActivityReviewRosterInput } from "@/lib/activity-reviews/types"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"
import { useUnsavedActivityReviews } from "./use-unsaved-activity-reviews"
import { AuditReasonField, fieldClass, MutationFeedback, primaryButtonClass, secondaryButtonClass, useAdminReviewMutation } from "./shared"

export function ActivityReviewRoster({ context, memberOptions, saveAction, onSaved }: {
  context: AdminActivityReviewContext
  memberOptions: AdminActivityReviewsData["memberOptions"]
  saveAction: (input: ConfirmActivityReviewRosterInput) => Promise<ActivityReviewActionResult>
  onSaved?: () => void
}) {
  const initial = context.settings.rosterConfirmed ? context.participants.filter((member) => member.included && !member.canRestore).map((member) => member.memberId) : context.candidates.filter((member) => member.registered && member.eligible).map((member) => member.memberId)
  const [selected, setSelected] = useState<string[]>(initial)
  const [search, setSearch] = useState("")
  const [supplementSearch, setSupplementSearch] = useState("")
  const [reason, setReason] = useState("")
  const mutation = useAdminReviewMutation()
  const memberMap = useMemo(() => new Map([...memberOptions, ...context.participants, ...context.candidates].map((member) => [member.memberId, member])), [memberOptions, context.candidates, context.participants])
  const registeredIds = new Set(context.candidates.filter((member) => member.registered).map((member) => member.memberId))
  const candidateIds = [...new Set([...context.candidates.map((member) => member.memberId), ...context.participants.map((member) => member.memberId), ...selected])]
  const query = search.trim().toLocaleLowerCase()
  const shownIds = candidateIds.filter((id) => matchesMember(memberMap.get(id), query))
  const supplementQuery = supplementSearch.trim().toLocaleLowerCase()
  const supplementMatches = supplementQuery ? memberOptions.filter((member) => !candidateIds.includes(member.memberId) && matchesMember(member, supplementQuery)).slice(0, 20) : []
  const manualCount = selected.filter((id) => !registeredIds.has(id)).length
  const dirty = JSON.stringify([...selected].sort()) !== JSON.stringify([...initial].sort()) || reason.length > 0
  const canRefresh = useUnsavedActivityReviews(dirty && !mutation.success)
  const disabled = !context.canManageSettings || context.settings.version === 0 || mutation.pending || mutation.success

  function toggle(id: string) { setSelected((current) => current.includes(id) ? current.filter((memberId) => memberId !== id) : [...current, id]) }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (disabled || selected.length < 2 || !adminAuditReasonIsValid(reason) || !canRefresh()) return
    const saved = await mutation.run(() => saveAction({ roundId: context.roundId, memberIds: selected, expectedVersion: context.settings.version, reason: reason.trim() }))
    if (saved) onSaved?.()
  }

  return <section className="rounded-xl border border-border bg-card p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex gap-3"><Users className="mt-0.5 size-5 shrink-0 text-primary" /><div><h2 className="font-semibold">确认活动参与名册</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">从未取消的报名预选。请移除缺席玩家；临时到场者可从已有成员补录。</p></div></div>
      <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">已选 {selected.length} 人{manualCount ? ` · 补录 ${manualCount} 人` : ""}</span>
    </div>
    <form onSubmit={submit} className="mt-4 space-y-4">
      {context.settings.version === 0 ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">请先在开放设置中保存时间，随后即可确认名册。</p> : null}
      <fieldset disabled={disabled} className="space-y-4">
        {selected.length < 2 ? <p role="status" className="text-sm text-muted-foreground">互评至少需要两名实际到场玩家。</p> : null}
        <label className="relative block"><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" /><input aria-label="检索活动名册" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="检索姓名或昵称" className={`${fieldClass} pl-9`} /></label>
        <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
          {shownIds.length ? shownIds.map((id) => {
            const member = memberMap.get(id)
            const eligible = !(member && "eligible" in member && !member.eligible)
            const canRestore = Boolean(member && "canRestore" in member && member.canRestore)
            return <label key={id} className="flex min-h-16 cursor-pointer items-center gap-3 border-b border-border/60 px-3 py-3 last:border-0 hover:bg-muted/30">
              <input type="checkbox" checked={selected.includes(id)} onChange={() => toggle(id)} disabled={!eligible && !canRestore && !selected.includes(id)} className="size-4 shrink-0 accent-primary" />
              <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{member?.fullName || "未填写姓名"}</span><span className="block break-words text-xs text-muted-foreground">昵称：{member?.nickname || "未填写"}</span></span>
              <span className="shrink-0 text-xs text-muted-foreground">{canRestore ? "已取消 · 补录后恢复" : !eligible ? "账号不可用" : registeredIds.has(id) ? "活动报名" : "补录成员"}</span>
            </label>
          }) : <p className="p-5 text-center text-sm text-muted-foreground">{query ? "没有符合检索条件的玩家" : "暂无报名玩家，可在下方补录已到场成员"}</p>}
        </div>
        <div className="space-y-2 rounded-lg bg-muted/30 p-3">
          <label className="block space-y-2 text-sm font-medium"><span className="inline-flex items-center gap-2"><UserPlus className="size-4" />补录实际到场成员</span><input aria-label="检索补录成员" value={supplementSearch} onChange={(event) => setSupplementSearch(event.target.value)} placeholder="输入已有成员的姓名或昵称" className={fieldClass} /></label>
          {supplementQuery ? <div className="space-y-2">{supplementMatches.length ? supplementMatches.map((member) => <div key={member.memberId} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"><span className="min-w-0 break-words text-sm">{member.fullName || "未填写姓名"}<span className="ml-2 text-xs text-muted-foreground">{member.nickname || "未填写昵称"}</span></span><button type="button" onClick={() => { setSelected((current) => [...current, member.memberId]); setSupplementSearch("") }} className={secondaryButtonClass} aria-label={`补录 ${member.fullName || member.nickname || "成员"}`}>补录</button></div>) : <p className="text-xs text-muted-foreground">没有可补录的匹配成员，或该成员已在上方名册中。</p>}</div> : null}
          <p className="text-xs leading-5 text-muted-foreground">固定活动保存名册时同步补齐报名；手动选中已取消成员会恢复其报名，无需玩家再次报名。补录、移除与重新确认均会记录操作理由。移除成员会将与其相关的已有评分标记为无效；重新加入后需单独审核恢复。</p>
        </div>
        <AuditReasonField id="review-roster-reason" value={reason} onChange={setReason} disabled={disabled} label="名册确认与调整理由" />
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-muted-foreground">当前配置版本 {context.settings.version}；保存时检查版本，防止覆盖其他管理员的修改。</span><button type="submit" disabled={disabled || selected.length < 2 || !adminAuditReasonIsValid(reason)} className={primaryButtonClass}>{mutation.pending ? "保存中…" : context.settings.rosterConfirmed ? "更新确认名册" : "确认参与名册"}</button></div>
      <MutationFeedback error={mutation.error} success={mutation.success} />
    </form>
  </section>
}

function matchesMember(member: { fullName: string; nickname: string | null } | undefined, query: string) {
  return Boolean(member && `${member.fullName} ${member.nickname ?? ""}`.toLocaleLowerCase().includes(query))
}
