"use client"

import { useRef, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { importRoundExcel } from "@/app/admin/matching/rounds/[id]/import-actions"
import type { ImportSummary } from "@/lib/matching/round-import-types"

interface Props {
  roundId: string
  roundStatus: string
}

export function RoundImportPanel({ roundId, roundStatus }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState("")
  const [error, setError] = useState("")
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [isPending, startTransition] = useTransition()

  const disabled = roundStatus === "matched"

  function handleImport() {
    const file = inputRef.current?.files?.[0]
    if (!file) { setError("请先选择 .xlsx 文件"); return }
    const formData = new FormData()
    formData.set("file", file)
    startTransition(async () => {
      setError("")
      const res = await importRoundExcel(roundId, formData)
      if (res.error) setError(res.error)
      else setSummary(res.summary ?? null)
    })
  }

  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">导入 Excel</h3>
          <p className="text-xs text-muted-foreground">仅支持 Google 表格导出的 .xlsx，导入会覆盖当前轮次现有问卷。</p>
        </div>
        <Button size="sm" variant="outline" onClick={handleImport} disabled={disabled || isPending}>
          {isPending ? "导入中..." : "开始导入"}
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        disabled={disabled || isPending}
        onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2"
      />

      {fileName && <p className="text-xs text-muted-foreground">已选择：{fileName}</p>}
      {disabled && <p className="text-xs text-muted-foreground">已匹配轮次禁止再次导入。</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {summary && (
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-5">
          <span>总行数 {summary.totalRows}</span>
          <span>复用成员 {summary.currentCount}</span>
          <span>legacy 补强 {summary.legacyCount}</span>
          <span>temp 成员 {summary.tempCount}</span>
          <span>warning {summary.warningCount}</span>
        </div>
      )}
    </div>
  )
}
