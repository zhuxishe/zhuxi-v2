import Link from "next/link"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchRounds } from "@/lib/queries/rounds"
import { fetchMatchSessions } from "@/lib/queries/matching"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/EmptyState"
import { Shuffle, Plus, ArrowRight } from "lucide-react"

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "bg-muted text-muted-foreground" },
  open: { label: "问卷进行中", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  closed: { label: "已截止", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  matched: { label: "已匹配", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
}

export default async function MatchingPage() {
  const admin = await requireAdmin()
  const [rounds, sessions] = await Promise.all([fetchRounds(), fetchMatchSessions()])

  return (
    <div>
      <AdminTopBar admin={admin} title="匹配管理" />
      <div className="p-6 space-y-6">
        {/* 轮次管理 */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">匹配轮次</h2>
            <Link href="/admin/matching/rounds/new">
              <Button size="sm"><Plus className="size-4 mr-1" />新建轮次</Button>
            </Link>
          </div>
          {rounds.length === 0 ? (
            <EmptyState icon={Shuffle} title="暂无轮次" description="创建匹配轮次，收集玩家问卷后运行匹配" />
          ) : (
            <div className="space-y-2">
              {rounds.slice(0, 5).map((r) => {
                const st = STATUS_LABELS[r.status] ?? STATUS_LABELS.draft
                return (
                  <Link key={r.id} href={`/admin/matching/rounds/${r.id}`}
                    className="block rounded-xl bg-card p-4 ring-1 ring-foreground/10 hover:ring-primary/30 transition-all">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{r.round_name}</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">活动 {r.activity_start} ~ {r.activity_end}</p>
                      </div>
                      <ArrowRight className="size-4 text-muted-foreground" />
                    </div>
                  </Link>
                )
              })}
              {rounds.length > 5 && (
                <Link href="/admin/matching/rounds" className="block text-center text-sm text-primary hover:underline py-2">
                  查看全部 {rounds.length} 个轮次
                </Link>
              )}
            </div>
          )}
        </section>

        {/* 旧匹配记录 */}
        {sessions.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-3">匹配记录</h2>
            <div className="space-y-2">
              {sessions.map((s) => (
                <Link key={s.id} href={`/admin/matching/${s.id}`}
                  className="block rounded-xl bg-card p-4 ring-1 ring-foreground/10 hover:ring-primary/30 transition-all">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{s.session_name ?? "未命名"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s.total_candidates} 人参与 · {s.total_matched} 人匹配
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString("zh-CN")}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
