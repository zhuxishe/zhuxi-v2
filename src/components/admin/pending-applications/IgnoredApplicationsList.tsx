"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowUpRight, ChevronLeft, ChevronRight, EyeOff, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatAdminDateTime } from "@/lib/admin-datetime"
import type { IgnoredApplicationItem, IgnoredApplicationsPage } from "@/types/pending-applications"
import { ApplicationIgnoreDialog } from "./ApplicationIgnoreDialog"

interface Props {
  applications: IgnoredApplicationsPage
  search: string
  pendingPage: number
}

export function IgnoredApplicationsList({ applications, search, pendingPage }: Props) {
  const router = useRouter()
  const [target, setTarget] = useState<IgnoredApplicationItem | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const totalPages = Math.max(1, Math.ceil(applications.total / applications.pageSize))

  function pageUrl(page: number) {
    const params = new URLSearchParams()
    if (search) params.set("search", search)
    if (pendingPage > 1) params.set("page", String(pendingPage))
    if (page > 1) params.set("ignoredPage", String(page))
    const query = params.toString()
    return `/admin/members/pending${query ? `?${query}` : ""}#ignored-applications`
  }

  return (
    <section id="ignored-applications" aria-labelledby="ignored-applications-title" className="scroll-mt-6 space-y-4 border-t border-border pt-6">
      <header>
        <h2 id="ignored-applications-title" className="text-lg font-semibold">已忽略<span className="ml-2 rounded-full bg-muted px-2.5 py-0.5 text-sm font-medium tabular-nums text-muted-foreground">{applications.total} 人</span></h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{search ? "以下为符合搜索条件的已忽略申请。" : "已忽略的申请不计入待处理人数。"}可查看操作记录，或填写说明恢复待处理。</p>
      </header>
      {notice ? <p role="status" className="rounded-xl border border-primary/15 bg-bamboo-muted/50 px-4 py-3 text-sm font-medium text-primary">{notice}</p> : null}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        {applications.items.length ? <ul aria-label="已忽略申请名单">
          {applications.items.map((item) => <li key={item.id} className="space-y-3 border-b border-border/60 p-4 last:border-0 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Link href={`/admin/members/${item.id}`} className="break-words font-semibold underline-offset-4 hover:text-primary hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-primary">{item.fullName || "未填写姓名"}</Link>
                <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{item.nickname ? `${item.nickname} · ` : ""}{item.schoolName || "未填写学校"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/members/${item.id}`} className="inline-flex min-h-10 items-center gap-0.5 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">查看资料<ArrowUpRight className="size-3.5" aria-hidden="true" /></Link>
                <Button type="button" variant="outline" className="min-h-10" onClick={() => setTarget(item)}><RotateCcw className="size-4" aria-hidden="true" />恢复待处理</Button>
              </div>
            </div>
            <dl className="grid gap-x-6 gap-y-2 rounded-xl bg-muted/40 px-3 py-3 text-sm sm:grid-cols-2">
              <div className="flex flex-wrap gap-x-3 gap-y-1"><dt className="text-xs leading-5 text-muted-foreground">操作人</dt><dd className="break-words text-xs leading-5">{item.ignoredByName}</dd></div>
              <div className="flex flex-wrap gap-x-3 gap-y-1"><dt className="text-xs leading-5 text-muted-foreground">忽略时间</dt><dd className="text-xs leading-5"><time dateTime={item.ignoredAt}>{formatAdminDateTime(item.ignoredAt)}</time>（日本时间）</dd></div>
              <div className="sm:col-span-2"><dt className="text-xs leading-5 text-muted-foreground">备注</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{item.ignoreReason}</dd></div>
            </dl>
          </li>)}
        </ul> : <div className="flex flex-col items-center px-6 py-12 text-center">
          <EyeOff className="mb-3 size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">{search ? "未找到符合条件的已忽略申请" : "暂无已忽略申请"}</p>
        </div>}
      </div>
      {totalPages > 1 ? <nav aria-label="已忽略申请分页" className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">共 {applications.total} 条，第 {applications.page}/{totalPages} 页</p>
        <div className="flex gap-2">
          {applications.page > 1 ? <Link href={pageUrl(applications.page - 1)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 hover:bg-muted"><ChevronLeft className="size-4" aria-hidden="true" />上一页</Link> : null}
          {applications.page < totalPages ? <Link href={pageUrl(applications.page + 1)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 hover:bg-muted">下一页<ChevronRight className="size-4" aria-hidden="true" /></Link> : null}
        </div>
      </nav> : null}
      {target ? <ApplicationIgnoreDialog mode="restore" target={target} onClose={() => setTarget(null)} onSuccess={() => {
        setNotice(`${target.fullName || "该申请人"}已恢复待处理，待处理人数已更新。`)
        setTarget(null)
        router.refresh()
      }} /> : null}
    </section>
  )
}
