import Link from "next/link"
import { ChevronDown, Trash2 } from "lucide-react"
import { formatAdminDateTime } from "@/lib/admin-datetime"
import type { DeletedRound, DeletedRoundPage } from "@/lib/queries/deleted-rounds"

interface Props {
  data: DeletedRoundPage | null
  canView: boolean
  expanded?: boolean
  error?: boolean
}

const PURPOSE_LABELS: Record<string, string> = {
  matching: "收集时间后匹配", registration: "固定时间活动报名", announcement: "活动通知",
}

export function DeletedRoundsTrash({ data, canView, expanded = false, error = false }: Props) {
  if (!canView) return <section className="rounded-xl border border-border/70 bg-card px-5 py-4">
    <h2 className="text-sm font-semibold">垃圾箱</h2>
    <p className="mt-1 text-xs text-muted-foreground">仅超级管理员可查看删除记录。</p>
  </section>

  return <details open={expanded} className="group rounded-xl border border-border/70 bg-card">
    <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
      <Trash2 aria-hidden="true" className="size-4 text-muted-foreground" />垃圾箱
      {data && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{data.total} 条</span>}
      <ChevronDown aria-hidden="true" className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" />
    </summary>
    <div className="space-y-4 border-t border-border/70 p-4 sm:p-5">
      <p className="text-xs leading-5 text-muted-foreground">查看已删除活动及删除信息，仅供核对。此处不提供恢复或永久清空操作。</p>
      {error || !data ? <p role="alert" className="text-sm text-destructive">暂时无法加载删除记录，请稍后刷新。</p>
        : data.items.length === 0 ? <p className="py-3 text-sm text-muted-foreground">暂无已删除活动。</p>
          : <>
            <ul className="space-y-3">{data.items.map((item) => <DeletedRoundCard key={item.id} item={item} />)}</ul>
            {data.totalPages > 1 && <nav aria-label="垃圾箱分页" className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <p className="text-muted-foreground">共 {data.total} 条，第 {data.page}／{data.totalPages} 页</p>
              <div className="flex gap-2">
                {data.page > 1 && <Link href={`/admin/matching?deletedPage=${data.page - 1}`} className="rounded-lg border px-3 py-2 hover:bg-muted">上一页</Link>}
                {data.page < data.totalPages && <Link href={`/admin/matching?deletedPage=${data.page + 1}`} className="rounded-lg border px-3 py-2 hover:bg-muted">下一页</Link>}
              </div>
            </nav>}
          </>}
    </div>
  </details>
}

function DeletedRoundCard({ item }: { item: DeletedRound }) {
  const missingMetadata = item.legacy ? "旧版未记录" : "未记录"
  return <li className="rounded-lg border border-border/70 bg-background/40 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h3 className="break-words text-sm font-semibold">{item.roundName}</h3>
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{PURPOSE_LABELS[item.purpose] ?? "未记录用途"}</span>
    </div>
    <p className="mt-1 text-xs text-muted-foreground">活动日期：{item.activityStart} — {item.activityEnd}</p>
    <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
      <div><dt className="text-muted-foreground">删除时间（日本时间）</dt><dd className="mt-1">{formatAdminDateTime(item.deletedAt)}</dd></div>
      <div><dt className="text-muted-foreground">删除时管理员账号</dt><dd className="mt-1 break-all">{item.deletedAdminEmail ?? missingMetadata}</dd></div>
      <div><dt className="text-muted-foreground">填写的执行人姓名</dt><dd className="mt-1 break-words">{item.executorName ?? missingMetadata}</dd></div>
      <div className="sm:col-span-2"><dt className="text-muted-foreground">删除原因</dt><dd className="mt-1 whitespace-pre-wrap break-words leading-5">{item.reason ?? missingMetadata}</dd></div>
    </dl>
    {item.legacy && <p className="mt-3 text-xs leading-5 text-muted-foreground">旧版删除记录，未记录执行人姓名／原因。</p>}
  </li>
}
