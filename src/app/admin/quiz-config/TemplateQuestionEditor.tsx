"use client"

import { ArrowDown, ArrowUp, LockKeyhole, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { QUESTION_TYPES, type LocalizedText, type QuestionnaireOption, type QuestionnaireQuestion, type QuestionType } from "@/lib/questionnaires/types"
import { FIXED_CHOICE_FIELDS, INTERVIEW_CORE_FIELDS, YEAR_FIELDS } from "@/lib/questionnaires/defaults"
import type { QuestionnaireKind } from "@/lib/questionnaires/types"

const TYPES: Record<QuestionType, string> = { single: "单选", multi: "多选", text: "简答", textarea: "长文本", number: "数字", date: "日期", rating: "评分" }
export const templateInputClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30"

export function TemplateTextEditor({ label, value, locale, onChange, multiline = false }: {
  label: string; value: LocalizedText; locale: "zh" | "ja"; onChange: (value: LocalizedText) => void; multiline?: boolean
}) {
  function change(text: string) {
    const other = locale === "zh" ? "ja" : "zh"
    onChange({ ...value, [locale]: text, ...(value[other] === "" || value[other] === value[locale] ? { [other]: text } : {}) })
  }
  return <label className="block space-y-1.5 text-xs font-medium">
    <span>{label}</span>
    {multiline ? <textarea value={value[locale]} maxLength={2000} rows={2} onChange={(event) => change(event.target.value)} className={templateInputClass} />
      : <input value={value[locale]} maxLength={200} onChange={(event) => change(event.target.value)} className={templateInputClass} />}
  </label>
}

export function TemplateQuestionEditor({ question, kind, index, count, locale, savedOptionIds, onChange, onMove }: {
  question: QuestionnaireQuestion; index: number; count: number; locale: "zh" | "ja";
  kind: QuestionnaireKind;
  savedOptionIds: string[];
  onChange: (question: QuestionnaireQuestion) => void; onMove: (offset: number) => void
}) {
  const fixedType = Boolean(question.builtinField)
  const fixedChoices = FIXED_CHOICE_FIELDS.some((field) => field === question.builtinField)
  const yearChoices = YEAR_FIELDS.some((field) => field === question.builtinField)
  const protectedFlags = kind === "interview" && INTERVIEW_CORE_FIELDS.some((field) => field === question.builtinField)
  function changeType(type: QuestionType) {
    onChange({ ...question, type, options: type === "single" || type === "multi" ? [1, 2].map((number) => ({ id: `option_${crypto.randomUUID()}`, value: `choice_${number}`, label: { zh: "", ja: "" } })) : undefined, min: type === "rating" ? 1 : undefined, max: type === "rating" ? 5 : undefined, maxSelections: undefined, dimension: undefined })
  }
  function updateOption(id: string, patch: Partial<QuestionnaireOption>) {
    onChange({ ...question, options: question.options?.map((option) => option.id === id ? { ...option, ...patch } : option) })
  }
  function renameOption(option: QuestionnaireOption, label: LocalizedText) {
    // Legacy profile cards display mapped values directly. New mapped choices need
    // readable stable values; after their first save only the display text changes.
    const readableValue = fixedType && kind !== "quiz" && !yearChoices && !savedOptionIds.includes(option.id)
    updateOption(option.id, { label, ...(readableValue ? { value: label.zh.trim() } : {}) })
  }
  function addOption() {
    const id = `option_${crypto.randomUUID()}`
    let value = fixedType && kind !== "quiz" ? "" : id
    let label = { zh: "", ja: "" }
    if (yearChoices) {
      const nextYear = Math.min(2100, Math.max(1899, ...(question.options ?? []).map((option) => Number(option.value))) + 1)
      value = [String(nextYear), ...Array.from({ length: 201 }, (_, index) => String(1900 + index))].find((year) => !question.options?.some((option) => option.value === year)) ?? "2100"
      label = { zh: value, ja: value }
    }
    onChange({ ...question, options: [...(question.options ?? []), { id, value, label, ...(question.dimension ? { score: 0 } : {}) }] })
  }
  return <article className={`space-y-4 rounded-xl border bg-card p-4 sm:p-5 ${question.active ? "" : "opacity-70"}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span>问题 {index + 1}</span>
        {question.locked && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] font-normal"><LockKeyhole className="size-3" />字段类型已保护</span>}
        {!question.active && <span className="text-xs font-normal text-muted-foreground">已停用</span>}
      </div>
      <div className="flex items-center gap-1">
        <Button type="button" size="icon-sm" variant="ghost" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`问题 ${index + 1} 上移`}><ArrowUp /></Button>
        <Button type="button" size="icon-sm" variant="ghost" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`问题 ${index + 1} 下移`}><ArrowDown /></Button>
      </div>
    </div>
    {kind === "quiz" && !fixedType && question.type === "single" && <label className="flex items-center gap-2 text-sm">计分维度<select value={question.dimension ?? ""} onChange={(event) => onChange({ ...question, dimension: (event.target.value || undefined) as QuestionnaireQuestion["dimension"], options: question.options?.map((option) => ({ ...option, score: event.target.value ? option.score ?? 0 : undefined })) })} className="rounded-md border bg-background px-2 py-1.5"><option value="">仅收集答案，不计分</option>{(["E", "A", "O", "C", "N"] as const).map((dimension) => <option key={dimension} value={dimension}>{dimension}</option>)}</select></label>}
    <div className="flex flex-wrap items-center gap-4 text-sm">
      <label className="flex items-center gap-2">题型<select value={question.type} disabled={fixedType} onChange={(event) => changeType(event.target.value as QuestionType)} className="rounded-md border bg-background px-2 py-1.5">{QUESTION_TYPES.map((type) => <option key={type} value={type}>{TYPES[type]}</option>)}</select></label>
      <label className="flex items-center gap-2"><input type="checkbox" disabled={protectedFlags} checked={question.required} onChange={(event) => onChange({ ...question, required: event.target.checked })} />必填</label>
      <label className="flex items-center gap-2"><input type="checkbox" disabled={protectedFlags} checked={question.active} onChange={(event) => onChange({ ...question, active: event.target.checked })} />启用</label>
    </div>
    <TemplateTextEditor label="题目" value={question.label} locale={locale} onChange={(label) => onChange({ ...question, label })} />
    <TemplateTextEditor label="说明" value={question.description ?? { zh: "", ja: "" }} locale={locale} multiline onChange={(description) => onChange({ ...question, description })} />
    {(question.type === "single" || question.type === "multi") && <div className="space-y-3">
      <p className="text-xs font-medium">选项</p>
      {(question.options ?? []).map((option, optionIndex) => <div key={option.id} className="flex items-end gap-2">
        <div className="min-w-0 flex-1"><TemplateTextEditor label={`选项 ${optionIndex + 1}`} value={option.label} locale={locale} onChange={(label) => renameOption(option, label)} /></div>
        {yearChoices && !savedOptionIds.includes(option.id) && <label className="w-24 shrink-0 space-y-1.5 text-xs">年份<input type="number" min={1900} max={2100} value={option.value} onChange={(event) => updateOption(option.id, { value: event.target.value, label: { zh: option.label.zh === option.value ? event.target.value : option.label.zh, ja: option.label.ja === option.value ? event.target.value : option.label.ja } })} className={templateInputClass} /></label>}
        {question.dimension && <label className="w-20 shrink-0 space-y-1.5 text-xs">分值<input type="number" step="0.5" value={option.score ?? 0} onChange={(event) => updateOption(option.id, { score: Number(event.target.value) })} className={templateInputClass} /></label>}
        {!savedOptionIds.includes(option.id) && !fixedChoices && <Button type="button" variant="ghost" size="sm" disabled={(question.options?.length ?? 0) <= 2} onClick={() => onChange({ ...question, options: question.options?.filter((item) => item.id !== option.id) })}>移除</Button>}
      </div>)}
      {!fixedChoices && <Button type="button" variant="outline" size="sm" disabled={(question.options?.length ?? 0) >= 100} onClick={addOption}><Plus />添加选项</Button>}
      {fixedType && <p className="text-xs text-muted-foreground">现有选项保留原存储值，修改显示文字不会改写历史答案。</p>}
    </div>}
    {(question.type === "number" || question.type === "rating") && <div className="grid grid-cols-2 gap-3">
      {(["min", "max"] as const).map((key) => <label key={key} className="space-y-1.5 text-xs">{key === "min" ? "最小值" : "最大值"}<input type="number" disabled={fixedType} value={question[key] ?? ""} onChange={(event) => onChange({ ...question, [key]: event.target.value === "" ? undefined : Number(event.target.value) })} className={templateInputClass} /></label>)}
    </div>}
    {(question.type === "text" || question.type === "textarea") && !fixedType && <label className="block max-w-52 space-y-1.5 text-xs">字数上限<input type="number" min={1} max={10000} value={question.maxLength ?? (question.type === "text" ? 200 : 2000)} onChange={(event) => onChange({ ...question, maxLength: Number(event.target.value) })} className={templateInputClass} /></label>}
    {question.type === "multi" && !fixedType && <label className="block max-w-52 space-y-1.5 text-xs">最多选择项数<input type="number" min={1} max={20} value={question.maxSelections ?? question.options?.length ?? 20} onChange={(event) => onChange({ ...question, maxSelections: Number(event.target.value) })} className={templateInputClass} /></label>}
  </article>
}
