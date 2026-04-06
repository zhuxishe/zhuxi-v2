import Link from "next/link"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchRounds } from "@/lib/queries/rounds"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/EmptyState"
import { Shuffle, Plus } from "lucide-react"

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "bg-muted text-muted-foreground" },
  open: { label: "问卷进行中", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  closed: { label: "问卷已截止", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  matched: { label: "已匹配", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
}

export default async function RoundsPage() {
  const admin = await requireAdmin()
  const rounds = await fetchRounds()

  return (
    <div>
      <AdminTopBar admin={admin} title="匹配轮次" />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">共 {rounds.length} 个轮次</p>
          <Link href="/admin/matching/rounds/new">
            <Button size="sm"><Plus className="size-4 mr-1" />新建轮次</Button>
          </Link>
        </div>

        {rounds.length === 0 ? (
          <EmptyState icon={Shuffle} title="暂无轮次" description="创建第一个匹配轮次来开始" />
        ) : (
          <div className="space-y-2">
            {rounds.map((r) => {
              const st = STATUS_LABELS[r.status] ?? STATUS_LABELS.draft
              return (
                <Link
                  key={r.id}
                  href={`/admin/matching/rounds/${r.id}`}
                  className="block rounded-xl bg-card p-4 ring-1 ring-foreground/10 hover:ring-primary/30 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{r.round_name}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${st.color}`}>
                          {st.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        活动 {r.activity_start} ~ {r.activity_end}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
