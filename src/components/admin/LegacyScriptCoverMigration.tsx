"use client"

import { DatabaseZap } from "lucide-react"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { migrateLegacyScriptCoverBatch } from "@/app/admin/scripts/legacy-cover-actions"
import { Button } from "@/components/ui/button"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"

interface Props {
  initialCount: number
  initialError: string | null
}

export function LegacyScriptCoverMigration({ initialCount, initialError }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [remaining, setRemaining] = useState(initialCount)
  const [reason, setReason] = useState("")
  const [progress, setProgress] = useState("")
  const [error, setError] = useState<string | null>(initialError)
  if (remaining === 0 && !error) return null

  function migrate() {
    setError(null)
    setProgress("正在准备迁移…")
    startTransition(async () => {
      let total = 0
      let compressed = 0
      for (let batch = 0; batch < 10; batch += 1) {
        const result = await migrateLegacyScriptCoverBatch(reason)
        total += result.migrated ?? 0
        compressed += result.compressed ?? 0
        if (typeof result.remaining === "number") setRemaining(result.remaining)
        if (result.error) {
          setError(result.error)
          setProgress(`已迁移 ${total} 个，原文件均保留`)
          return
        }
        setProgress(`已迁移 ${total} 个，剩余 ${result.remaining} 个`)
        if (result.remaining === 0) {
          setReason("")
          setProgress(`迁移完成：共 ${total} 个${compressed ? `，其中 ${compressed} 个转为 WebP` : ""}；原文件均保留`)
          router.refresh()
          return
        }
      }
      setError("迁移批次超过安全上限，请刷新页面后继续")
    })
  }

  return (
    <section className="rounded-xl border border-sky-300 bg-sky-50 p-4 text-sm text-sky-950">
      <div className="flex items-start gap-3">
        <DatabaseZap className="mt-0.5 size-5 shrink-0 text-sky-700" aria-hidden="true" />
        <div>
          <h2 className="font-semibold">一次性整理旧剧本封面</h2>
          <p className="mt-1 text-xs leading-5 text-sky-800">
            检测到 {remaining} 个旧封面。系统会复制到专用封面库，超过 5MB 的图片自动转为 WebP；原始受保护文件不会删除。
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="grid min-w-64 flex-1 gap-1 text-xs font-medium text-sky-900">
          迁移理由（必填）
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={4}
            maxLength={500}
            placeholder="例如：执行内容管理 V2 旧封面迁移"
            disabled={pending || remaining === 0}
            className="h-10 rounded-lg border border-sky-200 bg-white px-3 text-sm outline-none focus:border-primary"
          />
        </label>
        <Button type="button" onClick={migrate} disabled={pending || remaining === 0 || !adminAuditReasonIsValid(reason)}>
          {pending ? `迁移中（剩余 ${remaining}）` : `迁移 ${remaining} 个旧封面`}
        </Button>
      </div>
      {progress && <p role="status" className="mt-3 text-xs text-sky-800">{progress}</p>}
      {error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}
    </section>
  )
}
