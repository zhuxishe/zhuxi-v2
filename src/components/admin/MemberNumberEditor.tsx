"use client"

import { type FormEvent, useState, useTransition } from "react"
import { Hash, Save } from "lucide-react"
import { updateMemberNumber } from "@/app/admin/members/[id]/member-number/actions"
import { Button } from "@/components/ui/button"

interface MemberNumberEditorProps {
  memberId: string
  memberNumber: string | null
  canEdit: boolean
}

export function MemberNumberEditor({ memberId, memberNumber, canEdit }: MemberNumberEditorProps) {
  const initialValue = memberNumber ?? ""
  const [value, setValue] = useState(initialValue)
  const [savedValue, setSavedValue] = useState(initialValue)
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = value.trim()
    if (!normalized || normalized === savedValue) return
    if (!window.confirm(`确认将会员编号修改为“${normalized}”吗？`)) return

    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await updateMemberNumber(memberId, normalized, reason)
      if (!result.success) {
        setError(result.error)
        return
      }
      setValue(result.memberNumber)
      setSavedValue(result.memberNumber)
      setReason("")
      setMessage("会员编号已更新")
    })
  }

  return (
    <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10" aria-labelledby="member-number-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Hash className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="member-number-title" className="font-semibold">会员编号</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {canEdit
                ? "修改后会同步到会员端、后台检索和名单导入，并记录操作历史。"
                : "仅超级管理员可修改。"}
            </p>
          </div>
        </div>

        {canEdit ? (
          <form className="grid w-full max-w-xl gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" onSubmit={submit}>
            <label className="min-w-0">
              <span className="sr-only">会员编号</span>
              <input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                maxLength={64}
                disabled={pending}
                autoComplete="off"
                spellCheck={false}
                placeholder="输入会员编号"
                className="min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <label className="min-w-0">
              <span className="sr-only">修改原因</span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                disabled={pending}
                placeholder="修改原因（必填）"
                className="min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <Button type="submit" disabled={pending || !value.trim() || value.trim() === savedValue || reason.trim().length < 4}>
              <Save className="size-4" />
              {pending ? "保存中" : "保存"}
            </Button>
          </form>
        ) : (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm font-medium text-foreground">
            {memberNumber ?? "待分配"}
          </p>
        )}
      </div>

      {(error || message) && (
        <p role={error ? "alert" : "status"} className={`mt-3 rounded-lg px-3 py-2 text-sm ${error ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
          {error ?? message}
        </p>
      )}
    </section>
  )
}
