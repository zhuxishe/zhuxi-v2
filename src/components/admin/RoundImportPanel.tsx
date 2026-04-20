"use client"

import { useRef, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { importRoundExcel, previewRoundExcel } from "@/app/admin/matching/rounds/[id]/import-actions"
import { RoundImportPreview } from "./RoundImportPreview"
import type { ImportPreviewRow, ImportSummary, LegacyOption } from "@/lib/matching/round-import-types"

interface Props {
  roundId: string
  roundStatus: string
}

export function RoundImportPanel({ roundId, roundStatus }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState("")
  const [error, setError] = useState("")
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([])
  const [legacyOptions, setLegacyOptions] = useState<LegacyOption[]>([])
  const [legacyOverrides, setLegacyOverrides] = useState<Record<string, string>>({})
  const [isPreviewing, startPreview] = useTransition()
  const [isImporting, startImport] = useTransition()
  const disabled = roundStatus === "matched"

  function buildFormData() {
    const file = inputRef.current?.files?.[0]
    if (!file) return null
    const formData = new FormData()
    formData.set("file", file)
    return formData
  }

  function resetPreview() {
    setPreviewRows([])
    setLegacyOptions([])
    setLegacyOverrides({})
    setSummary(null)
  }

  function handlePreview() {
    const formData = buildFormData()
    if (!formData) { setError("请先选择 .xlsx 文件"); return }
    startPreview(async () => {
      setError("")
      setSummary(null)
      const res = await previewRoundExcel(roundId, formData)
      if (res.error) { resetPreview(); setError(res.error); return }
      setPreviewRows(res.rows ?? [])
      setLegacyOptions(res.legacyOptions ?? [])
      setLegacyOverrides({})
    })
  }

  function handleImport() {
    const formData = buildFormData()
    if (!formData) { setError("请先选择 .xlsx 文件"); return }
    formData.set("legacyOverrides", JSON.stringify(legacyOverrides))
    startImport(async () => {
      setError("")
      const res = await importRoundExcel(roundId, formData)
      if (res.error) { setError(res.error); return }
      setSummary(res.summary ?? null)
      setPreviewRows([])
      setLegacyOptions([])
      setLegacyOverrides({})
    })
  }

  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">导入 Excel</h3>
          <p className="text-xs text-muted-foreground">先解析预览，再手动指定老成员，最后才会覆盖当前轮次现有问卷。</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handlePreview} disabled={disabled || isPreviewing || isImporting}>
            {isPreviewing ? "解析中..." : "解析预览"}
          </Button>
          <Button size="sm" onClick={handleImport} disabled={disabled || isPreviewing || isImporting || previewRows.length === 0}>
            {isImporting ? "导入中..." : "确认导入"}
          </Button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        disabled={disabled || isPreviewing || isImporting}
        onChange={(event) => {
          setFileName(event.target.files?.[0]?.name ?? "")
          resetPreview()
          setError("")
        }}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2"
      />

      {fileName && <p className="text-xs text-muted-foreground">已选择：{fileName}</p>}
      {previewRows.length > 0 && (
        <RoundImportPreview
          rows={previewRows}
          legacyOptions={legacyOptions}
          overrides={legacyOverrides}
          onChange={(rowNumber, legacyId) => {
            const key = String(rowNumber)
            setLegacyOverrides((current) => {
              const next = { ...current }
              if (legacyId) next[key] = legacyId
              else delete next[key]
              return next
            })
          }}
        />
      )}
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
