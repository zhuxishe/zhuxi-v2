import Link from "next/link"
import { ArrowRight, ClipboardList, Clock, Plus, Shuffle, Users, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Stats {
  total: number
  pending: number
  approved: number
  rejected: number
}

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

export function AdminOperationsDashboard({
  stats,
  rounds,
  sessions,
}: {
  stats: Stats
  rounds: Round[]
  sessions: Session[]
}) {
  const activeRound = rounds.find((r) => r.status === "open") ?? rounds[0]
  const matchedSessions = sessions.length

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl bg-bamboo-muted p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-primary">匹配轮次运营</p>
          <h2 className="heading-display mt-2 text-2xl">今天先看轮次，再处理队列</h2>
          <p className="mt-2 text-sm text-muted-foreground">成员审核、取消申请、问卷状态和运行匹配集中在这里。</p>
        </div>
        <Link href="/admin/matching/rounds/new">
          <Button><Plus className="mr-1 size-4" />新建轮次</Button>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Users} label="总成员" value={stats.total} />
        <Metric icon={Clock} label="待处理申请" value={stats.pending} tone="gold" />
        <Metric icon={Shuffle} label="开放轮次" value={rounds.filter((r) => r.status === "open").length} tone="green" />
        <Metric icon={ClipboardList} label="匹配记录" value={matchedSessions} tone="sky" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.08fr_.92fr]">
        <section className="rounded-xl bg-card shadow-soft">
          <Header title="处理队列" badge={stats.pending > 0 ? "需要跟进" : "暂无积压"} />
          <QueueRow title={`${stats.pending} 位成员等待审核`} desc={`${stats.approved} 位已通过，${stats.rejected} 位已拒绝`} href="/admin/members" />
          <QueueRow title="取消申请与黑名单" desc="匹配轮次运行前建议先检查边界问题" href="/admin/matching/cancellations" />
          <QueueRow title="问卷配置" desc="标签和问题会直接影响玩家端问卷体验" href="/admin/quiz-config" />
        </section>

        <section className="rounded-xl bg-card shadow-soft">
          <Header title="当前轮次" badge={activeRound ? statusLabel(activeRound.status) : "未创建"} />
          {activeRound ? (
            <Link href={`/admin/matching/rounds/${activeRound.id}`} className="block p-4">
              <p className="text-sm font-semibold">{activeRound.round_name}</p>
              <p className="mt-1 text-xs text-muted-foreground">问卷截止：{formatDate(activeRound.survey_end)}</p>
              <p className="mt-1 text-xs text-muted-foreground">活动窗口：{activeRound.activity_start} ~ {activeRound.activity_end}</p>
              <div className="mt-4 h-2 rounded-full bg-muted">
                <div className="h-full w-2/3 rounded-full bg-primary" />
              </div>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                进入轮次工作台 <ArrowRight className="size-3" />
              </span>
            </Link>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">还没有匹配轮次。</p>
          )}
        </section>
      </div>
    </div>
  )
}

function Metric({ icon: Icon, label, value, tone = "default" }: { icon: LucideIcon; label: string; value: number; tone?: "default" | "green" | "gold" | "sky" }) {
  const toneClass = tone === "green" ? "text-primary" : tone === "gold" ? "text-gold" : tone === "sky" ? "text-sky" : "text-foreground"
  return (
    <div className="rounded-xl bg-card p-4 shadow-soft">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`size-4 ${toneClass}`} />
        <span>{label}</span>
      </div>
      <strong className={`mt-3 block text-3xl leading-none ${toneClass}`}>{value}</strong>
    </div>
  )
}

function Header({ title, badge }: { title: string; badge: string }) {
  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{badge}</span>
    </header>
  )
}

function QueueRow({ title, desc, href }: { title: string; desc: string; href: string }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 last:border-b-0">
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground">{desc}</span>
      </span>
      <ArrowRight className="size-4 text-muted-foreground" />
    </Link>
  )
}

function statusLabel(status: string) {
  return ({ draft: "草稿", open: "问卷进行中", closed: "已截止", matched: "已匹配" } as Record<string, string>)[status] ?? status
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}
