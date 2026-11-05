"use client"

import { useRef, useState } from "react"
import type { ActivityReviewActionResult } from "@/lib/activity-reviews/types"
import type { AdminReviewRequirementsResult, ReviewRequirementParticipant, ReviewRequirementState, SetReviewExemptionInput } from "@/lib/activity-reviews/requirements"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"
import { formatAdminDateTime } from "@/lib/admin-datetime"
import { AuditReasonField, fieldClass, MutationFeedback, primaryButtonClass, secondaryButtonClass, useAdminReviewMutation } from "./shared"
import { useUnsavedActivityReviews } from "./use-unsaved-activity-reviews"

const STATE_LABELS: Record<ReviewRequirementState, string> = {
  pending: "待完成评分", completed: "已完成评分", exempt: "管理员已免除", no_target: "无评价对象，自动免除",
  unavailable: "评价暂不可提交，暂不限制", not_ended: "活动尚未结束，暂不限制",
}

export type SaveReviewExemptionAction = (input: SetReviewExemptionInput) => Promise<ActivityReviewActionResult>

export function ReviewRequirementPanel({ roundId, result, canManage, memberFilter, saveAction, onSaved }: {
  roundId: string; result: AdminReviewRequirementsResult; canManage: boolean; memberFilter?: string | null
  saveAction: SaveReviewExemptionAction; onSaved?: () => void
}) {
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState("")
  const canRefresh = useUnsavedActivityReviews(false)
  const data = result.status === "ready" ? result.data : null
  const participants = (data?.participants ?? []).filter((person) => !memberFilter || person.memberId === memberFilter)
  const query = search.trim().toLocaleLowerCase()
  const visible = participants.filter((person) => `${person.fullName} ${person.nickname ?? ""}`.toLocaleLowerCase().includes(query))
  const selected = participants.find((person) => person.memberId === selectedId)

  return <section aria-label="报名评分要求" className="rounded-xl border border-border bg-card p-5">
    <h2 className="font-semibold">报名评分要求</h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">本场活动结束后，玩家本人给至少一位符合条件的对象评分即可完成要求。免除仅作用于所选成员的本场活动，不代替评分，也不免除其他活动的要求。</p>
    {!data ? <div role="alert" className="mt-4 space-y-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
      <p>{result.status === "unavailable" ? "报名评分要求暂不可用，当前无法查看或修改免除记录。" : "未能读取报名评分要求，请重试；当前未更改任何免除记录。"}</p>
      {onSaved ? <button type="button" className={secondaryButtonClass} onClick={() => { if (canRefresh()) onSaved() }}>重新读取</button> : null}
    </div> : !data.required ? <p role="status" className="mt-4 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">本场活动未纳入报名评分要求，无需设置免除。</p> : <>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">活动结束：{formatAdminDateTime(data.endedAt, "尚未设置")}（日本时间）。评价截止后仍允许未完成者补评；管理员未开放或暂停评价期间暂不限制新报名。</p>
      {savedMessage ? <p role="status" className="mt-3 text-sm text-emerald-700">{savedMessage}</p> : null}
      <label className="mt-4 block space-y-1.5 text-sm"><span>检索本场成员</span><input aria-label="检索报名评分要求成员" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="姓名或昵称" className={fieldClass} /></label>
      <ul className="mt-3 max-h-96 divide-y divide-border overflow-y-auto pr-1">
        {visible.map((person) => <li key={person.memberId} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{person.fullName || "未填写姓名"}{person.nickname ? <span className="ml-2 font-normal text-muted-foreground">（{person.nickname}）</span> : null}</p>
            <p className="mt-1 text-xs text-muted-foreground">{STATE_LABELS[person.state]}</p>
            {person.exemptionReason ? <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">最近操作理由：{person.exemptionReason}</p> : null}
          </div>
          <button type="button" disabled={!canManage || Boolean(selected)} className={secondaryButtonClass}
            aria-label={`${person.exempt ? "撤销免除" : "免除本场要求"} ${person.fullName || "未填写姓名"}${person.nickname ? `（${person.nickname}）` : ""}`}
            onClick={() => { if (canManage && !selected) { setSavedMessage(""); setSelectedId(person.memberId) } }}>
            {person.exempt ? "撤销免除" : "免除本场要求"}
          </button>
        </li>)}
      </ul>
      {visible.length === 0 ? <p className="py-4 text-sm text-muted-foreground">{participants.length ? "没有找到符合条件的成员。" : "本场暂无可处理的参与成员。"}</p> : null}
      {!canManage ? <p className="mt-3 text-xs text-muted-foreground">当前账号无法修改本场评分要求。</p> : null}
      {selected && canManage ? <ReviewRequirementEditor key={`${roundId}:${selected.memberId}:${selected.exemptionVersion}`}
        roundId={roundId} person={selected} saveAction={saveAction} onCancel={() => setSelectedId(null)}
        onSaved={() => { setSavedMessage(selected.exempt ? "已撤销该成员本场免除，将按当前评分情况检查报名资格。" : "已免除该成员本场评分要求，其他活动的要求仍保留。"); setSelectedId(null); onSaved?.() }} /> : null}
    </>}
  </section>
}

export function ReviewRequirementEditor({ roundId, person, saveAction, onSaved, onCancel }: {
  roundId: string; person: ReviewRequirementParticipant; saveAction: SaveReviewExemptionAction
  onSaved: () => void; onCancel: () => void
}) {
  const [reason, setReason] = useState("")
  const mutation = useAdminReviewMutation()
  const inFlight = useRef(false)
  const canRefresh = useUnsavedActivityReviews(reason.length > 0 && !mutation.success)
  const disabled = mutation.pending || mutation.success
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (inFlight.current || disabled || !adminAuditReasonIsValid(reason) || !canRefresh()) return
    inFlight.current = true
    try {
      const saved = await mutation.run(() => saveAction({ roundId, memberId: person.memberId, exempt: !person.exempt, expectedVersion: person.exemptionVersion, reason: reason.trim() }))
      if (saved) onSaved()
    } finally { inFlight.current = false }
  }
  return <form onSubmit={submit} className="mt-4 space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
    <p className="text-sm font-medium">{person.exempt ? "撤销本场免除" : "免除本场评分要求"}：{person.fullName || "未填写姓名"}{person.nickname ? `（${person.nickname}）` : ""}</p>
    <p className="text-xs leading-5 text-muted-foreground">{person.exempt ? "撤销后，系统会重新检查本场是否已结束、是否可评价及本人是否已评分，不会影响已成功报名的活动。" : "适用于已核实未成行、未赴约等特殊情况。此操作不会提交评分，也不会免除其他成员或其他活动的要求。"}</p>
    <AuditReasonField id={`review-exemption-reason-${person.memberId}`} value={reason} onChange={setReason} disabled={disabled} />
    <div className="flex flex-wrap gap-3"><button type="submit" disabled={disabled || !adminAuditReasonIsValid(reason)} className={primaryButtonClass}>{mutation.pending ? "保存中…" : person.exempt ? "确认撤销免除" : "确认免除本场要求"}</button>
      <button type="button" disabled={disabled} onClick={() => { if (!disabled && !inFlight.current) onCancel() }} className={secondaryButtonClass}>取消</button></div>
    <MutationFeedback error={mutation.error} success={mutation.success} />
  </form>
}
