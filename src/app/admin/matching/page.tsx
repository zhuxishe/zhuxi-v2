import Link from "next/link"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchMatchSessions } from "@/lib/queries/matching"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/EmptyState"
import { Shuffle } from "lucide-react"

export default async function MatchingPage() {
  const admin = await requireAdmin()
  const sessions = await fetchMatchSessions()

  return (
    <div>
      <AdminTopBar admin={admin} title="匹配管理" />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">共 {sessions.length} 个匹配批次</p>
          <Link href="/admin/matching/new">
            <Button>新建匹配</Button>
          </Link>
        </div>

        {sessions.length === 0 ? (
          <EmptyState
            icon={Shuffle}
            title="暂无匹配记录"
            description="创建第一个匹配批次来开始配对"
          />
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <Link
                key={s.id}
                href={`/admin/matching/${s.id}`}
                className="block rounded-xl bg-card p-4 ring-1 ring-foreground/10 hover:ring-primary/30 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{s.session_name ?? "未命名批次"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.total_candidates} 人参与 · {s.total_matched} 人匹配 · {s.total_unmatched} 人未匹配
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(s.created_at).toLocaleDateString("zh-CN")}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
