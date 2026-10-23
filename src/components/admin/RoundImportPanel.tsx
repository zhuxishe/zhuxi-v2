"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { cancelRoundImportRequest, getRoundImportReceipt, importRoundExcel, listRoundImports, previewRoundExcel } from "@/app/admin/matching/rounds/[id]/import-actions"
import { formatAdminDateTime } from "@/lib/admin-datetime"
import { RoundImportPreview } from "./RoundImportPreview"
import { clearRoundImportRequestId, readRoundImportRequestId, roundImportRequestId } from "./round-import-request"
import { roundImportFileError } from "./round-import-file"
import type { ImportChoices, ImportReceipt, ImportReview, ImportRowChoice } from "@/lib/matching/round-import-contract"

interface Props {
  roundId: string
  roundStatus: string
}

function requestStorage() {
  try { return sessionStorage } catch { return null }
}

function validReason(reason: string) {
  const length = Array.from(reason.trim()).length
  return length >= 4 && length <= 500
}

function mergeReceipts(current: ImportReceipt[], fetched: ImportReceipt[]) {
  const records = new Map(fetched.map((receipt) => [receipt.id, receipt]))
  for (const receipt of current) records.set(receipt.id, receipt)
  return [...records.values()].sort((a, b) => (b.completed_at || b.created_at).localeCompare(a.completed_at || a.created_at))
}

export function RoundImportHistory({ receipts }: { receipts: ImportReceipt[] }) {
  return <section className="space-y-2 border-t pt-3" aria-label="本轮 Excel 导入记录">
    <h4 className="text-sm font-semibold">本轮导入记录（{receipts.length}）</h4>
    {receipts.length === 0 && <p className="text-xs text-muted-foreground">尚无带导入编号的记录。历史答卷和匹配方案保持原样。</p>}
    {receipts.map((receipt) => <article key={receipt.id} className="space-y-1 rounded-md border p-3 text-xs">
      <p className="font-medium">{receipt.status === "succeeded" ? "导入完成" : "本次未写入"} · {formatAdminDateTime(receipt.completed_at || receipt.created_at)}</p>
      <p className="break-all text-muted-foreground">导入编号：{receipt.id}</p>
      <p className="whitespace-pre-wrap break-words text-muted-foreground">原因：{receipt.reason}</p>
      {receipt.status === "succeeded" ? <p className="text-muted-foreground">新增 {receipt.summary.insertedCount} · 更新 {receipt.summary.updatedCount} · 无变化 {receipt.summary.unchangedCount} · 临时成员 {receipt.summary.tempCount}</p> : <p className="text-destructive">{receipt.error_message || "导入未完成，本次没有写入成员或答卷。请重新预览后再导入。"}</p>}
      {receipt.summary.affectedBatchIds.length > 0 && <p className="break-all text-amber-800">使用旧资料的批次：{receipt.summary.affectedBatchIds.join("、")}。旧输入快照和方案仍保留。</p>}
    </article>)}
  </section>
}

export function RoundImportPanel({ roundId, roundStatus }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const attemptRef = useRef<{ requestId: string; planToken: string; reason: string } | null>(null)
  const [fileName, setFileName] = useState("")
  const [importReason, setImportReason] = useState("")
  const [recoveryReason, setRecoveryReason] = useState("")
  const [error, setError] = useState("")
  const [recordsError, setRecordsError] = useState("")
  const [review, setReview] = useState<ImportReview | null>(null)
  const [choices, setChoices] = useState<ImportChoices>({})
  const [receipts, setReceipts] = useState<ImportReceipt[]>([])
  const [lastReceipt, setLastReceipt] = useState<ImportReceipt | null>(null)
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null)
  const [canRetry, setCanRetry] = useState(false)
  const [isPreviewing, startPreview] = useTransition()
  const [isImporting, startImport] = useTransition()
  const [isChecking, startChecking] = useTransition()
  const disabled = roundStatus === "matched"
  const busy = isPreviewing || isImporting || isChecking
  const locked = disabled || busy || !!pendingRequestId
  const reasonLength = Array.from(importReason.trim()).length
  const reasonIsValid = validReason(importReason)
  const rowsHaveErrors = review?.rows.some((row) => row.errors.length > 0) ?? false

  useEffect(() => {
    let active = true
    const requestId = readRoundImportRequestId(roundId, requestStorage())
    void Promise.all([
      listRoundImports(roundId),
      requestId ? getRoundImportReceipt(roundId, requestId) : Promise.resolve({ receipt: null }),
    ]).then(([history, result]) => {
      if (!active) return
      if (history.error) setRecordsError(history.error)
      else setReceipts((current) => mergeReceipts(current, history.receipts ?? []))
      if (requestId) {
        if (result.receipt) {
          clearRoundImportRequestId(roundId, requestStorage(), requestId)
          setLastReceipt(result.receipt)
          const receipt = result.receipt
          setReceipts((current) => mergeReceipts(current, [receipt]))
        } else setPendingRequestId(requestId)
      }
    }).catch(() => {
      if (!active) return
      setRecordsError("导入记录暂时无法读取，请刷新状态。")
      if (requestId) setPendingRequestId(requestId)
    })
    return () => { active = false }
  }, [roundId])

  function acknowledge(receipt: ImportReceipt) {
    clearRoundImportRequestId(roundId, requestStorage(), receipt.id)
    attemptRef.current = null
    setCanRetry(false)
    setPendingRequestId(null)
    setLastReceipt(receipt)
    setReceipts((current) => [receipt, ...current.filter((item) => item.id !== receipt.id)])
    setReview(null)
    setChoices({})
    setRecoveryReason("")
    if (receipt.status === "succeeded") {
      setImportReason("")
      setError("")
      router.refresh()
    } else setError(receipt.error_message || "本次未写入，请重新预览后再导入。")
  }

  function resetPreview() {
    setReview(null)
    setChoices({})
    setLastReceipt(null)
  }

  function handleChoice(rowNumber: number, choice: ImportRowChoice) {
    setChoices((current) => ({ ...current, [String(rowNumber)]: choice }))
    setReview((current) => current ? { ...current, planToken: null } : null)
    setError("")
  }

  function handlePreview() {
    const existingRequestId = readRoundImportRequestId(roundId, requestStorage())
    if (existingRequestId) {
      setPendingRequestId(existingRequestId)
      setError("上次导入状态尚待确认，请先核对该编号。")
      return
    }
    const file = inputRef.current?.files?.[0]
    const fileError = roundImportFileError(file)
    if (fileError) { setError(fileError); return }
    if (!file) return
    const formData = new FormData()
    formData.set("file", file)
    formData.set("choices", JSON.stringify(choices))
    startPreview(async () => {
      setError("")
      setLastReceipt(null)
      try {
        const result = await previewRoundExcel(roundId, formData)
        if (result.error) { setReview(null); setError(result.error); return }
        setReview(result.review ?? null)
      } catch {
        setReview((current) => current ? { ...current, planToken: null } : null)
        setError("预览响应中断，请重新生成差异预览。")
      }
    })
  }

  async function submitAttempt(attempt: { requestId: string; planToken: string; reason: string }) {
    const formData = new FormData()
    formData.set("planToken", attempt.planToken)
    formData.set("requestId", attempt.requestId)
    formData.set("reason", attempt.reason)
    try {
      const result = await importRoundExcel(roundId, formData)
      if (result.receipt) { acknowledge(result.receipt); return }
      setError(result.error || "尚未收到导入回执，请核对状态或沿用原编号重试。")
    } catch {
      setError("导入响应中断，结果待确认。请核对回执或沿用原编号重试；不会重复新增。")
    }
  }

  function handleImport() {
    if (!reasonIsValid) { setError("请填写 4-500 个字符的导入原因"); return }
    if (!review?.planToken || rowsHaveErrors) { setError("请先完成身份和字段确认，并重新生成差异预览。"); return }
    const attempt = {
      requestId: roundImportRequestId(roundId, requestStorage(), () => crypto.randomUUID()),
      planToken: review.planToken,
      reason: importReason.trim(),
    }
    attemptRef.current = attempt
    setCanRetry(true)
    setPendingRequestId(attempt.requestId)
    startImport(async () => { setError(""); await submitAttempt(attempt) })
  }

  function handleRetry() {
    const attempt = attemptRef.current
    if (!attempt) return
    startImport(async () => { setError(""); await submitAttempt(attempt) })
  }

  function handleRefresh() {
    startChecking(async () => {
      setRecordsError("")
      try {
        const requestId = pendingRequestId || readRoundImportRequestId(roundId, requestStorage())
        const [history, result] = await Promise.all([
          listRoundImports(roundId),
          requestId ? getRoundImportReceipt(roundId, requestId) : Promise.resolve({ receipt: null }),
        ])
        if (history.error) setRecordsError(history.error)
        else setReceipts((current) => mergeReceipts(current, history.receipts ?? []))
        if (result.receipt) acknowledge(result.receipt)
        else if (requestId) {
          setPendingRequestId(requestId)
          setError("尚未查到此编号的回执。请稍后刷新，或填写原因后终止此编号再重新预览。")
        }
      } catch { setRecordsError("状态核对失败，请稍后刷新；当前待确认编号会继续保留。") }
    })
  }

  function handleCancelUnknown() {
    if (!pendingRequestId || !validReason(recoveryReason)) return
    const requestId = pendingRequestId
    startChecking(async () => {
      try {
        const result = await cancelRoundImportRequest(roundId, requestId, recoveryReason.trim())
        if (result.receipt) { acknowledge(result.receipt); return }
        setError(result.error || "尚未确认此编号已终止，请继续核对状态。")
      } catch { setError("终止编号的响应中断，请继续刷新状态；暂时不能新增导入。") }
    })
  }

  return <section className="relative z-10 space-y-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10" aria-label="Excel 追加更新导入">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-sm font-semibold">导入 Excel</h3><p className="text-xs text-muted-foreground">追加新答卷，按确认的差异更新已有答卷。未出现在 Excel 中的人和原有匹配方案会保留。</p></div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={handlePreview} disabled={locked}>{isPreviewing ? "解析中..." : review ? "更新差异预览" : "解析预览"}</Button>
        <Button size="sm" onClick={handleImport} disabled={locked || !review?.planToken || rowsHaveErrors || !reasonIsValid}>{isImporting ? "导入中..." : "确认导入"}</Button>
      </div>
    </div>
    <input ref={inputRef} type="file" accept=".xlsx" aria-label="选择 Excel 导入文件" disabled={locked} onChange={(event) => { setFileName(event.target.files?.[0]?.name ?? ""); resetPreview(); setError("") }} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2" />
    <p className="text-xs text-muted-foreground">仅支持 .xlsx，文件不超过 2 MB；较大表格可拆分后分别预览并追加导入。</p>
    {fileName && <p className="text-xs text-muted-foreground">已选择：{fileName}</p>}
    <div className="space-y-1.5">
      <label htmlFor={`round-import-reason-${roundId}`} className="text-sm font-medium">导入原因（必填）</label>
      <textarea id={`round-import-reason-${roundId}`} value={importReason} minLength={4} maxLength={500} required rows={3} disabled={locked} onChange={(event) => { setImportReason(event.target.value); setError("") }} placeholder="例如：根据活动报名表补录成员，并核对已有答卷的可用时间。" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" />
      <p className="text-xs text-muted-foreground">导入原因会随导入编号留存，供后续核对。{reasonLength}/500</p>
    </div>
    {pendingRequestId && <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="status">
      <p className="font-medium">导入状态待确认</p><p className="break-all">导入编号：{pendingRequestId}</p>
      <p>请先核对回执。页面刷新后只会保存此编号，文件内容和字段选择不会保存在浏览器存储中。</p>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={handleRefresh} disabled={busy}>核对导入状态</Button>{canRetry && <Button size="sm" variant="outline" onClick={handleRetry} disabled={busy}>沿用原编号重试</Button>}</div>
      <label className="block space-y-1"><span>终止待确认编号的原因（4–500 字）</span><textarea aria-label="终止待确认导入的原因" value={recoveryReason} minLength={4} maxLength={500} rows={2} disabled={busy} onChange={(event) => setRecoveryReason(event.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-foreground" /></label>
      <Button size="sm" variant="outline" onClick={handleCancelUnknown} disabled={busy || !validReason(recoveryReason)}>终止此编号，重新预览</Button>
      <p>系统会先核对是否已经完成；已完成时返回原回执，未完成时关闭此编号，防止迟到请求再次写入。</p>
    </div>}
    {review && <RoundImportPreview review={review} choices={choices} disabled={locked} onChange={handleChoice} />}
    {review && !review.planToken && <p className="text-xs text-muted-foreground">身份或字段选择有变化时，请点击“更新差异预览”。全部行通过校验后才能确认导入。</p>}
    {disabled && <p className="text-xs text-muted-foreground">已匹配轮次禁止再次导入；已有回执仍可核对。</p>}
    {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    {lastReceipt && <div className="space-y-1 rounded-md border p-3 text-xs" role="status">
      <p className="font-medium">{lastReceipt.status === "succeeded" ? "导入完成" : "本次未写入"}</p><p className="break-all text-muted-foreground">导入编号：{lastReceipt.id}</p>
      {lastReceipt.status === "succeeded" && <p>新增 {lastReceipt.summary.insertedCount} · 更新 {lastReceipt.summary.updatedCount} · 无变化 {lastReceipt.summary.unchangedCount}；未导入的原答卷仍保留。</p>}
    </div>}
    <div className="flex items-center justify-end"><Button size="sm" variant="outline" onClick={handleRefresh} disabled={busy}>{isChecking ? "核对中..." : "刷新导入记录"}</Button></div>
    {recordsError && <p className="text-xs text-destructive" role="alert">{recordsError}</p>}
    <RoundImportHistory receipts={receipts} />
  </section>
}
