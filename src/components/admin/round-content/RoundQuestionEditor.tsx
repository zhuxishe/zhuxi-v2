"use client"

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react"
import type { RoundQuestion } from "@/types"
import { Button } from "@/components/ui/button"
import { RoundTextField } from "./RoundTextField"

interface Props {
  question: RoundQuestion
  index: number
  count: number
  locale: "zh" | "ja"
  locked: boolean
  onChange: (question: RoundQuestion) => void
  onMove: (offset: number) => void
  onDelete: () => void
}

export function RoundQuestionEditor({ question, index, count, locale, locked, onChange, onMove, onDelete }: Props) {
  return <div className="space-y-3 rounded-lg border bg-background p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">问题 {index + 1}</h3>
      <div className="flex gap-1">
        <Button type="button" size="sm" variant="ghost" disabled={locked || index === 0} onClick={() => onMove(-1)} aria-label="问题上移"><ArrowUp className="size-4" /></Button>
        <Button type="button" size="sm" variant="ghost" disabled={locked || index === count - 1} onClick={() => onMove(1)} aria-label="问题下移"><ArrowDown className="size-4" /></Button>
        <Button type="button" size="sm" variant="ghost" disabled={locked} onClick={onDelete} aria-label="删除问题"><Trash2 className="size-4" /></Button>
      </div>
    </div>
    <div className="flex items-center gap-4 text-sm">
      <label>题型 <select disabled={locked} value={question.type} onChange={(event) => {
        const type = event.target.value as RoundQuestion["type"]
        onChange({ ...question, type, options: type === "text" ? [] : question.options.length ? question.options : [{ id: crypto.randomUUID(), label: { zh: "", ja: "" } }, { id: crypto.randomUUID(), label: { zh: "", ja: "" } }] })
      }} className="rounded-md border bg-background px-2 py-1"><option value="text">简答</option><option value="single">单选</option><option value="multi">多选</option></select></label>
      <label className="flex items-center gap-2"><input type="checkbox" disabled={locked} checked={question.required} onChange={(event) => onChange({ ...question, required: event.target.checked })} />必填</label>
    </div>
    <RoundTextField label="题目" value={question.label} locale={locale} maxLength={200} onChange={(label) => onChange({ ...question, label })} />
    {question.type !== "text" && <div className="space-y-3">
      {question.options.map((option, optionIndex) => <div key={option.id} className="flex items-end gap-2">
        <div className="min-w-0 flex-1"><RoundTextField label={`选项 ${optionIndex + 1}`} value={option.label} locale={locale} maxLength={120} onChange={(label) => onChange({ ...question, options: question.options.map((item) => item.id === option.id ? { ...item, label } : item) })} /></div>
        <Button type="button" size="sm" variant="ghost" disabled={locked || question.options.length <= 2} onClick={() => onChange({ ...question, options: question.options.filter((item) => item.id !== option.id) })} aria-label={`删除选项 ${optionIndex + 1}`}><Trash2 className="size-4" /></Button>
      </div>)}
      <Button type="button" size="sm" variant="outline" disabled={locked || question.options.length >= 20} onClick={() => onChange({ ...question, options: [...question.options, { id: crypto.randomUUID(), label: { zh: "", ja: "" } }] })}>添加选项</Button>
    </div>}
  </div>
}
