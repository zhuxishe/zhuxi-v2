"use client"

import { MessageSquareText } from "lucide-react"

interface Props {
  value: string
  editable: boolean
  recipients: number
  waitingDuo: number
  onChange: (value: string) => void
  onBlur: () => void
}

export function MatchingBoardUnmatchedMessage({ value, editable, recipients, waitingDuo, onChange, onBlur }: Props) {
  const count = Array.from(value.trim()).length
  return <div className="mt-5 space-y-2 border-t border-border/70 pt-4">
    <label htmlFor="board-unmatched-message" className="flex items-center gap-2 text-sm font-medium"><MessageSquareText className="size-4 text-muted-foreground" />工作人员留言 <span className="text-xs font-normal text-muted-foreground">选填 · 玩家可见</span></label>
    <p id="board-unmatched-message-help" className="text-xs leading-relaxed text-muted-foreground">将随本次结果发布，展示给最终未匹配的玩家。留空则不显示留言区域；输入或保存不会发送通知。</p>
    <textarea id="board-unmatched-message" value={value} disabled={!editable} onChange={(event) => onChange(event.target.value)} onBlur={onBlur}
      aria-describedby="board-unmatched-message-help board-unmatched-message-count" aria-invalid={count > 300 || undefined}
      placeholder="例如：本轮暂未找到合适安排，工作人员会继续协调，有新的安排将通过站内通知联系你。"
      rows={4} className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed disabled:cursor-not-allowed disabled:opacity-70" />
    <div className="flex flex-wrap justify-between gap-1 text-[11px] leading-relaxed text-muted-foreground"><p>当前待核对：{recipients} 人{waitingDuo > 0 && `（含 ${waitingDuo} 人等待双人搭档）`}；发布前以下方接收名单为准。</p><p id="board-unmatched-message-count" className={count > 300 ? "text-red-700" : undefined}>{count} / 300 字</p></div>
    {count > 300 && <p role="alert" className="text-xs text-red-700">工作人员留言最多300字，请缩短后再保存。</p>}
  </div>
}
