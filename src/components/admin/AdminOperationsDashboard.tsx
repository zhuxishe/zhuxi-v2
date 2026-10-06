import { formatAdminDateTime } from "@/lib/admin-datetime"
import type { MemberOverviewMetrics } from "@/lib/queries/member-overview"
import Link from "next/link"
import { ArrowRight, ClipboardList, Clock, Plus, Shuffle, UserCheck, Users, type LucideIcon } from "lucide-react"
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
  metrics,
  canViewLegacy,
}: {
  stats: Stats
  rounds: Round[]
  sessions: Session[]
  metrics: MemberOverviewMetrics | null
  canViewLegacy: boolean
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Metric icon={Users} label="总成员" value={stats.total} />
        <Metric icon={Clock} label="待处理申请" value={stats.pending} tone="gold" href="/admin/members/pending" />
        <Metric icon={Shuffle} label="开放轮次" value={rounds.filter((r) => r.status === "open").length} tone="green" />
        <Metric icon={ClipboardList} label="匹配记录" value={matchedSessions} tone="sky" />
        <GenderMetric metrics={metrics} />
        <LegacyMetric metrics={metrics} canViewLegacy={canViewLegacy} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.08fr_.92fr]">
        <section className="rounded-xl bg-card shadow-soft">
          <Header title="处理队列" badge={stats.pending > 0 ? "需要跟进" : "暂无积压"} />
          <QueueRow title={`${stats.pending} 位成员等待审核`} desc={`${stats.approved} 位已通过，${stats.rejected} 位已拒绝`} href="/admin/members/pending" />
          <QueueRow title="取消申请与黑名单" desc="匹配轮次运行前建议先检查边界问题" href="/admin/matching/cancellations" />
          <QueueRow title="问卷配置" desc="标签和问题会直接影响玩家端问卷体验" href="/admin/quiz-config" />
        </section>

        <section className="rounded-xl bg-card shadow-soft">
          <Header title="当前轮次" badge={activeRound ? statusLabel(activeRound.status) : "未创建"} />
          {activeRound ? (
            <Link href={`/admin/matching/rounds/${activeRound.id}`} className="block p-4">
              <p className="text-sm font-semibold">{activeRound.round_name}</p>
              <p className="mt-1 text-xs text-muted-foreground">问卷截止：{formatAdminDateTime(activeRound.survey_end)}</p>
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

function GenderMetric({ metrics }: { metrics: MemberOverviewMetrics | null }) {
  const total = metrics ? metrics.maleCount + metrics.femaleCount : 0
  const malePercent = metrics && total > 0 ? metrics.maleCount / total * 100 : 0
  const description = metrics && total > 0
    ? `男 ${metrics.maleCount} 人，占 ${malePercent.toFixed(1)}%；女 ${metrics.femaleCount} 人，占 ${(100 - malePercent).toFixed(1)}%`
    : "暂无已填写男女性别的正式成员"

  return (
    <div className="rounded-xl bg-card p-4 shadow-soft">
      <div className="flex items-center gap-2 text-xs text-muted-foreground" title="仅统计账号正常、审核通过且已填写男/女的当前成员；不计官方账号">
        <Users aria-hidden="true" className="size-4 text-primary" />
        <span>男女比例</span>
      </div>
      {metrics ? (
        total > 0 ? (
          <>
            <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-lg font-semibold">
              <span>男 {metrics.maleCount}</span><span>女 {metrics.femaleCount}</span>
            </p>
            <div role="img" aria-label={description} title={description} className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
              <span className="h-full bg-primary" style={{ width: `${malePercent}%` }} />
              <span className="h-full bg-gold" style={{ width: `${100 - malePercent}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{malePercent.toFixed(1)}% : {(100 - malePercent).toFixed(1)}%</p>
          </>
        ) : <strong title={description} className="mt-3 block text-3xl leading-none">—</strong>
      ) : <p className="mt-3 text-sm text-muted-foreground">读取失败</p>}
    </div>
  )
}

function LegacyMetric({ metrics, canViewLegacy }: { metrics: MemberOverviewMetrics | null; canViewLegacy: boolean }) {
  const content = (
    <>
      <div className="flex items-center gap-2 text-xs text-muted-foreground" title="已激活：关联老用户名单、账号正常且曾成功登录">
        <UserCheck aria-hidden="true" className="size-4 text-primary" />
        <span>老用户状态</span>
        {canViewLegacy && <ArrowRight aria-hidden="true" className="ml-auto size-4 transition-transform group-hover:translate-x-0.5" />}
      </div>
      {metrics ? (
        <strong className="mt-3 block text-3xl leading-none text-primary">{metrics.legacyActivated}<span className="text-lg text-muted-foreground"> / {metrics.legacyTotal}</span></strong>
      ) : <p className="mt-3 text-sm text-muted-foreground">读取失败</p>}
      <p className="mt-2 text-xs text-muted-foreground">已激活 / 老用户名单</p>
      {!canViewLegacy && <p className="mt-1 text-[11px] text-muted-foreground">名单仅超级管理员可查看</p>}
    </>
  )

  return canViewLegacy ? (
    <Link href="/admin/members/legacy" aria-label="老用户状态，查看名单" className="group block rounded-xl bg-card p-4 shadow-soft ring-1 ring-transparent transition-colors hover:bg-bamboo-muted/50 hover:ring-primary/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
      {content}
    </Link>
  ) : <div className="rounded-xl bg-card p-4 shadow-soft">{content}</div>
}

function Metric({ icon: Icon, label, value, tone = "default", href }: { icon: LucideIcon; label: string; value: number; tone?: "default" | "green" | "gold" | "sky"; href?: string }) {
  const toneClass = tone === "green" ? "text-primary" : tone === "gold" ? "text-gold" : tone === "sky" ? "text-sky" : "text-foreground"
  const content = (
    <>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`size-4 ${toneClass}`} />
        <span>{label}</span>
        {href && <ArrowRight aria-hidden="true" className="ml-auto size-4 transition-transform group-hover:translate-x-0.5" />}
      </div>
      <strong className={`mt-3 block text-3xl leading-none ${toneClass}`}>{value}</strong>
    </>
  )
  return href ? (
    <Link href={href} aria-label={`${label} ${value} 人，查看并处理`} className="group block rounded-xl bg-card p-4 shadow-soft ring-1 ring-transparent transition-colors hover:bg-bamboo-muted/50 hover:ring-primary/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
      {content}
    </Link>
  ) : <div className="rounded-xl bg-card p-4 shadow-soft">{content}</div>
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
  return ({ draft: "草稿", open: "问卷进行中", closed: "已截止", matched: "已匹配" } as Record<string, string>)[status] ?? `未知状态（${status}）`
}
