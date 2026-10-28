"use client"

import { useEffect, useRef, useState } from "react"
import { Check, RefreshCw, Search, ShieldCheck, UsersRound, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { loadRoundAudience, saveRoundAudience } from "@/app/admin/matching/rounds/[id]/audience-actions"
import type { RoundAudienceSnapshot, RoundAudienceSaveInput as RoundAudienceSaveRequest } from "@/lib/matching/round-audience-types"
import { cn } from "@/lib/utils"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"
import { useUnsavedRoundContent } from "./use-unsaved-round-content"

interface Props { roundId: string; initial: RoundAudienceSnapshot | null; initialError?: string }
const sameIds = (a: readonly string[], b: readonly string[]) => {
  const left = [...a].sort(), right = [...b].sort()
  return left.length === right.length && left.every((id, index) => id === right[index])
}
const initialIds = (value: RoundAudienceSnapshot | null) => value?.members.filter((member) => member.listed).map((member) => member.id) ?? []
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function RoundAudiencePanel({ roundId, initial, initialError }: Props) {
  const [snapshot, setSnapshot] = useState(initial)
  const [open, setOpen] = useState(false)
  const [enabled, setEnabled] = useState(initial?.enabled ?? false)
  const [memberIds, setMemberIds] = useState(() => initialIds(initial))
  const [reason, setReason] = useState("")
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialError ?? "")
  const [notice, setNotice] = useState("")
  const [pending, setPending] = useState<RoundAudienceSaveRequest | null>(null)
  const inFlight = useRef(false)
  const storageKey = `round-audience-save:${roundId}`
  const changed = !!snapshot && (enabled !== snapshot.enabled || !sameIds(memberIds, initialIds(snapshot)))
  const dirty = changed || !!reason.trim()
  const canEdit = !!snapshot?.canManage && snapshot.isTest && snapshot.purpose === "matching" && !busy && !pending
  const missingParticipants = snapshot?.members.filter((member) => member.participated && !memberIds.includes(member.id)) ?? []
  const reasonValid = adminAuditReasonIsValid(reason)
  useUnsavedRoundContent((open && dirty) || !!pending)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (!raw) return
      const value = JSON.parse(raw) as RoundAudienceSaveRequest
      if (value.roundId === roundId && typeof value.operationId === "string" && uuid.test(value.operationId)
        && typeof value.enabled === "boolean" && typeof value.expectedRevision === "string" && value.expectedRevision.length > 0 && value.expectedRevision.length <= 1000
        && typeof value.reason === "string" && value.reason.length <= 500 && Array.isArray(value.memberIds) && value.memberIds.length <= 5000 && value.memberIds.every((id) => typeof id === "string" && uuid.test(id))) {
        setPending(value); setEnabled(value.enabled); setMemberIds(value.memberIds); setReason(value.reason); setOpen(true)
        setError("上次保存结果待确认，请先核对上次保存，再继续修改。")
      }
    } catch { /* A valid in-memory request remains recoverable when storage is unavailable. */ }
  }, [roundId, storageKey])

  function reset(value: RoundAudienceSnapshot) {
    setSnapshot(value); setEnabled(value.enabled); setMemberIds(initialIds(value)); setReason(""); setQuery("")
  }
  async function run(work: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true)
    try { await work() } catch { setError("暂时无法处理，请稍后重试。当前编辑仍保留。") }
    finally { inFlight.current = false; setBusy(false) }
  }
  function reload() {
    if (busy || pending) return
    if (dirty && !window.confirm("重新读取会放弃尚未保存的参与范围修改，继续吗？")) return
    void run(async () => { const fresh = await loadRoundAudience(roundId); reset(fresh); setError(""); setNotice("已读取最新参与范围。") })
  }
  function changeOpen(next: boolean) {
    if (!next) {
      if (busy || pending) { setError("请先核对保存结果，再关闭此窗口。"); return }
      if (dirty && !window.confirm("放弃尚未保存的参与范围修改？")) return
      if (snapshot) reset(snapshot)
      setError("")
    }
    setOpen(next)
  }
  function persist() {
    if (busy || (!pending && (!canEdit || !changed || !reasonValid || (!enabled && missingParticipants.length > 0)))) return
    const payload = pending ?? { roundId, enabled, memberIds: [...memberIds].sort(), expectedRevision: snapshot!.revision, operationId: crypto.randomUUID(), reason: reason.trim() }
    void run(async () => {
      setError(""); setNotice(""); setPending(payload)
      try { sessionStorage.setItem(storageKey, JSON.stringify(payload)) } catch {}
      let response
      try { response = await saveRoundAudience(payload) }
      catch { setError("保存结果待确认，请点击「核对上次保存」，不要重复新建操作。"); return }
      if (!response.success) {
        setError(response.error || "未能保存参与范围。")
        if (!response.unknown) { setPending(null); try { sessionStorage.removeItem(storageKey) } catch {} }
        return
      }
      let fresh: RoundAudienceSnapshot
      try { fresh = await loadRoundAudience(roundId) }
      catch { setError("保存已完成，但暂时无法读取新状态。请点击「核对上次保存」重新核对。"); return }
      reset(fresh); setPending(null)
      try { sessionStorage.removeItem(storageKey) } catch {}
      setNotice("参与范围已保存，玩家刷新活动页面后即可看到最新范围。")
    })
  }
  const selected = new Set(memberIds)
  const listed = snapshot?.members.filter((member) => selected.has(member.id)) ?? []
  const candidates = snapshot?.members.filter((member) => !selected.has(member.id)) ?? []
  const sortedMembers = snapshot?.canManage ? [...listed, ...candidates] : listed
  const needle = query.trim().toLocaleLowerCase()
  const visibleMembers = sortedMembers.filter((member) => !needle || `${member.name} ${member.memberNumber ?? ""}`.toLocaleLowerCase().includes(needle))
  const label = snapshot?.enabled ? "所有正常正式玩家" : "指定名单"

  return <section id="participation-scope" aria-label="参与范围" className="scroll-mt-6 rounded-xl border border-border bg-card p-5 shadow-xs">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><h2 className="flex items-center gap-2 font-semibold"><UsersRound className="size-4 text-primary" />参与范围</h2><p className="mt-1 text-xs text-muted-foreground">查看谁能看到本期活动并报名。</p></div>
      {snapshot?.isTest && <Button type="button" variant="outline" size="sm" onClick={() => changeOpen(true)}>{snapshot.canManage ? "管理参与范围" : "查看名单"}</Button>}
    </div>
    {snapshot ? <>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm"><span className={cn("rounded-full px-2.5 py-1 text-xs", snapshot.isTest ? "bg-amber-500/10 text-amber-800" : "bg-primary/10 text-primary")}>{snapshot.isTest ? "测试活动" : "正式活动"}</span><span className="font-medium">{snapshot.isTest ? label : "所有正常正式玩家"}</span></div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">当前范围覆盖 {snapshot.counts.effective} 人 · 正式玩家 {snapshot.counts.formal} 人 · 测试账号 {snapshot.counts.test} 人{snapshot.isTest && ` · 指定名单 ${snapshot.counts.listed} 人`}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{snapshot.isTest ? "测试账号按指定名单参与；活动属性保持不变，报名时间与资料检查仍然生效。" : "正式活动向符合账号条件的正式玩家开放，测试账号不参与。"}</p>
      {!snapshot.canManage && snapshot.isTest && <p className="mt-2 text-xs text-muted-foreground">仅超级管理员可以修改参与范围。</p>}
      {pending && !open && <Button type="button" className="mt-3" size="sm" variant="outline" onClick={() => setOpen(true)}>核对上次保存</Button>}
    </> : <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/30 p-3"><p className="text-sm text-muted-foreground">暂时无法读取参与范围，当前不能修改。</p><Button type="button" size="sm" variant="outline" disabled={busy || !!pending} onClick={reload}><RefreshCw className="size-3.5" />重新读取</Button></div>}
    {!open && (error || notice) && <p className={cn("mt-3 text-sm", error ? "text-destructive" : "text-primary")} role={error ? "alert" : "status"}>{error || notice}</p>}

    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent showCloseButton={false} className="flex max-h-[90dvh] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <button type="button" aria-label="关闭参与范围" disabled={busy || !!pending} onClick={() => changeOpen(false)} className="absolute right-3 top-3 z-10 flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-40"><X className="size-4" /></button>
        <div className="shrink-0 border-b border-border px-5 pt-5 pb-4 pr-14"><DialogTitle>{snapshot?.canManage ? "管理参与范围" : "查看参与名单"}</DialogTitle><DialogDescription className="mt-1">{snapshot?.roundName} · 范围调整仅影响本期。已有报名和匹配记录会保留。</DialogDescription></div>
        <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
          {snapshot?.canManage && <fieldset disabled={!canEdit} className="space-y-2">
            <legend className="mb-2 text-sm font-medium">报名范围</legend>
            {[{ value: false, label: "指定名单", hint: "只有名单中符合账号条件的用户可见并报名。" }, { value: true, label: "所有正常正式玩家", hint: "正式玩家自动获得资格；测试账号仍按下方名单参与。" }].map((option) => <label key={String(option.value)} className={cn("flex cursor-pointer gap-3 rounded-lg border border-border p-3 text-sm", enabled === option.value && "border-primary/40 bg-primary/5")}><input type="radio" name={`audience-${roundId}`} checked={enabled === option.value} onChange={() => setEnabled(option.value)} className="mt-0.5 accent-primary" /><span><span className="font-medium">{option.label}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{option.hint}</span></span></label>)}
          </fieldset>}
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">指定名单 · 已选 {memberIds.length} 人</h3><span className="text-xs text-muted-foreground">原名单中已参与的成员不可移除</span></div>
          {enabled && <p className="text-xs leading-relaxed text-muted-foreground">正式玩家不必逐一加入名单。此处保留指定成员，测试账号的参与资格由本名单决定。</p>}
          {!enabled && missingParticipants.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"><p>还有 {missingParticipants.length} 位已参与者不在当前名单，请保留他们后再保存，避免历史记录不可见。</p>{snapshot?.canManage && <Button type="button" size="sm" variant="outline" className="mt-2" disabled={!canEdit} onClick={() => setMemberIds((ids) => [...new Set([...ids, ...missingParticipants.map((member) => member.id)])])}>保留已参与者</Button>}</div>}
          <div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input aria-label="搜索名单" placeholder="搜索姓名或会员编号" value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-lg border border-input bg-background py-2.5 pl-9 pr-3 text-sm" /></div>
          <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border" aria-label="可参与成员名单">
            {visibleMembers.map((member) => {
              const checked = selected.has(member.id)
              const protectedMember = member.listed && member.participated
              const disabled = !canEdit || protectedMember || (!checked && !member.listed && !member.eligible && !member.participated)
              return <label key={member.id} className={cn("flex items-center gap-3 px-3 py-2.5 text-sm", disabled ? "cursor-default" : "cursor-pointer hover:bg-muted/25")}>
                {snapshot?.canManage && <input type="checkbox" aria-label={`允许 ${member.name}（${member.memberNumber ?? "无编号"}）参与`} checked={checked} disabled={disabled} onChange={(event) => setMemberIds((ids) => event.target.checked ? [...new Set([...ids, member.id])] : ids.filter((id) => id !== member.id))} className="size-4 shrink-0 accent-primary" />}
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{member.name}</span><span className="text-xs text-muted-foreground">{member.memberNumber ?? "无编号"}</span></span>
                <span className="flex shrink-0 flex-wrap justify-end gap-1 text-[10px] text-muted-foreground">{member.isTest && <span className="rounded bg-muted px-1.5 py-0.5">测试</span>}{member.participated && <span className="inline-flex items-center gap-1 rounded bg-primary/5 px-1.5 py-0.5"><ShieldCheck className="size-3" />已参与</span>}{!member.eligible && <span className="rounded bg-muted px-1.5 py-0.5">当前不可报名</span>}</span>
              </label>
            })}
            {!visibleMembers.length && <p className="p-5 text-center text-sm text-muted-foreground">没有符合搜索条件的成员。</p>}
          </div>
          {snapshot?.canManage && <label className="block text-sm font-medium">修改原因<textarea aria-label="修改原因" value={reason} onChange={(event) => setReason(event.target.value)} disabled={!canEdit} maxLength={500} rows={2} placeholder="请简要说明本次调整原因（4–500 字）" className="mt-2 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal" /></label>}
          {(error || notice) && <p role={error ? "alert" : "status"} className={cn("rounded-lg px-3 py-2 text-sm", error ? "bg-red-50 text-destructive" : "bg-primary/5 text-primary")}>{error || notice}</p>}
          {snapshot?.operations.length ? <details className="text-xs text-muted-foreground"><summary className="cursor-pointer py-1">页面操作记录</summary><ul className="mt-2 space-y-2">{snapshot.operations.map((operation) => <li key={operation.operationId}>{new Date(operation.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" })}（日本时间） · {operation.actorName} · {operation.enabled ? "所有正常正式玩家" : "指定名单"} · 名单 {operation.listedCount} 人</li>)}</ul></details> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/15 px-5 py-3">
          <p className="text-xs text-muted-foreground">{pending ? "结果待核对，沿用原保存编号。" : snapshot?.canManage ? changed ? !reasonValid ? "填写修改原因后保存。" : "保存后立即更新本期参与范围。" : "当前没有范围或名单改动。" : "当前为只读查看。"}</p>
          <div className="flex gap-2"><Button type="button" variant="ghost" size="sm" disabled={busy || !!pending} onClick={reload}>重新读取</Button>{(snapshot?.canManage || pending) && <Button type="button" size="sm" disabled={busy || (!pending && (!canEdit || !changed || !reasonValid || (!enabled && missingParticipants.length > 0)))} onClick={persist}><Check className="size-3.5" />{busy ? "处理中…" : pending ? "核对上次保存" : "保存参与范围"}</Button>}</div>
        </div>
      </DialogContent>
    </Dialog>
  </section>
}
