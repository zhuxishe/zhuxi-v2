"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { deleteRound } from "@/app/admin/matching/rounds/[id]/delete-actions"

interface Props {
  roundId: string
  roundName: string
  revision: number
  canDelete: boolean
  adminAccount: string
  hasMatches: boolean
  busy: boolean
}

export function RoundDeleteSection({ roundId, roundName, revision, canDelete, adminAccount, hasMatches, busy }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState("")
  const [executorName, setExecutorName] = useState("")
  const [reason, setReason] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const blocked = !canDelete || !adminAccount || hasMatches || busy
  const executorLength = [...executorName.trim()].length
  const reasonLength = [...reason.trim()].length
  const complete = confirmation === roundName && executorLength >= 1 && executorLength <= 80 && reasonLength >= 2 && reasonLength <= 500

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (blocked || pending || !complete) return
    setPending(true)
    setError(null)
    try {
      const result = await deleteRound(roundId, confirmation, revision, executorName, reason, adminAccount)
      if (result.error) { setError(result.error); return }
      router.replace("/admin/matching")
      router.refresh()
    } catch {
      setError("网络异常，请重试；重复操作不会重复删除")
    } finally {
      setPending(false)
    }
  }

  function close() {
    if (pending) return
    setOpen(false)
    setConfirmation("")
    setExecutorName("")
    setReason("")
    setError(null)
  }

  return <section className="space-y-3 rounded-xl border border-destructive/20 bg-card p-5" aria-labelledby="round-delete-heading">
    <div>
      <h2 id="round-delete-heading" className="font-semibold">删除活动／轮次</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">删除后将从活动入口移除，并停止报名与互评。已有报名数据会保留，可在垃圾箱查看删除记录，暂不提供恢复功能。</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">已有匹配记录、评分或举报的活动不可删除。</p>
    </div>
    {!canDelete && <p className="text-xs text-muted-foreground">仅超级管理员可以删除。</p>}
    {canDelete && !adminAccount && <p className="text-xs text-muted-foreground">无法确认当前登录账号，请刷新页面后重试。</p>}
    {hasMatches && <p className="text-xs text-muted-foreground">本期已有匹配记录，不能删除。</p>}
    {busy && <p className="text-xs text-muted-foreground">请先保存当前修改，再删除活动。</p>}
    <Button type="button" variant="outline" disabled={blocked || pending} className="text-destructive hover:bg-destructive/5 hover:text-destructive" onClick={() => setOpen(true)}><Trash2 className="mr-1 size-4" />删除活动／轮次</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!value) close() }}>
      <DialogContent showCloseButton={!pending} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogTitle>确认删除「{roundName}」？</DialogTitle>
        <DialogDescription>删除后玩家将无法继续报名或互评。已有报名数据保留，删除记录可在匹配管理的垃圾箱查看，暂不提供恢复功能。</DialogDescription>
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-lg border bg-muted/40 px-3 py-3 text-sm"><p className="text-xs text-muted-foreground">当前登录管理员账号</p><p className="mt-1 break-all font-medium">{adminAccount}</p><p className="mt-1 text-xs text-muted-foreground">请确认这是本次操作使用的账号。</p></div>
          <label className="block space-y-2 text-sm"><span>请输入完整活动名称以确认</span><input required autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={pending} className="w-full rounded-lg border bg-background px-3 py-2" /></label>
          <label className="block space-y-2 text-sm"><span>本次执行人姓名</span><input required autoComplete="off" maxLength={80} placeholder="请填写本次实际执行人的姓名" value={executorName} onChange={(event) => setExecutorName(event.target.value)} disabled={pending} className="w-full rounded-lg border bg-background px-3 py-2" /></label>
          <label className="block space-y-2 text-sm"><span>删除原因</span><textarea required maxLength={500} rows={3} placeholder="请说明删除原因（2–500 个字符）" value={reason} onChange={(event) => setReason(event.target.value)} disabled={pending} className="w-full resize-y rounded-lg border bg-background px-3 py-2" /></label>
          <p className="text-xs text-muted-foreground">系统自动记录删除时间，垃圾箱按日本时间显示。</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close} disabled={pending}>取消</Button>
            <Button type="submit" variant="destructive" disabled={blocked || pending || !complete}>{pending ? "删除中…" : "确认删除"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </section>
}
