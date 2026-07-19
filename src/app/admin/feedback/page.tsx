import Link from "next/link"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { PlayerFeedbackStatusForm } from "@/components/admin/PlayerFeedbackStatusForm"
import { requireAdmin } from "@/lib/auth/admin"
import {
  PLAYER_FEEDBACK_CATEGORY_LABELS,
  PLAYER_FEEDBACK_STATUS_LABELS,
} from "@/lib/player-feedback/constants"
import { fetchPlayerFeedbackAdminState } from "@/lib/queries/player-feedback"
import { PLAYER_FEEDBACK_STATUSES } from "@/types/player-feedback"
import type { PlayerFeedbackStatus } from "@/types/player-feedback"

const FILTERS: Array<{ label: string; value?: PlayerFeedbackStatus }> = [
  { label: "全部" },
  { label: "待处理", value: "pending" },
  { label: "处理中", value: "in_progress" },
  { label: "已完成", value: "completed" },
]

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const admin = await requireAdmin()
  const params = await searchParams
  const requestedStatus = params.status
  const status = PLAYER_FEEDBACK_STATUSES.find((item) => item === requestedStatus)
  const requestedPage = Number.parseInt(params.page ?? "1", 10)
  const { feedback, setupRequired, total, page, pageSize } = await fetchPlayerFeedbackAdminState(
    status,
    Number.isFinite(requestedPage) ? requestedPage : 1,
  )
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div>
      <AdminTopBar admin={admin} title="玩家反馈" />
      <main className="space-y-5 p-6">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => {
            const active = filter.value === status || (!filter.value && !status)
            return (
              <Link
                key={filter.label}
                href={filter.value ? `/admin/feedback?status=${filter.value}` : "/admin/feedback"}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground ring-1 ring-border"}`}
              >
                {filter.label}
              </Link>
            )
          })}
        </div>

        {setupRequired ? (
          <div className="rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-800">
            数据库尚未应用 player_feedback migration，升级前暂不能接收和处理反馈。
          </div>
        ) : feedback.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card px-4 py-14 text-center text-sm text-muted-foreground">
            当前筛选条件下暂无玩家反馈
          </div>
        ) : (
          <div className="space-y-4">
            {feedback.map((item) => (
              <article key={item.id} className="space-y-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{item.member_name_snapshot}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date(item.created_at))}
                      {` · ${item.locale.toUpperCase()} · ${item.page_path}`}
                    </p>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="rounded-full bg-muted px-2.5 py-1">{PLAYER_FEEDBACK_CATEGORY_LABELS[item.category]}</span>
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">{PLAYER_FEEDBACK_STATUS_LABELS[item.status]}</span>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{item.content}</p>
                <PlayerFeedbackStatusForm
                  key={`${item.id}:${item.updated_at}`}
                  feedbackId={item.id}
                  status={item.status}
                  adminNote={item.admin_note}
                  updatedAt={item.updated_at}
                />
              </article>
            ))}
            {totalPages > 1 && (
              <nav aria-label="反馈分页" className="flex items-center justify-between rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
                <PageLink page={page - 1} status={status} disabled={page <= 1}>上一页</PageLink>
                <span className="text-sm text-muted-foreground">第 {page} / {totalPages} 页 · 共 {total} 条</span>
                <PageLink page={page + 1} status={status} disabled={page >= totalPages}>下一页</PageLink>
              </nav>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function PageLink({
  page,
  status,
  disabled,
  children,
}: {
  page: number
  status?: PlayerFeedbackStatus
  disabled: boolean
  children: React.ReactNode
}) {
  const href = `/admin/feedback?${new URLSearchParams({
    ...(status ? { status } : {}),
    page: String(page),
  })}`
  if (disabled) return <span className="rounded-lg px-3 py-2 text-sm text-muted-foreground/45">{children}</span>
  return <Link href={href} className="rounded-lg px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10">{children}</Link>
}
