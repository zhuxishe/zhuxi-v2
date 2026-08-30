"use client"

import { useState, useTransition } from "react"
import { AlertTriangle, Ban, LockKeyhole, PlayCircle, SearchCheck, UserX } from "lucide-react"
import { useRouter } from "next/navigation"
import {
  anonymizeMemberAction,
  changeMemberAccountStatusAction,
  hardDeleteBlankMemberAction,
  preflightMemberLifecycleAction,
} from "@/app/admin/members/[id]/actions"
import { Button } from "@/components/ui/button"
import type { MemberLifecyclePreflight } from "@/types"
import { memberLifecycleAvailability } from "./member-center-utils"

interface Props {
  memberId: string
  memberName: string
  accountStatus: string | null
  anonymizedAt: string | null
}

function ImpactValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span>未返回</span>
  if (typeof value === "object") return <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(value, null, 2)}</pre>
  return <span>{String(value)}</span>
}

function accountStatusLabel(value: string | null) {
  if (value === "active") return "正常"
  if (value === "suspended") return "已暂停"
  if (value === "closed") return "已关闭"
  return value ?? "未设置"
}

/** Compatibility name retained; this is the account lifecycle control panel. */
export function MemberDeleteButton({ memberId, memberName, accountStatus, anonymizedAt }: Props) {
  const router = useRouter()
  const [impact, setImpact] = useState<MemberLifecyclePreflight | null>(null)
  const [reason, setReason] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function preflight() {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await preflightMemberLifecycleAction(memberId)
      if (!result.success) {
        setError(result.error)
        return
      }
      setImpact(result.impact)
    })
  }

  function changeStatus(status: "active" | "suspended" | "closed", label: string) {
    const warning = status === "closed"
      ? "关闭是终态，之后不能重新启用。关闭不会自动匿名化资料。确认继续吗？"
      : `确认${label}该账号吗？`
    if (!window.confirm(warning)) return
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await changeMemberAccountStatusAction({ memberId, accountStatus: status, reason })
      if (!result.success) {
        setError(result.error)
        return
      }
      setReason("")
      setImpact(null)
      setMessage(`${result.message} 再次操作前请重新运行影响预检。`)
      router.refresh()
    })
  }

  function anonymize() {
    const warning = anonymizedAt
      ? "数据库资料已匿名化；本次只重试封禁或删除残留的身份认证（Auth）用户，并写入完成标记。确认继续吗？"
      : "匿名化会改写个人资料、解除主档与身份认证账号的绑定、关闭账号并删除身份认证（Auth）用户。此操作不是简单删除，也不能通过本页撤销。确认继续吗？"
    if (!window.confirm(warning)) return
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await anonymizeMemberAction({ memberId, confirmation, reason })
      if (!result.success) {
        setError(result.error)
        if (result.partialState) router.refresh()
        return
      }
      setReason("")
      setConfirmation("")
      setImpact(null)
      setMessage(result.message)
      router.refresh()
    })
  }

  function hardDelete() {
    if (!window.confirm("仅允许删除后台建立、完全空白、未绑定且无任何业务关联的测试壳。成员主记录会被删除，但审计快照保留。确认继续吗？")) return
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await hardDeleteBlankMemberAction({ memberId, confirmation, reason })
      if (!result.success) {
        setError(result.error)
        return
      }
      setMessage(result.message)
      router.push("/admin/members")
      router.refresh()
    })
  }

  const ready = impact !== null && reason.trim().length >= 4 && !pending
  const availability = memberLifecycleAvailability(accountStatus, anonymizedAt)

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-5" aria-labelledby="member-lifecycle-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-800"><AlertTriangle className="size-5" aria-hidden="true" /></span>
          <div>
            <h2 id="member-lifecycle-title" className="font-semibold text-amber-950">账号生命周期与影响预检</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-amber-900">
              对“{memberName}”执行暂停、重新启用、关闭或匿名化前，先核对关联记录与阻断条件。关闭不是级联删除；匿名化是独立操作。
            </p>
            <p className="mt-2 text-xs leading-5 text-amber-900">
              当前本库状态：<strong>{accountStatusLabel(accountStatus)}</strong>；匿名化时间：<strong>{anonymizedAt ?? "未匿名化"}</strong>。
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={preflight} disabled={pending} className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100">
          <SearchCheck className="size-4" aria-hidden="true" />{pending ? "处理中" : "运行影响预检"}
        </Button>
      </div>

      <div className="mt-4 rounded-lg border border-amber-300 bg-white p-3 text-xs leading-5 text-amber-950">
        <strong>Supabase 身份认证（Auth）联动：</strong>若成员绑定了身份认证用户 ID（user_id），本页会先通过身份认证管理接口执行封禁或解封，再调用带管理员会话的数据库接口；数据库失败时会尝试恢复操作前的身份认证状态，补偿失败会明确报错且绝不按成功展示。
        暂停、恢复与关闭不会删除身份认证用户；匿名化会在数据库完成资料匿名化并解除主档账号绑定后，彻底删除身份认证用户。删除失败时，孤立账号会保持封禁并提示人工重试。
        身份认证封禁不会主动撤销已有会话，因此已关闭或已匿名化的数据库状态、路由检查与行级安全策略（RLS）仍是最终访问防线。未绑定身份认证账号的成员只更新本站数据库。
      </div>

      {impact ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-amber-200 bg-white p-3"><p className="text-xs font-semibold text-amber-900">关联记录计数</p><div className="mt-2 text-sm"><ImpactValue value={impact.counts} /></div></div>
          <div className="rounded-lg border border-amber-200 bg-white p-3"><p className="text-xs font-semibold text-amber-900">阻断条件</p><div className="mt-2 text-sm"><ImpactValue value={impact.blockers} /></div></div>
          <p className="md:col-span-2 text-xs text-amber-900">
            可暂停：{impact.can_suspend === true ? "是" : impact.can_suspend === false ? "否" : "未返回"}；
            可匿名化：{impact.can_anonymize === true ? "是" : impact.can_anonymize === false ? "否" : "未返回"}；
            可硬删除空白测试壳：{impact.can_hard_delete === true ? "是" : impact.can_hard_delete === false ? "否" : "未返回"}；
            身份认证账号清理待完成：{impact.auth_operation_required === true ? "是" : impact.auth_operation_required === false ? "否" : "未返回"}。
          </p>
        </div>
      ) : <p className="mt-4 text-xs text-amber-900">运行预检后才会启用生命周期操作。</p>}

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label className="block">
          <span className="text-xs font-semibold text-amber-950">操作原因（必填）</span>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} placeholder="说明暂停、恢复、关闭或匿名化的业务原因" className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400" disabled={pending} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-amber-950">匿名化或硬删除二次确认</span>
          <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={`输入完整成员唯一标识：${memberId}`} className="mt-1 min-h-10 w-full rounded-lg border border-amber-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-amber-400" disabled={pending} />
          <span className="mt-1 block break-all font-mono text-[10px] text-amber-900">{memberId}</span>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {availability.canSuspend ? <Button type="button" variant="outline" onClick={() => changeStatus("suspended", "暂停")} disabled={!ready || impact?.can_suspend === false}><Ban className="size-4" />暂停</Button> : null}
        {availability.canReactivate ? <Button type="button" variant="outline" onClick={() => changeStatus("active", "重新启用")} disabled={!ready}><PlayCircle className="size-4" />重新启用</Button> : null}
        {availability.canClose ? <Button type="button" variant="destructive" onClick={() => changeStatus("closed", "关闭")} disabled={!ready}><LockKeyhole className="size-4" />关闭（终态）</Button> : null}
        {availability.canAnonymize ? <Button type="button" variant="destructive" onClick={anonymize} disabled={!ready || impact?.can_anonymize === false || confirmation.trim() !== memberId}><UserX className="size-4" />匿名化并关闭</Button> : null}
        {Boolean(anonymizedAt) && impact?.auth_operation_required === true ? <Button type="button" variant="destructive" onClick={anonymize} disabled={!ready || confirmation.trim() !== memberId}><UserX className="size-4" />重试删除身份认证账号</Button> : null}
        {impact?.can_hard_delete === true ? <Button type="button" variant="destructive" onClick={hardDelete} disabled={!ready || confirmation.trim() !== memberId}><UserX className="size-4" />硬删除空白测试壳</Button> : null}
      </div>

      {error ? <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {message ? <p role="status" className="mt-4 rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-800">{message}</p> : null}
    </section>
  )
}
