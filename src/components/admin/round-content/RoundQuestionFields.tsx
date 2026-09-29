"use client"

import type { RoundContentConfig } from "@/types"
import { Button } from "@/components/ui/button"
import { RoundQuestionEditor } from "./RoundQuestionEditor"

interface Props {
  config: RoundContentConfig
  locale: "zh" | "ja"
  locked: boolean
  onChange: (config: RoundContentConfig) => void
}

export function RoundQuestionFields({ config, locale, locked, onChange }: Props) {
  function move(index: number, offset: number) {
    const questions = [...config.questions]
    ;[questions[index], questions[index + offset]] = [questions[index + offset], questions[index]]
    onChange({ ...config, questions })
  }
  return <section className="space-y-4 rounded-xl border bg-card p-5">
    <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">补充问题</h2><span className="text-xs text-muted-foreground">{config.questions.length} / 20</span></div>
    <p className="text-xs text-muted-foreground">可以不添加问题。补充回答仅供工作人员查看，不参与自动匹配计算。已有回答后，仅能修正文案；请勿改变题意。</p>
    {config.questions.map((question, index) => <RoundQuestionEditor key={question.id} question={question} index={index} count={config.questions.length} locale={locale} locked={locked} onChange={(next) => onChange({ ...config, questions: config.questions.map((item) => item.id === question.id ? next : item) })} onMove={(offset) => move(index, offset)} onDelete={() => onChange({ ...config, questions: config.questions.filter((item) => item.id !== question.id) })} />)}
    <Button type="button" variant="outline" disabled={locked || config.questions.length >= 20} onClick={() => onChange({ ...config, questions: [...config.questions, { id: crypto.randomUUID(), type: "text", label: { zh: "", ja: "" }, required: false, options: [] }] })}>添加问题</Button>
  </section>
}
