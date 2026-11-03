"use client"

import { useEffect, useRef, useState } from "react"
import { Download, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react"
import { previewBoardCsv, applyBoardCsv } from "@/app/admin/matching/[id]/board-actions"
import type { BoardCsvCounts, BoardCsvPreviewResult } from "@/lib/matching/board-csv-types"
import type { BoardDisplayRow, BoardDraft } from "@/lib/matching/board-types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { downloadMatchingBoardCsv, MatchingBoardCsvDownloadError } from "./matching-board-csv-download"

const MAX_BYTES = 1_500_000
const PAGE_SIZE = 25
interface Props {
  sessionId: string
  revisionToken: string
  publicationSignature: string
  boardFingerprint: string
  disabled: boolean
  onApplied: (value: { draft: BoardDraft; rows: BoardDisplayRow[] }) => void
  onStale: (message: string) => void
  onNotice: (message: string) => void
  onError?: (message: string) => void
}
interface FilePlan {
  name: string
  text: string
  revision: string
  fingerprint: string
  signature: string
  result?: BoardCsvPreviewResult
}

function countText(counts: BoardCsvCounts) {
  return `${counts.duoGroups} 对双人 · ${counts.multiGroups} 个多人组 · ${counts.matched} 人已匹配 · ${counts.unmatched} 人未匹配 · ${counts.waitingDuo + counts.waitingMulti} 人待安排`
}

/** CSV operations are read-only until the parent explicitly applies one complete local draft. */
export function MatchingBoardCsvAdjustment(props: Props) {
  const { sessionId, revisionToken, publicationSignature, boardFingerprint, disabled, onApplied, onStale, onNotice, onError } = props
  const input = useRef<HTMLInputElement>(null)
  const current = useRef(props)
  current.current = props
  const generation = useRef(0)
  const [downloading, setDownloading] = useState(false)
  const [stage, setStage] = useState<"idle" | "reading" | "checking" | "applying">("idle")
  const [opened, setOpened] = useState(false)
  const [file, setFile] = useState<FilePlan | null>(null)
  const [error, setError] = useState("")
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [issueLimit, setIssueLimit] = useState(PAGE_SIZE)
  const [warningLimit, setWarningLimit] = useState(PAGE_SIZE)
  const busy = stage !== "idle"
  const expired = !!file && (file.revision !== revisionToken || file.fingerprint !== boardFingerprint || file.signature !== publicationSignature || disabled)
  const preview = file?.result?.preview
  const canApply = !busy && !expired && !error && file?.result?.success === true && !!preview && !preview.unchanged && !file.result.error && !file.result.errors?.length

  useEffect(() => () => { generation.current++ }, [])
  const close = () => { generation.current++; setOpened(false); setStage("idle"); setFile(null); setError(""); setLimit(PAGE_SIZE); setIssueLimit(PAGE_SIZE); setWarningLimit(PAGE_SIZE) }
  const fresh = (plan: FilePlan, attempt: number) => {
    if (generation.current !== attempt) return false
    const live = current.current
    if (live.disabled || live.sessionId !== sessionId || live.revisionToken !== plan.revision || live.boardFingerprint !== plan.fingerprint || live.publicationSignature !== plan.signature) {
      setError("页面中的方案或编辑状态已变化，请处理当前调整后重新上传CSV。")
      return false
    }
    return true
  }
  const receive = (result: BoardCsvPreviewResult, plan: FilePlan) => {
    if (result.stale || (result.preview && result.preview.revisionToken !== plan.revision)) {
      const message = result.error || "已保存方案或报名资料已变化，请重新读取并下载最新模板。"
      setError(message); onStale(message)
      return false
    }
    setFile({ ...plan, result }); setError(result.error ?? "")
    if (!result.error && !result.errors?.length && (result.success !== true || !result.preview)) {
      setError("未能取得完整的CSV核对结果，请重新上传；当前匹配方案没有改变。")
      return false
    }
    return result.success === true && !result.error && !!result.preview && !result.errors?.length
  }
  const selectFile = async (selected: File) => {
    if (current.current.disabled || downloading || busy) return
    const plan: FilePlan = { name: selected.name, text: "", revision: revisionToken, fingerprint: boardFingerprint, signature: publicationSignature }
    const attempt = ++generation.current
    setOpened(true); setFile(plan); setError(""); setLimit(PAGE_SIZE); setIssueLimit(PAGE_SIZE); setWarningLimit(PAGE_SIZE); setStage("reading")
    try {
      if (!/\.csv$/i.test(selected.name)) { setError("请选择CSV文件；在Excel中请另存为「CSV UTF-8（逗号分隔）」。"); return }
      if (selected.size > MAX_BYTES) { setError("CSV文件超过1.5MB，请缩小文件后重新上传。"); return }
      let text: string
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(await selected.arrayBuffer()) }
      catch { if (generation.current === attempt) setError("无法读取UTF-8文字，请将文件另存为「CSV UTF-8（逗号分隔）」后重试。"); return }
      if (!fresh(plan, attempt)) return
      plan.text = text; setFile(plan); setStage("checking")
      const result = await previewBoardCsv({ sessionId, expectedRevision: plan.revision, csvText: text })
      if (fresh(plan, attempt)) receive(result, plan)
    } catch {
      if (generation.current === attempt) setError("暂时无法校验CSV，请重试；当前匹配方案没有改变。")
    } finally { if (generation.current === attempt) setStage("idle") }
  }
  const applyFile = async () => {
    if (!file || !canApply) return
    const plan = file, attempt = ++generation.current
    setStage("applying"); setError("")
    try {
      const result = await applyBoardCsv({ sessionId, expectedRevision: plan.revision, csvText: plan.text })
      if (!fresh(plan, attempt) || !receive(result, plan)) return
      if (result.preview!.unchanged) { onNotice("CSV与当前已保存方案一致，无需更新。"); return }
      onApplied({ draft: result.preview!.draft, rows: result.preview!.rows })
      onNotice("CSV方案已应用到页面草稿。请核对三个池子，填写操作理由后点击「保存调整」；本次尚未保存或发布。")
      close()
    } catch {
      if (generation.current === attempt) setError("暂时无法应用CSV，请重试；当前匹配方案没有改变。")
    } finally { if (generation.current === attempt) setStage("idle") }
  }
  const download = async () => {
    if (disabled || downloading || busy) return
    setDownloading(true)
    try { await downloadMatchingBoardCsv(sessionId, revisionToken, publicationSignature); onNotice("已下载当前已保存方案的CSV模板。请仅修改目标池、组号、多人分组栏和推荐时间，保留全部人员及系统列。") }
    catch (caught) {
      const message = caught instanceof Error ? caught.message : "下载调整模板失败，请稍后重试。"
      if (caught instanceof MatchingBoardCsvDownloadError && caught.stale) onStale(message)
      else onError?.(message)
    } finally { setDownloading(false) }
  }

  return <>
    <Button type="button" size="sm" variant="outline" disabled={disabled || downloading || busy} onClick={() => void download()} title="下载当前已保存方案；有未保存调整时请先保存或放弃">{downloading ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}下载调整模板CSV</Button>
    <Button type="button" size="sm" variant="outline" disabled={disabled || downloading || busy} onClick={() => { if (input.current) { input.current.value = ""; input.current.click() } }} title="先校验和预览，再应用草稿；不会自动保存或发布"><Upload className="size-3.5" />上传人工调整CSV</Button>
    <input ref={input} type="file" accept=".csv,text/csv" aria-label="选择人工调整CSV文件" className="hidden" disabled={disabled || downloading || busy} onChange={(event) => { const selected = event.target.files?.[0]; event.target.value = ""; if (selected) void selectFile(selected) }} />
    <Dialog open={opened} onOpenChange={(open) => { if (!open) close() }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="size-5 text-primary" />CSV人工调整预览</DialogTitle>
        <DialogDescription>上传仅用于校验。确认后应用到页面草稿，仍须手动「保存调整」；发布是另一步操作。</DialogDescription>
        <div className="min-w-0 space-y-4">
          <p className="break-all text-xs text-muted-foreground">文件：{file?.name}</p>
          <details className="rounded-lg border border-border bg-muted/15 p-3 text-xs leading-6 text-muted-foreground"><summary className="cursor-pointer font-medium text-foreground">填写说明</summary>
            <p className="mt-2">每人一行，保留全部人员、参考信息及系统列。目标池填写「双人」「多人」或「未匹配」，同组成员填写相同组号和推荐时间。</p>
            <p className="mt-1">双人组恰好2人，分组栏留空；多人组至少3人，分组栏填写「4–6人分组」或「按时间分组」，人工超出4–6人时会提示。</p>
            <p className="mt-1">双人或多人不填组号，分别表示等待搭档或待分组，分组栏和时间也留空；未匹配人员的组号、分组栏和时间均留空。</p>
            <p className="mt-1">日期推荐使用YYYY-MM-DD，兼容Excel明确的年/月/日格式；时段填写上午／下午／晚上。另存为「CSV UTF-8（逗号分隔）」。工作人员留言继续在后台单独编辑。</p>
          </details>
          {busy && <p role="status" className="flex items-center gap-2 rounded-lg bg-muted/30 p-3 text-sm"><LoaderCircle className="size-4 animate-spin" />{stage === "reading" ? "正在读取文件…" : stage === "checking" ? "正在核对人员、分组和共同时间…" : "正在重新核对当前版本，再应用到草稿…"}</p>}
          {(error || expired) && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-relaxed text-red-800">{error || "页面已有新调整，此CSV预览已过期，请处理当前调整后重新上传。"}</p>}
          {!!file?.result?.errors?.length && <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3" aria-label="CSV校验错误"><p className="text-sm font-medium text-red-800">有 {file.result.errors.length} 项错误，整份文件尚未应用</p><ul className="max-h-56 list-inside list-disc space-y-1 overflow-y-auto text-xs leading-6 text-red-800">{file.result.errors.slice(0, issueLimit).map((issue, index) => <li key={index}>{[issue.row ? `第${issue.row}行` : null, issue.group ? `小组 ${issue.group}` : null, issue.member].filter(Boolean).join(" · ")}{issue.row || issue.group || issue.member ? "：" : ""}{issue.message}</li>)}</ul>{issueLimit < file.result.errors.length && <Button type="button" size="sm" variant="ghost" onClick={() => setIssueLimit((value) => value + PAGE_SIZE)}>再显示25项错误</Button>}</div>}
          {!!file?.result?.warnings?.length && <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3" aria-label="CSV调整提示"><p className="text-sm font-medium text-amber-900">请核对</p><ul className="list-inside list-disc text-xs leading-6 text-amber-900">{file.result.warnings.slice(0, warningLimit).map((warning, index) => <li key={index}>{warning}</li>)}</ul>{warningLimit < file.result.warnings.length && <Button type="button" size="sm" variant="ghost" onClick={() => setWarningLimit((value) => value + PAGE_SIZE)}>再显示25项提示</Button>}</div>}
          {preview && <>
            <div className="space-y-2 rounded-xl border border-border bg-muted/15 p-3 text-xs leading-relaxed" aria-label="CSV方案人数比较"><p><span className="font-medium">当前已保存：</span>{countText(preview.summary.before)}</p><p><span className="font-medium text-primary">CSV调整后：</span>{countText(preview.summary.after)}</p><p className="text-muted-foreground">{preview.summary.changedMembers} 人安排变化 · 新增 {preview.summary.createdGroups} 组 · 解散 {preview.summary.removedGroups} 组 · {preview.summary.changedTimes} 组推荐时间变化</p></div>
            {preview.unchanged ? <p role="status" className="rounded-lg bg-primary/5 p-4 text-sm text-primary">CSV与当前已保存方案一致，无需更新。</p> : <div className="overflow-hidden rounded-lg border border-border">
              <div className="overflow-x-auto"><table className="w-full min-w-[540px] text-left text-xs"><caption className="sr-only">CSV中成员安排的调整前后比较</caption><thead className="bg-muted/40 text-muted-foreground"><tr><th className="px-3 py-2 font-medium">成员</th><th className="px-3 py-2 font-medium">当前安排</th><th className="px-3 py-2 font-medium">调整后</th></tr></thead><tbody className="divide-y divide-border">{preview.changes.slice(0, limit).map((change) => <tr key={change.memberId} className="align-top"><th scope="row" className="max-w-32 break-words px-3 py-3 font-medium">{change.name}</th><td className="max-w-72 break-words px-3 py-3 leading-6 text-muted-foreground">{change.before}</td><td className="max-w-72 break-words px-3 py-3 leading-6">{change.after}</td></tr>)}</tbody></table></div>
              <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground"><p>显示 {Math.min(limit, preview.changes.length)} / {preview.changes.length} 人</p>{limit < preview.changes.length && <Button type="button" variant="ghost" size="sm" onClick={() => setLimit((value) => value + PAGE_SIZE)}>再显示25人</Button>}</div>
            </div>}
          </>}
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={close}>取消</Button><Button type="button" disabled={!canApply} onClick={() => void applyFile()}>应用到编辑草稿</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
