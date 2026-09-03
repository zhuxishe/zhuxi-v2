"use client"

import { RefreshCw } from "lucide-react"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { retryContentMediaCleanupJob } from "@/app/admin/content-media-cleanup/actions"
import { Button } from "@/components/ui/button"
import type { ContentMediaCleanupJob } from "@/lib/content-media-cleanup"

export function ContentMediaCleanupJobs({ jobs }: { jobs: ContentMediaCleanupJob[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (jobs.length === 0) return null

  function retry(jobId: string) {
    setActiveId(jobId)
    setError(null)
    startTransition(async () => {
      const result = await retryContentMediaCleanupJob(jobId)
      if ("error" in result && result.error) {
        setError(result.error)
        setActiveId(null)
        return
      }
      setActiveId(null)
      router.refresh()
    })
  }

  return (
    <section className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <div>
        <h2 className="font-semibold">有 {jobs.length} 个托管文件清理任务待处理</h2>
        <p className="mt-1 text-xs">内容保存或永久删除已经完成；清理任务会保留在数据库中，刷新或重新登录后仍可安全重试。</p>
      </div>
      <ul className="space-y-2">
        {jobs.map((job) => (
          <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/70 p-3">
            <div className="min-w-0">
              <p className="font-mono text-xs">{job.content_id}</p>
              <p className="text-xs text-amber-800">{job.bucket_id} · {job.object_paths.length} 个文件{job.last_error ? " · 上次清理失败" : ""}</p>
            </div>
            <Button type="button" variant="destructive" size="sm" onClick={() => retry(job.id)} disabled={pending}>
              <RefreshCw className={`size-4 ${pending && activeId === job.id ? "animate-spin" : ""}`} />
              {pending && activeId === job.id ? "重试中..." : "重试清理"}
            </Button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </section>
  )
}
