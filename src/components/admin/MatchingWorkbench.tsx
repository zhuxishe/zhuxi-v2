import Link from "next/link"
import { ArrowRight, CalendarClock, CheckCircle2, Plus, Shuffle, Users, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/EmptyState"

interface Round {
  id: string
  round_name: string
  status: string
  survey_end: string
  activity_start: string
  activity_end: string
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
  open: { label: "问卷进行中", cls: "bg-green-100 text-green-700" },
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
        <EmptyState icon={Shuffle} title="暂无轮次" description="创建匹配轮次，收集玩家问卷后运行匹配" />
      </div>
    )
  }
  return (
    <div className="grid gap-4 xl:grid-cols-[17rem_1fr_18rem]">
      <aside className="rounded-xl bg-card shadow-soft">
        <Header title="匹配轮次" actionHref="/admin/matching/rounds/new" />
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
            <p className="text-xs text-muted-foreground">轮次优先，历史匹配保留为次级入口。</p>
          </div>
          {current && <StatusBadge status={current.status} />}
        </header>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <InfoCard icon={CalendarClock} label="问卷截止" value={current ? formatDate(current.survey_end) : "-"} />
          <InfoCard icon={Users} label="活动窗口" value={current ? `${shortDate(current.activity_start)} - ${shortDate(current.activity_end)}` : "-"} />
          <InfoCard icon={CheckCircle2} label="运行状态" value={current ? statusText(current.status) : "-"} />
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
                <span className="text-xs text-muted-foreground">{shortDate(session.created_at)}</span>
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
          <CheckRow ok={current?.status === "closed"} label="问卷已截止后再运行" />
          <CheckRow ok label="Excel 导入需先补全性别" />
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
          <span className="text-xs text-muted-foreground">{shortDate(round.activity_start)} - {shortDate(round.activity_end)}</span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
      </div>
      <StatusBadge status={round.status} className="mt-2" />
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

function statusText(status: string) { return STATUS[status]?.label ?? status }
function shortDate(value: string) { return new Date(value).toLocaleDateString("zh-CN", { month: "short", day: "numeric" }) }
function formatDate(value: string) { return new Date(value).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) }
