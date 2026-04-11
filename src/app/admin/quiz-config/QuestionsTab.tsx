"use client"

import { useState } from "react"
import type { QuizQuestionConfig } from "@/types/quiz-config"
import { ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

const DIM_LABELS: Record<string, string> = {
  E: "社交能量", A: "社交温度", O: "探索倾向", C: "行动节奏", N: "情绪锚点",
}

const DIM_COLORS: Record<string, string> = {
  E: "bg-coral/10 text-coral", A: "bg-sakura/10 text-sakura",
  O: "bg-sky/10 text-sky", C: "bg-gold/10 text-gold", N: "bg-lavender/10 text-lavender",
}

interface Props {
  questions: QuizQuestionConfig[]
  onChange: (questions: QuizQuestionConfig[]) => void
}

export function QuestionsTab({ questions, onChange }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const updateQuestion = (id: number, patch: Partial<QuizQuestionConfig>) => {
    onChange(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)))
  }

  const updateOption = (qId: number, optIdx: number, field: "text" | "score", value: string | number) => {
    const q = questions.find((q) => q.id === qId)
    if (!q) return
    const options = q.options.map((o, i) =>
      i === optIdx ? { ...o, [field]: field === "score" ? Number(value) : value } : o,
    )
    updateQuestion(qId, { options })
  }

  return (
    <div className="space-y-2">
      {questions.map((q) => {
        const open = expandedId === q.id
        return (
          <div key={q.id} className="rounded-lg border border-border bg-card overflow-hidden">
            {/* 折叠头 */}
            <button
              onClick={() => setExpandedId(open ? null : q.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
            >
              {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", DIM_COLORS[q.dimension])}>
                {DIM_LABELS[q.dimension]}
              </span>
              <span className="text-sm font-medium">Q{q.id}</span>
              <span className="text-sm text-muted-foreground truncate">{q.text}</span>
            </button>

            {/* 展开编辑 */}
            {open && (
              <div className="border-t border-border px-4 py-4 space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground">题目文本</label>
                  <textarea
                    value={q.text}
                    onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                    rows={2}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">选项（文本 + 分值）</label>
                  {q.options.map((opt, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <span className="text-xs text-muted-foreground w-5">{String.fromCharCode(65 + i)}</span>
                      <input
                        value={opt.text}
                        onChange={(e) => updateOption(q.id, i, "text", e.target.value)}
                        className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                      />
                      <input
                        type="number"
                        step="0.5"
                        value={opt.score}
                        onChange={(e) => updateOption(q.id, i, "score", e.target.value)}
                        className="w-16 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-center"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
