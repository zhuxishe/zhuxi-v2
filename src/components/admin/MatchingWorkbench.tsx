import { formatAdminDateTime } from "@/lib/admin-datetime"
import Link from "next/link"
import { ArrowRight, CalendarClock, CheckCircle2, Plus, Shuffle, Users, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/EmptyState"
import { getSurveyWindowState } from "@/lib/matching/survey-window"
import { getRoundPurpose } from "@/lib/matching/round-config"

interface Round {
  id: string
  round_name: string
  status: string
  survey_start: string
  survey_end: string
  activity_start: string
  activity_end: string
  purpose?: string
}

interface Session {
  id: string
  session_name: string | null
  total_candidates: number | null
  total_matched: number | null
  created_at: string
}

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "草稿", cls: "bg-muted text-muted-foreground" },
  open: { label: "开放中", cls: "bg-green-100 text-green-700" },
  scheduled: { label: "待开放", cls: "bg-muted text-muted-foreground" },
  expired: { label: "已到期", cls: "bg-yellow-100 text-yellow-700" },
  invalid: { label: "时间异常", cls: "bg-destructive/10 text-destructive" },
  closed: { label: "已截止", cls: "bg-yellow-100 text-yellow-700" },
  matched: { label: "已匹配", cls: "bg-blue-100 text-blue-700" },
}
export function MatchingWorkbench({ rounds, sessions }: { rounds: Round[]; sessions: Session[] }) {
  const current = rounds.find((r) => r.status === "open") ?? rounds[0]

  if (rounds.length === 0) {
    return (
      <div className="space-y-4">
        <Link href="/admin/matching/rounds/new">
          <Button><Plus className="mr-1 size-4" />新建轮次</Button>
        </Link>
        <EmptyState icon={Shuffle} title="暂无轮次" description="创建匹配问卷、固定时间活动报名或活动通知" />
      </div>
    )
  }
  return (
    <div className="grid gap-4 xl:grid-cols-[17rem_1fr_18rem]">
      <aside className="rounded-xl bg-card shadow-soft">
        <Header title="轮次与活动" actionHref="/admin/matching/rounds/new" />
        <div className="divide-y divide-border/70">
          {rounds.map((round) => (
            <RoundLink key={round.id} round={round} active={round.id === current?.id} />
          ))}
        </div>
      </aside>
      <section className="rounded-xl bg-card shadow-soft">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">{current?.round_name ?? "当前轮次"}</h2>
            <p className="text-xs text-muted-foreground">{purposeText(current?.purpose)} · 内容、问卷与提交记录均在详情内管理。</p>
          </div>
          {current && <StatusBadge status={getSurveyWindowState(current)} />}
        </header>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <InfoCard icon={CalendarClock} label="收集／展示截止（日本时间）" value={current ? formatAdminDateTime(current.survey_end) : "-"} />
          <InfoCard icon={Users} label="活动窗口" value={current ? `${shortDate(current.activity_start)} - ${shortDate(current.activity_end)}` : "-"} />
          <InfoCard icon={CheckCircle2} label="运行状态" value={current ? statusText(getSurveyWindowState(current)) : "-"} />
        </div>
        <div className="border-t border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">历史匹配记录</h3>
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">{sessions.length} 条</span>
          </div>
          <div className="divide-y divide-border/70 rounded-lg border border-border">
            {sessions.slice(0, 6).map((session) => (
              <Link key={session.id} href={`/admin/matching/${session.id}`} className="flex items-center justify-between gap-3 px-3 py-3">
                <span>
                  <span className="block text-sm font-semibold">{session.session_name ?? "未命名"}</span>
                  <span className="text-xs text-muted-foreground">{session.total_candidates ?? 0} 人参与 · {session.total_matched ?? 0} 人匹配</span>
                </span>
                <span className="text-xs text-muted-foreground">{formatAdminDateTime(session.created_at)}</span>
              </Link>
            ))}
            {sessions.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">还没有历史匹配记录</p>}
          </div>
        </div>
      </section>
      <aside className="space-y-4">
        <section className="rounded-xl bg-card p-4 shadow-soft">
          <h3 className="text-sm font-semibold">轮次动作</h3>
          <div className="mt-3 grid gap-2">
            <Link href={current ? `/admin/matching/rounds/${current.id}` : "/admin/matching"}>
              <Button className="w-full">进入轮次详情</Button>
            </Link>
            <Link href="/admin/matching/cancellations">
              <Button variant="outline" className="w-full">检查取消申请</Button>
            </Link>
            <Link href="/admin/matching/blacklist">
              <Button variant="outline" className="w-full">管理黑名单</Button>
            </Link>
          </div>
        </section>
        <section className="rounded-xl bg-card p-4 shadow-soft">
          <h3 className="text-sm font-semibold">运行前关注</h3>
          <CheckRow ok label="轮次状态清晰" />
          {getRoundPurpose(current?.purpose) === "matching" ? <>
            <CheckRow ok={current?.status === "closed"} label="问卷已截止后再运行" />
            <CheckRow ok label="Excel 导入需先补全性别" />
          </> : <CheckRow ok label={current?.purpose === "announcement" ? "通知只展示内容，无需填写" : "固定时间活动直接收集报名"} />}
        </section>
      </aside>
    </div>
  )
}
function Header({ title, actionHref }: { title: string; actionHref: string }) {
  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <Link href={actionHref} className="text-primary"><Plus className="size-4" /></Link>
    </header>
  )
}

function RoundLink({ round, active }: { round: Round; active: boolean }) {
  return (
    <Link href={`/admin/matching/rounds/${round.id}`} className={`block px-4 py-3 ${active ? "bg-bamboo-muted" : "hover:bg-muted/50"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{round.round_name}</span>
          <span className="block text-[11px] text-muted-foreground">{purposeText(round.purpose)}</span>
          <span className="text-xs text-muted-foreground">{shortDate(round.activity_start)} - {shortDate(round.activity_end)}</span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
      </div>
      <StatusBadge status={getSurveyWindowState(round)} className="mt-2" />
    </Link>
  )
}

function InfoCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-background/60 p-3"><Icon className="mb-3 size-4 text-primary" /><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>
}

function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const s = STATUS[status] ?? STATUS.draft
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${s.cls} ${className}`}>{s.label}</span>
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return <div className="mt-3 flex items-center gap-2 text-sm"><CheckCircle2 className={`size-4 ${ok ? "text-primary" : "text-gold"}`} /><span>{label}</span></div>
}

function statusText(status: string) { return STATUS[status]?.label ?? `未知状态（${status}）` }
function shortDate(value: string) { return new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Tokyo", month: "short", day: "numeric" }) }
function purposeText(purpose?: string) { return { matching: "收集时间后匹配", registration: "固定时间活动报名", announcement: "活动通知" }[getRoundPurpose(purpose)] }
