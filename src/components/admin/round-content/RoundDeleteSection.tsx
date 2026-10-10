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
  hasMatches: boolean
  busy: boolean
}

export function RoundDeleteSection({ roundId, roundName, revision, canDelete, hasMatches, busy }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const blocked = !canDelete || hasMatches || busy

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (blocked || pending || confirmation !== roundName) return
    setPending(true)
    setError(null)
    try {
      const result = await deleteRound(roundId, confirmation, revision)
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
    setError(null)
  }

  return <section className="space-y-3 rounded-xl border border-destructive/20 bg-card p-5" aria-labelledby="round-delete-heading">
    <div>
      <h2 id="round-delete-heading" className="font-semibold">删除活动／轮次</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">删除后将从活动入口移除，并停止报名与互评。已有报名数据会保留，页面不提供恢复功能。</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">已有匹配记录、评分或举报的活动不可删除。</p>
    </div>
    {!canDelete && <p className="text-xs text-muted-foreground">仅超级管理员可以删除。</p>}
    {hasMatches && <p className="text-xs text-muted-foreground">本期已有匹配记录，不能删除。</p>}
    {busy && <p className="text-xs text-muted-foreground">请先保存当前修改，再删除活动。</p>}
    <Button type="button" variant="outline" disabled={blocked || pending} className="text-destructive hover:bg-destructive/5 hover:text-destructive" onClick={() => setOpen(true)}><Trash2 className="mr-1 size-4" />删除活动／轮次</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!value) close() }}>
      <DialogContent showCloseButton={!pending}>
        <DialogTitle>确认删除「{roundName}」？</DialogTitle>
        <DialogDescription>删除后玩家将无法继续报名或互评，该活动也会从匹配管理中移除。已有报名数据保留，此页面无法恢复。</DialogDescription>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-2 text-sm"><span>请输入完整活动名称以确认</span><input autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={pending} className="w-full rounded-lg border bg-background px-3 py-2" /></label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close} disabled={pending}>取消</Button>
            <Button type="submit" variant="destructive" disabled={blocked || pending || confirmation !== roundName}>{pending ? "删除中…" : "确认删除"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </section>
}
